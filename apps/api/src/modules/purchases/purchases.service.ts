import { recordActivity } from '../../common/record-activity';
import { z } from 'zod';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal, purchaseSchema, receiveSchema } from '@chame/shared';
import { Database, type Tx } from '../../common/db';
import { Actor } from '../../common/security';
import { audit, idempotent, lock } from '../../common/operations';
import { moveStock } from '../inventory/stock';
import { cents } from '../sales/money';
export const purchaseIssueSchema = z
  .object({
    purchaseItemId: z.uuid(),
    action: z.enum(['WAIT', 'REFUND', 'CREDIT']),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();
export const resolvePurchaseIssueSchema = z
  .object({ reason: z.string().trim().min(5).max(1000) })
  .strict();
export const purchaseRefundSchema = z
  .object({
    method: z.enum(['CASH', 'PIX', 'DEBIT', 'CREDIT', 'BANK', 'OTHER']),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();
@Injectable()
export class PurchasesService {
  constructor(@Inject(Database) private db: Database) {}
  async detail(a: Actor, id: string) {
    const order = await this.db.purchaseOrder.findFirst({
      where: { id, companyId: a.companyId, storeId: a.storeId },
    });
    if (!order) throw new NotFoundException('Compra nao encontrada.');
    const items = await this.db.purchaseOrderItem.findMany({ where: { purchaseId: id } });
    const products = await this.db.product.findMany({
      where: { companyId: a.companyId, id: { in: items.map((i) => i.productId) } },
    });
    const [supplier, store] = await Promise.all([
      this.db.supplier.findFirst({
        where: { id: order.supplierId, companyId: a.companyId },
        select: { name: true },
      }),
      this.db.store.findFirst({
        where: { id: order.storeId, companyId: a.companyId },
        select: { name: true },
      }),
    ]);
    const issues = await this.db.purchaseIssue.findMany({
      where: { companyId: a.companyId, item: { purchaseId: id } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...order,
      activity: await recordActivity(this.db, a.companyId, 'PurchaseOrder', id, {
        entity: { in: ['PurchaseIssue', 'GoodsReceipt'] },
        details: { path: ['purchaseId'], equals: id },
      }),
      issues,
      refundedTotal: issues
        .filter((issue) => issue.refundEntryId)
        .reduce((sum, issue) => sum.plus(issue.amount), new Decimal(0))
        .toString(),
      supplierName: supplier?.name,
      storeName: store?.name,
      items: items.map((i) => ({
        ...i,
        name: products.find((p) => p.id === i.productId)?.name,
        sku: products.find((p) => p.id === i.productId)?.sku,
      })),
    };
  }
  recordIssue(a: Actor, id: string, body: unknown, key: unknown) {
    const d = purchaseIssueSchema.parse(body);
    return this.db.atomic((tx) =>
      idempotent(tx, a, 'purchase.issue', key, { id, ...d }, async () => {
        await lock(tx, 'purchase:' + id);
        const order = await tx.purchaseOrder.findFirst({
          where: { id, companyId: a.companyId, storeId: a.storeId },
        });
        if (!order) throw new NotFoundException('Compra nao encontrada.');
        const item = await tx.purchaseOrderItem.findFirst({
          where: { id: d.purchaseItemId, purchaseId: id, companyId: a.companyId },
        });
        if (!item) throw new BadRequestException('Item invalido.');
        const missing = item.quantity.minus(item.receivedQuantity).minus(item.cancelledQuantity);
        if (!missing.gt(0)) throw new BadRequestException('Este item nao tem quantidade pendente.');
        if (
          await tx.purchaseIssue.findFirst({ where: { purchaseItemId: item.id, status: 'OPEN' } })
        )
          throw new ConflictException(
            'Ja existe uma tratativa aberta para este item. Encerre a anterior para registrar outra.',
          );
        const issue = await tx.purchaseIssue.create({
          data: {
            companyId: a.companyId,
            userId: a.id,
            purchaseItemId: item.id,
            action: d.action,
            reason: d.reason,
            quantity: missing.toString(),
            amount: cents(missing.times(item.unitCost)).toString(),
          },
        });
        await audit(tx, a, 'purchase.issue', 'PurchaseIssue', issue.id, {
          purchaseId: id,
          ...d,
          quantity: missing.toString(),
          amount: issue.amount.toString(),
        });
        return issue;
      }),
    );
  }
  resolveIssue(a: Actor, id: string, issueId: string, body: unknown, key: unknown) {
    const d = resolvePurchaseIssueSchema.parse(body);
    return this.db.atomic((tx) =>
      idempotent(tx, a, 'purchase.issue.resolve', key, { id, issueId, ...d }, async () => {
        await lock(tx, 'purchase:' + id);
        const order = await tx.purchaseOrder.findFirst({
          where: { id, companyId: a.companyId, storeId: a.storeId },
        });
        if (!order) throw new NotFoundException('Compra nao encontrada.');
        const issue = await tx.purchaseIssue.findFirst({
          where: { id: issueId, companyId: a.companyId, item: { purchaseId: id } },
        });
        if (!issue) throw new NotFoundException('Tratativa nao encontrada.');
        if (issue.status !== 'OPEN') throw new ConflictException('Tratativa ja encerrada.');
        const result = await tx.purchaseIssue.update({
          where: { id: issue.id },
          data: { status: 'RESOLVED', resolution: d.reason, resolvedAt: new Date() },
        });
        await audit(tx, a, 'purchase.issue.resolve', 'PurchaseIssue', issue.id, {
          purchaseId: id,
          ...d,
        });
        return result;
      }),
    );
  }
  private financialPermission(a: Actor) {
    if (!a.permissions.includes('finance.manage'))
      throw new ForbiddenException(
        'Seu perfil precisa de permissao financeira para registrar pagamentos e reembolsos.',
      );
  }
  private async paidMovement(
    tx: Tx,
    a: Actor,
    amount: Decimal,
    method: string,
    description: string,
    referenceId: string,
    refund = false,
  ) {
    const financial = await tx.financialEntry.create({
      data: {
        companyId: a.companyId,
        storeId: a.storeId,
        userId: a.id,
        direction: refund ? 'IN' : 'OUT',
        description,
        amount: amount.toString(),
        settledAmount: amount.toString(),
        status: 'SETTLED',
        dueDate: new Date(),
        category: refund ? 'Reembolso de compras' : 'Compras',
        source: refund ? 'PURCHASE_REFUND' : 'PURCHASE_PAYMENT',
        referenceId,
      },
    });
    await tx.financialSettlement.create({
      data: {
        companyId: a.companyId,
        entryId: financial.id,
        userId: a.id,
        amount: amount.toString(),
        method,
      },
    });
    return tx.treasuryEntry.create({
      data: {
        companyId: a.companyId,
        userId: a.id,
        amount: amount.times(refund ? 1 : -1).toString(),
        method,
        description,
        kind: refund ? 'PURCHASE_REFUND' : 'PURCHASE_PAYMENT',
      },
    });
  }
  confirmRefund(a: Actor, id: string, issueId: string, body: unknown, key: unknown) {
    this.financialPermission(a);
    const d = purchaseRefundSchema.parse(body);
    return this.db.atomic((tx) =>
      idempotent(tx, a, 'purchase.refund', key, { id, issueId, ...d }, async () => {
        await lock(tx, 'purchase:' + id);
        const order = await tx.purchaseOrder.findFirst({
          where: { id, companyId: a.companyId, storeId: a.storeId },
        });
        if (!order) throw new NotFoundException('Compra nao encontrada.');
        if (order.paymentMode !== 'PREPAID' || !order.paymentEntryId)
          throw new ConflictException(
            'Compra do fluxo anterior: concilie o pagamento existente no Financeiro antes de registrar reembolso.',
          );
        const issue = await tx.purchaseIssue.findFirst({
          where: { id: issueId, companyId: a.companyId, item: { purchaseId: id } },
        });
        if (!issue) throw new NotFoundException('Tratativa nao encontrada.');
        if (issue.status !== 'OPEN' || issue.action !== 'REFUND' || issue.refundEntryId)
          throw new ConflictException('Solicitacao de reembolso indisponivel ou ja recebida.');
        const item = await tx.purchaseOrderItem.findUniqueOrThrow({
          where: { id: issue.purchaseItemId },
        });
        if (
          issue.quantity.gt(
            item.quantity.minus(item.receivedQuantity).minus(item.cancelledQuantity),
          )
        )
          throw new ConflictException('A falta foi alterada; confira a tratativa.');
        if (!issue.amount.gt(0))
          throw new BadRequestException('O reembolso precisa ter valor maior que zero.');
        const prior = await tx.purchaseIssue.aggregate({
          where: { companyId: a.companyId, item: { purchaseId: id }, refundEntryId: { not: null } },
          _sum: { amount: true },
        });
        if (new Decimal(prior._sum.amount?.toString() ?? 0).plus(issue.amount).gt(order.total))
          throw new ConflictException('Reembolsos nao podem superar o valor pago.');
        const entry = await this.paidMovement(
          tx,
          a,
          new Decimal(issue.amount.toString()),
          d.method,
          'Reembolso recebido da compra ' + order.code,
          issue.id,
          true,
        );
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { cancelledQuantity: { increment: issue.quantity } },
        });
        const result = await tx.purchaseIssue.update({
          where: { id: issue.id },
          data: {
            status: 'RESOLVED',
            resolution: d.reason,
            resolvedAt: new Date(),
            refundEntryId: entry.id,
            refundMethod: d.method,
          },
        });
        const items = await tx.purchaseOrderItem.findMany({ where: { purchaseId: id } });
        if (
          items.every((item) =>
            item.receivedQuantity.plus(item.cancelledQuantity).eq(item.quantity),
          )
        )
          await tx.purchaseOrder.update({
            where: { id },
            data: { status: 'CLOSED_WITH_SHORTAGE' },
          });
        await audit(tx, a, 'purchase.refund', 'PurchaseIssue', issue.id, {
          purchaseId: id,
          amount: issue.amount.toString(),
          method: d.method,
          reason: d.reason,
          treasuryEntryId: entry.id,
        });
        return result;
      }),
    );
  }
  create(a: Actor, body: unknown, key: unknown) {
    this.financialPermission(a);
    const d = purchaseSchema.parse(body);
    if (new Set(d.items.map((i) => i.productId)).size !== d.items.length)
      throw new BadRequestException('Produto duplicado.');
    return this.db.atomic((tx) =>
      idempotent(tx, a, 'purchase.create', key, d, async () => {
        if (
          !(await tx.supplier.findFirst({
            where: { id: d.supplierId, companyId: a.companyId, active: true },
          }))
        )
          throw new BadRequestException('Fornecedor invalido.');
        const products = await tx.product.findMany({
          where: {
            id: { in: d.items.map((i) => i.productId) },
            companyId: a.companyId,
            active: true,
          },
        });
        if (products.length !== d.items.length)
          throw new BadRequestException('Produtos invalidos.');
        for (const item of d.items)
          if (
            products.find((p) => p.id === item.productId)?.unit === 'UN' &&
            !new Decimal(item.quantity).isInteger()
          )
            throw new BadRequestException('Produto UN exige quantidade inteira.');
        const total = cents(
          d.items.reduce(
            (s, i) => s.plus(cents(new Decimal(i.quantity).times(i.unitCost))),
            new Decimal(0),
          ),
        );
        if (!total.gt(0)) throw new BadRequestException('O valor pago precisa ser maior que zero.');
        const order = await tx.purchaseOrder.create({
          data: {
            companyId: a.companyId,
            storeId: a.storeId,
            supplierId: d.supplierId,
            userId: a.id,
            total: total.toString(),
            dueDate: new Date(d.dueDate),
            notes: d.notes,
            paymentMode: 'PREPAID',
            paymentMethod: d.paymentMethod,
            paidAt: new Date(),
          },
        });
        await tx.purchaseOrderItem.createMany({
          data: d.items.map((i) => ({ ...i, companyId: a.companyId, purchaseId: order.id })),
        });
        const payment = await this.paidMovement(
          tx,
          a,
          total,
          d.paymentMethod,
          'Pagamento da compra ' + order.code,
          order.id,
        );
        const paidOrder = await tx.purchaseOrder.update({
          where: { id: order.id },
          data: { paymentEntryId: payment.id },
        });
        await audit(tx, a, 'purchase.create', 'PurchaseOrder', order.id, {
          paymentMethod: d.paymentMethod,
          treasuryEntryId: payment.id,
          total: total.toString(),
        });
        return paidOrder;
      }),
    );
  }
  receive(a: Actor, id: string, body: unknown, key: unknown) {
    const d = receiveSchema.parse(body);
    if (new Set(d.items.map((i) => i.purchaseItemId)).size !== d.items.length)
      throw new BadRequestException('Item duplicado.');
    return this.db.atomic((tx) =>
      idempotent(tx, a, 'purchase.receive', key, { id, ...d }, async () => {
        await lock(tx, 'purchase:' + id);
        const order = await tx.purchaseOrder.findFirst({
          where: { id, companyId: a.companyId, storeId: a.storeId },
        });
        if (!order) throw new NotFoundException('Compra nao encontrada.');
        if (['RECEIVED', 'CLOSED_WITH_SHORTAGE'].includes(order.status))
          throw new ConflictException('Compra ja recebida.');
        const blocked = await tx.purchaseIssue.findFirst({
          where: {
            companyId: a.companyId,
            status: 'OPEN',
            action: { in: ['REFUND', 'CREDIT'] },
            purchaseItemId: { in: d.items.map((item) => item.purchaseItemId) },
            item: { purchaseId: id },
          },
        });
        if (blocked)
          throw new ConflictException(
            'Encerre a tratativa de reembolso ou credito antes de receber este item.',
          );
        const originals = await tx.purchaseOrderItem.findMany({ where: { purchaseId: id } });
        let total = new Decimal(0);
        const received = d.items.map((i) => {
          const item = originals.find((o) => o.id === i.purchaseItemId);
          if (
            !item ||
            new Decimal(item.receivedQuantity.toString())
              .plus(item.cancelledQuantity.toString())
              .plus(i.quantity)
              .gt(item.quantity.toString())
          )
            throw new BadRequestException('Recebimento excede o pedido.');
          total = total.plus(cents(new Decimal(i.quantity).times(item.unitCost.toString())));
          return { ...i, original: item };
        });
        const receipt = await tx.goodsReceipt.create({
          data: { companyId: a.companyId, purchaseId: id, userId: a.id, total: total.toString() },
        });
        for (const part of received.sort((x, y) =>
          x.original.productId.localeCompare(y.original.productId),
        )) {
          await moveStock(
            tx,
            a,
            part.original.productId,
            new Decimal(part.quantity),
            'PURCHASE',
            'Recebimento de compra',
            receipt.id,
          );
          await tx.purchaseOrderItem.update({
            where: { id: part.purchaseItemId },
            data: { receivedQuantity: { increment: part.quantity } },
          });
          await tx.goodsReceiptItem.create({
            data: {
              companyId: a.companyId,
              receiptId: receipt.id,
              purchaseItemId: part.purchaseItemId,
              quantity: part.quantity,
            },
          });
        }
        const fresh = await tx.purchaseOrderItem.findMany({ where: { purchaseId: id } });
        for (const item of fresh.filter((item) => item.quantity.eq(item.receivedQuantity))) {
          await tx.purchaseIssue.updateMany({
            where: { purchaseItemId: item.id, status: 'OPEN', action: 'WAIT' },
            data: {
              status: 'RESOLVED',
              resolution: 'Entrega restante recebida integralmente.',
              resolvedAt: new Date(),
            },
          });
        }
        const complete = fresh.every((i) =>
          i.quantity.eq(i.receivedQuantity.plus(i.cancelledQuantity)),
        );
        await tx.purchaseOrder.update({
          where: { id },
          data: {
            status: complete
              ? fresh.some((i) => i.cancelledQuantity.gt(0))
                ? 'CLOSED_WITH_SHORTAGE'
                : 'RECEIVED'
              : 'PARTIALLY_RECEIVED',
          },
        });
        if (total.gt(0) && order.paymentMode === 'LEGACY')
          await tx.financialEntry.create({
            data: {
              companyId: a.companyId,
              storeId: a.storeId,
              userId: a.id,
              direction: 'OUT',
              description: `Recebimento da compra ${order.code}`,
              amount: total.toString(),
              dueDate: order.dueDate,
              category: 'Compras',
              source: 'PURCHASE',
              referenceId: receipt.id,
            },
          });
        await audit(tx, a, 'purchase.receive', 'GoodsReceipt', receipt.id, {
          purchaseId: id,
          total: total.toString(),
        });
        return receipt;
      }),
    );
  }
}
