import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, createMemoryRouter, RouterProvider } from 'react-router';
import KeyDetailView from '@/features/keys/components/KeyDetailView';
vi.mock('@/features/executions/components/GatewayActivity', () => ({ default: () => null }));
vi.mock('@/features/keys/components/KeyGuardrails', () => ({ default: () => null }));
vi.mock('@/features/keys/components/KeyLimits', () => ({ default: () => null }));
vi.mock('@/features/keys/components/KeySourceAccess', () => ({ default: () => null }));
vi.mock('@/features/keys/components/KeySpendingLimits', () => ({ default: () => null }));
it('requires reloading a conflicting key before another edit', async () => {
  let record={id:'saved',revision:1,name:'Original key',allowed_models:['*'],expires_at_ms:Date.now()+86400000,revoked:false,expired:false};
  const fetcher=vi.fn(async (_input:RequestInfo|URL,init?:RequestInit)=> {
    if(init?.method==='PATCH') {
      record={...record,name:'Other editor name',revision:2};
      return Response.json({error:{message:'Conflict'}},{status:409});
    }
    return Response.json({data:[record]});
  });
  vi.stubGlobal('fetch',fetcher);
  render(<MemoryRouter initialEntries={['/workspaces/demo/keys/saved']}><Routes><Route path="/workspaces/:workspace/keys/:keyId" element={<KeyDetailView token="test" models={['fast']} canWrite initialScope={{organizationId:'org',projectId:'demo'}}/>}/></Routes></MemoryRouter>);
  const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Edit key'}));
  await user.clear(screen.getByLabelText('Name'));await user.type(screen.getByLabelText('Name'),'My edit');
  await user.click(screen.getByRole('button',{name:'Save changes'}));
  await screen.findByText('This key changed. Reload it before editing again.');
  expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole('button',{name:'Save changes'})).toBeNull();
  await user.click(screen.getByRole('button',{name:'Reload key'}));
  await screen.findByRole('heading',{name:'Other editor name'});
  await user.click(screen.getByRole('button',{name:'Edit key'}));
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Other editor name');
  expect((screen.getByRole('button',{name:'Save changes'}) as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher.mock.calls.filter(([,init])=>init?.method==='PATCH').length).toBe(1);
});
it('edits key metadata with its revision and allows cancelling without saving', async () => {
  const record={id:'saved',revision:3,name:'Application key',allowed_models:['*'],expires_at_ms:Date.now()+86400000,revoked:false,expired:false};
  const fetcher=vi.fn(async (_input:RequestInfo|URL,init?:RequestInit)=>init?.method==='PATCH' ? Response.json({revision:4}) : Response.json({data:[record]}));
  vi.stubGlobal('fetch',fetcher);
  render(<MemoryRouter initialEntries={['/workspaces/demo/keys/saved']}><Routes><Route path="/workspaces/:workspace/keys/:keyId" element={<KeyDetailView token="test" models={['fast']} canWrite initialScope={{organizationId:'org',projectId:'demo'}}/>}/></Routes></MemoryRouter>);
  const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Edit key'}));
  expect((screen.getByRole('button',{name:'Save changes'}) as HTMLButtonElement).disabled).toBe(true);
  await user.clear(screen.getByLabelText('Name'));await user.type(screen.getByLabelText('Name'),'Updated key');
  await user.click(screen.getByRole('button',{name:'Cancel'}));
  expect(fetcher.mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(false);
  await user.click(screen.getByRole('button',{name:'Edit key'}));
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Application key');
  await user.clear(screen.getByLabelText('Name'));await user.type(screen.getByLabelText('Name'),'Updated key');
  await user.click(screen.getByRole('button',{name:'Save changes'}));
  await screen.findByRole('heading',{name:'Updated key'});
  const saved=fetcher.mock.calls.find(([,init])=>init?.method==='PATCH');
  expect(JSON.parse(saved![1]!.body as string)).toEqual({name:'Updated key',allowed_models:['*'],expected_revision:3});
});
it('retries a failed key read without claiming the key is missing', async () => {
  let reads=0;
  vi.stubGlobal('fetch',vi.fn(async () => ++reads===1 ? new Response('{}',{status:503}) : Response.json({data:[{id:'saved',name:'Application key',allowed_models:['*'],expires_at_ms:Date.now()+86400000,revoked:false,expired:false}]})));
  render(<MemoryRouter initialEntries={['/workspaces/demo/keys/saved']}><Routes><Route path="/workspaces/:workspace/keys/:keyId" element={<KeyDetailView token="test" models={[]} canWrite={false} initialScope={{organizationId:'org',projectId:'demo'}}/>}/></Routes></MemoryRouter>);
  const user=userEvent.setup();
  await screen.findByRole('button',{name:'Retry API key'});
  expect(screen.queryByText('This key could not be found or accessed in this workspace.')).toBeNull();
  await user.click(screen.getByRole('button',{name:'Retry API key'}));
  await screen.findByRole('heading',{name:'Application key'});
  expect(reads).toBe(2);
  expect(screen.queryByRole('button',{name:'Retry API key'})).toBeNull();
});

it('hides stale key details and ignores a late revocation after changing scope', async () => {
  const record=(name:string)=>({id:'saved',name,allowed_models:['*'],expires_at_ms:Date.now()+86400000,revoked:false,expired:false});
  let finishRevoke!:(response:Response)=>void;
  let finishRead!:(response:Response)=>void;
  vi.stubGlobal('fetch',vi.fn((input:RequestInfo | URL,init?:RequestInit)=>{
    if(init?.method==='DELETE') return new Promise<Response>(resolve=>{finishRevoke=resolve;});
    if(String(input).includes('/workspaces/next/')) return new Promise<Response>(resolve=>{finishRead=resolve;});
    return Promise.resolve(Response.json({data:[record('Previous workspace key')]}));
  }));
  const view=(projectId:string)=><MemoryRouter initialEntries={['/workspaces/demo/keys/saved']}><Routes><Route path="/workspaces/:workspace/keys/:keyId" element={<KeyDetailView token={projectId} models={[]} canWrite initialScope={{organizationId:'org',projectId}}/>}/></Routes></MemoryRouter>;
  const rendered=render(view('demo'));const user=userEvent.setup();
  await screen.findByRole('heading',{name:'Previous workspace key'});
  await user.click(screen.getByRole('button',{name:'Revoke key'}));
  await user.click(screen.getByRole('button',{name:'Confirm revoke'}));
  rendered.rerender(view('next'));
  expect(screen.queryByRole('heading',{name:'Previous workspace key'})).toBeNull();
  expect(screen.queryByRole('group',{name:'Confirm API key revocation'})).toBeNull();
  expect(screen.queryByText('This key could not be found or accessed in this workspace.')).toBeNull();
  finishRead(Response.json({data:[record('Current workspace key')]}));
  await screen.findByRole('heading',{name:'Current workspace key'});
  finishRevoke(new Response(null,{status:204}));
  await user.click(screen.getByRole('button',{name:'Revoke key'}));
  expect(screen.queryByText('Key revoked. Requests using it will be rejected.')).toBeNull();
  expect((screen.getByRole('button',{name:'Confirm revoke'}) as HTMLButtonElement).disabled).toBe(false);
});

it('offers a neutral, workspace-scoped recovery when the key is absent', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({data: []})));
  render(<MemoryRouter initialEntries={['/workspaces/demo/keys/missing']}><Routes><Route path="/workspaces/:workspace/keys/:keyId" element={<KeyDetailView token="missing-test" models={[]} canWrite={false} initialScope={{organizationId:'org',projectId:'demo'}}/>}/></Routes></MemoryRouter>);
  await screen.findByText('This key could not be found or accessed in this workspace.');
  expect(screen.getByRole('link', {name:'Return to API keys'}).getAttribute('href')).toBe('/workspaces/demo/keys');
});

it('redirects an old key ID bookmark to its stable slug and edits by the API ID', async () => {
  const record={id:'00000000-0000-4000-8000-000000000123',slug:'production',revision:3,name:'Application key',allowed_models:['*'],expires_at_ms:null,revoked:false,expired:false};
  const fetcher=vi.fn(async (_input:RequestInfo|URL,init?:RequestInit)=>init?.method==='PATCH' ? Response.json({revision:4}) : Response.json({data:[record]}));
  vi.stubGlobal('fetch',fetcher);
  const router=createMemoryRouter([{path:'/workspaces/:workspace/keys/:keyId',element:<KeyDetailView token="test" models={['fast']} canWrite initialScope={{organizationId:'org',projectId:'demo'}}/>}],{initialEntries:[`/workspaces/demo/keys/${record.id}?view=limits#settings`]});
  render(<RouterProvider router={router}/>);
  await waitFor(()=>expect(router.state.location.pathname).toBe('/workspaces/demo/keys/production'));
  expect(router.state.location.search).toBe('?view=limits');expect(router.state.location.hash).toBe('#settings');
  const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Edit key'}));
  await user.clear(screen.getByLabelText('Name'));await user.type(screen.getByLabelText('Name'),'Renamed key');
  await user.click(screen.getByRole('button',{name:'Save changes'}));
  await screen.findByRole('heading',{name:'Renamed key'});
  expect(fetcher.mock.calls.find(([,init])=>init?.method==='PATCH')?.[0]).toBe(`/api/v1/workspaces/demo/keys/${record.id}`);
  expect(router.state.location.pathname).toBe('/workspaces/demo/keys/production');
});
it('rotates the key from the detail page and shows the replacement secret once', async () => {
  const record={id:'saved',slug:'saved',revision:1,name:'Application key',allowed_models:['*'],expires_at_ms:Date.now()+86400000,revoked:false,expired:false};
  const fetcher=vi.fn(async (input:RequestInfo|URL,init?:RequestInit) => String(input).endsWith('/rotate') && init?.method==='POST'
    ? Response.json({id:'saved',token:'new-secret-value',secret_available:true,key:record})
    : Response.json({data:[record]}));
  vi.stubGlobal('fetch',fetcher);
  render(<MemoryRouter initialEntries={['/workspaces/demo/keys/saved']}><Routes><Route path="/workspaces/:workspace/keys/:keyId" element={<KeyDetailView token="test" models={['fast']} canWrite initialScope={{organizationId:'org',projectId:'demo'}}/>}/></Routes></MemoryRouter>);
  const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Rotate key'}));
  await user.click(screen.getByRole('button',{name:'Confirm rotate'}));
  const secret=await screen.findByLabelText('API key secret') as HTMLInputElement;
  expect(secret.value).toBe('new-secret-value');
  expect(fetcher.mock.calls.some(([input,init])=>String(input).endsWith('/rotate')&&init?.method==='POST')).toBe(true);
});

it('consolidates key policies into one editor and one history surface', async () => {
  const record={id:'saved',slug:'application',revision:2,name:'Application key',allowed_models:['*'],expires_at_ms:null,revoked:false,expired:false,request_rate_limit:{requests_per_minute:10,revision:'1'},concurrency_limit:{max_concurrent_requests:2,active_requests:0,revision:'1'},token_rate_limit:{tokens_per_minute:null,revision:null,snapshot_at:'2026-11-05T00:00:00Z',known_tokens:'0',reserved_tokens:'0',unbounded_requests:0,committed_tokens:null},ip_policy:{allowed_cidrs:null,revision:'1'},spending_limits:[]};
  vi.stubGlobal('fetch',vi.fn(async (input:RequestInfo|URL)=>{
    const path=String(input);
    if(path.endsWith('/guardrail'))return Response.json({data:{assignment_revision:1,policy_revision:null,mode:'active',policy:null}});
    if(path.endsWith('/guardrails/history'))return Response.json({data:[],next_cursor:null});
    return Response.json({data:[record]});
  }));
  render(<MemoryRouter initialEntries={['/workspaces/demo/keys/application']}><Routes><Route path="/workspaces/:workspace/keys/:keyId" element={<KeyDetailView token="test" models={['fast']} canWrite canConfigureSpending initialScope={{organizationId:'org',projectId:'demo'}}/>}/></Routes></MemoryRouter>);
  const user=userEvent.setup();
  await screen.findByRole('heading',{name:'Application key'});
  expect(screen.queryByRole('button',{name:'Edit requests per minute'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Source IP access history'})).toBeNull();
  expect(screen.getAllByRole('button',{name:'History'})).toHaveLength(1);
  await user.click(screen.getByRole('button',{name:'Edit key'}));
  expect(screen.getByRole('heading',{name:'Limits'})).toBeTruthy();
  expect(screen.getByRole('heading',{name:'Source IP access'})).toBeTruthy();
  expect(screen.getByRole('heading',{name:'Spending limits'})).toBeTruthy();
  expect(screen.getByRole('heading',{name:'Guardrails'})).toBeTruthy();
  expect(screen.getAllByRole('button',{name:'Save changes'})).toHaveLength(1);
  expect(screen.queryByRole('button',{name:'Edit requests per minute'})).toBeNull();
});

it('shows the exact approved model interfaces or management-only state', async () => {
  const base={id:'saved',name:'Agent key',allowed_models:['fast'],expires_at_ms:Date.now()+86400000,revoked:false,expired:false};
  vi.stubGlobal('fetch',vi.fn(async () => Response.json({data:[{...base,invocation_allowed:true,invocation_protocols:['chat','embeddings']}]})));
  const first=render(<MemoryRouter initialEntries={['/workspaces/demo/keys/saved']}><Routes><Route path="/workspaces/:workspace/keys/:keyId" element={<KeyDetailView token="test" models={['fast']} canWrite={false} initialScope={{organizationId:'org',projectId:'demo'}}/>}/></Routes></MemoryRouter>);
  await screen.findByText('Allowed for Chat completions, Embeddings');
  first.unmount();
  vi.stubGlobal('fetch',vi.fn(async () => Response.json({data:[{...base,invocation_allowed:false}]})));
  render(<MemoryRouter initialEntries={['/workspaces/demo/keys/saved']}><Routes><Route path="/workspaces/:workspace/keys/:keyId" element={<KeyDetailView token="test-2" models={['fast']} canWrite={false} initialScope={{organizationId:'org',projectId:'demo'}}/>}/></Routes></MemoryRouter>);
  await screen.findByText('Blocked (management only)');
});

it('reveals, hides, and repeatedly copies the API key secret on the detail page', async () => {
  const secretValue = 'niu_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
  const record = { id: 'saved', slug: 'saved', revision: 1, name: 'Application key', allowed_models: ['*'], expires_at_ms: Date.now() + 86400000, revoked: false, expired: false };
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('?reveal=true')) {
      return Response.json({ ...record, token: secretValue, token_preview: 'niu_abcd••••••••7890' });
    }
    return Response.json({ data: [record] });
  });
  vi.stubGlobal('fetch', fetcher);

  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  render(<MemoryRouter initialEntries={['/workspaces/demo/keys/saved']}><Routes><Route path="/workspaces/:workspace/keys/:keyId" element={<KeyDetailView token="test-reveal" models={['fast']} canWrite initialScope={{ organizationId: 'org', projectId: 'demo' }} />} /></Routes></MemoryRouter>);

  await screen.findByRole('heading', { name: 'Application key' });
  expect(screen.getByText('niu_••••••••••••')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Reveal API key' }));
  expect(await screen.findByText(secretValue)).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Hide API key' }));
  expect(screen.queryByText(secretValue)).toBeNull();
  expect(screen.getByText('niu_abcd••••••••7890')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Copy key' }));
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText).toHaveBeenLastCalledWith(secretValue);

  await user.click(screen.getByRole('button', { name: 'Copied' }));
  expect(writeText).toHaveBeenCalledTimes(2);
  expect(writeText).toHaveBeenLastCalledWith(secretValue);
});
