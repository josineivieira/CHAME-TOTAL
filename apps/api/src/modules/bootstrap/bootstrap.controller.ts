import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Inject,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { Public, equal } from '../../common/security';
import { Database } from '../../common/db';
import { config } from '../../common/config';
import { AuthService } from '../auth/auth.service';
import { createFirstAdmin, bootstrapSchema } from './create-first-admin';
const loopback = (req: Request) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
@Controller('bootstrap')
@Public()
export class BootstrapController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(AuthService) private auth: AuthService,
  ) {}
  @Get('status') async status(@Req() req: Request) {
    const initialized = (await this.db.user.count()) > 0;
    const local = config.NODE_ENV === 'development' && loopback(req);
    return {
      initialized,
      enabled: !initialized && !!config.MFA_ENCRYPTION_KEY && (local || !!config.BOOTSTRAP_TOKEN),
      tokenRequired: !local,
    };
  }
  @Post() async create(@Req() req: Request, @Body() body: unknown) {
    await this.auth.throttle('bootstrap:' + (req.ip ?? 'unknown'), 5);
    if (await this.db.user.count()) throw new ConflictException('Preparacao inicial ja concluida.');
    const d = bootstrapSchema
      .extend({ token: z.string().max(200).optional() })
      .strict()
      .parse(body);
    const local = config.NODE_ENV === 'development' && loopback(req);
    if (!local && (!config.BOOTSTRAP_TOKEN || !d.token || !equal(config.BOOTSTRAP_TOKEN, d.token)))
      throw new ForbiddenException('Codigo de preparacao invalido.');
    return createFirstAdmin(this.db, { name: d.name, email: d.email, password: d.password });
  }
}
