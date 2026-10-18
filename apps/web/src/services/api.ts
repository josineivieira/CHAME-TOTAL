import { beginProcessing } from './processing';
import type { AuthUser } from '@chame/shared';
import { setTimezone } from '../utilities/format';
let csrf = '';
export function setCsrf(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; key?: string } = {},
): Promise<T> {
  const finish =
    options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())
      ? beginProcessing()
      : () => {};
  try {
    const response = await fetch('/api/v1/' + path, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(options.key ? { 'Idempotency-Key': options.key } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => ({ message: 'Servico indisponivel.' }))) as {
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
      throw new ApiError(error.message, response.status, error.fieldErrors);
    }
    if (response.status === 204) return null as T;
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError('Resposta inesperada do sistema. Tente novamente.', response.status);
    }
  } finally {
    finish();
  }
}
export const me = async () => {
  const user = await api<AuthUser>('auth/me');
  setCsrf(user.csrfToken);
  setTimezone(user.timezone);
  return user;
};
export const newKey = () => crypto.randomUUID();
export async function download(path: string, name: string) {
  const finish = beginProcessing();
  try {
    const response = await fetch('/api/v1/' + path, { credentials: 'include' });
    if (!response.ok) {
      const d = (await response.json()) as { message: string };
      throw new Error(d.message);
    }
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    finish();
  }
}
export type Row = { id: string; [key: string]: unknown };
export type Page<T = Row> = {
  data: T[];
  pagination: { page: number; pageSize: number; total: number };
};
