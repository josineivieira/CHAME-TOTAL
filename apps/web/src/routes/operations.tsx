import { PersonnelPage, PersonnelForm } from '../modules/personnel/PersonnelPage';
import { PersonnelDetail } from '../modules/personnel/PersonnelDetail';
import { StockAdjustment } from '../modules/inventory/StockAdjustment';
import { TreasuryPage } from '../modules/treasury/TreasuryPage';
import type { RouteObject } from 'react-router-dom';
import { Link, useParams } from 'react-router-dom';
import { can, useSession } from '../app/session';
import { Title, Badge } from '../components/ui';
import { ActionForm } from '../components/ActionForm';
import {
  RecordList,
  moneyCol,
  dateCol,
  notifyRead,
  approveCommission,
  settleCommission,
} from '../modules/operations/RecordList';
import { CashPage } from '../modules/cash/CashPage';
import { PDV } from '../modules/sales/PDV';
import { SaleDetail } from '../modules/sales/SaleDetail';
import { PurchaseForm, PurchaseDetail } from '../modules/purchases/PurchasePage';
import { GoalsPage } from '../modules/management/GoalsPage';
import { SettingsPage } from '../modules/admin/SettingsPage';
import { SecurityPage } from '../modules/admin/SecurityPage';
import { UserForm } from '../modules/admin/UserForm';
import { RoleForm } from '../modules/admin/RoleForm';
import { ReportsPage } from '../modules/reports/ReportsPage';
import { SettlementPage } from '../modules/finance/SettlementPage';
import type { ReactNode } from 'react';
export function Guard({ permission, children }: { permission: string; children: ReactNode }) {
  const user = useSession();
  return can(user, permission) ? (
    children
  ) : (
    <Title
      title="Acesso não permitido"
      subtitle="Seu perfil não possui permissão para esta operação."
    />
  );
}
const route = (path: string, permission: string, element: ReactNode): RouteObject => ({
  path,
  element: <Guard permission={permission}>{element}</Guard>,
});
function StockMovements() {
  const { id } = useParams();
  return (
    <RecordList
      title="Histórico de movimentações"
      endpoint={`inventory/movements?productId=${id}`}
      columns={[
        dateCol('createdAt', 'Data'),
        { key: 'type', label: 'Origem' },
        { key: 'quantity', label: 'Quantidade' },
        { key: 'reason', label: 'Motivo' },
      ]}
    />
  );
}
function LoyaltyHistory() {
  const { id } = useParams();
  return (
    <RecordList
      title="Histórico de pontos"
      endpoint={`loyalty/${id}/history`}
      paginated={false}
      columns={[
        dateCol('createdAt', 'Data'),
        { key: 'points', label: 'Pontos' },
        { key: 'reason', label: 'Motivo' },
      ]}
    />
  );
}
const financialFields = [
  {
    name: 'direction',
    label: 'Direção',
    type: 'select' as const,
    options: [
      { value: 'OUT', label: 'Conta a pagar' },
      { value: 'IN', label: 'Conta a receber' },
    ],
  },
  { name: 'description', label: 'Descrição', required: true },
  { name: 'amount', label: 'Valor', type: 'decimal' as const, required: true },
  { name: 'dueDate', label: 'Vencimento', type: 'date' as const, required: true },
  {
    name: 'resultGroup',
    label: 'Uso no resultado',
    type: 'select' as const,
    options: [
      { value: 'OPERATING', label: 'Receita / despesa operacional' },
      { value: 'INVENTORY', label: 'Compra / ajuste de estoque' },
      { value: 'CAPITAL', label: 'Investimento / ativo' },
      { value: 'FINANCING', label: 'Aporte / empréstimo / retirada' },
    ],
  },
  { name: 'category', label: 'Categoria' },
  { name: 'costCenter', label: 'Centro de custo' },
  { name: 'notes', label: 'Observações', type: 'textarea' as const },
];
export const operations: RouteObject[] = [
  route('personnel', 'payroll.read', <PersonnelPage />),
  route('personnel/new', 'payroll.manage', <PersonnelForm />),
  route('personnel/:id', 'payroll.read', <PersonnelDetail />),
  route('treasury', 'treasury.read', <TreasuryPage />),
  route('pdv', 'sales.create', <PDV />),
  route(
    'sales',
    'sales.read',
    <>
      <RecordList
        title="Vendas e devoluções"
        endpoint="sales"
        search
        detail="/sales/:id"
        create="/pdv"
        write="sales.create"
        columns={[
          { key: 'code', label: 'Venda' },
          dateCol('createdAt', 'Data'),
          { key: 'employeeName', label: 'Vendedora' },
          { key: 'status', label: 'Situação', render: (r) => <Badge value={r.status} /> },
          moneyCol('total', 'Total'),
          moneyCol('returnedTotal', 'Devoluções'),
          moneyCol('netTotal', 'Líquido'),
        ]}
      />
      <Link className="button" to="/sales/quotations">
        Consultar orçamentos
      </Link>
    </>,
  ),
  route(
    'sales/quotations',
    'sales.read',
    <RecordList
      title="Orçamentos e vendas pendentes"
      endpoint="sales/quotations"
      paginated={false}
      detail="/pdv?quotation=:id"
      columns={[
        dateCol('createdAt', 'Criado em'),
        { key: 'status', label: 'Situação', render: (r) => <Badge value={r.status} /> },
      ]}
    />,
  ),
  route('sales/:id', 'sales.read', <SaleDetail />),
  route(
    'inventory',
    'inventory.read',
    <RecordList
      title="Controle de estoque"
      endpoint="inventory"
      search
      detail="/inventory/:id/movements"
      create="/inventory/adjust"
      write="inventory.adjust"
      columns={[
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: 'Produto' },
        { key: 'quantity', label: 'Saldo' },
        { key: 'reserved', label: 'Reservado' },
        { key: 'available', label: 'Disponível' },
        { key: 'minStock', label: 'Mínimo' },
        {
          key: 'critical',
          label: 'Reposição',
          render: (r) =>
            r.critical ? <span className="negative">Reposição necessária</span> : 'Regular',
        },
      ]}
    />,
  ),
  route('inventory/adjust', 'inventory.adjust', <StockAdjustment />),
  route('inventory/:id/movements', 'inventory.read', <StockMovements />),
  route('cash', 'cash.read', <CashPage />),
  route(
    'cash/open',
    'cash.manage',
    <ActionForm
      title="Abertura de caixa"
      endpoint="cash-registers/open"
      fields={[
        { name: 'amount', label: 'Fundo inicial em dinheiro', type: 'decimal', required: true },
      ]}
      defaults={{ amount: '0' }}
      back="/cash"
      invalidate={['cash-current', 'cash-registers']}
    />,
  ),
  route(
    'cash/movement',
    'cash.manage',
    <ActionForm
      title="Sangria / suprimento"
      endpoint="cash-registers/movements"
      fields={[
        {
          name: 'type',
          label: 'Operação',
          type: 'select',
          options: [
            { value: 'WITHDRAWAL', label: 'Sangria' },
            { value: 'SUPPLY', label: 'Suprimento' },
          ],
        },
        { name: 'amount', label: 'Valor em dinheiro', type: 'decimal', required: true },
        { name: 'reason', label: 'Motivo', type: 'textarea', required: true },
      ]}
      defaults={{ type: 'WITHDRAWAL', amount: '0', reason: '' }}
      back="/cash"
      invalidate={['cash-current']}
    />,
  ),
  route(
    'cash/close',
    'cash.manage',
    <ActionForm
      title="Fechamento e conferência do caixa"
      endpoint="cash-registers/close"
      fields={[
        { name: 'countedAmount', label: 'Dinheiro contado', type: 'decimal', required: true },
        { name: 'justification', label: 'Justificativa de diferenças', type: 'textarea' },
      ]}
      defaults={{ countedAmount: '0', justification: '' }}
      back="/cash"
      invalidate={['cash-current', 'cash-registers']}
    />,
  ),
  route(
    'finance',
    'finance.read',
    <RecordList
      title="Contas a pagar e receber"
      endpoint="finance"
      search
      create="/finance/new"
      write="finance.manage"
      detail="/finance/:id/settle"
      columns={[
        { key: 'description', label: 'Descrição' },
        { key: 'direction', label: 'Direção', render: (r) => <Badge value={r.direction} /> },
        moneyCol('amount', 'Valor'),
        moneyCol('settledAmount', 'Baixado'),
        dateCol('dueDate', 'Vencimento'),
        { key: 'status', label: 'Situação', render: (r) => <Badge value={r.status} /> },
        { key: 'category', label: 'Categoria' },
      ]}
    />,
  ),
  route(
    'finance/new',
    'finance.manage',
    <ActionForm
      title="Novo lançamento financeiro"
      endpoint="finance"
      fields={financialFields}
      defaults={{ direction: 'OUT', amount: '0', category: 'Geral', costCenter: 'Loja', notes: '' }}
      back="/finance"
      invalidate={['finance']}
    />,
  ),
  route('finance/:id/settle', 'finance.manage', <SettlementPage />),
  route(
    'purchases',
    'purchases.read',
    <RecordList
      title="Pedidos de compra"
      endpoint="purchases"
      create="/purchases/new"
      write="purchases.manage"
      detail="/purchases/:id"
      columns={[
        { key: 'code', label: 'Pedido' },
        dateCol('createdAt', 'Cadastro'),
        moneyCol('total', 'Total'),
        { key: 'status', label: 'Situação', render: (r) => <Badge value={r.status} /> },
        dateCol('dueDate', 'Vencimento'),
      ]}
    />,
  ),
  route('purchases/new', 'purchases.manage', <PurchaseForm />),
  route('purchases/:id', 'purchases.read', <PurchaseDetail />),
  route('goals', 'goals.read', <GoalsPage />),
  route(
    'goals/new',
    'goals.manage',
    <ActionForm
      title="Definir meta mensal"
      endpoint="sales-goals"
      fields={[
        { name: 'period', label: 'Período (AAAA-MM)', required: true },
        { name: 'employeeId', label: 'Vendedora (vazio para meta da loja)', resource: 'employees' },
        { name: 'amount', label: 'Meta em reais', type: 'decimal', required: true },
      ]}
      defaults={{ employeeId: null, amount: '0' }}
      back="/goals"
      invalidate={['sales-goals']}
    />,
  ),
  route(
    'commissions',
    'commissions.read',
    <RecordList
      title="Comissões e compensações"
      endpoint="commissions"
      paginated={false}
      actions={[approveCommission, settleCommission]}
      columns={[
        dateCol('createdAt', 'Gerada em'),
        { key: 'employeeName', label: 'Vendedora' },
        moneyCol('amount', 'Valor'),
        { key: 'status', label: 'Situação', render: (r) => <Badge value={r.status} /> },
        dateCol('paidAt', 'Pagamento'),
      ]}
    />,
  ),
  route('reports', 'reports.read', <ReportsPage />),
  route(
    'loyalty',
    'loyalty.read',
    <RecordList
      title="Fidelização · pontos"
      endpoint="loyalty"
      paginated={false}
      create="/loyalty/adjust"
      write="loyalty.manage"
      detail="/loyalty/:id/history"
      columns={[
        { key: 'name', label: 'Cliente' },
        { key: 'points', label: 'Saldo de pontos' },
      ]}
    />,
  ),
  route(
    'loyalty/adjust',
    'loyalty.manage',
    <ActionForm
      title="Ajuste autorizado de pontos"
      endpoint="loyalty/adjust"
      fields={[
        { name: 'customerId', label: 'Cliente', resource: 'customers', required: true },
        {
          name: 'points',
          label: 'Pontos (+ crédito / − resgate)',
          type: 'decimal',
          required: true,
        },
        { name: 'reason', label: 'Motivo', type: 'textarea', required: true },
      ]}
      defaults={{ points: '0', reason: '' }}
      transform={(v) => ({ ...v, points: Number(v.points) })}
      back="/loyalty"
      invalidate={['loyalty']}
    />,
  ),
  route('loyalty/:id/history', 'loyalty.read', <LoyaltyHistory />),
  route(
    'notifications',
    'notifications.read',
    <RecordList
      title="Central de notificações"
      endpoint="notifications"
      paginated={false}
      actions={[notifyRead]}
      columns={[
        dateCol('createdAt', 'Data'),
        { key: 'title', label: 'Título' },
        { key: 'message', label: 'Mensagem' },
        dateCol('readAt', 'Lida em'),
      ]}
    />,
  ),
  route('settings', 'settings.read', <SettingsPage />),
  route(
    'users',
    'users.manage',
    <>
      <RecordList
        title="Usuários"
        endpoint="users"
        paginated={false}
        create="/users/new"
        write="users.manage"
        detail="/users/:id/edit"
        columns={[
          { key: 'name', label: 'Nome' },
          { key: 'email', label: 'Email' },
          { key: 'active', label: 'Ativo' },
          { key: 'mfaRequired', label: 'MFA obrigatório' },
          dateCol('lastLoginAt', 'Último acesso'),
        ]}
      />
      <Link className="button" to="/users/roles">
        Perfis e permissões
      </Link>
    </>,
  ),
  route('users/new', 'users.manage', <UserForm />),
  route('users/:id/edit', 'users.manage', <UserForm />),
  route(
    'users/roles',
    'users.manage',
    <RecordList
      title="Perfis e permissões"
      endpoint="users/roles"
      paginated={false}
      create="/users/roles/new"
      write="users.manage"
      columns={[
        { key: 'name', label: 'Perfil' },
        {
          key: 'permissions',
          label: 'Permissões explícitas',
          render: (r) => (r.permissions as string[]).join(', '),
        },
      ]}
    />,
  ),
  route('users/roles/new', 'users.manage', <RoleForm />),
  route(
    'audit',
    'audit.read',
    <RecordList
      title="Trilha de auditoria"
      endpoint="audit-logs"
      search
      columns={[
        dateCol('createdAt', 'Data'),
        { key: 'action', label: 'Operação' },
        { key: 'entity', label: 'Entidade' },
        { key: 'details', label: 'Detalhes' },
      ]}
    />,
  ),
  { path: 'security', element: <SecurityPage /> },
];
