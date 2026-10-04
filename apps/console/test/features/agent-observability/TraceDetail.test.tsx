import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import TraceDetail from '../../../src/features/agent-observability/TraceDetail';

afterEach(() => vi.unstubAllGlobals());
it('keeps completion-only timing unknown when selecting and zooming a model step', async () => {
  const trace = { id: 'private-trace-reference', name: 'Codex session', source: 'codex', occurred_at: '2026-10-04T00:00:00Z', time_basis: 'observed', status: 'unknown', coverage: 'partial', duration_ms: 1000, span_count: 2, error_count: 0, model_calls: 1, tool_calls: 0,
    span_names: { 'session-root': 'Codex session', completion: 'Model response' }, record: { task_id: 'session-root', spans: [
      { id: 'session-root', kind: 'task', status: 'unknown', started_at_ms: 1000, ended_at_ms: 2000, requested_model: null, reported_model: null },
      { id: 'completion', kind: 'model_invocation', status: 'completed', started_at_ms: null, ended_at_ms: 2000, requested_model: 'test-model', reported_model: null },
    ], links: [{ from: 'session-root', to: 'completion', kind: 'contains' }], outcomes: [] } };
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: trace })));
  const user = userEvent.setup();
  render(<TraceDetail token="test-session" id={trace.id} onClose={() => {}} onDeleted={() => {}} />);
  await user.click(await screen.findByRole('button', { name: 'Model response · Model invocation · Completed' }));
  const details = screen.getByRole('region', { name: 'Selected event details' });
  expect(within(details).getByText('Unreported')).toBeTruthy();
  expect(within(details).getByText('Duration').nextElementSibling?.textContent).toBe('Unknown');
  expect(document.querySelectorAll('.agent-span-point')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Zoom in timeline' }));
  expect(within(details).getByText('Unreported')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Fit whole trace' }));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Fit whole trace' }) as HTMLButtonElement).disabled).toBe(true));
  expect(document.body.textContent).not.toContain(trace.id);
  await user.click(screen.getByRole('tab', { name: 'Tree' }));
  expect(within(details).getByRole('heading', { name: 'Model response' })).toBeTruthy();
});
