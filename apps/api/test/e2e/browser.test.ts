import 'reflect-metadata';
import 'dotenv/config';
import { test, after, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import pg from 'pg';
import * as argon2 from 'argon2';
import * as OTPAuth from 'otpauth';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { permissions } from '@chame/shared';
import type { INestApplication } from '@nestjs/common';
const schema = 'chame_test_' + randomBytes(12).toString('hex');
const connection = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connection) throw new Error('Banco de teste nao configurado.');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = connection;
process.env.DATABASE_SCHEMA = schema;
process.env.APP_ORIGIN = 'http://127.0.0.1:3101';
process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('hex');
const pool = new pg.Pool({ connectionString: connection, max: 1 });
let app: INestApplication, browser: Browser, page: Page, employeeId: string;
const browserErrors: string[] = [];
const treasuryExpect = expect.configure({ timeout: 45000 });
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
  const { Database } = await import('../../src/common/db');
  app = await createApp();
  const db = app.get(Database);
  const company = await db.company.create({
      data: { name: 'EMPRESA QA ISOLADA' },
    }),
    store = await db.store.create({
      data: { companyId: company.id, name: 'LOJA QA' },
    });
  await db.setting.create({
    data: {
      companyId: company.id,
      companyName: 'CHARME TOTAL QA',
      address: 'ENDERECO EXCLUSIVO DE QA',
    },
  });
  const employee = await db.employee.create({
    data: {
      companyId: company.id,
      name: 'VENDEDORA QA',
      commissionPercent: '5',
    },
  });
  employeeId = employee.id;
  const user = await db.user.create({
      data: {
        companyId: company.id,
        storeId: store.id,
        name: 'ADMIN QA',
        email: 'qa@example.test',
        passwordHash: await argon2.hash('AcessoSomenteQA!123'),
        employeeId,
        mfaRequired: true,
      },
    }),
    role = await db.role.create({
      data: { companyId: company.id, name: 'QA' },
    });
  await db.permission.createMany({
    data: permissions.map((key) => ({ key })),
    skipDuplicates: true,
  });
  await db.rolePermission.createMany({
    data: permissions.map((permissionKey) => ({
      roleId: role.id,
      permissionKey,
    })),
  });
  await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  await app.listen(3101, '127.0.0.1');
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(45000);
  page.on('pageerror', (error) => browserErrors.push(error.message));
  mkdirSync('../../docs/qa', { recursive: true });
});
after(async () => {
  if (browser) await browser.close();
  if (app) await app.close();
  if (/^chame_test_[a-f0-9]{24}$/.test(schema))
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
});
test('login, MFA e navegacao desktop carregam sem erros', async () => {
  await page.goto('http://127.0.0.1:3101/login');
  await page.getByLabel('Email', { exact: true }).fill('qa@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('AcessoSomenteQA!123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/security');
  await page.getByRole('button', { name: 'Configurar MFA', exact: true }).click();
  const secret = await page.locator('.mfa-setup code').innerText();
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  await page.getByLabel('Código de 6 dígitos').fill(totp.generate());
  await page.getByRole('button', { name: 'Validar e ativar' }).click();
  await page.getByRole('heading', { name: 'Códigos de recuperação' }).waitFor();
  await page.getByRole('button', { name: 'Já guardei' }).click();
  await page.getByRole('link', { name: 'Painel' }).click();
  await page.getByRole('heading', { name: 'Vendas', exact: true }).waitFor();
  await page.getByText('Não há vendas confirmadas neste período.', { exact: true }).waitFor();
  await page.screenshot({
    path: '../../docs/qa/dashboard-desktop.png',
    fullPage: true,
  });
  await page.goto('http://127.0.0.1:3101/cash');
  await page
    .getByText('Caixa fechado. Abra um caixa para iniciar as operações.', { exact: true })
    .waitFor();
  assert.equal(await page.locator('.message.error').count(), 0);
  await page.getByRole('link', { name: 'Abrir caixa', exact: true }).waitFor();
  assert.deepEqual(browserErrors, []);
});
test('cadastro real de produto e entrada de estoque pela interface', async () => {
  await page.goto('http://127.0.0.1:3101/categories/new');
  await page.getByLabel('Nome da categoria').fill('CATEGORIA QA');
  await page.getByRole('button', { name: 'Salvar cadastro' }).click();
  await page.waitForURL('**/categories');
  await page.goto('http://127.0.0.1:3101/products/new');
  await page.getByLabel('Nome do produto').fill('PRODUTO QA');
  await page.getByLabel('SKU', { exact: false }).fill('QA-001');
  await page.getByRole('combobox', { name: 'Categoria', exact: true }).click();
  await page.getByRole('option', { name: 'CATEGORIA QA', exact: true }).click();
  await page.getByLabel('Tamanho', { exact: true }).fill('M');
  await page.getByLabel('Cor', { exact: true }).fill('VERDE');
  await page.getByLabel('Preço de custo').fill('4,00');
  await page.getByLabel('Preço de venda').fill('10,00');
  await page.getByRole('button', { name: 'Salvar cadastro' }).click();
  await page.waitForURL('**/products');
  await page.getByRole('cell', { name: 'PRODUTO QA', exact: true }).waitFor();
  await page.goto('http://127.0.0.1:3101/inventory/adjust');
  const productLookup = page.getByRole('combobox', { name: 'Produto', exact: true });
  await productLookup.fill('produto-inexistente-qa');
  await page.getByRole('status').filter({ hasText: 'Nenhum resultado encontrado.' }).waitFor();
  await productLookup.fill('QA-001');
  await page.getByRole('option', { name: /PRODUTO QA/ }).waitFor();
  await page.screenshot({ path: '../../docs/qa/busca-produto-desktop.png', fullPage: true });
  await page.getByRole('option', { name: /PRODUTO QA/ }).click();
  assert.match(await productLookup.inputValue(), /PRODUTO QA/);
  await page.getByRole('button', { name: 'Limpar Produto', exact: true }).click();
  await productLookup.fill('QA-001');
  await page.getByRole('option', { name: /PRODUTO QA/ }).waitFor();
  await productLookup.press('Enter');
  assert.match(await productLookup.inputValue(), /QA-001/);
  assert.equal(await page.locator('.remote-select select').count(), 0);
  await page.getByLabel('Quantidade', { exact: true }).fill('3');
  await page.getByLabel('Motivo', { exact: true }).fill('Entrada em ambiente QA isolado');
  await page.getByRole('button', { name: 'Registrar entrada', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar entrada', exact: true }).click();
  await page.waitForURL('**/inventory');
  await page.getByRole('cell', { name: 'PRODUTO QA', exact: true }).waitFor();
});
test('caixa, PDV e comprovante integram a venda no navegador', async () => {
  await page.goto('http://127.0.0.1:3101/cash/open');
  await page.getByLabel('Fundo inicial em dinheiro').fill('20');
  await page.getByRole('button', { name: 'Confirmar operação' }).click();
  await page.waitForURL('**/cash');
  await page.goto('http://127.0.0.1:3101/pdv');
  await page.getByRole('button', { name: /PRODUTO QA/ }).click();
  await page.getByRole('combobox', { name: 'Vendedora', exact: true }).click();
  await page.locator('[role="option"][data-value="' + employeeId + '"]').click();
  await page.getByRole('button', { name: 'Total', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar venda', exact: true }).click();
  await page.waitForURL(/\/sales\/[a-f0-9-]+$/);
  await page
    .getByRole('heading', { name: /Venda nº/, exact: false })
    .first()
    .waitFor();
  await page.getByRole('cell').filter({ hasText: 'PRODUTO QA' }).waitFor();
  await page.screenshot({
    path: '../../docs/qa/venda-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Imprimir comprovante', exact: true }).click();
  const receipt = page.getByRole('dialog', { name: 'Comprovante', exact: true });
  await receipt.waitFor();
  await receipt.getByRole('heading', { name: 'CHARME TOTAL QA', exact: true }).waitFor();
  assert.equal(await receipt.locator('.document-grand-total dd').innerText(), 'R$\u00a010,00');
  await page.screenshot({ path: '../../docs/qa/comprovante-previa-a4.png', fullPage: true });
  await page.getByLabel('Formato do comprovante').selectOption('thermal');
  assert.ok((await receipt.locator('.receipt-thermal').boundingBox())!.width <= 303);
  await page.getByLabel('Fechar comprovante').click();
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.sale-record').isVisible(), false);
  const thermal = await page.pdf({
    path: '../../docs/qa/comprovante-80mm.pdf',
    preferCSSPageSize: true,
    printBackground: true,
  });
  assert.ok(thermal.length > 1000);
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Imprimir comprovante', exact: true }).click();
  await page.getByLabel('Formato do comprovante').selectOption('a4');
  await page.getByLabel('Fechar comprovante').click();
  await page.emulateMedia({ media: 'print' });
  const a4 = await page.pdf({
    path: '../../docs/qa/comprovante-a4.pdf',
    preferCSSPageSize: true,
    printBackground: true,
  });
  assert.ok(a4.length > 1000);
  await page.emulateMedia({ media: 'screen' });
});
test('fichas desktop exibem nomes e dialogo protege alteracoes nao salvas', async () => {
  let nativeDialogs = 0;
  const native = async (dialog: import('@playwright/test').Dialog) => {
    nativeDialogs++;
    await dialog.dismiss();
  };
  page.on('dialog', native);
  try {
    const response = await page.request.get('http://127.0.0.1:3101/api/v1/products?q=QA-001');
    const product = (await response.json()).data[0];
    await page.goto('http://127.0.0.1:3101/products/' + product.id);
    await page.locator('.record-values').getByText('CATEGORIA QA', { exact: true }).waitFor();
    await page.locator('.record-values').getByText('VERDE', { exact: true }).waitFor();
    assert.equal(
      (await page.locator('.desktop-record').innerText()).includes(product.categoryId),
      false,
    );
    assert.equal((await page.locator('.desktop-record').innerText()).includes('{"'), false);
    await page.screenshot({ path: '../../docs/qa/ficha-produto-desktop.png', fullPage: true });
    await page.goto('http://127.0.0.1:3101/employees/' + employeeId);
    await page.locator('.record-values').getByText('5 %', { exact: true }).waitFor();
    await page.screenshot({ path: '../../docs/qa/ficha-colaboradora-desktop.png', fullPage: true });
    await page.goto('http://127.0.0.1:3101/customers/new');
    await page.getByLabel('Nome completo').fill('RASCUNHO NAO SALVAR');
    await page.getByRole('link', { name: 'Produtos', exact: true }).click();
    const modal = page.getByRole('dialog');
    await modal.waitFor();
    assert.equal(
      await page
        .getByRole('button', { name: 'Continuar editando', exact: true })
        .evaluate((el) => document.activeElement === el),
      true,
    );
    await page.screenshot({ path: '../../docs/qa/confirmacao-desktop.png', fullPage: true });
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden' });
    assert.match(page.url(), /customers\/new$/);
    assert.equal(await page.getByLabel('Nome completo').inputValue(), 'RASCUNHO NAO SALVAR');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await modal.waitFor();
    await page.getByRole('button', { name: /Descartar altera/ }).click();
    await page.waitForURL('**/customers');
    assert.equal(nativeDialogs, 0);
  } finally {
    page.off('dialog', native);
  }
});

test('caixa da empresa registra saldo, entrada e estorno sem alterar caixa operacional', async () => {
  await page.goto('http://127.0.0.1:3101/treasury');
  const balance = page.locator('.treasury-metrics > div:first-child strong');
  await treasuryExpect(balance).toHaveText('Não informado');
  await page.getByRole('button', { name: 'Informar saldo inicial', exact: true }).click();
  await page.getByLabel('Saldo inicial (R$)', { exact: true }).fill('1000');
  await page
    .getByLabel('Motivo / referência', { exact: true })
    .fill('Saldo antes das movimentacoes do dia QA');
  await page.getByRole('button', { name: 'Salvar saldo inicial', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await treasuryExpect(balance).toHaveText(/1\.010,00/);
  await page.getByRole('button', { name: 'Novo lançamento', exact: true }).click();
  await page.getByLabel('Valor (R$)', { exact: true }).fill('500');
  await page
    .getByRole('dialog', { name: 'Novo lançamento', exact: true })
    .getByRole('combobox')
    .last()
    .selectOption('BANK');
  await page
    .getByRole('dialog', { name: 'Novo lançamento', exact: true })
    .getByRole('textbox', { name: /Descri/ })
    .fill('Aporte exclusivo tesouraria QA');
  await page.getByRole('button', { name: 'Registrar movimento', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await treasuryExpect(balance).toHaveText(/1\.510,00/);
  await page.getByRole('row').filter({ hasText: 'Aporte exclusivo tesouraria QA' }).click();
  await page.getByRole('button', { name: 'Estornar lançamento', exact: true }).click();
  await page.getByLabel('Motivo', { exact: true }).fill('Estorno de aporte exclusivo QA');
  await page.getByRole('button', { name: 'Estornar', exact: true }).click();
  await treasuryExpect(balance).toHaveText(/1\.010,00/);
  await page
    .getByRole('row')
    .filter({ hasText: 'Aporte exclusivo tesouraria QA' })
    .getByText('Estornado', { exact: true })
    .waitFor();
  await page.screenshot({ path: '../../docs/qa/caixa-empresa-desktop.png', fullPage: true });
  const operational = await page.request.get('http://127.0.0.1:3101/api/v1/cash-registers/current');
  assert.equal(Number((await operational.json()).expected), 20);
});

test('perfil permite enviar foto, manter apos recarregar e remover', async () => {
  const sharp = (await import('sharp')).default;
  const buffer = await sharp({
    create: { width: 80, height: 80, channels: 3, background: '#91535f' },
  })
    .png()
    .toBuffer();
  await page.getByLabel('Abrir perfil', { exact: true }).click();
  await page
    .getByLabel('Selecionar foto de perfil')
    .setInputFiles({ name: 'foto-qa.png', mimeType: 'image/png', buffer });
  await page.getByRole('button', { name: 'Trocar foto', exact: true }).waitFor();
  await page.reload();
  await page.getByAltText('Sua foto de perfil').waitFor();
  await page.goto('http://127.0.0.1:3101/customers/new');
  await page.locator('.record-footer .status-control input').waitFor();
  assert.equal(await page.locator('.record-sheet .form-section').count(), 3);
  await page.screenshot({ path: '../../docs/qa/cadastro-desktop.png', fullPage: true });
  await page.getByLabel('Abrir perfil', { exact: true }).click();
  await page.getByRole('button', { name: 'Remover foto', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar foto', exact: true }).waitFor();
  assert.equal(await page.getByAltText('Sua foto de perfil').count(), 0);
});

test('responsividade e paginas operacionais nao geram erros de runtime', async () => {
  for (const path of [
    'customers',
    'employees',
    'finance',
    'purchases',
    'goals',
    'commissions',
    'reports',
    'loyalty',
    'notifications',
    'settings',
    'users',
    'audit',
  ]) {
    await page.goto('http://127.0.0.1:3101/' + path);
    await page.locator('h1').waitFor();
    assert.equal(
      await page.getByText('Unexpected Application Error!', { exact: false }).count(),
      0,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:3101/inventory');
  await page.getByRole('heading', { name: 'Controle de estoque' }).waitFor();
  await page.getByRole('cell', { name: 'PRODUTO QA', exact: true }).waitFor();
  await page.screenshot({
    path: '../../docs/qa/estoque-mobile.png',
    fullPage: true,
  });
  assert.deepEqual(browserErrors, []);
});
afterEach(async () => {
  if (page && !page.isClosed()) {
    const alerts = await page.locator('.message.error').allTextContents();
    if (alerts.length) console.log(JSON.stringify({ path: new URL(page.url()).pathname, alerts }));
  }
});
