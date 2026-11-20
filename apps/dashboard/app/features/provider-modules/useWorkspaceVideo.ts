import type { DashboardContext } from '@/shell/dashboard-context';
import { cachedKeyGet, keyRequest, workspaceKeyPath, type ProjectKey } from '@/features/keys/api';
import { useCachedQuery } from '@/lib/query-cache';

/** Discover usable video models with workspace/key authorization, cached per session+workspace so sidebar items never pop on navigation. */
export function useWorkspaceVideo(
  context: DashboardContext,
  preferredKeyId?: string,
  knownActiveKeys?: ReadonlyArray<{ id: string; slug?: string }> | null,
) {
  const workspace = context.workspace;
  const keySignature =
    knownActiveKeys === undefined
      ? 'fetch'
      : knownActiveKeys === null
        ? null
        : knownActiveKeys.map(key => `${key.id}:${key.slug ?? ''}`).join(',');
  const cacheKey =
    context.token && workspace && keySignature !== null
      ? `workspace-video:${workspace.organization_id}:${workspace.id}:${preferredKeyId || 'any'}:${keySignature}`
      : null;

  const { data } = useCachedQuery<string | null>(
    context.token,
    cacheKey,
    async signal => {
      if (!workspace || !context.token) return null;
      let activeKeys: ReadonlyArray<{ id: string; slug?: string }>;
      if (knownActiveKeys !== undefined) {
        activeKeys = knownActiveKeys ?? [];
      } else {
        const base = workspaceKeyPath(workspace.id);
        const keys = await cachedKeyGet<{ data: ProjectKey[] }>(context.token, base, { signal });
        activeKeys = keys.data.filter(key => !key.revoked && !key.expired);
      }
      if (!activeKeys.length) return null;
      const preferred = preferredKeyId ? activeKeys.find(key => key.id === preferredKeyId) : undefined;
      if (preferred && !signal.aborted) {
        try {
          const page = await keyRequest<{ data: unknown[] }>(
            context.token,
            '/v1/video/models',
            'GET',
            undefined,
            signal,
            { 'x-niu-key-id': preferred.id },
          );
          if (page.data.length) return preferred.slug || preferred.id;
        } catch {
          /* Failed discovery on the preferred key falls back to other active workspace keys. */
        }
      }
      const queue = activeKeys.filter(key => key.id !== preferred?.id);
      let found: string | null = null;
      await Promise.all(
        Array.from({ length: Math.min(4, queue.length) }, async () => {
          while (queue.length && !found && !signal.aborted) {
            const key = queue.shift()!;
            try {
              const page = await keyRequest<{ data: unknown[] }>(
                context.token,
                '/v1/video/models',
                'GET',
                undefined,
                signal,
                { 'x-niu-key-id': key.id },
              );
              if (page.data.length) found = key.slug || key.id;
            } catch {
              /* Failed discovery does not advertise a capability. */
            }
          }
        }),
      );
      return found;
    },
    { enabled: Boolean(cacheKey), keepPreviousData: false, freshMs: 60_000 },
  );

  return data ?? null;
}
