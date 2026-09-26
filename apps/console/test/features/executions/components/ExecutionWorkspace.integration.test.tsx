import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExecutionWorkspace from '../../../../src/features/executions/components/ExecutionWorkspace';
import type { ExecutionCohort, ExecutionRecordV1 } from '../../../../src/features/executions/utils';
import parallelFixture from '../../../../../../contracts/fixtures/parallel-task.v1.json';

const basePath = '/admin/v1/organizations/org-1/projects/project-1/executions';

function makeRecord(taskId = 'task-01', recordId = 'record-01'): ExecutionRecordV1 {
  return {
    schema_version: 1,
    source: 'agent-harness',
    record_id: recordId,
    task_id: taskId,
    coverage: 'partial',
    spans: [
      { id: taskId, kind: 'task', started_at_ms: 1000, ended_at_ms: 1500 },
      { id: 'agent-01', kind: 'agent', started_at_ms: 1000, ended_at_ms: 1480 },
      { id: 'model-01', kind: 'model_invocation', started_at_ms: 1050, ended_at_ms: 1130, requested_model: 'reasoner-small', reported_model: 'reasoner-v2', charge_ref: 'charge-a' },
      { id: 'tool-01', kind: 'tool_invocation', started_at_ms: 1140, ended_at_ms: 1220 },
      { id: 'model-02', kind: 'model_invocation', started_at_ms: 1250, ended_at_ms: 1350, requested_model: 'reasoner-small', reported_model: 'reasoner-v2', charge_ref: 'charge-b' },
      { id: 'attempt-cancelled', kind: 'attempt', started_at_ms: 1350, ended_at_ms: 1360, status: 'cancelled', charge_ref: 'cancelled-attempt' },
      { id: 'step-untimed', kind: 'step' },
    ],
    links: [
      { from: taskId, to: 'agent-01', kind: 'delegates' },
      { from: 'agent-01', to: 'model-01', kind: 'contains' },
      { from: 'agent-01', to: 'tool-01', kind: 'contains' },
      { from: 'agent-01', to: 'step-untimed', kind: 'contains' },
      { from: 'model-01', to: 'model-02', kind: 'retries' },
    ],
    outcomes: [
      { span_id: 'model-02', evidence_id: 'provider-receipt', authority: 'provider', result: 'accepted' },
      { span_id: taskId, evidence_id: 'validator-report', authority: 'validator', result: 'rejected' },
    ],
  };
}

function makeSummary(id = 'obs-01', taskId = 'task-01', recordId = 'record-01') {
  return { id, source: 'agent-harness', record_id: recordId, task_id: taskId, coverage: 'partial' as const, imported_at: '2026-09-26T08:00:00Z' };
}

function makeCohort(overrides: Partial<ExecutionCohort> = {}): ExecutionCohort {
  return {
    records_scanned: 0, record_limit: 10000, truncated: false,
    coverage: { complete: 0, partial: 0, unknown: 0 },
    outcomes: { accepted: 0, rejected: 0, inconclusive: 0, conflicting: 0, unverified: 0 },
    outcome_evidence: {
      agent_claim: { absent: 0, accepted: 0, rejected: 0, inconclusive: 0, conflicting: 0, evidence_events: 0 },
      deterministic_validator: { absent: 0, accepted: 0, rejected: 0, inconclusive: 0, conflicting: 0, evidence_events: 0 },
      human_acceptance: { absent: 0, accepted: 0, rejected: 0, inconclusive: 0, conflicting: 0, evidence_events: 0 },
    },
    accepted_completions: 0,
    work: { model_invocations: 0, tool_invocations: 0, attempts: 0, validation_spans: 0, human_interventions: 0, failed_spans: 0, cancelled_spans: 0, retry_links: 0, billable_roots_without_charge_references: 0 },
    cost_evidence: { unique_charge_references: 0, unique_attempt_references: 0, resolved_attempts: 0, unresolved_references: 0, attempts_without_cost_entries: 0, settled_cost_entries: 0, complete: false },
    api_equivalent_by_currency: [], configured_rate_cash_by_currency: [],
    api_equivalent_per_accepted_completion: [], configured_rate_cash_per_accepted_completion: [],
    invoice_cash: { state: 'not_imported', totals_by_currency: [] },
    subscription_allocation_cash: { state: 'not_imported', totals_by_currency: [] },
    capacity: { quota_observations: 0, task_attribution: 'unavailable' },
    ...overrides,
  };
}

function mockGateway(initialSummaries: ReturnType<typeof makeSummary>[] = [], failFirstDetail = false, linkedAccounts: Array<{ span_id: string; attempt_id: string; account_id: string; provider: string; plan: string }> = [], initialRecord?: ExecutionRecordV1, cohort = makeCohort()) {
  let summaries = [...initialSummaries];
  let shouldFailDetail = failFirstDetail;
  const records = new Map(summaries.map(item => [item.id, initialRecord ?? makeRecord(item.task_id, item.record_id)]));
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input);
    calls.push({ path, init });
    const method = init?.method ?? 'GET';
    const ok = (body: unknown, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response);
    if (path === '/admin/v1/organizations') return ok({ data: [{ id: 'org-1', name: 'Niu workspace' }] });
    if (path === '/admin/v1/organizations/org-1/projects') return ok({ data: [{ id: 'project-1', name: 'Agent platform' }] });
    if (path === basePath + '/cohort') return ok({ data: cohort });
    if (path.startsWith(basePath + '?')) {
      const after = new URL(path, 'http://niu.test').searchParams.get('after');
      const page = after ? summaries.slice(1, 2) : summaries.slice(0, 1);
      return ok({ data: page, next_cursor: after || summaries.length < 2 ? null : summaries[0].id });
    }
    if (path === basePath && method === 'POST') {
      const imported = JSON.parse(String(init?.body)) as ExecutionRecordV1;
      const existing = summaries.find(item => item.source === imported.source && item.record_id === imported.record_id);
      if (existing) return ok({ id: existing.id, created: false });
      const summary = makeSummary('obs-imported', imported.task_id, imported.record_id);
      summaries = [summary, ...summaries];
      records.set(summary.id, imported);
      return ok({ id: summary.id, created: true }, 201);
    }
    const detailId = path.startsWith(basePath + '/') && !path.slice(basePath.length + 1).includes('/')
      ? path.slice(basePath.length + 1)
      : null;
    if (detailId && method === 'GET') {
      if (shouldFailDetail) { shouldFailDetail = false; return ok({}, 502); }
      return ok({ id: detailId, record: records.get(detailId), linked_accounts: linkedAccounts });
    }
    if (detailId && method === 'DELETE') {
      summaries = summaries.filter(item => item.id !== detailId);
      records.delete(detailId);
      return ok(undefined, 204);
    }
    throw new Error('Unexpected gateway request: ' + method + ' ' + path);
  });
  vi.stubGlobal('fetch', fetcher);
  return { calls, fetcher, summaries: () => summaries };
}

async function chooseProject(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: 'Niu workspace' });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Organization' }), 'org-1');
  await screen.findByRole('option', { name: 'Agent platform' });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Project' }), 'project-1');
}

describe('execution dashboard', () => {
  it('shows a failed detail load clearly and lets the operator retry it', async () => {
    mockGateway([makeSummary()], true);
    const user = userEvent.setup();
    render(<ExecutionWorkspace token="admin-test-token" />);
    await chooseProject(user);
    const run = await screen.findByRole('button', { name: /task-01/ });
    await user.click(run);
    expect(await screen.findByText('Trace could not be loaded.')).toBeTruthy();
    expect(screen.getByText('Request failed (502).')).toBeTruthy();
    expect(screen.queryByText('Loading task evidence…')).toBeNull();

    await user.click(run);
    expect(await screen.findByRole('heading', { name: 'task-01' })).toBeTruthy();
  });

  it('opens the assigned subscription from a charge-linked task span', async () => {
    mockGateway([makeSummary()], false, [{ span_id: 'model-01', attempt_id: 'attempt-01', account_id: 'account-01', provider: 'Aster', plan: 'Team' }]);
    const onOpenSubscription = vi.fn();
    const user = userEvent.setup();
    render(<ExecutionWorkspace token="admin-test-token" onOpenSubscription={onOpenSubscription} />);
    await chooseProject(user);
    await user.click(await screen.findByRole('button', { name: /task-01/ }));
    await user.click(await screen.findByRole('button', { name: /model-01/ }));
    expect(await screen.findByText('Aster · Team')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'View subscription' }));
    expect(onOpenSubscription).toHaveBeenCalledWith('org-1', 'project-1', 'account-01');
  });

  it('appends the next page without losing the selected task investigation', async () => {
    const gateway = mockGateway([makeSummary(), makeSummary('obs-02', 'task-02', 'record-02')]);
    const user = userEvent.setup();
    render(<ExecutionWorkspace token="admin-test-token" />);
    await chooseProject(user);
    await user.click(await screen.findByRole('button', { name: /task-01/ }));
    expect(await screen.findByRole('heading', { name: 'task-01' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Load more/ }));
    expect(await screen.findByRole('button', { name: /task-02/ })).toBeTruthy();
    expect(within(screen.getByRole('complementary', { name: 'Task records' })).getByRole('button', { name: /task-01/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'task-01' })).toBeTruthy();
    expect(gateway.calls.some(call => call.path.includes('after=obs-01'))).toBe(true);
    expect(gateway.calls.filter(call => call.path === basePath + '/obs-01')).toHaveLength(1);
  });

  it('loads a task trace with observed timing, conflicting outcomes, costs and causal links', async () => {
    const gateway = mockGateway([makeSummary()]);
    const user = userEvent.setup();
    render(<ExecutionWorkspace token="admin-test-token" />);
    await chooseProject(user);

    const run = await screen.findByRole('button', { name: /task-01/ });
    await user.click(run);
    expect(screen.getByText('partial coverage')).toBeTruthy();
    expect(await screen.findByText('Evidence differs')).toBeTruthy();
    expect(screen.getByText(/Some intervals are missing/)).toBeTruthy();
    expect(screen.getByText(/At least one source accepted the task and another rejected it/)).toBeTruthy();
    expect(screen.getAllByText('Outcome evidence').length).toBeGreaterThan(0);
    expect(screen.getByText('provider')).toBeTruthy();
    expect(screen.getByText('validator')).toBeTruthy();

    const metrics = screen.getByLabelText('Execution summary');
    expect(metrics.textContent).toContain('Task wall-clock500 ms');
    expect(metrics.textContent).toContain('Invocation work260 ms');
    expect(metrics.textContent).toContain('3 timed');
    expect(metrics.textContent).toContain('0 untimed');
    expect(metrics.textContent).toContain('Model calls2');
    expect(metrics.textContent).toContain('Tool calls1');
    expect(metrics.textContent).toContain('Retries1');
    expect(metrics.textContent).toContain('Charge refs3');
    expect(screen.getAllByText('500 ms').length).toBeGreaterThan(0);
    expect(screen.getByText('3 unique references · amount not available in this import')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /model-02/ }));
    expect(await screen.findByRole('heading', { name: 'model-02' })).toBeTruthy();
    expect(screen.getAllByText('reasoner-small').length).toBeGreaterThan(0);
    expect(screen.getAllByText('charge-b').length).toBeGreaterThan(0);

    const causalSummary = screen.getByText('Causal links').closest('summary');
    expect(causalSummary).not.toBeNull();
    await user.click(causalSummary!);
    expect(screen.getByText('retries')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /attempt-cancelled/ }));
    expect(await screen.findByRole('heading', { name: 'attempt-cancelled' })).toBeTruthy();
    expect(screen.getAllByText('cancelled').length).toBeGreaterThan(0);

    await user.type(screen.getByRole('textbox', { name: 'Search task records' }), 'missing-task');
    expect(screen.getByText('No matching task records')).toBeTruthy();
    expect(gateway.calls.some(call => call.path === basePath + '/obs-01')).toBe(true);
  });

  it('shows a project cohort with exact settled totals and accepted-task cost ratios', async () => {
    const report = makeCohort({
      records_scanned: 2,
      coverage: { complete: 2, partial: 0, unknown: 0 },
      outcomes: { accepted: 1, rejected: 1, inconclusive: 0, conflicting: 0, unverified: 0 },
      outcome_evidence: {
        agent_claim: { absent: 1, accepted: 1, rejected: 0, inconclusive: 0, conflicting: 0, evidence_events: 1 },
        deterministic_validator: { absent: 0, accepted: 1, rejected: 1, inconclusive: 0, conflicting: 0, evidence_events: 2 },
        human_acceptance: { absent: 2, accepted: 0, rejected: 0, inconclusive: 0, conflicting: 0, evidence_events: 0 },
      },
      accepted_completions: 1,
      cost_evidence: { unique_charge_references: 2, unique_attempt_references: 1, resolved_attempts: 1, unresolved_references: 0, attempts_without_cost_entries: 0, settled_cost_entries: 1, complete: true },
      api_equivalent_by_currency: [{ currency: 'USD', amount_nanos: '10000000000' }],
      configured_rate_cash_by_currency: [{ currency: 'USD', amount_nanos: '5000000000' }],
      api_equivalent_per_accepted_completion: [{ currency: 'USD', numerator_nanos: '10000000000', denominator: 1, evidence_complete: true }],
      configured_rate_cash_per_accepted_completion: [{ currency: 'USD', numerator_nanos: '5000000000', denominator: 1, evidence_complete: true }],
      capacity: { quota_observations: 3, task_attribution: 'unavailable' },
    });
    const gateway = mockGateway([], false, [], undefined, report);
    const user = userEvent.setup();
    render(<ExecutionWorkspace token="admin-test-token" />);
    await chooseProject(user);

    expect(await screen.findByRole('heading', { name: 'Cohort outcomes' })).toBeTruthy();
    expect(screen.getByText('Evidence complete')).toBeTruthy();
    const cohort = screen.getByLabelText('Cohort outcomes');
    expect(cohort.textContent).toContain('Imported task records2');
    expect(cohort.textContent).toContain('Accepted completions1');
    expect(cohort.textContent).toContain('USD 10.00');
    expect(cohort.textContent).toContain('USD 5.00');
    expect(cohort.textContent).toContain('÷ 1 accepted tasks');
    expect(cohort.textContent).toContain('3 quota samples · task attribution unavailable');
    expect(cohort.textContent).toContain('not supplier invoices');
    expect(cohort.textContent).toContain('Agent claim');
    expect(cohort.textContent).toContain('Deterministic validator');
    expect(cohort.textContent).toContain('1 accepted · 1 rejected');
    expect(gateway.calls.some(call => call.path === basePath + '/cohort')).toBe(true);
  });

  it('keeps cohort cost per accepted task unavailable when references or coverage are incomplete', async () => {
    const report = makeCohort({
      records_scanned: 1,
      coverage: { complete: 0, partial: 1, unknown: 0 },
      outcomes: { accepted: 1, rejected: 0, inconclusive: 0, conflicting: 0, unverified: 0 },
      accepted_completions: 1,
      cost_evidence: { unique_charge_references: 2, unique_attempt_references: 1, resolved_attempts: 1, unresolved_references: 1, attempts_without_cost_entries: 0, settled_cost_entries: 1, complete: false },
      configured_rate_cash_by_currency: [{ currency: 'USD', amount_nanos: '1000000000' }],
    });
    mockGateway([], false, [], undefined, report);
    const user = userEvent.setup();
    render(<ExecutionWorkspace token="admin-test-token" />);
    await chooseProject(user);

    expect(await screen.findByText('Evidence incomplete')).toBeTruthy();
    const cohort = screen.getByLabelText('Cohort outcomes');
    expect(cohort.textContent).toContain('known settled entries');
    expect(cohort.textContent).toContain('Unavailable while evidence is incomplete');
    expect(cohort.textContent).toContain('1 unresolved refs');
    expect(cohort.textContent).toContain('Invoice cash and subscription allocations are not imported');
  });

  it('marks successful-task cost undefined when the complete cohort has no accepted completions', async () => {
    const report = makeCohort({
      records_scanned: 1,
      coverage: { complete: 1, partial: 0, unknown: 0 },
      outcomes: { accepted: 0, rejected: 1, inconclusive: 0, conflicting: 0, unverified: 0 },
      cost_evidence: { unique_charge_references: 0, unique_attempt_references: 0, resolved_attempts: 0, unresolved_references: 0, attempts_without_cost_entries: 0, settled_cost_entries: 0, complete: true },
    });
    mockGateway([], false, [], undefined, report);
    const user = userEvent.setup();
    render(<ExecutionWorkspace token="admin-test-token" />);
    await chooseProject(user);

    const cohort = screen.getByLabelText('Cohort outcomes');
    expect(await within(cohort).findByText('Evidence complete')).toBeTruthy();
    expect(cohort.textContent).toContain('Undefined with zero accepted tasks');
    expect(cohort.textContent).toContain('Invoice cash and subscription allocations are not imported');
  });

  it('does not invent a currency total for an accepted cohort with no settled currency entries', async () => {
    const report = makeCohort({
      records_scanned: 1,
      coverage: { complete: 1, partial: 0, unknown: 0 },
      outcomes: { accepted: 1, rejected: 0, inconclusive: 0, conflicting: 0, unverified: 0 },
      accepted_completions: 1,
      cost_evidence: { unique_charge_references: 0, unique_attempt_references: 0, resolved_attempts: 0, unresolved_references: 0, attempts_without_cost_entries: 0, settled_cost_entries: 0, complete: true },
    });
    mockGateway([], false, [], undefined, report);
    const user = userEvent.setup();
    render(<ExecutionWorkspace token="admin-test-token" />);
    await chooseProject(user);

    const cohort = screen.getByLabelText('Cohort outcomes');
    expect(await within(cohort).findByText('Evidence complete')).toBeTruthy();
    expect(cohort.textContent).toContain('No settled currency totals');
    expect(cohort.textContent).not.toContain('Undefined with zero accepted tasks');
  });

  it('renders the shared parallel-task fixture with summed invocation work and reported cancellation', async () => {
    mockGateway([makeSummary('fixture-obs', 'task', 'parallel-fixture')], false, [], parallelFixture as unknown as ExecutionRecordV1);
    const user = userEvent.setup();
    render(<ExecutionWorkspace token="admin-test-token" />);
    await chooseProject(user);
    await user.click(await screen.findByRole('button', { name: /^task/ }));

    expect(await screen.findByRole('heading', { name: 'task' })).toBeTruthy();
    expect(screen.getByText('partial coverage')).toBeTruthy();
    expect(screen.getByText('Evidence differs')).toBeTruthy();
    const metrics = screen.getByLabelText('Execution summary');
    expect(metrics.textContent).toContain('Task wall-clock100 ms');
    expect(metrics.textContent).toContain('Invocation work60 ms');
    expect(screen.getByRole('button', { name: /agent-a/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /agent-b/ })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /attempt-retry/ }));
    expect(screen.getByText('cancelled', { selector: 'dd' })).toBeTruthy();
    const causalSummary = screen.getByText('Causal links').closest('summary');
    expect(causalSummary).not.toBeNull();
    await user.click(causalSummary!);
    expect(screen.getByText('resumes')).toBeTruthy();
    expect(screen.getByText('retries')).toBeTruthy();
    expect(screen.getAllByText('delegates')).toHaveLength(2);
    expect(screen.getAllByText('contains')).toHaveLength(4);
    expect(screen.getAllByText('depends on')).toHaveLength(3);
  });

  it('validates and imports a record, then presents an idempotent replay clearly', async () => {
    const gateway = mockGateway();
    const user = userEvent.setup();
    render(<ExecutionWorkspace token="admin-test-token" />);
    await chooseProject(user);
    await user.click(screen.getByRole('button', { name: 'Add task evidence' }));
    const textarea = screen.getByRole('textbox', { name: 'Execution JSON' });

    fireEvent.change(textarea, { target: { value: '{invalid' } });
    await user.click(screen.getByRole('button', { name: 'Import execution' }));
    expect(await screen.findByText('Enter a valid JSON execution record.')).toBeTruthy();

    const imported = makeRecord('task-02', 'record-02');
    fireEvent.change(textarea, { target: { value: JSON.stringify(imported) } });
    await user.click(screen.getByRole('button', { name: 'Import execution' }));
    expect(await screen.findByText('Execution imported.', { selector: '[role="status"]' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /task-02/ })).toBeTruthy();

    const posted = gateway.calls.find(call => call.path === basePath && call.init?.method === 'POST');
    expect(posted).toBeTruthy();
    expect(JSON.parse(String(posted?.init?.body))).toEqual(imported);
    expect(posted?.init?.headers).toBeInstanceOf(Headers);
    expect((posted?.init?.headers as Headers).get('authorization')).toBe('Bearer admin-test-token');

    await user.click(screen.getByRole('button', { name: 'Add task evidence' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Execution JSON' }), { target: { value: JSON.stringify(imported) } });
    await user.click(screen.getByRole('button', { name: 'Import execution' }));
    expect(await screen.findByText('This execution was already imported.', { selector: '[role="status"]' })).toBeTruthy();
    expect(gateway.summaries()).toHaveLength(1);
  });

  it('deletes the selected imported metadata after explicit confirmation', async () => {
    const gateway = mockGateway([makeSummary()]);
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ExecutionWorkspace token="admin-test-token" />);
    await chooseProject(user);
    await user.click(await screen.findByRole('button', { name: /task-01/ }));
    await screen.findByRole('heading', { name: 'task-01' });
    await user.click(screen.getByRole('button', { name: 'Delete imported record' }));

    expect(window.confirm).toHaveBeenCalledWith('Delete imported metadata for task task-01?');
    expect(await screen.findByText('Imported metadata deleted.', { selector: '[role="status"]' })).toBeTruthy();
    expect(screen.getByText('No task evidence yet')).toBeTruthy();
    expect(gateway.calls.some(call => call.path === basePath + '/obs-01' && call.init?.method === 'DELETE')).toBe(true);
  });
});
