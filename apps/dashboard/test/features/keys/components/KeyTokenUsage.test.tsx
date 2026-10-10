import { it, expect, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeyTokenUsage from '@/features/keys/components/KeyTokenUsage';
const window = { window_seconds: 60, window_end: '2026-10-10T10:00:00Z', requests: 1, known_usage_requests: 1, unknown_usage_requests: 0, known_prompt_tokens: '9007199254740993', known_completion_tokens: '2' };
const empty = { ...window, requests: 0, known_usage_requests: 0, known_prompt_tokens: '0', known_completion_tokens: '0' };
const props = { token: 'test', endpoint: '/keys/one' };

it('keeps token sums exact above the JavaScript safe integer boundary', async () => {
  const fetcher = vi.fn(async () => Response.json({ data: window })); vi.stubGlobal('fetch', fetcher);
  render(<KeyTokenUsage {...props} />);
  expect(await screen.findByText(9007199254740995n.toLocaleString())).toBeTruthy();
  expect(screen.getByText(9007199254740993n.toLocaleString())).toBeTruthy();
  expect(fetcher.mock.calls[0][0]).toBe('/keys/one/token-usage-window');
  expect(screen.getByText(/60 seconds ending/).querySelector('time')?.dateTime).toBe(window.window_end);
});
it('distinguishes incomplete usage from a genuinely empty window', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { ...window, requests: 2, unknown_usage_requests: 1 } })));
  render(<KeyTokenUsage {...props} />);
  expect(await screen.findByText('Unknown')).toBeTruthy();
  expect(screen.getByText(/Known subtotals exclude these requests/)).toBeTruthy();
  expect(screen.queryByText(9007199254740995n.toLocaleString())).toBeNull();
});
it('retries a failed read without presenting zero and renders an actual empty result', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ error: { message: 'Storage unavailable' } }, { status: 503 })).mockResolvedValueOnce(Response.json({ data: empty }));
  vi.stubGlobal('fetch', fetcher); render(<KeyTokenUsage {...props} />);
  await screen.findByRole('alert'); expect(screen.queryByText('Total tokens')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry token usage' }));
  await screen.findByText('No requests dispatched in this window.');
  expect(screen.getAllByText('0')).toHaveLength(4);
});
it('rejects inconsistent or malformed snapshots instead of displaying plausible metrics', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: { ...window, requests: 0 } }))
    .mockResolvedValueOnce(Response.json({ data: { ...empty, known_prompt_tokens: '5' } }))
    .mockResolvedValueOnce(Response.json({ data: { ...window, window_end: 'not a date' } }));
  vi.stubGlobal('fetch', fetcher); render(<KeyTokenUsage {...props} />);
  const user = userEvent.setup();
  for (let index = 0; index < 3; index++) {
    expect((await screen.findByRole('alert')).textContent).toContain('response could not be read');
    expect(screen.queryByText('Requests')).toBeNull();
    if (index < 2) await user.click(screen.getByRole('button', { name: 'Retry token usage' }));
  }
});
it('hides stale snapshots on refresh and aborts old-key reads when scope changes', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: window }))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(Response.json({ data: empty }));
  vi.stubGlobal('fetch', fetcher); const view = render(<KeyTokenUsage {...props} />);
  await screen.findByText(9007199254740995n.toLocaleString());
  await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh 60-second token usage' }));
  expect(screen.queryByText('Total tokens')).toBeNull(); expect(screen.queryByText(/60 seconds ending/)).toBeNull();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  view.rerender(<KeyTokenUsage token="next-session" endpoint="/keys/two" />);
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
  await screen.findByText('No requests dispatched in this window.');
  await act(async () => { finish(Response.json({ data: window })); });
  await waitFor(() => expect(within(screen.getByRole('region', { name: 'Recent token usage' })).getAllByText('0')).toHaveLength(4));
  expect(screen.queryByText(9007199254740995n.toLocaleString())).toBeNull();
  view.unmount(); expect(fetcher.mock.calls[2][1].signal.aborted).toBe(true);
});
