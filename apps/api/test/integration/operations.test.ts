import 'reflect-metadata';
import 'dotenv/config';
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import supertest from 'supertest';
import * as argon2 from 'argon2';
import { permissions } from '@chame/shared';
import type { INestApplication } from '@nestjs/common';
import type { Database } from '../../src/common/db';
import type { Actor } from '../../src/common/security';
const schema = 'chame_test_' + randomBytes(12).toString('hex');
if (!/^chame_test_[a-f0-9]{24}$/.test(schema)) throw new Error('Schema de teste invalido.');
const connection = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connection)
  throw new Error(
    'Configure TEST_DATABASE_URL (preferencial) ou DATABASE_URL para schema de teste isolado.',
  );
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = connection;
process.env.DATABASE_SCHEMA = schema;
process.env.APP_ORIGIN = 'http://127.0.0.1:3101';
process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('hex');
const pool = new pg.Pool({ connectionString: connection, max: 1 });
let app: INestApplication,
  db: Database,
  actor: Actor,
  employeeId: string,
  customerId: string,
  sessionCookie: string,
  csrfToken: string;
const password = 'TesteSomente!12345';
let saleId: string;
let recoveryCodes: string[] = [];
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
  const { Database: DB } = await import('../../src/common/db');
  app = await createApp();
  db = app.get(DB);
  const namespace = await db.$queryRaw<
    { schema: string }[]
  >`SELECT current_schema()::text AS schema`;
  assert.equal(namespace[0].schema, schema);
  const company = await db.company.create({
    data: { name: 'EMPRESA EXCLUSIVA DE TESTE' },
  });
  const store = await db.store.create({
    data: { companyId: company.id, name: 'UNIDADE DE TESTE' },
  });
  await db.setting.create({ data: { companyId: company.id } });
  const employee = await db.employee.create({
    data: {
      companyId: company.id,
      name: 'VENDEDORA DE TESTE',
      commissionPercent: '5',
    },
  });
  employeeId = employee.id;
  const customer = await db.customer.create({
    data: { companyId: company.id, name: 'CLIENTE DE TESTE' },
  });
  customerId = customer.id;
  const user = await db.user.create({
    data: {
      companyId: company.id,
      storeId: store.id,
      name: 'ADMIN DE TESTE',
      email: 'admin@example.test',
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      employeeId,
    },
  });
  const role = await db.role.create({
    data: { companyId: company.id, name: 'TEST' },
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
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('Origin', process.env.APP_ORIGIN!)
    .send({ email: user.email, password })
    .expect(201);
  sessionCookie = String(login.headers['set-cookie'][0]).split(';')[0];
  csrfToken = login.body.csrfToken;
  const me = await supertest(app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Cookie', sessionCookie)
    .expect(200);
  actor = { ...me.body, sessionId: 'test' };
});
after(async () => {
  if (app) await app.close();
  if (/^chame_test_[a-f0-9]{24}$/.test(schema)) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
  await pool.end();
});
const request = () => supertest(app.getHttpServer());
const post = (path: string, body: unknown, key = randomUUID()) =>
  request()
    .post('/api/v1/' + path)
    .set('Origin', process.env.APP_ORIGIN!)
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', csrfToken)
    .set('Idempotency-Key', key)
    .send(body);
async function product(stock: string, price = '10') {
  const p = await db.product.create({
    data: {
      companyId: actor.companyId,
      name: 'PRODUTO DE TESTE',
      sku: randomUUID(),
      price,
      cost: '2',
      minStock: '0',
    },
  });
  if (stock !== '0')
    await post('inventory/adjust', {
      productId: p.id,
      quantity: stock,
      reason: 'Entrada exclusiva de teste',
    }).expect(201);
  return p;
}
const saleBody = (id: string, amount = '10') => ({
  employeeId,
  customerId,
  items: [{ productId: id, quantity: '1', discount: '0' }],
  discount: '0',
  payments: [{ method: 'CASH', amount }],
});
test('API exige sessao, origem e CSRF', async () => {
  await request().get('/api/v1/products').expect(401);
  await request().get('/api/v1/docs-json').expect(401);
  await request().get('/api/v1/docs-yaml').expect(401);
  await request().post('/api/v1/products').set('Cookie', sessionCookie).send({}).expect(403);
  await request()
    .post('/api/v1/products')
    .set('Origin', process.env.APP_ORIGIN!)
    .set('Cookie', sessionCookie)
    .send({})
    .expect(403);
});
test('caixa atual sem abertura retorna JSON null explicito', async () => {
  const response = await supertest(app.getHttpServer())
    .get('/api/v1/cash-registers/current')
    .set('Cookie', sessionCookie)
    .expect(200)
    .expect('Content-Type', /json/);
  assert.equal(response.text, 'null');
  assert.equal(response.body, null);
});

test('foto do perfil valida imagem, persiste, remove e exige CSRF', async () => {
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#91535f' } })
    .png()
    .toBuffer();
  const image = 'data:image/png;base64,' + png.toString('base64');
  const server = supertest(app.getHttpServer());
  await server
    .post('/api/v1/auth/photo')
    .set('Cookie', sessionCookie)
    .set('Origin', process.env.APP_ORIGIN!)
    .send({ image })
    .expect(403);
  await server
    .post('/api/v1/auth/photo')
    .set('Cookie', sessionCookie)
    .set('Origin', process.env.APP_ORIGIN!)
    .set('X-CSRF-Token', csrfToken)
    .send({ image: 'data:image/png;base64,YWJj' })
    .expect(400);
  await server
    .post('/api/v1/auth/photo')
    .set('Cookie', sessionCookie)
    .set('Origin', process.env.APP_ORIGIN!)
    .set('X-CSRF-Token', csrfToken)
    .send({ image })
    .expect(201);
  const result = await server.get('/api/v1/auth/photo').set('Cookie', sessionCookie).expect(200);
  assert.match(result.body.avatarData, /^data:image\/jpeg;base64,/);
  assert.equal(result.headers['cache-control'], 'no-store');
  const metadata = await sharp(
    Buffer.from(result.body.avatarData.split(',')[1], 'base64'),
  ).metadata();
  assert.equal(metadata.width, 160);
  assert.equal(metadata.height, 160);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: actor.id } })).avatarData,
    result.body.avatarData,
  );
  await server
    .post('/api/v1/auth/photo')
    .set('Cookie', sessionCookie)
    .set('Origin', process.env.APP_ORIGIN!)
    .set('X-CSRF-Token', csrfToken)
    .send({ image: null })
    .expect(201);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: actor.id } })).avatarData, null);
});

test('caixa abre uma vez e impede abertura concorrente', async () => {
  await post('cash-registers/open', { amount: '20' }).expect(201);
  await post('cash-registers/open', { amount: '20' }).expect(409);
});
test('venda confirmada persiste todos os efeitos e reenvio nao duplica', async () => {
  const p = await product('3');
  const key = randomUUID(),
    body = saleBody(p.id);
  const first = await post('sales', body, key).expect(201),
    again = await post('sales', body, key).expect(201);
  saleId = first.body.id;
  assert.equal(again.body.id, saleId);
  assert.equal(await db.sale.count({ where: { id: saleId } }), 1);
  assert.equal(
    await db.stockMovement.count({
      where: { referenceId: saleId, type: 'SALE' },
    }),
    1,
  );
  assert.equal(
    (
      await db.stockBalance.findUniqueOrThrow({
        where: {
          storeId_productId: { storeId: actor.storeId, productId: p.id },
        },
      })
    ).quantity.toString(),
    '2',
  );
  assert.equal(
    (
      await db.commissionEntry.findUniqueOrThrow({
        where: { sourceId: saleId },
      })
    ).amount.toString(),
    '0.5',
  );
  assert.equal(
    await db.financialEntry.count({
      where: { referenceId: saleId, source: 'SALE' },
    }),
    1,
  );
  await post('sales', { ...body, notes: 'diferente' }, key).expect(409);
});
test('ultimo saldo nao e consumido por duas vendas simultaneas', async () => {
  const p = await product('1');
  const responses = await Promise.all([
    post('sales', saleBody(p.id)),
    post('sales', saleBody(p.id)),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    (
      await db.stockBalance.findUniqueOrThrow({
        where: {
          storeId_productId: { storeId: actor.storeId, productId: p.id },
        },
      })
    ).quantity.toString(),
    '0',
  );
});
test('falha de estoque reverte todos os efeitos da venda', async () => {
  const p = await product('0'),
    before = await db.sale.count();
  await post('sales', saleBody(p.id)).expect(409);
  assert.equal(await db.sale.count(), before);
  assert.equal(await db.saleItem.count({ where: { productId: p.id } }), 0);
});
test('snapshot de preco e audit log nao aceitam alteracao', async () => {
  const item = await db.saleItem.findFirstOrThrow({ where: { saleId } });
  await db.product.update({
    where: { id: item.productId },
    data: { price: '25' },
  });
  assert.equal(
    (await db.saleItem.findUniqueOrThrow({ where: { id: item.id } })).unitPrice.toString(),
    '10',
  );
  await assert.rejects(() =>
    db.saleItem.update({ where: { id: item.id }, data: { unitPrice: '99' } }),
  );
  const audit = await db.auditLog.findFirstOrThrow();
  await assert.rejects(() =>
    db.auditLog.update({
      where: { id: audit.id },
      data: { action: 'tampered' },
    }),
  );
});
test('devolucao total compensa financeiro, comissao e estoque', async () => {
  const item = await db.saleItem.findFirstOrThrow({ where: { saleId } });
  await post(`sales/${saleId}/returns`, {
    reason: 'Devolucao exclusiva de teste',
    items: [{ saleItemId: item.id, quantity: '1', restock: true }],
    refundMethod: 'CASH',
  }).expect(201);
  assert.equal(
    (await db.sale.findUniqueOrThrow({ where: { id: saleId } })).returnedTotal.toString(),
    '10',
  );
  const commission = await db.commissionEntry.aggregate({
    where: { saleId },
    _sum: { amount: true },
  });
  assert.equal(commission._sum.amount!.toString(), '0');
  await post(`sales/${saleId}/returns`, {
    reason: 'Nao pode devolver duas vezes',
    items: [{ saleItemId: item.id, quantity: '1', restock: true }],
  }).expect(400);
});
test('cancelamento preserva venda e estorna somente uma vez', async () => {
  const p = await product('1');
  const sale = await post('sales', saleBody(p.id)).expect(201);
  const key = randomUUID();
  await post(
    `sales/${sale.body.id}/cancel`,
    { reason: 'Cancelamento exclusivo de teste' },
    key,
  ).expect(201);
  await post(
    `sales/${sale.body.id}/cancel`,
    { reason: 'Cancelamento exclusivo de teste' },
    key,
  ).expect(201);
  assert.equal(
    (await db.sale.findUniqueOrThrow({ where: { id: sale.body.id } })).status,
    'CANCELLED',
  );
  assert.equal(
    await db.stockMovement.count({
      where: { referenceId: sale.body.id, type: 'CANCELLATION' },
    }),
    1,
  );
});
test('pagamento incorreto e desconto acima do limite sao rejeitados', async () => {
  const p = await product('2');
  await post('sales', saleBody(p.id, '9')).expect(400);
  await post('sales', { ...saleBody(p.id, '8'), discount: '2' }).expect(403);
});
test('compra com recebimento parcial gera estoque e conta vinculada', async () => {
  const supplier = await db.supplier.create({
      data: { companyId: actor.companyId, name: 'FORNECEDOR DE TESTE' },
    }),
    p = await product('0');
  const order = await post('purchases', {
    paymentMethod: 'PIX',
    supplierId: supplier.id,
    dueDate: '2026-10-30',
    items: [{ productId: p.id, quantity: '2', unitCost: '3' }],
  }).expect(201);
  const item = await db.purchaseOrderItem.findFirstOrThrow({
    where: { purchaseId: order.body.id },
  });
  const key = randomUUID();
  await post(
    `purchases/${order.body.id}/receive`,
    { items: [{ purchaseItemId: item.id, quantity: '1' }] },
    key,
  ).expect(201);
  await post(
    `purchases/${order.body.id}/receive`,
    { items: [{ purchaseItemId: item.id, quantity: '1' }] },
    key,
  ).expect(201);
  assert.equal(
    (await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.body.id } })).status,
    'PARTIALLY_RECEIVED',
  );
  assert.equal(
    (
      await db.stockBalance.findUniqueOrThrow({
        where: {
          storeId_productId: { storeId: actor.storeId, productId: p.id },
        },
      })
    ).quantity.toString(),
    '1',
  );
  await post(`purchases/${order.body.id}/receive`, {
    items: [{ purchaseItemId: item.id, quantity: '2' }],
  }).expect(400);
});
test('baixa parcial nao excede o valor financeiro', async () => {
  const entry = await post('finance', {
    direction: 'OUT',
    description: 'Despesa de teste',
    amount: '8',
    dueDate: '2026-10-30',
    category: 'Teste',
  }).expect(201);
  await post(`finance/${entry.body.id}/settle`, {
    amount: '3',
    method: 'PIX',
  }).expect(201);
  assert.equal(
    (
      await db.financialEntry.findUniqueOrThrow({
        where: { id: entry.body.id },
      })
    ).status,
    'PARTIAL',
  );
  await post(`finance/${entry.body.id}/settle`, {
    amount: '6',
    method: 'PIX',
  }).expect(400);
});
test('RBAC e escopo de empresa impedem IDOR e exportacoes', async () => {
  const outside = await db.company.create({
      data: { name: 'OUTRA EMPRESA DE TESTE' },
    }),
    customer = await db.customer.create({
      data: { companyId: outside.id, name: 'CLIENTE FORA DO ESCOPO' },
    });
  await request()
    .get('/api/v1/customers/' + customer.id)
    .set('Cookie', sessionCookie)
    .expect(404);
  const roles = await db.userRole.findMany({ where: { userId: actor.id } });
  await db.rolePermission.deleteMany({
    where: { roleId: roles[0].roleId, permissionKey: 'reports.export' },
  });
  await request().get('/api/v1/reports?format=xlsx').set('Cookie', sessionCookie).expect(403);
  await db.rolePermission.create({
    data: { roleId: roles[0].roleId, permissionKey: 'reports.export' },
  });
});
test('metas e dashboard consultam vendas elegiveis; Excel e PDF funcionam', async () => {
  const period = new Date().toISOString().slice(0, 7);
  await post('sales-goals', { period, amount: '1000' }).expect(201);
  const dashboard = await request()
    .get('/api/v1/dashboard')
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.equal(dashboard.body.revenue, '10.00');
  assert.equal(dashboard.body.grossProfit, '8.00');
  assert.equal(dashboard.body.daily.length, 1);
  const excel = await request()
    .get('/api/v1/reports?format=xlsx')
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.match(String(excel.headers['content-type']), /spreadsheet/);
  await request().get('/api/v1/reports?format=pdf').set('Cookie', sessionCookie).expect(200);
});

test('bootstrap publico nao permite recriar administrador', async () => {
  const status = await request().get('/api/v1/bootstrap/status').expect(200);
  assert.equal(status.body.initialized, true);
  await post('bootstrap', {
    name: 'Outro admin',
    email: 'other@example.test',
    password: 'SenhaForteParaTeste123',
  }).expect(409);
});
test('sangria nao permite dinheiro negativo', async () => {
  await post('cash-registers/movements', {
    type: 'WITHDRAWAL',
    amount: '99999',
    reason: 'Teste de limite de caixa',
  }).expect(409);
});
test('comissao paga uma vez com reenvio concorrente', async () => {
  await post('commissions/approve', { employeeId }).expect(201);
  const key = randomUUID();
  const responses = await Promise.all([
    post('commissions/settle', { employeeId, method: 'PIX' }, key),
    post('commissions/settle', { employeeId, method: 'PIX' }, key),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [201, 201],
  );
  assert.equal(responses[0].body.id, responses[1].body.id);
  assert.equal(await db.commissionSettlement.count({ where: { employeeId } }), 1);
  await post('commissions/settle', { employeeId, method: 'PIX' }).expect(400);
});
test('token de reset e consumido uma vez e revoga sessoes', async () => {
  const { hash } = await import('../../src/common/security');
  const user = await db.user.create({
    data: {
      companyId: actor.companyId,
      storeId: actor.storeId,
      name: 'RESET EXCLUSIVO DE TESTE',
      email: 'reset@example.test',
      passwordHash: await argon2.hash('SenhaAntigaDeTeste123'),
    },
  });
  const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 60000) },
  });
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: hash(randomUUID()),
      csrfToken: randomUUID(),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  await post('auth/reset-password', { token, password: 'NovaSenhaExclusivaTeste123' }).expect(201);
  await post('auth/reset-password', { token, password: 'NovaSenhaExclusivaTeste123' }).expect(400);
  assert.equal(await db.session.count({ where: { userId: user.id } }), 0);
  assert.equal(
    await argon2.verify(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash,
      'NovaSenhaExclusivaTeste123',
    ),
    true,
  );
});
test('historico de cliente calcula vendas liquidas no escopo', async () => {
  const result = await request()
    .get('/api/v1/customers/' + customerId + '/history')
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.equal(result.body.totalSpent, '10.00');
  assert.equal(result.body.saleCount, 2);
});

test('gestor limitado nao amplia privilegios nem redefine administrador superior', async () => {
  const role = await db.role.create({
    data: { companyId: actor.companyId, name: 'GESTOR LIMITADO DE TESTE' },
  });
  await db.rolePermission.create({ data: { roleId: role.id, permissionKey: 'users.manage' } });
  const user = await db.user.create({
    data: {
      companyId: actor.companyId,
      storeId: actor.storeId,
      name: 'GESTOR LIMITADO DE TESTE',
      email: 'limited@example.test',
      passwordHash: await argon2.hash('SenhaLimitadaSomenteTeste123'),
    },
  });
  await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const login = await request()
    .post('/api/v1/auth/login')
    .set('Origin', process.env.APP_ORIGIN!)
    .send({ email: user.email, password: 'SenhaLimitadaSomenteTeste123' })
    .expect(201);
  const cookie = String(login.headers['set-cookie'][0]).split(';')[0];
  const adminRole = await db.userRole.findFirstOrThrow({ where: { userId: actor.id } });
  const limited = (path: string) =>
    request()
      .post('/api/v1/' + path)
      .set('Origin', process.env.APP_ORIGIN!)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', login.body.csrfToken);
  await limited('users/roles')
    .send({ name: 'ESCALADA PROIBIDA', permissions: ['users.manage', 'finance.manage'] })
    .expect(403);
  await limited('users')
    .send({
      name: 'ESCALADA PROIBIDA',
      email: 'escalation@example.test',
      password: 'SenhaProibidaSomenteTeste123',
      roleIds: [adminRole.roleId],
    })
    .expect(403);
  await request()
    .put('/api/v1/users/' + actor.id)
    .set('Origin', process.env.APP_ORIGIN!)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', login.body.csrfToken)
    .send({ name: 'ALTERACAO PROIBIDA', email: 'admin@example.test', roleIds: [role.id] })
    .expect(403);
});
test('ordenacao e validada por recurso e auditoria preserva valores', async () => {
  await request()
    .get('/api/v1/products?sort=price&order=desc')
    .set('Cookie', sessionCookie)
    .expect(200);
  await request().get('/api/v1/categories?sort=price').set('Cookie', sessionCookie).expect(400);
  const p = await product('0', '7');
  await request()
    .put('/api/v1/products/' + p.id)
    .set('Origin', process.env.APP_ORIGIN!)
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', csrfToken)
    .send({
      name: p.name,
      sku: p.sku,
      cost: '2',
      price: '8',
      minStock: '0',
      unit: 'UN',
      active: true,
      variantAttributes: {},
    })
    .expect(200);
  const log = await db.auditLog.findFirstOrThrow({ where: { entityId: p.id, action: 'update' } });
  const details = log.details as {
    previous: { price: string };
    next: { price: string };
    result: string;
  };
  assert.equal(details.previous.price, '7');
  assert.equal(details.next.price, '8');
  assert.equal(details.result, 'SUCCESS');
});
test('unidade UN rejeita fracao e preserva unidade do historico', async () => {
  const p = await product('0');
  await post('inventory/adjust', {
    productId: p.id,
    quantity: '0.5',
    reason: 'Fracao indevida em unidade inteira',
  }).expect(400);
  const supplier = await db.supplier.create({
    data: { companyId: actor.companyId, name: 'FORNECEDOR UN DE TESTE' },
  });
  await post('purchases', {
    paymentMethod: 'PIX',
    supplierId: supplier.id,
    dueDate: '2026-10-30',
    items: [{ productId: p.id, quantity: '0.5', unitCost: '2' }],
  }).expect(400);
  const sale = await db.sale.findFirstOrThrow({
    where: {
      companyId: actor.companyId,
      storeId: actor.storeId,
      status: 'CONFIRMED',
      returnedTotal: '0',
    },
  });
  const item = await db.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
  const returned = await post('sales/' + sale.id + '/returns', {
    reason: 'Tentativa de devolver meia unidade',
    items: [{ saleItemId: item.id, quantity: '0.5', restock: false }],
    refundMethod: 'CASH',
  }).expect(400);
  assert.match(returned.body.message, /inteira/);
  const original = await db.product.findUniqueOrThrow({ where: { id: item.productId } });
  await request()
    .put('/api/v1/products/' + original.id)
    .set('Origin', process.env.APP_ORIGIN!)
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', csrfToken)
    .send({
      name: original.name,
      sku: original.sku,
      cost: original.cost.toFixed(2),
      price: original.price.toFixed(2),
      unit: 'KG',
      minStock: '0',
      active: true,
      variantAttributes: {},
    })
    .expect(400);
});
test('MFA exigido restringe operacao ate configuracao', async () => {
  await db.user.update({
    where: { id: actor.id },
    data: { mfaRequired: true },
  });
  await request().get('/api/v1/products').set('Cookie', sessionCookie).expect(403);
  const setup = await post('auth/mfa/setup', {}).expect(201);
  const OTP = await import('otpauth');
  const totp = OTP.URI.parse(setup.body.uri);
  const enabled = await post('auth/mfa/enable', {
    code: totp.generate(),
  }).expect(201);
  assert.equal(enabled.body.recoveryCodes.length, 8);
  recoveryCodes = enabled.body.recoveryCodes;
  await request()
    .post('/api/v1/auth/login')
    .set('Origin', process.env.APP_ORIGIN!)
    .send({ email: actor.email, password, otp: totp.generate() })
    .expect(201);
  await request()
    .post('/api/v1/auth/login')
    .set('Origin', process.env.APP_ORIGIN!)
    .send({ email: actor.email, password })
    .expect(401);
  await request().get('/api/v1/products').set('Cookie', sessionCookie).expect(200);
});
test('recuperacao MFA nao e consumida quando a sessao falha e so permite um uso', async () => {
  const { hash } = await import('../../src/common/security');
  const original = db.atomic.bind(db);
  db.atomic = async () => {
    throw new Error('Falha simulada exclusivamente no teste');
  };
  try {
    await request()
      .post('/api/v1/auth/login')
      .set('Origin', process.env.APP_ORIGIN!)
      .send({ email: actor.email, password, otp: recoveryCodes[0] })
      .expect(500);
  } finally {
    db.atomic = original;
  }
  assert.equal(
    (await db.mfaRecoveryCode.findUniqueOrThrow({ where: { codeHash: hash(recoveryCodes[0]) } }))
      .usedAt,
    null,
  );
  await request()
    .post('/api/v1/auth/login')
    .set('Origin', process.env.APP_ORIGIN!)
    .send({ email: actor.email, password, otp: recoveryCodes[0] })
    .expect(201);
  await request()
    .post('/api/v1/auth/login')
    .set('Origin', process.env.APP_ORIGIN!)
    .send({ email: actor.email, password, otp: recoveryCodes[0] })
    .expect(401);
});
test('sessao revogada deixa de autorizar requisicoes', async () => {
  await post('auth/logout', {}).expect(201);
  await request().get('/api/v1/products').set('Cookie', sessionCookie).expect(401);
});

test('ajuste manual permite saida e impede estoque negativo', async () => {
  const p = await product('3');
  await post('inventory/adjust', {
    productId: p.id,
    quantity: '-2',
    reason: 'Avaria na conferencia',
  }).expect(201);
  const balance = await db.stockBalance.findUniqueOrThrow({
    where: { storeId_productId: { storeId: actor.storeId, productId: p.id } },
  });
  assert.equal(balance.quantity.toString(), '1');
  await post('inventory/adjust', {
    productId: p.id,
    quantity: '-2',
    reason: 'Saida acima do saldo',
  }).expect(409);
  assert.equal(
    (await db.stockBalance.findUniqueOrThrow({ where: { id: balance.id } })).quantity.toString(),
    '1',
  );
});

test('faltas em compras acompanham entrega, reembolso e credito sem movimentar valores', async () => {
  const p = await product('0');
  const supplier = await db.supplier.create({
    data: { companyId: actor.companyId, name: 'FORNECEDOR FALTAS QA' },
  });
  const order = await post('purchases', {
    paymentMethod: 'PIX',
    supplierId: supplier.id,
    items: [{ productId: p.id, quantity: '2', unitCost: '200' }],
    dueDate: '2026-10-30',
  }).expect(201);
  const purchaseId = order.body.id;
  const item = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseId } });
  const endpoint = 'purchases/' + purchaseId;
  await post(endpoint + '/receive', { items: [{ purchaseItemId: item.id, quantity: '1' }] }).expect(
    201,
  );
  const financialBefore = await db.financialEntry.findMany({
    where: { companyId: actor.companyId },
    orderBy: { id: 'asc' },
  });
  const cashBefore = await db.cashMovement.count({ where: { companyId: actor.companyId } });
  const body = {
    purchaseItemId: item.id,
    action: 'REFUND',
    reason: 'Uma unidade nao veio na embalagem',
  };
  const idem = randomUUID();
  const refund = await post(endpoint + '/issues', body, idem).expect(201);
  assert.equal(refund.body.amount, '200');
  assert.equal(refund.body.quantity, '1');
  const replay = await post(endpoint + '/issues', body, idem).expect(201);
  assert.equal(replay.body.id, refund.body.id);
  await post(endpoint + '/issues', body).expect(409);
  await post(endpoint + '/issues', { ...body, amount: '999' }).expect(400);
  await post(endpoint + '/issues', { ...body, purchaseItemId: randomUUID() }).expect(400);
  await post(endpoint + '/receive', { items: [{ purchaseItemId: item.id, quantity: '1' }] }).expect(
    409,
  );
  await post(endpoint + '/issues/' + refund.body.id + '/resolve', {
    reason: 'Fornecedor ofereceu credito, substituir tratativa',
  }).expect(201);
  await post(endpoint + '/issues/' + refund.body.id + '/resolve', {
    reason: 'Repetir encerramento nao permitido',
  }).expect(409);
  const credit = await post(endpoint + '/issues', {
    ...body,
    action: 'CREDIT',
    reason: 'Credito acordado com fornecedor para proximo pedido',
  }).expect(201);
  assert.equal(credit.body.amount, '200');
  assert.deepEqual(
    await db.financialEntry.findMany({
      where: { companyId: actor.companyId },
      orderBy: { id: 'asc' },
    }),
    financialBefore,
  );
  assert.equal(await db.cashMovement.count({ where: { companyId: actor.companyId } }), cashBefore);
  const detail = await request()
    .get('/api/v1/' + endpoint)
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.equal(detail.body.issues.length, 2);
  assert.equal(detail.body.supplierName, supplier.name);
  assert.equal(detail.body.status, 'PARTIALLY_RECEIVED');
  await post(endpoint + '/issues/' + credit.body.id + '/resolve', {
    reason: 'Fornecedor confirmou envio da unidade restante',
  }).expect(201);
  const wait = await post(endpoint + '/issues', {
    ...body,
    action: 'WAIT',
    reason: 'Aguardando entrega complementar confirmada',
  }).expect(201);
  await post(endpoint + '/receive', { items: [{ purchaseItemId: item.id, quantity: '1' }] }).expect(
    201,
  );
  const done = await db.purchaseIssue.findUniqueOrThrow({ where: { id: wait.body.id } });
  assert.equal(done.status, 'RESOLVED');
  assert.ok(done.resolvedAt);
  assert.equal(
    (await db.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseId } })).status,
    'RECEIVED',
  );
  await post(endpoint + '/issues', body).expect(400);
  await request()
    .post('/api/v1/' + endpoint + '/issues')
    .send(body)
    .expect(403);
});

test('compra paga sai da empresa uma vez e reembolso recebido encerra a falta', async () => {
  const { PurchasesService } = await import('../../src/modules/purchases/purchases.service');
  const service = app.get(PurchasesService);
  await assert.rejects(
    () =>
      Promise.resolve().then(() =>
        service.create({ ...actor, permissions: ['purchases.manage'] }, {}, randomUUID()),
      ),
    (err: unknown) => (err as { status: number }).status === 403,
  );
  const baseline = await db.treasuryBaseline.findUnique({ where: { companyId: actor.companyId } });
  if (!baseline)
    await post('treasury/initialize', {
      amount: '1000',
      date: '2000-01-01',
      reason: 'Saldo inicial exclusivo teste compras pagas',
    }).expect(201);
  const summary = async () =>
    (await request().get('/api/v1/treasury').set('Cookie', sessionCookie).expect(200)).body;
  const before = Number((await summary()).balance),
    cashBefore = await db.cashMovement.count({ where: { companyId: actor.companyId } });
  const supplier = await db.supplier.create({
      data: { companyId: actor.companyId, name: 'Fornecedor pagamento QA' },
    }),
    p = await product('0');
  const body = {
    supplierId: supplier.id,
    paymentMethod: 'PIX',
    dueDate: '2026-10-30',
    items: [{ productId: p.id, quantity: '2', unitCost: '200' }],
  };
  await post('purchases', { ...body, paymentMethod: undefined }).expect(400);
  const purchaseKey = randomUUID(),
    created = await post('purchases', body, purchaseKey).expect(201),
    id = created.body.id;
  assert.equal(created.body.paymentMode, 'PREPAID');
  assert.ok(created.body.paidAt);
  assert.ok(created.body.paymentEntryId);
  assert.equal((await post('purchases', body, purchaseKey).expect(201)).body.id, id);
  assert.equal(Number((await summary()).balance), before - 400);
  const finance = await db.financialEntry.findFirstOrThrow({
    where: { referenceId: id, source: 'PURCHASE_PAYMENT' },
  });
  assert.equal(finance.status, 'SETTLED');
  assert.equal(finance.amount.toString(), '400');
  assert.equal(finance.settledAmount.toString(), '400');
  assert.equal(await db.financialSettlement.count({ where: { entryId: finance.id } }), 1);
  await post('finance/' + finance.id + '/settle', { amount: '1', method: 'PIX' }).expect(
    (response) =>
      assert.ok(
        [400, 409].includes(response.status),
        'Uma compra liquidada nao admite novo pagamento.',
      ),
  );
  const item = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseId: id } });
  await post('purchases/' + id + '/receive', {
    items: [{ purchaseItemId: item.id, quantity: '1' }],
  }).expect(201);
  assert.equal(Number((await summary()).balance), before - 400);
  assert.equal(
    await db.financialEntry.count({ where: { referenceId: id, source: 'PURCHASE_PAYMENT' } }),
    1,
  );
  const issue = await post('purchases/' + id + '/issues', {
    purchaseItemId: item.id,
    action: 'REFUND',
    reason: 'Faltou uma unidade no pacote entregue',
  }).expect(201);
  assert.equal(Number((await summary()).balance), before - 400);
  const refundBody = { method: 'BANK', reason: 'Reembolso recebido e conferido no banco' },
    refundKey = randomUUID();
  const anotherStore = await db.store.create({
    data: { companyId: actor.companyId, name: 'Outra loja sem acesso ao pedido' },
  });
  await assert.rejects(
    () =>
      service.confirmRefund(
        { ...actor, storeId: anotherStore.id },
        id,
        issue.body.id,
        refundBody,
        randomUUID(),
      ),
    (err: unknown) => (err as { status: number }).status === 404,
  );
  await assert.rejects(
    () =>
      Promise.resolve().then(() =>
        service.confirmRefund(
          { ...actor, permissions: ['purchases.manage'] },
          id,
          issue.body.id,
          refundBody,
          randomUUID(),
        ),
      ),
    (err: unknown) => (err as { status: number }).status === 403,
  );
  const refunded = await post(
    'purchases/' + id + '/issues/' + issue.body.id + '/refund',
    refundBody,
    refundKey,
  ).expect(201);
  assert.equal(
    (
      await post(
        'purchases/' + id + '/issues/' + issue.body.id + '/refund',
        refundBody,
        refundKey,
      ).expect(201)
    ).body.refundEntryId,
    refunded.body.refundEntryId,
  );
  await post('purchases/' + id + '/issues/' + issue.body.id + '/refund', refundBody).expect(409);
  assert.equal(Number((await summary()).balance), before - 200);
  const fresh = await db.purchaseOrderItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(fresh.receivedQuantity.toString(), '1');
  assert.equal(fresh.cancelledQuantity.toString(), '1');
  assert.equal(
    (await db.purchaseOrder.findUniqueOrThrow({ where: { id } })).status,
    'CLOSED_WITH_SHORTAGE',
  );
  await post('purchases/' + id + '/receive', {
    items: [{ purchaseItemId: item.id, quantity: '1' }],
  }).expect(409);
  await post('purchases/' + id + '/issues', {
    purchaseItemId: item.id,
    action: 'REFUND',
    reason: 'Tentativa de reembolso repetido',
  }).expect(400);
  const stock = await db.stockBalance.findUniqueOrThrow({
    where: { storeId_productId: { storeId: actor.storeId, productId: p.id } },
  });
  assert.equal(stock.quantity.toString(), '1');
  assert.equal(await db.cashMovement.count({ where: { companyId: actor.companyId } }), cashBefore);
  const refundEntry = await db.financialEntry.findFirstOrThrow({
    where: { referenceId: issue.body.id, source: 'PURCHASE_REFUND' },
  });
  assert.equal(refundEntry.settledAmount.toString(), '200');
  assert.equal(refundEntry.direction, 'IN');
  const detail = await request()
    .get('/api/v1/purchases/' + id)
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.equal(detail.body.refundedTotal, '200');
  const filtered = await request()
    .get('/api/v1/treasury?source=PURCHASE_REFUND')
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.ok(
    filtered.body.data.some((row: { rawId: string }) => row.rawId === refunded.body.refundEntryId),
  );
  await post('treasury/entries/' + created.body.paymentEntryId + '/reverse', {
    reason: 'Estorno manual nao permitido para compra',
  }).expect(404);
});

test('compra antiga preserva fluxo anterior sem presumir pagamento nem reembolso', async () => {
  const supplier = await db.supplier.create({
      data: { companyId: actor.companyId, name: 'Fornecedor legado QA' },
    }),
    p = await product('0');
  const order = await db.purchaseOrder.create({
    data: {
      companyId: actor.companyId,
      storeId: actor.storeId,
      userId: actor.id,
      supplierId: supplier.id,
      total: '200',
      dueDate: new Date(),
    },
  });
  const item = await db.purchaseOrderItem.create({
    data: {
      companyId: actor.companyId,
      purchaseId: order.id,
      productId: p.id,
      quantity: '2',
      unitCost: '100',
    },
  });
  const count = await db.treasuryEntry.count({ where: { companyId: actor.companyId } });
  await post('purchases/' + order.id + '/receive', {
    items: [{ purchaseItemId: item.id, quantity: '1' }],
  }).expect(201);
  const receipt = await db.goodsReceipt.findFirstOrThrow({ where: { purchaseId: order.id } });
  const payable = await db.financialEntry.findFirstOrThrow({
    where: { referenceId: receipt.id, source: 'PURCHASE' },
  });
  assert.equal(payable.status, 'OPEN');
  assert.equal(payable.amount.toString(), '100');
  const issue = await post('purchases/' + order.id + '/issues', {
    purchaseItemId: item.id,
    action: 'REFUND',
    reason: 'Falta antiga sem pagamento confirmado',
  }).expect(201);
  await post('purchases/' + order.id + '/issues/' + issue.body.id + '/refund', {
    method: 'PIX',
    reason: 'Nao presumir pagamento do pedido antigo',
  }).expect(409);
  assert.equal(await db.treasuryEntry.count({ where: { companyId: actor.companyId } }), count);
  const detail = await request()
    .get('/api/v1/purchases/' + order.id)
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.equal(detail.body.paymentMode, 'LEGACY');
  assert.equal(detail.body.paymentEntryId, null);
});

test('autoria mostra criador e ultimo editor sem permissao global de auditoria e sem vazar outra empresa', async () => {
  const created = await post('customers', { name: 'CLIENTE AUTORIA QA' }).expect(201);
  const id = created.body.id;
  const get = (cookie = sessionCookie) =>
    request()
      .get('/api/v1/customers/' + id)
      .set('Cookie', cookie);
  const first = await get().expect(200);
  assert.equal(first.body.activity.created.userName, actor.name);
  assert.equal(first.body.activity.updated, null);
  assert.ok(first.body.activity.created.at);
  const editor = await db.user.create({
    data: {
      companyId: actor.companyId,
      storeId: actor.storeId,
      name: 'EDITORA AUTORIA QA',
      email: 'editor-activity@example.test',
      passwordHash: await argon2.hash(password),
    },
  });
  const role = await db.role.create({
    data: { companyId: actor.companyId, name: 'CADASTRO SEM AUDITORIA' },
  });
  await db.rolePermission.createMany({
    data: ['customers.read', 'customers.manage'].map((permissionKey) => ({
      roleId: role.id,
      permissionKey,
    })),
  });
  await db.userRole.create({ data: { userId: editor.id, roleId: role.id } });
  const login = await request()
    .post('/api/v1/auth/login')
    .set('Origin', process.env.APP_ORIGIN!)
    .send({ email: editor.email, password })
    .expect(201);
  const cookie = String(login.headers['set-cookie'][0]).split(';')[0];
  await request()
    .put('/api/v1/customers/' + id)
    .set('Cookie', cookie)
    .set('Origin', process.env.APP_ORIGIN!)
    .set('X-CSRF-Token', login.body.csrfToken)
    .send({ name: 'CLIENTE EDITADO QA' })
    .expect(200);
  const edited = await get(cookie).expect(200);
  assert.equal(edited.body.activity.created.userName, actor.name);
  assert.equal(edited.body.activity.updated.userName, editor.name);
  assert.ok(edited.body.activity.updated.at);
  assert.deepEqual(Object.keys(edited.body.activity.updated).sort(), ['at', 'userName']);
  await request().get('/api/v1/audit-logs').set('Cookie', cookie).expect(403);
  const otherCompany = await db.company.create({ data: { name: 'OUTRA EMPRESA AUTORIA QA' } }),
    otherStore = await db.store.create({
      data: { companyId: otherCompany.id, name: 'OUTRA LOJA AUTORIA QA' },
    }),
    otherUser = await db.user.create({
      data: {
        companyId: otherCompany.id,
        storeId: otherStore.id,
        name: 'NAO DEVE APARECER',
        email: 'outside-activity@example.test',
        passwordHash: await argon2.hash(password),
      },
    });
  await db.auditLog.create({
    data: {
      companyId: otherCompany.id,
      userId: otherUser.id,
      action: 'update',
      entity: 'Customer',
      entityId: id,
    },
  });
  assert.equal((await get(cookie).expect(200)).body.activity.updated.userName, editor.name);
  const outside = await db.customer.create({
    data: { companyId: otherCompany.id, name: 'CLIENTE OUTRA EMPRESA' },
  });
  await request()
    .get('/api/v1/customers/' + outside.id)
    .set('Cookie', cookie)
    .expect(404);
  const unknown = await product('0');
  const unknownResult = await request()
    .get('/api/v1/products/' + unknown.id)
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.deepEqual(unknownResult.body.activity, { created: null, updated: null });
});

test('empresa paga financeiro e comissao sem caixa aberto e sem duplicar movimentos antigos', async () => {
  assert.equal(
    await db.cashSession.count({
      where: { companyId: actor.companyId, storeId: actor.storeId, status: 'OPEN' },
    }),
    0,
  );
  const before = await db.cashMovement.count({ where: { companyId: actor.companyId } });
  const entry = await post('finance', {
    direction: 'OUT',
    description: 'Despesa empresa sem caixa de loja',
    amount: '100',
    dueDate: '2026-10-20',
    category: 'Aluguel',
  }).expect(201);
  const key = randomUUID();
  const replies = await Promise.all([
    post('company-payments/finance/' + entry.body.id, { amount: '40', method: 'BANK' }, key),
    post('company-payments/finance/' + entry.body.id, { amount: '40', method: 'BANK' }, key),
  ]);
  assert.equal(replies[0].status, 201);
  assert.equal(replies[1].status, 201);
  assert.equal(
    (
      await db.financialEntry.findUniqueOrThrow({ where: { id: entry.body.id } })
    ).settledAmount.toString(),
    '40',
  );
  assert.equal(await db.financialSettlement.count({ where: { entryId: entry.body.id } }), 1);
  await post('company-payments/finance/' + entry.body.id, { amount: '61', method: 'PIX' }).expect(
    400,
  );
  const cash = await db.cashSession.create({
    data: {
      companyId: actor.companyId,
      storeId: actor.storeId,
      userId: actor.id,
      openingAmount: '0',
      status: 'CLOSED',
      closedAt: new Date(),
    },
  });
  const sale = await db.sale.create({
    data: {
      companyId: actor.companyId,
      storeId: actor.storeId,
      userId: actor.id,
      employeeId,
      cashSessionId: cash.id,
      subtotal: '100',
      discount: '0',
      total: '100',
      costTotal: '40',
      commissionPercent: '5',
    },
  });
  await db.commissionEntry.create({
    data: {
      companyId: actor.companyId,
      storeId: actor.storeId,
      employeeId,
      saleId: sale.id,
      sourceId: randomUUID(),
      amount: '5',
      status: 'APPROVED',
    },
  });
  const commissionKey = randomUUID();
  const commission = await post(
    'company-payments/commissions',
    { employeeId, method: 'PIX' },
    commissionKey,
  ).expect(201);
  assert.equal(commission.body.total, '5');
  assert.equal(
    (
      await post(
        'company-payments/commissions',
        { employeeId, method: 'PIX' },
        commissionKey,
      ).expect(201)
    ).body.id,
    commission.body.id,
  );
  await post('company-payments/commissions', { employeeId, method: 'PIX' }).expect(400);
  assert.equal(await db.cashMovement.count({ where: { companyId: actor.companyId } }), before);
  assert.equal(
    await db.treasuryEntry.count({
      where: { companyId: actor.companyId, kind: 'FINANCE_PAYMENT' },
    }),
    1,
  );
  assert.equal(
    await db.treasuryEntry.count({
      where: { companyId: actor.companyId, kind: 'COMMISSION_PAYMENT' },
    }),
    1,
  );
});

test('colaborador recebe adiantamento e salario com compensacao sem repetir custo ou dinheiro', async () => {
  const period = (await import('luxon')).DateTime.now().setZone(actor.timezone).toFormat('yyyy-MM');
  const body = {
    employeeId,
    competence: period,
    dueDate: '2026-10-20',
    description: 'Lancamento exclusivo de colaborador QA',
  };
  const advance = await post('personnel-payments', {
    ...body,
    staffType: 'ADVANCE',
    amount: '200',
  }).expect(201);
  await post('personnel-payments/' + advance.body.id + '/pay', {
    amount: '200',
    method: 'PIX',
  }).expect(201);
  const salary = await post('personnel-payments', {
    ...body,
    staffType: 'SALARY',
    amount: '1000',
  }).expect(201);
  const detail = await request()
    .get('/api/v1/personnel-payments/' + salary.body.id)
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.equal(Number(detail.body.availableAdvance), 200);
  const key = randomUUID();
  await post(
    'personnel-payments/' + salary.body.id + '/pay',
    { amount: '300', advanceAmount: '200', method: 'BANK' },
    key,
  ).expect(201);
  await post(
    'personnel-payments/' + salary.body.id + '/pay',
    { amount: '300', advanceAmount: '200', method: 'BANK' },
    key,
  ).expect(201);
  assert.equal(
    (
      await db.financialEntry.findUniqueOrThrow({ where: { id: salary.body.id } })
    ).settledAmount.toString(),
    '500',
  );
  await post('personnel-payments/' + salary.body.id + '/pay', {
    amount: '0',
    advanceAmount: '1',
    method: 'PIX',
  }).expect(400);
  await post('personnel-payments/' + salary.body.id + '/pay', {
    amount: '500',
    method: 'PIX',
  }).expect(201);
  assert.equal(
    (await db.financialEntry.findUniqueOrThrow({ where: { id: salary.body.id } })).status,
    'SETTLED',
  );
  assert.equal(
    await db.staffAdvanceAllocation.count({ where: { salaryEntryId: salary.body.id } }),
    1,
  );
  const paid = await db.treasuryEntry.aggregate({
    where: { companyId: actor.companyId, kind: 'PERSONNEL_PAYMENT' },
    _sum: { amount: true },
  });
  assert.equal(paid._sum.amount?.toString(), '-1000');
  const list = await request()
    .get('/api/v1/personnel-payments?period=' + period)
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.equal(list.body.summary.cost, '1000');
  assert.equal(list.body.summary.paid, '1000');
  assert.equal(list.body.summary.offset, '200');
  assert.equal(list.body.summary.pending, '0');
  const unpaid = await post('personnel-payments', {
    ...body,
    staffType: 'BENEFIT',
    amount: '50',
  }).expect(201);
  await post('personnel-payments/' + unpaid.body.id + '/cancel', {
    reason: 'Lancamento de beneficio informado errado',
  }).expect(201);
  await post('personnel-payments/' + unpaid.body.id + '/pay', {
    amount: '50',
    method: 'PIX',
  }).expect(409);
  await post('personnel-payments/' + salary.body.id + '/cancel', {
    reason: 'Nao cancelar salario ja liquidado',
  }).expect(409);
  await assert.rejects(() =>
    db.staffAdvanceAllocation.updateMany({
      where: { salaryEntryId: salary.body.id },
      data: { amount: '1' },
    }),
  );
  const low = await db.user.create({
      data: {
        companyId: actor.companyId,
        storeId: actor.storeId,
        name: 'FINANCEIRO SEM FOLHA QA',
        email: 'finance-no-payroll@example.test',
        passwordHash: await argon2.hash(password),
      },
    }),
    role = await db.role.create({ data: { companyId: actor.companyId, name: 'SEM FOLHA' } });
  await db.rolePermission.createMany({
    data: ['finance.read', 'finance.manage'].map((permissionKey) => ({
      roleId: role.id,
      permissionKey,
    })),
  });
  await db.userRole.create({ data: { userId: low.id, roleId: role.id } });
  const login = await request()
      .post('/api/v1/auth/login')
      .set('Origin', process.env.APP_ORIGIN!)
      .send({ email: low.email, password })
      .expect(201),
    cookie = String(login.headers['set-cookie'][0]).split(';')[0];
  await request().get('/api/v1/personnel-payments').set('Cookie', cookie).expect(403);
  await request()
    .get('/api/v1/finance/' + salary.body.id)
    .set('Cookie', cookie)
    .expect(404);
  const filtered = await request().get('/api/v1/finance').set('Cookie', cookie).expect(200);
  assert.ok(filtered.body.data.every((row: { source: string }) => row.source !== 'PERSONNEL'));
  await request()
    .post('/api/v1/company-payments/finance/' + salary.body.id)
    .set('Cookie', cookie)
    .set('Origin', process.env.APP_ORIGIN!)
    .set('X-CSRF-Token', login.body.csrfToken)
    .set('Idempotency-Key', randomUUID())
    .send({ amount: '1', method: 'PIX' })
    .expect(403);
});

test('resultado empresarial separa CMV, compras, adiantamentos e eventos de devolucao por competencia', async () => {
  const createdAt = new Date('2030-06-05T12:00:00Z'),
    companyId = actor.companyId,
    storeId = actor.storeId,
    userId = actor.id;
  const cash = await db.cashSession.create({
      data: {
        companyId,
        storeId,
        userId,
        openingAmount: '0',
        status: 'CLOSED',
        closedAt: createdAt,
      },
    }),
    p = await product('0');
  const sale = await db.sale.create({
    data: {
      companyId,
      storeId,
      userId,
      employeeId,
      cashSessionId: cash.id,
      subtotal: '1100',
      discount: '100',
      total: '1000',
      costTotal: '400',
      commissionPercent: '5',
      createdAt,
    },
  });
  const item = await db.saleItem.create({
    data: {
      companyId,
      saleId: sale.id,
      productId: p.id,
      name: p.name,
      sku: p.sku,
      quantity: '2',
      unitPrice: '550',
      unitCost: '200',
      discount: '100',
      total: '1000',
    },
  });
  const base = {
    companyId,
    storeId,
    userId,
    direction: 'OUT',
    description: 'Despesa QA resultado',
    dueDate: new Date('2030-06-10'),
    category: 'QA',
  };
  await db.financialEntry.createMany({
    data: [
      {
        ...base,
        source: 'PERSONNEL',
        employeeId,
        staffType: 'SALARY',
        competenceDate: new Date('2030-06-01'),
        amount: '200',
      },
      {
        ...base,
        source: 'PERSONNEL',
        employeeId,
        staffType: 'ADVANCE',
        competenceDate: new Date('2030-06-01'),
        amount: '300',
        resultGroup: 'CAPITAL',
      },
      { ...base, source: 'MANUAL', amount: '100' },
      { ...base, source: 'MANUAL', direction: 'IN', amount: '20' },
      { ...base, source: 'MANUAL', resultGroup: 'INVENTORY', amount: '5000' },
      {
        ...base,
        source: 'PURCHASE_PAYMENT',
        amount: '10000',
        settledAmount: '10000',
        status: 'SETTLED',
      },
    ],
  });
  await db.commissionEntry.create({
    data: {
      companyId,
      storeId,
      employeeId,
      saleId: sale.id,
      sourceId: randomUUID(),
      amount: '50',
      createdAt,
    },
  });
  const result = async (period = '2030-06') =>
    (
      await request()
        .get('/api/v1/treasury/results?period=' + period)
        .set('Cookie', sessionCookie)
        .expect(200)
    ).body;
  const first = await result();
  assert.equal(Number(first.grossSales), 1100);
  assert.equal(first.netRevenue, '1000.00');
  assert.equal(first.costOfGoods, '400.00');
  assert.equal(first.grossProfit, '600.00');
  assert.equal(first.personnel, '200.00');
  assert.equal(first.commissions, '50.00');
  assert.equal(first.netProfit, '270.00');
  const returned = await db.saleReturn.create({
    data: {
      companyId,
      saleId: sale.id,
      userId,
      reason: 'Devolucao exclusiva QA resultado',
      total: '500',
      refundMethod: 'PIX',
      createdAt: new Date('2030-06-10T12:00:00Z'),
    },
  });
  await db.saleReturnItem.create({
    data: {
      companyId,
      returnId: returned.id,
      saleItemId: item.id,
      quantity: '1',
      total: '500',
      restock: true,
    },
  });
  await db.commissionEntry.create({
    data: {
      companyId,
      storeId,
      employeeId,
      saleId: sale.id,
      sourceId: randomUUID(),
      amount: '-25',
      createdAt,
    },
  });
  await db.cashMovement.createMany({
    data: [
      {
        companyId,
        cashSessionId: cash.id,
        userId,
        type: 'SALE',
        method: 'PIX',
        amount: '1000',
        reason: 'Venda QA resultado',
        createdAt,
      },
      {
        companyId,
        cashSessionId: cash.id,
        userId,
        type: 'REFUND',
        method: 'PIX',
        amount: '-500',
        reason: 'Devolucao QA resultado',
        createdAt,
      },
    ],
  });
  await db.treasuryEntry.createMany({
    data: [
      { kind: 'PURCHASE_PAYMENT', amount: '-10000' },
      { kind: 'PERSONNEL_PAYMENT', amount: '-500' },
      { kind: 'COMMISSION_PAYMENT', amount: '-25' },
      { kind: 'FINANCE_PAYMENT', amount: '-100' },
      { kind: 'FINANCE_RECEIPT', amount: '20' },
    ].map((row) => ({
      ...row,
      companyId,
      userId,
      method: 'PIX',
      description: 'Movimento exclusivo resultado QA',
      createdAt,
    })),
  });
  const after = await result();
  assert.equal(after.netRevenue, '500.00');
  assert.equal(after.costOfGoods, '200.00');
  assert.equal(after.grossProfit, '300.00');
  assert.equal(after.netProfit, '-5.00');
  assert.equal(after.cash.net, '-10105.00');
  assert.ok(
    after.cash.bySource.some((row: { source: string }) => row.source === 'PERSONNEL_PAYMENT'),
  );
  const cancelled = await db.sale.create({
    data: {
      companyId,
      storeId,
      userId,
      employeeId,
      cashSessionId: cash.id,
      subtotal: '100',
      discount: '0',
      total: '100',
      costTotal: '20',
      commissionPercent: '0',
      status: 'CANCELLED',
      createdAt: new Date('2030-08-05T12:00:00Z'),
      cancelledAt: new Date('2030-09-05T12:00:00Z'),
    },
  });
  await db.saleItem.create({
    data: {
      companyId,
      saleId: cancelled.id,
      productId: p.id,
      name: p.name,
      sku: p.sku,
      quantity: '1',
      unitPrice: '100',
      unitCost: '20',
      discount: '0',
      total: '100',
    },
  });
  assert.equal((await result('2030-08')).grossProfit, '80.00');
  assert.equal((await result('2030-09')).grossProfit, '-80.00');
});
