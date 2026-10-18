import { ConflictException, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { hashPassword } from '../../common/passwords';
import { permissions } from '@chame/shared';
import { Database } from '../../common/db';
import { config } from '../../common/config';
import { lock } from '../../common/operations';
import { profiles } from './profiles';
export const bootstrapSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    email: z.email(),
    password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/),
  })
  .strict();
export async function createFirstAdmin(db: Database, input: unknown) {
  const d = bootstrapSchema.parse(input);
  if (!config.MFA_ENCRYPTION_KEY)
    throw new BadRequestException('Configuracao de seguranca pendente no servidor.');
  const passwordHash = await hashPassword(d.password);
  return db.atomic(async (tx) => {
    await lock(tx, 'chame-total:first-admin');
    if (await tx.user.count()) throw new ConflictException('Administrador inicial ja criado.');
    const company = await tx.company.create({ data: { name: 'CHAME TOTAL' } });
    const store = await tx.store.create({
      data: { companyId: company.id, name: 'Loja principal' },
    });
    await tx.setting.create({ data: { companyId: company.id } });
    await tx.permission.createMany({
      data: permissions.map((key) => ({ key })),
      skipDuplicates: true,
    });
    let adminRoleId = '';
    for (const [name, keys] of Object.entries(profiles)) {
      const role = await tx.role.create({ data: { companyId: company.id, name } });
      await tx.rolePermission.createMany({
        data: keys.map((permissionKey) => ({ roleId: role.id, permissionKey })),
      });
      if (name === 'ADMINISTRADOR') adminRoleId = role.id;
    }
    const user = await tx.user.create({
      data: {
        companyId: company.id,
        storeId: store.id,
        name: d.name,
        email: d.email.toLowerCase(),
        passwordHash,
        mfaRequired: true,
      },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: adminRoleId } });
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: user.id,
        action: 'bootstrap.admin',
        entity: 'User',
        entityId: user.id,
      },
    });
    return { companyId: company.id, userId: user.id };
  });
}
