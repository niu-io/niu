import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router';
import {TextStandardEditor} from '../../../app/features/retail-pricing/text-editor';
import type {RetailPriceRecord} from '@niu-io/sdk/admin';
vi.mock('../../../app/shell/platform-currency',()=>({usePlatformCurrency:()=>({currency:'USD'})}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('publishes existing text prices without requiring an explanatory note',async()=>{
 const previous={model_alias:'fixture',currency:'USD',version:'1',schedule:{kind:'text',prompt_rate:'1000000000',completion_rate:'2000000000',request_fee_nanos:'0',minimum_charge_nanos:'0',context_tiers:[]}} as RetailPriceRecord;
 const fetchMock=vi.fn().mockResolvedValue(Response.json({data:{price_id:'fixture',revision:'fixture',version:'2'}}));vi.stubGlobal('fetch',fetchMock);
 const saved=vi.fn();render(<MemoryRouter><TextStandardEditor token="fixture" previous={previous} onClose={()=>{}} onSaved={saved}/></MemoryRouter>);
 expect((screen.getByLabelText('Note (optional)') as HTMLInputElement).value).toBe('');
 await userEvent.setup().click(screen.getByRole('button',{name:'Publish standard price'}));
 await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
 expect(JSON.parse(fetchMock.mock.calls[0][1].body).reason).toBe('');
});

it('requires explicit confirmation before publishing a zero customer rate', async () => {
  const previous = {
    model_alias: 'qiniu/deepseek-v4.1-flash',
    currency: 'USD',
    version: '1',
    schedule: { kind: 'text', prompt_rate: '0', completion_rate: '0', request_fee_nanos: '0', minimum_charge_nanos: '0', context_tiers: [] },
  } as RetailPriceRecord;
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { price_id: 'p1', revision: 'r2', version: '2' } }));
  vi.stubGlobal('fetch', fetchMock);
  const saved = vi.fn();
  const user = userEvent.setup();
  render(<MemoryRouter><TextStandardEditor token="fixture" previous={previous} onClose={() => {}} onSaved={saved} /></MemoryRouter>);
  const submit = screen.getByRole('button', { name: 'Publish standard price' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  await user.click(screen.getByRole('checkbox', { name: /confirm this \$0\.00/i }));
  expect(submit.disabled).toBe(false);
  await user.click(submit);
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
});
