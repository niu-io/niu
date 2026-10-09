import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import KeyGuardrails from '../../../src/features/keys/components/KeyGuardrails';

const policy = { name: 'Restricted policy', models: { mode: 'allow_list', values: ['example/model'] }, providers: { mode: 'inherit' }, input_rules: [{ preset: 'email_v1', action: 'redact' }] };
const workspace = '/admin/v1/organizations/org/projects/workspace/guardrails';
const endpoint = '/admin/v1/organizations/org/projects/workspace/keys/key/guardrail';
function setup({ assigned = false, writer = true, active = true, failed = false, conflict = false, historyFailed = false, paginated = false, observation = false } = {}) {
  const writes: unknown[] = [];
  const reads: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      writes.push(JSON.parse(String(init.body)));
      return conflict ? Response.json({ error: { message: 'Conflict' } }, { status: 409 }) : Response.json({ assignment_revision: 5 });
    }
    reads.push(url);
    if (failed) return Response.json({ error: { message: 'Unavailable' } }, { status: 503 });
    if (url.includes('/history')) {
      if (historyFailed) return Response.json({ error: { message: 'History unavailable' } }, { status: 503 });
      return url.includes('?') ? Response.json({ data: [{ revision: 2, policy_name: 'Older policy', active: false }], next_cursor: null }) : Response.json({ data: [{ revision: 7, policy_name: policy.name, active: true }], next_cursor: paginated ? 7 : null });
    }
    if (url.includes('/revisions/')) return Response.json({ data: { revision: 7, policy: observation ? {...policy,output:{mode:"observe_only",rules:[{preset:"niu_api_key_v1",action:"block"}]}} : policy } });
    return Response.json({ data: url === endpoint ? assigned ? { assignment_revision: 4, policy_revision: 7, policy } : null : { revision: 7, policy } });
  }));
  render(<MemoryRouter><KeyGuardrails token="test-token" endpoint={endpoint} workspaceEndpoint={workspace} root="/workspaces/test" canWrite={writer} active={active} /></MemoryRouter>);
  return { user: userEvent.setup(), writes, reads };
}
async function choose(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: 'Change key policy' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Saved policy version' })).toHaveProperty('disabled', false));
  await user.click(screen.getByRole('button', { name: 'Saved policy version' }));
  await user.click(screen.getByRole('menuitemradio', { name }));
}

describe('API key Guardrails assignment', () => {
  it('reviews a preserved version and writes scoped optimistic assignment', async () => {
    const { user, writes, reads } = setup();
    await choose(user, 'Restricted policy · Version 7 (workspace current)');
    expect(await screen.findByText('example/model')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    await screen.findByText('Saved policy version assigned to this key.');
    expect(writes).toEqual([{ policy_revision: 7, expected_assignment_revision: 0 }]);
    expect(reads).toContain(`${workspace}/revisions/7`);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('clears only the key policy with its existing assignment revision', async () => {
    const { user, writes } = setup({ assigned: true });
    await user.click(await screen.findByRole('button', { name: 'Change key policy' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved policy version' })).toHaveProperty('disabled', false));
    await user.click(screen.getByRole('button', { name: 'Saved policy version' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'No additional key policy' }));
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    await screen.findByText('Key assignment removed. Workspace Guardrails still apply.');
    expect(writes).toEqual([{ policy_revision: null, expected_assignment_revision: 4 }]);
    expect(screen.getByText('Restricted policy · Version 7')).not.toBeNull();
  });
  it('requires reload after a conflict and never retries the write automatically', async () => {
    const { user, writes } = setup({ conflict: true });
    await choose(user, 'Restricted policy · Version 7 (workspace current)');
    await screen.findByText('example/model');
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    await screen.findByText('This assignment or key changed. Reload before trying again.');
    expect(screen.queryByRole('button', { name: 'Save assignment' })).toBeNull();
    expect(writes).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Reload Guardrails' }));
    await screen.findByRole('button', { name: 'Change key policy' });
    expect(writes).toHaveLength(1);
  });
  it.each([{ writer: false }, { active: false }])('has no assignment control for reader or inactive key %j', async options => {
    setup(options);
    await screen.findByText('No additional key policy');
    expect(screen.queryByRole('button', { name: 'Change key policy' })).toBeNull();
  });
  it('does not turn a failed assignment read into an empty policy', async () => {
    setup({ failed: true });
    await screen.findByRole('alert');
    expect(screen.queryByText('No additional key policy')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change key policy' })).toBeNull();
  });
  it('keeps history failure visible and disables saving', async () => {
    const { user } = setup({ assigned: true, historyFailed: true });
    await user.click(await screen.findByRole('button', { name: 'Change key policy' }));
    await screen.findByText('History unavailable');
    expect(screen.getByRole('button', { name: 'Save assignment' })).toHaveProperty('disabled', true);
  });
  it('loads older versions with the exclusive workspace cursor', async () => {
    const { user, reads } = setup({ paginated: true });
    await user.click(await screen.findByRole('button', { name: 'Change key policy' }));
    await user.click(await screen.findByRole('button', { name: 'Load older versions' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load older versions' })).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Saved policy version' }));
    expect(screen.getByRole('menuitemradio', { name: 'Older policy · Version 2' })).not.toBeNull();
    expect(reads).toContain(`${workspace}/history?before_revision=7`);
  });
});

it('labels an observation assignment without claiming enforcement', async()=>{
  const {user}=setup({observation:true});
  await choose(user,'Restricted policy · Version 7 (workspace current)');
  await screen.findByText('Observe only · response unchanged');
  expect(screen.getByText('Observe · Niu API keys')).not.toBeNull();
  expect(screen.queryByText('Buffered responses required')).toBeNull();
});
