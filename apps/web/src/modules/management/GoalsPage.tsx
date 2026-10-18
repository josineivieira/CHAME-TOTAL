import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type Row } from '../../services/api';
import { useSession, can } from '../../app/session';
import { Title, Feedback, DataTable, Loading } from '../../components/ui';
import { brl } from '../../utilities/format';
export function GoalsPage() {
  const user = useSession(),
    [period, setPeriod] = useState(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: user.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .format(new Date())
        .slice(0, 7),
    );
  const query = useQuery({
    queryKey: ['sales-goals', period],
    queryFn: () => api<Row[]>('sales-goals?period=' + period),
    enabled: !!period,
  });
  return (
    <>
      <Title
        title="Metas comerciais"
        actions={
          can(user, 'goals.manage') && (
            <Link className="button primary" to="/goals/new">
              Definir meta
            </Link>
          )
        }
      />
      <div className="toolbar">
        <label>
          Período
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </label>
        <button onClick={() => query.refetch()}>Atualizar</button>
      </div>
      <Feedback error={query.error} />
      {query.isLoading ? (
        <Loading />
      ) : (
        <DataTable
          rows={query.data ?? []}
          columns={[
            { key: 'employeeName', label: 'Loja / vendedora' },
            { key: 'amount', label: 'Meta', render: (r) => brl(r.amount) },
            { key: 'sold', label: 'Vendido', render: (r) => brl(r.sold) },
            { key: 'percent', label: 'Atingido (%)' },
            { key: 'remaining', label: 'Falta vender', render: (r) => brl(r.remaining) },
            { key: 'remainingDays', label: 'Dias restantes' },
            {
              key: 'dailyNeeded',
              label: 'Média diária necessária',
              render: (r) => (r.dailyNeeded === null ? 'Período encerrado' : brl(r.dailyNeeded)),
            },
          ]}
        />
      )}
    </>
  );
}
