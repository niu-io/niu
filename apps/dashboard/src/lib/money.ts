// Keep every nanounit; converting to Number would round large balances.
export function money(nanos: string, currency: string) {
  const amount = BigInt(nanos);
  const sign = amount < 0n ? '-' : '';
  const absolute = amount < 0n ? -amount : amount;
  const fraction = (absolute % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return `${currency} ${sign}${absolute / 1_000_000_000n}${fraction ? '.' + fraction : '.00'}`;
}

const NANOS_PER_UNIT = 1_000_000_000n;
const MAX_NANOS = 9_223_372_036_854_775_807n;

/** Parse a user-entered cash amount without a floating-point round trip. */
export function amountToNanos(amount: string): string {
  const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(amount.trim());
  if (!match) throw new Error('Enter an amount with no more than 9 decimal places.');
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? '').padEnd(9, '0') || '0');
  const nanos = whole * NANOS_PER_UNIT + fraction;
  if (nanos <= 0n) throw new Error('Enter a budget greater than zero.');
  if (nanos > MAX_NANOS) throw new Error('Amount exceeds the supported range.');
  return nanos.toString();
}
