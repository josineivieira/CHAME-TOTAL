import { Decimal } from '@chame/shared';
import { DateTime } from 'luxon';
import type { Tx } from '../../common/db';
import type { Actor } from '../../common/security';
export async function financialEffect(
  tx: Tx,
  actor: Actor,
  direction: 'IN' | 'OUT',
  amount: Decimal,
  description: string,
  referenceId: string,
  method: string,
  source: string,
) {
  if (amount.isZero()) return;
  const settings = await tx.setting.findUniqueOrThrow({ where: { companyId: actor.companyId } });
  const dueDate = new Date(DateTime.now().setZone(settings.timezone).toISODate()!);
  const entry = await tx.financialEntry.create({
    data: {
      companyId: actor.companyId,
      storeId: actor.storeId,
      userId: actor.id,
      direction,
      description,
      amount: amount.toString(),
      settledAmount: amount.toString(),
      dueDate,
      category: source,
      source,
      referenceId,
      status: 'SETTLED',
    },
  });
  await tx.financialSettlement.create({
    data: {
      companyId: actor.companyId,
      entryId: entry.id,
      amount: amount.toString(),
      userId: actor.id,
      method,
    },
  });
}
