/** Compact symbol for amounts; keep ISO codes in storage and currency settings. */
export function currencySymbol(currency: string): string {
  if (!currency) return '';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find(part => part.type === 'currency')?.value ?? currency;
  } catch { return currency; }
}

// Keep every nanounit; converting to Number would round large balances.
export function money(nanos: string, currency: string) {
  const amount = BigInt(nanos);
  const sign = amount < 0n ? '-' : '';
  const absolute = amount < 0n ? -amount : amount;
  const fraction = (absolute % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  const symbol = currencySymbol(currency);
  const prefix = symbol && /^[A-Z]{3}$/.test(symbol) ? `${symbol} ` : symbol;
  return `${sign}${prefix}${absolute / 1_000_000_000n}${fraction ? '.' + fraction : '.00'}`;
}

const NANOS_PER_UNIT = 1_000_000_000n;
const MAX_NANOS = 9_223_372_036_854_775_807n;

/** Parse currency units exactly; zero is opt-in for approved credit policies. */
export function amountToNanos(amount: string, allowZero = false): string {
  const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(amount.trim());
  if (!match) throw new Error('Enter an amount with no more than 9 decimal places.');
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? '').padEnd(9, '0') || '0');
  const nanos = whole * NANOS_PER_UNIT + fraction;
  if (nanos === 0n && !allowZero) throw new Error('Enter a budget greater than zero.');
  if (nanos > MAX_NANOS) throw new Error('Amount exceeds the supported range.');
  return nanos.toString();
}

/** Editable currency units use the same exact formatting as reported money. */
export function amountFromNanos(nanos: string): string {
  if (!/^\d{1,19}$/.test(nanos) || BigInt(nanos) > MAX_NANOS) throw new Error('Invalid currency amount.');
  return money(nanos, '').trim();
}
