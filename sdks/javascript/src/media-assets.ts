import type { RequestOptions } from './index.js';
import { createMediaVerificationClient } from './media-verification.js';

/** Niu workspace references, never raw Provider asset identifiers or Actions. */
export type MediaAssetGroup = {
  id: string; model: string; name: string; description: string | null;
  kind: 'generated' | 'person'; status: 'pending' | 'ready' | 'unknown' | 'failed' | 'deleted';
  revision: string; created_at_ms: number; updated_at_ms: number;
};
export type MediaAsset = {
  id: string; group_id: string; model: string; name: string | null;
  kind: 'image' | 'video' | 'audio';
  status: 'pending' | 'processing' | 'active' | 'failed' | 'unknown' | 'deleted';
  revision: string; created_at_ms: number; updated_at_ms: number;
};
export type MediaAssetOperation = {
  id: string; group_id: string; asset_id: string | null; model: string;
  action: 'create_group' | 'update_group' | 'delete_group' | 'create_asset' | 'rename_asset' | 'delete_asset';
  status: 'prepared' | 'unknown' | 'acknowledged' | 'not_sent';
  http_status: number | null; request_id: string | null;
  created_at_ms: number; updated_at_ms: number;
};
export type MediaAssetMutation = {
  data: MediaAssetOperation; group: MediaAssetGroup | null; asset: MediaAsset | null;
};
export type MediaAssetMutationOptions = RequestOptions & {
  /** Canonical UUID. Replays recover the saved operation and never resubmit it. */
  idempotencyKey?: string;
};
export type MediaAssetPage<T> = { data: T[]; next_cursor: string | null };
type PageQuery = { model: string; after?: string; limit?: number };
export type MediaAssetSender = <T>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body: unknown, options?: MediaAssetMutationOptions) => Promise<T>;

function reference(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    throw new TypeError('A canonical Niu resource reference is required');
  }
  return value;
}
function query(input: PageQuery & { group_id?: string; expected_revision?: string }): string {
  if (typeof input.model !== 'string' || !input.model.trim()) throw new TypeError('A model is required');
  const params = new URLSearchParams({ model: input.model });
  if (input.after !== undefined) params.set('after', reference(input.after));
  if (input.group_id !== undefined) params.set('group_id', reference(input.group_id));
  if (input.limit !== undefined) {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new RangeError('limit must be between 1 and 100');
    params.set('limit', String(input.limit));
  }
  if (input.expected_revision !== undefined) {
    if (!/^[1-9][0-9]*$/.test(input.expected_revision)) throw new TypeError('A positive decimal revision is required');
    params.set('expected_revision', input.expected_revision);
  }
  return `?${params}`;
}

/** Explicit reads and one-shot mutations; no automatic retry or readiness claim. */
export function createMediaAssetsClient(send: MediaAssetSender) {
  return {
    verification: createMediaVerificationClient(send, reference, query),
    groups: {
      list: (input: PageQuery, options?: RequestOptions) => send<MediaAssetPage<MediaAssetGroup>>(`/media/asset-groups${query(input)}`, 'GET', undefined, options),
      create: (input: { model: string; name: string; description?: string }, options?: MediaAssetMutationOptions) => send<MediaAssetMutation>('/media/asset-groups', 'POST', input, options),
      retrieve: (id: string, model: string, options?: RequestOptions) => send<{ data: MediaAssetGroup }>(`/media/asset-groups/${reference(id)}${query({ model })}`, 'GET', undefined, options),
      update: (id: string, input: { model: string; name?: string; description?: string; expected_revision?: string }, options?: MediaAssetMutationOptions) => send<MediaAssetMutation>(`/media/asset-groups/${reference(id)}`, 'PATCH', input, options),
      delete: (id: string, input: { model: string; expected_revision?: string }, options?: MediaAssetMutationOptions) => send<MediaAssetMutation>(`/media/asset-groups/${reference(id)}${query(input)}`, 'DELETE', undefined, options),
      refresh: (id: string, model: string, options?: RequestOptions) => send<{ data: MediaAssetGroup }>(`/media/asset-groups/${reference(id)}/refresh${query({ model })}`, 'POST', undefined, options),
    },
    assets: {
      list: (input: PageQuery & { group_id?: string }, options?: RequestOptions) => send<MediaAssetPage<MediaAsset>>(`/media/assets${query(input)}`, 'GET', undefined, options),
      create: (input: { model: string; group_id: string; url: string; name?: string; kind: 'image' | 'video' | 'audio' }, options?: MediaAssetMutationOptions) => send<MediaAssetMutation>('/media/assets', 'POST', input, options),
      retrieve: (id: string, model: string, options?: RequestOptions) => send<{ data: MediaAsset }>(`/media/assets/${reference(id)}${query({ model })}`, 'GET', undefined, options),
      update: (id: string, input: { model: string; name: string; expected_revision?: string }, options?: MediaAssetMutationOptions) => send<MediaAssetMutation>(`/media/assets/${reference(id)}`, 'PATCH', input, options),
      delete: (id: string, input: { model: string; expected_revision?: string }, options?: MediaAssetMutationOptions) => send<MediaAssetMutation>(`/media/assets/${reference(id)}${query(input)}`, 'DELETE', undefined, options),
      refresh: (id: string, model: string, options?: RequestOptions) => send<{ data: MediaAsset }>(`/media/assets/${reference(id)}/refresh${query({ model })}`, 'POST', undefined, options),
    },
    operations: {
      retrieve: (id: string, model: string, options?: RequestOptions) => send<{ data: MediaAssetOperation }>(`/media/asset-operations/${reference(id)}${query({ model })}`, 'GET', undefined, options),
    },
  };
}
