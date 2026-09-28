import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowUpRight, RefreshCw, Timer, Workflow } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dropdown, DropdownOption } from '@/components/ui/dropdown';
import PageHeader from '@/components/PageHeader';

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
};
type ActivitySummary = {
  request_count: number;
  usage_count: number;
  prompt_tokens: string;
  completion_tokens: string;
  timing_count: number;
  average_duration_ms: number | null;
};
type ActivityFilters = { from: string; to: string; model: string; keyId: string; status: string };
type KeyOption = { id: string; name: string; allowed_models: string[]; revoked: boolean; expired: boolean };

async function get<T>(path: string, token: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Could not load gateway activity (${response.status}).`);
  return await response.json() as T;
}

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
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

export default function GatewayActivity({ token, models, initialScope, compact = false, statisticsOnly = false, preferredModelAlias }: { token: string; models: string[]; initialScope?: { organizationId: string; projectId: string } | null; compact?: boolean; statisticsOnly?: boolean; preferredModelAlias?: string }) {
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
  const olderController = useRef<AbortController | null>(null);
  const preferredAliasApplied = useRef('');

  const productBase = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const workspaceRoot = typeof window === 'undefined'
    ? `${productBase}/workspaces/default`
    : (window.location.pathname.match(/^(.*\/workspaces\/[^/]+)/)?.[0] ?? `${productBase}/workspaces/default`);
  const activityFilterQuery = useMemo(() => filterQuery(filters), [filters]);
  const invalidDateRange = Boolean(filters.from && filters.to && filters.from > filters.to);
  const hasActivityFilters = Boolean(activityFilterQuery);

  useEffect(() => {
    const alias = preferredModelAlias?.trim();
    if (!alias || !models.includes(alias) || preferredAliasApplied.current === alias) return;
    preferredAliasApplied.current = alias;
    setFilters(current => ({ ...current, model: alias }));
  }, [preferredModelAlias, models]);

  function updateFilter(name: keyof ActivityFilters, value: string) {
    setFilters(current => ({ ...current, [name]: value }));
  }

  useEffect(() => {
    if (!organization || !project || compact || statisticsOnly) return;
    const controller = new AbortController();
    setKeyFilterError('');
    void get<{ data: KeyOption[] }>(`/admin/v1/organizations/${organization}/projects/${project}/keys`, token, controller.signal)
      .then(value => { if (!controller.signal.aborted) setKeys(value.data); })
      .catch(reason => { if (!controller.signal.aborted) setKeyFilterError((reason as Error).message); });
    return () => controller.abort();
  }, [token, organization, project, compact, statisticsOnly]);

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

  const modelStats = useMemo(() => {
    const byModel = new Map<string, { requests: number; tokens: bigint; usage: number; timed: number; elapsed: number }>();
    for (const request of requests) {
      const current = byModel.get(request.model) ?? { requests: 0, tokens: 0n, usage: 0, timed: 0, elapsed: 0 };
      current.requests += 1;
      if (request.prompt_tokens != null && request.completion_tokens != null) { current.tokens += BigInt(request.prompt_tokens) + BigInt(request.completion_tokens); current.usage += 1; }
      if (request.duration_ms != null) { current.timed += 1; current.elapsed += request.duration_ms; }
      byModel.set(request.model, current);
    }
    return [...byModel].map(([model, stats]) => ({ model, ...stats })).sort((a, b) => b.requests - a.requests || a.model.localeCompare(b.model)).slice(0, 8);
  }, [requests]);
  const aggregate = summary ?? {
    request_count: 0, usage_count: 0, prompt_tokens: '0', completion_tokens: '0',
    timing_count: 0, average_duration_ms: null,
  };
  const aggregateTokens = (BigInt(aggregate.prompt_tokens) + BigInt(aggregate.completion_tokens)).toLocaleString();
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
    {!compact && <PageHeader title={statisticsOnly ? 'Usage' : 'Observability'} action={<Button variant="outline" disabled={!project || loading} onClick={() => setRevision(value => value + 1)}><RefreshCw />Refresh</Button>} />}

    {error && <div role="alert" className="page-error"><span>{error}</span><Button variant="outline" size="sm" onClick={() => setRevision(value => value + 1)}>Try again</Button></div>}
    {!project && <section className="panel empty-state"><strong>Choose a workspace</strong><span>Select or create a workspace to view its activity.</span></section>}
    {project && <>
      {!compact && <section className="gateway-activity-filters panel" aria-label="Filter request activity">
        <label>From<input type="date" value={filters.from} max={filters.to || undefined} onChange={event => updateFilter('from', event.target.value)} /></label>
        <label>To<input type="date" value={filters.to} min={filters.from || undefined} onChange={event => updateFilter('to', event.target.value)} /></label>
        <label>Model<Dropdown value={filters.model} onChange={event => updateFilter('model', event.target.value)}><DropdownOption value="">All models</DropdownOption>{models.map(model => <DropdownOption key={model} value={model}>{model}</DropdownOption>)}</Dropdown></label>
        <label>API key<Dropdown value={filters.keyId} onChange={event => updateFilter('keyId', event.target.value)}><DropdownOption value="">All keys</DropdownOption>{keys.map(key => <DropdownOption key={key.id} value={key.id}>{key.name}{key.revoked ? ' · revoked' : key.expired ? ' · expired' : ''}</DropdownOption>)}</Dropdown></label>
        <label>Status<Dropdown value={filters.status} onChange={event => updateFilter('status', event.target.value)}><DropdownOption value="">Any status</DropdownOption><DropdownOption value="confirmed_completed">Completed</DropdownOption><DropdownOption value="may_have_executed">Uncertain</DropdownOption><DropdownOption value="confirmed_not_executed">Not executed</DropdownOption><DropdownOption value="not_sent">Not sent</DropdownOption></Dropdown></label>
        {hasActivityFilters && <Button variant="ghost" size="sm" onClick={() => setFilters({ from: '', to: '', model: '', keyId: '', status: '' })}>Clear filters</Button>}
        {keyFilterError && <p role="alert" className="gateway-filter-error">{keyFilterError}</p>}
      </section>}

      {(statisticsOnly || compact) && !error && <section className="gateway-activity-summary" aria-label="Filtered request totals" aria-busy={loading}>
        <article className="panel"><span><Activity size={16} />Matching requests</span><strong>{summary ? aggregate.request_count.toLocaleString() : '—'}</strong><small>{summary ? `${requests.length.toLocaleString()} loaded${nextCursor ? ' · more history available' : ' · all matching requests'}` : 'Range total unavailable'}</small></article>
        <article className="panel"><span><Workflow size={16} />Token usage</span><strong>{summary ? aggregateTokens : '—'}</strong><small>{summary ? `${BigInt(aggregate.prompt_tokens).toLocaleString()} prompt · ${BigInt(aggregate.completion_tokens).toLocaleString()} output · ${aggregate.usage_count} with reported usage` : 'Range total unavailable'}</small></article>
        <article className="panel"><span><Timer size={16} />Average model time</span><strong>{averageDuration == null ? '—' : `${averageDuration.toLocaleString()} ms`}</strong><small>{summary ? `${aggregate.timing_count} requests with complete timing` : 'Range total unavailable'}</small></article>
      </section>}

      {statisticsOnly && !error && <section className="panel activity-model-breakdown">
        <div className="panel-heading"><div><h2>Model usage</h2><p>Request counts from the latest {requests.length.toLocaleString()} gateway records.</p></div><Link to="../executions">Investigate requests<ArrowUpRight size={15} /></Link></div>
        {loading ? <p role="status" className="execution-loading">Loading model activity…</p> : modelStats.length ? <div className="activity-model-table-wrap"><table><thead><tr><th>Model</th><th>Requests</th><th>Tokens observed</th><th>Avg. model time</th></tr></thead><tbody>{modelStats.map(item => <tr key={item.model}><th scope="row">{item.model}</th><td>{item.requests.toLocaleString()}</td><td>{item.usage ? item.tokens.toLocaleString() : 'Unknown'}</td><td>{item.timed ? `${Math.round(item.elapsed / item.timed).toLocaleString()} ms` : 'Unknown'}</td></tr>)}</tbody></table></div> : <div className="activity-model-empty"><strong>No model activity yet</strong><p>Requests through Chat or your app will populate these statistics automatically.</p><Link to="../playground">Open Chat<ArrowUpRight size={14} /></Link></div>}
        <div className="activity-stat-links"><Link to="../billing">View billing<ArrowUpRight size={14} /></Link></div>
      </section>}

      {!statisticsOnly && <section className={`gateway-task-feed panel${compact ? ' is-compact' : ''}`} aria-labelledby="gateway-task-feed-title" aria-busy={loading}>
        <div className="gateway-task-feed-heading"><div><h2 id="gateway-task-feed-title">{compact ? 'Recent requests' : 'Requests'}</h2></div><div className="gateway-feed-actions">{compact && <Link to={`${workspaceRoot}/executions`}>View all requests<ArrowUpRight size={15} /></Link>}{!compact && <Badge variant="outline">{requests.length.toLocaleString()} loaded</Badge>}</div></div>
        {loading && <p role="status" className="execution-loading">Loading requests…</p>}
        {!loading && !error && requests.length === 0 && <div className="gateway-task-empty"><Activity size={22} /><h3>{hasActivityFilters ? 'No matching requests' : 'No requests yet'}</h3><p>{hasActivityFilters ? 'Adjust or clear the filters to see more activity.' : 'Calls sent through Chat or your application appear here.'}</p>{hasActivityFilters ? <Button type="button" variant="outline" onClick={() => setFilters({ from: '', to: '', model: '', keyId: '', status: '' })}>Clear filters</Button> : !compact && <Link to={`${workspaceRoot}/playground`}>Open Chat<ArrowUpRight size={16} /></Link>}</div>}
        {!loading && requests.length > 0 && <div className="gateway-request-table-wrap"><table className={`gateway-request-table${compact ? ' is-compact' : ''}`}><thead><tr><th>Time</th><th>Model</th><th>Status</th><th>Latency</th>{!compact && <><th>Tokens</th><th>API key</th><th>Details</th></>}</tr></thead><tbody>{requests.map(item => <tr id={`gateway-attempt-${item.attempt_id}`} tabIndex={-1} key={item.attempt_id}>
          <td>{timestamp(item.created_at)}</td><th scope="row"><span>{item.model}</span>{item.provider_model && <small>Provider · {item.provider_model}</small>}</th><td><span className={`gateway-table-status ${item.execution === 'confirmed_completed' ? 'is-complete' : item.execution === 'confirmed_not_executed' ? 'is-failed' : 'is-pending'}`}>{statusLabel(item.execution)}</span></td><td>{item.duration_ms == null ? 'Unknown' : `${item.duration_ms.toLocaleString()} ms`}</td>{!compact && <><td>{item.prompt_tokens != null && item.completion_tokens != null ? (BigInt(item.prompt_tokens) + BigInt(item.completion_tokens)).toLocaleString() : 'Unknown'}</td><td>{item.key_name ?? 'Unknown'}</td><td><details className="gateway-request-detail"><summary>View details</summary><div><strong>{item.model}</strong><dl><div><dt>Provider model</dt><dd>{item.provider_model ?? 'Unknown'}</dd></div><div><dt>Status</dt><dd>{statusLabel(item.execution)}</dd></div><div><dt>Time</dt><dd>{timestamp(item.created_at)}</dd></div><div><dt>Model time</dt><dd>{item.duration_ms == null ? 'Unknown' : `${item.duration_ms.toLocaleString()} ms`}</dd></div><div><dt>Prompt tokens</dt><dd>{item.prompt_tokens ?? 'Unknown'}</dd></div><div><dt>Output tokens</dt><dd>{item.completion_tokens ?? 'Unknown'}</dd></div><div><dt>Usage evidence</dt><dd>{item.usage_confidence}</dd></div><div><dt>API key</dt><dd>{item.key_name ?? 'Unknown'}</dd></div>{item.task_id && <div><dt>Task ID</dt><dd>{item.task_id}</dd></div>}<div><dt>Operation ID</dt><dd><code>{item.operation_id}</code></dd></div><div><dt>Attempt ID</dt><dd><code>{item.attempt_id}</code></dd></div>{item.task_evidence && <div><dt>Task evidence</dt><dd>{taskOutcome(item.task_evidence)} · {item.task_evidence.coverage}</dd></div>}</dl></div></details></td></>}
        </tr>)}</tbody></table></div>}
        {!compact && !loading && nextCursor && <div className="gateway-task-history"><Button type="button" variant="outline" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? 'Loading older requests…' : 'Load older requests'}</Button></div>}
        {!compact && !loading && requests.length > 0 && <p className="gateway-task-disclosure">Token counts are shown only when reported. Customer charges and invoices are available in Billing.</p>}
      </section>}
    </>}
  </>;
}
