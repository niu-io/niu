import type { CustomerTariff } from '@niu-io/sdk/admin';

type Category = 'cached_prompt_rate' | 'cache_write_prompt_rate' | 'reasoning_completion_rate';

/** Hide only confirmed absent categories; omitted/unknown tiers keep their columns. */
export function currencyTariffColumns(tariffs: readonly CustomerTariff[]) {
  const category = (field: Category) => tariffs.some(tariff =>
    tariff[field] !== null || !Array.isArray(tariff.context_tiers)
    || tariff.context_tiers.some(tier => tier[field] !== null));
  return {
    cacheRead: category('cached_prompt_rate'),
    cacheWrite: category('cache_write_prompt_rate'),
    reasoning: category('reasoning_completion_rate'),
    fixed: tariffs.some(tariff => tariff.request_fee_nanos !== '0'),
    minimum: tariffs.some(tariff => tariff.minimum_charge_nanos !== '0'),
    tiers: tariffs.some(tariff => !Array.isArray(tariff.context_tiers) || tariff.context_tiers.length > 0),
  };
}
