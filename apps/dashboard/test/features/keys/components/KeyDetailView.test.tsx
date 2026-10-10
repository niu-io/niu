import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import KeyDetailView from '@/features/keys/components/KeyDetailView';
vi.mock('@/features/executions/components/GatewayActivity', () => ({ default: () => null }));
vi.mock('@/features/keys/components/KeyGuardrails', () => ({ default: () => null }));
vi.mock('@/features/keys/components/KeyLimits', () => ({ default: () => null }));
vi.mock('@/features/keys/components/KeySourceAccess', () => ({ default: () => null }));
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
  expect(screen.queryByText('This key is not in the selected workspace.')).toBeNull();
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
    if(String(input).includes('/projects/next/')) return new Promise<Response>(resolve=>{finishRead=resolve;});
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
  expect(screen.queryByText('This key is not in the selected workspace.')).toBeNull();
  finishRead(Response.json({data:[record('Current workspace key')]}));
  await screen.findByRole('heading',{name:'Current workspace key'});
  finishRevoke(new Response(null,{status:204}));
  await user.click(screen.getByRole('button',{name:'Revoke key'}));
  expect(screen.queryByText('Key revoked. Requests using it will be rejected.')).toBeNull();
  expect((screen.getByRole('button',{name:'Confirm revoke'}) as HTMLButtonElement).disabled).toBe(false);
});
