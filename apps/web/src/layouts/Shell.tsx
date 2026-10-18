import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  Package,
  Warehouse,
  ShoppingCart,
  Wallet,
  Target,
  Percent,
  Truck,
  ChartNoAxesCombined,
  Settings,
  ShieldCheck,
  Bell,
  Heart,
  Menu,
  LogOut,
  Search,
  UserRound,
} from 'lucide-react';
import { useSession, can } from '../app/session';
import { api, setCsrf } from '../services/api';
import { ProfileMenu } from '../components/ProfileMenu';
import { Feedback } from '../components/ui';
const menu = [
  {
    group: 'OPERAÇÃO',
    items: [
      ['/', 'Painel', 'dashboard.read', LayoutDashboard],
      ['/pdv', 'Frente de caixa', 'sales.create', ShoppingCart],
      ['/sales', 'Vendas e devoluções', 'sales.read', ShoppingCart],
      ['/cash', 'Controle de caixa', 'cash.read', Wallet],
    ],
  },
  {
    group: 'CADASTROS',
    items: [
      ['/customers', 'Clientes', 'customers.read', Users],
      ['/employees', 'Colaboradoras', 'employees.read', UserRound],
      ['/products', 'Produtos', 'products.read', Package],
      ['/categories', 'Categorias', 'products.read', Package],
      ['/inventory', 'Estoque', 'inventory.read', Warehouse],
      ['/suppliers', 'Fornecedores', 'purchases.read', Truck],
    ],
  },
  {
    group: 'GESTÃO',
    items: [
      ['/finance', 'Financeiro', 'finance.read', Wallet],
      ['/personnel', 'Pagamentos de colaboradores', 'payroll.read', UserRound],
      ['/treasury', 'Caixa da empresa', 'treasury.read', Wallet],
      ['/purchases', 'Compras', 'purchases.read', Truck],
      ['/goals', 'Metas comerciais', 'goals.read', Target],
      ['/commissions', 'Comissões', 'commissions.read', Percent],
      ['/reports', 'Relatórios', 'reports.read', ChartNoAxesCombined],
      ['/loyalty', 'Fidelização', 'loyalty.read', Heart],
    ],
  },
  {
    group: 'ADMINISTRAÇÃO',
    items: [
      ['/notifications', 'Notificações', 'notifications.read', Bell],
      ['/settings', 'Configurações', 'settings.read', Settings],
      ['/users', 'Usuários e perfis', 'users.manage', Users],
      ['/audit', 'Auditoria', 'audit.read', ShieldCheck],
      ['/security', 'Segurança e sessões', '', ShieldCheck],
    ],
  },
] as const;
export function Shell() {
  const user = useSession(),
    navigate = useNavigate(),
    cache = useQueryClient();
  const [compact, setCompact] = useState(false),
    [q, setQ] = useState(''),
    [error, setError] = useState<unknown>();
  async function logout() {
    try {
      await api('auth/logout', { method: 'POST' });
      setCsrf('');
      cache.clear();
      navigate('/login');
    } catch (err) {
      setError(err);
    }
  }
  return (
    <div className={`erp ${compact ? 'compact' : ''}`}>
      <aside className="sidebar">
        <NavLink className="brand" to="/">
          CHAME <strong>TOTAL</strong>
        </NavLink>
        <span className="brand-caption">GESTÃO COMERCIAL</span>
        <nav>
          {menu.map((section) => (
            <div className="nav-group" key={section.group}>
              <div className="nav-caption">{section.group}</div>
              {section.items
                .filter(
                  ([, label, p]) =>
                    (!p || can(user, p)) &&
                    (!q || label.toLocaleLowerCase('pt-BR').includes(q.toLocaleLowerCase('pt-BR'))),
                )
                .map(([path, label, , Icon]) => (
                  <NavLink aria-label={label} title={label} key={path} to={path} end={path === '/'}>
                    <Icon size={16} aria-hidden />
                    <span>{label}</span>
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          Loja principal
          <br />
          <span>BRL · {user.timezone === 'America/Sao_Paulo' ? 'Brasília' : user.timezone}</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button"
            aria-label="Alternar menu"
            onClick={() => setCompact(!compact)}
          >
            <Menu size={18} />
          </button>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (can(user, 'products.read')) navigate('/products?q=' + encodeURIComponent(q));
            }}
          >
            <Search size={15} />
            <input
              aria-label="Buscar módulos ou produtos"
              placeholder="Buscar módulo ou produto…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
          <ProfileMenu />
          <button className="icon-button" aria-label="Sair" onClick={logout}>
            <LogOut size={17} />
          </button>
        </header>
        <main className="content">
          <Feedback error={error} />
          <Outlet />
        </main>
        <footer className="statusbar">
          <span>CHAME TOTAL · Gestão comercial</span>
          <span>Valores em reais · comprovantes não fiscais</span>
        </footer>
      </div>
    </div>
  );
}
