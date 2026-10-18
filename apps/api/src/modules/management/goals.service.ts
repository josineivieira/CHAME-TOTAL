import { Injectable } from '@nestjs/common';
import { Inject, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { Decimal, goalSchema } from '@chame/shared';
import { Database } from '../../common/db';
import { audit, lock } from '../../common/operations';
import type { Actor } from '../../common/security';

@Injectable()
export class GoalsService {
  constructor(@Inject(Database) private db: Database) {}
  async list(r: Actor, period?: string) {
    const settings = await this.db.setting.findUniqueOrThrow({
      where: { companyId: r.companyId },
    });
    const month = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(period ?? DateTime.now().setZone(settings.timezone).toFormat('yyyy-MM'));
    const start = DateTime.fromISO(month + '-01', { zone: settings.timezone }),
      end = start.plus({ months: 1 });
    const where = {
      companyId: r.companyId,
      storeId: r.storeId,
      period: month,
      ...(r.permissions.includes('goals.manage')
        ? {}
        : { employeeId: r.employeeId ?? '00000000-0000-0000-0000-000000000000' }),
    };
    const goals = await this.db.salesGoal.findMany({ where });
    const employeeIds = goals.map((g) => g.employeeId).filter((x): x is string => !!x);
    const employees = await this.db.employee.findMany({
      where: { companyId: r.companyId, id: { in: employeeIds } },
    });
    const now = DateTime.now().setZone(settings.timezone);
    const remainingDays = Math.max(0, Math.ceil(end.diff(now.startOf('day'), 'days').days));
    return Promise.all(
      goals.map(async (g) => {
        const sums = await this.db.sale.aggregate({
          where: {
            companyId: r.companyId,
            storeId: r.storeId,
            status: 'CONFIRMED',
            createdAt: { gte: start.toJSDate(), lt: end.toJSDate() },
            ...(g.employeeId ? { employeeId: g.employeeId } : {}),
          },
          _sum: { total: true, returnedTotal: true },
        });
        const sold = new Decimal(sums._sum.total?.toString() ?? 0).minus(
            sums._sum.returnedTotal?.toString() ?? 0,
          ),
          remaining = Decimal.max(new Decimal(g.amount.toString()).minus(sold), 0);
        return {
          ...g,
          employeeName: g.employeeId ? employees.find((e) => e.id === g.employeeId)?.name : 'Loja',
          sold: sold.toFixed(2),
          percent: sold.div(g.amount.toString()).times(100).toFixed(2),
          remaining: remaining.toFixed(2),
          remainingDays,
          dailyNeeded: remainingDays ? remaining.div(remainingDays).toFixed(2) : null,
        };
      }),
    );
  }
  save(r: Actor, b: unknown) {
    const d = goalSchema.parse(b);
    return this.db.atomic(async (tx) => {
      await lock(tx, `goal:${r.storeId}:${d.period}:${d.employeeId ?? 'store'}`);
      if (
        d.employeeId &&
        !(await tx.employee.findFirst({
          where: { id: d.employeeId, companyId: r.companyId, active: true },
        }))
      )
        throw new BadRequestException('Vendedora invalida.');
      const current = await tx.salesGoal.findFirst({
        where: {
          companyId: r.companyId,
          storeId: r.storeId,
          employeeId: d.employeeId ?? null,
          period: d.period,
        },
      });
      const goal = current
        ? await tx.salesGoal.update({ where: { id: current.id }, data: { amount: d.amount } })
        : await tx.salesGoal.create({
            data: { companyId: r.companyId, storeId: r.storeId, ...d },
          });
      await audit(tx, r, 'goals.save', 'SalesGoal', goal.id, { amount: d.amount });
      return goal;
    });
  }
}
