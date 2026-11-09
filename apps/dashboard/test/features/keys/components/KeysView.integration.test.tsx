vi.mock('../../../../app/shell/platform-currency', () => ({usePlatformCurrency:()=>({currency:'USD',error:'',reload:()=>{}})}));
import { expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import KeysView from '../../../../app/features/keys/components/KeysView';
import { keyMutationHintKey } from '../../../../app/features/keys/mutation-recovery';

const expectedBaseUrl = () => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}/v1`;

const {rememberChatKey} = vi.hoisted(() => ({rememberChatKey:vi.fn()}));

vi.mock('../../../../app/shell/dashboard-context', () => ({
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

  expect(await screen.findByText('Check access with your API key')).toBeTruthy();
  expect(screen.getByText(/curl .*\/models/)).toBeTruthy();
  expect(document.body.textContent).not.toContain('/chat/completions');
  expect(screen.queryByRole('link', { name: 'Connect provider' })).toBeNull();
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
const hintKey = keyMutationHintKey('installation','org-1:project-1');
const staleRequestId = '11111111-1111-4111-8111-111111111111';
function recoveryView(canWrite=true) {
 return <MemoryRouter initialEntries={['/workspaces/production/keys']}><KeysView token="admin-token" models={['fast']} canWrite={canWrite} initialScope={{organizationId:'org-1',projectId:'project-1'}} /></MemoryRouter>;
}

it('creates a key with a corrupt stale marker and no recovery lockout',async()=>{
 localStorage.setItem(hintKey,'this is not json');
 const fetch=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>init?.method==='POST'
  ? Response.json({id:'new-key',token:'fresh-secret'},{status:201})
  : Response.json({data:[]}));
 vi.stubGlobal('fetch',fetch);
 const user=userEvent.setup();render(recoveryView());
 await screen.findByText('No API keys yet');
 expect(screen.queryByText('API key request status unknown')).toBeNull();
 await user.click(screen.getByRole('button',{name:'New API key'}));
 await user.type(screen.getByLabelText('Name'),'Fresh key');
 await user.click(screen.getByRole('button',{name:'Create key'}));
 expect(await screen.findByRole('heading',{name:'Save your API key'})).toBeTruthy();
 expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('fresh-secret');
});

it('shows a stale marker as a non-blocking notice and still creates a new key',async()=>{
 localStorage.setItem(hintKey,JSON.stringify({version:1,requestId:staleRequestId,action:'create',label:'Old key',body:{name:'Old key',ttl_seconds:null}}));
 const fetch=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>init?.method==='POST'
  ? Response.json({id:'new-key',token:'fresh-secret'},{status:201})
  : Response.json({data:[]}));
 vi.stubGlobal('fetch',fetch);
 const user=userEvent.setup();render(recoveryView());
 expect(await screen.findByText('API key request status unknown')).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'New API key'}));
 await user.type(screen.getByLabelText('Name'),'Fresh key');
 await user.click(screen.getByRole('button',{name:'Create key'}));
 expect(await screen.findByRole('heading',{name:'Save your API key'})).toBeTruthy();
 const post=fetch.mock.calls.find(call=>call[1]?.method==='POST');
 expect(new Headers(post?.[1]?.headers).get('idempotency-key')).not.toBe(staleRequestId);
 expect(JSON.parse(String(post?.[1]?.body))).toEqual({name:'Fresh key',ttl_seconds:30*86400});
});

it('creates a key when browser storage is unavailable',async()=>{
 vi.spyOn(window.localStorage,'getItem').mockImplementation(()=>{throw new Error('denied');});
 vi.spyOn(window.localStorage,'setItem').mockImplementation(()=>{throw new Error('denied');});
 vi.stubGlobal('fetch',vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>init?.method==='POST'
  ? Response.json({id:'new-key',token:'fresh-secret'},{status:201})
  : Response.json({data:[]})));
 const user=userEvent.setup();render(recoveryView());
 await screen.findByText('No API keys yet');
 expect(screen.queryByText('API key request status unknown')).toBeNull();
 await user.click(screen.getByRole('button',{name:'New API key'}));
 await user.type(screen.getByLabelText('Name'),'Fresh key');
 await user.click(screen.getByRole('button',{name:'Create key'}));
 expect(await screen.findByRole('heading',{name:'Save your API key'})).toBeTruthy();
 expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('fresh-secret');
});

it('rotates a key with a corrupt stale marker and no recovery lockout',async()=>{
 localStorage.setItem(hintKey,'broken');
 vi.stubGlobal('fetch',vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>init?.method==='POST'
  ? Response.json({id:'replacement-key',token:'replacement-secret',secret_available:true},{status:201})
  : Response.json({data:[recoveryKey]})));
 const user=userEvent.setup();render(recoveryView());
 await screen.findByText('Production agent');
 expect(screen.queryByText('API key request status unknown')).toBeNull();
 await user.click(screen.getByRole('button',{name:'Actions for Production agent'}));
 await user.click(screen.getByRole('menuitem',{name:'Rotate'}));
 await user.click(screen.getByRole('button',{name:'Rotate key'}));
 expect(await screen.findByRole('heading',{name:'Save your API key'})).toBeTruthy();
 expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('replacement-secret');
});

it('rotates a key with a stale marker without opening a recovery wizard',async()=>{
 localStorage.setItem(hintKey,JSON.stringify({version:1,requestId:staleRequestId,action:'rotate',label:'Production agent',keyId:'recovered-key'}));
 const fetch=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>init?.method==='POST'
  ? Response.json({id:'replacement-key',token:'replacement-secret',secret_available:true},{status:201})
  : Response.json({data:[recoveryKey]}));
 vi.stubGlobal('fetch',fetch);
 const user=userEvent.setup();render(recoveryView());
 expect(await screen.findByText('API key request status unknown')).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Actions for Production agent'}));
 await user.click(screen.getByRole('menuitem',{name:'Rotate'}));
 await user.click(screen.getByRole('button',{name:'Rotate key'}));
 expect(await screen.findByRole('heading',{name:'Save your API key'})).toBeTruthy();
 expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('replacement-secret');
 const post=fetch.mock.calls.find(call=>call[1]?.method==='POST');
 expect(String(post?.[0])).toBe('/api/v1/workspaces/project-1/keys/recovered-key/rotate');
 expect(new Headers(post?.[1]?.headers).get('idempotency-key')).not.toBe(staleRequestId);
});

it('offers a non-blocking retry that reuses the in-flight request identity',async()=>{
 const submissions:RequestInit[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==='POST'){submissions.push(init);if(submissions.length===1)throw new TypeError('Connection lost');return Response.json({id:'key',token:'replacement-secret',secret_available:true});}
  return Response.json({data:[]});
 }));
 const user=userEvent.setup();render(recoveryView());
 await screen.findByText('No API keys yet');
 await user.click(screen.getByRole('button',{name:'New API key'}));
 await user.type(screen.getByLabelText('Name'),'Production agent');
 await user.click(screen.getByRole('button',{name:'Create key'}));
 const retry=await screen.findByRole('button',{name:'Retry request'});
 expect((retry as HTMLButtonElement).disabled).toBe(false);
 expect(screen.queryByRole('dialog')).toBeNull();
 await user.click(retry);
 expect(await screen.findByRole('heading',{name:'Save your API key'})).toBeTruthy();
 expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('replacement-secret');
 expect(submissions).toHaveLength(2);
 expect(new Headers(submissions[0].headers).get('idempotency-key')).toBe(new Headers(submissions[1].headers).get('idempotency-key'));
 expect(submissions[0].body).toBe(submissions[1].body);
});

it('reconciles a committed create without forcing revocation and still allows another key',async()=>{
 let posts=0;
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==='POST'){posts++;return Response.json({error:{message:'Response unavailable'}},{status:503});}
  if(String(input).includes('/requests/'))return Response.json({data:{action:'create',key:recoveryKey}});
  return Response.json({data:posts?[recoveryKey]:[]});
 }));
 const user=userEvent.setup();render(recoveryView());
 await screen.findByText('No API keys yet');
 await user.click(screen.getByRole('button',{name:'New API key'}));
 await user.type(screen.getByLabelText('Name'),'Production agent');
 await user.click(screen.getByRole('button',{name:'Create key'}));
 await user.click(await screen.findByRole('button',{name:'Check status'}));
 expect(await screen.findByText(/The request completed, but its secret cannot be shown again/)).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Revoke key'})).toBeNull();
 expect(posts).toBe(1);
 await user.click(screen.getByRole('button',{name:'Dismiss'}));
 expect(screen.queryByText('Previous key request')).toBeNull();
 await user.click(screen.getByRole('button',{name:'New API key'}));
 expect(await screen.findByLabelText('Name')).toBeTruthy();
});

it('explains committed rotation and offers rotation instead of forced revocation',async()=>{
 let rotations=0;
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==='POST'){rotations++;throw new TypeError('Response lost');}
  if(String(input).includes('/requests/'))return Response.json({data:{action:'rotate',key:{...recoveryKey,id:'replacement-key'}}});
  return Response.json({data:[recoveryKey]});
 }));
 const user=userEvent.setup();render(recoveryView());
 await screen.findByText('Production agent');
 await user.click(screen.getByRole('button',{name:'Actions for Production agent'}));
 await user.click(screen.getByRole('menuitem',{name:'Rotate'}));
 await user.click(screen.getByRole('button',{name:'Rotate key'}));
 await user.click(await screen.findByRole('button',{name:'Check status'}));
 expect(await screen.findByText(/The request completed, but its secret cannot be shown again/)).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Revoke key'})).toBeNull();
 expect(rotations).toBe(1);
 await user.click(screen.getByRole('button',{name:'Rotate to get a new secret'}));
 expect(await screen.findByRole('dialog',{name:'Rotate API key'})).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Cancel'}));
});

it('keeps a server conflict visible without silently creating another request',async()=>{
 let posts=0;const ids:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==='POST'){posts++;ids.push(new Headers(init.headers).get('idempotency-key')??'');return Response.json({error:{message:'Key request conflict'}},{status:409});}
  return Response.json({data:[]});
 }));
 const user=userEvent.setup();render(recoveryView());
 await screen.findByText('No API keys yet');
 await user.click(screen.getByRole('button',{name:'New API key'}));
 await user.type(screen.getByLabelText('Name'),'Production agent');
 await user.click(screen.getByRole('button',{name:'Create key'}));
 expect(await screen.findByText('Key request conflict')).toBeTruthy();
 expect(posts).toBe(1);
 expect(screen.queryByRole('heading',{name:'Save your API key'})).toBeNull();
 await user.click(await screen.findByRole('button',{name:'Retry request'}));
 await screen.findByRole('button',{name:'Retry request'});
 expect(posts).toBe(2);
 expect(ids[0]).toBe(ids[1]);
 expect(screen.queryByRole('heading',{name:'Save your API key'})).toBeNull();
 await user.click(screen.getByRole('button',{name:'Dismiss'}));
 expect(screen.queryByText('Previous key request')).toBeNull();
 await user.click(screen.getByRole('button',{name:'New API key'}));
 expect(await screen.findByLabelText('Name')).toBeTruthy();
});

it('aborts a pending response after role loss and does not reveal its secret',async()=>{
 let finish!:(response:Response)=>void;let signal:AbortSignal|undefined;
 vi.stubGlobal('fetch',vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==='POST'){signal=init.signal as AbortSignal;return new Promise<Response>(resolve=>{finish=resolve;});}
  return Response.json({data:[]});
 }));
 const user=userEvent.setup();const view=render(recoveryView());
 await screen.findByText('No API keys yet');
 await user.click(screen.getByRole('button',{name:'New API key'}));
 await user.type(screen.getByLabelText('Name'),'Production agent');
 await user.click(screen.getByRole('button',{name:'Create key'}));
 view.rerender(recoveryView(false));
 expect(signal?.aborted).toBe(true);
 await act(async()=>{finish(Response.json({id:'key',token:'must-not-appear'}));});
 expect(screen.queryByRole('heading',{name:'Save your API key'})).toBeNull();
 expect(document.body.textContent).not.toContain('must-not-appear');
 expect(await screen.findByText('Write access is required to check this request.')).toBeTruthy();
});

it('shows a confirmed retry rejection as a non-blocking notice',async()=>{
 let posts=0;
 vi.stubGlobal('fetch',vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==='POST'){posts++;if(posts===1)throw new TypeError('Response lost');return Response.json({error:{message:'The selected model is no longer available'}},{status:400});}
  return Response.json({data:[]});
 }));
 const user=userEvent.setup();render(recoveryView());
 await screen.findByText('No API keys yet');
 await user.click(screen.getByRole('button',{name:'New API key'}));
 await user.type(screen.getByLabelText('Name'),'Production agent');
 await user.click(screen.getByRole('button',{name:'Create key'}));
 await user.click(await screen.findByRole('button',{name:'Retry request'}));
 expect(await screen.findByText('The selected model is no longer available')).toBeTruthy();
 expect(screen.queryByRole('heading',{name:'Save your API key'})).toBeNull();
 expect(screen.queryByText('Could not create API key')).toBeTruthy();
 expect(posts).toBe(2);
 await user.click(screen.getByRole('button',{name:'Dismiss'}));
 expect(screen.queryByText('Could not create API key')).toBeNull();
 await user.click(screen.getByRole('button',{name:'New API key'}));
 expect(await screen.findByLabelText('Name')).toBeTruthy();
});
