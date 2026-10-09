import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import RequestGuardrails from '../../../src/features/executions/components/RequestGuardrails';
const decision = { stage: 'dispatch', outcome: 'allowed', coverage: 'model_provider_access', workspace_policy_name: 'Saved restriction', workspace_revision: 4, key_policy_name: null, key_policy_revision: null, input_inspection: { outcome: 'redacted', elapsed_ms: 1 }, output_inspection: { outcome: 'blocked', reason: 'pattern_denial', elapsed_ms: 2 } };
function view(endpoint = '/scoped/requests/attempt/guardrails') { return <MemoryRouter><RequestGuardrails token="reader" endpoint={endpoint} historyPath="/workspaces/demo/guardrails/history" /></MemoryRouter>; }
describe('request Guardrails diagnosis', () => {
  it('separates allowed dispatch from blocked output and preserves charge semantics', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: decision }))); render(view());
    await screen.findByText('Blocked · Matched a blocking rule');
    expect(screen.getByText('Allowed at dispatch')).not.toBeNull();
    expect(screen.getByText('Redacted')).not.toBeNull();
    expect(screen.getByText('Saved restriction · Version 4')).not.toBeNull();
    expect(screen.getByText(/The output was withheld/)).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Inspect saved policy versions' }).getAttribute('href')).toBe('/workspaces/demo/guardrails/history');
    expect(screen.queryByText('pattern_denial')).toBeNull();
  });
  it('does not infer historical protection when attribution is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: null }))); render(view());
    await waitFor(() => expect(screen.queryByRole('region', {name: 'Guardrails decision'})).toBeNull());
    expect(screen.queryByText('Allowed at dispatch')).toBeNull();
  });
  it('does not infer content inspection from access attribution alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { ...decision, input_inspection: null, output_inspection: null } }))); render(view());
    await screen.findByText('Allowed at dispatch');
    expect(screen.queryByText('No inspection result recorded')).toBeNull();
    expect(screen.queryByText('None recorded')).toBeNull();
    expect(screen.queryByText('Key policy')).toBeNull();
    expect(screen.queryByText(/The output was withheld/)).toBeNull();
  });
  it('omits access-only attribution without implying content protection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { ...decision, workspace_policy_name: null, workspace_revision: null, input_inspection: null, output_inspection: null } })));
    render(view());
    await waitFor(() => expect(screen.queryByRole('region', {name: 'Guardrails decision'})).toBeNull());
    expect(screen.queryByText('Allowed at dispatch')).toBeNull();
    expect(screen.queryByRole('link', {name: 'Inspect saved policy versions'})).toBeNull();
  });
  it('shows an inspection without inventing policy attribution or a history link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { ...decision, workspace_policy_name: null, workspace_revision: null } })));
    render(view());
    await screen.findByText('Blocked · Matched a blocking rule');
    expect(screen.queryByText('Workspace policy')).toBeNull();
    expect(screen.queryByText('Key policy')).toBeNull();
    expect(screen.queryByRole('link', {name: 'Inspect saved policy versions'})).toBeNull();
  });
  it('rejects malformed attribution rather than claiming allowed dispatch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: {} }))); render(view());
    await screen.findByRole('alert'); expect(screen.queryByText('Allowed at dispatch')).toBeNull();
  });
  it('clears attribution when navigating between requests and ignores stale replies', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => url === '/first' ? new Promise<Response>(done => { resolve = done; }) : Promise.resolve(Response.json({ data: null }))));
    const { rerender } = render(view('/first')); rerender(view('/second'));
    await waitFor(() => expect(screen.queryByRole('region', {name: 'Guardrails decision'})).toBeNull());
    resolve(Response.json({ data: decision })); await waitFor(() => expect(screen.queryByText('Saved restriction · Version 4')).toBeNull());
  });
});

it('distinguishes non-enforcing observation from withheld output', async () => {
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:{...decision,output_inspection:null,output_observation:{outcome:'matched',reason:'pattern_match',elapsed_ms:1,mode:'observe_only',enforcement:false}}})));
  render(view());
  await screen.findByText('Match observed · Response unchanged · Non-enforcing');
  expect(screen.queryByText(/The output was withheld/)).toBeNull();
});

it('rejects contradictory observation metadata instead of claiming non-enforcement', async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:{...decision,output_observation:{outcome:'matched',mode:'observe_only',enforcement:true,elapsed_ms:1}}})));
  render(view());
  await screen.findByRole('alert');
  expect(screen.queryByText(/Non-enforcing/)).toBeNull();
});
