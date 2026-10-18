import { useDiscardConfirmation } from '../../components/SystemDialog';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useBlocker } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Decimal } from '@chame/shared';
import { useSession, can } from '../../app/session';
import { api, newKey, type Page, type Row } from '../../services/api';
import { Title, Feedback, Empty, useUnsaved } from '../../components/ui';
import { RemoteSelect } from '../../components/RemoteSelect';
import { brl, decimalInput, statusLabels } from '../../utilities/format';
type CartItem = {
  productId: string;
  name: string;
  sku: string;
  price: string;
  quantity: string;
  discount: string;
};
const methods = ['PIX', 'CASH', 'DEBIT', 'CREDIT', 'OTHER'];
export function PDV() {
  const user = useSession(),
    navigate = useNavigate(),
    [params] = useSearchParams(),
    quoteId = params.get('quotation'),
    [q, setQ] = useState(''),
    [cart, setCart] = useState<CartItem[]>([]),
    [customerId, setCustomerId] = useState(''),
    [employeeId, setEmployeeId] = useState(user.employeeId ?? ''),
    [discount, setDiscount] = useState('0'),
    [payments, setPayments] = useState([{ method: 'PIX', amount: '0' }]),
    [notes, setNotes] = useState(''),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const key = useRef(newKey()),
    submitted = useRef(false),
    search = useRef<HTMLInputElement>(null);
  const products = useQuery({
    queryKey: ['pdv', q],
    queryFn: () => api<Page>(`products?active=true&q=${encodeURIComponent(q)}&pageSize=25`),
  });
  const cash = useQuery({
    queryKey: ['cash-current'],
    queryFn: () => api<Row | null>('cash-registers/current'),
    enabled: can(user, 'cash.read'),
  });
  const quote = useQuery({
    queryKey: ['quotation', quoteId],
    queryFn: () => api<Row[]>('sales/quotations'),
    enabled: !!quoteId,
  });
  useEffect(() => {
    const row = quote.data?.find((r) => r.id === quoteId);
    if (!row) return;
    const payload = row.payload as {
      customerId?: string;
      employeeId: string;
      discount: string;
      notes?: string;
      items: { productId: string; quantity: string; discount: string }[];
    };
    setCustomerId(payload.customerId ?? '');
    setEmployeeId(payload.employeeId);
    setDiscount(payload.discount);
    setNotes(payload.notes ?? '');
    Promise.all(
      payload.items.map(async (i) => {
        const p = await api<Row>('products/' + i.productId);
        return { ...i, name: String(p.name), sku: String(p.sku), price: String(p.price) };
      }),
    )
      .then(setCart)
      .catch(setError);
  }, [quote.data, quoteId]);
  useUnsaved(cart.length > 0 && !submitted.current);
  const blocker = useBlocker(cart.length > 0 && !busy && !submitted.current);
  useDiscardConfirmation(blocker, 'Descartar esta venda em preparação?');
  let total = new Decimal(0);
  try {
    for (const i of cart)
      total = total.plus(
        new Decimal(i.price)
          .times(i.quantity || 0)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .minus(i.discount || 0),
      );
    total = total.minus(discount || 0);
  } catch {
    total = new Decimal(0);
  }
  function add(p: Row) {
    setCart((current) => {
      const found = current.find((i) => i.productId === p.id);
      if (found)
        return current.map((i) =>
          i.productId === p.id
            ? { ...i, quantity: new Decimal(i.quantity || 0).plus(1).toString() }
            : i,
        );
      return [
        ...current,
        {
          productId: p.id,
          name: String(p.name),
          sku: String(p.sku),
          price: String(p.price),
          quantity: '1',
          discount: '0',
        },
      ];
    });
    setQ('');
    key.current = newKey();
    search.current?.focus();
  }
  function edit(index: number, field: 'quantity' | 'discount', value: string) {
    setCart((c) => c.map((i, n) => (n === index ? { ...i, [field]: decimalInput(value) } : i)));
    key.current = newKey();
  }
  async function submit(asQuote = false) {
    setBusy(true);
    setError(undefined);
    try {
      const body = {
        customerId: customerId || null,
        employeeId,
        items: cart.map(({ productId, quantity, discount }) => ({ productId, quantity, discount })),
        discount,
        notes,
        ...(!asQuote ? { payments } : {}),
      };
      const result = await api<Row>(
        asQuote ? 'sales/quotations' : quoteId ? `sales/quotations/${quoteId}/convert` : 'sales',
        { method: 'POST', body, key: key.current },
      );
      submitted.current = true;
      setCart([]);
      navigate(asQuote ? '/sales/quotations' : '/sales/' + result.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return (
    <>
      <Title
        title="Frente de caixa"
        subtitle={
          quoteId
            ? 'Conversão de orçamento · preços atuais serão validados'
            : 'F2 pesquisar produto · pagamentos registrados, sem cobrança automática'
        }
      />
      <Feedback error={error ?? products.error ?? cash.error} />
      {cash.data === null && (
        <div className="message warning">
          O caixa está fechado. Abra-o em Controle de caixa para confirmar vendas.
        </div>
      )}
      <div className="pdv-grid">
        <section className="panel">
          <h2>Produtos</h2>
          <input
            ref={search}
            className="full"
            aria-label="Pesquisar produto"
            placeholder="Nome, SKU ou código de barras (F2)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && products.data?.data.length === 1) {
                e.preventDefault();
                add(products.data.data[0]);
              }
            }}
          />
          <div className="product-results">
            {products.data?.data.map((p) => (
              <button className="product-result" key={p.id} onClick={() => add(p)}>
                <span>
                  <strong>{String(p.name)}</strong>
                  <small>
                    {String(p.sku)} · saldo {String(p.stock)}
                  </small>
                </span>
                <b>{brl(p.price)}</b>
              </button>
            ))}
            {!products.data?.data.length && (
              <Empty>Cadastre produtos e registre a entrada de estoque para vender.</Empty>
            )}
          </div>
        </section>
        <section className="panel cart">
          <h2>
            Itens da venda <span>{cart.length} item(ns)</span>
          </h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd.</th>
                  <th>Preço</th>
                  <th>Desconto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cart.map((i, n) => (
                  <tr key={i.productId}>
                    <td>
                      {i.name}
                      <small className="muted block">{i.sku}</small>
                    </td>
                    <td>
                      <input
                        aria-label={`Quantidade ${i.name}`}
                        className="number-field"
                        value={i.quantity}
                        onChange={(e) => edit(n, 'quantity', e.target.value)}
                        inputMode="decimal"
                      />
                    </td>
                    <td>{brl(i.price)}</td>
                    <td>
                      <input
                        aria-label={`Desconto ${i.name}`}
                        disabled={!can(user, 'sales.discount')}
                        className="number-field"
                        value={i.discount}
                        onChange={(e) => edit(n, 'discount', e.target.value)}
                        inputMode="decimal"
                      />
                    </td>
                    <td>
                      <button
                        aria-label={`Remover ${i.name}`}
                        onClick={() => {
                          setCart((c) => c.filter((_, idx) => idx !== n));
                          key.current = newKey();
                        }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!cart.length && <Empty>Selecione produtos na pesquisa ao lado.</Empty>}
          </div>
          <div className="form-grid compact-fields">
            <label>
              Cliente (opcional)
              <RemoteSelect
                resource="customers"
                value={customerId}
                onChange={(v) => {
                  setCustomerId(v);
                  key.current = newKey();
                }}
                label="Cliente"
              />
            </label>
            <label>
              Vendedora
              <RemoteSelect
                resource="employees"
                value={employeeId}
                onChange={(v) => {
                  setEmployeeId(v);
                  key.current = newKey();
                }}
                label="Vendedora"
                required
              />
            </label>
            <label>
              Desconto geral
              <input
                disabled={!can(user, 'sales.discount')}
                value={discount}
                inputMode="decimal"
                onChange={(e) => {
                  setDiscount(decimalInput(e.target.value));
                  key.current = newKey();
                }}
              />
            </label>
            <label>
              Observações
              <input
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  key.current = newKey();
                }}
              />
            </label>
          </div>
          <div className="sale-total">
            <span>Total da venda</span>
            <strong>{brl(total.toString())}</strong>
          </div>
          <h3>Pagamentos</h3>
          {payments.map((p, n) => (
            <div className="payment-row" key={n}>
              <select
                aria-label={`Forma de pagamento ${n + 1}`}
                value={p.method}
                onChange={(e) => {
                  setPayments((a) =>
                    a.map((v, i) => (i === n ? { ...v, method: e.target.value } : v)),
                  );
                  key.current = newKey();
                }}
              >
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {statusLabels[m]}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Valor pagamento ${n + 1}`}
                value={p.amount}
                inputMode="decimal"
                onChange={(e) => {
                  setPayments((a) =>
                    a.map((v, i) => (i === n ? { ...v, amount: decimalInput(e.target.value) } : v)),
                  );
                  key.current = newKey();
                }}
              />
              <button
                onClick={() => {
                  setPayments((a) =>
                    a.map((v, i) => (i === n ? { ...v, amount: total.toFixed(2) } : v)),
                  );
                  key.current = newKey();
                }}
              >
                Total
              </button>
              {payments.length > 1 && (
                <button
                  aria-label="Remover pagamento"
                  onClick={() => {
                    setPayments((a) => a.filter((_, i) => i !== n));
                    key.current = newKey();
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => {
              setPayments((a) => [...a, { method: 'CASH', amount: '0' }]);
              key.current = newKey();
            }}
          >
            Adicionar pagamento
          </button>
          <div className="form-actions">
            <button
              className="primary"
              disabled={
                busy || !cart.length || !employeeId || !cash.isSuccess || cash.data === null
              }
              onClick={() => submit()}
            >
              {busy ? 'Processando…' : 'Confirmar venda'}
            </button>
            <button
              disabled={busy || !cart.length || !employeeId || !!quoteId}
              onClick={() => submit(true)}
            >
              Salvar orçamento
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
