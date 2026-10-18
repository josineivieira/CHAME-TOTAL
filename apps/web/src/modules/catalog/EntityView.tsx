import { RecordActivity } from '../../components/RecordActivity';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type Row } from '../../services/api';
import { can, useSession } from '../../app/session';
import { Title, Feedback, Loading, DataTable } from '../../components/ui';
import { brl, date, text } from '../../utilities/format';
import { entities, type Field } from './config';
import { ArrowLeft, FileText, Pencil } from 'lucide-react';
type History = {
  totalSpent: string;
  saleCount: number;
  averageTicket: string;
  lastPurchase: string | null;
  sales: Row[];
};
export function EntityView({ resource }: { resource: string }) {
  const { id } = useParams(),
    user = useSession(),
    config = entities[resource];
  const query = useQuery({
      queryKey: [resource, id],
      queryFn: () => api<Row>(`${resource}/${id}`),
    }),
    history = useQuery({
      queryKey: ['customer-history', id],
      queryFn: () => api<History>(`customers/${id}/history`),
      enabled: resource === 'customers',
    });
  const row = query.data;
  const sections: { name: string; fields: Field[] }[] = [];
  for (const field of config.fields) {
    if (field.type === 'checkbox') continue;
    if (field.section || !sections.length)
      sections.push({ name: field.section ?? 'Identificação', fields: [] });
    sections[sections.length - 1].fields.push(field);
  }
  return (
    <>
      <Title
        title={config.singular}
        actions={
          <>
            <Link className="button" to={'/' + resource}>
              <ArrowLeft size={14} />
              Voltar
            </Link>
            {can(user, config.write) && (
              <Link className="button primary" to={`/${resource}/${id}/edit`}>
                <Pencil size={13} />
                Editar cadastro
              </Link>
            )}
          </>
        }
      />
      <Feedback error={query.error ?? history.error} />
      {query.isLoading ? (
        <Loading />
      ) : (
        row && (
          <article className="desktop-record">
            <div className="record-windowbar">
              <span>
                <FileText size={15} />
                Ficha cadastral
              </span>
              <span>{row.code != null ? 'Código ' + text(row.code) : config.singular}</span>
            </div>
            <header className="record-identity">
              <div>
                <h2>{text(row.name)}</h2>
                {resource === 'products' && (
                  <p>
                    SKU {text(row.sku)}
                    <span>Unidade {text(row.unit)}</span>
                  </p>
                )}
              </div>
              <span className={'record-state ' + (row.active ? 'is-active' : '')}>
                <i />
                {row.active ? 'Ativo' : 'Inativo'}
              </span>
            </header>
            <div className="record-sections">
              {sections.map((section) => (
                <section className="record-detail-section" key={section.name}>
                  <h3>{section.name}</h3>
                  <dl className="record-values">
                    {section.fields.map((field) => (
                      <div
                        key={field.name}
                        className={field.type === 'textarea' ? 'record-value-wide' : ''}
                      >
                        <dt>{field.label.replace(/ \*$/, '')}</dt>
                        <dd>
                          <RecordValue field={field} row={row} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
              {resource === 'products' &&
              row.variantAttributes &&
              typeof row.variantAttributes === 'object' &&
              Object.values(row.variantAttributes).some(Boolean) ? (
                <section className="record-detail-section">
                  <h3>Características</h3>
                  <dl className="record-values">
                    {Object.entries(row.variantAttributes)
                      .filter(([, v]) => v != null && String(v).trim())
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt>
                            {(
                              { cor: 'Cor', tamanho: 'Tamanho', modelo: 'Modelo' } as Record<
                                string,
                                string
                              >
                            )[key] ?? key}
                          </dt>
                          <dd>{text(value)}</dd>
                        </div>
                      ))}
                  </dl>
                </section>
              ) : null}
            </div>
            {!!(row.createdAt || row.updatedAt) && (
              <footer className="record-stamps">
                {row.createdAt ? <span>Cadastrado em {date(row.createdAt)}</span> : null}
                {row.updatedAt ? <span>Atualizado em {date(row.updatedAt)}</span> : null}
              </footer>
            )}
            <RecordActivity value={row.activity} />
          </article>
        )
      )}
      {history.data && (
        <>
          <section className="metric-strip customer-metrics">
            <div>
              <span>Total líquido comprado</span>
              <strong>{brl(history.data.totalSpent)}</strong>
            </div>
            <div>
              <span>Compras confirmadas</span>
              <strong>{history.data.saleCount}</strong>
            </div>
            <div>
              <span>Ticket médio</span>
              <strong>{brl(history.data.averageTicket)}</strong>
            </div>
            <div>
              <span>Última compra</span>
              <strong className="small-value">{date(history.data.lastPurchase)}</strong>
            </div>
          </section>
          <section className="panel">
            <h2>Histórico de compras</h2>
            <DataTable
              rows={history.data.sales}
              columns={[
                { key: 'code', label: 'Venda' },
                { key: 'createdAt', label: 'Data', render: (r) => date(r.createdAt) },
                { key: 'total', label: 'Total', render: (r) => brl(r.total) },
                { key: 'returnedTotal', label: 'Devoluções', render: (r) => brl(r.returnedTotal) },
              ]}
            />
          </section>
        </>
      )}
    </>
  );
}

function RecordValue({ field, row }: { field: Field; row: Row }) {
  const value = row[field.name];
  if (field.resource)
    return <RelatedName resource={field.resource} id={typeof value === 'string' ? value : ''} />;
  if (value == null || value === '') return <span className="record-absent">—</span>;
  if (['price', 'cost'].includes(field.name))
    return <span className="record-money">{brl(value)}</span>;
  if (field.type === 'date') return text(value).slice(0, 10).split('-').reverse().join('/');
  if (field.options) return field.options.find((o) => o.value === value)?.label ?? text(value);
  if (field.type === 'decimal')
    return (
      new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(value)) +
      (field.name.toLowerCase().includes('percent') ? ' %' : '')
    );
  if (['phone', 'whatsapp'].includes(field.name)) {
    const digits = String(value).replace(/\D/g, '');
    return digits.length === 11
      ? '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 7) + '-' + digits.slice(7)
      : digits.length === 10
        ? '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 6) + '-' + digits.slice(6)
        : text(value);
  }
  return text(value);
}
function RelatedName({ resource, id }: { resource: string; id: string }) {
  const user = useSession(),
    permitted = can(user, entities[resource].read);
  const query = useQuery({
    queryKey: ['lookup-selected', resource, id],
    queryFn: () => api<Row>(resource + '/' + id),
    enabled: !!id && permitted,
  });
  if (!id) return <span className="record-absent">—</span>;
  if (!permitted) return <span className="record-absent">Sem acesso</span>;
  if (query.isLoading) return <span className="record-absent">Carregando...</span>;
  if (query.error) return <span className="record-absent">Indisponível</span>;
  return text(query.data?.name);
}
