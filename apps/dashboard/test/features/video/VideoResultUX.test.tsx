import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import VideoResult from '@/features/video/VideoResult';
import type {NiuAdminClient} from '@niu-io/sdk/admin';
const scope={organizationId:'organization',projectId:'workspace'};
function fixture(availability='available') {
 const content=vi.fn(async()=>new Response(new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]),{headers:{'content-type':'video/mp4'}}));
 const retrieve=vi.fn(async()=>({data:{artifacts:[{kind:'video',availability}]}}));
 const refresh=vi.fn(async()=>new Response(new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]),{headers:{'content-type':'video/mp4'}}));
 const remove=vi.fn();
 const client={generations:()=>({tasks:{retrieve},artifacts:{content}}),refreshDashboardVideoResult:refresh,deleteDashboardVideoResults:remove} as unknown as NiuAdminClient;
 return {client,content,retrieve,refresh,remove};
}
it('shows available video automatically and revokes it when leaving the task',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:video');const revoke=vi.spyOn(URL,'revokeObjectURL');
 const f=fixture();const view=render(<VideoResult client={f.client} scope={scope} task="task" keyId="key" canWrite/>);
 await screen.findByRole('link',{name:'Download'});expect(screen.getByLabelText('Generated video')).toBeTruthy();expect(f.content).toHaveBeenCalledTimes(1);expect(f.refresh).not.toHaveBeenCalled();view.unmount();expect(revoke).toHaveBeenCalledWith('blob:video');
});
it('distinguishes expired video and hides deletion behind the result menu and confirmation',async()=>{
 const f=fixture('expired');const user=userEvent.setup();render(<VideoResult client={f.client} scope={scope} task="task" keyId="key" canWrite/>);
 await screen.findByText('Video preview expired');expect(f.content).not.toHaveBeenCalled();expect(screen.queryByText('Delete saved results')).toBeNull();
 await user.click(screen.getByRole('button',{name:'Video actions'}));await user.click(screen.getByRole('menuitem',{name:'Delete saved results'}));await screen.findByRole('dialog');expect(f.remove).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'Cancel'}));expect(f.remove).not.toHaveBeenCalled();
});
it('restores only the original task when explicitly requested',async()=>{
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:restored');const f=fixture('expired');render(<VideoResult client={f.client} scope={scope} task="task" keyId="key" canWrite/>);
 await userEvent.setup().click(await screen.findByRole('button',{name:'Restore video'}));await screen.findByRole('link',{name:'Download'});expect(f.refresh).toHaveBeenCalledWith(scope,'key','task','video',expect.objectContaining({signal:expect.any(AbortSignal)}));expect(f.refresh).toHaveBeenCalledTimes(1);
});
it('does not expose restore or delete actions without original task access',async()=>{
 const f=fixture('expired');render(<VideoResult client={f.client} scope={scope} task="task" canWrite={false}/>);await screen.findByText('Video preview expired');expect(screen.queryByRole('button',{name:'Restore video'})).toBeNull();expect(screen.queryByRole('button',{name:'Video actions'})).toBeNull();
});
it('does not automatically retry a failed preview read',async()=>{
 const f=fixture();f.content.mockRejectedValue(new Error('failed'));render(<VideoResult client={f.client} scope={scope} task="task" keyId="key" canWrite/>);await screen.findByRole('alert');await waitFor(()=>expect(f.content).toHaveBeenCalledTimes(1));expect(screen.queryByRole('link',{name:'Download'})).toBeNull();
});
