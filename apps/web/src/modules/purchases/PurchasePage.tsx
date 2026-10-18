import { RecordActivity } from '../../components/RecordActivity';
import { Decimal } from '@chame/shared';
import { PurchaseIssues } from './PurchaseIssues';
import { useSystemDialog } from '../../components/SystemDialog';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newKey, type Row } from '../../services/api';
import { Title, Feedback, Loading, Badge } from '../../components/ui';
import { RemoteSelect } from '../../components/RemoteSelect';
import './purchase-detail.css';
import { Link } from 'react-router-dom';
import { ClipboardList, CheckCircle2 } from 'lucide-react';
import { brl, date, civilDate, text, decimalInput } from '../../utilities/format';
import { can, useSession } from '../../app/session';
export function PurchaseForm() {
  const user = useSession(),
    cache = useQueryClient(),
    { confirm } = useSystemDialog();
  const [paymentMethod, setPaymentMethod] = useState('');
  const [supplierId, setSupplier] = useState(''),
    [items, setItems] = useState([{ productId: '', quantity: '1', unitCost: '0' }]),
    [dueDate, setDue] = useState(''),
    [notes, setNotes] = useState(''),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    key = useRef(newKey()),
    navigate = useNavigate();
  let purchaseTotal: Decimal | null = null;
  try {
    purchaseTotal = items.reduce(
      (sum, item) =>
        sum.plus(
          new Decimal(item.quantity).times(item.unitCost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        ),
      new Decimal(0),
    );
  } catch {
    /* Fields may be incomplete while typing. */
  }
  function edit(index: number, field: string, value: string) {
    setItems((a) => a.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
    key.current = newKey();
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (!purchaseTotal?.isFinite() || !purchaseTotal.gt(0))
        throw new Error('Informe os itens e um valor de compra maior que zero.');
      if (
        !(await confirm(
          `Registrar compra e pagamento de ${brl(purchaseTotal.toString())}? O valor será descontado do Caixa da empresa.`,
          { title: 'Compra paga', confirmLabel: 'Registrar compra e pagamento' },
        ))
      )
        return;
      const order = await api<Row>('purchases', {
        method: 'POST',
        body: { supplierId, items, dueDate, notes, paymentMethod },
        key: key.current,
      });
      await Promise.all(
        ['treasury', 'finance', 'purchases'].map((k) => cache.invalidateQueries({ queryKey: [k] })),
      );
      navigate('/purchases/' + order.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  if (!can(user, 'finance.manage'))
    return (
      <>
        <Title title="Nova compra" />
        <p>Seu perfil precisa de permissão financeira para registrar a compra e o pagamento.</p>
      </>
    );
  return (
    <>
      <Title title="Nova compra" />
      <Feedback error={error} />
      <form className="record-form" onSubmit={submit}>
        <section className="form-section">
          <h2>Fornecedor e condições</h2>
          <div className="form-grid">
            <label>
              Fornecedor
              <RemoteSelect
                resource="suppliers"
                label="Fornecedor"
                value={supplierId}
                onChange={(v) => {
                  setSupplier(v);
                  key.current = newKey();
                }}
                required
              />
            </label>
            <label>
              Data do documento
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => {
                  setDue(e.target.value);
                  key.current = newKey();
                }}
              />
            </label>
          </div>
        </section>
        <section className="form-section">
          <h2>Itens do pedido</h2>
          {items.map((item, n) => (
            <div className="purchase-item" key={n}>
              <RemoteSelect
                resource="products"
                label="Produto"
                value={item.productId}
                onChange={(v) => edit(n, 'productId', v)}
                required
              />
              <label>
                Quantidade
                <input
                  required
                  value={item.quantity}
                  onChange={(e) => edit(n, 'quantity', decimalInput(e.target.value))}
                />
              </label>
              <label>
                Custo unitário
                <input
                  required
                  value={item.unitCost}
                  onChange={(e) => edit(n, 'unitCost', decimalInput(e.target.value))}
                />
              </label>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setItems((a) => a.filter((_, i) => i !== n));
                    key.current = newKey();
                  }}
                >
                  Remover
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              setItems((a) => [...a, { productId: '', quantity: '1', unitCost: '0' }]);
              key.current = newKey();
            }}
          >
            Adicionar item
          </button>
        </section>
        <section className="form-section">
          <h2>Pagamento da compra</h2>
          <div className="form-grid">
            <label>
              Forma de pagamento *
              <select
                aria-label="Forma de pagamento da compra"
                value={paymentMethod}
                required
                disabled={busy}
                onChange={(e) => {
                  setPaymentMethod(e.target.value);
                  key.current = newKey();
                }}
              >
                <option value="">Selecione</option>
                <option value="CASH">Dinheiro</option>
                <option value="PIX">Pix</option>
                <option value="DEBIT">Cartão de débito</option>
                <option value="CREDIT">Cartão de crédito</option>
                <option value="BANK">Banco / transferência</option>
                <option value="OTHER">Outros</option>
              </select>
            </label>
            <div className="purchase-payment-summary">
              <span>Valor pago</span>
              <strong>{purchaseTotal?.isFinite() ? brl(purchaseTotal.toString()) : '—'}</strong>
              <small>Saída integral do Caixa da empresa ao registrar.</small>
            </div>
          </div>
        </section>
        <section className="form-section">
          <label>
            Observações
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                key.current = newKey();
              }}
            />
          </label>
        </section>
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            Registrar compra e pagamento
          </button>
          <button type="button" onClick={() => navigate('/purchases')}>
            Cancelar
          </button>
        </div>
      </form>
    </>
  );
}
export function PurchaseDetail() {
  const { confirm } = useSystemDialog();
  const { id } = useParams(),
    user = useSession(),
    cache = useQueryClient(),
    [quantities, setQuantities] = useState<Record<string, string>>({}),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    key = useRef(newKey());
  const query = useQuery({
    queryKey: ['purchase', id],
    queryFn: () => api<Row & { items: Row[]; issues: Row[] }>('purchases/' + id),
  });
  const order = query.data;
  const editable =
    !!order &&
    !['RECEIVED', 'CLOSED_WITH_SHORTAGE'].includes(String(order.status)) &&
    can(user, 'purchases.manage');
  const pending = (item: Row) =>
    Math.max(
      0,
      Number(item.quantity) - Number(item.receivedQuantity) - Number(item.cancelledQuantity ?? 0),
    );
  const qty = (value: unknown) =>
    Number(value ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const blocked = (item: Row) =>
    order?.issues?.some(
      (issue) =>
        issue.purchaseItemId === item.id && issue.status === 'OPEN' && issue.action !== 'WAIT',
    );
  const selected =
    order?.items.filter((item) => Number(quantities[item.id]) > 0 && !blocked(item)) ?? [];
  const selectedTotal =
    selected.reduce(
      (sum, item) => sum + Math.round(Number(quantities[item.id]) * Number(item.unitCost) * 100),
      0,
    ) / 100;
  async function receive(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !editable || !selected.length) return;
    setError(undefined);
    if (
      !(await confirm(
        order?.paymentMode === 'PREPAID'
          ? 'Confirmar a entrada da mercadoria no estoque? O pagamento desta compra já foi registrado.'
          : 'Confirmar recebimento e gerar entrada de estoque e conta a pagar?',
      ))
    )
      return;
    setBusy(true);
    try {
      await api(`purchases/${id}/receive`, {
        method: 'POST',
        body: {
          items: query
            .data!.items.filter((i) => Number(quantities[i.id]) > 0 && !blocked(i))
            .map((i) => ({ purchaseItemId: i.id, quantity: quantities[i.id] })),
        },
        key: key.current,
      });
      await cache.invalidateQueries({ queryKey: ['purchase', id] });
      setQuantities({});
      key.current = newKey();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title
        title={order ? `Compra nº ${order.code}` : 'Pedido de compra'}
        actions={
          <Link className="button" to="/purchases">
            Voltar para compras
          </Link>
        }
      />
      <Feedback error={error ?? query.error} />
      {query.isLoading ? (
        <Loading />
      ) : (
        order && (
          <>
            <form className="purchase-record" onSubmit={receive}>
              <header className="purchase-bar">
                <span>
                  <ClipboardList size={16} /> Pedido de compra{' '}
                  <strong>#{String(order.code).padStart(4, '0')}</strong>
                </span>
                <Badge value={order.status} />
              </header>
              <dl className="purchase-identification">
                <div>
                  <dt>Fornecedor</dt>
                  <dd>{text(order.supplierName)}</dd>
                </div>
                <div>
                  <dt>Emissão</dt>
                  <dd>{date(order.createdAt)}</dd>
                </div>
                <div>
                  <dt>{order.paymentMode === 'PREPAID' ? 'Data do documento' : 'Vencimento'}</dt>
                  <dd>{civilDate(order.dueDate)}</dd>
                </div>
                <div>
                  <dt>Loja</dt>
                  <dd>{text(order.storeName)}</dd>
                </div>
              </dl>
              {order.paymentMode === 'PREPAID' && (
                <dl className="purchase-payment-strip">
                  <div>
                    <dt>Pagamento</dt>
                    <dd>
                      {brl(order.total)} ·{' '}
                      {text(
                        (
                          {
                            CASH: 'Dinheiro',
                            PIX: 'Pix',
                            DEBIT: 'Débito',
                            CREDIT: 'Crédito',
                            BANK: 'Banco',
                            OTHER: 'Outros',
                          } as Record<string, string>
                        )[String(order.paymentMethod)],
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Pago em</dt>
                    <dd>{date(order.paidAt)}</dd>
                  </div>
                  <div>
                    <dt>Reembolso recebido</dt>
                    <dd>{brl(order.refundedTotal)}</dd>
                  </div>
                  <div>
                    <dt>Saída líquida</dt>
                    <dd>{brl(Number(order.total) - Number(order.refundedTotal ?? 0))}</dd>
                  </div>
                </dl>
              )}
              <div className="purchase-section-heading">
                <h2>Itens do pedido</h2>
                <span>
                  {order.items.length} {order.items.length === 1 ? 'item' : 'itens'}
                </span>
              </div>
              <div className="purchase-table-scroll">
                <table className="purchase-table">
                  <thead>
                    <tr>
                      <th>Item / produto</th>
                      <th>Pedido</th>
                      <th>Recebido</th>
                      <th>Pendente</th>
                      {order.items.some((item) => Number(item.cancelledQuantity) > 0) && (
                        <th>Reembolsado</th>
                      )}
                      <th>Custo unitário</th>
                      <th>Total</th>
                      {editable && <th>Receber agora</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, index) => (
                      <tr key={item.id}>
                        <td>
                          <div className="purchase-product">
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <div>
                              <strong>{text(item.name)}</strong>
                              <small>SKU {text(item.sku)}</small>
                            </div>
                          </div>
                        </td>
                        <td>{qty(item.quantity)}</td>
                        <td>{qty(item.receivedQuantity)}</td>
                        <td>
                          <span
                            className={pending(item) ? 'purchase-pending' : 'purchase-complete'}
                          >
                            {qty(pending(item))}
                          </span>
                        </td>
                        {order.items.some((row) => Number(row.cancelledQuantity) > 0) && (
                          <td>{qty(item.cancelledQuantity)}</td>
                        )}
                        <td>{brl(item.unitCost)}</td>
                        <td className="purchase-line-total">
                          {brl(
                            Math.round(Number(item.quantity) * Number(item.unitCost) * 100) / 100,
                          )}
                        </td>
                        {editable && (
                          <td>
                            <input
                              className="number-field"
                              aria-label={`Receber ${item.name}`}
                              inputMode="decimal"
                              value={quantities[item.id] ?? '0'}
                              disabled={busy || pending(item) === 0 || blocked(item)}
                              onChange={(e) => {
                                setQuantities((values) => ({
                                  ...values,
                                  [item.id]: decimalInput(e.target.value),
                                }));
                                key.current = newKey();
                              }}
                            />
                            {blocked(item) && (
                              <small className="purchase-blocked">Tratativa em aberto</small>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="purchase-bottom">
                <section className="purchase-receipt-status">
                  <h3>
                    <CheckCircle2 size={16} /> Recebimento
                  </h3>
                  <strong>
                    {order.status === 'CLOSED_WITH_SHORTAGE'
                      ? 'Compra encerrada com reembolso'
                      : order.status === 'RECEIVED'
                        ? 'Mercadoria recebida integralmente'
                        : order.status === 'PARTIALLY_RECEIVED'
                          ? 'Mercadoria recebida parcialmente'
                          : 'Aguardando mercadoria'}
                  </strong>
                  <p>
                    {order.status === 'CLOSED_WITH_SHORTAGE'
                      ? 'A falta foi reembolsada sem entrada da mercadoria no estoque.'
                      : order.status === 'RECEIVED'
                        ? 'Todos os itens deste pedido foram recebidos.'
                        : 'As quantidades pendentes estão indicadas na relação de itens.'}
                  </p>
                  <p>
                    {order.paymentMode === 'PREPAID'
                      ? 'Pagamento integral registrado na compra.'
                      : 'Fluxo anterior: confira os pagamentos existentes no Financeiro.'}
                  </p>
                </section>
                <dl className="purchase-totals">
                  <div>
                    <dt>Itens no pedido</dt>
                    <dd>{order.items.length}</dd>
                  </div>
                  <div>
                    <dt>Quantidade pendente</dt>
                    <dd>{qty(order.items.reduce((sum, item) => sum + pending(item), 0))}</dd>
                  </div>
                  <div className="purchase-grand-total">
                    <dt>Total do pedido</dt>
                    <dd>{brl(order.total)}</dd>
                  </div>
                </dl>
              </div>
              {!!order.notes && (
                <section className="purchase-notes">
                  <h3>Observações</h3>
                  <p>{text(order.notes)}</p>
                </section>
              )}
              {editable && (
                <footer className="purchase-receive-footer">
                  <div>
                    <strong>
                      Recebimento desta operação <span>{brl(selectedTotal)}</span>
                    </strong>
                    <small>
                      {order.paymentMode === 'PREPAID'
                        ? 'Somente entrada de estoque. O pagamento não será repetido.'
                        : 'Gera entrada de estoque e conta a pagar pelos itens recebidos.'}
                    </small>
                  </div>
                  <button className="primary" disabled={busy || !selected.length}>
                    {busy ? 'Registrando...' : 'Confirmar recebimento'}
                  </button>
                </footer>
              )}
              <RecordActivity value={order.activity} />
            </form>
            <PurchaseIssues
              id={order.id}
              items={order.items}
              issues={order.issues ?? []}
              prepaid={order.paymentMode === 'PREPAID'}
              financial={can(user, 'finance.manage')}
              manage={can(user, 'purchases.manage')}
            />
          </>
        )
      )}
    </>
  );
}
