import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'Configure DATABASE_URL no ambiente.'),
  DATABASE_SCHEMA: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,62}$/)
    .default('public'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_ORIGIN: z
    .url()
    .default('http://localhost:5173')
    .transform((v) => new URL(v).origin),
  SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  MFA_ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, 'MFA_ENCRYPTION_KEY exige 32 bytes hexadecimais.')
    .optional(),
  BOOTSTRAP_TOKEN: z.string().min(32).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});
export const config = schema.parse(
  Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')),
);
if (
  config.NODE_ENV === 'production' &&
  (!config.APP_ORIGIN.startsWith('https://') || !config.MFA_ENCRYPTION_KEY)
)
  throw new Error('Producao exige HTTPS e chave de MFA.');
