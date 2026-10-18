import { ConflictException, BadRequestException } from '@nestjs/common';
import type { Actor } from './security';
import { hash } from './security';
import type { Tx } from './db';
import { Prisma } from '../generated/prisma/client';
export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string,
  details: Prisma.InputJsonObject = {},
) {
  await tx.auditLog.create({
    data: {
      companyId: actor.companyId,
      userId: actor.id,
      action,
      entity,
      entityId,
      details: { ...details, result: 'SUCCESS', origin: 'API' },
    },
  });
}
export async function idempotent<T>(
  tx: Tx,
  actor: Actor,
  operation: string,
  key: unknown,
  payload: unknown,
  work: () => Promise<T>,
): Promise<T> {
  if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(key))
    throw new BadRequestException('Idempotency-Key deve conter de 16 a 100 caracteres.');
  const payloadHash = hash(JSON.stringify(payload));
  const lock = hash([actor.companyId, actor.id, operation, key].join(':'));
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))`;
  const existing = await tx.idempotencyRecord.findUnique({
    where: {
      companyId_userId_operation_key: {
        companyId: actor.companyId,
        userId: actor.id,
        operation,
        key,
      },
    },
  });
  if (existing) {
    if (existing.payloadHash !== payloadHash)
      throw new ConflictException('Chave ja utilizada com conteudo diferente.');
    return existing.response as T;
  }
  const result = await work();
  const response = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
  await tx.idempotencyRecord.create({
    data: { companyId: actor.companyId, userId: actor.id, operation, key, payloadHash, response },
  });
  return result;
}
export async function lock(tx: Tx, scope: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope},0))`;
}
