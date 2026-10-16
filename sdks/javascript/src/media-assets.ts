import type { RequestOptions } from './index.js';
import { createMediaVerificationClient } from './media-verification.js';
import { nativeCapabilityQuery, type NativeProviderCapabilities } from './provider-capabilities.js';

/** Current metadata from an explicit, successful, identity-validated Get.
 * Independent of operation ACKs; cannot unblock unknown writes or grant reuse.
 */
export type MediaAssetGroupObservation = {
  source: 'provider_get'; status: 'present';
  name: string | null; description: string | null; observed_at_ms: number;
};
export type MediaAssetObservation = {
  source: 'provider_get'; status: 'processing' | 'active' | 'failed';
  name: string | null; observed_at_ms: number;
};

/** Niu workspace references, never raw Provider asset identifiers or Actions. */
export type MediaAssetGroup = {
  id: string; model: string; name: string; description: string | null;
  kind: 'generated' | 'person'; status: 'pending' | 'ready' | 'unknown' | 'failed' | 'deleted';
  observation: MediaAssetGroupObservation | null;
  revision: string; created_at_ms: number; updated_at_ms: number;
};
export type MediaAsset = {
  id: string; group_id: string; model: string; name: string | null;
  kind: 'image' | 'video' | 'audio';
  status: 'pending' | 'processing' | 'active' | 'failed' | 'unknown' | 'deleted';
  observation: MediaAssetObservation | null;
  revision: string; created_at_ms: number; updated_at_ms: number;
};
export type MediaAssetOperation = {
  id: string; group_id: string; asset_id: string | null; model: string;
  action: 'create_group' | 'update_group' | 'delete_group' | 'create_asset' | 'rename_asset' | 'delete_asset';
  status: 'prepared' | 'unknown' | 'acknowledged' | 'not_sent';
  http_status: number | null; request_id: string | null;
  /** Observed diagnostic only; never proof of nonexecution or permission to replay. */
  diagnostic?: {
    category: 'transport' | 'timeout' | 'response_too_large' | 'invalid_response' | 'upstream_rejected';
    phase: 'exchange' | 'response' | 'acknowledgement';
  } | null;
  created_at_ms: number; updated_at_ms: number;
};
export type MediaAssetMutation = {
  data: MediaAssetOperation; group: MediaAssetGroup | null; asset: MediaAsset | null;
};
export type MediaAssetMutationOptions = RequestOptions & {
  /** Canonical UUID. Replays recover the saved operation and never resubmit it. */
  idempotencyKey?: string;
};
/** Full original typed request is required for dispatch; source URLs are not persisted. */
export type MediaAssetOperationInput =
  | { action: 'create_group'; model: string; name: string; description?: string }
  | { action: 'update_group'; model: string; group_id: string; name?: string; description?: string; expected_revision?: string }
  | { action: 'delete_group'; model: string; group_id: string; expected_revision?: string }
  | { action: 'create_asset'; model: string; group_id: string; url: string; name?: string; kind: 'image' | 'video' | 'audio' }
  | { action: 'rename_asset'; model: string; asset_id: string; name: string; expected_revision?: string }
  | { action: 'delete_asset'; model: string; asset_id: string; expected_revision?: string };
export type MediaAssetPreparationOptions = MediaAssetMutationOptions & { idempotencyKey: string };
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
    capabilities: (model?: string, options?: RequestOptions) => send<NativeProviderCapabilities>(`/media/capabilities${nativeCapabilityQuery(model)}`, 'GET', undefined, options),
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
      /** Metadata-only durable preparation. Never calls the Provider. */
      prepare: (input: MediaAssetOperationInput, options: MediaAssetPreparationOptions) => send<MediaAssetMutation>('/media/asset-operations/prepare', 'POST', input, options),
      /** Explicit one-shot dispatch of an existing preparation, using its original full request and UUID. */
      dispatch: (id: string, input: MediaAssetOperationInput, options: MediaAssetPreparationOptions) => send<MediaAssetMutation>(`/media/asset-operations/${reference(id)}/dispatch`, 'POST', input, options),
      /** Cancel an unclaimed preparation only. Unknown operations cannot be canceled or resent. */
      cancel: (id: string, model: string, options?: RequestOptions) => send<{ data: MediaAssetOperation }>(`/media/asset-operations/${reference(id)}/cancel${query({ model })}`, 'POST', undefined, options),
      /** Read persisted operations newest first. Never retries a mutation. */
      list: (input: PageQuery, options?: RequestOptions) => send<MediaAssetPage<MediaAssetOperation>>(`/media/asset-operations${query(input)}`, 'GET', undefined, options),
      /** A 404 does not establish that the original request was never sent. */
      retrieveByIdempotency: (idempotencyKey: string, model: string, options?: RequestOptions) => send<{ data: MediaAssetOperation }>(`/media/asset-operations/by-idempotency/${reference(idempotencyKey)}${query({ model })}`, 'GET', undefined, options),
      retrieve: (id: string, model: string, options?: RequestOptions) => send<{ data: MediaAssetOperation }>(`/media/asset-operations/${reference(id)}${query({ model })}`, 'GET', undefined, options),
    },
  };
}
