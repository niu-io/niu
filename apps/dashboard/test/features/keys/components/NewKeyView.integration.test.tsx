import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import NewKeyRoute from '../../../../app/features/keys/new-page';
import KeysView from '../../../../app/features/keys/components/KeysView';

vi.mock('../../../../app/shell/dashboard-context', () => ({
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

it('returns a newly created key to the same chat without starting a new draft', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    Response.json(init?.method === 'POST' ? {id:'issued-key',token:'synthetic-key',key:{slug:'chat-key'}} : {data:[]})));
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[{pathname:'/workspaces/demo/keys',state:{createKey:true,returnTo:'/generations/chat-42?workspace=demo#latest'}}]}><Routes>
    <Route path="/workspaces/demo/keys" element={<KeysView token="admin-fixture" models={[]} canWrite initialScope={{organizationId:'org',projectId:'workspace'}}/>}/>
  </Routes></MemoryRouter>);
  await user.type(await screen.findByLabelText('Name'), 'Chat key');
  await user.click(screen.getByRole('button', {name:'Create key'}));
  const link = await screen.findByRole('link', {name:'Return to chat'});
  expect(link.getAttribute('href')).toBe('/generations/chat-42?workspace=demo&key=chat-key#latest');
});

it('returns to the originating chat when key creation is cancelled', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:[]})));
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[{pathname:'/workspaces/demo/keys',state:{createKey:true,returnTo:'/generations/chat-42?workspace=demo'}}]}><Routes>
    <Route path="/workspaces/demo/keys" element={<KeysView token="admin-fixture" models={[]} canWrite initialScope={{organizationId:'org',projectId:'workspace'}}/>}/>
    <Route path="/generations/:session" element={<p>Chat restored</p>}/>
  </Routes></MemoryRouter>);
  await user.click(await screen.findByRole('button',{name:'Return to chat'}));
  expect(await screen.findByText('Chat restored')).toBeTruthy();
});
