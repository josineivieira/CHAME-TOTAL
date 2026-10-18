import { RecordActivity } from '../../components/RecordActivity';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type Row } from '../../services/api';
import { useSession, can } from '../../app/session';
import { Title, Feedback, Loading, Empty, DataTable, Badge } from '../../components/ui';
import { brl, date } from '../../utilities/format';
type Cash = Row & { movements: Row[]; expected: string };
export function CashPage() {
  const user = useSession(),
    current = useQuery({
      queryKey: ['cash-current'],
      queryFn: () => api<Cash | null>('cash-registers/current'),
    }),
    history = useQuery({
      queryKey: ['cash-registers'],
      queryFn: () => api<Row[]>('cash-registers'),
    });
  const d = current.data;
  return (
    <>
      <Title
        title="Controle de caixa"
        actions={
          can(user, 'cash.manage') &&
          current.isSuccess && (
            <>
              {d ? (
                <>
                  <Link className="button" to="/cash/movement">
                    Sangria / suprimento
                  </Link>
                  <Link className="button primary" to="/cash/close">
                    Fechar caixa
                  </Link>
                </>
              ) : (
                <Link className="button primary" to="/cash/open">
                  Abrir caixa
                </Link>
              )}
            </>
          )
        }
      />
      <Feedback error={current.error ?? history.error} />
      {current.isLoading ? (
        <Loading />
      ) : d ? (
        <>
          <RecordActivity value={d.activity} />
          <section className="metric-strip">
            <div>
              <span>Situação</span>
              <strong>Caixa aberto</strong>
            </div>
            <div>
              <span>Fundo inicial</span>
              <strong>{brl(d.openingAmount)}</strong>
            </div>
            <div>
              <span>Dinheiro esperado</span>
              <strong>{brl(d.expected)}</strong>
            </div>
            <div>
              <span>Abertura</span>
              <strong className="small-value">{date(d.openedAt)}</strong>
            </div>
          </section>
          <section className="panel">
            <h2>Movimentações do caixa atual</h2>
            <DataTable
              rows={d.movements}
              columns={[
                { key: 'createdAt', label: 'Data', render: (r) => date(r.createdAt) },
                { key: 'type', label: 'Tipo' },
                { key: 'method', label: 'Forma', render: (r) => <Badge value={r.method} /> },
                { key: 'amount', label: 'Valor', render: (r) => brl(r.amount) },
                { key: 'reason', label: 'Motivo' },
              ]}
            />
          </section>
        </>
      ) : current.isSuccess && d === null ? (
        <Empty>
          {can(user, 'cash.manage')
            ? 'Caixa fechado. Abra um caixa para iniciar as operações.'
            : 'Caixa fechado. Solicite a abertura ao responsável pelo caixa.'}
        </Empty>
      ) : current.isError ? (
        <button onClick={() => void current.refetch()}>Tentar novamente</button>
      ) : null}
      <section className="panel">
        <h2>Histórico dos últimos 100 caixas</h2>
        <DataTable
          rows={history.data ?? []}
          columns={[
            { key: 'openedAt', label: 'Abertura', render: (r) => date(r.openedAt) },
            { key: 'closedAt', label: 'Fechamento', render: (r) => date(r.closedAt) },
            { key: 'status', label: 'Situação', render: (r) => <Badge value={r.status} /> },
            {
              key: 'countedAmount',
              label: 'Conferido',
              render: (r) => (r.countedAmount === null ? '—' : brl(r.countedAmount)),
            },
            {
              key: 'difference',
              label: 'Diferença',
              render: (r) => (r.difference === null ? '—' : brl(r.difference)),
            },
            { key: 'justification', label: 'Justificativa' },
          ]}
        />
      </section>
    </>
  );
}
