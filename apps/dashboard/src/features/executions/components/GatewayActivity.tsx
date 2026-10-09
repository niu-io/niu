import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import ActivityCharts from './ActivityCharts';
import RequestTiming, { type RequestTimings } from './RequestTiming';
import RequestGuardrails from './RequestGuardrails';
import { useIsMobile } from '@/hooks/use-mobile';
import RequestContent from './RequestContent';
import { visibleContent } from './request-content';
import ProviderLogo from '@/components/ProviderLogo';
import PageHeader from '@/components/PageHeader';
import { modelIdentity } from '@/lib/providers';
import { Sheet, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table as ShadcnTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconActivity as Activity } from "@tabler/icons-react";
import { IconFilter as ListFilter } from "@tabler/icons-react";
import { IconChevronUp as ChevronUp } from "@tabler/icons-react";
import { IconX as X } from "@tabler/icons-react";
import { IconArrowUpRight as ArrowUpRight } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconCoins as Coins } from "@tabler/icons-react";
import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import { IconStopwatch as Timer } from "@tabler/icons-react";
import { IconRoute as Workflow } from "@tabler/icons-react";
import { IconDotsVertical as EllipsisVertical } from "@tabler/icons-react";
import { IconFileDownload as FileDown } from "@tabler/icons-react";
import { IconShieldOff as ShieldBan } from "@tabler/icons-react";
import { IconAdjustmentsHorizontal as Settings2 } from "@tabler/icons-react";
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
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
  request_kind?: 'video' | 'inference';
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
  timing?: RequestTimings | null;
  execution: string;
  output_guardrail_outcome?: 'allowed' | 'redacted' | 'blocked' | 'indeterminate' | null;
  customer_charge_currency: string | null;
  customer_charge_nanos: string | null;
  customer_charge_status: 'charged' | 'pending' | 'unpriced' | 'not_charged' | string;
  usage_confidence: string;
  prompt_tokens: string | null;
  completion_tokens: string | null;
  cached_input_tokens?: string | null;
  reasoning_output_tokens?: string | null;
  finish_reasons?: Array<{index: number; reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call'}> | null;
};
type ModelUsage = {
  model_alias: string;
  request_count: number;
  usage_count: number;
  prompt_tokens: string;
  completion_tokens: string;
  unknown_usage_count: number;
};
type KeyUsage = {
  api_key_id: string | null;
  key_name: string | null;
  request_count: number;
  usage_count: number;
  prompt_tokens: string;
  completion_tokens: string;
  unknown_usage_count: number;
};
type ActivitySummary = {
  token_categories?: {cached_input_tokens: string | null; cached_input_requests: number; cached_input_unknown_requests: number; reasoning_output_tokens: string | null; reasoning_output_requests: number; reasoning_output_unknown_requests: number};
  latency_percentiles?: {boundary: string; sample_count: number; p50_ms: number | null; p95_ms: number | null; p99_ms: number | null};
  charges_by_model?: ChargeBreakdown[];
  charges_by_key?: ChargeBreakdown[];
  request_count: number;
  delivery_statuses?: Array<{http_status: number | null; request_count: number}>;
  usage_count: number;
  prompt_tokens: string;
  completion_tokens: string;
  timing_count: number;
  average_duration_ms: number | null;
  unresolved_customer_charge_count: number;
  unpriced_request_count: number;
  owner_funded_request_count?: number;
  customer_charges: Array<{ currency: string; amount_nanos: string; charged_requests: number }>;
  usage_by_model: ModelUsage[];
  usage_by_key?: KeyUsage[];
  request_histogram?: Array<{start_ms: number; end_ms: number; request_count: number}>;
};
type ChargeBreakdown = {
  model_alias?: string; api_key_id?: string | null; key_name?: string | null;
  currency: string | null; amount_nanos: string | null; request_count: number;
  charged_requests: number; owner_funded_requests?: number; unresolved_requests: number; unpriced_requests: number; not_charged_requests: number;
};
function chargeGroups(rows: ChargeBreakdown[], byKey: boolean) {
  const groups = new Map<string, {identity: string; name: string; keyId: string | null; model: string; amounts: Map<string, bigint>; requests: number; charged: number; unresolved: number; unpriced: number; ownerFunded: number; notCharged: number}>();
  for (const row of rows) {
    const identity = byKey ? row.api_key_id ?? '' : row.model_alias ?? '';
    const group = groups.get(identity) ?? {
      identity, name: visibleContent(byKey ? row.key_name ?? (row.api_key_id ? 'Key name unavailable' : 'No API key recorded') : row.model_alias ?? 'Model unavailable'),
      keyId: row.api_key_id ?? null, model: row.model_alias ?? '', amounts: new Map<string, bigint>(), requests: 0, charged: 0, unresolved: 0, unpriced: 0, ownerFunded: 0, notCharged: 0,
    };
    if (row.currency !== null && row.amount_nanos !== null) group.amounts.set(row.currency, (group.amounts.get(row.currency) ?? 0n) + BigInt(row.amount_nanos));
    group.requests += row.request_count; group.charged += row.charged_requests;
    group.ownerFunded += row.owner_funded_requests ?? 0;
    group.unresolved += row.unresolved_requests; group.unpriced += row.unpriced_requests; group.notCharged += row.not_charged_requests;
    groups.set(identity, group);
  }
  const currencies = [...new Set(rows.flatMap(row => row.currency === null ? [] : [row.currency]))];
  return [...groups.values()].sort((a, b) => {
    // Rank only comparable amounts; never add or compare different currencies.
    if (currencies.length === 1) {
      const av = a.amounts.get(currencies[0]); const bv = b.amounts.get(currencies[0]);
      if (av === undefined && bv !== undefined) return 1;
      if (bv === undefined && av !== undefined) return -1;
      if (av !== undefined && bv !== undefined && av !== bv) return av > bv ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
type ActivityFilters = { from: string; to: string; model: string; keyId: string; status: string; httpStatus?: string };
const requestSorts = [
  ['time_desc', 'Newest first'], ['time_asc', 'Oldest first'],
  ['latency_desc', 'Highest latency'], ['input_desc', 'Most input tokens'], ['output_desc', 'Most output tokens'],
] as const;
const tokenMetrics = [['total', 'Token usage'], ['input', 'Input tokens'], ['output', 'Output tokens'], ['cached', 'Cached input'], ['reasoning', 'Reasoning']] as const;
const latencyMetrics = [['average', 'Average latency'], ['p50', 'P50 latency'], ['p95', 'P95 latency'], ['p99', 'P99 latency']] as const;
const requestColumns = [
  ['time', 'Time'], ['status', 'Status'], ['latency', 'Latency'],
  ['input', 'Input tokens'], ['output', 'Output tokens'], ['charge', 'Customer charge'], ['key', 'API key'],
] as const;
type RequestColumn = typeof requestColumns[number][0];
type KeyOption = { id: string; name: string; allowed_models: string[]; revoked: boolean; expired: boolean };

async function get<T>(path: string, token: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Could not load gateway activity (${response.status}).`);
  return await response.json() as T;
}

function customerChargeTotals(summary: ActivitySummary) {
  return (summary.customer_charges ?? []).map(item => money(item.amount_nanos, item.currency));
}

function requestLatency(request: GatewayRequest) {
  const duration = request.timing
    ? (request.timing.complete ? request.timing.total_ms : null)
    : request.duration_ms;
  return duration == null ? 'Unknown' : `${duration.toLocaleString()} ms`;
}

function requestCharge(request: GatewayRequest) {
  if (request.customer_charge_status === 'charged' && request.customer_charge_nanos != null && request.customer_charge_currency) {
    return money(request.customer_charge_nanos, request.customer_charge_currency);
  }
  switch (request.customer_charge_status) {
    case 'owner_funded': return 'Own API key';
    case 'pending': return 'Unresolved';
    case 'unpriced': return 'No rate';
    case 'not_charged': return 'Not charged';
    default: return 'Unknown';
  }
}

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
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
    case 'output_withheld': return 'Output withheld';
    case 'delivery_failed': return 'Failed delivery';
    default: return value;
  }
}

function requestStatus(item: GatewayRequest) {
  if (item.output_guardrail_outcome === 'blocked' || item.output_guardrail_outcome === 'indeterminate') return 'Output withheld';
  if (item.timing?.http_status != null && item.timing.http_status >= 400) return `Failed · HTTP ${item.timing.http_status}`;
  return item.output_guardrail_outcome === 'redacted' ? `${statusLabel(item.execution)} · Redacted` : statusLabel(item.execution);
}
const filterStatusLabel = (value: string) => value === 'confirmed_completed' ? 'Provider completed' : statusLabel(value);

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
  if (filters.httpStatus) query.set('http_status', filters.httpStatus);
  return query.toString();
}

function requestEvidenceHref(workspaceRoot: string, filters: ActivityFilters, apiKeyId?: string) {
  const query = new URLSearchParams();
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  if (filters.model) query.set('modelAlias', filters.model);
  const keyId = apiKeyId ?? filters.keyId;
  if (keyId) query.set('keyId', keyId);
  if (filters.status) query.set('status', filters.status);
  if (filters.httpStatus) query.set('httpStatus', filters.httpStatus);
  return `${workspaceRoot}/executions${query.size ? `?${query.toString()}` : ''}`;
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

export default function GatewayActivity({ token, models, initialScope, compact = false, statisticsOnly = false, preferredModelAlias, preferredKeyId, workspaceRoute }: { workspaceRoute?: string; token: string; models: string[]; initialScope?: { organizationId: string; projectId: string } | null; compact?: boolean; statisticsOnly?: boolean; preferredModelAlias?: string; preferredKeyId?: string }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const latencyMetric = latencyMetrics.find(([value]) => value === searchParams.get('latency'))?.[0] ?? 'average';
  function setLatencyMetric(value: string) {
    const query = new URLSearchParams(searchParams);
    if (value === 'average') query.delete('latency'); else query.set('latency', value);
    setSearchParams(query, {replace: true});
  }
  const tokenMetric = tokenMetrics.find(([value]) => value === searchParams.get('tokens'))?.[0] ?? 'total';
  function setTokenMetric(value: string) {
    const query = new URLSearchParams(searchParams);
    if (value === 'total') query.delete('tokens'); else query.set('tokens', value);
    setSearchParams(query, {replace: true});
  }
  const [allChargeGroups, setAllChargeGroups] = useState(false);
  const chargeByKey = searchParams.get('chargeBy') === 'key';
  function setChargeGroup(value: string) {
    setAllChargeGroups(false);
    const query = new URLSearchParams(searchParams);
    if (value === 'key') query.set('chargeBy', 'key'); else query.delete('chargeBy');
    setSearchParams(query, {replace: true});
  }
  const isMobile = useIsMobile();
  const organization = initialScope?.organizationId ?? '';
  const project = initialScope?.projectId ?? '';
  const [requests, setRequests] = useState<GatewayRequest[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const linkedIdentity = JSON.stringify([token, organization, project, location.hash]);
  const [linkedRequest, setLinkedRequest] = useState<{identity:string;data:GatewayRequest} | null>(null);
  const [linkedError, setLinkedError] = useState('');
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [linkedRevision, setLinkedRevision] = useState(0);
  const selectedRequest = requests.find(item => item.attempt_id === selectedAttempt)
    ?? (linkedRequest?.identity === linkedIdentity && linkedRequest.data.attempt_id === selectedAttempt ? linkedRequest.data : undefined);
  const navigate = useNavigate();
  const requestOpener = useRef<HTMLElement | null>(null);
  function openRequest(attemptId: string, opener?: HTMLElement) {
    if (opener) requestOpener.current = opener;
    setSelectedAttempt(attemptId);
    navigate({pathname:location.pathname,search:location.search,hash:`#gateway-attempt-${attemptId}`},{replace:true});
  }
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const detailSheet = useRef<HTMLDivElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!detailSheet.current) return;
    detailSheet.current.scrollTop = 0;
    detailHeading.current?.focus({preventScroll:true});
  }, [selectedAttempt]);
  const [payload, setPayload] = useState<{request: unknown; response: string; content_type: string; complete: boolean; truncated: boolean; expires_at: string} | null>(null);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [payloadError, setPayloadError] = useState('');
  const [payloadRevision, setPayloadRevision] = useState(0);
  const payloadIdentity = JSON.stringify([token, organization, project, selectedAttempt, payloadRevision]);
  const [payloadOwner, setPayloadOwner] = useState('');
  useEffect(() => {
    setPayload(null); setPayloadError('');
    if (!selectedAttempt) return;
    const controller = new AbortController();
    setPayloadLoading(true);
    void get<{data: typeof payload}>(`/admin/v1/organizations/${organization}/projects/${project}/requests/${selectedAttempt}/payloads`, token, controller.signal)
      .then(value => {
        const data = value?.data;
        if (data !== null && (!data || typeof data !== 'object' || !Object.hasOwn(data, 'request')
          || typeof data.response !== 'string' || typeof data.content_type !== 'string'
          || typeof data.complete !== 'boolean' || typeof data.truncated !== 'boolean'
          || typeof data.expires_at !== 'string' || !Number.isFinite(Date.parse(data.expires_at)))) {
          throw new Error('Invalid request content response');
        }
        if (!controller.signal.aborted) { setPayload(data); setPayloadOwner(payloadIdentity); }
      })
      .catch(() => { if (!controller.signal.aborted) { setPayloadError('Could not load request content.'); setPayloadOwner(payloadIdentity); } })
      .finally(() => { if (!controller.signal.aborted) setPayloadLoading(false); });
    return () => controller.abort();
  }, [selectedAttempt, organization, project, token, payloadRevision]);

  useEffect(() => setSelectedAttempt(null), [organization, project, token]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [histogramOpen, setHistogramOpen] = useState(true);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [mobileFilterField, setMobileFilterField] = useState<keyof ActivityFilters | null>(null);
  const [revision, setRevision] = useState(0);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const groupedCharges = chargeGroups((chargeByKey ? summary?.charges_by_key : summary?.charges_by_model) ?? [], chargeByKey);
  const [keys, setKeys] = useState<KeyOption[]>([]);
  const [keyFilterError, setKeyFilterError] = useState('');
  const filters = useMemo<ActivityFilters>(() => ({
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
    model: searchParams.get('modelAlias') ?? '',
    keyId: preferredKeyId ?? searchParams.get('keyId') ?? '',
    status: searchParams.get('status') ?? '',
    httpStatus: searchParams.get('httpStatus') ?? '',
  }), [searchParams, preferredKeyId]);
  function setFilters(update: ActivityFilters | ((current: ActivityFilters) => ActivityFilters)) {
    const next = typeof update === 'function' ? update(filters) : update;
    const query = new URLSearchParams(searchParams);
    for (const [field, name] of [['from', 'from'], ['to', 'to'], ['model', 'modelAlias'], ['keyId', 'keyId'], ['status', 'status'], ['httpStatus', 'httpStatus']] as const) {
      if (next[field]) query.set(name, next[field]);
      else query.delete(name);
    }
    if (query.toString() !== searchParams.toString()) setSearchParams(query, { replace: true });
  }
  const columnParameter = searchParams.get('columns');
  const defaultColumns: RequestColumn[] = isMobile ? ['status'] : requestColumns.map(([column]) => column);
  const shownColumns = new Set<RequestColumn>(compact ? (isMobile ? ['status'] : ['time', 'status', 'latency']) : columnParameter === null ? defaultColumns : requestColumns.filter(([column]) => columnParameter.split(',').includes(column)).map(([column]) => column));
  function toggleColumn(column: RequestColumn, checked: boolean) {
    const next = new Set(shownColumns);
    if (checked) next.add(column); else next.delete(column);
    const query = new URLSearchParams(searchParams);
    query.set('columns', requestColumns.filter(([name]) => next.has(name)).map(([name]) => name).join(','));
    setSearchParams(query, {replace: true});
  }
  function resetColumns() {
    const query = new URLSearchParams(searchParams); query.delete('columns');
    setSearchParams(query, {replace: true});
  }
  const olderController = useRef<AbortController | null>(null);
  const preferredAliasApplied = useRef('');
  const workspaceRoot = workspaceRoute ?? location.pathname.match(/^(.*\/workspaces\/[^/]+)/)?.[0] ?? '/workspaces/default';
  const newChatHref = `/generations?${new URLSearchParams({new: '1', workspace: decodeURIComponent(workspaceRoot.split('/').pop() ?? 'default')})}`;
  const sort = searchParams.get('sort') ?? 'time_desc';
  const activityFilterQuery = useMemo(() => {
    const query = new URLSearchParams(filterQuery(filters));
    if (sort !== 'time_desc') query.set('sort', sort);
    return query.toString();
  }, [filters, sort]);
  function setSort(value: string) {
    const query = new URLSearchParams(searchParams);
    if (value === 'time_desc') query.delete('sort'); else query.set('sort', value);
    setSearchParams(query, {replace: true});
  }
  const invalidDateRange = Boolean(filters.from && filters.to && filters.from > filters.to);
  const hasActivityFilters = Boolean(filterQuery({...filters, keyId: preferredKeyId ? '' : filters.keyId}));
  const exportController = useRef<AbortController | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    exportController.current?.abort();
    exportController.current = null;
    setExporting(false);
    setExportError('');
    return () => exportController.current?.abort();
  }, [token, organization, project, activityFilterQuery]);

  async function exportRequests() {
    if (!organization || !project || invalidDateRange || exportController.current) return;
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setExportError('');
    try {
      const response = await fetch(`/admin/v1/organizations/${organization}/projects/${project}/requests/export${activityFilterQuery ? `?${activityFilterQuery}` : ''}`, {
        signal: controller.signal, headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(response.status === 413
        ? 'Too many requests to export. Narrow the date range, model or API key filter to 10,000 requests or fewer.'
        : `Could not export requests (${response.status}). Try again.`);
      const content = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'niu-requests.csv';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (reason) {
      if (!controller.signal.aborted) setExportError(reason instanceof Error ? reason.message : 'Could not export requests. Try again.');
    } finally {
      if (exportController.current === controller) {
        exportController.current = null;
        setExporting(false);
      }
    }
  }

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
    query.set('limit', compact ? '10' : '100');
    void get<{ data: GatewayRequest[]; next_cursor: string | null; summary: ActivitySummary }>(`/admin/v1/organizations/${organization}/projects/${project}/requests?${query}`, token, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setRequests(value.data); setNextCursor(value.next_cursor); setSummary(value.summary); } })
      .catch(reason => { if (!controller.signal.aborted) setError((reason as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {
      controller.abort();
      olderController.current?.abort();
    };
  }, [token, organization, project, revision, activityFilterQuery, invalidDateRange, compact]);

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

  const histogram = useMemo(() => {
    const observed = summary?.request_histogram;
    if (!observed?.length) return null;
    const from = Date.parse(filters.from);
    const to = Date.parse(filters.to);
    const start = Number.isFinite(from) ? from : Math.min(...observed.map(bucket => bucket.start_ms));
    const end = Number.isFinite(to) ? to : Math.max(...observed.map(bucket => bucket.end_ms));
    return {buckets: observed.map(bucket => ({start: bucket.start_ms, end: bucket.end_ms, count: bucket.request_count})),
      max: Math.max(1, ...observed.map(bucket => bucket.request_count)), start, end};
  }, [summary, filters.from, filters.to]);
  const aggregate = summary ? {
    ...summary,
    unresolved_customer_charge_count: summary.unresolved_customer_charge_count ?? 0,
    unpriced_request_count: summary.unpriced_request_count ?? 0,
    owner_funded_request_count: summary.owner_funded_request_count ?? 0,
    customer_charges: summary.customer_charges ?? [],
    usage_by_model: summary.usage_by_model ?? [],
    usage_by_key: summary.usage_by_key ?? [],
  } : {
    request_count: 0, usage_count: 0, prompt_tokens: '0', completion_tokens: '0',
    timing_count: 0, average_duration_ms: null, unresolved_customer_charge_count: 0,
    unpriced_request_count: 0, owner_funded_request_count: 0, customer_charges: [], usage_by_model: [], usage_by_key: [],
  };
  const hasCustomerChargeData = Boolean(summary?.customer_charges);
  const hasModelUsageData = Boolean(summary?.usage_by_model);
  const aggregateTokens = (BigInt(aggregate.prompt_tokens) + BigInt(aggregate.completion_tokens)).toLocaleString();
  const categories = summary?.token_categories;
  const categoryMetric = tokenMetric === 'cached' || tokenMetric === 'reasoning';
  const tokenValue = tokenMetric === 'cached' ? categories?.cached_input_tokens
    : tokenMetric === 'reasoning' ? categories?.reasoning_output_tokens
    : tokenMetric === 'input' ? summary?.prompt_tokens
    : tokenMetric === 'output' ? summary?.completion_tokens : undefined;
  const tokenDisplay = !summary ? '—' : tokenMetric === 'total' ? aggregateTokens
    : tokenValue == null ? '—' : BigInt(tokenValue).toLocaleString();
  const categoryReported = tokenMetric === 'cached' ? categories?.cached_input_requests : categories?.reasoning_output_requests;
  const categoryUnknown = tokenMetric === 'cached' ? categories?.cached_input_unknown_requests : categories?.reasoning_output_unknown_requests;
  const tokenCoverage = !summary ? 'Range total unavailable'
    : categoryMetric ? categories
      ? `${categoryReported?.toLocaleString()} reported · ${categoryUnknown?.toLocaleString()} unknown · included in ${tokenMetric === 'cached' ? 'input' : 'output'}`
      : 'Category reporting unavailable'
    : tokenMetric === 'total'
      ? `${BigInt(aggregate.prompt_tokens).toLocaleString()} prompt · ${BigInt(aggregate.completion_tokens).toLocaleString()} output · ${aggregate.usage_count} with reported usage`
      : `${aggregate.usage_count.toLocaleString()} reported · ${(aggregate.request_count - aggregate.usage_count).toLocaleString()} unknown`;
  const customerTotals = customerChargeTotals(aggregate);
  const chargeCoverage = [
    aggregate.owner_funded_request_count ? `${aggregate.owner_funded_request_count} with own API keys` : '',
    aggregate.unresolved_customer_charge_count ? `${aggregate.unresolved_customer_charge_count} unresolved` : '',
    aggregate.unpriced_request_count ? `${aggregate.unpriced_request_count} without a customer rate` : '',
  ].filter(Boolean).join(' · ');
  const averageDuration = summary?.average_duration_ms;
  const percentileTiming = summary?.latency_percentiles?.boundary === 'gateway_body_ms' ? summary.latency_percentiles : undefined;
  const latencyValue = latencyMetric === 'average' ? averageDuration : percentileTiming?.[`${latencyMetric}_ms`];
  const latencySamples = latencyMetric === 'average' ? summary?.timing_count : percentileTiming?.sample_count;

  useEffect(() => {
    const prefix = '#gateway-attempt-';
    if (!location.hash.startsWith(prefix)) { setSelectedAttempt(null); return; }
    if (loading) return;
    const attemptId = location.hash.slice(prefix.length);
    const target = document.getElementById(`gateway-attempt-${attemptId}`);
    if (!target) return;
    setSelectedAttempt(attemptId);
    if (!requestOpener.current?.isConnected) requestOpener.current = target;
    target.classList.add('is-focused');
    target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
    return () => target.classList.remove('is-focused');
  }, [loading, requests, location.hash]);

  useEffect(() => {
    const controller = new AbortController();
    setLinkedError('');setLinkedLoading(false);
    const prefix = '#gateway-attempt-';
    const attempt = location.hash.startsWith(prefix) ? location.hash.slice(prefix.length) : '';
    if (!attempt || loading || error || !organization || !project || requests.some(item=>item.attempt_id===attempt)) return () => controller.abort();
    setLinkedLoading(true);
    void get<{data:GatewayRequest}>(`/admin/v1/organizations/${organization}/projects/${project}/requests/${encodeURIComponent(attempt)}`,token,controller.signal)
      .then(value=>{
        if (controller.signal.aborted) return;
        if (!value.data || value.data.attempt_id !== attempt) throw new Error('Invalid request details');
        setLinkedRequest({identity:linkedIdentity,data:value.data});setSelectedAttempt(attempt);
      })
      .catch(()=>{if (!controller.signal.aborted) setLinkedError('Could not open the linked request. It may be unavailable or outside this workspace.');})
      .finally(()=>{if (!controller.signal.aborted) setLinkedLoading(false);});
    return () => controller.abort();
  }, [linkedIdentity, linkedRevision, loading, error, requests, organization, project, token]);

  return <>
    {linkedLoading && <p role="status">Loading linked request…</p>}
    {linkedError && <div role="alert" className="page-error"><span>{linkedError}</span><Button variant="outline" size="sm" onClick={()=>setLinkedRevision(value=>value+1)}>Retry linked request</Button></div>}

    {error && <div role="alert" className="page-error"><span>{error}</span><Button variant="outline" size="sm" onClick={() => setRevision(value => value + 1)}>Try again</Button></div>}
    {!project && <section className="panel empty-state"><strong>Choose a workspace</strong><span>Select or create a workspace to view its activity.</span></section>}
    {project && <>
      {!compact && <PageHeader title={statisticsOnly ? 'Activity' : 'Logs'} action={<>
        <Button asChild variant="outline" className="header-icon-action"><Link to={`${workspaceRoot}/guardrails/denials`} aria-label="Blocked requests" title="Blocked requests"><ShieldBan size={16} /><span>Blocked requests</span></Link></Button>
        <Button variant="ghost" size="icon" disabled={loading} onClick={() => setRevision(value => value + 1)} aria-label="Refresh requests" title="Refresh requests"><RefreshCw size={16} /></Button>
      </>} />}
      {!compact && <section className="request-toolbar" aria-label="Filter request activity">
        <h2>Requests <span>{summary?.request_count.toLocaleString() ?? '—'}</span>{sort !== 'time_desc' && <span>{requestSorts.find(([value]) => value === sort)?.[1] ?? 'Unknown sort'}</span>}</h2>
        <div className="request-toolbar-actions">
          <DropdownMenu open={filterMenuOpen} onOpenChange={open => { setFilterMenuOpen(open); if (!open) setMobileFilterField(null); }}><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Filter requests" title="Filter requests"><ListFilter size={16} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" collisionPadding={16} className={isMobile ? "w-72 max-w-[calc(100vw-32px)]" : "w-52"}>
              {([
                ['model', 'Model', [...new Set([...models, ...requests.map(item => item.model)])].map(value => ({ value, label: value }))],
                ['keyId', 'API key', keys.map(key => ({ value: key.id, label: key.name }))],
                ['status', 'Status', ['confirmed_completed', 'output_withheld', 'delivery_failed', 'may_have_executed', 'confirmed_not_executed', 'not_sent'].map(value => ({ value, label: filterStatusLabel(value) }))],
                ['httpStatus', 'HTTP status', [...new Set(['unknown', ...(summary?.delivery_statuses ?? []).map(item => item.http_status === null ? 'unknown' : String(item.http_status)), ...(filters.httpStatus ? [filters.httpStatus] : [])])].map(value => ({value, label: value === 'unknown' ? 'Unknown' : `HTTP ${value}`}))],
              ] as Array<[keyof ActivityFilters, string, Array<{value: string; label: string}>]>).map(([field, label, options]) => isMobile ? mobileFilterField === null ? <DropdownMenuItem key={field} onSelect={event => { event.preventDefault(); setMobileFilterField(field); }}>{label}</DropdownMenuItem> : mobileFilterField === field ? <div key={field}>
                <DropdownMenuItem onSelect={event => { event.preventDefault(); setMobileFilterField(null); }}>← Filters</DropdownMenuItem>
                <DropdownMenuSeparator /><DropdownMenuLabel>{label}</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={filters[field] || '__all__'} onValueChange={value => { updateFilter(field, value === '__all__' ? '' : value); setFilterMenuOpen(false); setMobileFilterField(null); }}>
                  <DropdownMenuRadioItem value="__all__">All</DropdownMenuRadioItem>
                  {options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value} onSelect={() => setFilterMenuOpen(false)}>{option.label}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </div> : null : <DropdownMenuSub key={field}>
                <DropdownMenuSubTrigger>{label}</DropdownMenuSubTrigger>
                <DropdownMenuPortal><DropdownMenuSubContent className="max-h-80 overflow-y-auto"><DropdownMenuRadioGroup value={filters[field] || '__all__'} onValueChange={value => { updateFilter(field, value === '__all__' ? '' : value); setFilterMenuOpen(false); }}>
                  <DropdownMenuRadioItem value="__all__">All</DropdownMenuRadioItem>{options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value} onSelect={() => setFilterMenuOpen(false)}>{option.label}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup></DropdownMenuSubContent></DropdownMenuPortal>
              </DropdownMenuSub>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover open={dateMenuOpen} onOpenChange={setDateMenuOpen}><PopoverTrigger asChild><Button variant="outline" className="request-date-trigger">{filters.from || filters.to ? `${filters.from || 'Start'} – ${filters.to || 'Now'}` : 'All time'}<ChevronDown size={14} /></Button></PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <div className="flex gap-2">{[1, 7, 30].map(days => <Button key={days} variant="outline" size="sm" onClick={() => { const date = new Date(); date.setDate(date.getDate() - days + 1); const from = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; setFilters(current => ({...current, from, to: ''})); setDateMenuOpen(false); }}>{days === 1 ? 'Today' : `${days} days`}</Button>)}</div>
              <Label className="grid gap-1 text-sm">From<Input type="date" value={filters.from} max={filters.to || undefined} onChange={event => updateFilter('from', event.target.value)} /></Label>
              <Label className="grid gap-1 text-sm">To<Input type="date" value={filters.to} min={filters.from || undefined} onChange={event => updateFilter('to', event.target.value)} /></Label>
              <Button variant="ghost" size="sm" onClick={() => { setFilters(current => ({...current, from: '', to: ''})); setDateMenuOpen(false); }}>All time</Button>
            </PopoverContent>
          </Popover>
          {!statisticsOnly && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Request actions" title="Request actions" disabled={exporting}><EllipsisVertical size={16} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52"><DropdownMenuLabel>Sort by</DropdownMenuLabel><DropdownMenuRadioGroup value={sort} onValueChange={setSort}>{requestSorts.map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup><DropdownMenuSeparator /><DropdownMenuItem disabled={invalidDateRange || loading || Boolean(error)} onSelect={() => void exportRequests()}><FileDown />Export CSV</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>}
        </div>
        {(filters.model || filters.keyId || filters.status || filters.httpStatus) && <div className="request-filter-chips">{(['model', 'keyId', 'status', 'httpStatus'] as const).filter(field => filters[field]).map(field => <Button key={field} variant="outline" size="sm" onClick={() => updateFilter(field, '')}>{field === 'keyId' ? keys.find(key => key.id === filters.keyId)?.name ?? 'API key' : field === 'status' ? filterStatusLabel(filters.status) : field === 'httpStatus' ? filters.httpStatus === 'unknown' ? 'Unknown delivery status' : `HTTP ${filters.httpStatus}` : filters.model}<X size={12} /><span className="sr-only">Remove filter</span></Button>)}</div>}
        {keyFilterError && <p role="alert">{keyFilterError}</p>}
        {exporting && <p role="status">Preparing export…</p>}
        {exportError && <p role="alert">{exportError}</p>}
      </section>}

      {(statisticsOnly || compact) && !error && <section className="gateway-activity-summary" aria-label={compact && !activityFilterQuery ? 'Workspace request totals' : 'Filtered request totals'} aria-busy={loading}>
        <article className="panel"><span><Activity size={16} />{compact ? 'Requests' : 'Matching requests'}</span><strong>{summary ? aggregate.request_count.toLocaleString() : '—'}</strong><small>{summary ? statisticsOnly ? 'Across matching requests' : `${filters.from || filters.to ? `${filters.from || 'Start'} – ${filters.to || 'Now'}` : 'All time'} · ${requests.length.toLocaleString()} recent shown` : 'Range total unavailable'}</small></article>
        <article className="panel"><span><Workflow size={16} /><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-auto gap-1 p-0 text-xs font-normal" aria-label="Token metric">{tokenMetrics.find(([value]) => value === tokenMetric)?.[1]}<ChevronDown size={12} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={16}><DropdownMenuRadioGroup value={tokenMetric} onValueChange={setTokenMetric}>{tokenMetrics.map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></span><strong>{tokenDisplay}</strong><small>{tokenCoverage}</small></article>
        <article className="panel"><span><Timer size={16} /><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-auto gap-1 p-0 text-xs font-normal" aria-label="Latency metric">{latencyMetrics.find(([value]) => value === latencyMetric)?.[1]}<ChevronDown size={12} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={16}><DropdownMenuRadioGroup value={latencyMetric} onValueChange={setLatencyMetric}>{latencyMetrics.map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></span><strong>{latencyValue == null ? '—' : `${latencyValue.toLocaleString()} ms`}</strong><small>{latencySamples == null ? 'Timing data unavailable' : `${latencySamples.toLocaleString()} ${latencySamples === 1 ? 'complete gateway timing' : 'complete gateway timings'}`}</small></article>
        <article className="panel"><span><Coins size={16} />Customer charges</span><strong>{!summary ? '—' : !hasCustomerChargeData ? 'Unavailable' : customerTotals.length ? customerTotals.join(' · ') : aggregate.unresolved_customer_charge_count ? 'Unresolved' : aggregate.unpriced_request_count ? 'No rate' : aggregate.owner_funded_request_count ? 'Own API key' : '—'}</strong><small>{!summary ? 'Range total unavailable' : !hasCustomerChargeData ? 'Charge data unavailable for this gateway response' : chargeCoverage || 'Settled customer charges only'}</small></article>
      </section>}

      {(statisticsOnly || compact) && !error && <ActivityCharts buckets={summary?.request_histogram} models={aggregate.usage_by_model} compact={compact} loading={loading}/> }

      {statisticsOnly && !error && <section className="panel activity-model-breakdown activity-charge-breakdown" aria-labelledby="charge-breakdown-title">
        <div className="panel-heading"><div><h2 id="charge-breakdown-title">Customer charge breakdown</h2><p>Settled charges and coverage across matching requests.</p></div>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label="Group customer charges">{chargeByKey ? 'API key' : 'Model'}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" collisionPadding={16}><DropdownMenuRadioGroup value={chargeByKey ? 'key' : 'model'} onValueChange={setChargeGroup}><DropdownMenuRadioItem value="model">Model</DropdownMenuRadioItem><DropdownMenuRadioItem value="key">API key</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
        </div>
        {loading ? <p role="status" className="execution-loading">Loading customer charges…</p> : (chargeByKey ? summary?.charges_by_key : summary?.charges_by_model) === undefined ? <p className="activity-model-empty">Charge breakdown unavailable for this gateway response.</p> : <div className="activity-model-table-wrap"><ShadcnTable><TableHeader><TableRow><TableHead>{chargeByKey ? 'API key' : 'Model'}</TableHead><TableHead>Customer charge</TableHead><TableHead>Requests</TableHead></TableRow></TableHeader><TableBody>{(allChargeGroups ? groupedCharges : groupedCharges.slice(0, 10)).map(group => <TableRow key={group.identity}>
          <TableHead scope="row">{(!chargeByKey && group.model) || (chargeByKey && group.keyId) ? <Link aria-label={`View charge requests for ${group.name}`} to={requestEvidenceHref(workspaceRoot, {...filters, ...(!chargeByKey ? {model: group.model} : {})}, chargeByKey ? group.keyId! : undefined)}>{group.name}</Link> : group.name}</TableHead>
          <TableCell>{group.amounts.size ? [...group.amounts].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => <div key={currency}>{money(amount.toString(), currency)}</div>) : group.unresolved ? 'Unresolved' : group.unpriced ? 'No rate' : group.ownerFunded ? 'Own API key' : 'Not charged'}<small>{[group.ownerFunded ? `${group.ownerFunded.toLocaleString()} with own API keys` : '', group.charged ? `${group.charged.toLocaleString()} charged` : '', group.unresolved ? `${group.unresolved.toLocaleString()} unresolved` : '', group.unpriced ? `${group.unpriced.toLocaleString()} without rate` : '', group.notCharged ? `${group.notCharged.toLocaleString()} not charged` : ''].filter(Boolean).join(' · ')}</small></TableCell>
          <TableCell>{group.requests.toLocaleString()}</TableCell>
        </TableRow>)}</TableBody></ShadcnTable>{groupedCharges.length > 10 && <div className="flex items-center justify-between gap-3 p-4 text-sm"><span className="text-muted-foreground">{allChargeGroups ? groupedCharges.length : 10} of {groupedCharges.length} {chargeByKey ? 'API keys' : 'models'}</span><Button variant="ghost" size="sm" aria-expanded={allChargeGroups} onClick={() => setAllChargeGroups(value => !value)}>{allChargeGroups ? 'Show fewer' : 'Show all'}</Button></div>}{!(chargeByKey ? summary?.charges_by_key : summary?.charges_by_model)?.length && <Empty className="min-h-48"><EmptyHeader><EmptyTitle>{hasActivityFilters ? 'No matching requests' : 'No requests yet'}</EmptyTitle></EmptyHeader></Empty>}</div>}
      </section>}

      {statisticsOnly && !error && <section className="panel activity-key-breakdown" aria-labelledby="activity-key-title">
        <div className="panel-heading"><div><h2 id="activity-key-title">Top API keys</h2><p>Workspace keys ranked by reported token volume for this date range.</p></div><Link to={requestEvidenceHref(workspaceRoot, filters)}>Investigate requests<ArrowUpRight size={15} /></Link></div>
        {loading ? <p role="status" className="execution-loading">Loading API key usage…</p> : aggregate.usage_by_key.length ? <div className="activity-key-usage-list">
          {aggregate.usage_by_key.map((item, index) => {
            const reportedTokens = BigInt(item.prompt_tokens) + BigInt(item.completion_tokens);
            const keyName = item.key_name ?? (item.api_key_id ? 'Key name unavailable' : 'No API key recorded');
            return <div className="activity-key-usage-row" key={item.api_key_id ?? `unattributed-${index}`}>
              <div className="activity-key-usage-info"><strong>{keyName}</strong><small>{item.request_count.toLocaleString()} {item.request_count === 1 ? 'request' : 'requests'} · {item.usage_count.toLocaleString()} with reported usage{item.unknown_usage_count ? ` · ${item.unknown_usage_count.toLocaleString()} unknown` : ''}</small></div>
              <div className="activity-key-usage-metrics"><strong>{item.usage_count ? `${reportedTokens.toLocaleString()} tokens` : 'Unknown'}</strong>{item.api_key_id && <Link to={requestEvidenceHref(workspaceRoot, filters, item.api_key_id)}>View requests<ArrowUpRight size={14} /></Link>}</div>
            </div>;
          })}
        </div> : <Empty className="min-h-48"><EmptyHeader><EmptyTitle>{hasActivityFilters ? 'No matching API key activity' : 'No API key activity yet'}</EmptyTitle><EmptyDescription>{hasActivityFilters ? 'No workspace key activity matches these filters.' : 'Requests attributed to a workspace key appear here.'}</EmptyDescription></EmptyHeader></Empty>}
      </section>}

      {statisticsOnly && !error && Boolean(summary?.delivery_statuses?.length) && <section className="panel activity-model-breakdown" aria-labelledby="delivery-status-title">
        <div className="panel-heading"><div><h2 id="delivery-status-title">Delivery status</h2><p>Recorded HTTP responses across matching requests. Missing status remains unknown.</p></div></div>
        <div className="activity-model-table-wrap"><ShadcnTable><TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Requests</TableHead></TableRow></TableHeader><TableBody>{summary?.delivery_statuses?.map(item => <TableRow key={item.http_status ?? 'unknown'}><TableHead scope="row"><Link to={requestEvidenceHref(workspaceRoot, {...filters, httpStatus: item.http_status === null ? 'unknown' : String(item.http_status)})}>{item.http_status === null ? 'Unknown' : `HTTP ${item.http_status}`}</Link></TableHead><TableCell>{item.request_count.toLocaleString()}</TableCell></TableRow>)}</TableBody></ShadcnTable></div>
      </section>}

      {statisticsOnly && !error && <section className="panel activity-model-breakdown">
        <div className="panel-heading"><div><h2>Model usage</h2><p>Ranked by reported token volume.</p></div><Link to={requestEvidenceHref(workspaceRoot, filters)}>Investigate requests<ArrowUpRight size={15} /></Link></div>
        {loading ? <p role="status" className="execution-loading">Loading model activity…</p> : !hasModelUsageData ? <p className="activity-model-empty">Model usage data is unavailable for this gateway response.</p> : aggregate.usage_by_model.length ? <div className="activity-model-table-wrap"><ShadcnTable><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Requests</TableHead><TableHead>Input tokens</TableHead><TableHead>Output tokens</TableHead><TableHead>Usage coverage</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{aggregate.usage_by_model.map(item => <TableRow key={item.model_alias}><TableHead scope="row">{item.model_alias}</TableHead><TableCell>{item.request_count.toLocaleString()}</TableCell><TableCell>{item.usage_count ? BigInt(item.prompt_tokens).toLocaleString() : 'Unknown'}</TableCell><TableCell>{item.usage_count ? BigInt(item.completion_tokens).toLocaleString() : 'Unknown'}</TableCell><TableCell>{item.unknown_usage_count ? `${item.usage_count} reported · ${item.unknown_usage_count} unknown` : `${item.usage_count} reported`}</TableCell><TableCell><Button asChild variant="ghost" size="icon"><Link aria-label={`View requests for ${item.model_alias}`} to={requestEvidenceHref(workspaceRoot, { ...filters, model: item.model_alias })} title="View requests"><span className="sr-only">View requests</span><ArrowUpRight size={16} aria-hidden="true" /></Link></Button></TableCell></TableRow>)}</TableBody></ShadcnTable></div> : <Empty className="min-h-60"><EmptyHeader><EmptyTitle>{hasActivityFilters ? 'No matching model activity' : 'No model activity yet'}</EmptyTitle><EmptyDescription>{hasActivityFilters ? 'Adjust or clear the filters to see more activity.' : 'Calls sent through Chat or your application appear here.'}</EmptyDescription></EmptyHeader><EmptyContent>{hasActivityFilters ? <Button variant="outline" onClick={() => setFilters({from: '', to: '', model: '', keyId: preferredKeyId ?? '', status: ''})}>Clear filters</Button> : <Button asChild variant="outline"><Link to={newChatHref}>Open Chat<ArrowUpRight size={14} /></Link></Button>}</EmptyContent></Empty>}
        <div className="activity-stat-links"><Link to="../billing">View billing<ArrowUpRight size={14} /></Link></div>
      </section>}

      {!statisticsOnly && <section className={`gateway-task-feed panel${compact ? ' is-compact' : ''}`} aria-labelledby="gateway-task-feed-title" aria-busy={loading}>
        <div className="gateway-task-feed-heading" hidden={!compact}><div><h2 id="gateway-task-feed-title">{compact ? 'Recent requests' : 'Requests'}</h2></div><div className="gateway-feed-actions">{compact && <Link to={requestEvidenceHref(workspaceRoot, filters)}>View all requests<ArrowUpRight size={15} /></Link>}{!compact && <Badge variant="outline">{requests.length.toLocaleString()} requests</Badge>}</div></div>
        {!compact && !loading && histogram && <section className="request-histogram" aria-label="Request volume">
          <div className="request-histogram-heading"><span>Request volume</span><Button variant="ghost" size="icon" aria-label={histogramOpen ? 'Hide request histogram' : 'Show request histogram'} onClick={() => setHistogramOpen(value => !value)}>{histogramOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Button></div>
          {histogramOpen && <><svg viewBox="0 0 960 90" preserveAspectRatio="none" role="img" aria-label="Requests over time">{histogram.buckets.map((bucket, index) => <rect key={index} x={(bucket.start - histogram.start) / (histogram.end - histogram.start) * 960 + 4} y={90 - bucket.count / histogram.max * 80} width={Math.max(1, (bucket.end - bucket.start) / (histogram.end - histogram.start) * 960 - 10)} height={bucket.count / histogram.max * 80} rx="2" fill="currentColor"><title>{timestamp(new Date(bucket.start).toISOString())}: {bucket.count} requests</title></rect>)}</svg><div className="request-histogram-axis"><span>{timestamp(new Date(histogram.start).toISOString())}</span><span>{timestamp(new Date(histogram.end).toISOString())}</span></div></>}
        </section>}
        {loading && <p role="status" className="execution-loading">Loading requests…</p>}
        {!loading && !error && requests.length === 0 && <Empty className="gateway-task-empty"><EmptyHeader><EmptyMedia variant="icon"><Activity aria-hidden="true"/></EmptyMedia><EmptyTitle role="heading" aria-level={3}>{hasActivityFilters ? 'No matching requests' : 'No requests yet'}</EmptyTitle><EmptyDescription>{hasActivityFilters ? 'Adjust or clear the filters to see more activity.' : 'Calls sent through Chat or your application appear here.'}</EmptyDescription></EmptyHeader>{(hasActivityFilters || !compact) && <EmptyContent>{hasActivityFilters ? <Button type="button" variant="outline" onClick={() => setFilters({ from: '', to: '', model: '', keyId: preferredKeyId ?? '', status: '' })}>Clear filters</Button> : <Button asChild variant="outline"><Link to={newChatHref}>Open Chat<ArrowUpRight size={16} /></Link></Button>}</EmptyContent>}</Empty>}
        {!loading && requests.length > 0 && <div className="gateway-request-table-wrap"><ShadcnTable className={`gateway-request-table${compact ? ` is-compact${isMobile ? ' is-mobile-summary' : ''}` : ` has-column-controls${isMobile && shownColumns.has('status') && [...shownColumns].every(column => column === 'status' || column === 'charge') ? ' is-mobile-diagnosis' : ''}`}`}><TableHeader><TableRow>{shownColumns.has('time') && <TableHead>Time</TableHead>}<TableHead>Model</TableHead>{requestColumns.filter(([name]) => name !== 'time' && shownColumns.has(name)).map(([name, label]) => <TableHead key={name} className={`request-column-${name}`}>{label}</TableHead>)}{!compact && <TableHead className="request-column-controls"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Table settings" title="Table settings"><Settings2 size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuLabel>Columns</DropdownMenuLabel><DropdownMenuCheckboxItem checked disabled>Model</DropdownMenuCheckboxItem>{requestColumns.map(([name, label]) => <DropdownMenuCheckboxItem key={name} checked={shownColumns.has(name)} onCheckedChange={checked => toggleColumn(name, checked)} onSelect={event => event.preventDefault()}>{label}</DropdownMenuCheckboxItem>)}<DropdownMenuSeparator /><DropdownMenuItem disabled={columnParameter === null} onSelect={resetColumns}>Reset columns</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableHead>}</TableRow></TableHeader><TableBody>{requests.map(item => <TableRow id={`gateway-attempt-${item.attempt_id}`} aria-label={`${item.model.split('/').slice(-1)[0]} · ${timestamp(item.created_at)} · ${requestStatus(item)}`} tabIndex={0} onClick={event => openRequest(item.attempt_id, event.currentTarget)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openRequest(item.attempt_id, event.currentTarget); } }} key={item.attempt_id}>
          {shownColumns.has('time') && <TableCell>{timestamp(item.created_at)}</TableCell>}<TableHead scope="row"><Button variant="link" className="h-auto p-0 text-left font-normal gap-2 max-w-full whitespace-nowrap" onClick={() => openRequest(item.attempt_id)}><ProviderLogo provider={modelIdentity({ id: item.model })} size="small" />{item.model.split('/').slice(-1)[0]}</Button>{isMobile && !shownColumns.has('time') && <small className="request-summary-time">{timestamp(item.created_at)}</small>}{item.provider_model && item.provider_model !== item.model && <small>Provider · {item.provider_model}</small>}</TableHead>{shownColumns.has('status') && <TableCell className="request-column-status"><span className={`gateway-table-status ${(['blocked', 'indeterminate'].includes(item.output_guardrail_outcome ?? '') || (item.timing?.http_status ?? 0) >= 400) ? 'is-failed' : item.execution === 'confirmed_completed' ? 'is-complete' : item.execution === 'confirmed_not_executed' ? 'is-failed' : 'is-pending'}`}>{requestStatus(item)}</span></TableCell>}{shownColumns.has('latency') && <TableCell>{requestLatency(item)}</TableCell>}{shownColumns.has('input') && <TableCell>{item.prompt_tokens == null ? 'Unknown' : BigInt(item.prompt_tokens).toLocaleString()}</TableCell>}{shownColumns.has('output') && <TableCell>{item.completion_tokens == null ? 'Unknown' : BigInt(item.completion_tokens).toLocaleString()}</TableCell>}{shownColumns.has('charge') && <TableCell className="request-column-charge">{requestCharge(item)}</TableCell>}{shownColumns.has('key') && <TableCell>{item.key_name ?? 'Unknown'}</TableCell>}{!compact && <TableCell />}
        </TableRow>)}</TableBody></ShadcnTable></div>}
        {!compact && !loading && nextCursor && <div className="gateway-task-history"><Button type="button" variant="outline" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? 'Loading older requests…' : 'Load older requests'}</Button></div>}

      </section>}
    </>}
    <Sheet open={Boolean(selectedRequest)} onOpenChange={open => { if (!open) { setSelectedAttempt(null); if (location.hash.startsWith('#gateway-attempt-')) navigate({pathname:location.pathname,search:location.search,hash:''},{replace:true}); } }}>
      <SheetContent className="w-full gap-0 overflow-hidden sm:max-w-xl" onOpenAutoFocus={event => {
        event.preventDefault();
        detailHeading.current?.focus({preventScroll:true});
      }} onCloseAutoFocus={event => {
        if (requestOpener.current?.isConnected) { event.preventDefault(); requestOpener.current.focus({preventScroll:true}); }
        requestOpener.current = null;
      }}>
        <SheetHeader className="shrink-0 pr-12"><SheetTitle ref={detailHeading} tabIndex={-1}>Request details</SheetTitle><SheetDescription className="flex min-w-0 items-center gap-2 break-all">{selectedRequest && <ProviderLogo provider={modelIdentity({ id: selectedRequest.model })} size="small" />}{selectedRequest?.model}</SheetDescription></SheetHeader>
        {selectedRequest && <div ref={detailSheet} role="region" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto p-6 space-y-6 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2" aria-label="Request detail content">
          <div className="request-detail-metrics">
            <div><span>{selectedRequest.request_kind === 'video' ? 'Observed elapsed':'Latency'}</span><strong>{requestLatency(selectedRequest)}</strong></div>
            <div><span>Customer charge</span><strong>{requestCharge(selectedRequest)}</strong></div>
            {selectedRequest.request_kind !== 'video' && <>
            <div><span>Input tokens</span><strong className="break-all">{selectedRequest.prompt_tokens == null ? '—' : BigInt(selectedRequest.prompt_tokens).toLocaleString()}</strong><small className="text-xs text-muted-foreground">Cached: {selectedRequest.cached_input_tokens == null ? 'Unknown' : BigInt(selectedRequest.cached_input_tokens).toLocaleString()}</small></div>
            <div><span>Output tokens</span><strong className="break-all">{selectedRequest.completion_tokens == null ? '—' : BigInt(selectedRequest.completion_tokens).toLocaleString()}</strong><small className="text-xs text-muted-foreground">Reasoning: {selectedRequest.reasoning_output_tokens == null ? 'Unknown' : BigInt(selectedRequest.reasoning_output_tokens).toLocaleString()}</small></div>
            </>}
          </div>
          {selectedRequest.request_kind === 'video' ? <div className="grid justify-items-start gap-2"><p className="text-sm text-muted-foreground">Video generation is asynchronous. Inspect saved status, lifecycle timing and the original charge in Video.</p><Button asChild variant="outline"><Link to={`/generations?${new URLSearchParams({mode:'video',workspace:location.pathname.match(/^\/workspaces\/([^/]+)/)?.[1] ?? project,job:selectedRequest.attempt_id,...(selectedRequest.api_key_id ? {key:selectedRequest.api_key_id}:{})})}`}>Open video result</Link></Button></div> : <RequestTiming timing={selectedRequest.timing} outputTokens={selectedRequest.completion_tokens} />}
          <RequestGuardrails
            key={`${token}:${organization}:${project}:${selectedRequest.attempt_id}`}
            token={token}
            endpoint={`/admin/v1/organizations/${organization}/projects/${project}/requests/${selectedRequest.attempt_id}/guardrails`}
            historyPath={`${location.pathname.match(/^\/workspaces\/[^/]+/)?.[0] ?? '/workspaces/default'}/guardrails/history`}
          />
          <div className="gateway-request-detail"><h3 className="mb-3 text-sm font-medium">Overview</h3><dl><div><dt>Provider model</dt><dd>{selectedRequest.provider_model ?? 'Unknown'}</dd></div><div><dt>Provider status</dt><dd>{statusLabel(selectedRequest.execution)}</dd></div>{selectedRequest.request_kind !== 'video' && <div><dt>Finish reason</dt><dd>{selectedRequest.finish_reasons?.length ? selectedRequest.finish_reasons.map(choice => <span className="block" key={choice.index}>{selectedRequest.finish_reasons!.length > 1 ? `Choice ${choice.index + 1}: ` : ''}{{stop: 'Stopped', length: 'Token limit reached', tool_calls: 'Tool calls', content_filter: 'Content filter', function_call: 'Function call'}[choice.reason] ?? 'Unknown'}</span>) : 'Not reported'}</dd></div>}{selectedRequest.timing?.http_status != null && <div><dt>Delivery status</dt><dd>HTTP {selectedRequest.timing.http_status}</dd></div>}<div><dt>Time</dt><dd>{timestamp(selectedRequest.created_at)}</dd></div><div><dt>API key</dt><dd>{selectedRequest.key_name ?? 'Unknown'}</dd></div></dl></div>

          {payloadLoading || payloadOwner !== payloadIdentity ? <p role="status">Loading request content…</p> : payloadError ? <div className="grid justify-items-start gap-3"><p role="alert">{payloadError}</p><Button variant="outline" size="sm" onClick={() => setPayloadRevision(value => value + 1)}>Retry request content</Button></div> : payload ? <div className="space-y-4">
            <RequestContent key={selectedRequest.attempt_id} payload={payload} />
            <p className="text-sm text-muted-foreground">{payload.truncated ? 'Response exceeds the capture limit; only the first 1 MB is shown. ' : ''}{!payload.complete ? 'The response did not finish. ' : ''}Content expires {timestamp(payload.expires_at)}.</p>
          </div> : <p className="text-sm text-muted-foreground">Request and response bodies were not retained or have expired.</p>}
        </div>}
        {selectedRequest && <SheetFooter className="shrink-0 flex-row justify-between">
            <Button variant="outline" size="sm" disabled={requests.findIndex(item => item.attempt_id === selectedAttempt) <= 0} onClick={() => openRequest(requests[requests.findIndex(item => item.attempt_id === selectedAttempt) - 1].attempt_id)}>Previous request</Button>
            <Button variant="outline" size="sm" disabled={requests.findIndex(item => item.attempt_id === selectedAttempt) < 0 || requests.findIndex(item => item.attempt_id === selectedAttempt) >= requests.length - 1} onClick={() => openRequest(requests[requests.findIndex(item => item.attempt_id === selectedAttempt) + 1].attempt_id)}>Next request</Button>
        </SheetFooter>}
      </SheetContent>
    </Sheet>
  </>;
}
