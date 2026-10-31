import { KeyRequestError, keyRequest, type IssuedProjectKey, type ProjectKey } from './api';

// This is a disposable recovery hint, never key storage. The committed result
// and credential state are always read from the server; no secret is cached.
export type PendingKeyMutation = {
  version: 1;
  requestId: string;
  action: 'create' | 'rotate';
  label: string;
  keyId?: string;
  body?: Record<string, unknown>;
};
export type KeyMutationOutcome =
  | { kind: 'issued'; issued: IssuedProjectKey }
  | { kind: 'recovered'; key: ProjectKey }
  | { kind: 'unconfirmed' };

const prefix = 'niu:key-request:v1:';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function recoveryCacheKey(actor: string, workspace: string) {
  return prefix + encodeURIComponent(actor) + ':' + encodeURIComponent(workspace);
}

export function readPendingKeyMutation(cache: Storage, key: string): PendingKeyMutation | null {
  const raw = cache.getItem(key);
  if (raw === null) return null;
  let value: PendingKeyMutation;
  try { value = JSON.parse(raw) as PendingKeyMutation; }
  catch { throw new Error('The saved key request cannot be read. Review your API keys before starting another request.'); }
  if (!value || value.version !== 1 || !uuid.test(value.requestId) || typeof value.label !== 'string'
    || (value.action !== 'create' && value.action !== 'rotate')
    || (value.action === 'rotate' && typeof value.keyId !== 'string')
    || (value.action === 'create' && (!value.body || typeof value.body !== 'object' || Array.isArray(value.body)))) {
    throw new Error('The saved key request is invalid. Review your API keys before starting another request.');
  }
  return value;
}

export function savePendingKeyMutation(cache: Storage, key: string, pending: PendingKeyMutation) {
  try { cache.setItem(key, JSON.stringify(pending)); }
  catch { throw new Error('The request has not been sent. Browser storage is unavailable, so recovery after leaving this page cannot be preserved.'); }
}

export function forgetPendingKeyMutation(cache: Storage, key: string, requestId: string) {
  // A stale response must not discard a newer recovery request.
  if (readPendingKeyMutation(cache, key)?.requestId === requestId) cache.removeItem(key);
}

function projectKey(value: unknown): value is ProjectKey {
  if (!value || typeof value !== 'object') return false;
  const key = value as Partial<ProjectKey>;
  return typeof key.id === 'string' && typeof key.name === 'string'
    && Array.isArray(key.allowed_models) && key.allowed_models.every(model => typeof model === 'string')
    && typeof key.revoked === 'boolean' && typeof key.expired === 'boolean';
}

export function confirmedKeyValidationFailure(error: unknown) {
  // Authentication, conflict, transport, parsing and server errors all retain
  // recovery identity. They must not silently authorize a fresh mutation.
  return error instanceof KeyRequestError && [400, 422].includes(error.status);
}

export async function reconcileKeyMutation(token: string, collection: string, pending: PendingKeyMutation, signal?: AbortSignal): Promise<KeyMutationOutcome> {
  const response = await keyRequest<{data: {action: string; key: unknown} | null}>(token,
    `${collection}/requests/${encodeURIComponent(pending.requestId)}`, 'GET', undefined, signal);
  if (response.data === null) return {kind:'unconfirmed'};
  if (response.data?.action !== pending.action || !projectKey(response.data.key)) {
    throw new Error('The key request status could not be verified. Check its status again before continuing.');
  }
  return {kind:'recovered', key:response.data.key};
}

export async function submitKeyMutation(token: string, collection: string, pending: PendingKeyMutation, signal?: AbortSignal): Promise<KeyMutationOutcome> {
  const path = pending.action === 'rotate'
    ? `${collection}/${encodeURIComponent(pending.keyId!)}/rotate` : collection;
  const result = await keyRequest<Partial<IssuedProjectKey> & {secret_available?: boolean}>(token, path, 'POST',
    pending.action === 'create' ? pending.body : undefined, signal, {'idempotency-key': pending.requestId});
  if (result.secret_available === false) {
    // Re-read the authoritative outcome instead of inferring it from a partial
    // mutation response. This also rechecks current membership.
    return reconcileKeyMutation(token, collection, pending, signal);
  }
  if (typeof result.id !== 'string' || typeof result.token !== 'string' || !result.token) {
    throw new Error('The request may have completed, but its key secret was not received. Check the saved result before continuing.');
  }
  return {kind:'issued',issued:result as IssuedProjectKey};
}
