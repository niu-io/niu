import { authenticatedFetch as fetch } from '@/lib/authenticated-fetch';
import { requestOutcomeLabel } from '@/lib/request-status';
import { formatLocalizedMessage } from '@/shell/ui-locale';
import { translateUI } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import ConnectGate from '@/shell/ConnectGate';
import type { Workspace } from '@/shell/dashboard-context';
import { organizationDisplayName, resolveWorkspacePathSegment, workspaceDisplayName, workspacePathSegment } from '@/shell/workspace-route';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import ChargeSummaryCard, { formatSettledChargeTotals } from '@/features/executions/components/ChargeSummaryCard';
import PageHeader from '@/components/PageHeader';
import { MetricStripSkeleton, TableSkeleton } from '@/components/PageSkeletons';
import { formatUnitAtoms } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { catalogTitle } from '@/lib/providers';
import { money } from '@/lib/money';
import { fetchQuery, peekQuery } from '@/lib/query-cache';
import { IconActivity, IconChevronDown, IconRefresh, IconRoute } from '@tabler/icons-react';

type UnitCharge = { definition_revision?: string; unit_name?: string; name?: string; display_precision: number; net_atoms: string };
type Summary = { charges_by_model?: Array<{charged_requests: number; unit_charged_requests?: number; not_charged_requests: number}>; request_count: number; usage_count: number; prompt_tokens: string; completion_tokens: string; customer_charges: Array<{currency: string; amount_nanos: string}>; customer_unit_charges?: UnitCharge[]; unresolved_customer_charge_count: number; unpriced_request_count: number; owner_funded_request_count?: number };
function unitCharges(summary: Summary) {
  const totals = new Map<string, {name: string; precision: number; amount: bigint}>();
  for (const item of summary.customer_unit_charges ?? []) {
    const name = item.unit_name ?? item.name ?? 'Credits';
    const key = item.definition_revision ?? name;
    const current = totals.get(key) ?? {name, precision: item.display_precision, amount: 0n};
    current.amount += BigInt(item.net_atoms || '0');
    totals.set(key, current);
  }
  return totals;
}
type Request = { timing?: { http_status?: number | null }; output_guardrail_outcome?: string | null; attempt_id: string; reference?: string; created_at: string; model: string; execution: string; prompt_tokens: string | null; completion_tokens: string | null; customer_charge_status: string; customer_charge_currency: string | null; customer_charge_nanos: string | null; customer_unit_charge?: UnitCharge | null };
type Page = {data: Request[]; summary: Summary; next_cursor: string | null};
type WorkspacePage = {workspace: Workspace; page: Page; cursors?: string[]};

export function activityTotals(pages: Array<{page: {summary: Summary}}>) {
  let requests = 0, reported = 0, tokens = 0n, unresolved = 0, pending = 0, unpriced = 0, ownerFunded = 0;
  let settled = 0, notCharged = 0;
  const charges = new Map<string, bigint>();
  const units = new Map<string, {name: string; precision: number; amount: bigint}>();
  for (const {page: {summary}} of pages) {
    requests += summary.request_count; reported += summary.usage_count;
    tokens += BigInt(summary.prompt_tokens) + BigInt(summary.completion_tokens);
    pending += summary.unresolved_customer_charge_count ?? 0;
    unpriced += summary.unpriced_request_count ?? 0;
    ownerFunded += summary.owner_funded_request_count ?? 0;
    for (const row of summary.charges_by_model ?? []) {
      settled += row.charged_requests + (row.unit_charged_requests ?? 0);
      notCharged += row.not_charged_requests;
    }
    unresolved += (summary.unresolved_customer_charge_count ?? 0) + (summary.unpriced_request_count ?? 0);
    for (const charge of summary.customer_charges ?? []) {
      const amount = BigInt(charge.amount_nanos);
      charges.set(charge.currency, (charges.get(charge.currency) ?? 0n) + amount);
    }
    for (const [key, charge] of unitCharges(summary)) { const current = units.get(key) ?? charge; current.amount = (units.get(key)?.amount ?? 0n) + charge.amount; units.set(key, current); }
  }
  return {requests, reported, tokens, unresolved, pending, unpriced, ownerFunded, settled, notCharged, charges, units};
}

async function read<T>(url: string, token: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {headers: {authorization: `Bearer ${token}`}, signal});
  if (!response.ok) throw new Error(formatLocalizedMessage('Activity could not be loaded ({0}). Try again.', [response.status], readUILocale()));
  return response.json() as Promise<T>;
}
function checkedRequestPage(value: Page): Page {
  const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  const decimal = (value: unknown) => typeof value === 'string' && /^\d{1,40}$/.test(value);
  const currency = (value: unknown) => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
  const summary = value?.summary;
  if (!Array.isArray(value?.data) || !summary || !integer(summary.request_count) || !integer(summary.usage_count)
    || !decimal(summary.prompt_tokens) || !decimal(summary.completion_tokens)
    || !integer(summary.unresolved_customer_charge_count) || !integer(summary.unpriced_request_count)
    || (summary.owner_funded_request_count !== undefined && !integer(summary.owner_funded_request_count))
    || !Array.isArray(summary.customer_charges) || !summary.customer_charges.every(charge => charge && currency(charge.currency) && decimal(charge.amount_nanos))
    || (value.next_cursor !== null && (typeof value.next_cursor !== 'string' || !value.next_cursor.trim()))
    || !value.data.every(row => row && typeof row.attempt_id === 'string' && !!row.attempt_id
      && typeof row.model === 'string' && !!row.model.trim() && typeof row.execution === 'string'
      && typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))
      && (row.prompt_tokens === null || decimal(row.prompt_tokens)) && (row.completion_tokens === null || decimal(row.completion_tokens))
      && typeof row.customer_charge_status === 'string' && (row.customer_charge_currency === null || currency(row.customer_charge_currency))
      && (row.customer_charge_nanos === null || decimal(row.customer_charge_nanos)))
    || new Set(value.data.map(row => row.attempt_id)).size !== value.data.length) {
    throw new Error('Activity returned invalid request data. Refresh and try again.');
  }
  return value;
}
async function readRequestPage(url: string, token: string, signal: AbortSignal): Promise<Page> {
  return checkedRequestPage(await read<Page>(url, token, signal));
}
const root = (workspace: Workspace) => `/api/v1/workspaces/${workspace.id}/requests`;
const name = (workspace: Workspace) => workspaceDisplayName(workspace.name) || translateUI('Workspace');
const scopeSegment = (workspace: Workspace, list: Workspace[]) => !workspace.slug && !workspace.route_slug && workspace.id.length <= 1 ? workspace.id : workspacePathSegment(workspace, list);
const scopeHref = (workspace: Workspace, list: Workspace[], page: string) => `/workspaces/${scopeSegment(workspace, list)}/${page}`;
function chargeLabel(request: Request) {
  if (request.customer_charge_status === 'charged') {
    if (request.customer_unit_charge != null) {
      return formatUnitAtoms(
        request.customer_unit_charge.net_atoms,
        request.customer_unit_charge.unit_name ?? request.customer_unit_charge.name ?? 'Credits',
        request.customer_unit_charge.display_precision,
      );
    }
    if (request.customer_charge_currency && request.customer_charge_nanos !== null) {
      return money(request.customer_charge_nanos, request.customer_charge_currency);
    }
  }
  return translateUI(({owner_funded: 'No Niu charge', pending: 'Pending settlement', unpriced: 'No rate', not_charged: 'Not charged'} as Record<string,string>)[request.customer_charge_status] ?? 'Unknown');
}

function GlobalActivity({token, models}: {token: string; models: string[]}) {
  const { t: uiT, format: uiF } = useUILocale();
  const location = useLocation(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('workspace') ?? '';
  const section = location.pathname === '/activity/logs' ? 'logs' : 'overview';
  const pendingOnly = section === 'logs' && params.get('settlement') === 'pending';
  const pageQuery = pendingOnly ? 'limit=100&pending_settlement=true' : 'limit=100';
  const cachedWorkspaces = peekQuery<{ data: Workspace[] }>(token, '/api/v1/workspaces', { persist: true })?.data;
  const initialPages = (() => {
    if (!cachedWorkspaces || selectedId) return [];
    const hydrated: WorkspacePage[] = [];
    for (const workspace of cachedWorkspaces) {
      const page = peekQuery<Page>(token, `${root(workspace)}?${pageQuery}`);
      if (!page) return [];
      try {
        hydrated.push({ workspace, page: checkedRequestPage(page) });
      } catch {
        return []; // A corrupt cache entry is ignored; the fetch below replaces it or reports the failure.
      }
    }
    return hydrated;
  })();
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => cachedWorkspaces ?? []);
  const [pages, setPages] = useState<WorkspacePage[]>(() => initialPages);
  const [loading, setLoading] = useState(() => !(cachedWorkspaces && (selectedId || initialPages.length === cachedWorkspaces.length)));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [older, setOlder] = useState(false);
  const olderController = useRef<AbortController | null>(null);
  const selected = selectedId ? resolveWorkspacePathSegment(selectedId, workspaces) : undefined;
  useEffect(() => {
    const controller = new AbortController();
    olderController.current?.abort();
    olderController.current = null;
    setError('');
    const currentWorkspaces = peekQuery<{ data: Workspace[] }>(token, '/api/v1/workspaces', { persist: true })?.data;
    if (!currentWorkspaces || revision > 0) {
      setLoading(true);
    } else if (!selectedId && pages.length === 0 && currentWorkspaces.length > 0) {
      setLoading(true);
    }
    void fetchQuery(
      token,
      '/api/v1/workspaces',
      sig => read<{data: Workspace[]}>('/api/v1/workspaces', token, sig),
      { signal: controller.signal, persist: true, force: revision > 0 },
    ).then(async ({ data: workspaceList }) => {
      if (controller.signal.aborted) return;
      setWorkspaces(workspaceList);
      if (selectedId) {
        if (!resolveWorkspacePathSegment(selectedId, workspaceList)) throw new Error('This workspace is unavailable or you do not have access.');
        return;
      }
      const values = await Promise.all(workspaceList.map(async workspace => {
        const pageUrl = `${root(workspace)}?${pageQuery}`;
        const page = await fetchQuery(
          token,
          pageUrl,
          sig => readRequestPage(pageUrl, token, sig),
          { signal: controller.signal, force: revision > 0 },
        );
        return { workspace, page: checkedRequestPage(page) };
      }));
      if (!controller.signal.aborted) setPages(values);
    }).catch(reason => {
      if (!controller.signal.aborted) {
        setPages([]);
        setError((reason as Error).message);
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {controller.abort(); olderController.current?.abort();};
  }, [token, selectedId, revision, pageQuery]);
  useEffect(() => {setOlder(false);}, [token, selectedId, revision, pageQuery]);
  async function loadOlder() {
    if (loading || olderController.current) return;
    const controller = new AbortController();
    olderController.current = controller;
    setOlder(true); setError('');
    try {
      const values = await Promise.all(pages.map(async item => {
        if (!item.page.next_cursor) return item;
        const cursors = [...(item.cursors ?? []), item.page.next_cursor];
        const next = await readRequestPage(`${root(item.workspace)}?${pageQuery}&after=${encodeURIComponent(item.page.next_cursor)}`,token,controller.signal);
        if (next.next_cursor && cursors.includes(next.next_cursor)) throw new Error('Activity history could not advance. Refresh and try again.');
        const seen = new Set(item.page.data.map(row => row.attempt_id));
        return {...item, cursors, page: {...next, data: [...item.page.data, ...next.data.filter(row => !seen.has(row.attempt_id))]}};
      }));
      if (!controller.signal.aborted) setPages(current => current === pages ? values : current);
    } catch (reason) {if (!controller.signal.aborted) setError((reason as Error).message);} finally {if (olderController.current === controller) {olderController.current = null;if (!controller.signal.aborted) setOlder(false);}}
  }
  const totals = activityTotals(pages);
  const rows = pages.flatMap(item => item.page.data.map(request => ({workspace: item.workspace, request}))).sort((a,b) => b.request.created_at.localeCompare(a.request.created_at));
  const chooseWorkspace = (id: string) => {const query = new URLSearchParams(); if (pendingOnly) query.set('settlement','pending'); if (id) query.set('workspace',id); setParams(query);};
  const workspaceFilterMenu = <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={loading} aria-label={uiT("Filter Activity by workspace")} className="min-w-0"><span className="max-w-52 truncate">{selected ? name(selected) : selectedId ? uiT("Unavailable workspace") : uiT("All workspaces")}</span><IconChevronDown size={16} className="shrink-0"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" collisionPadding={16} className="max-h-80 max-w-[calc(100vw-32px)] overflow-y-auto"><DropdownMenuRadioGroup value={selected ? scopeSegment(selected, workspaces) : selectedId} onValueChange={chooseWorkspace}><DropdownMenuRadioItem value="">{uiT("All workspaces")}</DropdownMenuRadioItem>{workspaces.map(workspace => <DropdownMenuRadioItem key={workspace.id} value={scopeSegment(workspace, workspaces)}><span className="min-w-0 whitespace-normal break-words">{name(workspace)}{workspace.organization_name ? ` · ${organizationDisplayName(workspace.organization_name)}` : ''}</span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>;
  return <div className="grid min-w-0 grid-cols-1 gap-4">
    <PageHeader title={section === 'logs' ? uiT("Logs") : uiT("Overview")} action={<>{workspaceFilterMenu}{!selected && <Button variant="ghost" size="icon-sm" aria-label={uiT("Refresh Activity")} disabled={loading || older} onClick={()=>setRevision(value=>value+1)}><IconRefresh size={16}/></Button>}</>} />
    {error && <Alert variant="destructive"><AlertDescription><p>{uiT(error)}</p><div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={()=>setRevision(value=>value+1)}>{uiT("Try again")}</Button>{selectedId && <Button variant="outline" size="sm" onClick={()=>chooseWorkspace('')}>{uiT("Show all workspaces")}</Button>}</div></AlertDescription></Alert>}
    {loading && !selected && !pages.length ? (section === 'overview' ? <div className="space-y-4"><MetricStripSkeleton count={3} label={uiT("Loading Activity…")} /><TableSkeleton columns={4} rows={3} label="" /></div> : <TableSkeleton columns={6} rows={6} label={uiT("Loading Activity…")} />) : selected && !error ? <GatewayActivity key={`${selected.id}:${section}:${revision}`} token={token} models={models} initialScope={{organizationId: selected.organization_id, projectId: selected.id}} workspaceRoute={`/workspaces/${scopeSegment(selected, workspaces)}`} statisticsOnly={section==='overview'}/> : !selectedId && !error && (!loading || pages.length > 0) && <>
      {!workspaces.length ? <Empty className="min-h-40 py-7"><EmptyHeader><EmptyMedia variant="icon"><IconActivity size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("No workspaces are available.")}</EmptyDescription></EmptyHeader></Empty> : section === 'overview' ? <>
        <section aria-label={uiT("All workspace totals")} className="gateway-activity-summary global-activity-summary">
          <article className="panel"><span><IconActivity size={16} aria-hidden="true" />{uiT("Requests")}</span><strong>{totals.requests.toLocaleString(readUILocale())}</strong><small>{uiT("All time")}</small></article>
          <article className="panel"><span><IconRoute size={16} aria-hidden="true" />{uiT("Token volume")}</span><strong>{totals.requests > 0 && totals.reported === 0 ? uiT("Unknown") : totals.tokens.toLocaleString(readUILocale())}</strong><small>{totals.reported === 1 ? uiF("1 request reported · {0} unknown", [(totals.requests - totals.reported).toLocaleString(readUILocale())]) : uiF("{0} requests reported · {1} unknown", [totals.reported.toLocaleString(readUILocale()), (totals.requests - totals.reported).toLocaleString(readUILocale())])}</small></article>
          <ChargeSummaryCard
            summaryReady
            hasData
            settledTotals={formatSettledChargeTotals({
              unresolved_customer_charge_count: totals.pending,
              unpriced_request_count: totals.unpriced,
              owner_funded_request_count: totals.ownerFunded,
              customer_charges: [...totals.charges].map(([currency, amount]) => ({ currency, amount_nanos: amount.toString() })),
              customer_unit_charges: [...totals.units.values()].map(unit => ({ name: unit.name, display_precision: unit.precision, net_atoms: unit.amount.toString() })),
            })}
            settledCount={totals.settled}
            notChargedCount={totals.notCharged}
            unresolvedCount={totals.pending}
            unpricedCount={totals.unpriced}
            ownerFundedCount={totals.ownerFunded}
            unresolvedHref={totals.pending > 0 ? '/activity/logs?settlement=pending' : undefined}
          />
        </section>
        <section aria-label={uiT("Activity by workspace")} className="min-w-0"><h2 className="mb-3 text-lg font-semibold">{uiT("Usage by workspace")}</h2><Table><TableHeader><TableRow><TableHead>{uiT("Workspace")}</TableHead><TableHead className="text-right">{uiT("Requests")}</TableHead><TableHead className="hidden sm:table-cell text-right">{uiT("Tokens")}</TableHead><TableHead className="hidden md:table-cell text-right tabular-nums">{uiT("Niu charges", "Niu 费用")}</TableHead></TableRow></TableHeader><TableBody>{pages.map(({workspace,page})=>{const wsPending = page.summary.unresolved_customer_charge_count ?? 0; const wsUnpriced = page.summary.unpriced_request_count ?? 0; const wsOwnerFunded = page.summary.owner_funded_request_count ?? 0; const settled = formatSettledChargeTotals(page.summary); return <TableRow key={workspace.id}><TableCell><Link className="font-medium hover:underline" to={`/activity?workspace=${encodeURIComponent(scopeSegment(workspace, workspaces))}`}>{name(workspace)}</Link>{workspace.organization_name && <p className="text-xs text-muted-foreground">{organizationDisplayName(workspace.organization_name)}</p>}</TableCell><TableCell className="text-right tabular-nums">{page.summary.request_count.toLocaleString(readUILocale())}</TableCell><TableCell className="hidden sm:table-cell text-right tabular-nums">{page.summary.request_count > 0 && page.summary.usage_count === 0 ? uiT("Unknown") : (BigInt(page.summary.prompt_tokens)+BigInt(page.summary.completion_tokens)).toLocaleString(readUILocale())}<p className="mt-1 text-xs text-muted-foreground">{page.summary.usage_count === 1 ? uiF("1 request reported · {0} unknown", [(page.summary.request_count-page.summary.usage_count).toLocaleString(readUILocale())]) : uiF("{0} requests reported · {1} unknown", [page.summary.usage_count.toLocaleString(readUILocale()), (page.summary.request_count-page.summary.usage_count).toLocaleString(readUILocale())])}</p></TableCell><TableCell className="hidden md:table-cell text-right tabular-nums">{settled.join(' · ') || (wsPending > 0 ? uiT("Pending settlement", "待结算") : wsUnpriced > 0 ? uiT("No rate set", "未配置费率") : wsOwnerFunded > 0 ? uiT("No Niu charge") : uiT("No settled charges"))}</TableCell></TableRow>;})}</TableBody></Table></section>
      </> : <section aria-label={uiT("Requests across workspaces")} className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{pendingOnly ? uiT("Pending settlement") : uiT("Requests")}</h2>{pendingOnly && <Button asChild variant="ghost" size="sm"><Link to="/activity/logs">{uiT("Clear filter", "清除筛选")}</Link></Button>}<span className="text-sm text-muted-foreground">{rows.length.toLocaleString(readUILocale())}{" "}{uiT("loaded · newest first · all time")}</span></div><Table><TableHeader><TableRow><TableHead className="hidden sm:table-cell">{uiT("Time")}</TableHead><TableHead className="hidden sm:table-cell">{uiT("Workspace")}</TableHead><TableHead>{uiT("Model")}</TableHead><TableHead>{uiT("Status")}</TableHead><TableHead className="hidden md:table-cell text-right tabular-nums">{uiT("Tokens")}</TableHead><TableHead className="hidden md:table-cell text-right tabular-nums">{uiT("Customer charge")}</TableHead></TableRow></TableHeader><TableBody>{rows.map(({workspace,request})=><TableRow key={`${workspace.id}:${request.attempt_id}`} tabIndex={0} className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]" aria-label={uiF("Open {0} request in {1} at {2}", [request.model, name(workspace), new Date(request.created_at).toLocaleString(readUILocale())])} onClick={event => {if (!(event.target as HTMLElement).closest('a, button')) navigate(`${scopeHref(workspace,workspaces,'executions')}#gateway-attempt-${request.reference??request.attempt_id}`);}} onKeyDown={event => {if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {event.preventDefault(); navigate(`${scopeHref(workspace,workspaces,'executions')}#gateway-attempt-${request.reference??request.attempt_id}`);}}}><TableCell className="hidden whitespace-nowrap sm:table-cell">{new Date(request.created_at).toLocaleString(readUILocale())}</TableCell><TableCell className="hidden sm:table-cell">{name(workspace)}</TableCell><TableCell className="max-w-52 whitespace-normal break-words"><Link className="font-medium hover:underline" aria-label={uiF("Open {0} request in {1} at {2}", [request.model, name(workspace), new Date(request.created_at).toLocaleString(readUILocale())])} to={`${scopeHref(workspace,workspaces,'executions')}#gateway-attempt-${request.reference??request.attempt_id}`}>{catalogTitle({ id: request.model })}</Link><p className="mt-1 text-xs text-muted-foreground sm:hidden">{name(workspace)} · {new Date(request.created_at).toLocaleString(readUILocale())}</p></TableCell><TableCell><span className={`gateway-table-status ${request.execution === 'confirmed_completed' ? 'is-complete' : request.execution === 'confirmed_not_executed' ? 'is-failed' : 'is-pending'}`}>{requestOutcomeLabel(request)}</span><p className="mt-1 text-xs text-muted-foreground md:hidden">{chargeLabel(request)}</p></TableCell><TableCell className="hidden md:table-cell text-right tabular-nums">{request.prompt_tokens !== null && request.completion_tokens !== null ? (BigInt(request.prompt_tokens)+BigInt(request.completion_tokens)).toLocaleString(readUILocale()) : uiT("Unknown")}</TableCell><TableCell className="hidden md:table-cell text-right tabular-nums">{chargeLabel(request)}</TableCell></TableRow>)}</TableBody></Table>{!rows.length && <Empty className="mt-3 min-h-36 py-7"><EmptyHeader><EmptyMedia variant="icon"><IconActivity size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{pendingOnly ? uiT("No matching requests") : uiT("No requests recorded by Niu.")}</EmptyDescription></EmptyHeader></Empty>}{pages.some(item=>item.page.next_cursor) && <Button className="mt-4" variant="outline" disabled={older} onClick={()=>void loadOlder()}>{older ? uiT("Loading…") : uiT("Load older requests")}</Button>}</section>}
    </>}
  </div>;
}
export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, () => ({
    endpoint: '/api/v1/workspaces',
    persist: true,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function GlobalActivityRoute() {
  const [params] = useSearchParams();
  useOptionalRouteLoaderData();
  return <ConnectGate>{({token,models})=><GlobalActivity key={params.get('settlement') ?? ''} token={token} models={models.map(model=>model.id)}/>}</ConnectGate>;
}
