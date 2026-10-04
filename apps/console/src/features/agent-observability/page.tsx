import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { IconCalendar as CalendarDays } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconChevronLeft as ChevronLeft } from "@tabler/icons-react";
import { IconChevronRight as ChevronRight } from "@tabler/icons-react";
import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import { IconSearch as Search } from "@tabler/icons-react";
import { IconAdjustmentsHorizontal as Settings2 } from "@tabler/icons-react";
import { IconRoute as Workflow } from "@tabler/icons-react";
import ConnectGate from '@/app/ConnectGate';
import { useConsoleContext } from '@/app/console-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import Metrics from './Metrics';
import Connections from './Connections';
import TraceDetail from './TraceDetail';
import { base, duration, number, safeLabel, useAgentRead, words, type Connection, type TraceReport, type UsageReport } from './data';
import './styles.css';

const root = '/agent-observability';
const day = 86_400_000;
const utcDate = (ms: number) => new Date(ms).toISOString().slice(0,10);
function validDate(value: string | null, fallback: string) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && utcDate(Date.parse(value)) === value ? value : fallback; }
export default function AgentObservabilityPage() {
  return <ConnectGate>{({ token }) => <AgentObservability token={token} />}</ConnectGate>;
}
export function AgentObservability({ token }: { token: string }) {
  const { session } = useConsoleContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const section = location.pathname.split('/')[2] ?? 'metrics';
  const today = Math.floor(Date.now() / day) * day;
  const fromDate = validDate(params.get('from'), utcDate(today - 29 * day));
  const toDate = validDate(params.get('to'), utcDate(today));
  const from = Date.parse(fromDate), to = Date.parse(toDate) + day;
  const validRange = to > from && to - from <= 366 * day;
  const source = params.get('source') ?? 'all', search = params.get('search') ?? '', status = params.get('status') ?? 'all';
  const offset = Math.max(0, Math.min(100_000, Number(params.get('offset')) || 0));
  const [revision, setRevision] = useState(0), [dateOpen, setDateOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(fromDate), [draftTo, setDraftTo] = useState(toDate), [dateError, setDateError] = useState('');
  const personal = session?.kind === 'operator' || session?.personal_observations === true;
  const query = new URLSearchParams({ from_ms: String(from), to_ms: String(to), offset: String(offset), limit: '25' });
  if (source !== 'all') query.set('source', source);
  if (search) query.set('search', search);
  if (status !== 'all') query.set('status', status);
  const includeUnassembled = params.get('include_unassembled') === 'true';
  if (includeUnassembled) query.set('include_unassembled', 'true');
  const traces = useAgentRead<TraceReport>(token, personal && validRange ? `${base}/traces?${query}` : null, revision);
  const usage = useAgentRead<UsageReport>(token, personal && validRange && (source === 'all' || source === 'codex') ? `${base}?from_ms=${from}&to_ms=${to}` : null, revision);
  const connections = useAgentRead<Connection[]>(token, personal ? `${base}/connections` : null, revision);
  function update(updates: Record<string, string | null>) {
    setParams(old => { const next = new URLSearchParams(old); for (const [k,v] of Object.entries(updates)) v == null ? next.delete(k) : next.set(k,v); return next; });
  }
  function searchForTraces(filters?: { day?: string; status?: string }) {
    const next = new URLSearchParams(params); next.delete('offset'); next.delete('trace');
    if (filters?.status) next.set('status', filters.status);
    if (filters?.day) { next.set('from', filters.day); next.set('to', filters.day); }
    return `${root}/traces?${next}`;
  }
  const sources = Array.from(new Set(['codex', ...(connections.data ?? []).map(c => c.source)]));
  const latest = (connections.data ?? []).map(c => c.last_received_at).filter((t): t is string => t !== null).sort().at(-1);
  const reload = () => setRevision(n => n + 1);
  if (!['metrics','traces','settings'].includes(section)) return <Navigate to={root} replace />;
  if (!personal) return <Card><CardHeader><CardTitle>Personal agent observations</CardTitle><CardDescription>Sign in with an individual account to connect agents and view your personal metrics and traces.</CardDescription></CardHeader></Card>;
  return <section className="agent-observability" aria-label="Agent Observability">
    <div className="agent-page-toolbar"><Tabs value={section === 'settings' ? undefined : section} className="agent-page-tabs"><TabsList><TabsTrigger value="metrics" asChild><Link to={`${root}?${params}`}>Metrics</Link></TabsTrigger><TabsTrigger value="traces" asChild><Link to={`${root}/traces?${params}`}>Traces</Link></TabsTrigger></TabsList></Tabs><div className="agent-toolbar-actions"><Button size="sm" variant="ghost" aria-label="Refresh agent observations" onClick={reload}><RefreshCw size={15} /></Button><Button size="sm" variant="outline" asChild><Link to={`${root}/settings?${params}`}><Settings2 size={15} />{connections.data?.some(c => !c.revoked && !c.expired) ? 'Connection settings' : 'Connect agent'}</Link></Button></div></div>
    {section !== 'settings' && <>
      <div className="agent-filters"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline"><CalendarDays size={16} /><span>{fromDate} – {toDate}</span><ChevronDown size={14} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => update({ from: utcDate(today), to: utcDate(today), offset: null })}>Today</DropdownMenuItem>{[7,14,30].map(n => <DropdownMenuItem key={n} onSelect={() => update({ from: utcDate(today - (n - 1) * day), to: utcDate(today), offset: null })}>Last {n} days</DropdownMenuItem>)}<DropdownMenuSeparator /><DropdownMenuItem onSelect={() => { setDraftFrom(fromDate); setDraftTo(toDate); setDateError(''); setDateOpen(true); }}>Custom range…</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">{source === 'all' ? 'All agents' : safeLabel(source, 'Agent')}<ChevronDown size={14} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={source} onValueChange={value => update({ source: value === 'all' ? null : value, offset: null, trace: null })}><DropdownMenuRadioItem value="all">All agents</DropdownMenuRadioItem>{sources.map(s => <DropdownMenuRadioItem key={s} value={s}>{s === 'codex' ? 'Codex' : safeLabel(s, 'Agent')}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu><span className="agent-timezone">UTC day boundaries</span></div>
      <div className="agent-collection-status"><span className="agent-status-dot" /><span>{latest ? `Latest trace received ${new Date(latest).toLocaleString()}` : 'No trace received yet'}</span><span>Metadata only</span></div>
      {section === 'metrics' && (status !== 'all' || search) && <div className="agent-filters">{status !== 'all' && <Badge variant="outline">Run state: {words(status)}</Badge>}{search && <Badge variant="outline">Name: {safeLabel(search, 'Filtered')}</Badge>}<Button size="sm" variant="ghost" onClick={() => update({ status: null, search: null, offset: null })}>Clear investigation filters</Button><span className="agent-note">These filters apply to trace metrics; measured Codex usage uses the period and source.</span></div>}
    </>}
    {!validRange && <p role="alert">Choose a valid date range of up to 366 days.</p>}
    {(traces.error || usage.error || connections.error) && <div className="agent-read-error" role="alert"><p>{traces.error || usage.error || connections.error}</p><Button variant="outline" onClick={reload}>Try again</Button></div>}
    {section === 'settings' ? connections.data ? <Connections token={token} connections={connections.data} reload={reload} /> : !connections.error && <p role="status">Loading connections…</p> : validRange && !traces.error && (!traces.data ? <p role="status">Loading observations…</p> : section === 'metrics' ? <Metrics token={token} traces={traces.data} usage={usage.data} from={from} to={to} reload={reload} drill={filters => navigate(searchForTraces(filters))} /> : <>
      <div className="agent-trace-counts"><span><strong>{number(traces.data.summary.trace_count)}</strong> {includeUnassembled ? 'records' : 'runs'}</span><span><strong>{number(traces.data.summary.span_count)}</strong> spans</span><span><strong>{number(traces.data.summary.error_count)}</strong> failed spans</span><span>p95 <strong>{duration(traces.data.summary.p95_duration_ms)}</strong></span></div>
      <div className="agent-trace-search"><Button variant="ghost" aria-pressed={includeUnassembled} onClick={() => update({ include_unassembled: includeUnassembled ? null : 'true', offset: null })}>{includeUnassembled ? 'Hide unassembled events' : 'Include unassembled events'}</Button><div className="agent-search-field"><Search size={16} /><Input aria-label="Search traces by name" placeholder="Search traces by name…" value={search} maxLength={120} onChange={e => update({ search: e.target.value || null, offset: null })} /></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">{status === 'all' ? 'All run states' : words(status)}<ChevronDown size={14} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={status} onValueChange={value => update({ status: value === 'all' ? null : value, offset: null })}>{['all','running','completed','failed','cancelled','unknown'].map(s => <DropdownMenuRadioItem key={s} value={s}>{s === 'all' ? 'All run states' : words(s)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>{(search || status !== 'all') && <Button variant="ghost" onClick={() => update({ search: null, status: null, offset: null })}>Reset</Button>}</div>
      <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Observed time</TableHead><TableHead>Source</TableHead><TableHead>Run state</TableHead><TableHead>Duration</TableHead><TableHead>Spans</TableHead><TableHead>Failed spans</TableHead><TableHead>Coverage</TableHead></TableRow></TableHeader><TableBody>{traces.data.rows.map(t => <TableRow key={t.id}><TableCell><Button variant="link" className="agent-trace-name" onClick={() => update({ trace: t.id })}>{safeLabel(t.name, 'Agent run')}</Button>{t.unassembled_event && <small>Unassembled event</small>}</TableCell><TableCell><span className="agent-nowrap">{new Date(t.occurred_at).toLocaleString()}</span>{t.time_basis === 'received' && <small>Receipt time</small>}</TableCell><TableCell>{safeLabel(t.source, 'Agent')}</TableCell><TableCell><Badge variant={t.status === 'failed' ? 'destructive' : 'outline'}>{words(t.status)}</Badge></TableCell><TableCell className="agent-nowrap">{duration(t.duration_ms)}</TableCell><TableCell>{number(t.span_count)}</TableCell><TableCell>{number(t.error_count)}</TableCell><TableCell>{words(t.coverage)}</TableCell></TableRow>)}{!traces.data.rows.length && <TableRow><TableCell colSpan={8}><div className="agent-traces-empty"><Workflow size={30} /><h2>{search || status !== 'all' ? 'No matching traces' : 'No traces in this period'}</h2><p>{search || status !== 'all' ? 'Adjust the name, state or period filters.' : 'Connect your integration and send a metadata-only verification trace.'}</p><Button variant="outline" asChild><Link to={`${root}/settings?${params}`}>Connection settings</Link></Button></div></TableCell></TableRow>}</TableBody></Table>
      <div className="agent-pagination"><span>{number(traces.data.summary.trace_count)} runs · 25 per page</span><div><Button variant="outline" size="sm" aria-label="Previous trace page" disabled={offset === 0} onClick={() => update({ offset: String(Math.max(0,offset - 25)) })}><ChevronLeft size={15} /></Button><span>Page {Math.floor(offset / 25) + 1}</span><Button variant="outline" size="sm" aria-label="Next trace page" disabled={offset + 25 >= Number(traces.data.summary.trace_count)} onClick={() => update({ offset: String(offset + 25) })}><ChevronRight size={15} /></Button></div></div>
    </>)}
    {params.get('trace') && section === 'traces' && <TraceDetail key={params.get('trace')} token={token} id={params.get('trace')!} onClose={() => update({ trace: null })} onDeleted={() => { update({ trace: null }); reload(); }} />}
    <Dialog open={dateOpen} onOpenChange={setDateOpen}><DialogContent><DialogHeader><DialogTitle>Observation period</DialogTitle><DialogDescription>Both dates are included. Daily totals use UTC boundaries.</DialogDescription></DialogHeader><form className="agent-form" onSubmit={e => { e.preventDefault(); const a = Date.parse(draftFrom), b = Date.parse(draftTo) + day; if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b <= a || b - a > 366 * day) { setDateError('Choose a valid period of up to 366 days.'); return; } update({ from: draftFrom, to: draftTo, offset: null }); setDateOpen(false); }}><Label htmlFor="agent-period-from">From</Label><Input id="agent-period-from" type="date" value={draftFrom} onChange={e => setDraftFrom(e.target.value)} required /><Label htmlFor="agent-period-to">Through</Label><Input id="agent-period-to" type="date" value={draftTo} onChange={e => setDraftTo(e.target.value)} required />{dateError && <p role="alert">{dateError}</p>}<DialogFooter><Button variant="outline" type="button" onClick={() => setDateOpen(false)}>Cancel</Button><Button>Apply period</Button></DialogFooter></form></DialogContent></Dialog>
  </section>;
}
