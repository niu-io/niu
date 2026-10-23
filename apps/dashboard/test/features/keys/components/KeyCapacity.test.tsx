import {it,expect,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeyCapacity from '@/features/keys/components/KeyCapacity';
const id='0ae5e252-2651-4c4c-a18d-cb5167b388b0';
const row={attempt_id:id,model_alias:'Example model',key_name:'Previous key',created_at:'2026-10-21T01:00:00Z',dispatched_at:'2026-10-21T01:00:01Z',completed_at:null,execution:'may_have_executed',reserved_tokens:null};
const page={data:[row],total:1,snapshot_at:'2026-10-21T01:01:00Z',next_after:null};
it('shows matched records without identifiers or destructive recovery actions',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(page)));
 const user=userEvent.setup();render(<KeyCapacity token="fixture" endpoint="/keys/key" kind="tokens"/>);
 await user.click(screen.getByRole('button',{name:'Inspect token reservations'}));
 await screen.findByText('Example model');
 expect(screen.getByText('Previous key')).toBeTruthy();
 expect(screen.getByText('Completion unconfirmed')).toBeTruthy();
 expect(screen.getByText('Unknown',{exact:true})).toBeTruthy();
 expect(document.body.textContent).not.toContain(id);
 expect(screen.queryByRole('button',{name:/release|resubmit/i})).toBeNull();
 await user.keyboard('{Escape}');
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(document.activeElement).toBe(screen.getByRole('button',{name:'Inspect token reservations'}));
});
it('continues the same lineage and prevents repeated pagination',async()=>{
 const fetcher=vi.fn(async()=>Response.json({...page,next_after:id,total:3}));vi.stubGlobal('fetch',fetcher);
 const user=userEvent.setup();render(<KeyCapacity token="fixture" endpoint="/keys/key" kind="concurrency"/>);
 await user.click(screen.getByRole('button',{name:'Inspect unresolved requests'}));
 await user.click(await screen.findByRole('button',{name:'Load more requests'}));
 await screen.findByText(/Pagination did not advance/);
 expect(fetcher.mock.calls.length).toBe(2);
 expect(screen.getAllByText('Example model')).toHaveLength(1);
});
it('shows an unavailable state rather than an empty result and retries',async()=>{
 let calls=0;vi.stubGlobal('fetch',vi.fn(async()=>++calls===1?Response.json({error:{message:'Unavailable'}},{status:503}):Response.json({...page,data:[],total:0})));
 const user=userEvent.setup();render(<KeyCapacity token="fixture" endpoint="/keys/key" kind="concurrency"/>);
 await user.click(screen.getByRole('button',{name:'Inspect unresolved requests'}));
 await user.click(await screen.findByRole('button',{name:'Retry capacity'}));
 await screen.findByText(/No matching requests remain/);
});
it('hands the selected record to the existing details view after closing the dialog',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(page)));
 const inspect=vi.fn(),user=userEvent.setup();render(<KeyCapacity token="fixture" endpoint="/keys/key" kind="tokens" onInspectRequest={inspect}/>);
 const trigger=screen.getByRole('button',{name:'Inspect token reservations'});await user.click(trigger);
 await user.click(await screen.findByRole('button',{name:'Inspect Example model request'}));
 await waitFor(()=>expect(inspect).toHaveBeenCalledWith(id,trigger));
 expect(screen.queryByRole('dialog')).toBeNull();
});
