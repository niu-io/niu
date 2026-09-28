import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeysView from '../../../../src/features/keys/components/KeysView';

const expectedBaseUrl = () => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}/v1`;

vi.mock('../../../../src/app/console-context', () => ({
  useConsoleContext: () => ({
    workspaces: [{ id: 'project-1', name: 'Production', organization_id: 'org-1', organization_name: 'Acme' }],
    workspace: { id: 'project-1', name: 'Production', organization_id: 'org-1', organization_name: 'Acme' },
    workspaceLoading: false,
  }),
}));

it('issues a project-scoped key and makes its one-time secret easy to copy', async () => {
  const calls: Array<{ path: string; method: string; body?: string }> = [];
  const keyPath = '/admin/v1/organizations/org-1/projects/project-1/keys';
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ path, method, body: typeof init?.body === 'string' ? init.body : undefined });
    const value = method === 'POST'
      ? { id: 'key-1', token: 'niu_once_test_secret' }
      : { data: [] };
    return new Response(JSON.stringify(value), { status: method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json' } });
  }));
  const writeText = vi.fn(async () => {});
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  render(<KeysView token="admin-token" models={['fast', 'careful']} canWrite canCreateOrganization initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} />);

  expect(await screen.findByRole('heading', { name: 'Project keys' })).toBeTruthy();
  await user.type(screen.getByLabelText('Key name'), 'My application');
  await user.click(screen.getByRole('checkbox', { name: 'fast' }));
  await user.click(screen.getByRole('button', { name: 'Issue key' }));

  expect(await screen.findByRole('heading', { name: 'Save your key' })).toBeTruthy();
  expect((screen.getByLabelText('New API key') as HTMLInputElement).value).toBe('niu_once_test_secret');
  expect((screen.getByLabelText('Niu base URL') as HTMLInputElement).value).toBe(expectedBaseUrl());
  expect((screen.getByLabelText('Model alias') as HTMLSelectElement).value).toBe('fast');
  expect(screen.getByText(/model: 'fast'/)).toBeTruthy();
  expect(screen.queryByText(/admin-token/)).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Copy Niu base URL' }));
  expect(writeText).toHaveBeenCalledWith(expectedBaseUrl());
  await user.click(screen.getByRole('button', { name: 'Copy client example' }));
  expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining(`baseURL: '${expectedBaseUrl()}'`));
  expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("model: 'fast'"));
  await user.click(screen.getByRole('button', { name: 'Copy API key' }));
  expect(writeText).toHaveBeenCalledWith('niu_once_test_secret');
  expect(screen.getByText('Copied to clipboard.')).toBeTruthy();

  const issue = calls.find(call => call.method === 'POST');
  expect(issue?.path).toBe(keyPath);
  expect(JSON.parse(issue?.body ?? '{}')).toEqual({ name: 'My application', allowed_models: ['fast'], ttl_seconds: 30 * 86400 });
});

it('keeps an operator viewer in read-only key administration', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{
    id: 'key-1', name: 'Frontend', allowed_models: ['fast'], expires_at_ms: 2_000_000_000_000, revoked: false, expired: false,
  }] }), { status: 200, headers: { 'content-type': 'application/json' } })));

  render(<KeysView token="viewer-token" models={['fast']} canWrite={false} canCreateOrganization={false} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} />);

  expect(await screen.findByRole('heading', { name: 'Project keys' })).toBeTruthy();
  expect(screen.getByText('Frontend')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Use a project key' })).toBeTruthy();
  expect((screen.getByLabelText('Model alias') as HTMLSelectElement).value).toBe('fast');
  expect(screen.queryByText(/admin-token/)).toBeNull();
  expect(screen.getByText('This session can review keys but does not have permission to create or revoke them.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Issue key' })).toBeNull();
});
