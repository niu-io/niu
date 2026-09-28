import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Activity, ArrowRight, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { aggregateExternalUsage, executionMetrics, mergeExecutionRecords, spanDuration, timelineRows, type ExecutionAccountLink, type ExecutionCohort, type ExecutionRecordV1 } from '@/features/executions/utils';
import ExecutionCohortPanel from '@/features/executions/components/ExecutionCohortPanel';
import TraceRow from '@/features/executions/components/TraceRow';
import { formatDate, kindLabel, projectPath, request, type Page, type ScopeFocus, type Summary } from '@/features/executions/api';
import TaskCharges, { type TaskChargeEvidence } from './TaskCharges';
import { money } from '@/lib/money';

type TaskGroup = { key: string; source: string; taskId: string; records: Summary[]; coverage: Summary['coverage']; importedAt: string };

function groupTaskRecords(records: Summary[]): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  for (const record of records) {
    const key = record.source + '\0' + record.task_id;
    let group = groups.get(key);
    if (!group) {
      group = { key, source: record.source, taskId: record.task_id, records: [], coverage: record.coverage, importedAt: record.imported_at };
      groups.set(key, group);
    }
    group.records.push(record);
    if (record.coverage === 'unknown' || (record.coverage === 'partial' && group.coverage === 'complete')) group.coverage = record.coverage;
    if (Date.parse(record.imported_at) > Date.parse(group.importedAt)) group.importedAt = record.imported_at;
  }
  return [...groups.values()];
}

function taskLabel(taskId: string, source: string): string {
  if (source === 'claude-code-otel') {
    const promptId = taskId.split('-prompt-')[1];
    return promptId ? 'Claude Code · ' + promptId.slice(0, 8) : 'Claude Code session';
  }
  return taskId.length > 38 ? taskId.slice(0, 23) + '…' + taskId.slice(-10) : taskId;
}

function mergeTaskCharges(items: Array<TaskChargeEvidence | undefined>): TaskChargeEvidence | undefined {
  const available = items.filter((item): item is TaskChargeEvidence => item != null);
  if (!available.length) return undefined;
  const entries = new Map(available.flatMap(item => item.entries.map(entry => [entry.attempt_id, entry] as const)));
  return {
    entries: [...entries.values()],
    unresolved: [...new Set(available.flatMap(item => item.unresolved))],
    attribution: 'imported_reference',
    task_total_complete: available.length === items.length && available.every(item => item.task_total_complete),
  };
}

async function mapInBatches<T, R>(items: T[], size: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    results.push(...await Promise.all(items.slice(index, index + size).map(map)));
  }
  return results;
}

export default function ExecutionWorkspace({ token, initialScope, onOpenSubscription, embedded = false, platformCosts = false }: {
  token: string;
  embedded?: boolean;
  platformCosts?: boolean;
  initialScope?: ScopeFocus | null;
  onOpenSubscription?: (organizationId: string, projectId: string, accountId: string) => void;
}) {
  const organization = initialScope?.organizationId ?? '';
  const project = initialScope?.projectId ?? '';
  const [records, setRecords] = useState<Summary[]>([]);
  const [cohort, setCohort] = useState<ExecutionCohort | null>(null);
  const [cohortLoading, setCohortLoading] = useState(false);
  const [cohortError, setCohortError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState('');
  const [selected, setSelected] = useState<Summary | null>(null);
  const [detail, setDetail] = useState<ExecutionRecordV1 | null>(null);
  const [taskEventRecords, setTaskEventRecords] = useState<ExecutionRecordV1[]>([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [taskRecordCount, setTaskRecordCount] = useState(0);
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
  const detailRequestSequence = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const firstPage = cursor === '';
    if (firstPage) {
      detailRequestSequence.current += 1;
      setRecords([]); setNextCursor(null); setSelected(null); setDetail(null); setTaskEventRecords([]); setSelectedRecordIds([]); setTaskRecordCount(0); setCharges(undefined); setLinkedAccounts([]); setActiveSpanId(null); setDetailLoading(false);
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
    if (!platformCosts || !organization || !project) { setCohortLoading(false); return () => controller.abort(); }
    setCohortLoading(true);
    void request<{ data: ExecutionCohort }>(projectPath(organization, project) + '/cohort', token, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setCohort(value.data); })
      .catch(e => { if (!controller.signal.aborted) setCohortError((e as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setCohortLoading(false); });
    return () => controller.abort();
  }, [token, organization, project, revision, platformCosts]);

  async function openRecord(summary: Summary) {
    const sequence = ++detailRequestSequence.current;
    setSelected(summary); setDetail(null); setTaskEventRecords([]); setSelectedRecordIds([summary.id]); setTaskRecordCount(1); setCharges(undefined); setLinkedAccounts([]); setActiveSpanId(null); setError(''); setNotice('');
    setDetailLoading(true);
    try {
      const value = await request<{ id: string; record: ExecutionRecordV1; linked_accounts?: ExecutionAccountLink[]; charges?: TaskChargeEvidence }>(projectPath(organization, project) + '/' + summary.id, token);
      if (sequence === detailRequestSequence.current) {
        const resolvedSummary = { ...summary, task_id: value.record.task_id, source: value.record.source, record_id: value.record.record_id };
        setSelected(resolvedSummary);
        setRecords(previous => previous.some(item => item.id === summary.id) ? previous : [resolvedSummary, ...previous]);
        setDetail(value.record); setTaskEventRecords([value.record]); setCharges(value.charges); setLinkedAccounts(value.linked_accounts ?? []);
      }
    } catch (e) {
      if (sequence === detailRequestSequence.current) setError((e as Error).message);
    } finally {
      if (sequence === detailRequestSequence.current) setDetailLoading(false);
    }
  }

  async function openTask(group: TaskGroup) {
    const sequence = ++detailRequestSequence.current;
    const representative = group.records[0];
    setSelected(representative); setDetail(null); setTaskEventRecords([]); setSelectedRecordIds([]); setTaskRecordCount(group.records.length);
    setCharges(undefined); setLinkedAccounts([]); setActiveSpanId(null); setError(''); setNotice(''); setDetailLoading(true);
    try {
      const summaries: Summary[] = [];
      let after: string | null = null;
      do {
        const query = new URLSearchParams({ limit: '100', task_id: group.taskId });
        if (after) query.set('after', after);
        const page = await request<Page>(projectPath(organization, project) + '?' + query, token);
        summaries.push(...page.data.filter(item => item.source === group.source));
        after = page.next_cursor;
      } while (after);

      const uniqueSummaries = [...new Map(summaries.map(item => [item.id, item])).values()];
      if (!uniqueSummaries.length) uniqueSummaries.push(representative);
      const values = await mapInBatches(uniqueSummaries, 8, async item => ({
        summary: item,
        value: await request<{ id: string; record: ExecutionRecordV1; linked_accounts?: ExecutionAccountLink[]; charges?: TaskChargeEvidence }>(projectPath(organization, project) + '/' + item.id, token),
      }));
      if (sequence !== detailRequestSequence.current) return;
      const eventRecords = values.map(item => item.value.record);
      const mergedRecord = mergeExecutionRecords(eventRecords);
      const resolvedSummary = { ...representative, task_id: mergedRecord.task_id, source: mergedRecord.source };
      setSelected(resolvedSummary);
      setRecords(previous => {
        const known = new Set(previous.map(item => item.id));
        return [...uniqueSummaries.filter(item => !known.has(item.id)), ...previous];
      });
      setSelectedRecordIds(uniqueSummaries.map(item => item.id));
      setTaskRecordCount(uniqueSummaries.length);
      setTaskEventRecords(eventRecords);
      setDetail(mergedRecord);
      setCharges(mergeTaskCharges(values.map(item => item.value.charges)));
      setLinkedAccounts([...new Map(values.flatMap(item => item.value.linked_accounts ?? []).map(link => [link.span_id + '\0' + link.attempt_id, link])).values()]);
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
    if (!selected) return;
    const ids = selectedRecordIds.length ? selectedRecordIds : [selected.id];
    const message = ids.length === 1
      ? 'Delete imported metadata for task ' + selected.task_id + '?'
      : 'Delete ' + ids.length + ' event records for task ' + selected.task_id + '?';
    if (!confirm(message)) return;
    try {
      await mapInBatches(ids, 8, id => request<void>(projectPath(organization, project) + '/' + id, token, { method: 'DELETE' }));
      detailRequestSequence.current += 1;
      setSelected(null); setDetail(null); setTaskEventRecords([]); setSelectedRecordIds([]); setTaskRecordCount(0); setCharges(undefined); setLinkedAccounts([]); setActiveSpanId(null); setDetailLoading(false); setCursor(''); setRevision(n => n + 1);
      setNotice(ids.length === 1 ? 'Task evidence deleted.' : ids.length + ' task event records deleted.'); setError('');
    } catch (e) { setError((e as Error).message); }
  }

  const taskGroups = useMemo(() => groupTaskRecords(records), [records]);
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return taskGroups;
    return taskGroups.filter(group => [group.taskId, group.source, ...group.records.map(record => record.record_id)].some(value => value.toLocaleLowerCase().includes(query)));
  }, [taskGroups, search]);
  const selectedGroupKey = selected ? selected.source + '\0' + selected.task_id : '';
  const metrics = detail ? executionMetrics(detail) : null;
  const agentUsage = taskEventRecords.length ? aggregateExternalUsage(taskEventRecords) : null;
  const rows = detail ? timelineRows(detail) : [];
  const activeSpan = detail && activeSpanId ? detail.spans.find(span => span.id === activeSpanId) : undefined;
  const activeAccount = activeSpan ? linkedAccounts.find(link => link.span_id === activeSpan.id) : undefined;
  const allOutcomeResults = detail?.outcomes ?? [];
  const conflictingResults = metrics?.hasConflictingResults ?? false;
  return <>
    <div className="page-heading execution-page-heading">
      <div><h2>{embedded ? 'Task detail' : 'Task activity'}</h2></div>
      <div className="execution-page-actions">
        <Button variant="outline" disabled={!project || loading} onClick={() => { setCursor(''); setRevision(n => n + 1); }}><RefreshCw />Refresh</Button>
        <Button disabled={!project} onClick={() => { setImportOpen(true); setError(''); setNotice(''); }}><Upload />Add task evidence</Button>
      </div>
    </div>

    {!project && <p className="execution-scope-note">Choose or create a workspace from the navigation to see its tasks. A task is a piece of work you asked an agent to complete; an attempt is one pass at completing it. Each attempt can contain many model and tool steps.</p>}

    {platformCosts && project && <ExecutionCohortPanel cohort={cohort} loading={cohortLoading} error={cohortError} />}

    {error && !importOpen && <p role="alert" className="error-text execution-feedback">{error}</p>}
    {notice && <p role="status" className="success-text execution-feedback">{notice}</p>}

    {project && <div className="execution-workbench">
      <aside className="execution-explorer panel" aria-label="Task records">
        <div className="execution-explorer-head">
          <div><h2>Tasks</h2><span>{taskGroups.length}{nextCursor ? '+' : ''}</span></div>
          <span className="execution-stream-mark"><Activity size={17} /></span>
        </div>
        <label className="execution-search" htmlFor="execution-search">
          <Search size={15} aria-hidden="true" /><Input id="execution-search" aria-label="Search task records" value={search} onChange={e => setSearch(e.target.value)} placeholder="Task, source, or record ID" />
        </label>
        {loading && <p role="status" className="execution-loading">Loading task records…</p>}
        <div className="execution-run-list">
          {filteredRecords.map(group => <Button type="button" key={group.key} className="execution-run" aria-current={selectedGroupKey === group.key ? 'true' : undefined} onClick={() => void openTask(group)}>
            <span className="execution-run-top"><strong title={group.taskId}>{taskLabel(group.taskId, group.source)}</strong><Badge variant={group.coverage === 'complete' ? 'secondary' : 'outline'}>{group.coverage}</Badge></span>
            <span className="execution-run-meta">{group.source} <span aria-hidden="true">/</span> {group.records.length} {group.records.length === 1 ? 'event' : 'events'} loaded <span aria-hidden="true">/</span> {formatDate(group.importedAt)}</span>
          </Button>)}
        </div>
        {!loading && filteredRecords.length === 0 && <div className="execution-empty-list"><Activity size={20} /><strong>{search ? 'No matching tasks' : 'No task evidence yet'}</strong><span>{search ? 'Try another task, source, or record ID.' : 'Connect an agent or add a task record to inspect its work.'}</span>{!search && <Button variant="outline" size="sm" disabled={!project} onClick={() => setImportOpen(true)}><Upload />Add task evidence</Button>}</div>}
        {nextCursor && <div className="execution-pagination"><Button variant="outline" disabled={loading} onClick={() => setCursor(nextCursor)}>Load more<ArrowRight /></Button></div>}
        <p className="execution-order-note">Pages use a stable record ID order.</p>
      </aside>

      <section className="execution-investigation" aria-label="Task investigation">
        {!selected && <section className="execution-welcome panel">
          <div className="execution-welcome-mark"><Activity size={20} /></div>
          <p className="eyebrow">TASK INVESTIGATION</p><h2>Select a task</h2>
          <p>Inspect model calls, tools, retries, and outcome evidence.</p>
        </section>}
        {selected && !detail && <section className="panel execution-welcome"><p role={detailLoading ? 'status' : 'alert'}>{detailLoading ? 'Loading task evidence…' : 'Trace could not be loaded.'}</p></section>}
        {selected && detail && metrics && <>
          <section className="execution-task-head panel">
            <div className="execution-task-title">
              <div><p className="eyebrow">TASK</p><h2 title={detail.task_id}>{taskLabel(detail.task_id, detail.source)}</h2><p>{detail.source} <span aria-hidden="true">/</span> {taskRecordCount} {taskRecordCount === 1 ? 'event record' : 'event records'} <span aria-hidden="true">/</span> {formatDate(selected.imported_at)}</p></div>
              <div className="execution-task-actions"><Badge variant="outline">{detail.coverage} coverage</Badge>{conflictingResults && <Badge variant="outline" className="execution-evidence-diff">Evidence differs</Badge>}<Button aria-label="Delete task evidence" title="Delete task evidence" variant="ghost" size="icon" onClick={() => void deleteRecord()}><Trash2 /></Button></div>
            </div>
            {conflictingResults && <div className="execution-evidence-alert"><span>!</span><p><strong>Outcome evidence differs.</strong> At least one source accepted the task and another rejected it. Niu keeps both records visible and does not infer a final result.</p></div>}
            <div className="execution-metrics" aria-label="Execution summary">
              <div className="execution-latency"><span>Task wall-clock</span><strong>{metrics.wallClockMs == null ? 'Unknown' : metrics.wallClockMs + ' ms'}</strong><small>Observed task interval</small></div>
              <div className="execution-invocation-work"><span>Invocation work</span><strong>{metrics.invocationWorkMs == null ? 'Unknown' : metrics.invocationWorkMs + ' ms'}</strong><small>Model + tool · {metrics.timedInvocationSpans} timed · {metrics.untimedInvocationSpans} untimed</small></div>
              <div><span>Agents</span><strong>{metrics.agents}</strong></div><div><span>Model calls</span><strong>{metrics.modelCalls}</strong></div><div><span>Tool calls</span><strong>{metrics.toolCalls}</strong></div><div><span>Retries</span><strong>{metrics.retries}</strong></div>
              <div className="execution-cost-count"><span>Charge refs</span><strong>{metrics.chargeReferences}</strong><small>Amounts unresolved</small></div>
            </div>
          </section>

          {agentUsage && <section className="execution-agent-usage panel" aria-label="Agent-reported usage estimate">
            <div className="execution-section-head"><div><h3>Agent-reported usage</h3><p>{agentUsage.agent_version ? 'Version ' + agentUsage.agent_version : 'Version unknown'}</p></div><Badge variant="outline">Estimate</Badge></div>
            <div className="execution-agent-usage-grid">
              <div><span>Requests</span><strong>{agentUsage.request_count ?? 'Unknown'}</strong></div>
              <div><span>Retries</span><strong>{agentUsage.retry_count ?? 'Unknown'}</strong></div>
              <div><span>Input tokens</span><strong>{agentUsage.input_tokens ?? 'Unknown'}</strong></div>
              <div><span>Output tokens</span><strong>{agentUsage.output_tokens ?? 'Unknown'}</strong></div>
              <div><span>Cache read</span><strong>{agentUsage.cache_read_tokens ?? 'Unknown'}</strong></div>
              <div><span>Cache created</span><strong>{agentUsage.cache_creation_tokens ?? 'Unknown'}</strong></div>
              <div><span>Reported cost</span><strong>{agentUsage.cost_nanos == null || !agentUsage.currency ? 'Unknown' : money(agentUsage.cost_nanos, agentUsage.currency)}</strong></div>
            </div>
            <p className="execution-agent-usage-note">{agentUsage.complete ? 'Agent telemetry; not a settled Niu charge.' : 'Partial telemetry. Missing event values remain unknown.'}</p>
          </section>}

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

          {platformCosts && <TaskCharges charges={charges} />}

          <details className="execution-links-panel panel">
            <summary><span><strong>Causal links</strong><small>Delegation, dependencies, model fallbacks, retries, and resumes</small></span><Badge variant="outline">{detail.links.length}</Badge></summary>
            {detail.links.length ? <ul>{detail.links.map((link, index) => <li key={link.from + ':' + link.to + ':' + link.kind + ':' + index}><code>{link.from}</code><ArrowRight size={14} /><Badge variant="outline">{kindLabel(link.kind)}</Badge><ArrowRight size={14} /><code>{link.to}</code></li>)}</ul> : <p className="execution-unknown-note">No causal links were reported.</p>}
          </details>
        </>}
      </section>
    </div>}

    <Dialog open={importOpen} onOpenChange={setImportOpen}>
      <DialogContent className="niu-modal execution-import-dialog" showCloseButton={false}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>Add task evidence</DialogTitle><DialogDescription>Import one task record in Niu’s version 1 metadata format.</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
        </DialogHeader>
      <form className="execution-import-form" onSubmit={event => void importRecord(event)}>
        <Label htmlFor="execution-json">Task record JSON<Textarea id="execution-json" rows={15} value={draft} onChange={e => setDraft(e.target.value)} placeholder={'Paste one task record from Niu’s v1 metadata contract'} required autoFocus /></Label>
        <p className="execution-import-privacy">Prompts, responses, code, tool output, and credentials are not accepted. Replaying identical source and record IDs is safe.</p>
        {error && importOpen && <p role="alert" className="error-text">{error}</p>}
        <div className="execution-import-actions"><Button type="button" variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button><Button type="submit" disabled={!draft.trim()}><Upload />Import execution</Button></div>
      </form>
    </DialogContent>
    </Dialog>
  </>;
}
