import { beginProcessing } from '../services/processing';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table';
import { text, statusLabels } from '../utilities/format';
import type { Row } from '../services/api';
export function Title({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="actions">{actions}</div>
    </header>
  );
}
export function Feedback({ error, success }: { error?: unknown; success?: string }) {
  return (
    <>
      {error instanceof Error && (
        <div className="message error" role="alert">
          {error.message}
        </div>
      )}
      {success && (
        <div className="message success" role="status">
          {success}
        </div>
      )}
    </>
  );
}
export function Loading() {
  useEffect(() => beginProcessing(), []);
  return (
    <div className="empty" role="status">
      Carregando registros…
    </div>
  );
}
export function Empty({ children }: { children?: ReactNode }) {
  return (
    <div className="empty">
      {children ?? 'Nenhum registro encontrado. Use as ações acima para começar.'}
    </div>
  );
}
export type Col = {
  key: string;
  label: string;
  render?: (row: Row) => ReactNode;
  sortable?: boolean;
};
export function DataTable({
  rows,
  columns,
  onSelect,
  selected,
  onSort,
}: {
  rows: Row[];
  columns: Col[];
  onSelect?: (row: Row) => void;
  selected?: string;
  onSort?: (key: string) => void;
}) {
  const [visibility, setVisibility] = useState<VisibilityState>({}),
    [selection, setSelection] = useState({});
  const defs = useMemo<ColumnDef<Row>[]>(
    () =>
      columns.map((c) => ({
        id: c.key,
        accessorKey: c.key,
        header: c.label,
        cell: ({ row }) => (c.render ? c.render(row.original) : text(row.original[c.key])),
      })),
    [columns],
  );
  const table = useReactTable({
    data: rows,
    columns: defs,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => r.id,
    state: { columnVisibility: visibility, rowSelection: selection },
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setSelection,
  });
  return (
    <>
      <div className="table-options">
        <span>{rows.length} registro(s) nesta página</span>
        <details>
          <summary>Colunas</summary>
          <div className="column-menu">
            {table.getAllColumns().map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={c.getIsVisible()}
                  onChange={c.getToggleVisibilityHandler()}
                />
                {String(c.columnDef.header)}
              </label>
            ))}
          </div>
        </details>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => (
                  <th key={h.id}>
                    {onSort && columns.find((c) => c.key === h.id)?.sortable !== false ? (
                      <button className="table-heading" onClick={() => onSort(h.id)}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr
                key={r.id}
                className={selected === r.id ? 'selected' : ''}
                tabIndex={onSelect ? 0 : undefined}
                aria-selected={onSelect ? selected === r.id : undefined}
                onClick={() => onSelect?.(r.original)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelect?.(r.original);
                }}
              >
                {r.getVisibleCells().map((c) => (
                  <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty />}
      </div>
    </>
  );
}
export function Pager({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <footer className="pager">
      <span>
        {total} registro(s) · página {page} de {pages}
      </span>
      <div>
        <button disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </button>
        <button disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Próxima
        </button>
      </div>
    </footer>
  );
}
export function Badge({ value }: { value: unknown }) {
  return (
    <span className={`badge ${value === 'CANCELLED' ? 'danger' : ''}`}>
      {statusLabels[String(value)] ?? text(value)}
    </span>
  );
}
export function useUnsaved(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
