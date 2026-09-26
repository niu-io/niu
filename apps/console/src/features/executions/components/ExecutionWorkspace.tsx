import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Activity, ArrowRight, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { executionMetrics, spanDuration, timelineRows, type ExecutionAccountLink, type ExecutionCohort, type ExecutionRecordV1 } from '@/features/executions/utils';
import ExecutionCohortPanel from '@/features/executions/components/ExecutionCohortPanel';
import TraceRow from '@/features/executions/components/TraceRow';
import { formatDate, kindLabel, projectPath, request, type Named, type Page, type ScopeFocus, type Summary } from '@/features/executions/api';
import TaskCharges, { type TaskChargeEvidence } from './TaskCharges';

export default function ExecutionWorkspace({ token, initialScope, onOpenSubscription, embedded = false }: {
  token: string;
  embedded?: boolean;
  initialScope?: ScopeFocus | null;
  onOpenSubscription?: (organizationId: string, projectId: string, accountId: string) => void;
}) {
  const [organizations, setOrganizations] = useState<Named[]>([]);
  const [projects, setProjects] = useState<Named[]>([]);
  const [organization, setOrganization] = useState(initialScope?.organizationId ?? '');
  const [project, setProject] = useState(initialScope?.projectId ?? '');
  const [records, setRecords] = useState<Summary[]>([]);
  const [cohort, setCohort] = useState<ExecutionCohort | null>(null);
  const [cohortLoading, setCohortLoading] = useState(false);
  const [cohortError, setCohortError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState('');
  const [selected, setSelected] = useState<Summary | null>(null);
  const [detail, setDetail] = useState<ExecutionRecordV1 | null>(null);
  const [charges, setCharges] = useState<TaskChargeEvidence | undefined>();
  const [linkedAccounts, setLinkedAccounts] = useState<ExecutionAccountLink[]>([]);
  const [activeSpanId, setActiveSpanId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const detailRequestSequence = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    void request<{ data: Named[] }>('/admin/v1/organizations', token, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setOrganizations(value.data); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    const focusedProject = initialScope?.organizationId === organization ? initialScope.projectId : '';
    setProjects([]); if (!focusedProject) setProject(''); setRecords([]); setSelected(null); setDetail(null); setCharges(undefined); setLinkedAccounts([]); setActiveSpanId(null);
    if (!organization) return () => controller.abort();
    void request<{ data: Named[] }>('/admin/v1/organizations/' + organization + '/projects', token, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setProjects(value.data); if (focusedProject && value.data.some(item => item.id === focusedProject)) setProject(focusedProject); } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [token, organization, initialScope?.organizationId, initialScope?.projectId]);

  useEffect(() => {
    const controller = new AbortController();
    const firstPage = cursor === '';
    if (firstPage) {
      detailRequestSequence.current += 1;
      setRecords([]); setNextCursor(null); setSelected(null); setDetail(null); setCharges(undefined); setLinkedAccounts([]); setActiveSpanId(null); setDetailLoading(false);
    }
    setError('');
    if (!organization || !project) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    const query = new URLSearchParams({ limit: '50' });
    if (cursor) query.set('after', cursor);
    void request<Page>(projectPath(organization, project) + '?' + query, token, { signal: controller.signal })
      .then(value => {
        if (!controller.signal.aborted) {
          setRecords(previous => firstPage ? value.data : [...previous, ...value.data.filter(item => !previous.some(existing => existing.id === item.id))]);
          setNextCursor(value.next_cursor);
        }
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, organization, project, cursor, revision]);

  useEffect(() => {
    const controller = new AbortController();
    setCohort(null);
    setCohortError('');
    if (!organization || !project) { setCohortLoading(false); return () => controller.abort(); }
    setCohortLoading(true);
    void request<{ data: ExecutionCohort }>(projectPath(organization, project) + '/cohort', token, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setCohort(value.data); })
      .catch(e => { if (!controller.signal.aborted) setCohortError((e as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setCohortLoading(false); });
    return () => controller.abort();
  }, [token, organization, project, revision]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (importOpen && !dialog.open) dialog.showModal();
    if (!importOpen && dialog.open) dialog.close();
  }, [importOpen]);

  async function openRecord(summary: Summary) {
    const sequence = ++detailRequestSequence.current;
    setSelected(summary); setDetail(null); setCharges(undefined); setLinkedAccounts([]); setActiveSpanId(null); setError(''); setNotice('');
    setDetailLoading(true);
    try {
      const value = await request<{ id: string; record: ExecutionRecordV1; linked_accounts?: ExecutionAccountLink[]; charges?: TaskChargeEvidence }>(projectPath(organization, project) + '/' + summary.id, token);
      if (sequence === detailRequestSequence.current) {
        const resolvedSummary = { ...summary, task_id: value.record.task_id, source: value.record.source, record_id: value.record.record_id };
        setSelected(resolvedSummary);
        setRecords(previous => previous.some(item => item.id === summary.id) ? previous : [resolvedSummary, ...previous]);
        setDetail(value.record); setCharges(value.charges); setLinkedAccounts(value.linked_accounts ?? []);
      }
    } catch (e) {
      if (sequence === detailRequestSequence.current) setError((e as Error).message);
    } finally {
      if (sequence === detailRequestSequence.current) setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!initialScope?.executionId || !organization || !project) return;
    void openRecord({ id: initialScope.executionId, source: 'linked', record_id: '', task_id: 'Linked task', coverage: 'unknown', imported_at: '' });
  }, [initialScope?.executionId, organization, project]);

  async function importRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    let record: ExecutionRecordV1;
    try { record = JSON.parse(draft) as ExecutionRecordV1; }
    catch { setError('Enter a valid JSON execution record.'); return; }
    try {
      const result = await request<{ id: string; created: boolean }>(projectPath(organization, project), token, {
        method: 'POST', body: JSON.stringify(record),
      });
      setDraft(''); setImportOpen(false); setCursor(''); setRevision(n => n + 1);
      setNotice(result.created ? 'Task evidence imported.' : 'This task record was already imported.');
    } catch (e) { setError((e as Error).message); }
  }

  async function deleteRecord() {
    if (!selected || !confirm('Delete imported metadata for task ' + selected.task_id + '?')) return;
    try {
      await request<void>(projectPath(organization, project) + '/' + selected.id, token, { method: 'DELETE' });
      detailRequestSequence.current += 1;
      setSelected(null); setDetail(null); setCharges(undefined); setLinkedAccounts([]); setActiveSpanId(null); setDetailLoading(false); setCursor(''); setRevision(n => n + 1);
      setNotice('Imported metadata deleted.'); setError('');
    } catch (e) { setError((e as Error).message); }
  }

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return records;
    return records.filter(record => [record.task_id, record.source, record.record_id].some(value => value.toLocaleLowerCase().includes(query)));
  }, [records, search]);
  const metrics = detail ? executionMetrics(detail) : null;
  const rows = detail ? timelineRows(detail) : [];
  const activeSpan = detail && activeSpanId ? detail.spans.find(span => span.id === activeSpanId) : undefined;
  const activeAccount = activeSpan ? linkedAccounts.find(link => link.span_id === activeSpan.id) : undefined;
  const allOutcomeResults = detail?.outcomes ?? [];
  const conflictingResults = metrics?.hasConflictingResults ?? false;
  return <>
    <div className="page-heading execution-page-heading">
      <div><p className="eyebrow">TASK COST ANALYSIS</p>{embedded ? <h2>Your task evidence</h2> : <h1>Tasks</h1>}<p className="page-subtitle">See how attempts, model calls and tool work add up to each task’s time and cost.</p></div>
      <div className="execution-page-actions">
        <Button variant="outline" disabled={!project || loading} onClick={() => { setCursor(''); setRevision(n => n + 1); }}><RefreshCw />Refresh</Button>
        <Button disabled={!project} onClick={() => { setImportOpen(true); setError(''); setNotice(''); }}><Upload />Add task evidence</Button>
      </div>
    </div>

    <section className="execution-scope panel">
      <div className="key-scope-grid">
        <Label htmlFor="execution-organization">Organization<NativeSelect id="execution-organization" value={organization} onChange={e => { setOrganization(e.target.value); setProject(''); setCursor(''); }}>
          <NativeSelectOption value="">Select organization</NativeSelectOption>{organizations.map(x => <NativeSelectOption key={x.id} value={x.id}>{x.name}</NativeSelectOption>)}
        </NativeSelect></Label>
        <Label htmlFor="execution-project">Project<NativeSelect id="execution-project" disabled={!organization} value={project} onChange={e => { setProject(e.target.value); setCursor(''); }}>
          <NativeSelectOption value="">Select project</NativeSelectOption>{projects.map(x => <NativeSelectOption key={x.id} value={x.id}>{x.name}</NativeSelectOption>)}
        </NativeSelect></Label>
      </div>
      {!project && <p className="execution-scope-note">Choose a project to see its tasks. A task is a piece of work you asked an agent to complete; an attempt is one pass at completing it. Each attempt can contain many model and tool steps.</p>}
    </section>

    <section className="execution-definition panel" aria-label="How task evidence works">
      <p><strong>Task</strong> The complete piece of work, such as “prepare a customer-ready slide deck.” <strong>Attempt</strong> One pass by an agent; retries and revisions remain part of the same task. <strong>Steps</strong> The model requests, tool calls and checks inside an attempt.</p>
      <p>Niu links this evidence so you can compare accepted outcomes by total time and cost, including extra work from retries. Missing measurements stay unknown.</p>
    </section>

    {project && <ExecutionCohortPanel cohort={cohort} loading={cohortLoading} error={cohortError} />}

    {error && !importOpen && <p role="alert" className="error-text execution-feedback">{error}</p>}
    {notice && <p role="status" className="success-text execution-feedback">{notice}</p>}

    {project && <div className="execution-workbench">
      <aside className="execution-explorer panel" aria-label="Task records">
        <div className="execution-explorer-head">
          <div><h2>Task records</h2><span>{records.length}{nextCursor ? '+' : ''} on this page</span></div>
          <span className="execution-stream-mark"><Activity size={17} /></span>
        </div>
        <label className="execution-search" htmlFor="execution-search">
          <Search size={15} aria-hidden="true" /><Input id="execution-search" aria-label="Search task records" value={search} onChange={e => setSearch(e.target.value)} placeholder="Task, source, or record ID" />
        </label>
        {loading && <p role="status" className="execution-loading">Loading task records…</p>}
        <div className="execution-run-list">
          {filteredRecords.map(item => <button type="button" key={item.id} className="execution-run" aria-current={selected?.id === item.id ? 'true' : undefined} onClick={() => void openRecord(item)}>
            <span className="execution-run-top"><strong>{item.task_id}</strong><Badge variant={item.coverage === 'complete' ? 'secondary' : 'outline'}>{item.coverage}</Badge></span>
            <span className="execution-run-meta">{item.source} <span aria-hidden="true">/</span> {formatDate(item.imported_at)}</span>
            <span className="execution-run-id">{item.record_id}</span>
          </button>)}
        </div>
        {!loading && filteredRecords.length === 0 && <div className="execution-empty-list"><Activity size={20} /><strong>{search ? 'No matching task records' : 'No task evidence yet'}</strong><span>{search ? 'Try another task, source, or record ID.' : 'Add a task record to inspect its attempts, model and tool steps, observed time, and outcome evidence.'}</span>{!search && <Button variant="outline" size="sm" disabled={!project} onClick={() => setImportOpen(true)}><Upload />Add task evidence</Button>}</div>}
        {nextCursor && <div className="execution-pagination"><Button variant="outline" disabled={loading} onClick={() => setCursor(nextCursor)}>Load more<ArrowRight /></Button></div>}
        <p className="execution-order-note">Pages use a stable record ID order.</p>
      </aside>

      <section className="execution-investigation" aria-label="Task investigation">
        {!selected && <section className="execution-welcome panel">
          <div className="execution-welcome-mark"><Activity size={20} /></div>
          <p className="eyebrow">TASK INVESTIGATION</p><h2>See how the work unfolded.</h2>
          <p>Select a task record to see what happened: its agent attempts, parallel branches, model requests, tool calls, retries, and acceptance evidence.</p>
        </section>}
        {selected && !detail && <section className="panel execution-welcome"><p role={detailLoading ? 'status' : 'alert'}>{detailLoading ? 'Loading task evidence…' : 'Trace could not be loaded.'}</p></section>}
        {selected && detail && metrics && <>
          <section className="execution-task-head panel">
            <div className="execution-task-title">
              <div><p className="eyebrow">TASK</p><h2>{detail.task_id}</h2><p>{detail.source} <span aria-hidden="true">/</span> {detail.record_id} <span aria-hidden="true">/</span> {formatDate(selected.imported_at)}</p></div>
              <div className="execution-task-actions"><Badge variant="outline">{detail.coverage} coverage</Badge>{conflictingResults && <Badge variant="outline" className="execution-evidence-diff">Evidence differs</Badge>}<Button aria-label="Delete imported record" title="Delete imported record" variant="ghost" size="icon" onClick={() => void deleteRecord()}><Trash2 /></Button></div>
            </div>
            {conflictingResults && <div className="execution-evidence-alert"><span>!</span><p><strong>Outcome evidence differs.</strong> At least one source accepted the task and another rejected it. Niu keeps both records visible and does not infer a final result.</p></div>}
            <div className="execution-metrics" aria-label="Execution summary">
              <div className="execution-latency"><span>Task wall-clock</span><strong>{metrics.wallClockMs == null ? 'Unknown' : metrics.wallClockMs + ' ms'}</strong><small>Observed task interval</small></div>
              <div className="execution-invocation-work"><span>Invocation work</span><strong>{metrics.invocationWorkMs == null ? 'Unknown' : metrics.invocationWorkMs + ' ms'}</strong><small>Model + tool · {metrics.timedInvocationSpans} timed · {metrics.untimedInvocationSpans} untimed</small></div>
              <div><span>Agents</span><strong>{metrics.agents}</strong></div><div><span>Model calls</span><strong>{metrics.modelCalls}</strong></div><div><span>Tool calls</span><strong>{metrics.toolCalls}</strong></div><div><span>Retries</span><strong>{metrics.retries}</strong></div>
              <div className="execution-cost-count"><span>Charge refs</span><strong>{metrics.chargeReferences}</strong><small>Amounts unresolved</small></div>
            </div>
          </section>

          <section className="execution-trace panel">
            <div className="execution-section-head"><div><h3>Activity timeline</h3><p>Rows use observed intervals. Parallel work stays parallel.</p></div><span>{detail.spans.length} spans</span></div>
            <div className="trace-axis" aria-hidden="true"><span>ACTIVITY</span><span>OBSERVED TASK INTERVAL</span><span>DURATION</span></div>
            <div className="trace-rows">
              {rows.map(row => <TraceRow key={row.span.id} row={row} active={activeSpanId === row.span.id} onSelect={() => setActiveSpanId(activeSpanId === row.span.id ? null : row.span.id)} outcomes={detail.outcomes.filter(outcome => outcome.span_id === row.span.id)} />)}
            </div>
            {rows.some(row => row.startPercent == null) && <p className="execution-unknown-note">Some intervals are missing. Niu preserves their order and does not estimate duration.</p>}
          </section>

          {activeSpan && <section className="execution-span-detail panel" aria-live="polite">
            <div><p className="eyebrow">SELECTED SPAN</p><h3>{activeSpan.id}</h3><Badge variant="outline">{kindLabel(activeSpan.kind)}</Badge></div>
            <dl><div><dt>Reported state</dt><dd>{activeSpan.status ? kindLabel(activeSpan.status) : 'Unknown'}</dd></div><div><dt>Requested model</dt><dd>{activeSpan.requested_model ?? 'Unknown'}</dd></div><div><dt>Reported model</dt><dd>{activeSpan.reported_model ?? 'Unknown'}</dd></div><div><dt>Observed duration</dt><dd>{spanDuration(activeSpan) == null ? 'Unknown' : spanDuration(activeSpan) + ' ms'}</dd></div><div><dt>Charge reference</dt><dd>{activeSpan.charge_ref ?? 'Unknown'}</dd></div></dl>
            {activeAccount ? <div className="execution-account-link"><span><small>ASSIGNED SUPPLIER</small><strong>{activeAccount.provider} · {activeAccount.plan}</strong></span><Button variant="outline" size="sm" onClick={() => onOpenSubscription?.(organization, project, activeAccount.account_id)}>View subscription<ArrowRight /></Button></div> : activeSpan.charge_ref && <p className="execution-account-unlinked">This charge reference is not linked to a registered supplier account.</p>}
          </section>}

          <div className="execution-evidence-grid">
            <section className="execution-evidence-panel panel">
              <div className="execution-section-head"><div><h3>Outcome evidence</h3><p>Source and authority remain distinct.</p></div><span>{allOutcomeResults.length}</span></div>
              {allOutcomeResults.length ? <ul className="execution-outcomes">{allOutcomeResults.map(outcome => <li key={outcome.evidence_id}>
                <span className={'outcome-symbol outcome-' + outcome.result} aria-hidden="true">{outcome.result === 'accepted' ? '✓' : outcome.result === 'rejected' ? '×' : '·'}</span>
                <span className="outcome-copy"><strong>{kindLabel(outcome.authority)}</strong><small>Span {outcome.span_id} <span aria-hidden="true">/</span> evidence {outcome.evidence_id}</small></span>
                <Badge variant={outcome.result === 'accepted' ? 'secondary' : outcome.result === 'rejected' ? 'destructive' : 'outline'}>{kindLabel(outcome.result)}</Badge>
              </li>)}</ul> : <p className="execution-unknown-note">No outcome evidence was reported.</p>}
            </section>
            <section className="execution-evidence-panel panel">
                <div className="execution-section-head"><div><h3>Cost references</h3><p>Canonical accounting references; amounts need a ledger match.</p></div><span>{metrics.chargeReferences}</span></div>
              {metrics.chargeReferences ? <>
                <p className="execution-unresolved-cost">{metrics.chargeReferences} unique reference{metrics.chargeReferences === 1 ? '' : 's'} · amount not available in this import</p>
                <ul className="execution-charge-list">{Array.from(new Set(detail.spans.flatMap(span => span.charge_ref ? [span.charge_ref] : []))).map(reference => <li key={reference}><code>{reference}</code><span>Awaiting ledger match</span></li>)}</ul>
              </> : <p className="execution-unknown-note">No charge references were reported. This does not prove the task had zero cost.</p>}
            </section>
          </div>

          <TaskCharges charges={charges} />

          <details className="execution-links-panel panel">
            <summary><span><strong>Causal links</strong><small>Delegation, dependencies, retries, and resumes</small></span><Badge variant="outline">{detail.links.length}</Badge></summary>
            {detail.links.length ? <ul>{detail.links.map((link, index) => <li key={link.from + ':' + link.to + ':' + link.kind + ':' + index}><code>{link.from}</code><ArrowRight size={14} /><Badge variant="outline">{kindLabel(link.kind)}</Badge><ArrowRight size={14} /><code>{link.to}</code></li>)}</ul> : <p className="execution-unknown-note">No causal links were reported.</p>}
          </details>
        </>}
      </section>
    </div>}

    <dialog ref={dialogRef} id="execution-import-dialog" className="execution-import-dialog" aria-labelledby="execution-import-title" onCancel={event => { event.preventDefault(); setImportOpen(false); }} onClose={() => setImportOpen(false)}>
      <form className="execution-import-form" onSubmit={event => void importRecord(event)}>
        <div className="execution-import-head"><div><p className="eyebrow">TASK METADATA</p><h2 id="execution-import-title">Add task evidence</h2><p>Import one task record in Niu’s version 1 metadata format.</p></div><Button type="button" variant="ghost" size="icon" aria-label="Close import dialog" onClick={() => setImportOpen(false)}>×</Button></div>
        <Label htmlFor="execution-json">Task record JSON<textarea id="execution-json" rows={15} value={draft} onChange={e => setDraft(e.target.value)} placeholder={'Paste one task record from Niu’s v1 metadata contract'} required autoFocus /></Label>
        <p className="execution-import-privacy">Prompts, responses, code, tool output, and credentials are not accepted. Replaying identical source and record IDs is safe.</p>
        {error && importOpen && <p role="alert" className="error-text">{error}</p>}
        <div className="execution-import-actions"><Button type="button" variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button><Button type="submit" disabled={!draft.trim()}><Upload />Import execution</Button></div>
      </form>
    </dialog>
  </>;
}
