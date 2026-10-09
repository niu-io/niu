import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeyGuardrailHistory from '../../../src/features/keys/components/KeyGuardrailHistory';
const change = { assignment_revision: 2, policy_revision: null, policy_name: null, actor_name: 'Workspace member', created_at: '2026-10-03T01:00:00Z' };
const show = () => render(<KeyGuardrailHistory token="reader" endpoint="/key/guardrail" />);

describe('key assignment history', () => {
  it('loads only when opened and follows exclusive cursors with readable changes', async () => {
    const fetch = vi.fn(async (url: string) => Response.json(url.includes('?')
      ? { data: [{ ...change, assignment_revision: 1, policy_revision: 7, policy_name: 'Saved restriction' }], next_cursor: null }
      : { data: [change], next_cursor: 2 }));
    vi.stubGlobal('fetch', fetch); show();
    expect(fetch).not.toHaveBeenCalled();
    const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Assignment history' }));
    await screen.findByText('Key policy removed');
    await user.click(screen.getByRole('button', { name: 'Load older changes' }));
    await screen.findByText('Saved restriction · Version 7');
    expect(fetch).toHaveBeenLastCalledWith('/key/guardrail/history?before_assignment_revision=2', expect.objectContaining({ headers: { authorization: 'Bearer reader' } }));
    expect(screen.queryByRole('button', { name: 'Load older changes' })).toBeNull();
    expect(screen.queryByText('2')).toBeNull();
  });
  it('does not fabricate empty history after an access or storage failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { message: 'History unavailable' } }, { status: 503 })));
    show(); await userEvent.setup().click(screen.getByRole('button', { name: 'Assignment history' }));
    await screen.findByRole('alert');
    expect(screen.queryByText(/No recorded assignment/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).not.toBeNull();
  });
  it('rejects a non-descending older page without duplicating recorded events', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [change], next_cursor: 2 })));
    show(); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Assignment history' }));
    await screen.findByText('Key policy removed'); await user.click(screen.getByRole('button', { name: 'Load older changes' }));
    await screen.findByText('Invalid assignment history response.');
    expect(screen.getAllByText('Key policy removed')).toHaveLength(1);
  });
});

it('discards a previous key response after the endpoint changes', async () => {
  let resolveOld!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('/first/')
    ? new Promise<Response>(resolve => { resolveOld = resolve; })
    : Promise.resolve(Response.json({ data: [{ ...change, policy_revision: 9, policy_name: 'Second key policy' }], next_cursor: null }))));
  const { rerender } = render(<KeyGuardrailHistory token="reader" endpoint="/first/guardrail" />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Assignment history' }));
  rerender(<KeyGuardrailHistory token="reader" endpoint="/second/guardrail" />);
  await screen.findByText('Second key policy · Version 9');
  resolveOld(Response.json({ data: [{ ...change, policy_revision: 7, policy_name: 'Old key policy' }], next_cursor: null }));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(screen.queryByText('Old key policy · Version 7')).toBeNull();
});

it('cancels a closed read and reloads fresh data on reopening', async () => {
  const signals: AbortSignal[] = [];
  let resolveOld!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
    signals.push(init.signal as AbortSignal);
    return signals.length === 1 ? new Promise<Response>(resolve => { resolveOld = resolve; })
      : Promise.resolve(Response.json({ data: [], next_cursor: null }));
  }));
  show(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Assignment history' }));
  await screen.findByText('Loading assignment history…');
  await user.click(screen.getAllByRole('button', { name: 'Close', exact: true })[0]);
  expect(signals[0].aborted).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Assignment history' }));
  await screen.findByText(/No recorded assignment changes/);
  resolveOld(Response.json({ data: [change], next_cursor: null }));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(screen.queryByText('Key policy removed')).toBeNull();
});
