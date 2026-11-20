import type { VideoJobBilling, VideoTransportTimings } from '@niu-io/sdk';
import type { GenerationTask, NiuAdminClient, TenantScope } from '@niu-io/sdk/admin';
import type { VideoGenerationsSession } from '@niu-io/sdk/generations-sessions';
import { buildCacheKey, fetchQuery, invalidateQueries, isQueryFresh, primeQuery } from '@/lib/query-cache';

export const VIDEO_FRESH_MS = 30_000;
export const VIDEO_MODELS_FRESH_MS = 60_000;
export const VIDEO_DIAGNOSTICS_FRESH_MS = 60_000;

export type VideoTaskDiagnostics = {
  billing: VideoJobBilling;
  timings: VideoTransportTimings;
};

export function videoSessionCacheKey(workspaceId: string, sessionIdOrRef: string): string {
  return `/api/v1/workspaces/${workspaceId}/sessions/${sessionIdOrRef}`;
}

export function primeVideoSession(token: string, workspaceId: string, session: VideoGenerationsSession): void {
  if (!token || !workspaceId) return;
  primeQuery(token, videoSessionCacheKey(workspaceId, session.id), session, { persist: true });
  if (session.reference) {
    primeQuery(token, videoSessionCacheKey(workspaceId, session.reference), session, { persist: true });
  }
}

function invalidateScopedKeys(token: string, keys: string[]): void {
  if (!token || !keys.length) return;
  const targets = new Set(keys.map(key => buildCacheKey(token, key)));
  invalidateQueries(fullKey => targets.has(fullKey));
}

export function invalidateVideoSession(token: string, workspaceId: string, sessionId: string, reference?: string): void {
  if (!workspaceId) return;
  const keys = [videoSessionCacheKey(workspaceId, sessionId)];
  if (reference && reference !== sessionId) keys.push(videoSessionCacheKey(workspaceId, reference));
  invalidateScopedKeys(token, keys);
}

export function videoTaskCacheKey(workspaceId: string, taskIdOrRef: string): string {
  return `/api/v1/workspaces/${workspaceId}/tasks/${taskIdOrRef}`;
}

export function isTerminalVideoState(state?: string): boolean {
  return state === 'succeeded' || state === 'failed';
}

export function primeVideoTask(token: string, workspaceId: string, task: GenerationTask): void {
  if (!token || !workspaceId) return;
  primeQuery(token, videoTaskCacheKey(workspaceId, task.id), task, { persist: true });
  if (task.reference) {
    primeQuery(token, videoTaskCacheKey(workspaceId, task.reference), task, { persist: true });
  }
}

export function invalidateVideoTask(token: string, workspaceId: string, taskId: string, reference?: string): void {
  if (!workspaceId) return;
  const keys = [videoTaskCacheKey(workspaceId, taskId)];
  if (reference && reference !== taskId) keys.push(videoTaskCacheKey(workspaceId, reference));
  invalidateScopedKeys(token, keys);
}

export function videoDiagnosticsCacheKey(workspaceId: string, taskId: string): string {
  return `/api/v1/workspaces/${workspaceId}/tasks/${taskId}/diagnostics`;
}

export function primeVideoDiagnostics(token: string, workspaceId: string, taskId: string, value: VideoTaskDiagnostics): void {
  if (!token || !workspaceId || !taskId) return;
  primeQuery(token, videoDiagnosticsCacheKey(workspaceId, taskId), value, { persist: true });
}

export function videoModelsCacheKey(keyId: string): string {
  return `/v1/video/models?key=${encodeURIComponent(keyId)}`;
}

export function taskMediaCacheKey(scope: TenantScope, taskId: string, kind: 'video' | 'last_frame'): string {
  return `task:${scope.organizationId}:${scope.projectId}:${taskId}:${kind}`;
}

export function assetMediaCacheKey(scope: TenantScope, assetId: string): string {
  return `asset:${scope.organizationId}:${scope.projectId}:${assetId}`;
}

export function prefetchVideoSession(
  token: string,
  client: NiuAdminClient,
  scope: TenantScope,
  sessionIdOrRef: string,
): void {
  if (!token || !scope.projectId || !sessionIdOrRef) return;
  const key = videoSessionCacheKey(scope.projectId, sessionIdOrRef);
  if (isQueryFresh(token, key, VIDEO_FRESH_MS)) return;
  void fetchQuery<VideoGenerationsSession>(
    token,
    key,
    async signal => {
      const { data } = await client.generations(scope).sessions.retrieve(sessionIdOrRef, { signal });
      if (data.id !== sessionIdOrRef && data.reference !== sessionIdOrRef) {
        throw new Error('Unexpected Video session');
      }
      return data;
    },
    { freshMs: VIDEO_FRESH_MS, persist: true, background: true },
  )
    .then(session => {
      primeVideoSession(token, scope.projectId, session);
    })
    .catch(() => {
      /* Speculative prefetch errors are ignored; active views surface real errors. */
    });
}
