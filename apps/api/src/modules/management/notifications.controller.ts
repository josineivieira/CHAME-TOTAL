import { Controller, Get, Post, Param, Req, Inject } from '@nestjs/common';
import { z } from 'zod';
import { Database } from '../../common/db';
import { AuthRequest, Require } from '../../common/security';

@Controller('notifications')
@Require('notifications.read')
export class NotificationsController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() list(@Req() r: AuthRequest) {
    return this.db.notification.findMany({
      where: { companyId: r.actor.companyId, userId: r.actor.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Post(':id/read') read(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.db.notification.updateMany({
      where: { id: z.uuid().parse(id), companyId: r.actor.companyId, userId: r.actor.id },
      data: { readAt: new Date() },
    });
  }
}
