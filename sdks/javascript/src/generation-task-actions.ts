import type { RequestOptions, VideoJobState } from './index.js';
import type { GenerationArtifactKind } from './generations-inventory.js';

/** Explicit current-authority actions on an existing task, never generation. */
export type GenerationTaskActionSender = <T>(path: string, method: 'POST', body: undefined, options?: RequestOptions) => Promise<T>;
export type GenerationTaskActionBinarySender = (path: string, method: 'POST', body: undefined, options?: RequestOptions) => Promise<Response>;
export type GenerationTaskActionsClient = ReturnType<typeof createGenerationTaskActionsClient>;

function reference(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    throw new TypeError('A canonical Niu workspace or task reference is required');
  }
  return value;
}

/**
 * The server resolves the task's original key, model and Provider/channel.
 * Expired/revoked original authority is refused; no substitute key or model is
 * selected. Saved history and cached output use the separate inventory client.
 */
export function createGenerationTaskActionsClient(
  send: GenerationTaskActionSender,
  binary: GenerationTaskActionBinarySender,
  organization: string,
  workspace: string,
) {
  const root = `/organizations/${reference(organization)}/projects/${reference(workspace)}/generations/tasks`;
  const taskPath = (task: string) => `${root}/${reference(task)}`;
  return {
    /** One explicit status query using the original binding; no submission retry. */
    refresh: (task: string, options?: RequestOptions) => send<VideoJobState>(`${taskPath(task)}/refresh`, 'POST', undefined, options),
    /**
     * Query an existing task and deliver its current result bytes once.
     * Separate from cached artifact content; cached tombstones remain unchanged.
     * Failures propagate and never trigger generation or alternate-account retry.
     */
    refreshResult(task: string, kind: GenerationArtifactKind, options?: RequestOptions): Promise<Response> {
      if (kind !== 'video' && kind !== 'last_frame') throw new TypeError('A video result kind is required');
      return binary(`${taskPath(task)}/results/${kind}/refresh`, 'POST', undefined, options);
    },
  };
}
