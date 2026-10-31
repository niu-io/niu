import type { DashboardContext } from '@/shell/dashboard-context';
import { cachedKeyGet, keyRequest, workspaceKeyPath, type ProjectKey } from '@/features/keys/api';
import { useCachedQuery } from '@/lib/query-cache';

/** Discover usable video models with workspace/key authorization, cached per session+workspace so sidebar items never pop on navigation. */
export function useWorkspaceVideo(context: DashboardContext) {
  const workspace = context.workspace;
  const cacheKey =
    context.token && workspace
      ? `workspace-video:${workspace.organization_id}:${workspace.id}`
      : null;

  const { data } = useCachedQuery<boolean>(
    context.token,
    cacheKey,
    async signal => {
      if (!workspace || !context.token) return false;
      const base = workspaceKeyPath(workspace.id);
      const keys = await cachedKeyGet<{ data: ProjectKey[] }>(context.token, base, { signal });
      const queue = [...keys.data.filter(key => !key.revoked && !key.expired)];
      let found = false;
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
              if (page.data.length) found = true;
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

  return Boolean(data);
}
