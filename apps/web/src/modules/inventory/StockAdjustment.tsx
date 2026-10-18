import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Decimal } from '@chame/shared';
import { api, newKey } from '../../services/api';
import { RemoteSelect } from '../../components/RemoteSelect';
import { Feedback, Title } from '../../components/ui';
import { useSystemDialog } from '../../components/SystemDialog';
import { decimalInput } from '../../utilities/format';
export function StockAdjustment() {
  const [direction, setDirection] = useState('IN'),
    [productId, setProduct] = useState(''),
    [quantity, setQuantity] = useState('1'),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const key = useRef(newKey()),
    navigate = useNavigate(),
    cache = useQueryClient(),
    { confirm } = useSystemDialog();
  function changed() {
    key.current = newKey();
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(undefined);
    try {
      if (!/^\d+(?:\.\d{1,3})?$/.test(quantity))
        throw new Error('Informe uma quantidade positiva com at\u00e9 3 casas decimais.');
      const amount = new Decimal(quantity);
      if (!amount.isFinite() || !amount.gt(0) || amount.decimalPlaces() > 3)
        throw new Error('Informe uma quantidade positiva com até 3 casas decimais.');
      if (reason.trim().length < 5)
        throw new Error('Descreva o motivo com pelo menos 5 caracteres.');
      if (
        !(await confirm(
          `${direction === 'IN' ? 'Adicionar' : 'Retirar'} ${amount.toString()} unidade(s) do estoque?`,
          {
            title: 'Ajuste manual de estoque',
            confirmLabel: direction === 'IN' ? 'Confirmar entrada' : 'Confirmar saída',
          },
        ))
      )
        return;
      setBusy(true);
      await api('inventory/adjust', {
        method: 'POST',
        body: {
          productId,
          quantity: amount.times(direction === 'IN' ? 1 : -1).toString(),
          reason: reason.trim(),
        },
        key: key.current,
      });
      await Promise.all(
        ['inventory', 'products'].map((k) => cache.invalidateQueries({ queryKey: [k] })),
      );
      navigate('/inventory');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title title="Ajuste manual de estoque" />
      <Feedback error={error} />
      <form className="record-form" onSubmit={submit}>
        <section className="form-section">
          <h2>Movimentação</h2>
          <p className="muted">
            Corrija o estoque por contagem, avaria ou entrada avulsa. Mercadoria comprada deve ser
            recebida em Compras.
          </p>
          <div className="form-grid">
            <label>
              Operação
              <select
                value={direction}
                onChange={(e) => {
                  setDirection(e.target.value);
                  changed();
                }}
                disabled={busy}
              >
                <option value="IN">Entrada — adicionar ao estoque</option>
                <option value="OUT">Saída — retirar do estoque</option>
              </select>
            </label>
            <label>
              Produto *
              <RemoteSelect
                resource="products"
                label="Produto"
                value={productId}
                onChange={(v) => {
                  setProduct(v);
                  changed();
                }}
                required
              />
            </label>
            <label>
              Quantidade *
              <input
                aria-label="Quantidade"
                inputMode="decimal"
                value={quantity}
                disabled={busy}
                onChange={(e) => {
                  setQuantity(decimalInput(e.target.value));
                  changed();
                }}
                required
              />
              <small>Informe a quantidade sem sinal negativo.</small>
            </label>
            <label className="span-all">
              Motivo *
              <textarea
                aria-label="Motivo"
                minLength={5}
                maxLength={500}
                value={reason}
                disabled={busy}
                onChange={(e) => {
                  setReason(e.target.value);
                  changed();
                }}
                required
              />
            </label>
          </div>
        </section>
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            {busy ? 'Registrando...' : direction === 'IN' ? 'Registrar entrada' : 'Registrar saída'}
          </button>
          <button type="button" disabled={busy} onClick={() => navigate('/inventory')}>
            Cancelar
          </button>
        </div>
      </form>
    </>
  );
}
