import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GrantEditor, GrantHistory } from '../../../app/features/customers/grants';
import { GiftCorrectionEditor } from '../../../app/features/customers/gift-corrections';
import type { Editor } from '../../../app/features/customers/page';
import type { IssuedCustomerBalanceGrant, PreparedCustomerBalanceGrant } from '@niu-io/sdk/admin';

vi.mock('../../../app/shell/platform-currency', () => ({ usePlatformCurrency: () => ({ currency: 'USD', ready: true, error: null, reload: () => {} }) }));

const organization = '10000000-0000-4000-8000-000000000001';
const grantId = '30000000-0000-4000-8000-000000000001';
const issuedAt = '2026-11-05T00:00:00Z';
const account = {
  currency: 'USD', balance_nanos: '0', reserved_nanos: '0', available_nanos: '0', outstanding_nanos: '0',
  credit_limit_nanos: '0', warning_threshold_nanos: null, policy_revision: '1', low_balance: false, posted_credit_exhausted: false,
};
const editor: Editor = { kind: 'grant', company: { organization_id: organization, organization_name: 'Acme', accounts: [account] }, account };
const prepared: PreparedCustomerBalanceGrant = {
  id: '40000000-0000-4000-8000-000000000001', idempotency_key: '50000000-0000-4000-8000-000000000001', currency: 'USD',
  amount_nanos: '12500000000', reason: 'Launch credit', application_policy: 'future_only', created_at: issuedAt, status: 'prepared', result: null,
};
const issuedResult = { id: grantId, application_policy: 'future_only' as const, applied_to_credit_nanos: '0', retained_for_future_consumption_nanos: '12500000000' };
const endpoint = `/api/v1/organizations/${organization}/billing/accounts/USD/grants`;

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
function preparedFor(call: Call, overrides: Partial<PreparedCustomerBalanceGrant> = {}) {
  return {
    ...prepared,
    idempotency_key: String(call.body?.idempotency_key ?? prepared.idempotency_key),
    amount_nanos: String(call.body?.amount_nanos ?? prepared.amount_nanos),
    reason: String(call.body?.reason ?? prepared.reason),
    application_policy: (call.body?.application_policy ?? prepared.application_policy) as PreparedCustomerBalanceGrant['application_policy'],
    ...overrides,
  };
}
async function fillAndIssue() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Gift amount in USD'), '12.50');
  await user.type(screen.getByLabelText('Reason'), 'Launch credit');
  await user.click(screen.getByRole('button', { name: 'Issue grant' }));
  return user;
}

it('prepares and issues from one action with the same idempotency key', async () => {
  const log = mockFetch(call => {
    if (call.method === 'POST' && call.path === endpoint + '/prepare') return Response.json({ data: preparedFor(call) });
    if (call.method === 'POST' && call.path === endpoint) return Response.json({ data: issuedResult });
    throw new Error('Unexpected ' + call.method + ' ' + call.path);
  });
  render(<GrantEditor token="test" editor={editor} onClose={() => {}} onIssued={() => {}} />);
  expect(screen.getByRole('button', { name: 'Issue grant' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Check saved status' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Prepare grant' })).toBeNull();
  await fillAndIssue();
  await screen.findByText('Noncash grant issued.');
  const posts = log.filter(call => call.method === 'POST');
  expect(posts.map(call => call.path)).toEqual([endpoint + '/prepare', endpoint]);
  expect(posts[0].body?.idempotency_key).toBe(posts[1].body?.idempotency_key);
  expect(posts[0].body).toMatchObject({ amount_nanos: '12500000000', reason: 'Launch credit', application_policy: 'future_only' });
  expect(posts[1].body).toMatchObject({ amount_nanos: '12500000000', reason: 'Launch credit', application_policy: 'future_only' });
});

it('recovers a committed issuance automatically when the issue response is lost', async () => {
  let issued = 0;
  const onIssued = vi.fn();
  const log = mockFetch(call => {
    if (call.method === 'POST' && call.path === endpoint + '/prepare') return Response.json({ data: preparedFor(call) });
    if (call.method === 'POST' && call.path === endpoint) { issued++; throw new TypeError('network response lost'); }
    if (call.method === 'GET' && call.path.startsWith(endpoint + '/prepared/')) {
      const key = decodeURIComponent(call.path.slice((endpoint + '/prepared/').length));
      return Response.json({ data: { ...prepared, idempotency_key: key, status: 'issued', result: issuedResult } });
    }
    throw new Error('Unexpected ' + call.method + ' ' + call.path);
  });
  render(<GrantEditor token="test" editor={editor} onClose={() => {}} onIssued={onIssued} />);
  await fillAndIssue();
  await screen.findByText('Noncash grant issued.');
  expect(issued).toBe(1);
  expect(log.filter(call => call.method === 'GET')).toHaveLength(1);
  expect(onIssued).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Check saved status' })).toBeNull();
});

it('retries a saved-but-unissued grant with the original key without issuing twice', async () => {
  let attempts = 0;
  const keys: string[] = [];
  const log = mockFetch(call => {
    if (call.method === 'POST' && call.path === endpoint + '/prepare') {
      keys.push(String(call.body?.idempotency_key));
      return Response.json({ data: preparedFor(call) });
    }
    if (call.method === 'POST' && call.path === endpoint) {
      attempts++;
      if (attempts === 1) throw new TypeError('network response lost');
      return Response.json({ data: issuedResult });
    }
    if (call.method === 'GET' && call.path.startsWith(endpoint + '/prepared/')) {
      const key = decodeURIComponent(call.path.slice((endpoint + '/prepared/').length));
      return Response.json({ data: { ...prepared, idempotency_key: key, status: 'prepared', result: null } });
    }
    throw new Error('Unexpected ' + call.method + ' ' + call.path);
  });
  render(<GrantEditor token="test" editor={editor} onClose={() => {}} onIssued={() => {}} />);
  const user = await fillAndIssue();
  await screen.findByText(/The saved grant is still awaiting issuance/);
  expect(attempts).toBe(1);
  await user.click(screen.getByRole('button', { name: 'Issue grant' }));
  await screen.findByText('Noncash grant issued.');
  expect(attempts).toBe(2);
  expect(new Set(keys).size).toBe(1);
  expect(log.filter(call => call.method === 'POST' && call.path === endpoint)).toHaveLength(2);
});

it('shows only unissued saved grants for recovery and never a saved-intents tab', async () => {
  const onOpen = vi.fn();
  const issuedRow: IssuedCustomerBalanceGrant = { id: grantId, amount_nanos: '12500000000', reason: 'Launch credit', currency: 'USD', created_at: issuedAt, correction: null };
  mockFetch(call => {
    if (call.method === 'GET' && call.path.startsWith(endpoint + '/prepared?limit=50')) {
      return Response.json({ data: [prepared, { ...prepared, id: '60000000-0000-4000-8000-000000000001', status: 'issued', result: issuedResult }], next_before: null });
    }
    if (call.method === 'GET' && call.path.startsWith(endpoint + '/issued?limit=25')) return Response.json({ data: [issuedRow], next_before: null });
    throw new Error('Unexpected ' + call.method + ' ' + call.path);
  });
  render(<GrantHistory token="test" editor={{ ...editor, kind: 'history' }} onClose={() => {}} onOpen={onOpen} onCorrect={() => {}} />);
  await screen.findByText('Awaiting issuance');
  expect(screen.queryByRole('tab')).toBeNull();
  expect(screen.queryByText('Saved intents')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Check saved status' })).toBeNull();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Resume grant' }));
  expect(onOpen).toHaveBeenCalledWith(prepared);
});

it('removes the correction status-check button and reconciles an uncertain correction automatically', async () => {
  const gift: IssuedCustomerBalanceGrant = { id: grantId, amount_nanos: '12500000000', reason: 'Launch credit', currency: 'USD', created_at: issuedAt, correction: null };
  const correction = { id: '70000000-0000-4000-8000-000000000001', amount_nanos: '12500000000', reason: 'Duplicate award', created_at: issuedAt, actor_kind: 'installation' as const, actor_label: 'Installation administrator' };
  let corrected = false;
  let submittedKey = '';
  const onCorrected = vi.fn();
  mockFetch(call => {
    if (call.method === 'GET' && call.path === endpoint + '/' + grantId) return Response.json({ data: { ...gift, correction: corrected ? correction : null } });
    if (call.method === 'POST' && call.path === endpoint + '/' + grantId + '/correction') {
      submittedKey = String(call.body?.idempotency_key);
      corrected = true;
      throw new TypeError('network response lost');
    }
    throw new Error('Unexpected ' + call.method + ' ' + call.path);
  });
  render(<GiftCorrectionEditor token="test" editor={{ ...editor, kind: 'correction', gift }} onClose={() => {}} onCorrected={onCorrected} />);
  const reason = await screen.findByLabelText('Correction reason');
  await waitFor(() => expect((reason as HTMLInputElement).disabled).toBe(false));
  expect(screen.queryByRole('button', { name: 'Check saved status' })).toBeNull();
  const user = userEvent.setup();
  await user.type(reason, 'Duplicate award');
  await user.click(screen.getByRole('button', { name: 'Remove unused gift' }));
  await screen.findByText('Correction recorded. The full unused gift was removed.');
  expect(submittedKey).not.toBe('');
  expect(onCorrected).toHaveBeenCalled();
});
