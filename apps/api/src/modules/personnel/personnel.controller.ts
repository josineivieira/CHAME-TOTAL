import { Controller, Get, Post, Body, Param, Query, Req, Inject } from '@nestjs/common';
import { AuthRequest, Require } from '../../common/security';
import { PersonnelService } from './personnel.service';
import { CompanyPaymentsService } from '../company-payments/company-payments.service';
@Controller('personnel-payments')
@Require('payroll.read')
export class PersonnelController {
  constructor(
    @Inject(PersonnelService) private service: PersonnelService,
    @Inject(CompanyPaymentsService) private payments: CompanyPaymentsService,
  ) {}
  @Get() list(@Req() r: AuthRequest, @Query() query: unknown) {
    return this.service.list(r.actor, query);
  }
  @Get(':id') detail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.detail(r.actor, id);
  }
  @Post() @Require('payroll.manage') create(@Req() r: AuthRequest, @Body() body: unknown) {
    return this.service.create(r.actor, body, r.header('idempotency-key'));
  }
  @Post(':id/cancel') @Require('payroll.manage') cancel(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.cancel(r.actor, id, body, r.header('idempotency-key'));
  }
  @Post(':id/pay') @Require('payroll.manage') async pay(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.service.detail(r.actor, id);
    return this.payments.settleFinance(r.actor, id, body, r.header('idempotency-key'));
  }
}
