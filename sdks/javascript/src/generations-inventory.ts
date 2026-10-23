import type { RequestOptions } from './index.js';
import type { GenerationArtifactCapture } from './generation-artifact-capture.js';
/** Saved state, not inference authority or an automatic polling contract. */
export type GenerationTaskState = 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'submission_unknown' | 'reconciliation_required';
export type GenerationArtifactAvailability = 'available' | 'expired' | 'deleted' | 'unavailable';
export type GenerationArtifactKind = 'video' | 'last_frame';
/** Original dispatch facts, never inferred from current Provider configuration.
 * Provider identifies the saved adapter, not a mutable Provider/account name.
 * Parameters contain only retained validated scalar controls; references and
 * prompts remain in actor-private retained session/intent content, when present.
 */
export type GenerationExecutionContext = {
  submitted_model: string;
  dispatched_model: string | null;
  provider: string | null;
  channel: string | null;
  dispatched_at: string;
  source: 'saved_execution';
  parameters: {
    duration?: number; seed?: number; frames_per_second?: number;
    watermark?: boolean; camera_fixed?: boolean; return_last_frame?: boolean;
    resolution?: string; ratio?: string; omni_reference_task_type?: string;
  } | null;
  parameters_source: 'saved_validated_snapshot' | 'unknown';
  references_state: 'not_in_execution_snapshot';
};
export type GenerationTask = {
  id: string; reference?: string; kind: 'video'; model: string; model_display_name: string | null;
  /** Existing display metadata may reflect today's catalog, never historical dispatch. */
  model_display_name_source: 'current_catalog' | 'unknown';
  execution_context: GenerationExecutionContext;
  created_at: string; updated_at: string; state: GenerationTaskState;
  source: 'api' | 'generations' | 'unknown'; session_id: string | null; turn_id: string | null;
  artifacts: Array<{ kind: GenerationArtifactKind; availability: GenerationArtifactAvailability; capture: GenerationArtifactCapture | null }>;
};
/** Provider reference availability and the retained library copy remain independent.
 * Content type is known only from the captured, validated library metadata. */
export type GenerationArtifact = {
  task_id: string; kind: GenerationArtifactKind; name: string; created_at: string;
  content_type: string | null; availability: GenerationArtifactAvailability;
  capture: GenerationArtifactCapture | null;
  session_id: string | null; turn_id: string | null; workspace_id: string;
};
export type GenerationInventoryPage<T> = {
  data: T[]; next_cursor: string | null; has_more: boolean;
  supported_kinds: ['video']; complete: true;
};
export type GenerationInventoryQuery = {
  kind?: 'video'; state?: GenerationTaskState; session_id?: string; cursor?: string; limit?: number;
};
export type GenerationInventorySender = <T>(path: string, method: 'GET', body: undefined, options?: RequestOptions) => Promise<T>;
export type GenerationInventoryBinarySender = (path: string, options?: RequestOptions) => Promise<Response>;
function ref(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw new TypeError('A canonical Niu reference is required');
  return value;
}
function taskReference(value:string):string { return /^run-[1-9][0-9]{0,18}$/.test(value) ? value : ref(value); }
function query(input: GenerationInventoryQuery = {}): string {
  const params = new URLSearchParams();
  if (input.kind !== undefined) params.set('kind', input.kind);
  if (input.state !== undefined) params.set('state', input.state);
  if (input.session_id !== undefined) params.set('session_id', ref(input.session_id));
  if (input.cursor !== undefined) params.set('cursor', input.cursor);
  if (input.limit !== undefined) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new RangeError('limit must be between 1 and 100');
    params.set('limit', String(input.limit));
  }
  return params.size ? `?${params}` : '';
}
/** Workspace session reads across saved keys, including expired or revoked keys.
 * No method dispatches, refreshes, retries or recreates a task.
 */
export function createGenerationsInventoryClient(send: GenerationInventorySender, binary: GenerationInventoryBinarySender) {
  const base = (workspace: string) => `/workspaces/${ref(workspace)}`;
  const output = (workspace: string, task: string, kind: GenerationArtifactKind) => {
    if (kind !== 'video' && kind !== 'last_frame') throw new TypeError('Invalid artifact kind');
    return `${base(workspace)}/artifacts/${ref(task)}/${kind}`;
  };
  return {
    tasks: {
      list: (workspace: string, input?: GenerationInventoryQuery, options?: RequestOptions) => send<GenerationInventoryPage<GenerationTask>>(`${base(workspace)}/tasks${query(input)}`, 'GET', undefined, options),
      retrieve: (workspace: string, task: string, options?: RequestOptions) => send<{ data: GenerationTask }>(`${base(workspace)}/tasks/${taskReference(task)}`, 'GET', undefined, options),
    },
    artifacts: {
      list: (workspace: string, input?: GenerationInventoryQuery, options?: RequestOptions) => send<GenerationInventoryPage<GenerationArtifact>>(`${base(workspace)}/artifacts${query(input)}`, 'GET', undefined, options),
      retrieve: (workspace: string, task: string, kind: GenerationArtifactKind, options?: RequestOptions) => send<{ data: GenerationArtifact }>(output(workspace, task, kind), 'GET', undefined, options),
      content: (workspace: string, task: string, kind: GenerationArtifactKind, options?: RequestOptions) => binary(`${output(workspace, task, kind)}/content`, options),
    },
  };
}
