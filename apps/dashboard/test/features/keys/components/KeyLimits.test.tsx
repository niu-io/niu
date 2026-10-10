import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeyLimits from '@/features/keys/components/KeyLimits';
function setup(options: { conflict?: boolean; fail?: boolean; canWrite?: boolean } = {}) {
  let rpm: number | null = 15;let revision = '9007199254740993';let reads = 0;
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === 'PUT') {
      if (options.conflict) { options.conflict = false;rpm = 30;revision = '9007199254740994';return Response.json({ error: { message: 'Conflict' } }, { status: 409 }); }
      const body = JSON.parse(init.body as string);rpm = body.requests_per_minute;revision = '9007199254740995';return Response.json({ data: { revision } });
    }
    if (path.endsWith('request-rate-limit')) {reads++;if (options.fail && reads === 1) return Response.json({error:{message:'Storage unavailable'}},{status:503});return Response.json({ data: { requests_per_minute: rpm, revision } });}
    if (path.endsWith('concurrency-limit')) return Response.json({ data: { max_concurrent_requests: null, active_requests: 2, revision: null } });
    return Response.json({ data: { tokens_per_minute: null, revision: null, committed_tokens: null, unbounded_requests: 1, known_tokens: '0', reserved_tokens: '0', snapshot_at: new Date().toISOString() } });
  });
  vi.stubGlobal('fetch', fetcher);
  render(<KeyLimits token="test" endpoint="/keys/key" canWrite={options.canWrite ?? true} active />);
  return { user: userEvent.setup(), fetcher };
}
it('preserves exact revision strings and distinguishes zero from unlimited', async () => {
  const {user,fetcher}=setup();
  await user.click(await screen.findByRole('button',{name:'Edit requests per minute'}));
  await user.clear(screen.getByLabelText('Limit'));await user.type(screen.getByLabelText('Limit'),'0');
  await user.click(screen.getByRole('button',{name:'Save limit'}));
  await screen.findByText('0 · New requests blocked');
  expect(JSON.parse(fetcher.mock.calls.find(([,init])=>init?.method==='PUT')![1]!.body as string)).toEqual({requests_per_minute:0,expected_revision:'9007199254740993'});
  await user.click(screen.getByRole('button',{name:'Edit requests per minute'}));await user.clear(screen.getByLabelText('Limit'));
  await user.click(screen.getByRole('button',{name:'Save limit'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  const writes=fetcher.mock.calls.filter(([,init])=>init?.method==='PUT');
  expect(JSON.parse(writes[1][1]!.body as string).requests_per_minute).toBeNull();
});
it('freezes stale edits until reload and then uses the newly saved value', async () => {
  const {user,fetcher}=setup({conflict:true});await user.click(await screen.findByRole('button',{name:'Edit requests per minute'}));
  await user.clear(screen.getByLabelText('Limit'));await user.type(screen.getByLabelText('Limit'),'20');await user.click(screen.getByRole('button',{name:'Save limit'}));
  await screen.findByText('This limit changed. Reload the saved limit before trying again.');
  expect((screen.getByLabelText('Limit') as HTMLInputElement).disabled).toBe(true);expect(screen.queryByRole('button',{name:'Save limit'})).toBeNull();
  await user.click(screen.getByRole('button',{name:'Cancel'}));await user.click(screen.getByRole('button',{name:'Edit requests per minute'}));
  expect((screen.getByLabelText('Limit') as HTMLInputElement).disabled).toBe(true);
  await user.click(screen.getByRole('button',{name:'Reload limit'}));
  await waitFor(()=>expect((screen.getByLabelText('Limit') as HTMLInputElement).value).toBe('30'));
  expect(fetcher.mock.calls.filter(([,init])=>init?.method==='PUT')).toHaveLength(1);
});
it('rejects fractional and oversized limits without writing', async () => {
  const {user,fetcher}=setup();await user.click(await screen.findByRole('button',{name:'Edit requests per minute'}));
  for (const value of ['1.5','1000001','-1','1e3']) {await user.clear(screen.getByLabelText('Limit'));await user.type(screen.getByLabelText('Limit'),value);expect((screen.getByRole('button',{name:'Save limit'}) as HTMLButtonElement).disabled).toBe(true);}
  expect(fetcher.mock.calls.some(([,init])=>init?.method==='PUT')).toBe(false);
});
it('reports failed reads as unavailable and retries without assuming unlimited', async () => {
  const {user}=setup({fail:true});await screen.findByText('Storage unavailable');
  expect(screen.queryByRole('button',{name:'Edit requests per minute'})).toBeNull();
  await user.click(screen.getByRole('button',{name:'Retry requests per minute'}));await screen.findByRole('button',{name:'Edit requests per minute'});
});
it('shows unknown usage and unresolved work while keeping viewers read-only', async () => {
  setup({canWrite:false});await screen.findByText('Committed usage unknown at last refresh. 1 requests have unbounded usage.');
  expect(screen.getByText('2 unresolved requests at last refresh.')).toBeTruthy();
  expect(screen.queryByRole('button',{name:/Edit/})).toBeNull();
});

it('keeps a failed save draft available for retry', async () => {
  const {user,fetcher}=setup();await user.click(await screen.findByRole('button',{name:'Edit requests per minute'}));
  fetcher.mockImplementationOnce(async()=>Response.json({error:{message:'Write unavailable'}},{status:503}));
  await user.clear(screen.getByLabelText('Limit'));await user.type(screen.getByLabelText('Limit'),'25');await user.click(screen.getByRole('button',{name:'Save limit'}));
  await screen.findByText('Write unavailable');expect((screen.getByLabelText('Limit') as HTMLInputElement).value).toBe('25');
  expect((screen.getByRole('button',{name:'Save limit'}) as HTMLButtonElement).disabled).toBe(false);
});
