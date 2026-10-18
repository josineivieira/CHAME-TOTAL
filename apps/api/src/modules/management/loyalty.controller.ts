import { Body, Controller, Get, Post, Param, Req, Inject } from '@nestjs/common';
import { AuthRequest, Require } from '../../common/security';
import { LoyaltyService } from './loyalty.service';
@Controller('loyalty')
@Require('loyalty.read')
export class LoyaltyController {
  constructor(@Inject(LoyaltyService) private service: LoyaltyService) {}
  @Get() async list(@Req() r: AuthRequest) {
    return this.service.list(r.actor);
  }
  @Get(':id/history') history(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.history(r.actor, id);
  }
  @Post('adjust') @Require('loyalty.manage') adjust(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.adjust(r.actor, b, r.header('idempotency-key'));
  }
}
