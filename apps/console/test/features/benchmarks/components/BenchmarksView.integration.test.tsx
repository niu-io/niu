import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BenchmarksView from '../../../../src/features/benchmarks/components/BenchmarksView';

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
    fireEvent.change(screen.getByRole('textbox', { name: 'Dataset JSON' }), { target: { value: '{"schema_version":1}' } });
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
    expect(String(init?.body)).toBe('{"schema_version":1}');
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
    fireEvent.change(screen.getByRole('textbox', { name: 'Dataset JSON' }), { target: { value: '{"opt_in":true}' } });
    await user.click(screen.getByRole('button', { name: 'Analyze dataset' }));
    expect((await screen.findByRole('alert')).textContent).toContain('incomplete cost evidence');
    expect((screen.getByRole('textbox', { name: 'Dataset JSON' }) as HTMLTextAreaElement).value).toBe('{"opt_in":true}');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
