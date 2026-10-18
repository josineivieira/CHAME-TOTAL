import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { money } from '@chame/shared';
import { Database } from '../../common/db';
import { audit, idempotent, lock } from '../../common/operations';
import { recordActivity } from '../../common/record-activity';
import type { Actor } from '../../common/security';
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  types = z.enum(['SALARY', 'ADVANCE', 'BENEFIT', 'REIMBURSEMENT', 'OTHER']);
export const personnelSchema = z
  .object({
    employeeId: z.uuid(),
    staffType: types,
    competence: period,
    description: z.string().trim().min(5).max(200),
    amount: money.refine((v) => Number(v) > 0),
    dueDate: z.iso.date(),
    notes: z.string().max(1000).optional(),
  })
  .strict();
@Injectable()
export class PersonnelService {
  constructor(@Inject(Database) private db: Database) {}
  async list(r: Actor, raw: unknown) {
    const p = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        period: period.optional(),
        employeeId: z.uuid().optional(),
        status: z.enum(['OPEN', 'PARTIAL', 'SETTLED', 'CANCELLED']).optional(),
        staffType: types.optional(),
        q: z.string().trim().max(150).default(''),
      })
      .parse(raw);
    const where = {
      companyId: r.companyId,
      storeId: r.storeId,
      source: 'PERSONNEL',
      ...(p.period ? { competenceDate: new Date(p.period + '-01') } : {}),
      ...(p.employeeId ? { employeeId: p.employeeId } : {}),
      ...(p.status ? { status: p.status } : {}),
      ...(p.staffType ? { staffType: p.staffType } : {}),
      ...(p.q
        ? {
            OR: [
              { description: { contains: p.q, mode: 'insensitive' as const } },
              { staffEmployee: { name: { contains: p.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [rows, total, pending, cost, payments] = await Promise.all([
      this.db.financialEntry.findMany({
        where,
        include: { staffEmployee: { select: { name: true } } },
        orderBy: [{ dueDate: 'desc' }, { id: 'asc' }],
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      }),
      this.db.financialEntry.count({ where }),
      this.db.financialEntry.aggregate({
        where: { ...where, status: { not: 'CANCELLED' } },
        _sum: { amount: true, settledAmount: true },
      }),
      this.db.financialEntry.aggregate({
        where: { ...where, status: { not: 'CANCELLED' }, staffType: { not: 'ADVANCE' } },
        _sum: { amount: true },
      }),
      this.db.financialSettlement.groupBy({
        by: ['method'],
        where: { companyId: r.companyId, entry: where },
        _sum: { amount: true },
      }),
    ]);
    const { Decimal } = await import('@chame/shared');
    return {
      data: rows.map(({ staffEmployee, ...row }) => ({
        ...row,
        employeeName: staffEmployee?.name,
      })),
      pagination: { page: p.page, pageSize: p.pageSize, total },
      summary: {
        cost: (cost._sum.amount ?? 0).toString(),
        pending: new Decimal(pending._sum.amount?.toString() ?? 0)
          .minus(pending._sum.settledAmount?.toString() ?? 0)
          .toString(),
        paid: payments
          .filter((x) => x.method !== 'ADVANCE_OFFSET')
          .reduce((sum, x) => sum.plus(x._sum.amount?.toString() ?? 0), new Decimal(0))
          .toString(),
        offset: payments.find((x) => x.method === 'ADVANCE_OFFSET')?._sum.amount?.toString() ?? '0',
      },
    };
  }
  create(r: Actor, body: unknown, key: unknown) {
    const d = personnelSchema.parse(body);
    if (!DateTime.fromISO(d.competence + '-01').isValid)
      throw new BadRequestException('Competencia invalida.');
    return this.db.atomic((tx) =>
      idempotent(tx, r, 'personnel.create', key, d, async () => {
        if (
          !(await tx.employee.findFirst({
            where: { id: d.employeeId, companyId: r.companyId, active: true },
          }))
        )
          throw new BadRequestException('Colaborador invalido ou inativo.');
        const row = await tx.financialEntry.create({
          data: {
            companyId: r.companyId,
            storeId: r.storeId,
            userId: r.id,
            employeeId: d.employeeId,
            staffType: d.staffType,
            competenceDate: new Date(d.competence + '-01'),
            resultGroup: d.staffType === 'ADVANCE' ? 'CAPITAL' : 'OPERATING',
            source: 'PERSONNEL',
            direction: 'OUT',
            category: 'Colaboradores',
            description: d.description,
            amount: d.amount,
            dueDate: new Date(d.dueDate),
            notes: d.notes,
          },
        });
        await audit(tx, r, 'finance.create', 'FinancialEntry', row.id, {
          employeeId: d.employeeId,
          staffType: d.staffType,
          amount: d.amount,
          competence: d.competence,
        });
        return row;
      }),
    );
  }
  async detail(r: Actor, id: string) {
    z.uuid().parse(id);
    const entry = await this.db.financialEntry.findFirst({
      where: { id, companyId: r.companyId, storeId: r.storeId, source: 'PERSONNEL' },
      include: { staffEmployee: { select: { name: true } } },
    });
    if (!entry) throw new NotFoundException('Pagamento de colaborador nao encontrado.');
    const [available, payments, activity] = await Promise.all([
      this.db.$queryRaw<
        { amount: string }[]
      >`SELECT (COALESCE(SUM(f."settledAmount"),0)-COALESCE((SELECT SUM(a.amount) FROM "StaffAdvanceAllocation" a JOIN "FinancialEntry" source ON source.id=a."advanceEntryId" AND source."companyId"=a."companyId" WHERE source."companyId"=${r.companyId}::uuid AND source."storeId"=${r.storeId}::uuid AND source."employeeId"=${entry.employeeId}::uuid),0))::text AS amount FROM "FinancialEntry" f WHERE f."companyId"=${r.companyId}::uuid AND f."storeId"=${r.storeId}::uuid AND f."employeeId"=${entry.employeeId}::uuid AND f.source='PERSONNEL' AND f."staffType"='ADVANCE' AND f.status<>'CANCELLED'`,
      this.db.financialSettlement.findMany({
        where: { entryId: id, companyId: r.companyId },
        select: {
          id: true,
          amount: true,
          method: true,
          createdAt: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      recordActivity(this.db, r.companyId, 'FinancialEntry', id),
    ]);
    const { staffEmployee, ...row } = entry;
    return {
      ...row,
      employeeName: staffEmployee?.name,
      availableAdvance: available[0].amount,
      payments: payments.map(({ user, ...payment }) => ({ ...payment, userName: user.name })),
      activity,
    };
  }
  cancel(r: Actor, id: string, body: unknown, key: unknown) {
    z.uuid().parse(id);
    const d = z
      .object({ reason: z.string().trim().min(5).max(500) })
      .strict()
      .parse(body);
    return this.db.atomic((tx) =>
      idempotent(tx, r, 'personnel.cancel', key, { id, ...d }, async () => {
        await lock(tx, 'finance:' + id);
        const entry = await tx.financialEntry.findFirst({
          where: { id, companyId: r.companyId, storeId: r.storeId, source: 'PERSONNEL' },
        });
        if (!entry) throw new NotFoundException('Lancamento nao encontrado.');
        if (entry.status === 'CANCELLED' || entry.settledAmount.gt(0))
          throw new ConflictException(
            'Somente lancamentos sem pagamento ou compensacao podem ser cancelados.',
          );
        const row = await tx.financialEntry.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: d.reason },
        });
        await audit(tx, r, 'personnel.cancel', 'FinancialEntry', id, d);
        return row;
      }),
    );
  }
}
