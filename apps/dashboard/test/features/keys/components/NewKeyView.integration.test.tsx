import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import NewKeyRoute from '../../../../src/features/keys/new-page';
import KeysView from '../../../../src/features/keys/components/KeysView';

vi.mock('../../../../src/app/dashboard-context', () => ({
  useDashboardContext: () => ({
    workspace: { id: 'workspace', name: 'Demo', organization_id: 'org' },
    workspaceLoading: false,
    rememberChatKey: vi.fn(),
    forgetChatKey: vi.fn(),
  }),
}));

it('uses the shared creation dialog from the legacy route without requiring models', async () => {
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    Response.json(init?.method === 'POST' ? { id: 'issued-key', token: 'synthetic-key' } : { data: [] }));
  vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/workspaces/demo/keys/new']}><Routes>
    <Route path="/workspaces/demo/keys/new" element={<NewKeyRoute />} />
    <Route path="/workspaces/demo/keys" element={<KeysView token="admin-fixture" models={[]} canWrite initialScope={{ organizationId: 'org', projectId: 'workspace' }} />} />
  </Routes></MemoryRouter>);
  expect(await screen.findByRole('dialog', { name: 'Create an API key' })).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  await user.type(screen.getByLabelText('Name'), 'Application');
  await user.click(screen.getByRole('button', { name: 'Create key' }));
  expect(await screen.findByRole('heading', { name: 'Save your API key' })).toBeTruthy();
  const request = fetch.mock.calls.find(call => call[1]?.method === 'POST');
  expect(JSON.parse(String(request?.[1]?.body))).toEqual({ name: 'Application', ttl_seconds: 30 * 86400 });
});
