import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router';
import { appRoutes } from '../../src/app/routes';

function renderAt(path: string, requiresLogin = false) {
  const applicationFetch = globalThis.fetch;
  let signedIn = !requiresLogin;
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (String(input) === '/admin/v1/auth/config') return Response.json({ password_login: true });
    if (String(input) === '/admin/v1/auth/browser/login' && init?.method === 'POST') {
      signedIn = true;
      return Response.json({ session: {} });
    }
    if (String(input) === '/admin/v1/session' && !signedIn) return Response.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    return applicationFetch(input, init);
  }));
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Email'), 'demo@example.test');
  await user.type(await screen.findByLabelText('Password'), 'fixture-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

function mockHealth() {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => {
    const path = String(input);
    const data = path === '/healthz' ? { status: 'ok', model_count: 0 }

      : path === '/admin/v1/session' ? { data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } }
      : path === '/admin/v1/workspaces' ? { data: [{ id: 'default', name: 'Default', organization_id: 'org', organization_name: 'Demo' }, { id: 'production', name: 'Production', organization_id: 'org', organization_name: 'Demo' }] }
      : path === '/admin/v1/organizations' ? { data: [{ id: 'org', name: 'Demo' }] }
      : path.endsWith('/billing') ? { data: { balances: [], unresolved: '0', unpriced: '0', tariffs: [], invoices: [] } }
      : { data: [], summary: { request_count: 0, usage_count: 0, prompt_tokens: '0', completion_tokens: '0', failures: 0, customer_charges: [], usage_by_model: [], usage_by_key: [] } };
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  }));
}

describe('dashboard route layout', () => {
  it('clears a browser session when another tab confirms sign-out', async () => {
    mockHealth();
    const router = renderAt('/workspaces/default/keys');
    await screen.findByRole('navigation', { name: 'Product navigation' });
    await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: 'niu.auth.signout', newValue: 'confirmed-signout' })); });
    await screen.findByRole('button', { name: 'Sign in', exact: true });
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('navigation', { name: 'Product navigation' })).toBeNull();
  });
  it('preserves the verified identity when focus revalidation has a network failure', async () => {
    mockHealth();
    const originalFetch = globalThis.fetch;
    let offline = false;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input, init) => String(input) === '/admin/v1/session' && offline
      ? Promise.reject(new TypeError('Network unavailable')) : originalFetch(input, init)));
    renderAt('/workspaces/default/keys');
    await screen.findByRole('navigation', { name: 'Product navigation' });
    offline = true;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(screen.getByRole('navigation', { name: 'Product navigation' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in', exact: true })).toBeNull();
  });
  it('revalidates a returning tab and redirects a revoked session with its destination preserved', async () => {
    mockHealth();
    const originalFetch = globalThis.fetch;
    let revoked = false;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input, init) => String(input) === '/admin/v1/session' && revoked
      ? Promise.resolve(Response.json({}, { status: 401 })) : originalFetch(input, init)));
    const router = renderAt('/workspaces/default/keys?filter=active');
    await screen.findByRole('navigation', { name: 'Product navigation' });
    revoked = true;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await screen.findByRole('button', { name: 'Sign in', exact: true });
    expect(screen.queryByRole('navigation', { name: 'Product navigation' })).toBeNull();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state?.from).toBe('/workspaces/default/keys?filter=active');
  });
  it('passes the Supplier identity to the portal through its expected route parameter', () => {
    const matches = matchRoutes(appRoutes, '/suppliers/example-supplier/models');
    expect(matches?.at(-1)?.params.supplier).toBe('example-supplier');
    expect(matches?.at(-1)?.params.section).toBe('models');
  });
  it('keeps Admin sections available while navigating Supplier detail tabs', async () => {
    mockHealth();
    const router = renderAt('/admin/suppliers/example-supplier');
    const user = userEvent.setup();
    const navigation = await screen.findByRole('navigation', { name: 'Admin navigation' });
    expect(within(navigation).getByRole('link', { name: 'Payment gateways' }).getAttribute('href')).toBe('/admin/payments');
    expect(screen.queryByRole('button', { name: 'Switch supplier' })).toBeNull();
    const tabs = await screen.findByRole('tablist', { name: 'Supplier sections' });
    await user.click(within(tabs).getByRole('tab', { name: 'API keys & routes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/suppliers/example-supplier/configuration'));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'API keys & routes' }).getAttribute('aria-selected')).toBe('true'));
    await user.click(within(navigation).getByRole('link', { name: 'Payment gateways' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/payments'));
    expect(screen.queryByRole('tablist', { name: 'Supplier sections' })).toBeNull();
  });
  it('uses the shared loading page while checking the browser session', async () => {
    mockHealth(); const originalFetch = globalThis.fetch;
    let finishSession!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input, init) => String(input) === '/admin/v1/session'
      ? new Promise<Response>(resolve => { finishSession = resolve; }) : originalFetch(input, init)));
    renderAt('/workspaces/default');
    await waitFor(() => expect(finishSession).toBeTypeOf('function'), {timeout: 10000});
    const loading = await screen.findByRole('status', {name: 'Opening Niu Dashboard'});
    expect(loading.classList.contains('route-loading')).toBe(true);
    expect(loading.querySelector('.route-loading-mark')).toBeTruthy();
    expect(screen.queryByText('Checking session…')).toBeNull();
    await act(async () => finishSession(Response.json({data:{kind:'installation',operator:null,permissions:{read:true,write:true,manage_operators:true}}})));
    expect(await screen.findByLabelText('Breadcrumb')).toBeTruthy();
    expect(screen.queryByRole('status', {name: 'Opening Niu Dashboard'})).toBeNull();
  });

  it('keeps the selected workspace when an earlier rename finishes', async () => {
    mockHealth(); const originalFetch=globalThis.fetch;
    let finishRename!: (response:Response)=>void;
    vi.stubGlobal('fetch',vi.fn<typeof fetch>((input,init)=>String(input)==='/admin/v1/organizations/org/projects/production' && init?.method==='PATCH'
      ? new Promise<Response>(resolve=>{finishRename=resolve;}) : String(input)==='/admin/v1/workspaces' ? Promise.resolve(Response.json({data:[{id:'default',name:'Default workspace',organization_id:'org',organization_name:'Demo'},{id:'production',name:'Production',organization_id:'org',organization_name:'Demo'}]})) : originalFetch(input,init)));
    const router=renderAt('/workspaces/production/settings'); const user=userEvent.setup();
    await user.clear(await screen.findByLabelText('Workspace name'));
    await user.type(screen.getByLabelText('Workspace name'),'Customer support');
    await user.click(screen.getByRole('button',{name:'Save changes',exact:true}));
    await user.click(screen.getByRole('button',{name:'Switch workspace in header',exact:true}));
    await user.click(await screen.findByRole('menuitemradio',{name:'Default workspace',exact:true}));
    await waitFor(()=>expect((screen.getByLabelText('Workspace name') as HTMLInputElement).value).toBe('Default workspace'));
    const destination=router.state.location.pathname;
    await act(async()=>finishRename(Response.json({id:'production',name:'Customer support'})));
    await waitFor(()=>expect(screen.queryByText('Workspace renamed.')).toBeNull());
    expect(router.state.location.pathname).toBe(destination);
    await user.click(screen.getByRole('button',{name:'Switch workspace in header',exact:true}));
    expect(await screen.findByRole('menuitemradio',{name:'Customer support',exact:true})).toBeTruthy();
  });
  it('drops workspace-owned key details and request filters when switching workspaces', async () => {
    mockHealth();
    const originalFetch=globalThis.fetch;
    vi.stubGlobal('fetch',vi.fn<typeof fetch>(async(input,init)=>String(input)==='/admin/v1/workspaces'
      ? Response.json({data:[{id:'default',name:'Default workspace',organization_id:'org',organization_name:'Demo'},{id:'production',name:'Production',organization_id:'org',organization_name:'Demo'}]})
      : originalFetch(input,init)));
    const router=renderAt('/workspaces/default-workspace/keys/key-fixture?keyId=key-fixture&period=month#gateway-attempt-fixture');
    const user=userEvent.setup();
    const switcher=await screen.findByRole('button',{name:'Switch workspace in header',exact:true});
    await waitFor(()=>expect(switcher.hasAttribute('disabled')).toBe(false));
    await user.click(switcher);
    await user.click(await screen.findByRole('menuitemradio',{name:'Production',exact:true}));
    await waitFor(()=>expect(router.state.location.pathname).toBe('/workspaces/production/keys'));
    expect(router.state.location.search).toBe('?period=month');
    expect(router.state.location.hash).toBe('');
  });
  it('keeps the header workspace link separate from switching workspaces', async () => {
    mockHealth();const router=renderAt('/workspaces/default/keys');
    const user=userEvent.setup();
    const breadcrumb=within(await screen.findByLabelText('Breadcrumb'));
    const name=await breadcrumb.findByRole('link',{name:'Default',exact:true});
    expect(name.getAttribute('href')).toBe('/workspaces/default');
    const switcher=breadcrumb.getByRole('button',{name:'Switch workspace in header',exact:true});
    expect(name.contains(switcher)).toBe(false);
    await user.click(switcher);
    await user.click(await screen.findByRole('menuitemradio',{name:'Production',exact:true}));
    await waitFor(()=>expect(router.state.location.pathname).toBe('/workspaces/production/keys'));
    await user.click(await within(screen.getByLabelText('Breadcrumb')).findByRole('link',{name:'Production',exact:true}));
    await waitFor(()=>expect(router.state.location.pathname).toBe('/workspaces/production'));
  });
  it('reloads customer catalog rates when changing workspaces within one organization', async () => {
    mockHealth();
    const originalFetch = globalThis.fetch;
    const scopedRequests:string[]=[];
    vi.stubGlobal('fetch',vi.fn<typeof fetch>(async (input,init) => {
      const path=String(input);
      if (path.startsWith('/admin/v1/models')) {
        const query=new URL(path,'http://localhost').searchParams;
        const project=query.get('project_id');
        if(project) scopedRequests.push(project);
        return Response.json({data:[{id:'fast',public_catalog:true,customer_pricing:project ? {currency:'USD',unit:'nanounits_per_million_tokens',prompt_rate:project==='production'?'2000000000':'1000000000',completion_rate:'0'}:null}]});
      }
      return originalFetch(input,init);
    }));
    const router=renderAt('/models?workspace=default');
    await screen.findByText('USD 1.00/M input tokens');
    await act(async()=>{await router.navigate('/models?workspace=production');});
    await screen.findByText('USD 2.00/M input tokens');
    expect(screen.queryByText('USD 1.00/M input tokens')).toBeNull();
    expect(scopedRequests).toContain('default');
    expect(scopedRequests).toContain('production');
  });

  it('keeps the workspace mounted while global Settings opens and closes', async () => {
    mockHealth();
    const router = renderAt('/workspaces/production?period=month#activity');
    await screen.findByRole('heading', {name:'Overview',level:1});
    const underlying = screen.getByRole('heading',{name:'Overview',level:1});
    await userEvent.click(screen.getByRole('button',{name:'Account menu'}));
    await userEvent.click(screen.getByRole('menuitem',{name:'Settings',exact:true}));
    const dialog = await screen.findByRole('dialog',{name:'Settings'});
    expect(underlying.isConnected).toBe(true);
    expect(router.state.location.pathname).toBe('/workspaces/production');
    expect(router.state.location.search).toBe('?period=month&settings=appearance');
    expect(router.state.location.hash).toBe('#activity');
    await userEvent.click(within(dialog).getByRole('link',{name:'About',exact:true}));
    expect(await within(dialog).findByRole('region',{name:'About Niu'})).toBeTruthy();
    expect(router.state.location.search).toBe('?period=month&settings=about');
    expect(router.state.location.hash).toBe('#activity');
    await userEvent.click(within(dialog).getByRole('button',{name:'Close',exact:true}));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(underlying.isConnected).toBe(true);
    expect(router.state.location.search).toBe('?period=month');
    expect(router.state.location.hash).toBe('#activity');
    expect(screen.getByRole('link',{name:'Workspace',exact:true}).getAttribute('href')).toBe('/workspaces/production');
  });

  it('opens direct Settings URLs as a dialog without a Settings rail entry',async()=>{
    mockHealth();renderAt('/settings/appearance');
    const dialog=await screen.findByRole('dialog',{name:'Settings'});
    expect(within(dialog).getByRole('button',{name:'Color mode'})).toBeTruthy();
    expect(screen.queryByRole('link',{name:'Settings',exact:true})).toBeNull();
    await userEvent.click(within(dialog).getByRole('link',{name:'About',exact:true}));
    expect(await within(dialog).findByRole('region',{name:'About Niu'})).toBeTruthy();
  });

  it('does not highlight Workspace when Documentation is selected', async () => {
    mockHealth(); renderAt('/help/');
    const rail = await screen.findByRole('navigation', { name: 'Product navigation' });
    expect(within(rail).getByRole('link', { name: 'Workspace', exact: true }).className).not.toContain('selected');
    expect(within(rail).getByRole('link', { name: 'Documentation', exact: true }).className).toContain('selected');
  });

  it('opens global Activity from the rail without selecting Workspace', async () => {
    mockHealth(); const router = renderAt('/activity');
    const rail = within(await screen.findByRole('navigation',{name:'Product navigation'}));
    expect(rail.getByRole('link',{name:'Activity',exact:true}).className).toContain('selected');
    expect(rail.getByRole('link',{name:'Workspace',exact:true}).className).not.toContain('selected');
    const navigation = within(await screen.findByRole('navigation',{name:'Activity navigation'}));
    expect(navigation.getByRole('link',{name:'Overview',exact:true}).getAttribute('aria-current')).toBe('page');
    await userEvent.click(navigation.getByRole('link',{name:'Logs',exact:true}));
    expect(router.state.location.pathname).toBe('/activity/logs');
    expect(navigation.getByRole('link',{name:'Logs',exact:true}).getAttribute('aria-current')).toBe('page');
  });

  it('keeps external agent observability out of product navigation', async () => {
    mockHealth(); renderAt('/workspaces/default/usage');
    const rail = await screen.findByRole('navigation', { name: 'Product navigation' });
    expect(within(rail).queryByRole('link', { name: 'Agent Observability' })).toBeNull();
    expect(within(await screen.findByRole('navigation', {name:'Main navigation'})).getByRole('link', { name: 'Activity', exact: true })).toBeTruthy();
  });

  it('applies confirmed workspace changes without a fallible second list request', async () => {
    mockHealth();
    const originalFetch = globalThis.fetch;
    let listCalls = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path === '/admin/v1/workspaces') {
        listCalls += 1;
        if (listCalls > 1) return Response.json({error:{message:'List temporarily unavailable'}}, {status:503});
      }
      if (path === '/admin/v1/organizations/org/projects/production' && init?.method === 'PATCH') {
        return Response.json({id:'production',name:JSON.parse(String(init.body)).name});
      }
      if (path === '/admin/v1/organizations/org/projects/production' && init?.method === 'DELETE') return new Response(null,{status:204});
      return originalFetch(input, init);
    }));
    const router = renderAt('/workspaces/production/settings');
    const user = userEvent.setup();
    await user.clear(await screen.findByLabelText('Workspace name'));
    await user.type(screen.getByLabelText('Workspace name'), 'Customer support');
    await user.click(screen.getByRole('button',{name:'Save changes',exact:true}));
    await screen.findByText('Workspace renamed.');
    expect(router.state.location.pathname).toBe('/workspaces/customer-support/settings');
    expect(screen.getByRole('button',{name:'Switch workspace'}).textContent).toContain('Customer support');
    expect(listCalls).toBe(1);
    await user.click(screen.getByRole('button',{name:'Delete workspace',exact:true}));
    await user.type(screen.getByLabelText('Type the workspace name to confirm'),'Customer support');
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Delete workspace',exact:true}));
    await screen.findByRole('heading',{name:'Overview',exact:true});
    expect(router.state.location.pathname).toBe('/workspaces/default');
    expect(screen.getByRole('button',{name:'Switch workspace'}).textContent).toContain('Default');
    expect(listCalls).toBe(1);
  });

  it('keeps workspace settings in workspace navigation and creates from the workspace switcher', async () => {
    mockHealth();
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === '/admin/v1/workspaces' && init?.method === 'POST') return Response.json({id:'created-fixture',name:'New workspace',organization_id:'org',organization_name:'Demo'}, {status:201});
      return originalFetch(input, init);
    }));
    const router = renderAt('/workspaces/production');
    const user = userEvent.setup();
    const nav = await screen.findByRole('navigation',{name:'Main navigation'});
    expect(within(nav).getByRole('link',{name:'Settings',exact:true}).getAttribute('href')).toBe('/workspaces/production/settings');
    await user.click(screen.getByRole('button',{name:'Switch workspace'}));
    await user.click(screen.getByRole('menuitem',{name:'Create workspace'}));
    await user.type(await screen.findByLabelText('Workspace name'),'New workspace');
    await user.click(within(screen.getByRole('dialog',{name:'Create a workspace'})).getByRole('button',{name:'Create workspace',exact:true}));
    await screen.findByRole('heading',{name:'Overview',exact:true});
    expect(router.state.location.pathname).toBe('/workspaces/new-workspace');
  });

  it('names Billing correctly and includes it in workspace navigation', async () => {
    mockHealth();
    renderAt('/workspaces/default/billing');
    expect(await screen.findByRole('heading', { name: 'Billing', exact: true })).toBeTruthy();
    expect(within(screen.getByRole('navigation',{name:'Main navigation'})).getByRole('link', { name: 'Billing', exact: true }).getAttribute('href')).toBe('/workspaces/default/billing');
    expect((await within(screen.getByLabelText('Breadcrumb')).findByRole('link', {name: 'Default', exact: true})).getAttribute('href')).toBe('/workspaces/default');
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
  });

  it('recognizes the Benchmarks route and links to integrated documentation', async () => {
    mockHealth();
    renderAt('/workspaces/default/benchmarks');
    expect(await screen.findByRole('heading', { name: 'Benchmarks', exact: true })).toBeTruthy();
    expect(document.title).toBe('Benchmarks · NIU.IO');
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
    expect((await screen.findByRole('link', { name: 'Review the matching and evidence requirements.' })).getAttribute('href')).toBe('/help/concepts/benchmarking/');
  });

  it('keeps Guardrails History under Guardrails without treating Policy as its parent', async () => {
    mockHealth();
    renderAt('/workspaces/production/guardrails/history');
    await screen.findByRole('heading', {name: 'History', exact: true});
    expect(document.title).toBe('History · NIU.IO');
    const breadcrumb = within(screen.getByLabelText('Breadcrumb'));
    await userEvent.click(breadcrumb.getByRole('button', {name: 'Show parent pages'}));
    expect(screen.getByRole('menuitem', {name: 'Guardrails', exact: true})).toBeTruthy();
    expect(screen.queryByRole('menuitem', {name: 'Policy', exact: true})).toBeNull();
  });

  it('switches workspace pages through the breadcrumb without changing workspace', async () => {
    mockHealth();
    const router = renderAt('/workspaces/production/billing');
    await screen.findByRole('heading', {name: 'Billing', exact: true});
    const breadcrumb = within(screen.getByLabelText('Breadcrumb'));
    expect((await breadcrumb.findByRole('link', {name: 'Production', exact: true})).getAttribute('href')).toBe('/workspaces/production');
    await userEvent.click(breadcrumb.getByRole('button', {name: 'Switch workspace page'}));
    expect(screen.getByRole('menuitemradio', {name: 'Billing', exact: true}).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(screen.getByRole('menuitemradio', {name: 'Activity', exact: true}));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/production/usage'));
  });

  it('preserves the current section when switching workspaces in both directions', async () => {
    mockHealth();
    const user = userEvent.setup();
    const router = renderAt('/workspaces/default/usage');
    await screen.findByRole('heading', { name: 'Activity', exact: true });
    await user.click(screen.getByRole('button', { name: 'Switch workspace', exact: true }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Production', exact: true }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/production/usage'));
    await user.click(screen.getByRole('button', { name: 'Switch workspace', exact: true }));
    expect(screen.getByRole('menuitemradio', { name: 'Production', exact: true }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('menuitemradio', { name: 'Default', exact: true }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/default/usage'));
    expect(screen.getByRole('heading', { name: 'Activity', exact: true })).toBeTruthy();
  });

  it('opens the workspace when the dashboard root is requested', async () => {
    mockHealth();
    const router = renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/workspaces/default/');
  });

  it('shows a branded recovery page for an unknown dashboard URL', async () => {
    renderAt('/not-a-dashboard-route');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open workspace' })).toBeTruthy();
    expect(screen.queryByText('Unexpected Application Error!')).toBeNull();
  });

  it('redirects legacy model details to the global catalog with workspace context', async () => {
    mockHealth();
    const router = renderAt('/workspaces/demo-workspace/models/openai/example?sort=name');

    await screen.findByLabelText('Breadcrumb');
    await waitFor(() => expect(router.state.location.pathname).toBe('/models/openai/example'));
    expect(new URLSearchParams(router.state.location.search).get('sort')).toBe('name');
    expect(new URLSearchParams(router.state.location.search).get('workspace')).toBe('demo-workspace');
    await waitFor(() => expect(within(screen.getByLabelText('Breadcrumb')).getByText('Models')).toBeTruthy());
  });

  it('blocks unavailable gateway content and recovers on retry', async () => {
    const user = userEvent.setup();
    let online = false;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({status: online ? 'ok' : 'down'}), {status: online ? 200 : 503})));
    renderAt('/workspaces/default/models', true);
    expect(await screen.findByRole('heading', {name: 'Gateway unavailable'})).toBeTruthy();
    expect(screen.queryByText('Administrator access needed')).toBeNull();
    expect(screen.queryByText(/The gateway is available/)).toBeNull();
    expect(screen.queryByRole('heading', {name: 'Models'})).toBeNull();
    online = true;
    await user.click(screen.getByRole('button', {name: 'Try again'}));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Product navigation' })).toBeNull();
  });
  it('explains a workspace API version mismatch and retries the real request', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      calls.push(path);
      if (path === '/healthz') return new Response(JSON.stringify({ status: 'ok' }));
      if (path === '/admin/v1/session') return new Response(JSON.stringify({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } }));
      if (path.startsWith('/admin/v1/models')) return new Response(JSON.stringify({ data: [] }));
      if (path === '/admin/v1/organizations') return new Response(JSON.stringify({ data: [] }));
      if (path === '/admin/v1/workspaces') return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
      throw new Error(`Unexpected request: ${path}`);
    }));
    renderAt('/workspaces/default/', true);
    await signIn(user);

    expect(await screen.findByRole('heading', { name: 'This dashboard and gateway are out of sync' })).toBeTruthy();
    expect(screen.getByText('GET /admin/v1/workspaces')).toBeTruthy();
    expect(screen.getByText('HTTP 404')).toBeTruthy();
    const callsBeforeRetry = calls.filter(path => path === '/admin/v1/workspaces').length;
    await user.click(screen.getByRole('button', { name: 'Retry workspace access' }));
    await waitFor(() => expect(calls.filter(path => path === '/admin/v1/workspaces').length).toBe(callsBeforeRetry + 1));
  });
  it('renders the workspace overview and connects the sidebar to real routes', async () => {
    mockHealth();
    const user = userEvent.setup();
    const router = renderAt('/workspaces/default/');

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Connect provider' })).toBeNull();
    expect((await screen.findByRole('link', { name: 'Connect supplier' })).getAttribute('href')).toBe('/admin/suppliers');

    expect(screen.queryByText('Requests today')).toBeNull();

    await user.click(within(screen.getByRole('navigation',{name:'Main navigation'})).getByRole('link', { name: 'Activity', exact: true }));
    expect(await screen.findByLabelText('Breadcrumb')).toBeTruthy();
    await waitFor(() => expect(within(screen.getByLabelText('Breadcrumb')).getByText('Activity')).toBeTruthy());
    expect(within(screen.getByRole('navigation',{name:'Main navigation'})).getByRole('link', { name: 'Activity' }).getAttribute('aria-current')).toBe('page');
    expect(router.state.location.pathname).toBe('/workspaces/default/usage');
  });

  it('closes the expanded workspace navigation when resizing into the compact layout', async () => {
    const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    mockHealth();
    renderAt('/workspaces/default/');

    try {
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeTruthy();
      expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
      within(screen.getByRole('navigation',{name:'Main navigation'})).getByRole('link', { name: 'Overview', exact: true }).focus();

      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
      window.dispatchEvent(new Event('resize'));

      await waitFor(() => expect(screen.getByRole('navigation', { name: 'Main navigation' }).closest('[data-slot="sidebar"]')?.getAttribute('data-collapsible')).toBe('offcanvas'));
      const toggle = screen.getByRole('button', { name: 'Expand workspace navigation' });
      expect(toggle).toBeTruthy();
      expect(document.activeElement).toBe(toggle);
    } finally {
      if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
    }
  });

  it('separates global destinations from workspace navigation', async () => {
    mockHealth();
    const user = userEvent.setup();
    const router = renderAt('/workspaces/default/');
    await screen.findByRole('heading', { name: 'Overview' });
    const rail = within(screen.getByRole('navigation', { name: 'Product navigation' }));
    const sidebar = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Switch workspace' })).toBeTruthy();
    expect(sidebar.getByRole('link', { name: 'Activity' })).toBeTruthy();
    expect(sidebar.queryByRole('link', { name: 'Agent Connect' })).toBeNull();
    expect(sidebar.queryByRole('link', { name: 'Tasks' })).toBeNull();
    expect(sidebar.queryByRole('link', { name: 'Benchmarks' })).toBeNull();
    expect(rail.queryByRole('link', { name: 'Platform settings' })).toBeNull();
    expect(rail.getByRole('link', { name: 'Workspace' }).className).toContain('selected');
    await user.click(screen.getByRole('button', { name: 'Collapse workspace navigation' }));
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Main navigation' }).closest('[data-slot="sidebar"]')?.getAttribute('data-collapsible')).toBe('offcanvas'));
    expect(rail.getByRole('link', { name: 'Workspace' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/workspaces/default/');
    await user.click(screen.getByRole('button', { name: 'Expand workspace navigation' }));
    expect(await screen.findByRole('navigation', { name: 'Main navigation' })).toBeTruthy();

    await user.click(rail.getByRole('link', { name: 'Models', exact: true }));
    expect(await screen.findByLabelText('Breadcrumb')).toBeTruthy();
    await waitFor(() => expect(within(screen.getByLabelText('Breadcrumb')).getByText('Models')).toBeTruthy());
    expect(router.state.location.pathname).toBe('/models');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /workspace navigation/ })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Model views' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Configured models' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
    expect(rail.getByRole('link', { name: 'Activity' })).toBeTruthy();
    expect(rail.getByRole('link', { name: 'Models', exact: true }).className).toContain('selected');
    expect(rail.getByRole('link', { name: 'Workspace' }).className).not.toContain('selected');

    await user.click(rail.getByRole('link', { name: 'Generations' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/generations'));
    await waitFor(() => expect(rail.getByRole('link', { name: 'Generations' }).className).toContain('selected'));
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Model views' })).toBeNull();
    await user.click(rail.getByRole('link', { name: 'Workspace' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/default'));
    expect(rail.getByRole('link', { name: 'Workspace' }).className).toContain('selected');
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Overview' })).toBeTruthy();
  });

  it('opens account actions and dismisses the menu with the keyboard', async () => {
    mockHealth();
    const user = userEvent.setup();
    renderAt('/workspaces/default/usage');
    expect(await screen.findByLabelText('Breadcrumb')).toBeTruthy();
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^Theme: / })).toBeTruthy();
    expect(screen.queryByRole('menuitemradio', { name: 'Light' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('loads a feature route directly and shows a route-specific connection state', async () => {
    mockHealth();
    renderAt('/workspaces/production/usage');

    expect(await screen.findByLabelText('Breadcrumb')).toBeTruthy();

    expect(within(screen.getByRole('navigation',{name:'Main navigation'})).getByRole('link', { name: 'Activity' }).getAttribute('aria-current')).toBe('page');
  });





  it.each(['/agent-observability', '/subscription-value', '/workspaces/default/codex-report', '/workspaces/default/tasks'])('does not expose retired agent route %s', async path => {
    mockHealth();
    const router = renderAt(path);
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(router.state.location.pathname).toBe(path);
  });

  it('keeps coding-agent setup out of the platform release routes', async () => {
    mockHealth();
    renderAt('/workspaces/default/agent-connect');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Agent Connect' })).toBeNull();
  });

  it.each(['project-2', 'default', 'missing'])('preserves deep links while resolving workspace %s', async workspaceId => {
    const calls: string[] = [];
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    let finishLoading!: (response: Response) => void;
    const workspaceResponse = new Promise<Response>(resolve => { finishLoading = resolve; });
    localStorage.setItem('niu.active-workspace', 'project-2');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      calls.push(path);
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/admin/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path.startsWith('/admin/v1/models')) return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/admin/v1/workspaces') return workspaceResponse;
      if (path.endsWith('/keys')) return json({ data: [] });
      throw new Error(`Unexpected request: ${path}`);
    }));
    const user = userEvent.setup();
    const originalPath = `/workspaces/${workspaceId}/keys`;
    const router = renderAt(`${originalPath}?tab=active#list`, true);
    await signIn(user);
    await waitFor(() => expect(calls).toContain('/admin/v1/workspaces'));
    expect(router.state.location.pathname).toBe(originalPath);
    expect(calls.filter(path => path.endsWith('/keys'))).toEqual([]);

    finishLoading(json({ data: [
      { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
      { id: 'project-2', name: 'Second project', organization_id: 'org-1', organization_name: 'Acme' },
    ] }));
    if (workspaceId === 'missing') {
      expect(await screen.findByRole('heading', { name: 'This workspace link can’t be opened' })).toBeTruthy();
      expect(router.state.location.pathname).toBe(originalPath);
      expect(calls.filter(path => path.endsWith('/keys'))).toEqual([]);
    } else {
      expect(await screen.findByRole('heading', { name: 'API keys' })).toBeTruthy();
      expect(router.state.location.pathname).toBe('/workspaces/second-project/keys');
      await waitFor(() => expect(calls.filter(path => path.endsWith('/keys'))).toContain('/admin/v1/organizations/org-1/projects/project-2/keys'));
    }
    expect(router.state.location.search).toBe('?tab=active');
    expect(router.state.location.hash).toBe('#list');
    localStorage.removeItem('niu.active-workspace');
  });

  it('keeps the current page and URL state when switching workspaces', async () => {
    const calls: string[] = [];
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      calls.push(path);
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/admin/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path.startsWith('/admin/v1/models')) return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/admin/v1/workspaces') return json({ data: [
        { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
        { id: 'project-2', name: 'Second project', organization_id: 'org-1', organization_name: 'Acme' },
      ] });
      if (path.endsWith('/keys')) return json({ data: [] });
      throw new Error(`Unexpected request: ${path}`);
    }));
    const user = userEvent.setup();
    const router = renderAt('/workspaces/project-1/keys?tab=active#list', true);
    await signIn(user);
    await screen.findByRole('heading', { name: 'API keys' });

    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Second project' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/second-project/keys'));
    expect(router.state.location.search).toBe('?tab=active');
    expect(router.state.location.hash).toBe('#list');
    expect(within(screen.getByRole('button', { name: 'Switch workspace' })).getByText('Second project')).toBeTruthy();
    expect([...new Set(calls.filter(path => path.endsWith('/keys')))]).toEqual([
      '/admin/v1/organizations/org-1/projects/project-1/keys',
      '/admin/v1/organizations/org-1/projects/project-2/keys',
    ]);
  });

  it('opens and dismisses the workspace switcher from the keyboard', async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/admin/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path.startsWith('/admin/v1/models')) return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/admin/v1/workspaces') return json({ data: [
        { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
        { id: 'project-2', name: 'Second project', organization_id: 'org-1', organization_name: 'Acme' },
      ] });
      if (path.endsWith('/keys')) return json({ data: [] });
      throw new Error(`Unexpected request: ${path}`);
    }));
    const user = userEvent.setup();
    renderAt('/workspaces/project-1/keys', true);
    await signIn(user);
    await screen.findByRole('heading', { name: 'API keys' });

    const trigger = screen.getByRole('button', { name: 'Switch workspace' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitemradio', { name: 'First project' })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: 'Second project' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitemradio', { name: 'First project' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not show a delayed key response from the workspace it just left', async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    let finishFirstKeys!: (response: Response) => void;
    let firstKeyRequestSignal: AbortSignal | null = null;
    const firstKeys = new Promise<Response>(resolve => { finishFirstKeys = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/admin/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path.startsWith('/admin/v1/models')) return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/admin/v1/workspaces') return json({ data: [
        { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
        { id: 'project-2', name: 'Second project', organization_id: 'org-1', organization_name: 'Acme' },
      ] });
      if (path === '/admin/v1/organizations/org-1/projects/project-1/keys') { firstKeyRequestSignal = init?.signal as AbortSignal; return firstKeys; }
      if (path === '/admin/v1/organizations/org-1/projects/project-2/keys') return json({ data: [
        { id: 'second-key', name: 'Second workspace key', allowed_models: ['fast'], expires_at_ms: 2_000_000_000_000, revoked: false, expired: false },
      ] });
      throw new Error(`Unexpected request: ${path}`);
    }));

    const user = userEvent.setup();
    renderAt('/workspaces/project-1/keys', true);
    await signIn(user);
    await waitFor(() => expect(firstKeyRequestSignal).not.toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Switch workspace' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Second project' }));

    expect(await screen.findByText('Second workspace key')).toBeTruthy();
    expect(firstKeyRequestSignal?.aborted).toBe(true);
    finishFirstKeys(json({ data: [
      { id: 'first-key', name: 'Stale first workspace key', allowed_models: ['fast'], expires_at_ms: 2_000_000_000_000, revoked: false, expired: false },
    ] }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByText('Stale first workspace key')).toBeNull();
    expect(screen.getByText('Second workspace key')).toBeTruthy();
  });

  it('creates a workspace from the switcher and keeps the current page', async () => {
    const calls: Array<{ path: string; method: string; body?: string }> = [];
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ path, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/admin/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path.startsWith('/admin/v1/models')) return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/admin/v1/workspaces' && method === 'GET') return json({ data: [
        { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
      ] });
      if (path === '/admin/v1/workspaces' && method === 'POST') return json({
        id: 'project-2', name: 'Research project', organization_id: 'org-1', organization_name: 'Acme',
      });
      if (path.endsWith('/keys')) return json({ data: [] });
      throw new Error(`Unexpected request: ${method} ${path}`);
    }));

    const user = userEvent.setup();
    const router = renderAt('/workspaces/project-1/keys?tab=active#list', true);
    await signIn(user);
    await screen.findByRole('heading', { name: 'API keys' });

    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    await user.click(screen.getByRole('menuitem', { name: 'Create workspace' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a workspace' });
    await user.type(within(dialog).getByLabelText('Workspace name'), 'Research project');
    await user.click(within(dialog).getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/research-project/keys'));
    expect(router.state.location.search).toBe('?tab=active');
    expect(router.state.location.hash).toBe('#list');
    await waitFor(() => expect(within(screen.getByRole('button', { name: 'Switch workspace' })).getByText('Research project')).toBeTruthy());
    expect(calls.find(call => call.path === '/admin/v1/workspaces' && call.method === 'POST')?.body).toBe(JSON.stringify({ name: 'Research project', organization_id: 'org-1' }));
    const keyRequests = calls.filter(call => call.path.endsWith('/keys')).map(call => call.path);
    expect(keyRequests).toContain('/admin/v1/organizations/org-1/projects/project-1/keys');
    expect(keyRequests.at(-1)).toBe('/admin/v1/organizations/org-1/projects/project-2/keys');
  });

  it('verifies session permissions before loading operator administration', async () => {
    const calls: Array<{ path: string; authorization?: string }> = [];
    const json = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const authorization = new Headers(init?.headers).get('authorization') ?? undefined;
      calls.push({ path, authorization });
      if (path === '/healthz') return json({ status: 'ok', model_count: 1 });
      if (path === '/admin/v1/session') return json({ data: {
        kind: 'operator',
        operator: { id: 'owner-1', role: 'owner', organization_id: 'org-1', project_id: null },
        permissions: { read: true, write: true, manage_operators: true },
      } });
      if (path.startsWith('/admin/v1/models')) return json({ data: [] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Niu Labs' }] });
      if (path === '/admin/v1/operators') return json({ data: [] });
      if (path === '/admin/v1/organizations/org-1/projects') return json({ data: [] });
      return json({ data: [] });
    }));

    const user = userEvent.setup();
    renderAt('/workspaces/default/users', true);
    await signIn(user);

    expect(await screen.findByText('No users yet')).toBeTruthy();
    expect(calls[0]).toEqual({ path: '/healthz', authorization: undefined });
    expect(calls.find(call => call.path === '/admin/v1/session')).toEqual({
      path: '/admin/v1/session',
      authorization: 'Bearer niu-browser-member-session',
    });
    expect(calls.some(call => call.path === '/admin/v1/operators')).toBe(true);
    expect(screen.queryByText('Organization owner')).toBeNull();
  });

  it('clears the operator session after the server revokes it', async () => {
    let currentSessionRevoked = false;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/healthz') return json({ status: 'ok', model_count: 1 });
      if (path === '/admin/v1/session') {
        return currentSessionRevoked
          ? json({ error: { message: 'Unauthorized' } }, 401)
          : json({ data: {
            kind: 'operator',
            operator: { id: 'owner-1', role: 'owner', organization_id: 'org-1', project_id: null },
            permissions: { read: true, write: true, manage_operators: true },
          } });
      }
      if (path.startsWith('/admin/v1/models')) return json({ data: [] });
      if (path === '/admin/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Niu Labs' }] });
      if (path === '/admin/v1/operators') return json({ data: [{
        id: 'owner-1', name: 'Current owner', role: 'owner', organization_id: 'org-1', project_id: null, revoked: false,
      }] });
      if (path === '/admin/v1/organizations/org-1/projects') return json({ data: [] });
      if (path === '/admin/v1/operators/owner-1/sessions') return json({ data: [{
        id: 'active-session', operator_id: 'owner-1', expires_at_unix: 2_000_000_000, revoked: false,
      }] });
      if (path.includes('/events?')) return currentSessionRevoked
        ? json({ error: { message: 'Unauthorized' } }, 401)
        : json({ data: [], next_cursor: null });
      if (path === '/admin/v1/operators/owner-1/sessions/active-session' && init?.method === 'DELETE') {
        currentSessionRevoked = true;
        return new Response(null, { status: 204 });
      }
      return json({ data: [] });
    }));

    const user = userEvent.setup();
    renderAt('/workspaces/default/users', true);
    await signIn(user);
    await user.click(await screen.findByRole('button', { name: 'Current owner', exact: true }));
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm revoke' }));

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Product navigation' })).toBeNull();
  });

  it('preserves customer navigation when supplier administration is denied', async () => {
    mockHealth();
    const previousFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => String(input) === '/admin/v1/session'
      ? Response.json({ data: { kind: 'operator', operator: { role: 'owner', organization_id: 'org', project_id: null }, provider_memberships: [], permissions: { read: true, write: true, manage_operators: true } } })
      : previousFetch(input, init)));
    renderAt('/admin/suppliers');
    const denied = await screen.findByRole('alert');
    expect(within(denied).getByText('Administrator access required')).toBeTruthy();
    const navigation = screen.getByRole('navigation', { name: 'Product navigation' });
    for (const name of ['Workspace', 'Generations', 'Models']) {
      expect(within(navigation).getByRole('link', { name, exact: true })).toBeTruthy();
    }
  });

  it('adds Admin without removing customer areas for a platform administrator', async () => {
    mockHealth();
    const previousFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => String(input) === '/admin/v1/session'
      ? Response.json({ data: { kind: 'operator', operator: { role: 'owner', organization_id: 'org', project_id: null }, provider_memberships: [], permissions: { read: true, write: true, manage_operators: true, platform_admin: true } } })
      : previousFetch(input, init)));
    renderAt('/admin/suppliers');
    await screen.findByRole('navigation', { name: 'Admin navigation' });
    const navigation = screen.getByRole('navigation', { name: 'Product navigation' });
    for (const name of ['Workspace', 'Generations', 'Models', 'Admin']) {
      expect(within(navigation).getByRole('link', { name, exact: true })).toBeTruthy();
    }
    expect(screen.queryByText('Administrator access required')).toBeNull();
  });

  it('names the global not-found page and offers workspace recovery', async () => {
    renderAt('/not-a-dashboard-route');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(document.title).toBe('Page not found · NIU.IO');
    expect(screen.getByRole('link', { name: 'Open workspace' }).getAttribute('href')).toBe('/workspaces/default/');
  });

  it('renders an intentional not-found view for unknown paths', async () => {
    mockHealth();
    renderAt('/workspaces/default/not-a-dashboard-route');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'Return to overview' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Switch workspace page' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitemradio', { name: 'Overview' }).getAttribute('aria-checked')).toBe('false');
  });
});
