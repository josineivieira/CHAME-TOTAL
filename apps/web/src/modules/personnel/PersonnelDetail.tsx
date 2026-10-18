import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal } from '@chame/shared';
import { api, newKey, type Row } from '../../services/api';
import { Title, Feedback, Loading, Badge, DataTable } from '../../components/ui';
import { RecordActivity } from '../../components/RecordActivity';
import { useSystemDialog } from '../../components/SystemDialog';
import { can, useSession } from '../../app/session';
import { brl, civilDate, date, decimalInput, statusLabels, text } from '../../utilities/format';
import { staffTypes } from './PersonnelPage';
type Entry = Row & { payments: Row[] };
export function PersonnelDetail() {
  const { id } = useParams(),
    user = useSession(),
    cache = useQueryClient(),
    { confirm, prompt } = useSystemDialog(),
    key = useRef(newKey());
  const [amount, setAmount] = useState(''),
    [advance, setAdvance] = useState('0'),
    [method, setMethod] = useState('PIX'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const q = useQuery({
      queryKey: ['personnel-entry', id],
      queryFn: () => api<Entry>('personnel-payments/' + id),
    }),
    d = q.data;
  const remaining = d
      ? new Decimal(String(d.amount)).minus(String(d.settledAmount))
      : new Decimal(0),
    allowed = can(user, 'payroll.manage') && can(user, 'finance.manage');
  useEffect(() => {
    if (d) {
      setAmount(new Decimal(String(d.amount)).minus(String(d.settledAmount)).toFixed(2));
      setAdvance('0');
      key.current = newKey();
    }
  }, [d]);
  async function refresh() {
    await Promise.all(
      ['personnel', 'personnel-entry', 'finance', 'treasury', 'company-results'].map((k) =>
        cache.invalidateQueries({
          queryKey: k === 'personnel-entry' ? ['personnel-entry', id] : [k],
        }),
      ),
    );
  }
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !d) return;
    setError(undefined);
    try {
      if (!/^\d+(\.\d{1,2})?$/.test(amount) || !/^\d+(\.\d{1,2})?$/.test(advance))
        throw new Error('Informe os valores com até duas casas decimais.');
      if (
        !(await confirm(
          `Registrar ${brl(amount)} pagos pela empresa e ${brl(advance)} de adiantamentos compensados para ${d.employeeName}?`,
          { title: 'Pagamento de colaborador', confirmLabel: 'Confirmar pagamento' },
        ))
      )
        return;
      setBusy(true);
      await api('personnel-payments/' + id + '/pay', {
        method: 'POST',
        body: { amount, advanceAmount: advance, method },
        key: key.current,
      });
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (busy) return;
    const reason = await prompt(
      'Informe o motivo do cancelamento deste lançamento sem pagamentos.',
      {
        title: 'Cancelar lançamento',
        confirmLabel: 'Cancelar lançamento',
        minLength: 5,
        danger: true,
      },
    );
    if (!reason) return;
    setBusy(true);
    setError(undefined);
    try {
      await api('personnel-payments/' + id + '/cancel', {
        method: 'POST',
        body: { reason },
        key: newKey(),
      });
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title
        title="Pagamento de colaborador"
        actions={
          <>
            <Link className="button" to="/personnel">
              Voltar
            </Link>
            {can(user, 'payroll.manage') &&
              d &&
              Number(d.settledAmount) === 0 &&
              d.status !== 'CANCELLED' && (
                <button disabled={busy} onClick={cancel}>
                  Cancelar lançamento
                </button>
              )}
          </>
        }
      />
      <Feedback error={error ?? q.error} />
      {q.isLoading ? (
        <Loading />
      ) : (
        d && (
          <>
            <article className="desktop-record">
              <div className="record-windowbar">
                <span>{staffTypes[String(d.staffType)]}</span>
                <Badge value={d.status} />
              </div>
              <header className="record-identity">
                <div>
                  <h2>{text(d.employeeName)}</h2>
                  <p>{text(d.description)}</p>
                </div>
                <strong>{brl(d.amount)}</strong>
              </header>
              <dl className="record-values staff-identification">
                <div>
                  <dt>Competência</dt>
                  <dd>{String(d.competenceDate).slice(0, 7).split('-').reverse().join('/')}</dd>
                </div>
                <div>
                  <dt>Vencimento</dt>
                  <dd>{civilDate(d.dueDate)}</dd>
                </div>
                <div>
                  <dt>Liquidado / compensado</dt>
                  <dd>{brl(d.settledAmount)}</dd>
                </div>
                <div>
                  <dt>A pagar</dt>
                  <dd>{d.status === 'CANCELLED' ? brl(0) : brl(remaining.toString())}</dd>
                </div>
                <div>
                  <dt>Adiantamentos disponíveis do colaborador</dt>
                  <dd>{brl(d.availableAdvance)}</dd>
                </div>
                {!!d.notes && (
                  <div>
                    <dt>Observações</dt>
                    <dd>{text(d.notes)}</dd>
                  </div>
                )}
              </dl>
              {d.status === 'CANCELLED' && (
                <div className="message warning">Cancelado: {text(d.cancelReason)}</div>
              )}
              <RecordActivity value={d.activity} />
            </article>
            {allowed && remaining.gt(0) && d.status !== 'CANCELLED' && (
              <form className="form-section staff-payment-form" onSubmit={pay}>
                <h2>Registrar pagamento pela empresa</h2>
                <div className="form-grid">
                  <label>
                    Valor a pagar agora *
                    <input
                      aria-label="Valor a pagar agora"
                      inputMode="decimal"
                      value={amount}
                      required
                      disabled={busy}
                      onChange={(e) => {
                        setAmount(decimalInput(e.target.value));
                        key.current = newKey();
                      }}
                    />
                  </label>
                  <label>
                    Forma de pagamento
                    <select
                      aria-label="Forma de pagamento do colaborador"
                      value={method}
                      disabled={busy}
                      onChange={(e) => {
                        setMethod(e.target.value);
                        key.current = newKey();
                      }}
                    >
                      {['PIX', 'BANK', 'CASH', 'DEBIT', 'CREDIT', 'OTHER'].map((v) => (
                        <option key={v} value={v}>
                          {statusLabels[v] ?? v}
                        </option>
                      ))}
                    </select>
                  </label>
                  {d.staffType === 'SALARY' && (
                    <label>
                      Compensar adiantamento
                      <input
                        aria-label="Compensar adiantamento"
                        inputMode="decimal"
                        value={advance}
                        disabled={busy}
                        onChange={(e) => {
                          const value = decimalInput(e.target.value);
                          setAdvance(value);
                          try {
                            const a = new Decimal(value);
                            if (a.gte(0) && a.lte(remaining))
                              setAmount(remaining.minus(a).toFixed(2));
                          } catch {
                            /* Incomplete input */
                          }
                          key.current = newKey();
                        }}
                      />
                      <small>Disponível: {brl(d.availableAdvance)}</small>
                    </label>
                  )}
                </div>
                <div className="staff-pay-actions">
                  <p>
                    O valor pago agora sai do Caixa da empresa. A compensação utiliza adiantamentos
                    já pagos e não gera outra saída.
                  </p>
                  <button className="primary" disabled={busy}>
                    {busy ? 'Registrando...' : 'Confirmar pagamento'}
                  </button>
                </div>
              </form>
            )}
            <section className="panel staff-history">
              <h2>Histórico de pagamentos e compensações</h2>
              <DataTable
                rows={d.payments}
                columns={[
                  { key: 'createdAt', label: 'Registrado em', render: (r) => date(r.createdAt) },
                  {
                    key: 'method',
                    label: 'Forma',
                    render: (r) =>
                      r.method === 'ADVANCE_OFFSET'
                        ? 'Compensação de adiantamento'
                        : (statusLabels[String(r.method)] ?? text(r.method)),
                  },
                  { key: 'amount', label: 'Valor', render: (r) => brl(r.amount) },
                  { key: 'userName', label: 'Registrado por' },
                ]}
              />
            </section>
            <p className="staff-note">
              Valores informados pela empresa. Encargos e tributos devem ser registrados
              separadamente. Comissões permanecem no módulo próprio.
            </p>
          </>
        )
      )}
    </>
  );
}
