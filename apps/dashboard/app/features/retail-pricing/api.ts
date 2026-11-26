import type { ContextPriceTier, ProviderOffer, RetailPriceRecord } from '@niu-io/sdk/admin';
import { request } from '@/features/providers/api';
import {
  extractUpstreamStandardPrices,
  lookupUpstreamPrice,
  type AdapterPricingResponse,
} from '@/features/provider-business/upstream-pricing';
export type RetailModelChoice = { model_alias: string; media: { channel: string; resolutions: string[]; reference_video: boolean; meter: string } | null };
/** Registration supports price preparation; never infer supply from this list. */
export async function registeredRetailModelChoices(token: string, signal: AbortSignal): Promise<RetailModelChoice[]> {
  let after: string | null = null; const choices = new Map<string,RetailModelChoice>(), seen = new Set<string>();
  do {
    const page: { data: RetailModelChoice[]; next_after: string | null } = await request(token, '/api/v1/admin/pricing/standard-prices/models?limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''), 'GET', undefined, signal);
    if (!Array.isArray(page.data) || (page.next_after !== null && (typeof page.next_after !== 'string' || !page.next_after || seen.has(page.next_after)))) throw new Error('Model pagination did not advance. Close and refresh.');
    for (const row of page.data) {
      if (!row.model_alias?.trim()) throw new Error('Registered model name unavailable.');
      if (row.media && (!row.media.channel?.trim() || !row.media.meter?.trim() || !Array.isArray(row.media.resolutions) || !row.media.resolutions.length || row.media.resolutions.some(value=>typeof value!=='string'||!value.trim()) || typeof row.media.reference_video!=='boolean')) throw new Error('Media specifications could not be verified. Close and refresh.');
      choices.set(row.model_alias, {...row,media:row.media ?? null});
    }
    after = page.next_after; if (after) seen.add(after);
  } while (after);
  return [...choices.values()];
}
export async function registeredRetailModels(token: string, signal: AbortSignal): Promise<string[]> {
  return (await registeredRetailModelChoices(token,signal)).map(row=>row.model_alias);
}

export type RetailCustomer = { organization_id: string; organization_name: string; created_at: string };
export async function retailCustomers(token: string, signal: AbortSignal): Promise<RetailCustomer[]> {
  let after: string | null = null; const rows = new Map<string, RetailCustomer>(), seen = new Set<string>();
  do {
    const page: { data: RetailCustomer[]; next_after: string | null } = await request(token, '/api/v1/admin/pricing/customers?limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''), 'GET', undefined, signal);
    if (!Array.isArray(page.data) || (page.next_after !== null && (typeof page.next_after !== 'string' || !page.next_after || seen.has(page.next_after)))) throw new Error('Customer pagination did not advance. Close and refresh.');
    for (const row of page.data) { if (!row.organization_id || !row.organization_name?.trim() || !Number.isFinite(Date.parse(row.created_at))) throw new Error('Customer details unavailable.'); rows.set(row.organization_id, row); }
    after = page.next_after; if (after) seen.add(after);
  } while (after);
  return [...rows.values()];
}

export type RetailLookup = Map<string, RetailPriceRecord>;
export async function fetchAllStandardTextPrices(token: string, signal: AbortSignal): Promise<RetailLookup> {
  const nextRetail: RetailLookup = new Map();
  let after: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    if (signal.aborted) break;
    const path: string = '/api/v1/admin/pricing/standard-prices?limit=100' + (after ? `&after=${encodeURIComponent(after)}` : '');
    const res: { data: RetailPriceRecord[]; next_after?: string | null } = await request(token, path, 'GET', undefined, signal);
    if (!Array.isArray(res?.data)) break;
    for (const row of res.data) {
      if (row?.schedule?.kind === 'text' && typeof row.model_alias === 'string') {
        nextRetail.set(row.model_alias, row);
      }
    }
    const nextCursor: string | null = res.next_after ?? null;
    if (!nextCursor || nextCursor === after) break;
    after = nextCursor;
  }
  return nextRetail;
}

export type DefaultProviderTextSchedule = {
  prompt_rate: string;
  completion_rate: string;
  cached_prompt_rate: string | null;
  cache_write_prompt_rate: string | null;
  reasoning_completion_rate: string | null;
  context_tiers: ContextPriceTier[];
};

export async function lookupProviderDefaultTextSchedule(
  token: string,
  modelAlias: string,
  currency: string,
  signal: AbortSignal,
): Promise<DefaultProviderTextSchedule | null> {
  if (!modelAlias || !currency) return null;
  try {
    const providersRes = await request<{ data: Array<{ id: string; slug?: string; name: string }> }>(
      token,
      '/api/v1/admin/providers',
      'GET',
      undefined,
      signal,
    );
    const providers = Array.isArray(providersRes?.data) ? providersRes.data : [];
    if (!providers.length || signal.aborted) return null;
    const prefix = modelAlias.includes('/') ? modelAlias.split('/')[0].toLowerCase() : '';
    const ordered = prefix
      ? [
          ...providers.filter(p => (p.slug ?? '').toLowerCase() === prefix || p.name.toLowerCase() === prefix),
          ...providers.filter(p => (p.slug ?? '').toLowerCase() !== prefix && p.name.toLowerCase() !== prefix),
        ]
      : providers;
    const unprefixed = modelAlias.includes('/') ? modelAlias.slice(modelAlias.indexOf('/') + 1) : modelAlias;

    for (const provider of ordered.slice(0, 6)) {
      if (signal.aborted) return null;
      const [pricingRes, offersRes] = await Promise.allSettled([
        request<AdapterPricingResponse>(
          token,
          `/api/v1/admin/providers/${encodeURIComponent(provider.id)}/pricing`,
          'GET',
          undefined,
          signal,
        ),
        request<{ data: ProviderOffer[] }>(
          token,
          `/api/v1/admin/providers/${encodeURIComponent(provider.id)}/offers?limit=100`,
          'GET',
          undefined,
          signal,
        ),
      ]);
      const offer =
        offersRes.status === 'fulfilled' && Array.isArray(offersRes.value?.data)
          ? offersRes.value.data.find(
              item => item.model_alias === modelAlias && item.rate_kind !== 'media' && item.currency === currency,
            ) ?? null
          : null;
      if (pricingRes.status === 'fulfilled' && pricingRes.value) {
        const upstreamMap = extractUpstreamStandardPrices(pricingRes.value);
        const upstream = lookupUpstreamPrice(upstreamMap, modelAlias, unprefixed);
        if (upstream && upstream.currency === currency) {
          return {
            prompt_rate: upstream.inputPer1MNanos,
            completion_rate: upstream.outputPer1MNanos,
            cached_prompt_rate: upstream.cachedInputPer1MNanos ?? null,
            cache_write_prompt_rate: upstream.cacheWriteInputPer1MNanos ?? offer?.cache_write_prompt_rate ?? null,
            reasoning_completion_rate: upstream.reasoningOutputPer1MNanos ?? offer?.reasoning_completion_rate ?? null,
            context_tiers: offer?.context_tiers ?? [],
          };
        }
      }
      if (offer && offer.rate_kind !== 'media') {
        return {
          prompt_rate: offer.prompt_rate,
          completion_rate: offer.completion_rate,
          cached_prompt_rate: offer.cached_prompt_rate ?? null,
          cache_write_prompt_rate: offer.cache_write_prompt_rate ?? null,
          reasoning_completion_rate: offer.reasoning_completion_rate ?? null,
          context_tiers: offer.context_tiers ?? [],
        };
      }
    }
  } catch {
    // Prefill is best-effort convenience; manual entry stays available.
  }
  return null;
}
