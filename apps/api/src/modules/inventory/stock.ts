import { BadRequestException, ConflictException } from '@nestjs/common';
import { Decimal } from '@chame/shared';
import { Tx } from '../../common/db';
import { Actor } from '../../common/security';
import { lock } from '../../common/operations';
export async function moveStock(
  tx: Tx,
  actor: Actor,
  productId: string,
  quantity: Decimal,
  type: string,
  reason: string,
  referenceId?: string,
) {
  await lock(tx, `stock:${actor.storeId}:${productId}`);
  const product = await tx.product.findFirst({
    where: { id: productId, companyId: actor.companyId },
  });
  if (!product) throw new BadRequestException('Produto invalido.');
  if (product.unit === 'UN' && !quantity.isInteger())
    throw new BadRequestException('Produto UN exige quantidade inteira.');
  const balance = await tx.stockBalance.upsert({
    where: { storeId_productId: { storeId: actor.storeId, productId } },
    create: { companyId: actor.companyId, storeId: actor.storeId, productId },
    update: {},
  });
  if (quantity.isNegative()) {
    const updated = await tx.stockBalance.updateMany({
      where: {
        id: balance.id,
        quantity: { gte: quantity.abs().plus(balance.reserved).toString() },
      },
      data: { quantity: { increment: quantity.toString() } },
    });
    if (!updated.count) throw new ConflictException(`Estoque insuficiente: ${product.name}.`);
  } else
    await tx.stockBalance.update({
      where: { id: balance.id },
      data: { quantity: { increment: quantity.toString() } },
    });
  await tx.stockMovement.create({
    data: {
      companyId: actor.companyId,
      storeId: actor.storeId,
      productId,
      quantity: quantity.toString(),
      type,
      reason,
      referenceId,
      userId: actor.id,
    },
  });
  const next = new Decimal(balance.quantity.toString()).plus(quantity);
  if (next.lte(product.minStock.toString()))
    await tx.notification.create({
      data: {
        companyId: actor.companyId,
        userId: actor.id,
        title: 'Estoque critico',
        message: `${product.name}: saldo ${next.toString()}.`,
      },
    });
}
