import { Controller, Post, Body, Param, Req, Inject } from '@nestjs/common';
import { AuthRequest, Require } from '../../common/security';
import { CompanyPaymentsService } from './company-payments.service';
@Controller('company-payments')
export class CompanyPaymentsController {
  constructor(@Inject(CompanyPaymentsService) private service: CompanyPaymentsService) {}
  @Post('finance/:id') @Require('finance.manage') finance(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.settleFinance(r.actor, id, body, r.header('idempotency-key'));
  }
  @Post('commissions') @Require('commissions.manage') commissions(
    @Req() r: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.settleCommission(r.actor, body, r.header('idempotency-key'));
  }
  @Post('finance/:id/classify') @Require('finance.manage') classify(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.classify(r.actor, id, body, r.header('idempotency-key'));
  }
}
