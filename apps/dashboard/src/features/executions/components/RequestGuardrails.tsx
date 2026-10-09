import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { request } from '@/features/vendors/api';

type Inspection = { outcome: string; reason?: string; elapsed_ms: number };
type Decision = {
  stage: string; outcome: string; coverage: string;
  workspace_policy_name: string | null; workspace_revision: number | null;
  key_policy_name: string | null; key_policy_revision: number | null;
  input_inspection: Inspection | null; output_inspection: Inspection | null; output_observation?: (Inspection & { mode: "observe_only"; enforcement: false }) | null;
};
const outcomes: Record<string, string> = { allowed: 'Allowed', redacted: 'Redacted', blocked: 'Blocked', indeterminate: 'Inspection incomplete', clear: 'No match observed', matched: 'Match observed' };
const reasons: Record<string, string> = { pattern_match: 'Response unchanged', pattern_denial: 'Matched a blocking rule', unsupported_content: 'Unsupported content', resource_limit: 'Inspection limit exceeded', inspection_unavailable: 'Inspection unavailable' };
const label = (inspection: Inspection | null) => inspection ? `${outcomes[inspection.outcome] || 'Outcome unavailable'}${inspection.reason && reasons[inspection.reason] ? ` · ${reasons[inspection.reason]}` : ''}` : 'No inspection result recorded';
const policy = (name: string | null, revision: number | null) => revision ? `${name || 'Saved policy'} · Version ${revision}` : 'None recorded';

export default function RequestGuardrails({ token, endpoint, historyPath }: { token: string; endpoint: string; historyPath: string }) {
  const [data, setData] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setLoading(true); setError('');
    void request<{ data: Decision | null }>(token, endpoint, 'GET', undefined, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (!Object.hasOwn(result, 'data') || (result.data !== null && (result.data.stage !== 'dispatch' || result.data.outcome !== 'allowed' || result.data.coverage !== 'model_provider_access'))) throw new Error('Invalid Guardrails decision response.');
        if (result.data?.output_observation && (result.data.output_observation.mode !== 'observe_only' || result.data.output_observation.enforcement !== false || !['clear', 'matched', 'indeterminate'].includes(result.data.output_observation.outcome))) throw new Error('Invalid output observation response.');
        setData(result.data);
      })
      .catch(() => { if (!controller.signal.aborted) setError('Could not load the Guardrails decision.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, endpoint, reload]);
  const hasPolicy = Boolean(data?.workspace_revision || data?.key_policy_revision);
  if (!loading && !error && (!data || (!hasPolicy && !data.input_inspection && !data.output_inspection && !data.output_observation))) return null;
  return <section className="gateway-request-detail" aria-label="Guardrails decision">
    <h3 className="mb-3 text-sm font-medium">Guardrails</h3>
    {loading ? <p role="status">Loading Guardrails…</p> : error ? <p role="alert">{error} <Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>Reload decision</Button></p> : data && <>
      <dl><div><dt>Model &amp; Provider access</dt><dd>Allowed at dispatch</dd></div>{data.workspace_revision && <div><dt>Workspace policy</dt><dd>{policy(data.workspace_policy_name, data.workspace_revision)}</dd></div>}{data.key_policy_revision && <div><dt>Key policy</dt><dd>{policy(data.key_policy_name, data.key_policy_revision)}</dd></div>}{data.input_inspection && <div><dt>Input inspection</dt><dd>{label(data.input_inspection)}</dd></div>}{data.output_inspection && <div><dt>Output inspection</dt><dd>{label(data.output_inspection)}</dd></div>}{data.output_observation && <div><dt>Output observation</dt><dd>{label(data.output_observation)} · Non-enforcing</dd></div>}</dl>
      {data.output_inspection && ['blocked', 'indeterminate'].includes(data.output_inspection.outcome) && <p className="text-sm text-muted-foreground">The output was withheld. Provider usage and any incurred customer charge remain accounted for.</p>}
      {hasPolicy && <Button asChild variant="link" className="px-0"><Link to={historyPath}>Inspect saved policy versions</Link></Button>}
    </>}
  </section>;
}
