import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Table as ShadcnTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowUpRight, ChevronDown, Copy, Coins, RefreshCw, Timer, Workflow } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import PageHeader from '@/components/PageHeader';
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
    if (item.execution === 'confirmed_not_executed' || item.execution === 'not_sent') continue;
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

function countLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function summaryCosts(summary: ActivitySummary, field: 'cash_nanos' | 'api_equivalent_nanos') {
  return summary.settled_costs.map(item => money(item[field], item.currency));
}

function taskTraceURL(workspaceRoot: string, organization: string, project: string, executionId: string) {
  const query = new URLSearchParams({ organizationId: organization, projectId: project, executionId });
  return `${workspaceRoot}/tasks?${query.toString()}`;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function curlRequestExample(baseURL: string, model: string) {
  const body = JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with a short greeting.' }] });
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

export default function GatewayActivity({ token, models, initialScope, compact = false, statisticsOnly = false, preferredModelAlias, preferredKeyId }: { token: string; models: string[]; initialScope?: { organizationId: string; projectId: string } | null; compact?: boolean; statisticsOnly?: boolean; preferredModelAlias?: string; preferredKeyId?: string }) {
  const location = useLocation();
  const organization = initialScope?.organizationId ?? '';
  const project = initialScope?.projectId ?? '';
  const [requests, setRequests] = useState<GatewayRequest[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const selectedRequest = requests.find(item => item.attempt_id === selectedAttempt);
  useEffect(() => setSelectedAttempt(null), [organization, project, token]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [keys, setKeys] = useState<KeyOption[]>([]);
  const [keyFilterError, setKeyFilterError] = useState('');
  const [filters, setFilters] = useState<ActivityFilters>({ from: '', to: '', model: '', keyId: preferredKeyId ?? '', status: '' });
  const [modelAlias, setModelAlias] = useState(() => preferredModelAlias && models.includes(preferredModelAlias) ? preferredModelAlias : models[0] ?? '');
  const [copyNotice, setCopyNotice] = useState('');
  const olderController = useRef<AbortController | null>(null);
  const preferredAliasApplied = useRef('');
  const clientModels = useMemo(() => {
    const activeKeys = keys.filter(key => !key.revoked && !key.expired);
    const granted = new Set(activeKeys.flatMap(key => key.allowed_models ?? []));
    return activeKeys.length > 0 ? models.filter(model => granted.has(model)) : models;
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
  const workspaceRoot = location.pathname.match(/^(.*\/workspaces\/[^/]+)/)?.[0] ?? '/workspaces/default';
  const baseURL = typeof window === 'undefined' ? `${productBase}/v1` : `${window.location.origin}${productBase}/v1`;
  const requestExample = useMemo(() => curlRequestExample(baseURL, modelAlias), [baseURL, modelAlias]);
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

  async function copyValue(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice(`${label} copied`);
    } catch {
      setCopyNotice('Clipboard unavailable. Select the value to copy it.');
    }
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
    timing_count: 0, average_duration_ms: null, unknown_cost_count: 0, settled_costs: [],
  };
  const aggregateTokens = (BigInt(aggregate.prompt_tokens) + BigInt(aggregate.completion_tokens)).toLocaleString();
  const settledTotals = summaryCosts(aggregate, 'cash_nanos');
  const apiEquivalentTotals = summaryCosts(aggregate, 'api_equivalent_nanos');
  const averageDuration = summary?.average_duration_ms;
  const groups = useMemo(() => groupRequests(requests), [requests]);

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
      {!compact && !statisticsOnly && <section className="gateway-client-setup panel" aria-label="Niu client settings">
        <div className="gateway-client-setup-heading"><div><p className="eyebrow">CLIENT SETUP</p><h2>Point your app at Niu</h2><p>Use a workspace key that grants the selected model alias. Provider credentials stay in Niu.</p></div><div><Link to={`${workspaceRoot}/vendors`}>Configure provider<ArrowUpRight size={15} /></Link><Link to={`${workspaceRoot}/keys`}>Manage API keys<ArrowUpRight size={15} /></Link></div></div>
        <div className="gateway-client-values">
          <div className="gateway-client-value"><span>Niu base URL</span><div><code>{baseURL}</code><Button type="button" variant="outline" size="sm" aria-label="Copy Niu base URL" onClick={() => void copyValue('Niu base URL', baseURL)}><Copy />Copy</Button></div></div>
          <div className="gateway-client-value"><span>Model alias</span>{clientModels.length > 1 && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-between font-normal">{modelAlias || 'Choose a model'}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={modelAlias} onValueChange={setModelAlias}>{clientModels.map(model => <DropdownMenuRadioItem key={model} value={model}>{model}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}<div><code>{modelAlias || 'No enabled model alias'}</code><Button type="button" variant="outline" size="sm" aria-label="Copy model alias" disabled={!modelAlias} onClick={() => void copyValue('Model alias', modelAlias)}><Copy />Copy</Button></div></div>
        </div>
        {modelAlias ? <details className="gateway-request-example"><summary>Try a request from your terminal</summary><div className="gateway-request-content"><div className="gateway-request-heading"><p>Set <code>NIU_API_KEY</code> to a workspace-scoped key before running.</p><Button type="button" variant="outline" size="sm" onClick={() => void copyValue('cURL request', requestExample)}><Copy />Copy cURL request</Button></div><pre><code>{requestExample}</code></pre></div></details> : <p className="gateway-request-unavailable">Publish an enabled model alias and grant it to a workspace key to generate a request example.</p>}
        {copyNotice && <p className="gateway-copy-notice" role="status">{copyNotice}</p>}
      </section>}

      {!compact && <section className="gateway-activity-filters panel" aria-label="Filter request activity">
        <label>From<Input type="date" value={filters.from} max={filters.to || undefined} onChange={event => updateFilter('from', event.target.value)} /></label>
        <label>To<Input type="date" value={filters.to} min={filters.from || undefined} onChange={event => updateFilter('to', event.target.value)} /></label>
        <label>Model<DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-between font-normal">{filters.model || 'All models'}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={filters.model || '__all__'} onValueChange={value => updateFilter('model', value === '__all__' ? '' : value)}><DropdownMenuRadioItem value="__all__">All models</DropdownMenuRadioItem>{models.map(model => <DropdownMenuRadioItem key={model} value={model}>{model}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></label>
        <label>API key<DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-between font-normal">{keys.find(key => key.id === filters.keyId)?.name ?? 'All keys'}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={filters.keyId || '__all__'} onValueChange={value => updateFilter('keyId', value === '__all__' ? '' : value)}><DropdownMenuRadioItem value="__all__">All keys</DropdownMenuRadioItem>{keys.map(key => <DropdownMenuRadioItem key={key.id} value={key.id}>{key.name}{key.revoked ? ' · revoked' : key.expired ? ' · expired' : ''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></label>
        <label>Status<DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-between font-normal">{statusLabel(filters.status || '') || 'Any status'}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={filters.status || '__all__'} onValueChange={value => updateFilter('status', value === '__all__' ? '' : value)}><DropdownMenuRadioItem value="__all__">Any status</DropdownMenuRadioItem><DropdownMenuRadioItem value="confirmed_completed">Completed</DropdownMenuRadioItem><DropdownMenuRadioItem value="may_have_executed">Uncertain</DropdownMenuRadioItem><DropdownMenuRadioItem value="confirmed_not_executed">Not executed</DropdownMenuRadioItem><DropdownMenuRadioItem value="not_sent">Not sent</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></label>
        {hasActivityFilters && <Button variant="ghost" size="sm" onClick={() => setFilters({ from: '', to: '', model: '', keyId: '', status: '' })}>Clear filters</Button>}
        {keyFilterError && <p role="alert" className="gateway-filter-error">{keyFilterError}</p>}
      </section>}

      {(statisticsOnly || compact) && !error && <section className="gateway-activity-summary" aria-label="Filtered request totals" aria-busy={loading}>
        <article className="panel"><span><Activity size={16} />Matching requests</span><strong>{summary ? aggregate.request_count.toLocaleString() : '—'}</strong><small>{summary ? `${requests.length.toLocaleString()} loaded${nextCursor ? ' · more history available' : ' · all matching requests'}` : 'Range total unavailable'}</small></article>
        <article className="panel"><span><Workflow size={16} />Token usage</span><strong>{summary ? aggregateTokens : '—'}</strong><small>{summary ? `${BigInt(aggregate.prompt_tokens).toLocaleString()} prompt · ${BigInt(aggregate.completion_tokens).toLocaleString()} output · ${aggregate.usage_count} with reported usage` : 'Range total unavailable'}</small></article>
        <article className="panel"><span><Timer size={16} />Average model time</span><strong>{averageDuration == null ? '—' : `${averageDuration.toLocaleString()} ms`}</strong><small>{summary ? `${aggregate.timing_count} requests with complete timing` : 'Range total unavailable'}</small></article>
        <article className="panel"><span><Coins size={16} />Settled gateway cost</span><strong>{summary ? settledTotals.length ? settledTotals.join(' · ') : aggregate.unknown_cost_count ? 'Unknown' : '—' : '—'}</strong><small>{summary ? aggregate.unknown_cost_count ? `${countLabel(aggregate.unknown_cost_count, 'request')} without a settled charge` : 'Settled charges only' : 'Range total unavailable'}</small></article>
        <article className="panel"><span><Coins size={16} />API-equivalent cost</span><strong>{summary ? apiEquivalentTotals.length ? apiEquivalentTotals.join(' · ') : aggregate.unknown_cost_count ? 'Unknown' : '—' : '—'}</strong><small>{summary ? aggregate.unknown_cost_count ? `${countLabel(aggregate.unknown_cost_count, 'request')} without a known price` : 'Model price estimate' : 'Range total unavailable'}</small></article>
      </section>}

      {statisticsOnly && !error && <section className="panel activity-model-breakdown">
        <div className="panel-heading"><div><h2>Model usage</h2><p>Request counts from the latest {requests.length.toLocaleString()} gateway records.</p></div><Link to="../executions">Investigate requests<ArrowUpRight size={15} /></Link></div>
        {loading ? <p role="status" className="execution-loading">Loading model activity…</p> : modelStats.length ? <div className="activity-model-table-wrap"><ShadcnTable><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Requests</TableHead><TableHead>Tokens observed</TableHead><TableHead>Avg. model time</TableHead></TableRow></TableHeader><TableBody>{modelStats.map(item => <TableRow key={item.model}><TableHead scope="row">{item.model}</TableHead><TableCell>{item.requests.toLocaleString()}</TableCell><TableCell>{item.usage ? item.tokens.toLocaleString() : 'Unknown'}</TableCell><TableCell>{item.timed ? `${Math.round(item.elapsed / item.timed).toLocaleString()} ms` : 'Unknown'}</TableCell></TableRow>)}</TableBody></ShadcnTable></div> : <div className="activity-model-empty"><strong>No model activity yet</strong><p>Requests through Chat or your app will populate these statistics automatically.</p><Link to="../playground">Open Chat<ArrowUpRight size={14} /></Link></div>}
        <div className="activity-stat-links"><Link to="../billing">View billing<ArrowUpRight size={14} /></Link></div>
      </section>}

      {!statisticsOnly && <section className={`gateway-task-feed panel${compact ? ' is-compact' : ''}`} aria-labelledby="gateway-task-feed-title" aria-busy={loading}>
        <div className="gateway-task-feed-heading"><div><h2 id="gateway-task-feed-title">{compact ? 'Recent requests' : 'Request activity'}</h2>{!compact && <p>Matching <code>X-Niu-Task-ID</code> values group calls. A task ID does not verify a complete task.</p>}</div><div className="gateway-feed-actions">{compact && <Link to={`${workspaceRoot}/executions`}>View activity<ArrowUpRight size={15} /></Link>}{!compact && <Badge variant="outline">{requests.length.toLocaleString()} loaded</Badge>}</div></div>
        {loading && <p role="status" className="execution-loading">Loading gateway activity…</p>}
        {!loading && !error && groups.length === 0 && <div className="gateway-task-empty"><Activity size={22} /><h3>{hasActivityFilters ? 'No matching requests' : 'No requests yet'}</h3><p>{hasActivityFilters ? 'Adjust or clear the filters to see more activity.' : 'Send a model call from Chat or your app.'}</p>{hasActivityFilters ? <Button type="button" variant="outline" onClick={() => setFilters({ from: '', to: '', model: '', keyId: '', status: '' })}>Clear filters</Button> : !compact && <Link to={`${workspaceRoot}/playground`}>Open Chat<ArrowUpRight size={16} /></Link>}</div>}
        {!loading && groups.length > 0 && <div className="gateway-task-groups">{(compact ? groups.slice(0, 3) : groups).map(group => <article className="gateway-task-group" key={group.key}>
          <div className="gateway-task-group-head"><div><span className="gateway-task-kicker">{group.taskId ? 'CORRELATED REQUESTS' : group.requests.length > 1 ? 'ATTEMPT HISTORY' : 'REQUEST'}</span><h3>{group.taskId ? `Task ID · ${group.taskId}` : group.requests[0].model}</h3><p>{group.requests.length} {group.taskId ? `request${group.requests.length === 1 ? '' : 's'}` : `attempt${group.requests.length === 1 ? '' : 's'}`} · {group.requests.map(item => item.model).filter((model, index, all) => all.indexOf(model) === index).join(', ')}</p>{group.taskEvidence && <p className="gateway-task-quality">Imported task evidence: {taskOutcome(group.taskEvidence)} · {group.taskEvidence.coverage} coverage</p>}{group.taskEvidence?.execution_id && <Link className="gateway-task-trace-link" to={taskTraceURL(workspaceRoot, organization, project, group.taskEvidence.execution_id)}>Open imported task evidence<ArrowUpRight size={14} /></Link>}</div><div className="gateway-task-group-total"><strong>{group.cashCosts.totals.length ? group.cashCosts.totals.join(' · ') : group.cashCosts.unknown ? 'Unknown' : '—'}</strong><span>{group.cashCosts.unknown ? `${countLabel(group.cashCosts.unknown, 'request')} without settled cash · total incomplete` : 'Settled model cash only'}</span><span>API-equivalent: {group.apiCosts.totals.length ? group.apiCosts.totals.join(' · ') : group.apiCosts.unknown ? 'unknown' : '—'}{group.apiCosts.unknown ? ` · ${countLabel(group.apiCosts.unknown, 'request')} without a known price` : ''}</span>{nextCursor && <span>Loaded history only; older calls may add costs.</span>}<span>{group.tokens.total} tokens · {group.workMs ? `${group.workMs.toLocaleString()} ms model time` : 'timing unavailable'}</span></div></div>
          <div className="gateway-task-request-list">{group.requests.map(item => <div className="gateway-task-request" id={`gateway-attempt-${item.attempt_id}`} tabIndex={-1} key={item.attempt_id}>
            <span className={`gateway-request-state ${item.execution === 'confirmed_completed' ? 'is-complete' : item.execution === 'confirmed_not_executed' ? 'is-failed' : 'is-pending'}`} aria-hidden="true" />
            <div className="gateway-request-model"><strong>{item.model}</strong>{item.provider_model && <small>Provider · {item.provider_model}</small>}</div><span>{timestamp(item.created_at)}</span><span>{item.prompt_tokens != null && item.completion_tokens != null ? `${(BigInt(item.prompt_tokens) + BigInt(item.completion_tokens)).toLocaleString()} tokens` : 'Usage unknown'}</span><span>{item.duration_ms == null ? 'Time unknown' : `${item.duration_ms.toLocaleString()} ms`}</span><span>{item.cash_nanos != null && item.currency ? money(item.cash_nanos, item.currency) : item.execution === 'confirmed_completed' ? 'Price unavailable' : 'Unsettled'}</span>{!compact && <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedAttempt(item.attempt_id)}>Details</Button>}
          </div>)}</div>
        </article>)}</div>}
        {!compact && !loading && nextCursor && <div className="gateway-task-history"><Button type="button" variant="outline" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? 'Loading older activity…' : 'Load older activity'}</Button></div>}
        {!compact && !loading && groups.length > 0 && <p className="gateway-task-disclosure">This view records gateway calls. It does not include tool calls, retries outside Niu, or task acceptance unless imported evidence is shown.</p>}
      </section>}
    </>}
    <Sheet open={Boolean(selectedRequest)} onOpenChange={open => { if (!open) setSelectedAttempt(null); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>Request details</SheetTitle><SheetDescription>{selectedRequest?.model}</SheetDescription></SheetHeader>
        {selectedRequest && <div className="p-6 space-y-6">
          <div className="gateway-request-detail"><dl><div><dt>Provider model</dt><dd>{selectedRequest.provider_model ?? 'Unknown'}</dd></div><div><dt>Status</dt><dd>{statusLabel(selectedRequest.execution)}</dd></div><div><dt>Time</dt><dd>{timestamp(selectedRequest.created_at)}</dd></div><div><dt>Model time</dt><dd>{selectedRequest.duration_ms == null ? 'Unknown' : `${selectedRequest.duration_ms.toLocaleString()} ms`}</dd></div><div><dt>Prompt tokens</dt><dd>{selectedRequest.prompt_tokens ?? 'Unknown'}</dd></div><div><dt>Output tokens</dt><dd>{selectedRequest.completion_tokens ?? 'Unknown'}</dd></div><div><dt>Usage evidence</dt><dd>{selectedRequest.usage_confidence}</dd></div><div><dt>Settled gateway cost</dt><dd>{selectedRequest.cash_nanos != null && selectedRequest.currency ? money(selectedRequest.cash_nanos, selectedRequest.currency) : 'Unknown'}</dd></div><div><dt>API-equivalent estimate</dt><dd>{selectedRequest.api_equivalent_nanos != null && selectedRequest.currency ? money(selectedRequest.api_equivalent_nanos, selectedRequest.currency) : 'Unknown'}</dd></div><div><dt>API key</dt><dd>{selectedRequest.key_name ?? 'Unknown'}</dd></div>{selectedRequest.task_id && <div><dt>Task ID</dt><dd>{selectedRequest.task_id} · correlation only</dd></div>}<div><dt>Operation ID</dt><dd><code>{selectedRequest.operation_id}</code></dd></div><div><dt>Attempt ID</dt><dd><code>{selectedRequest.attempt_id}</code></dd></div>{selectedRequest.task_evidence && <div><dt>Imported task evidence</dt><dd>{taskOutcome(selectedRequest.task_evidence)} · {selectedRequest.task_evidence.coverage}</dd></div>}</dl></div>
          <details><summary>Raw request metadata</summary><pre className="mt-3 overflow-auto rounded-md bg-muted p-4 text-sm">{JSON.stringify(selectedRequest, null, 2)}</pre></details>
          <div className="flex justify-between gap-2">
            <Button variant="outline" disabled={requests.findIndex(item => item.attempt_id === selectedAttempt) <= 0} onClick={() => setSelectedAttempt(requests[requests.findIndex(item => item.attempt_id === selectedAttempt) - 1].attempt_id)}>Previous request</Button>
            <Button variant="outline" disabled={requests.findIndex(item => item.attempt_id === selectedAttempt) >= requests.length - 1} onClick={() => setSelectedAttempt(requests[requests.findIndex(item => item.attempt_id === selectedAttempt) + 1].attempt_id)}>Next request</Button>
          </div>
        </div>}
      </SheetContent>
    </Sheet>
  </>;
}
