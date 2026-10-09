import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MediaRatePublisher from '../../../src/features/provider-business/MediaRatePublisher';
import type { SupplierMediaRateRecord } from '../../../../../sdks/javascript/src/admin';

const offer = '9c9d4c10-710e-447f-a37b-ae4894a606d4';
const endpoint = '/admin/v1/providers/supplier-a';
const model = {model_alias:'fixture-video',api_key_name:'Video credential',offer_revision:offer,vendor_revision:'4',model_revision:'2',schema_revision:'schema-2',channel:'ark-direct-v1',resolutions:['720p'],reference_video:false};
async function fillNew(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByLabelText('Model'));
  await user.click(screen.getByRole('menuitemradio', {name:'fixture-video · Video credential'}));
  await user.click(screen.getByLabelText('Resolution'));
  await user.click(screen.getByRole('menuitemradio', {name:'720p'}));
  await user.click(screen.getByLabelText('Unit price'));
  await user.paste('0.00000007');
  await user.click(screen.getByLabelText('Billing unit'));
  await user.paste('video_tokens');
  await user.click(screen.getByLabelText('Units per price'));
  await user.paste('1000000');
}

describe('Supplier media rate publication', () => {
  it('discards model pagination from a previous Supplier', async () => {
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

  it('publishes exact purchase terms bound to named choices with scoped discount rules', async () => {
    const writes: {path:string;body:Record<string,any>}[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if(init?.method === 'POST') {writes.push({path:String(input),body:JSON.parse(String(init.body))});return Response.json({data:{revision:'saved'}});}
      return Response.json({data:[model],has_more:false,next_after:null});
    }));
    const user = userEvent.setup();
    const saved = vi.fn();
    render(<MediaRatePublisher token="fixture" supplier="supplier-a" onClose={vi.fn()} onSaved={saved} />);
    await fillNew(user);
    expect((screen.getByRole('checkbox', {name:'With video reference'}) as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).not.toContain(offer);
    await user.click(screen.getByRole('button',{name:'Add discount'}));
    await user.click(screen.getByLabelText('Price multiplier 1'));
  await user.paste('0.8');
    await user.click(screen.getByRole('button',{name:'Publish rate',exact:true}));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(writes).toHaveLength(1);
    const body = writes[0].body;
    expect(writes[0].path).toBe(`${endpoint}/media-rates`);
    expect(body.offer_revision).toBe(offer);
    expect(body.vendor_revision).toBe(4);
    expect(body.model_revision).toBe(2);
    expect(body.schema_revision).toBe('schema-2');
    expect(body.tariff.amount_units).toBe(70);
    expect(body.tariff.dimensions).toEqual({model:'fixture-video',channel:'ark-direct-v1',resolution:'720p',reference_video:false});
    expect(body.tariff.per_quantity).toEqual({numerator:'1000000',denominator:'1'});
    expect(body.discounts[0]).toMatchObject({offer,customer:null,dimensions:body.tariff.dimensions,priority:0,stacking:'Exclusive',multiplier:{numerator:'8',denominator:'10'},effective_from:body.tariff.effective_from,effective_until:null});
    expect(body).not.toHaveProperty('customer_charge');
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
    expect((screen.getByLabelText('Unit price') as HTMLInputElement).disabled).toBe(true);
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
    const q = (value:string) => ({numerator:value,denominator:'1'});
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
      expect((await screen.findByRole('alert')).textContent).toContain('use Replace rate');
      expect(writes).toHaveLength(0);
      expect(saved).not.toHaveBeenCalled();
      expect((screen.getByLabelText('Unit price') as HTMLInputElement).disabled).toBe(false);
    }
  });

  it('replaces against the original revision with fixed dimensions and explicit new pricing', async () => {
    const q = (value:string) => ({numerator:value,denominator:'1'});
    const previous: SupplierMediaRateRecord = {card:{revision:'previous-private',offer_revision:offer,vendor_revision:'4',model_revision:'2',schema_revision:'schema-2',tariff:{revision:'previous-price',dimensions:{model:'fixture-video',channel:'ark-direct-v1',resolution:'720p',reference_video:false},meter:'video_tokens',currency:'CNY',decimal_places:9,amount_units:'40000000000',per_quantity:q('1000000'),minimum_quantity:q('0'),rounding:'Up',effective_from:'0',effective_until:null},discounts:[]},retirement_effective_until:null,created_at:null};
    const writes: {path:string;body:Record<string,any>}[]=[];
    vi.stubGlobal('fetch',vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if(init?.method === 'POST') {writes.push({path:String(input),body:JSON.parse(String(init.body))});return Response.json({data:{revision:'replacement'}});}
      return Response.json({data:[model],has_more:false,next_after:null});
    }));
    const user = userEvent.setup();
    const saved = vi.fn();
    render(<MediaRatePublisher token="fixture" supplier="supplier-a" previous={previous} onClose={vi.fn()} onSaved={saved} />);
    await waitFor(() => expect(screen.getByLabelText('Model').textContent).toContain('fixture-video · Video credential'));
    expect((screen.getByLabelText('Model') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Resolution') as HTMLButtonElement).disabled).toBe(true);
    await user.clear(screen.getByLabelText('Unit price'));
    await user.click(screen.getByLabelText('Unit price'));
  await user.paste('80.000000000');
    await user.click(screen.getByLabelText('Monetary decimal places'));
    await user.click(screen.getByRole('menuitemradio',{name:'0',exact:true}));
    await user.click(screen.getByRole('button',{name:'Publish replacement'}));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(writes[0].path).toBe(`${endpoint}/media-rates/replace`);
    expect(writes[0].body.previous_revision).toBe(previous.card.revision);
    expect(writes[0].body.rate.tariff.dimensions).toEqual(previous.card.tariff.dimensions);
    expect(writes[0].body.rate.tariff.amount_units).toBe(80);
    expect(writes[0].body.rate.tariff.decimal_places).toBe(0);
    expect(document.body.textContent).not.toContain(previous.card.revision);
  });
});
