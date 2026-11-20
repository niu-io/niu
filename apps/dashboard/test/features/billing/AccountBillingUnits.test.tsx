vi.mock('../../../app/shell/platform-currency',()=>({usePlatformCurrency:()=>({currency:'USD',billingMode:'credits',unit:null,error:'',reload:()=>{}})}));
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountBilling from '../../../app/features/billing/AccountBilling';

afterEach(() => {cleanup();vi.unstubAllGlobals();});

const balance = {
  currency:'USD',
  balance_nanos:'1000000000',
  available_nanos:'1000000000',
  reserved_nanos:'0',
  credit_limit_nanos:'0',
  warning_threshold_nanos:null,
  policy_revision:'0',
  low_balance:false,
};
const unitSnapshot = {
  billing_mode:'credits',
  atoms_per_unit:'1000000000',
  definition:{revision:'credits-v1',name:'Credits',display_precision:2,atoms_per_unit:'1000000000'},
  balances:[],
};

describe('account Credits balance read', () => {
  it('surfaces a failed Credits balance read and retries while keeping the monetary balance', async () => {
    let unitReads = 0;
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/billing/balance')) return Response.json({data:[balance]});
      if (url.includes('/billing/transactions')) return Response.json({data:[],next_cursor:null});
      if (url.endsWith('/billing/units')) {
        unitReads += 1;
        return unitReads === 1
          ? Response.json({error:{message:'unavailable'}},{status:503})
          : Response.json({data:unitSnapshot});
      }
      throw new Error('Unexpected request ' + url);
    });
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    render(<AccountBilling token="test" organization="org" section="billing" />);

    expect(await screen.findByText('Credits balance unavailable')).toBeTruthy();
    expect(screen.getByText('Could not refresh the branded Credits balance. The last loaded values are still shown.')).toBeTruthy();
    expect(screen.getByRole('region',{name:'Account balance'})).toBeTruthy();
    expect(screen.queryByText('Account balance unavailable')).toBeNull();
    expect(unitReads).toBe(1);

    await user.click(screen.getByRole('button',{name:'Retry Credits balance'}));
    await waitFor(() => expect(screen.queryByText('Credits balance unavailable')).toBeNull());
    expect(await screen.findByLabelText('Branded Credits balance')).toBeTruthy();
    expect(screen.getByRole('region',{name:'Account balance'})).toBeTruthy();
    expect(unitReads).toBe(2);
  });
});
