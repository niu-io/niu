import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { appRoutes } from '../../src/app/routes';

describe('production member browser sessions', () => {
  it('signs in, restores without a stored bearer, and retries uncertain sign-out before clearing the session', async () => {
    const user = userEvent.setup();
    let authenticated = false; let failSignOut = true;
    const calls: Array<{path:string; init?:RequestInit}> = [];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input,init) => {
      const path = String(input); calls.push({path,init});
      if (path === '/admin/v1/auth/config') return Response.json({password_login:true});
      if (path === '/admin/v1/auth/preferences') return Response.json({data:{color_mode:'system'}});
      if (path === '/admin/v1/auth/browser/login') {authenticated=true; return Response.json({session:{expires_at_unix:9999999999,revoked:false}});}
      if (path === '/admin/v1/auth/browser/logout') {
        if (failSignOut) return new Response(null,{status:503});
        authenticated=false; return new Response(null,{status:204});
      }
      if (path === '/admin/v1/session') return authenticated
        ? Response.json({data:{kind:'operator',operator:{id:'member',role:'viewer',organization_id:'org',project_id:'default'},permissions:{read:true,write:false,manage_operators:false},provider_memberships:[]}})
        : new Response(null,{status:401});
      if (path === '/healthz') return Response.json({status:'ok',model_count:0});
      if (path === '/admin/v1/workspaces') return Response.json({data:[{id:'default',name:'Default',organization_id:'org',organization_name:'Company'}]});
      if (path === '/admin/v1/organizations') return Response.json({data:[{id:'org',name:'Company'}]});
      return Response.json({data:[]});
    }));
    let router = createMemoryRouter(appRoutes,{initialEntries:['/workspaces/default/models']});
    const first = render(<RouterProvider router={router}/>);
    await user.type(await screen.findByLabelText('Email'),'member@example.test');
    await user.type(screen.getByLabelText('Password'),'unchanged member passphrase');
    expect(screen.queryByText('Could not sign in. Try again.')).toBeNull();
    await user.click(screen.getByRole('button',{name:'Sign in'}));
    await waitFor(()=>expect(router.state.location.pathname).toBe('/workspaces/default/models'));
    const login = calls.find(call=>call.path==='/admin/v1/auth/browser/login');
    expect(JSON.parse(login!.init!.body as string)).toEqual({email:'member@example.test',password:'unchanged member passphrase'});
    expect(login!.init!.cache).toBe('no-store');
    expect(calls.some(call=>call.path.startsWith('/__niu_dev/'))).toBe(false);
    const cacheKeys = Array.from({length:localStorage.length},(_,index)=>localStorage.key(index));
    expect(cacheKeys.every(key=>['niu.active-workspace','niu.navigation.workspace-path','niu-dashboard-theme','niu-dashboard-theme-owner','niu-dashboard-theme-intent'].includes(key!))).toBe(true);
    expect(Object.values(localStorage).join(' ')).not.toContain('passphrase');
    expect(Object.values(localStorage).join(' ')).not.toContain('niu-browser-member-session');
    first.unmount();
    router = createMemoryRouter(appRoutes,{initialEntries:['/workspaces/default/models']});
    render(<RouterProvider router={router}/>);
    await screen.findByRole('button',{name:'Account menu'});
    expect(screen.queryByLabelText('Password')).toBeNull();
    await user.click(screen.getByRole('button',{name:'Account menu'}));
    await user.click(screen.getByRole('menuitem',{name:'Sign out'}));
    await screen.findByRole('heading',{name:'Could not sign out'});
    expect(router.state.location.pathname).toBe('/workspaces/default/models'); expect(authenticated).toBe(true);
    failSignOut=false;
    await user.click(screen.getByRole('button',{name:'Try again'}));
    await waitFor(()=>expect(router.state.location.pathname).toBe('/login'));
    expect(authenticated).toBe(false);
    expect(calls.filter(call=>call.path==='/admin/v1/auth/browser/logout')).toHaveLength(2);
    expect(calls.filter(call=>call.path==='/admin/v1/auth/browser/logout').every(call=>!call.init?.headers)).toBe(true);
  });
});
