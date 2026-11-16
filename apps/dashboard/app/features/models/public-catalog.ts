import { fetchQuery, invalidateQueries } from '@/lib/query-cache';
import type { Model } from '@/shell/dashboard-context';

export type PublicCatalogResult = {
  models: Model[];
  billingMode: 'currency' | 'credits';
};

export const PUBLIC_CATALOG_ENDPOINT = '/catalog/v1/models';

export async function loadPublicCatalogModels(options?: {
  signal?: AbortSignal;
  force?: boolean;
  freshMs?: number;
}): Promise<PublicCatalogResult> {
  try {
    return await fetchQuery<PublicCatalogResult>(
      'public',
      PUBLIC_CATALOG_ENDPOINT,
      async signal => {
        const response = await fetch(PUBLIC_CATALOG_ENDPOINT, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
          signal,
        });
        if (!response.ok) {
          throw new Error('Could not load the model catalog.');
        }
        const parsed = (await response.json()) as {
          data?: unknown;
          billing_mode?: unknown;
        };
        if (!Array.isArray(parsed?.data)) {
          throw new Error('Invalid model catalog response.');
        }
        const models = parsed.data.filter(
          (item): item is Model =>
            Boolean(item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'),
        );
        if (models.length !== parsed.data.length) {
          throw new Error('Invalid model catalog response.');
        }
        const billingMode = parsed.billing_mode === 'credits' ? 'credits' : 'currency';
        return { models, billingMode };
      },
      {
        signal: options?.signal,
        force: options?.force,
        freshMs: options?.freshMs ?? 5_000,
        awaitRevalidate: true,
        background: true,
      },
    );
  } catch (error) {
    invalidateQueries(key => key.startsWith(`public::${PUBLIC_CATALOG_ENDPOINT}`));
    throw error;
  }
}
