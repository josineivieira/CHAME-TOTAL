import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { api, type Page, type Row } from '../services/api';
import { text } from '../utilities/format';
export function RemoteSelect({
  resource,
  value,
  onChange,
  label,
  required = false,
}: {
  resource: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
}) {
  const id = useId(),
    cache = useQueryClient();
  const root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [active, setActive] = useState(0);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 0,
    maxHeight: 240,
    transform: 'none',
  });
  useEffect(() => {
    const timer = setTimeout(() => setSearch(q), 200);
    return () => clearTimeout(timer);
  }, [q]);
  const data = useQuery({
    queryKey: ['lookup', resource, search],
    queryFn: () =>
      api<Page>(resource + '?active=true&pageSize=100&q=' + encodeURIComponent(search)),
    enabled: open,
  });
  const selected = useQuery({
    queryKey: ['lookup-selected', resource, value],
    queryFn: () => api<Row>(resource + '/' + value),
    enabled: !!value,
  });
  const rows = data.data?.data ?? [],
    current = rows.find((r) => r.id === value) ?? selected.data;
  const display = (row: Row) => text(row.name) + (row.sku ? ' · ' + text(row.sku) : '');
  const index = Math.min(active, Math.max(0, rows.length - 1));
  const waiting = data.isFetching || q !== search;
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12,
        above = rect.top - 12;
      const up = below < 180 && above > below,
        height = Math.min(260, Math.max(80, up ? above : below));
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
        top: up ? rect.top - 5 : rect.bottom + 5,
        transform: up ? 'translateY(-100%)' : 'none',
        width: rect.width,
        maxHeight: height,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    popup.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  useEffect(() => {
    input.current?.setCustomValidity(required && !value ? 'Selecione uma opção da lista.' : '');
  }, [required, value]);
  function choose(row: Row) {
    cache.setQueryData(['lookup-selected', resource, row.id], row);
    onChange(row.id);
    setQ('');
    setSearch('');
    setActive(0);
    setOpen(false);
  }
  return (
    <div className="remote-select searchable-select" ref={root}>
      <div className="lookup-control">
        <Search size={14} className="lookup-search-icon" aria-hidden />
        <input
          ref={input}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={id}
          aria-autocomplete="list"
          aria-required={required}
          aria-activedescendant={open && rows[index] && !waiting ? id + '-' + index : undefined}
          placeholder={'Buscar ' + label.toLocaleLowerCase('pt-BR') + '...'}
          value={open ? q : current ? display(current) : ''}
          required={required && !value}
          autoComplete="off"
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
            if (value) onChange('');
          }}
          onBlur={() => {
            setOpen(false);
            setQ('');
            setSearch('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              setActive((n) =>
                Math.max(0, Math.min(rows.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))),
              );
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (open && !waiting && rows[index]) choose(rows[index]);
              else setOpen(true);
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setQ('');
              setSearch('');
            }
          }}
        />
        {value ? (
          <button
            type="button"
            className="lookup-clear"
            aria-label={'Limpar ' + label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault();
              onChange('');
              setQ('');
              setSearch('');
              input.current?.focus();
              setOpen(true);
            }}
          >
            <X size={13} />
          </button>
        ) : (
          <ChevronDown size={13} className="lookup-chevron" aria-hidden />
        )}
      </div>
      {!open && selected.error && value && (
        <small role="alert">Não foi possível carregar a seleção.</small>
      )}
      {open &&
        createPortal(
          <div ref={popup} className="lookup-popup" style={{ position: 'fixed', ...position }}>
            <div id={id} role="listbox" aria-label={label} aria-busy={waiting}>
              {waiting ? (
                <div className="lookup-message" role="status">
                  Buscando...
                </div>
              ) : data.error ? (
                <div className="lookup-message" role="alert">
                  Não foi possível buscar.{' '}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void data.refetch()}
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : !rows.length ? (
                <div className="lookup-message" role="status">
                  Nenhum resultado encontrado.
                </div>
              ) : (
                rows.map((row, n) => (
                  <div
                    key={row.id}
                    id={id + '-' + n}
                    role="option"
                    data-value={row.id}
                    aria-selected={row.id === value}
                    data-highlighted={index === n}
                    className="lookup-option"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(n)}
                    onClick={(e) => {
                      e.preventDefault();
                      choose(row);
                    }}
                  >
                    <span>
                      <strong>{text(row.name)}</strong>
                      {!!row.sku && <small>SKU {text(row.sku)}</small>}
                    </span>
                    {row.id === value && <Check size={14} aria-hidden />}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
