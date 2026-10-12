import type { RequestOptions } from './index.js';
import type { MediaAssetSender, MediaAssetMutationOptions } from './media-assets.js';

/** Niu session identity; the upstream verification token remains private. */
export type MediaVerificationSession = {
  id: string; model: string; subject_name: string | null;
  status: 'prepared' | 'unknown' | 'not_sent' | 'waiting_user' | 'processing' | 'verified' | 'failed' | 'expired';
  group_id: string | null; expires_at: string | null;
  created_at_ms: number; updated_at_ms: number;
};
export type MediaVerificationInput = { model: string; subjectName?: string; returnUrl?: string };
export type MediaVerificationLink = { verification_url: string; expires_at: string | null };

/** Explicit upstream human verification; no local liveness or automatic retry. */
export function createMediaVerificationClient(
  send: MediaAssetSender,
  reference: (id: string) => string,
  query: (input: { model: string; after?: string; limit?: number }) => string,
) {
  const path = '/media/verification-sessions';
  return {
    create: (input: MediaVerificationInput, options?: MediaAssetMutationOptions) => send<{ data: MediaVerificationSession }>(path, 'POST', {
      model: input.model,
      ...(input.subjectName === undefined ? {} : { subject_name: input.subjectName }),
      ...(input.returnUrl === undefined ? {} : { return_url: input.returnUrl }),
    }, options),
    list: (input: { model: string; after?: string; limit?: number }, options?: RequestOptions) => send<{ data: MediaVerificationSession[]; next_cursor: string | null }>(`${path}${query(input)}`, 'GET', undefined, options),
    retrieve: (id: string, model: string, options?: RequestOptions) => send<{ data: MediaVerificationSession }>(`${path}/${reference(id)}${query({ model })}`, 'GET', undefined, options),
    /** Deliberate authenticated handoff; callers must keep this URL private. */
    link: (id: string, model: string, options?: RequestOptions) => send<MediaVerificationLink>(`${path}/${reference(id)}/link${query({ model })}`, 'GET', undefined, options),
    /** One explicit observation; never automatically repeats a pending call. */
    refresh: (id: string, model: string, options?: RequestOptions) => send<{ data: MediaVerificationSession }>(`${path}/${reference(id)}/refresh${query({ model })}`, 'POST', undefined, options),
  };
}
