import { Controller, Get, Query, Req, Inject } from '@nestjs/common';
import { z } from 'zod';
import { Database } from '../../common/db';
import { AuthRequest, Require } from '../../common/security';

@Controller('audit-logs')
@Require('audit.read')
export class AuditController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async list(@Req() r: AuthRequest, @Query() query: unknown) {
    const p = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        q: z.string().default(''),
      })
      .parse(query);
    const where = {
      companyId: r.actor.companyId,
      ...(p.q ? { action: { contains: p.q, mode: 'insensitive' as const } } : {}),
    };
    const [data, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.auditLog.count({ where }),
    ]);
    return { data, pagination: { page: p.page, pageSize: p.pageSize, total } };
  }
}
