import type { RequestOptions } from './index.js';
import type { GenerationArtifactKind } from './generations-inventory.js';

/** Bounded byte capture into the workspace library, not Provider ingestion. */
export type GenerationArtifactCaptureFailureCode =
  | 'delivery_failed'
  | 'authorization_changed'
  | 'invalid_media'
  | 'capacity_exceeded'
  | 'storage_unavailable'
  | 'encryption_unavailable';
export type GenerationArtifactCapture = {
  id: string;
  task_id: string;
  kind: GenerationArtifactKind;
  status: 'preparing' | 'stored' | 'failed';
  /** Present only after successful storage; deletion preserves this saved reference. */
  asset_id: string | null;
  availability: 'retained' | 'deleted' | 'not_stored';
  failure_code: GenerationArtifactCaptureFailureCode | null;
  created_at: string;
  updated_at: string;
};
export type GenerationArtifactCaptureInput = {
  /** Canonical nonnil UUID retained for explicit retries of this request. */
  id: string;
  /** Trimmed, nonblank name: at most 200 UTF-8 bytes without control characters. */
  name: string;
} & (
  | { mode: 'cached'; key_id?: never }
  | {
    mode: 'fresh';
    /** Optional current workspace inference authority, never a replacement upstream binding. */
    key_id?: string;
  }
);
export type GenerationArtifactCaptureSender = <T>(
  path: string,
  method: 'GET' | 'POST',
  body: GenerationArtifactCaptureInput | undefined,
  options?: RequestOptions,
) => Promise<T>;
export type GenerationArtifactCaptureClient = ReturnType<typeof createGenerationArtifactCaptureClient>;

function reference(value: string): string {
  if (typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
    || value === '00000000-0000-0000-0000-000000000000') {
    throw new TypeError('A canonical nonnil Niu reference is required');
  }
  return value;
}

/**
 * Saved capture reads have no side effects. An explicit POST copies inspected
 * source bytes into the existing encrypted workspace library (8 MiB per item,
 * subject to quotas). The server deduplicates by task/output; a stored replay
 * returns the original capture identity without fetching bytes again.
 *
 * Failed or expired-lease retries require another explicit POST of the original
 * request. Non-2xx failures propagate; use captureStatus to read the saved safe
 * failure separately. No method generates, automatically retries, rewrites
 * output tombstones, ingests Provider references or grants generation readiness.
 */
export function createGenerationArtifactCaptureClient(
  send: GenerationArtifactCaptureSender,
  organization: string,
  workspace: string,
) {
  const root = `/organizations/${reference(organization)}/projects/${reference(workspace)}/generations/artifacts`;
  const path = (task: string, kind: GenerationArtifactKind) => {
    if (kind !== 'video' && kind !== 'last_frame') throw new TypeError('A video output kind is required');
    return `${root}/${reference(task)}/${kind}/capture`;
  };
  return {
    /** Read the persisted capture state only, independently of signed output URLs. */
    captureStatus(task: string, kind: GenerationArtifactKind, options?: RequestOptions): Promise<{ data: GenerationArtifactCapture }> {
      return send(path(task, kind), 'GET', undefined, options);
    },
    /** Explicit cached/fresh delivery and storage; never submits a generation. */
    capture(task: string, kind: GenerationArtifactKind, input: GenerationArtifactCaptureInput, options?: RequestOptions): Promise<{ data: GenerationArtifactCapture }> {
      if (!input || typeof input !== 'object') throw new TypeError('A capture request is required');
      const captureId = reference(input.id);
      if (typeof input.name !== 'string' || !input.name || input.name !== input.name.trim()
        || new TextEncoder().encode(input.name).byteLength > 200
        || /[\p{Cc}]/u.test(input.name)) {
        throw new TypeError('name must be trimmed, nonblank and at most 200 UTF-8 bytes without control characters');
      }
      if (input.mode !== 'cached' && input.mode !== 'fresh') throw new TypeError('Capture mode must be cached or fresh');
      if (input.mode === 'cached' && input.key_id !== undefined) throw new TypeError('key_id is available only for fresh capture');
      const body: GenerationArtifactCaptureInput = input.mode === 'cached'
        ? { id: captureId, name: input.name, mode: 'cached' }
        : {
          id: captureId, name: input.name, mode: 'fresh',
          ...(input.key_id === undefined ? {} : { key_id: reference(input.key_id) }),
        };
      // Fresh mode authorizes an existing task query. The server preserves its
      // original model/account/channel; an omitted key uses original authority.
      return send(path(task, kind), 'POST', body, options);
    },
  };
}
