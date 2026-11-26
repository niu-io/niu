import type { ProviderConnection } from '@/features/providers/api';
import { amountFromNanos, amountToNanos } from '@/lib/money';

export type UpstreamStandardPrice = {
  model: string;
  currency: string;
  inputPer1MNanos: string;
  outputPer1MNanos: string;
  cachedInputPer1MNanos: string | null;
  cacheWriteInputPer1MNanos?: string | null;
  reasoningOutputPer1MNanos?: string | null;
  source: 'official' | 'native_ratio';
};

type AdapterRate = {
  condition?: string | null;
  meter?: string;
  amount?: string;
  currency?: string;
  per_units?: number;
  unit?: string;
};

type AdapterModelPrice = {
  model?: string;
  rates?: AdapterRate[];
};

type AdapterNativeRatio = {
  model?: string;
  input_ratio?: string | null;
  output_ratio?: string | null;
  cached_input_ratio?: string | null;
  quota_type?: number | null;
};

export type AdapterPricingResponse = {
  data?: {
    status?: string;
    source?: string;
    prices?: AdapterModelPrice[];
    native_ratios?: AdapterNativeRatio[];
  };
};

const MAX_RATE_NANOS = 1_000_000_000_000_000n;

/** Parse a non-negative plain decimal string into scaled BigInt digits. */
function parseDecimalParts(raw: string): { digits: bigint; scale: number } | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  try {
    return { digits: BigInt(whole + frac), scale: frac.length };
  } catch {
    return null;
  }
}

/** Convert an upstream rate (amount per `perUnits` tokens) into exact nanounits per 1M tokens. */
function rateToPer1MNanos(amount: string, perUnits: number): bigint | null {
  if (!Number.isSafeInteger(perUnits) || perUnits <= 0) return null;
  const parts = parseDecimalParts(amount);
  if (!parts) return null;
  // nanounits per 1M = amount * (1_000_000 / perUnits) * 1_000_000_000
  const numerator = parts.digits * 1_000_000_000_000_000n;
  const denominator = BigInt(perUnits) * 10n ** BigInt(parts.scale);
  if (denominator <= 0n) return null;
  const result = (numerator + denominator / 2n) / denominator;
  if (result < 0n || result > MAX_RATE_NANOS) return null;
  return result;
}

/**
 * Convert NewAPI/OneAPI native ratio (model_ratio where 1.0 = $2 / 1M input tokens)
 * into estimated USD nanounits per 1M tokens.
 */
function ratioToPer1MNanos(inputRatio: string, outputRatio: string, cachedRatio?: string | null) {
  const inParts = parseDecimalParts(inputRatio);
  const outParts = parseDecimalParts(outputRatio);
  if (!inParts || !outParts) return null;
  // input USD/1M = input_ratio * 2 => nanos = input_ratio * 2_000_000_000
  const inDenom = 10n ** BigInt(inParts.scale);
  const inputNanos = (inParts.digits * 2_000_000_000n + inDenom / 2n) / inDenom;
  if (inputNanos <= 0n || inputNanos > MAX_RATE_NANOS) return null;
  // output USD/1M = input * output_ratio
  const outDenom = 10n ** BigInt(outParts.scale);
  const outputNanos = (inputNanos * outParts.digits + outDenom / 2n) / outDenom;
  if (outputNanos < 0n || outputNanos > MAX_RATE_NANOS) return null;
  let cachedNanos: bigint | null = null;
  if (cachedRatio) {
    const cacheParts = parseDecimalParts(cachedRatio);
    if (cacheParts) {
      const cacheDenom = 10n ** BigInt(cacheParts.scale);
      const computed = (inputNanos * cacheParts.digits + cacheDenom / 2n) / cacheDenom;
      if (computed >= 0n && computed <= MAX_RATE_NANOS) cachedNanos = computed;
    }
  }
  return {
    inputPer1MNanos: inputNanos.toString(),
    outputPer1MNanos: outputNanos.toString(),
    cachedInputPer1MNanos: cachedNanos !== null ? cachedNanos.toString() : null,
  };
}

/** Extract a lookup map (keyed by exact model ID and lowercased model ID) of upstream standard prices. */
export function extractUpstreamStandardPrices(response: AdapterPricingResponse | null | undefined): Map<string, UpstreamStandardPrice> {
  const map = new Map<string, UpstreamStandardPrice>();
  const body = response?.data;
  if (!body) return map;

  for (const item of body.prices ?? []) {
    if (!item.model || !Array.isArray(item.rates)) continue;
    const unconditional = item.rates.filter(r => !r.condition);
    const pool = unconditional.length > 0 ? unconditional : item.rates;
    const input = pool.find(r => r.meter === 'input_tokens' && r.amount && r.currency && r.per_units);
    const output = pool.find(r => r.meter === 'output_tokens' && r.amount && r.currency && r.per_units);
    if (!input?.amount || !input.currency || !input.per_units || !output?.amount || !output.per_units || input.currency !== output.currency) continue;
    const inputNanos = rateToPer1MNanos(input.amount, input.per_units);
    const outputNanos = rateToPer1MNanos(output.amount, output.per_units);
    if (inputNanos === null || outputNanos === null) continue;
    const cached = pool.find(r => r.meter === 'cached_input_tokens' && r.amount && r.currency === input.currency && r.per_units);
    const cachedNanos = cached?.amount && cached.per_units ? rateToPer1MNanos(cached.amount, cached.per_units) : null;
    const cacheWrite = pool.find(r => r.meter === 'cache_write_tokens' && r.amount && r.currency === input.currency && r.per_units);
    const cacheWriteNanos = cacheWrite?.amount && cacheWrite.per_units ? rateToPer1MNanos(cacheWrite.amount, cacheWrite.per_units) : null;
    const reasoning = pool.find(r => r.meter === 'reasoning_tokens' && r.amount && r.currency === input.currency && r.per_units);
    const reasoningNanos = reasoning?.amount && reasoning.per_units ? rateToPer1MNanos(reasoning.amount, reasoning.per_units) : null;
    const entry: UpstreamStandardPrice = {
      model: item.model,
      currency: input.currency.toUpperCase(),
      inputPer1MNanos: inputNanos.toString(),
      outputPer1MNanos: outputNanos.toString(),
      cachedInputPer1MNanos: cachedNanos !== null ? cachedNanos.toString() : null,
      cacheWriteInputPer1MNanos: cacheWriteNanos !== null ? cacheWriteNanos.toString() : null,
      reasoningOutputPer1MNanos: reasoningNanos !== null ? reasoningNanos.toString() : null,
      source: 'official',
    };
    map.set(item.model, entry);
    map.set(item.model.toLowerCase(), entry);
  }

  for (const ratio of body.native_ratios ?? []) {
    if (!ratio.model || map.has(ratio.model)) continue;
    if (ratio.quota_type != null && ratio.quota_type !== 0) continue;
    if (!ratio.input_ratio || !ratio.output_ratio) continue;
    const converted = ratioToPer1MNanos(ratio.input_ratio, ratio.output_ratio, ratio.cached_input_ratio);
    if (!converted) continue;
    const entry: UpstreamStandardPrice = {
      model: ratio.model,
      currency: 'USD',
      ...converted,
      source: 'native_ratio',
    };
    map.set(ratio.model, entry);
    map.set(ratio.model.toLowerCase(), entry);
  }

  return map;
}

export function lookupUpstreamPrice(
  map: Map<string, UpstreamStandardPrice>,
  alias: string,
  upstreamModel?: string,
): UpstreamStandardPrice | null {
  if (upstreamModel) {
    const exact = map.get(upstreamModel) ?? map.get(upstreamModel.toLowerCase());
    if (exact) return exact;
  }
  return map.get(alias) ?? map.get(alias.toLowerCase()) ?? null;
}

/**
 * Parse a discount percentage input.
 * Empty input means 100 (no discount). Accepts 0.1 .. 1000.
 */
export function parseDiscountPercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 100;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0 || num > 1000) return null;
  return num;
}

/**
 * Apply discount percentage (e.g. 70 => 70% of standard price = 30% off) in exact integer nanounits.
 * Never silently rounds a positive standard price to 0.
 */
export function applyDiscountNanos(standardNanos: string, discountPercent: number): string {
  const base = BigInt(standardNanos);
  if (base === 0n) return '0';
  const bps = BigInt(Math.round(discountPercent * 100)); // 100% => 10_000 bps
  const raw = (base * bps + 5_000n) / 10_000n;
  const clamped = raw > MAX_RATE_NANOS ? MAX_RATE_NANOS : raw;
  return (clamped === 0n && bps > 0n ? 1n : clamped).toString();
}

/** Infer percentage (e.g. 70 for 7折, 100 for 无折扣) from offer vs standard nanos. */
export function inferDiscountPercent(offerNanos: string | null | undefined, standardNanos: string | null | undefined): number | null {
  if (!offerNanos || !standardNanos) return null;
  try {
    const offer = BigInt(offerNanos);
    const standard = BigInt(standardNanos);
    if (standard <= 0n || offer < 0n) return null;
    const tenths = Number((offer * 1000n + standard / 2n) / standard);
    return tenths / 10;
  } catch {
    return null;
  }
}

export function formatDiscountBadge(percent: number | null, isZh: boolean): string {
  if (percent === null || Math.abs(percent - 100) < 0.05) {
    return isZh ? '无折扣' : 'No discount';
  }
  const clean = Number.isInteger(percent) ? String(percent) : percent.toFixed(1).replace(/\.0$/, '');
  if (isZh && percent < 100) {
    const zhe = (percent / 10).toFixed(2).replace(/\.?0+$/, '');
    return `${zhe} 折 (${clean}%)`;
  }
  return `${clean}%`;
}

export function parsePer1MAmountToNanos(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const nanos = amountToNanos(trimmed, true);
    if (BigInt(nanos) > MAX_RATE_NANOS) return null;
    return nanos;
  } catch {
    return null;
  }
}

export function formatPer1MShort(nanos: string, currency: string): string {
  const raw = amountFromNanos(nanos);
  const [whole, frac = ''] = raw.split('.');
  const formatted = frac.length === 0 ? `${whole}.00` : frac.length === 1 ? `${whole}.${frac}0` : raw;
  const symbol = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : currency === 'EUR' ? '€' : `${currency} `;
  return `${symbol}${formatted}`;
}

const SUPPORTED_ADAPTER_PRICING = new Set(['openrouter', 'fastrouter', 'babelark', 'qiniu', 'deepseek']);
const SUPPORTED_ADAPTER_PRICING_HOSTS = ['openrouter.ai', 'fastrouter', 'babelark.ai', 'qiniu', 'deepseek.com'];

export function supportsAdapterPricing(connections: ProviderConnection[]): boolean {
  return connections.some(c => {
    const adapter = c.adapter.toLowerCase();
    if (SUPPORTED_ADAPTER_PRICING.has(adapter)) return true;
    const base = c.api_base.toLowerCase();
    return SUPPORTED_ADAPTER_PRICING_HOSTS.some(host => base.includes(host));
  });
}
