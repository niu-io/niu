import {render,screen} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {MemoryRouter} from 'react-router';
import {OrganizationSettings} from '../../src/features/organization/page';
import type {DashboardContext} from '../../src/app/dashboard-context';

function context(kind:'installation'|'operator', organization='company-a', platformAdmin=false) {
  return {token:'fixture-session',organization:{id:organization,name:'Example company'},workspaces:[],
    session:{kind,operator:kind==='operator'?{role:'owner',project_id:null}:null,permissions:{read:true,write:true,platform_admin:platformAdmin}},
    createWorkspace:vi.fn()} as unknown as DashboardContext;
}
describe('pricing ownership',()=>{
  it.each([['operator',false],['operator',true],['installation',false]] as const)('keeps media pricing out of organization settings for %s (admin=%s)',(kind,platformAdmin)=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    render(<MemoryRouter><OrganizationSettings context={context(kind,'company-a',platformAdmin)}/></MemoryRouter>);
    expect(screen.queryByRole('region',{name:'Media selling rates'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Publish selling rate'})).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
