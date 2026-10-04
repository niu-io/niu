import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AgentObservability } from '../../../src/features/agent-observability/page';

vi.mock('@/app/console-context', () => ({ useConsoleContext: () => ({ session: { kind: 'operator' } }) }));
const report = { rows: [], summary: { trace_count: '0', completed: '0', failed: '0', unknown_status: '0', partial: '0', untimed: '0', span_count: '0', error_count: '0', model_calls: '0', tool_calls: '0', p50_duration_ms: null, p95_duration_ms: null }, by_day: [], offset: 0, limit: 25 };
const usage = { summary: { response_count: '1', input_tokens: '10', output_tokens: '2', unknown_value_count: '1' }, by_model: [], by_day: [], fees: null, comparison: { subscription_priced_count: '0', subscription_unknown_count: '1', subscription_api_equivalent_usd_nanos: '0', value_multiple: null } };
let fetcher: ReturnType<typeof vi.fn>;
function mount(route: string) { return render(<MemoryRouter initialEntries={[route]}><Routes><Route path="/agent-observability/:section?" element={<AgentObservability token="test-session" />} /></Routes></MemoryRouter>); }
describe('personal agent observability', () => {
  beforeEach(() => {
    fetcher = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST' && path.endsWith('/connections')) return Response.json({ token: 'test-write-only-key' }, { status: 201 });
      if (path.endsWith('/connections')) return Response.json({ data: [] });
      if (path.includes('/traces?')) return Response.json({ data: report });
      return Response.json({ data: usage });
    });
    vi.stubGlobal('fetch', fetcher);
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('keeps all-unknown subscription value unknown rather than showing zero', async () => {
    mount('/agent-observability');
    await screen.findByText('Subscription value');
    expect(screen.queryByText('$0.00')).toBeNull();
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(1);
  });
  it('requires consent and retains the one-time key across the post-create refresh', async () => {
    const user = userEvent.setup(); mount('/agent-observability/settings');
    await screen.findByText('Custom integration');
    await user.click(screen.getByRole('button', { name: 'Connect agent', exact: true }));
    const create = screen.getByRole('button', { name: 'Create ingestion key' });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /I consent to sending/ }));
    await user.click(create);
    const key = await screen.findByLabelText('Ingestion key · shown once');
    await waitFor(() => expect(fetcher.mock.calls.filter(([path]) => path.endsWith('/connections')).length).toBeGreaterThanOrEqual(3));
    expect((key as HTMLInputElement).value).toBe('test-write-only-key');
    await user.click(screen.getByRole('button', { name: 'Show ingestion key' }));
    expect((key as HTMLInputElement).type).toBe('text');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('Ingestion key · shown once')).toBeNull();
  });
  it('preserves period and source when opening trace evidence from metrics', async () => {
    const user = userEvent.setup(); mount('/agent-observability?from=2026-10-01&to=2026-10-02&source=coding-agent');
    await user.click(await screen.findByRole('button', { name: 'Inspect failures' }));
    await screen.findByRole('textbox', { name: 'Search traces by name' });
    await waitFor(() => expect(fetcher.mock.calls.some(([path]) => path.includes('source=coding-agent') && path.includes('status=failed') && path.includes('from_ms=1790812800000'))).toBe(true));
  });
  it('retains the newly created key if refreshing connection metadata fails', async () => {
    let reads = 0;
    fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/connections')) {
        if (init?.method === 'POST') return Response.json({ token: 'test-one-time-key' }, { status: 201 });
        if (++reads > 1) throw new Error('offline');
        return Response.json({ data: [] });
      }
      return Response.json({ data: path.includes('/traces?') ? report : usage });
    });
    const user = userEvent.setup(); mount('/agent-observability/settings');
    await user.click(await screen.findByRole('button', { name: 'Connect agent', exact: true }));
    await user.click(screen.getByRole('checkbox', { name: /I consent to sending/ }));
    await user.click(screen.getByRole('button', { name: 'Create ingestion key' }));
    await waitFor(() => expect(reads).toBe(2));
    expect((await screen.findByLabelText('Ingestion key · shown once') as HTMLInputElement).value).toBe('test-one-time-key');
  });
  it('shows reported completion and failed spans independently without displaying internal identifiers', async () => {
    const id = 'b8ae9cd0-0d6e-49da-a12b-5c5b39fc2c11';
    fetcher.mockImplementation(async (path: string) => {
      if (path.endsWith('/connections')) return Response.json({ data: [] });
      if (path.includes('/traces?')) return Response.json({ data: { ...report, summary: { ...report.summary, trace_count: '1', completed: '1', error_count: '1' }, rows: [{ id, name: 'Recovered tool run', source: 'coding-agent', occurred_at: '2026-10-02T00:00:00Z', time_basis: 'observed', status: 'completed', coverage: 'partial', duration_ms: null, span_count: 3, error_count: 1, model_calls: 0, tool_calls: 1 }] } });
      return Response.json({ data: usage });
    });
    mount('/agent-observability/traces');
    const row = (await screen.findByRole('button', { name: 'Recovered tool run' })).closest('tr')!;
    expect(within(row).getByText('Completed')).toBeTruthy(); expect(within(row).getByText('Unknown')).toBeTruthy();
    expect(document.body.textContent).not.toContain(id);
  });
});
