import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Decimal } from '@chame/shared';
import { api } from '../../services/api';
import { Title, Feedback, Loading } from '../../components/ui';
import { brl, currentMonth } from '../../utilities/format';
import { useSession, can } from '../../app/session';
import './results.css';
type Results = {
  period: string;
  grossSales: string;
  discounts: string;
  refunds: string;
  netRevenue: string;
  costOfGoods: string;
  grossProfit: string;
  personnel: string;
  commissions: string;
  otherExpenses: string;
  otherIncome: string;
  expenses: string;
  netProfit: string;
  grossMargin: string | null;
  netMargin: string | null;
  zeroCostItems: number;
  cash: {
    incoming: string;
    outgoing: string;
    net: string;
    currentBalance: string | null;
    bySource: { source: string; incoming: string; outgoing: string }[];
  };
};
const labels: Record<string, string> = {
  SALE: 'Vendas recebidas',
  REFUND: 'Devoluções de vendas',
  FINANCE: 'Baixas financeiras anteriores',
  COMMISSION: 'Comissões anteriores',
  MANUAL: 'Lançamentos avulsos',
  REVERSAL: 'Estornos avulsos',
  PURCHASE_PAYMENT: 'Compras e fornecedores',
  PURCHASE_REFUND: 'Reembolso de fornecedores',
  FINANCE_PAYMENT: 'Contas pagas',
  FINANCE_RECEIPT: 'Contas recebidas',
  PERSONNEL_PAYMENT: 'Pagamentos de colaboradores',
  COMMISSION_PAYMENT: 'Comissões pagas',
};
export function ResultsPage() {
  const user = useSession(),
    [params, setParams] = useSearchParams(),
    period = params.get('period') ?? currentMonth(user.timezone),
    q = useQuery({
      queryKey: ['company-results', period],
      queryFn: () => api<Results>('treasury/results?period=' + period),
    }),
    d = q.data;
  const minus = (value: string) => new Decimal(value).negated().toString();
  return (
    <>
      <Title title="Resultado da empresa" />
      <div className="toolbar results-period">
        <label>
          Competência
          <input
            type="month"
            aria-label="Competência do resultado"
            value={period}
            onChange={(e) => {
              if (!e.target.value) return;
              const next = new URLSearchParams(params);
              next.set('period', e.target.value);
              setParams(next);
            }}
          />
        </label>
        <span>Consolidado da empresa</span>
        <button onClick={() => q.refetch()}>Atualizar</button>
      </div>
      <Feedback error={q.error} />
      {q.isLoading ? (
        <Loading />
      ) : (
        d && (
          <>
            <section className="metric-strip">
              <div>
                <span>Receita líquida de vendas</span>
                <strong>{brl(d.netRevenue)}</strong>
              </div>
              <div>
                <span>Lucro bruto</span>
                <strong className={Number(d.grossProfit) < 0 ? 'negative' : ''}>
                  {brl(d.grossProfit)}
                </strong>
              </div>
              <div>
                <span>Despesas do período</span>
                <strong>{brl(d.expenses)}</strong>
              </div>
              <div>
                <span>Lucro líquido gerencial</span>
                <strong className={Number(d.netProfit) < 0 ? 'negative' : 'treasury-in'}>
                  {brl(d.netProfit)}
                </strong>
              </div>
            </section>
            {d.zeroCostItems > 0 && (
              <div className="message warning">
                Há {d.zeroCostItems} item(ns) vendido(s) com custo zero no período. Confira os
                custos cadastrados antes de avaliar a margem.
              </div>
            )}
            <div className="results-layout">
              <section className="results-sheet">
                <header>
                  <h2>Demonstrativo gerencial</h2>
                  <span>{period.split('-').reverse().join('/')}</span>
                </header>
                <table>
                  <tbody>
                    {[
                      ['Vendas brutas', d.grossSales, ''],
                      ['Descontos', minus(d.discounts), ''],
                      ['Devoluções e cancelamentos', minus(d.refunds), ''],
                      ['Receita líquida', d.netRevenue, 'subtotal'],
                      ['Custo das mercadorias vendidas', minus(d.costOfGoods), ''],
                      ['Lucro bruto', d.grossProfit, 'subtotal'],
                      [
                        'Salários, benefícios e outros pagamentos a colaboradores',
                        minus(d.personnel),
                        '',
                      ],
                      ['Comissões e compensações', minus(d.commissions), ''],
                      ['Outras despesas operacionais', minus(d.otherExpenses), ''],
                      ['Outras receitas operacionais', d.otherIncome, ''],
                      ['Lucro líquido gerencial', d.netProfit, 'total'],
                    ].map(([label, value, style]) => (
                      <tr key={label} className={style}>
                        <th scope="row">{label}</th>
                        <td className={Number(value) < 0 ? 'negative' : ''}>{brl(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <footer>
                  <span>
                    Margem bruta{' '}
                    <strong>
                      {d.grossMargin == null
                        ? '—'
                        : Number(d.grossMargin).toLocaleString('pt-BR') + '%'}
                    </strong>
                  </span>
                  <span>
                    Margem líquida{' '}
                    <strong>
                      {d.netMargin == null
                        ? '—'
                        : Number(d.netMargin).toLocaleString('pt-BR') + '%'}
                    </strong>
                  </span>
                </footer>
              </section>
              <section className="results-sheet">
                <header>
                  <h2>Fluxo de caixa do mês</h2>
                  <span>Valores movimentados</span>
                </header>
                <div className="results-cash-totals">
                  <div>
                    <span>Entradas</span>
                    <strong className="treasury-in">{brl(d.cash.incoming)}</strong>
                  </div>
                  <div>
                    <span>Saídas</span>
                    <strong className="negative">{brl(d.cash.outgoing)}</strong>
                  </div>
                  <div>
                    <span>Saldo do movimento</span>
                    <strong>{brl(d.cash.net)}</strong>
                  </div>
                </div>
                <div className="results-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Origem</th>
                        <th>Entradas</th>
                        <th>Saídas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.cash.bySource.map((row) => (
                        <tr key={row.source}>
                          <th scope="row">{labels[row.source] ?? row.source}</th>
                          <td>{brl(row.incoming)}</td>
                          <td>{brl(row.outgoing)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!d.cash.bySource.length && <p className="empty">Nenhum movimento neste mês.</p>}
                <p className="results-notes">
                  O saldo do movimento considera as entradas e saídas do mês. O saldo atual e o
                  valor inicial de referência estão na aba Extrato e saldo.
                </p>
              </section>
            </div>
            <section className="results-basis">
              <strong>Critérios do resultado</strong>
              <p>
                Custo pelo valor registrado na venda; devoluções e cancelamentos reconhecidos na
                data do evento. Colaboradores pela competência e demais contas operacionais pelo
                vencimento, incluindo valores a pagar. Comissões pela geração e suas compensações.
              </p>
              <p>
                Compras de estoque entram no fluxo de caixa; o custo entra no resultado conforme a
                venda. Adiantamentos são compensados no salário. Registre também tributos, encargos
                e demais despesas no Financeiro para completar o resultado. Lançamentos avulsos do
                extrato não substituem esse registro.
              </p>
              <div>
                {can(user, 'payroll.read') && (
                  <Link className="button" to={'/personnel?period=' + period}>
                    Pagamentos de colaboradores
                  </Link>
                )}
                {can(user, 'finance.read') && (
                  <Link className="button" to="/finance">
                    Contas a pagar e receber
                  </Link>
                )}
              </div>
            </section>
          </>
        )
      )}
    </>
  );
}
