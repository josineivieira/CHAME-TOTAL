import { ApiInput } from '../../common/openapi';
import { Body, Controller, Get, Post, Query, Req, Inject } from '@nestjs/common';
import { goalSchema } from '@chame/shared';
import { AuthRequest, Require } from '../../common/security';
import { GoalsService } from './goals.service';
@Controller('sales-goals')
@Require('goals.read')
export class GoalsController {
  constructor(@Inject(GoalsService) private service: GoalsService) {}
  @Get() async list(@Req() r: AuthRequest, @Query('period') period?: string) {
    return this.service.list(r.actor, period);
  }
  @ApiInput(goalSchema)
  @Post()
  @Require('goals.manage')
  save(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.save(r.actor, b);
  }
}
