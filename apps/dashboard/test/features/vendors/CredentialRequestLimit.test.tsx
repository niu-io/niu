import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi} from 'vitest';
import CredentialRequestLimit from '@/features/vendors/components/CredentialRequestLimit';

it('saves zero from revision zero and clears a finite policy with explicit null',async()=>{
  let policy={requests_per_minute:null as number|null,revision:'0'};
  const writes:unknown[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_path,init)=>{
    if(init.method==='PUT'){const body=JSON.parse(init.body);writes.push(body);policy={requests_per_minute:body.requests_per_minute,revision:'9007199254740993'};}
    return Response.json({data:policy});
  }));
  render(<CredentialRequestLimit token="member" vendorId="credential"/>);const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Edit limit'}));
  await user.type(screen.getByLabelText('Limit'),'0');await user.click(screen.getByRole('button',{name:'Save limit'}));
  await screen.findByText('0 · New requests blocked');
  expect(writes[0]).toEqual({requests_per_minute:0,expected_revision:'0'});
  await user.click(screen.getByRole('button',{name:'Edit limit'}));await user.clear(screen.getByLabelText('Limit'));await user.click(screen.getByRole('button',{name:'Save limit'}));
  await screen.findByText('Unlimited');
  expect(writes[1]).toEqual({requests_per_minute:null,expected_revision:'9007199254740993'});
});
it('requires reloading a conflicting policy before another write',async()=>{
  let reads=0;let writes=0;
  vi.stubGlobal('fetch',vi.fn(async(_path,init)=>{
    if(init.method==='PUT'){writes++;return Response.json({error:{message:'Stale'}},{status:409});}
    reads++;return Response.json({data:{requests_per_minute:reads===1?null:20,revision:reads===1?'0':'2'}});
  }));
  render(<CredentialRequestLimit token="member" vendorId="credential"/>);const user=userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Edit limit'}));await user.type(screen.getByLabelText('Limit'),'10');await user.click(screen.getByRole('button',{name:'Save limit'}));
  await screen.findByText('This limit changed. Reload the saved limit before trying again.');
  expect(screen.getByLabelText('Limit').hasAttribute('disabled')).toBe(true);
  await user.click(screen.getByRole('button',{name:'Cancel'}));
  await user.click(screen.getByRole('button',{name:'Edit limit'}));
  expect(screen.getByText('This limit changed. Reload the saved limit before trying again.')).toBeTruthy();
  expect(screen.getByLabelText('Limit').hasAttribute('disabled')).toBe(true);
  await user.click(screen.getByRole('button',{name:'Reload limit'}));
  await waitFor(()=>expect((screen.getByLabelText('Limit') as HTMLInputElement).value).toBe('20'));
  expect(writes).toBe(1);
  expect(screen.getByRole('button',{name:'Save limit'}).hasAttribute('disabled')).toBe(true);
});
