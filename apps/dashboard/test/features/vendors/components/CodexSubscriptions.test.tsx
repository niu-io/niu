import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import CodexSubscriptions from '../../../../src/features/vendors/components/CodexSubscriptions';

const workspaces = [
  { id: 'workspace-a', organization_id: 'organization-a', name: 'Personal', organization_name: 'My organization' },
  { id: 'workspace-b', organization_id: 'organization-a', name: 'Research', organization_name: 'My organization' },
];
const account = { id: 'internal-account-reference', name: 'My coding account', health: 'ready', busy: false, models: [{ slug: 'test-model', display_name: 'Test model' }, { slug: 'other-model', display_name: 'Other model' }] };

it('scopes discovery and pause to the selected workspace and shows model names without internal identifiers', async () => {
  const calls: Array<{ path: string; method?: string; body?: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input); calls.push({ path, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json({ data: init?.method === 'PATCH' ? { enabled: false } : path.includes('workspace-a') ? [account] : [] });
  }));
  render(<MemoryRouter><CodexSubscriptions token="test-admin" workspaces={workspaces} /></MemoryRouter>);
  const user = userEvent.setup();
  await screen.findByText('My coding account');
  expect(screen.queryByText('internal-account-reference')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Available model' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Other model' }));
  expect(screen.getByText(/codex\/other-model/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Pause', exact: true }));
  await waitFor(() => expect(calls.some(call => call.method === 'PATCH' && call.path.endsWith('workspace-a/codex-connections/internal-account-reference') && JSON.stringify(call.body) === '{"enabled":false}')).toBe(true));
  await user.click(screen.getByRole('button', { name: 'Workspace', exact: true }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Research', exact: true }));
  await screen.findByText('No Codex subscriptions connected to this workspace.');
  expect(screen.queryByText('My coding account')).toBeNull();
  expect(calls.some(call => call.path.endsWith('workspace-b/codex-connections'))).toBe(true);
});

it('keeps reserved accounts locked for sign-in and explains uncertain execution', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ ...account, busy: true }] })));
  render(<MemoryRouter><CodexSubscriptions token="test-admin" workspaces={workspaces} /></MemoryRouter>);
  await screen.findByText('Reserved');
  expect((screen.getByRole('button', { name: 'Sign in', exact: true }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/uncertain outcome/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Connect Codex', exact: true }));
  expect(screen.getByRole('dialog', { name: 'Connect Codex subscription' })).toBeTruthy();
  expect((screen.getByLabelText('Account name') as HTMLInputElement).value).toBe('My Codex');
});
