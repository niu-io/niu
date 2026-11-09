import { readLocale as readUILocale } from '@/shell/ui-locale';
import { translateUI, readLocale, formatLocalizedMessage, useLocale as useUILocale } from '@/shell/ui-locale';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { FormSectionSkeleton, ListRowsSkeleton, TableSkeleton } from '@/components/PageSkeletons';
import { fetchQuery, peekQuery } from '@/lib/query-cache';
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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconActivity as Activity } from "@tabler/icons-react";
import { IconFilter as ListFilter } from "@tabler/icons-react";
import { IconChevronUp as ChevronUp } from "@tabler/icons-react";
import { IconX as X } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconCoins as Coins } from "@tabler/icons-react";
import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import { IconStopwatch as Timer } from "@tabler/icons-react";
import { IconRoute as Workflow } from "@tabler/icons-react";
import { IconDotsVertical as EllipsisVertical } from "@tabler/icons-react";
import { IconFileDownload as FileDown } from "@tabler/icons-react";
import { IconShieldOff as ShieldBan } from "@tabler/icons-react";
import { IconAdjustmentsHorizontal as Settings2, IconArrowUpRight as ArrowUpRight } from "@tabler/icons-react";
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { formatUnitAtoms, money } from '@/lib/money';

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
type UnitChargeDetail = {
  definition_revision: string;
  name?: string;
  unit_name?: string;
  display_precision: number;
  atoms_per_unit: string;
  charged_atoms: string;
  restored_atoms: string;
  net_atoms: string;
};
type GatewayRequest = {
  admission_denial?: import('@niu-io/sdk/admin').GatewayAdmissionDenial | null;
  request_kind?: 'video' | 'inference';
  attempt_id: string;
  reference?: string;
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
  failure?: {kind: string; upstream_http_status: number | null} | null;
  output_guardrail_outcome?: 'allowed' | 'redacted' | 'blocked' | 'indeterminate' | null;
  customer_charge_currency: string | null;
  customer_charge_nanos: string | null;
  customer_unit_charge?: UnitChargeDetail | null;
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
type UnitChargeBreakdown = {
  model_alias?: string;
  api_key_id?: string | null;
  key_name?: string | null;
  definition_revision: string;
  name?: string;
  unit_name?: string;
  display_precision: number;
  atoms_per_unit: string;
  charged_atoms: string;
  restored_atoms: string;
  net_atoms: string;
  charged_requests: number;
};
function unitLabel(item: { name?: string; unit_name?: string }): string {
  return item.name || item.unit_name || 'Credits';
}
type ActivitySummary = {
  token_categories?: {cached_input_tokens: string | null; cached_input_requests: number; cached_input_unknown_requests: number; reasoning_output_tokens: string | null; reasoning_output_requests: number; reasoning_output_unknown_requests: number};
  latency_percentiles?: {boundary: string; sample_count: number; p50_ms: number | null; p95_ms: number | null; p99_ms: number | null};
  charges_by_model?: ChargeBreakdown[];
  charges_by_key?: ChargeBreakdown[];
  unit_charges_by_model?: UnitChargeBreakdown[];
  unit_charges_by_key?: UnitChargeBreakdown[];
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
  customer_unit_charges?: Array<{ definition_revision: string; name?: string; unit_name?: string; display_precision: number; atoms_per_unit: string; charged_atoms: string; restored_atoms: string; net_atoms: string; charged_requests: number }>;
  usage_by_model: ModelUsage[];
  usage_by_key?: KeyUsage[];
  request_histogram?: Array<{start_ms: number; end_ms: number; request_count: number}>;
};
type ChargeBreakdown = {
  model_alias?: string; api_key_id?: string | null; key_name?: string | null;
  currency: string | null; amount_nanos: string | null; request_count: number;
  charged_requests: number; owner_funded_requests?: number; unresolved_requests: number; unpriced_requests: number; not_charged_requests: number;
};
function chargeGroups(rows: ChargeBreakdown[], unitRows: UnitChargeBreakdown[], byKey: boolean) {
  const groups = new Map<string, {identity: string; name: string; keyId: string | null; model: string; amounts: Map<string, bigint>; unitAmounts: Map<string, {unitName: string; displayPrecision: number; atoms: bigint}>; requests: number; charged: number; unresolved: number; unpriced: number; ownerFunded: number; notCharged: number}>();
  for (const row of rows) {
    const identity = byKey ? row.api_key_id ?? '' : row.model_alias ?? '';
    const group = groups.get(identity) ?? {
      identity, name: visibleContent(byKey ? row.key_name ?? (row.api_key_id ? 'Key name unavailable' : 'No API key recorded') : row.model_alias ?? 'Model unavailable'),
      keyId: row.api_key_id ?? null, model: row.model_alias ?? '', amounts: new Map<string, bigint>(), unitAmounts: new Map(), requests: 0, charged: 0, unresolved: 0, unpriced: 0, ownerFunded: 0, notCharged: 0,
    };
    if (row.currency !== null && row.amount_nanos !== null) group.amounts.set(row.currency, (group.amounts.get(row.currency) ?? 0n) + BigInt(row.amount_nanos));
    group.requests += row.request_count; group.charged += row.charged_requests;
    group.ownerFunded += row.owner_funded_requests ?? 0;
    group.unresolved += row.unresolved_requests; group.unpriced += row.unpriced_requests; group.notCharged += row.not_charged_requests;
    groups.set(identity, group);
  }
  for (const unitRow of unitRows) {
    const identity = byKey ? unitRow.api_key_id ?? '' : unitRow.model_alias ?? '';
    const group = groups.get(identity) ?? {
      identity, name: visibleContent(byKey ? unitRow.key_name ?? (unitRow.api_key_id ? 'Key name unavailable' : 'No API key recorded') : unitRow.model_alias ?? 'Model unavailable'),
      keyId: unitRow.api_key_id ?? null, model: unitRow.model_alias ?? '', amounts: new Map<string, bigint>(), unitAmounts: new Map(), requests: 0, charged: 0, unresolved: 0, unpriced: 0, ownerFunded: 0, notCharged: 0,
    };
    const uName = unitLabel(unitRow);
    const key = `${unitRow.definition_revision}:${uName}`;
    const existing = group.unitAmounts.get(key);
    group.unitAmounts.set(key, {
      unitName: uName,
      displayPrecision: unitRow.display_precision,
      atoms: (existing?.atoms ?? 0n) + BigInt(unitRow.net_atoms),
    });
    groups.set(identity, group);
  }
  const currencies = [...new Set(rows.flatMap(row => row.currency === null ? [] : [row.currency]))];
  const unitKeys = [...new Set(unitRows.map(row => `${row.definition_revision}:${unitLabel(row)}`))];
  return [...groups.values()].sort((a, b) => {
    if (unitKeys.length === 1 && currencies.length === 0) {
      const av = a.unitAmounts.get(unitKeys[0])?.atoms;
      const bv = b.unitAmounts.get(unitKeys[0])?.atoms;
      if (av === undefined && bv !== undefined) return 1;
      if (bv === undefined && av !== undefined) return -1;
      if (av !== undefined && bv !== undefined && av !== bv) return av > bv ? -1 : 1;
    }
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
type ActivityFilters = { from: string; to: string; model: string; keyId: string; status: string; httpStatus?: string; operationId?: string };
const requestSorts = [
  ['time_desc', 'Newest first'], ['time_asc', 'Oldest first'],
  ['latency_desc', 'Longest duration'], ['input_desc', 'Most input tokens'], ['output_desc', 'Most output tokens'],
] as const;
const tokenMetrics = [['total', 'Token usage'], ['input', 'Input tokens'], ['output', 'Output tokens'], ['cached', 'Cached input'], ['reasoning', 'Reasoning']] as const;
const latencyMetrics = [['average', 'Average latency'], ['p50', 'P50 latency'], ['p95', 'P95 latency'], ['p99', 'P99 latency']] as const;
const requestColumns = [
  ['time', 'Time'], ['status', 'Status'], ['latency', 'Duration'],
  ['input', 'Input tokens'], ['output', 'Output tokens'], ['charge', 'Customer charge'], ['key', 'API key'],
] as const;
type RequestColumn = typeof requestColumns[number][0];
type KeyOption = { id: string; slug?: string; name: string; allowed_models: string[]; revoked: boolean; expired: boolean };

async function get<T>(path: string, token: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(formatLocalizedMessage('Could not load gateway activity ({0}).', [response.status], readUILocale()));
  return await response.json() as T;
}

function customerChargeTotals(summary: ActivitySummary) {
  const hasUnsettled = (summary.unresolved_customer_charge_count ?? 0) > 0 || (summary.unpriced_request_count ?? 0) > 0 || (summary.owner_funded_request_count ?? 0) > 0;
  return [...(summary.customer_unit_charges ?? []).filter(item => !hasUnsettled || item.charged_requests > 0 || item.net_atoms !== '0').map(item => formatUnitAtoms(item.net_atoms, unitLabel(item), item.display_precision)), ...(summary.customer_charges ?? []).filter(item => !hasUnsettled || item.charged_requests > 0 || item.amount_nanos !== '0').map(item => money(item.amount_nanos, item.currency))];
}

function requestLatency(request: GatewayRequest) {
  const duration = request.timing
    ? (request.timing.complete ? request.timing.total_ms : null)
    : request.duration_ms;
  return duration == null ? translateUI('Unknown') : `${duration.toLocaleString(readUILocale())} ${translateUI('ms')}`;
}

function requestDurationLabel(request: GatewayRequest) {
  // Video and legacy observation intervals do not measure gateway transport.
  return request.request_kind === 'video' || !request.timing ? translateUI('Observed elapsed') : translateUI('Gateway latency');
}

function requestCharge(request: GatewayRequest) {
  if (request.customer_charge_status === 'charged') {
    if (request.customer_unit_charge != null) {
      return formatUnitAtoms(request.customer_unit_charge.net_atoms, unitLabel(request.customer_unit_charge), request.customer_unit_charge.display_precision);
    }
    if (request.customer_charge_nanos != null && request.customer_charge_currency) {
      return money(request.customer_charge_nanos, request.customer_charge_currency);
    }
  }
  switch (request.customer_charge_status) {
    case 'owner_funded': return translateUI('No Niu charge');
    case 'pending': return translateUI('Unresolved');
    case 'unpriced': return translateUI('No rate');
    case 'not_charged': return translateUI('Not charged');
    default: return translateUI('Unknown');
  }
}

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? translateUI('Time unavailable') : new Intl.DateTimeFormat(readLocale(), { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
}

function localDayStart(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

function statusLabel(value: string) {
  switch (value) {
    case 'not_sent': return translateUI('Not sent');
    case 'may_have_executed': return translateUI('Needs verification');
    case 'confirmed_completed': return translateUI('Completed');
    case 'confirmed_not_executed': return translateUI('Not executed');
    case 'output_withheld': return translateUI('Blocked by policy');
    case 'delivery_failed': return translateUI('Delivery failed');
    default: return value;
  }
}

function requestStatus(item: GatewayRequest) {
  if (item.output_guardrail_outcome === 'blocked' || item.output_guardrail_outcome === 'indeterminate') return translateUI('Blocked by policy');
  if (item.timing?.http_status != null && item.timing.http_status >= 400) return formatLocalizedMessage('Failed · HTTP {0}', [item.timing.http_status], readLocale());
  return item.output_guardrail_outcome === 'redacted' ? `${statusLabel(item.execution)} · ${translateUI('Redacted')}` : statusLabel(item.execution);
}
const failureDescriptions: Record<string, string> = {
  upstream_http_error: 'The upstream service rejected the request.',
  upstream_region_unavailable: 'This model is unavailable in the upstream account’s region.',
  upstream_account_restricted: 'The upstream account is restricted for this service. Contact the Provider to restore access.',
  upstream_timeout: 'The upstream request exceeded its deadline.',
  response_stream_cancelled: 'Response delivery ended before the stream completed. This does not confirm that the Provider stopped processing.',
  upstream_connection_error: 'Could not connect to the upstream service.',
  upstream_transport_error: 'The upstream request failed during transport.',
  upstream_invalid_response: 'The upstream service returned an invalid response.',
};
const filterStatusLabel = (value: string) => value === 'recorded_failure' ? translateUI('Recorded failure') : value === 'confirmed_completed' ? translateUI('Provider completed') : statusLabel(value);

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
  if (filters.operationId) query.set('operation_id', filters.operationId);
  return query.toString();
}

function buildRequestEvidenceHref(workspaceRoot: string, filters: ActivityFilters, apiKeyId?: string, slug?: string) {
  const query = new URLSearchParams();
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  if (filters.model) query.set('modelAlias', filters.model);
  const keyId = apiKeyId ?? filters.keyId;
  if (keyId) query.set(slug ? 'key' : 'keyId', slug || keyId);
  if (filters.status) query.set('status', filters.status);
  if (filters.httpStatus) query.set('httpStatus', filters.httpStatus);
  if (filters.operationId) query.set('operationId', filters.operationId);
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

export default function GatewayActivity({ token, models, initialScope, compact = false, statisticsOnly = false, preferredModelAlias, preferredKeyId, preferredKeySlug, workspaceRoute, emptyState, externalRequest, onExternalRequestClose }: { workspaceRoute?: string; token: string; models: string[]; initialScope?: { organizationId: string; projectId: string } | null; compact?: boolean; statisticsOnly?: boolean; preferredModelAlias?: string; preferredKeyId?: string; preferredKeySlug?: string; emptyState?: ReactNode; externalRequest?: {attemptId:string;nonce:number;opener:HTMLElement|null}|null; onExternalRequestClose?:()=>void }) {
  const { t: uiT, format: uiF } = useUILocale();
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
  const initialQuery = new URLSearchParams(filterQuery({
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
    model: searchParams.get('modelAlias') ?? '',
    keyId: preferredKeyId ?? '',
    status: searchParams.get('status') ?? '',
    httpStatus: searchParams.get('httpStatus') ?? '',
    operationId: searchParams.get('operationId') ?? '',
  }));
  const initialSort = searchParams.get('sort') ?? 'time_desc';
  if (initialSort !== 'time_desc') initialQuery.set('sort', initialSort);
  initialQuery.set('limit', compact ? '10' : '100');
  const canHydrateFrameZero = Boolean(
    organization &&
    project &&
    (preferredKeyId || !(searchParams.get('key') ?? searchParams.get('keyId'))) &&
    !(searchParams.get('from') && searchParams.get('to') && searchParams.get('from')! > searchParams.get('to')!),
  );
  const initialCachedActivity = canHydrateFrameZero
    ? peekQuery<{ data: GatewayRequest[]; next_cursor: string | null; summary: ActivitySummary }>(
        token,
        `/api/v1/organizations/${organization}/projects/${project}/requests?${initialQuery}`,
      )
    : undefined;
  const [requests, setRequests] = useState<GatewayRequest[]>(() => initialCachedActivity?.data ?? []);
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const linkedIdentity = JSON.stringify([token, organization, project, location.hash, externalRequest?.attemptId, externalRequest?.nonce]);
  const [linkedRequest, setLinkedRequest] = useState<{identity:string;data:GatewayRequest} | null>(null);
  const [linkedError, setLinkedError] = useState('');
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [linkedRevision, setLinkedRevision] = useState(0);
  const selectedRequest = requests.find(item => item.attempt_id === selectedAttempt)
    ?? (linkedRequest?.identity === linkedIdentity && linkedRequest.data.attempt_id === selectedAttempt ? linkedRequest.data : undefined);
  const admissionDenial = selectedRequest?.execution === 'not_sent'
    && selectedRequest.dispatched_at === null
    && (selectedRequest.admission_denial?.kind === 'key_request_rate_disabled'
      || selectedRequest.admission_denial?.kind === 'key_request_rate_exceeded')
    && selectedRequest.admission_denial.http_status === 429
    && selectedRequest.admission_denial.key_name_source === 'captured_at_admission'
      ? selectedRequest.admission_denial : null;
  const requestedKeyName = admissionDenial && selectedRequest?.api_key_id === null
    && !selectedRequest.key_name && typeof admissionDenial.requested_key_name === 'string'
    && admissionDenial.requested_key_name.trim()
      ? admissionDenial.requested_key_name : null;
  const navigate = useNavigate();
  const requestOpener = useRef<HTMLElement | null>(null);
  function openRequest(attemptId: string, opener?: HTMLElement) {
    if (opener) requestOpener.current = opener;
    setSelectedAttempt(attemptId);
    navigate({pathname:location.pathname,search:location.search,hash:`#gateway-attempt-${requests.find(item=>item.attempt_id===attemptId)?.reference??attemptId}`},{replace:true});
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
    void get<{data: typeof payload}>(`/api/v1/organizations/${organization}/projects/${project}/requests/${selectedAttempt}/payloads`, token, controller.signal)
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
  const [nextCursor, setNextCursor] = useState<string | null>(() => initialCachedActivity?.next_cursor ?? null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(organization && project && !initialCachedActivity));
  const [error, setError] = useState('');
  const [histogramOpen, setHistogramOpen] = useState(true);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [mobileFilterField, setMobileFilterField] = useState<keyof ActivityFilters | null>(null);
  const [revision, setRevision] = useState(0);
  const [summary, setSummary] = useState<ActivitySummary | null>(() => initialCachedActivity?.summary ?? null);
  const groupedCharges = chargeGroups(
    (chargeByKey ? summary?.charges_by_key : summary?.charges_by_model) ?? [],
    (chargeByKey ? summary?.unit_charges_by_key : summary?.unit_charges_by_model) ?? [],
    chargeByKey,
  );
  const keysPath = project ? `/api/v1/workspaces/${encodeURIComponent(project)}/keys` : '';
  const keysCacheKey = keysPath;
  const initialCachedKeys = organization && project ? peekQuery<{ data: KeyOption[] }>(token, keysCacheKey) : undefined;
  const [keys, setKeys] = useState<KeyOption[]>(() => initialCachedKeys?.data ?? []);
  const [keyFilterError, setKeyFilterError] = useState('');
  const keyScope = JSON.stringify([token, organization, project]);
  const [keysScope, setKeysScope] = useState(() => (initialCachedKeys ? keyScope : ''));
  const requestedKey = preferredKeyId ? '' : searchParams.get('key') ?? searchParams.get('keyId') ?? '';
  const resolvedKey = keysScope === keyScope ? keys.find(key => key.slug === requestedKey || key.id === requestedKey) : undefined;
  const unresolvedKey = Boolean(requestedKey && !resolvedKey);
  const keyPublicSlug = (id: string) => id === preferredKeyId ? preferredKeySlug : keysScope === keyScope ? keys.find(key => key.id === id)?.slug : undefined;
  function requestEvidenceHref(root: string, values: ActivityFilters, id?: string) {
    const keyId = id ?? values.keyId;
    const slug = keyPublicSlug(keyId);
    return buildRequestEvidenceHref(root, values, id, slug);
  }
  useEffect(() => {
    if (!resolvedKey?.slug || (searchParams.get('key') === resolvedKey.slug && !searchParams.has('keyId'))) return;
    const query = new URLSearchParams(searchParams);
    query.delete('keyId'); query.set('key', resolvedKey.slug);
    navigate({pathname:location.pathname,search:query.toString(),hash:location.hash}, { replace: true });
  }, [resolvedKey?.slug, searchParams, navigate, location.pathname, location.hash]);
  const filters = useMemo<ActivityFilters>(() => ({
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
    model: searchParams.get('modelAlias') ?? '',
    keyId: preferredKeyId ?? resolvedKey?.id ?? requestedKey,
    status: searchParams.get('status') ?? '',
    httpStatus: searchParams.get('httpStatus') ?? '',
    operationId: searchParams.get('operationId') ?? '',
  }), [searchParams, preferredKeyId, resolvedKey?.id, requestedKey]);
  function setFilters(update: ActivityFilters | ((current: ActivityFilters) => ActivityFilters)) {
    const next = typeof update === 'function' ? update(filters) : update;
    const query = new URLSearchParams(searchParams);
    for (const [field, name] of [['from', 'from'], ['to', 'to'], ['model', 'modelAlias'], ['keyId', 'key'], ['status', 'status'], ['httpStatus', 'httpStatus'], ['operationId', 'operationId']] as const) {
      if (field === 'keyId') query.delete('keyId');
      if (next[field]) query.set(name, field === 'keyId' ? keys.find(key => key.id === next[field])?.slug || next[field] : next[field]);
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
  const workspaceSegment = decodeURIComponent(workspaceRoot.split('/').pop() ?? 'default');
  const newChatHref = `/generations?${new URLSearchParams({new: '1', workspace: workspaceSegment})}`;
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
  // Only the workspace-level compact preview offers first-use onboarding.
  const workspaceEmpty = compact && !statisticsOnly && !preferredKeyId && !requestedKey && !hasActivityFilters && !loading && !error && summary?.request_count === 0;
  const showFirstUse = Boolean(workspaceEmpty && emptyState);
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
    if (!organization || !project || invalidDateRange || unresolvedKey || exportController.current) return;
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setExportError('');
    try {
      const response = await fetch(`/api/v1/organizations/${organization}/projects/${project}/requests/export${activityFilterQuery ? `?${activityFilterQuery}` : ''}`, {
        signal: controller.signal, headers: { authorization: `Bearer ${token}`, accept: 'text/csv' },
      });
      if (!response.ok) throw new Error(response.status === 413
        ? 'Too many requests to export. Narrow the date range, model or API key filter to 10,000 requests or fewer.'
        : uiF('Could not export requests ({0}). Try again.', [response.status]));
      if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/csv') {
        throw new Error('The export response was not CSV. Refresh Logs and try again.');
      }
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
    if (!organization || !project || (compact && !requestedKey)) return;
    const controller = new AbortController();
    setKeyFilterError('');
    const cached = peekQuery<{ data: KeyOption[] }>(token, keysCacheKey);
    if (cached) {
      setKeys(cached.data);
      setKeysScope(keyScope);
    } else if (keysScope !== keyScope) {
      setKeys([]);
      setKeysScope('');
    }
    void fetchQuery(
      token,
      keysCacheKey,
      sig => get<{ data: KeyOption[] }>(keysPath, token, sig),
      { signal: controller.signal, force: revision > 0 },
    )
      .then(value => { if (!controller.signal.aborted) { setKeys(value.data); setKeysScope(keyScope); } })
      .catch(reason => { if (!controller.signal.aborted) { setKeys([]); setKeysScope(''); setKeyFilterError((reason as Error).message); } });
    return () => controller.abort();
  }, [token, organization, project, compact, statisticsOnly, Boolean(requestedKey), revision, keysCacheKey, keysPath, keyScope]);

  const activeWorkspaceScope = useRef(`${token}:${organization}:${project}`);

  useEffect(() => {
    const controller = new AbortController();
    olderController.current?.abort();
    olderController.current = null;
    const currentWorkspaceScope = `${token}:${organization}:${project}`;
    setLoadingOlder(false);
    setError('');
    if (!organization || !project) {
      activeWorkspaceScope.current = currentWorkspaceScope;
      setRequests([]);
      setNextCursor(null);
      setSummary(null);
      setLoading(false);
      return () => controller.abort();
    }
    if (unresolvedKey) {
      activeWorkspaceScope.current = currentWorkspaceScope;
      setRequests([]);
      setNextCursor(null);
      setSummary(null);
      setLoading(keysScope !== keyScope && !keyFilterError);
      if (keysScope === keyScope) setError('The requested API key is unavailable or you no longer have access. Choose another key or clear the filter.');
      return () => controller.abort();
    }
    if (invalidDateRange) {
      activeWorkspaceScope.current = currentWorkspaceScope;
      setRequests([]);
      setNextCursor(null);
      setSummary(null);
      setLoading(false);
      setError('Choose a valid date range.');
      return () => controller.abort();
    }
    const query = new URLSearchParams(activityFilterQuery);
    query.set('limit', compact ? '10' : '100');
    const requestsPath = `/api/v1/organizations/${organization}/projects/${project}/requests?${query}`;
    const requestsCacheKey = requestsPath;
    const cached = peekQuery<{ data: GatewayRequest[]; next_cursor: string | null; summary: ActivitySummary }>(token, requestsCacheKey);
    if (cached) {
      activeWorkspaceScope.current = currentWorkspaceScope;
      setRequests(cached.data);
      setNextCursor(cached.next_cursor);
      setSummary(cached.summary);
      setLoading(revision > 0);
    } else if (activeWorkspaceScope.current !== currentWorkspaceScope) {
      // Never retain another workspace's requests or customer charges across workspace switches.
      activeWorkspaceScope.current = currentWorkspaceScope;
      setRequests([]);
      setNextCursor(null);
      setSummary(null);
      setLoading(true);
    } else {
      setLoading(true);
    }
    void fetchQuery(
      token,
      requestsCacheKey,
      sig => get<{ data: GatewayRequest[]; next_cursor: string | null; summary: ActivitySummary }>(requestsPath, token, sig),
      { signal: controller.signal, force: revision > 0 },
    )
      .then(value => { if (!controller.signal.aborted) { setRequests(value.data); setNextCursor(value.next_cursor); setSummary(value.summary); } })
      .catch(reason => {
        if (!controller.signal.aborted) {
          setRequests([]);
          setNextCursor(null);
          setSummary(null);
          setError((reason as Error).message);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {
      controller.abort();
      olderController.current?.abort();
    };
  }, [token, organization, project, revision, activityFilterQuery, invalidDateRange, compact, unresolvedKey, Boolean(requestedKey && keysScope === keyScope), requestedKey && keyFilterError]);

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
        `/api/v1/organizations/${organization}/projects/${project}/requests?${query}`,
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
    const from = localDayStart(filters.from);
    const endDay = new Date(localDayStart(filters.to));
    endDay.setDate(endDay.getDate() + 1);
    const to = endDay.getTime();
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
  const filteredKey = keys.find(item => item.id === filters.keyId);
  const inactiveKey = Boolean(filteredKey && (filteredKey.revoked || filteredKey.expired));
  const hasModelUsageData = Boolean(summary?.usage_by_model);
  const aggregateTokens = (BigInt(aggregate.prompt_tokens) + BigInt(aggregate.completion_tokens)).toLocaleString(readUILocale());
  const categories = summary?.token_categories;
  const categoryMetric = tokenMetric === 'cached' || tokenMetric === 'reasoning';
  const tokenValue = tokenMetric === 'cached' ? categories?.cached_input_tokens
    : tokenMetric === 'reasoning' ? categories?.reasoning_output_tokens
    : tokenMetric === 'input' ? summary?.prompt_tokens
    : tokenMetric === 'output' ? summary?.completion_tokens : undefined;
  const tokenDisplay = !summary ? '—'
    : !categoryMetric && aggregate.request_count > 0 && aggregate.usage_count === 0 ? uiT("Unknown")
    : tokenMetric === 'total' ? aggregateTokens
    : tokenValue == null ? '—' : BigInt(tokenValue).toLocaleString(readUILocale());
  const categoryReported = tokenMetric === 'cached' ? categories?.cached_input_requests : categories?.reasoning_output_requests;
  const categoryUnknown = tokenMetric === 'cached' ? categories?.cached_input_unknown_requests : categories?.reasoning_output_unknown_requests;
  const loadingCaption = loading && !summary ? uiT("Loading activity…") : uiT("Range total unavailable");
  const tokenCoverage = !summary ? loadingCaption
    : categoryMetric ? categories
      ? uiF("{0} reported · {1} unknown · included in {2}", [categoryReported?.toLocaleString(readUILocale()), categoryUnknown?.toLocaleString(readUILocale()), tokenMetric === 'cached' ? uiT("input") : uiT("output")])
      : uiT("Category reporting unavailable")
    : tokenMetric === 'total'
      ? uiF("{0} reported · {1} unknown{2}", [aggregate.usage_count.toLocaleString(readUILocale()), (aggregate.request_count - aggregate.usage_count).toLocaleString(readUILocale()), aggregate.usage_count ? uiF(" · {0} prompt · {1} output", [BigInt(aggregate.prompt_tokens).toLocaleString(readUILocale()), BigInt(aggregate.completion_tokens).toLocaleString(readUILocale())]) : ''])
      : uiF("{0} reported · {1} unknown", [aggregate.usage_count.toLocaleString(readUILocale()), (aggregate.request_count - aggregate.usage_count).toLocaleString(readUILocale())]);
  const customerTotals = customerChargeTotals(aggregate);
  const chargeCoverage = [
    aggregate.owner_funded_request_count ? uiF("{0} with own API keys", [aggregate.owner_funded_request_count]) : '',
    aggregate.owner_funded_request_count ? uiT("Provider charges may still apply") : '',
    aggregate.unresolved_customer_charge_count ? uiF("{0} unresolved", [aggregate.unresolved_customer_charge_count]) : '',
    aggregate.unpriced_request_count ? uiF("{0} without a customer rate", [aggregate.unpriced_request_count]) : '',
  ].filter(Boolean).join(' · ');
  const averageDuration = summary?.average_duration_ms;
  const percentileTiming = summary?.latency_percentiles?.boundary === 'gateway_body_ms' ? summary.latency_percentiles : undefined;
  const latencyValue = latencyMetric === 'average' ? averageDuration : percentileTiming?.[`${latencyMetric}_ms`];
  const latencySamples = latencyMetric === 'average' ? summary?.timing_count : percentileTiming?.sample_count;

  useEffect(() => {
    if (externalRequest) {requestOpener.current=externalRequest.opener;if(requests.some(row=>row.attempt_id===externalRequest.attemptId))setSelectedAttempt(externalRequest.attemptId);return;}
    const prefix = '#gateway-attempt-';
    if (!location.hash.startsWith(prefix)) { setSelectedAttempt(null); return; }
    if (loading) return;
    const requested = location.hash.slice(prefix.length);
    const matched = requests.find(item=>item.attempt_id===requested||item.reference===requested);
    const attemptId = matched?.attempt_id??requested;
    if(matched?.reference&&requested!==matched.reference)navigate({pathname:location.pathname,search:location.search,hash:`${prefix}${matched.reference}`},{replace:true});
    const target = document.getElementById(`gateway-attempt-${attemptId}`);
    if (!target) return;
    setSelectedAttempt(attemptId);
    if (!requestOpener.current?.isConnected) requestOpener.current = target;
    target.classList.add('is-focused');
    target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
    return () => target.classList.remove('is-focused');
  }, [loading, requests, location.hash, externalRequest]);

  useEffect(() => {
    const controller = new AbortController();
    setLinkedError('');setLinkedLoading(false);
    const prefix = '#gateway-attempt-';
    const attempt = externalRequest?.attemptId ?? (location.hash.startsWith(prefix) ? location.hash.slice(prefix.length) : '');
    if (!attempt || (!externalRequest && (loading || error)) || !organization || !project || requests.some(item=>item.attempt_id===attempt||item.reference===attempt)) return () => controller.abort();
    setLinkedLoading(true);
    void get<{data:GatewayRequest}>(`/api/v1/organizations/${organization}/projects/${project}/requests/${encodeURIComponent(attempt)}`,token,controller.signal)
      .then(value=>{
        if (controller.signal.aborted) return;
        if (!value.data || (value.data.attempt_id !== attempt && value.data.reference !== attempt)) throw new Error('Invalid request details');
        setLinkedRequest({identity:linkedIdentity,data:value.data});setSelectedAttempt(value.data.attempt_id);
        if(!externalRequest&&value.data.reference&&attempt!==value.data.reference)navigate({pathname:location.pathname,search:location.search,hash:`${prefix}${value.data.reference}`},{replace:true});
      })
      .catch(()=>{if (!controller.signal.aborted) setLinkedError('Could not open the linked request. It may be unavailable or outside this workspace.');})
      .finally(()=>{if (!controller.signal.aborted) setLinkedLoading(false);});
    return () => controller.abort();
  }, [linkedIdentity, linkedRevision, loading, error, requests, organization, project, token]);

  function failureNextStep(failure: { kind: string; upstream_http_status?: number | null }): string {
    if (failure.kind === 'upstream_http_error' && failure.upstream_http_status === 429) {
      return uiT("The Provider rejected the request with HTTP 429, typically a rate limit. Check the Provider's limits and current routing; Niu does not retry automatically.");
    }
    if (failure.kind === 'upstream_account_restricted' || failure.kind === 'upstream_region_unavailable') {
      return uiT("The Provider account or region does not allow this service. Contact the Provider before retrying.");
    }
    if (failure.kind === 'upstream_timeout' || failure.kind === 'upstream_connection_error' || failure.kind === 'upstream_transport_error') {
      return uiT("The upstream call did not complete. Check Provider status and routing before sending another request; the recorded outcome may be uncertain.");
    }
    return uiT("Review the recorded upstream status and routing. Do not infer a cause that the recorded evidence does not support.");
  }
  return <>
    {linkedLoading && <p role="status">{uiT("Loading linked request…")}</p>}
    {linkedError && <div role="alert" className="page-error"><span>{linkedError}</span><Button variant="outline" size="sm" onClick={()=>setLinkedRevision(value=>value+1)}>{uiT("Retry linked request")}</Button></div>}

    {error && <div role="alert" className="page-error"><span>{uiT(error)}</span><Button variant="outline" size="sm" onClick={() => setRevision(value => value + 1)}>{uiT("Try again")}</Button></div>}
    {!project && <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><Activity aria-hidden="true"/></EmptyMedia><EmptyTitle>{uiT("Choose a workspace")}</EmptyTitle><EmptyDescription>{uiT("Select or create a workspace to view its activity.")}</EmptyDescription></EmptyHeader></Empty>}
    {project && <>
      {!compact && <PageHeader title={statisticsOnly ? uiT("Activity") : uiT("Logs")} action={<>
        <Button asChild variant="outline" className="header-icon-action"><Link to={`${workspaceRoot}/guardrails?tab=blocked`} aria-label={uiT("Blocked requests")} title={uiT("Blocked requests")}><ShieldBan size={16} /><span>{uiT("Blocked requests")}</span></Link></Button>
        <Button variant="ghost" size="icon" disabled={loading} onClick={() => setRevision(value => value + 1)} aria-label={uiT("Refresh requests")} title={uiT("Refresh requests")}><RefreshCw size={16} /></Button>
      </>} />}
      {!compact && <section className="request-toolbar" aria-label={uiT("Filter request activity")}>
        <h2>{uiT("Requests")}{" "}<span>{summary?.request_count.toLocaleString(readUILocale()) ?? '—'}</span>{sort !== 'time_desc' && <span>{requestSorts.find(([value]) => value === sort)?.[1] ?? uiT("Unknown sort")}</span>}</h2>
        <div className="request-toolbar-actions">
          <DropdownMenu open={filterMenuOpen} onOpenChange={open => { setFilterMenuOpen(open); if (!open) setMobileFilterField(null); }}><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={uiT("Filter requests")} title={uiT("Filter requests")}><ListFilter size={16} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" collisionPadding={16} className={isMobile ? "w-72 max-w-[calc(100vw-32px)]" : "w-52"}>
              {([
                ['model', uiT('Model'), [...new Set([...models, ...requests.map(item => item.model)])].map(value => ({ value, label: value }))],
                ['keyId', uiT('API key'), keys.map(key => ({ value: key.id, label: key.name }))],
                ['status', uiT('Status'), ['confirmed_completed', 'output_withheld', 'delivery_failed', 'recorded_failure', 'may_have_executed', 'confirmed_not_executed', 'not_sent'].map(value => ({ value, label: filterStatusLabel(value) }))],
                ['httpStatus', uiT('HTTP status'), [...new Set(['unknown', ...(summary?.delivery_statuses ?? []).map(item => item.http_status === null ? 'unknown' : String(item.http_status)), ...(filters.httpStatus ? [filters.httpStatus] : [])])].map(value => ({value, label: value === 'unknown' ? 'Unknown' : `HTTP ${value}`}))],
              ] as Array<[keyof ActivityFilters, string, Array<{value: string; label: string}>]>).map(([field, label, options]) => isMobile ? mobileFilterField === null ? <DropdownMenuItem key={field} onSelect={event => { event.preventDefault(); setMobileFilterField(field); }}>{label}</DropdownMenuItem> : mobileFilterField === field ? <div key={field}>
                <DropdownMenuItem onSelect={event => { event.preventDefault(); setMobileFilterField(null); }}>{uiT("← Filters")}</DropdownMenuItem>
                <DropdownMenuSeparator /><DropdownMenuLabel>{label}</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={filters[field] || '__all__'} onValueChange={value => { updateFilter(field, value === '__all__' ? '' : value); setFilterMenuOpen(false); setMobileFilterField(null); }}>
                  <DropdownMenuRadioItem value="__all__">{uiT("All")}</DropdownMenuRadioItem>
                  {options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value} onSelect={() => setFilterMenuOpen(false)}>{option.label}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                {field === 'status' && <p className="px-2 py-1 text-xs text-muted-foreground">{uiT("Status combines execution and delivery. Open a request to see its exact HTTP result.")}</p>}
              </div> : null : <DropdownMenuSub key={field}>
                <DropdownMenuSubTrigger>{label}</DropdownMenuSubTrigger>
                <DropdownMenuPortal><DropdownMenuSubContent className="max-h-80 overflow-y-auto"><DropdownMenuRadioGroup value={filters[field] || '__all__'} onValueChange={value => { updateFilter(field, value === '__all__' ? '' : value); setFilterMenuOpen(false); }}>
                  <DropdownMenuRadioItem value="__all__">{uiT("All")}</DropdownMenuRadioItem>{options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value} onSelect={() => setFilterMenuOpen(false)}>{option.label}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>{field === 'status' && <p className="px-2 py-1 text-xs text-muted-foreground">{uiT("Status combines execution and delivery. Open a request to see its exact HTTP result.")}</p>}</DropdownMenuSubContent></DropdownMenuPortal>
              </DropdownMenuSub>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover open={dateMenuOpen} onOpenChange={setDateMenuOpen}><PopoverTrigger asChild><Button variant="outline" className="request-date-trigger">{filters.from || filters.to ? `${filters.from || uiT("Start")} – ${filters.to || uiT("Now")}` : uiT("All time")}<ChevronDown size={14} /></Button></PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <div className="flex gap-2">{[1, 7, 30].map(days => <Button key={days} variant="outline" size="sm" onClick={() => { const date = new Date(); date.setDate(date.getDate() - days + 1); const from = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; setFilters(current => ({...current, from, to: ''})); setDateMenuOpen(false); }}>{days === 1 ? uiT("Today") : uiF("{0} days", [days])}</Button>)}</div>
              <Label className="grid gap-1 text-sm">{uiT("From")}<Input type="date" value={filters.from} max={filters.to || undefined} onChange={event => updateFilter('from', event.target.value)} /></Label>
              <Label className="grid gap-1 text-sm">{uiT("To")}<Input type="date" value={filters.to} min={filters.from || undefined} onChange={event => updateFilter('to', event.target.value)} /></Label>
              <Button variant="ghost" size="sm" onClick={() => { setFilters(current => ({...current, from: '', to: ''})); setDateMenuOpen(false); }}>{uiT("All time")}</Button>
            </PopoverContent>
          </Popover>
          {!statisticsOnly && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={uiT("Request actions")} title={uiT("Request actions")} disabled={exporting}><EllipsisVertical size={16} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52"><DropdownMenuLabel>{uiT("Sort by")}</DropdownMenuLabel><DropdownMenuRadioGroup value={sort} onValueChange={setSort}>{requestSorts.map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{uiT(label)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup><DropdownMenuSeparator /><DropdownMenuItem disabled={invalidDateRange || loading || Boolean(error)} onSelect={() => void exportRequests()}><FileDown />{uiT("Export CSV")}</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>}
        </div>
        {(filters.model || filters.keyId || filters.status || filters.httpStatus || filters.operationId) && <div className="request-filter-chips">{(['model', 'keyId', 'status', 'httpStatus', 'operationId'] as const).filter(field => filters[field]).map(field => <Button key={field} variant="outline" size="sm" onClick={() => updateFilter(field, '')}>{field === 'operationId' ? uiT("Related requests") : field === 'keyId' ? keys.find(key => key.id === filters.keyId)?.name ?? uiT("API key") : field === 'status' ? filterStatusLabel(filters.status) : field === 'httpStatus' ? filters.httpStatus === 'unknown' ? uiT("Unknown delivery status") : `HTTP ${filters.httpStatus}` : filters.model}<X size={12} /><span className="sr-only">{uiT("Remove filter")}</span></Button>)}</div>}
        {keyFilterError && <p role="alert">{uiT(keyFilterError)}</p>}
        {exporting && <p role="status">{uiT("Preparing export…")}</p>}
        {exportError && <p role="alert">{uiT(exportError)}</p>}
      </section>}

      {!showFirstUse && (statisticsOnly || compact) && !error && <section className="gateway-activity-summary" aria-label={compact && !activityFilterQuery ? uiT("Workspace request totals") : uiT("Filtered request totals")} aria-busy={loading}>
        <article className="panel"><span><Activity size={16} />{compact ? uiT("Requests") : uiT("Matching requests")}</span><strong>{summary ? aggregate.request_count.toLocaleString(readUILocale()) : '—'}</strong><small>{summary ? statisticsOnly ? uiT("Across matching requests") : uiF("{0} · {1} recent shown", [filters.from || filters.to ? uiF("{0} – {1}", [filters.from || uiT("Start"), filters.to || uiT("Now")]) : uiT("All time"), requests.length.toLocaleString(readUILocale())]) : loadingCaption}</small></article>
        <article className="panel"><span><Workflow size={16} /><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-auto gap-1 p-0 text-xs font-normal" aria-label={uiT("Token metric")}>{uiT(tokenMetrics.find(([value]) => value === tokenMetric)?.[1] ?? "Token usage")}<ChevronDown size={12} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={16}><DropdownMenuRadioGroup value={tokenMetric} onValueChange={setTokenMetric}>{tokenMetrics.map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{uiT(label)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></span><strong>{tokenDisplay}</strong><small>{tokenCoverage}</small></article>
        <article className="panel"><span><Timer size={16} /><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-auto gap-1 p-0 text-xs font-normal" aria-label={uiT("Latency metric")}>{uiT(latencyMetrics.find(([value]) => value === latencyMetric)?.[1] ?? "Average latency")}<ChevronDown size={12} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={16}><DropdownMenuRadioGroup value={latencyMetric} onValueChange={setLatencyMetric}>{latencyMetrics.map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{uiT(label)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></span><strong>{latencyValue == null ? '—' : uiF("{0} ms", [latencyValue.toLocaleString(readUILocale())])}</strong><small>{latencySamples == null ? (loading && !summary ? uiT("Loading activity…") : uiT("Timing data unavailable")) : `${latencySamples.toLocaleString(readUILocale())} ${latencySamples === 1 ? uiT("complete gateway timing") : uiT("complete gateway timings")}`}</small></article>
        <article className="panel"><span><Coins size={16} />{uiT("Customer charges")}</span><strong>{!summary ? '—' : !hasCustomerChargeData ? uiT("Unavailable") : customerTotals.length ? customerTotals.join(' · ') : aggregate.unresolved_customer_charge_count ? uiT("Unresolved") : aggregate.unpriced_request_count ? uiT("No rate") : aggregate.owner_funded_request_count ? uiT("No Niu charge") : '—'}</strong><small>{!summary ? loadingCaption : !hasCustomerChargeData ? uiT("Charge data unavailable for this gateway response") : chargeCoverage || uiT("Settled customer charges only")}</small></article>
      </section>}

      {!showFirstUse && (statisticsOnly || compact) && !error && <ActivityCharts buckets={summary?.request_histogram} models={aggregate.usage_by_model} compact={compact} loading={loading}/> }

      {statisticsOnly && !error && <section className="panel activity-model-breakdown activity-charge-breakdown" aria-labelledby="charge-breakdown-title">
        <div className="panel-heading"><div><h2 id="charge-breakdown-title">{uiT("Customer charge breakdown")}</h2><p>{uiT("Settled charges and coverage across matching requests.")}</p></div>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label={uiT("Group customer charges")}>{chargeByKey ? uiT("API key") : uiT("Model")}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" collisionPadding={16}><DropdownMenuRadioGroup value={chargeByKey ? 'key' : 'model'} onValueChange={setChargeGroup}><DropdownMenuRadioItem value="model">{uiT("Model")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="key">{uiT("API key")}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
        </div>
        {loading && !summary ? <TableSkeleton columns={3} rows={4} label={uiT("Loading customer charges…")} /> : (chargeByKey ? summary?.charges_by_key : summary?.charges_by_model) === undefined ? <Empty className="activity-model-empty min-h-32"><EmptyHeader><EmptyMedia variant="icon"><Coins size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("Charge breakdown unavailable for this gateway response.")}</EmptyDescription></EmptyHeader></Empty> : <div className="activity-model-table-wrap"><ShadcnTable><TableHeader><TableRow><TableHead>{chargeByKey ? uiT("API key") : uiT("Model")}</TableHead><TableHead>{uiT("Customer charge")}</TableHead><TableHead>{uiT("Requests")}</TableHead></TableRow></TableHeader><TableBody>{(allChargeGroups ? groupedCharges : groupedCharges.slice(0, 10)).map(group => <TableRow key={group.identity}>
          <TableHead scope="row">{(!chargeByKey && group.model) || (chargeByKey && group.keyId && keyPublicSlug(group.keyId)) ? <Link aria-label={uiF("View charge requests for {0}", [group.name])} to={requestEvidenceHref(workspaceRoot, {...filters, ...(!chargeByKey ? {model: group.model} : {})}, chargeByKey ? group.keyId! : undefined)}>{group.name}</Link> : group.name}</TableHead>
          <TableCell>{group.unitAmounts.size || group.amounts.size ? <>
            {[...group.unitAmounts.entries()].map(([key, item]) => <div key={key}>{formatUnitAtoms(item.atoms.toString(), item.unitName, item.displayPrecision)}</div>)}
            {[...group.amounts].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => <div key={currency}>{money(amount.toString(), currency)}</div>)}
          </> : group.unresolved ? uiT("Unresolved") : group.unpriced ? uiT("No rate") : group.ownerFunded ? uiT("No Niu charge") : uiT("Not charged")}<small>{[group.ownerFunded ? `${group.ownerFunded.toLocaleString(readUILocale())} ${uiT("with own API keys", "使用自有 API 密钥")}` : '', group.charged ? `${group.charged.toLocaleString(readUILocale())} ${uiT("charged", "已计费")}` : '', group.unresolved ? `${group.unresolved.toLocaleString(readUILocale())} ${uiT("unresolved", "待结算")}` : '', group.unpriced ? `${group.unpriced.toLocaleString(readUILocale())} ${uiT("without rate", "未配置费率")}` : '', group.notCharged ? `${group.notCharged.toLocaleString(readUILocale())} ${uiT("not charged", "未计费")}` : ''].filter(Boolean).join(' · ')}</small></TableCell>
          <TableCell>{group.requests.toLocaleString(readUILocale())}</TableCell>
        </TableRow>)}</TableBody></ShadcnTable>{groupedCharges.length > 10 && <div className="flex items-center justify-between gap-3 p-4 text-sm"><span className="text-muted-foreground">{allChargeGroups ? groupedCharges.length : 10}{" "}{uiT("of")}{" "}{groupedCharges.length} {chargeByKey ? uiT("API keys") : uiT("models")}</span><Button variant="ghost" size="sm" aria-expanded={allChargeGroups} onClick={() => setAllChargeGroups(value => !value)}>{allChargeGroups ? uiT("Show fewer") : uiT("Show all")}</Button></div>}{!groupedCharges.length && <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><Coins aria-hidden="true"/></EmptyMedia><EmptyTitle>{hasActivityFilters ? uiT("No matching requests") : uiT("No requests yet")}</EmptyTitle></EmptyHeader></Empty>}</div>}
      </section>}

      {statisticsOnly && !error && <section className="panel activity-key-breakdown" aria-labelledby="activity-key-title">
        <div className="panel-heading"><div><h2 id="activity-key-title">{uiT("Top API keys")}</h2><p>{uiT("Workspace keys ranked by reported token volume for this date range.")}</p></div><Link to={requestEvidenceHref(workspaceRoot, filters)}>{uiT("Investigate requests")}</Link></div>
        {loading && !summary ? <ListRowsSkeleton rows={3} label={uiT("Loading API key usage…")} /> : aggregate.usage_by_key.length ? <div className="activity-key-usage-list">
          {aggregate.usage_by_key.map((item, index) => {
            const reportedTokens = BigInt(item.prompt_tokens) + BigInt(item.completion_tokens);
            const keyName = item.key_name ?? (item.api_key_id ? uiT("Key name unavailable") : uiT("No API key recorded"));
            return <div className="activity-key-usage-row" key={item.api_key_id ?? `unattributed-${index}`}>
              <div className="activity-key-usage-info"><strong>{keyName}</strong><small>{item.request_count.toLocaleString(readUILocale())} {item.request_count === 1 ? uiT("request") : uiT("requests")} · {item.usage_count.toLocaleString(readUILocale())}{" "}{uiT("with reported usage")}{item.unknown_usage_count ? uiF(" · {0} unknown", [item.unknown_usage_count.toLocaleString(readUILocale())]) : ''}</small></div>
              <div className="activity-key-usage-metrics"><strong>{item.usage_count ? uiF("{0} tokens", [reportedTokens.toLocaleString(readUILocale())]) : uiT("Unknown")}</strong>{item.api_key_id && (keyPublicSlug(item.api_key_id) ? <Link to={requestEvidenceHref(workspaceRoot, filters, item.api_key_id)}>{uiT("View requests")}</Link> : <span className="text-sm text-muted-foreground">{uiT("Key link unavailable")}</span>)}</div>
            </div>;
          })}
        </div> : <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><Workflow aria-hidden="true"/></EmptyMedia><EmptyTitle>{hasActivityFilters ? uiT("No matching API key activity") : uiT("No API key activity yet")}</EmptyTitle><EmptyDescription>{hasActivityFilters ? uiT("No workspace key activity matches these filters.") : uiT("Requests attributed to a workspace key appear here.")}</EmptyDescription></EmptyHeader></Empty>}
      </section>}

      {statisticsOnly && !error && Boolean(summary?.delivery_statuses?.length) && <section className="panel activity-model-breakdown" aria-labelledby="delivery-status-title">
        <div className="panel-heading"><div><h2 id="delivery-status-title">{uiT("Delivery status")}</h2><p>{uiT("Recorded HTTP responses across matching requests. Missing status remains unknown.")}</p></div></div>
        <div className="activity-model-table-wrap"><ShadcnTable><TableHeader><TableRow><TableHead>{uiT("Status")}</TableHead><TableHead>{uiT("Requests")}</TableHead></TableRow></TableHeader><TableBody>{summary?.delivery_statuses?.map(item => <TableRow key={item.http_status ?? 'unknown'}><TableHead scope="row"><Link to={requestEvidenceHref(workspaceRoot, {...filters, httpStatus: item.http_status === null ? 'unknown' : String(item.http_status)})}>{item.http_status === null ? uiT("Unknown") : `HTTP ${item.http_status}`}</Link></TableHead><TableCell>{item.request_count.toLocaleString(readUILocale())}</TableCell></TableRow>)}</TableBody></ShadcnTable></div>
      </section>}

      {statisticsOnly && !error && <section className="panel activity-model-breakdown">
        <div className="panel-heading"><div><h2>{uiT("Model usage")}</h2><p>{uiT("Ranked by reported token volume.")}</p></div><Link to={requestEvidenceHref(workspaceRoot, filters)}>{uiT("Investigate requests")}</Link></div>
        {loading && !summary ? <TableSkeleton columns={6} rows={4} label={uiT("Loading model activity…")} /> : !hasModelUsageData ? <Empty className="activity-model-empty min-h-32"><EmptyHeader><EmptyMedia variant="icon"><Activity size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("Model usage data is unavailable for this gateway response.")}</EmptyDescription></EmptyHeader></Empty> : aggregate.usage_by_model.length ? <div className="activity-model-table-wrap"><ShadcnTable><TableHeader><TableRow><TableHead>{uiT("Model")}</TableHead><TableHead>{uiT("Requests")}</TableHead><TableHead>{uiT("Input tokens")}</TableHead><TableHead>{uiT("Output tokens")}</TableHead><TableHead>{uiT("Usage coverage")}</TableHead><TableHead><span className="sr-only">{uiT("Actions")}</span></TableHead></TableRow></TableHeader><TableBody>{aggregate.usage_by_model.map(item => <TableRow key={item.model_alias}><TableHead scope="row">{item.model_alias}</TableHead><TableCell>{item.request_count.toLocaleString(readUILocale())}</TableCell><TableCell>{item.usage_count ? BigInt(item.prompt_tokens).toLocaleString(readUILocale()) : uiT("Unknown")}</TableCell><TableCell>{item.usage_count ? BigInt(item.completion_tokens).toLocaleString(readUILocale()) : uiT("Unknown")}</TableCell><TableCell>{item.unknown_usage_count ? uiF("{0} reported · {1} unknown", [item.usage_count, item.unknown_usage_count]) : uiF("{0} reported", [item.usage_count])}</TableCell><TableCell><Button asChild variant="ghost" size="icon"><Link aria-label={uiF("View requests for {0}", [item.model_alias])} to={requestEvidenceHref(workspaceRoot, { ...filters, model: item.model_alias })} title={uiT("View requests")}><ArrowUpRight className="size-4" aria-hidden="true" /><span className="sr-only">{uiT("View requests")}</span></Link></Button></TableCell></TableRow>)}</TableBody></ShadcnTable></div> : <Empty className="min-h-60"><EmptyHeader><EmptyMedia variant="icon"><Activity aria-hidden="true"/></EmptyMedia><EmptyTitle>{hasActivityFilters ? uiT("No matching model activity") : uiT("No model activity yet")}</EmptyTitle><EmptyDescription>{hasActivityFilters ? uiT("Adjust or clear the filters to see more activity.") : uiT("Calls sent through Chat or your application appear here.")}</EmptyDescription></EmptyHeader><EmptyContent>{hasActivityFilters ? <Button variant="outline" onClick={() => setFilters({from: '', to: '', model: '', keyId: preferredKeyId ?? '', status: ''})}>{uiT("Clear filters")}</Button> : <Button asChild variant="outline"><Link to={newChatHref}>{uiT("Open Chat")}</Link></Button>}</EmptyContent></Empty>}
        <div className="activity-stat-links"><Link to={`${workspaceRoot}/billing`}>{uiT("View billing")}</Link></div>
      </section>}

      {!statisticsOnly && <section className={`gateway-task-feed panel${compact ? ' is-compact' : ''}`} aria-labelledby="gateway-task-feed-title" aria-busy={loading}>
        <div className="gateway-task-feed-heading" hidden={!compact}><div><h2 id="gateway-task-feed-title">{compact ? showFirstUse ? uiT("Get started") : uiT("Recent requests") : uiT("Requests")}</h2></div><div className="gateway-feed-actions">{compact && <><Link to={requestEvidenceHref(workspaceRoot, filters).replace(`${workspaceRoot}/executions`, `${workspaceRoot}/usage`)}>{uiT("View activity")}</Link><Link to={requestEvidenceHref(workspaceRoot, filters)}>{uiT("View all requests")}</Link></>}{!compact && <Badge variant="outline">{requests.length.toLocaleString(readUILocale())}{" "}{uiT("requests")}</Badge>}</div></div>
        {loading && requests.length > 0 && <p role="status" className="px-4 pb-3 text-sm text-muted-foreground">{uiT("Updating results for the current filters. The rows below are from the previous result.")}</p>}
        {!compact && !loading && histogram && <section className="request-histogram" aria-label={uiT("Request volume")}>
          <div className="request-histogram-heading"><span>{uiT("Request volume")} · {uiF("Peak: {0}", [histogram.max.toLocaleString(readUILocale())])}</span><Button variant="ghost" size="icon" aria-label={histogramOpen ? uiT("Hide request histogram") : uiT("Show request histogram")} onClick={() => setHistogramOpen(value => !value)}>{histogramOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Button></div>
          {histogramOpen && <><svg viewBox="0 0 960 90" preserveAspectRatio="none" role="img" aria-label={uiT("Requests over time")}>{histogram.buckets.map((bucket, index) => { const span = Math.max(1, histogram.end - histogram.start); const x = (bucket.start - histogram.start) / span * 956 + 4; const width = Math.max(2, (bucket.end - bucket.start) / span * 956 - 6); const barHeight = bucket.count > 0 ? Math.max(4, bucket.count / histogram.max * 78) : 1.5; return <rect key={index} x={x} y={88 - barHeight} width={width} height={barHeight} rx="2" fill="currentColor" opacity={bucket.count > 0 ? (width > 48 ? 0.18 : 0.85) : 0.16} stroke={bucket.count > 0 && width > 48 ? "currentColor" : undefined} strokeWidth={bucket.count > 0 && width > 48 ? 1.5 : undefined}><title>{timestamp(new Date(bucket.start).toISOString())}: {bucket.count}{" "}{uiT("requests")}</title></rect>; })}</svg><div className="request-histogram-axis"><span>{timestamp(new Date(histogram.start).toISOString())}</span><span>{timestamp(new Date(histogram.end).toISOString())}</span></div></>}
        </section>}
        {loading && requests.length === 0 && <TableSkeleton columns={compact ? 4 : 7} rows={compact ? 4 : 6} label={uiT("Loading requests…")} />}
        {!loading && !error && requests.length === 0 && (showFirstUse ? emptyState : <Empty className="gateway-task-empty"><EmptyHeader><EmptyMedia variant="icon"><Activity aria-hidden="true"/></EmptyMedia><EmptyTitle role="heading" aria-level={3}>{inactiveKey ? uiT("No requests recorded for this key") : hasActivityFilters ? uiT("No matching requests") : uiT("No requests yet")}</EmptyTitle><EmptyDescription>{inactiveKey ? uiT("This key is revoked or expired, so it cannot start new requests. Requests appear here only if it was used while active.") : hasActivityFilters ? uiT("Adjust or clear the filters to see more activity.") : uiT("Calls sent through Chat or your application appear here.")}</EmptyDescription></EmptyHeader>{(hasActivityFilters || !compact) && <EmptyContent>{hasActivityFilters ? <Button type="button" variant="outline" onClick={() => setFilters({ from: '', to: '', model: '', keyId: preferredKeyId ?? '', status: '' })}>{uiT("Clear filters")}</Button> : <Button asChild variant="outline"><Link to={newChatHref}>{uiT("Open Chat")}</Link></Button>}</EmptyContent>}</Empty>)}
        {!error && requests.length > 0 && <div className="gateway-request-table-wrap"><ShadcnTable className={`gateway-request-table${compact ? ` is-compact${isMobile ? ' is-mobile-summary' : ''}` : ` has-column-controls${isMobile && shownColumns.has('status') && [...shownColumns].every(column => column === 'status' || column === 'charge') ? ' is-mobile-diagnosis' : ''}`}`}><TableHeader><TableRow>{shownColumns.has('time') && <TableHead>{uiT("Time")}</TableHead>}<TableHead>{uiT("Model")}</TableHead>{requestColumns.filter(([name]) => name !== 'time' && shownColumns.has(name)).map(([name, label]) => <TableHead key={name} className={`request-column-${name}`}>{uiT(label)}</TableHead>)}{!compact && <TableHead className="request-column-controls"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={uiT("Table settings")} title={uiT("Table settings")}><Settings2 size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuLabel>{uiT("Columns")}</DropdownMenuLabel><DropdownMenuCheckboxItem checked disabled>{uiT("Model")}</DropdownMenuCheckboxItem>{requestColumns.map(([name, label]) => <DropdownMenuCheckboxItem key={name} checked={shownColumns.has(name)} onCheckedChange={checked => toggleColumn(name, checked)} onSelect={event => event.preventDefault()}>{uiT(label)}</DropdownMenuCheckboxItem>)}<DropdownMenuSeparator /><DropdownMenuItem disabled={columnParameter === null} onSelect={resetColumns}>{uiT("Reset columns")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableHead>}</TableRow></TableHeader><TableBody>{requests.map(item => <TableRow id={`gateway-attempt-${item.attempt_id}`} aria-label={`${item.model.split('/').slice(-1)[0]} · ${timestamp(item.created_at)} · ${requestStatus(item)}`} tabIndex={0} onClick={event => openRequest(item.attempt_id, event.currentTarget)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openRequest(item.attempt_id, event.currentTarget); } }} key={item.attempt_id}>
          {shownColumns.has('time') && <TableCell className="request-column-time">{timestamp(item.created_at)}</TableCell>}<TableHead scope="row"><Button variant="link" className="h-auto p-0 text-left font-normal gap-2 max-w-full whitespace-nowrap" onClick={() => openRequest(item.attempt_id)}><ProviderLogo provider={modelIdentity({ id: item.model })} size="small" />{item.model.split('/').slice(-1)[0]}</Button>{isMobile && !shownColumns.has('time') && <small className="request-summary-time">{timestamp(item.created_at)}</small>}{item.provider_model && item.provider_model !== item.model && <small>{uiT("Provider ·")}{" "}{item.provider_model}</small>}</TableHead>{shownColumns.has('status') && <TableCell className="request-column-status"><span className={`gateway-table-status ${(['blocked', 'indeterminate'].includes(item.output_guardrail_outcome ?? '') || (item.timing?.http_status ?? 0) >= 400) ? 'is-failed' : item.execution === 'confirmed_completed' ? 'is-complete' : item.execution === 'confirmed_not_executed' ? 'is-failed' : 'is-pending'}`}>{requestStatus(item)}</span></TableCell>}{shownColumns.has('latency') && <TableCell className="request-column-latency">{requestLatency(item)}<small className="block text-muted-foreground">{requestDurationLabel(item)}</small></TableCell>}{shownColumns.has('input') && <TableCell className="request-column-input">{item.prompt_tokens == null ? uiT("Unknown") : BigInt(item.prompt_tokens).toLocaleString(readUILocale())}</TableCell>}{shownColumns.has('output') && <TableCell className="request-column-output">{item.completion_tokens == null ? uiT("Unknown") : BigInt(item.completion_tokens).toLocaleString(readUILocale())}</TableCell>}{shownColumns.has('charge') && <TableCell className="request-column-charge">{requestCharge(item)}</TableCell>}{shownColumns.has('key') && <TableCell className="request-column-key">{item.key_name ?? uiT("Unknown")}</TableCell>}{!compact && <TableCell />}
        </TableRow>)}</TableBody></ShadcnTable></div>}
        {!compact && !loading && nextCursor && <div className="gateway-task-history"><Button type="button" variant="outline" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? uiT("Loading older requests…") : uiT("Load older requests")}</Button></div>}

      </section>}
    </>}
    <Sheet open={Boolean(selectedRequest)} onOpenChange={open => { if (!open) { setSelectedAttempt(null); onExternalRequestClose?.(); if (location.hash.startsWith('#gateway-attempt-')) navigate({pathname:location.pathname,search:location.search,hash:''},{replace:true}); } }}>
      <SheetContent className="w-full gap-0 overflow-hidden sm:max-w-xl" onOpenAutoFocus={event => {
        event.preventDefault();
        detailHeading.current?.focus({preventScroll:true});
      }} onCloseAutoFocus={event => {
        if (requestOpener.current?.isConnected) { event.preventDefault(); requestOpener.current.focus({preventScroll:true}); }
        requestOpener.current = null;
      }}>
        <SheetHeader className="shrink-0 pr-12"><SheetTitle ref={detailHeading} tabIndex={-1}>{uiT("Request details")}</SheetTitle><SheetDescription className="flex min-w-0 items-center gap-2 break-all">{selectedRequest && <ProviderLogo provider={modelIdentity({ id: selectedRequest.model })} size="small" />}{selectedRequest?.model}</SheetDescription></SheetHeader>
        {selectedRequest && <div ref={detailSheet} role="region" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto p-6 space-y-6 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2" aria-label={uiT("Request detail content")}>
          <div className="request-detail-metrics">
            <div><span>{requestDurationLabel(selectedRequest)}</span><strong>{requestLatency(selectedRequest)}</strong></div>
            <div><span>{uiT("Customer charge")}</span><strong>{requestCharge(selectedRequest)}</strong>{selectedRequest.customer_unit_charge != null && BigInt(selectedRequest.customer_unit_charge.restored_atoms) > 0n && <small className="text-xs text-muted-foreground">{uiF("Refunded {0}", [formatUnitAtoms(selectedRequest.customer_unit_charge.restored_atoms, unitLabel(selectedRequest.customer_unit_charge), selectedRequest.customer_unit_charge.display_precision)])}</small>}</div>
            {selectedRequest.request_kind !== 'video' && <>
            <div><span>{uiT("Input tokens")}</span><strong className="break-all">{selectedRequest.prompt_tokens == null ? '—' : BigInt(selectedRequest.prompt_tokens).toLocaleString(readUILocale())}</strong><small className="text-xs text-muted-foreground">{uiT("Cached:")}{" "}{selectedRequest.cached_input_tokens == null ? uiT("Unknown") : BigInt(selectedRequest.cached_input_tokens).toLocaleString(readUILocale())}</small></div>
            <div><span>{uiT("Output tokens")}</span><strong className="break-all">{selectedRequest.completion_tokens == null ? '—' : BigInt(selectedRequest.completion_tokens).toLocaleString(readUILocale())}</strong><small className="text-xs text-muted-foreground">{uiT("Reasoning:")}{" "}{selectedRequest.reasoning_output_tokens == null ? uiT("Unknown") : BigInt(selectedRequest.reasoning_output_tokens).toLocaleString(readUILocale())}</small></div>
            </>}
          </div>
          {/* Admission refusals are request records, not saved video jobs. */}
          {selectedRequest.request_kind === 'video' && !selectedRequest.admission_denial && <div className="grid justify-items-start gap-2"><p className="text-sm text-muted-foreground">{uiT("Video generation is asynchronous. Inspect saved status, lifecycle timing and the original charge in Video.")}</p><Button asChild variant="outline"><Link to={`/generations?${new URLSearchParams({workspace:workspaceSegment,mode:'video',job:selectedRequest.attempt_id,...(selectedRequest.api_key_id ? {key:selectedRequest.api_key_id}:{})})}`}>{uiT("Open video result")}</Link></Button></div>}
          {selectedRequest.request_kind !== 'video' && <RequestTiming timing={selectedRequest.timing} outputTokens={selectedRequest.completion_tokens} />}
          <RequestGuardrails
            key={`${token}:${organization}:${project}:${selectedRequest.attempt_id}`}
            token={token}
            endpoint={`/api/v1/organizations/${organization}/projects/${project}/requests/${selectedRequest.attempt_id}/guardrails`}
            historyPath={`${workspaceRoot}/guardrails?tab=history`}
          />
          <div className="gateway-request-detail"><h3 className="mb-3 text-sm font-medium">{uiT("Overview")}</h3><dl>{admissionDenial && <div><dt>{uiT("Failure reason")}</dt><dd>{admissionDenial.kind === 'key_request_rate_exceeded' ? uiT("API key request rate limit reached") : uiT("API key request rate is zero")}<span className="block">{uiT("Gateway HTTP 429")}</span></dd></div>}{selectedRequest.failure && <div><dt>{uiT("Failure reason")}</dt><dd>{uiT(failureDescriptions[selectedRequest.failure.kind] ?? "Not reported")}{Number.isInteger(selectedRequest.failure.upstream_http_status) && selectedRequest.failure.upstream_http_status! >= 100 && selectedRequest.failure.upstream_http_status! <= 599 && <span className="block">{uiT("Upstream HTTP")}{" "}{selectedRequest.failure.upstream_http_status}</span>}</dd></div>}<div><dt>{uiT("Provider model")}</dt><dd>{selectedRequest.provider_model ?? uiT("Unknown")}</dd></div><div><dt>{uiT("Provider status")}</dt><dd>{statusLabel(selectedRequest.execution)}</dd></div>{selectedRequest.request_kind !== 'video' && <div><dt>{uiT("Finish reason")}</dt><dd>{selectedRequest.finish_reasons?.length ? selectedRequest.finish_reasons.map(choice => <span className="block" key={choice.index}>{selectedRequest.finish_reasons!.length > 1 ? uiF("Choice {0}: ", [choice.index + 1]) : ''}{{stop: 'Stopped', length: 'Token limit reached', tool_calls: 'Tool calls', content_filter: 'Content filter', function_call: 'Function call'}[choice.reason] ?? uiT("Unknown")}</span>) : uiT("Not reported")}</dd></div>}{selectedRequest.timing?.http_status != null && <div><dt>{uiT("Delivery status")}</dt><dd>HTTP {selectedRequest.timing.http_status}</dd></div>}<div><dt>{uiT("Time")}</dt><dd>{timestamp(selectedRequest.created_at)}</dd></div><div><dt>{requestedKeyName ? uiT("Requested API key") : uiT("API key")}</dt><dd>{selectedRequest.key_name ?? requestedKeyName ?? uiT("Unknown")}</dd></div></dl>{selectedRequest.failure && <div className="mt-4 space-y-2"><h4 className="text-sm font-medium">{uiT("Next steps")}</h4><p className="text-sm text-muted-foreground">{failureNextStep(selectedRequest.failure)}</p><div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to={`${workspaceRoot}/executions?modelAlias=${encodeURIComponent(selectedRequest.model)}`}>{uiT("View requests for this model")}</Link></Button><Button asChild variant="outline" size="sm"><Link to={`${workspaceRoot}/routing`}>{uiT("Review routing")}</Link></Button></div></div>}</div>

          {payloadLoading || payloadOwner !== payloadIdentity ? <FormSectionSkeleton fields={3} label={uiT("Loading request content…")} /> : payloadError ? <div className="grid justify-items-start gap-3"><p role="alert">{payloadError}</p><Button variant="outline" size="sm" onClick={() => setPayloadRevision(value => value + 1)}>{uiT("Retry request content")}</Button></div> : payload ? <div className="space-y-4">
            <RequestContent key={selectedRequest.attempt_id} payload={payload} />
            <p className="text-sm text-muted-foreground">{payload.truncated ? uiT("Response exceeds the capture limit; only the first 1 MB is shown.") : ''}{!payload.complete ? uiT("The response did not finish.") : ''}{uiT("Content expires")}{" "}{timestamp(payload.expires_at)}.</p>
          </div> : <p className="text-sm text-muted-foreground">{uiT("Request and response bodies were not retained or have expired.")}</p>}
        </div>}
        {selectedRequest && <SheetFooter className="shrink-0 flex-row justify-between">
            <Button variant="outline" size="sm" disabled={requests.findIndex(item => item.attempt_id === selectedAttempt) <= 0} onClick={() => openRequest(requests[requests.findIndex(item => item.attempt_id === selectedAttempt) - 1].attempt_id)}>{uiT("Previous request")}</Button>
            <Button variant="outline" size="sm" disabled={requests.findIndex(item => item.attempt_id === selectedAttempt) < 0 || requests.findIndex(item => item.attempt_id === selectedAttempt) >= requests.length - 1} onClick={() => openRequest(requests[requests.findIndex(item => item.attempt_id === selectedAttempt) + 1].attempt_id)}>{uiT("Next request")}</Button>
        </SheetFooter>}
      </SheetContent>
    </Sheet>
  </>;
}
