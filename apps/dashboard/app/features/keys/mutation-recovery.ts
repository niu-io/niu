import { KeyRequestError, keyRequest, type IssuedProjectKey, type ProjectKey } from './api';

// A pending request identity is kept in memory for the current page so an
// interrupted mutation can be retried with the same Idempotency-Key and the
// original input. The browser-storage copy below is only a disposable
// navigation hint: its absence, deletion or corruption must never gate key
// creation or rotation, and no secret is ever stored.
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

export function keyMutationHintKey(actor: string, workspace: string) {
  return prefix + encodeURIComponent(actor) + ':' + encodeURIComponent(workspace);
}

function hintCache(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

function validPending(value: unknown): value is PendingKeyMutation {
  if (!value || typeof value !== 'object') return false;
  const pending = value as Partial<PendingKeyMutation>;
  return pending.version === 1 && typeof pending.requestId === 'string' && uuid.test(pending.requestId)
    && typeof pending.label === 'string'
    && (pending.action === 'create' || pending.action === 'rotate')
    && (pending.action !== 'rotate' || typeof pending.keyId === 'string')
    && (pending.action !== 'create' || Boolean(pending.body && typeof pending.body === 'object' && !Array.isArray(pending.body)));
}

/**
 * Read the disposable recovery hint. Unavailable or corrupt browser storage is
 * treated as no hint so key administration always remains usable.
 */
export function readKeyMutationHint(key: string): PendingKeyMutation | null {
  const cache = hintCache();
  if (!cache) return null;
  try {
    const raw = cache.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return validPending(value) ? value : null;
  } catch { return null; }
}

/** Persist a hint when possible. Failure is ignored and never blocks a request. */
export function rememberKeyMutationHint(key: string, pending: PendingKeyMutation) {
  const cache = hintCache();
  if (!cache) return;
  try { cache.setItem(key, JSON.stringify(pending)); } catch { /* disposable */ }
}

/** Remove only the matching hint so a newer request is not discarded. */
export function forgetKeyMutationHint(key: string, requestId?: string) {
  const cache = hintCache();
  if (!cache) return;
  try {
    if (requestId === undefined) { cache.removeItem(key); return; }
    const raw = cache.getItem(key);
    if (raw === null) return;
    const value: unknown = JSON.parse(raw);
    if (validPending(value) && value.requestId === requestId) cache.removeItem(key);
  } catch { /* disposable */ }
}

function projectKey(value: unknown): value is ProjectKey {
  if (!value || typeof value !== 'object') return false;
  const key = value as Partial<ProjectKey>;
  return typeof key.id === 'string' && typeof key.name === 'string'
    && Array.isArray(key.allowed_models) && key.allowed_models.every(model => typeof model === 'string')
    && typeof key.revoked === 'boolean' && typeof key.expired === 'boolean';
}

export function confirmedKeyValidationFailure(error: unknown) {
  if (!(error instanceof KeyRequestError)) return false;
  // This structured response is emitted by the readiness middleware before it
  // dispatches to a key mutation handler. Generic 503s remain ambiguous.
  if (error.status === 503 && error.errorType === 'payment_setup_required'
      && ['currency_required', 'payment_setup_required', 'readiness_unavailable'].includes(error.code ?? '')) return true;
  // Authentication, conflict, transport, parsing and other server errors retain
  // recovery identity. They must not silently authorize a fresh mutation.
  return [400, 422].includes(error.status);
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
