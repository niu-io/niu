import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishCustomerPrice, listPricingModels, listCustomerPrices, listPricingTargets, priceFromNanos, priceToNanos, readPriceHistory } from '../../../src/features/customer-pricing/api';
const target = {organization_id:'company',organization_name:'Company',workspace_id:'workspace',workspace_name:'Workspace'};
const price = {model_alias:'example/model',revision:'revision',currency:'USD',prompt_rate:'0',completion_rate:'1600000000',cached_prompt_rate:null,request_fee_nanos:'1',minimum_charge_nanos:'0',created_at:'2026-10-11T00:00:00Z'};
afterEach(() => vi.unstubAllGlobals());
describe('customer selling configuration transport', () => {
  it.each(['wrong-model','wrong-current','duplicate','missing-current'])('rejects inconsistent %s history before conflict recovery can use it', async kind => {
    const current={...price,is_current:true};
    const data=kind==='duplicate'?[current,current]:kind==='missing-current'?[{...current,revision:'older',is_current:false}]:[{...current,...(kind==='wrong-model'?{model_alias:'different/model'}:{is_current:false})}];
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data,current_revision:price.revision,has_more:false,next_before:null})));
    await expect(readPriceHistory('test',target,price.model_alias)).rejects.toThrow();
  });
  it('allows older history pages to omit the current revision',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[{...price,revision:'older',is_current:false}],current_revision:price.revision,has_more:false,next_before:null})));
    expect((await readPriceHistory('test',target,price.model_alias,'boundary')).data).toHaveLength(1);
  });
  it('treats server failure as an unconfirmed write and retains explicit conflict status', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{message:'Server failure'}},{status:503})));
    await expect(publishCustomerPrice('test',target,{...price,expected_revision:price.revision})).rejects.toThrow('Publication could not be confirmed');
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{message:'Conflict'}},{status:409})));
    await expect(publishCustomerPrice('test',target,{...price,expected_revision:price.revision})).rejects.toMatchObject({status:409});
  });
  it('rejects token rates above their contract bound before dispatch, independently of fixed fees', async () => {
    const fetch = vi.fn(async () => Response.json({data:{revision:'new-revision'}}));vi.stubGlobal('fetch',fetch);
    await expect(publishCustomerPrice('test',target,{...price,prompt_rate:'1000000000000001',expected_revision:price.revision})).rejects.toThrow('Token prices');
    expect(fetch).not.toHaveBeenCalled();
    await expect(publishCustomerPrice('test',target,{...price,prompt_rate:'1000000000000000',request_fee_nanos:'9223372036854775807',expected_revision:price.revision})).resolves.toMatchObject({data:{revision:'new-revision'}});
  });
  it.each([{}, {data:{}}, {data:{revision:'revision'}}])('does not confirm publication from an invalid or unchanged revision', async response => {
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json(response)));
    await expect(publishCustomerPrice('test',target,{...price,expected_revision:price.revision})).rejects.toThrow('Publication could not be confirmed');
  });
  it('discovers platform token models across enabled credentials without including video routes', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => Response.json({data:String(input)==='/admin/v1/vendors'?[{id:'one',enabled:true},{id:'two',enabled:true},{id:'disabled',enabled:false}]:String(input).includes('/one/')?[{alias:'text',enabled:true,capabilities:{}},{alias:'video',enabled:true,capabilities:{video_schema:{}}}]:[{alias:'text',enabled:true,capabilities:{}},{alias:'other',enabled:true,capabilities:{}},{alias:'disabled-model',enabled:false,capabilities:{}}]}));
    vi.stubGlobal('fetch',fetch);
    expect(await listPricingModels('test')).toEqual(['other','text']);
    expect(fetch.mock.calls.some(([path])=>String(path).includes('/disabled/'))).toBe(false);
  });
  it('round trips exact decimal prices including zero and the maximum without floating point', () => {
    for (const [decimal,nanos] of [['0','0'],['0.000000001','1'],['9223372036.854775807','9223372036854775807']]) {
      expect(priceToNanos(decimal)).toBe(nanos);
      expect(priceFromNanos(nanos)).toBe(decimal);
    }
    expect(() => priceToNanos('9223372036.854775808')).toThrow();
    expect(() => priceToNanos('0.0000000001')).toThrow();
    expect(() => priceToNanos('-1')).toThrow();
  });
  it('keeps named target discovery on the platform-only endpoint', async () => {
    const fetch = vi.fn(async () => Response.json({data:[target],next_after:null}));
    vi.stubGlobal('fetch',fetch);
    expect((await listPricingTargets('test')).data).toEqual([target]);
    expect(fetch.mock.calls[0][0]).toBe('/admin/v1/pricing/targets?limit=50');
  });
  it('rejects a continuation cursor that does not advance', async () => {
    vi.stubGlobal('fetch',vi.fn(async () => Response.json({data:[price],next_after:'unchanged'})));
    await expect(listCustomerPrices('test',target,'unchanged')).rejects.toThrow('did not advance');
  });
  it.each(['overflow','currency','amount'])('rejects invalid %s prices before they reach an editor', async kind => {
    const row = {...price, ...(kind === 'overflow' ? {prompt_rate:'9223372036854775808'} : kind === 'currency' ? {currency:'bad'} : {prompt_rate:0})};
    vi.stubGlobal('fetch',vi.fn(async () => Response.json({data:[row],next_after:null})));
    await expect(listCustomerPrices('test',target)).rejects.toThrow('could not be read');
  });
  it('reads price history without customer billing content and rejects inconsistent pagination', async () => {
    const fetch = vi.fn(async () => Response.json({data:[{...price,is_current:true}],current_revision:'revision',has_more:true,next_before:null}));
    vi.stubGlobal('fetch',fetch);
    await expect(readPriceHistory('test',target,'example/model')).rejects.toThrow('could not be read');
    expect(fetch.mock.calls[0][0]).toBe('/admin/v1/pricing/organizations/company/workspaces/workspace/tariffs/example%2Fmodel/history?limit=50');
  });
});
