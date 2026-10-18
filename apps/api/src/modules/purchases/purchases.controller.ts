import { ApiInput } from '../../common/openapi';
import { purchaseSchema, receiveSchema } from '@chame/shared';
import { Body, Controller, Get, Post, Param, Query, Req, Inject } from '@nestjs/common';
import { z } from 'zod';
import { AuthRequest, Require } from '../../common/security';
import { Database } from '../../common/db';
import {
  purchaseIssueSchema,
  purchaseRefundSchema,
  resolvePurchaseIssueSchema,
  PurchasesService,
} from './purchases.service';
@Controller('purchases')
@Require('purchases.read')
export class PurchasesController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(PurchasesService) private service: PurchasesService,
  ) {}
  @Get() async list(@Req() r: AuthRequest, @Query() query: unknown) {
    const p = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(query);
    const where = { companyId: r.actor.companyId, storeId: r.actor.storeId };
    const [data, total] = await Promise.all([
      this.db.purchaseOrder.findMany({
        where,
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.purchaseOrder.count({ where }),
    ]);
    return { data, pagination: { page: p.page, pageSize: p.pageSize, total } };
  }
  @Get(':id') detail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.detail(r.actor, z.uuid().parse(id));
  }
  @ApiInput(purchaseSchema)
  @Post()
  @Require('purchases.manage')
  create(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.create(r.actor, b, r.header('idempotency-key'));
  }
  @ApiInput(receiveSchema)
  @Post(':id/receive')
  @Require('purchases.manage')
  receive(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.receive(r.actor, z.uuid().parse(id), b, r.header('idempotency-key'));
  }

  @ApiInput(purchaseIssueSchema)
  @Post(':id/issues')
  @Require('purchases.manage')
  issue(@Req() r: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.recordIssue(r.actor, z.uuid().parse(id), body, r.header('idempotency-key'));
  }
  @ApiInput(resolvePurchaseIssueSchema)
  @Post(':id/issues/:issueId/resolve')
  @Require('purchases.manage')
  resolve(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Param('issueId') issueId: string,
    @Body() body: unknown,
  ) {
    return this.service.resolveIssue(
      r.actor,
      z.uuid().parse(id),
      z.uuid().parse(issueId),
      body,
      r.header('idempotency-key'),
    );
  }

  @ApiInput(purchaseRefundSchema)
  @Post(':id/issues/:issueId/refund')
  @Require('purchases.manage')
  refund(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Param('issueId') issueId: string,
    @Body() body: unknown,
  ) {
    return this.service.confirmRefund(
      r.actor,
      z.uuid().parse(id),
      z.uuid().parse(issueId),
      body,
      r.header('idempotency-key'),
    );
  }
}
