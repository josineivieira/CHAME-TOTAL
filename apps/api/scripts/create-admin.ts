import 'reflect-metadata';
import { Database } from '../src/common/db';
import { createFirstAdmin } from '../src/modules/bootstrap/create-first-admin';
async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += String(chunk);
  const db = new Database();
  try {
    await db.$connect();
    const result = await createFirstAdmin(db, JSON.parse(input));
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  process.stderr.write(
    'Bootstrap nao concluido. Verifique configuracao, regras da senha e se ja existe administrador. Nenhuma credencial foi exibida.\n',
  );
  process.exitCode = 1;
});
