import type { NiuAdminClient, TenantScope } from '@niu-io/sdk/admin';
import { readableTurnAnchor } from './session-turn';

/**
 * Resolve an old intent/job result link to the readable saved Video session and
 * turn that own it. Missing, foreign or unbound records return null so callers
 * keep the legacy surface instead of guessing a session.
 */
export async function resolveLegacyVideoLink(
  client: NiuAdminClient,
  scope: TenantScope,
  input: {intent?: string; job?: string},
  options: {signal?: AbortSignal} = {},
): Promise<string | null> {
  const {intent, job} = input;
  let sessionId: string | null = null;
  let turnId: string | null = null;
  if (intent) {
    try {
      const {data} = await client.getVideoIntent(scope, intent, options);
      sessionId = data.session_binding?.session_id ?? null;
      turnId = data.session_binding?.turn_id ?? null;
    } catch {
      options.signal?.throwIfAborted();
    }
  }
  if (!sessionId && job) {
    try {
      const {data} = await client.generations(scope).tasks.retrieve(job, options);
      sessionId = data.session_id;
      turnId = data.turn_id;
    } catch {
      options.signal?.throwIfAborted();
      return null;
    }
  }
  if (!sessionId) return null;
  try {
    const {data:session} = await client.generations(scope).sessions.retrieve(sessionId, options);
    if (session.category !== 'video' || !session.reference || !/^video-[1-9][0-9]{0,18}$/.test(session.reference)) return null;
    const turn = turnId ? session.turns.find(item => item.id === turnId) : undefined;
    const anchor = turn ? readableTurnAnchor(turn) : '';
    return `/generations/${encodeURIComponent(session.reference)}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`;
  } catch {
    options.signal?.throwIfAborted();
    return null;
  }
}
