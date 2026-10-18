import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, newKey, type Row } from '../../services/api';
import { brl } from '../../utilities/format';
import { Feedback } from '../../components/ui';
import { useSystemDialog } from '../../components/SystemDialog';
export function PurchaseRefund({
  purchaseId,
  issue,
  close,
}: {
  purchaseId: string;
  issue: Row;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    key = useRef(newKey()),
    cache = useQueryClient(),
    { confirm } = useSystemDialog();
  const [method, setMethod] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (
        !(await confirm(
          `Você confirma que recebeu ${brl(issue.amount)} do fornecedor? O valor voltará ao Caixa da empresa e a falta será encerrada.`,
          { title: 'Confirmar dinheiro recebido', confirmLabel: 'Confirmar reembolso recebido' },
        ))
      )
        return;
      await api(`purchases/${purchaseId}/issues/${issue.id}/refund`, {
        method: 'POST',
        body: { method, reason },
        key: key.current,
      });
      await Promise.all(
        ['purchase', 'treasury', 'finance', 'purchases'].map((k) =>
          cache.invalidateQueries({ queryKey: k === 'purchase' ? ['purchase', purchaseId] : [k] }),
        ),
      );
      close();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="purchase-refund-dialog"
      aria-labelledby="purchase-refund-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <form onSubmit={submit}>
        <header>
          <h2 id="purchase-refund-title">Reembolso da compra</h2>
          <button type="button" aria-label="Fechar reembolso" disabled={busy} onClick={close}>
            ×
          </button>
        </header>
        <div className="purchase-refund-body">
          <Feedback error={error} />
          <dl>
            <dt>Valor recebido do fornecedor</dt>
            <dd>{brl(issue.amount)}</dd>
          </dl>
          <p>
            Confirme somente depois de receber o dinheiro. Os itens faltantes serão encerrados sem
            entrada no estoque.
          </p>
          <label>
            Forma de recebimento
            <select
              aria-label="Forma de recebimento do reembolso"
              required
              disabled={busy}
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                key.current = newKey();
              }}
            >
              <option value="">Selecione</option>
              <option value="CASH">Dinheiro</option>
              <option value="PIX">Pix</option>
              <option value="DEBIT">Débito</option>
              <option value="CREDIT">Crédito</option>
              <option value="BANK">Banco / transferência</option>
              <option value="OTHER">Outros</option>
            </select>
          </label>
          <label>
            Referência / comprovante
            <textarea
              aria-label="Referência do reembolso"
              minLength={5}
              maxLength={1000}
              required
              disabled={busy}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                key.current = newKey();
              }}
            />
          </label>
        </div>
        <footer>
          <button type="button" disabled={busy} onClick={close}>
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Registrando...' : 'Confirmar reembolso recebido'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
