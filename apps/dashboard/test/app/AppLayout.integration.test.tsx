import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { matchRoutes, RouterProvider } from 'react-router';
import { appRoutes, createDashboardMemoryRouter } from '../../app/routes';
// Route modules are loaded lazily; allow their initial import on busy CI workers.
configure({asyncUtilTimeout:5000});

function renderAt(path: string, requiresLogin = false) {
  const applicationFetch = globalThis.fetch;
  let signedIn = !requiresLogin;
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (String(input) === '/api/v1/auth/config') return Response.json({ password_login: true });
    if (String(input) === '/api/v1/auth/browser/login' && init?.method === 'POST') {
      signedIn = true;
      return Response.json({ session: {} });
    }
    if (String(input) === '/api/v1/session' && !signedIn) return Response.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    return applicationFetch(input, init);
  }));
  const router = createDashboardMemoryRouter([path]);
  render(<RouterProvider router={router} />);
  return router;
}

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('button', { name: 'Sign in' });
  await user.type(await screen.findByLabelText('Email'), 'demo@example.test');
  await user.type(await screen.findByLabelText('Password'), 'fixture-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

function mockHealth() {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => {
    const path = String(input);
      if (path.split('?')[0] === '/api/v1/payments/readiness') return Response.json({data:{ready:true,reason:null}});
    const data = path.split('?')[0] === '/api/v1/payments/readiness' ? {data:{ready:true,reason:null}} : path === '/healthz' ? { status: 'ok', model_count: 0 }

      : path === '/api/v1/session' ? { data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } }
      : path === '/api/v1/workspaces' ? { data: [{ id: 'default', name: 'Default', organization_id: 'org', organization_name: 'Demo' }, { id: 'production', name: 'Production', organization_id: 'org', organization_name: 'Demo' }] }
      : path === '/api/v1/platform/configuration' ? { data: {payment_gateways: []} }
      : path === '/api/v1/platform/payments/epay' ? { data: {revision:'0', enabled:false, merchant_id:'', has_key:false, endpoint:'', notify_url:'', return_url:'', methods:[]} }
      : path === '/api/v1/organizations' ? { data: [{ id: 'org', name: 'Demo' }] }
      : path.endsWith('/billing') ? { data: { balances: [], unresolved: '0', unpriced: '0', tariffs: [], invoices: [] } }
      : { data: [], summary: { request_count: 0, usage_count: 0, prompt_tokens: '0', completion_tokens: '0', failures: 0, customer_charges: [], usage_by_model: [], usage_by_key: [] } };
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  }));
}

describe('dashboard route layout', () => {
  it('clears a browser session when another tab confirms sign-out', async () => {
    mockHealth();
    const router = renderAt('/workspaces/default/keys');
    await screen.findByRole('navigation', { name: 'Main navigation' });
    await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: 'niu.auth.signout', newValue: 'confirmed-signout' })); });
    await screen.findByRole('button', { name: 'Sign in', exact: true });
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });
  it('renders Settings in the existing app shell without a nested modal sidebar', async () => {
    mockHealth();
    const router = renderAt('/settings/appearance');
    const settingsNavigation = await screen.findByRole('tablist', { name: 'Settings sections' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(settingsNavigation).getByRole('tab', { name: 'Preferences' }).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('button', { name: 'Color mode' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Appearance', level: 1 })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/settings/appearance');
  });
  it('redirects a legacy ?settings route to canonical Settings and keeps its scope', async () => {
    mockHealth();
    const router = renderAt('/workspaces/default?filter=active&settings=appearance#details');
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/appearance'));
    expect(router.state.location.search).toBe('?filter=active');
    expect(router.state.location.hash).toBe('#details');
    expect(router.state.location.state?.settingsReturnTo).toBe('/workspaces/default?filter=active#details');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Color mode' })).toBeTruthy();
  });
  it('preserves the verified identity when focus revalidation has a network failure', async () => {
    mockHealth();
    const originalFetch = globalThis.fetch;
    let offline = false;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input, init) => String(input) === '/api/v1/session' && offline
      ? Promise.reject(new TypeError('Network unavailable')) : originalFetch(input, init)));
    renderAt('/workspaces/default/keys');
    await screen.findByRole('navigation', { name: 'Main navigation' });
    offline = true;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in', exact: true })).toBeNull();
  });
  it('revalidates a returning tab and redirects a revoked session with its destination preserved', async () => {
    mockHealth();
    const originalFetch = globalThis.fetch;
    let revoked = false;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input, init) => String(input) === '/api/v1/session' && revoked
      ? Promise.resolve(Response.json({}, { status: 401 })) : originalFetch(input, init)));
    const router = renderAt('/workspaces/default/keys?filter=active');
    await screen.findByRole('navigation', { name: 'Main navigation' });
    revoked = true;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await screen.findByRole('button', { name: 'Sign in', exact: true });
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state?.from).toBe('/workspaces/default/keys?filter=active');
  });
  it('passes the Provider identity to the portal through its expected route parameter', () => {
    const matches = matchRoutes(appRoutes, '/providers/example-provider/models');
    expect(matches?.at(-1)?.params.provider).toBe('example-provider');
    expect(matches?.at(-1)?.params.section).toBe('models');
  });
  it('canonicalizes a Provider UUID bookmark and keeps slug URLs while requesting its API by ID', async () => {
    mockHealth();
    const originalFetch = globalThis.fetch;
    const id = '00000000-0000-4000-8000-000000000111';
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.split('?')[0] === '/api/v1/payments/readiness') return Response.json({data:{ready:true,reason:null}}); calls.push(path);
      if (path === '/api/v1/providers') return Response.json({data:[{id,slug:'example-provider',name:'Example Provider',members:0}]});
      if (path === `/api/v1/providers/${id}`) return Response.json({data:{id,slug:'example-provider',name:'Example Provider',description:'',website_url:'',logo_url:'',revision:1}});
      return originalFetch(input,init);
    }));
    const router = renderAt(`/admin/providers/${id}/settings?view=general#profile`);
    await screen.findByLabelText('Name', {exact:true});
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/providers/example-provider/settings'));
    expect(router.state.location.search).toBe('?view=general');
    expect(router.state.location.hash).toBe('#profile');
    expect(calls).toContain(`/api/v1/providers/${id}`);
    expect(calls).not.toContain('/api/v1/providers/example-provider');
  });
  it('keeps Admin sections available while navigating Provider detail tabs', async () => {
    mockHealth();
    const router = renderAt('/admin/providers/example-supplier');
    const user = userEvent.setup();
    const navigation = await screen.findByRole('navigation', { name: 'Admin navigation' }, { timeout: 10000 });
    expect(within(navigation).getByRole('link', { name: 'Payment gateways' })).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'Admin sections' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Switch provider' })).toBeNull();
    const breadcrumb = within(await screen.findByLabelText('Breadcrumb'));
    expect(breadcrumb.queryByText('Admin')).toBeNull();
    expect(breadcrumb.getByRole('link', {name:'Providers'}).getAttribute('href')).toBe('/admin/providers');
    const tabs = await screen.findByRole('tablist', { name: 'Provider sections' });
    await user.click(within(tabs).getByRole('tab', { name: 'API keys' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/providers/example-supplier/keys'));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'API keys' }).getAttribute('aria-selected')).toBe('true'));
    await user.click(within(navigation).getByRole('link', { name: 'Payment gateways' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/payments'));
    await waitFor(() => expect(screen.queryByRole('tablist', { name: 'Provider sections' })).toBeNull());
    expect(within(screen.getByLabelText('Breadcrumb')).queryByText('Admin')).toBeNull();
    expect(within(screen.getByLabelText('Breadcrumb')).getByRole('heading', {name:'Payment gateways'})).toBeTruthy();
  });
  it('uses the shared loading page while checking the browser session and redirecting to sign in', async () => {
    mockHealth(); const originalFetch = globalThis.fetch;
    let finishSession!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input, init) => String(input) === '/api/v1/session'
      ? new Promise<Response>(resolve => { finishSession = resolve; }) : originalFetch(input, init)));
    renderAt('/workspaces/default');
    await waitFor(() => expect(finishSession).toBeTypeOf('function'), {timeout: 10000});
    const loading = await screen.findByRole('status', {name: 'Opening Niu Dashboard'});
    expect(loading.classList.contains('route-loading')).toBe(true);
    expect(loading.querySelector('.route-loading-mark')).toBeTruthy();
    expect(screen.queryByText('Checking session…')).toBeNull();
    expect(screen.queryByText('Redirecting to sign in…')).toBeNull();
    expect(screen.queryByText('正在跳转到登录页…')).toBeNull();
    await act(async () => finishSession(Response.json({data:{kind:'installation',operator:null,permissions:{read:true,write:true,manage_operators:true}}})));
    expect(await screen.findByLabelText('Breadcrumb')).toBeTruthy();
    expect(screen.queryByRole('status', {name: 'Opening Niu Dashboard'})).toBeNull();
  });

  it('keeps the selected workspace when an earlier rename finishes', async () => {
    mockHealth(); const originalFetch=globalThis.fetch;
    let finishRename!: (response:Response)=>void;
    vi.stubGlobal('fetch',vi.fn<typeof fetch>((input,init)=>String(input)==='/api/v1/organizations/org/projects/production' && init?.method==='PATCH'
      ? new Promise<Response>(resolve=>{finishRename=resolve;}) : String(input)==='/api/v1/workspaces' ? Promise.resolve(Response.json({data:[{id:'default',name:'Default',organization_id:'org',organization_name:'Demo'},{id:'production',name:'Production',organization_id:'org',organization_name:'Demo'}]})) : originalFetch(input,init)));
    const router=renderAt('/workspaces/production/settings'); const user=userEvent.setup();
    await user.clear(await screen.findByLabelText('Workspace name'));
    await user.type(screen.getByLabelText('Workspace name'),'Customer support');
    await user.click(screen.getByRole('button',{name:'Save changes',exact:true}));
    await user.click(screen.getByRole('button',{name:'Switch workspace in header',exact:true}));
    await user.click(await screen.findByRole('menuitemradio',{name:'Default',exact:true}));
    await waitFor(()=>expect((screen.getByLabelText('Workspace name') as HTMLInputElement).value).toBe('Default'));
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
    vi.stubGlobal('fetch',vi.fn<typeof fetch>(async(input,init)=>String(input)==='/api/v1/workspaces'
      ? Response.json({data:[{id:'default',name:'Default',organization_id:'org',organization_name:'Demo'},{id:'production',name:'Production',organization_id:'org',organization_name:'Demo'}]})
      : originalFetch(input,init)));
    const router=renderAt('/workspaces/default/keys/key-fixture?keyId=key-fixture&period=month#gateway-attempt-fixture');
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
      if (path.startsWith('/api/v1/models')) {
        const query=new URL(path,'http://localhost').searchParams;
        const project=query.get('project_id');
        if(project) scopedRequests.push(project);
        return Response.json({data:[{id:'fast',public_catalog:true,customer_pricing:project ? {currency:'USD',unit:'nanounits_per_million_tokens',prompt_rate:project==='production'?'2000000000':'1000000000',completion_rate:'0'}:null}]});
      }
      return originalFetch(input,init);
    }));
    const router=renderAt('/workspaces/default/models');
    await screen.findByText('$1.00/M input tokens');
    await act(async()=>{await router.navigate('/workspaces/production/models');});
    await screen.findByText('$2.00/M input tokens');
    expect(screen.queryByText('$1.00/M input tokens')).toBeNull();
    expect(scopedRequests).toContain('default');
    expect(scopedRequests).toContain('production');
  });

  it('navigates from a workspace to global Settings in the app shell', async () => {
    mockHealth();
    const router = renderAt('/workspaces/production?period=month#activity');
    await screen.findByRole('heading', {name:'Overview',level:1});
    await userEvent.click(screen.getByRole('button',{name:'Account menu'}));
    await userEvent.click(screen.getByRole('menuitem',{name:'Settings',exact:true}));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/appearance'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('tablist',{name:'Settings sections'})).toBeTruthy();
    expect(router.state.location.state?.settingsReturnTo).toBe('/workspaces/production?period=month#activity');
    await userEvent.click(screen.getByRole('link',{name:'About Niu',exact:true}));
    expect(await screen.findByRole('region',{name:'About Niu'})).toBeTruthy();
    expect(router.state.location.pathname).toBe('/settings/about');
    expect(screen.getByRole('link',{name:'Overview',exact:true}).getAttribute('href')).toBe('/workspaces/production');
  });

  it('opens direct Settings URLs in the app shell without a Settings rail entry',async()=>{
    mockHealth();const router=renderAt('/settings/appearance');
    const settingsNavigation=await screen.findByRole('tablist',{name:'Settings sections'});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(settingsNavigation).getByRole('tab',{name:'Preferences'}).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button',{name:'Color mode'})).toBeTruthy();
    expect(within(settingsNavigation).queryByRole('tab',{name:'Settings',exact:true})).toBeNull();
    await userEvent.click(screen.getByRole('link',{name:'About Niu',exact:true}));
    expect(await screen.findByRole('region',{name:'About Niu'})).toBeTruthy();
    expect(router.state.location.pathname).toBe('/settings/about');
  });

  it('uses the current Assets title after navigating from API keys', async () => {
    mockHealth(); const router = renderAt('/workspaces/default/keys');
    await screen.findByRole('heading', { name: 'API keys', level: 1 });
    await router.navigate('/workspaces/default/assets');
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/default/assets'));
    expect(await screen.findByRole('heading', { name: 'Assets', level: 1 })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'API keys', level: 1 })).toBeNull();
  });

  it('links to standalone Docs in a new tab without selecting a dashboard route', async () => {
    mockHealth(); renderAt('/workspaces/default');
    const docs = await screen.findByRole('link', { name: 'Docs (opens in a new tab)' });
    expect(docs.getAttribute('href')).toBe('/docs/');
    expect(docs.getAttribute('target')).toBe('_blank');
    expect(docs.getAttribute('rel')).toBe('noopener');
    expect(docs.getAttribute('data-active')).toBe('false');
  });


  it('opens global Activity sections without selecting workspace Overview', async () => {
    mockHealth(); const router = renderAt('/activity');
    const nav = within(await screen.findByRole('navigation', { name: 'Main navigation' }));
    expect(nav.getByRole('link', { name: 'Overview', exact: true }).getAttribute('data-active')).toBe('false');
    const tabs = within(await screen.findByRole('tablist', { name: 'Activity sections' }));
    await userEvent.click(tabs.getByRole('tab', { name: 'Logs' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/activity/logs'));
  });


  it('keeps external agent observability out of product navigation', async () => {
    mockHealth(); renderAt('/workspaces/default/usage');
    const rail = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(within(rail).queryByRole('link', { name: 'Agent Observability' })).toBeNull();
    expect(within(await screen.findByRole('navigation', {name:'Main navigation'})).getByRole('link', { name: 'Overview', exact: true })).toBeTruthy();
  });

  it('applies confirmed workspace changes without a fallible second list request', async () => {
    mockHealth();
    const originalFetch = globalThis.fetch;
    let listCalls = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.split('?')[0] === '/api/v1/payments/readiness') return Response.json({data:{ready:true,reason:null}});
      if (path === '/api/v1/workspaces') {
        listCalls += 1;
        if (listCalls > 1) return Response.json({error:{message:'List temporarily unavailable'}}, {status:503});
      }
      if (path === '/api/v1/organizations/org/projects/production' && init?.method === 'PATCH') {
        return Response.json({id:'production',name:JSON.parse(String(init.body)).name});
      }
      if (path === '/api/v1/organizations/org/projects/production' && init?.method === 'DELETE') return new Response(null,{status:204});
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

  it('keeps deferred features out of primary navigation and preserves the Routing deep link', async () => {
    mockHealth();
    const router = renderAt('/workspaces/default/routing');
    const nav = within(await screen.findByRole('navigation', { name: 'Main navigation' }));
    expect(nav.queryByRole('link', { name: 'Routing', exact: true })).toBeNull();
    expect(nav.queryByRole('link', { name: 'Evaluations', exact: true })).toBeNull();
    expect(nav.getByRole('link', { name: 'Usage', exact: true })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/workspaces/default/routing');
  });


  it('keeps workspace settings in workspace navigation and creates from the workspace switcher', async () => {
    mockHealth();
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === '/api/v1/workspaces' && init?.method === 'POST') return Response.json({id:'created-fixture',name:'New workspace',organization_id:'org',organization_name:'Demo'}, {status:201});
      return originalFetch(input, init);
    }));
    const router = renderAt('/workspaces/production');
    const user = userEvent.setup();
    const nav = await screen.findByRole('navigation',{name:'Main navigation'});
    expect(within(nav).getByRole('link',{name:'Settings',exact:true}).getAttribute('href')).toBe('/workspaces/production/settings');
    await user.click(screen.getByRole('button',{name:'Switch workspace'}));
    await user.click(screen.getByRole('menuitem',{name:'Create workspace'}));
    await user.type(await screen.findByLabelText('Workspace name'),'New workspace');
    await user.click(within(screen.getByRole('dialog',{name:'Create workspace'})).getByRole('button',{name:'Create workspace',exact:true}));
    await screen.findByRole('heading',{name:'Overview',exact:true});
    expect(router.state.location.pathname).toBe('/workspaces/new-workspace');
  });

  it('names Billing correctly and includes it in workspace navigation', async () => {
    mockHealth();
    renderAt('/workspaces/default/billing');
    expect(await screen.findByRole('heading', { name: 'Billing', exact: true })).toBeTruthy();
    expect(within(screen.getByRole('navigation',{name:'Main navigation'})).getByRole('link', { name: 'Settings', exact: true }).getAttribute('href')).toBe('/workspaces/default/settings');
    expect((await within(screen.getByLabelText('Breadcrumb')).findByRole('link', {name: 'Default', exact: true})).getAttribute('href')).toBe('/workspaces/default');
    expect(screen.queryByRole('heading', { name: 'Not Found' })).toBeNull();
  });


  it('keeps Guardrails tabs on one workspace page without section breadcrumbs', async () => {
    mockHealth();
    const router = renderAt('/workspaces/production/guardrails?tab=history');
    await screen.findByRole('tab', {name: 'History', exact: true});
    expect(router.state.location.pathname).toBe('/workspaces/production/guardrails');
    expect(document.title).toBe('Guardrails · Niu');
    const breadcrumb = within(screen.getByLabelText('Breadcrumb'));
    expect((await breadcrumb.findByRole('link', {name: 'Production', exact: true})).getAttribute('href')).toBe('/workspaces/production');
    expect(breadcrumb.queryByRole('button', {name: 'Show parent pages'})).toBeNull();
  });

  it('redirects legacy Guardrails section URLs to the canonical tab and anchor', async () => {
    mockHealth();
    const router = renderAt('/workspaces/production/guardrails/policy#input');
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/production/guardrails'));
    expect(router.state.location.search).toBe('?tab=policy');
    expect(router.state.location.hash).toBe('#input');
    await screen.findByRole('tab', {name: /^Policy/});
  });

  it('resolves the canonical Guardrails page and the legacy redirect route separately', () => {
    expect(matchRoutes(appRoutes, '/workspaces/acme/guardrails')?.at(-1)?.route.id).toBe('workspace-guardrails');
    expect(matchRoutes(appRoutes, '/workspaces/acme/guardrails/policy')?.at(-1)?.route.id).toBe('workspace-guardrails-legacy');
    expect(matchRoutes(appRoutes, '/workspaces/acme/guardrails/history')?.at(-1)?.route.id).toBe('workspace-guardrails-legacy');
  });

  it('renders the current page title as plain text without a duplicate page switcher', async () => {
    mockHealth();
    renderAt('/workspaces/production/settings');
    const heading = await screen.findByRole('heading', {name: 'Settings', exact: true});
    expect(heading.closest('button')).toBeNull();
    expect(screen.queryByRole('button', {name: 'Switch workspace page'})).toBeNull();
    const breadcrumb = within(screen.getByLabelText('Breadcrumb'));
    expect((await breadcrumb.findByRole('link', {name: 'Production', exact: true})).getAttribute('href')).toBe('/workspaces/production');
  });

  it('preserves the current section when switching workspaces in both directions', async () => {
    mockHealth();
    const user = userEvent.setup();
    const router = renderAt('/workspaces/default/usage');
    await screen.findByRole('heading', { name: 'Usage', exact: true });
    await user.click(screen.getByRole('button', { name: 'Switch workspace', exact: true }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Production', exact: true }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/production/usage'));
    await user.click(screen.getByRole('button', { name: 'Switch workspace', exact: true }));
    expect(screen.getByRole('menuitemradio', { name: 'Production', exact: true }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('menuitemradio', { name: 'Default', exact: true }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/default/usage'));
    expect(screen.getByRole('heading', { name: 'Usage', exact: true })).toBeTruthy();
  });

  it('opens the workspace when the dashboard root is requested', async () => {
    mockHealth();
    const router = renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/workspaces/default/');
  });

  it('shows a branded recovery page for an unknown dashboard URL', async () => {
    renderAt('/not-a-dashboard-route');

    expect(await screen.findByRole('heading', { name: 'Not Found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open workspace' })).toBeTruthy();
    expect(screen.queryByText('Unexpected Application Error!')).toBeNull();
  });

  it('redirects legacy /models details to the canonical workspace model route', async () => {
    mockHealth();
    const router = renderAt('/models/openai/example?workspace=demo-workspace&sort=name');

    await screen.findByLabelText('Breadcrumb');
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/demo-workspace/models/openai/example'));
    expect(new URLSearchParams(router.state.location.search).get('sort')).toBe('name');
    expect(new URLSearchParams(router.state.location.search).get('workspace')).toBeNull();
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
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });
  it('explains a workspace API version mismatch and retries the real request', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.split('?')[0] === '/api/v1/payments/readiness') return Response.json({data:{ready:true,reason:null}});
      calls.push(path);
      if (path === '/healthz') return new Response(JSON.stringify({ status: 'ok' }));
      if (path === '/api/v1/session') return new Response(JSON.stringify({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } }));
      if (path.startsWith('/api/v1/models')) return new Response(JSON.stringify({ data: [] }));
      if (path === '/api/v1/organizations') return new Response(JSON.stringify({ data: [] }));
      if (path === '/api/v1/workspaces') return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
      throw new Error(`Unexpected request: ${path}`);
    }));
    renderAt('/workspaces/default/', true);
    await signIn(user);

    expect(await screen.findByRole('heading', { name: 'This dashboard and gateway are out of sync' })).toBeTruthy();
    expect(screen.getByText('GET /api/v1/workspaces')).toBeTruthy();
    expect(screen.getByText('HTTP 404')).toBeTruthy();
    const callsBeforeRetry = calls.filter(path => path === '/api/v1/workspaces').length;
    await user.click(screen.getByRole('button', { name: 'Retry workspace access' }));
    await waitFor(() => expect(calls.filter(path => path === '/api/v1/workspaces').length).toBe(callsBeforeRetry + 1));
  });
  it('renders the workspace overview and connects the sidebar to real routes', async () => {
    mockHealth();
    const user = userEvent.setup();
    const router = renderAt('/workspaces/default/');

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeTruthy();
    expect((await screen.findByRole('link', { name: 'Connect provider' })).getAttribute('href')).toBe('/admin/providers');

    expect(screen.queryByText('Requests today')).toBeNull();

    await user.click(within(screen.getByRole('navigation',{name:'Main navigation'})).getByRole('link', { name: 'Logs', exact: true }));
    expect(await screen.findByLabelText('Breadcrumb')).toBeTruthy();
    await waitFor(() => expect(within(screen.getByLabelText('Breadcrumb')).getByText('Logs')).toBeTruthy());
    expect(within(screen.getByRole('navigation',{name:'Main navigation'})).getByRole('link', { name: 'Logs' }).getAttribute('aria-current')).toBe('page');
    expect(router.state.location.pathname).toBe('/workspaces/default/executions');
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

      await waitFor(() => expect(screen.getByRole('navigation', { name: 'Main navigation' }).closest('[data-slot="sidebar"]')?.getAttribute('data-collapsible')).toBe('icon'));
      const toggle = screen.getByRole('button', { name: 'Expand workspace navigation' });
      expect(toggle).toBeTruthy();
      expect(document.activeElement).toBe(toggle);
    } finally {
      if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
    }
  });

  it('keeps the primary sidebar when opening Models and collapsing navigation', async () => {
    mockHealth();
    const user = userEvent.setup();
    const router = renderAt('/workspaces/default/');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    await user.click(screen.getByRole('button', { name: 'Collapse workspace navigation' }));
    expect(nav.closest('[data-slot="sidebar"]')?.getAttribute('data-collapsible')).toBe('icon');
    await user.click(within(nav).getByRole('link', { name: 'Models', exact: true }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/default/models'));
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Models' }).getAttribute('data-active')).toBe('true'));
    const sidebarFooter = document.querySelector('[data-slot="sidebar-footer"]');
    expect(sidebarFooter).toBeTruthy();
    await user.click(within(sidebarFooter as HTMLElement).getByRole('button', { name: 'Connect your agent', exact: true }));
    expect(await screen.findByRole('dialog', { name: 'Connect your agent' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Connect your agent' })).toBeNull());
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
    renderAt('/workspaces/production/executions');

    expect(await screen.findByLabelText('Breadcrumb')).toBeTruthy();

    expect(within(screen.getByRole('navigation',{name:'Main navigation'})).getByRole('link', { name: 'Logs' }).getAttribute('aria-current')).toBe('page');
  });





  it.each(['/agent-observability', '/subscription-value', '/workspaces/default/codex-report', '/workspaces/default/tasks', '/workspaces/default/benchmarks'])('does not expose retired agent route %s', async path => {
    mockHealth();
    const router = renderAt(path);
    expect(await screen.findByRole('heading', { name: path.startsWith('/workspaces/') ? 'Page not found' : 'Not Found' })).toBeTruthy();
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
      if (path.split('?')[0] === '/api/v1/payments/readiness') return Response.json({data:{ready:true,reason:null}});
      calls.push(path);
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/api/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path.startsWith('/api/v1/models')) return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/api/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/api/v1/workspaces') return workspaceResponse;
      if (path.split('?')[0].endsWith('/keys')) return json({ data: [] });
      throw new Error(`Unexpected request: ${path}`);
    }));
    const user = userEvent.setup();
    const originalPath = `/workspaces/${workspaceId}/keys`;
    const router = renderAt(`${originalPath}?tab=active#list`, true);
    await signIn(user);
    await waitFor(() => expect(calls).toContain('/api/v1/workspaces'));
    expect(router.state.location.pathname).toBe(originalPath);
    expect(calls.filter(path => path.split('?')[0].endsWith('/keys'))).toEqual([]);

    finishLoading(json({ data: [
      { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
      { id: 'project-2', name: 'Second project', organization_id: 'org-1', organization_name: 'Acme' },
    ] }));
    if (workspaceId === 'missing') {
      expect(await screen.findByRole('heading', { name: 'This workspace link can’t be opened' })).toBeTruthy();
      expect(router.state.location.pathname).toBe(originalPath);
      expect(calls.filter(path => path.split('?')[0].endsWith('/keys'))).toEqual([]);
    } else {
      expect(await screen.findByRole('heading', { name: 'API keys' })).toBeTruthy();
      expect(router.state.location.pathname).toBe('/workspaces/second-project/keys');
      await waitFor(() => expect(calls.filter(path => path.split('?')[0].endsWith('/keys'))).toContain('/api/v1/workspaces/project-2/keys?limit=50'));
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
      if (path.split('?')[0] === '/api/v1/payments/readiness') return Response.json({data:{ready:true,reason:null}});
      calls.push(path);
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/api/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path.startsWith('/api/v1/models')) return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/api/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/api/v1/workspaces') return json({ data: [
        { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
        { id: 'project-2', name: 'Second project', organization_id: 'org-1', organization_name: 'Acme' },
      ] });
      if (path.split('?')[0].endsWith('/keys')) return json({ data: [] });
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
    await waitFor(() => expect(within(screen.getByRole('button', { name: 'Switch workspace' })).getByText('Second project')).toBeTruthy());
    expect([...new Set(calls.filter(path => path.split('?')[0].endsWith('/keys')))]).toEqual([
      '/api/v1/workspaces/project-1/keys?limit=50',
      '/api/v1/workspaces/project-2/keys?limit=50',
    ]);
  });

  it('opens and dismisses the workspace switcher from the keyboard', async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.split('?')[0] === '/api/v1/payments/readiness') return Response.json({data:{ready:true,reason:null}});
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/api/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path.startsWith('/api/v1/models')) return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/api/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/api/v1/workspaces') return json({ data: [
        { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
        { id: 'project-2', name: 'Second project', organization_id: 'org-1', organization_name: 'Acme' },
      ] });
      if (path.split('?')[0].endsWith('/keys')) return json({ data: [] });
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
      if (path.split('?')[0] === '/api/v1/payments/readiness') return Response.json({data:{ready:true,reason:null}});
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/api/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path.startsWith('/api/v1/models')) return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/api/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/api/v1/workspaces') return json({ data: [
        { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
        { id: 'project-2', name: 'Second project', organization_id: 'org-1', organization_name: 'Acme' },
      ] });
      if (path.split('?')[0] === '/api/v1/workspaces/project-1/keys') { firstKeyRequestSignal = init?.signal as AbortSignal; return firstKeys; }
      if (path.split('?')[0] === '/api/v1/workspaces/project-2/keys') return json({ data: [
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
      if (path.split('?')[0] === '/api/v1/payments/readiness') return Response.json({data:{ready:true,reason:null}});
      const method = init?.method ?? 'GET';
      calls.push({ path, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (path === '/healthz') return json({ status: 'ok' });
      if (path === '/api/v1/session') return json({ data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } });
      if (path.startsWith('/api/v1/models')) return json({ data: [{ id: 'fast', public_catalog: false }] });
      if (path === '/api/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Acme' }] });
      if (path === '/api/v1/workspaces' && method === 'GET') return json({ data: [
        { id: 'project-1', name: 'First project', organization_id: 'org-1', organization_name: 'Acme' },
      ] });
      if (path === '/api/v1/workspaces' && method === 'POST') return json({
        id: 'project-2', name: 'Research project', organization_id: 'org-1', organization_name: 'Acme',
      });
      if (path.split('?')[0].endsWith('/keys')) return json({ data: [] });
      throw new Error(`Unexpected request: ${method} ${path}`);
    }));

    const user = userEvent.setup();
    const router = renderAt('/workspaces/project-1/keys?tab=active#list', true);
    await signIn(user);
    await screen.findByRole('heading', { name: 'API keys' });

    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    await user.click(screen.getByRole('menuitem', { name: 'Create workspace' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create workspace' });
    await user.type(within(dialog).getByLabelText('Workspace name'), 'Research project');
    await user.click(within(dialog).getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/research-project/keys'));
    expect(router.state.location.search).toBe('?tab=active');
    expect(router.state.location.hash).toBe('#list');
    await waitFor(() => expect(within(screen.getByRole('button', { name: 'Switch workspace' })).getByText('Research project')).toBeTruthy());
    expect(calls.find(call => call.path === '/api/v1/workspaces' && call.method === 'POST')?.body).toBe(JSON.stringify({ name: 'Research project', slug: 'research-project', organization_id: 'org-1' }));
    const keyRequests = calls.filter(call => call.path.split('?')[0].endsWith('/keys')).map(call => call.path);
    expect(keyRequests).toContain('/api/v1/workspaces/project-1/keys?limit=50');
    expect(keyRequests.at(-1)).toBe('/api/v1/workspaces/project-2/keys?limit=50');
  });

  it('verifies session permissions before loading operator administration', async () => {
    const calls: Array<{ path: string; authorization?: string }> = [];
    const json = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.split('?')[0] === '/api/v1/payments/readiness') return Response.json({data:{ready:true,reason:null}});
      const authorization = new Headers(init?.headers).get('authorization') ?? undefined;
      calls.push({ path, authorization });
      if (path === '/healthz') return json({ status: 'ok', model_count: 1 });
      if (path === '/api/v1/session') return json({ data: {
        kind: 'operator',
        operator: { id: 'owner-1', role: 'owner', organization_id: 'org-1', project_id: null },
        permissions: { read: true, write: true, manage_operators: true },
      } });
      if (path.startsWith('/api/v1/models')) return json({ data: [] });
      if (path === '/api/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Niu Labs' }] });
      if (path === '/api/v1/workspaces') return json({ data: [{ id: 'default', name: 'Default', organization_id: 'org-1', organization_name: 'Niu Labs' }] });
      if (path.split('?')[0] === '/api/v1/operators') return json({ data: [] });
      if (path === '/api/v1/organizations/org-1/projects') return json({ data: [] });
      return json({ data: [] });
    }));

    const user = userEvent.setup();
    renderAt('/workspaces/default/users', true);
    await signIn(user);

    expect(await screen.findByText('No members yet')).toBeTruthy();
    expect(calls.find(call=>call.path === '/healthz')).toEqual({ path: '/healthz', authorization: undefined });
    expect(calls.find(call => call.path === '/api/v1/session')).toEqual({
      path: '/api/v1/session',
      authorization: 'Bearer niu-browser-member-session',
    });
    expect(calls.some(call => call.path.split('?')[0] === '/api/v1/operators')).toBe(true);
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
      if (path.split('?')[0] === '/api/v1/payments/readiness') return Response.json({data:{ready:true,reason:null}});
      if (path === '/healthz') return json({ status: 'ok', model_count: 1 });
      if (path === '/api/v1/session') {
        return currentSessionRevoked
          ? json({ error: { message: 'Unauthorized' } }, 401)
          : json({ data: {
            kind: 'operator',
            operator: { id: 'owner-1', role: 'owner', organization_id: 'org-1', project_id: null },
            permissions: { read: true, write: true, manage_operators: true },
          } });
      }
      if (path.startsWith('/api/v1/models')) return json({ data: [] });
      if (path === '/api/v1/organizations') return json({ data: [{ id: 'org-1', name: 'Niu Labs' }] });
      if (path === '/api/v1/workspaces') return json({ data: [{ id: 'default', name: 'Default', organization_id: 'org-1', organization_name: 'Niu Labs' }] });
      if (path.split('?')[0] === '/api/v1/operators') return json({ data: [{
        id: 'owner-1', name: 'Current owner', role: 'owner', organization_id: 'org-1', project_id: null, revoked: false,
      }] });
      if (path === '/api/v1/organizations/org-1/projects') return json({ data: [] });
      if (path === '/api/v1/operators/owner-1/sessions') return json({ data: [{
        id: 'active-session', operator_id: 'owner-1', expires_at_unix: 2_000_000_000, revoked: false,
      }] });
      if (path.includes('/events?')) return currentSessionRevoked
        ? json({ error: { message: 'Unauthorized' } }, 401)
        : json({ data: [], next_cursor: null });
      if (path === '/api/v1/operators/owner-1/sessions/active-session' && init?.method === 'DELETE') {
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
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });

  it('preserves customer navigation when provider administration is denied', async () => {
    mockHealth();
    const previousFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => String(input) === '/api/v1/session'
      ? Response.json({ data: { kind: 'operator', operator: { role: 'owner', organization_id: 'org', project_id: null }, provider_memberships: [], permissions: { read: true, write: true, manage_operators: true } } })
      : previousFetch(input, init)));
    renderAt('/admin/providers');
    const denied = await screen.findByRole('alert');
    expect(within(denied).getByText('Administrator access required')).toBeTruthy();
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
    for (const name of ['Overview', 'Generations', 'Models']) {
      expect(within(navigation).getByRole('link', { name, exact: true })).toBeTruthy();
    }
  });

  it('denies the legacy Provider portal even when historical memberships remain', async () => {
    mockHealth();
    const previousFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input, init) => String(input) === '/api/v1/session'
      ? Promise.resolve(Response.json({data:{kind:'operator',operator:{id:'member',role:'owner',organization_id:'org',project_id:null},permissions:{read:true,write:true,manage_operators:true,platform_admin:false},provider_memberships:[{id:'legacy',slug:'legacy',name:'Legacy business',role:'manager'}]}}))
      : previousFetch(input,init)));
    const router = renderAt('/providers/legacy/models');
    await screen.findByText('Administrator access required');
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/providers/legacy/models'));
    expect(screen.queryByRole('tablist',{name:'Provider sections'})).toBeNull();
    expect(screen.queryByRole('link',{name:'Providers',exact:true})).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).startsWith('/api/v1/providers'))).toBe(false);
  });

  it('switches assigned account roles and returns to the workspace on User selection', async () => {
    mockHealth();
    const previousFetch = globalThis.fetch;
    let enabled = false;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path === '/api/v1/session/role') enabled = JSON.parse(String(init?.body)).role === 'admin';
      if (path === '/api/v1/session' || path === '/api/v1/session/role') return Response.json({data:{
        kind:'operator', operator:{id:'member',role:'owner',organization_id:'org',project_id:null},
        roles:{available:['user','admin'],active:enabled?'admin':'user',switchable:true}, provider_memberships:[],
        permissions:{read:true,write:true,manage_operators:true,platform_admin:enabled},
      }});
      return previousFetch(input,init);
    }));
    const router = renderAt('/workspaces/default');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button',{name:'Account menu'}));
    await user.click(await screen.findByRole('menuitemradio',{name:'Platform administrator'}));
    await screen.findByRole('link',{name:'Admin'});
    expect(router.state.location.pathname).toBe('/workspaces/default');
    await user.click(screen.getByRole('button',{name:'Account menu'}));
    await user.click(await screen.findByRole('menuitemradio',{name:'User',exact:true}));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/workspaces\//));
    expect(screen.queryByRole('navigation',{name:'Admin navigation'})).toBeNull();
  });

  it('switches to explicit Platform admin scope and returns to customer areas for a platform administrator', async () => {
    mockHealth();
    const previousFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => String(input) === '/api/v1/session'
      ? Response.json({ data: { kind: 'operator', operator: { role: 'owner', organization_id: 'org', project_id: null }, provider_memberships: [], permissions: { read: true, write: true, manage_operators: true, platform_admin: true } } })
      : previousFetch(input, init)));
    const router = renderAt('/admin/providers');
    const adminNav = await screen.findByRole('navigation', { name: 'Admin navigation' });
    expect(within(adminNav).getByRole('link', { name: 'Providers', exact: true }).getAttribute('data-active')).toBe('true');
    expect(within(adminNav).getByRole('link', { name: 'Settings', exact: true }).getAttribute('href')).toBe('/admin/settings');
    expect(screen.queryByRole('tablist', { name: 'Admin sections' })).toBeNull();
    expect(screen.queryByText('Administrator access required')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connect your agent', exact: true })).toBeNull();
    const backLink = screen.getByRole('link', { name: 'Back to workspace', exact: true });
    await userEvent.click(backLink);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/workspaces\//));
    const navigation = await screen.findByRole('navigation', { name: 'Main navigation' });
    const navLinks = within(navigation).getAllByRole('link');
    expect(navLinks[0]?.getAttribute('aria-label')).toBe('Overview');
    for (const name of ['Overview', 'Generations', 'Models']) {
      expect(within(navigation).getByRole('link', { name, exact: true })).toBeTruthy();
    }
    const sidebarFooter = document.querySelector('[data-slot="sidebar-footer"]');
    expect(sidebarFooter).toBeTruthy();
    expect(within(sidebarFooter as HTMLElement).getByRole('button', { name: 'Connect your agent', exact: true })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Admin', exact: true })).toBeTruthy();
  });

  it('names the global not-found page and offers workspace recovery', async () => {
    renderAt('/not-a-dashboard-route');
    expect(await screen.findByRole('heading', { name: 'Not Found' })).toBeTruthy();
    expect(document.title).toBe('Not Found · Niu');
    expect(screen.getByRole('link', { name: 'Open workspace' }).getAttribute('href')).toBe('/workspaces/default/');
  });

  it('renders an intentional not-found view for unknown paths', async () => {
    mockHealth();
    renderAt('/workspaces/default/not-a-dashboard-route');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'Return to overview' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Switch workspace page' })).toBeNull();
  });

  it('switches workspace pages from the mobile sidebar without unmounting before navigation or linking header brand to marketing root', async () => {
    const previousInnerWidth = window.innerWidth;
    const previousMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width') ? 390 <= Number(/(\d+)px/.exec(query)?.[1] ?? 0) : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      mockHealth();
      const router = renderAt('/workspaces/default');
      const user = userEvent.setup();
      const toggle = await screen.findByRole('button', { name: 'Expand workspace navigation' });
      const brandLink = screen.getByRole('link', { name: 'Niu home' });
      expect(brandLink.getAttribute('href')).toBe('/workspaces/default');

      await user.click(toggle);
      const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
      const modelsLink = within(nav).getByRole('link', { name: 'Models', exact: true });
      expect(modelsLink.getAttribute('data-slot')).toBe('sidebar-menu-button');

      await user.click(modelsLink);
      await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/default/models'));
      await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull());

      await user.click(screen.getByRole('button', { name: 'Expand workspace navigation' }));
      const reopenedNav = await screen.findByRole('navigation', { name: 'Main navigation' });
      await user.click(within(reopenedNav).getByRole('link', { name: 'API keys', exact: true }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/default/keys'));
      await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull());

      await user.click(screen.getByRole('button', { name: 'Expand workspace navigation' }));
      const keysNav = await screen.findByRole('navigation', { name: 'Main navigation' });
      await user.click(within(keysNav).getByRole('link', { name: 'Generations', exact: true }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/generations'));
      const generationsBrand = await screen.findByRole('link', { name: 'Niu home' });
      expect(generationsBrand.getAttribute('href')).toBe('/workspaces/default');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: previousInnerWidth });
      window.matchMedia = previousMatchMedia;
    }
  });
});

it.each(['routing', 'evaluations'].flatMap(section => [false, true].map(unavailable => ({section, unavailable}))))('keeps $section management reachable with payment readiness unavailable=$unavailable', async ({section, unavailable}) => {
  mockHealth();
  const original = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn<typeof fetch>((input, init) => String(input).split('?')[0] === '/api/v1/payments/readiness'
    ? Promise.resolve(unavailable ? new Response('', {status: 503}) : Response.json({data: {ready: false, reason: 'payment_setup_required'}})) : original(input, init)));
  renderAt(`/workspaces/default/${section}`);
  const title = {routing: 'Routing', evaluations: 'Evaluations'}[section]!;
  await screen.findByRole('region', {name: title, exact: true});
  expect(screen.queryByRole('region', {name: 'Service setup'})).toBeNull();
  expect(screen.getByRole('button', {name: 'Refresh', exact: true})).toBeTruthy();
});

it('keeps workspace configuration reachable before payment setup is ready', async () => {
  // The whole-page setup gate was removed in 79ad3c5c; see
  // docs/ux/unfunded-workspace-review-2026-11-04.md. Configuration and saved
  // history stay available before funding; paid execution is gated separately.
  mockHealth();
  const original = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn<typeof fetch>((input, init) => String(input).split('?')[0] === '/api/v1/payments/readiness'
    ? Promise.resolve(Response.json({data: {ready: false, reason: 'payment_setup_required'}})) : original(input, init)));
  renderAt('/workspaces/default/keys');
  expect(await screen.findByRole('heading', {name: 'API keys'})).toBeTruthy();
  expect(screen.queryByRole('region', {name: 'Service setup'})).toBeNull();
  expect(await screen.findByRole('button', {name: 'New API key'})).toBeTruthy();
});
