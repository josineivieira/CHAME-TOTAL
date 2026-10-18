import { Body, Controller, Get, Post, Param, Query, Req, Inject } from '@nestjs/common';
import { AuthRequest, Require } from '../../common/security';
import { TreasuryService } from './treasury.service';
@Controller('treasury')
@Require('treasury.read')
export class TreasuryController {
  constructor(@Inject(TreasuryService) private service: TreasuryService) {}
  @Get() overview(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.service.overview(req.actor, query);
  }
  @Post('initialize') @Require('treasury.manage') initialize(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.initialize(req.actor, body, req.header('idempotency-key'));
  }
  @Post('entries') @Require('treasury.manage') create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.create(req.actor, body, req.header('idempotency-key'));
  }
  @Post('entries/:id/reverse') @Require('treasury.manage') reverse(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.reverse(req.actor, id, body, req.header('idempotency-key'));
  }
}
