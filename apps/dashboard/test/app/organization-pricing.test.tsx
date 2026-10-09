import {render,screen,waitFor} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {MemoryRouter} from 'react-router';
import {OrganizationSettings} from '../../src/features/organization/page';
import type {DashboardContext} from '../../src/app/dashboard-context';

function context(kind:'installation'|'operator', organization='company-a', platformAdmin=false) {
  return {token:'fixture-session',organization:{id:organization,name:'Example company'},workspaces:[],
    session:{kind,operator:kind==='operator'?{role:'owner',project_id:null}:null,permissions:{read:true,write:true,platform_admin:platformAdmin}},
    createWorkspace:vi.fn()} as unknown as DashboardContext;
}
describe('organization media pricing access',()=>{
  it('does not expose platform pricing or request rates for an organization owner',()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    render(<MemoryRouter><OrganizationSettings context={context('operator')}/></MemoryRouter>);
    expect(screen.queryByRole('region',{name:'Media selling rates'})).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('loads signed-in platform pricing and unmounts it after the grant is removed',async()=>{
    const fetcher=vi.fn(async()=>Response.json({data:[]}));vi.stubGlobal('fetch',fetcher);
    const view=render(<MemoryRouter><OrganizationSettings context={context('operator','company-a',true)}/></MemoryRouter>);
    await screen.findByRole('button',{name:'Publish selling rate'});
    await waitFor(()=>expect(fetcher.mock.calls.some(call=>String(call[0]).includes('/organizations/company-a/billing/media-rates'))).toBe(true));
    view.rerender(<MemoryRouter><OrganizationSettings context={context('operator')}/></MemoryRouter>);
    expect(screen.queryByRole('region',{name:'Media selling rates'})).toBeNull();
  });
  it('loads installation pricing only for the selected organization',async()=>{
    const fetcher=vi.fn(async()=>Response.json({data:[]}));vi.stubGlobal('fetch',fetcher);
    const view=render(<MemoryRouter><OrganizationSettings context={context('installation')}/></MemoryRouter>);
    await screen.findByRole('button',{name:'Publish selling rate'});
    await waitFor(()=>expect(fetcher.mock.calls.some(call=>String(call[0]).includes('/organizations/company-a/billing/media-rates'))).toBe(true));
    view.rerender(<MemoryRouter><OrganizationSettings context={context('installation','company-b')}/></MemoryRouter>);
    await waitFor(()=>expect(fetcher.mock.calls.some(call=>String(call[0]).includes('/organizations/company-b/billing/media-rates'))).toBe(true));
  });
});
