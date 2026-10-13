import type { RequestOptions, VideoJobBilling, VideoTransportTimings } from './index.js';

/** Persisted customer evidence; no current inference authority or Provider call. */
export type GenerationTaskDiagnostics = {
  billing: VideoJobBilling;
  timings: VideoTransportTimings;
};
export type GenerationTaskDiagnosticsSender = <T>(path: string, body: undefined, options?: RequestOptions) => Promise<T>;
export function createGenerationTaskDiagnosticsClient(send: GenerationTaskDiagnosticsSender, organization: string, workspace: string) {
  const ref = (value: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw new TypeError('A canonical Niu reference is required');
    return value;
  };
  const root = `/organizations/${ref(organization)}/projects/${ref(workspace)}/generations/tasks`;
  return {
    /** Workspace Read and actor privacy apply even after original-key expiry. */
    retrieve: (task: string, options?: RequestOptions) => send<GenerationTaskDiagnostics>(`${root}/${ref(task)}/diagnostics`, undefined, options),
  };
}
