import type { Database } from './db';
import type { Prisma } from '../generated/prisma/client';
export async function recordActivity(
  db: Database,
  companyId: string,
  entity: string,
  entityId: string,
  related?: Prisma.AuditLogWhereInput,
  actions?: string[],
) {
  const direct: Prisma.AuditLogWhereInput = {
    entity,
    entityId,
    ...(actions ? { action: { in: actions } } : {}),
  };
  const where: Prisma.AuditLogWhereInput = {
    companyId,
    OR: related ? [direct, related] : [direct],
  };
  const select = {
    id: true,
    action: true,
    createdAt: true,
    user: { select: { name: true } },
  } as const;
  const [created, latest] = await Promise.all([
    db.auditLog.findFirst({
      where: {
        companyId,
        entity,
        entityId,
        action: {
          in: [
            'create',
            'sales.confirm',
            'purchase.create',
            'finance.create',
            'cash.open',
            'quotation.create',
          ],
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select,
    }),
    db.auditLog.findFirst({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select }),
  ]);
  const stamp = (entry: NonNullable<typeof latest>) => ({
    userName: entry.user.name,
    at: entry.createdAt,
  });
  return {
    created: created ? stamp(created) : null,
    updated: latest && latest.id !== created?.id ? stamp(latest) : null,
  };
}
