import { ApiInput } from '../../common/openapi';
import { Body, Controller, Get, Post, Query, Req, Inject } from '@nestjs/common';
import { stockSchema } from '@chame/shared';
import { AuthRequest, Require } from '../../common/security';
import { InventoryService } from './inventory.service';
@Controller('inventory')
@Require('inventory.read')
export class InventoryController {
  constructor(@Inject(InventoryService) private service: InventoryService) {}
  @Get() async balances(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.service.balances(req.actor, query);
  }
  @Get('movements') async movements(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.service.movements(req.actor, query);
  }
  @ApiInput(stockSchema)
  @Post('adjust')
  @Require('inventory.adjust')
  adjust(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.adjust(req.actor, body, req.header('idempotency-key'));
  }
}
