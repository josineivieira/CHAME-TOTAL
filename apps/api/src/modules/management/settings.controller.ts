import { recordActivity } from '../../common/record-activity';
import { ApiInput } from '../../common/openapi';

import { Body, Controller, Get, Put, Req, Inject } from '@nestjs/common';
import { settingsSchema } from '@chame/shared';
import { Database } from '../../common/db';
import { AuthRequest, Require } from '../../common/security';
import { audit } from '../../common/operations';

@Controller('settings')
@Require('settings.read')
export class SettingsController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async get(@Req() r: AuthRequest) {
    const setting = await this.db.setting.findUniqueOrThrow({
      where: { companyId: r.actor.companyId },
    });
    return {
      ...setting,
      activity: await recordActivity(this.db, r.actor.companyId, 'Setting', r.actor.companyId),
    };
  }
  @ApiInput(settingsSchema)
  @Put()
  @Require('settings.manage')
  save(@Req() r: AuthRequest, @Body() b: unknown) {
    const d = settingsSchema.parse(b);
    return this.db.atomic(async (tx) => {
      const before = await tx.setting.findUniqueOrThrow({
        where: { companyId: r.actor.companyId },
      });
      const setting = await tx.setting.update({ where: { companyId: r.actor.companyId }, data: d });
      await audit(tx, r.actor, 'settings.update', 'Setting', r.actor.companyId, {
        fields: Object.keys(d),
        previous: {
          timezone: before.timezone,
          maxDiscountPercent: before.maxDiscountPercent,
          loyaltyPointsPerReal: before.loyaltyPointsPerReal,
        },
        next: {
          timezone: setting.timezone,
          maxDiscountPercent: setting.maxDiscountPercent,
          loyaltyPointsPerReal: setting.loyaltyPointsPerReal,
        },
      });
      return setting;
    });
  }
}
