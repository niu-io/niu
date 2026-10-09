import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MediaOfferPublisher from '../../../src/features/provider-business/MediaOfferPublisher';
const vendor='d392e2a3-9983-4c50-8801-77bc5d7b01d4';
const offer='b95802b3-70d5-4d58-b455-33be672a09a5';
const model={model_alias:'fixture-video',api_key_name:'Video credential',vendor_id:vendor,vendor_revision:'4',model_revision:'2',schema_revision:'private-schema',channel:'ark-direct-v1',offer_revision:offer};
async function choose(user:ReturnType<typeof userEvent.setup>) {
 await user.click(await screen.findByLabelText('Model'));
 await user.click(screen.getByRole('menuitemradio',{name:'fixture-video · Video credential'}));
}
describe('media offer publication',()=>{
 it('uses named bindings without GUIDs or invented text prices and preserves one receipt on explicit retry',async()=>{
  const writes:{path:string;body:string}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   if(init?.method==='POST'){writes.push({path:String(input),body:String(init.body)});return writes.length===1?Response.json({error:{message:'Response unavailable'}},{status:503}):Response.json({data:{revision:'saved'}});}
   return Response.json({data:[model],has_more:false,next_after:null});
  }));
  const saved=vi.fn();const user=userEvent.setup();render(<MediaOfferPublisher token="fixture" supplier="supplier-a" onClose={vi.fn()} onSaved={saved}/>);
  await choose(user);expect(document.body.textContent).not.toContain(vendor);expect(document.body.textContent).not.toContain(offer);expect(document.body.textContent).not.toContain('private-schema');
  await user.click(screen.getByRole('button',{name:'Save offer'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Response unavailable');expect(writes).toHaveLength(1);
  expect((screen.getByLabelText('Model') as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole('button',{name:'Retry save'}));await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(2);expect(writes[1].body).toBe(writes[0].body);expect(writes[0].path).toBe('/admin/v1/providers/supplier-a/media-offers');
  const body=JSON.parse(writes[0].body);expect(body).toMatchObject({model_alias:'fixture-video',vendor_id:vendor,vendor_revision:'4',model_revision:'2',schema_revision:'private-schema',expected_revision:offer});expect(body.revision).toMatch(/^[0-9a-f-]{36}$/);expect(body).not.toHaveProperty('prompt_rate');expect(body).not.toHaveProperty('customer_price');
 });
 it('keeps draft setup available without qualification and traverses bounded model pages',async()=>{
  const paths:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{paths.push(String(input));return Response.json(paths.length===1?{data:[],has_more:true,next_after:'a/model'}:{data:[{...model,offer_revision:null}],has_more:false,next_after:null});}));
  const user=userEvent.setup();render(<MediaOfferPublisher token="fixture" supplier="supplier-a" onClose={vi.fn()} onSaved={vi.fn()}/>);
  await user.click(await screen.findByRole('button',{name:'Load more models'}));await choose(user);
  expect(paths[1]).toBe('/admin/v1/providers/supplier-a/media-offer-models?limit=50&after=a%2Fmodel');expect((screen.getByRole('button',{name:'Save offer'}) as HTMLButtonElement).disabled).toBe(false);
 });
 it('forwards exact large revisions without rounding',async()=>{
  const writes:Record<string,unknown>[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==='POST'){writes.push(JSON.parse(String(init.body)));return Response.json({data:{revision:'saved'}});}return Response.json({data:[{...model,vendor_revision:'9007199254740993',model_revision:'9223372036854775807'}],has_more:false,next_after:null});}));
  const saved=vi.fn();const user=userEvent.setup();render(<MediaOfferPublisher token="fixture" supplier="supplier-a" onClose={vi.fn()} onSaved={saved}/>);
  await choose(user);await user.click(screen.getByRole('button',{name:'Save offer'}));await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
  expect(writes[0]).toMatchObject({vendor_revision:'9007199254740993',model_revision:'9223372036854775807'});
 });
 it.each(['9223372036854775808','01','0','+1',' 1','1.5'])('rejects invalid revision %s before mutation and cancellation leaves the offer unchanged',async(revision)=>{
  const posts=vi.fn();const closed=vi.fn();
  vi.stubGlobal('fetch',vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==='POST')posts();return Response.json({data:[{...model,vendor_revision:revision}],has_more:false,next_after:null});}));
  const user=userEvent.setup();render(<MediaOfferPublisher token="fixture" supplier="supplier-a" onClose={closed} onSaved={vi.fn()}/>);
  await choose(user);await user.click(screen.getByRole('button',{name:'Save offer'}));expect((await screen.findByRole('alert')).textContent).toContain('safely');expect(posts).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button',{name:'Cancel'}));expect(closed).toHaveBeenCalledTimes(1);
 });
});
