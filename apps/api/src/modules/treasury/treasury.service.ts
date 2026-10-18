import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { Decimal, money } from '@chame/shared';
import { Database } from '../../common/db';
import { Prisma } from '../../generated/prisma/client';
import type { Actor } from '../../common/security';
import { audit, idempotent, lock } from '../../common/operations';
const methods = z.enum(['CASH', 'PIX', 'DEBIT', 'CREDIT', 'BANK', 'OTHER']);
const signedMoney = z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/);
const civil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
@Injectable()
export class TreasuryService {
  constructor(@Inject(Database) private db: Database) {}
  private async zone(actor: Actor) {
    return (
      (
        await this.db.setting.findUnique({
          where: { companyId: actor.companyId },
          select: { timezone: true },
        })
      )?.timezone ?? 'America/Sao_Paulo'
    );
  }
  private day(value: string, zone: string) {
    const day = DateTime.fromISO(value, { zone });
    if (!day.isValid || day.toISODate() !== value) throw new BadRequestException('Data invalida.');
    return day.startOf('day');
  }
  async overview(actor: Actor, raw: unknown) {
    const p = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        from: civil.optional(),
        to: civil.optional(),
        direction: z.enum(['IN', 'OUT']).optional(),
        method: methods.optional(),
        source: z
          .enum([
            'SALE',
            'REFUND',
            'FINANCE',
            'COMMISSION',
            'MANUAL',
            'REVERSAL',
            'OPENING',
            'PURCHASE_PAYMENT',
            'PURCHASE_REFUND',
            'FINANCE_PAYMENT',
            'FINANCE_RECEIPT',
            'COMMISSION_PAYMENT',
            'PERSONNEL_PAYMENT',
          ])
          .optional(),
        q: z.string().trim().max(150).default(''),
      })
      .parse(raw);
    const zone = await this.zone(actor),
      from = p.from ? this.day(p.from, zone).toJSDate() : null,
      to = p.to ? this.day(p.to, zone).plus({ days: 1 }).toJSDate() : null;
    if (from && to && from >= to) throw new BadRequestException('Periodo invalido.');
    const filters = [Prisma.sql`TRUE`];
    if (from) filters.push(Prisma.sql`r."createdAt" >= ${from}`);
    if (to) filters.push(Prisma.sql`r."createdAt" < ${to}`);
    if (p.direction)
      filters.push(p.direction === 'IN' ? Prisma.sql`r.amount > 0` : Prisma.sql`r.amount < 0`);
    if (p.method) filters.push(Prisma.sql`r.method = ${p.method}`);
    if (p.source) filters.push(Prisma.sql`r.source = ${p.source}`);
    if (p.q) filters.push(Prisma.sql`strpos(lower(r.description), lower(${p.q})) > 0`);
    const result = await this.db.$queryRaw<{ payload: unknown }[]>(Prisma.sql`
   WITH baseline AS (SELECT * FROM "TreasuryBaseline" WHERE "companyId"=${actor.companyId}::uuid),
   flows AS (
    SELECT 'cash:'||cm.id::text AS id, cm.id::text AS "rawId", cm."createdAt", cm.amount, cm.method, cm.type AS source,
     CASE WHEN cm.type='FINANCE' THEN COALESCE(fe.description,cm.reason) ELSE cm.reason END AS description,
     st.name AS "storeName", false AS reversed, 1 AS priority
    FROM "CashMovement" cm JOIN "CashSession" cs ON cs.id=cm."cashSessionId" AND cs."companyId"=cm."companyId"
    JOIN "Store" st ON st.id=cs."storeId" AND st."companyId"=cm."companyId"
    LEFT JOIN "FinancialEntry" fe ON cm.type='FINANCE' AND fe.id=cm."referenceId" AND fe."companyId"=cm."companyId"
    WHERE cm."companyId"=${actor.companyId}::uuid AND cm.type IN ('SALE','REFUND','FINANCE','COMMISSION')
    UNION ALL
    SELECT 'manual:'||t.id::text,t.id::text,t."createdAt",t.amount,t.method,t.kind,t.description,origin_store.name,
     EXISTS(SELECT 1 FROM "TreasuryEntry" rev WHERE rev."reversesId"=t.id AND rev."companyId"=t."companyId"),1
    FROM "TreasuryEntry" t
    LEFT JOIN "PurchaseOrder" paid_purchase ON paid_purchase."paymentEntryId"=t.id AND paid_purchase."companyId"=t."companyId"
    LEFT JOIN "PurchaseIssue" refund_issue ON refund_issue."refundEntryId"=t.id AND refund_issue."companyId"=t."companyId"
    LEFT JOIN "PurchaseOrderItem" refund_item ON refund_item.id=refund_issue."purchaseItemId" AND refund_item."companyId"=t."companyId"
    LEFT JOIN "PurchaseOrder" refunded_purchase ON refunded_purchase.id=refund_item."purchaseId" AND refunded_purchase."companyId"=t."companyId"
    LEFT JOIN "Store" origin_store ON origin_store.id=COALESCE(paid_purchase."storeId",refunded_purchase."storeId") AND origin_store."companyId"=t."companyId"
    WHERE t."companyId"=${actor.companyId}::uuid
    UNION ALL
    SELECT 'opening:'||b."companyId"::text,NULL,b."startsAt",b.amount,'INITIAL','OPENING',b.reason,NULL,false,0 FROM baseline b
   ), running AS (
    SELECT f.*, CASE WHEN f.source='OPENING' THEN f.amount
     WHEN f."createdAt">=(SELECT "startsAt" FROM baseline) THEN (SELECT amount FROM baseline)+
      SUM(CASE WHEN f.source<>'OPENING' AND f."createdAt">=(SELECT "startsAt" FROM baseline) THEN f.amount ELSE 0 END)
      OVER(ORDER BY f."createdAt",f.priority,f.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
     ELSE NULL END AS balance FROM flows f
   ), filtered AS (SELECT * FROM running r WHERE ${Prisma.join(filters, ' AND ')}),
   page AS (SELECT id,"rawId","createdAt",amount::text AS amount,method,source,description,"storeName",reversed,balance::text AS balance FROM filtered ORDER BY "createdAt" DESC,priority DESC,id DESC OFFSET ${(p.page - 1) * p.pageSize} LIMIT ${p.pageSize})
   SELECT jsonb_build_object(
    'baseline',(SELECT jsonb_build_object('amount',amount::text,'startsAt',"startsAt",'reason',reason) FROM baseline),
    'balance',(SELECT (b.amount+COALESCE((SELECT SUM(f.amount) FROM flows f WHERE f.source<>'OPENING' AND f."createdAt">=b."startsAt"),0))::text FROM baseline b),
    'incoming',COALESCE((SELECT SUM(amount) FROM filtered WHERE amount>0 AND source<>'OPENING'),0)::text,
    'outgoing',COALESCE((SELECT -SUM(amount) FROM filtered WHERE amount<0 AND source<>'OPENING'),0)::text,
    'data',COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY page."createdAt" DESC, (CASE WHEN page.source='OPENING' THEN 0 ELSE 1 END) DESC, page.id DESC) FROM page),'[]'::jsonb),
    'pagination',jsonb_build_object('page',${p.page}::int,'pageSize',${p.pageSize}::int,'total',(SELECT count(*) FROM filtered)),
    'bySource',COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM (SELECT source,COALESCE(SUM(amount) FILTER(WHERE amount>0),0)::text AS incoming,COALESCE(-SUM(amount) FILTER(WHERE amount<0),0)::text AS outgoing FROM filtered WHERE source<>'OPENING' GROUP BY source ORDER BY source) m),'[]'::jsonb),
    'byMethod',COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM (SELECT method,COALESCE(SUM(amount) FILTER(WHERE amount>0),0)::text AS incoming,COALESCE(-SUM(amount) FILTER(WHERE amount<0),0)::text AS outgoing FROM filtered WHERE source<>'OPENING' GROUP BY method ORDER BY method) m),'[]'::jsonb)
   ) AS payload
  `);
    return {
      ...(result[0].payload as Record<string, unknown>),
      timezone: zone,
      today: DateTime.now().setZone(zone).toISODate(),
    };
  }
  async initialize(actor: Actor, body: unknown, key: unknown) {
    const d = z
        .object({ amount: signedMoney, date: civil, reason: z.string().trim().min(5).max(500) })
        .strict()
        .parse(body),
      zone = await this.zone(actor),
      start = this.day(d.date, zone);
    if (start > DateTime.now().setZone(zone).startOf('day'))
      throw new BadRequestException('Saldo inicial nao pode ter data futura.');
    return this.db.atomic((tx) =>
      idempotent(tx, actor, 'treasury.initialize', key, d, async () => {
        await lock(tx, 'treasury:' + actor.companyId);
        if (await tx.treasuryBaseline.findUnique({ where: { companyId: actor.companyId } }))
          throw new ConflictException(
            'O saldo inicial ja foi informado. Registre um ajuste para corrigir o saldo.',
          );
        const baseline = await tx.treasuryBaseline.create({
          data: {
            companyId: actor.companyId,
            userId: actor.id,
            amount: d.amount,
            startsAt: start.toJSDate(),
            reason: d.reason,
          },
        });
        await audit(tx, actor, 'treasury.initialize', 'TreasuryBaseline', actor.companyId, {
          amount: d.amount,
          date: d.date,
          reason: d.reason,
        });
        return baseline;
      }),
    );
  }
  create(actor: Actor, body: unknown, key: unknown) {
    const d = z
      .object({
        direction: z.enum(['IN', 'OUT']),
        amount: money.refine((v) => new Decimal(v).gt(0), 'Informe um valor maior que zero.'),
        method: methods,
        description: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(body);
    return this.db.atomic((tx) =>
      idempotent(tx, actor, 'treasury.create', key, d, async () => {
        await lock(tx, 'treasury:' + actor.companyId);
        if (!(await tx.treasuryBaseline.findUnique({ where: { companyId: actor.companyId } })))
          throw new ConflictException('Informe o saldo inicial antes de lancar movimentos.');
        const entry = await tx.treasuryEntry.create({
          data: {
            companyId: actor.companyId,
            userId: actor.id,
            method: d.method,
            amount: new Decimal(d.amount).times(d.direction === 'OUT' ? -1 : 1).toFixed(2),
            description: d.description,
          },
        });
        await audit(tx, actor, 'treasury.create', 'TreasuryEntry', entry.id, d);
        return entry;
      }),
    );
  }
  reverse(actor: Actor, id: string, body: unknown, key: unknown) {
    const d = z
      .object({ reason: z.string().trim().min(5).max(500) })
      .strict()
      .parse(body);
    z.uuid().parse(id);
    return this.db.atomic((tx) =>
      idempotent(tx, actor, 'treasury.reverse', key, { id, ...d }, async () => {
        await lock(tx, 'treasury:' + actor.companyId);
        const original = await tx.treasuryEntry.findFirst({
          where: { id, companyId: actor.companyId, kind: 'MANUAL' },
        });
        if (!original) throw new NotFoundException('Lancamento manual nao encontrado.');
        if (await tx.treasuryEntry.findUnique({ where: { reversesId: id } }))
          throw new ConflictException('Este lancamento ja foi estornado.');
        const reversal = await tx.treasuryEntry.create({
          data: {
            companyId: actor.companyId,
            userId: actor.id,
            amount: original.amount.negated(),
            method: original.method,
            kind: 'REVERSAL',
            reversesId: id,
            description: d.reason,
          },
        });
        await audit(tx, actor, 'treasury.reverse', 'TreasuryEntry', reversal.id, {
          originalId: id,
          reason: d.reason,
        });
        return reversal;
      }),
    );
  }
}
