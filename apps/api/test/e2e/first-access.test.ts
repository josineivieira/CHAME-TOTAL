import 'reflect-metadata';
import 'dotenv/config';
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { chromium, type Browser, type Page } from '@playwright/test';
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
    await pool.query(readFileSync('prisma/migrations/202610170005_personnel_results/migration.sql','utf8'));
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
