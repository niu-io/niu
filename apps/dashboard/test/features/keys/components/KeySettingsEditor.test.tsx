import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeySettingsEditor from '@/features/keys/components/KeySettingsEditor';
import type { ProjectKey } from '@/features/keys/api';

vi.mock('@/shell/platform-currency', () => ({ usePlatformCurrency: () => ({ currency: 'USD', billingMode: 'currency', unit: null, error: '', reload: () => {} }) }));

const baseKey: ProjectKey = {
  id: 'key-1',
  slug: 'application',
  revision: 3,
  name: 'Application key',
  allowed_models: ['*'],
  expires_at_ms: null,
  revoked: false,
  expired: false,
  request_rate_limit: { requests_per_minute: 15, revision: '9007199254740993' },
  concurrency_limit: { max_concurrent_requests: 4, active_requests: 2, revision: '8' },
  token_rate_limit: { tokens_per_minute: null, revision: null, snapshot_at: '2026-11-05T00:00:00Z', known_tokens: '0', reserved_tokens: '0', unbounded_requests: 0, committed_tokens: null },
  ip_policy: { allowed_cidrs: null, revision: '2' },
  spending_limits: [{ currency: 'USD', limit_nanos: '10000000000', committed_nanos: '5000000000', remaining_nanos: '5000000000', revision: '5' }],
  unit_spending_limit: null,
};
const assignment = { assignment_revision: 1, policy_revision: null, mode: 'active', policy: null };
const versions = [{ revision: 1, policy_name: 'Default guardrails', active: true }, { revision: 2, policy_name: 'Strict', active: false }];

function setup(overrides: { key?: ProjectKey; canConfigureSpending?: boolean; conflict?: boolean; guardrail?: typeof assignment } = {}) {
  const key = overrides.key ?? baseKey;
  const paches: Record<string, unknown>[] = [];
  const guardrailWrites: Record<string, unknown>[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith('/guardrail') && init?.method === 'PUT') {
      guardrailWrites.push(JSON.parse(init.body as string));
      return Response.json({ assignment_revision: 2 });
    }
    if (path.endsWith('/guardrail')) return Response.json({ data: overrides.guardrail ?? assignment });
    if (path.endsWith('/guardrails/history')) return Response.json({ data: versions, next_cursor: null });
    if (init?.method === 'PATCH') {
      paches.push(JSON.parse(init.body as string));
      if (overrides.conflict) return Response.json({ error: { message: 'Conflict' } }, { status: 409 });
      return Response.json({ ...key, revision: 4 });
    }
    return Response.json({ error: { message: `Unexpected request: ${path}` } }, { status: 500 });
  });
  vi.stubGlobal('fetch', fetcher);
  const onSaved = vi.fn();
  const onReload = vi.fn();
  const onKeyChanged = vi.fn();
  const view = render(<KeySettingsEditor
    token="test"
    projectKey={key}
    models={['fast', 'slow']}
    canWrite
    canConfigureSpending={overrides.canConfigureSpending ?? true}
    metadataPath="/api/v1/workspaces/demo/keys/key-1"
    guardrailPath="/api/v1/organizations/org/projects/demo/keys/key-1/guardrail"
    workspaceGuardrailsPath="/api/v1/organizations/org/projects/demo/guardrails"
    unitLimitPath="/api/v1/organizations/org/projects/demo/keys/key-1/units/limit"
    onKeyChanged={onKeyChanged}
    onSaved={onSaved}
    onCancel={() => {}}
    onReload={onReload}
  />);
  return { view, user: userEvent.setup(), fetcher, paches, guardrailWrites, onSaved, onReload, onKeyChanged };
}
async function waitForGuardrails() {
  await waitFor(() => expect((screen.getByRole('button', { name: 'Key Guardrails' }) as HTMLButtonElement).disabled).toBe(false));
}
const saveButton = () => screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;

it('edits identity, throughput, source IP and spending in a single request', async () => {
  const { user, paches, onSaved } = setup();
  await waitForGuardrails();
  await user.clear(screen.getByLabelText('Name'));
  await user.type(screen.getByLabelText('Name'), 'Updated key');
  await user.clear(screen.getByLabelText('Requests per minute'));
  await user.type(screen.getByLabelText('Requests per minute'), '20');
  await userChoose(user, 'Source IP access mode', 'Block all sources');
  await user.clear(screen.getByLabelText('Lifetime limit (USD)'));
  await user.type(screen.getByLabelText('Lifetime limit (USD)'), '25');
  await waitFor(() => expect(saveButton().disabled).toBe(false));
  await user.click(saveButton());
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(paches).toEqual([{
    name: 'Updated key',
    allowed_models: ['*'],
    expected_revision: 3,
    request_rate_limit: { requests_per_minute: 20, expected_revision: '9007199254740993' },
    ip_policy: { allowed_cidrs: [], expected_revision: '2' },
    spending_limit: { currency: 'USD', limit_nanos: '25000000000', expected_revision: '5' },
  }]);
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeNull();
});

it('preserves the three source IP modes and leaves unchanged limits out of the write', async () => {
  const listed: ProjectKey = { ...baseKey, ip_policy: { allowed_cidrs: ['203.0.113.0/24'], revision: '9' } };
  const first = setup({ key: listed });
  await waitForGuardrails();
  await userChoose(first.user, 'Source IP access mode', 'Allow all sources');
  await waitFor(() => expect(saveButton().disabled).toBe(false));
  await first.user.click(saveButton());
  await waitFor(() => expect(first.paches).toHaveLength(1));
  expect(first.paches[0]).toEqual({ ip_policy: { allowed_cidrs: null, expected_revision: '9' } });

  first.view.unmount();
  const second = setup({ key: { ...baseKey, ip_policy: { allowed_cidrs: null, revision: '4' } } });
  await waitForGuardrails();
  await userChoose(second.user, 'Source IP access mode', 'Allow listed sources');
  await second.user.type(screen.getByLabelText('Allowed addresses or CIDRs'), '203.0.113.0/24\n2001:db8::/32');
  await waitFor(() => expect(saveButton().disabled).toBe(false));
  await second.user.click(saveButton());
  await waitFor(() => expect(second.paches).toHaveLength(1));
  expect(second.paches[0]).toEqual({ ip_policy: { allowed_cidrs: ['203.0.113.0/24', '2001:db8::/32'], expected_revision: '4' } });
}, 15_000);

async function userChoose(user: ReturnType<typeof userEvent.setup>, trigger: string, item: string) {
  await user.click(screen.getByRole('button', { name: trigger }));
  await user.click(await screen.findByRole('menuitemradio', { name: item }));
}

it('rejects fractional, oversized and underspent values without writing', async () => {
  const { user, paches } = setup();
  await waitForGuardrails();
  for (const value of ['1.5', '1000001', '-1', '1e3']) {
    await user.clear(screen.getByLabelText('Requests per minute'));
    await user.type(screen.getByLabelText('Requests per minute'), value);
    expect(saveButton().disabled).toBe(true);
  }
  await user.clear(screen.getByLabelText('Requests per minute'));
  await user.clear(screen.getByLabelText('Lifetime limit (USD)'));
  await user.type(screen.getByLabelText('Lifetime limit (USD)'), '1');
  await screen.findByText('The limit must cover current charges and reserved requests.');
  expect(saveButton().disabled).toBe(true);
  expect(paches).toHaveLength(0);
});

it('rejects more than 64 listed networks without writing', async () => {
  const { user, paches } = setup();
  await waitForGuardrails();
  await userChoose(user, 'Source IP access mode', 'Allow listed sources');
  await user.type(screen.getByLabelText('Allowed addresses or CIDRs'), Array.from({ length: 65 }, () => '192.0.2.1').join('\n'));
  await screen.findByText('Enter between 1 and 64 addresses or CIDRs, each up to 64 characters.');
  expect(saveButton().disabled).toBe(true);
  expect(paches).toHaveLength(0);
}, 15_000);

it('freezes the form at a revision conflict and reloads the key', async () => {
  const { user, onReload } = setup({ conflict: true });
  await waitForGuardrails();
  await user.clear(screen.getByLabelText('Name'));
  await user.type(screen.getByLabelText('Name'), 'Conflicting edit');
  await waitFor(() => expect(saveButton().disabled).toBe(false));
  await user.click(saveButton());
  await screen.findByText('This key changed. Reload it before editing again.');
  expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Reload key' }));
  expect(onReload).toHaveBeenCalledTimes(1);
});

it('saves guardrail follow and pinned modes from the same surface', async () => {
  const following = setup();
  await waitForGuardrails();
  await userChoose(following.user, 'Key Guardrails', 'Strict · Version 2');
  await waitFor(() => expect(saveButton().disabled).toBe(false));
  await following.user.click(saveButton());
  await waitFor(() => expect(following.guardrailWrites).toHaveLength(1));
  expect(following.guardrailWrites[0]).toEqual({ mode: 'fixed', policy_revision: 2, expected_assignment_revision: 1 });
  expect(following.paches).toHaveLength(0);

  following.view.unmount();
  const pinned = setup({ key: baseKey, guardrail: { assignment_revision: 4, policy_revision: 2, mode: 'fixed', policy: { name: 'Strict' } } });
  await waitForGuardrails();
  await userChoose(pinned.user, 'Key Guardrails', 'Follow workspace policy');
  await waitFor(() => expect(saveButton().disabled).toBe(false));
  await pinned.user.click(saveButton());
  await waitFor(() => expect(pinned.guardrailWrites).toHaveLength(1));
  expect(pinned.guardrailWrites[0]).toEqual({ mode: 'active', expected_assignment_revision: 4 });
}, 15_000);

it('keeps policy controls read-only for members who cannot configure spending', async () => {
  const { user, paches } = setup({ canConfigureSpending: false });
  await waitForGuardrails();
  expect(screen.getByText('Only workspace owners can change key limits and policies.')).toBeTruthy();
  expect((screen.getByLabelText('Requests per minute') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText('Lifetime limit (USD)') as HTMLInputElement).disabled).toBe(true);
  await user.clear(screen.getByLabelText('Name'));
  await user.type(screen.getByLabelText('Name'), 'Metadata only');
  await waitFor(() => expect(saveButton().disabled).toBe(false));
  await user.click(saveButton());
  await waitFor(() => expect(paches).toHaveLength(1));
  expect(paches[0]).toEqual({ name: 'Metadata only', allowed_models: ['*'], expected_revision: 3 });
});
