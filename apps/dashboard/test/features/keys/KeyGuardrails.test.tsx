import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import KeyGuardrails from '../../../app/features/keys/components/KeyGuardrails';

const policy = { name: 'Restricted policy', models: { mode: 'allow_list', values: ['example/model'] }, providers: { mode: 'inherit' }, input_rules: [{ preset: 'email_v1', action: 'redact' }] };
const workspace = '/api/v1/organizations/org/projects/workspace/guardrails';
const endpoint = '/api/v1/organizations/org/projects/workspace/keys/key/guardrail';
function setup({ assigned = false, follows = false, writer = true, active = true, failed = false, conflict = false, historyFailed = false, paginated = false, observation = false } = {}) {
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
    if (url.includes('/revisions/')) return Response.json({ data: { revision: Number(url.split('/').at(-1)), policy: observation ? {...policy,output:{mode:"observe_only",rules:[{preset:"niu_api_key_v1",action:"block"}]}} : policy } });
    if (url === endpoint) {
      if (follows) return Response.json({ data: { assignment_revision: 4, policy_revision: null, mode: 'active', policy: null } });
      if (assigned) return Response.json({ data: { assignment_revision: 4, policy_revision: 7, mode: 'fixed', policy } });
      return Response.json({ data: null });
    }
    return Response.json({ data: { revision: 7, policy } });
  }));
  render(<MemoryRouter><KeyGuardrails token="test-token" endpoint={endpoint} workspaceEndpoint={workspace} root="/workspaces/test" canWrite={writer} active={active} /></MemoryRouter>);
  return { user: userEvent.setup(), writes, reads };
}
async function choose(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: 'Change key policy' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Key policy' })).toHaveProperty('disabled', false));
  await user.click(screen.getByRole('button', { name: 'Key policy' }));
  await user.click(screen.getByRole('menuitemradio', { name }));
}

describe('API key Guardrails assignment', () => {
  it('pins a preserved version and writes scoped optimistic assignment', async () => {
    const { user, writes, reads } = setup();
    await choose(user, 'Restricted policy · Version 7 (workspace current)');
    expect(await screen.findByText('example/model')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    await screen.findByText('Saved policy version pinned to this key.');
    expect(writes).toEqual([{ mode: 'fixed', policy_revision: 7, expected_assignment_revision: 0 }]);
    expect(reads).toContain(`${workspace}/revisions/7`);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('lets a pinned key follow the active workspace policy without choosing a version', async () => {
    const { user, writes } = setup({ assigned: true });
    await choose(user, 'Follow workspace policy');
    expect(await screen.findByText(/Later workspace edits apply without re-pinning the key/)).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    await screen.findByText('This key now follows the workspace policy.');
    expect(writes).toEqual([{ mode: 'active', expected_assignment_revision: 4 }]);
    expect(screen.getByText('Follows workspace policy · Version 7')).not.toBeNull();
  });
  it('labels a fixed assignment as pinned rather than following the workspace', async () => {
    setup({ assigned: true });
    expect(await screen.findByText('Pinned to Restricted policy · Version 7')).not.toBeNull();
  });
  it('shows an explicit follow assignment as tracking the current workspace version', async () => {
    const { user } = setup({ follows: true });
    expect(await screen.findByText('Follows workspace policy · Version 7')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Change key policy' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Key policy' })).toHaveProperty('disabled', false));
    expect(screen.getByRole('button', { name: 'Key policy' }).textContent).toContain('Follow workspace policy · Version 7');
    expect(screen.getByRole('button', { name: 'Save assignment' })).toHaveProperty('disabled', true);
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
    await screen.findByText('Follows workspace policy · Version 7');
    expect(screen.queryByRole('button', { name: 'Change key policy' })).toBeNull();
  });
  it('does not turn a failed assignment read into an empty policy', async () => {
    setup({ failed: true });
    await screen.findByRole('alert');
    expect(screen.queryByText('Follows workspace policy · Version 7')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change key policy' })).toBeNull();
  });
  it('keeps a fixed-version history failure visible and disables saving', async () => {
    const { user } = setup({ assigned: true, historyFailed: true });
    await user.click(await screen.findByRole('button', { name: 'Change key policy' }));
    await screen.findByText('History unavailable');
    expect(screen.getByRole('button', { name: 'Save assignment' })).toHaveProperty('disabled', true);
  });
  it('allows switching a pinned key to follow even when saved versions fail to load', async () => {
    const { user, writes } = setup({ assigned: true, historyFailed: true });
    await user.click(await screen.findByRole('button', { name: 'Change key policy' }));
    await screen.findByText('History unavailable');
    await user.click(screen.getByRole('button', { name: 'Key policy' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Follow workspace policy' }));
    const save = screen.getByRole('button', { name: 'Save assignment' });
    expect(save).toHaveProperty('disabled', false);
    await user.click(save);
    await screen.findByText('This key now follows the workspace policy.');
    expect(writes).toEqual([{ mode: 'active', expected_assignment_revision: 4 }]);
  });
  it('loads older versions with the exclusive workspace cursor', async () => {
    const { user, reads } = setup({ paginated: true });
    await user.click(await screen.findByRole('button', { name: 'Change key policy' }));
    await user.click(await screen.findByRole('button', { name: 'Load older versions' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load older versions' })).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Key policy' }));
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

it('links inspection to the exact selected policy version',async()=>{
 const {user}=setup();
 await choose(user,'Restricted policy · Version 7 (workspace current)');
 expect((await screen.findByRole('link',{name:'Inspect saved rules in policy history'})).getAttribute('href')).toBe('/workspaces/test/guardrails?tab=history&revision=7');
});
