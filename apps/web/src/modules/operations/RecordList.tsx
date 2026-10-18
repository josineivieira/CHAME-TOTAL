import { useSystemDialog } from '../../components/SystemDialog';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newKey, type Page, type Row } from '../../services/api';
import { useSession, can } from '../../app/session';
import { Title, Feedback, Loading, DataTable, Pager, type Col } from '../../components/ui';
import { brl, date, civilDate } from '../../utilities/format';
export type ListAction = { label: string; permission: string; run: (row: Row) => Promise<unknown> };
export function RecordList({
  title,
  endpoint,
  columns,
  create,
  write,
  detail,
  actions = [],
  search = false,
  paginated = true,
}: {
  title: string;
  endpoint: string;
  columns: Col[];
  create?: string;
  write?: string;
  detail?: string;
  actions?: ListAction[];
  search?: boolean;
  paginated?: boolean;
}) {
  const { confirm } = useSystemDialog();
  const user = useSession(),
    [params, setParams] = useSearchParams(),
    [selected, setSelected] = useState<Row>(),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    navigate = useNavigate(),
    cache = useQueryClient();
  const page = Number(params.get('page') ?? 1),
    q = params.get('q') ?? '';
  const query = useQuery({
    queryKey: [endpoint, params.toString()],
    queryFn: () =>
      api<Page | Row[]>(
        endpoint +
          (endpoint.includes('?') ? '&' : '?') +
          `page=${page}&pageSize=25${search ? '&q=' + encodeURIComponent(q) : ''}`,
      ),
  });
  const rows = Array.isArray(query.data) ? query.data : (query.data?.data ?? []),
    total = Array.isArray(query.data) ? query.data.length : (query.data?.pagination.total ?? 0);
  function update(name: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(name, value);
    if (name !== 'page') next.set('page', '1');
    setParams(next);
    setSelected(undefined);
  }
  async function run(action: ListAction) {
    if (!selected || !(await confirm(`${action.label}: confirmar esta operação?`))) return;
    setBusy(true);
    setError(undefined);
    try {
      await action.run(selected);
      await cache.invalidateQueries({ queryKey: [endpoint] });
      setSelected(undefined);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title
        title={title}
        actions={
          <>
            {create && write && can(user, write) && (
              <Link className="button primary" to={create}>
                Novo
              </Link>
            )}
            {detail && selected && (
              <button onClick={() => navigate(detail.replace(':id', selected.id))}>
                Visualizar selecionado
              </button>
            )}
            {actions
              .filter((a) => can(user, a.permission))
              .map((a) => (
                <button key={a.label} disabled={!selected || busy} onClick={() => run(a)}>
                  {a.label}
                </button>
              ))}
          </>
        }
      />
      <div className="toolbar">
        {search && (
          <label>
            Pesquisar
            <input
              value={q}
              onChange={(e) => update('q', e.target.value)}
              placeholder="Pesquisar registros…"
            />
          </label>
        )}
        <button onClick={() => query.refetch()}>Atualizar</button>
        <span className="muted">Selecione uma linha para acessar as ações.</span>
      </div>
      <Feedback error={error ?? query.error} />
      {query.isLoading ? (
        <Loading />
      ) : (
        <>
          <DataTable rows={rows} columns={columns} onSelect={setSelected} selected={selected?.id} />
          {paginated && (
            <Pager
              page={page}
              pageSize={25}
              total={total}
              onChange={(p) => update('page', String(p))}
            />
          )}
        </>
      )}
    </>
  );
}
export const moneyCol = (key: string, label: string): Col => ({
  key,
  label,
  render: (r) => brl(r[key]),
});
export const dateCol = (key: string, label: string): Col => ({
  key,
  label,
  render: (r) => (key.endsWith('Date') ? civilDate(r[key]) : date(r[key])),
});
export const notifyRead: ListAction = {
  label: 'Marcar como lida',
  permission: 'notifications.read',
  run: (r) => api(`notifications/${r.id}/read`, { method: 'POST', body: {} }),
};
export const approveCommission: ListAction = {
  label: 'Aprovar comissões da vendedora',
  permission: 'commissions.manage',
  run: (r) => api('commissions/approve', { method: 'POST', body: { employeeId: r.employeeId } }),
};
export const settleCommission: ListAction = {
  label: 'Pagar saldo aprovado via Pix',
  permission: 'commissions.manage',
  run: (r) =>
    api('company-payments/commissions', {
      method: 'POST',
      body: { employeeId: r.employeeId, method: 'PIX' },
      key: newKey(),
    }),
};
