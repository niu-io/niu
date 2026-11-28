import type { Organization } from '@/shell/dashboard-context';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import type { ModelRoutePoolCandidate } from '@niu-io/sdk/admin';

export type ScopeFilter = 'all' | 'shared' | 'organization';
export type DiscoveredRoute = {
  alias: string;
  providerName: string;
  upstreamModel: string;
  ownerFunded: boolean;
  priced: boolean | undefined;
};
export type ProtocolOption = 'any' | 'chat' | 'responses' | 'messages' | 'embeddings' | 'generate_content';

export function encodePoolReference(alias: string): string {
  const bytes = new TextEncoder().encode(alias);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Normalize optional defaults and object key order before comparing an attempted write with the authoritative record. */
export function comparablePool(value: Record<string, unknown>): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, v]) => v !== null && v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, normalize(v)]),
      );
    }
    return item;
  };
  return JSON.stringify(
    normalize({
      alias: value.alias,
      organization_id: value.organization_id,
      project_id: value.project_id,
      display_name: value.display_name,
      description: value.description,
      public_catalog: value.public_catalog ?? false,
      billing_mode: value.billing_mode ?? 'pool_tariff',
      enabled: value.enabled,
      candidates: value.candidates,
      rules: value.rules ?? [],
      default_action: value.default_action ?? 'candidates',
    }),
  );
}

export function formatDate(value: string, unavailableLabel = 'Date unavailable') {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(readUILocale()) : unavailableLabel;
}

export function formatNanos(nanosStr: string | null | undefined, currency = 'USD'): string {
  if (!nanosStr) return '—';
  const num = Number(nanosStr) / 1_000_000_000;
  if (!Number.isFinite(num)) return nanosStr;
  return `${currency} ${num.toFixed(4)}`;
}

export function formatRatePerMillion(nanosStr: string | null | undefined, currency: string | null = 'USD'): string {
  if (!nanosStr) return '—';
  const num = Number(nanosStr) / 1_000_000_000;
  if (!Number.isFinite(num)) return nanosStr;
  return `${currency ?? ''} ${num.toFixed(2)}/1M`.trim();
}

export function poolScopeLabel(
  organizationId: string | null,
  organizations: Organization[],
  t: (en: string, zh: string) => string,
) {
  if (!organizationId) return t('Shared custom model', '平台共享自定义模型');
  const match = organizations.find(item => item.id === organizationId);
  return match?.name ? match.name : t('Organization-scoped custom model', '企业专属自定义模型');
}

export function computeWinningTierShares(candidates: ModelRoutePoolCandidate[]): Map<string, number> {
  const enabled = candidates.filter(c => c.enabled && c.alias.trim());
  const shares = new Map<string, number>();
  if (enabled.length === 0) return shares;
  const maxPriority = Math.max(...enabled.map(c => c.priority));
  const winners = enabled.filter(c => c.priority === maxPriority);
  const totalWeight = winners.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  if (totalWeight <= 0) return shares;
  for (const winner of winners) {
    shares.set(winner.alias.trim(), Math.round((winner.weight / totalWeight) * 1000) / 10);
  }
  return shares;
}
