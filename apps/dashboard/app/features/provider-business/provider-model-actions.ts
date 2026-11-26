import { request, type ProviderConnection, type ProviderModel } from '@/features/providers/api';
import type { ContextPriceTier, ProviderOffer, RetailPriceRecord } from '@niu-io/sdk/admin';
import {
  applyDiscountNanos,
  inferDiscountPercent,
  lookupUpstreamPrice,
  type UpstreamStandardPrice,
} from './upstream-pricing';
import type { SingleModelPricingSubmit } from './ModelDiscountDialog';
import type { ModelRowEntry, ResolvedModelRow } from './ProviderModelsTable';

export function normalizeApiBase(apiBase: string): string {
  return apiBase.trim().replace(/\/+$/, '');
}

export function connectionPoolKey(connection: ProviderConnection): string {
  const providerId = connection.provider?.id ?? connection.supplier?.id ?? '';
  const scope = connection.access_scope ?? (connection.owner_funded ? 'personal' : 'commercial');
  return `${providerId}|${connection.adapter}|${normalizeApiBase(connection.api_base)}|${scope}`;
}

export function pooledConnectionsFor(
  connection: ProviderConnection,
  allConnections: ProviderConnection[],
): ProviderConnection[] {
  const key = connectionPoolKey(connection);
  const matched = allConnections.filter(candidate => connectionPoolKey(candidate) === key);
  return matched.length > 0 ? matched : [connection];
}

export function hasEnabledPoolKey(
  connection: ProviderConnection,
  allConnections: ProviderConnection[] = [],
): boolean {
  if (connection.enabled && connection.has_credential) return true;
  return pooledConnectionsFor(connection, allConnections).some(
    candidate => candidate.enabled && candidate.has_credential,
  );
}

type ComparableTextSchedule = {
  prompt_rate: string;
  completion_rate: string;
  cached_prompt_rate?: string | null;
  cache_write_prompt_rate?: string | null;
  reasoning_completion_rate?: string | null;
  context_tiers?: ContextPriceTier[];
};

function unscaleOfferNanos(offerNanos: string, discountPercent: number | null): string {
  if (!discountPercent || Math.abs(discountPercent - 100) < 0.05 || discountPercent <= 0) {
    return offerNanos;
  }
  const offer = BigInt(offerNanos);
  if (offer <= 0n) return '0';
  const bps = BigInt(Math.round(discountPercent * 100));
  if (bps <= 0n) return offerNanos;
  return ((offer * 10_000n + bps - 1n) / bps).toString();
}

function scaleContextTiers(tiers: ContextPriceTier[], discountPercent: number): ContextPriceTier[] {
  return tiers.map(tier => ({
    minimum_input_tokens: tier.minimum_input_tokens,
    prompt_rate: applyDiscountNanos(tier.prompt_rate, discountPercent),
    completion_rate: applyDiscountNanos(tier.completion_rate, discountPercent),
    cached_prompt_rate:
      tier.cached_prompt_rate != null ? applyDiscountNanos(tier.cached_prompt_rate, discountPercent) : null,
    cache_write_prompt_rate:
      tier.cache_write_prompt_rate != null ? applyDiscountNanos(tier.cache_write_prompt_rate, discountPercent) : null,
    reasoning_completion_rate:
      tier.reasoning_completion_rate != null
        ? applyDiscountNanos(tier.reasoning_completion_rate, discountPercent)
        : null,
  }));
}

function unscaleContextTiers(tiers: ContextPriceTier[], discountPercent: number | null): ContextPriceTier[] {
  return tiers.map(tier => ({
    minimum_input_tokens: tier.minimum_input_tokens,
    prompt_rate: unscaleOfferNanos(tier.prompt_rate, discountPercent),
    completion_rate: unscaleOfferNanos(tier.completion_rate, discountPercent),
    cached_prompt_rate:
      tier.cached_prompt_rate != null ? unscaleOfferNanos(tier.cached_prompt_rate, discountPercent) : null,
    cache_write_prompt_rate:
      tier.cache_write_prompt_rate != null ? unscaleOfferNanos(tier.cache_write_prompt_rate, discountPercent) : null,
    reasoning_completion_rate:
      tier.reasoning_completion_rate != null
        ? unscaleOfferNanos(tier.reasoning_completion_rate, discountPercent)
        : null,
  }));
}

function tierAtInput(schedule: ComparableTextSchedule, inputTokens: bigint): ComparableTextSchedule {
  let matched: ComparableTextSchedule = schedule;
  let bestThreshold = -1n;
  for (const tier of schedule.context_tiers ?? []) {
    try {
      const threshold = BigInt(tier.minimum_input_tokens);
      if (threshold <= inputTokens && threshold >= bestThreshold) {
        bestThreshold = threshold;
        matched = tier;
      }
    } catch {
      // Ignore malformed tier thresholds during advisory comparison.
    }
  }
  return matched;
}

function effectiveDimensionRate(
  schedule: ComparableTextSchedule,
  field: keyof Pick<
    ComparableTextSchedule,
    'prompt_rate' | 'completion_rate' | 'cached_prompt_rate' | 'cache_write_prompt_rate' | 'reasoning_completion_rate'
  >,
  fallback: 'prompt_rate' | 'completion_rate',
): bigint | null {
  const raw = schedule[field] != null ? schedule[field] : schedule[fallback];
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

/**
 * Mirrors backend `pricing_health::compare` for text schedules so any existing
 * standard price that would fall below the Provider purchase schedule in ANY
 * dimension (including cache write, reasoning output, or context tiers) is
 * detected and aligned to the Provider standard price automatically.
 */
export function isRetailBelowPurchaseSchedule(
  retail: RetailPriceRecord | null | undefined,
  purchase: ComparableTextSchedule,
  currency: string,
): boolean {
  if (retail?.schedule.kind !== 'text' || retail.currency !== currency) {
    return true;
  }
  const sell = retail.schedule;
  const boundaries = new Set<bigint>([0n]);
  for (const tier of [...(sell.context_tiers ?? []), ...(purchase.context_tiers ?? [])]) {
    try {
      boundaries.add(BigInt(tier.minimum_input_tokens));
    } catch {
      return true;
    }
  }
  const dimensions: Array<
    [
      'prompt_rate' | 'completion_rate' | 'cached_prompt_rate' | 'cache_write_prompt_rate' | 'reasoning_completion_rate',
      'prompt_rate' | 'completion_rate',
    ]
  > = [
    ['prompt_rate', 'prompt_rate'],
    ['completion_rate', 'completion_rate'],
    ['cached_prompt_rate', 'prompt_rate'],
    ['cache_write_prompt_rate', 'prompt_rate'],
    ['reasoning_completion_rate', 'completion_rate'],
  ];
  for (const input of boundaries) {
    const sellingAt = tierAtInput(sell, input);
    const purchaseAt = tierAtInput(purchase, input);
    for (const [field, fallback] of dimensions) {
      const s = effectiveDimensionRate(sellingAt, field, fallback);
      const c = effectiveDimensionRate(purchaseAt, field, fallback);
      if (s === null || c === null) return true;
      if (s < c && c > 1n) return true;
    }
  }
  return false;
}

export function buildStandardAndPurchaseSchedules(
  info: Pick<ResolvedModelRow, 'stdCacheWriteNanos' | 'stdReasoningOutputNanos' | 'stdContextTiers' | 'offer' | 'retail'>,
  pricing: Pick<
    SingleModelPricingSubmit,
    | 'standardInputNanos'
    | 'standardOutputNanos'
    | 'standardCachedInputNanos'
    | 'discountPercent'
    | 'purchaseInputNanos'
    | 'purchaseOutputNanos'
    | 'purchaseCachedInputNanos'
  >,
): { standard: ComparableTextSchedule; purchase: ComparableTextSchedule } {
  const stdCacheWrite = info.stdCacheWriteNanos ?? null;
  const stdReasoning = info.stdReasoningOutputNanos ?? null;
  const stdTiers = info.stdContextTiers ?? [];
  const standard: ComparableTextSchedule = {
    prompt_rate: pricing.standardInputNanos,
    completion_rate: pricing.standardOutputNanos,
    cached_prompt_rate: pricing.standardCachedInputNanos,
    cache_write_prompt_rate: stdCacheWrite,
    reasoning_completion_rate: stdReasoning,
    context_tiers: stdTiers,
  };
  const purchase: ComparableTextSchedule = {
    prompt_rate: pricing.purchaseInputNanos,
    completion_rate: pricing.purchaseOutputNanos,
    cached_prompt_rate: pricing.purchaseCachedInputNanos,
    cache_write_prompt_rate:
      stdCacheWrite != null ? applyDiscountNanos(stdCacheWrite, pricing.discountPercent) : null,
    reasoning_completion_rate:
      stdReasoning != null ? applyDiscountNanos(stdReasoning, pricing.discountPercent) : null,
    context_tiers: stdTiers.length > 0 ? scaleContextTiers(stdTiers, pricing.discountPercent) : [],
  };
  return { standard, purchase };
}

export function shouldAutoSyncCustomerPrice(
  info: ResolvedModelRow,
  pricing: Omit<SingleModelPricingSubmit, 'updateCustomerPrice'>,
  currency: string,
): boolean {
  if (!info.retail) return true;
  if (pricing.discountPercent <= 100) {
    const { purchase } = buildStandardAndPurchaseSchedules(info, pricing);
    if (isRetailBelowPurchaseSchedule(info.retail, purchase, currency)) {
      return true;
    }
  }
  return false;
}

export function buildResolvedModelRow({
  alias,
  entriesByAlias,
  offerByAlias,
  retailPrices,
  upstreamPrices,
  commercialEnabled,
  platformCurrency,
  connections = [],
}: {
  alias: string;
  entriesByAlias: Map<string, ModelRowEntry[]>;
  offerByAlias: Map<string, ProviderOffer>;
  retailPrices: Map<string, RetailPriceRecord>;
  upstreamPrices: Map<string, UpstreamStandardPrice>;
  commercialEnabled: boolean;
  platformCurrency: string;
  connections?: ProviderConnection[];
}): ResolvedModelRow {
  const routes = entriesByAlias.get(alias) ?? [];
  const primary = routes[0];
  const offer = offerByAlias.get(alias) ?? null;
  const retail = retailPrices.get(alias) ?? null;
  const upstream = lookupUpstreamPrice(upstreamPrices, alias, primary?.model.upstream_model);

  let stdInputNanos: string | null = null;
  let stdOutputNanos: string | null = null;
  let stdCachedNanos: string | null = null;
  let stdCacheWriteNanos: string | null = null;
  let stdReasoningOutputNanos: string | null = null;

  if (upstream && platformCurrency && upstream.currency === platformCurrency) {
    stdInputNanos = upstream.inputPer1MNanos;
    stdOutputNanos = upstream.outputPer1MNanos;
    stdCachedNanos = upstream.cachedInputPer1MNanos;
    stdCacheWriteNanos = upstream.cacheWriteInputPer1MNanos ?? null;
    stdReasoningOutputNanos = upstream.reasoningOutputPer1MNanos ?? null;
  } else if (retail && retail.schedule.kind === 'text' && (!platformCurrency || retail.currency === platformCurrency)) {
    stdInputNanos = retail.schedule.prompt_rate;
    stdOutputNanos = retail.schedule.completion_rate;
    stdCachedNanos = retail.schedule.cached_prompt_rate ?? null;
    stdCacheWriteNanos = retail.schedule.cache_write_prompt_rate ?? null;
    stdReasoningOutputNanos = retail.schedule.reasoning_completion_rate ?? null;
  } else if (offer && offer.rate_kind !== 'media' && (!platformCurrency || offer.currency === platformCurrency)) {
    stdInputNanos = offer.prompt_rate;
    stdOutputNanos = offer.completion_rate;
    stdCachedNanos = offer.cached_prompt_rate ?? null;
    stdCacheWriteNanos = offer.cache_write_prompt_rate ?? null;
    stdReasoningOutputNanos = offer.reasoning_completion_rate ?? null;
  }

  const discountPercent =
    offer && offer.rate_kind !== 'media' && stdInputNanos
      ? inferDiscountPercent(offer.prompt_rate, stdInputNanos)
      : null;

  if (offer && offer.rate_kind !== 'media' && (!platformCurrency || offer.currency === platformCurrency)) {
    if (stdCacheWriteNanos === null && offer.cache_write_prompt_rate != null) {
      stdCacheWriteNanos = unscaleOfferNanos(offer.cache_write_prompt_rate, discountPercent);
    }
    if (stdReasoningOutputNanos === null && offer.reasoning_completion_rate != null) {
      stdReasoningOutputNanos = unscaleOfferNanos(offer.reasoning_completion_rate, discountPercent);
    }
  }

  const stdContextTiers: ContextPriceTier[] =
    offer?.context_tiers?.length
      ? unscaleContextTiers(offer.context_tiers, discountPercent)
      : retail?.schedule.kind === 'text' && retail.schedule.context_tiers?.length
        ? retail.schedule.context_tiers
        : [];

  const routeActive = routes.some(
    r => r.model.enabled && hasEnabledPoolKey(r.connection, connections),
  );
  const isActive = commercialEnabled
    ? Boolean(routeActive && offer?.active && offer?.route_ready && (!platformCurrency || Boolean(retail)))
    : routeActive;
  const offerActiveButMissingRetail = Boolean(
    commercialEnabled && routeActive && offer?.active && offer?.route_ready && platformCurrency && !retail,
  );

  return {
    alias,
    routes,
    primary,
    offer,
    retail,
    upstream,
    stdInputNanos,
    stdOutputNanos,
    stdCachedNanos,
    stdCacheWriteNanos,
    stdReasoningOutputNanos,
    stdContextTiers,
    discountPercent,
    isActive,
    offerActiveButMissingRetail,
  };
}

/**
 * Step 2 + Step 3 atomic activation:
 * 1. Ensures the model route is enabled and public
 * 2. Publishes & atomically authorizes/activates the Provider offer at the discounted purchase rate
 * 3. Ensures a customer standard selling price exists at the upstream standard price (100%)
 *    across ALL rate dimensions (including cache write, reasoning output, and context tiers)
 */
export async function activateProviderModel({
  token,
  providerId,
  commercialEnabled,
  platformCurrency,
  info,
  pricing,
  connections = [],
}: {
  token: string;
  providerId: string;
  commercialEnabled: boolean;
  platformCurrency: string;
  info: ResolvedModelRow;
  pricing: SingleModelPricingSubmit;
  connections?: ProviderConnection[];
}) {
  const targetRoute =
    info.routes.find(r => hasEnabledPoolKey(r.connection, connections)) ?? info.primary;
  if (!targetRoute) throw new Error('Add a model route first.');
  if (!hasEnabledPoolKey(targetRoute.connection, connections)) {
    throw new Error('Enable the Provider API key first.');
  }

  if (!targetRoute.model.enabled || !targetRoute.model.public_catalog) {
    await request(
      token,
      `/api/v1/admin/providers/connections/${encodeURIComponent(targetRoute.connection.id)}/models`,
      'POST',
      {
        alias: targetRoute.model.alias,
        upstream_model: targetRoute.model.upstream_model,
        public_catalog: !targetRoute.connection.owner_funded,
        enabled: true,
        capabilities: targetRoute.model.capabilities,
        expected_revision: targetRoute.model.revision,
      },
    );
  }

  if (!commercialEnabled) return;
  if (!platformCurrency) throw new Error('Configure the platform currency in Settings first.');

  const currentOffer = info.offer;
  const { standard, purchase } = buildStandardAndPurchaseSchedules(info, pricing);

  await request(token, `/api/v1/admin/providers/${encodeURIComponent(providerId)}/offers`, 'POST', {
    model_alias: info.alias,
    currency: platformCurrency,
    prompt_rate: purchase.prompt_rate,
    completion_rate: purchase.completion_rate,
    cached_prompt_rate: purchase.cached_prompt_rate ?? null,
    reasoning_completion_rate: purchase.reasoning_completion_rate ?? null,
    cache_write_prompt_rate: purchase.cache_write_prompt_rate ?? null,
    context_tiers: purchase.context_tiers ?? [],
    expected_revision: currentOffer?.revision ?? null,
    activate: true,
  });

  const existingRetail = info.retail;
  if (!existingRetail || pricing.updateCustomerPrice) {
    await request(token, '/api/v1/admin/pricing/standard-prices', 'POST', {
      model_alias: info.alias,
      currency: platformCurrency,
      schedule: {
        kind: 'text',
        prompt_rate: standard.prompt_rate,
        completion_rate: standard.completion_rate,
        cached_prompt_rate: standard.cached_prompt_rate ?? null,
        cache_write_prompt_rate: standard.cache_write_prompt_rate ?? null,
        reasoning_completion_rate: standard.reasoning_completion_rate ?? null,
        request_fee_nanos:
          existingRetail?.schedule.kind === 'text' ? existingRetail.schedule.request_fee_nanos : '0',
        minimum_charge_nanos:
          existingRetail?.schedule.kind === 'text' ? existingRetail.schedule.minimum_charge_nanos : '0',
        context_tiers: standard.context_tiers ?? [],
      },
      expected_version: existingRetail?.version ?? '0',
      idempotency_key: crypto.randomUUID(),
      reason: existingRetail ? 'Updated from Provider standard price' : 'Initialized from Provider standard price',
    });
  }
}

export async function disableProviderModel({
  token,
  providerId,
  info,
}: {
  token: string;
  providerId: string;
  info: ResolvedModelRow;
}) {
  if (info.offer?.active) {
    await request(
      token,
      `/api/v1/admin/providers/${encodeURIComponent(providerId)}/offers/${encodeURIComponent(info.offer.id)}`,
      'PATCH',
      { active: false },
    );
  }
  for (const { connection, model } of info.routes) {
    if (model.enabled) {
      await request(
        token,
        `/api/v1/admin/providers/connections/${encodeURIComponent(connection.id)}/models`,
        'POST',
        {
          alias: model.alias,
          upstream_model: model.upstream_model,
          public_catalog: model.public_catalog,
          enabled: false,
          capabilities: model.capabilities,
          expected_revision: model.revision,
        },
      );
    }
  }
}

export async function enableInternalProviderModel(
  token: string,
  targetRoute: { connection: ProviderConnection; model: ProviderModel },
) {
  await request(
    token,
    `/api/v1/admin/providers/connections/${encodeURIComponent(targetRoute.connection.id)}/models`,
    'POST',
    {
      alias: targetRoute.model.alias,
      upstream_model: targetRoute.model.upstream_model,
      public_catalog: true,
      enabled: true,
      capabilities: targetRoute.model.capabilities,
      expected_revision: targetRoute.model.revision,
    },
  );
}

export type PolicySyncMode = 'all' | 'allowlist' | 'blocklist';

export async function syncProviderPolicyModels({
  token,
  providerId,
  mode,
  defaultDiscountBps,
  allowlistedModels,
  blocklistedModels,
  commercialEnabled,
  platformCurrency,
  connections,
  rows,
  updateExistingDiscounts = false,
}: {
  token: string;
  providerId: string;
  mode: PolicySyncMode;
  defaultDiscountBps: number;
  allowlistedModels: string[];
  blocklistedModels: string[];
  commercialEnabled: boolean;
  platformCurrency: string;
  connections: ProviderConnection[];
  rows: ResolvedModelRow[];
  updateExistingDiscounts?: boolean;
}): Promise<{ activated: number; disabled: number; skippedUnpriced: number; failures: string[] }> {
  const allowSet = new Set(allowlistedModels);
  const blockSet = new Set(blocklistedModels);
  const discountPercent = defaultDiscountBps / 100;
  let activated = 0;
  let disabled = 0;
  let skippedUnpriced = 0;
  const failures: string[] = [];

  const tasks: Array<() => Promise<void>> = [];

  for (const row of rows) {
    const isMedia =
      row.offer?.rate_kind === 'media' ||
      row.routes.some(r => Boolean(r.model.capabilities?.video_schema));
    const shouldEnable =
      mode === 'all'
        ? true
        : mode === 'blocklist'
          ? !blockSet.has(row.alias)
          : allowSet.has(row.alias);

    if (!shouldEnable) {
      const anyEnabled = row.isActive || row.routes.some(r => r.model.enabled);
      if (anyEnabled) {
        tasks.push(async () => {
          try {
            await disableProviderModel({ token, providerId, info: row });
            disabled += 1;
          } catch (reason) {
            failures.push(`${row.alias}: ${reason instanceof Error ? reason.message : 'disable failed'}`);
          }
        });
      }
      continue;
    }

    const targetRoute =
      row.routes.find(r => hasEnabledPoolKey(r.connection, connections)) ?? row.primary;
    if (!targetRoute || !hasEnabledPoolKey(targetRoute.connection, connections)) continue;

    if (!commercialEnabled) {
      if (!row.isActive) {
        tasks.push(async () => {
          try {
            await enableInternalProviderModel(token, targetRoute);
            activated += 1;
          } catch (reason) {
            failures.push(`${row.alias}: ${reason instanceof Error ? reason.message : 'enable failed'}`);
          }
        });
      }
      continue;
    }

    if (isMedia) continue;
    if (!platformCurrency) continue;

    const stdIn = row.stdInputNanos;
    const stdOut = row.stdOutputNanos;
    const hasPositiveStd =
      stdIn !== null &&
      stdOut !== null &&
      (BigInt(stdIn) > 0n || BigInt(stdOut) > 0n);

    if (!hasPositiveStd || stdIn === null || stdOut === null) {
      if (!row.isActive) skippedUnpriced += 1;
      continue;
    }

    const pricingBase = {
      standardInputNanos: stdIn,
      standardOutputNanos: stdOut,
      standardCachedInputNanos: row.stdCachedNanos,
      discountPercent,
      purchaseInputNanos: applyDiscountNanos(stdIn, discountPercent),
      purchaseOutputNanos: applyDiscountNanos(stdOut, discountPercent),
      purchaseCachedInputNanos: row.stdCachedNanos
        ? applyDiscountNanos(row.stdCachedNanos, discountPercent)
        : null,
    };
    const needsRetailRepair = shouldAutoSyncCustomerPrice(row, pricingBase, platformCurrency);

    const alreadyMatchesDiscount =
      row.isActive &&
      row.discountPercent !== null &&
      Math.abs(row.discountPercent - discountPercent) < 0.05;

    if (row.isActive && !needsRetailRepair && (!updateExistingDiscounts || alreadyMatchesDiscount)) {
      continue;
    }

    tasks.push(async () => {
      try {
        await activateProviderModel({
          token,
          providerId,
          commercialEnabled,
          platformCurrency,
          info: row,
          connections,
          pricing: {
            ...pricingBase,
            updateCustomerPrice: needsRetailRepair,
          },
        });
        activated += 1;
      } catch (reason) {
        failures.push(`${row.alias}: ${reason instanceof Error ? reason.message : 'activate failed'}`);
      }
    });
  }

  const concurrency = Math.min(6, tasks.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < tasks.length) {
        const index = cursor++;
        await tasks[index]();
      }
    }),
  );

  return { activated, disabled, skippedUnpriced, failures };
}
