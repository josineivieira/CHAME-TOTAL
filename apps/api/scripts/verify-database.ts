import 'dotenv/config';
import pg from 'pg';
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente');
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    const version = await pool.query('SHOW server_version');
    const counts = await pool.query(
      'SELECT (SELECT COUNT(*) FROM public."User")::int AS users,(SELECT COUNT(*) FROM public."Customer")::int AS customers,(SELECT COUNT(*) FROM public."Product")::int AS products,(SELECT COUNT(*) FROM public."Sale")::int AS sales,(SELECT COUNT(*) FROM public."LoginAttempt")::int AS authenticationCounters',
    );
    const migrations = await pool.query(
      'SELECT migration_name,finished_at IS NOT NULL AS applied FROM public._prisma_migrations ORDER BY started_at',
    );
    const schemas = await pool.query(
      "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'chame_test_%'",
    );
    process.stdout.write(
      JSON.stringify(
        {
          connected: true,
          version: version.rows[0].server_version,
          publicCounts: counts.rows[0],
          migrations: migrations.rows,
          testSchemasRemaining: schemas.rowCount,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  process.stderr.write('Verificacao de banco nao concluida; nenhuma credencial foi exibida.\n');
  process.exitCode = 1;
});
