import { recordActivity } from '../../common/record-activity';
import { Injectable } from '@nestjs/common';
import { Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Decimal, financeSchema, money } from '@chame/shared';
import { Database } from '../../common/db';
import { audit, idempotent, lock } from '../../common/operations';
import { openCash, cashMovement } from '../cash/cash.service';
import type { Actor } from '../../common/security';

@Injectable()
export class FinanceService {
  constructor(@Inject(Database) private db: Database) {}
  async list(r: Actor, query: unknown) {
    const p = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        direction: z.enum(['IN', 'OUT']).optional(),
        status: z.enum(['OPEN', 'PARTIAL', 'SETTLED', 'CANCELLED']).optional(),
        q: z.string().default(''),
      })
      .parse(query);
    const where = {
      companyId: r.companyId,
      storeId: r.storeId,
      ...(!r.permissions.includes('payroll.read') ? { source: { not: 'PERSONNEL' } } : {}),
      ...(p.direction ? { direction: p.direction } : {}),
      ...(p.status ? { status: p.status } : {}),
      ...(p.q ? { description: { contains: p.q, mode: 'insensitive' as const } } : {}),
    };
    const [data, total] = await Promise.all([
      this.db.financialEntry.findMany({
        where,
        orderBy: [{ dueDate: 'desc' }, { id: 'asc' }],
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      }),
      this.db.financialEntry.count({ where }),
    ]);
    return { data, pagination: { page: p.page, pageSize: p.pageSize, total } };
  }
  async detail(r: Actor, id: string) {
    const row = await this.db.financialEntry.findFirst({
      where: { id: z.uuid().parse(id), companyId: r.companyId, storeId: r.storeId },
    });
    if (!row || (row.source === 'PERSONNEL' && !r.permissions.includes('payroll.read')))
      throw new NotFoundException('Conta nao encontrada.');
    return { ...row, activity: await recordActivity(this.db, r.companyId, 'FinancialEntry', id) };
  }
  create(r: Actor, body: unknown, key: unknown) {
    const d = financeSchema.parse(body);
    return this.db.atomic((tx) =>
      idempotent(tx, r, 'finance.create', key, d, async () => {
        const entry = await tx.financialEntry.create({
          data: {
            ...d,
            dueDate: new Date(d.dueDate),
            companyId: r.companyId,
            storeId: r.storeId,
            userId: r.id,
          },
        });
        await audit(tx, r, 'finance.create', 'FinancialEntry', entry.id, {
          amount: d.amount,
          direction: d.direction,
        });
        return entry;
      }),
    );
  }
  settle(r: Actor, raw: string, body: unknown, key: unknown) {
    const id = z.uuid().parse(raw),
      d = z
        .object({
          amount: money.refine((v) => Number(v) > 0),
          method: z.enum(['CASH', 'PIX', 'DEBIT', 'CREDIT', 'OTHER']),
        })
        .strict()
        .parse(body);
    return this.db.atomic((tx) =>
      idempotent(tx, r, 'finance.settle', key, { id, ...d }, async () => {
        const cash = await openCash(tx, r);
        await lock(tx, 'finance:' + id);
        const entry = await tx.financialEntry.findFirst({
          where: { id, companyId: r.companyId, storeId: r.storeId },
        });
        if (!entry) throw new NotFoundException('Conta nao encontrada.');
        if (entry.source === 'PERSONNEL')
          throw new BadRequestException('Use Pagamentos de colaboradores para este lancamento.');
        if (entry.status === 'CANCELLED') throw new BadRequestException('Lancamento cancelado.');
        const settled = new Decimal(entry.settledAmount.toString()).plus(d.amount);
        if (settled.gt(entry.amount.toString()))
          throw new BadRequestException('Baixa excede saldo da conta.');
        const result = await tx.financialEntry.update({
          where: { id },
          data: {
            settledAmount: settled.toString(),
            status: settled.eq(entry.amount.toString()) ? 'SETTLED' : 'PARTIAL',
          },
        });
        await tx.financialSettlement.create({
          data: {
            companyId: r.companyId,
            entryId: id,
            amount: d.amount,
            userId: r.id,
            method: d.method,
          },
        });
        await cashMovement(
          tx,
          r,
          cash.id,
          'FINANCE',
          d.method,
          new Decimal(d.amount).times(entry.direction === 'OUT' ? -1 : 1),
          'Baixa financeira',
          id,
        );
        await audit(tx, r, 'finance.settle', 'FinancialEntry', id, d);
        return result;
      }),
    );
  }
}
