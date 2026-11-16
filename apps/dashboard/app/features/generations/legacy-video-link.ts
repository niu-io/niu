import type { GenerationTask, NiuAdminClient, TenantScope } from '@niu-io/sdk/admin';
import type { VideoGenerationsSession } from '@niu-io/sdk/generations-sessions';
import { isQueryFresh, peekQuery } from '@/lib/query-cache';
import { readableTurnAnchor } from './session-turn';
import {
  VIDEO_FRESH_MS,
  primeVideoSession,
  primeVideoTask,
  videoSessionCacheKey,
  videoTaskCacheKey,
} from './video-cache';

/**
 * Resolve an old intent/job result link to the readable saved Video session and
 * turn that own it. Missing, foreign or unbound records return null so callers
 * keep the legacy surface instead of guessing a session.
 */
export async function resolveLegacyVideoLink(
  client: NiuAdminClient,
  scope: TenantScope,
  input: {intent?: string; job?: string},
  options: {signal?: AbortSignal; token?: string} = {},
): Promise<string | null> {
  const {intent, job} = input;
  const token = options.token ?? '';
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
    const taskKey = token ? videoTaskCacheKey(scope.projectId, job) : '';
    const cachedTask = token && taskKey && isQueryFresh(token, taskKey, VIDEO_FRESH_MS)
      ? peekQuery<GenerationTask>(token, taskKey, {persist: true})
      : undefined;
    if (cachedTask) {
      sessionId = cachedTask.session_id;
      turnId = cachedTask.turn_id;
    } else {
      try {
        const {data} = await client.generations(scope).tasks.retrieve(job, options);
        if (token) primeVideoTask(token, scope.projectId, data);
        sessionId = data.session_id;
        turnId = data.turn_id;
      } catch {
        options.signal?.throwIfAborted();
        return null;
      }
    }
  }
  if (!sessionId) return null;
  try {
    const sessionKey = token ? videoSessionCacheKey(scope.projectId, sessionId) : '';
    const cachedSession = token && sessionKey && isQueryFresh(token, sessionKey, VIDEO_FRESH_MS)
      ? peekQuery<VideoGenerationsSession>(token, sessionKey, {persist: true})
      : undefined;
    const session = cachedSession ?? (await client.generations(scope).sessions.retrieve(sessionId, options)).data;
    if (!cachedSession && token) primeVideoSession(token, scope.projectId, session);
    if (session.category !== 'video' || !session.reference || !/^video-[1-9][0-9]{0,18}$/.test(session.reference)) return null;
    const turn = turnId ? session.turns.find(item => item.id === turnId) : undefined;
    const anchor = turn ? readableTurnAnchor(turn) : '';
    return `/generations/${encodeURIComponent(session.reference)}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`;
  } catch {
    options.signal?.throwIfAborted();
    return null;
  }
}
