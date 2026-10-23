vi.mock('../../../../src/app/platform-currency', () => ({usePlatformCurrency:()=>({currency:'USD',error:'',reload:()=>{}})}));
import { expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import KeysView from '../../../../src/features/keys/components/KeysView';

const expectedBaseUrl = () => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}/v1`;

const {rememberChatKey} = vi.hoisted(() => ({rememberChatKey:vi.fn()}));

vi.mock('../../../../src/app/dashboard-context', () => ({
  useDashboardContext: () => ({
    workspaces: [{ id: 'project-1', name: 'Production', organization_id: 'org-1', organization_name: 'Acme' }],
    workspace: { id: 'project-1', name: 'Production', organization_id: 'org-1', organization_name: 'Acme' },
    workspaceLoading: false,
    rememberChatKey,
    forgetChatKey: vi.fn(),
  }),
}));

it('issues a workspace API key and makes its one-time secret easy to copy', async () => {
  const calls: Array<{ path: string; method: string; body?: string }> = [];
  const keyPath = '/api/v1/workspaces/project-1/keys';
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

  render(<MemoryRouter initialEntries={['/workspaces/production/keys']}><KeysView token="admin-token" models={[{ id: 'fast' }, { id: 'careful' }]} canWrite initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);

  expect(await screen.findByText('No API keys yet')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /New API key|Create your first key/ })).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'New API key' }));
  await user.type(screen.getByLabelText('Name'), 'My application');
  expect(screen.queryByText('Models this key can call')).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Create key' }));

  expect(await screen.findByRole('heading', { name: 'Save your API key' })).toBeTruthy();
  expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('niu_once_test_secret');
  expect(screen.getByRole('link', {name: 'Open Generations'}).getAttribute('href')).toBe('/generations?new=1&workspace=production&key=key-1');
  expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(expectedBaseUrl());
  expect(screen.queryByText(/admin-token/)).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Copy URL' }));
  expect(writeText).toHaveBeenCalledWith(expectedBaseUrl());
  await user.click(screen.getByRole('button', { name: 'Copy key' }));
  expect(writeText).toHaveBeenCalledWith('niu_once_test_secret');

  const issue = calls.find(call => call.method === 'POST');
  expect(issue?.path).toBe(keyPath);
  expect(JSON.parse(issue?.body ?? '{}')).toEqual({ name: 'My application', ttl_seconds: 30 * 86400 });
});

it('keeps an operator viewer in read-only key administration', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{
    id: 'key-1', name: 'Frontend', allowed_models: ['fast'], expires_at_ms: 2_000_000_000_000, revoked: false, expired: false,
  }] }), { status: 200, headers: { 'content-type': 'application/json' } })));

  render(<MemoryRouter initialEntries={['/workspaces/production/keys']}><KeysView token="viewer-token" models={['fast']} canWrite={false} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);

  expect(await screen.findByText('Frontend')).toBeTruthy();
  expect(screen.getAllByRole('button',{name:'Refresh API keys'})).toHaveLength(1);
  expect(screen.queryByText(/admin-token/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'New API key' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create key' })).toBeNull();
});

it('does not present a runnable request example before the workspace has a model route', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const created = init?.method === 'POST';
    const value = created ? { id: 'key-1', token: 'niu_once_test_secret' } : { data: [] };
    return new Response(JSON.stringify(value), { status: created ? 201 : 200, headers: { 'content-type': 'application/json' } });
  }));
  const user = userEvent.setup();

  render(<MemoryRouter initialEntries={['/workspaces/production/keys']}><KeysView token="admin-token" models={[]} canWrite initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);

  await screen.findByText('No API keys yet');
  await user.click(screen.getByRole('button', { name: 'New API key' }));
  await user.type(screen.getByLabelText('Name'), 'Default demo key');
  await user.click(screen.getByRole('button', { name: 'Create key' }));

  expect(await screen.findByText('Request example unavailable')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Connect provider' })).toBeNull();
  expect(screen.getByText('Ask a platform administrator to add a model route to the catalog.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Copy example' })).toBeNull();
  expect(document.body.textContent).not.toContain('your-model');
});

it('shows recorded last use separately from absent and unavailable activity without leaking key references', async () => {
  const lastUsed = 1_800_000_000_000;
  const keys = [
    {id: 'observed-reference', name: 'Observed key', last_used_at_ms: lastUsed},
    {id: 'unused-reference', name: 'Unused key', last_used_at_ms: null},
    {id: 'legacy-reference', name: 'Legacy gateway key'},
  ].map(item => ({allowed_models: ['fast'], expires_at_ms: 2_000_000_000_000, revoked: false, expired: false, ...item}));
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data: keys})));
  render(<MemoryRouter initialEntries={['/workspaces/production/keys']}><KeysView token="viewer" models={['fast']} canWrite={false} initialScope={{organizationId: 'org-1', projectId: 'project-1'}} /></MemoryRouter>);
  const observed = await screen.findByRole('row', {name: /Observed key/});
  expect(within(observed).getByText(new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(lastUsed)))).toBeTruthy();
  expect(within(screen.getByRole('row', {name: /Unused key/})).getByText('No recorded requests')).toBeTruthy();
  expect(within(screen.getByRole('row', {name: /Legacy gateway key/})).getByText('Unavailable')).toBeTruthy();
  for (const key of keys) expect(document.body.textContent).not.toContain(key.id);
});

it('opens key rotation and revocation from the named action menu and keeps cancellation read-only', async () => {
  const fetch = vi.fn(async () => Response.json({data: [{id: 'key-reference', name: 'Application key', allowed_models: ['*'], expires_at_ms: 2_000_000_000_000, last_used_at_ms: null, revoked: false, expired: false}]}));
  vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/workspaces/production/keys']}><KeysView token="writer" models={['fast']} canWrite initialScope={{organizationId: 'org-1', projectId: 'project-1'}} /></MemoryRouter>);
  await user.click(await screen.findByRole('button', {name: 'Actions for Application key'}));
  await user.click(screen.getByRole('menuitem', {name: 'Rotate', exact: true}));
  expect(await screen.findByRole('dialog', {name: 'Rotate API key'})).toBeTruthy();
  await user.click(screen.getByRole('button', {name: 'Cancel', exact: true}));
  await user.click(screen.getByRole('button', {name: 'Actions for Application key'}));
  await user.click(screen.getByRole('menuitem', {name: 'Revoke', exact: true}));
  expect(await screen.findByRole('dialog', {name: 'Revoke API key'})).toBeTruthy();
  await user.click(screen.getByRole('button', {name: 'Keep key', exact: true}));
  expect(fetch.mock.calls.every(([, init]) => init.method==='GET')).toBe(true);
});

it('searches names without issuing requests and can recover from an empty result', async () => {
  const fetchKeys = vi.fn(async () => new Response(JSON.stringify({ data: ['Production app', 'Staging app'].map((name, i) => ({
    id: `key-${i}`, name, allowed_models: ['*'], expires_at_ms: 2_000_000_000_000, revoked: false, expired: false,
  })) }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchKeys);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/workspaces/production/keys']}><KeysView token="viewer" models={['fast']} canWrite={false} initialScope={{organizationId: 'org-1', projectId: 'project-1'}} /></MemoryRouter>);
  await screen.findByRole('link', { name: 'View key Production app' });
  const searches = fetchKeys.mock.calls.length;
  await user.click(screen.getByRole('button', {name:'Search API keys'}));
  await user.type(screen.getByRole('textbox', { name: 'Search API keys' }), 'PRODUCTION');
  expect(screen.getByRole('link', { name: 'View key Production app' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'View key Staging app' })).toBeNull();
  await user.clear(screen.getByRole('textbox', { name: 'Search API keys' }));
  await user.type(screen.getByRole('textbox', { name: 'Search API keys' }), 'missing');
  expect(screen.getByText('No matching keys')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Search API keys' }));
  expect(screen.getByRole('link', { name: 'View key Staging app' })).toBeTruthy();
  expect(fetchKeys.mock.calls.length).toBe(searches);
});

it('distinguishes an unread key list from a successfully loaded empty list', async () => {
 let resolveRead!:(response:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{resolveRead=resolve;})));
 render(<MemoryRouter initialEntries={['/workspaces/production/keys']}><KeysView token="test" models={[]} canWrite={false} initialScope={{organizationId:'org-1',projectId:'project-1'}}/></MemoryRouter>);
 expect(screen.getByText('Loading keys…')).toBeTruthy();
 expect(screen.queryByText('0 keys')).toBeNull();
 expect(screen.queryByText('No API keys yet')).toBeNull();
 resolveRead(new Response('{}',{status:503}));
 await screen.findByText('Keys unavailable');
 expect(screen.queryByText('0 keys')).toBeNull();
 expect(screen.queryByText('No API keys yet')).toBeNull();
});

it('locks creation controls while pending and retains edits after confirmed validation failure', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_input, init) => init?.method === 'POST'
    ? new Promise<Response>(resolve => { finish = resolve; })
    : Response.json({data: []})));
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/workspaces/production/keys']}><KeysView token="admin-token" models={['fast']} canWrite initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
  await screen.findByText('No API keys yet');
  await user.click(screen.getByRole('button', {name:'New API key'}));
  await user.type(screen.getByLabelText('Name'), 'Production agent');
  await user.click(screen.getByRole('button', {name:'Create key'}));
  expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true);
  for (const name of ['Expiration', 'Cancel', 'Close dialog']) {
    expect((screen.getByRole('button', {name,exact:true}) as HTMLButtonElement).disabled).toBe(true);
  }
  await user.click(screen.getByRole('button', {name:'Cancel',exact:true}));
  expect(screen.getByRole('dialog')).toBeTruthy();
  await act(async () => { finish(Response.json({error:{message:'Invalid key name'}}, {status:400})); });
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Production agent');
  expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByRole('button',{name:'Create key'}) as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(false);
});

it('ignores a late creation response after leaving key administration', async () => {
  let finish!: (response:Response) => void;
  let signal: AbortSignal | undefined;
  rememberChatKey.mockClear();
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_input, init) => {
    if (init?.method === 'POST') {
      signal=init.signal as AbortSignal;
      return new Promise<Response>(resolve => {finish=resolve;});
    }
    return Response.json({data:[]});
  }));
  const user=userEvent.setup();
  const view=render(<MemoryRouter initialEntries={['/workspaces/production/keys']}><KeysView token="admin-token" models={['fast']} canWrite initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>);
  await screen.findByText('No API keys yet');
  await user.click(screen.getByRole('button',{name:'New API key'}));
  await user.type(screen.getByLabelText('Name'),'Old account key');
  await user.click(screen.getByRole('button',{name:'Create key'}));
  expect(signal?.aborted).toBe(false);
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {finish(Response.json({id:'old-key',token:'fixture-only-secret'},{status:201}));});
  expect(rememberChatKey).not.toHaveBeenCalled();
});

const recoveryKey = {id:'recovered-key',slug:'production-agent',name:'Production agent',allowed_models:['fast'],expires_at_ms:null,revoked:false,expired:false};
function recoveryView(canWrite=true) {
 return <MemoryRouter initialEntries={['/workspaces/production/keys']}><KeysView token="admin-token" models={['fast']} canWrite={canWrite} initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>;
}

it('reconciles response loss after navigation and explicitly revokes the undisclosed key before new creation',async()=>{
 let posts=0,revoked=false;
 vi.stubGlobal('fetch',vi.fn(async(input,init)=>{
  if(init?.method==='POST'){posts++;return Response.json({error:{message:'Response unavailable'}},{status:503});}
  if(init?.method==='DELETE'){revoked=true;return new Response(null,{status:204});}
  if(String(input).includes('/requests/'))return Response.json({data:{action:'create',key:{...recoveryKey,revoked}}});
  return Response.json({data:posts?[{...recoveryKey,revoked}]:[]});
 }));
 const user=userEvent.setup();const first=render(recoveryView());
 await screen.findByText('No API keys yet');
 await user.click(screen.getByRole('button',{name:'New API key'}));
 await user.type(screen.getByLabelText('Name'),'Production agent');
 await user.click(screen.getByRole('button',{name:'Create key'}));
 await screen.findByRole('heading',{name:'Review key request'});
 expect(screen.queryByRole('button',{name:'Create key'})).toBeNull();
 first.unmount();render(recoveryView());
 await screen.findByText('Key request needs review');
 await user.click(screen.getByRole('button',{name:'New API key'}));
 await screen.findByRole('heading',{name:'Review key request'});
 await user.click(screen.getByRole('button',{name:'Check saved result'}));
 await screen.findByText(/The key was created/);
 expect(screen.queryByLabelText('API key')).toBeNull();
 expect(posts).toBe(1);
 await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Revoke key'}));
 await screen.findByText('Revoked');
 expect(revoked).toBe(true);
 expect(screen.queryByText('Key request needs review')).toBeNull();
 expect(posts).toBe(1);
 await user.click(screen.getByRole('button',{name:'New API key'}));
 await screen.findByLabelText('Name');
});

it('retries a pre-commit network failure with identical request identity and input',async()=>{
 const submissions:RequestInit[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_input,init)=>{
  if(init?.method==='POST'){submissions.push(init);if(submissions.length===1)throw new TypeError('Connection lost');return Response.json({id:'key',token:'replacement-secret',secret_available:true});}
  return Response.json({data:[]});
 }));
 const user=userEvent.setup();render(recoveryView());await screen.findByText('No API keys yet');
 await user.click(screen.getByRole('button',{name:'New API key'}));await user.type(screen.getByLabelText('Name'),'Production agent');await user.click(screen.getByRole('button',{name:'Create key'}));
 await screen.findByRole('heading',{name:'Review key request'});
 await user.click(screen.getByRole('button',{name:'Retry same request'}));
 await screen.findByRole('heading',{name:'Save your API key'});
 expect(submissions).toHaveLength(2);
 expect(new Headers(submissions[0].headers).get('idempotency-key')).toBe(new Headers(submissions[1].headers).get('idempotency-key'));
 expect(submissions[0].body).toBe(submissions[1].body);
});

it('explains committed rotation and prevents another rotation after the secret response is lost',async()=>{
 let rotations=0;
 vi.stubGlobal('fetch',vi.fn(async(input,init)=>{
  if(init?.method==='POST'){rotations++;throw new TypeError('Response lost');}
  if(String(input).includes('/requests/'))return Response.json({data:{action:'rotate',key:{...recoveryKey,id:'replacement'}}});
  return Response.json({data:[recoveryKey]});
 }));
 const user=userEvent.setup();render(recoveryView());await screen.findByText('Production agent');
 await user.click(screen.getByRole('button',{name:'Actions for Production agent'}));
 await user.click(screen.getByRole('menuitem',{name:'Rotate'}));
 await user.click(screen.getByRole('button',{name:'Rotate key'}));
 await screen.findByRole('heading',{name:'Review key request'});
 await user.click(screen.getByRole('button',{name:'Check saved result'}));
 await screen.findByText(/Rotation completed. The old secret no longer works/);
 expect(screen.queryByRole('button',{name:'Retry same request'})).toBeNull();
 expect(rotations).toBe(1);
});

it('retains pending recovery while role loss aborts the response and hides the secret',async()=>{
 let finish!:(response:Response)=>void;let signal:AbortSignal|undefined;
 vi.stubGlobal('fetch',vi.fn(async(_input,init)=>{
  if(init?.method==='POST'){signal=init.signal as AbortSignal;return new Promise<Response>(resolve=>{finish=resolve;});}
  return Response.json({data:[]});
 }));
 const user=userEvent.setup();const view=render(recoveryView());await screen.findByText('No API keys yet');
 await user.click(screen.getByRole('button',{name:'New API key'}));await user.type(screen.getByLabelText('Name'),'Production agent');await user.click(screen.getByRole('button',{name:'Create key'}));
 view.rerender(recoveryView(false));expect(signal?.aborted).toBe(true);
 await act(async()=>{finish(Response.json({id:'key',token:'must-not-appear'}));});
 expect(screen.queryByRole('heading',{name:'Save your API key'})).toBeNull();
 expect(document.body.textContent).not.toContain('must-not-appear');
 expect(await screen.findByText(/Write access is required to recover/)).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Review request'})).toBeNull();
});

it('shows a confirmed retry rejection after closing recovery and permits a corrected new request',async()=>{
 let posts=0;
 vi.stubGlobal('fetch',vi.fn(async(_input,init)=>{
  if(init?.method==='POST'){posts++;if(posts===1)throw new TypeError('Response lost');return Response.json({error:{message:'The selected model is no longer available'}},{status:400});}
  return Response.json({data:[]});
 }));
 const user=userEvent.setup();render(recoveryView());await screen.findByText('No API keys yet');
 await user.click(screen.getByRole('button',{name:'New API key'}));await user.type(screen.getByLabelText('Name'),'Production agent');await user.click(screen.getByRole('button',{name:'Create key'}));
 await screen.findByRole('heading',{name:'Review key request'});
 await user.click(screen.getByRole('button',{name:'Retry same request'}));
 expect(await screen.findByText('The selected model is no longer available')).toBeTruthy();
 expect(screen.queryByText('Key request needs review')).toBeNull();
 await user.click(screen.getByRole('button',{name:'New API key'}));
 expect(await screen.findByLabelText('Name')).toBeTruthy();
 expect(posts).toBe(2);
});
