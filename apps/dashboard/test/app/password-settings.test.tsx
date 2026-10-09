import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PasswordSettings from '../../src/features/account/PasswordSettings';

describe('password settings', () => {
  it('blocks empty submission through required fields without calling the password endpoint', async () => {
    const fetcher=vi.fn(async()=>Response.json({password_login:true}));
    vi.stubGlobal('fetch',fetcher);
    const changed=vi.fn(async()=>{});
    render(<PasswordSettings token="session" onChanged={changed}/>);
    const user=userEvent.setup();
    await user.click(await screen.findByRole('button',{name:'Change password',exact:true}));
    await user.click(screen.getByRole('button',{name:'Update password',exact:true}));
    expect((screen.getByLabelText('Current password') as HTMLInputElement).validity.valueMissing).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(changed).not.toHaveBeenCalled();
  });
  it('opens on demand, focuses the form, and discards sensitive fields on cancel', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({password_login:true})));
    render(<PasswordSettings token="session" onChanged={async()=>{}}/>);
    const user=userEvent.setup();
    const action=await screen.findByRole('button',{name:'Change password',exact:true});
    expect(screen.queryByLabelText('Current password')).toBeNull();
    await user.click(action);
    expect(document.activeElement).toBe(screen.getByLabelText('Current password'));
    await user.type(screen.getByLabelText('Current password'),'sensitive current password');
    await user.type(screen.getByLabelText('New password'),'sensitive new password');
    await user.click(screen.getByRole('button',{name:'Cancel',exact:true}));
    expect(screen.queryByLabelText('Current password')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button',{name:'Change password',exact:true}));
    await user.click(screen.getByRole('button',{name:'Change password',exact:true}));
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('checks confirmation locally, preserves rejected fields and signs out only after confirmed success', async () => {
    const user = userEvent.setup(); const changed = vi.fn(async()=>{});
    let rejected = true;
    const fetcher = vi.fn<typeof fetch>(async (input,init) => {
      if (String(input).endsWith('/config')) return Response.json({password_login:true});
      expect(init?.method).toBe('PUT');
      expect(init?.headers).toEqual({'content-type':'application/json',authorization:'Bearer niu-browser-member-session'});
      expect(JSON.parse(init!.body as string)).toEqual({current_password:' current password ',password:'new synthetic passphrase'});
      return rejected ? Response.json({}, {status:401}) : Response.json({revision:2,sign_in_required:true});
    });
    vi.stubGlobal('fetch',fetcher);
    render(<PasswordSettings token="niu-browser-member-session" onChanged={changed}/>);
    await user.click(await screen.findByRole('button',{name:'Change password',exact:true}));
    await user.type(await screen.findByLabelText('Current password'),' current password ');
    await user.type(screen.getByLabelText('New password'),'new synthetic passphrase');
    await user.type(screen.getByLabelText('Confirm new password'),'different');
    await user.click(screen.getByRole('button',{name:'Update password'}));
    expect((await screen.findByRole('alert')).textContent).toContain('do not match');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await user.clear(screen.getByLabelText('Confirm new password'));
    await user.type(screen.getByLabelText('Confirm new password'),'new synthetic passphrase');
    await user.click(screen.getByRole('button',{name:'Update password'}));
    expect((await screen.findByRole('alert')).textContent).toContain('could not be verified');
    expect(changed).not.toHaveBeenCalled();
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('new synthetic passphrase');
    rejected=false;
    await user.click(screen.getByRole('button',{name:'Update password'}));
    await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1));
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Confirm new password') as HTMLInputElement).value).toBe('');
  });
  it('recovers a failed capability read without treating it as disabled password sign-in', async () => {
    const user = userEvent.setup();
    let failed = true;
    const fetcher = vi.fn(async () => failed ? Response.json({}, {status:503}) : Response.json({password_login:true}));
    vi.stubGlobal('fetch',fetcher);
    render(<PasswordSettings token="session" onChanged={async()=>{}}/>);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load password settings');
    expect(screen.queryByText('Password sign-in is not enabled for this installation.')).toBeNull();
    failed = false;
    await user.click(screen.getByRole('button',{name:'Retry password settings'}));
    await user.click(await screen.findByRole('button',{name:'Change password',exact:true}));
    await screen.findByLabelText('Current password');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('does not offer password mutation when the backend capability is disabled', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({password_login:false})));
    const {container} = render(<PasswordSettings token="session" onChanged={async()=>{}}/>);
    await waitFor(()=>expect(fetch).toHaveBeenCalled());
    await waitFor(()=>expect(container.textContent).toBe(''));
    expect(screen.queryByText('Password sign-in is not enabled for this installation.')).toBeNull();
    expect(screen.queryByRole('button', {name:'Change password'})).toBeNull();
  });
  it('ignores a late password response after the account form unmounts', async () => {
    let resolveSave!: (response:Response)=>void;
    let signal:AbortSignal | null | undefined;
    const changed=vi.fn(async()=>{});
    vi.stubGlobal('fetch',vi.fn(async (input:RequestInfo | URL,init?:RequestInit)=> {
      if (String(input).endsWith('/config')) return Response.json({password_login:true});
      signal=init?.signal;
      return await new Promise<Response>(resolve=>{resolveSave=resolve;});
    }));
    const user=userEvent.setup();
    const view=render(<PasswordSettings token="first-member" onChanged={changed}/>);
    await user.click(await screen.findByRole('button',{name:'Change password',exact:true}));
    await user.type(await screen.findByLabelText('Current password'),'synthetic current password');
    await user.type(screen.getByLabelText('New password'),'synthetic new password');
    await user.type(screen.getByLabelText('Confirm new password'),'synthetic new password');
    await user.click(screen.getByRole('button',{name:'Update password'}));
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async()=>{resolveSave(Response.json({revision:2,sign_in_required:true}));});
    expect(changed).not.toHaveBeenCalled();
  });

});
