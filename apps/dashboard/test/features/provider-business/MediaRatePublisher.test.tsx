vi.mock('../../../app/shell/platform-currency', () => ({usePlatformCurrency:()=>({currency:'CNY',error:'',reload:()=>{}})}));
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MediaRatePublisher from '../../../app/features/provider-business/MediaRatePublisher';
import type { SupplierMediaRateRecord } from '@niu-io/sdk/admin';

const offer = '9c9d4c10-710e-447f-a37b-ae4894a606d4';
const endpoint = '/api/v1/providers/supplier-a';
const model = {model_alias:'fixture-video',api_key_name:'Video credential',offer_revision:offer,vendor_revision:'4',model_revision:'2',schema_revision:'schema-2',channel:'ark-direct-v1',resolutions:['720p'],reference_video:false,meter:'video_tokens'};
const q = (value:string) => ({numerator:value,denominator:'1'});
async function fillNew(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByLabelText('Model'));
  await user.click(screen.getByRole('menuitemradio', {name:'fixture-video · Video credential'}));
  await user.click(screen.getByLabelText('Resolution'));
  await user.click(screen.getByRole('menuitemradio', {name:'720p'}));
  await user.click(screen.getByLabelText('Price'));
  await user.paste('0.00000007');
}
const previous: SupplierMediaRateRecord = {card:{revision:'previous-private',offer_revision:offer,vendor_revision:'4',model_revision:'2',schema_revision:'schema-2',tariff:{revision:'previous-price',dimensions:{model:'fixture-video',channel:'ark-direct-v1',resolution:'720p',reference_video:false},meter:'video_tokens',currency:'CNY',decimal_places:9,amount_units:'40000000000',per_quantity:q('1000000'),minimum_quantity:q('0'),rounding:'Up',effective_from:'0',effective_until:null},discounts:[]},retirement_effective_until:null,created_at:null};

describe('Provider media rate publication', () => {
  it('discards model pagination from a previous Provider', async () => {
    let resolvePage!: (value: Response) => void;
    let pageSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.includes('after=')) {
        pageSignal = init?.signal as AbortSignal;
        return new Promise<Response>(resolve => { resolvePage = resolve; });
      }
      return Response.json({data: [{...model, model_alias: path.includes('supplier-b') ? 'second-video' : 'first-video'}], has_more: !path.includes('supplier-b'), next_after: path.includes('supplier-b') ? null : 'next-page'});
    }));
    const user = userEvent.setup();
    const props = {token: 'fixture', onClose: vi.fn(), onSaved: vi.fn()};
    const view = render(<MediaRatePublisher {...props} supplier="supplier-a" />);
    await user.click(await screen.findByRole('button', {name: 'Load more models'}));
    view.rerender(<MediaRatePublisher {...props} supplier="supplier-b" />);
    await waitFor(() => expect(pageSignal?.aborted).toBe(true));
    resolvePage(Response.json({data: [{...model, model_alias: 'stale-video'}], has_more: true, next_after: 'stale-page'}));
    await user.click(await screen.findByLabelText('Model'));
    expect(await screen.findByRole('menuitemradio', {name: 'second-video · Video credential'})).toBeTruthy();
    expect(screen.queryByRole('menuitemradio', {name: /stale-video|first-video/})).toBeNull();
    expect(screen.queryByRole('button', {name: 'Load more models'})).toBeNull();
  });

  it('publishes exact purchase terms from the model billing unit with a simple discount', async () => {
    const writes: {path:string;body:Record<string,any>}[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if(init?.method === 'POST') {writes.push({path:String(input),body:JSON.parse(String(init.body))});return Response.json({data:{revision:'saved'}});}
      return Response.json({data:[model],has_more:false,next_after:null});
    }));
    const user = userEvent.setup();
    const saved = vi.fn();
    render(<MediaRatePublisher token="fixture" supplier="supplier-a" onClose={vi.fn()} onSaved={saved} />);
    await fillNew(user);
    expect(screen.getAllByText('video tokens').length).toBeGreaterThan(0);
    expect(document.querySelector('#media-rate-meter')).toBeNull();
    expect(screen.queryByLabelText('Units per price')).toBeNull();
    expect(screen.queryByLabelText('Monetary decimal places')).toBeNull();
    expect(screen.queryByLabelText('Rounding')).toBeNull();
    expect(screen.queryByLabelText('Liability review reference')).toBeNull();
    expect((screen.getByRole('checkbox', {name:'With video reference'}) as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).not.toContain(offer);
    await user.type(screen.getByLabelText('Discount (%)'),'20');
    await user.click(screen.getByRole('button',{name:'Publish rate',exact:true}));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(writes).toHaveLength(1);
    const body = writes[0].body;
    expect(writes[0].path).toBe(`${endpoint}/media-rates`);
    expect(body.offer_revision).toBe(offer);
    expect(body.vendor_revision).toBe(4);
    expect(body.model_revision).toBe(2);
    expect(body.schema_revision).toBe('schema-2');
    expect(body.tariff.amount_units).toBe(7);
    expect(body.tariff.decimal_places).toBe(8);
    expect(body.tariff.meter).toBe('video_tokens');
    expect(body.tariff.rounding).toBe('HalfEven');
    expect(body.tariff.dimensions).toEqual({model:'fixture-video',channel:'ark-direct-v1',resolution:'720p',reference_video:false});
    expect(body.tariff.per_quantity).toEqual({numerator:'1000000',denominator:'1'});
    expect(body.discounts[0]).toMatchObject({offer,customer:null,dimensions:body.tariff.dimensions,priority:0,stacking:'Exclusive',multiplier:{numerator:'4',denominator:'5'},effective_from:body.tariff.effective_from,effective_until:null});
    expect(body).not.toHaveProperty('customer_charge');
  });

  it('treats a zero discount as no discount rule', async () => {
    const writes: {body:Record<string,any>}[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if(init?.method === 'POST') {writes.push({body:JSON.parse(String(init.body))});return Response.json({data:{revision:'saved'}});}
      return Response.json({data:[model],has_more:false,next_after:null});
    }));
    const user = userEvent.setup();
    render(<MediaRatePublisher token="fixture" supplier="supplier-a" onClose={vi.fn()} onSaved={vi.fn()} />);
    await fillNew(user);
    await user.type(screen.getByLabelText('Discount (%)'),'0');
    await user.click(screen.getByRole('button',{name:'Publish rate',exact:true}));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body.discounts).toEqual([]);
  });

  it('derives a per-second billing unit from the selected model', async () => {
    const seconds = {...model, meter:'seconds', resolutions:['1080p']};
    const writes: {path:string;body:Record<string,any>}[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if(init?.method === 'POST') {writes.push({path:String(input),body:JSON.parse(String(init.body))});return Response.json({data:{revision:'saved'}});}
      return Response.json({data:[seconds],has_more:false,next_after:null});
    }));
    const user = userEvent.setup();
    render(<MediaRatePublisher token="fixture" supplier="supplier-a" onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(await screen.findByLabelText('Model'));
    await user.click(screen.getByRole('menuitemradio', {name:'fixture-video · Video credential'}));
    await user.click(screen.getByLabelText('Price'));
    await user.paste('0.05');
    expect(screen.getByText(/CNY per second/)).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Publish rate',exact:true}));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body.tariff).toMatchObject({meter:'seconds',amount_units:5,decimal_places:2,per_quantity:{numerator:'1',denominator:'1'}});
  });

  it('keeps the original document for one explicit retry after an uncertain response', async () => {
    const writes: string[] = [];
    vi.stubGlobal('fetch',vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if(init?.method === 'POST') {writes.push(String(init.body));return writes.length === 1 ? Response.json({error:{message:'Response unavailable'}},{status:503}) : Response.json({data:{revision:'saved'}});}
      return Response.json({data:[model],has_more:false,next_after:null});
    }));
    const saved = vi.fn();
    const user = userEvent.setup();
    render(<MediaRatePublisher token="fixture" supplier="supplier-a" onClose={vi.fn()} onSaved={saved} />);
    await fillNew(user);
    await user.click(screen.getByRole('button',{name:'Publish rate',exact:true}));
    expect((await screen.findByRole('alert')).textContent).toContain('Response unavailable');
    expect(writes).toHaveLength(1);
    expect((screen.getByLabelText('Price') as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByRole('button',{name:'Retry save'}));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(writes).toHaveLength(2);
    expect(writes[1]).toBe(writes[0]);
  });

  it.each([
    ['overlapping active terms', null, offer, false],
    ['retired terms', '1', offer, true],
    ['another offer', null, 'other-offer', true],
  ] as const)('checks loaded history for %s without blocking unrelated terms', async (_name, retirement, savedOffer, allowed) => {
    const record: SupplierMediaRateRecord = {card:{revision:'saved-private',offer_revision:savedOffer,vendor_revision:'4',model_revision:'2',schema_revision:'schema-2',tariff:{revision:'saved-price',dimensions:{model:'fixture-video',channel:'ark-direct-v1',resolution:'720p',reference_video:false},meter:'video_tokens',currency:'CNY',decimal_places:9,amount_units:'70',per_quantity:q('1000000'),minimum_quantity:q('0'),rounding:'Up',effective_from:'0',effective_until:null},discounts:[]},retirement_effective_until:retirement,created_at:null};
    const writes: string[] = [];
    vi.stubGlobal('fetch',vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if(init?.method === 'POST') {writes.push(String(init.body));return Response.json({data:{revision:'saved'}});}
      return Response.json({data:[model],has_more:false,next_after:null});
    }));
    const user = userEvent.setup();
    const saved = vi.fn();
    render(<MediaRatePublisher token="fixture" supplier="supplier-a" existing={[record]} onClose={vi.fn()} onSaved={saved} />);
    await fillNew(user);
    await user.click(screen.getByRole('button',{name:'Publish rate',exact:true}));
    if (allowed) {
      await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
      expect(writes).toHaveLength(1);
    } else {
      expect((await screen.findByRole('alert')).textContent).toContain('Edit that rate instead');
      expect(writes).toHaveLength(0);
      expect(saved).not.toHaveBeenCalled();
      expect((screen.getByLabelText('Price') as HTMLInputElement).disabled).toBe(false);
    }
  });

  it('updates the active rate from one plain editor without a Replace-rate ceremony', async () => {
    const writes: {path:string;body:Record<string,any>}[]=[];
    vi.stubGlobal('fetch',vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if(init?.method === 'POST') {writes.push({path:String(input),body:JSON.parse(String(init.body))});return Response.json({data:{revision:'replacement'}});}
      return Response.json({data:[model],has_more:false,next_after:null});
    }));
    const user = userEvent.setup();
    const saved = vi.fn();
    render(<MediaRatePublisher token="fixture" supplier="supplier-a" previous={previous} onClose={vi.fn()} onSaved={saved} />);
    expect(await screen.findByRole('dialog', {name:'Edit media rate'})).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('Model').textContent).toContain('fixture-video · Video credential'));
    expect((screen.getByLabelText('Model') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Resolution') as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).not.toContain('Replace');
    expect(document.body.textContent).not.toContain('Monetary decimal places');
    expect(document.body.textContent).not.toContain('Priority');
    expect(document.body.textContent).not.toContain('Stacking');
    await user.clear(screen.getByLabelText('Price'));
    await user.click(screen.getByLabelText('Price'));
    await user.paste('80.00');
    await user.click(screen.getByRole('button',{name:'Save changes'}));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(writes[0].path).toBe(`${endpoint}/media-rates/replace`);
    expect(writes[0].body.previous_revision).toBe(previous.card.revision);
    expect(writes[0].body.rate.tariff.dimensions).toEqual(previous.card.tariff.dimensions);
    expect(writes[0].body.rate.tariff.amount_units).toBe(80);
    expect(writes[0].body.rate.tariff.decimal_places).toBe(0);
    expect(writes[0].body.rate.tariff.rounding).toBe('Up');
    expect(writes[0].body.rate.tariff.meter).toBe('video_tokens');
    expect(writes[0].body.rate.tariff.per_quantity).toEqual(previous.card.tariff.per_quantity);
    expect(document.body.textContent).not.toContain(previous.card.revision);
  });

  it('preserves saved discount terms instead of exposing a priority/stacking builder', async () => {
    const discounted: SupplierMediaRateRecord = {
      ...previous,
      card: {
        ...previous.card,
        discounts: [
          {revision:'discount-a',dimensions:previous.card.tariff.dimensions,offer,customer:null,effective_from:'0',effective_until:null,priority:7,stacking:'Exclusive',multiplier:{numerator:'4',denominator:'5'}},
          {revision:'discount-b',dimensions:null,offer:null,customer:null,effective_from:'1',effective_until:null,priority:-2,stacking:'Multiply',multiplier:{numerator:'9',denominator:'10'}},
        ],
      },
    };
    const writes: {body:Record<string,any>}[]=[];
    vi.stubGlobal('fetch',vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if(init?.method === 'POST') {writes.push({body:JSON.parse(String(init.body))});return Response.json({data:{revision:'replacement'}});}
      return Response.json({data:[model],has_more:false,next_after:null});
    }));
    const user = userEvent.setup();
    render(<MediaRatePublisher token="fixture" supplier="supplier-a" previous={discounted} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByText(/saved discount terms/)).toBeTruthy();
    expect(screen.queryByLabelText('Discount (%)')).toBeNull();
    await waitFor(() => expect((screen.getByRole('button',{name:'Save changes'}) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole('button',{name:'Save changes'}));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body.rate.discounts).toEqual([
      {revision:'discount-a',dimensions:previous.card.tariff.dimensions,offer,customer:null,effective_from:0,effective_until:null,priority:7,stacking:'Exclusive',multiplier:{numerator:'4',denominator:'5'}},
      {revision:'discount-b',dimensions:null,offer:null,customer:null,effective_from:1,effective_until:null,priority:-2,stacking:'Multiply',multiplier:{numerator:'9',denominator:'10'}},
    ]);
  });
});

describe('configured video model purchase-rate setup', () => {
  const draft = {...model, offer_revision:null, offer_id:null, offer_active:false, offer_qualified:false, offer_current:false, route_ready:true, vendor_id:'2fba63cb-5c57-4b74-8bb7-21b14bd54b6f'};
  async function fillConfigured(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByLabelText('Model'));
    await user.click(screen.getByRole('menuitemradio', {name:/fixture-video · Video credential/}));
    await user.click(screen.getByLabelText('Resolution'));
    await user.click(screen.getByRole('menuitemradio', {name:'720p'}));
    await user.click(screen.getByLabelText('Price'));
    await user.paste('0.00000007');
  }

  it('creates and enables the offer in one save instead of requiring a pinning dialog', async () => {
    const calls: {path:string;method:string;body?:Record<string,unknown>}[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string,unknown> : undefined;
      calls.push({path, method, ...(body ? {body} : {})});
      if (path.includes('/media-offer-models')) return Response.json({data:[draft], has_more:false, next_after:null});
      if (path.endsWith('/media-offers')) return Response.json({data:{revision:'first-offer-revision', offer_id:'first-offer-id'}});
      if (path.endsWith('/authorization')) return Response.json({data:{active:true, authorization_id:'authorization'}});
      if (path.endsWith('/media-rates')) return Response.json({data:{revision:'saved'}});
      return Response.json({data:[]});
    }));
    const saved = vi.fn();
    const user = userEvent.setup();
    render(<MediaRatePublisher token="fixture" supplier="supplier-a" onClose={vi.fn()} onSaved={saved} />);
    await fillConfigured(user);
    expect(screen.getByRole('button', {name:'Publish rate and enable offer'})).toBeTruthy();
    expect(screen.getByText(/creates the offer binding/)).toBeTruthy();
    await user.click(screen.getByRole('button', {name:'Publish rate and enable offer'}));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(calls.filter(call => call.method !== 'GET').map(call => `${call.method} ${call.path}`)).toEqual([
      'POST /api/v1/providers/supplier-a/media-offers',
      'PUT /api/v1/providers/supplier-a/offers/first-offer-id/authorization',
      'POST /api/v1/providers/supplier-a/media-rates',
    ]);
    expect(calls.find(call => call.path.endsWith('/media-offers'))?.body).toMatchObject({
      model_alias:'fixture-video', vendor_id:draft.vendor_id, vendor_revision:'4', model_revision:'2',
      schema_revision:'schema-2', expected_revision:null,
    });
    expect(calls.find(call => call.path.endsWith('/authorization'))?.body).toEqual({rate_revision:'first-offer-revision'});
    const rate = calls.find(call => call.path.endsWith('/media-rates'))?.body;
    expect(rate?.offer_revision).toBe('first-offer-revision');
    expect(rate?.tariff).toMatchObject({meter:'video_tokens', amount_units:7, decimal_places:8});
  });

  it('keeps one offer receipt and one rate document across an explicit retry', async () => {
    const calls: {path:string;method:string;body?:Record<string,unknown>}[] = [];
    let rateWrites = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string,unknown> : undefined;
      calls.push({path, method, ...(body ? {body} : {})});
      if (path.includes('/media-offer-models')) return Response.json({data:[draft], has_more:false, next_after:null});
      if (path.endsWith('/media-offers')) return Response.json({data:{revision:'first-offer-revision', offer_id:'first-offer-id'}});
      if (path.endsWith('/authorization')) return Response.json({data:{active:true, authorization_id:'authorization'}});
      if (path.endsWith('/media-rates')) {
        rateWrites += 1;
        return rateWrites === 1 ? Response.json({error:{message:'Response unavailable'}}, {status:503}) : Response.json({data:{revision:'saved'}});
      }
      return Response.json({data:[]});
    }));
    const saved = vi.fn();
    const user = userEvent.setup();
    render(<MediaRatePublisher token="fixture" supplier="supplier-a" onClose={vi.fn()} onSaved={saved} />);
    await fillConfigured(user);
    await user.click(screen.getByRole('button', {name:'Publish rate and enable offer'}));
    expect((await screen.findByRole('alert')).textContent).toContain('Response unavailable');
    await user.click(screen.getByRole('button', {name:'Retry save'}));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(calls.filter(call => call.path.endsWith('/media-offers'))).toHaveLength(1);
    expect(calls.filter(call => call.path.endsWith('/authorization'))).toHaveLength(1);
    const rates = calls.filter(call => call.path.endsWith('/media-rates'));
    expect(rates).toHaveLength(2);
    expect(rates[1].body).toEqual(rates[0].body);
  });

  it('enables an already-bound paused offer without replacing its revision', async () => {
    const paused = {...model, vendor_id:draft.vendor_id, offer_id:'paused-offer-id', offer_active:false, offer_qualified:false, offer_current:true, route_ready:true};
    const calls: {path:string;method:string;body?:Record<string,unknown>}[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string,unknown> : undefined;
      calls.push({path, method, ...(body ? {body} : {})});
      if (path.includes('/media-offer-models')) return Response.json({data:[paused], has_more:false, next_after:null});
      if (path.endsWith('/authorization')) return Response.json({data:{active:true, authorization_id:'authorization'}});
      if (path.endsWith('/media-rates')) return Response.json({data:{revision:'saved'}});
      return Response.json({data:[]});
    }));
    const saved = vi.fn();
    const user = userEvent.setup();
    render(<MediaRatePublisher token="fixture" supplier="supplier-a" onClose={vi.fn()} onSaved={saved} />);
    await fillConfigured(user);
    await user.click(screen.getByRole('button', {name:'Publish rate and enable offer'}));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(calls.some(call => call.path.endsWith('/media-offers'))).toBe(false);
    expect(calls.find(call => call.path.endsWith('/authorization'))?.body).toEqual({rate_revision:offer});
    expect(calls.find(call => call.path.endsWith('/media-rates'))?.body?.offer_revision).toBe(offer);
  });

  it('withholds publication when the configured connection is unavailable', async () => {
    const unavailable = {...draft, route_ready:false};
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({data:[unavailable], has_more:false, next_after:null})));
    const user = userEvent.setup();
    render(<MediaRatePublisher token="fixture" supplier="supplier-a" onClose={vi.fn()} onSaved={vi.fn()} />);
    await fillConfigured(user);
    expect((screen.getByRole('button', {name:'Publish rate and enable offer'}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Provider connection is unavailable/)).toBeTruthy();
  });
});
