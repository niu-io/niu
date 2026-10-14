import { amountFromNanos, amountToNanos } from '@/lib/money';
import type { RetailSchedule } from '../../../../../sdks/javascript/src/admin';

export type TextSchedule = Extract<RetailSchedule, { kind: 'text' }>;
export const categories = [
  ['prompt_rate', 'Input / 1M tokens'], ['completion_rate', 'Output / 1M tokens'],
  ['cached_prompt_rate', 'Cache read / 1M tokens'], ['cache_write_prompt_rate', 'Cache write / 1M tokens'], ['reasoning_completion_rate', 'Reasoning / 1M tokens'],
] as const;
export type RateKey = typeof categories[number][0];
export type Rates = Record<RateKey, string>;
export type Tier = { minimum_input_tokens: string; rates: Rates };
export const ratesFrom = (value?: Partial<TextSchedule>): Rates => Object.fromEntries(categories.map(([key]) => [key, value?.[key] == null ? '' : amountFromNanos(value[key]!)])) as Rates;
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
