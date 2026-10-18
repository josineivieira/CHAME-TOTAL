import {
  customerSchema,
  employeeSchema,
  productSchema,
  supplierSchema,
  categorySchema,
} from '@chame/shared';
import type { ZodType } from 'zod';
import { brl } from '../../utilities/format';
import type { Col } from '../../components/ui';
export type Field = {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'date' | 'decimal' | 'checkbox' | 'textarea' | 'select';
  options?: { value: string; label: string }[];
  resource?: string;
  required?: boolean;
  section?: string;
};
export type EntityConfig = {
  title: string;
  singular: string;
  read: string;
  write: string;
  schema: ZodType;
  fields: Field[];
  columns: Col[];
  defaults: Record<string, unknown>;
};
const active: Field = {
  name: 'active',
  label: 'Cadastro ativo',
  type: 'checkbox',
  section: 'Situação',
};
const basic: Col[] = [
  { key: 'code', label: 'Código' },
  { key: 'name', label: 'Nome' },
  { key: 'active', label: 'Ativo' },
];
export const entities: Record<string, EntityConfig> = {
  customers: {
    title: 'Clientes',
    singular: 'Cliente',
    read: 'customers.read',
    write: 'customers.manage',
    schema: customerSchema,
    defaults: { active: true },
    columns: [...basic, { key: 'phone', label: 'Telefone' }, { key: 'email', label: 'Email' }],
    fields: [
      { name: 'name', label: 'Nome completo', required: true, section: 'Identificação' },
      { name: 'cpf', label: 'CPF (opcional)' },
      { name: 'birthDate', label: 'Nascimento', type: 'date' },
      { name: 'phone', label: 'Telefone' },
      { name: 'whatsapp', label: 'WhatsApp' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'address', label: 'Endereço', section: 'Endereço' },
      { name: 'city', label: 'Cidade' },
      { name: 'state', label: 'UF' },
      { name: 'postalCode', label: 'CEP' },
      { name: 'notes', label: 'Observações', type: 'textarea', section: 'Complementos' },
      active,
    ],
  },
  employees: {
    title: 'Colaboradoras e vendedoras',
    singular: 'Colaboradora',
    read: 'employees.read',
    write: 'employees.manage',
    schema: employeeSchema,
    defaults: { active: true, commissionPercent: '0', jobTitle: 'Vendedora' },
    columns: [
      ...basic,
      { key: 'jobTitle', label: 'Cargo' },
      { key: 'commissionPercent', label: 'Comissão (%)' },
    ],
    fields: [
      { name: 'name', label: 'Nome completo', required: true, section: 'Identificação' },
      { name: 'phone', label: 'Telefone' },
      { name: 'jobTitle', label: 'Cargo' },
      { name: 'hiredAt', label: 'Admissão', type: 'date' },
      {
        name: 'commissionPercent',
        label: 'Comissão percentual',
        type: 'decimal',
        section: 'Regra comercial',
      },
      active,
    ],
  },
  products: {
    title: 'Produtos',
    singular: 'Produto',
    read: 'products.read',
    write: 'products.manage',
    schema: productSchema,
    defaults: {
      active: true,
      cost: '0',
      price: '0',
      minStock: '0',
      unit: 'UN',
      variantAttributes: {},
    },
    columns: [
      { key: 'sku', label: 'SKU' },
      { key: 'name', label: 'Produto' },
      { key: 'brand', label: 'Marca' },
      { key: 'price', label: 'Preço', render: (r) => brl(r.price) },
      { key: 'cost', label: 'Custo', render: (r) => brl(r.cost) },
      { key: 'stock', label: 'Estoque', sortable: false },
      { key: 'active', label: 'Ativo' },
    ],
    fields: [
      { name: 'name', label: 'Nome do produto', required: true, section: 'Identificação' },
      { name: 'sku', label: 'SKU', required: true },
      { name: 'barcode', label: 'Código de barras' },
      { name: 'brand', label: 'Marca' },
      { name: 'categoryId', label: 'Categoria', type: 'select', resource: 'categories' },
      { name: 'supplierId', label: 'Fornecedor', type: 'select', resource: 'suppliers' },
      {
        name: 'unit',
        label: 'Unidade',
        type: 'select',
        options: ['UN', 'KG', 'M', 'L'].map((value) => ({ value, label: value })),
      },
      {
        name: 'cost',
        label: 'Preço de custo',
        type: 'decimal',
        required: true,
        section: 'Valores e reposição',
      },
      { name: 'price', label: 'Preço de venda', type: 'decimal', required: true },
      { name: 'minStock', label: 'Estoque mínimo', type: 'decimal' },
      { name: 'description', label: 'Descrição', type: 'textarea', section: 'Complementos' },
      active,
    ],
  },
  suppliers: {
    title: 'Fornecedores',
    singular: 'Fornecedor',
    read: 'purchases.read',
    write: 'purchases.manage',
    schema: supplierSchema,
    defaults: { active: true },
    columns: [
      ...basic,
      { key: 'document', label: 'CPF / CNPJ' },
      { key: 'contact', label: 'Contato' },
    ],
    fields: [
      { name: 'name', label: 'Nome / razão social', required: true, section: 'Identificação' },
      { name: 'document', label: 'CPF / CNPJ' },
      { name: 'contact', label: 'Contato' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'address', label: 'Endereço', section: 'Endereço' },
      { name: 'notes', label: 'Observações', type: 'textarea', section: 'Complementos' },
      active,
    ],
  },
  categories: {
    title: 'Categorias',
    singular: 'Categoria',
    read: 'products.read',
    write: 'products.manage',
    schema: categorySchema,
    defaults: { active: true },
    columns: [
      { key: 'name', label: 'Categoria' },
      { key: 'active', label: 'Ativa' },
    ],
    fields: [
      { name: 'name', label: 'Nome da categoria', required: true, section: 'Identificação' },
      active,
    ],
  },
};
