import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
process.stdin.setRawMode?.(true);
process.stdin.resume();
console.log('Entrada segura pronta.');
let input = await new Promise((resolve) => {
  let data = '';
  process.stdin.on('data', (chunk) => {
    data += String(chunk);
    if (data.includes('\n') || data.includes('\r')) {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      resolve(data.trim());
    }
  });
});
try {
  const { databaseUrl } = JSON.parse(input);
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('invalid');
  url.searchParams.set('sslmode', 'verify-full');
  const pool = new pg.Pool({
    connectionString: url.toString(),
    connectionTimeoutMillis: 15000,
    max: 1,
  });
  try {
    const version = await pool.query('SHOW server_version');
    const tables = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    console.log(
      JSON.stringify({
        connected: true,
        version: version.rows[0].server_version,
        publicTables: tables.rows.map((r) => r.tablename),
      }),
    );
  } finally {
    await pool.end();
  }
  const target = new URL('../apps/api/.env', import.meta.url);
  if (fs.existsSync(target)) throw new Error('exists');
  fs.writeFileSync(
    target,
    `DATABASE_URL=${url.toString()}\nPORT=3001\nNODE_ENV=development\nAPP_ORIGIN=http://localhost:5173\nSESSION_HOURS=8\nMFA_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('hex')}\n`,
    { mode: 0o600, flag: 'wx' },
  );
  console.log(
    'Ambiente local configurado em arquivo ignorado pelo Git; nenhuma credencial exibida.',
  );
} catch {
  console.error('Conexao/configuracao nao concluida. Nenhum segredo foi exibido.');
  process.exitCode = 1;
}
