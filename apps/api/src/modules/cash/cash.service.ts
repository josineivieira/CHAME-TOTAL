import { recordActivity } from '../../common/record-activity';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Decimal } from '@chame/shared';
import { Database, Tx } from '../../common/db';
import { Actor } from '../../common/security';
import { lock, audit, idempotent } from '../../common/operations';
import { cents } from '../sales/money';
export async function openCash(tx: Tx, actor: Actor) {
  await lock(tx, `cash:${actor.storeId}`);
  const cash = await tx.cashSession.findFirst({
    where: { companyId: actor.companyId, storeId: actor.storeId, status: 'OPEN' },
  });
  if (!cash) throw new ConflictException('Abra o caixa antes desta operacao.');
  return cash;
}
export async function cashMovement(
  tx: Tx,
  actor: Actor,
  cashId: string,
  type: string,
  method: string,
  amount: Decimal,
  reason: string,
  referenceId?: string,
) {
  const cash = await tx.cashSession.findFirst({
    where: { id: cashId, companyId: actor.companyId, storeId: actor.storeId, status: 'OPEN' },
  });
  if (!cash) throw new ConflictException('Caixa fechado ou fora do escopo.');
  if (method === 'CASH' && amount.isNegative()) {
    const sum = await tx.cashMovement.aggregate({
      where: { cashSessionId: cashId, method: 'CASH' },
      _sum: { amount: true },
    });
    if (
      new Decimal(cash.openingAmount.toString())
        .plus(sum._sum.amount?.toString() ?? 0)
        .plus(amount)
        .lt(0)
    )
      throw new ConflictException('Dinheiro insuficiente no caixa para esta saida.');
  }
  await tx.cashMovement.create({
    data: {
      companyId: actor.companyId,
      cashSessionId: cashId,
      userId: actor.id,
      type,
      method,
      amount: amount.toString(),
      reason,
      referenceId,
    },
  });
}
@Injectable()
export class CashService {
  constructor(@Inject(Database) private db: Database) {}
  async current(actor: Actor) {
    const cash = await this.db.cashSession.findFirst({
      where: { companyId: actor.companyId, storeId: actor.storeId, status: 'OPEN' },
    });
    if (!cash) return null;
    const movements = await this.db.cashMovement.findMany({
      where: { cashSessionId: cash.id, companyId: actor.companyId },
      orderBy: { createdAt: 'desc' },
    });
    const expected = cents(
      movements
        .filter((m) => m.method === 'CASH')
        .reduce((s, m) => s.plus(m.amount.toString()), new Decimal(cash.openingAmount.toString())),
    );
    return {
      ...cash,
      activity: await recordActivity(this.db, actor.companyId, 'CashSession', cash.id),
      expected: expected.toString(),
      movements,
    };
  }
  open(actor: Actor, amount: string, key: unknown) {
    return this.db.atomic((tx) =>
      idempotent(tx, actor, 'cash.open', key, { amount }, async () => {
        await lock(tx, `cash:${actor.storeId}`);
        if (await tx.cashSession.findFirst({ where: { storeId: actor.storeId, status: 'OPEN' } }))
          throw new ConflictException('Ja existe caixa aberto.');
        const cash = await tx.cashSession.create({
          data: {
            companyId: actor.companyId,
            storeId: actor.storeId,
            userId: actor.id,
            openingAmount: amount,
          },
        });
        await audit(tx, actor, 'cash.open', 'CashSession', cash.id, { amount });
        return cash;
      }),
    );
  }
  movement(
    actor: Actor,
    amount: string,
    type: 'SUPPLY' | 'WITHDRAWAL',
    reason: string,
    key: unknown,
  ) {
    return this.db.atomic((tx) =>
      idempotent(tx, actor, 'cash.movement', key, { amount, type, reason }, async () => {
        const cash = await openCash(tx, actor);
        const signed = new Decimal(amount).times(type === 'WITHDRAWAL' ? -1 : 1);
        await cashMovement(tx, actor, cash.id, type, 'CASH', signed, reason);
        await audit(tx, actor, 'cash.movement', 'CashSession', cash.id, { amount, type, reason });
        return { recorded: true };
      }),
    );
  }
  close(actor: Actor, countedAmount: string, justification: string, key: unknown) {
    return this.db.atomic((tx) =>
      idempotent(tx, actor, 'cash.close', key, { countedAmount, justification }, async () => {
        const cash = await openCash(tx, actor);
        const sums = await tx.cashMovement.aggregate({
          where: { cashSessionId: cash.id, method: 'CASH' },
          _sum: { amount: true },
        });
        const expected = cents(
            new Decimal(cash.openingAmount.toString()).plus(sums._sum.amount?.toString() ?? 0),
          ),
          difference = cents(new Decimal(countedAmount).minus(expected));
        if (!difference.isZero() && justification.trim().length < 5)
          throw new BadRequestException('Justifique a diferenca de caixa.');
        const closed = await tx.cashSession.update({
          where: { id: cash.id },
          data: {
            status: 'CLOSED',
            expectedAmount: expected.toString(),
            countedAmount,
            difference: difference.toString(),
            justification,
            closedAt: new Date(),
          },
        });
        await audit(tx, actor, 'cash.close', 'CashSession', cash.id, {
          difference: difference.toString(),
          justification,
        });
        return closed;
      }),
    );
  }
}
