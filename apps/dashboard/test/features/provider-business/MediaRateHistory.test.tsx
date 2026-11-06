import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MediaRateHistory from '../../../app/features/provider-business/MediaRateHistory';

const endpoint = '/api/v1/providers/supplier-a/media-rates';
const revision = 'b335657a-dd32-400e-bf48-23c2a2c627c9';
const modelChoice = {model_alias:'seedance-test',api_key_name:'Video credential',offer_revision:'e0f51293-0df9-4d97-819d-680055e6acc7',vendor_revision:'1',model_revision:'1',schema_revision:'1',channel:'private-channel',resolutions:['720p'],reference_video:false,meter:'video_tokens'};
function record(overrides = {}) {
  return {
    card: {
      revision, offer_revision: 'e0f51293-0df9-4d97-819d-680055e6acc7', vendor_revision: '1', model_revision: '1', schema_revision: '1',
      tariff: {
        revision: 'private-price-revision', dimensions: { model: 'seedance-test', channel: 'private-channel', resolution: '720p', reference_video: false },
        meter: 'video_tokens', currency: 'CNY', amount_units: '9007199254740993', decimal_places: 9,
        per_quantity: { numerator: '1000000', denominator: '1' }, minimum_quantity: { numerator: '0', denominator: '1' },
        rounding: 'HalfEven', effective_from: '0', effective_until: null,
      }, discounts: [],
    }, retirement_effective_until: null, created_at: null, ...overrides,
  };
}

describe('Provider media purchase history', () => {
  it('explains network failures and lets retry recover to an empty history', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(Response.json({ data: [], has_more: false, next_after: null }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Media rates could not be loaded. Check your connection and retry.');
    expect(screen.queryByText('Failed to fetch')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No media purchase rates')).not.toBeNull();
  });

  it('preserves exact money, loads later pages and never displays internal references', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return Response.json(calls.length === 1 ? { data: [record()], has_more: true, next_after: 'next/revision' } : { data: [record({ card: { ...record().card, revision: 'later' }, retirement_effective_until: '1' })], has_more: false, next_after: null });
    }));
    const user = userEvent.setup();
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" />);
    expect(await screen.findByText('¥9007199.254740993')).not.toBeNull();
    expect(screen.queryByText(revision)).toBeNull();
    expect(screen.queryByText('private-price-revision')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Load more rates' }));
    expect(await screen.findByText('Ended')).not.toBeNull();
    expect(calls[1]).toBe(`${endpoint}?limit=50&after=next%2Frevision`);
    expect(screen.queryByRole('button', { name: 'Load more rates' })).toBeNull();
    await user.click(screen.getAllByRole('button', { name: /Details.*seedance-test/ })[0]);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('No end date')).not.toBeNull();
    expect(within(dialog).queryByText('Half to even')).toBeNull();
    expect(dialog.textContent).not.toContain('Rounding');
    expect(dialog.textContent).not.toContain('priority');
    expect(dialog.textContent).not.toContain('Stacking');
    expect(dialog.textContent).not.toContain(revision);
    expect(dialog.textContent).not.toContain('private-channel');
  });

  it('shows discounts as percentages instead of a priority and stacking rule builder', async () => {
    const discounted = record({ card: { ...record().card, discounts: [{ revision: 'discount-1', dimensions: record().card.tariff.dimensions, offer: record().card.offer_revision, customer: null, effective_from: '0', effective_until: null, priority: 7, stacking: 'Multiply', multiplier: { numerator: '4', denominator: '5' } }] } });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [discounted], has_more: false, next_after: null })));
    const user = userEvent.setup();
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" />);
    await user.click(await screen.findByRole('button', { name: /Details.*seedance-test/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/20% off/)).not.toBeNull();
    expect(dialog.textContent).not.toContain('priority');
    expect(dialog.textContent).not.toContain('Stacking');
    expect(dialog.textContent).not.toContain('multiplier');
  });

  it('records one explicit cutoff against the original rate and reloads saved history', async () => {
    const mutations: { path: string; body: { effective_until: number } }[] = [];
    let retired: number | null = null;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        mutations.push({ path: String(input), body });
        retired = body.effective_until;
        return Response.json({ data: { revision, effective_until: String(retired) } });
      }
      return Response.json({ data: [record({ retirement_effective_until: retired === null ? null : String(retired) })], has_more: false, next_after: null });
    }));
    const user = userEvent.setup();
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" />);
    await user.click(await screen.findByRole('button', { name: /Details.*seedance-test/ }));
    await user.click(screen.getByRole('button', { name: 'End rate' }));
    await user.clear(screen.getByLabelText('End date'));
    await user.type(screen.getByLabelText('End date'), '2026-10-07T12:00');
    await user.click(screen.getByRole('button', { name: 'Save end date' }));
    await waitFor(() => expect(mutations).toHaveLength(1));
    expect(mutations[0]).toEqual({ path: `${endpoint}/${revision}/retire`, body: { effective_until: Math.floor(Date.parse('2026-10-07T12:00') / 1000) } });
    expect(await screen.findByText('Rate end date saved. Existing jobs keep their original price.')).not.toBeNull();
    await user.click(await screen.findByRole('button', { name: /Details.*seedance-test/ }));
    expect(screen.queryByRole('button', { name: 'End rate' })).toBeNull();
  });

  it('edits the active rate directly from its row and saves one atomic replacement', async () => {
    const writes: { path: string; body: any }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.includes('media-rate-models') || path.includes('media-offer-models')) return Response.json({ data: [modelChoice], has_more: false, next_after: null });
      if (init?.method === 'POST') {
        writes.push({ path, body: JSON.parse(String(init.body)) });
        return Response.json({ data: { revision: 'replacement', effective_from: '1' } });
      }
      return Response.json({ data: [record()], has_more: false, next_after: null });
    }));
    const user = userEvent.setup();
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" />);
    expect(screen.queryByRole('button', { name: 'Replace rate' })).toBeNull();
    await user.click(await screen.findByRole('button', { name: /Edit rate.*seedance-test/ }));
    expect(await screen.findByRole('dialog', { name: 'Edit media rate' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publish replacement' })).toBeNull();
    expect((screen.getByLabelText('Price') as HTMLInputElement).value).toBe('9007199.254740993');
    await user.clear(screen.getByLabelText('Price'));
    await user.click(screen.getByLabelText('Price'));
    await user.paste('9007199.25');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].path).toBe(`${endpoint}/replace`);
    expect(writes[0].body.previous_revision).toBe(revision);
    expect(writes[0].body.rate.tariff.amount_units).toBe(900719925);
    expect(writes[0].body.rate.tariff.decimal_places).toBe(2);
    expect(await screen.findByText('Media rate updated. Existing jobs keep their original price.')).not.toBeNull();
  });

  it('shows read failure as an error, retries and distinguishes an empty history', async () => {
    let failed = true;
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failed) { failed = false; return Response.json({ error: { message: 'Rate history unavailable' } }, { status: 503 }); }
      return Response.json({ data: [], has_more: false, next_after: null });
    }));
    const user = userEvent.setup();
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Rate history unavailable');
    expect(screen.queryByText('No media purchase rates')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No media purchase rates')).not.toBeNull();
  });
});

describe('configured video model purchase-rate entry points', () => {
  const offerRevision = 'e0f51293-0df9-4d97-819d-680055e6acc7';
  const configured = {
    model_alias:'seedance-test', api_key_name:'Video credential',
    vendor_id:'2fba63cb-5c57-4b74-8bb7-21b14bd54b6f',
    vendor_revision:'1', model_revision:'1', schema_revision:'1', channel:'private-channel',
    offer_revision:offerRevision, offer_id:'f7f50a2d-6ee8-49a9-b41f-a27f08787a4c',
    offer_active:false, offer_qualified:false, offer_current:true, route_ready:true,
    resolutions:['720p'], reference_video:false, meter:'video_tokens',
  };
  function mock(models = [configured], rateRecords: ReturnType<typeof record>[] = []) {
    const calls: {path:string;method:string;body?:Record<string,unknown>}[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string,unknown> : undefined;
      calls.push({path, method, ...(body ? {body} : {})});
      if (path.includes('/media-offer-models')) return Response.json({data:models, has_more:false, next_after:null});
      if (path.endsWith('/authorization')) return Response.json({data:{active:true, authorization_id:'authorization'}});
      if (method === 'PATCH') return Response.json({data:{active:false}});
      return Response.json({data:rateRecords, has_more:false, next_after:null});
    }));
    return calls;
  }

  it('lists configured video models without an offer or rate and opens the one-save rate editor', async () => {
    mock();
    const user = userEvent.setup();
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" showConfiguredModels />);
    expect(await screen.findByRole('heading', {name:'Configured video models'})).toBeTruthy();
    expect(await screen.findByText('Offer paused')).toBeTruthy();
    expect(screen.getByText('Video credential')).toBeTruthy();
    expect(document.body.textContent).not.toContain(offerRevision);
    expect(document.body.textContent).not.toContain(configured.offer_id);
    await user.click(screen.getByRole('button', {name:'Set rate for seedance-test'}));
    expect(await screen.findByRole('dialog', {name:'Publish media rate'})).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('Model').textContent).toContain('seedance-test · Video credential'));
    expect(screen.getByText(/creates the offer binding/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('private-channel');
  });

  it('enables a paused bound offer directly and refreshes the configured status', async () => {
    const calls = mock();
    const user = userEvent.setup();
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" showConfiguredModels />);
    await user.click(await screen.findByRole('button', {name:'Enable offer for seedance-test'}));
    await waitFor(() => expect(calls.find(call => call.method === 'PUT')?.path).toBe(`/api/v1/providers/supplier-a/offers/${configured.offer_id}/authorization`));
    expect(calls.find(call => call.method === 'PUT')?.body).toEqual({rate_revision:offerRevision});
    expect(await screen.findByText('Offer enabled. Provider access and customer selling prices remain separate.')).toBeTruthy();
  });

  it('pauses an active offer without changing rates or customer prices', async () => {
    const calls = mock([{...configured, offer_active:true, offer_qualified:true}]);
    const user = userEvent.setup();
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" showConfiguredModels />);
    await screen.findByText('Active');
    await user.click(screen.getByRole('button', {name:'Pause offer for seedance-test'}));
    await waitFor(() => expect(calls.find(call => call.method === 'PATCH')?.path).toBe(`/api/v1/providers/supplier-a/offers/${configured.offer_id}`));
    expect(calls.find(call => call.method === 'PATCH')?.body).toEqual({active:false});
    expect(await screen.findByText('Offer paused. Existing jobs keep their original route and prices.')).toBeTruthy();
  });

  it('shows a configured model without a route and withholds the rate action', async () => {
    mock([{...configured, offer_active:false, offer_qualified:false, offer_current:false, route_ready:false, offer_id:null, offer_revision:null}]);
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" showConfiguredModels />);
    expect(await screen.findByText('Connection unavailable')).toBeTruthy();
    expect((screen.getByRole('button', {name:'Set rate for seedance-test'}) as HTMLButtonElement).disabled).toBe(true);
  });
});
