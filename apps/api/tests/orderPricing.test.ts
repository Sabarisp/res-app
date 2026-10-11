import { calculateOrderTotals } from '../src/services/orderPricing.js';

describe('order pricing', () => {
  it('recomputes subtotal, tax and total for an order', () => {
    const totals = calculateOrderTotals([
      {
        unitPrice: '120',
        quantity: 2,
        taxRate: '5',
        addonsTotal: '16',
      },
      {
        unitPrice: '60',
        quantity: 1,
        taxRate: '5',
      },
    ]);

    expect(totals).toEqual({
      subtotal: '332.00',
      tax: '16.60',
      discount: '0.00',
      total: '348.60',
    });
  });

  it('handles 5, 12 and 18 percent tax rates and string inputs without float drift', () => {
    expect(calculateOrderTotals([{ unitPrice: '0.10', quantity: 2, taxRate: '5' }])).toEqual({
      subtotal: '0.20',
      tax: '0.01',
      discount: '0.00',
      total: '0.21',
    });

    expect(calculateOrderTotals([{ unitPrice: '100', quantity: 1, taxRate: '12' }])).toEqual({
      subtotal: '100.00',
      tax: '12.00',
      discount: '0.00',
      total: '112.00',
    });

    expect(calculateOrderTotals([{ unitPrice: '100', quantity: 1, taxRate: '18' }])).toEqual({
      subtotal: '100.00',
      tax: '18.00',
      discount: '0.00',
      total: '118.00',
    });
  });

  it('caps discounts at the subtotal and rounds half-paisa tax up correctly', () => {
    expect(calculateOrderTotals([
      { unitPrice: '100', quantity: 1, taxRate: '5' },
    ], '150')).toEqual({
      subtotal: '100.00',
      tax: '5.00',
      discount: '100.00',
      total: '5.00',
    });

    expect(calculateOrderTotals([
      { unitPrice: '1.00', quantity: 1, taxRate: '0.5' },
    ])).toEqual({
      subtotal: '1.00',
      tax: '0.01',
      discount: '0.00',
      total: '1.01',
    });
  });
});
