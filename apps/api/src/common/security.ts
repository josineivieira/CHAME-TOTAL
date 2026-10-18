import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Database } from './db';
import type { AuthUser } from '@chame/shared';
export const Public = () => SetMetadata('public', true);
export const Require = (permission: string) => SetMetadata('permission', permission);
export const EnrollmentAllowed = () => SetMetadata('enrollment', true);
export type Actor = AuthUser & { sessionId: string };
export type AuthRequest = Request & { actor: Actor };
export const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export const equal = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Reflector) private reflector: Reflector,
  ) {}
  async authenticate(req: Request): Promise<Actor> {
    const token: unknown = (req.cookies as Record<string, unknown> | undefined)?.ct_session;
    if (typeof token !== 'string') throw new UnauthorizedException('Sessao necessaria.');
    const session = await this.db.session.findUnique({ where: { tokenHash: hash(token) } });
    if (
      !session ||
      session.expiresAt < new Date() ||
      session.lastSeenAt < new Date(Date.now() - 30 * 60 * 1000)
    )
      throw new UnauthorizedException('Sessao expirada.');
    const user = await this.db.user.findUnique({ where: { id: session.userId } });
    if (!user?.active) throw new UnauthorizedException('Acesso desativado.');
    const assignments = await this.db.userRole.findMany({ where: { userId: user.id } });
    const roles = await this.db.role.findMany({
      where: { id: { in: assignments.map((r) => r.roleId) }, companyId: user.companyId },
    });
    const keys = await this.db.rolePermission.findMany({
      where: { roleId: { in: roles.map((r) => r.id) } },
    });
    if (session.lastSeenAt < new Date(Date.now() - 60000))
      await this.db.session.updateMany({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      companyId: user.companyId,
      storeId: user.storeId,
      employeeId: user.employeeId,
      permissions: [...new Set(keys.map((p) => p.permissionKey))],
      csrfToken: session.csrfToken,
      mfaEnabled: !!user.mfaSecret,
      mfaRequired: user.mfaRequired,
      timezone:
        (
          await this.db.setting.findUnique({
            where: { companyId: user.companyId },
            select: { timezone: true },
          })
        )?.timezone ?? 'America/Sao_Paulo',
      sessionId: session.id,
    };
  }
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('public', targets)) return true;
    const req = context.switchToHttp().getRequest<AuthRequest>();
    req.actor = await this.authenticate(req);
    if (
      req.actor.mfaRequired &&
      !req.actor.mfaEnabled &&
      !this.reflector.getAllAndOverride<boolean>('enrollment', targets)
    )
      throw new ForbiddenException('Configure MFA antes de operar.');
    const permission = this.reflector.getAllAndOverride<string>('permission', targets);
    if (!permission && !this.reflector.getAllAndOverride<boolean>('enrollment', targets))
      throw new ForbiddenException('Operacao sem politica de acesso.');
    if (permission && !req.actor.permissions.includes(permission))
      throw new ForbiddenException('Perfil sem permissao para esta operacao.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrf = req.header('x-csrf-token');
      if (!csrf || !equal(csrf, req.actor.csrfToken))
        throw new ForbiddenException('Validacao CSRF falhou.');
    }
    return true;
  }
}
