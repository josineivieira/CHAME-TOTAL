import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, proportionalRefund } from '../../src/modules/sales/money';
import { cpfValid, saleSchema } from '@chame/shared';
test('dinheiro decimal, descontos e residuos fecham em centavos', () => {
  const result = calculate(
    [
      { quantity: '3', price: '0.10', cost: '0.03', discount: '0' },
      { quantity: '1', price: '0.20', cost: '0.10', discount: '0' },
    ],
    '0.03',
  );
  assert.equal(result.total.toFixed(2), '0.47');
  assert.equal(
    result.items.reduce((s, i) => s + i.discount.times(100).toNumber(), 0),
    3,
  );
  assert.equal(result.costTotal.toFixed(2), '0.19');
});
test('descontos impossiveis sao rejeitados', () => {
  assert.throws(() => calculate([{ quantity: '1', price: '10', cost: '2', discount: '11' }], '0'));
  assert.throws(() => calculate([{ quantity: '1', price: '10', cost: '2', discount: '0' }], '11'));
});
test('devolucoes parciais compensam residuo sem exceder original', () => {
  assert.equal(proportionalRefund('10', '3', '0', '1').toFixed(2), '3.33');
  assert.equal(proportionalRefund('10', '3', '1', '1').toFixed(2), '3.34');
  assert.equal(proportionalRefund('10', '3', '2', '1').toFixed(2), '3.33');
  assert.throws(() => proportionalRefund('10', '3', '2', '2'));
});
test('CPF repetido e digito invalido sao rejeitados', () => {
  assert.equal(cpfValid('111.111.111-11'), false);
  assert.equal(cpfValid('529.982.247-25'), true);
  assert.equal(cpfValid('52998224724'), false);
});
test('contrato nao aceita campos extras nem valores float', () => {
  assert.equal(
    saleSchema.safeParse({
      employeeId: 'invalid',
      items: [],
      payments: [],
      total: 10,
    }).success,
    false,
  );
});
