import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@chame/shared';
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const cents = (v: Decimal.Value) => new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export function calculate(
  items: { quantity: string; price: string; cost: string; discount: string }[],
  globalDiscount: string,
) {
  const rows = items.map((i) => {
    const gross = cents(new Decimal(i.quantity).times(i.price)),
      discount = cents(i.discount);
    if (discount.gt(gross)) throw new BadRequestException('Desconto maior que o valor do item.');
    return { ...i, gross, discount, net: gross.minus(discount) };
  });
  const subtotal = rows.reduce((sum, r) => sum.plus(r.gross), new Decimal(0));
  const itemDiscount = rows.reduce((sum, r) => sum.plus(r.discount), new Decimal(0));
  const net = subtotal.minus(itemDiscount),
    general = cents(globalDiscount);
  if (general.gt(net)) throw new BadRequestException('Desconto geral excede o subtotal.');
  const shares = rows.map((r) =>
    net.isZero() ? new Decimal(0) : general.times(r.net).div(net).times(100).floor().div(100),
  );
  let residue = general
    .minus(shares.reduce((a, b) => a.plus(b), new Decimal(0)))
    .times(100)
    .toNumber();
  for (let i = 0; residue > 0; i = (i + 1) % rows.length) {
    if (shares[i].lt(rows[i].net)) {
      shares[i] = shares[i].plus('0.01');
      residue--;
    }
  }
  return {
    subtotal,
    discount: itemDiscount.plus(general),
    total: net.minus(general),
    costTotal: cents(
      items.reduce((s, i) => s.plus(new Decimal(i.quantity).times(i.cost)), new Decimal(0)),
    ),
    items: rows.map((r, i) => ({
      discount: r.discount.plus(shares[i]),
      total: r.net.minus(shares[i]),
    })),
  };
}
export function proportionalRefund(
  total: string,
  quantity: string,
  alreadyReturned: string,
  returnQuantity: string,
) {
  const all = new Decimal(quantity),
    previous = new Decimal(alreadyReturned),
    next = previous.plus(returnQuantity);
  if (next.gt(all)) throw new BadRequestException('Devolucao excede quantidade vendida.');
  return cents(new Decimal(total).times(next).div(all)).minus(
    cents(new Decimal(total).times(previous).div(all)),
  );
}
