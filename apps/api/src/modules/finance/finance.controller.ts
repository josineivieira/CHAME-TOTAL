import { ApiInput } from '../../common/openapi';
import { Body, Controller, Get, Post, Param, Query, Req, Inject } from '@nestjs/common';
import { financeSchema } from '@chame/shared';
import { AuthRequest, Require } from '../../common/security';
import { FinanceService } from './finance.service';
@Controller('finance')
@Require('finance.read')
export class FinanceController {
  constructor(@Inject(FinanceService) private service: FinanceService) {}
  @Get() async list(@Req() r: AuthRequest, @Query() query: unknown) {
    return this.service.list(r.actor, query);
  }
  @Get(':id') async detail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.detail(r.actor, id);
  }
  @ApiInput(financeSchema)
  @Post()
  @Require('finance.manage')
  create(@Req() r: AuthRequest, @Body() body: unknown) {
    return this.service.create(r.actor, body, r.header('idempotency-key'));
  }
  @Post(':id/settle') @Require('finance.manage') settle(
    @Req() r: AuthRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    return this.service.settle(r.actor, raw, body, r.header('idempotency-key'));
  }
}
