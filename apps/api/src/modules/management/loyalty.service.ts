import { Injectable } from '@nestjs/common';
import { Inject, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { Database } from '../../common/db';
import { audit, idempotent, lock } from '../../common/operations';
import type { Actor } from '../../common/security';

@Injectable()
export class LoyaltyService {
  constructor(@Inject(Database) private db: Database) {}
  async list(r: Actor) {
    const groups = await this.db.loyaltyTransaction.groupBy({
      by: ['customerId'],
      where: { companyId: r.companyId },
      _sum: { points: true },
      take: 100,
      orderBy: { customerId: 'asc' },
    });
    const customers = await this.db.customer.findMany({
      where: { companyId: r.companyId, id: { in: groups.map((g) => g.customerId) } },
    });
    return groups.map((g) => ({
      id: g.customerId,
      name: customers.find((c) => c.id === g.customerId)?.name,
      points: g._sum.points ?? 0,
    }));
  }
  history(r: Actor, id: string) {
    return this.db.loyaltyTransaction.findMany({
      where: { companyId: r.companyId, customerId: z.uuid().parse(id) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  adjust(r: Actor, b: unknown, key: unknown) {
    const d = z
      .object({
        customerId: z.uuid(),
        points: z
          .number()
          .int()
          .min(-100000)
          .max(100000)
          .refine((v) => v !== 0),
        reason: z.string().min(5).max(500),
      })
      .strict()
      .parse(b);
    return this.db.atomic((tx) =>
      idempotent(tx, r, 'loyalty.adjust', key, d, async () => {
        if (
          !(await tx.customer.findFirst({
            where: { id: d.customerId, companyId: r.companyId },
          }))
        )
          throw new BadRequestException('Cliente invalido.');
        await lock(tx, 'loyalty:' + d.customerId);
        const total = await tx.loyaltyTransaction.aggregate({
          where: { companyId: r.companyId, customerId: d.customerId },
          _sum: { points: true },
        });
        if ((total._sum.points ?? 0) + d.points < 0)
          throw new BadRequestException('Saldo de pontos insuficiente.');
        const entry = await tx.loyaltyTransaction.create({
          data: { companyId: r.companyId, userId: r.id, ...d },
        });
        await audit(tx, r, 'loyalty.adjust', 'LoyaltyTransaction', entry.id, {
          points: d.points,
          reason: d.reason,
        });
        return entry;
      }),
    );
  }
}
