import { expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopupFunding from '../../../src/features/billing/TopupFunding';
const id = '12345678-1234-4234-8234-123456789abc';
const availability = { currency: 'CNY', payment_gateway: 'epay', available: true, payment_methods: ['wxpaynative', 'alipay'], unavailable_reason: null };
const order = { id, currency: 'CNY', amount_nanos: '1000000000', payment_method: 'wxpaynative', status: 'pending', checkout_url: 'https://checkout.example/pay?order=' + id, created_at: '2026-10-06T00:00:00Z' };
it.each(['not-money', '-1', '9223372036854775808'])('recovers malformed saved amounts without rendering a broken page: %s', async amount => {
  let invalid = true;
  vi.stubGlobal('fetch', vi.fn(async input => String(input).endsWith('/payment-methods')
    ? Response.json({ data: availability })
    : Response.json({ data: [{ ...order, amount_nanos: invalid ? amount : order.amount_nanos }], next_cursor: null })));
  render(<TopupFunding token="test" organization="company" canCreate onPaid={vi.fn()}/>);
  await screen.findByText('Could not load payment options and saved top-ups.');
  expect(screen.queryByText('CNY 1.00')).toBeNull();
  invalid = false;
  await userEvent.click(screen.getByRole('button', { name: 'Retry top-ups' }));
  await screen.findByText('CNY 1.00');
});
it('does not replace a saved checkout or refresh funds from another order status', async () => {
  const onPaid = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async input => {
    const path = String(input);
    if (path.endsWith('/payment-methods')) return Response.json({ data: availability });
    if (path.endsWith('/topups')) return Response.json({ data: [order], next_cursor: null });
    return Response.json({ data: { ...order, id: 'another-order', status: 'paid', checkout_url: null } });
  }));
  render(<TopupFunding token="test" organization="company" canCreate onPaid={onPaid}/>);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Continue payment' }));
  await user.click(screen.getByRole('button', { name: 'Check payment status' }));
  await screen.findByText('Could not check payment status. Try again.');
  expect(screen.getByRole('link', { name: 'Continue to payment' })).toBeTruthy();
  expect(onPaid).not.toHaveBeenCalled();
});
function setup({ available = availability, saved = [] as typeof order[], failure = false, canCreate = true, mismatch = {} as Partial<typeof order> } = {}) {
  const posts: Record<string, unknown>[] = [];
  const onPaid = vi.fn();
  let orders = saved;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith('/payment-methods')) return Response.json({ data: available });
    if (path.endsWith('/topups') && init?.method === 'POST') {
      const submitted = JSON.parse(String(init.body));
      posts.push(submitted);
      const created = { ...order, currency: submitted.currency, amount_nanos: submitted.amount_nanos, payment_method: submitted.payment_method, ...mismatch };
      orders = [created];
      if (failure) throw new Error('uncertain network response');
      return Response.json({ data: created });
    }
    if (path.endsWith('/topups')) return Response.json({ data: orders, next_cursor: null });
    if (path.endsWith(`/topups/${id}`)) return Response.json({ data: orders.find(saved => saved.id === id) });
    throw new Error('Unexpected request');
  }));
  render(<TopupFunding token="test" organization="company" canCreate={canCreate} onPaid={onPaid} />);
  return { posts, onPaid, settle: () => { orders = orders.map(saved => ({ ...saved, status: 'paid', checkout_url: null })); } };
}
it('creates one exact intent through the dialog and offers a safe saved checkout', async () => {
  const { posts } = setup(); const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Add funds' }));
  await user.type(screen.getByLabelText('Amount (CNY)'), '9007199.26');
  await user.click(screen.getByRole('button', { name: 'Payment method' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Alipay' }));
  await user.click(screen.getByRole('button', { name: 'Continue', exact: true }));
  expect(await screen.findByRole('link', { name: 'Continue to payment' })).toBeTruthy();
  expect(posts).toHaveLength(1); expect(posts[0].amount_nanos).toBe('9007199260000000'); expect(posts[0].payment_method).toBe('alipay'); expect(posts[0].currency).toBe('CNY'); expect(posts[0].payment_gateway).toBe('epay');
  expect(posts[0].idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
  expect(document.body.textContent).not.toContain(id);
  expect(screen.getByRole('link', { name: 'Continue to payment' }).getAttribute('rel')).toBe('noopener noreferrer');
});
it('recovers saved checkout without creating an order and rejects terminal links', async () => {
  const { posts } = setup({ saved: [order, { ...order, id: 'terminal', status: 'closed' }] }); const user = userEvent.setup();
  await screen.findByRole('button', { name: 'Continue payment' });
  expect(screen.getAllByRole('button', { name: 'Continue payment' })).toHaveLength(1);
  await user.click(await screen.findByRole('button', { name: 'Continue payment' }));
  expect(await screen.findByRole('link', { name: 'Continue to payment' })).toBeTruthy();
  expect(posts).toHaveLength(0);
});
it('binds a USD top-up to its discovered Stripe integration', async () => {
  const { posts } = setup({ available: { ...availability, currency: 'USD', payment_gateway: 'stripe', payment_methods: ['alipay'] } });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Add funds' }));
  await user.type(screen.getByLabelText('Amount (USD)'), '12.34');
  await user.click(screen.getByRole('button', { name: 'Continue', exact: true }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toMatchObject({ currency: 'USD', payment_gateway: 'stripe', payment_method: 'alipay', amount_nanos: '12340000000' });
});
it('switches existing balances and binds initiation to the newly discovered currency', async () => {
  const posts: Record<string, unknown>[] = [];
  const currencies: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/payment-methods')) {
      const currency = url.searchParams.get('currency')!;
      currencies.push(currency);
      return Response.json({ data: { ...availability, currency, payment_gateway: currency === 'USD' ? 'stripe' : 'epay' } });
    }
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)); posts.push(body);
      return Response.json({ data: { ...order, ...body } });
    }
    return Response.json({ data: [], next_cursor: null });
  }));
  render(<TopupFunding token="test" organization="company" canCreate currencies={['CNY', 'USD']} onPaid={() => {}} />);
  const user = userEvent.setup();
  await screen.findByRole('button', { name: 'Add funds' });
  await user.click(screen.getByRole('button', { name: 'Funding currency' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'USD' }));
  await user.click(await screen.findByRole('button', { name: 'Add funds' }));
  await user.type(screen.getByLabelText('Amount (USD)'), '12.34');
  await user.click(screen.getByRole('button', { name: 'Continue', exact: true }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(currencies[0]).toBe('CNY');
  expect(currencies.slice(1).length).toBeGreaterThan(0);
  expect(currencies.slice(1).every(currency => currency === 'USD')).toBe(true);
  expect(posts[0]).toMatchObject({ currency: 'USD', payment_gateway: 'stripe', amount_nanos: '12340000000' });
});
it.each([null, 'unknown'])('rejects available methods without a valid gateway: %s', async gateway => {
  setup({ available: { ...availability, payment_gateway: gateway as string } });
  await screen.findByText('Could not load payment options and saved top-ups.');
  expect(screen.queryByRole('button', { name: 'Add funds' })).toBeNull();
});
it('does not automatically repost an uncertain creation and recovers history', async () => {
  const { posts } = setup({ failure: true }); const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Add funds' }));
  await user.type(screen.getByLabelText('Amount (CNY)'), '1');
  await user.click(screen.getByRole('button', { name: 'Continue', exact: true }));
  await screen.findByText(/Checkout was not confirmed/);
  expect(screen.getByLabelText('Amount (CNY)').hasAttribute('disabled')).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Check saved top-ups' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue payment' })).toBeTruthy());
  expect(posts).toHaveLength(1);
});
it('shows unavailable configuration without invented payment controls', async () => {
  setup({ available: { ...availability, available: false, payment_methods: [], unavailable_reason: 'integration_unavailable' } });
  await screen.findByText(/Online top-ups are currently unavailable/);
  expect(screen.queryByRole('button', { name: 'Add funds' })).toBeNull();
});
it('keeps read-only access from creating top-ups', async () => {
  setup({ canCreate: false, saved: [{ ...order, status: 'paid', checkout_url: null }] });
  await screen.findByText('Paid');
  expect(screen.queryByRole('button', { name: 'Add funds' })).toBeNull();
});
it('checks the selected saved order directly and removes a paid checkout link', async () => {
  const { settle, posts, onPaid } = setup({ saved: [order] }); const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Continue payment' }));
  await screen.findByRole('link', { name: 'Continue to payment' });
  settle();
  await user.click(screen.getByRole('button', { name: 'Check payment status' }));
  await within(screen.getByRole('dialog', { name: 'Top-up', exact: true })).findByText('Paid');
  expect(screen.queryByRole('link', { name: 'Continue to payment' })).toBeNull();
  expect(posts).toHaveLength(0); expect(onPaid).toHaveBeenCalled();
});

it.each(['paid', 'closed', 'reconciliation_required', 'pending'])('opens saved %s orders without a checkout link', async status => {
  const {posts} = setup({canCreate:false,saved:[{...order,status,checkout_url:null}]});
  const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'View details'}));
  const detail=screen.getByRole('dialog',{name:'Top-up',exact:true});
  expect(within(detail).getByText({paid:'Paid',closed:'Closed',reconciliation_required:'Checking payment',pending:'Awaiting payment'}[status]!)).toBeTruthy();
  expect(within(detail).getByRole('button',{name:'Check payment status'})).toBeTruthy();
  expect(within(detail).queryByRole('link',{name:'Continue to payment'})).toBeNull();
  expect(posts).toHaveLength(0);
  expect(document.body.textContent).not.toContain(id);
});

it('retries the failed older page without discarding loaded top-ups', async () => {
  let olderReads=0;
  const reads=vi.fn(async (input:RequestInfo | URL) => {
    const path=String(input);
    if (path.endsWith('/payment-methods')) return Response.json({data:availability});
    if (path.endsWith('/topups')) return Response.json({data:[order],next_cursor:'page-two'});
    if (path.endsWith('/topups?before=page-two')) {
      olderReads++;
      return olderReads===1 ? new Response('{}',{status:503}) : Response.json({data:[{...order,id:'older',status:'paid',checkout_url:null}],next_cursor:null});
    }
    throw new Error('Unexpected request');
  });
  vi.stubGlobal('fetch',reads);
  render(<TopupFunding token="test" organization="company" canCreate={false} onPaid={vi.fn()}/>);
  const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Older top-ups'}));
  await user.click(await screen.findByRole('button',{name:'Retry top-ups'}));
  await screen.findByText('Paid');
  expect(screen.getByText('Awaiting payment')).toBeTruthy();
  expect(screen.queryByText('Could not load older top-ups.')).toBeNull();
  expect(olderReads).toBe(2);
  expect(reads.mock.calls.filter(call=>String(call[0]).endsWith('/topups'))).toHaveLength(1);
});

it('prevents replacing the checkout while payment status is pending', async () => {
 let finish!: (response:Response) => void;
 let savedOrder=order;
 vi.stubGlobal('fetch',vi.fn<typeof fetch>(async input => {
  const path=String(input);
  if (path.endsWith('/payment-methods')) return Response.json({data:availability});
  if (path.endsWith('/topups')) return Response.json({data:[savedOrder],next_cursor:null});
  if (path.endsWith(`/topups/${id}`)) return new Promise<Response>(resolve => {finish=resolve;});
  throw new Error('Unexpected request');
 }));
 render(<TopupFunding token="test" organization="company" canCreate onPaid={vi.fn()}/>);
 const user=userEvent.setup();
 await user.click(await screen.findByRole('button',{name:'Continue payment'}));
 await user.click(screen.getByRole('button',{name:'Check payment status'}));
 expect((screen.getByRole('button',{name:'Add funds',hidden:true}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Continue payment',hidden:true}) as HTMLButtonElement).disabled).toBe(true);
 await act(async()=>{savedOrder={...order,status:'paid',checkout_url:null};finish(Response.json({data:savedOrder}));});
 await within(screen.getByRole('dialog',{name:'Top-up',exact:true})).findByText('Paid');
 expect(screen.queryByRole('link',{name:'Continue to payment'})).toBeNull();
 expect((screen.getByRole('button',{name:'Add funds',hidden:true}) as HTMLButtonElement).disabled).toBe(false);
});

it('keeps empty history and refresh available when online funding is unavailable', async () => {
 setup({ available: { ...availability, available: false, payment_methods: [], unavailable_reason: 'integration_unavailable' } });
 await screen.findByText('No top-ups yet');
 expect(screen.getByRole('heading', { name: 'Top-up history' })).toBeTruthy();
 expect((screen.getByRole('button', { name: 'Refresh top-ups' }) as HTMLButtonElement).disabled).toBe(false);
 const initialCalls = vi.mocked(fetch).mock.calls.length;
 await userEvent.click(screen.getByRole('button', { name: 'Refresh top-ups' }));
 await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(initialCalls));
 await screen.findByText('No top-ups yet');
 expect(screen.queryByRole('button', { name: 'Add funds' })).toBeNull();
});

it.each([{ currency: 'USD' }, { amount_nanos: '2000000000' }, { payment_method: 'alipay' }])('does not offer a checkout that differs from the submitted intent: %j', async mismatch => {
  const { posts } = setup({ mismatch });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Add funds' }));
  await user.type(screen.getByLabelText('Amount (CNY)'), '1');
  await user.click(screen.getByRole('button', { name: 'Continue', exact: true }));
  await screen.findByText(/Checkout was not confirmed/);
  expect(screen.queryByRole('link', { name: 'Continue to payment' })).toBeNull();
  expect(screen.getByLabelText('Amount (CNY)').hasAttribute('disabled')).toBe(true);
  expect(posts).toHaveLength(1);
});

it('retains saved checkout recovery when payment option discovery fails', async () => {
  let unavailable = true;
  const posts = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    if (init?.method === 'POST') posts();
    if (String(input).endsWith('/payment-methods')) return unavailable ? new Response('{}', { status: 503 }) : Response.json({ data: availability });
    return Response.json({ data: [order], next_cursor: null });
  }));
  render(<TopupFunding token="test" organization="company" canCreate onPaid={vi.fn()}/>);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Continue payment' }));
  expect(screen.getByRole('link', { name: 'Continue to payment' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add funds', hidden: true })).toBeNull();
  await user.keyboard('{Escape}');
  unavailable = false;
  await user.click(screen.getByRole('button', { name: 'Retry top-ups' }));
  await screen.findByRole('button', { name: 'Add funds' });
  expect(screen.queryByText('Could not load payment options and saved top-ups.')).toBeNull();
  expect(posts).not.toHaveBeenCalled();
});
