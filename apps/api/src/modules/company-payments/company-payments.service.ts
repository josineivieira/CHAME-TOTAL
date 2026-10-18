import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { z } from 'zod';
import { Decimal, money } from '@chame/shared';
import { Database } from '../../common/db';
import { audit, idempotent, lock } from '../../common/operations';
import { financialEffect } from '../finance/financial-effects';
import type { Actor } from '../../common/security';
export const companyPaymentSchema = z
  .object({
    amount: money.default('0'),
    advanceAmount: money.default('0'),
    method: z.enum(['CASH', 'PIX', 'DEBIT', 'CREDIT', 'BANK', 'OTHER']).default('PIX'),
  })
  .strict();
@Injectable()
export class CompanyPaymentsService {
  constructor(@Inject(Database) private db: Database) {}
  settleFinance(r: Actor, raw: string, body: unknown, key: unknown) {
    if (!r.permissions.includes('finance.manage'))
      throw new ForbiddenException('Sem permissao financeira.');
    const id = z.uuid().parse(raw),
      d = companyPaymentSchema.parse(body),
      paid = new Decimal(d.amount),
      offset = new Decimal(d.advanceAmount);
    if (!paid.plus(offset).gt(0))
      throw new BadRequestException('Informe um pagamento ou compensacao maior que zero.');
    return this.db.atomic((tx) =>
      idempotent(tx, r, 'company.finance.settle', key, { id, ...d }, async () => {
        await lock(tx, 'finance:' + id);
        const entry = await tx.financialEntry.findFirst({
          where: { id, companyId: r.companyId, storeId: r.storeId },
        });
        if (!entry) throw new NotFoundException('Conta nao encontrada.');
        if (entry.source === 'PERSONNEL' && !r.permissions.includes('payroll.manage'))
          throw new ForbiddenException('Sem permissao para pagar colaboradores.');
        if (entry.employeeId) await lock(tx, 'personnel:' + r.companyId + ':' + entry.employeeId);
        if (entry.status === 'CANCELLED') throw new ConflictException('Lancamento cancelado.');
        const settled = entry.settledAmount.plus(paid).plus(offset);
        if (settled.gt(entry.amount)) throw new BadRequestException('Baixa excede saldo da conta.');
        if (offset.gt(0)) {
          if (entry.source !== 'PERSONNEL' || entry.staffType !== 'SALARY' || !entry.employeeId)
            throw new BadRequestException(
              'Compense adiantamento apenas em salario do mesmo colaborador.',
            );
          const advances = await tx.$queryRaw<
            { id: string; available: string }[]
          >`SELECT f.id,(f."settledAmount"-COALESCE(SUM(a.amount),0))::text AS available FROM "FinancialEntry" f LEFT JOIN "StaffAdvanceAllocation" a ON a."advanceEntryId"=f.id AND a."companyId"=f."companyId" WHERE f."companyId"=${r.companyId}::uuid AND f."storeId"=${r.storeId}::uuid AND f."employeeId"=${entry.employeeId}::uuid AND f.source='PERSONNEL' AND f."staffType"='ADVANCE' AND f.status<>'CANCELLED' GROUP BY f.id HAVING f."settledAmount">COALESCE(SUM(a.amount),0) ORDER BY f."createdAt",f.id`;
          if (offset.gt(advances.reduce((sum, row) => sum.plus(row.available), new Decimal(0))))
            throw new BadRequestException('Compensacao excede os adiantamentos pagos disponiveis.');
          const settlement = await tx.financialSettlement.create({
            data: {
              companyId: r.companyId,
              userId: r.id,
              entryId: id,
              amount: offset.toString(),
              method: 'ADVANCE_OFFSET',
            },
          });
          let remaining = offset;
          for (const advance of advances) {
            if (remaining.lte(0)) break;
            const used = Decimal.min(remaining, advance.available);
            await tx.staffAdvanceAllocation.create({
              data: {
                companyId: r.companyId,
                userId: r.id,
                advanceEntryId: advance.id,
                salaryEntryId: id,
                salarySettlementId: settlement.id,
                amount: used.toString(),
              },
            });
            remaining = remaining.minus(used);
          }
        }
        if (paid.gt(0)) {
          await tx.financialSettlement.create({
            data: {
              companyId: r.companyId,
              entryId: id,
              userId: r.id,
              amount: paid.toString(),
              method: d.method,
            },
          });
          await tx.treasuryEntry.create({
            data: {
              companyId: r.companyId,
              userId: r.id,
              amount: paid.times(entry.direction === 'OUT' ? -1 : 1).toString(),
              method: d.method,
              kind:
                entry.source === 'PERSONNEL'
                  ? 'PERSONNEL_PAYMENT'
                  : entry.direction === 'OUT'
                    ? 'FINANCE_PAYMENT'
                    : 'FINANCE_RECEIPT',
              description: entry.description,
            },
          });
        }
        const result = await tx.financialEntry.update({
          where: { id },
          data: {
            settledAmount: settled.toString(),
            status: settled.eq(entry.amount) ? 'SETTLED' : 'PARTIAL',
          },
        });
        await audit(tx, r, 'finance.settle', 'FinancialEntry', id, {
          ...d,
          origin: 'COMPANY',
          employeeId: entry.employeeId,
        });
        return result;
      }),
    );
  }
  settleCommission(r: Actor, body: unknown, key: unknown) {
    if (!r.permissions.includes('commissions.manage') || !r.permissions.includes('finance.manage'))
      throw new ForbiddenException('Sem permissao para pagar comissoes pela empresa.');
    const d = z
      .object({
        employeeId: z.uuid(),
        method: z.enum(['CASH', 'PIX', 'DEBIT', 'CREDIT', 'BANK', 'OTHER']).default('PIX'),
      })
      .strict()
      .parse(body);
    return this.db.atomic((tx) =>
      idempotent(tx, r, 'company.commission.settle', key, d, async () => {
        await lock(tx, 'commission:' + d.employeeId);
        const employee = await tx.employee.findFirst({
          where: { id: d.employeeId, companyId: r.companyId },
        });
        if (!employee) throw new NotFoundException('Colaborador nao encontrado.');
        const scope = { companyId: r.companyId, storeId: r.storeId, employeeId: d.employeeId };
        if (
          await tx.commissionEntry.count({
            where: { ...scope, status: 'PENDING', amount: { lt: 0 } },
          })
        )
          throw new BadRequestException('Aprove as reversoes pendentes antes de pagar.');
        const entries = await tx.commissionEntry.findMany({
            where: { ...scope, status: 'APPROVED' },
          }),
          total = entries.reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
        if (!total.gt(0))
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
        await tx.treasuryEntry.create({
          data: {
            companyId: r.companyId,
            userId: r.id,
            amount: total.negated().toString(),
            method: d.method,
            kind: 'COMMISSION_PAYMENT',
            description: 'Pagamento de comissao - ' + employee.name,
          },
        });
        await financialEffect(
          tx,
          r,
          'OUT',
          total,
          'Pagamento de comissao - ' + employee.name,
          settlement.id,
          d.method,
          'COMMISSION',
        );
        await audit(tx, r, 'commission.settle', 'CommissionSettlement', settlement.id, {
          total: total.toString(),
          method: d.method,
          origin: 'COMPANY',
        });
        return settlement;
      }),
    );
  }
  classify(r: Actor, raw: string, body: unknown, key: unknown) {
    const id = z.uuid().parse(raw),
      d = z
        .object({
          resultGroup: z.enum(['OPERATING', 'INVENTORY', 'CAPITAL', 'FINANCING']),
          reason: z.string().trim().min(5).max(500),
        })
        .strict()
        .parse(body);
    return this.db.atomic((tx) =>
      idempotent(tx, r, 'finance.classify', key, { id, ...d }, async () => {
        await lock(tx, 'finance:' + id);
        const entry = await tx.financialEntry.findFirst({
          where: { id, companyId: r.companyId, storeId: r.storeId, source: 'MANUAL' },
        });
        if (!entry) throw new NotFoundException('Conta manual nao encontrada.');
        const result = await tx.financialEntry.update({
          where: { id },
          data: { resultGroup: d.resultGroup },
        });
        await audit(tx, r, 'finance.classify', 'FinancialEntry', id, {
          ...d,
          previous: entry.resultGroup,
        });
        return result;
      }),
    );
  }
}
