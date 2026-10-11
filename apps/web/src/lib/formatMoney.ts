export function formatMoney(value: number | string) {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return '₹0.00';
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

export function multiplyMoney(value: string, quantity: number) {
  if (!/^\d+(\.\d{1,2})?$/.test(value) || !Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error('Money multiplication requires a decimal amount and a non-negative integer quantity.');
  }
  const [whole, fraction = ''] = value.split('.');
  const paise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  const totalPaise = paise * BigInt(quantity);
  return `${totalPaise / 100n}.${String(totalPaise % 100n).padStart(2, '0')}`;
}

const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;

function toPaiseBigInt(value: string): bigint {
  if (!DECIMAL_RE.test(value.trim())) {
    throw new Error(`Invalid money amount: ${value}`);
  }
  const [whole, fraction = ''] = value.trim().split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function paiseFromMoney(value: string): number {
  return Number(toPaiseBigInt(value));
}

export function formatPaise(paise: number | bigint): string {
  const p = typeof paise === 'bigint' ? paise : BigInt(Math.trunc(paise));
  const sign = p < 0n ? '-' : '';
  const abs = p < 0n ? -p : p;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

export function addMoney(a: string, b: string): string {
  return formatPaise(toPaiseBigInt(a) + toPaiseBigInt(b));
}

/** Line total for qty × (unit + addons). All inputs are decimal strings; no floats. */
export function lineTotal(unitPrice: string, quantity: number, addonPrices: string[] = []): string {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error('Quantity must be a non-negative integer.');
  }
  let paise = toPaiseBigInt(unitPrice);
  for (const addon of addonPrices) paise += toPaiseBigInt(addon);
  return formatPaise(paise * BigInt(quantity));
}
