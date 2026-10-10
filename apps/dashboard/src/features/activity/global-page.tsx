import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import ConnectGate from '@/app/ConnectGate';
import type { Workspace } from '@/app/dashboard-context';
import { workspaceDisplayName } from '@/app/workspace-route';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { money } from '@/lib/money';
import { IconChevronDown, IconRefresh } from '@tabler/icons-react';

type Summary = { request_count: number; usage_count: number; prompt_tokens: string; completion_tokens: string; customer_charges: Array<{currency: string; amount_nanos: string}>; unresolved_customer_charge_count: number; unpriced_request_count: number };
type Request = { attempt_id: string; created_at: string; model: string; execution: string; prompt_tokens: string | null; completion_tokens: string | null; customer_charge_status: string; customer_charge_currency: string | null; customer_charge_nanos: string | null };
type Page = {data: Request[]; summary: Summary; next_cursor: string | null};
type WorkspacePage = {workspace: Workspace; page: Page; cursors?: string[]};

export function activityTotals(pages: Array<{page: {summary: Summary}}>) {
  let requests = 0, reported = 0, tokens = 0n, unresolved = 0;
  const charges = new Map<string, bigint>();
  for (const {page: {summary}} of pages) {
    requests += summary.request_count; reported += summary.usage_count;
    tokens += BigInt(summary.prompt_tokens) + BigInt(summary.completion_tokens);
    unresolved += (summary.unresolved_customer_charge_count ?? 0) + (summary.unpriced_request_count ?? 0);
    for (const charge of summary.customer_charges ?? []) charges.set(charge.currency, (charges.get(charge.currency) ?? 0n) + BigInt(charge.amount_nanos));
  }
  return {requests, reported, tokens, unresolved, charges};
}

async function read<T>(url: string, token: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {headers: {authorization: `Bearer ${token}`}, signal});
  if (!response.ok) throw new Error(`Activity could not be loaded (${response.status}). Try again.`);
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
const root = (workspace: Workspace) => `/admin/v1/organizations/${workspace.organization_id}/projects/${workspace.id}/requests`;
const name = (workspace: Workspace) => workspaceDisplayName(workspace.name) || 'Workspace';
const scopeHref = (workspace: Workspace, page: string) => `/workspaces/${workspace.id}/${page}`;
function chargeLabel(request: Request) {
  if (request.customer_charge_status === 'charged' && request.customer_charge_currency && request.customer_charge_nanos !== null) return money(request.customer_charge_nanos, request.customer_charge_currency);
  return ({owner_funded: 'Own API key', pending: 'Unresolved', unpriced: 'No rate', not_charged: 'Not charged'} as Record<string,string>)[request.customer_charge_status] ?? 'Unknown';
}

function GlobalActivity({token, models}: {token: string; models: string[]}) {
  const location = useLocation(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('workspace') ?? '';
  const section = location.pathname === '/activity/logs' ? 'logs' : 'overview';
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [pages, setPages] = useState<WorkspacePage[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [older, setOlder] = useState(false);
  const olderController = useRef<AbortController | null>(null);
  const selected = workspaces.find(workspace => workspace.id === selectedId);
  useEffect(() => {
    const controller = new AbortController();
    olderController.current?.abort();
    olderController.current = null;
    setLoading(true); setError(''); setPages([]); setWorkspaces([]);
    void read<{data: Workspace[]}>('/admin/v1/workspaces', token, controller.signal).then(async value => {
      if (controller.signal.aborted) return;
      setWorkspaces(value.data);
      if (selectedId) {
        if (!value.data.some(workspace => workspace.id === selectedId)) throw new Error('This workspace is unavailable or you do not have access.');
        return;
      }
      const values = await Promise.all(value.data.map(async workspace => ({workspace, page: await readRequestPage(`${root(workspace)}?limit=100`,token,controller.signal)})));
      if (!controller.signal.aborted) setPages(values);
    }).catch(reason => {if (!controller.signal.aborted) setError((reason as Error).message);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => {controller.abort(); olderController.current?.abort();};
  }, [token, selectedId, revision]);
  useEffect(() => {setOlder(false);}, [token, selectedId, revision]);
  async function loadOlder() {
    if (loading || olderController.current) return;
    const controller = new AbortController();
    olderController.current = controller;
    setOlder(true); setError('');
    try {
      const values = await Promise.all(pages.map(async item => {
        if (!item.page.next_cursor) return item;
        const cursors = [...(item.cursors ?? []), item.page.next_cursor];
        const next = await readRequestPage(`${root(item.workspace)}?limit=100&after=${encodeURIComponent(item.page.next_cursor)}`,token,controller.signal);
        if (next.next_cursor && cursors.includes(next.next_cursor)) throw new Error('Activity history could not advance. Refresh and try again.');
        const seen = new Set(item.page.data.map(row => row.attempt_id));
        return {...item, cursors, page: {...next, data: [...item.page.data, ...next.data.filter(row => !seen.has(row.attempt_id))]}};
      }));
      if (!controller.signal.aborted) setPages(current => current === pages ? values : current);
    } catch (reason) {if (!controller.signal.aborted) setError((reason as Error).message);} finally {if (olderController.current === controller) {olderController.current = null;if (!controller.signal.aborted) setOlder(false);}}
  }
  const totals = activityTotals(pages);
  const rows = pages.flatMap(item => item.page.data.map(request => ({workspace: item.workspace, request}))).sort((a,b) => b.request.created_at.localeCompare(a.request.created_at));
  const chooseWorkspace = (id: string) => {const query = new URLSearchParams(); if (id) query.set('workspace',id); setParams(query);};
  return <div className="grid min-w-0 grid-cols-1 gap-4">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      
      <div className="flex min-w-0 max-w-full items-center gap-2">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={loading} aria-label="Filter Activity by workspace" className="min-w-0"><span className="max-w-52 truncate">{selected ? name(selected) : selectedId ? 'Unavailable workspace' : 'All workspaces'}</span><IconChevronDown size={16} className="shrink-0"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="max-h-80 overflow-y-auto"><DropdownMenuRadioGroup value={selectedId} onValueChange={chooseWorkspace}><DropdownMenuRadioItem value="">All workspaces</DropdownMenuRadioItem>{workspaces.map(workspace => <DropdownMenuRadioItem key={workspace.id} value={workspace.id}>{name(workspace)}{workspace.organization_name ? ` · ${workspace.organization_name}` : ''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
        {!selected && <Button variant="ghost" size="icon-sm" aria-label="Refresh Activity" disabled={loading || older} onClick={()=>setRevision(value=>value+1)}><IconRefresh size={16}/></Button>}
      </div>
    </div>
    {error && <Alert variant="destructive"><AlertDescription><p>{error}</p><div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={()=>setRevision(value=>value+1)}>Try again</Button>{selectedId && <Button variant="outline" size="sm" onClick={()=>chooseWorkspace('')}>Show all workspaces</Button>}</div></AlertDescription></Alert>}
    {loading ? <p role="status">Loading Activity…</p> : selected && !error ? <GatewayActivity key={`${selected.id}:${section}:${revision}`} token={token} models={models} initialScope={{organizationId: selected.organization_id, projectId: selected.id}} workspaceRoute={`/workspaces/${selected.id}`} statisticsOnly={section==='overview'}/> : !selectedId && !error && <>
      {!workspaces.length ? <p>No workspaces are available.</p> : section === 'overview' ? <>
        <section aria-label="All workspace totals" className="grid grid-cols-1 gap-6 rounded-xl bg-muted/40 p-6 sm:grid-cols-3">
          <div><p className="text-sm text-muted-foreground">Requests</p><p className="mt-2 text-2xl font-semibold">{totals.requests.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">All time</p></div>
          <div><p className="text-sm text-muted-foreground">Token volume</p><p className="mt-2 text-2xl font-semibold">{totals.tokens.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{totals.reported.toLocaleString()} requests with reported usage</p></div>
          <div><p className="text-sm text-muted-foreground">Customer charges</p><p className="mt-2 text-2xl font-semibold">{[...totals.charges].map(([currency,amount])=>money(amount.toString(),currency)).join(' · ') || 'No settled charges'}</p>{totals.unresolved > 0 && <p className="mt-1 text-xs text-muted-foreground">{totals.unresolved.toLocaleString()} requests with unresolved or unpriced charges</p>}</div>
        </section>
        <section aria-label="Activity by workspace" className="min-w-0"><h2 className="mb-3 text-lg font-semibold">Usage by workspace</h2><Table><TableHeader><TableRow><TableHead>Workspace</TableHead><TableHead>Requests</TableHead><TableHead className="hidden sm:table-cell">Tokens</TableHead><TableHead className="hidden md:table-cell">Customer charges</TableHead></TableRow></TableHeader><TableBody>{pages.map(({workspace,page})=><TableRow key={workspace.id}><TableCell><Link className="font-medium hover:underline" to={`/activity?workspace=${encodeURIComponent(workspace.id)}`}>{name(workspace)}</Link>{workspace.organization_name && <p className="text-xs text-muted-foreground">{workspace.organization_name}</p>}</TableCell><TableCell>{page.summary.request_count.toLocaleString()}</TableCell><TableCell className="hidden sm:table-cell">{(BigInt(page.summary.prompt_tokens)+BigInt(page.summary.completion_tokens)).toLocaleString()}</TableCell><TableCell className="hidden md:table-cell">{page.summary.customer_charges.map(charge=>money(charge.amount_nanos,charge.currency)).join(' · ') || 'No settled charges'}</TableCell></TableRow>)}</TableBody></Table></section>
      </> : <section aria-label="Requests across workspaces" className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Requests</h2><span className="text-sm text-muted-foreground">{rows.length.toLocaleString()} loaded · newest first · all time</span></div><Table><TableHeader><TableRow><TableHead className="hidden sm:table-cell">Time</TableHead><TableHead className="hidden sm:table-cell">Workspace</TableHead><TableHead>Model</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Tokens</TableHead><TableHead className="hidden md:table-cell">Customer charge</TableHead></TableRow></TableHeader><TableBody>{rows.map(({workspace,request})=><TableRow key={`${workspace.id}:${request.attempt_id}`} tabIndex={0} className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]" aria-label={`Open ${request.model} request in ${name(workspace)} at ${new Date(request.created_at).toLocaleString()}`} onClick={event => {if (!(event.target as HTMLElement).closest('a, button')) navigate(`${scopeHref(workspace,'executions')}#gateway-attempt-${request.attempt_id}`);}} onKeyDown={event => {if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {event.preventDefault(); navigate(`${scopeHref(workspace,'executions')}#gateway-attempt-${request.attempt_id}`);}}}><TableCell className="hidden whitespace-nowrap sm:table-cell">{new Date(request.created_at).toLocaleString()}</TableCell><TableCell className="hidden sm:table-cell">{name(workspace)}</TableCell><TableCell className="max-w-52 whitespace-normal break-words"><Link className="font-medium hover:underline" aria-label={`Open ${request.model} request in ${name(workspace)} at ${new Date(request.created_at).toLocaleString()}`} to={`${scopeHref(workspace,'executions')}#gateway-attempt-${request.attempt_id}`}>{request.model}</Link><p className="mt-1 text-xs text-muted-foreground sm:hidden">{name(workspace)} · {new Date(request.created_at).toLocaleString()}</p></TableCell><TableCell>{({confirmed_completed:'Completed',confirmed_not_executed:'Not executed',may_have_executed:'Unresolved',not_sent:'Not sent',output_withheld:'Output withheld',delivery_failed:'Delivery failed'} as Record<string,string>)[request.execution] ?? 'Unknown'}<p className="mt-1 text-xs text-muted-foreground md:hidden">{chargeLabel(request)}</p></TableCell><TableCell className="hidden md:table-cell">{request.prompt_tokens !== null && request.completion_tokens !== null ? (BigInt(request.prompt_tokens)+BigInt(request.completion_tokens)).toLocaleString() : 'Unknown'}</TableCell><TableCell className="hidden md:table-cell">{chargeLabel(request)}</TableCell></TableRow>)}</TableBody></Table>{!rows.length && <p className="py-6 text-sm text-muted-foreground">No requests recorded by Niu.</p>}{pages.some(item=>item.page.next_cursor) && <Button className="mt-4" variant="outline" disabled={older} onClick={()=>void loadOlder()}>{older ? 'Loading…' : 'Load older requests'}</Button>}</section>}
    </>}
  </div>;
}
export default function GlobalActivityRoute() {
  return <ConnectGate>{({token,models})=><GlobalActivity token={token} models={models.map(model=>model.id)}/>}</ConnectGate>;
}
