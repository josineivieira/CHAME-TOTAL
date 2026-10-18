import { recordActivity } from '../../common/record-activity';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal, saleSchema, returnSchema } from '@chame/shared';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Database } from '../../common/db';
import { Actor } from '../../common/security';
import { audit, idempotent, lock } from '../../common/operations';
import { moveStock } from '../inventory/stock';
import { cashMovement, openCash } from '../cash/cash.service';
import { financialEffect } from '../finance/financial-effects';
import { cents, calculate, proportionalRefund } from './money';
export const salesScope = (a: Actor) => ({
  companyId: a.companyId,
  storeId: a.storeId,
  ...(a.permissions.includes('sales.assign')
    ? {}
    : a.employeeId
      ? { employeeId: a.employeeId }
      : { userId: a.id }),
});
const quoteSchema = saleSchema.omit({ payments: true });
@Injectable()
export class SalesService {
  constructor(@Inject(Database) private db: Database) {}
  async list(actor: Actor, input: unknown) {
    const p = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        status: z.enum(['CONFIRMED', 'CANCELLED']).optional(),
        q: z.string().default(''),
      })
      .parse(input);
    const code = Number(p.q);
    const where = {
      ...salesScope(actor),
      ...(p.status ? { status: p.status } : {}),
      ...(p.q && Number.isInteger(code) ? { code } : {}),
    };
    const [data, total] = await Promise.all([
      this.db.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      }),
      this.db.sale.count({ where }),
    ]);
    const employees = await this.db.employee.findMany({
      where: { companyId: actor.companyId, id: { in: data.map((s) => s.employeeId) } },
    });
    return {
      data: data.map((s) => ({
        ...s,
        employeeName: employees.find((e) => e.id === s.employeeId)?.name ?? '',
        netTotal: new Decimal(s.total.toString()).minus(s.returnedTotal.toString()).toString(),
      })),
      pagination: { page: p.page, pageSize: p.pageSize, total },
    };
  }
  async detail(actor: Actor, id: string) {
    const sale = await this.db.sale.findFirst({ where: { id, ...salesScope(actor) } });
    if (!sale) throw new NotFoundException('Venda nao encontrada.');
    const [items, payments, returns, employee, customer, company, store] = await Promise.all([
      this.db.saleItem.findMany({
        where: { saleId: id, companyId: actor.companyId },
        orderBy: { id: 'asc' },
      }),
      this.db.salePayment.findMany({ where: { saleId: id, companyId: actor.companyId } }),
      this.db.saleReturn.findMany({ where: { saleId: id, companyId: actor.companyId } }),
      this.db.employee.findUnique({ where: { id: sale.employeeId } }),
      sale.customerId ? this.db.customer.findUnique({ where: { id: sale.customerId } }) : null,
      this.db.setting.findUnique({
        where: { companyId: actor.companyId },
        select: {
          companyName: true,
          legalName: true,
          document: true,
          phone: true,
          email: true,
          address: true,
          timezone: true,
        },
      }),
      this.db.store.findFirst({
        where: { id: sale.storeId, companyId: actor.companyId },
        select: { name: true },
      }),
    ]);
    return {
      ...sale,
      activity: await recordActivity(this.db, actor.companyId, 'Sale', id, {
        entity: 'SaleReturn',
        details: { path: ['saleId'], equals: id },
      }),
      items,
      payments,
      returns,
      employeeName: employee?.name,
      customerName: customer?.name,
      companyName: company?.companyName,
      merchant: company,
      storeName: store?.name,
      timezone: company?.timezone,
    };
  }
  async create(actor: Actor, body: unknown, key: unknown, quotationId?: string) {
    const d = saleSchema.parse(body);
    if (new Set(d.items.map((i) => i.productId)).size !== d.items.length)
      throw new BadRequestException('Agrupe as quantidades do mesmo produto.');
    return this.db.atomic((tx) =>
      idempotent(tx, actor, 'sale.confirm', key, { ...d, quotationId }, async () => {
        const cash = await openCash(tx, actor);
        if (quotationId) {
          await lock(tx, 'quote:' + quotationId);
          const quote = await tx.quotation.findFirst({
            where: { id: quotationId, ...salesScope(actor) },
          });
          if (!quote || quote.status !== 'PENDING')
            throw new ConflictException('Orcamento ja convertido ou indisponivel.');
        }
        const employee = await tx.employee.findFirst({
          where: { id: d.employeeId, companyId: actor.companyId, active: true },
        });
        if (!employee) throw new BadRequestException('Vendedora invalida.');
        if (!actor.permissions.includes('sales.assign') && actor.employeeId !== employee.id)
          throw new ForbiddenException('Voce so pode registrar vendas para sua propria vendedora.');
        if (
          d.customerId &&
          !(await tx.customer.findFirst({
            where: { id: d.customerId, companyId: actor.companyId, active: true },
          }))
        )
          throw new BadRequestException('Cliente invalido.');
        const products = await tx.product.findMany({
          where: {
            id: { in: d.items.map((i) => i.productId) },
            companyId: actor.companyId,
            active: true,
          },
        });
        if (products.length !== d.items.length)
          throw new BadRequestException('Produto inexistente ou inativo.');
        const priced = d.items.map((i) => {
          const p = products.find((p) => p.id === i.productId)!;
          if (p.unit === 'UN' && !new Decimal(i.quantity).isInteger())
            throw new BadRequestException('Produtos UN exigem quantidade inteira.');
          return { ...i, price: p.price.toString(), cost: p.cost.toString() };
        });
        const totals = calculate(priced, d.discount);
        const settings = await tx.setting.findUniqueOrThrow({
          where: { companyId: actor.companyId },
        });
        if (totals.discount.gt(0) && !actor.permissions.includes('sales.discount'))
          throw new ForbiddenException('Sem permissao de desconto.');
        if (
          !totals.subtotal.isZero() &&
          totals.discount.div(totals.subtotal).times(100).gt(settings.maxDiscountPercent)
        )
          throw new ForbiddenException(
            `Desconto excede o limite de ${settings.maxDiscountPercent}%.`,
          );
        if (!totals.total.gt(0)) throw new BadRequestException('Total da venda deve ser positivo.');
        const paid = d.payments.reduce((a, p) => a.plus(p.amount), new Decimal(0));
        if (!paid.eq(totals.total) || d.payments.some((p) => new Decimal(p.amount).lte(0)))
          throw new BadRequestException(
            'Pagamentos devem somar exatamente o total. Troco deve ser descontado do dinheiro registrado.',
          );
        const sale = await tx.sale.create({
          data: {
            companyId: actor.companyId,
            storeId: actor.storeId,
            employeeId: employee.id,
            userId: actor.id,
            customerId: d.customerId,
            cashSessionId: cash.id,
            subtotal: totals.subtotal.toString(),
            discount: totals.discount.toString(),
            total: totals.total.toString(),
            costTotal: totals.costTotal.toString(),
            commissionPercent: employee.commissionPercent.toString(),
            notes: d.notes,
          },
        });
        for (const item of [...d.items].sort((a, b) => a.productId.localeCompare(b.productId)))
          await moveStock(
            tx,
            actor,
            item.productId,
            new Decimal(item.quantity).negated(),
            'SALE',
            'Venda confirmada',
            sale.id,
          );
        for (let index = 0; index < d.items.length; index++) {
          const item = d.items[index],
            p = products.find((p) => p.id === item.productId)!;
          await tx.saleItem.create({
            data: {
              companyId: actor.companyId,
              saleId: sale.id,
              productId: p.id,
              name: p.name,
              sku: p.sku,
              quantity: item.quantity,
              unitPrice: p.price,
              unitCost: p.cost,
              discount: totals.items[index].discount.toString(),
              total: totals.items[index].total.toString(),
            },
          });
        }
        for (const payment of d.payments) {
          await tx.salePayment.create({
            data: { companyId: actor.companyId, saleId: sale.id, ...payment },
          });
          await cashMovement(
            tx,
            actor,
            cash.id,
            'SALE',
            payment.method,
            new Decimal(payment.amount),
            'Recebimento de venda',
            sale.id,
          );
          await financialEffect(
            tx,
            actor,
            'IN',
            new Decimal(payment.amount),
            `Venda ${sale.code}`,
            sale.id,
            payment.method,
            'SALE',
          );
        }
        const commission = cents(
          totals.total.times(employee.commissionPercent.toString()).div(100),
        );
        if (commission.gt(0))
          await tx.commissionEntry.create({
            data: {
              companyId: actor.companyId,
              storeId: actor.storeId,
              employeeId: employee.id,
              saleId: sale.id,
              sourceId: sale.id,
              amount: commission.toString(),
            },
          });
        if (d.customerId && settings.loyaltyPointsPerReal > 0)
          await tx.loyaltyTransaction.create({
            data: {
              companyId: actor.companyId,
              customerId: d.customerId,
              saleId: sale.id,
              userId: actor.id,
              points: totals.total.times(settings.loyaltyPointsPerReal).floor().toNumber(),
              reason: 'Venda confirmada',
            },
          });
        if (quotationId)
          await tx.quotation.update({
            where: { id: quotationId },
            data: { status: 'CONVERTED', saleId: sale.id },
          });
        await audit(tx, actor, 'sales.confirm', 'Sale', sale.id, {
          total: totals.total.toString(),
          discount: totals.discount.toString(),
        });
        return sale;
      }),
    );
  }
  async cancel(actor: Actor, id: string, reason: string, key: unknown) {
    return this.db.atomic((tx) =>
      idempotent(tx, actor, 'sale.cancel', key, { id, reason }, async () => {
        const cash = await openCash(tx, actor);
        await lock(tx, 'sale:' + id);
        const sale = await tx.sale.findFirst({ where: { id, ...salesScope(actor) } });
        if (!sale) throw new NotFoundException('Venda nao encontrada.');
        if (sale.status !== 'CONFIRMED' || new Decimal(sale.returnedTotal.toString()).gt(0))
          throw new ConflictException(
            'Venda cancelada ou com devolucoes. Para devolucao, use o documento correspondente.',
          );
        const items = await tx.saleItem.findMany({
          where: { saleId: id },
          orderBy: { productId: 'asc' },
        });
        for (const i of items)
          await moveStock(
            tx,
            actor,
            i.productId,
            new Decimal(i.quantity.toString()),
            'CANCELLATION',
            reason,
            id,
          );
        const payments = await tx.salePayment.findMany({ where: { saleId: id } });
        for (const p of payments) {
          await cashMovement(
            tx,
            actor,
            cash.id,
            'REFUND',
            p.method,
            new Decimal(p.amount.toString()).negated(),
            reason,
            id,
          );
          await financialEffect(
            tx,
            actor,
            'OUT',
            new Decimal(p.amount.toString()),
            `Cancelamento da venda ${sale.code}`,
            id,
            p.method,
            'CANCELLATION',
          );
        }
        const commissions = await tx.commissionEntry.aggregate({
          where: { saleId: id },
          _sum: { amount: true },
        });
        if (commissions._sum.amount && !commissions._sum.amount.isZero())
          await tx.commissionEntry.create({
            data: {
              companyId: actor.companyId,
              storeId: actor.storeId,
              employeeId: sale.employeeId,
              saleId: id,
              sourceId: randomUUID(),
              amount: new Decimal(commissions._sum.amount.toString()).negated().toString(),
            },
          });
        if (sale.customerId) {
          const points = await tx.loyaltyTransaction.aggregate({
            where: { saleId: id },
            _sum: { points: true },
          });
          if (points._sum.points)
            await tx.loyaltyTransaction.create({
              data: {
                companyId: actor.companyId,
                customerId: sale.customerId,
                saleId: id,
                userId: actor.id,
                points: -points._sum.points,
                reason: 'Cancelamento',
              },
            });
        }
        const result = await tx.sale.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
        });
        await audit(tx, actor, 'sales.cancel', 'Sale', id, { reason });
        return result;
      }),
    );
  }
  async returnItems(actor: Actor, id: string, body: unknown, key: unknown) {
    const d = returnSchema.parse(body);
    if (new Set(d.items.map((i) => i.saleItemId)).size !== d.items.length)
      throw new BadRequestException('Item de devolucao duplicado.');
    return this.db.atomic((tx) =>
      idempotent(tx, actor, 'sale.return', key, { id, ...d }, async () => {
        const cash = await openCash(tx, actor);
        await lock(tx, 'sale:' + id);
        const sale = await tx.sale.findFirst({ where: { id, ...salesScope(actor) } });
        if (!sale || sale.status !== 'CONFIRMED')
          throw new ConflictException('Venda indisponivel para devolucao.');
        const original = await tx.saleItem.findMany({
          where: { saleId: id, companyId: actor.companyId },
          orderBy: { productId: 'asc' },
        });
        const units = await tx.product.findMany({
          where: { companyId: actor.companyId, id: { in: original.map((i) => i.productId) } },
          select: { id: true, unit: true },
        });
        let total = new Decimal(0);
        const parts = d.items.map((i) => {
          const item = original.find((o) => o.id === i.saleItemId);
          if (!item) throw new BadRequestException('Item nao pertence a venda.');
          if (
            units.find((p) => p.id === item.productId)?.unit === 'UN' &&
            !new Decimal(i.quantity).isInteger()
          )
            throw new BadRequestException('Produto UN exige devolucao inteira.');
          const amount = proportionalRefund(
            item.total.toString(),
            item.quantity.toString(),
            item.returnedQuantity.toString(),
            i.quantity,
          );
          total = total.plus(amount);
          return { ...i, original: item, amount };
        });
        const returned = await tx.saleReturn.create({
          data: {
            companyId: actor.companyId,
            saleId: id,
            userId: actor.id,
            reason: d.reason,
            total: total.toString(),
            refundMethod: d.refundMethod,
          },
        });
        for (const part of parts.sort((a, b) =>
          a.original.productId.localeCompare(b.original.productId),
        )) {
          await tx.saleReturnItem.create({
            data: {
              companyId: actor.companyId,
              returnId: returned.id,
              saleItemId: part.saleItemId,
              quantity: part.quantity,
              total: part.amount.toString(),
              restock: part.restock,
            },
          });
          await tx.saleItem.update({
            where: { id: part.saleItemId },
            data: { returnedQuantity: { increment: part.quantity } },
          });
          if (part.restock)
            await moveStock(
              tx,
              actor,
              part.original.productId,
              new Decimal(part.quantity),
              'RETURN',
              d.reason,
              returned.id,
            );
        }
        const updatedTotal = new Decimal(sale.returnedTotal.toString()).plus(total);
        await tx.sale.update({ where: { id }, data: { returnedTotal: updatedTotal.toString() } });
        await cashMovement(
          tx,
          actor,
          cash.id,
          'REFUND',
          d.refundMethod,
          total.negated(),
          d.reason,
          returned.id,
        );
        await financialEffect(
          tx,
          actor,
          'OUT',
          total,
          `Devolucao da venda ${sale.code}`,
          returned.id,
          d.refundMethod,
          'RETURN',
        );
        const originalCommission = await tx.commissionEntry.findUnique({
          where: { sourceId: sale.id },
        });
        if (originalCommission) {
          const amount = proportionalRefund(
            originalCommission.amount.toString(),
            sale.total.toString(),
            sale.returnedTotal.toString(),
            total.toString(),
          );
          if (!amount.isZero())
            await tx.commissionEntry.create({
              data: {
                companyId: actor.companyId,
                storeId: actor.storeId,
                employeeId: sale.employeeId,
                saleId: id,
                sourceId: returned.id,
                amount: amount.negated().toString(),
              },
            });
        }
        if (sale.customerId) {
          const points = await tx.loyaltyTransaction.findFirst({
            where: { saleId: id, points: { gt: 0 } },
          });
          if (points) {
            const originalPoints = new Decimal(points.points),
              after = originalPoints.times(updatedTotal).div(sale.total.toString()).floor(),
              before = originalPoints
                .times(sale.returnedTotal.toString())
                .div(sale.total.toString())
                .floor();
            const reverse = after.minus(before).toNumber();
            if (reverse)
              await tx.loyaltyTransaction.create({
                data: {
                  companyId: actor.companyId,
                  customerId: sale.customerId,
                  saleId: id,
                  userId: actor.id,
                  points: -reverse,
                  reason: 'Devolucao',
                },
              });
          }
        }
        await audit(tx, actor, 'sales.return', 'SaleReturn', returned.id, {
          saleId: id,
          total: total.toString(),
          reason: d.reason,
        });
        return returned;
      }),
    );
  }
  async quotations(actor: Actor) {
    return this.db.quotation.findMany({
      where: salesScope(actor),
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async quote(actor: Actor, body: unknown, key: unknown) {
    const d = quoteSchema.parse(body);
    if (!actor.permissions.includes('sales.assign') && actor.employeeId !== d.employeeId)
      throw new ForbiddenException('Vendedora fora do escopo.');
    return this.db.atomic((tx) =>
      idempotent(tx, actor, 'quotation.create', key, d, async () => {
        if (
          !(await tx.employee.findFirst({
            where: { companyId: actor.companyId, id: d.employeeId, active: true },
          }))
        )
          throw new BadRequestException('Vendedora invalida.');
        if (
          d.customerId &&
          !(await tx.customer.findFirst({
            where: { companyId: actor.companyId, id: d.customerId, active: true },
          }))
        )
          throw new BadRequestException('Cliente invalido.');
        const quote = await tx.quotation.create({
          data: {
            companyId: actor.companyId,
            storeId: actor.storeId,
            userId: actor.id,
            employeeId: d.employeeId,
            customerId: d.customerId,
            payload: d,
          },
        });
        await audit(tx, actor, 'quotation.create', 'Quotation', quote.id);
        return quote;
      }),
    );
  }
}
