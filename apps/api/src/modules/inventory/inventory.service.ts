import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { z } from 'zod';
import { Decimal, stockSchema } from '@chame/shared';
import { Database } from '../../common/db';
import { audit, idempotent } from '../../common/operations';
import { moveStock } from './stock';
import type { Actor } from '../../common/security';

@Injectable()
export class InventoryService {
  constructor(@Inject(Database) private db: Database) {}
  async balances(req: Actor, query: unknown) {
    const p = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        q: z.string().default(''),
      })
      .parse(query);
    const where = {
      companyId: req.companyId,
      active: true,
      ...(p.q ? { name: { contains: p.q, mode: 'insensitive' as const } } : {}),
    };
    const [products, total] = await Promise.all([
      this.db.product.findMany({
        where,
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
        orderBy: { name: 'asc' },
      }),
      this.db.product.count({ where }),
    ]);
    const balances = await this.db.stockBalance.findMany({
      where: {
        companyId: req.companyId,
        storeId: req.storeId,
        productId: { in: products.map((p) => p.id) },
      },
    });
    return {
      data: products.map((p) => {
        const b = balances.find((b) => b.productId === p.id);
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          quantity: b?.quantity.toString() ?? '0',
          reserved: b?.reserved.toString() ?? '0',
          available: new Decimal(b?.quantity.toString() ?? 0)
            .minus(b?.reserved.toString() ?? 0)
            .toString(),
          minStock: p.minStock.toString(),
          critical: new Decimal(b?.quantity.toString() ?? 0).lte(p.minStock.toString()),
        };
      }),
      pagination: { page: p.page, pageSize: p.pageSize, total },
    };
  }
  async movements(req: Actor, query: unknown) {
    const p = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        productId: z.uuid().optional(),
      })
      .parse(query);
    const where = {
      companyId: req.companyId,
      storeId: req.storeId,
      ...(p.productId ? { productId: p.productId } : {}),
    };
    const [data, total] = await Promise.all([
      this.db.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      }),
      this.db.stockMovement.count({ where }),
    ]);
    return { data, pagination: { page: p.page, pageSize: p.pageSize, total } };
  }
  adjust(req: Actor, body: unknown, key: unknown) {
    const d = stockSchema.parse(body);
    return this.db.atomic((tx) =>
      idempotent(tx, req, 'stock.adjust', key, d, async () => {
        await moveStock(tx, req, d.productId, new Decimal(d.quantity), 'ADJUSTMENT', d.reason);
        await audit(tx, req, 'inventory.adjust', 'Product', d.productId, {
          quantity: d.quantity,
          reason: d.reason,
        });
        return { adjusted: true };
      }),
    );
  }
}
