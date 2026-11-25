import type { RetailSchedule } from '@niu-io/sdk/admin';
import { request } from '@/features/providers/api';
import { formatPer1MShort } from '@/features/provider-business/upstream-pricing';
import { mediaAmount } from '@/lib/media-price';
import { readLocale as readUILocale } from '@/shell/ui-locale';

export type CustomerActivePromotion = {
  revision: string;
  version: string;
  created_at: string;
  reason: string;
  baseline_revision: string;
  schedule: RetailSchedule;
  effective_from: string;
  effective_until: string;
  eligibility_until: string;
  state: 'scheduled' | 'within_period';
};

export type CustomerModelPriceRow = {
  price_id: string;
  model_alias: string;
  currency: string;
  version: string;
  revision: string;
  published_at: string;
  standard_schedule: RetailSchedule;
  active_promotion: CustomerActivePromotion | null;
};

type CustomerPricingPayload = {
  data: {
    organization_id: string;
    organization_name: string;
    as_of: string;
    items: CustomerModelPriceRow[];
  };
};

export type CustomerPricingUpdateItem = {
  price_id: string;
  schedule: RetailSchedule | null;
  valid_seconds?: number;
  reason?: string;
};

export const PRESET_DISCOUNTS = [95, 90, 85, 80, 70] as const;

export const VALIDITY_PRESETS = [
  { id: '1y', seconds: 365 * 86400, labelEn: '1 year', labelZh: '1 年' },
  { id: '3y', seconds: 3 * 365 * 86400, labelEn: '3 years', labelZh: '3 年' },
  { id: '5y', seconds: 5 * 365 * 86400, labelEn: '5 years', labelZh: '5 年' },
] as const;

export type ValidityId = (typeof VALIDITY_PRESETS)[number]['id'];

function scaleRateFloor(raw: string, discountPercent: number): string {
  const base = BigInt(raw);
  if (base === 0n) return '0';
  const bps = BigInt(Math.round(discountPercent * 100));
  if (bps >= 10_000n) return base.toString();
  if (bps <= 0n) return '0';
  const scaled = (base * bps) / 10_000n;
  if (scaled > base) return base.toString();
  return (scaled === 0n && base > 1n ? 1n : scaled).toString();
}

function scaleOptionalRate(raw: string | null | undefined, discountPercent: number): string | null {
  return raw == null ? null : scaleRateFloor(raw, discountPercent);
}

/**
 * Produce a concrete RetailSchedule discounted from an immutable standard schedule.
 * Guarantees every category/tier/amount is <= original as required by backend validation.
 */
export function discountRetailSchedule(standard: RetailSchedule, discountPercent: number): RetailSchedule {
  if (standard.kind === 'text') {
    return {
      kind: 'text',
      prompt_rate: scaleRateFloor(standard.prompt_rate, discountPercent),
      completion_rate: scaleRateFloor(standard.completion_rate, discountPercent),
      cached_prompt_rate: scaleOptionalRate(standard.cached_prompt_rate, discountPercent),
      cache_write_prompt_rate: scaleOptionalRate(standard.cache_write_prompt_rate, discountPercent),
      reasoning_completion_rate: scaleOptionalRate(standard.reasoning_completion_rate, discountPercent),
      minimum_charge_nanos: scaleRateFloor(standard.minimum_charge_nanos, discountPercent),
      request_fee_nanos: scaleRateFloor(standard.request_fee_nanos, discountPercent),
      context_tiers: standard.context_tiers.map(tier => ({
        minimum_input_tokens: tier.minimum_input_tokens,
        prompt_rate: scaleRateFloor(tier.prompt_rate, discountPercent),
        completion_rate: scaleRateFloor(tier.completion_rate, discountPercent),
        cached_prompt_rate: scaleOptionalRate(tier.cached_prompt_rate, discountPercent),
        cache_write_prompt_rate: scaleOptionalRate(tier.cache_write_prompt_rate, discountPercent),
        reasoning_completion_rate: scaleOptionalRate(tier.reasoning_completion_rate, discountPercent),
      })),
    };
  }
  return {
    ...standard,
    amount_units: scaleRateFloor(standard.amount_units, discountPercent),
  };
}

/** Infer the effective discount percent (e.g. 85 for 85% / 8.5折) of a customer promotion vs standard. */
export function inferCustomerDiscountPercent(standard: RetailSchedule, custom: RetailSchedule): number | null {
  try {
    let base: bigint;
    let discounted: bigint;
    if (standard.kind === 'text' && custom.kind === 'text') {
      base = BigInt(standard.prompt_rate);
      discounted = BigInt(custom.prompt_rate);
      if (base === 0n) {
        base = BigInt(standard.completion_rate);
        discounted = BigInt(custom.completion_rate);
      }
    } else if (standard.kind === 'media' && custom.kind === 'media') {
      base = BigInt(standard.amount_units);
      discounted = BigInt(custom.amount_units);
    } else {
      return null;
    }
    if (base <= 0n || discounted < 0n) return null;
    const tenths = Number((discounted * 1000n + base / 2n) / base);
    return tenths / 10;
  } catch {
    return null;
  }
}

export function parseCustomerDiscountInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0 || num >= 100) return null;
  return num;
}

export function formatScheduleCompact(schedule: RetailSchedule, currency: string): string {
  if (schedule.kind === 'text') {
    return `${formatPer1MShort(schedule.prompt_rate, currency)} / ${formatPer1MShort(schedule.completion_rate, currency)}`;
  }
  const amount = mediaAmount(schedule.amount_units, schedule.decimal_places);
  const symbol = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : currency === 'EUR' ? '€' : `${currency} `;
  return `${symbol}${amount}`;
}

export function formatEpochDate(seconds: string): string {
  if (!/^\d+$/.test(seconds)) return '';
  return new Date(Number(seconds) * 1000).toLocaleDateString(readUILocale());
}

/** Load all platform standard prices paired with this customer's active discounts in 1 request. */
export async function loadCustomerPricingRows(
  token: string,
  organizationId: string,
  signal?: AbortSignal,
): Promise<CustomerModelPriceRow[]> {
  const path = `/api/v1/admin/customers/${encodeURIComponent(organizationId)}/pricing`;
  const payload = await request<CustomerPricingPayload>(token, path, 'GET', undefined, signal);
  return Array.isArray(payload.data?.items) ? payload.data.items : [];
}

/** Atomically update or reset 1 or more models' customer-specific pricing in 1 request. */
export async function setCustomerPricingBatch(
  token: string,
  organizationId: string,
  items: CustomerPricingUpdateItem[],
): Promise<void> {
  const path = `/api/v1/admin/customers/${encodeURIComponent(organizationId)}/pricing`;
  await request(token, path, 'PUT', { items });
}

/** Reset one model's customer-specific discount back to platform standard pricing in 1 request. */
export async function resetCustomerModelDiscount(
  token: string,
  organizationId: string,
  priceId: string,
): Promise<void> {
  const path = `/api/v1/admin/customers/${encodeURIComponent(organizationId)}/pricing/${encodeURIComponent(priceId)}`;
  await request(token, path, 'DELETE');
}
