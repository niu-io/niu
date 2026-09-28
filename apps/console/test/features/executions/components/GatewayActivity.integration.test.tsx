import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import GatewayActivity, { taskOutcome } from '../../../../src/features/executions/components/GatewayActivity';

const base = '/admin/v1/organizations/org-1/projects/project-1';

function makeRequest(attemptId: string, taskId: string | null, model: string, taskEvidence = null, financials: { currency: string | null; cash_nanos: string | null; api_equivalent_nanos: string | null } = { currency: null, cash_nanos: null, api_equivalent_nanos: null }) {
  return {
    attempt_id: attemptId,
    operation_id: `operation-${attemptId}`,
    api_key_id: null,
    key_name: null,
    task_id: taskId,
    task_evidence: taskEvidence,
    model,
    provider_model: 'provider-fast-v2',
    created_at: '2026-09-27T00:05:00.000000Z',
    dispatched_at: '2026-09-27T00:05:00.000000Z',
    completed_at: '2026-09-27T00:05:00.002000Z',
    duration_ms: 2,
    execution: 'confirmed_completed',
    usage_confidence: 'provider_reported',
    prompt_tokens: '12',
    completion_tokens: '6',
    ...financials,
  };
}

const summary = {
  request_count: 2,
  usage_count: 2,
  prompt_tokens: '24',
  completion_tokens: '12',
  timing_count: 2,
  average_duration_ms: 2,
  unknown_cost_count: 1,
  settled_costs: [{ currency: 'USD', cash_nanos: '250000000', api_equivalent_nanos: '400000000', settled_requests: 1 }],
};

describe('gateway activity', () => {
  it('uses authoritative acceptance evidence while keeping agent claims unverified', () => {
    const claim = { authority: 'agent_claim' as const, result: 'accepted' as const };
    expect(taskOutcome({ execution_id: 'exec-claim', source: 'agent', record_id: 'claim-only', coverage: 'partial', outcomes: [claim] })).toBe('Unverified');
    expect(taskOutcome({ execution_id: 'exec-validated', source: 'agent', record_id: 'validated', coverage: 'complete', outcomes: [claim, { authority: 'deterministic_validator', result: 'accepted' }] })).toBe('Accepted');
    expect(taskOutcome({ execution_id: 'exec-conflict', source: 'agent', record_id: 'conflict', coverage: 'complete', outcomes: [{ authority: 'deterministic_validator', result: 'accepted' }, { authority: 'human_acceptance', result: 'rejected' }] })).toBe('Conflicting evidence');
  });

  it('shows gateway requests as a filterable log and pages older evidence without mixing in workspace statistics', async () => {
    const first = makeRequest('attempt-new', 'task-history', 'fast', {
      execution_id: 'execution-1', source: 'sample-agent', record_id: 'record-1', coverage: 'partial',
      outcomes: [{ authority: 'agent_claim', result: 'accepted' }],
    });
    const second = makeRequest('attempt-old', 'task-history', 'fast', null, { currency: 'USD', cash_nanos: '250000000', api_equivalent_nanos: '400000000' });
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      calls.push({ path, init });
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
      if (path === `${base}/keys`) return ok({ data: [{ id: 'key-1', name: 'Dev key', allowed_models: ['fast'], revoked: false, expired: false }] });
      if (path === `${base}/requests?limit=100`) return ok({ data: [first], next_cursor: 'attempt-new', summary });
      if (path === `${base}/requests?limit=100&after=attempt-new`) return ok({ data: [second], next_cursor: null, summary });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const user = userEvent.setup();
    const { container } = render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);

    expect(await screen.findByRole('button', { name: 'View details' })).toBeTruthy();
    expect(screen.getByText('1 loaded')).toBeTruthy();
    expect(container.querySelector('.gateway-activity-summary')).toBeNull();
    expect(screen.queryByText('Niu base URL')).toBeNull();
    expect(screen.getByText('Provider · provider-fast-v2')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Settled cost' })).toBeNull();
    expect(screen.queryByText('API-equivalent cost')).toBeNull();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Load older requests' }));

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'View details' })).toHaveLength(2));
    await user.click(screen.getAllByRole('button', { name: 'View details' })[0]);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('attempt-new')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous request' }).hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Next request' }));
    expect(screen.getByText('attempt-old')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next request' }).hasAttribute('disabled')).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.getByText('2 loaded')).toBeTruthy();
    expect(calls.some(call => call.path.endsWith('/requests?limit=100&after=attempt-new'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Load older requests' })).toBeNull();
  });

  it('applies date, model, key, and status filters to the scoped feed', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      calls.push(path);
      if (path === `${base}/keys`) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'key-1', name: 'Build key', revoked: false, expired: false }] }) } as Response;
      if (path.startsWith(`${base}/requests?`)) return { ok: true, status: 200, json: async () => ({ data: [makeRequest('filtered-attempt', null, 'fast')], next_cursor: null, summary: { ...summary, request_count: 1 } }) } as Response;
      throw new Error(`Unexpected request: ${path}`);
    }));

    const user = userEvent.setup();
    render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast', 'careful']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);
    await screen.findByLabelText('API key');
    await user.click(screen.getByLabelText('Model'));
    await user.click(await screen.findByRole('menuitemradio', { name: 'fast', exact: true }));
    await user.click(screen.getByLabelText('API key'));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Build key', exact: true }));
    await user.click(screen.getByLabelText('Status'));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Completed', exact: true }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-27' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-27' } });

    await waitFor(() => expect(screen.getByText('1 loaded')).toBeTruthy());
    const filteredPath = calls.find(path => path.includes('key_id=key-1') && path.includes('status=confirmed_completed') && path.includes('from_ms=') && path.includes('to_ms='));
    expect(filteredPath).toBeTruthy();
    const query = new URLSearchParams(filteredPath!.split('?')[1]);
    expect(query.get('model_alias')).toBe('fast');
    expect(query.get('key_id')).toBe('key-1');
    expect(query.get('status')).toBe('confirmed_completed');
    expect(query.has('from_ms')).toBe(true);
    expect(query.has('to_ms')).toBe(true);
    expect(query.get('limit')).toBe('100');
  });

  it('does not inject client setup into request investigation', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === `${base}/keys`) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'key-1', name: 'Slow key', allowed_models: ['slow'], revoked: false, expired: false }] }) } as Response;
      if (path === `${base}/requests?limit=100`) return { ok: true, status: 200, json: async () => ({ data: [], next_cursor: null, summary: { ...summary, request_count: 0, usage_count: 0, prompt_tokens: '0', completion_tokens: '0', timing_count: 0, average_duration_ms: null, unknown_cost_count: 0, settled_costs: [] } }) } as Response;
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast', 'slow']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Observability' });
    expect(screen.queryByText('Niu base URL')).toBeNull();
    expect(screen.queryByText('Investigate gateway requests, outcomes, timing, and cost evidence.')).toBeNull();
    expect(screen.queryByText('Gateway calls, outcomes, and evidence for this workspace.')).toBeNull();
    expect(screen.getByLabelText('Model')).toBeTruthy();
  });

  it('keeps the overview empty state quiet when Chat is already a primary action', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === `${base}/keys`) return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
      if (path === `${base}/requests?limit=100`) return { ok: true, status: 200, json: async () => ({ data: [], next_cursor: null, summary: { ...summary, request_count: 0, usage_count: 0, prompt_tokens: '0', completion_tokens: '0', timing_count: 0, average_duration_ms: null, unknown_cost_count: 0, settled_costs: [] } }) } as Response;
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<MemoryRouter><GatewayActivity compact token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'No requests yet' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Open Chat/i })).toBeNull();
  });

  it('keeps workspace aggregates on Activity and leaves request investigation separate', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === `${base}/requests?limit=100`) return { ok: true, status: 200, json: async () => ({
        data: [makeRequest('activity-attempt', null, 'fast')], next_cursor: null, summary,
      }) } as Response;
      throw new Error(`Unexpected request: ${path}`);
    }));

    const { container } = render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} statisticsOnly /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Usage' })).toBeTruthy();
    expect(screen.getByText('Matching requests')).toBeTruthy();
    expect(screen.getByText('Model usage')).toBeTruthy();
    expect(container.querySelector('.gateway-task-feed')).toBeNull();
    expect(screen.getByRole('link', { name: /Investigate requests/i }).getAttribute('href')).toBe('/executions');
  });

  it('focuses the gateway request targeted by a Playground attempt link', async () => {
    window.history.replaceState({}, '', '/workspaces/project-1/executions?modelAlias=slow#gateway-attempt-attempt-focused');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith(`${base}/requests?`)) {
        return { ok: true, status: 200, json: async () => ({
          data: [makeRequest('attempt-focused', null, 'slow')], next_cursor: null,
          summary: { ...summary, request_count: 1 },
        }) } as Response;
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<MemoryRouter><GatewayActivity token="admin-session" models={['fast', 'slow']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} preferredModelAlias="slow" /></MemoryRouter>);

    await waitFor(() => expect(document.activeElement?.id).toBe('gateway-attempt-attempt-focused'));
    expect(document.getElementById('gateway-attempt-attempt-focused')?.classList.contains('is-focused')).toBe(true);
    expect(screen.getByLabelText('Model').textContent).toContain('slow');
  });
});
