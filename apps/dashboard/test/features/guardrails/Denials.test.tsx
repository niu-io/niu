import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import GuardrailDenials from '../../../src/features/guardrails/Denials';
const dispatchEmpty = { data: [], coverage: 'latest_100_dispatch_policy_exceptions' };
const row = { reason: 'input_blocked', key_name: 'Development key', workspace_policy_name: 'Workspace restrictions', workspace_revision: 3, key_policy_name: null, key_policy_revision: null, recorded_at: '2026-10-03T01:00:00Z' };
function view() { return <MemoryRouter initialEntries={['/workspaces/demo/guardrails/denials']}><Routes><Route path="/workspaces/demo/guardrails/denials" element={<GuardrailDenials token="reader-token" endpoint="/scoped/guardrails" />} /></Routes></MemoryRouter>; }
describe('pre-dispatch blocked requests', () => {
  it('keeps refresh focus while busy and prevents repeated keyboard requests', async () => {
    let pending=false;
    const completions:Array<()=>void>=[];
    const fetch=vi.fn((url:string)=>{
      const response=()=>Response.json(url.endsWith('/dispatch-denials') ? dispatchEmpty : {data:[row],coverage:'latest_100_preparation_denials'});
      return pending ? new Promise<Response>(resolve=>completions.push(()=>resolve(response()))) : Promise.resolve(response());
    });
    vi.stubGlobal('fetch',fetch);render(view());
    await screen.findByText('Input matched a blocking rule');
    const user=userEvent.setup();
    const refresh=screen.getByRole('button',{name:'Refresh',exact:true});
    pending=true;await user.click(refresh);
    expect(refresh.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(refresh);
    await user.keyboard('{Enter}{Enter}');
    expect(fetch).toHaveBeenCalledTimes(4);
    completions.forEach(complete=>complete());
    await waitFor(()=>expect(refresh.getAttribute('aria-disabled')).toBe('false'));
    expect(document.activeElement).toBe(refresh);
  });
  it('explains a network failure and reloads both recorded stages on refresh', async () => {
    let failed=true;
    const fetch=vi.fn(async(url:string)=>{
      if(failed)throw new TypeError('Failed to fetch');
      return Response.json(url.endsWith('/dispatch-denials') ? dispatchEmpty : {data:[row],coverage:'latest_100_preparation_denials'});
    });
    vi.stubGlobal('fetch',fetch);render(view());
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load blocked requests. Check your connection and refresh to try again.');
    expect(screen.queryByText('Failed to fetch')).toBeNull();
    expect(screen.queryByText('No recorded blocks in this workspace.')).toBeNull();
    failed=false;
    await userEvent.setup().click(screen.getByRole('button',{name:'Refresh',exact:true}));
    await screen.findByText('Input matched a blocking rule');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetch.mock.calls.map(([url])=>url)).toEqual(['/scoped/guardrails/denials','/scoped/guardrails/dispatch-denials','/scoped/guardrails/denials','/scoped/guardrails/dispatch-denials']);
  });
  it('shows safe reasons and historical policy versions with workspace navigation', async () => {
    const fetch = vi.fn(async (url: string) => Response.json(url.endsWith('/dispatch-denials') ? dispatchEmpty : { data: [row], coverage: 'latest_100_preparation_denials' })); vi.stubGlobal('fetch', fetch);
    render(view());
    await screen.findByText('Input matched a blocking rule');
    expect(screen.getByRole('cell', { name: 'Workspace restrictions · Version 3', exact: true })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Open Logs' }).getAttribute('href')).toBe('/workspaces/demo/executions');
    expect(fetch).toHaveBeenCalledWith('/scoped/guardrails/denials', expect.objectContaining({ headers: { authorization: 'Bearer reader-token' } }));
    expect(screen.queryByText('input_blocked')).toBeNull();
  });
  it('does not report empty coverage after a failed read and can refresh', async () => {
    let failed = true; vi.stubGlobal('fetch', vi.fn(async (url: string) => failed ? Response.json({ error: { message: 'Unavailable' } }, { status: 503 }) : Response.json(url.endsWith('/dispatch-denials') ? dispatchEmpty : { data: [], coverage: 'latest_100_preparation_denials' })));
    render(view()); await screen.findByRole('alert');
    expect(screen.queryByText('No recorded blocks in this workspace.')).toBeNull();
    failed = false; await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('No recorded blocks in this workspace.');
  });
  it('rejects missing or unsupported response coverage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [] }))); render(view());
    await screen.findByText('Invalid blocked-request response.');
    expect(screen.queryByText('No recorded blocks in this workspace.')).toBeNull();
  });
  it('discards a superseded workspace result', async () => {
    const resolves: Array<(response: Response) => void> = [];
    vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('first') ? new Promise<Response>(done => { resolves.push(done); }) : Promise.resolve(Response.json(url.endsWith('/dispatch-denials') ? dispatchEmpty : { data: [], coverage: 'latest_100_preparation_denials' }))));
    const { rerender } = render(<MemoryRouter><GuardrailDenials token="token" endpoint="/first" /></MemoryRouter>);
    rerender(<MemoryRouter><GuardrailDenials token="token" endpoint="/second" /></MemoryRouter>);
    await screen.findByText('No recorded blocks in this workspace.');
    resolves[0](Response.json({ data: [row], coverage: 'latest_100_preparation_denials' }));
    resolves[1](Response.json({ data: [{ ...row, stage: 'dispatch', reason: 'policy_changed' }], coverage: 'latest_100_dispatch_policy_exceptions' }));
    await waitFor(() => expect(screen.queryByText('Development key')).toBeNull());
  });
  it('combines recorded stages chronologically without implying output inspection', async () => {
    const dispatchRow = { ...row, stage: 'dispatch', reason: 'policy_changed', key_name: 'Recent key', recorded_at: '2026-10-03T02:00:00Z' };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.endsWith('/dispatch-denials')
      ? { data: [dispatchRow], coverage: 'latest_100_dispatch_policy_exceptions' }
      : { data: [row], coverage: 'latest_100_preparation_denials' })));
    render(view());
    await screen.findByText('Policy changed before dispatch');
    expect(screen.getByText('Before dispatch')).not.toBeNull();
    expect(screen.getByText('Before admission')).not.toBeNull();
    const rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toContain('Recent key');
    expect(rows[2].textContent).toContain('Development key');
    expect(screen.getByText(/Some admission denials are not recorded/)).not.toBeNull();
  });
  it('does not present partial preparation data as complete after dispatch-read failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/dispatch-denials')
      ? Response.json({ error: { message: 'Dispatch audit unavailable' } }, { status: 503 })
      : Response.json({ data: [row], coverage: 'latest_100_preparation_denials' })));
    render(view());
    await screen.findByRole('alert');
    expect(screen.queryByText('Development key')).toBeNull();
    expect(screen.queryByText('No recorded blocks in this workspace.')).toBeNull();
  });

});
