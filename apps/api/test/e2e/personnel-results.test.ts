import 'reflect-metadata';
import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';
import * as argon2 from 'argon2';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { permissions } from '@chame/shared';
import type { INestApplication } from '@nestjs/common';
import type { Database } from '../../src/common/db';
const schema = 'chame_test_' + randomBytes(12).toString('hex'),
  connection = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connection) throw Error('Banco de teste ausente.');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = connection;
process.env.DATABASE_SCHEMA = schema;
process.env.APP_ORIGIN = 'http://127.0.0.1:3101';
process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('hex');
const pool = new pg.Pool({ connectionString: connection, max: 1 }),
  check = expect.configure({ timeout: 45000 });
let app: INestApplication,
  browser: Browser,
  page: Page,
  db: Database,
  companyId: string,
  storeId: string;
const errors: string[] = [];
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
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
  const { createApp } = await import('../../src/main'),
    { Database: DB } = await import('../../src/common/db');
  app = await createApp();
  db = app.get(DB);
  const company = await db.company.create({ data: { name: 'EMPRESA QA PESSOAL' } });
  companyId = company.id;
  const store = await db.store.create({ data: { companyId, name: 'LOJA QA' } });
  storeId = store.id;
  await db.setting.create({ data: { companyId } });
  const user = await db.user.create({
    data: {
      companyId,
      storeId,
      name: 'ADMIN QA',
      email: 'personnel-qa@example.test',
      passwordHash: await argon2.hash('SomenteCompraQA!123'),
    },
  });
  await db.permission.createMany({
    data: permissions.map((key) => ({ key })),
    skipDuplicates: true,
  });
  const role = await db.role.create({ data: { companyId, name: 'QA' } });
  await db.rolePermission.createMany({
    data: permissions.map((permissionKey) => ({ roleId: role.id, permissionKey })),
  });
  await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  await db.treasuryBaseline.create({
    data: {
      companyId,
      userId: user.id,
      amount: '1000',
      startsAt: new Date('2000-01-01T00:00:00Z'),
      reason: 'Saldo inicial exclusivo QA',
    },
  });
  await db.employee.create({ data: { companyId, name: 'COLABORADOR QA' } });
  await app.listen(3101, '127.0.0.1');
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(45000);
  page.on('pageerror', (err) => errors.push(err.message));
  const login = await page.request.post('http://127.0.0.1:3101/api/v1/auth/login', {
    headers: { Origin: process.env.APP_ORIGIN! },
    data: { email: user.email, password: 'SomenteCompraQA!123' },
  });
  assert.equal(login.status(), 201);
});
after(async () => {
  if (browser) await browser.close();
  if (app) await app.close();
  if (/^chame_test_[a-f0-9]{24}$/.test(schema))
    await pool.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
  await pool.end();
});
test('pessoal e resultado no navegador sem caixa de loja aberto', async () => {
  for (const [kind, amount] of [
    ['ADVANCE', '200'],
    ['SALARY', '1000'],
  ]) {
    await page.goto('http://127.0.0.1:3101/personnel/new');
    await page.getByRole('combobox', { name: 'Colaborador', exact: true }).fill('COLABORADOR QA');
    await page.getByRole('option', { name: /COLABORADOR QA/ }).click();
    await page.getByLabel('Tipo de pagamento').selectOption(kind);
    await page.getByLabel('Valor integral', { exact: true }).fill(amount);
    await page.getByLabel('Vencimento', { exact: true }).fill('2026-10-17');
    await page.getByRole('button', { name: 'Registrar lançamento', exact: true }).click();
    await page.waitForURL(/\/personnel\/[a-f0-9-]+$/);
    if (kind === 'SALARY') {
      await page.getByLabel('Compensar adiantamento', { exact: true }).fill('200');
      await check(page.getByLabel('Valor a pagar agora', { exact: true })).toHaveValue('800.00');
    }
    await page.getByRole('button', { name: 'Confirmar pagamento', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirmar pagamento', exact: true })
      .click();
    await check(page.locator('.staff-payment-form')).toHaveCount(0);
  }
  assert.equal(await db.cashSession.count({ where: { companyId } }), 0);
  assert.equal(await db.cashMovement.count({ where: { companyId } }), 0);
  assert.equal(await db.staffAdvanceAllocation.count({ where: { companyId } }), 1);
  await page.screenshot({ path: '../../docs/qa/pessoal-pagamento-desktop.png', fullPage: true });
  await page.goto('http://127.0.0.1:3101/treasury?tab=results');
  await check(
    page.getByRole('heading', { name: 'Resultado da empresa', exact: true }),
  ).toBeVisible();
  await check(page.locator('.results-sheet').first()).toContainText('1.000,00');
  await page.screenshot({ path: '../../docs/qa/resultado-empresa-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '../../docs/qa/resultado-empresa-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
});
