import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router';
import RetailPricingRoute from '../../../app/features/retail-pricing/page';
vi.mock('../../../app/shell/dashboard-context',()=>({useDashboardContext:()=>({token:'pricing-recovery-test'})}));
vi.mock('../../../app/shell/platform-currency',()=>({usePlatformCurrency:()=>({currency:'USD'})}));
vi.mock('../../../app/features/retail-pricing/unit-tariffs',()=>({BrandedUnitTariffsSection:()=>null}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('retains an uncertain price publication when the editor is closed and reopened on the page',async()=>{
 const writes: string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input,init)=>{
   if(init?.method==='POST'){writes.push(init.body);return writes.length===1?Response.json({error:{message:'Unavailable'}},{status:503}):Response.json({data:{price_id:'saved',revision:'rev',version:'1'}});}
   if(String(input).includes('/models?'))return Response.json({data:[{model_alias:'fixture',media:null}],next_after:null});
   return Response.json({data:[],next_after:null});
 }));
 render(<MemoryRouter><RetailPricingRoute/></MemoryRouter>);const user=userEvent.setup();
 await user.click(await screen.findByRole('button',{name:'Publish text price'}));
 await user.click(screen.getByRole('button',{name:'Standard price model'}));await user.click(await screen.findByRole('menuitemradio',{name:'fixture'}));
 await user.type(screen.getByLabelText('Input / 1M tokens'),'1');await user.type(screen.getByLabelText('Output / 1M tokens'),'2');
 await user.click(screen.getByRole('button',{name:'Publish standard price'}));await screen.findByText(/Unavailable/);
 await user.click(screen.getAllByRole('button',{name:'Close',exact:true})[0]);
 expect(screen.getByText(/awaiting confirmation/)).toBeTruthy();expect((screen.getByRole('button',{name:'Publish text price'}) as HTMLButtonElement).disabled).toBe(true);
 await user.click(screen.getByRole('button',{name:'Return to publication'}));await user.click(screen.getByRole('button',{name:'Retry exact publication'}));
 await screen.findByText('Text standard price published.');await waitFor(()=>expect(writes.length).toBe(2));expect(writes[1]).toBe(writes[0]);
});
