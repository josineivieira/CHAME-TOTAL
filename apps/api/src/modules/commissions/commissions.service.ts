import { Injectable } from '@nestjs/common';
import { Inject, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { Decimal } from '@chame/shared';
import { Database } from '../../common/db';
import { audit, idempotent, lock } from '../../common/operations';
import { openCash, cashMovement } from '../cash/cash.service';
import { financialEffect } from '../finance/financial-effects';
import type { Actor } from '../../common/security';

@Injectable()
export class CommissionsService {
  constructor(@Inject(Database) private db: Database) {}
  async list(r: Actor) {
    const entries = await this.db.commissionEntry.findMany({
      where: {
        companyId: r.companyId,
        storeId: r.storeId,
        ...(r.permissions.includes('commissions.manage')
          ? {}
          : { employeeId: r.employeeId ?? '00000000-0000-0000-0000-000000000000' }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const employees = await this.db.employee.findMany({
      where: { companyId: r.companyId, id: { in: entries.map((e) => e.employeeId) } },
    });
    return entries.map((e) => ({
      ...e,
      employeeName: employees.find((p) => p.id === e.employeeId)?.name,
    }));
  }
  approve(r: Actor, b: unknown) {
    const { employeeId } = z.object({ employeeId: z.uuid() }).strict().parse(b);
    return this.db.atomic(async (tx) => {
      await lock(tx, 'commission:' + employeeId);
      const result = await tx.commissionEntry.updateMany({
        where: {
          companyId: r.companyId,
          storeId: r.storeId,
          employeeId,
          status: 'PENDING',
        },
        data: { status: 'APPROVED' },
      });
      await audit(tx, r, 'commission.approve', 'Employee', employeeId, {
        count: result.count,
      });
      return result;
    });
  }
  settle(r: Actor, b: unknown, key: unknown) {
    const d = z
      .object({ employeeId: z.uuid(), method: z.enum(['CASH', 'PIX', 'OTHER']).default('PIX') })
      .strict()
      .parse(b);
    return this.db.atomic((tx) =>
      idempotent(tx, r, 'commission.settle', key, d, async () => {
        const cash = await openCash(tx, r);
        await lock(tx, 'commission:' + d.employeeId);
        const where = {
          companyId: r.companyId,
          storeId: r.storeId,
          employeeId: d.employeeId,
        };
        if (
          await tx.commissionEntry.count({
            where: { ...where, status: 'PENDING', amount: { lt: 0 } },
          })
        )
          throw new BadRequestException('Aprove as reversoes pendentes antes de pagar.');
        const entries = await tx.commissionEntry.findMany({
          where: { ...where, status: 'APPROVED' },
        });
        const total = entries.reduce((s, e) => s.plus(e.amount.toString()), new Decimal(0));
        if (total.lte(0))
          throw new BadRequestException(
            'Nao ha saldo positivo aprovado. Reversoes permanecem para compensacao.',
          );
        const settlement = await tx.commissionSettlement.create({
          data: {
            companyId: r.companyId,
            employeeId: d.employeeId,
            userId: r.id,
            total: total.toString(),
          },
        });
        await tx.commissionEntry.updateMany({
          where: { id: { in: entries.map((e) => e.id) }, status: 'APPROVED' },
          data: { status: 'PAID', paidAt: new Date(), settlementId: settlement.id },
        });
        await cashMovement(
          tx,
          r,
          cash.id,
          'COMMISSION',
          d.method,
          total.negated(),
          'Pagamento de comissao',
          settlement.id,
        );
        await financialEffect(
          tx,
          r,
          'OUT',
          total,
          'Pagamento de comissao',
          settlement.id,
          d.method,
          'COMMISSION',
        );
        await audit(tx, r, 'commission.settle', 'CommissionSettlement', settlement.id, {
          total: total.toString(),
        });
        return settlement;
      }),
    );
  }
}
