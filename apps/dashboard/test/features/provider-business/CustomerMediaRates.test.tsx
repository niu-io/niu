import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MediaRatePublisher from '../../../src/features/provider-business/MediaRatePublisher';
import MediaRateHistory from '../../../src/features/provider-business/MediaRateHistory';
const organization = '11111111-1111-4111-8111-111111111111';
const vendor = '22222222-2222-4222-8222-222222222222';
const endpoint = `/admin/v1/organizations/${organization}/billing`;
const model = {model_alias:'Video model',api_key_name:'Video credential',vendor_id:vendor,offer_revision:'33333333-3333-4333-8333-333333333333',vendor_revision:'4',model_revision:'2',schema_revision:'schema-2',channel:'ark-direct-v1',resolutions:['720p'],reference_video:false};
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByLabelText('Model'));
  await user.click(screen.getByRole('menuitemradio',{name:'Video model · Video credential'}));
  await user.click(screen.getByLabelText('Resolution'));
  await user.click(screen.getByRole('menuitemradio',{name:'720p'}));
  await user.type(screen.getByLabelText('Unit price'),'0.00000007');
  await user.type(screen.getByLabelText('Billing unit'),'video_tokens');
  await user.type(screen.getByLabelText('Units per price'),'1000000');
  await user.type(screen.getByLabelText('Maximum billable quantity'),'200000');
  await user.type(screen.getByLabelText('Liability review reference'),'Reviewed contractual bound');
}
describe('customer media prices',()=>{
 it('publishes selling terms with explicit bounded liability and scoped discounts only to customer endpoints',async()=>{
  const writes: {path:string;body:any}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(input: RequestInfo|URL,init?:RequestInit)=>{
   if(init?.method==='POST'){writes.push({path:String(input),body:JSON.parse(String(init.body))});return Response.json({data:{revision:'saved'}});}
   expect(String(input)).toBe(`${endpoint}/media-rate-models?limit=50`);
   return Response.json({data:[model],has_more:false,next_after:null});
  }));
  const user=userEvent.setup();const saved=vi.fn();
  render(<MediaRatePublisher token="fixture" organization={organization} onClose={vi.fn()} onSaved={saved}/>);
  await fill(user);await user.click(screen.getByRole('button',{name:'Add discount'}));
  await user.type(screen.getByLabelText('Price multiplier 1'),'0.8');
  await user.click(screen.getByRole('button',{name:'Publish rate',exact:true}));
  await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(1);expect(writes[0].path).toBe(`${endpoint}/media-rates`);
  expect(writes[0].body.vendor_id).toBe(vendor);
  expect(writes[0].body.maximum_quantity).toEqual({numerator:'200000',denominator:'1'});
  expect(writes[0].body.liability_qualification_revision).toBe('Reviewed contractual bound');
  expect(writes[0].body.discounts[0].customer).toBe(organization);
  expect(writes[0].body.tariff.amount_units).toBe(70);
  expect(document.body.textContent).not.toContain(vendor);
  expect(document.body.textContent).not.toContain(model.offer_revision);
  expect(document.body.textContent).not.toContain('purchase');
 });
 it('rejects zero maximum quantity without publishing',async()=>{
  const writes=vi.fn();vi.stubGlobal('fetch',vi.fn(async(_input: RequestInfo|URL,init?:RequestInit)=>{if(init?.method==='POST')writes();return Response.json({data:[model],has_more:false,next_after:null});}));
  const user=userEvent.setup();render(<MediaRatePublisher token="fixture" organization={organization} onClose={vi.fn()} onSaved={vi.fn()}/>);
  await fill(user);await user.clear(screen.getByLabelText('Maximum billable quantity'));await user.type(screen.getByLabelText('Maximum billable quantity'),'0');
  await user.click(screen.getByRole('button',{name:'Publish rate',exact:true}));
  expect((await screen.findByRole('alert')).textContent).toContain('Quantity is outside');expect(writes).not.toHaveBeenCalled();
 });
 it('keeps read-only installation history free from write actions',async()=>{
  const q=(n:string)=>({numerator:n,denominator:'1'});
  const record={card:{revision:'44444444-4444-4444-8444-444444444444',vendor_id:vendor,offer_revision:model.offer_revision,vendor_revision:'4',model_revision:'2',schema_revision:'schema-2',maximum_quantity:q('200000'),liability_qualification_revision:'private-review',tariff:{revision:'private-price',dimensions:{model:'Video model',channel:'ark-direct-v1',resolution:'720p',reference_video:false},meter:'video_tokens',currency:'CNY',decimal_places:9,amount_units:'70',per_quantity:q('1000000'),minimum_quantity:q('0'),rounding:'Up',effective_from:'0',effective_until:null},discounts:[]},retirement_effective_until:null,created_at:null};
  vi.stubGlobal('fetch',vi.fn(async(input: RequestInfo|URL)=>{expect(String(input)).toBe(`${endpoint}/media-rates?limit=50`);return Response.json({data:[record],has_more:false,next_after:null});}));
  const user=userEvent.setup();render(<MediaRateHistory token="fixture" organization={organization} canConfigure={false}/>);
  expect((screen.getByRole('button',{name:'Publish selling rate'}) as HTMLButtonElement).disabled).toBe(true);
  await user.click(await screen.findByRole('button',{name:/View rate.*Video model/}));
  expect(screen.getByRole('dialog',{name:'Media selling rate'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Replace rate'})).toBeNull();expect(screen.queryByRole('button',{name:'End rate'})).toBeNull();
  expect(document.body.textContent).not.toContain(record.card.revision);expect(document.body.textContent).not.toContain(vendor);expect(document.body.textContent).not.toContain('private-review');
 });
});
