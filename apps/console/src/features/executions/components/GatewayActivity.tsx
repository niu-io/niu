import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Copy, RefreshCw, Coins, Timer, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { money } from '@/lib/money';

type TaskEvidence = {
  execution_id: string;
  source: string;
  record_id: string;
  coverage: 'complete' | 'partial' | 'unknown';
  outcomes: Array<{
    authority: 'agent_claim' | 'deterministic_validator' | 'human_acceptance';
    result: 'accepted' | 'rejected' | 'inconclusive';
  }>;
};
type GatewayRequest = {
  attempt_id: string;
  operation_id: string;
  api_key_id: string | null;
  key_name: string | null;
  task_id: string | null;
  task_evidence: TaskEvidence | null;
  model: string;
  provider_model: string | null;
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
type ActivitySummary = {
  request_count: number;
  usage_count: number;
  prompt_tokens: string;
  completion_tokens: string;
  timing_count: number;
  average_duration_ms: number | null;
  unknown_cost_count: number;
  settled_costs: Array<{ currency: string; cash_nanos: string; api_equivalent_nanos: string; settled_requests: number }>;
};
type ActivityFilters = { from: string; to: string; model: string; keyId: string; status: string };
type KeyOption = { id: string; name: string; allowed_models: string[]; revoked: boolean; expired: boolean };

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

function countLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function localDayStart(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

function statusLabel(value: string) {
  switch (value) {
    case 'not_sent': return 'Not sent';
    case 'may_have_executed': return 'Uncertain';
    case 'confirmed_completed': return 'Completed';
    case 'confirmed_not_executed': return 'Not executed';
    default: return value;
  }
}

function summaryCosts(summary: ActivitySummary, field: 'cash_nanos' | 'api_equivalent_nanos') {
  return summary.settled_costs.map(item => money(item[field], item.currency));
}

function filterQuery(filters: ActivityFilters) {
  const query = new URLSearchParams();
  if (filters.from) query.set('from_ms', String(localDayStart(filters.from)));
  if (filters.to) {
    const end = new Date(localDayStart(filters.to));
    end.setDate(end.getDate() + 1);
    query.set('to_ms', String(end.getTime()));
  }
  if (filters.model) query.set('model_alias', filters.model);
  if (filters.keyId) query.set('key_id', filters.keyId);
  if (filters.status) query.set('status', filters.status);
  return query.toString();
}

function taskTraceURL(workspaceRoot: string, organization: string, project: string, executionId: string) {
  const query = new URLSearchParams({ organizationId: organization, projectId: project, executionId });
  return `${workspaceRoot}/tasks?${query.toString()}`;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function curlRequestExample(baseURL: string, model: string) {
  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'Reply with a short greeting.' }],
  });
  const continuation = String.fromCharCode(92);
  const command = [
    'curl "$NIU_BASE_URL/chat/completions"',
    '--header "Authorization: Bearer $NIU_API_KEY"',
    '--header "Content-Type: application/json"',
    `--data ${shellQuote(body)}`,
  ].join(` ${continuation}\n  `);
  return `export NIU_BASE_URL=${shellQuote(baseURL)}\n${command}`;
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
    taskEvidence: items.find(item => item.task_evidence)?.task_evidence ?? null,
    requests: items,
    tokens: totalTokens(items),
    cashCosts: amount(items, 'cash_nanos'),
    apiCosts: amount(items, 'api_equivalent_nanos'),
    workMs: items.reduce((total, item) => total + (item.duration_ms ?? 0), 0),
  }));
}

export function taskOutcome(evidence: TaskEvidence | null) {
  if (!evidence) return 'Unverified';
  const byAuthority = new Map<string, Set<string>>();
  for (const item of evidence.outcomes) {
    if (item.authority === 'agent_claim') continue;
    const results = byAuthority.get(item.authority) ?? new Set<string>();
    results.add(item.result);
    byAuthority.set(item.authority, results);
  }
  const states = [...byAuthority.values()];
  const trusted = evidence.outcomes.filter(item => item.authority !== 'agent_claim');
  const hasAccepted = trusted.some(item => item.result === 'accepted');
  const hasRejected = trusted.some(item => item.result === 'rejected');
  const conflict = states.some(results => results.size > 1) || (hasAccepted && hasRejected);
  if (conflict) return 'Conflicting evidence';
  if (trusted.some(item => item.result === 'rejected')) return 'Rejected';
  if (trusted.some(item => item.result === 'accepted')) return 'Accepted';
  if (trusted.some(item => item.result === 'inconclusive')) return 'Inconclusive';
  return 'Unverified';
}

export default function GatewayActivity({ token, models, initialScope, compact = false, preferredModelAlias }: { token: string; models: string[]; initialScope?: { organizationId: string; projectId: string } | null; compact?: boolean; preferredModelAlias?: string }) {
  const organization = initialScope?.organizationId ?? '';
  const project = initialScope?.projectId ?? '';
  const [requests, setRequests] = useState<GatewayRequest[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [keys, setKeys] = useState<KeyOption[]>([]);
  const [keyFilterError, setKeyFilterError] = useState('');
  const [filters, setFilters] = useState<ActivityFilters>({ from: '', to: '', model: '', keyId: '', status: '' });
  const [modelAlias, setModelAlias] = useState(() => preferredModelAlias && models.includes(preferredModelAlias) ? preferredModelAlias : models[0] ?? '');
  const [copyNotice, setCopyNotice] = useState('');
  const olderController = useRef<AbortController | null>(null);
  const preferredAliasApplied = useRef('');
  const clientModels = useMemo(() => {
    const granted = new Set(keys.filter(key => !key.revoked && !key.expired).flatMap(key => key.allowed_models ?? []));
    return granted.size > 0 ? models.filter(model => granted.has(model)) : models;
  }, [keys, models]);

  useEffect(() => {
    if (preferredModelAlias && preferredAliasApplied.current !== preferredModelAlias && clientModels.includes(preferredModelAlias)) {
      preferredAliasApplied.current = preferredModelAlias;
      setModelAlias(preferredModelAlias);
      return;
    }
    if (!clientModels.includes(modelAlias)) setModelAlias(clientModels[0] ?? '');
  }, [clientModels, modelAlias, preferredModelAlias]);

  const productBase = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const workspaceRoot = typeof window === 'undefined'
    ? `${productBase}/workspaces/default`
    : (window.location.pathname.match(/^(.*\/workspaces\/[^/]+)/)?.[0] ?? `${productBase}/workspaces/default`);
  const baseURL = typeof window === 'undefined' ? `${productBase}/v1` : `${window.location.origin}${productBase}/v1`;
  const requestExample = useMemo(() => curlRequestExample(baseURL, modelAlias), [baseURL, modelAlias]);
  const activityFilterQuery = useMemo(() => filterQuery(filters), [filters]);
  const invalidDateRange = Boolean(filters.from && filters.to && filters.from > filters.to);
  const hasActivityFilters = Boolean(activityFilterQuery);

  function updateFilter(name: keyof ActivityFilters, value: string) {
    setFilters(current => ({ ...current, [name]: value }));
  }

  async function copyValue(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice(`${label} copied`);
    } catch {
      setCopyNotice('Clipboard unavailable. Select the value to copy it.');
    }
  }

  useEffect(() => {
    if (!organization || !project || compact) return;
    const controller = new AbortController();
    setKeyFilterError('');
    void get<{ data: KeyOption[] }>(`/admin/v1/organizations/${organization}/projects/${project}/keys`, token, controller.signal)
      .then(value => { if (!controller.signal.aborted) setKeys(value.data); })
      .catch(reason => { if (!controller.signal.aborted) setKeyFilterError((reason as Error).message); });
    return () => controller.abort();
  }, [token, organization, project, compact]);

  useEffect(() => {
    const controller = new AbortController();
    olderController.current?.abort();
    olderController.current = null;
    setRequests([]);
    setNextCursor(null);
    setSummary(null);
    setLoadingOlder(false);
    setError('');
    if (!organization || !project) { setLoading(false); return () => controller.abort(); }
    if (invalidDateRange) {
      setLoading(false);
      setError('Choose a valid date range.');
      return () => controller.abort();
    }
    setLoading(true);
    const query = new URLSearchParams(activityFilterQuery);
    query.set('limit', '100');
    void get<{ data: GatewayRequest[]; next_cursor: string | null; summary: ActivitySummary }>(`/admin/v1/organizations/${organization}/projects/${project}/requests?${query}`, token, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setRequests(value.data); setNextCursor(value.next_cursor); setSummary(value.summary); } })
      .catch(reason => { if (!controller.signal.aborted) setError((reason as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {
      controller.abort();
      olderController.current?.abort();
    };
  }, [token, organization, project, revision, activityFilterQuery, invalidDateRange]);

  async function loadOlder() {
    if (!organization || !project || !nextCursor || loadingOlder) return;
    const controller = new AbortController();
    olderController.current?.abort();
    olderController.current = controller;
    setLoadingOlder(true);
    setError('');
    const query = new URLSearchParams(activityFilterQuery);
    query.set('limit', '100');
    query.set('after', nextCursor);
    try {
      const value = await get<{ data: GatewayRequest[]; next_cursor: string | null; summary: ActivitySummary }>(
        `/admin/v1/organizations/${organization}/projects/${project}/requests?${query}`,
        token,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setRequests(previous => [...previous, ...value.data.filter(item => !previous.some(existing => existing.attempt_id === item.attempt_id))]);
        setNextCursor(value.next_cursor);
        setSummary(value.summary);
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError((reason as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoadingOlder(false);
    }
  }

  const groups = useMemo(() => groupRequests(requests), [requests]);
  const aggregate = summary ?? {
    request_count: 0, usage_count: 0, prompt_tokens: '0', completion_tokens: '0',
    timing_count: 0, average_duration_ms: null, unknown_cost_count: 0, settled_costs: [],
  };
  const aggregateTokens = (BigInt(aggregate.prompt_tokens) + BigInt(aggregate.completion_tokens)).toLocaleString();
  const settledTotals = summaryCosts(aggregate, 'cash_nanos');
  const apiEquivalentTotals = summaryCosts(aggregate, 'api_equivalent_nanos');
  const averageDuration = summary?.average_duration_ms;

  useEffect(() => {
    const prefix = '#gateway-attempt-';
    if (loading || !window.location.hash.startsWith(prefix)) return;
    const attemptId = window.location.hash.slice(prefix.length);
    const target = document.getElementById(`gateway-attempt-${attemptId}`);
    if (!target) return;
    target.classList.add('is-focused');
    target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
  }, [loading, requests]);

  return <>
    {!compact && <div className="page-heading gateway-activity-heading">
      <div><p className="page-subtitle">Requests through Niu, with measured usage, latency, and known cost.</p></div>
      <Button variant="outline" disabled={!project || loading} onClick={() => setRevision(value => value + 1)}><RefreshCw />Refresh</Button>
    </div>}

    {!compact && <section className="gateway-client-setup panel" aria-label="Niu client settings">
      <div className="gateway-client-setup-heading"><div><p className="eyebrow">CLIENT SETUP</p><h2>Point your app at Niu</h2><p>Use a project key that grants the selected alias. Provider credentials stay in Niu.</p></div><div><a href={`${workspaceRoot}/vendors`}>Configure provider<ArrowUpRight size={15} /></a><a href={`${workspaceRoot}/keys`}>Manage project keys<ArrowUpRight size={15} /></a></div></div>
      <div className="gateway-client-values">
        <div className="gateway-client-value"><span>Niu base URL</span><div><code>{baseURL}</code><Button type="button" variant="outline" size="sm" aria-label="Copy Niu base URL" onClick={() => void copyValue('Niu base URL', baseURL)}><Copy />Copy</Button></div></div>
        <div className="gateway-client-value"><span>Model alias</span>{clientModels.length > 1 && <Label htmlFor="activity-model">Choose a model<NativeSelect id="activity-model" value={modelAlias} onChange={event => setModelAlias(event.target.value)}>{clientModels.map(model => <NativeSelectOption key={model} value={model}>{model}</NativeSelectOption>)}</NativeSelect></Label>}<div><code>{modelAlias || 'No enabled model alias'}</code><Button type="button" variant="outline" size="sm" aria-label="Copy model alias" disabled={!modelAlias} onClick={() => void copyValue('Model alias', modelAlias)}><Copy />Copy</Button></div></div>
      </div>
      {modelAlias ? <details className="gateway-request-example">
        <summary>Try a request from your terminal</summary>
        <div className="gateway-request-content">
          <div className="gateway-request-heading"><p>Set <code>NIU_API_KEY</code> to a project-scoped key before running.</p><Button type="button" variant="outline" size="sm" onClick={() => void copyValue('cURL request', requestExample)}><Copy />Copy cURL request</Button></div>
          <pre><code>{requestExample}</code></pre>
        </div>
      </details> : <p className="gateway-request-unavailable">Publish an enabled model alias to generate a request example.</p>}
      {copyNotice && <p className="gateway-copy-notice" role="status">{copyNotice}</p>}
    </section>}

    {error && <p role="alert" className="error-text">{error}</p>}
    {project && <>
      {!compact && <section className="gateway-activity-filters panel" aria-label="Filter request activity">
        <label>From<input type="date" value={filters.from} max={filters.to || undefined} onChange={event => updateFilter('from', event.target.value)} /></label>
        <label>To<input type="date" value={filters.to} min={filters.from || undefined} onChange={event => updateFilter('to', event.target.value)} /></label>
        <label>Model<NativeSelect value={filters.model} onChange={event => updateFilter('model', event.target.value)}><NativeSelectOption value="">All models</NativeSelectOption>{models.map(model => <NativeSelectOption key={model} value={model}>{model}</NativeSelectOption>)}</NativeSelect></label>
        <label>API key<NativeSelect value={filters.keyId} onChange={event => updateFilter('keyId', event.target.value)}><NativeSelectOption value="">All keys</NativeSelectOption>{keys.map(key => <NativeSelectOption key={key.id} value={key.id}>{key.name}{key.revoked ? ' · revoked' : key.expired ? ' · expired' : ''}</NativeSelectOption>)}</NativeSelect></label>
        <label>Status<NativeSelect value={filters.status} onChange={event => updateFilter('status', event.target.value)}><NativeSelectOption value="">Any status</NativeSelectOption><NativeSelectOption value="confirmed_completed">Completed</NativeSelectOption><NativeSelectOption value="may_have_executed">Uncertain</NativeSelectOption><NativeSelectOption value="confirmed_not_executed">Not executed</NativeSelectOption><NativeSelectOption value="not_sent">Not sent</NativeSelectOption></NativeSelect></label>
        {keyFilterError && <p role="alert" className="gateway-filter-error">{keyFilterError}</p>}
      </section>}

      <section className="gateway-activity-summary" aria-label="Filtered request totals" aria-busy={loading}>
        <article className="panel"><span><Activity size={16} />Matching requests</span><strong>{summary ? aggregate.request_count.toLocaleString() : '—'}</strong><small>{summary ? `${requests.length.toLocaleString()} loaded${nextCursor ? ' · more history available' : ' · all matching history loaded'}` : 'Range total unavailable'}</small></article>
        <article className="panel"><span><Workflow size={16} />Token usage</span><strong>{summary ? aggregateTokens : '—'}</strong><small>{summary ? `${BigInt(aggregate.prompt_tokens).toLocaleString()} prompt · ${BigInt(aggregate.completion_tokens).toLocaleString()} output · ${aggregate.usage_count} with reported usage` : 'Range total unavailable'}</small></article>
        <article className="panel"><span><Coins size={16} />Settled gateway cost</span><strong>{summary ? settledTotals.length ? settledTotals.join(' · ') : aggregate.unknown_cost_count ? 'Unknown' : '—' : '—'}</strong><small>{summary ? aggregate.unknown_cost_count ? `${countLabel(aggregate.unknown_cost_count, 'request')} without a settled charge` : 'Settled charges only' : 'Range total unavailable'}</small></article>
        <article className="panel"><span><Coins size={16} />API-equivalent cost</span><strong>{summary ? apiEquivalentTotals.length ? apiEquivalentTotals.join(' · ') : aggregate.unknown_cost_count ? 'Unknown' : '—' : '—'}</strong><small>{summary ? aggregate.unknown_cost_count ? `${countLabel(aggregate.unknown_cost_count, 'request')} without a known price` : 'Model price estimate' : 'Range total unavailable'}</small></article>
        <article className="panel"><span><Timer size={16} />Average model time</span><strong>{averageDuration == null ? '—' : `${averageDuration.toLocaleString()} ms`}</strong><small>{summary ? `${aggregate.timing_count} requests with complete timing` : 'Range total unavailable'}</small></article>
      </section>

      <section className={`gateway-task-feed panel${compact ? ' is-compact' : ''}`} aria-labelledby="gateway-task-feed-title" aria-busy={loading}>
        <div className="gateway-task-feed-heading"><div><h2 id="gateway-task-feed-title">{compact ? 'Recent requests' : 'Request activity'}</h2>{!compact && <p>Matching <code>X-Niu-Task-ID</code> values group requests. A task ID does not verify a complete task.</p>}</div><div className="gateway-feed-actions">{compact && <a href={`${workspaceRoot}/executions`}>View activity<ArrowUpRight size={15} /></a>}<Badge variant="outline">Gateway</Badge></div></div>
        {loading && <p role="status" className="execution-loading">Loading gateway activity…</p>}
        {!loading && groups.length === 0 && <div className="gateway-task-empty"><Activity size={22} /><h3>{hasActivityFilters ? 'No matching requests' : 'No requests yet'}</h3><p>{hasActivityFilters ? 'Adjust or clear the filters to see more activity.' : 'Send a model call from Playground or your app.'}</p>{hasActivityFilters ? <Button type="button" variant="outline" onClick={() => setFilters({ from: '', to: '', model: '', keyId: '', status: '' })}>Clear filters</Button> : <a href={`${workspaceRoot}/playground`}>Open Playground<ArrowUpRight size={16} /></a>}</div>}
        {!loading && groups.length > 0 && <div className="gateway-task-groups">{(compact ? groups.slice(0, 3) : groups).map(group => <article className="gateway-task-group" key={group.key}>
          <div className="gateway-task-group-head"><div><span className="gateway-task-kicker">{group.taskId ? 'CORRELATED REQUESTS' : group.requests.length > 1 ? 'ATTEMPT HISTORY' : 'REQUEST'}</span><h3>{group.taskId ? `Task ID · ${group.taskId}` : group.requests[0].model}</h3><p>{group.requests.length} {group.taskId ? `request${group.requests.length === 1 ? '' : 's'}` : `attempt${group.requests.length === 1 ? '' : 's'}`} · {group.requests.map(item => item.model).filter((model, index, all) => all.indexOf(model) === index).join(', ')}</p>{group.taskEvidence && <p className="gateway-task-quality">Task evidence: {taskOutcome(group.taskEvidence)} · {group.taskEvidence.coverage} coverage</p>}{group.taskEvidence?.execution_id && <a className="gateway-task-trace-link" href={taskTraceURL(workspaceRoot, organization, project, group.taskEvidence.execution_id)}>Open task evidence<ArrowUpRight size={14} /></a>}</div><div className="gateway-task-group-total"><strong>{group.cashCosts.totals.length ? group.cashCosts.totals.join(' · ') : 'Cost unknown'}</strong><span>{group.cashCosts.unknown ? `${countLabel(group.cashCosts.unknown, 'request')} without settled cash · total incomplete` : 'Settled model cash only · other task costs may be unknown'}</span><span>API-equivalent: {group.apiCosts.totals.length ? group.apiCosts.totals.join(' · ') : 'unknown'}{group.apiCosts.unknown ? ` · ${countLabel(group.apiCosts.unknown, 'request')} without a known price` : ''}</span>{nextCursor && <span>Loaded history only; older activity may add costs.</span>}<span>{group.tokens.total} tokens · {group.workMs ? `${group.workMs.toLocaleString()} ms model time` : 'timing unavailable'}</span></div></div>
          <div className="gateway-task-request-list">{group.requests.map(item => <div className="gateway-task-request" id={`gateway-attempt-${item.attempt_id}`} tabIndex={-1} key={item.attempt_id}>
            <span className={`gateway-request-state ${item.execution === 'confirmed_completed' ? 'is-complete' : item.execution === 'confirmed_not_executed' ? 'is-failed' : 'is-pending'}`} aria-hidden="true" />
            <div className="gateway-request-model"><strong>{item.model}</strong>{item.provider_model && <small>Provider · {item.provider_model}</small>}</div><span>{timestamp(item.created_at)}</span><span>{item.prompt_tokens != null && item.completion_tokens != null ? `${(BigInt(item.prompt_tokens) + BigInt(item.completion_tokens)).toLocaleString()} tokens` : 'Usage unknown'}</span><span>{item.duration_ms == null ? 'Time unknown' : `${item.duration_ms.toLocaleString()} ms`}</span><span>{item.cash_nanos != null && item.currency ? money(item.cash_nanos, item.currency) : item.execution === 'confirmed_completed' ? 'Price unavailable' : 'Unsettled'}</span>
            {!compact && <details className="gateway-attempt-details"><summary>Details</summary><div><span>Status · {statusLabel(item.execution)}</span><span>Attempt · <code>{item.attempt_id}</code></span><span>Operation · <code>{item.operation_id}</code></span><span>API key · {item.key_name ?? 'Unknown or unavailable'}</span></div></details>}
          </div>)}</div>
        </article>)}</div>}
        {!compact && !loading && nextCursor && <div className="gateway-task-history"><Button type="button" variant="outline" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? 'Loading older activity…' : 'Load older activity'}</Button></div>}
        {!compact && !loading && groups.length > 0 && <p className="gateway-task-disclosure">Request activity shows gateway calls. <a href={`${workspaceRoot}/executions`}>Task evidence</a> adds tool steps and accepted outcomes when available.</p>}
      </section>
    </>}
  </>;
}
