import { Body, Controller, Get, Post, Req, Inject, Res } from '@nestjs/common';
import { z } from 'zod';
import type { Response } from 'express';
import { money } from '@chame/shared';
import { AuthRequest, Require } from '../../common/security';
import { Database } from '../../common/db';
import { CashService } from './cash.service';
@Controller('cash-registers')
@Require('cash.read')
export class CashController {
  constructor(
    @Inject(CashService) private service: CashService,
    @Inject(Database) private db: Database,
  ) {}
  @Get('current') async current(@Req() r: AuthRequest, @Res() response: Response) {
    // Nest sends an empty response for null; the client contract requires JSON null.
    return response.json(await this.service.current(r.actor));
  }
  @Get() history(@Req() r: AuthRequest) {
    return this.db.cashSession.findMany({
      where: { companyId: r.actor.companyId, storeId: r.actor.storeId },
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
  }
  @Post('open') @Require('cash.manage') open(@Req() r: AuthRequest, @Body() body: unknown) {
    return this.service.open(
      r.actor,
      z.object({ amount: money }).strict().parse(body).amount,
      r.header('idempotency-key'),
    );
  }
  @Post('movements') @Require('cash.manage') movement(
    @Req() r: AuthRequest,
    @Body() body: unknown,
  ) {
    const d = z
      .object({
        amount: money.refine((v) => Number(v) > 0),
        type: z.enum(['SUPPLY', 'WITHDRAWAL']),
        reason: z.string().min(5).max(500),
      })
      .strict()
      .parse(body);
    return this.service.movement(r.actor, d.amount, d.type, d.reason, r.header('idempotency-key'));
  }
  @Post('close') @Require('cash.manage') close(@Req() r: AuthRequest, @Body() body: unknown) {
    const d = z
      .object({ countedAmount: money, justification: z.string().max(500).default('') })
      .strict()
      .parse(body);
    return this.service.close(
      r.actor,
      d.countedAmount,
      d.justification,
      r.header('idempotency-key'),
    );
  }
}
