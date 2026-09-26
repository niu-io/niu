import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, RefreshCw, Coins, Timer, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { money } from '@/lib/money';

type Named = { id: string; name: string };
type GatewayRequest = {
  attempt_id: string;
  operation_id: string;
  task_id: string | null;
  model: string;
  created_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  execution: string;
  usage_confidence: string;
  prompt_tokens: string | null;
  completion_tokens: string | null;
  currency: string | null;
  cash_nanos: string | null;
  api_equivalent_nanos: string | null;
};

async function get<T>(path: string, token: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Could not load gateway activity (${response.status}).`);
  return await response.json() as T;
}

function amount(values: GatewayRequest[], key: 'cash_nanos' | 'api_equivalent_nanos') {
  const totals = new Map<string, bigint>();
  let unknown = 0;
  for (const item of values) {
    if (!item.currency || item[key] == null) { unknown += 1; continue; }
    totals.set(item.currency, (totals.get(item.currency) ?? 0n) + BigInt(item[key]!));
  }
  return { totals: [...totals].map(([currency, nanos]) => money(nanos.toString(), currency)), unknown };
}

function totalTokens(values: GatewayRequest[]) {
  let total = 0n;
  let known = 0;
  for (const item of values) {
    if (item.prompt_tokens != null && item.completion_tokens != null) {
      total += BigInt(item.prompt_tokens) + BigInt(item.completion_tokens);
      known += 1;
    }
  }
  return { total: total.toLocaleString(), known };
}

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function groupRequests(requests: GatewayRequest[]) {
  const groups = new Map<string, GatewayRequest[]>();
  for (const request of requests) {
    const key = request.task_id ? `task:${request.task_id}` : `request:${request.operation_id}`;
    groups.set(key, [...(groups.get(key) ?? []), request]);
  }
  return [...groups].map(([key, items]) => ({
    key,
    taskId: items[0].task_id,
    requests: items,
    tokens: totalTokens(items),
    costs: amount(items, 'cash_nanos'),
    workMs: items.reduce((total, item) => total + (item.duration_ms ?? 0), 0),
  }));
}

export default function GatewayActivity({ token, models, initialScope }: { token: string; models: string[]; initialScope?: { organizationId: string; projectId: string } | null }) {
  const [organizations, setOrganizations] = useState<Named[]>([]);
  const [projects, setProjects] = useState<Named[]>([]);
  const [organization, setOrganization] = useState(initialScope?.organizationId ?? '');
  const [project, setProject] = useState(initialScope?.projectId ?? '');
  const [requests, setRequests] = useState<GatewayRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void get<{ data: Named[] }>('/admin/v1/organizations', token, controller.signal)
      .then(({ data }) => {
        setOrganizations(data);
        if (!organization && data.length) setOrganization(data.find(item => item.id === initialScope?.organizationId)?.id ?? data[0].id);
      })
      .catch(reason => { if (!controller.signal.aborted) setError((reason as Error).message); });
    return () => controller.abort();
  }, [token, initialScope?.organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    setProjects([]);
    setRequests([]);
    if (!organization) return () => controller.abort();
    void get<{ data: Named[] }>(`/admin/v1/organizations/${organization}/projects`, token, controller.signal)
      .then(({ data }) => {
        setProjects(data);
        if (!project || !data.some(item => item.id === project)) {
          const preferred = organization === initialScope?.organizationId ? initialScope.projectId : undefined;
          setProject(data.find(item => item.id === preferred)?.id ?? data[0]?.id ?? '');
        }
      })
      .catch(reason => { if (!controller.signal.aborted) setError((reason as Error).message); });
    return () => controller.abort();
  }, [token, organization, initialScope?.organizationId, initialScope?.projectId]);

  useEffect(() => {
    const controller = new AbortController();
    setRequests([]);
    setError('');
    if (!organization || !project) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    void get<{ data: GatewayRequest[] }>(`/admin/v1/organizations/${organization}/projects/${project}/requests?limit=100`, token, controller.signal)
      .then(value => { if (!controller.signal.aborted) setRequests(value.data); })
      .catch(reason => { if (!controller.signal.aborted) setError((reason as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, organization, project, revision]);

  const groups = useMemo(() => groupRequests(requests), [requests]);
  const tokenSummary = totalTokens(requests);
  const settled = amount(requests, 'cash_nanos');
  const timed = requests.filter(item => item.duration_ms != null);
  const averageMs = timed.length ? Math.round(timed.reduce((sum, item) => sum + item.duration_ms!, 0) / timed.length) : null;

  return <>
    <div className="page-heading gateway-activity-heading">
      <div><p className="eyebrow">AUTOMATIC GATEWAY CAPTURE</p><h1>Tasks</h1><p className="page-subtitle">Every model request through Niu is retained and measured. Group an agent’s requests by task to see how retries and model choices affect total spend and time.</p></div>
      <Button variant="outline" disabled={!project || loading} onClick={() => setRevision(value => value + 1)}><RefreshCw />Refresh</Button>
    </div>

    <section className="execution-scope panel gateway-activity-scope">
      <div className="key-scope-grid">
        <Label htmlFor="activity-organization">Organization<NativeSelect id="activity-organization" value={organization} onChange={event => { setOrganization(event.target.value); setProject(''); }}><NativeSelectOption value="">Select organization</NativeSelectOption>{organizations.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect></Label>
        <Label htmlFor="activity-project">Project<NativeSelect id="activity-project" disabled={!organization} value={project} onChange={event => setProject(event.target.value)}><NativeSelectOption value="">Select project</NativeSelectOption>{projects.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect></Label>
      </div>
    </section>

    <section className="gateway-capture-note panel" aria-label="How Niu captures task activity">
      <div className="gateway-capture-icon"><Activity size={20} /></div>
      <div><strong>Send model calls through Niu. Niu keeps the record.</strong><p>Usage, model, latency and settled gateway cost are captured automatically. Request and response content are not stored.</p></div>
      <a href="../keys">Set up an API key<ArrowUpRight size={16} /></a>
    </section>

    {error && <p role="alert" className="error-text">{error}</p>}
    {project && <>
      <section className="gateway-activity-summary" aria-label="Recent request analysis">
        <article className="panel"><span><Activity size={16} />Recent model requests</span><strong>{requests.length}{requests.length === 100 ? '+' : ''}</strong><small>Most recent 100 for this project</small></article>
        <article className="panel"><span><Workflow size={16} />Token usage</span><strong>{tokenSummary.total}</strong><small>{tokenSummary.known} requests with provider-reported usage</small></article>
        <article className="panel"><span><Coins size={16} />Settled gateway cost</span><strong>{settled.totals.length ? settled.totals.join(' · ') : '—'}</strong><small>{settled.unknown ? `${settled.unknown} requests without settled cost` : 'Only settled charges are included'}</small></article>
        <article className="panel"><span><Timer size={16} />Average model time</span><strong>{averageMs == null ? '—' : `${averageMs.toLocaleString()} ms`}</strong><small>{timed.length} requests with a complete timing</small></article>
      </section>

      <section className="gateway-task-feed panel" aria-labelledby="gateway-task-feed-title" aria-busy={loading}>
        <div className="gateway-task-feed-heading"><div><h2 id="gateway-task-feed-title">Recent task activity</h2><p>Requests sharing an <code>X-Niu-Task-ID</code> are grouped automatically. Requests without one remain visible as individual steps.</p></div><Badge variant="outline">Gateway records</Badge></div>
        {loading && <p role="status" className="execution-loading">Loading gateway activity…</p>}
        {!loading && groups.length === 0 && <div className="gateway-task-empty"><Activity size={22} /><h3>No model requests yet</h3><p>Complete these steps once. After an app or coding agent sends requests through Niu, this page fills itself with usage, latency and cost.</p>
          <div className="gateway-first-use-steps">
            <a href="../vendors"><span>1</span><strong>Connect a provider</strong><small>Save provider credentials on the server and publish a model alias.</small><ArrowUpRight size={16} /></a>
            <a href="../keys"><span>2</span><strong>Create a project key</strong><small>Give your app a scoped Niu key. Keep the admin token private.</small><ArrowUpRight size={16} /></a>
            <div><span>3</span><strong>Point your app or agent to Niu</strong><small>Use the OpenAI-compatible endpoint below; no JSON export or log upload.</small></div>
          </div>
          <pre><code>base_url: {typeof window === 'undefined' ? '/v1' : `${window.location.origin}/v1`}{'\n'}api_key: NIU_PROJECT_API_KEY{'\n'}model: {models[0] ?? 'your-model-alias'}</code></pre>
          <p>For multi-call agent tasks, an agent adapter can attach the same <code>X-Niu-Task-ID</code> to every model request. Niu then groups and analyzes those requests automatically.</p>
        </div>}
        {!loading && groups.length > 0 && <div className="gateway-task-groups">{groups.map(group => <article className="gateway-task-group" key={group.key}>
          <div className="gateway-task-group-head"><div><span className="gateway-task-kicker">{group.taskId ? 'AGENT TASK' : 'UNGROUPED REQUEST'}</span><h3>{group.taskId ?? group.requests[0].model}</h3><p>{group.requests.length} model {group.requests.length === 1 ? 'step' : 'steps'} · {group.requests.map(item => item.model).filter((model, index, all) => all.indexOf(model) === index).join(', ')}</p></div><div className="gateway-task-group-total"><strong>{group.costs.totals.length ? group.costs.totals.join(' · ') : 'Cost pending'}</strong><span>{group.tokens.total} tokens · {group.workMs ? `${group.workMs.toLocaleString()} ms model work` : 'timing unavailable'}</span></div></div>
          <div className="gateway-task-request-list">{group.requests.map(item => <div className="gateway-task-request" key={item.attempt_id}>
            <span className={`gateway-request-state ${item.execution === 'confirmed_completed' ? 'is-complete' : 'is-pending'}`} aria-hidden="true" />
            <strong>{item.model}</strong><span>{timestamp(item.created_at)}</span><span>{item.prompt_tokens != null && item.completion_tokens != null ? `${(BigInt(item.prompt_tokens) + BigInt(item.completion_tokens)).toLocaleString()} tokens` : 'Usage unknown'}</span><span>{item.duration_ms == null ? 'Time unknown' : `${item.duration_ms.toLocaleString()} ms`}</span><span>{item.cash_nanos != null && item.currency ? money(item.cash_nanos, item.currency) : item.execution === 'confirmed_completed' ? 'Price unavailable' : 'Unsettled'}</span>
          </div>)}</div>
        </article>)}</div>}
        {!loading && groups.length > 0 && <p className="gateway-task-disclosure">The gateway owns model-request capture. An agent adapter can attach <code>X-Niu-Task-ID</code> to correlate a full task; local tool actions and human acceptance are separate agent events, so Niu leaves them unknown until that adapter is installed.</p>}
      </section>
    </>}
  </>;
}
