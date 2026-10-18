let activeTimezone = 'America/Sao_Paulo';
export const setTimezone = (value: string) => {
  activeTimezone = value;
};
export const brl = (value: unknown) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
export const date = (value: unknown, timezone = activeTimezone) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: timezone,
      }).format(new Date(String(value)))
    : '—';
export const text = (value: unknown) =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'boolean'
      ? value
        ? 'Sim'
        : 'Não'
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
export const decimalInput = (value: string) => value.trim().replace(',', '.');
export const statusLabels: Record<string, string> = {
  CLOSED_WITH_SHORTAGE: 'Encerrada com reembolso',
  BANK: 'Banco',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  OPEN: 'Aberto',
  CLOSED: 'Fechado',
  PARTIAL: 'Parcial',
  SETTLED: 'Liquidado',
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  PAID: 'Pago',
  RECEIVED: 'Recebido',
  PARTIALLY_RECEIVED: 'Recebido parcialmente',
  CONVERTED: 'Convertido',
  IN: 'Entrada',
  OUT: 'Saída',
  PIX: 'Pix',
  CASH: 'Dinheiro',
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  OTHER: 'Outros',
};
export const civilDate = (value: unknown) =>
  value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';

export const currentMonth = (timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  return (
    parts.find((p) => p.type === 'year')!.value + '-' + parts.find((p) => p.type === 'month')!.value
  );
};
