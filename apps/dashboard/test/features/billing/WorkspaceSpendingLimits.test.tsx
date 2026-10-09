import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkspaceSpendingLimits from '../../../src/features/billing/WorkspaceSpendingLimits';
afterEach(() => {cleanup();vi.unstubAllGlobals();});
const account = {currency:'CNY',committed_nanos:'0',limit_nanos:null,revision:null};
const props = {token:'member',organization:'company',project:'workspace',canConfigure:true,refresh:0};
describe('workspace spending controls', () => {
  it('cancels edits back to the matching currency action without changing saved limits', async () => {
    const fetch = vi.fn(async () => Response.json({data:[account,{...account,currency:'USD',limit_nanos:'10000000000',revision:'2'}]}));
    vi.stubGlobal('fetch',fetch);render(<WorkspaceSpendingLimits {...props}/>);
    const user=userEvent.setup();
    await user.click(await screen.findByRole('button',{name:'Edit USD spending limit'}));
    await user.clear(screen.getByLabelText('Lifetime limit (USD)'));
    await user.type(screen.getByLabelText('Lifetime limit (USD)'),'25');
    await user.click(screen.getByRole('button',{name:'Cancel'}));
    expect(document.activeElement).toBe(screen.getByRole('button',{name:'Edit USD spending limit'}));
    expect(screen.getByText('USD 0.00 committed of USD 10.00')).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'Add CNY spending limit'}));
    await user.click(screen.getByRole('button',{name:'Cancel'}));
    expect(document.activeElement).toBe(screen.getByRole('button',{name:'Add CNY spending limit'}));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('saves exact zero with the observed revision and reloads authoritative state', async () => {
    let saved = false;
    const fetch = vi.fn(async (_url, init) => {
      if (init.method === 'PUT') {saved=true;return Response.json({data:{revision:'1'}});}
      return Response.json({data:[saved ? {...account,limit_nanos:'0',revision:'1'} : account]});
    });
    vi.stubGlobal('fetch',fetch);render(<WorkspaceSpendingLimits {...props}/>);
    const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Add CNY spending limit'}));
    await user.type(screen.getByLabelText('Lifetime limit (CNY)'),'0');
    await user.click(screen.getByRole('button',{name:'Save limit'}));
    await screen.findByText('CNY 0.00 committed of CNY 0.00');
    expect(JSON.parse(fetch.mock.calls.find(([,init])=>init.method==='PUT')![1].body)).toEqual({limit_nanos:'0',expected_revision:'0'});
    expect(fetch.mock.calls.every(([url])=>String(url).includes('/organizations/company/projects/workspace/spending-limit'))).toBe(true);
  });
  it('requires reloading after conflict without automatically retrying a write', async () => {
    const fetch=vi.fn(async (_url,init)=>init.method==='PUT' ? Response.json({error:{message:'private internal identifier'}},{status:409}) : Response.json({data:[account]}));
    vi.stubGlobal('fetch',fetch);render(<WorkspaceSpendingLimits {...props}/>);
    const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Add CNY spending limit'}));
    await user.type(screen.getByLabelText('Lifetime limit (CNY)'),'20.000000001');await user.click(screen.getByRole('button',{name:'Save limit'}));
    await screen.findByRole('button',{name:'Reload limits'});
    expect(screen.queryByText('private internal identifier')).toBeNull();expect(screen.queryByRole('button',{name:'Save limit'})).toBeNull();
    expect(fetch.mock.calls.filter(([,init])=>init.method==='PUT')).toHaveLength(1);
    await user.click(screen.getByRole('button',{name:'Reload limits'}));
    await waitFor(()=>expect(fetch.mock.calls.filter(([,init])=>init.method==='GET')).toHaveLength(2));
  });
  it('rejects a limit below committed spending without a write', async () => {
    const fetch=vi.fn(async()=>Response.json({data:[{...account,committed_nanos:'20000000001',limit_nanos:'30000000000',revision:'2'}]}));
    vi.stubGlobal('fetch',fetch);render(<WorkspaceSpendingLimits {...props}/>);
    const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Edit CNY spending limit'}));
    await user.clear(screen.getByLabelText('Lifetime limit (CNY)'));await user.type(screen.getByLabelText('Lifetime limit (CNY)'),'20');
    await user.click(screen.getByRole('button',{name:'Save limit'}));await screen.findByText('The limit must cover current charges and reserved requests.');
    expect(fetch.mock.calls).toHaveLength(1);
  });
  it('keeps readers read-only and fails closed on malformed amounts', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[{...account,limit_nanos:'20',revision:'1'}]})));
    const view=render(<WorkspaceSpendingLimits {...props} canConfigure={false}/>);await screen.findByText('CNY 0.00 committed of CNY 0.00000002');
    expect(screen.queryByRole('button',{name:'Edit CNY spending limit'})).toBeNull();view.unmount();
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[{...account,committed_nanos:'secret'}]})));
    render(<WorkspaceSpendingLimits {...props}/>);await screen.findByText('Spending limits unavailable');
    expect(screen.queryByRole('button',{name:'Add CNY spending limit'})).toBeNull();
  });
});
