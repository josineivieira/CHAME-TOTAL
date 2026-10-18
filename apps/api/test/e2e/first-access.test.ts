import 'reflect-metadata';
import 'dotenv/config';
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import * as OTPAuth from 'otpauth';
import type { INestApplication } from '@nestjs/common';
const schema = 'chame_test_' + randomBytes(12).toString('hex'),
  token = randomBytes(32).toString('hex');
const connection = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connection) throw new Error('Banco de teste ausente.');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = connection;
process.env.DATABASE_SCHEMA = schema;
process.env.APP_ORIGIN = 'http://127.0.0.1:3101';
process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('hex');
process.env.BOOTSTRAP_TOKEN = token;
const pool = new pg.Pool({ connectionString: connection, max: 1 });
let app: INestApplication, browser: Browser, page: Page;
before(async () => {
  await pool.query('BEGIN');
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`SET LOCAL search_path TO "${schema}"`);
    await pool.query(readFileSync('prisma/migrations/202610140001_initial/migration.sql', 'utf8'));
    await pool.query(
      readFileSync('prisma/migrations/202610150001_user_photo/migration.sql', 'utf8'),
    );
    await pool.query(
      readFileSync('prisma/migrations/202610170001_company_treasury/migration.sql', 'utf8'),
    );
    await pool.query(
      readFileSync('prisma/migrations/202610170002_purchase_issues/migration.sql', 'utf8'),
    );
    await pool.query(
      readFileSync('prisma/migrations/202610170003_purchase_payment/migration.sql', 'utf8'),
    );
    await pool.query(
      readFileSync('prisma/migrations/202610170004_record_activity/migration.sql', 'utf8'),
    );
    await pool.query(
      readFileSync('prisma/migrations/202610170005_personnel_results/migration.sql', 'utf8'),
    );
    await pool.query(
      `ALTER FUNCTION "${schema}".chame_same_company_role() SET search_path TO "${schema}"`,
    );
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
  const { createApp } = await import('../../src/main');
  app = await createApp();
  await app.listen(3101, '127.0.0.1');
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  page.setDefaultTimeout(45000);
});
after(async () => {
  if (browser) await browser.close();
  if (app) await app.close();
  if (/^chame_test_[a-f0-9]{24}$/.test(schema))
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
});
test('primeiro administrador e criado pela interface sem senha padrao', async () => {
  await page.goto('http://127.0.0.1:3101/setup');
  await page.getByLabel('Nome do administrador').fill('PRIMEIRO ADMIN QA');
  await page.getByLabel('Email', { exact: true }).fill('first-admin@example.test');
  await page.getByLabel('Senha inicial').fill('SenhaEscolhidaNoTeste123!');
  await page.getByLabel('Código de preparação').fill(token);
  await page.getByRole('button', { name: 'Criar administrador' }).click();
  await page.waitForURL('**/security');
  await page.getByRole('button', { name: 'Configurar MFA', exact: true }).waitFor();
  const users = await pool.query(`SELECT name,email,"mfaRequired" FROM "${schema}"."User"`);
  assert.equal(users.rows.length, 1);
  assert.equal(users.rows[0].mfaRequired, true);
  const status = await page.request.get('http://127.0.0.1:3101/api/v1/bootstrap/status');
  assert.equal((await status.json()).initialized, true);
});

test('novo usuario com MFA obrigatorio cadastra QR Code e ativa autenticador sem falha de DOM', async () => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.locator('html')).toHaveAttribute('translate', 'no');
  await expect(page.locator('meta[name="google"]')).toHaveAttribute('content', 'notranslate');
  async function enroll() {
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/auth/mfa/setup') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Configurar MFA', exact: true }).click();
    const setup = await (await response).json();
    await expect(page.locator('.mfa-setup svg')).toBeVisible();
    const code = OTPAuth.URI.parse(setup.uri).generate();
    await page.getByLabel('Código de 6 dígitos').fill(code);
    await page.getByRole('button', { name: 'Validar e ativar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Códigos de recuperação' })).toBeVisible({
      timeout: 45000,
    });
    await expect(page.getByText('Seu perfil exige MFA.', { exact: false })).toHaveCount(0);
  }
  await enroll();
  const me = await (await page.request.get('http://127.0.0.1:3101/api/v1/auth/me')).json();
  const roles = await (await page.request.get('http://127.0.0.1:3101/api/v1/users/roles')).json();
  const admin =
    roles.find((r: { name: string }) => r.name === 'ADMINISTRADOR') ??
    roles.find((r: { permissions: string[] }) => r.permissions.includes('users.manage'));
  assert.ok(admin);
  const created = await page.request.post('http://127.0.0.1:3101/api/v1/users', {
    headers: { Origin: process.env.APP_ORIGIN!, 'X-CSRF-Token': me.csrfToken },
    data: {
      name: 'NOVO USUARIO MFA QA',
      email: 'new-mfa@example.test',
      password: 'SenhaNovaNoTeste123!',
      roleIds: [admin.id],
    },
  });
  assert.equal(created.status(), 201);
  await page.context().clearCookies();
  const login = await page.request.post('http://127.0.0.1:3101/api/v1/auth/login', {
    headers: { Origin: process.env.APP_ORIGIN! },
    data: { email: 'new-mfa@example.test', password: 'SenhaNovaNoTeste123!' },
  });
  assert.equal(login.status(), 201);
  await page.goto('http://127.0.0.1:3101/');
  await page.waitForURL('**/security');
  await expect(page.getByText('Seu perfil exige MFA.', { exact: false })).toBeVisible();
  await enroll();
  assert.deepEqual(errors, []);
});
