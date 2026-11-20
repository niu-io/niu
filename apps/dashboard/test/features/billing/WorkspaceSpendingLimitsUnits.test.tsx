vi.mock('../../../app/shell/platform-currency',()=>({usePlatformCurrency:()=>({currency:'CNY',billingMode:'credits',unit:null,error:'',reload:()=>{}})}));
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkspaceSpendingLimits from '../../../app/features/billing/WorkspaceSpendingLimits';

afterEach(() => {cleanup();vi.unstubAllGlobals();});

const account = {currency:'CNY',committed_nanos:'0',limit_nanos:null,revision:null};
const unitLimit = {
  unit:{definition_revision:'credits-v1',name:'Credits',display_precision:2,atoms_per_unit:'1000000000'},
  limit_atoms:null,
  revision:null,
  definition_revision:null,
  committed_atoms:'0',
  remaining_atoms:null,
  monetary_limit_preserved:false,
  credits_admission_blocked_by_monetary_limit:false,
};

describe('workspace Credits spending controls', () => {
  it('surfaces a failed Credits limit read and retries without discarding loaded limits', async () => {
    let unitReads = 0;
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/spending-limit')) return Response.json({data:[account]});
      if (url.endsWith('/units/limit')) {
        unitReads += 1;
        return unitReads === 1
          ? Response.json({error:{message:'unavailable'}},{status:503})
          : Response.json({data:unitLimit});
      }
      if (url.includes('/units/limit/history')) return Response.json({data:[]});
      throw new Error('Unexpected request ' + url);
    });
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    render(<WorkspaceSpendingLimits token="member" organization="company" project="workspace" canConfigure refresh={0} />);

    expect(await screen.findByText('Credits spending limit unavailable')).toBeTruthy();
    expect(screen.getByText('No workspace limit set.')).toBeTruthy();
    expect(unitReads).toBe(1);

    await user.click(screen.getByRole('button',{name:'Retry Credits limit'}));
    await waitFor(() => expect(screen.queryByText('Credits spending limit unavailable')).toBeNull());
    expect(await screen.findByText(/No workspace Credits limit set/)).toBeTruthy();
    expect(screen.getByText('No workspace limit set.')).toBeTruthy();
    expect(unitReads).toBe(2);
  });
});
