import { ResultsPage } from './ResultsPage';
import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Building2, Plus, RotateCcw, Settings2, X } from 'lucide-react';
import { api, newKey, type Row, type Page } from '../../services/api';
import { can, useSession } from '../../app/session';
import { Title, Feedback, Loading, DataTable, Pager } from '../../components/ui';
import { useSystemDialog } from '../../components/SystemDialog';
import { brl, date, decimalInput, text, statusLabels, civilDate } from '../../utilities/format';
import './treasury.css';
const methodNames: Record<string, string> = { ...statusLabels, BANK: 'Banco' };
const sourceNames: Record<string, string> = {
  FINANCE_PAYMENT: 'Conta paga',
  FINANCE_RECEIPT: 'Conta recebida',
  COMMISSION_PAYMENT: 'Comissão paga',
  PERSONNEL_PAYMENT: 'Pagamento de colaborador',
  PURCHASE_PAYMENT: 'Pagamento de compra',
  PURCHASE_REFUND: 'Reembolso de compra',
  SALE: 'Venda',
  REFUND: 'Devolução / estorno',
  FINANCE: 'Baixa financeira',
  COMMISSION: 'Comissão',
  MANUAL: 'Lançamento manual',
  REVERSAL: 'Estorno manual',
  OPENING: 'Saldo inicial',
};
type Treasury = Page & {
  baseline: { amount: string; startsAt: string; reason: string } | null;
  balance: string | null;
  incoming: string;
  outgoing: string;
  today: string;
  timezone: string;
  byMethod: { method: string; incoming: string; outgoing: string }[];
};
function TreasuryLedger() {
  const user = useSession(),
    cache = useQueryClient(),
    dialog = useSystemDialog(),
    [params, setParams] = useSearchParams();
  const [modal, setModal] = useState<'initial' | 'entry'>(),
    [selected, setSelected] = useState<Row>(),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['treasury', params.toString()],
    placeholderData: keepPreviousData,
    queryFn: () => api<Treasury>('treasury?' + params.toString()),
  });
  const data = query.data;
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
    setSelected(undefined);
  }
  async function reverse() {
    if (!selected || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const reason = await dialog.prompt(
        'O movimento original será mantido e uma compensação será registrada.',
        { title: 'Estornar lançamento', confirmLabel: 'Estornar', minLength: 5, danger: true },
      );
      if (!reason) return;
      await api('treasury/entries/' + String(selected.rawId) + '/reverse', {
        method: 'POST',
        body: { reason },
        key: newKey(),
      });
      setSelected(undefined);
      await cache.invalidateQueries({ queryKey: ['treasury'] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const filters = (
    <div className="toolbar treasury-toolbar">
      <label>
        De
        <input
          type="date"
          aria-label="Extrato de"
          value={params.get('from') ?? ''}
          onChange={(e) => filter('from', e.target.value)}
        />
      </label>
      <label>
        Até
        <input
          type="date"
          aria-label="Extrato até"
          value={params.get('to') ?? ''}
          onChange={(e) => filter('to', e.target.value)}
        />
      </label>
      <label>
        Forma
        <select
          value={params.get('method') ?? ''}
          onChange={(e) => filter('method', e.target.value)}
        >
          <option value="">Todas</option>
          {['CASH', 'PIX', 'DEBIT', 'CREDIT', 'BANK', 'OTHER'].map((method) => (
            <option key={method} value={method}>
              {methodNames[method]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Origem
        <select
          value={params.get('source') ?? ''}
          onChange={(e) => filter('source', e.target.value)}
        >
          <option value="">Todas</option>
          {Object.entries(sourceNames).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Pesquisar
        <input
          placeholder="Descrição do movimento"
          value={params.get('q') ?? ''}
          onChange={(e) => filter('q', e.target.value)}
        />
      </label>
      <button onClick={() => void query.refetch()}>Atualizar</button>
      {selected?.source === 'MANUAL' && !selected.reversed && can(user, 'treasury.manage') && (
        <button disabled={busy} onClick={reverse}>
          <RotateCcw size={13} />
          Estornar lançamento
        </button>
      )}
    </div>
  );
  return (
    <>
      <Title
        title="Caixa da empresa"
        actions={
          can(user, 'treasury.manage') && (
            <>
              {!data?.baseline && (
                <button disabled={!data || busy} onClick={() => setModal('initial')}>
                  <Settings2 size={14} />
                  Informar saldo inicial
                </button>
              )}
              <button
                className="primary"
                disabled={!data?.baseline || busy}
                onClick={() => setModal('entry')}
              >
                <Plus size={14} />
                Novo lançamento
              </button>
            </>
          )
        }
      />
      <Feedback error={error ?? query.error} />
      {query.isError && filters}
      {query.isLoading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="treasury-scope">
              <Building2 size={14} />
              <span>Consolidado da empresa</span>
              <span>Dinheiro, Pix, cartões e banco registrados</span>
            </div>
            {!data.baseline && (
              <div className="message warning">
                Informe o saldo inicial para calcular o saldo da empresa. O histórico de entradas e
                saídas já está disponível abaixo.
              </div>
            )}
            <section className="metric-strip treasury-metrics">
              <div>
                <span>Saldo registrado da empresa</span>
                <strong
                  className={data.balance != null && Number(data.balance) < 0 ? 'negative' : ''}
                >
                  {data.balance == null ? 'Não informado' : brl(data.balance)}
                </strong>
              </div>
              <div>
                <span>Saldo inicial de referência</span>
                <strong>{data.baseline ? brl(data.baseline.amount) : '—'}</strong>
              </div>
              <div>
                <span>Entradas do extrato</span>
                <strong className="treasury-in">{brl(data.incoming)}</strong>
              </div>
              <div>
                <span>Saídas do extrato</span>
                <strong className="negative">{brl(data.outgoing)}</strong>
              </div>
            </section>
            {data.baseline && (
              <p className="treasury-reference">
                Saldo inicial no começo de {civilDate(data.baseline.startsAt.slice(0, 10))}. O saldo
                atual considera os movimentos a partir dessa data, em{' '}
                {data.timezone === 'America/Sao_Paulo' ? 'Brasília' : data.timezone}.
              </p>
            )}
            {filters}
            <DataTable
              rows={data.data}
              selected={selected?.id}
              onSelect={query.isFetching ? undefined : setSelected}
              columns={[
                {
                  key: 'createdAt',
                  label: 'Data',
                  render: (r) => date(r.createdAt, data.timezone),
                },
                {
                  key: 'description',
                  label: 'Descrição',
                  render: (r) => (
                    <>
                      <span>{text(r.description)}</span>
                      {!!r.reversed && <small className="treasury-row-note">Estornado</small>}
                      {r.balance === null && data.baseline && (
                        <small className="treasury-row-note">Anterior ao saldo inicial</small>
                      )}
                    </>
                  ),
                },
                {
                  key: 'source',
                  label: 'Origem',
                  render: (r) => (
                    <span className="badge">{sourceNames[String(r.source)] ?? text(r.source)}</span>
                  ),
                },
                {
                  key: 'method',
                  label: 'Forma',
                  render: (r) =>
                    r.source === 'OPENING'
                      ? '—'
                      : (methodNames[String(r.method)] ?? text(r.method)),
                },
                {
                  key: 'storeName',
                  label: 'Unidade',
                  render: (r) => (r.storeName ? text(r.storeName) : 'Empresa'),
                },
                {
                  key: 'incoming',
                  label: 'Entrada',
                  render: (r) => (
                    <span className="treasury-money treasury-in">
                      {r.source !== 'OPENING' && Number(r.amount) > 0 ? brl(r.amount) : '—'}
                    </span>
                  ),
                },
                {
                  key: 'outgoing',
                  label: 'Saída',
                  render: (r) => (
                    <span className="treasury-money negative">
                      {r.source !== 'OPENING' && Number(r.amount) < 0
                        ? brl(-Number(r.amount))
                        : '—'}
                    </span>
                  ),
                },
                {
                  key: 'balance',
                  label: 'Saldo acumulado',
                  render: (r) => (
                    <strong
                      className={
                        'treasury-money ' +
                        (r.balance != null && Number(r.balance) < 0 ? 'negative' : '')
                      }
                    >
                      {r.balance == null ? '—' : brl(r.balance)}
                    </strong>
                  ),
                },
              ]}
            />
            <Pager
              page={data.pagination.page}
              pageSize={data.pagination.pageSize}
              total={data.pagination.total}
              onChange={(p) => filter('page', String(p))}
            />
            <p className="treasury-explanation">
              Contas em aberto não entram no saldo. Abertura de caixa, sangrias e suprimentos são
              movimentações internas e não alteram o total da empresa. O saldo acumulado permanece
              completo mesmo ao filtrar o extrato.
            </p>
            {data.byMethod.length > 0 && (
              <section className="panel treasury-methods">
                <h2>Movimentação por forma de pagamento</h2>
                <DataTable
                  rows={data.byMethod.map((row) => ({ ...row, id: row.method }))}
                  columns={[
                    {
                      key: 'method',
                      label: 'Forma',
                      render: (r) => methodNames[String(r.method)] ?? text(r.method),
                    },
                    { key: 'incoming', label: 'Entradas', render: (r) => brl(r.incoming) },
                    { key: 'outgoing', label: 'Saídas', render: (r) => brl(r.outgoing) },
                  ]}
                />
              </section>
            )}
          </>
        )
      )}
      {modal && data && (
        <TreasuryForm
          mode={modal}
          today={data.today}
          onClose={() => setModal(undefined)}
          onSaved={async () => {
            setModal(undefined);
            setSelected(undefined);
            await cache.invalidateQueries({ queryKey: ['treasury'] });
          }}
        />
      )}
    </>
  );
}
function TreasuryForm({
  mode,
  today,
  onClose,
  onSaved,
}: {
  mode: 'initial' | 'entry';
  today: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const initial = mode === 'initial',
    dialog = useSystemDialog(),
    ref = useRef<HTMLDialogElement>(null),
    key = useRef(newKey());
  const [amount, setAmount] = useState(''),
    [day, setDay] = useState(today),
    [description, setDescription] = useState(''),
    [direction, setDirection] = useState('IN'),
    [method, setMethod] = useState('CASH'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  useEffect(() => {
    const node = ref.current,
      previous = document.activeElement as HTMLElement | null;
    node?.showModal();
    return () => {
      node?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  function changed() {
    key.current = newKey();
    setError(undefined);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const accepted = await dialog.confirm(
        initial
          ? 'Usar ' +
              brl(decimalInput(amount)) +
              ' como saldo antes dos movimentos de ' +
              civilDate(day) +
              '? O saldo inicial fica preservado no histórico.'
          : 'Registrar ' +
              (direction === 'IN' ? 'entrada' : 'saída') +
              ' de ' +
              brl(decimalInput(amount)) +
              ' no Caixa da empresa?',
        { title: initial ? 'Confirmar saldo inicial' : 'Confirmar lançamento' },
      );
      if (!accepted) return;
      await api(initial ? 'treasury/initialize' : 'treasury/entries', {
        method: 'POST',
        body: initial
          ? { amount: decimalInput(amount), date: day, reason: description }
          : { amount: decimalInput(amount), direction, method, description },
        key: key.current,
      });
      await onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="treasury-dialog"
      aria-labelledby="treasury-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="system-dialog-chrome">
        <span id="treasury-dialog-title">
          {initial ? 'Saldo inicial da empresa' : 'Novo lançamento'}
        </span>
        <button disabled={busy} aria-label="Fechar lançamento" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <form onSubmit={submit}>
        <div className="treasury-dialog-fields">
          <Feedback error={error} />
          {initial ? (
            <>
              <p>
                Informe o saldo total que a empresa tinha no início do dia escolhido, antes das
                movimentações desse dia.
              </p>
              <label>
                Data de referência
                <input
                  type="date"
                  value={day}
                  max={today}
                  required
                  onChange={(e) => {
                    setDay(e.target.value);
                    changed();
                  }}
                />
              </label>
            </>
          ) : (
            <label>
              Tipo
              <select
                value={direction}
                onChange={(e) => {
                  setDirection(e.target.value);
                  changed();
                }}
              >
                <option value="IN">Entrada</option>
                <option value="OUT">Saída</option>
              </select>
            </label>
          )}
          <label>
            {initial ? 'Saldo inicial (R$)' : 'Valor (R$)'}
            <input
              value={amount}
              required
              inputMode="decimal"
              pattern={initial ? '-?[0-9]{1,12}([,.][0-9]{1,2})?' : '[0-9]{1,12}([,.][0-9]{1,2})?'}
              onChange={(e) => {
                setAmount(e.target.value);
                changed();
              }}
            />
          </label>
          {!initial && (
            <label>
              Forma
              <select
                aria-label="Forma do lançamento"
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  changed();
                }}
              >
                {['CASH', 'PIX', 'DEBIT', 'CREDIT', 'BANK', 'OTHER'].map((value) => (
                  <option key={value} value={value}>
                    {methodNames[value]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {initial ? 'Motivo / referência' : 'Descrição'}
            <textarea
              aria-label={initial ? 'Motivo / referência' : 'Descrição do lançamento'}
              value={description}
              minLength={5}
              maxLength={500}
              required
              rows={3}
              onChange={(e) => {
                setDescription(e.target.value);
                changed();
              }}
            />
          </label>
          {!initial && (
            <p>
              Use para movimentos ainda não registrados em vendas ou no financeiro. Valores já
              registrados aparecem automaticamente.
            </p>
          )}
        </div>
        <div className="system-dialog-footer">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Salvando...' : initial ? 'Salvar saldo inicial' : 'Registrar movimento'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function TreasuryPage() {
  const [params] = useSearchParams(),
    results = params.get('tab') === 'results';
  function link(tab: string) {
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    return '?' + next.toString();
  }
  return (
    <>
      <nav className="treasury-tabs" aria-label="Visões do caixa da empresa">
        <Link to={link('ledger')} role="tab" aria-selected={!results}>
          Extrato e saldo
        </Link>
        <Link to={link('results')} role="tab" aria-selected={results}>
          Resultado da empresa
        </Link>
      </nav>
      {results ? <ResultsPage /> : <TreasuryLedger />}
    </>
  );
}
