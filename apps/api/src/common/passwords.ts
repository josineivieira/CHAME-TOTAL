import * as argon2 from 'argon2';
import { HttpException } from '@nestjs/common';
// Bound Argon2 memory usage under concurrent login/reset requests.
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (active < 2) active++;
  else {
    if (waiting.length >= 20)
      throw new HttpException('Autenticacao ocupada. Aguarde e tente novamente.', 429);
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
export const hashPassword = (password: string) =>
  slot(() =>
    argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    }),
  );
export const verifyPassword = (encoded: string, password: string) =>
  slot(() => argon2.verify(encoded, password));
