import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubscriptionsView from '../../../../src/features/subscriptions/components/SubscriptionsView';

const base = '/admin/v1/organizations/org-1/projects/project-1';

function makeAccount(id = 'account-1') {
  return { id, provider: 'Aster', plan: 'Team plan', authentication_mode: 'oauth_refresh', billing_mode: 'subscription', credential_revision: 1, health: 'unverified', concurrency_limit: 2, refreshing: false };
}

function makeWindow(overrides: Record<string, unknown> = {}) {
  return {
    window_key: 'weekly', unit: 'tokens', remaining: '80', maximum: '100',
    observed_at_ms: 1790400000000, valid_until_ms: 1790403600000, resets_at_ms: 1791000000000,
    source: 'provider-export', previous_remaining: '100', previous_observed_at_ms: 1790300000000, fresh: true,
    ...overrides,
  };
}

function mockGateway() {
  let accounts = [makeAccount()];
  const observations = new Map<string, ReturnType<typeof makeWindow>[]>([['account-1', [makeWindow()]]]);
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input);
    calls.push({ path, init });
    const ok = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
    if (path === '/admin/v1/organizations') return ok({ data: [{ id: 'org-1', name: 'Niu workspace' }] });
    if (path === '/admin/v1/organizations/org-1/projects') return ok({ data: [{ id: 'project-1', name: 'Agent project' }] });
    if (path === base + '/accounts' && (init?.method ?? 'GET') === 'GET') return ok({ data: accounts });
    if (path === base + '/accounts' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { provider: string; plan: string };
      const account = { ...makeAccount('account-2'), provider: body.provider, plan: body.plan };
      accounts = [...accounts, account]; observations.set(account.id, []);
      return ok({ id: account.id }, 201);
    }
    const quotaPath = path.match(new RegExp(`^${base}/accounts/([^/]+)/quota$`));
    if (quotaPath && (init?.method ?? 'GET') === 'GET') return ok({ data: observations.get(quotaPath[1]) ?? [] });
    const quotaDeletePath = path.match(new RegExp(`^${base}/accounts/([^/]+)/quota\\?window_key=([^&]+)$`));
    if (quotaDeletePath && init?.method === 'DELETE') {
      const windowKey = decodeURIComponent(quotaDeletePath[2]);
      const current = observations.get(quotaDeletePath[1]) ?? [];
      const remaining = current.filter(window => window.window_key !== windowKey);
      observations.set(quotaDeletePath[1], remaining);
      return ok({ window_key: windowKey, deleted_count: current.length - remaining.length });
    }
    const executionPath = path.match(new RegExp(`^${base}/accounts/([^/]+)/executions$`));
    if (executionPath && (init?.method ?? 'GET') === 'GET') return ok({ data: executionPath[1] === 'account-1' ? [{ id: 'execution-linked', task_id: 'linked-task', source: 'agent-harness', record_id: 'record-linked', imported_at: '2026-09-26T08:00:00Z' }] : [] });
    if (quotaPath && init?.method === 'POST') {
      const raw = String(init.body);
      const imported = JSON.parse(raw) as Record<string, unknown>;
      const remaining = raw.match(/"remaining"\s*:\s*(\d+)/)?.[1] ?? String(imported.remaining);
      const maximum = raw.match(/"maximum"\s*:\s*(\d+)/)?.[1] ?? String(imported.maximum);
      observations.set(quotaPath[1], [makeWindow({ remaining, maximum, previous_remaining: '100', observed_at_ms: Number(imported.observed_at_ms) })]);
      return ok({ id: 'quota-imported' }, 201);
    }
    throw new Error(`Unexpected gateway request: ${init?.method ?? 'GET'} ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return { calls, fetcher };
}

async function chooseProject(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: 'Niu workspace' });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Organization' }), 'org-1');
  await screen.findByRole('option', { name: 'Agent project' });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Project' }), 'project-1');
}

describe('subscription observations dashboard', () => {
  it('shows source, freshness, reset and unattributed changes without inventing task links', async () => {
    mockGateway();
    const user = userEvent.setup();
    render(<SubscriptionsView token="admin-test-token" />);
    await chooseProject(user);

    expect(await screen.findByRole('heading', { name: 'Observed quota windows' })).toBeTruthy();
    const window = screen.getByText(/provider-export/).closest('.subscription-window');
    expect(window).toBeTruthy();
    expect(within(window as HTMLElement).getByText('80 tokens')).toBeTruthy();
    expect(within(window as HTMLElement).getByText('Decreased 20 tokens · unattributed')).toBeTruthy();
    expect(within(window as HTMLElement).getByText('Fresh')).toBeTruthy();
    expect(screen.getByText('Changes between samples are marked unattributed. A snapshot does not prove which task consumed capacity, and this view never refreshes a provider account or resets an allowance.')).toBeTruthy();
  });

  it('imports schema version 1 and preserves 64-bit quota quantities exactly', async () => {
    const gateway = mockGateway();
    const user = userEvent.setup();
    render(<SubscriptionsView token="admin-test-token" />);
    await chooseProject(user);
    await user.click(await screen.findByRole('button', { name: 'Import update' }));

    const dialog = screen.getByRole('dialog');
    const raw = '{\n  "schema_version": 1,\n  "window_key": "weekly",\n  "unit": "tokens",\n  "remaining": 9007199254740993,\n  "maximum": 9223372036854775807,\n  "observed_at_ms": 1790400000000,\n  "valid_until_ms": 1790403600000,\n  "resets_at_ms": 1791000000000,\n  "source": "provider-export"\n}';
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Quota observation JSON' }), { target: { value: raw } });
    await user.click(within(dialog).getByRole('button', { name: 'Import snapshot' }));

    expect((await screen.findByRole('status')).textContent).toContain('Quota observation imported. No provider call or allowance reset was triggered.');
    const post = gateway.calls.find(call => call.path === `${base}/accounts/account-1/quota` && call.init?.method === 'POST');
    expect(post?.init?.body).toBe(raw);
    expect(await screen.findByText('9,007,199,254,740,993 tokens')).toBeTruthy();
  });

  it('registers account metadata with an opaque reference and displays its inactive state', async () => {
    const gateway = mockGateway();
    const user = userEvent.setup();
    render(<SubscriptionsView token="admin-test-token" />);
    await chooseProject(user);
    await user.click(await screen.findByRole('button', { name: 'Register account' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Provider' }), 'Boreal');
    await user.type(within(dialog).getByRole('textbox', { name: 'Plan' }), 'Monthly');
    await user.type(within(dialog).getByPlaceholderText('env:PROVIDER_ACCOUNT'), 'env:BOREAL_ACCOUNT');
    await user.click(within(dialog).getByRole('button', { name: 'Register account' }));

    expect((await screen.findByRole('status')).textContent).toContain('Account registered as unverified. Registration does not enable inference.');
    const post = gateway.calls.find(call => call.path === `${base}/accounts` && call.init?.method === 'POST');
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({ provider: 'Boreal', plan: 'Monthly', credential_reference: 'env:BOREAL_ACCOUNT' });
    expect(await screen.findByText(/Boreal/)).toBeTruthy();
    expect(screen.getAllByText('unverified')).toHaveLength(2);
  });

  it('permanently deletes every imported sample for one account window', async () => {
    const gateway = mockGateway();
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SubscriptionsView token="admin-test-token" />);
    await chooseProject(user);
    await user.click(await screen.findByRole('button', { name: 'Delete quota history for weekly' }));

    expect(window.confirm).toHaveBeenCalledWith('Permanently delete all imported snapshots for the weekly window?');
    const request = gateway.calls.find(call => call.path === `${base}/accounts/account-1/quota?window_key=weekly` && call.init?.method === 'DELETE');
    expect(request).toBeTruthy();
    expect((await screen.findByRole('status')).textContent).toBe('Deleted 1 quota snapshot for weekly.');
    expect(await screen.findByText('No quota snapshots yet')).toBeTruthy();
  });

  it('opens a linked task from the registered subscription account', async () => {
    mockGateway();
    const onOpenExecution = vi.fn();
    const user = userEvent.setup();
    render(<SubscriptionsView token="admin-test-token" initialScope={{ organizationId: 'org-1', projectId: 'project-1', accountId: 'account-1' }} onOpenExecution={onOpenExecution} />);

    await user.click(await screen.findByRole('button', { name: /linked-task/ }));
    expect(onOpenExecution).toHaveBeenCalledWith('org-1', 'project-1', 'execution-linked');
    expect(document.querySelector('[data-account-id="account-1"]')?.classList.contains('is-focused')).toBe(true);
  });
});
