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
  storeId: string,
  productId: string;
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
  const company = await db.company.create({ data: { name: 'EMPRESA QA COMPRAS PAGAS' } });
  companyId = company.id;
  const store = await db.store.create({ data: { companyId, name: 'LOJA QA' } });
  storeId = store.id;
  await db.setting.create({ data: { companyId } });
  const user = await db.user.create({
    data: {
      companyId,
      storeId,
      name: 'ADMIN QA',
      email: 'purchase-payment@example.test',
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
  await db.supplier.create({ data: { companyId, name: 'FORNECEDOR QA' } });
  const product = await db.product.create({
    data: { companyId, name: 'PRODUTO COMPRA QA', sku: 'COMPRA-QA', price: '300', cost: '200' },
  });
  productId = product.id;
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
test('compra paga, recebimento parcial e reembolso recebido integram o caixa da empresa', async () => {
  await page.goto('http://127.0.0.1:3101/purchases/new');
  await page.getByRole('combobox', { name: 'Fornecedor', exact: true }).fill('FORNECEDOR QA');
  await page.getByRole('option', { name: /FORNECEDOR QA/ }).click();
  await page.getByLabel('Data do documento').fill('2026-10-17');
  await page.getByRole('combobox', { name: 'Produto', exact: true }).fill('COMPRA-QA');
  await page.getByRole('option', { name: /PRODUTO COMPRA QA/ }).click();
  await page.getByLabel('Quantidade', { exact: true }).fill('2');
  await page.getByLabel('Custo unitário', { exact: true }).fill('200');
  await page.getByLabel('Forma de pagamento da compra').selectOption('PIX');
  await check(page.locator('.purchase-payment-summary')).toContainText('400,00');
  await page.getByRole('button', { name: 'Registrar compra e pagamento', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Registrar compra e pagamento', exact: true })
    .click();
  await check(
    page.getByRole('dialog', { name: 'Processando opera\u00e7\u00e3o', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: '../../docs/qa/processando-operacao-desktop.png', fullPage: true });
  await page.waitForURL(/\/purchases\/[a-f0-9-]+$/);
  await check(page.getByLabel('Autoria do registro')).toContainText('Registrado por ADMIN QA');
  await check(page.locator('.purchase-payment-strip')).toContainText('400,00');
  const order = await db.purchaseOrder.findFirstOrThrow({ where: { companyId } });
  assert.equal(order.paymentMode, 'PREPAID');
  const balance = async () =>
    Number(
      (await (await page.request.get('http://127.0.0.1:3101/api/v1/treasury')).json()).balance,
    );
  assert.equal(await balance(), 600);
  await page.screenshot({ path: '../../docs/qa/compra-paga-desktop.png', fullPage: true });
  await page.getByLabel('Receber PRODUTO COMPRA QA').fill('1');
  await page.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
  await check(page.getByText('Mercadoria recebida parcialmente', { exact: true })).toBeVisible();
  assert.equal(await balance(), 600);
  const item = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseId: order.id } });
  await page.getByLabel('Item pendente', { exact: true }).selectOption(item.id);
  await page.getByLabel('Tratativa', { exact: true }).selectOption('REFUND');
  await page
    .getByRole('textbox', { name: /Detalhes/ })
    .fill('Faltou uma unidade e fornecedor devolvera o valor');
  await page.getByRole('button', { name: 'Registrar tratativa', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Registrar tratativa', exact: true })
    .click();
  await check(page.getByText('Reembolso solicitado', { exact: true })).toBeVisible();
  assert.equal(await balance(), 600);
  await page.getByRole('button', { name: 'Confirmar reembolso recebido', exact: true }).click();
  const refund = page.getByRole('dialog', { name: 'Reembolso da compra', exact: true });
  await refund.getByLabel('Forma de recebimento do reembolso').selectOption('PIX');
  await refund.getByRole('textbox').fill('Devolucao recebida e conferida no extrato QA');
  await page.screenshot({ path: '../../docs/qa/compra-reembolso-confirmacao.png', fullPage: true });
  await refund.getByRole('button', { name: 'Confirmar reembolso recebido', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Confirmar dinheiro recebido', exact: true })
    .getByRole('button', { name: 'Confirmar reembolso recebido', exact: true })
    .click();
  await check(
    page.locator('.purchase-issues').getByRole('cell', { name: 'Reembolso recebido', exact: true }),
  ).toBeVisible();
  assert.equal(await balance(), 800);
  await check(page.getByLabel('Autoria do registro')).toContainText(
    '\u00daltima altera\u00e7\u00e3o por ADMIN QA',
  );
  await check(page.getByText('Compra encerrada com reembolso', { exact: true })).toBeVisible();
  await check(page.getByRole('button', { name: 'Confirmar recebimento', exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({ path: '../../docs/qa/compra-reembolsada-desktop.png', fullPage: true });
  const stock = await db.stockBalance.findUniqueOrThrow({
    where: { storeId_productId: { storeId, productId } },
  });
  assert.equal(stock.quantity.toString(), '1');
  assert.equal(await db.financialEntry.count({ where: { companyId } }), 2);
  assert.equal(await db.cashMovement.count({ where: { companyId } }), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '../../docs/qa/compra-reembolsada-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
});
