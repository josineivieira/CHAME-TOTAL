import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newKey, type Row, type Page } from '../../services/api';
import { Title, Feedback, Loading, DataTable, Pager, Badge } from '../../components/ui';
import { RemoteSelect } from '../../components/RemoteSelect';
import { useSession, can } from '../../app/session';
import { brl, civilDate, currentMonth, decimalInput } from '../../utilities/format';
import './personnel.css';
export const staffTypes: Record<string, string> = {
  SALARY: 'Salário',
  ADVANCE: 'Adiantamento',
  BENEFIT: 'Benefício',
  REIMBURSEMENT: 'Reembolso',
  OTHER: 'Outros',
};
export function PersonnelPage() {
  const user = useSession(),
    [params, setParams] = useSearchParams(),
    [selected, setSelected] = useState<Row>(),
    period = params.get('period') ?? currentMonth(user.timezone),
    page = Number(params.get('page') ?? 1);
  const values = new URLSearchParams(params);
  values.set('page', String(page));
  if (period) values.set('period', period);
  else values.delete('period');
  const q = useQuery({
    queryKey: ['personnel', values.toString()],
    queryFn: () =>
      api<Page & { summary: { cost: string; paid: string; offset: string; pending: string } }>(
        'personnel-payments?' + values,
      ),
  });
  function filter(k: string, v: string) {
    const next = new URLSearchParams(params);
    next.set(k, v);
    next.set('page', '1');
    setParams(next);
    setSelected(undefined);
  }
  return (
    <>
      <Title
        title="Pagamentos de colaboradores"
        actions={
          <>
            {selected && (
              <Link className="button" to={'/personnel/' + selected.id}>
                Abrir lançamento
              </Link>
            )}
            {can(user, 'payroll.manage') && (
              <Link className="button primary" to={'/personnel/new?period=' + period}>
                Novo lançamento
              </Link>
            )}
          </>
        }
      />
      <Feedback error={q.error} />
      {q.data && (
        <section className="metric-strip">
          <div>
            <span>Despesas da competência</span>
            <strong>{brl(q.data.summary.cost)}</strong>
          </div>
          <div>
            <span>Pago pela empresa</span>
            <strong>{brl(q.data.summary.paid)}</strong>
          </div>
          <div>
            <span>Adiantamentos compensados</span>
            <strong>{brl(q.data.summary.offset)}</strong>
          </div>
          <div>
            <span>A pagar</span>
            <strong>{brl(q.data.summary.pending)}</strong>
          </div>
        </section>
      )}
      <div className="toolbar staff-filters">
        <label>
          Competência
          <input
            type="month"
            aria-label="Competência dos colaboradores"
            value={period}
            onChange={(e) => filter('period', e.target.value)}
          />
        </label>
        <label>
          Pesquisar
          <input
            aria-label="Pesquisar pagamentos de colaboradores"
            value={params.get('q') ?? ''}
            onChange={(e) => filter('q', e.target.value)}
            placeholder="Colaborador ou descrição"
          />
        </label>
        <label>
          Situação
          <select
            value={params.get('status') ?? ''}
            onChange={(e) => filter('status', e.target.value)}
          >
            <option value="">Todas</option>
            <option value="OPEN">Em aberto</option>
            <option value="PARTIAL">Parcial</option>
            <option value="SETTLED">Liquidado</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </label>
        <button onClick={() => q.refetch()}>Atualizar</button>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : (
        <>
          <DataTable
            rows={q.data?.data ?? []}
            selected={selected?.id}
            onSelect={setSelected}
            columns={[
              { key: 'employeeName', label: 'Colaborador' },
              { key: 'staffType', label: 'Tipo', render: (r) => staffTypes[String(r.staffType)] },
              { key: 'description', label: 'Descrição' },
              {
                key: 'competenceDate',
                label: 'Competência',
                render: (r) => String(r.competenceDate).slice(0, 7).split('-').reverse().join('/'),
              },
              { key: 'dueDate', label: 'Vencimento', render: (r) => civilDate(r.dueDate) },
              { key: 'amount', label: 'Valor', render: (r) => brl(r.amount) },
              {
                key: 'settledAmount',
                label: 'Liquidado / compensado',
                render: (r) => brl(r.settledAmount),
              },
              { key: 'status', label: 'Situação', render: (r) => <Badge value={r.status} /> },
            ]}
          />
          <Pager
            page={page}
            pageSize={25}
            total={q.data?.pagination.total ?? 0}
            onChange={(n) => {
              const next = new URLSearchParams(params);
              next.set('page', String(n));
              setParams(next);
            }}
          />
        </>
      )}
      <p className="staff-note">
        Comissões permanecem no módulo de Comissões. Adiantamentos pagos podem ser compensados no
        salário e não aumentam a despesa da competência.
      </p>
    </>
  );
}
export function PersonnelForm() {
  const user = useSession(),
    [params] = useSearchParams(),
    navigate = useNavigate(),
    cache = useQueryClient(),
    key = useRef(newKey());
  const [employeeId, setEmployee] = useState(''),
    [staffType, setType] = useState('SALARY'),
    [competence, setCompetence] = useState(params.get('period') || currentMonth(user.timezone)),
    [description, setDescription] = useState('Salário da competência'),
    [amount, setAmount] = useState(''),
    [dueDate, setDue] = useState(''),
    [notes, setNotes] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  function changed() {
    key.current = newKey();
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const row = await api<Row>('personnel-payments', {
        method: 'POST',
        body: { employeeId, staffType, competence, description, amount, dueDate, notes },
        key: key.current,
      });
      await Promise.all(
        ['personnel', 'finance', 'company-results'].map((k) =>
          cache.invalidateQueries({ queryKey: [k] }),
        ),
      );
      navigate('/personnel/' + row.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title title="Novo pagamento de colaborador" />
      <Feedback error={error} />
      <form className="record-form" onSubmit={submit}>
        <section className="form-section">
          <h2>Colaborador e competência</h2>
          <div className="form-grid">
            <label>
              Colaborador *
              <RemoteSelect
                resource="employees"
                label="Colaborador"
                value={employeeId}
                onChange={(v) => {
                  setEmployee(v);
                  changed();
                }}
                required
              />
            </label>
            <label>
              Tipo
              <select
                aria-label="Tipo de pagamento"
                value={staffType}
                onChange={(e) => {
                  setType(e.target.value);
                  setDescription(staffTypes[e.target.value] + ' da competência');
                  changed();
                }}
              >
                {Object.entries(staffTypes).map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Competência *
              <input
                type="month"
                aria-label="Competência do pagamento"
                value={competence}
                required
                onChange={(e) => {
                  setCompetence(e.target.value);
                  changed();
                }}
              />
            </label>
            <label>
              Descrição *
              <input
                aria-label="Descrição do pagamento"
                value={description}
                minLength={5}
                maxLength={200}
                required
                onChange={(e) => {
                  setDescription(e.target.value);
                  changed();
                }}
              />
            </label>
            <label>
              Valor integral *
              <input
                aria-label="Valor integral"
                inputMode="decimal"
                value={amount}
                required
                onChange={(e) => {
                  setAmount(decimalInput(e.target.value));
                  changed();
                }}
              />
            </label>
            <label>
              Vencimento *
              <input
                aria-label="Vencimento"
                type="date"
                value={dueDate}
                required
                onChange={(e) => {
                  setDue(e.target.value);
                  changed();
                }}
              />
            </label>
            <label className="span-all">
              Observações
              <textarea
                value={notes}
                maxLength={1000}
                onChange={(e) => {
                  setNotes(e.target.value);
                  changed();
                }}
              />
            </label>
          </div>
          <p className="staff-note">
            Registre o valor integral antes de compensar adiantamentos. O pagamento é confirmado na
            próxima tela; registrar o lançamento ainda não movimenta dinheiro.
          </p>
        </section>
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            {busy ? 'Registrando...' : 'Registrar lançamento'}
          </button>
          <Link className="button" to="/personnel">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  );
}
