import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, newKey } from '../services/api';
import { RemoteSelect } from './RemoteSelect';
import { Feedback, Title } from './ui';
import { decimalInput } from '../utilities/format';
import type { Field } from '../modules/catalog/config';
export function ActionForm({
  title,
  endpoint,
  fields,
  defaults = {},
  back,
  invalidate,
  transform,
  method = 'POST',
}: {
  title: string;
  endpoint: string;
  fields: Field[];
  defaults?: Record<string, unknown>;
  back: string;
  invalidate: string[];
  transform?: (values: Record<string, unknown>) => unknown;
  method?: string;
}) {
  const [values, setValues] = useState(defaults),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    key = useRef(newKey()),
    navigate = useNavigate(),
    cache = useQueryClient();
  function change(name: string, value: unknown) {
    setValues((v) => ({ ...v, [name]: value }));
    key.current = newKey();
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api(endpoint, {
        method,
        body: transform ? transform(values) : values,
        key: key.current,
      });
      await Promise.all(invalidate.map((k) => cache.invalidateQueries({ queryKey: [k] })));
      navigate(back);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title title={title} />
      <Feedback error={error} />
      <form className="record-form" onSubmit={submit}>
        <section className="form-section">
          <h2>Dados da operação</h2>
          <div className="form-grid">
            {fields.map((f) => (
              <label key={f.name} className={f.type === 'textarea' ? 'span-all' : ''}>
                {f.label}
                {f.required && ' *'}
                {f.resource ? (
                  <RemoteSelect
                    resource={f.resource}
                    label={f.label}
                    value={String(values[f.name] ?? '')}
                    onChange={(v) => change(f.name, v || null)}
                    required={f.required}
                  />
                ) : f.type === 'select' ? (
                  <select
                    value={String(values[f.name] ?? '')}
                    onChange={(e) => change(f.name, e.target.value)}
                    required={f.required}
                  >
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea
                    aria-label={f.label}
                    value={String(values[f.name] ?? '')}
                    onChange={(e) => change(f.name, e.target.value)}
                    required={f.required}
                  />
                ) : (
                  <input
                    aria-label={f.label}
                    type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                    inputMode={f.type === 'decimal' ? 'decimal' : undefined}
                    value={String(values[f.name] ?? '')}
                    onChange={(e) =>
                      change(
                        f.name,
                        f.type === 'decimal' ? decimalInput(e.target.value) : e.target.value,
                      )
                    }
                    required={f.required}
                  />
                )}
              </label>
            ))}
          </div>
        </section>
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            {busy ? 'Processando…' : 'Confirmar operação'}
          </button>
          <button type="button" disabled={busy} onClick={() => navigate(back)}>
            Cancelar
          </button>
        </div>
      </form>
    </>
  );
}
