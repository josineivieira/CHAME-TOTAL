import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
  HttpException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { hashPassword, verifyPassword } from '../../common/passwords';
const dummyHash = hashPassword(randomBytes(32).toString('hex'));
import sharp from 'sharp';
import * as OTPAuth from 'otpauth';
import nodemailer from 'nodemailer';
import { Database } from '../../common/db';
import { config } from '../../common/config';
import { Actor, hash } from '../../common/security';
import { audit } from '../../common/operations';
@Injectable()
export class AuthService {
  constructor(@Inject(Database) private db: Database) {}
  async profilePhoto(actor: Actor) {
    return this.db.user.findUniqueOrThrow({
      where: { id: actor.id, companyId: actor.companyId },
      select: { avatarData: true },
    });
  }
  async savePhoto(actor: Actor, image: string | null) {
    await this.throttle('profile-photo:' + actor.id, 20);
    let avatarData: string | null = null;
    if (image) {
      try {
        const bytes = Buffer.from(image.split(',')[1], 'base64');
        const pipeline = sharp(bytes, { limitInputPixels: 16000000, animated: false });
        const metadata = await pipeline.metadata();
        if (!['jpeg', 'png'].includes(metadata.format ?? ''))
          throw new Error('Formato de foto invalido.');
        const normalized = await pipeline
          .rotate()
          .resize(160, 160, { fit: 'cover' })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: 85 })
          .toBuffer();
        avatarData = 'data:image/jpeg;base64,' + normalized.toString('base64');
      } catch {
        throw new BadRequestException('Selecione uma foto JPEG ou PNG valida.');
      }
    }
    await this.db.atomic(async (tx) => {
      await tx.user.update({
        where: { id: actor.id, companyId: actor.companyId },
        data: { avatarData },
      });
      await audit(tx, actor, 'profile.photo.update', 'UserPhoto', actor.id, {
        photoPresent: !!avatarData,
      });
    });
    return { avatarData };
  }
  private encrypt(value: string) {
    if (!config.MFA_ENCRYPTION_KEY)
      throw new BadRequestException('Configure a chave de criptografia MFA no servidor.');
    const iv = randomBytes(12),
      c = createCipheriv('aes-256-gcm', Buffer.from(config.MFA_ENCRYPTION_KEY, 'hex'), iv);
    const encrypted = Buffer.concat([c.update(value, 'utf8'), c.final()]);
    return [iv, c.getAuthTag(), encrypted].map((x) => x.toString('hex')).join(':');
  }
  private decrypt(value: string) {
    if (!config.MFA_ENCRYPTION_KEY) throw new UnauthorizedException('MFA indisponivel.');
    const [iv, tag, data] = value.split(':');
    const d = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(config.MFA_ENCRYPTION_KEY, 'hex'),
      Buffer.from(iv, 'hex'),
    );
    d.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([d.update(Buffer.from(data, 'hex')), d.final()]).toString('utf8');
  }
  private totp(secret: string, email: string) {
    return new OTPAuth.TOTP({
      issuer: 'CHAME TOTAL',
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
  }
  async throttle(key: string, max = 10) {
    const id = hash(key);
    const now = new Date(),
      until = new Date(Date.now() + 15 * 60000);
    const rows = await this.db.$queryRaw<
      { count: number }[]
    >`INSERT INTO "LoginAttempt" ("key","count","expiresAt") VALUES (${id},1,${until}) ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "LoginAttempt"."expiresAt"<${now} THEN 1 ELSE "LoginAttempt"."count"+1 END,"expiresAt"=CASE WHEN "LoginAttempt"."expiresAt"<${now} THEN ${until} ELSE "LoginAttempt"."expiresAt" END RETURNING "count"`;
    if (rows[0].count > max) throw new HttpException('Muitas tentativas. Aguarde 15 minutos.', 429);
  }
  async login(email: string, password: string, otp: string | undefined, ip: string) {
    await this.throttle('ip:' + ip, 50);
    await this.throttle('login:' + email.toLowerCase(), 10);
    const user = await this.db.user.findUnique({ where: { email: email.toLowerCase() } });
    const verified = await verifyPassword(user?.passwordHash ?? (await dummyHash), password);
    if (!user?.active || !verified)
      throw new UnauthorizedException('Email, senha ou codigo invalidos.');
    let recoveryCodeHash: string | undefined;
    if (user.mfaSecret) {
      if (!otp) throw new UnauthorizedException('Informe o codigo de autenticacao.');
      const validOtp =
        /^\d{6}$/.test(otp) &&
        this.totp(this.decrypt(user.mfaSecret), user.email).validate({ token: otp, window: 1 }) !==
          null;
      if (!validOtp) recoveryCodeHash = hash(otp);
    }
    const token = randomBytes(32).toString('hex'),
      csrfToken = randomBytes(32).toString('hex');
    await this.db.atomic(async (tx) => {
      const current = await tx.user.updateMany({
        where: {
          id: user.id,
          active: true,
          passwordHash: user.passwordHash,
          mfaSecret: user.mfaSecret,
        },
        data: { lastLoginAt: new Date() },
      });
      if (!current.count)
        throw new UnauthorizedException('Credenciais alteradas. Entre novamente.');
      if (recoveryCodeHash) {
        const used = await tx.mfaRecoveryCode.updateMany({
          where: { userId: user.id, codeHash: recoveryCodeHash, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (!used.count) throw new UnauthorizedException('Email, senha ou codigo invalidos.');
      }
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: hash(token),
          csrfToken,
          expiresAt: new Date(Date.now() + config.SESSION_HOURS * 3600000),
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          action: 'auth.login',
          entity: 'User',
          entityId: user.id,
          details: {
            result: 'SUCCESS',
            origin: 'API',
            method: recoveryCodeHash ? 'MFA_RECOVERY' : user.mfaSecret ? 'TOTP' : 'PASSWORD',
          },
        },
      });
    });
    return { token, csrfToken };
  }
  async logout(token: unknown) {
    if (typeof token === 'string')
      await this.db.session.deleteMany({ where: { tokenHash: hash(token) } });
  }
  async setupMfa(actor: Actor) {
    await this.throttle('mfa-setup:' + actor.id, 10);
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    await this.db.user.update({
      where: { id: actor.id },
      data: { mfaPendingSecret: this.encrypt(secret) },
    });
    return { secret, uri: this.totp(secret, actor.email).toString() };
  }
  async enableMfa(actor: Actor, code: string) {
    await this.throttle('mfa-enable:' + actor.id, 10);
    return this.db.atomic(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
      if (
        !user.mfaPendingSecret ||
        this.totp(this.decrypt(user.mfaPendingSecret), user.email).validate({
          token: code,
          window: 1,
        }) === null
      )
        throw new BadRequestException('Codigo MFA invalido.');
      const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(12).toString('hex'));
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: actor.id } });
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((c) => ({ userId: actor.id, codeHash: hash(c) })),
      });
      await tx.user.update({
        where: { id: actor.id },
        data: { mfaSecret: user.mfaPendingSecret, mfaPendingSecret: null },
      });
      await tx.session.deleteMany({ where: { userId: actor.id, id: { not: actor.sessionId } } });
      await audit(tx, actor, 'auth.mfa.enable', 'User', actor.id);
      return { recoveryCodes };
    });
  }
  async requestReset(email: string, ip: string) {
    await this.throttle('reset:' + ip, 5);
    const response = { message: 'Se o email estiver cadastrado, voce recebera instrucoes.' };
    if (!config.SMTP_HOST || !config.SMTP_FROM)
      throw new ServiceUnavailableException(
        'Recuperacao por email indisponivel. Contate o administrador.',
      );
    const user = await this.db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user?.active) return response;
    const token = randomBytes(32).toString('hex');
    await this.db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 30 * 60000),
      },
    });
    const transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
    });
    try {
      await transport.sendMail({
        from: config.SMTP_FROM,
        to: user.email,
        subject: 'CHAME TOTAL - Recuperacao de acesso',
        text: `Abra ${config.APP_ORIGIN}/reset#token=${token}\nEste link expira em 30 minutos.`,
      });
    } catch {
      await this.db.passwordResetToken.deleteMany({ where: { tokenHash: hash(token) } });
    }
    return response;
  }
  async reset(token: string, password: string) {
    const passwordHash = await hashPassword(password);
    await this.db.atomic(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({ where: { tokenHash: hash(token) } });
      if (!record || record.usedAt || record.expiresAt < new Date())
        throw new BadRequestException('Link invalido ou expirado.');
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (!consumed.count) throw new BadRequestException('Link ja utilizado.');
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: record.userId } });
    });
    return { message: 'Senha atualizada. Entre novamente.' };
  }
  async revoke(actor: Actor, id: string) {
    const s = await this.db.session.findUnique({ where: { id } });
    if (!s || s.userId !== actor.id) throw new ForbiddenException('Sessao fora do seu escopo.');
    await this.db.session.delete({ where: { id } });
    return { revoked: true };
  }
}
