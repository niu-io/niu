import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import AgentConnectView from '../../../src/features/agent-connect/components/AgentConnectView';
import type { Workspace } from '../../../src/app/console-context';

const organizationId = '00000000-0000-4000-8000-000000000001';
const projectId = '00000000-0000-4000-8000-000000000002';
const routeKeyId = '00000000-0000-4000-8000-000000000003';
const collectorKeyId = '00000000-0000-4000-8000-000000000004';
const workspace: Workspace = {
  id: projectId,
  name: 'Production',
  organization_id: organizationId,
  organization_name: 'Acme',
};

it('creates a model-scoped Aider key and keeps its copied setup bound to that alias', async () => {
  const calls: Array<{ path: string; method: string; body?: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ path, method, body: typeof init?.body === 'string' ? init.body : undefined });
    if (method === 'GET') return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ id: routeKeyId, token: 'niu_once_aider_key', allowed_models: ['team/fast'] }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  }));
  const writeText = vi.fn(async () => {});
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  render(<MemoryRouter><AgentConnectView token="admin-token" workspace={workspace} models={['team/fast', 'team/careful']} canWrite /></MemoryRouter>);

  await user.click(await screen.findByRole('button', { name: 'Create Aider key' }));
  expect((await screen.findByLabelText('Workspace key · shown once') as HTMLInputElement).value).toBe('niu_once_aider_key');
  const modelDropdown = screen.getByRole('button', { name: 'Model alias' });
  expect(modelDropdown.textContent).toContain('team/fast');
  expect((modelDropdown as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/node sdks\/agent-connect\/bin\/niu-agent-connect\.mjs aider route/)).toBeTruthy();
  expect(screen.getByText(/--model 'team\/fast'/)).toBeTruthy();
  expect(screen.queryByText(/\n\+/)).toBeNull();

  const issue = calls.find(call => call.method === 'POST');
  expect(issue?.path).toBe(`/admin/v1/organizations/${organizationId}/projects/${projectId}/keys`);
  expect(JSON.parse(issue?.body ?? '{}')).toEqual({
    name: 'Agent Connect - Aider',
    allowed_models: ['team/fast'],
    ttl_seconds: 90 * 86400,
  });

  await user.click(screen.getByRole('button', { name: 'Copy setup' }));
  expect(await screen.findByText('Aider setup copied.')).toBeTruthy();
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('pnpm --filter @niu-io/agent-connect build'));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`--gateway '${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}/v1'`));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("--model 'team/fast'"));
  expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('paste-the-one-time-workspace-key'));
  await user.click(screen.getByRole('button', { name: 'Dismiss workspace key' }));
  expect(screen.getByText(/This key is scoped to/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Manage or revoke it in Workspace keys' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Create Aider key' })).toBeNull();
});

it('creates and revokes a workspace-scoped Claude activity key without putting it in the run command', async () => {
  const calls: Array<{ path: string; method: string; body?: string }> = [];
  let keys: Array<Record<string, unknown>> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ path, method, body: typeof init?.body === 'string' ? init.body : undefined });
    if (method === 'GET') return new Response(JSON.stringify({ data: keys }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (method === 'POST') {
      keys = [{
        id: collectorKeyId,
        name: 'Agent Connect - Claude Code',
        purpose: 'execution',
        created_at_ms: 1_800_000_000_000,
        expires_at_ms: 1_810_000_000_000,
        revoked: false,
        expired: false,
      }];
      return new Response(JSON.stringify({ id: collectorKeyId, token: 'niu_collector_once' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (method === 'DELETE') {
      keys = keys.map(key => ({ ...key, revoked: true }));
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request ${method} ${path}`);
  }));
  const writeText = vi.fn(async () => {});
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  render(<MemoryRouter><AgentConnectView token="admin-token" workspace={workspace} models={['team/fast']} canWrite /></MemoryRouter>);
  await user.click(await screen.findByRole('button', { name: /Claude Code/ }));

  expect(await screen.findByText('No active Claude Code activity keys.')).toBeTruthy();
  expect(screen.getByText(/Run from a Niu source checkout/)).toBeTruthy();
  const runCommand = screen.getByText(/node sdks\/agent-connect\/bin\/niu-agent-connect.mjs/).textContent ?? '';
  expect(runCommand).toContain(`--organization '${organizationId}'`);
  expect(runCommand).toContain(`--workspace '${projectId}'`);
  expect(runCommand).not.toContain('niu_collector_once');

  await user.click(screen.getByRole('button', { name: 'Create activity key' }));
  expect((await screen.findByLabelText('Activity key · shown once') as HTMLInputElement).value).toBe('niu_collector_once');
  expect(await screen.findByText('Agent Connect - Claude Code')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Copy setup' }));
  expect(await screen.findByText('Claude Code setup copied.')).toBeTruthy();
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('pnpm --filter @niu-io/agent-connect build'));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`--workspace '${projectId}'`));
  expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('niu_collector_once'));
  expect(screen.queryByText(/admin-token/)).toBeNull();

  const issue = calls.find(call => call.method === 'POST');
  expect(issue?.path).toBe(`/admin/v1/organizations/${organizationId}/projects/${projectId}/collector-keys`);
  expect(JSON.parse(issue?.body ?? '{}')).toMatchObject({ purpose: 'execution', name: 'Agent Connect - Claude Code' });
  await user.click(screen.getByRole('button', { name: 'Revoke' }));
  expect(await screen.findByText('Activity key revoked.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  expect(calls.some(call => call.method === 'DELETE' && call.path.endsWith(`/collector-keys/${collectorKeyId}`))).toBe(true);
});
