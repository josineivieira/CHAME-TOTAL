import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { Decimal } from '@chame/shared';
import { Database } from '../../common/db';
import { Actor } from '../../common/security';
import { Prisma } from '../../generated/prisma/client';
import { salesScope } from '../sales/sales.service';
export const reportQuery = z.object({
  type: z
    .enum(['sales', 'inventory', 'finance', 'commissions', 'purchases', 'customers', 'returns'])
    .default('sales'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  employeeId: z.uuid().optional(),
  format: z.enum(['json', 'xlsx', 'pdf']).default('json'),
});
@Injectable()
export class ReportsService {
  constructor(@Inject(Database) private db: Database) {}
  async period(actor: Actor, input: unknown) {
    const p = reportQuery.parse(input),
      settings = await this.db.setting.findUniqueOrThrow({ where: { companyId: actor.companyId } });
    const now = DateTime.now().setZone(settings.timezone);
    const from = p.from ?? now.startOf('month').toISODate()!,
      to = p.to ?? now.toISODate()!;
    const start = DateTime.fromISO(from, { zone: settings.timezone }),
      end = DateTime.fromISO(to, { zone: settings.timezone }).plus({ days: 1 });
    if (!start.isValid || !end.isValid || end <= start || end.diff(start, 'days').days > 732)
      throw new BadRequestException('Periodo invalido; limite de 2 anos.');
    return {
      ...p,
      from,
      to,
      start: start.toJSDate(),
      end: end.toJSDate(),
      timezone: settings.timezone,
    };
  }
  async dashboard(actor: Actor, input: unknown) {
    const p = await this.period(actor, input);
    const scope = salesScope(actor);
    if (
      p.employeeId &&
      !actor.permissions.includes('sales.assign') &&
      actor.employeeId !== p.employeeId
    )
      throw new ForbiddenException();
    const where = {
      ...scope,
      ...(p.employeeId ? { employeeId: p.employeeId } : {}),
      status: 'CONFIRMED',
      createdAt: { gte: p.start, lt: p.end },
    };
    const sums = await this.db.sale.aggregate({
      where,
      _sum: { total: true, returnedTotal: true },
      _count: { id: true },
    });
    const net = new Decimal(sums._sum.total?.toString() ?? 0).minus(
      sums._sum.returnedTotal?.toString() ?? 0,
    );
    const owned = actor.permissions.includes('sales.assign')
      ? Prisma.empty
      : actor.employeeId
        ? Prisma.sql`AND s."employeeId"=${actor.employeeId}::uuid`
        : Prisma.sql`AND s."userId"=${actor.id}::uuid`;
    const filtered = p.employeeId
      ? Prisma.sql`AND s."employeeId"=${p.employeeId}::uuid`
      : Prisma.empty;
    const predicate = Prisma.sql`s."companyId"=${actor.companyId}::uuid AND s."storeId"=${actor.storeId}::uuid AND s.status='CONFIRMED' AND s."createdAt">=${p.start} AND s."createdAt"<${p.end} ${owned} ${filtered}`;
    const costs = await this.db.$queryRaw<{ cost: string }[]>(
      Prisma.sql`SELECT COALESCE(SUM((i.quantity-COALESCE((SELECT SUM(ri.quantity) FROM "SaleReturnItem" ri WHERE ri."saleItemId"=i.id AND ri.restock),0))*i."unitCost"),0)::text AS cost FROM "SaleItem" i JOIN "Sale" s ON s.id=i."saleId" WHERE ${predicate}`,
    );
    const daily = await this.db.$queryRaw<{ date: string; total: string }[]>(
      Prisma.sql`SELECT to_char(s."createdAt" AT TIME ZONE ${p.timezone},'YYYY-MM-DD') AS date, SUM(s.total-s."returnedTotal")::text AS total FROM "Sale" s WHERE ${predicate} GROUP BY 1 ORDER BY 1`,
    );
    const topProducts = await this.db.$queryRaw<{ name: string; sku: string; quantity: string }[]>(
      Prisma.sql`SELECT i.name,i.sku,SUM(i.quantity-i."returnedQuantity")::text AS quantity FROM "SaleItem" i JOIN "Sale" s ON s.id=i."saleId" WHERE ${predicate} GROUP BY i.name,i.sku ORDER BY SUM(i.quantity-i."returnedQuantity") DESC LIMIT 10`,
    );
    const ranking = await this.db.sale.groupBy({
      by: ['employeeId'],
      where,
      _sum: { total: true, returnedTotal: true },
      _count: { id: true },
    });
    const employees = await this.db.employee.findMany({
      where: { companyId: actor.companyId, id: { in: ranking.map((r) => r.employeeId) } },
    });
    const lowStock = await this.db.$queryRaw<
      { id: string; name: string; sku: string; quantity: string; minStock: string }[]
    >`SELECT p.id,p.name,p.sku,COALESCE(b.quantity,0)::text AS quantity,p."minStock"::text AS "minStock" FROM "Product" p LEFT JOIN "StockBalance" b ON b."productId"=p.id AND b."storeId"=${actor.storeId}::uuid WHERE p."companyId"=${actor.companyId}::uuid AND p.active AND COALESCE(b.quantity,0)<=p."minStock" ORDER BY COALESCE(b.quantity,0) ASC,p.name LIMIT 10`;
    const expenses = actor.permissions.includes('finance.read')
      ? await this.db.financialEntry.aggregate({
          where: {
            companyId: actor.companyId,
            storeId: actor.storeId,
            direction: 'OUT',
            source: { in: ['MANUAL', 'COMMISSION'] },
            dueDate: { gte: new Date(p.from), lte: new Date(p.to) },
          },
          _sum: { amount: true },
        })
      : null;
    const overdue = actor.permissions.includes('finance.read')
      ? await this.db.financialEntry.count({
          where: {
            companyId: actor.companyId,
            storeId: actor.storeId,
            status: { in: ['OPEN', 'PARTIAL'] },
            dueDate: { lt: new Date(DateTime.now().setZone(p.timezone).toISODate()!) },
          },
        })
      : null;
    const gross = net.minus(costs[0].cost);
    const count = sums._count.id;
    return {
      from: p.from,
      to: p.to,
      timezone: p.timezone,
      revenue: net.toFixed(2),
      saleCount: count,
      averageTicket: count ? net.div(count).toFixed(2) : '0.00',
      grossProfit: gross.toFixed(2),
      expenses: expenses ? (expenses._sum.amount?.toString() ?? '0') : null,
      operatingResult: expenses
        ? gross.minus(expenses._sum.amount?.toString() ?? 0).toFixed(2)
        : null,
      overdue,
      daily,
      topProducts,
      lowStock,
      ranking: ranking
        .map((r) => ({
          id: r.employeeId,
          name: employees.find((e) => e.id === r.employeeId)?.name,
          saleCount: r._count.id,
          total: new Decimal(r._sum.total?.toString() ?? 0)
            .minus(r._sum.returnedTotal?.toString() ?? 0)
            .toFixed(2),
        }))
        .sort((a, b) => new Decimal(b.total).comparedTo(a.total)),
      definition:
        'Vendas confirmadas no periodo, liquidas das devolucoes vinculadas. Despesas por vencimento; compras nao sao somadas ao custo vendido.',
    };
  }
  async rows(actor: Actor, input: unknown) {
    const p = await this.period(actor, input);
    const needed = {
      sales: 'sales.read',
      inventory: 'inventory.read',
      finance: 'finance.read',
      commissions: 'commissions.read',
      purchases: 'purchases.read',
      customers: 'customers.read',
      returns: 'sales.read',
    }[p.type];
    if (!actor.permissions.includes(needed))
      throw new ForbiddenException('Sem permissao de leitura para este relatorio.');
    const scope = { companyId: actor.companyId, storeId: actor.storeId },
      createdAt = { gte: p.start, lt: p.end };
    let rows: Record<string, unknown>[] = [];
    switch (p.type) {
      case 'sales': {
        const sales = await this.db.sale.findMany({
          where: {
            ...salesScope(actor),
            createdAt,
            ...(p.employeeId ? { employeeId: p.employeeId } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: 10001,
        });
        rows = sales.map((s) => ({
          Codigo: s.code,
          Data: s.createdAt.toISOString(),
          Situacao: s.status,
          Subtotal: s.subtotal.toString(),
          Desconto: s.discount.toString(),
          Total: s.total.toString(),
          Devolucoes: s.returnedTotal.toString(),
          Liquido:
            s.status === 'CANCELLED'
              ? '0.00'
              : new Decimal(s.total.toString()).minus(s.returnedTotal.toString()).toFixed(2),
        }));
        break;
      }
      case 'inventory': {
        const products = await this.db.product.findMany({
            where: { companyId: actor.companyId },
            orderBy: { name: 'asc' },
            take: 10001,
          }),
          balances = await this.db.stockBalance.findMany({ where: scope });
        rows = products.map((p) => ({
          SKU: p.sku,
          Produto: p.name,
          Saldo: balances.find((b) => b.productId === p.id)?.quantity.toString() ?? '0',
          Minimo: p.minStock.toString(),
          Custo: p.cost.toString(),
          Preco: p.price.toString(),
        }));
        break;
      }
      case 'finance':
        rows = (
          await this.db.financialEntry.findMany({
            where: { ...scope, dueDate: { gte: new Date(p.from), lte: new Date(p.to) } },
            take: 10001,
            orderBy: { dueDate: 'asc' },
          })
        ).map((e) => ({
          Descricao: e.description,
          Direcao: e.direction,
          Valor: e.amount.toString(),
          Baixado: e.settledAmount.toString(),
          Vencimento: e.dueDate.toISOString().slice(0, 10),
          Situacao: e.status,
          Categoria: e.category,
        }));
        break;
      case 'commissions':
        rows = (
          await this.db.commissionEntry.findMany({
            where: {
              ...scope,
              createdAt,
              ...(actor.permissions.includes('commissions.manage')
                ? {}
                : { employeeId: actor.employeeId ?? '00000000-0000-0000-0000-000000000000' }),
            },
            take: 10001,
          })
        ).map((e) => ({
          Vendedora: e.employeeId,
          Venda: e.saleId,
          Valor: e.amount.toString(),
          Situacao: e.status,
        }));
        break;
      case 'purchases':
        rows = (
          await this.db.purchaseOrder.findMany({ where: { ...scope, createdAt }, take: 10001 })
        ).map((e) => ({
          Codigo: e.code,
          Total: e.total.toString(),
          Situacao: e.status,
          Vencimento: e.dueDate.toISOString().slice(0, 10),
        }));
        break;
      case 'customers':
        rows = (
          await this.db.customer.findMany({
            where: { companyId: actor.companyId },
            take: 10001,
            orderBy: { name: 'asc' },
          })
        ).map((e) => ({
          Codigo: e.code,
          Nome: e.name,
          Ativo: e.active ? 'Sim' : 'Nao',
          Cadastro: e.createdAt.toISOString(),
        }));
        break;
      case 'returns': {
        const sales = await this.db.sale.findMany({
          where: salesScope(actor),
          select: { id: true },
        });
        rows = (
          await this.db.saleReturn.findMany({
            where: {
              companyId: actor.companyId,
              saleId: { in: sales.map((s) => s.id) },
              createdAt,
            },
            take: 10001,
          })
        ).map((e) => ({
          Venda: e.saleId,
          Total: e.total.toString(),
          Data: e.createdAt.toISOString(),
          Motivo: e.reason,
        }));
        break;
      }
    }
    if (rows.length > 10000)
      throw new BadRequestException('Mais de 10 mil registros. Reduza o periodo/filtro.');
    return { rows, period: p };
  }
}
