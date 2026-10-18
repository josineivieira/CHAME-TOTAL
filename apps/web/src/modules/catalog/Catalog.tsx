import { RecordActivity } from '../../components/RecordActivity';
import { useDiscardConfirmation } from '../../components/SystemDialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams, useBlocker } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { api, type Page, type Row } from '../../services/api';
import { can, useSession } from '../../app/session';
import { Title, DataTable, Pager, Feedback, Loading, useUnsaved } from '../../components/ui';
import { RemoteSelect } from '../../components/RemoteSelect';
import { decimalInput } from '../../utilities/format';
import { entities } from './config';
export function Catalog({ resource }: { resource: string }) {
  const config = entities[resource],
    user = useSession(),
    [params, setParams] = useSearchParams(),
    [selected, setSelected] = useState<Row>();
  const page = Number(params.get('page') ?? 1),
    q = params.get('q') ?? '',
    active = params.get('active') ?? 'all',
    sort = params.get('sort') ?? 'name',
    order = params.get('order') ?? 'asc';
  const query = useQuery({
    queryKey: [resource, params.toString()],
    queryFn: () =>
      api<Page>(
        `${resource}?page=${page}&pageSize=25&q=${encodeURIComponent(q)}&active=${active}&sort=${sort}&order=${order}`,
      ),
  });
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') next.set('page', '1');
    setParams(next);
    setSelected(undefined);
  };
  return (
    <>
      <Title
        title={config.title}
        actions={
          <>
            {selected && (
              <Link className="button" to={`/${resource}/${selected.id}`}>
                Visualizar
              </Link>
            )}
            {can(user, config.write) && (
              <>
                <Link className="button primary" to={`/${resource}/new`}>
                  Novo
                </Link>
                {selected && (
                  <Link className="button" to={`/${resource}/${selected.id}/edit`}>
                    Editar selecionado
                  </Link>
                )}
              </>
            )}
          </>
        }
      />
      <div className="toolbar">
        <label>
          Pesquisar
          <input
            placeholder="Nome ou identificador…"
            value={q}
            onChange={(e) => update('q', e.target.value)}
          />
        </label>
        <label>
          Situação
          <select value={active} onChange={(e) => update('active', e.target.value)}>
            <option value="all">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </label>
        <button onClick={() => query.refetch()}>Atualizar</button>
      </div>
      <Feedback error={query.error} />
      {query.isLoading ? (
        <Loading />
      ) : (
        <>
          <DataTable
            rows={query.data?.data ?? []}
            columns={config.columns}
            selected={selected?.id}
            onSelect={setSelected}
            onSort={(key) => {
              if (config.columns.some((c) => c.key === key && c.sortable !== false)) {
                const next = new URLSearchParams(params);
                next.set('sort', key);
                next.set('order', sort === key && order === 'asc' ? 'desc' : 'asc');
                setParams(next);
              }
            }}
          />
          <Pager
            page={page}
            total={query.data?.pagination.total ?? 0}
            pageSize={25}
            onChange={(p) => update('page', String(p))}
          />
        </>
      )}
    </>
  );
}
export function EntityForm({ resource }: { resource: string }) {
  const config = entities[resource],
    { id } = useParams(),
    navigate = useNavigate(),
    cache = useQueryClient(),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const form = useForm<Record<string, unknown>>({ defaultValues: config.defaults });
  const query = useQuery({
    queryKey: [resource, id],
    queryFn: () => api<Row>(resource + '/' + id),
    enabled: !!id,
  });
  useEffect(() => {
    if (query.data) {
      const values: Record<string, unknown> = { ...config.defaults };
      for (const field of config.fields) {
        const v = query.data[field.name];
        values[field.name] =
          field.type === 'date'
            ? String(v ?? '').slice(0, 10)
            : (v ?? (field.type === 'checkbox' ? true : ''));
      }
      if (resource === 'products') values.variantAttributes = query.data.variantAttributes ?? {};
      form.reset(values);
    }
  }, [query.data, form, config, resource]);
  useUnsaved(form.formState.isDirty);
  const blocker = useBlocker(form.formState.isDirty && !busy);
  useDiscardConfirmation(blocker, 'Descartar alterações não salvas?');
  async function save(values: Record<string, unknown>) {
    setError(undefined);
    const parsed = config.schema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        form.setError(issue.path.join('.'), { message: issue.message });
      setError(new Error('Verifique os campos indicados.'));
      return;
    }
    setBusy(true);
    try {
      await api(resource + (id ? '/' + id : ''), {
        method: id ? 'PUT' : 'POST',
        body: parsed.data,
      });
      form.reset(values);
      await cache.invalidateQueries({ queryKey: [resource] });
      navigate('/' + resource);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const sections = [
    ...new Set(
      config.fields
        .filter((f) => f.type !== 'checkbox')
        .map((f) => f.section)
        .filter(Boolean),
    ),
  ];
  let current = sections[0];
  const grouped = config.fields.map((f) => {
    if (f.section) current = f.section;
    return { ...f, group: current };
  });
  return (
    <>
      <Title title={`${id ? 'Editar' : 'Novo'} ${config.singular.toLowerCase()}`} />
      <Feedback error={error ?? query.error} />
      {query.isLoading && id ? (
        <Loading />
      ) : (
        <form onSubmit={form.handleSubmit(save)} className="record-form catalog-form">
          <div className="record-sheet">
            {sections.map((section) => (
              <section className="form-section" key={section}>
                <h2>{section}</h2>
                <div className="form-grid">
                  {grouped
                    .filter((f) => f.group === section && f.type !== 'checkbox')
                    .map((field) => (
                      <label
                        className={field.type === 'textarea' ? 'span-all' : ''}
                        key={field.name}
                      >
                        {field.label}
                        {field.required && ' *'}
                        {field.resource ? (
                          <Controller
                            control={form.control}
                            name={field.name}
                            render={({ field: f }) => (
                              <RemoteSelect
                                resource={field.resource!}
                                value={String(f.value ?? '')}
                                label={field.label}
                                onChange={(v) => f.onChange(v || null)}
                                required={field.required}
                              />
                            )}
                          />
                        ) : field.type === 'select' ? (
                          <select {...form.register(field.name)}>
                            {field.options?.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : field.type === 'textarea' ? (
                          <textarea {...form.register(field.name)} rows={3} />
                        ) : field.type === 'checkbox' ? (
                          <input type="checkbox" {...form.register(field.name)} />
                        ) : (
                          <input
                            {...form.register(field.name, {
                              setValueAs:
                                field.type === 'decimal'
                                  ? (v) => decimalInput(String(v))
                                  : undefined,
                            })}
                            type={field.type === 'decimal' ? 'text' : (field.type ?? 'text')}
                            inputMode={field.type === 'decimal' ? 'decimal' : undefined}
                            required={field.required}
                          />
                        )}
                        <small className="field-error">
                          {String(form.formState.errors[field.name]?.message ?? '')}
                        </small>
                      </label>
                    ))}
                </div>
              </section>
            ))}
            <>
              {resource === 'products' && (
                <section className="form-section">
                  <h2>Características da variante / SKU</h2>
                  <div className="form-grid">
                    {[
                      ['tamanho', 'Tamanho'],
                      ['cor', 'Cor'],
                      ['modelo', 'Modelo'],
                    ].map(([name, label]) => (
                      <label key={name}>
                        {label}
                        <input {...form.register(`variantAttributes.${name}`)} />
                      </label>
                    ))}
                  </div>
                </section>
              )}
            </>
          </div>
          <div className="record-footer">
            <div className="record-status">
              {config.fields
                .filter((field) => field.type === 'checkbox')
                .map((field) => (
                  <label className="status-control" key={field.name}>
                    <input type="checkbox" {...form.register(field.name)} />
                    <span>{field.label}</span>
                  </label>
                ))}
            </div>
            <div className="form-actions">
              <button className="primary" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar cadastro'}
              </button>
              <button type="button" onClick={() => navigate('/' + resource)}>
                Cancelar
              </button>
            </div>
          </div>
          {id && query.data && <RecordActivity value={query.data.activity} />}
        </form>
      )}
    </>
  );
}
