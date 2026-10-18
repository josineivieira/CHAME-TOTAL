import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSystemDialog } from '../../components/SystemDialog';
import { newKey } from '../../services/api';
import { Title } from '../../components/ui';
import { brl } from '../../utilities/format';
import { RecordActivity } from '../../components/RecordActivity';
import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Decimal } from '@chame/shared';
import { api, type Row } from '../../services/api';
import { ActionForm } from '../../components/ActionForm';
import { Feedback, Loading } from '../../components/ui';
export function SettlementPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['finance-entry', id],
    queryFn: () => api<Row>('finance/' + id),
  });
  if (query.isLoading) return <Loading />;
  if (!query.data) return <Feedback error={query.error} />;
  if (query.data.source === 'PERSONNEL') return <Navigate to={'/personnel/' + id} replace />;
  return (
    <>
      <Classification entry={query.data} />
      {query.data.status !== 'CANCELLED' &&
      new Decimal(String(query.data.amount)).gt(String(query.data.settledAmount)) ? (
        <ActionForm
          title={`Baixa: ${query.data.description}`}
          endpoint={`company-payments/finance/${id}`}
          fields={[
            { name: 'amount', label: 'Valor da baixa', type: 'decimal', required: true },
            {
              name: 'method',
              label: 'Forma de pagamento',
              type: 'select',
              options: [
                { value: 'PIX', label: 'Pix' },
                { value: 'CASH', label: 'Dinheiro' },
                { value: 'BANK', label: 'Banco / transferência' },
                { value: 'DEBIT', label: 'Débito' },
                { value: 'CREDIT', label: 'Crédito' },
                { value: 'OTHER', label: 'Outros' },
              ],
            },
          ]}
          defaults={{
            amount: new Decimal(String(query.data.amount))
              .minus(String(query.data.settledAmount))
              .toFixed(2),
            method: 'PIX',
          }}
          back="/finance"
          invalidate={['finance', 'treasury', 'company-results']}
        />
      ) : (
        <Title
          title={String(query.data.description)}
          subtitle={
            brl(query.data.amount) +
            ' ? ' +
            (query.data.status === 'CANCELLED' ? 'Cancelado' : 'Liquidado')
          }
        />
      )}
      <RecordActivity value={query.data.activity} />
    </>
  );
}

function Classification({ entry }: { entry: Row }) {
  const cache = useQueryClient(),
    { prompt } = useSystemDialog();
  const [group, setGroup] = useState(String(entry.resultGroup ?? 'OPERATING'));
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  if (entry.source !== 'MANUAL') return null;
  async function save() {
    const reason = await prompt('Informe o motivo da classificação.', { minLength: 5 });
    if (!reason) return;
    setBusy(true);
    setError(undefined);
    try {
      await api('company-payments/finance/' + entry.id + '/classify', {
        method: 'POST',
        body: { resultGroup: group, reason },
        key: newKey(),
      });
      await Promise.all(
        ['finance-entry', 'finance', 'company-results'].map((k) =>
          cache.invalidateQueries({ queryKey: [k] }),
        ),
      );
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-body">
        <label>
          Classificação no resultado
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="OPERATING">Receita / despesa operacional</option>
            <option value="INVENTORY">Compra de mercadorias / estoque</option>
            <option value="CAPITAL">Capital / adiantamento / investimento</option>
            <option value="FINANCING">Empréstimos / financiamentos</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || group === entry.resultGroup}
          onClick={() => void save()}
        >
          Salvar classificação
        </button>
        <Feedback error={error} />
      </div>
    </section>
  );
}
