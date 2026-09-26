import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeysView from '../../../../src/features/keys/components/KeysView';

it('creates a personal workspace, default project, and one-time scoped key from first run', async () => {
  const calls: Array<{ path: string; method: string; body?: string }> = [];
  let organizationCreated = false;
  let projectCreated = false;
  let keyCreated = false;
  const keyPath = '/admin/v1/organizations/org-1/projects/project-1/keys';

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ path, method, body: typeof init?.body === 'string' ? init.body : undefined });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json' },
    });

    if (path === '/admin/v1/organizations' && method === 'GET') {
      return json({ data: organizationCreated ? [{ id: 'org-1', name: 'Personal workspace' }] : [] });
    }
    if (path === '/admin/v1/organizations' && method === 'POST') {
      organizationCreated = true;
      return json({ id: 'org-1', name: 'Personal workspace' }, 201);
    }
    if (path === '/admin/v1/organizations/org-1/projects' && method === 'GET') {
      return json({ data: projectCreated ? [{ id: 'project-1', name: 'Default project' }] : [] });
    }
    if (path === '/admin/v1/organizations/org-1/projects' && method === 'POST') {
      projectCreated = true;
      return json({ id: 'project-1', name: 'Default project' }, 201);
    }
    if (path === keyPath && method === 'POST') {
      keyCreated = true;
      return json({ id: 'key-1', token: 'niu_once_test_secret' }, 201);
    }
    if (path === keyPath && method === 'GET') {
      return json({ data: keyCreated ? [{
        id: 'key-1', name: 'My application', allowed_models: ['fast'],
        expires_at_ms: 2_000_000_000_000, revoked: false, expired: false,
      }] : [] });
    }
    throw new Error(`Unexpected ${method} ${path}`);
  }));

  const user = userEvent.setup();
  render(<KeysView token="admin-token" models={['fast', 'careful']} />);

  expect(await screen.findByRole('heading', { name: 'Create a workspace and your first key' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'fast' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('checkbox', { name: 'careful' }).getAttribute('aria-checked')).toBe('false');
  await user.click(screen.getByRole('button', { name: 'Create workspace and key' }));

  expect(await screen.findByRole('heading', { name: 'Save your key' })).toBeTruthy();
  expect((screen.getByLabelText('New API key') as HTMLInputElement).value).toBe('niu_once_test_secret');
  const writes = calls.filter(call => call.method === 'POST');
  expect(writes.map(call => call.path)).toEqual([
    '/admin/v1/organizations',
    '/admin/v1/organizations/org-1/projects',
    keyPath,
  ]);
  expect(JSON.parse(writes[0].body ?? '{}')).toEqual({ name: 'Personal workspace' });
  expect(JSON.parse(writes[1].body ?? '{}')).toEqual({ name: 'Default project' });
  expect(JSON.parse(writes[2].body ?? '{}')).toEqual({
    name: 'My application',
    allowed_models: ['fast'],
    ttl_seconds: 30 * 86400,
  });
});
