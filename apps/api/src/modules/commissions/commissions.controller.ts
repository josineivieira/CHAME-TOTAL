import { Controller, Get, Post, Req, Body, Inject } from '@nestjs/common';
import { AuthRequest, Require } from '../../common/security';
import { CommissionsService } from './commissions.service';
@Controller('commissions')
@Require('commissions.read')
export class CommissionsController {
  constructor(@Inject(CommissionsService) private service: CommissionsService) {}
  @Get() async list(@Req() r: AuthRequest) {
    return this.service.list(r.actor);
  }
  @Post('approve') @Require('commissions.manage') approve(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.service.approve(r.actor, b);
  }
  @Post('settle') @Require('commissions.manage') settle(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.settle(r.actor, b, r.header('idempotency-key'));
  }
}
