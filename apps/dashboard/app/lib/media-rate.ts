/**
 * Exact human-facing media rate arithmetic.
 *
 * The API stores prices as integer amount_units at a declared decimal scale and
 * quantities as reduced rationals. These helpers keep the editor in ordinary
 * decimal notation without losing that representation.
 */
export type ExactQuantity = { numerator: string; denominator: string };

export const MAX_MEDIA_AMOUNT_UNITS = 9_007_199_254_740_991n; // JavaScript-safe integer used by the SDK.
export const MAX_MEDIA_PRICE_PLACES = 9; // Gateway storage rejects larger monetary scales.

/** Standard price basis for a model-derived billing unit. */
export function mediaRateBasis(meter: string | null | undefined): ExactQuantity | null {
  if (!meter) return null;
  if (meter === 'seconds') return { numerator: '1', denominator: '1' };
  if (meter === 'video_tokens') return { numerator: '1000000', denominator: '1' };
  return null;
}

/** Exact decimal text for stored amount units; never rounds. */
export function formatMediaAmount(units: string, places: number): string {
  if (!/^\d+$/.test(units) || !Number.isInteger(places) || places < 0 || places > MAX_MEDIA_PRICE_PLACES) {
    throw new Error('Invalid media amount.');
  }
  const digits = BigInt(units).toString().padStart(places + 1, '0');
  return places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits;
}

/**
 * Parse a standard decimal price into exact amount units and the minimal
 * decimal scale that represents it. Trailing zeros are not a price scale.
 */
export function parseMediaPrice(value: string): { amountUnits: string; decimalPlaces: number } {
  const match = /^(\d{1,18})(?:\.(\d{1,9}))?$/.exec(value.trim());
  if (!match) throw new Error(`Enter a nonnegative price with at most ${MAX_MEDIA_PRICE_PLACES} decimal places.`);
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  const amount = BigInt(match[1]) * 10n ** BigInt(fraction.length) + BigInt(fraction || '0');
  if (amount > MAX_MEDIA_AMOUNT_UNITS) throw new Error('Price exceeds the supported range.');
  return { amountUnits: amount.toString(), decimalPlaces: fraction.length };
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** Parse a standard decimal quantity into a reduced exact rational. */
export function parseMediaQuantity(value: string, allowZero: boolean): ExactQuantity {
  const match = /^(\d{1,38})(?:\.(\d{1,18}))?$/.exec(value.trim());
  if (!match) throw new Error('Enter a nonnegative decimal quantity.');
  const fraction = match[2] ?? '';
  const numerator = BigInt(match[1] + fraction);
  const denominator = 10n ** BigInt(fraction.length);
  const divisor = gcd(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  const maximum = (1n << 128n) - 1n;
  if ((!allowZero && reducedNumerator === 0n) || reducedNumerator > maximum || reducedDenominator > maximum) {
    throw new Error('Quantity is outside the supported range.');
  }
  return { numerator: reducedNumerator.toString(), denominator: reducedDenominator.toString() };
}

/**
 * Exact decimal text for a reduced quantity whose denominator only has 2/5
 * factors. Null means the stored rational cannot be shown as a finite decimal.
 */
export function formatMediaQuantity(value: ExactQuantity): string | null {
  let numerator: bigint;
  let denominator: bigint;
  try {
    numerator = BigInt(value.numerator);
    denominator = BigInt(value.denominator);
  } catch {
    return null;
  }
  if (denominator <= 0n || numerator < 0n) return null;
  let twos = 0n;
  let fives = 0n;
  let rest = denominator;
  while (rest % 2n === 0n) { rest /= 2n; twos++; }
  while (rest % 5n === 0n) { rest /= 5n; fives++; }
  if (rest !== 1n) return null;
  const places = twos > fives ? twos : fives;
  const scaled = numerator * 2n ** (places - twos) * 5n ** (places - fives);
  const digits = scaled.toString().padStart(Number(places) + 1, '0');
  const integer = places ? digits.slice(0, -Number(places)) : digits;
  const fraction = places ? digits.slice(-Number(places)).replace(/0+$/, '') : '';
  return `${integer}${fraction ? `.${fraction}` : ''}`;
}

/** A discount multiplier as an exact percentage, or null for non-terminating fractions. */
export function discountPercent(multiplier: ExactQuantity): string | null {
  try {
    const numerator = BigInt(multiplier.numerator);
    const denominator = BigInt(multiplier.denominator);
    if (denominator <= 0n || numerator > denominator) return null;
    return formatMediaQuantity({ numerator: ((denominator - numerator) * 100n).toString(), denominator: denominator.toString() });
  } catch {
    return null;
  }
}

/** Exact multiplier for a percentage from 0 to 100. */
export function discountMultiplier(percent: string): ExactQuantity {
  const match = /^(\d{1,3})(?:\.(\d{1,6}))?$/.exec(percent.trim());
  if (!match) throw new Error('Enter a discount from 0 to 100 percent.');
  const fraction = match[2] ?? '';
  const basis = BigInt(match[1] + fraction);
  const scale = 10n ** BigInt(fraction.length);
  if (basis > 100n * scale) throw new Error('Enter a discount from 0 to 100 percent.');
  const numerator = 100n * scale - basis;
  const denominator = 100n * scale;
  const divisor = gcd(numerator, denominator);
  return { numerator: (numerator / divisor).toString(), denominator: (denominator / divisor).toString() };
}

/** Human basis label inputs; the component translates the noun. */
export function quantityText(value: ExactQuantity): string {
  return formatMediaQuantity(value) ?? `${value.numerator}/${value.denominator}`;
}

/** English meter noun; callers translate it through the UI locale. */
export function mediaMeterName(meter: string, amount: ExactQuantity): string {
  const singular = amount.numerator === amount.denominator;
  if (meter === 'seconds') return singular ? 'second' : 'seconds';
  if (meter === 'video_tokens') return singular ? 'video token' : 'video tokens';
  return singular ? 'billing unit' : 'billing units';
}
