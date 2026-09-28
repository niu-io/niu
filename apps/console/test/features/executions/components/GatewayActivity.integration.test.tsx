import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('pages older gateway requests, keeps agent claims unverified, and shows copyable client settings', async () => {
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
    const { container } = render(<GatewayActivity token="admin-session" models={['fast']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} />);

    expect(await screen.findByRole('heading', { name: 'Task ID · task-history' })).toBeTruthy();
    expect(screen.getByText('Matching requests')).toBeTruthy();
    expect(container.querySelector('.gateway-activity-summary article strong')?.textContent).toBe('2');
    expect(screen.getByText('1 loaded · more history available')).toBeTruthy();
    expect(screen.getByText(/24 prompt · 12 output · 2 with reported usage/)).toBeTruthy();
    expect(screen.getByText('Task evidence: Unverified · partial coverage')).toBeTruthy();
    expect(screen.getByText('Provider · provider-fast-v2')).toBeTruthy();
    expect(screen.getByText('Cost unknown')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy Niu base URL' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy model alias' })).toBeTruthy();
    expect(screen.getByText(`${window.location.origin}/v1`)).toBeTruthy();
    const traceLink = screen.getByRole('link', { name: 'Open task evidence' });
    expect(traceLink.getAttribute('href')).toBe('/workspaces/default/tasks?organizationId=org-1&projectId=project-1&executionId=execution-1');
    expect(screen.getByText('Loaded history only; older activity may add costs.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Load older activity' }));

    expect(await screen.findByText('Matching requests')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('2 requests · fast')).toBeTruthy());
    expect(screen.getByText('2 loaded · all matching history loaded')).toBeTruthy();
    expect(screen.getByText('API-equivalent: USD 0.4 · 1 request without a known price')).toBeTruthy();
    expect(screen.getByText('Settled gateway cost')).toBeTruthy();
    expect(screen.getByText('API-equivalent cost')).toBeTruthy();
    expect(calls.some(call => call.path.endsWith('/requests?limit=100&after=attempt-new'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Load older activity' })).toBeNull();
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
    render(<GatewayActivity token="admin-session" models={['fast', 'careful']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} />);
    await screen.findByLabelText('API key');
    await user.selectOptions(screen.getByLabelText('Model'), 'fast');
    await user.selectOptions(screen.getByLabelText('API key'), 'key-1');
    await user.selectOptions(screen.getByLabelText('Status'), 'confirmed_completed');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-27' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-27' } });

    await waitFor(() => expect(screen.getByText('1 loaded · all matching history loaded')).toBeTruthy());
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

  it('keeps the copyable client alias within an active project key grant', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === `${base}/keys`) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'key-1', name: 'Slow key', allowed_models: ['slow'], revoked: false, expired: false }] }) } as Response;
      if (path === `${base}/requests?limit=100`) return { ok: true, status: 200, json: async () => ({ data: [], next_cursor: null, summary: { ...summary, request_count: 0, usage_count: 0, prompt_tokens: '0', completion_tokens: '0', timing_count: 0, average_duration_ms: null, unknown_cost_count: 0, settled_costs: [] } }) } as Response;
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<GatewayActivity token="admin-session" models={['fast', 'slow']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} />);

    await screen.findByText('Niu base URL');
    await waitFor(() => expect(screen.getByText('slow')).toBeTruthy());
    expect(screen.queryByLabelText('Choose a model')).toBeNull();
  });

  it('focuses the gateway request targeted by a Playground attempt link', async () => {
    window.history.replaceState({}, '', '/workspaces/project-1/executions?modelAlias=slow#gateway-attempt-attempt-focused');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === `${base}/requests?limit=100`) {
        return { ok: true, status: 200, json: async () => ({
          data: [makeRequest('attempt-focused', null, 'fast')], next_cursor: null,
          summary: { ...summary, request_count: 1 },
        }) } as Response;
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<GatewayActivity token="admin-session" models={['fast', 'slow']} initialScope={{ organizationId: 'org-1', projectId: 'project-1' }} preferredModelAlias="slow" />);

    await waitFor(() => expect(document.activeElement?.id).toBe('gateway-attempt-attempt-focused'));
    expect(document.getElementById('gateway-attempt-attempt-focused')?.classList.contains('is-focused')).toBe(true);
    expect((screen.getByLabelText('Choose a model') as HTMLSelectElement).value).toBe('slow');
  });
});
