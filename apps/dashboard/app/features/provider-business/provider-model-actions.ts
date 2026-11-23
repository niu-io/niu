import { request, type ProviderConnection, type ProviderModel } from '@/features/providers/api';
import type { ProviderOffer, RetailPriceRecord } from '@niu-io/sdk/admin';
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

  if (upstream && platformCurrency && upstream.currency === platformCurrency) {
    stdInputNanos = upstream.inputPer1MNanos;
    stdOutputNanos = upstream.outputPer1MNanos;
    stdCachedNanos = upstream.cachedInputPer1MNanos;
  } else if (retail && retail.schedule.kind === 'text' && (!platformCurrency || retail.currency === platformCurrency)) {
    stdInputNanos = retail.schedule.prompt_rate;
    stdOutputNanos = retail.schedule.completion_rate;
    stdCachedNanos = retail.schedule.cached_prompt_rate ?? null;
  } else if (offer && offer.rate_kind !== 'media' && (!platformCurrency || offer.currency === platformCurrency)) {
    stdInputNanos = offer.prompt_rate;
    stdOutputNanos = offer.completion_rate;
    stdCachedNanos = offer.cached_prompt_rate ?? null;
  }

  const discountPercent =
    offer && offer.rate_kind !== 'media' && stdInputNanos
      ? inferDiscountPercent(offer.prompt_rate, stdInputNanos)
      : null;

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
  await request(token, `/api/v1/admin/providers/${encodeURIComponent(providerId)}/offers`, 'POST', {
    model_alias: info.alias,
    currency: platformCurrency,
    prompt_rate: pricing.purchaseInputNanos,
    completion_rate: pricing.purchaseOutputNanos,
    cached_prompt_rate: pricing.purchaseCachedInputNanos,
    ...(currentOffer
      ? {
          reasoning_completion_rate: currentOffer.reasoning_completion_rate,
          cache_write_prompt_rate: currentOffer.cache_write_prompt_rate,
          context_tiers: currentOffer.context_tiers,
        }
      : {}),
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
        prompt_rate: pricing.standardInputNanos,
        completion_rate: pricing.standardOutputNanos,
        cached_prompt_rate: pricing.standardCachedInputNanos,
        cache_write_prompt_rate: null,
        reasoning_completion_rate: null,
        request_fee_nanos: '0',
        minimum_charge_nanos: '0',
        context_tiers: [],
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

    const alreadyMatchesDiscount =
      row.isActive &&
      row.discountPercent !== null &&
      Math.abs(row.discountPercent - discountPercent) < 0.05;

    if (row.isActive && (!updateExistingDiscounts || alreadyMatchesDiscount)) {
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
            standardInputNanos: stdIn,
            standardOutputNanos: stdOut,
            standardCachedInputNanos: row.stdCachedNanos,
            discountPercent,
            purchaseInputNanos: applyDiscountNanos(stdIn, discountPercent),
            purchaseOutputNanos: applyDiscountNanos(stdOut, discountPercent),
            purchaseCachedInputNanos: row.stdCachedNanos
              ? applyDiscountNanos(row.stdCachedNanos, discountPercent)
              : null,
            updateCustomerPrice: !row.retail,
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
