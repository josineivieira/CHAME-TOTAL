import { RecordActivity } from '../../components/RecordActivity';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsSchema } from '@chame/shared';
import type { z } from 'zod';
import { api } from '../../services/api';
import { useSession, can } from '../../app/session';
import { Title, Feedback, Loading } from '../../components/ui';
type Settings = z.infer<typeof settingsSchema>;
export function SettingsPage() {
  const user = useSession(),
    cache = useQueryClient(),
    [error, setError] = useState<unknown>(),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    form = useForm<Settings>();
  const query = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<Settings & { activity: unknown }>('settings'),
  });
  useEffect(() => {
    if (query.data) {
      const values = Object.fromEntries(
        Object.keys(settingsSchema.shape).map((k) => [k, query.data![k as keyof Settings]]),
      );
      form.reset(settingsSchema.parse(values));
    }
  }, [query.data, form]);
  async function save(values: Settings) {
    setBusy(true);
    setError(undefined);
    try {
      await api('settings', { method: 'PUT', body: settingsSchema.parse(values) });
      setMessage('Configurações salvas e auditadas.');
      await cache.invalidateQueries({ queryKey: ['settings'] });
      await cache.invalidateQueries({ queryKey: ['session'] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title title="Configurações" />
      <Feedback error={error ?? query.error} success={message} />
      {query.isLoading ? (
        <Loading />
      ) : (
        <form className="record-form" onSubmit={form.handleSubmit(save)}>
          <section className="form-section">
            <h2>Dados da empresa</h2>
            <div className="form-grid">
              {[
                ['companyName', 'Nome fantasia'],
                ['legalName', 'Razão social'],
                ['document', 'CNPJ'],
                ['phone', 'Telefone'],
                ['email', 'Email'],
                ['address', 'Endereço'],
              ].map(([name, label]) => (
                <label key={name}>
                  {label}
                  <input
                    {...form.register(name as keyof Settings)}
                    disabled={!can(user, 'settings.manage')}
                  />
                </label>
              ))}
            </div>
          </section>
          <section className="form-section">
            <h2>Parâmetros comerciais</h2>
            <div className="form-grid">
              <label>
                Fuso horário
                <input
                  {...form.register('timezone')}
                  placeholder="America/Sao_Paulo"
                  disabled={!can(user, 'settings.manage')}
                />
              </label>
              <label>
                Desconto máximo (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  {...form.register('maxDiscountPercent', { valueAsNumber: true })}
                  disabled={!can(user, 'settings.manage')}
                />
              </label>
              <label>
                Pontos por real vendido
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  {...form.register('loyaltyPointsPerReal', { valueAsNumber: true })}
                  disabled={!can(user, 'settings.manage')}
                />
              </label>
            </div>
            <p className="muted">
              Estoque negativo proibido. Comissões calculadas sobre a venda líquida e compensadas
              nas devoluções. Pagamentos e comprovantes não fiscais.
            </p>
          </section>
          {can(user, 'settings.manage') && (
            <div className="form-actions">
              <button className="primary" disabled={busy}>
                Salvar configurações
              </button>
            </div>
          )}
          <RecordActivity value={query.data?.activity} />
        </form>
      )}
    </>
  );
}
