// Keep every nanounit; converting to Number would round large balances.
export function money(nanos: string, currency: string) {
  const amount = BigInt(nanos);
  const sign = amount < 0n ? '-' : '';
  const absolute = amount < 0n ? -amount : amount;
  const fraction = (absolute % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return `${currency} ${sign}${absolute / 1_000_000_000n}${fraction ? '.' + fraction : '.00'}`;
}
