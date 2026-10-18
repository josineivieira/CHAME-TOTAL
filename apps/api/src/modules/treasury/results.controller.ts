import { Controller, Get, Query, Req, Inject } from '@nestjs/common';
import { AuthRequest, Require } from '../../common/security';
import { ResultsService } from './results.service';
@Controller('treasury/results')
@Require('treasury.read')
export class ResultsController {
  constructor(@Inject(ResultsService) private service: ResultsService) {}
  @Get() get(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.overview(r.actor, q);
  }
}
