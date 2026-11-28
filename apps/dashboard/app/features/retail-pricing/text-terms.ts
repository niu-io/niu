import { amountFromNanos, amountToNanos } from '@/lib/money';
import type { RetailSchedule } from '@niu-io/sdk/admin';

export type TextSchedule = Extract<RetailSchedule, { kind: 'text' }>;
export const categories = [
  ['prompt_rate', 'Input / 1M tokens'], ['completion_rate', 'Output / 1M tokens'],
  ['cached_prompt_rate', 'Cache read / 1M tokens'], ['cache_write_prompt_rate', 'Cache write / 1M tokens'], ['reasoning_completion_rate', 'Reasoning / 1M tokens'],
] as const;
export type RateKey = typeof categories[number][0];
export type Rates = Record<RateKey, string>;
export type Tier = { minimum_input_tokens: string; rates: Rates };
export const ratesFrom = (value?: Partial<Pick<TextSchedule, RateKey>>): Rates => Object.fromEntries(categories.map(([key]) => [key, value?.[key] == null ? '' : amountFromNanos(value[key]!)])) as Rates;
export function checkedRates(value: Rates) {
  const rates = Object.fromEntries(categories.map(([key]) => {
    const rate = value[key].trim();
    if (!rate && key !== 'prompt_rate' && key !== 'completion_rate') return [key, null];
    const nanos = amountToNanos(rate, true);
    if (BigInt(nanos) > 1_000_000_000_000_000n) throw new Error('Token rates exceed the supported range.');
    return [key, nanos];
  }));
  return rates as Pick<TextSchedule, RateKey>;
}

function tokenCount(value: string): bigint | null {
  if (!/^\d+$/.test(value)) return null;
  const count = BigInt(value);
  return count <= 9_223_372_036_854_775_807n ? count : null;
}

/** Inclusive input-token interval used to select a full rate schedule. */
export function tokenBand(start: string, next?: string): string {
  const lower = tokenCount(start);
  if (lower === null) return '—';
  if (next === undefined) return '≥ ' + lower.toLocaleString();
  const upper = tokenCount(next);
  if (upper === null || upper <= lower) return '—';
  return lower.toLocaleString() + '–' + (upper - 1n).toLocaleString();
}

export function validTierThreshold(value: string, previous: string) {
  const threshold = tokenCount(value);
  return threshold !== null && threshold > (tokenCount(previous) ?? 0n);
}

export function checkedTiers(tiers: Tier[]) {
  return tiers.map((tier, index) => {
    if (!validTierThreshold(tier.minimum_input_tokens, tiers[index - 1]?.minimum_input_tokens ?? '0')) throw new Error('Use increasing whole-token thresholds starting at 1 or higher.');
    return { minimum_input_tokens: BigInt(tier.minimum_input_tokens).toString(), ...checkedRates(tier.rates) };
  });
}
