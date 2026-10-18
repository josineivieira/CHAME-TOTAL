import { useSystemDialog } from '../../components/SystemDialog';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, Undo2, Ban } from 'lucide-react';
import { SaleOverview } from './SaleOverview';
import { ReceiptDocument, ReceiptPreview, type SaleRecord } from './ReceiptDocument';
import './sale-document.css';
import { Decimal } from '@chame/shared';
import { api, newKey } from '../../services/api';
import { useSession, can } from '../../app/session';
import { Title, Feedback, Loading } from '../../components/ui';
import { brl, date, decimalInput, statusLabels } from '../../utilities/format';
type Sale = SaleRecord;
export function SaleDetail() {
  const { confirm, prompt } = useSystemDialog();
  const { id } = useParams(),
    user = useSession(),
    cache = useQueryClient(),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [returning, setReturning] = useState(false),
    [preview, setPreview] = useState(false),
    [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>('a4'),
    [reason, setReason] = useState(''),
    [method, setMethod] = useState('CASH'),
    [quantities, setQuantities] = useState<Record<string, string>>({}),
    [restock, setRestock] = useState<Record<string, boolean>>({}),
    key = useRef(newKey());
  const query = useQuery({ queryKey: ['sale', id], queryFn: () => api<Sale>('sales/' + id) });
  const d = query.data;
  async function cancel() {
    const why = await prompt('Informe o motivo do cancelamento (mínimo 5 caracteres).', {
      title: 'Cancelar venda',
      confirmLabel: 'Continuar',
      minLength: 5,
    });
    if (!why || !(await confirm('Confirmar cancelamento e estorno integral desta venda?'))) return;
    setBusy(true);
    try {
      await api(`sales/${id}/cancel`, { method: 'POST', body: { reason: why }, key: key.current });
      await cache.invalidateQueries({ queryKey: ['sale', id] });
      key.current = newKey();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!(await confirm('Confirmar devolução e registrar o reembolso?'))) return;
    setBusy(true);
    setError(undefined);
    try {
      const items = d!.items
        .filter((i) => Number(quantities[i.id]) > 0)
        .map((i) => ({
          saleItemId: i.id,
          quantity: quantities[i.id],
          restock: restock[i.id] ?? true,
        }));
      await api(`sales/${id}/returns`, {
        method: 'POST',
        body: { reason, items, refundMethod: method },
        key: key.current,
      });
      await cache.invalidateQueries({ queryKey: ['sale', id] });
      setReturning(false);
      setQuantities({});
      setReason('');
      key.current = newKey();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="no-print">
        <Title
          title={d ? `Venda nº ${d.code}` : 'Detalhes da venda'}
          actions={
            <>
              <Link className="button" to="/sales">
                <ArrowLeft size={14} />
                Voltar
              </Link>
              <button className="primary" disabled={!d} onClick={() => setPreview(true)}>
                <Printer size={14} />
                Imprimir comprovante
              </button>
              {can(user, 'sales.cancel') && (
                <button
                  disabled={busy || d?.status !== 'CONFIRMED' || Number(d?.returnedTotal) > 0}
                  onClick={cancel}
                >
                  <Ban size={13} />
                  Cancelar venda
                </button>
              )}
              {can(user, 'sales.return') && (
                <button
                  disabled={
                    busy ||
                    d?.status !== 'CONFIRMED' ||
                    Number(d?.returnedTotal) >= Number(d?.total)
                  }
                  onClick={() => setReturning(!returning)}
                >
                  <Undo2 size={13} />
                  Devolver itens
                </button>
              )}
            </>
          }
        />
        <Feedback error={error ?? query.error} />
      </div>
      {query.isLoading ? (
        <Loading />
      ) : (
        d && (
          <>
            <SaleOverview sale={d} />
            <style media="print">
              {printFormat === 'thermal'
                ? '@page { size: 80mm 297mm; margin: 4mm; }'
                : '@page { size: A4; margin: 12mm; }'}
            </style>
            <div className="sale-print" data-format={printFormat}>
              <ReceiptDocument sale={d} format={printFormat} />
            </div>
            {preview && (
              <ReceiptPreview
                sale={d}
                format={printFormat}
                onFormat={setPrintFormat}
                onClose={() => setPreview(false)}
              />
            )}
            {returning && (
              <form className="record-form no-print" onSubmit={submit}>
                <section className="form-section">
                  <h2>Devolução parcial ou total</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Disponível para devolver</th>
                        <th>Devolver</th>
                        <th>Repor estoque</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.items.map((i) => (
                        <tr key={i.id}>
                          <td>{String(i.name)}</td>
                          <td>
                            {new Decimal(String(i.quantity))
                              .minus(String(i.returnedQuantity))
                              .toString()}
                          </td>
                          <td>
                            <input
                              className="number-field"
                              aria-label={`Devolver ${i.name}`}
                              value={quantities[i.id] ?? '0'}
                              onChange={(e) => {
                                setQuantities((v) => ({
                                  ...v,
                                  [i.id]: decimalInput(e.target.value),
                                }));
                                key.current = newKey();
                              }}
                            />
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Repor ${i.name}`}
                              checked={restock[i.id] ?? true}
                              onChange={(e) => {
                                setRestock((v) => ({ ...v, [i.id]: e.target.checked }));
                                key.current = newKey();
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="form-grid">
                    <label>
                      Motivo
                      <textarea
                        value={reason}
                        minLength={5}
                        required
                        onChange={(e) => {
                          setReason(e.target.value);
                          key.current = newKey();
                        }}
                      />
                    </label>
                    <label>
                      Forma do reembolso
                      <select
                        value={method}
                        onChange={(e) => {
                          setMethod(e.target.value);
                          key.current = newKey();
                        }}
                      >
                        {['CASH', 'PIX', 'DEBIT', 'CREDIT', 'OTHER'].map((m) => (
                          <option key={m} value={m}>
                            {statusLabels[m]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>
                <div className="form-actions">
                  <button className="primary" disabled={busy}>
                    Confirmar devolução
                  </button>
                </div>
              </form>
            )}
            {d.returns.length > 0 && (
              <section className="panel">
                <h2>Histórico de devoluções</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Motivo</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.returns.map((r) => (
                      <tr key={r.id}>
                        <td>{date(r.createdAt)}</td>
                        <td>{String(r.reason)}</td>
                        <td>{brl(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )
      )}
    </>
  );
}
