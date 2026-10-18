import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { api } from '../../services/api';
import { brl } from '../../utilities/format';
import { Title, Feedback, Loading, Empty } from '../../components/ui';
type DashboardData = {
  revenue: string;
  saleCount: number;
  averageTicket: string;
  grossProfit: string;
  expenses: string | null;
  operatingResult: string | null;
  overdue: number | null;
  daily: { date: string; total: string }[];
  ranking: { id: string; name: string; total: string; saleCount: number }[];
  lowStock: { id: string; name: string; quantity: string; minStock: string }[];
  topProducts: { name: string; sku: string; quantity: string }[];
  definition: string;
};
function today(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function Dashboard() {
  const user = useSession();
  const now = today(user.timezone),
    [from, setFrom] = useState(now.slice(0, 7) + '-01'),
    [to, setTo] = useState(now);
  const query = useQuery({
    queryKey: ['dashboard', from, to],
    queryFn: () => api<DashboardData>(`dashboard?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  });
  const d = query.data;
  return (
    <>
      <Title
        title="Vendas"
        actions={
          <Link className="button primary" to="/pdv">
            Nova venda
          </Link>
        }
      />
      <div className="toolbar">
        <label>
          De
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button onClick={() => query.refetch()}>Atualizar</button>
        <span className="muted">Vendas confirmadas, líquidas de devoluções</span>
      </div>
      <Feedback error={query.error} />
      {query.isLoading ? (
        <Loading />
      ) : (
        d && (
          <>
            <section className="metric-strip">
              {[
                ['Faturamento líquido', brl(d.revenue)],
                ['Vendas confirmadas', String(d.saleCount)],
                ['Ticket médio', brl(d.averageTicket)],
                ['Lucro bruto estimado', brl(d.grossProfit)],
                ['Despesas', d.expenses === null ? 'Sem acesso' : brl(d.expenses)],
                [
                  'Resultado estimado',
                  d.operatingResult === null ? 'Sem acesso' : brl(d.operatingResult),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </section>
            <div className="dashboard-grid">
              <section className="panel wide">
                <h2>Evolução do faturamento</h2>
                {d.daily.length ? (
                  <div className="chart">
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={d.daily.map((r) => ({ ...r, total: Number(r.total) }))}>
                        <CartesianGrid vertical={false} stroke="#eceef0" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v) => String(v).slice(8) + '/' + String(v).slice(5, 7)}
                          tickLine={false}
                        />
                        <YAxis tickFormatter={(v) => brl(v)} width={95} tickLine={false} />
                        <Tooltip formatter={(v) => brl(v)} />
                        <Area
                          type="monotone"
                          dataKey="total"
                          name="Faturamento"
                          stroke="#91535F"
                          fill="#F5E8EB"
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty>Não há vendas confirmadas neste período.</Empty>
                )}
              </section>
              <section className="panel">
                <h2>Desempenho por vendedora</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Vendedora</th>
                      <th>Vendas</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.ranking.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>{r.saleCount}</td>
                        <td>{brl(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!d.ranking.length && <Empty />}
              </section>
              <section className="panel">
                <h2>
                  Estoque crítico <Link to="/inventory">Consultar estoque</Link>
                </h2>
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Saldo</th>
                      <th>Mínimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.lowStock.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td className="negative">{r.quantity}</td>
                        <td>{r.minStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!d.lowStock.length && <Empty>Nenhum produto abaixo do mínimo.</Empty>}
              </section>
              <section className="panel">
                <h2>Produtos mais vendidos</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>SKU</th>
                      <th>Quantidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.topProducts.map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}</td>
                        <td>{r.sku}</td>
                        <td>{r.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!d.topProducts.length && <Empty />}
              </section>
            </div>
            <p className="muted footnote">
              {d.definition}
              {d.overdue !== null && ` Contas vencidas: ${d.overdue}.`}
            </p>
          </>
        )
      )}
    </>
  );
}
