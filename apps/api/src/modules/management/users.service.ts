import { Injectable } from '@nestjs/common';
import { Inject, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { permissions } from '@chame/shared';
import { hashPassword } from '../../common/passwords';
import { Database } from '../../common/db';
import { audit } from '../../common/operations';
import type { Actor } from '../../common/security';

export const userSchema = z
  .object({
    name: z.string().min(2).max(160),
    email: z.email(),
    password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/).optional(),
    roleIds: z.array(z.uuid()).min(1).max(10),
    employeeId: z.uuid().nullable().default(null),
    active: z.boolean().default(true),
  })
  .strict();
@Injectable()
export class UsersService {
  constructor(@Inject(Database) private db: Database) {}
  async list(r: Actor) {
    const users = await this.db.user.findMany({
      where: { companyId: r.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        employeeId: true,
        mfaRequired: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
    const assignments = await this.db.userRole.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    return users.map((u) => ({
      ...u,
      roleIds: assignments.filter((a) => a.userId === u.id).map((a) => a.roleId),
    }));
  }
  async roles(r: Actor) {
    const roles = await this.db.role.findMany({
      where: { companyId: r.companyId },
      orderBy: { name: 'asc' },
    });
    const keys = await this.db.rolePermission.findMany({
      where: { roleId: { in: roles.map((x) => x.id) } },
    });
    return roles.map((x) => ({
      ...x,
      permissions: keys.filter((p) => p.roleId === x.id).map((p) => p.permissionKey),
    }));
  }
  create(r: Actor, b: unknown) {
    return this.save(r, b);
  }
  update(r: Actor, b: unknown, id: string) {
    return this.save(r, b, z.uuid().parse(id));
  }
  private async save(r: Actor, b: unknown, id?: string) {
    const d = userSchema.parse(b);
    if (!id && !d.password) throw new BadRequestException('Senha inicial necessaria.');
    if (id === r.id)
      throw new ForbiddenException('Seu proprio perfil deve ser alterado por outro administrador.');
    const passwordHash = d.password ? await hashPassword(d.password) : undefined;
    return this.db.atomic(async (tx) => {
      const roles = await tx.role.findMany({
        where: { id: { in: d.roleIds }, companyId: r.companyId },
      });
      if (roles.length !== d.roleIds.length) throw new BadRequestException('Perfis invalidos.');
      if (
        d.employeeId &&
        !(await tx.employee.findFirst({
          where: { companyId: r.companyId, id: d.employeeId, active: true },
        }))
      )
        throw new BadRequestException('Colaboradora invalida.');
      if (id && !(await tx.user.findFirst({ where: { id, companyId: r.companyId } })))
        throw new NotFoundException('Usuario nao encontrado.');
      const previousRoles = id ? await tx.userRole.findMany({ where: { userId: id } }) : [];
      const roleKeys = await tx.rolePermission.findMany({ where: { roleId: { in: d.roleIds } } });
      if (roleKeys.some((k) => !r.permissions.includes(k.permissionKey)))
        throw new ForbiddenException('Voce nao pode conceder permissoes que nao possui.');
      const previousKeys = await tx.rolePermission.findMany({
        where: { roleId: { in: previousRoles.map((r) => r.roleId) } },
      });
      if (previousKeys.some((k) => !r.permissions.includes(k.permissionKey)))
        throw new ForbiddenException('Usuario com privilegios fora do seu escopo.');
      const mfaRequired =
        roles.some((role) => ['SUPERADMIN', 'ADMINISTRADOR', 'GERENTE'].includes(role.name)) ||
        roleKeys.some((k) => ['users.manage', 'settings.manage'].includes(k.permissionKey));
      const data = {
        name: d.name,
        email: d.email.toLowerCase(),
        active: d.active,
        employeeId: d.employeeId,
        mfaRequired,
        ...(passwordHash ? { passwordHash } : {}),
      };
      const user = id
        ? await tx.user.update({ where: { id }, data })
        : await tx.user.create({
            data: {
              ...data,
              passwordHash: passwordHash!,
              companyId: r.companyId,
              storeId: r.storeId,
            },
          });
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userRole.createMany({
        data: d.roleIds.map((roleId) => ({ userId: user.id, roleId })),
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await audit(tx, r, id ? 'users.update' : 'users.create', 'User', user.id, {
        active: d.active,
        roles: d.roleIds,
        previousRoles: previousRoles.map((r) => r.roleId),
      });
      return { id: user.id, name: user.name, email: user.email, active: user.active };
    });
  }
  revoke(r: Actor, id: string) {
    return this.db.atomic(async (tx) => {
      if (
        !(await tx.user.findFirst({
          where: { id: z.uuid().parse(id), companyId: r.companyId },
        }))
      )
        throw new NotFoundException();
      const result = await tx.session.deleteMany({ where: { userId: id } });
      await audit(tx, r, 'users.revoke', 'User', id);
      return result;
    });
  }
  role(r: Actor, b: unknown) {
    const d = z
      .object({
        name: z.string().min(2).max(60),
        permissions: z.array(z.enum(permissions)).max(100),
      })
      .strict()
      .parse(b);
    if (d.permissions.some((p) => !r.permissions.includes(p)))
      throw new ForbiddenException('Voce nao pode conceder permissoes que nao possui.');
    return this.db.atomic(async (tx) => {
      const role = await tx.role.create({ data: { companyId: r.companyId, name: d.name } });
      await tx.rolePermission.createMany({
        data: [...new Set(d.permissions)].map((permissionKey) => ({
          roleId: role.id,
          permissionKey,
        })),
      });
      await audit(tx, r, 'roles.create', 'Role', role.id, { permissions: d.permissions });
      return role;
    });
  }
}
