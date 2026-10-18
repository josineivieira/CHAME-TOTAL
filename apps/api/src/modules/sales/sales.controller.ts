import { ApiInput } from '../../common/openapi';
import { saleSchema, returnSchema } from '@chame/shared';
import { Body, Controller, Get, Post, Param, Query, Req, Inject } from '@nestjs/common';
import { z } from 'zod';
import { AuthRequest, Require } from '../../common/security';
import { SalesService } from './sales.service';
@Controller('sales')
@Require('sales.read')
export class SalesController {
  constructor(@Inject(SalesService) private sales: SalesService) {}
  @Get() list(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.sales.list(r.actor, q);
  }
  @Get('quotations') quotes(@Req() r: AuthRequest) {
    return this.sales.quotations(r.actor);
  }
  @Post('quotations') @Require('sales.create') quote(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.sales.quote(r.actor, b, r.header('idempotency-key'));
  }
  @Get(':id') detail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.sales.detail(r.actor, z.uuid().parse(id));
  }
  @ApiInput(saleSchema)
  @Post()
  @Require('sales.create')
  create(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.sales.create(r.actor, b, r.header('idempotency-key'));
  }
  @Post(':id/cancel') @Require('sales.cancel') cancel(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const d = z
      .object({ reason: z.string().trim().min(5).max(500) })
      .strict()
      .parse(b);
    return this.sales.cancel(r.actor, z.uuid().parse(id), d.reason, r.header('idempotency-key'));
  }
  @ApiInput(returnSchema)
  @Post(':id/returns')
  @Require('sales.return')
  returns(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.sales.returnItems(r.actor, z.uuid().parse(id), b, r.header('idempotency-key'));
  }
  @Post('quotations/:id/convert') @Require('sales.create') convert(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.sales.create(r.actor, b, r.header('idempotency-key'), z.uuid().parse(id));
  }
}
