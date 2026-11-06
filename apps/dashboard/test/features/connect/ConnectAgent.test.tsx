import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import ConnectAgent from '@/features/connect/page';

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@/shell/dashboard-context', () => ({
  useDashboardContext: () => ({ token: 'test', signOut, workspaces: [{ id: 'workspace-one', organization_id: 'organization-one', name: 'Team workspace' }, {id: 'workspace-two', organization_id: 'organization-two', name: 'Other workspace'}], session: { kind: 'operator', permissions: { write: true } } }),
}));

it('offers a signed-in user a safe sign-out path', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data: {client_name: 'Test agent', state: 'pending', capabilities: []}})));
  render(<MemoryRouter initialEntries={['/connect?code=ABCDEF123456']}><ConnectAgent /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Sign out' }));
  expect(signOut).toHaveBeenCalled();
});

it.each([false, true])('persists explicit invocation authority %s after workspace and consent review', async invocation => {
  let decision: Record<string, unknown> | undefined;
  vi.stubGlobal('fetch', vi.fn(async (_path: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      decision = JSON.parse(String(options.body));
      return new Response(null, { status: 204 });
    }
    if (_path.startsWith('/api/v1/models?')) return Response.json({data: [{id:'fast'}, {id:'careful'}]});
    return Response.json({ data: { client_name: 'Test agent', state: 'pending', capabilities: ['pools:read'] } });
  }));
  render(<MemoryRouter initialEntries={['/connect?code=ABCDEF123456']}><ConnectAgent /></MemoryRouter>);
  await screen.findByText('Test agent');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Choose a workspace' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Team workspace' }));
  expect(screen.getByRole('checkbox', { name: 'Allow model calls' }).getAttribute('data-state')).toBe('unchecked');
  if (invocation) {
    await user.click(screen.getByRole('checkbox', { name: 'Allow model calls' }));
    await user.click(await screen.findByRole('button', { name: 'Allowed models' }));
    await user.type(screen.getByRole('textbox', {name: 'Filter models'}), 'fast');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('menuitemcheckbox', {name:'fast'}).getAttribute('aria-checked')).toBe('true');
    await user.keyboard('{Escape}');
  }
  await user.click(screen.getByRole('checkbox', { name: 'I recognize this request and approve this access.' }));
  await user.click(screen.getByRole('button', { name: 'Authorize agent' }));
  await screen.findByText('Authorization approved');
  expect(decision).toMatchObject({ invocation_allowed: invocation, workspace_id: 'workspace-one', ttl_seconds: 3600 });
  expect(decision?.allowed_models).toEqual(invocation ? ['fast'] : ['*']);
});

it.each(['error', 'empty', 'malformed'])('does not require a working model catalog for management-only approval: %s', async outcome => {
  let decision: Record<string, unknown> | undefined;
  vi.stubGlobal('fetch', vi.fn(async (path: string, options?: RequestInit) => {
    if (options?.method === 'POST') { decision = JSON.parse(String(options.body)); return new Response(null, {status:204}); }
    if (path.startsWith('/api/v1/models?')) return outcome === 'error' ? new Response('', {status:503}) : Response.json({data:outcome === 'empty' ? [] : [{id:'*'}]});
    return Response.json({data:{client_name:'Test agent',state:'pending',capabilities:['pools:read']}});
  }));
  render(<MemoryRouter initialEntries={['/connect?code=ABCDEF123456']}><ConnectAgent /></MemoryRouter>);
  await screen.findByText('Test agent');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', {name:'Choose a workspace'}));
  await user.click(screen.getByRole('menuitemradio', {name:'Team workspace'}));
  await user.click(screen.getByRole('checkbox', {name:'Allow model calls'}));
  await screen.findByText(outcome === 'empty' ? 'No models are available in this workspace. Turn off model calls to continue with management access.' : 'Could not load workspace models. Retry, or turn off model calls to continue with management access.');
  expect((screen.getByRole('button', {name:'Authorize agent'}) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole('checkbox', {name:'Allow model calls'}));
  await user.click(screen.getByRole('checkbox', {name:'I recognize this request and approve this access.'}));
  await user.click(screen.getByRole('button', {name:'Authorize agent'}));
  await screen.findByText('Authorization approved');
  expect(decision).toMatchObject({invocation_allowed:false,allowed_models:['*']});
});

it('selects all currently listed names without a wildcard and requires renewed consent after a model change', async () => {
  let decision: Record<string, unknown> | undefined;
  vi.stubGlobal('fetch', vi.fn(async (path: string, options?: RequestInit) => {
    if (options?.method === 'POST') {decision=JSON.parse(String(options.body));return new Response(null,{status:204});}
    if (path.startsWith('/api/v1/models?')) return Response.json({data:[{id:'fast'}, {id:'careful'}]});
    return Response.json({data:{client_name:'Test agent',state:'pending',capabilities:[]}});
  }));
  render(<MemoryRouter initialEntries={['/connect?code=ABCDEF123456']}><ConnectAgent /></MemoryRouter>);
  await screen.findByText('Test agent');
  const user=userEvent.setup();
  await user.click(screen.getByRole('button', {name:'Choose a workspace'}));
  await user.click(screen.getByRole('menuitemradio', {name:'Team workspace'}));
  await user.click(screen.getByRole('checkbox', {name:'Allow model calls'}));
  await user.click(await screen.findByRole('button', {name:'Allowed models'}));
  await user.click(screen.getByRole('menuitemcheckbox', {name:'fast'}));
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('checkbox', {name:'I recognize this request and approve this access.'}));
  await user.click(screen.getByRole('button', {name:'Allowed models'}));
  await user.click(screen.getByRole('menuitem', {name:'Select all current models'}));
  await user.keyboard('{Escape}');
  expect(screen.getByRole('checkbox', {name:'I recognize this request and approve this access.'}).getAttribute('data-state')).toBe('unchecked');
  expect((screen.getByRole('button', {name:'Authorize agent'}) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole('checkbox', {name:'I recognize this request and approve this access.'}));
  await user.click(screen.getByRole('button', {name:'Authorize agent'}));
  await screen.findByText('Authorization approved');
  expect(decision?.allowed_models).toEqual(['careful','fast']);
});

it('loads choices for the reviewed workspace and resets selected models and consent when it changes', async () => {
  const paths: string[] = [];
  let decision: Record<string, unknown> | undefined;
  vi.stubGlobal('fetch', vi.fn(async (path: string, options?: RequestInit) => {
    paths.push(path);
    if (options?.method === 'POST') { decision=JSON.parse(String(options.body)); return new Response(null,{status:204}); }
    if (path.startsWith('/api/v1/models?')) return Response.json({data:path.includes('project_id=workspace-one') ? [{id:'fast'}, {id:'careful'}] : [{id:'other-model'}]});
    return Response.json({data:{client_name:'Test agent',state:'pending',capabilities:[]}});
  }));
  render(<MemoryRouter initialEntries={['/connect?code=ABCDEF123456']}><ConnectAgent /></MemoryRouter>);
  await screen.findByText('Test agent');
  const user=userEvent.setup();
  await user.click(screen.getByRole('button', {name:'Choose a workspace'}));
  await user.click(screen.getByRole('menuitemradio', {name:'Team workspace'}));
  await user.click(screen.getByRole('checkbox', {name:'Allow model calls'}));
  await user.click(await screen.findByRole('button', {name:'Allowed models'}));
  await user.click(screen.getByRole('menuitem', {name:'Select all current models'}));
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('checkbox', {name:'I recognize this request and approve this access.'}));
  await user.click(screen.getByRole('button', {name:'Team workspace'}));
  await user.click(screen.getByRole('menuitemradio', {name:'Other workspace'}));
  expect(screen.getByRole('checkbox', {name:'Allow model calls'}).getAttribute('data-state')).toBe('unchecked');
  expect(screen.getByRole('checkbox', {name:'I recognize this request and approve this access.'}).getAttribute('data-state')).toBe('unchecked');
  await user.click(screen.getByRole('checkbox', {name:'Allow model calls'}));
  await user.click(await screen.findByRole('button', {name:'Allowed models'}));
  expect(screen.queryByRole('menuitemcheckbox', {name:'fast'})).toBeNull();
  await user.click(screen.getByRole('menuitemcheckbox', {name:'other-model'}));
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('checkbox', {name:'I recognize this request and approve this access.'}));
  await user.click(screen.getByRole('button', {name:'Authorize agent'}));
  await screen.findByText('Authorization approved');
  expect(paths).toContain('/api/v1/models?organization_id=organization-two&project_id=workspace-two');
  expect(decision).toMatchObject({workspace_id:'workspace-two',allowed_models:['other-model']});
});

it('lets a user correct an unavailable request code without authorizing it', async () => {
  const fetchMock = vi.fn(async (path: string, _options?: RequestInit) => path.endsWith('ABCDEF123456')
    ? Response.json({ data: { client_name: 'Test agent', state: 'pending', capabilities: [] } })
    : new Response(null, { status: 404 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<MemoryRouter initialEntries={['/connect?code=ABCDEF123450']}><ConnectAgent /></MemoryRouter>);
  await screen.findByText('This request is unavailable or expired. Ask your agent to start again.');
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Verification code'), 'ABCD-EF12-3456');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByText('Test agent')).toBeTruthy();
  expect(fetchMock.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
});

it('reports a service failure without claiming the request expired', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
  render(<MemoryRouter initialEntries={['/connect?code=ABCDEF123450']}><ConnectAgent /></MemoryRouter>);
  await screen.findByText('Could not load the request. Try again.');
  expect(screen.queryByText(/unavailable or expired/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Reload request' })).toBeTruthy();
  await waitFor(() => expect(screen.getByLabelText('Verification code')).toBeTruthy());
});

it('keeps task, interfaces and spending policy behind advanced options and submits narrowed interfaces', async () => {
  let decision: Record<string, unknown> | undefined;
  vi.stubGlobal('fetch', vi.fn(async (path: string, options?: RequestInit) => {
    if (options?.method === 'POST') { decision = JSON.parse(String(options.body)); return new Response(null, { status: 204 }); }
    if (path.startsWith('/api/v1/models?')) return Response.json({data: [{id:'fast'}, {id:'careful'}]});
    return Response.json({data: {
      client_name: 'Test agent',
      state: 'pending',
      capabilities: ['pools:read'],
      task: 'Review the current routing policy',
    }});
  }));
  render(<MemoryRouter initialEntries={['/connect?code=ABCDEF123456']}><ConnectAgent /></MemoryRouter>);
  await screen.findByText('Test agent');
  expect(screen.queryByText('Review the current routing policy')).toBeNull();
  expect(screen.queryByText('Spending basis')).toBeNull();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Choose a workspace' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Team workspace' }));
  await user.click(screen.getByRole('checkbox', { name: 'Allow model calls' }));
  await user.click(await screen.findByRole('button', { name: 'Allowed models' }));
  await user.click(screen.getByRole('menuitem', { name: 'Select all current models' }));
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Advanced options' }));
  expect(await screen.findByText('Review the current routing policy')).toBeTruthy();
  expect(screen.getByText('Spending basis')).toBeTruthy();
  expect(screen.getByText(/Owner-funded upstream Provider expense is not capped/)).toBeTruthy();
  expect(screen.getByText(/fixed at approval/)).toBeTruthy();
  await user.click(screen.getByRole('checkbox', { name: 'Embeddings' }));
  expect(screen.getByRole('checkbox', { name: 'I recognize this request and approve this access.' }).getAttribute('data-state')).toBe('unchecked');
  await user.click(screen.getByRole('checkbox', { name: 'I recognize this request and approve this access.' }));
  await user.click(screen.getByRole('button', { name: 'Authorize agent' }));
  await screen.findByText('Authorization approved');
  expect(decision).toMatchObject({
    invocation_allowed: true,
    allowed_models: ['careful', 'fast'],
    invocation_protocols: ['chat', 'responses', 'messages', 'content', 'decisions', 'video'],
  });
});
