import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { Decimal } from '@chame/shared';
import { Database } from '../../common/db';
import { TreasuryService } from './treasury.service';
import type { Actor } from '../../common/security';
@Injectable()
export class ResultsService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(TreasuryService) private treasury: TreasuryService,
  ) {}
  async overview(r: Actor, raw: unknown) {
    const q = z
      .object({
        period: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
          .optional(),
      })
      .parse(raw);
    const settings = await this.db.setting.findUniqueOrThrow({ where: { companyId: r.companyId } }),
      period = q.period ?? DateTime.now().setZone(settings.timezone).toFormat('yyyy-MM');
    const month = DateTime.fromISO(period + '-01', { zone: settings.timezone });
    if (!month.isValid) throw new BadRequestException('Competencia invalida.');
    const start = month.toJSDate(),
      end = month.plus({ months: 1 }).toJSDate(),
      from = month.toISODate()!,
      to = month.endOf('month').toISODate()!;
    const [sales, personnel, manual, commissions, cash] = await Promise.all([
      this.db.$queryRaw<
        { gross: string; discounts: string; refunds: string; cost: string; zeroCostItems: number }[]
      >`
    WITH events AS (
     SELECT s."createdAt" AS at,s.subtotal AS gross,s.discount AS discounts,0::numeric AS refunds,COALESCE((SELECT SUM(i.quantity*i."unitCost") FROM "SaleItem" i WHERE i."saleId"=s.id AND i."companyId"=s."companyId"),0) AS cost FROM "Sale" s WHERE s."companyId"=${r.companyId}::uuid
     UNION ALL
     SELECT sr."createdAt",0,0,sr.total,-COALESCE((SELECT SUM(ri.quantity*i."unitCost") FROM "SaleReturnItem" ri JOIN "SaleItem" i ON i.id=ri."saleItemId" AND i."companyId"=ri."companyId" WHERE ri."returnId"=sr.id AND ri."companyId"=sr."companyId" AND ri.restock),0) FROM "SaleReturn" sr WHERE sr."companyId"=${r.companyId}::uuid
     UNION ALL
     SELECT s."cancelledAt",0,0,s.total,-COALESCE((SELECT SUM(i.quantity*i."unitCost") FROM "SaleItem" i WHERE i."saleId"=s.id AND i."companyId"=s."companyId"),0) FROM "Sale" s WHERE s."companyId"=${r.companyId}::uuid AND s.status='CANCELLED' AND s."cancelledAt" IS NOT NULL
    ) SELECT COALESCE(SUM(gross),0)::text AS gross,COALESCE(SUM(discounts),0)::text AS discounts,COALESCE(SUM(refunds),0)::text AS refunds,COALESCE(SUM(cost),0)::text AS cost,(SELECT count(*)::int FROM "SaleItem" i JOIN "Sale" s ON s.id=i."saleId" AND s."companyId"=i."companyId" WHERE s."companyId"=${r.companyId}::uuid AND s."createdAt">=${start} AND s."createdAt"<${end} AND i."unitCost"=0) AS "zeroCostItems" FROM events WHERE at>=${start} AND at<${end}
   `,
      this.db.financialEntry.groupBy({
        by: ['staffType'],
        where: {
          companyId: r.companyId,
          source: 'PERSONNEL',
          staffType: { not: 'ADVANCE' },
          status: { not: 'CANCELLED' },
          competenceDate: new Date(period + '-01'),
        },
        _sum: { amount: true },
      }),
      this.db.financialEntry.groupBy({
        by: ['direction'],
        where: {
          companyId: r.companyId,
          source: 'MANUAL',
          resultGroup: 'OPERATING',
          status: { not: 'CANCELLED' },
          dueDate: { gte: new Date(from), lte: new Date(to) },
        },
        _sum: { amount: true },
      }),
      this.db.commissionEntry.aggregate({
        where: { companyId: r.companyId, createdAt: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.treasury.overview(r, { from, to, pageSize: 1 }),
    ]);
    const s = sales[0],
      cashData = cash as unknown as {
        incoming: string;
        outgoing: string;
        balance: string | null;
        bySource: { source: string; incoming: string; outgoing: string }[];
      };
    const netRevenue = new Decimal(s.gross).minus(s.discounts).minus(s.refunds),
      cost = new Decimal(s.cost).toDecimalPlaces(2),
      grossProfit = netRevenue.minus(cost),
      staff = personnel.reduce(
        (sum, item) => sum.plus(item._sum.amount?.toString() ?? 0),
        new Decimal(0),
      ),
      commission = new Decimal(commissions._sum.amount?.toString() ?? 0),
      otherExpenses = new Decimal(
        manual.find((x) => x.direction === 'OUT')?._sum.amount?.toString() ?? 0,
      ),
      otherIncome = new Decimal(
        manual.find((x) => x.direction === 'IN')?._sum.amount?.toString() ?? 0,
      ),
      expenses = staff.plus(commission).plus(otherExpenses),
      netProfit = grossProfit.plus(otherIncome).minus(expenses);
    return {
      period,
      from,
      to,
      timezone: settings.timezone,
      grossSales: s.gross,
      discounts: s.discounts,
      refunds: s.refunds,
      netRevenue: netRevenue.toFixed(2),
      costOfGoods: cost.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      personnel: staff.toFixed(2),
      personnelByType: personnel.map((row) => ({
        type: row.staffType,
        amount: row._sum.amount?.toString() ?? '0',
      })),
      commissions: commission.toFixed(2),
      otherExpenses: otherExpenses.toFixed(2),
      otherIncome: otherIncome.toFixed(2),
      expenses: expenses.toFixed(2),
      netProfit: netProfit.toFixed(2),
      grossMargin: netRevenue.gt(0) ? grossProfit.div(netRevenue).times(100).toFixed(2) : null,
      netMargin: netRevenue.gt(0) ? netProfit.div(netRevenue).times(100).toFixed(2) : null,
      zeroCostItems: s.zeroCostItems,
      cash: {
        incoming: cashData.incoming,
        outgoing: cashData.outgoing,
        net: new Decimal(cashData.incoming).minus(cashData.outgoing).toFixed(2),
        currentBalance: cashData.balance,
        bySource: cashData.bySource,
      },
    };
  }
}
