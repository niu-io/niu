import { useState } from 'react';
import { IconDownload as Download } from "@tabler/icons-react";
import { IconSparkles, IconTerminal2, IconHierarchy, IconArrowsExchange, IconZoomIn, IconZoomOut, IconFocus2 } from '@tabler/icons-react';
import { IconTrash as Trash2 } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { agentRequest, base, duration, dollars, number, safeLabel, spanName, traceOrder, traceExport, useAgentRead, words, type Trace } from './data';

export default function TraceDetail({ token, id, onClose, onDeleted }: { token: string; id: string; onClose: () => void; onDeleted: () => void }) {
  const [revision, setRevision] = useState(0);
  const { data: trace, error } = useAgentRead<Trace>(token, `${base}/traces/${encodeURIComponent(id)}`, revision);
  const [view, setView] = useState('waterfall');
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const order = trace ? traceOrder(trace) : [];
  const span = trace?.record?.spans.find(s => s.id === selected) ?? trace?.record?.spans[0];
  const activeId = selected ?? span?.id;
  const relationships = trace?.record?.links.filter(l => l.from === span?.id || l.to === span?.id) ?? [];
  const icon = (kind: string) => kind === 'model_invocation' ? <IconSparkles size={14} /> : kind === 'tool_invocation' ? <IconTerminal2 size={14} /> : kind === 'attempt' ? <IconArrowsExchange size={14} /> : <IconHierarchy size={14} />;
  const times = trace?.record?.spans.flatMap(s => [s.started_at_ms, s.ended_at_ms].filter((n): n is number => n !== null)) ?? [];
  const start = times.length ? Math.min(...times) : 0, end = times.length ? Math.max(...times) : 0;
  const windowDuration = Math.max(1, end - start) / zoom;
  const focusTime = span?.started_at_ms != null && span?.ended_at_ms != null ? (span.started_at_ms + span.ended_at_ms) / 2 : span?.ended_at_ms ?? (start + end) / 2;
  const windowStart = Math.max(start, Math.min(end - windowDuration, focusTime - windowDuration / 2));
  const windowEnd = windowStart + windowDuration;
  function download() {
    if (!trace) return;
    const exported = traceExport(trace);
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'agent-trace.json'; a.click(); URL.revokeObjectURL(url);
  }
  return <><Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="agent-trace-drawer">
    <DialogHeader><DialogTitle>{trace ? safeLabel(trace.name, 'Agent run') : 'Trace details'}</DialogTitle><DialogDescription>{trace ? `${safeLabel(trace.source, 'Agent')} · ${new Date(trace.occurred_at).toLocaleString()}${trace.time_basis === 'received' ? ' · Receipt time; execution start unknown' : ''}` : 'Loading observed execution evidence…'}</DialogDescription></DialogHeader>
    {error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRevision(n => n + 1)}>Try again</Button></div> : !trace ? <p role="status">Loading trace…</p> : <>
      <div className="agent-trace-summary"><Badge variant={trace.status === 'failed' ? 'destructive' : 'outline'}>{words(trace.status)}</Badge><Badge variant="outline">{words(trace.coverage)} coverage</Badge><span>Duration <strong>{duration(trace.duration_ms)}</strong></span><span>Model calls <strong>{number(trace.model_calls)}</strong></span><span>Tool calls <strong>{number(trace.tool_calls)}</strong></span><span>Failed spans <strong>{number(trace.error_count)}</strong></span></div>
      {trace.unassembled_event && <p className="agent-note">This isolated event has no recoverable session correlation. It is retained as evidence and excluded from the default run report.</p>}
      {trace.record?.task_id.startsWith('session-') && <p className="agent-note">One session with chronological model and tool steps. Duration is the observed activity window; task outcome and unreported model timing remain unknown.</p>}
      <div className="agent-trace-actions"><Button size="sm" variant="outline" onClick={download}><Download size={14} />Export</Button><Button size="sm" variant="ghost" onClick={() => setConfirm(true)}><Trash2 size={14} />Delete trace</Button></div>
      <div className="agent-trace-investigation"><Tabs value={view} onValueChange={setView} className="agent-trace-flow"><div className="agent-timeline-toolbar"><TabsList><TabsTrigger value="waterfall">Timeline</TabsTrigger><TabsTrigger value="tree">Tree</TabsTrigger></TabsList>{view === 'waterfall' && <div className="agent-timeline-zoom"><Button size="icon-sm" variant="ghost" aria-label="Zoom out timeline" disabled={zoom === 1} onClick={() => setZoom(n => Math.max(1, n / 2))}><IconZoomOut size={16} /></Button><Button size="icon-sm" variant="ghost" aria-label="Zoom in timeline" disabled={zoom >= 128 || !times.length} onClick={() => setZoom(n => Math.min(128, n * 2))}><IconZoomIn size={16} /></Button><Button size="icon-sm" variant="ghost" aria-label="Fit whole trace" disabled={zoom === 1} onClick={() => setZoom(1)}><IconFocus2 size={16} /></Button></div>}</div>
        <TabsContent value="waterfall"><div className="agent-waterfall-axis"><span>Execution steps</span><span className="agent-axis-ticks">{[0,.5,1].map(f => <span key={f}>{times.length ? duration(windowStart - start + windowDuration * f) : '—'}</span>)}</span><span>Duration</span></div><div className="agent-span-list">{order.map(({ span: s, depth }) => {
          const timed = s.started_at_ms !== null && s.ended_at_ms !== null;
          const point = !timed && s.ended_at_ms !== null;
          const position = s.started_at_ms ?? s.ended_at_ms;
          const visible = position !== null && (timed ? s.ended_at_ms! >= windowStart && s.started_at_ms! <= windowEnd : position >= windowStart && position <= windowEnd);
          const left = position !== null ? Math.max(0, Math.min(100, (position - windowStart) / windowDuration * 100)) : 0;
          const width = timed ? Math.max(0, (Math.min(s.ended_at_ms!, windowEnd) - Math.max(s.started_at_ms!, windowStart)) / windowDuration * 100) : 0;
          const elapsed = timed ? duration(s.ended_at_ms! - s.started_at_ms!) : '—';
          return <Button key={s.id} variant="ghost" className={`agent-span-row${activeId === s.id ? ' is-selected' : ''}`} aria-pressed={activeId === s.id} aria-label={`${spanName(trace, s)} · ${words(s.kind)} · ${words(s.status ?? 'unknown')}`} onClick={() => setSelected(s.id)}>
            <span className="agent-span-label" style={{ paddingLeft: Math.min(depth, 8) * 14 }}><span className={`agent-step-icon kind-${s.kind}`}>{icon(s.kind)}</span><span className="agent-step-name" title={spanName(trace, s)}>{spanName(trace, s)}</span>{s.status === 'failed' && <span className="agent-step-status status-failed" title="Failed" />}</span>
            <span className="agent-span-track"><span className="agent-track-grid" aria-hidden="true" />{visible && (timed || point) && <span className={`${point || width === 0 ? 'agent-span-point' : 'agent-span-bar'} kind-${s.kind} status-${s.status}`} style={{ left: `${Math.min(99.5, left)}%`, ...(timed && width > 0 ? { width: `${Math.max(.5, Math.min(100 - left, width))}%` } : {}) }} />}</span>
            <span className="agent-span-time" title={timed ? 'Observed interval' : point ? 'Completion observed; start time unreported' : 'Timing unreported'}>{elapsed}</span>
          </Button>;
        })}</div><p className="agent-note">Bars show observed intervals. Points show completion with an unreported start. Missing durations stay unreported. Zoom centers on the selected step.</p></TabsContent>
        <TabsContent value="tree"><div className="agent-span-list">{order.map(({ span: s, depth }) => <Button key={s.id} variant="ghost" className={`agent-tree-row${activeId === s.id ? ' is-selected' : ''}`} aria-pressed={activeId === s.id} onClick={() => setSelected(s.id)}><span className="agent-span-label" style={{ paddingLeft: Math.min(depth, 8) * 14 }}><span className={`agent-step-icon kind-${s.kind}`}>{icon(s.kind)}</span><span className="agent-step-name" title={spanName(trace, s)}>{spanName(trace, s)}</span></span><span className={`agent-tree-state status-${s.status ?? 'unknown'}`}>{words(s.status ?? 'unknown')}</span><span className="agent-span-time">{duration(s.started_at_ms !== null && s.ended_at_ms !== null ? s.ended_at_ms - s.started_at_ms : null)}</span></Button>)}</div><p className="agent-note">Steps follow the source relationships and observed chronology.</p></TabsContent>
      </Tabs><section className="agent-span-detail" aria-label="Selected event details">{span ? <><p className="agent-inspector-heading">Event details</p><h3>{spanName(trace, span)}</h3><Badge variant={span.status === 'failed' ? 'destructive' : 'outline'}>{words(span.status ?? 'unknown')}</Badge><dl><dt>Kind</dt><dd>{words(span.kind)}</dd><dt>Duration</dt><dd>{duration(span.started_at_ms !== null && span.ended_at_ms !== null ? span.ended_at_ms - span.started_at_ms : null)}</dd><dt>Started</dt><dd>{span.started_at_ms === null ? 'Unreported' : new Date(span.started_at_ms).toLocaleString()}</dd><dt>Ended</dt><dd>{span.ended_at_ms === null ? 'Unreported' : new Date(span.ended_at_ms).toLocaleString()}</dd>{span.kind === 'model_invocation' && <><dt>Requested model</dt><dd>{safeLabel(span.requested_model, 'Unknown')}</dd><dt>Reported model</dt><dd>{safeLabel(span.reported_model, 'Unknown')}</dd></>}</dl>
      <h4>Relationships</h4>{relationships.slice(0, 6).map((l, index) => <p key={index} className="agent-note">{spanName(trace, trace.record!.spans.find(s => s.id === l.from)!)} → {words(l.kind)} → {spanName(trace, trace.record!.spans.find(s => s.id === l.to)!)}</p>)}
      {relationships.length > 6 && <p className="agent-note">{number(relationships.length - 6)} more connected steps in the timeline.</p>}
      <p className="agent-note">Metadata only. Prompts, outputs and tool content were not collected.</p></> : <p className="agent-empty-selection">Select an event to inspect its timing, status and relationships.</p>}</section></div>
      {trace.record?.external_usage && <p className="agent-note">Source-reported usage: {number(trace.record.external_usage.input_tokens)} input tokens · {number(trace.record.external_usage.output_tokens)} output tokens. Source estimate: {trace.record.external_usage.currency === 'USD' ? dollars(trace.record.external_usage.cost_nanos) : trace.record.external_usage.cost_nanos === null ? 'Unknown' : `${safeLabel(trace.record.external_usage.currency, 'Unknown currency')} estimate available`}. Separate from subscription API-equivalent value and Niu charges.</p>}
    </>}
  </DialogContent></Dialog><Dialog open={confirm} onOpenChange={setConfirm}><DialogContent><DialogHeader><DialogTitle>Delete this trace?</DialogTitle><DialogDescription>This permanently removes the saved metadata for this run. The connection and other traces remain available.</DialogDescription></DialogHeader>{actionError && <p role="alert">{actionError}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={async () => { setBusy(true); try { await agentRequest(token, `${base}/traces/${encodeURIComponent(id)}`, { method: 'DELETE' }); setConfirm(false); onDeleted(); } catch (e) { setActionError((e as Error).message); } finally { setBusy(false); } }}>Delete trace</Button></DialogFooter></DialogContent></Dialog></>;
}
