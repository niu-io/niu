import {act,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe,it,expect,vi} from 'vitest';
import AccountProfile from '../../src/features/account/AccountProfile';
const profile={name:'Example member',email:'member@example.test',avatar_data_url:null,revision:0};

describe('account profile',()=>{
  it('recovers from a failed photo decode without losing profile edits',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:profile})));
    const decode=vi.fn().mockRejectedValue(new Error('Invalid image'));
    vi.stubGlobal('createImageBitmap',decode);
    render(<AccountProfile token="session" onSaved={vi.fn()}/>);
    const user=userEvent.setup();
    await waitFor(()=>expect((screen.getByLabelText('Display name') as HTMLInputElement).disabled).toBe(false));
    await user.type(screen.getByLabelText('Display name'),' edited');
    const picker=screen.getByLabelText('Upload profile photo') as HTMLInputElement;
    const photo=new File(['invalid image'],'photo.png',{type:'image/png'});
    await user.upload(picker,photo);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not process that image');
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Example member edited');
    expect((screen.getByRole('button',{name:'Change photo'}) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button',{name:'Save changes'}) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button',{name:'Remove photo'})).toBeNull();
    expect(picker.value).toBe('');
    await user.upload(picker,photo);
    await waitFor(()=>expect(decode).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not process that image');
  });

  it('releases a decoded photo without updating a closed profile form',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:profile})));
    let finish!: (bitmap:ImageBitmap)=>void;
    vi.stubGlobal('createImageBitmap',vi.fn(()=>new Promise<ImageBitmap>(resolve=>{finish=resolve;})));
    const view=render(<AccountProfile token="session" onSaved={vi.fn()}/>);
    await waitFor(()=>expect((screen.getByLabelText('Display name') as HTMLInputElement).disabled).toBe(false));
    await userEvent.setup().upload(screen.getByLabelText('Upload profile photo'),new File(['photo'],'photo.png',{type:'image/png'}));
    expect(screen.getByRole('button',{name:'Processing…'})).toBeTruthy();
    view.unmount();
    const close=vi.fn();
    const draw=vi.spyOn(HTMLCanvasElement.prototype,'getContext');
    await act(async()=>{finish({close,width:256,height:256} as unknown as ImageBitmap);});
    expect(close).toHaveBeenCalledOnce();
    expect(draw).not.toHaveBeenCalled();
    draw.mockRestore();
  });

  it('aborts a pending profile save when Settings closes and ignores its late response',async()=>{
    let finish!: (response:Response)=>void;
    let saveSignal:AbortSignal | undefined;
    const saved=vi.fn();
    vi.stubGlobal('fetch',vi.fn<typeof fetch>(async(_url,init)=>{
      if (init?.method==='PUT') {
        saveSignal=init.signal as AbortSignal;
        return new Promise<Response>(resolve=>{finish=resolve;});
      }
      return Response.json({data:profile});
    }));
    const view=render(<AccountProfile token="session" onSaved={saved}/>);
    const user=userEvent.setup();
    await waitFor(()=>expect((screen.getByLabelText('Display name') as HTMLInputElement).disabled).toBe(false));
    await user.type(screen.getByLabelText('Display name'),' edited');
    await user.click(screen.getByRole('button',{name:'Save changes'}));
    expect(saveSignal?.aborted).toBe(false);
    view.unmount();
    expect(saveSignal?.aborted).toBe(true);
    await act(async()=>{finish(Response.json({data:{...profile,name:'Late response',revision:1}}));});
    expect(saved).not.toHaveBeenCalled();
  });

  it('blocks stale saves until the latest profile has been reloaded',async()=>{
    let current=profile;
    const fetcher=vi.fn<typeof fetch>(async(_url,init)=>init?.method==='PUT'
      ? Response.json({error:{message:'Conflict'}},{status:409})
      : Response.json({data:current}));
    vi.stubGlobal('fetch',fetcher);
    render(<AccountProfile token="session" onSaved={vi.fn()}/>);
    const user=userEvent.setup();
    await waitFor(()=>expect((screen.getByLabelText('Display name') as HTMLInputElement).disabled).toBe(false));
    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'),'My edit');
    await user.click(screen.getByRole('button',{name:'Save changes'}));
    expect((await screen.findByRole('alert')).textContent).toContain('changed elsewhere');
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('My edit');
    expect((screen.getByRole('button',{name:'Save changes'}) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button',{name:'Save changes'}));
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='PUT')).toHaveLength(1);
    current={...profile,name:'Latest profile',revision:2};
    await user.click(screen.getByRole('button',{name:'Reload profile'}));
    await waitFor(()=>expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Latest profile'));
    await user.type(screen.getByLabelText('Display name'),' edit');
    expect((screen.getByRole('button',{name:'Save changes'}) as HTMLButtonElement).disabled).toBe(false);
  });

  it('loads the durable profile, saves edits, and updates the account identity only on success',async()=>{
    const saved=vi.fn();let stored=profile;let fail=true;
    const fetcher=vi.fn<typeof fetch>(async(_url,init)=>{
      if (init?.method==='PUT') {
        if(fail)return Response.json({error:{message:'Unavailable'}},{status:503});
        const input=JSON.parse(String(init.body));
        expect(input).toEqual({name:'Updated member',avatar_data_url:null,expected_revision:0});
        stored={...stored,name:input.name,revision:1};
      }
      return Response.json({data:stored});
    });
    vi.stubGlobal('fetch',fetcher);
    const first=render(<AccountProfile token="session" onSaved={saved}/>);
    const user=userEvent.setup();
    const name=await screen.findByLabelText('Display name');
    await waitFor(()=>expect((name as HTMLInputElement).disabled).toBe(false));
    await user.clear(name);await user.type(name,'Updated member');
    await user.click(screen.getByRole('button',{name:'Save changes'}));
    await screen.findByRole('alert');expect((name as HTMLInputElement).value).toBe('Updated member');expect(saved).not.toHaveBeenCalled();
    fail=false;await user.click(screen.getByRole('button',{name:'Save changes'}));
    await screen.findByText('Profile saved.');expect(saved).toHaveBeenCalledWith(stored);
    first.unmount();render(<AccountProfile token="session" onSaved={saved}/>);
    await waitFor(()=>expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Updated member'));
    expect((screen.getByLabelText('Email') as HTMLInputElement).readOnly).toBe(true);
  });
  it('rejects unsupported photos without replacing the current profile',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:profile})));
    render(<AccountProfile token="session" onSaved={vi.fn()}/>);
    const user=userEvent.setup({applyAccept:false});
    await waitFor(()=>expect((screen.getByLabelText('Display name') as HTMLInputElement).disabled).toBe(false));
    await user.upload(screen.getByLabelText('Upload profile photo'),new File(['<svg/>'],'photo.svg',{type:'image/svg+xml'}));
    expect((await screen.findByRole('alert')).textContent).toContain('PNG, JPEG, or WebP');
    expect(screen.queryByRole('button',{name:'Remove photo'})).toBeNull();
    const picker=screen.getByLabelText('Upload profile photo') as HTMLInputElement;
    expect(picker.value).toBe('');
    expect(picker.files?.length).toBe(0);
    await user.upload(picker,new File(['<svg/>'],'photo.svg',{type:'image/svg+xml'}));
    expect((await screen.findByRole('alert')).textContent).toContain('PNG, JPEG, or WebP');
    expect(picker.value).toBe('');
  });
  it('lets users recover a failed profile read',async()=>{
    let fail=true;
    vi.stubGlobal('fetch',vi.fn(async()=>fail?Response.json({}, {status:503}):Response.json({data:profile})));
    render(<AccountProfile token="session" onSaved={vi.fn()}/>);
    const user=userEvent.setup();await screen.findByRole('alert');fail=false;
    await user.click(screen.getByRole('button',{name:'Reload profile'}));
    await waitFor(()=>expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Example member'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('keeps cached profile controls disabled until a failed server read is recovered',async()=>{
    let fail=true;
    const fetcher=vi.fn(async()=>fail?Response.json({}, {status:503}):Response.json({data:profile}));
    vi.stubGlobal('fetch',fetcher);
    render(<AccountProfile token="session" initialProfile={profile} onSaved={vi.fn()}/>);
    const user=userEvent.setup();
    await screen.findByRole('alert');
    expect((screen.getByLabelText('Display name') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button',{name:'Change photo'}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button',{name:'Save changes'}) as HTMLButtonElement).disabled).toBe(true);
    fail=false;
    await user.click(screen.getByRole('button',{name:'Reload profile'}));
    await waitFor(()=>expect((screen.getByLabelText('Display name') as HTMLInputElement).disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

});


it('discards unsaved profile edits without writing to the server',async()=>{
 const fetcher=vi.fn(async()=>Response.json({data:{...profile,avatar_data_url:'data:image/png;base64,example'}}));
 vi.stubGlobal('fetch',fetcher);
 render(<AccountProfile token="session" onSaved={vi.fn()}/>);
 const user=userEvent.setup();
 const name=screen.getByLabelText('Display name') as HTMLInputElement;
 await waitFor(()=>expect(name.disabled).toBe(false));
 await user.type(name,' edited');
 await user.click(screen.getByRole('button',{name:'Remove photo'}));
 await user.click(screen.getByRole('button',{name:'Cancel',exact:true}));
 expect(name.value).toBe(profile.name);
 expect(document.activeElement).toBe(name);
 expect(screen.getByRole('button',{name:'Remove photo'})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Cancel',exact:true})).toBeNull();
 expect((screen.getByRole('button',{name:'Save changes'}) as HTMLButtonElement).disabled).toBe(true);
 expect(fetcher).toHaveBeenCalledTimes(1);
});
