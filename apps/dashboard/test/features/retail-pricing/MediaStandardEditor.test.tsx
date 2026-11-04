// Refs #102: use configured media choices, preserve exact prices and retry identity.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import {useState} from 'react';
import { MediaStandardEditor } from '../../../app/features/retail-pricing/media-editor';
import type {RetailPriceRecord} from '@niu-io/sdk/admin';
vi.mock('../../../app/shell/platform-currency', () => ({ usePlatformCurrency: () => ({ currency: 'USD' }) }));
const media = { channel: 'ark-direct-v1', resolutions: ['720p', '1080p'], reference_video: true, meter: 'video_tokens' };
function editor() { const onSaved = vi.fn(); render(<MemoryRouter><MediaStandardEditor token="fixture" previous={null} onClose={vi.fn()} onSaved={onSaved}/></MemoryRouter>); return onSaved; }
describe('Media standard price choices', () => {
  it('submits configured dimensions and exact decimal prices, retaining the same retry', async () => {
    const writes: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_input, init) => {
      if (init?.method === 'POST') { writes.push(init.body); return writes.length === 1 ? Response.json({data:{price_id:'saved',revision:'revision',version:'invalid'}}) : Response.json({data:{price_id:'saved',revision:'revision',version:'1'}}); }
      return Response.json({data:[{model_alias:'video',media},{model_alias:'text',media:null}],next_after:null});
    }));
    const user = userEvent.setup(); const saved = editor();
    await waitFor(()=>expect(screen.getByRole('button',{name:'Media standard model'}).hasAttribute('disabled')).toBe(false));
    await user.click(screen.getByRole('button',{name:'Media standard model'}));
    expect(screen.queryByRole('menuitemradio',{name:'text',exact:true})).toBeNull();
    await user.click(screen.getByRole('menuitemradio',{name:'video',exact:true}));
    await user.click(screen.getByRole('button',{name:'Media resolution'}));
    await user.click(screen.getByRole('menuitemradio',{name:'1080p'}));
    await user.click(screen.getByRole('checkbox',{name:'With reference video'}));
    await user.click(screen.getByLabelText('Selling price in USD')); await user.paste('0.00000007');
    await user.clear(screen.getByLabelText('Price per quantity'));
    await user.paste('1000000');
    expect(screen.getByRole('status').textContent).toContain('$0.00000007');
    await user.click(screen.getByRole('button',{name:'Publish media standard',exact:true}));
    await screen.findByText(/Publication response could not be confirmed/);
    await user.click(screen.getByRole('button',{name:'Retry exact publication'}));
    await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
    expect(writes[1]).toBe(writes[0]);
    expect(JSON.parse(writes[0]).reason).toBe('');
    expect(JSON.parse(writes[0]).schedule).toMatchObject({dimensions:{model:'video',channel:'ark-direct-v1',resolution:'1080p',reference_video:true},meter:'video_tokens',amount_units:'70',per_quantity:{numerator:'1000000',denominator:'1'}});
    expect(screen.queryByLabelText('Channel')).toBeNull();
    expect(screen.queryByLabelText('Billing meter')).toBeNull();
  });
  it('can close and reopen an uncertain publication without changing its retry identity', async () => {
    const writes: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_input, init) => {
      if (init?.method === 'POST') {writes.push(init.body); return writes.length === 1 ? Response.json({error:{message:'Unavailable'}},{status:503}) : Response.json({data:{price_id:'saved',revision:'revision',version:'1'}});}
      return Response.json({data:[{model_alias:'video',media}],next_after:null});
    }));
    const saved=vi.fn();
    function Fixture() {const [open,setOpen]=useState(true);return <MemoryRouter><button onClick={()=>setOpen(true)}>Resume</button><MediaStandardEditor token="fixture" previous={null} open={open} onClose={pending=>{expect(pending).toBe(true);setOpen(false);}} onSaved={saved}/></MemoryRouter>;}
    render(<Fixture/>);const user=userEvent.setup();
    await waitFor(()=>expect(screen.getByRole('button',{name:'Media standard model'}).hasAttribute('disabled')).toBe(false));
    await user.click(screen.getByRole('button',{name:'Media standard model'}));await user.click(screen.getByRole('menuitemradio',{name:'video',exact:true}));
    await user.click(screen.getByRole('button',{name:'Media resolution'}));await user.click(screen.getByRole('menuitemradio',{name:'1080p'}));
    await user.type(screen.getByLabelText('Selling price in USD'),'1');await user.click(screen.getByRole('button',{name:'Publish media standard',exact:true}));
    await screen.findByText(/Unavailable/);await user.click(screen.getAllByRole('button',{name:'Close',exact:true})[0]);
    expect(screen.queryByRole('dialog')).toBeNull();await user.click(screen.getByRole('button',{name:'Resume'}));
    await user.click(screen.getByRole('button',{name:'Retry exact publication'}));await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
    expect(writes[1]).toBe(writes[0]);
  });

  it('retains a historical rounding rule and only increases precision when the edited price needs it', async () => {
    const writes: Array<Record<string, unknown>>=[];
    vi.stubGlobal('fetch',vi.fn(async (_input,init)=>{writes.push(JSON.parse(init.body));return Response.json({data:{price_id:'saved',revision:'revision',version:'2'}});}));
    const previous={model_alias:'video',currency:'USD',version:'1',schedule:{kind:'media',dimensions:{model:'video',channel:'channel',resolution:'720p',reference_video:false},meter:'seconds',decimal_places:2,amount_units:'125',per_quantity:{numerator:'1',denominator:'1'},minimum_quantity:{numerator:'0',denominator:'1'},rounding:'Down'}} as RetailPriceRecord;
    const saved=vi.fn();render(<MemoryRouter><MediaStandardEditor token="fixture" previous={previous} onClose={()=>{}} onSaved={saved}/></MemoryRouter>);const user=userEvent.setup();
    const price=screen.getByLabelText('Selling price in USD');expect((price as HTMLInputElement).value).toBe('1.25');
    expect(screen.queryByRole('button',{name:'Advanced calculation settings'})).toBeNull();
    await user.clear(price);await user.type(price,'1.234');expect(screen.getByText(/extra decimal places increase the precision/)).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Publish media standard'}));await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
    expect(writes[0].schedule).toMatchObject({decimal_places:3,amount_units:'1234',rounding:'Down'});
  });

  it('provides a configuration remedy when no media output is registered', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[{model_alias:'text',media:null}],next_after:null})));
    editor();
    expect((await screen.findByRole('link',{name:'Configure a Provider model (opens in a new tab)'})).getAttribute('href')).toBe('/admin/providers');
    expect(screen.getByRole('button',{name:'Publish media standard',exact:true}).hasAttribute('disabled')).toBe(true);
  });
  it('does not treat unavailable metadata as an empty configuration', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{message:'Metadata unavailable'}},{status:503})));
    editor(); await screen.findByText('Metadata unavailable');
    expect(screen.queryByRole('link',{name:'Configure a Provider model (opens in a new tab)'})).toBeNull();
  });
});
