/** Exact published media amounts and reduced quantities; never supplier cost data. */
export function mediaAmount(units: string, places: number): string {
  if (!Number.isInteger(places) || places < 0 || places > 9 || !/^\d+$/.test(units) || BigInt(units) > (1n << 64n) - 1n) throw new Error('Invalid media amount.');
  const digits = BigInt(units).toString().padStart(places + 1, '0');
  return places ? digits.slice(0, -places) + '.' + digits.slice(-places) : digits;
}
export function mediaAmountUnits(value: string, places: number): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!Number.isInteger(places) || places < 0 || places > 9 || !match) throw new Error('Enter a nonnegative media price and a decimal scale from zero to nine.');
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  if (fraction.length > places) throw new Error(`Use at most ${places} decimal places.`);
  const units = BigInt(match[1]) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0') || '0');
  if (units > (1n << 64n) - 1n) throw new Error('Media price exceeds the supported range.');
  return units.toString();
}
export function mediaQuantity(value: string, allowZero: boolean): { numerator: string; denominator: string } {
  const decimal = /^(\d+)(?:\.(\d{1,38}))?$/.exec(value.trim());
  const fraction = /^(\d+)\/(\d+)$/.exec(value.trim());
  if (!decimal && !fraction) throw new Error('Use a decimal quantity or numerator/denominator fraction.');
  const numerator = fraction ? BigInt(fraction[1]) : BigInt(decimal![1] + (decimal![2] ?? ''));
  const denominator = fraction ? BigInt(fraction[2]) : 10n ** BigInt(decimal![2]?.length ?? 0);
  const maximum = (1n << 128n) - 1n;
  if (denominator === 0n || (!allowZero && numerator === 0n)) throw new Error('Quantity exceeds the supported range.');
  let a = numerator, divisor = denominator;
  while (divisor !== 0n) { const remainder = a % divisor; a = divisor; divisor = remainder; }
  const reducedNumerator = numerator / a, reducedDenominator = denominator / a;
  if (reducedNumerator > maximum || reducedDenominator > maximum) throw new Error('Quantity exceeds the supported range.');
  return { numerator: reducedNumerator.toString(), denominator: reducedDenominator.toString() };
}
export const mediaQuantityInput = (value: { numerator: string; denominator: string }) => value.denominator === '1' ? value.numerator : value.numerator + '/' + value.denominator;
