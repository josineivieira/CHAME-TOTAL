import { Body, Controller, Get, Post, Req, Res, Param, Inject } from '@nestjs/common';
import { z } from 'zod';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { Database } from '../../common/db';
import { AuthRequest, Public, EnrollmentAllowed } from '../../common/security';
import { config } from '../../common/config';
const password = z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/);
@Controller('auth')
@EnrollmentAllowed()
export class AuthController {
  constructor(
    @Inject(AuthService) private auth: AuthService,
    @Inject(Database) private db: Database,
  ) {}
  @Post('login') @Public() async login(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const d = z
      .object({
        email: z.email(),
        password: z.string().min(1).max(128),
        otp: z.string().max(30).optional(),
      })
      .strict()
      .parse(body);
    const result = await this.auth.login(d.email, d.password, d.otp, req.ip ?? 'unknown');
    res.cookie('ct_session', result.token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: config.SESSION_HOURS * 3600000,
    });
    return { csrfToken: result.csrfToken };
  }
  @Get('photo') photo(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.auth.profilePhoto(req.actor);
  }
  @Post('photo') savePhoto(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = z
      .object({
        image: z
          .string()
          .max(200000)
          .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/)
          .nullable(),
      })
      .strict()
      .parse(body);
    return this.auth.savePhoto(req.actor, data.image);
  }
  @Get('options') @Public() options() {
    return { passwordRecovery: !!config.SMTP_HOST && !!config.SMTP_FROM };
  }
  @Get('me') me(@Req() req: AuthRequest) {
    const { sessionId: _sessionId, ...user } = req.actor;
    return user;
  }
  @Post('logout') @Public() async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout((req.cookies as Record<string, unknown> | undefined)?.ct_session);
    res.clearCookie('ct_session', {
      path: '/',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    return { loggedOut: true };
  }
  @Post('mfa/setup') setup(@Req() req: AuthRequest) {
    return this.auth.setupMfa(req.actor);
  }
  @Post('mfa/enable') enable(@Body() body: unknown, @Req() req: AuthRequest) {
    return this.auth.enableMfa(
      req.actor,
      z
        .object({ code: z.string().regex(/^\d{6}$/) })
        .strict()
        .parse(body).code,
    );
  }
  @Post('forgot-password') @Public() forgot(@Body() body: unknown, @Req() req: AuthRequest) {
    return this.auth.requestReset(
      z.object({ email: z.email() }).strict().parse(body).email,
      req.ip ?? 'unknown',
    );
  }
  @Post('reset-password') @Public() async reset(@Body() body: unknown, @Req() req: AuthRequest) {
    await this.auth.throttle('reset-use:' + (req.ip ?? 'unknown'), 10);
    const d = z
      .object({ token: z.string().length(64), password })
      .strict()
      .parse(body);
    return this.auth.reset(d.token, d.password);
  }
  @Get('sessions') sessions(@Req() req: AuthRequest) {
    return this.db.session.findMany({
      where: { userId: req.actor.id },
      select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true },
    });
  }
  @Post('sessions/:id/revoke') revoke(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.auth.revoke(req.actor, z.uuid().parse(id));
  }
}
