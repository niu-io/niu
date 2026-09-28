import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BenchmarksView from '../../../../src/features/benchmarks/components/BenchmarksView';

const readyDataset = {
  mode: 'paired_experiment',
  opt_in: true,
  authorization_ref: 'evaluation-approval-1',
  candidates: [
    { id: 'candidate-a', model_alias: 'model-a', offer_revision: 'route-a-1' },
    { id: 'candidate-b', model_alias: 'model-b', offer_revision: 'route-b-1' },
  ],
  tasks: [{ id: 'task-a', snapshot_sha256: 'a'.repeat(64), tools_sha256: 'b'.repeat(64), permissions_sha256: 'c'.repeat(64), acceptance_sha256: 'd'.repeat(64) }],
  repetitions: 1,
  trials: [
    { task_snapshot_id: 'task-a', candidate_id: 'candidate-a', offer_revision: 'route-a-1', repetition: 1, quality_basis_points: 9500, costs: { currency: 'USD', complete: true }, execution: { coverage: 'complete', spans: [{ id: 'model-a-call', kind: 'model_invocation', requested_model: 'model-a', charge_ref: 'attempt-a' }], outcomes: [{ span_id: 'model-a-call', evidence_id: 'outcome-a', authority: 'human_acceptance', result: 'accepted' }] }, gateway_attempts: [{ attempt_id: 'attempt-a', currency: 'USD', cash_nanos: '10', api_equivalent_nanos: '20' }] },
    { task_snapshot_id: 'task-a', candidate_id: 'candidate-b', offer_revision: 'route-b-1', repetition: 1, quality_basis_points: 9500, costs: { currency: 'USD', complete: true }, execution: { coverage: 'complete', spans: [{ id: 'model-b-call', kind: 'model_invocation', requested_model: 'model-b', charge_ref: 'attempt-b' }], outcomes: [{ span_id: 'model-b-call', evidence_id: 'outcome-b', authority: 'deterministic_validator', result: 'accepted' }] }, gateway_attempts: [{ attempt_id: 'attempt-b', currency: 'USD', cash_nanos: '10', api_equivalent_nanos: '20' }] },
  ],
};

const report = {
  schema_version: 1,
  evidence_kind: 'paired_experiment',
  currency: 'USD',
  cash_budget_nanos: '1000',
  total_cash_nanos: '630',
  api_equivalent_nanos: '1320',
  candidates: [
    { candidate_id: 'reference', model_alias: 'strong', offer_revision: 'route-rev-1', runs: 3, complete_coverage_runs: 3, source_accepted_runs: 3, qualified_completions: 3, qualification_rate_basis_points: 10000, api_equivalent_per_qualified_completion: { numerator_nanos: '690', denominator: 3 }, cash_per_qualified_completion: { numerator_nanos: '330', denominator: 3 }, api_equivalent_nanos: '660', evaluator_api_equivalent_nanos: '30', total_api_equivalent_nanos: '690', cash_nanos: '300', evaluator_cash_nanos: '30', total_cash_nanos: '330', observed_latency_p50_ms: 600, observed_latency_p95_ms: 700 },
    { candidate_id: 'economy', model_alias: 'cheap', offer_revision: 'route-rev-4', runs: 3, complete_coverage_runs: 3, source_accepted_runs: 2, qualified_completions: 2, qualification_rate_basis_points: 6666, api_equivalent_per_qualified_completion: { numerator_nanos: '630', denominator: 2 }, cash_per_qualified_completion: { numerator_nanos: '300', denominator: 2 }, api_equivalent_nanos: '600', evaluator_api_equivalent_nanos: '30', total_api_equivalent_nanos: '630', cash_nanos: '270', evaluator_cash_nanos: '30', total_cash_nanos: '300', observed_latency_p50_ms: 650, observed_latency_p95_ms: 850 },
  ],
  pairs: [
    { task_snapshot_id: 'lower-cost-win', repetition: 1, result: 'candidate_b_wins' },
    { task_snapshot_id: 'extra-work-loss', repetition: 1, result: 'candidate_a_wins' },
    { task_snapshot_id: 'acceptance-failure', repetition: 1, result: 'candidate_a_wins' },
  ],
  paired_uncertainty_95: { wins: 2, losses: 1, ties: 0, both_failed: 0, evaluated_pairs: 3, lower_95: 0.207, upper_95: 0.938 },
  diagnostics: [],
  limits: ['The evaluator does not authenticate imports or dispatch, isolate, authorize, reserve, or stop experiment work.'],
};

describe('benchmark dashboard', () => {
  it('analyzes a dataset through the authenticated admin endpoint and presents measured comparison evidence', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => ({ ok: true, status: 200, json: async () => ({ data: report }) }) as Response);
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<BenchmarksView token="admin-test-token" />);
    const dataset = JSON.stringify(readyDataset);
    fireEvent.change(screen.getByRole('textbox', { name: 'Dataset JSON' }), { target: { value: dataset } });
    await user.click(screen.getByRole('button', { name: 'Analyze dataset' }));

    expect(await screen.findByRole('heading', { name: 'Measured outcomes' })).toBeTruthy();
    expect(screen.getByText('Total cash across every run')).toBeTruthy();
    expect(screen.getAllByText('USD 0.00000063')).toHaveLength(2);
    expect(screen.getByText('66.7%')).toBeTruthy();
    expect(screen.getByLabelText('66.7% qualified')).toBeTruthy();
    expect(screen.getByText('USD 0.00000033 ÷ 3')).toBeTruthy();
    expect(screen.queryByText('Both missed the acceptance criteria')).toBeNull();
    expect(screen.getByText(/sample and does not predict future quality or savings/)).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [path, init] = fetcher.mock.calls[0];
    expect(path).toBe('/admin/v1/benchmarks/compare');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer admin-test-token');
    expect(String(init?.body)).toBe(dataset);
  });

  it('shows missing task, outcome, coverage, route, and cost evidence before submitting', async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);
    const incomplete = JSON.parse(JSON.stringify(readyDataset)) as typeof readyDataset;
    incomplete.tasks[0].snapshot_sha256 = 'missing';
    incomplete.trials.pop();
    incomplete.trials[0].execution.coverage = 'partial';
    incomplete.trials[0].execution.outcomes[0].authority = 'agent_claim';
    incomplete.trials[0].offer_revision = 'stale-route';
    incomplete.trials[0].costs.complete = false;
    const user = userEvent.setup();
    render(<BenchmarksView token="admin-test-token" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Dataset JSON' }), { target: { value: JSON.stringify(incomplete) } });
    await user.click(screen.getByRole('button', { name: 'Analyze dataset' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Task snapshots with matching tool, permission, and acceptance hashes');
    expect(alert.textContent).toContain('A non-conflicting validator or human outcome and quality score for every run');
    expect(alert.textContent).toContain('Complete execution coverage for every run');
    expect(alert.textContent).toContain('A matching model invocation on the pinned route revision for every run');
    expect(alert.textContent).toContain('Settled Gateway charges for every billable span');
    expect(alert.textContent).toContain('One run for every task, candidate, and repetition');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects malformed local JSON without sending a request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<BenchmarksView token="admin-test-token" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Dataset JSON' }), { target: { value: '{broken' } });
    await user.click(screen.getByRole('button', { name: 'Analyze dataset' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The dataset must be valid JSON.');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('shows gateway validation errors without discarding the submitted dataset', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Invalid paired benchmark dataset or incomplete cost evidence' } }) }) as Response);
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<BenchmarksView token="admin-test-token" />);
    const dataset = JSON.stringify(readyDataset);
    fireEvent.change(screen.getByRole('textbox', { name: 'Dataset JSON' }), { target: { value: dataset } });
    await user.click(screen.getByRole('button', { name: 'Analyze dataset' }));
    expect((await screen.findByRole('alert')).textContent).toContain('incomplete cost evidence');
    expect((screen.getByRole('textbox', { name: 'Dataset JSON' }) as HTMLTextAreaElement).value).toBe(dataset);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
