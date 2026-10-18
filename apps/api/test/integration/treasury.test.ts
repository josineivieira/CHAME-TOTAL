import 'reflect-metadata';
import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';
import supertest from 'supertest';
import * as argon2 from 'argon2';
import { permissions } from '@chame/shared';
import type { INestApplication } from '@nestjs/common';
import type { Database } from '../../src/common/db';
const schema = 'chame_test_' + randomBytes(12).toString('hex');
const connection = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connection) throw new Error('Banco de teste nao configurado.');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = connection;
process.env.DATABASE_SCHEMA = schema;
process.env.APP_ORIGIN = 'http://127.0.0.1:3101';
process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('hex');
const pool = new pg.Pool({ connectionString: connection, max: 1 });
let app: INestApplication,
  db: Database,
  companyId: string,
  userId: string,
  storeId: string,
  otherEntryId: string;
let admin: { cookie: string; csrf: string },
  outsider: { cookie: string; csrf: string },
  limited: { cookie: string; csrf: string };
let sourceSnapshot: unknown;
const password = 'SomenteTesourariaQA!123';
async function session(email: string) {
  const result = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('Origin', process.env.APP_ORIGIN!)
    .send({ email, password })
    .expect(201);
  return {
    cookie: String(result.headers['set-cookie'][0]).split(';')[0],
    csrf: result.body.csrfToken,
  };
}
function request(who = admin) {
  return supertest(app.getHttpServer()).get('/api/v1/treasury').set('Cookie', who.cookie);
}
function post(path: string, body: unknown, key = randomUUID(), who = admin) {
  return supertest(app.getHttpServer())
    .post('/api/v1/treasury/' + path)
    .set('Cookie', who.cookie)
    .set('Origin', process.env.APP_ORIGIN!)
    .set('X-CSRF-Token', who.csrf)
    .set('Idempotency-Key', key)
    .send(body);
}
before(async () => {
  await pool.query('BEGIN');
  try {
    await pool.query('CREATE SCHEMA "' + schema + '"');
    await pool.query('SET LOCAL search_path TO "' + schema + '"');
    for (const migration of readdirSync('prisma/migrations').sort())
      if (/^\d/.test(migration))
        await pool.query(readFileSync('prisma/migrations/' + migration + '/migration.sql', 'utf8'));
    await pool.query(
      'ALTER FUNCTION "' +
        schema +
        '".chame_same_company_role() SET search_path TO "' +
        schema +
        '"',
    );
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
  const { createApp } = await import('../../src/main');
  const { Database: DB } = await import('../../src/common/db');
  app = await createApp();
  db = app.get(DB);
  await db.permission.createMany({
    data: permissions.map((key) => ({ key })),
    skipDuplicates: true,
  });
  const passwordHash = await argon2.hash(password);
  async function fixture(name: string, keys: readonly string[]) {
    const company = await db.company.create({ data: { name } }),
      store = await db.store.create({ data: { companyId: company.id, name: 'LOJA ' + name } });
    await db.setting.create({ data: { companyId: company.id } });
    const user = await db.user.create({
      data: {
        companyId: company.id,
        storeId: store.id,
        name,
        email: name + '@example.test',
        passwordHash,
      },
    });
    const role = await db.role.create({ data: { companyId: company.id, name: 'QA' } });
    await db.rolePermission.createMany({
      data: keys.map((permissionKey) => ({ roleId: role.id, permissionKey })),
    });
    await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return { company, store, user };
  }
  const a = await fixture('treasury', permissions);
  companyId = a.company.id;
  storeId = a.store.id;
  userId = a.user.id;
  admin = await session(a.user.email);
  const b = await fixture('outside', permissions);
  outsider = await session(b.user.email);
  const low = await db.user.create({
    data: {
      companyId,
      storeId,
      name: 'Financeiro sem tesouraria',
      email: 'limited-treasury@example.test',
      passwordHash,
    },
  });
  const lowRole = await db.role.create({ data: { companyId, name: 'FINANCE ONLY' } });
  await db.rolePermission.create({ data: { roleId: lowRole.id, permissionKey: 'finance.read' } });
  await db.userRole.create({ data: { userId: low.id, roleId: lowRole.id } });
  limited = await session(low.email);
  const cash = await db.cashSession.create({
    data: { companyId, storeId, userId, openingAmount: '1000' },
  });
  const payable = await db.financialEntry.create({
    data: {
      companyId,
      storeId,
      userId,
      direction: 'OUT',
      description: 'Compra liquidada QA',
      category: 'QA',
      amount: '2000',
      settledAmount: '2000',
      dueDate: new Date(),
      status: 'SETTLED',
    },
  });
  await db.financialSettlement.create({
    data: { companyId, userId, entryId: payable.id, amount: '2000', method: 'PIX' },
  });
  await db.financialEntry.create({
    data: {
      companyId,
      storeId,
      userId,
      direction: 'OUT',
      description: 'Conta aberta QA',
      category: 'QA',
      amount: '14000',
      dueDate: new Date(),
    },
  });
  await db.cashMovement.createMany({
    data: [
      { type: 'SALE', method: 'PIX', amount: '1312' },
      { type: 'REFUND', method: 'PIX', amount: '-656' },
      { type: 'FINANCE', method: 'PIX', amount: '-2000', referenceId: payable.id },
      { type: 'SALE', method: 'PIX', amount: '646' },
      { type: 'SUPPLY', method: 'CASH', amount: '200' },
      { type: 'WITHDRAWAL', method: 'CASH', amount: '-50' },
    ].map((row) => ({
      ...row,
      companyId,
      userId,
      cashSessionId: cash.id,
      reason: 'Movimento exclusivo QA',
    })),
  });
  const store2 = await db.store.create({ data: { companyId, name: 'SEGUNDA LOJA QA' } });
  const cash2 = await db.cashSession.create({
    data: { companyId, storeId: store2.id, userId, openingAmount: '300' },
  });
  await db.cashMovement.create({
    data: {
      companyId,
      userId,
      cashSessionId: cash2.id,
      type: 'SALE',
      method: 'CASH',
      amount: '100',
      reason: 'Venda segunda loja QA',
    },
  });
  const outsideCash = await db.cashSession.create({
    data: { companyId: b.company.id, storeId: b.store.id, userId: b.user.id, openingAmount: '999' },
  });
  await db.cashMovement.create({
    data: {
      companyId: b.company.id,
      userId: b.user.id,
      cashSessionId: outsideCash.id,
      type: 'SALE',
      method: 'PIX',
      amount: '90000',
      reason: 'Somente outra empresa',
    },
  });
  otherEntryId = (
    await db.treasuryEntry.create({
      data: {
        companyId: b.company.id,
        userId: b.user.id,
        amount: '1',
        method: 'CASH',
        description: 'Movimento outra empresa',
      },
    })
  ).id;
  sourceSnapshot = await db.cashMovement.findMany({ where: { companyId }, orderBy: { id: 'asc' } });
});
after(async () => {
  if (app) await app.close();
  if (/^chame_test_[a-f0-9]{24}$/.test(schema))
    await pool.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
  await pool.end();
});
test('tesouraria exige permissao propria e nao inventa saldo inicial', async () => {
  await supertest(app.getHttpServer()).get('/api/v1/treasury').expect(401);
  await request(limited).expect(403);
  const result = (await request().expect(200)).body;
  assert.equal(result.baseline, null);
  assert.equal(result.balance, null);
  assert.equal(result.incoming, '2058.00');
  assert.equal(result.outgoing, '2656.00');
  assert.equal(result.pagination.total, 5);
  assert.ok(result.data.every((row: { balance: unknown }) => row.balance === null));
  await post('entries', {
    direction: 'IN',
    amount: '5',
    method: 'PIX',
    description: 'Nao inicializado',
  }).expect(409);
});
test('saldo inicial incorpora movimentos uma vez e ignora transferencias internas', async () => {
  const today = (await request()).body.today,
    key = randomUUID(),
    body = { amount: '10000', date: today, reason: 'Saldo antes dos movimentos do dia QA' };
  await post('initialize', body, key).expect(201);
  await post('initialize', body, key).expect(201);
  await post('initialize', body).expect(409);
  const result = (await request().expect(200)).body;
  assert.equal(result.balance, '9402.00');
  assert.equal(result.pagination.total, 6);
  assert.equal(result.incoming, '2058.00');
  assert.equal(result.outgoing, '2656.00');
  assert.equal(
    result.data.find((row: { source: string }) => row.source === 'OPENING').balance,
    '10000.00',
  );
  const outside = (await request(outsider)).body;
  assert.equal(outside.balance, null);
  assert.equal(outside.incoming, '90001.00');
});
test('lancamentos manuais sao idempotentes e estorno preserva o original', async () => {
  const key = randomUUID(),
    body = { direction: 'IN', amount: '500', method: 'BANK', description: 'Aporte exclusivo QA' };
  const credit = (await post('entries', body, key).expect(201)).body;
  await post('entries', body, key).expect(201);
  await post('entries', { ...body, amount: '600' }, key).expect(409);
  await post('entries', {
    direction: 'OUT',
    amount: '100',
    method: 'CASH',
    description: 'Despesa exclusiva QA',
  }).expect(201);
  assert.equal((await request()).body.balance, '9802.00');
  const reversalKey = randomUUID();
  await post(
    'entries/' + credit.id + '/reverse',
    { reason: 'Correcao do aporte QA' },
    reversalKey,
  ).expect(201);
  await post(
    'entries/' + credit.id + '/reverse',
    { reason: 'Correcao do aporte QA' },
    reversalKey,
  ).expect(201);
  await post('entries/' + credit.id + '/reverse', { reason: 'Estorno duplicado QA' }).expect(409);
  assert.equal((await request()).body.balance, '9302.00');
  assert.equal(
    (await db.treasuryEntry.findUniqueOrThrow({ where: { id: credit.id } })).amount.toString(),
    '500',
  );
  const filtered = (await request().query({ source: 'MANUAL', pageSize: 1 })).body;
  assert.equal(filtered.pagination.total, 2);
  assert.equal(filtered.data[0].balance, '9802.00');
  assert.equal(filtered.balance, '9302.00');
});
test('escopo, filtros, datas e imutabilidade protegem o caixa da empresa', async () => {
  await post('entries/' + otherEntryId + '/reverse', { reason: 'Tentativa fora do escopo' }).expect(
    404,
  );
  await post('entries', {
    direction: 'IN',
    amount: '0',
    method: 'CASH',
    description: 'Valor invalido QA',
  }).expect(400);
  await request().query({ from: '2026-02-30' }).expect(400);
  await request().query({ from: '2026-10-20', to: '2026-10-01' }).expect(400);
  assert.equal((await request().query({ q: "' OR 1=1 --" })).body.pagination.total, 0);
  const filtered = (await request().query({ method: 'PIX' })).body;
  assert.equal(filtered.incoming, '1958.00');
  assert.equal(filtered.outgoing, '2656.00');
  assert.equal(filtered.balance, '9302.00');
  await assert.rejects(() =>
    db.treasuryBaseline.update({ where: { companyId }, data: { amount: '0' } }),
  );
  assert.deepEqual(
    await db.cashMovement.findMany({ where: { companyId }, orderBy: { id: 'asc' } }),
    sourceSnapshot,
  );
  assert.equal(
    (
      await db.financialEntry.findFirstOrThrow({
        where: { companyId, description: 'Conta aberta QA' },
      })
    ).settledAmount.toString(),
    '0',
  );
});
