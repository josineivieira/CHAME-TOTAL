import { recordActivity } from '../../common/record-activity';
import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  customerSchema,
  employeeSchema,
  productSchema,
  supplierSchema,
  categorySchema,
} from '@chame/shared';
import { Database, Tx } from '../../common/db';
import { Actor } from '../../common/security';
import { audit } from '../../common/operations';
export type Resource = 'customers' | 'employees' | 'products' | 'suppliers' | 'categories';
const models = {
  customers: 'customer',
  employees: 'employee',
  products: 'product',
  suppliers: 'supplier',
  categories: 'category',
} as const;
export const schemas = {
  customers: customerSchema,
  employees: employeeSchema,
  products: productSchema,
  suppliers: supplierSchema,
  categories: categorySchema,
};
type Row = { id: string; [key: string]: unknown };
interface Delegate {
  findMany(args: unknown): Promise<Row[]>;
  findFirst(args: unknown): Promise<Row | null>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<Row>;
  update(args: unknown): Promise<Row>;
}
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().max(160).default(''),
  sort: z
    .enum([
      'name',
      'createdAt',
      'code',
      'sku',
      'brand',
      'price',
      'cost',
      'active',
      'phone',
      'email',
      'jobTitle',
      'commissionPercent',
      'document',
      'contact',
    ])
    .default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  active: z.enum(['true', 'false', 'all']).default('all'),
});
@Injectable()
export class CatalogService {
  constructor(@Inject(Database) private db: Database) {}
  private repo(tx: Database | Tx, resource: Resource) {
    return tx[models[resource]] as unknown as Delegate;
  }
  async list(resource: Resource, actor: Actor, input: unknown) {
    const p = pageQuery.parse(input);
    const sortable: Record<Resource, string[]> = {
      customers: ['name', 'createdAt', 'code', 'active', 'phone', 'email'],
      employees: ['name', 'createdAt', 'code', 'active', 'jobTitle', 'commissionPercent'],
      products: ['name', 'createdAt', 'sku', 'brand', 'price', 'cost', 'active'],
      suppliers: ['name', 'createdAt', 'code', 'active', 'document', 'contact'],
      categories: ['name', 'createdAt', 'active'],
    };
    if (!sortable[resource].includes(p.sort))
      throw new BadRequestException('Ordenacao indisponivel para este cadastro.');
    const ownEmployee =
      resource === 'employees' &&
      !actor.permissions.some((p) =>
        ['employees.manage', 'sales.assign', 'commissions.manage'].includes(p),
      );
    const qFields = resource === 'products' ? ['name', 'sku', 'barcode'] : ['name'];
    const where = {
      companyId: actor.companyId,
      ...(ownEmployee ? { id: actor.employeeId ?? '00000000-0000-0000-0000-000000000000' } : {}),
      ...(p.active === 'all' ? {} : { active: p.active === 'true' }),
      ...(p.q
        ? { OR: qFields.map((field) => ({ [field]: { contains: p.q, mode: 'insensitive' } })) }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.repo(this.db, resource).findMany({
        where,
        orderBy: [{ [p.sort]: p.order }, { id: 'asc' }],
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      }),
      this.repo(this.db, resource).count({ where }),
    ]);
    if (resource === 'products') {
      const balances = await this.db.stockBalance.findMany({
        where: {
          companyId: actor.companyId,
          storeId: actor.storeId,
          productId: { in: data.map((r) => r.id) },
        },
      });
      return {
        data: data.map((p) => ({
          ...p,
          stock: balances.find((b) => b.productId === p.id)?.quantity.toString() ?? '0',
        })),
        pagination: { page: p.page, pageSize: p.pageSize, total },
      };
    }
    return { data, pagination: { page: p.page, pageSize: p.pageSize, total } };
  }
  async detail(resource: Resource, actor: Actor, id: string) {
    if (
      resource === 'employees' &&
      !actor.permissions.some((p) =>
        ['employees.manage', 'sales.assign', 'commissions.manage'].includes(p),
      ) &&
      id !== actor.employeeId
    )
      throw new NotFoundException('Registro nao encontrado.');
    const row = await this.repo(this.db, resource).findFirst({
      where: { id, companyId: actor.companyId },
    });
    if (!row) throw new NotFoundException('Registro nao encontrado.');
    return {
      ...row,
      activity: await recordActivity(this.db, actor.companyId, models[resource], id, undefined, [
        'create',
        'update',
      ]),
    };
  }
  async save(resource: Resource, actor: Actor, body: unknown, id?: string) {
    const parsed = schemas[resource].parse(body);
    const data: Record<string, unknown> = { ...parsed };
    for (const field of ['cpf', 'barcode']) if (data[field] === '') data[field] = null;
    for (const field of ['birthDate', 'hiredAt'])
      if (field in data) data[field] = data[field] ? new Date(String(data[field])) : null;
    return this.db.atomic(async (tx) => {
      const previous = id
        ? await this.repo(tx, resource).findFirst({ where: { id, companyId: actor.companyId } })
        : null;
      if (id && !previous) throw new NotFoundException('Registro nao encontrado.');
      if (resource === 'products') {
        if (
          previous &&
          data.unit !== previous.unit &&
          (await tx.stockMovement.findFirst({
            where: { companyId: actor.companyId, productId: previous.id },
            select: { id: true },
          }))
        )
          throw new BadRequestException(
            'Unidade de medida com historico nao pode ser alterada. Cadastre outro SKU.',
          );
        for (const [field, model] of [
          ['categoryId', 'category'],
          ['supplierId', 'supplier'],
        ] as const) {
          const target = data[field];
          if (target) {
            const where = { id: String(target), companyId: actor.companyId, active: true };
            const found =
              model === 'category'
                ? await tx.category.findFirst({ where })
                : await tx.supplier.findFirst({ where });
            if (!found) throw new BadRequestException('Categoria/fornecedor invalido.');
          }
        }
      }
      const row = id
        ? await this.repo(tx, resource).update({ where: { id, companyId: actor.companyId }, data })
        : await this.repo(tx, resource).create({ data: { ...data, companyId: actor.companyId } });
      await audit(tx, actor, id ? 'update' : 'create', models[resource], row.id, {
        fields: Object.keys(data),
        ...(resource === 'products'
          ? {
              previous: previous
                ? { price: String(previous.price), cost: String(previous.cost) }
                : null,
              next: { price: String(row.price), cost: String(row.cost) },
            }
          : {}),
        ...(resource === 'employees'
          ? {
              previous: previous ? { commissionPercent: String(previous.commissionPercent) } : null,
              next: { commissionPercent: String(row.commissionPercent) },
            }
          : {}),
      });
      return row;
    });
  }
}
