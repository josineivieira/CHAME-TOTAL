import { PurchaseRefund } from './PurchaseRefund';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, newKey, type Row } from '../../services/api';
import { brl, date, text } from '../../utilities/format';
import { Feedback } from '../../components/ui';
import { useSystemDialog } from '../../components/SystemDialog';
const actions: Record<string, string> = {
  WAIT: 'Aguardar entrega',
  REFUND: 'Reembolso solicitado',
  CREDIT: 'Crédito com fornecedor',
};
export function PurchaseIssues({
  id,
  items,
  issues,
  manage,
  prepaid,
  financial,
}: {
  id: string;
  items: Row[];
  issues: Row[];
  manage: boolean;
  prepaid: boolean;
  financial: boolean;
}) {
  const [refund, setRefund] = useState<Row>();
  const [itemId, setItem] = useState(''),
    [action, setAction] = useState('WAIT'),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const key = useRef(newKey()),
    resolveKeys = useRef(new Map<string, string>()),
    cache = useQueryClient(),
    { confirm, prompt } = useSystemDialog();
  const missing = items.filter(
    (item) =>
      Number(item.quantity) > Number(item.receivedQuantity) + Number(item.cancelledQuantity ?? 0),
  );
  const available = missing.filter(
    (item) => !issues.some((issue) => issue.purchaseItemId === item.id && issue.status === 'OPEN'),
  );
  async function refresh() {
    await cache.invalidateQueries({ queryKey: ['purchase', id] });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(undefined);
    if (
      !(await confirm(
        'Registrar a tratativa da quantidade ainda não recebida? Este registro não movimenta estoque ou dinheiro.',
        { title: 'Falta de mercadoria', confirmLabel: 'Registrar tratativa' },
      ))
    )
      return;
    setBusy(true);
    try {
      await api(`purchases/${id}/issues`, {
        method: 'POST',
        body: { purchaseItemId: itemId, action, reason },
        key: key.current,
      });
      setItem('');
      setReason('');
      key.current = newKey();
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  async function resolve(issue: Row) {
    if (busy) return;
    const note = await prompt(
      'Descreva o resultado acordado com o fornecedor. O encerramento registra o acompanhamento; não cancela itens nem movimenta valores no financeiro.',
      { title: 'Encerrar tratativa', confirmLabel: 'Encerrar', minLength: 5 },
    );
    if (!note) return;
    setBusy(true);
    setError(undefined);
    try {
      const previous = resolveKeys.current.get(issue.id);
      const retryKey = previous ?? newKey();
      resolveKeys.current.set(issue.id, retryKey);
      await api(`purchases/${id}/issues/${issue.id}/resolve`, {
        method: 'POST',
        body: { reason: note },
        key: retryKey,
      });
      resolveKeys.current.delete(issue.id);
      await refresh();
    } catch (err) {
      resolveKeys.current.delete(issue.id);
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  if (!missing.length && !issues.length) return null;
  return (
    <>
      <section className="purchase-record purchase-issues">
        <div className="purchase-section-heading">
          <h2>Faltas e tratativas com o fornecedor</h2>
          <span>{issues.filter((issue) => issue.status === 'OPEN').length} em aberto</span>
        </div>
        <Feedback error={error} />
        {issues.length > 0 && (
          <div className="purchase-table-scroll">
            <table className="purchase-table">
              <thead>
                <tr>
                  <th>Produto / registro</th>
                  <th>Qtd. na abertura</th>
                  <th>Valor de referência</th>
                  <th>Tratativa</th>
                  <th>Situação</th>
                  {manage && <th>Ação</th>}
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <strong>
                        {text(items.find((item) => item.id === issue.purchaseItemId)?.name)}
                      </strong>
                      <small>{date(issue.createdAt)}</small>
                      <p>{text(issue.reason)}</p>
                      {!!issue.resolution && (
                        <p className="muted">Encerramento: {text(issue.resolution)}</p>
                      )}
                    </td>
                    <td>{Number(issue.quantity).toLocaleString('pt-BR')}</td>
                    <td>{brl(issue.amount)}</td>
                    <td>{actions[String(issue.action)]}</td>
                    <td>
                      {issue.refundEntryId
                        ? 'Reembolso recebido'
                        : issue.status === 'OPEN'
                          ? 'Em acompanhamento'
                          : 'Encerrada'}
                    </td>
                    {manage && (
                      <td>
                        {issue.status === 'OPEN' &&
                          issue.action === 'REFUND' &&
                          prepaid &&
                          financial && (
                            <button
                              type="button"
                              className="primary"
                              disabled={busy}
                              onClick={() => setRefund(issue)}
                            >
                              Confirmar reembolso recebido
                            </button>
                          )}
                        {issue.status === 'OPEN' && (
                          <button type="button" disabled={busy} onClick={() => resolve(issue)}>
                            {issue.action === 'REFUND' ? 'Cancelar solicitação' : 'Encerrar'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {manage && available.length > 0 && (
          <form onSubmit={submit} className="purchase-issue-form">
            <h3>Registrar falta</h3>
            <div className="form-grid">
              <label>
                Item pendente
                <select
                  aria-label="Item pendente"
                  required
                  value={itemId}
                  disabled={busy}
                  onChange={(e) => {
                    setItem(e.target.value);
                    key.current = newKey();
                  }}
                >
                  <option value="">Selecione o item</option>
                  {available.map((item) => (
                    <option key={item.id} value={item.id}>
                      {text(item.name)} · faltam{' '}
                      {(
                        Number(item.quantity) -
                        Number(item.receivedQuantity) -
                        Number(item.cancelledQuantity ?? 0)
                      ).toLocaleString('pt-BR')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tratativa
                <select
                  aria-label="Tratativa"
                  value={action}
                  disabled={busy}
                  onChange={(e) => {
                    setAction(e.target.value);
                    key.current = newKey();
                  }}
                >
                  <option value="WAIT">Aguardar entrega restante</option>
                  <option value="REFUND">Solicitar reembolso</option>
                  <option value="CREDIT">Manter crédito com o fornecedor</option>
                </select>
              </label>
              <label className="span-all">
                Detalhes / acordo com o fornecedor
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  value={reason}
                  disabled={busy}
                  onChange={(e) => {
                    setReason(e.target.value);
                    key.current = newKey();
                  }}
                />
              </label>
            </div>
            <div className="purchase-issue-actions">
              <p>
                O valor corresponde à falta na abertura da tratativa. Reembolso e crédito ficam em
                acompanhamento. A entrada de dinheiro ocorre somente em Confirmar reembolso
                recebido.
              </p>
              <button className="primary" disabled={busy || !itemId}>
                {busy ? 'Registrando...' : 'Registrar tratativa'}
              </button>
            </div>
          </form>
        )}
      </section>
      {refund && (
        <PurchaseRefund purchaseId={id} issue={refund} close={() => setRefund(undefined)} />
      )}
    </>
  );
}
