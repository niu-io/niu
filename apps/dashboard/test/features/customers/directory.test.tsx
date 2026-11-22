import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Customers } from '../../../app/features/customers/page';
import { clearSessionCache } from '../../../app/lib/query-cache';

vi.mock('@/shell/platform-currency', () => ({ usePlatformCurrency: () => ({ currency: 'USD', ready: true, error: null }) }));
afterEach(() => {
  cleanup();
  clearSessionCache();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const acme = '10000000-0000-4000-8000-000000000001';
const beta = '10000000-0000-4000-8000-000000000002';
const cursor = '90000000-0000-4000-8000-000000000001';
const usdAccount = {
  currency: 'USD',
  balance_nanos: '12000000000',
  reserved_nanos: '0',
  available_nanos: '12500000000',
  outstanding_nanos: '2500000000',
  credit_limit_nanos: '3000000000',
  warning_threshold_nanos: null,
  policy_revision: '2',
  low_balance: false,
  posted_credit_exhausted: false,
};
const credits = { name: 'Niu Credits', display_precision: 2, available: '7.50', additional_units: 0 };
const firstPage = {
  data: [
    {
      organization_id: acme,
      organization_name: 'Acme',
      created_at: '2026-11-10T08:00:00Z',
      owner: { name: 'Alex Chen', email: 'alex@acme.com' },
      workspace_count: 1,
      member_count: 2,
      custom_price_count: 2,
      accounts: [usdAccount],
      credits,
    },
  ],
  next_after: null,
};

type ApiOptions = { accounts?: unknown; accountsAfter?: unknown };
function stubApi(options: ApiOptions = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async input => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/admin/customers')) {
        if (url.includes('after=') && options.accountsAfter) return Response.json(options.accountsAfter);
        return Response.json(options.accounts ?? firstPage);
      }
      if (url.includes('/admin/registrations')) {
        return Response.json({ data: [], counts: { pending: 0, approved: 0, rejected: 0 }, next_after: null });
      }
      if (url.includes('/auth/config')) return Response.json({ password_login: true });
      throw new Error('Unexpected ' + url);
    }),
  );
  return calls;
}

function show(canSetup = true) {
  return render(
    <MemoryRouter>
      <Customers token={'customers-directory-' + Math.random()} canSetup={canSetup} onWorkspaceCreated={() => {}} />
    </MemoryRouter>,
  );
}

it('renders a clean directory with owner, balance, custom pricing, workspaces, Manage link, and overflow actions without cross-org fetches', async () => {
  const calls = stubApi();
  show();
  expect(await screen.findByText('Acme')).toBeTruthy();
  expect(screen.getByText('Alex Chen · alex@acme.com')).toBeTruthy();
  expect(screen.getByText('$12.00')).toBeTruthy();
  expect(screen.getByText('Credit $3.00')).toBeTruthy();
  expect(screen.getByText('7.50 Niu Credits')).toBeTruthy();
  expect(screen.getByText('2 custom prices')).toBeTruthy();
  expect(screen.getByText('1 workspace · 2 members')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Manage' }).getAttribute('href')).toBe(`/admin/customers/${acme}`);
  expect(screen.getAllByRole('table')).toHaveLength(1);
  expect(screen.queryByText(acme)).toBeNull();
  expect(calls.some(url => url.includes('/workspaces') || url.includes('/members'))).toBe(false);

  const trigger = screen.getByRole('button', { name: 'Actions for Acme' });
  await userEvent.setup().click(trigger);
  expect(await screen.findByRole('menuitem', { name: 'Set up' })).toBeTruthy();
  for (const name of [
    'Customer pricing',
    'Manage Branded Credits',
    'Top up balance',
    'Set credit',
    'Grant noncash balance',
    'Noncash grants',
  ]) {
    expect(screen.getByRole('menuitem', { name })).toBeTruthy();
  }
});

it('filters customers by company, owner, or email via the search popover', async () => {
  stubApi({
    accounts: {
      data: [
        firstPage.data[0],
        {
          organization_id: beta,
          organization_name: 'Beta Studio',
          created_at: '2026-11-12T08:00:00Z',
          owner: { name: 'Mei Lin', email: 'mei@beta.dev' },
          workspace_count: 0,
          member_count: 1,
          custom_price_count: 0,
          accounts: [],
          credits: null,
        },
      ],
      next_after: null,
    },
  });
  const user = userEvent.setup();
  show();
  expect(await screen.findByText('Acme')).toBeTruthy();
  expect(screen.getByText('Beta Studio')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Search customers' }));
  const input = await screen.findByPlaceholderText('Search by company, owner, or email…');
  await user.type(input, 'mei@beta.dev');

  expect(screen.queryByText('Acme')).toBeNull();
  expect(screen.getByText('Beta Studio')).toBeTruthy();
  expect(screen.getByText('Showing 1 of 2 customers matching "mei@beta.dev"')).toBeTruthy();

  await user.clear(input);
  await user.type(input, 'nonexistent');
  expect(screen.getByText('No matching customers')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(screen.getByText('Acme')).toBeTruthy();
});

it('lets platform administrators record an idempotent customer top-up from the directory', async () => {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init) => {
      const url = String(input);
      if (init?.method === 'POST' && url.includes('/billing/funding/settled')) {
        posts.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
        return Response.json({ data: { recorded: true } });
      }
      if (url.includes('/admin/customers')) return Response.json(firstPage);
      if (url.includes('/admin/registrations')) {
        return Response.json({ data: [], counts: { pending: 0, approved: 0, rejected: 0 }, next_after: null });
      }
      throw new Error('Unexpected ' + url);
    }),
  );
  const user = userEvent.setup();
  show();
  await user.click(await screen.findByRole('button', { name: 'Actions for Acme' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Top up balance' }));
  expect(await screen.findByRole('heading', { name: 'Top up customer balance' })).toBeTruthy();
  await user.type(screen.getByLabelText(/Top-up amount in/), '50');
  const refInput = screen.getByLabelText('Payment reference');
  await user.clear(refInput);
  await user.type(refInput, 'test-order-2026-01');
  await user.click(screen.getByRole('button', { name: 'Record top-up' }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0].url).toContain(`/api/v1/organizations/${acme}/billing/funding/settled`);
  expect(posts[0].body).toEqual({
    currency: 'USD',
    amount_nanos: '50000000000',
    channel: 'test_topup',
    payment_reference: 'test-order-2026-01',
  });
  expect(await screen.findByText('Customer balance topped up.')).toBeTruthy();
});

it('allows top-up, credit limit, and noncash grant actions even before a currency account exists', async () => {
  stubApi({
    accounts: {
      data: [
        {
          organization_id: beta,
          organization_name: 'Beta',
          owner: null,
          workspace_count: 0,
          member_count: 0,
          custom_price_count: 0,
          accounts: [],
          credits: null,
        },
      ],
      next_after: null,
    },
  });
  const user = userEvent.setup();
  show();
  expect(await screen.findByText('No balance yet')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Actions for Beta' }));
  for (const name of ['Top up balance', 'Set credit', 'Grant noncash balance']) {
    const item = await screen.findByRole('menuitem', { name });
    expect(item.getAttribute('aria-disabled')).not.toBe('true');
  }
});

it('keeps the financial directory usable for platform administrators without installation setup authority', async () => {
  stubApi();
  show(false);
  expect(await screen.findByText('Acme')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'New customer' })).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Actions for Acme' }));
  expect(await screen.findByRole('menuitem', { name: 'Set credit' })).toBeTruthy();
  expect(screen.queryByRole('menuitem', { name: 'Set up' })).toBeNull();
});

it('follows the unchanged next_after cursor and never duplicates a company', async () => {
  stubApi({
    accounts: { ...firstPage, next_after: cursor },
    accountsAfter: {
      data: [
        {
          organization_id: beta,
          organization_name: 'Beta',
          owner: null,
          workspace_count: 0,
          member_count: 0,
          custom_price_count: 0,
          accounts: [],
          credits: null,
        },
      ],
      next_after: null,
    },
  });
  const user = userEvent.setup();
  show();
  await user.click(await screen.findByRole('button', { name: 'More companies' }));
  expect(await screen.findByText('Beta')).toBeTruthy();
  expect(screen.getAllByText('Acme')).toHaveLength(1);
  expect(screen.getByText('No balance yet')).toBeTruthy();
});

it('shows a retryable error and recovers without losing the financial directory', async () => {
  let fail = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async input => {
      const url = String(input);
      if (url.includes('/admin/customers')) {
        if (fail) {
          fail = false;
          throw new Error('Customer directory unavailable');
        }
        return Response.json(firstPage);
      }
      if (url.includes('/admin/registrations')) {
        return Response.json({ data: [], counts: { pending: 0, approved: 0, rejected: 0 }, next_after: null });
      }
      throw new Error('Unexpected ' + url);
    }),
  );
  show();
  expect(await screen.findByText(/Customer directory unavailable/)).toBeTruthy();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.getByText('Acme')).toBeTruthy());
  expect(screen.getByText('$12.00')).toBeTruthy();
});

it('shows the customer directory empty state without an empty table', async () => {
  stubApi({ accounts: { data: [], next_after: null } });
  show();
  expect(await screen.findByText('No customers yet. Create a company to start setting up independent customer access.')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.getAllByRole('button', { name: 'New customer' })).toHaveLength(2);
});
