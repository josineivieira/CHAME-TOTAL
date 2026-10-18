import { z } from 'zod';
z.config(z.locales.pt());
export { Decimal } from 'decimal.js';
export const permissions = [
  'dashboard.read',
  'customers.read',
  'customers.manage',
  'employees.read',
  'employees.manage',
  'products.read',
  'products.manage',
  'inventory.read',
  'inventory.adjust',
  'sales.read',
  'sales.create',
  'sales.cancel',
  'sales.return',
  'sales.discount',
  'sales.assign',
  'cash.read',
  'cash.manage',
  'finance.read',
  'finance.manage',
  'payroll.read',
  'payroll.manage',
  'treasury.read',
  'treasury.manage',
  'purchases.read',
  'purchases.manage',
  'goals.read',
  'goals.manage',
  'commissions.read',
  'commissions.manage',
  'reports.read',
  'reports.export',
  'settings.read',
  'settings.manage',
  'users.manage',
  'audit.read',
  'notifications.read',
  'loyalty.read',
  'loyalty.manage',
] as const;
export type Permission = (typeof permissions)[number];
export const money = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Informe um valor decimal positivo com ate duas casas.');
export const quantity = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,3})?$/, 'Quantidade com ate tres casas.')
  .refine((v) => Number(v) > 0, 'Quantidade deve ser maior que zero.');
export const uuid = z.uuid();
export const cpfValid = (value: string): boolean => {
  const n = value.replace(/\D/g, '');
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  return [9, 10].every((len) => {
    const sum = [...n.slice(0, len)].reduce((a, c, i) => a + Number(c) * (len + 1 - i), 0);
    const digit = (sum * 10) % 11;
    return (digit === 10 ? 0 : digit) === Number(n[len]);
  });
};
const emptyOptional = z.string().trim().max(200).optional();
export const customerSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    cpf: z
      .string()
      .transform((v) => v.replace(/\D/g, ''))
      .refine((v) => !v || cpfValid(v), 'CPF invalido.')
      .optional(),
    phone: emptyOptional,
    whatsapp: emptyOptional,
    email: z.union([z.email(), z.literal('')]).optional(),
    birthDate: z.union([z.iso.date(), z.literal('')]).optional(),
    address: z.string().max(500).optional(),
    city: emptyOptional,
    state: z.string().max(2).optional(),
    postalCode: z.string().max(9).optional(),
    notes: z.string().max(2000).optional(),
    active: z.boolean().default(true),
  })
  .strict();
export const productSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    sku: z.string().trim().min(1).max(64),
    barcode: z.string().max(64).optional(),
    description: z.string().max(2000).optional(),
    categoryId: uuid.nullable().optional(),
    supplierId: uuid.nullable().optional(),
    brand: z.string().max(100).optional(),
    cost: money,
    price: money,
    minStock: z
      .string()
      .regex(/^\d+(\.\d{1,3})?$/)
      .default('0'),
    unit: z.enum(['UN', 'KG', 'M', 'L']).default('UN'),
    active: z.boolean().default(true),
    variantAttributes: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export const employeeSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    phone: emptyOptional,
    jobTitle: z.string().max(100).default('Vendedora'),
    commissionPercent: z
      .string()
      .regex(/^\d{1,2}(\.\d{1,4})?$|^100(\.0{1,4})?$/)
      .default('0'),
    hiredAt: z.union([z.iso.date(), z.literal('')]).optional(),
    active: z.boolean().default(true),
  })
  .strict();
export const supplierSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    document: z.string().max(18).optional(),
    contact: emptyOptional,
    email: z.union([z.email(), z.literal('')]).optional(),
    address: z.string().max(500).optional(),
    notes: z.string().max(2000).optional(),
    active: z.boolean().default(true),
  })
  .strict();
export const categorySchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    active: z.boolean().default(true),
  })
  .strict();
export const saleSchema = z
  .object({
    customerId: uuid.nullable().optional(),
    employeeId: uuid,
    items: z
      .array(z.object({ productId: uuid, quantity, discount: money.default('0') }).strict())
      .min(1)
      .max(100),
    discount: money.default('0'),
    payments: z
      .array(
        z
          .object({
            method: z.enum(['PIX', 'CASH', 'DEBIT', 'CREDIT', 'OTHER']),
            amount: money,
          })
          .strict(),
      )
      .min(1)
      .max(20),
    notes: z.string().max(1000).optional(),
  })
  .strict();
export const returnSchema = z
  .object({
    reason: z.string().trim().min(5).max(500),
    items: z
      .array(
        z
          .object({
            saleItemId: uuid,
            quantity,
            restock: z.boolean().default(true),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    refundMethod: z.enum(['PIX', 'CASH', 'DEBIT', 'CREDIT', 'OTHER']).default('CASH'),
  })
  .strict();
export const stockSchema = z
  .object({
    productId: uuid,
    quantity: z
      .string()
      .regex(/^-?\d{1,12}(\.\d{1,3})?$/)
      .refine((v) => Number(v) !== 0),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export const financeSchema = z
  .object({
    resultGroup:z.enum(['OPERATING','INVENTORY','CAPITAL','FINANCING']).default('OPERATING'),
    direction: z.enum(['IN', 'OUT']),
    description: z.string().trim().min(2).max(200),
    amount: money.refine((v) => Number(v) > 0),
    dueDate: z.iso.date(),
    category: z.string().max(100).default('Geral'),
    costCenter: z.string().max(100).default('Loja'),
    notes: z.string().max(1000).optional(),
  })
  .strict();
export const goalSchema = z
  .object({
    employeeId: uuid.nullable().optional(),
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    amount: money.refine((v) => Number(v) > 0),
  })
  .strict();
export const purchaseSchema = z
  .object({
    paymentMethod: z.enum(['CASH','PIX','DEBIT','CREDIT','BANK','OTHER']),
    supplierId: uuid,
    items: z
      .array(z.object({ productId: uuid, quantity, unitCost: money }).strict())
      .min(1)
      .max(100),
    dueDate: z.iso.date(),
    notes: z.string().max(1000).optional(),
  })
  .strict();
export const receiveSchema = z
  .object({
    items: z
      .array(z.object({ purchaseItemId: uuid, quantity }).strict())
      .min(1)
      .max(100),
  })
  .strict();
export const settingsSchema = z
  .object({
    companyName: z.string().trim().min(2).max(160),
    legalName: z.string().max(160).default(''),
    document: z.string().max(18).default(''),
    phone: z.string().max(30).default(''),
    email: z.union([z.email(), z.literal('')]).default(''),
    address: z.string().max(500).default(''),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, 'Fuso invalido.'),
    maxDiscountPercent: z.number().int().min(0).max(100).default(10),
    loyaltyPointsPerReal: z.number().int().min(0).max(100).default(1),
  })
  .strict();
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  companyId: string;
  storeId: string;
  employeeId: string | null;
  permissions: string[];
  csrfToken: string;
  mfaEnabled: boolean;
  mfaRequired: boolean;
  timezone: string;
};
