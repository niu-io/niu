import TaskCharges, { type TaskChargeEvidence } from '@/TaskCharges';
import { timelineAxis, timelinePosition } from '@/lib/timeline';
import { useState } from 'react';
import { useRead } from '@/lib/useRead';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

type Named = { id: string; name: string };
type Summary = { id: string; task_id: string; source: string; coverage: string };
type Span = { id: string; kind: string; started_at_ms: number | null; ended_at_ms: number | null; requested_model: string | null; reported_model: string | null; charge_ref: string | null };
type Record = { task_id: string; coverage: string; spans: Span[]; links: { from: string; to: string; kind: string }[]; outcomes: { span_id: string; evidence_id: string; authority: string; result: string }[] };

export default function TasksPage({ token }: { token: string }) {
  const [organization, setOrganization] = useState('');
  const [project, setProject] = useState('');
  const [selected, setSelected] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const organizations = useRead<{ data: Named[] }>(token, '/admin/v1/organizations');
  const projects = useRead<{ data: Named[] }>(token, organization ? `/admin/v1/organizations/${organization}/projects` : null);
  const base = organization && project ? `/admin/v1/organizations/${organization}/projects/${project}/execution-imports` : null;
  const records = useRead<{ data: Summary[]; next_cursor: string | null }>(token, base ? `${base}?limit=25&refresh=${revision}${cursor ? '&after=' + cursor : ''}` : null);
  const detail = useRead<{ data: Record; charges?: TaskChargeEvidence }>(token, base && selected ? `${base}/${selected}` : null);
  const record = detail.data?.data;
  const axis = record ? timelineAxis(record.spans) : null;
  const task = record?.spans.find(span => span.id === record.task_id);
  const duration = task?.started_at_ms != null && task.ended_at_ms != null ? task.ended_at_ms - task.started_at_ms : null;
  const error = organizations.error || projects.error || records.error || detail.error;
  return <>
    <div className="page-heading"><div><p className="eyebrow">OPTIONAL OBSERVABILITY</p><h1>Tasks</h1><p className="page-subtitle">Inspect imported execution metadata without running or replaying work.</p></div>
      <Button variant="outline" disabled={!project} onClick={() => { setCursor(null); setSelected(''); setRevision(x => x + 1); }}>Refresh</Button></div>
    <section className="panel keys-controls"><div className="key-scope-grid">
      <Label htmlFor="task-org">Organization<NativeSelect id="task-org" value={organization} onChange={e => { setOrganization(e.target.value); setProject(''); setSelected(''); setCursor(null); }}><NativeSelectOption value="">Select organization</NativeSelectOption>{organizations.data?.data.map(x => <NativeSelectOption key={x.id} value={x.id}>{x.name}</NativeSelectOption>)}</NativeSelect></Label>
      <Label htmlFor="task-project">Project<NativeSelect id="task-project" disabled={!organization} value={project} onChange={e => { setProject(e.target.value); setSelected(''); setCursor(null); }}><NativeSelectOption value="">Select project</NativeSelectOption>{projects.data?.data.map(x => <NativeSelectOption key={x.id} value={x.id}>{x.name}</NativeSelectOption>)}</NativeSelect></Label>
    </div><p>Import an authorized metadata export using the command-line importer or administration API. Model access does not require task imports.</p></section>
    {error && <p role="alert" className="error-text">{error}</p>}
    {base && !records.data && !records.error && <p role="status">Loading task records…</p>}
    {records.data && <section className="panel"><Table><TableHeader><TableRow><TableHead>TASK</TableHead><TableHead>SOURCE</TableHead><TableHead>COVERAGE</TableHead></TableRow></TableHeader><TableBody>{records.data.data.map(x => <TableRow key={x.id}><TableCell><Button variant="link" onClick={() => setSelected(x.id)}>{x.task_id}</Button></TableCell><TableCell>{x.source}</TableCell><TableCell><Badge variant="secondary">{x.coverage}</Badge></TableCell></TableRow>)}</TableBody></Table>
      {!records.data.data.length && <p className="empty-state">No imported tasks on this page.</p>}
      {records.data.next_cursor && <div className="ledger-pagination"><Button variant="outline" onClick={() => { setCursor(records.data!.next_cursor); setSelected(''); }}>Next page</Button></div>}
    </section>}
    {selected && !record && !detail.error && <p role="status">Loading execution details…</p>}
    {record && <>
      <section className="panel keys-controls"><h2>{record.task_id}</h2><p>Observed wall-clock duration: {duration === null ? 'Unknown' : `${duration} ms`}. Coverage: {record.coverage}.</p></section>
      <section className="panel keys-controls"><h2>Execution timeline</h2><p>Shared observed time axis. Overlapping bars indicate parallel intervals, not proven independent execution.</p>
        {axis && <p>{axis[0]} → {axis[1]} ms · observed range</p>}
        <div className="task-timeline">{record.spans.map(span => {
          const position = timelinePosition(span, axis);
          return <div className="timeline-row" key={span.id}><span className="timeline-name" title={span.id}>{span.id}</span><div className="timeline-track">{position ? <span className="timeline-bar" style={{ left: `${position.left}%`, width: `${position.width}%` }} aria-label={`${span.id}: ${position.duration} ms`} title={`${span.started_at_ms} → ${span.ended_at_ms} ms`} /> : <span className="timeline-unknown">Incomplete interval</span>}</div><span>{position ? `${position.duration} ms` : 'Unknown'}</span></div>;
        })}</div>
      </section>
      <section className="panel"><div className="panel-heading"><h2>Execution spans</h2></div><Table><TableHeader><TableRow><TableHead>SPAN / KIND</TableHead><TableHead>OBSERVED INTERVAL</TableHead><TableHead>REQUESTED / REPORTED MODEL</TableHead><TableHead>CHARGE REFERENCE</TableHead></TableRow></TableHeader><TableBody>{record.spans.map(span => <TableRow key={span.id}><TableCell>{span.id}<small className="price-revision">{span.kind}</small></TableCell><TableCell>{span.started_at_ms ?? 'Unknown'} → {span.ended_at_ms ?? 'Unknown'} ms</TableCell><TableCell>{span.requested_model ?? 'Unknown'} / {span.reported_model ?? 'Unknown'}</TableCell><TableCell>{span.charge_ref ?? 'Unknown'}</TableCell></TableRow>)}</TableBody></Table></section>
      <TaskCharges charges={detail.data?.charges} />
      <section className="panel keys-controls"><h2>Causal relationships</h2><p>Relationships describe dependencies, not a sequential execution order. Intervals may overlap.</p><ul className="trace-links">{record.links.map((link, i) => <li key={i}><code>{link.from}</code> → <code>{link.to}</code> <Badge variant="outline">{link.kind}</Badge></li>)}</ul></section>
      <section className="panel keys-controls"><h2>Outcome evidence</h2><p>Agent claims are distinct from validator results and human acceptance.</p>{record.outcomes.length ? <ul className="trace-links">{record.outcomes.map(outcome => <li key={outcome.evidence_id}><Badge variant="outline">{outcome.authority}</Badge> {outcome.result} — {outcome.span_id} <small>({outcome.evidence_id})</small></li>)}</ul> : <p>No outcome evidence. Acceptance is unverified.</p>}</section>
    </>}
  </>;
}
