import { Controller, Get, Param, Req, Inject, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Decimal } from '@chame/shared';
import { Database } from '../../common/db';
import { AuthRequest, Require } from '../../common/security';
import { salesScope } from '../sales/sales.service';
@Controller('customers')
@Require('customers.read')
export class CustomerHistoryController {
  constructor(@Inject(Database) private db: Database) {}
  @Get(':id/history') async history(@Req() r: AuthRequest, @Param('id') raw: string) {
    const id = z.uuid().parse(raw);
    if (!(await this.db.customer.findFirst({ where: { id, companyId: r.actor.companyId } })))
      throw new NotFoundException('Cliente nao encontrado.');
    const where = { ...salesScope(r.actor), customerId: id, status: 'CONFIRMED' };
    const [sums, sales, last] = await Promise.all([
      this.db.sale.aggregate({
        where,
        _sum: { total: true, returnedTotal: true },
        _count: { id: true },
      }),
      this.db.sale.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.db.sale.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    const net = new Decimal(sums._sum.total?.toString() ?? 0).minus(
      sums._sum.returnedTotal?.toString() ?? 0,
    );
    return {
      totalSpent: net.toFixed(2),
      saleCount: sums._count.id,
      averageTicket: sums._count.id ? net.div(sums._count.id).toFixed(2) : '0.00',
      lastPurchase: last?.createdAt ?? null,
      sales,
    };
  }
}
