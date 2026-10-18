import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const unsafe = [];
for (const file of files) {
  if (/(^|\/)\.env($|\.)/.test(file) && !file.endsWith('.env.example')) unsafe.push(file);
  if (!/\.(ts|tsx|mjs|json|ya?ml|md|prisma|sql|ps1)$/.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@[^\s"'`]+/g)) {
    try {
      const url = new URL(match[0]);
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) unsafe.push(file);
    } catch {
      unsafe.push(file);
    }
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)) unsafe.push(file);
}
if (unsafe.length) {
  console.error('Revisar arquivos antes de publicar: ' + [...new Set(unsafe)].join(', '));
  process.exitCode = 1;
} else
  console.log(
    'Verificacao de ' +
      files.length +
      ' arquivos: nenhum .env privado, conexao remota com credencial ou chave privada no conjunto versionavel.',
  );
