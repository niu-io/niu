import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanyBrandedUnitsDialog } from '../../../app/features/customers/unit-accounts';

const organization = '10000000-0000-4000-8000-000000000001';
const organizationName = 'Acme';
const attemptId = '20000000-0000-4000-8000-000000000001';
const orderId = '30000000-0000-4000-8000-000000000001';

const snapshot = {
  billing_mode: 'credits' as const,
  atoms_per_unit: '1000000000',
  definition: { revision: '19', name: 'Niu Credits', display_precision: 2, atoms_per_unit: '1000000000' },
  balances: [
    {
      definition_revision: '19', name: 'Niu Credits', display_precision: 2, provenance: 'promotional' as const,
      issued_atoms: '50000000000', held_atoms: '1000000000', charged_atoms: '2000000000',
      restored_atoms: '0', expired_atoms: '0', available_atoms: '49000000000',
    },
    {
      definition_revision: '19', name: 'Niu Credits', display_precision: 2, provenance: 'purchased' as const,
      issued_atoms: '20000000000', held_atoms: '0', charged_atoms: '0',
      restored_atoms: '0', expired_atoms: '0', available_atoms: '20000000000',
    },
  ],
  purchases: [
    {
      order_id: orderId, created_at: '2026-11-01T10:00:00Z', definition_revision: '19', name: 'Niu Credits',
      display_precision: 2, provenance: 'purchased' as const, payment_currency: 'USD', payment_nanos: '10000000000',
      issued_atoms: '20000000000', reversed_atoms: '0', available_atoms: '20000000000',
    },
  ],
  recent_charges: [
    {
      attempt_id: attemptId, reference: 'req_abc123', charged_at: '2026-11-02T10:00:00Z', model_alias: 'deepseek-chat',
      definition_revision: '19', name: 'Niu Credits', display_precision: 2, charged_atoms: '1000000000',
      restored_atoms: '0', refundable_atoms: '1000000000',
    },
  ],
};

const reversalPreview = {
  order_id: orderId, definition_revision: '19', name: 'Niu Credits', display_precision: 2,
  provenance: 'purchased' as const, payment_currency: 'USD', payment_nanos: '10000000000',
  issued_atoms: '20000000000', available_atoms: '20000000000', requested_atoms: '20000000000',
  reversible_atoms: '20000000000', refund_payment_nanos: '10000000000', refund_backing_nanos: '0',
  residual_credit_atoms: '0', residual_payment_nanos: '0', reversals: [],
};

type Call = { method: string; path: string; body?: Record<string, unknown> };

function mockFetch(handler: (call: Call) => Response) {
  const log: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      path: String(input),
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined,
    };
    log.push(call);
    return handler(call);
  }));
  return log;
}

const unitsPath = `/api/v1/organizations/${organization}/billing/units`;

function renderDialog(onChanged = vi.fn()) {
  render(
    <CompanyBrandedUnitsDialog
      token="test"
      organizationId={organization}
      organizationName={organizationName}
      onClose={() => {}}
      onChanged={onChanged}
    />,
  );
  return onChanged;
}

it('shows unit balances in human units without ledger internals', async () => {
  mockFetch(call => {
    if (call.method === 'GET' && call.path === unitsPath) return Response.json({ data: snapshot });
    throw new Error('Unexpected ' + call.method + ' ' + call.path);
  });
  renderDialog();

  await screen.findByText('Niu Credits balance');
  expect(screen.getAllByText('69.00 Niu Credits').length).toBeGreaterThan(0);
  expect(screen.getByText('1.00 Niu Credits')).toBeTruthy();
  expect(screen.getByText('2.00 Niu Credits')).toBeTruthy();

  const text = document.body.textContent ?? '';
  expect(text).not.toMatch(/atoms/i);
  expect(text).not.toMatch(/v19/);
  expect(text).not.toContain('Simulated');
  expect(text).not.toContain('Provenance');
  expect(text).not.toContain('Residual');
  expect(text).not.toContain('atom prefix');
  expect(text).not.toContain(organization);
  expect(text).not.toContain(attemptId);
  expect(text).not.toContain(orderId);

  expect(screen.getByRole('button', { name: /Grant credits/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Refund a charge/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Refund a purchase/ })).toBeTruthy();
});

it('grants promotional credits without a provenance choice', async () => {
  const log = mockFetch(call => {
    if (call.method === 'GET' && call.path === unitsPath) return Response.json({ data: snapshot });
    if (call.method === 'POST' && call.path === unitsPath + '/grants') return Response.json({ data: { id: 'grant' } });
    throw new Error('Unexpected ' + call.method + ' ' + call.path);
  });
  const user = userEvent.setup();
  const onChanged = renderDialog();
  await screen.findByText('Niu Credits balance');

  await user.click(screen.getByRole('button', { name: /Grant credits/ }));
  expect(screen.queryByText('Provenance')).toBeNull();
  expect(screen.queryByText('Simulated')).toBeNull();

  const amount = screen.getByLabelText('Amount (Niu Credits)');
  await user.clear(amount);
  await user.type(amount, '12.50');
  await user.type(screen.getByLabelText('Reason'), 'Launch credit');

  await user.click(screen.getByRole('button', { name: 'Grant credits' }));
  await screen.findByText('Granted 12.50 Niu Credits to Acme.');

  const post = log.find(call => call.method === 'POST');
  expect(post?.path).toBe(unitsPath + '/grants');
  expect(post?.body).toMatchObject({
    definition_revision: '19',
    credit_atoms: '12500000000',
    provenance: 'promotional',
    reason: 'Launch credit',
    expires_at_ms: null,
  });
  expect(typeof post?.body?.idempotency_key).toBe('string');
  expect(post?.body?.provenance).not.toBe('simulated');
  expect(onChanged).toHaveBeenCalledWith('Granted 12.50 Niu Credits to Acme.');
});

it('refunds a settled charge in exact units and rejects an over-refund locally', async () => {
  const log = mockFetch(call => {
    if (call.method === 'GET' && call.path === unitsPath) return Response.json({ data: snapshot });
    if (call.method === 'POST' && call.path === `${unitsPath}/charges/${attemptId}/refunds`) return Response.json({ data: { id: 'refund' } });
    throw new Error('Unexpected ' + call.method + ' ' + call.path);
  });
  const user = userEvent.setup();
  renderDialog();
  await screen.findByText('Niu Credits balance');

  await user.click(screen.getByRole('button', { name: /Refund a charge/ }));
  const amount = screen.getByLabelText('Refund amount (Niu Credits)');
  expect((amount as HTMLInputElement).value).toBe('1.00');
  expect(screen.getByText('Refundable: 1.00 Niu Credits')).toBeTruthy();

  await user.clear(amount);
  await user.type(amount, '2');
  await user.type(screen.getByLabelText('Reason'), 'Service issue');
  await user.click(screen.getByRole('button', { name: 'Refund charge' }));
  expect(await screen.findByText('Enter no more than 1.00 Niu Credits.')).toBeTruthy();
  expect(log.some(call => call.method === 'POST')).toBe(false);

  await user.clear(amount);
  await user.type(amount, '0.50');
  await user.click(screen.getByRole('button', { name: 'Refund charge' }));
  await screen.findByText('Restored 0.50 Niu Credits to Acme.');

  const post = log.find(call => call.method === 'POST');
  expect(post?.body).toMatchObject({ credit_atoms: '500000000', reason: 'Service issue' });
});

it('shows the human refund preview and submits the reversible units', async () => {
  const log = mockFetch(call => {
    if (call.method === 'GET' && call.path === unitsPath) return Response.json({ data: snapshot });
    if (call.method === 'GET' && call.path.endsWith('/reversals')) return Response.json({ data: reversalPreview });
    if (call.method === 'POST' && call.path.endsWith('/reversals')) return Response.json({ data: { id: 'reversal' } });
    throw new Error('Unexpected ' + call.method + ' ' + call.path);
  });
  const user = userEvent.setup();
  renderDialog();
  await screen.findByText('Niu Credits balance');

  await user.click(screen.getByRole('button', { name: /Refund a purchase/ }));
  await screen.findByText('Refundable credits');
  expect(screen.getByText('20.00 Niu Credits')).toBeTruthy();
  expect(screen.getByText('$10.00')).toBeTruthy();
  const text = document.body.textContent ?? '';
  expect(text).not.toContain('Residual');
  expect(text).not.toContain('unrepresentable');
  expect(text).not.toMatch(/atoms/i);

  await user.type(screen.getByLabelText('Reason'), 'Customer refund');
  await user.click(screen.getByRole('button', { name: 'Refund purchase' }));
  await screen.findByText('Refunded 20.00 Niu Credits ($10.00) to Acme.');

  const post = log.find(call => call.method === 'POST');
  expect(post?.path).toBe(`${unitsPath}/purchases/${orderId}/reversals`);
  expect(post?.body).toMatchObject({ credit_atoms: '20000000000', reason: 'Customer refund' });
});

it('recovers from a failed balance load with an explicit retry', async () => {
  let attempts = 0;
  mockFetch(call => {
    if (call.method === 'GET' && call.path === unitsPath) {
      attempts++;
      if (attempts === 1) return Response.json({ error: { message: 'ledger offline' } }, { status: 503 });
      return Response.json({ data: snapshot });
    }
    throw new Error('Unexpected ' + call.method + ' ' + call.path);
  });
  const user = userEvent.setup();
  renderDialog();

  expect(await screen.findByText('ledger offline')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Reload credits' }));
  await screen.findByText('Niu Credits balance');
  expect(attempts).toBe(2);
});

it('reports a stale action and reloads current credits', async () => {
  let posts = 0;
  mockFetch(call => {
    if (call.method === 'GET' && call.path === unitsPath) return Response.json({ data: snapshot });
    if (call.method === 'POST' && call.path === unitsPath + '/grants') {
      posts++;
      return Response.json({ error: { message: 'conflict' } }, { status: 409 });
    }
    throw new Error('Unexpected ' + call.method + ' ' + call.path);
  });
  const user = userEvent.setup();
  renderDialog();
  await screen.findByText('Niu Credits balance');

  await user.click(screen.getByRole('button', { name: /Grant credits/ }));
  await user.type(screen.getByLabelText('Reason'), 'Launch credit');
  await user.click(screen.getByRole('button', { name: 'Grant credits' }));
  expect(await screen.findByText('This changed since the dialog opened. Reload the current credits and try again.')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Reload credits' }));
  expect(posts).toBe(1);
  expect(screen.queryByText('This changed since the dialog opened. Reload the current credits and try again.')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Back to credits overview' }));
  expect(await screen.findByText('Niu Credits balance')).toBeTruthy();
});

it('renders the focused Credits flow in Simplified Chinese', async () => {
  localStorage.setItem('niu-dashboard-locale', 'zh-CN');
  mockFetch(call => {
    if (call.method === 'GET' && call.path === unitsPath) return Response.json({ data: snapshot });
    throw new Error('Unexpected ' + call.method + ' ' + call.path);
  });
  renderDialog();

  expect(await screen.findByText('Niu Credits 余额')).toBeTruthy();
  expect(screen.getByText('发放额度')).toBeTruthy();
  expect(screen.getByText('退还扣费')).toBeTruthy();
  expect(screen.getByText('退款购买')).toBeTruthy();
  expect(screen.getByText('额度操作')).toBeTruthy();
});
