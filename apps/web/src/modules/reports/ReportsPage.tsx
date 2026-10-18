import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, download, type Row } from '../../services/api';
import { useSession, can } from '../../app/session';
import { Title, Feedback, DataTable, Loading } from '../../components/ui';
const kinds = [
  ['sales', 'Vendas', 'sales.read'],
  ['inventory', 'Estoque', 'inventory.read'],
  ['finance', 'Financeiro', 'finance.read'],
  ['commissions', 'Comissões', 'commissions.read'],
  ['purchases', 'Compras', 'purchases.read'],
  ['customers', 'Clientes', 'customers.read'],
  ['returns', 'Devoluções', 'sales.read'],
] as const;
export function ReportsPage() {
  const user = useSession(),
    available = kinds.filter(([, label, p]) => !!label && can(user, p)),
    [type, setType] = useState<string>(available[0]?.[0] ?? 'sales'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const params = `type=${type}${from ? '&from=' + from : ''}${to ? '&to=' + to : ''}`;
  const query = useQuery({
    queryKey: ['reports', params],
    queryFn: () =>
      api<{ data: Record<string, unknown>[]; total: number; from: string; to: string }>(
        'reports?' + params,
      ),
    enabled: available.length > 0,
  });
  async function exportFile(format: string) {
    setBusy(true);
    try {
      await download('reports?' + params + '&format=' + format, `chame-total-${type}.${format}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const rows: Row[] = (query.data?.data ?? []).map((r, n) => ({ ...r, id: String(n) }));
  return (
    <>
      <Title
        title="Relatórios"
        actions={
          can(user, 'reports.export') && (
            <>
              <button disabled={busy} onClick={() => exportFile('xlsx')}>
                Exportar Excel
              </button>
              <button disabled={busy} onClick={() => exportFile('pdf')}>
                Exportar PDF
              </button>
            </>
          )
        }
      />
      <div className="toolbar">
        <label>
          Relatório
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {available.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button onClick={() => query.refetch()}>Atualizar</button>
      </div>
      <Feedback error={error ?? query.error} />
      {query.data && (
        <p className="muted">
          Período: {query.data.from.split('-').reverse().join('/')} a{' '}
          {query.data.to.split('-').reverse().join('/')} · {query.data.total} registros. PDF
          limitado a 500 linhas; Excel a 10 mil.
        </p>
      )}
      {query.isLoading ? (
        <Loading />
      ) : (
        <DataTable
          rows={rows}
          columns={Object.keys(query.data?.data[0] ?? {}).map((key) => ({ key, label: key }))}
        />
      )}
    </>
  );
}
