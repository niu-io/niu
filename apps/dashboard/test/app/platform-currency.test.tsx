import {expect,it,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {PlatformCurrencyProvider,usePlatformCurrency} from '../../src/app/platform-currency';
import {PlatformCurrencySetting} from '../../src/features/platform-settings/platform-currency';
function ReadCurrency(){const {currency,error}=usePlatformCurrency();return <p data-testid="currency">{currency||error}</p>;}
it('loads the durable currency without a USD fallback',async()=>{
 let resolve!:(value:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(done=>{resolve=done;})));
 render(<PlatformCurrencyProvider><ReadCurrency/></PlatformCurrencyProvider>);
 expect(screen.getByTestId('currency').textContent).toBe('');
 resolve(Response.json({data:{currency:'CNY'}}));
 await waitFor(()=>expect(screen.getByTestId('currency').textContent).toBe('CNY'));
});
it('configures once in Admin and removes the input after saving',async()=>{
 let saved:string|null=null;const writes:unknown[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,init?:RequestInit)=>{
  if(init?.method==='PUT'){const body=JSON.parse(String(init.body));writes.push(body);saved=body.currency;}
  return Response.json({data:{currency:saved}});
 }));
 const user=userEvent.setup();
 render(<PlatformCurrencyProvider><PlatformCurrencySetting token="test"/></PlatformCurrencyProvider>);
 await user.click(await screen.findByRole('button',{name:'Currency',exact:true}));
 await user.type(screen.getByRole('textbox',{name:'Search currencies'}),'cny');
 await user.click(screen.getByRole('menuitemradio',{name:/Chinese Yuan/}));
 await user.click(screen.getByRole('button',{name:'Save currency'}));
 expect(writes).toEqual([]);
 await user.click(screen.getByRole('button',{name:'Confirm currency'}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Save currency'})).toBeNull());
 expect(writes).toEqual([{currency:'CNY'}]);
 expect(screen.getByText(/Chinese Yuan \(CNY\) · ¥/)).toBeTruthy();
});
it('does not invent a currency when storage is unavailable',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:503})));
 render(<PlatformCurrencyProvider><ReadCurrency/></PlatformCurrencyProvider>);
 await screen.findByText('Platform currency is unavailable.');
 expect(screen.getByTestId('currency').textContent).not.toContain('USD');
});

it('offers retry instead of initial setup when configuration cannot load',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValue(Response.json({data:{currency:'USD'}}));vi.stubGlobal('fetch',fetcher);
 const user=userEvent.setup();render(<PlatformCurrencyProvider><PlatformCurrencySetting token="test"/></PlatformCurrencyProvider>);
 await screen.findByText('Could not load the platform currency.');expect(screen.queryByRole('button',{name:'Currency',exact:true})).toBeNull();
 await user.click(screen.getByRole('button',{name:'Retry'}));await screen.findByText(/US Dollar \(USD\) · \$/);
});
