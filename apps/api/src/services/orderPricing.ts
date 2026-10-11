import { Prisma } from '@prisma/client';

export interface OrderLineInput {
  unitPrice: string | Prisma.Decimal;
  quantity: number;
  taxRate: string | Prisma.Decimal;
  addonsTotal?: string | Prisma.Decimal;
}

const toDecimal = (value: string | Prisma.Decimal | undefined | null) => {
  if (value === null || value === undefined) {
    return new Prisma.Decimal(0);
  }

  return new Prisma.Decimal(value.toString());
};

const roundToCurrency = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export function calculateOrderTotals(items: OrderLineInput[], discount: string | Prisma.Decimal = '0') {
  const subtotal = items.reduce((sum, item) => {
    const unitPrice = toDecimal(item.unitPrice);
    const addonsTotal = toDecimal(item.addonsTotal);
    const lineSubtotal = unitPrice.plus(addonsTotal).times(item.quantity);
    return sum.plus(lineSubtotal);
  }, new Prisma.Decimal(0));

  const tax = items.reduce((sum, item) => {
    const unitPrice = toDecimal(item.unitPrice);
    const addonsTotal = toDecimal(item.addonsTotal);
    const lineSubtotal = unitPrice.plus(addonsTotal).times(item.quantity);
    const rate = toDecimal(item.taxRate).div(new Prisma.Decimal(100));
    const lineTax = lineSubtotal.times(rate);
    return sum.plus(roundToCurrency(lineTax));
  }, new Prisma.Decimal(0));

  const discountValue = toDecimal(discount);
  const cappedDiscount = subtotal.gte(discountValue) ? discountValue : subtotal;
  const total = subtotal.plus(tax).minus(cappedDiscount);

  return {
    subtotal: subtotal.toFixed(2),
    tax: tax.toFixed(2),
    discount: cappedDiscount.toFixed(2),
    total: total.toFixed(2),
  };
}
