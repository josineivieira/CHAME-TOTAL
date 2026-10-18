import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './common/security';
import { Database } from './common/db';
@Controller('health')
@Public()
export class HealthController {
  constructor(@Inject(Database) private db: Database) {}
  @Get('live') live() {
    return { status: 'ok' };
  }
  @Get('ready') async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      await this.db.company.count();
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Servico temporariamente indisponivel.');
    }
  }
}
