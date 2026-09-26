import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminSession } from '../../../../src/app/console-context';
import OperatorsView from '../../../../src/features/operators/components/OperatorsView';

const organization = { id: 'org-1', name: 'Niu Labs' };
const project = { id: 'project-1', name: 'Production' };

function operator(id: string, name: string) {
  return {
    id,
    name,
    role: 'viewer' as const,
    organization_id: organization.id,
    project_id: project.id,
    revoked: false,
  };
}

function session(id: string, operatorId: string) {
  return {
    id,
    operator_id: operatorId,
    expires_at_unix: 2_000_000_000,
    revoked: false,
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ownerSession: AdminSession = {
  kind: 'installation',
  operator: null,
  permissions: { read: true, write: true, manage_operators: true },
};

function stubOperatorApi(options: {
  existing?: ReturnType<typeof operator>[];
  onEventsRequest?: (path: string) => Response | Promise<Response> | undefined;
} = {}) {
  const calls: Array<{ path: string; method: string; body?: unknown }> = [];
  const sessions = new Map<string, ReturnType<typeof session>[]>();
  let issuedCount = 0;
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined;
    calls.push({ path, method, body });

    if (path === '/admin/v1/organizations' && method === 'GET') {
      return jsonResponse({ data: [organization] });
    }
    if (path === '/admin/v1/organizations/org-1/projects' && method === 'GET') {
      return jsonResponse({ data: [project] });
    }
    if (path === '/admin/v1/operators' && method === 'GET') {
      return jsonResponse({ data: options.existing ?? [] });
    }
    if (path.startsWith('/admin/v1/operators/') && path.endsWith('/sessions') && method === 'GET') {
      const id = path.split('/')[4];
      return jsonResponse({ data: sessions.get(id) ?? [] });
    }
    if (path.includes('/events?') && method === 'GET') {
      const override = await options.onEventsRequest?.(path);
      if (override) return override;
      if (path.includes('/operator-a/events?') && path.includes('cursor=event-cursor')) {
        return jsonResponse({ data: [{
          id: 'event-older',
          action: 'session_created',
          actor_kind: 'installation',
          actor_operator_id: null,
          target_operator_id: 'operator-a',
          target_session_id: 'session-a',
          organization_id: organization.id,
          project_id: project.id,
          created_at: '2026-01-01T00:00:00.000000Z',
        }], next_cursor: null });
      }
      if (path.includes('/operator-a/events?')) {
        return jsonResponse({ data: [{
          id: 'event-newest',
          action: 'operator_created',
          actor_kind: 'installation',
          actor_operator_id: null,
          target_operator_id: 'operator-a',
          target_session_id: null,
          organization_id: organization.id,
          project_id: project.id,
          created_at: '2026-02-01T00:00:00.000000Z',
        }], next_cursor: 'event-cursor' });
      }
      return jsonResponse({ data: [], next_cursor: null });
    }
    if (path === '/admin/v1/operators' && method === 'POST') {
      const created = {
        ...operator('operator-new', String((body as { name: string }).name)),
        role: (body as { role: 'owner' | 'admin' | 'viewer' }).role,
        project_id: (body as { project_id: string | null }).project_id,
      };
      const createdSession = session('session-new', created.id);
      sessions.set(created.id, [createdSession]);
      return jsonResponse({ operator: created, session: createdSession, token: 'niu_once_new_operator_token' }, 201);
    }
    if (path.endsWith('/sessions') && method === 'POST') {
      const operatorId = path.split('/')[4];
      issuedCount += 1;
      const issuedSession = session('session-issued-' + issuedCount, operatorId);
      sessions.set(operatorId, [...(sessions.get(operatorId) ?? []), issuedSession]);
      return jsonResponse({ session: issuedSession, token: 'niu_once_session_' + operatorId }, 201);
    }
    if (method === 'DELETE') return new Response(null, { status: 204 });
    return jsonResponse({ error: { message: 'Not found: ' + method + ' ' + path } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

describe('operator administration workflow', () => {
  it.each([
    ['viewer', { read: true, write: false, manage_operators: false }, 'Your viewer session can inspect workspace data'],
    ['admin', { read: true, write: true, manage_operators: false }, 'Your admin session can update workspace data'],
  ] as const)('%s sessions receive an explicit denial without management requests', async (role, permissions, explanation) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const currentSession: AdminSession = {
      kind: 'operator',
      operator: { id: 'current-operator', role, organization_id: organization.id, project_id: null },
      permissions,
    };

    render(<OperatorsView token="scoped-token" session={currentSession} />);

    expect(screen.getByRole('heading', { name: 'Owner access required' })).toBeTruthy();
    expect(screen.getByText(new RegExp(explanation))).toBeTruthy();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it('creates an operator within the selected scope, shows its secret once, and confirms revocation', async () => {
    const api = stubOperatorApi();
    const user = userEvent.setup();
    render(<OperatorsView token="owner-token" session={ownerSession} />);

    await user.click(await screen.findByRole('button', { name: 'Add operator' }));
    await user.type(screen.getByLabelText('Name'), 'Production reviewer');
    await user.selectOptions(screen.getByLabelText('Project'), project.id);
    await user.selectOptions(screen.getByLabelText('Role'), 'viewer');
    await user.click(screen.getByRole('button', { name: 'Create operator' }));

    expect(await screen.findByRole('heading', { name: 'Production reviewer' })).toBeTruthy();
    expect((screen.getByLabelText('Session token') as HTMLInputElement).value).toBe('niu_once_new_operator_token');
    const createCall = api.calls.find(call => call.path === '/admin/v1/operators' && call.method === 'POST');
    expect(createCall?.body).toEqual({
      organization_id: organization.id,
      project_id: project.id,
      name: 'Production reviewer',
      role: 'viewer',
      expires_in_seconds: 30 * 86400,
    });

    await user.click(screen.getByRole('button', { name: 'Revoke access' }));
    expect(await screen.findByRole('button', { name: 'Confirm revoke operator' })).toBeTruthy();
    expect(api.calls.some(call => call.path === '/admin/v1/operators/operator-new' && call.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Confirm revoke operator' }));

    expect(await screen.findByText('Access revoked')).toBeTruthy();
    expect(api.calls.some(call => call.path === '/admin/v1/operators/operator-new' && call.method === 'DELETE')).toBe(true);
  });

  it('issues sessions only for the selected operator and clears one-time credentials when selection changes', async () => {
    const first = operator('operator-a', 'Avery');
    const second = operator('operator-b', 'Morgan');
    const api = stubOperatorApi({ existing: [first, second] });
    const user = userEvent.setup();
    render(<OperatorsView token="owner-token" session={ownerSession} />);

    await user.click(await screen.findByRole('button', { name: /Avery/ }));
    await user.click(await screen.findByRole('button', { name: 'Issue new session' }));
    expect((await screen.findByLabelText('Session token') as HTMLInputElement).value).toBe('niu_once_session_operator-a');
    expect(api.calls.some(call => call.path === '/admin/v1/operators/operator-a/sessions' && call.method === 'POST')).toBe(true);

    await user.click(screen.getByRole('button', { name: /Morgan/ }));
    await waitFor(() => expect(screen.queryByDisplayValue('niu_once_session_operator-a')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Morgan' })).toBeTruthy();
    expect(api.calls.some(call => call.path === '/admin/v1/operators/operator-b/sessions' && call.method === 'POST')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Issue new session' }));
    expect((await screen.findByLabelText('Session token') as HTMLInputElement).value).toBe('niu_once_session_operator-b');
    expect(api.calls.some(call => call.path === '/admin/v1/operators/operator-b/sessions' && call.method === 'POST')).toBe(true);
    expect(api.calls.some(call => call.path === '/admin/v1/operators/sessions' && call.method === 'POST')).toBe(false);
  });

  it('shows operator activity and pages with the server cursor', async () => {
    const api = stubOperatorApi({ existing: [operator('operator-a', 'Avery')] });
    const user = userEvent.setup();
    render(<OperatorsView token="owner-token" session={ownerSession} />);

    await user.click(await screen.findByRole('button', { name: /Avery/ }));
    expect(await screen.findByText('Operator created')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Load older' }));
    expect(await screen.findByText('Session issued')).toBeTruthy();
    expect(api.calls.some(call => call.path === '/admin/v1/operators/operator-a/events?limit=50&cursor=event-cursor')).toBe(true);
  });

  it('discards an older activity page that resolves after the selected operator changes', async () => {
    let resolveOlder!: (response: Response) => void;
    const olderPage = new Promise<Response>(resolve => { resolveOlder = resolve; });
    const api = stubOperatorApi({
      existing: [operator('operator-a', 'Avery'), operator('operator-b', 'Morgan')],
      onEventsRequest: path => path.includes('/operator-a/events?') && path.includes('cursor=event-cursor')
        ? olderPage
        : undefined,
    });
    const user = userEvent.setup();
    render(<OperatorsView token="owner-token" session={ownerSession} />);

    await user.click(await screen.findByRole('button', { name: /Avery/ }));
    expect(await screen.findByText('Operator created')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Load older' }));
    await waitFor(() => expect(api.calls.some(call => call.path.includes('cursor=event-cursor'))).toBe(true));

    await user.click(screen.getByRole('button', { name: /Morgan/ }));
    expect(await screen.findByRole('heading', { name: 'Morgan' })).toBeTruthy();
    expect(await screen.findByText('No activity recorded yet.')).toBeTruthy();

    resolveOlder(jsonResponse({ data: [{
      id: 'event-stale',
      action: 'session_revoked',
      actor_kind: 'installation',
      actor_operator_id: null,
      target_operator_id: 'operator-a',
      target_session_id: 'session-a',
      organization_id: organization.id,
      project_id: project.id,
      created_at: '2026-01-01T00:00:00.000000Z',
    }], next_cursor: null }));

    await waitFor(() => expect(screen.queryByText('Session revoked')).toBeNull());
    expect(screen.getByText('No activity recorded yet.')).toBeTruthy();
  });

  it('recovers to the first activity page when the current audit cursor is rejected', async () => {
    let firstPageCount = 0;
    const api = stubOperatorApi({
      existing: [operator('operator-a', 'Avery')],
      onEventsRequest: path => {
        if (!path.includes('/operator-a/events?')) return undefined;
        if (path.includes('cursor=event-cursor')) {
          return jsonResponse({ error: { message: 'Invalid cursor' } }, 400);
        }
        if (path.includes('cursor=fresh-cursor')) {
          return jsonResponse({ data: [{
            id: 'event-fresh-older',
            action: 'session_created',
            actor_kind: 'installation',
            actor_operator_id: null,
            target_operator_id: 'operator-a',
            target_session_id: 'session-a',
            organization_id: organization.id,
            project_id: project.id,
            created_at: '2026-01-01T00:00:00.000000Z',
          }], next_cursor: null });
        }
        firstPageCount += 1;
        return jsonResponse({ data: [{
          id: 'event-newest',
          action: 'operator_created',
          actor_kind: 'installation',
          actor_operator_id: null,
          target_operator_id: 'operator-a',
          target_session_id: null,
          organization_id: organization.id,
          project_id: project.id,
          created_at: '2026-02-01T00:00:00.000000Z',
        }], next_cursor: firstPageCount === 1 ? 'event-cursor' : 'fresh-cursor' });
      },
    });
    const user = userEvent.setup();
    render(<OperatorsView token="owner-token" session={ownerSession} />);

    await user.click(await screen.findByRole('button', { name: /Avery/ }));
    expect(await screen.findByText('Operator created')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Load older' }));
    await waitFor(() => expect(firstPageCount).toBe(2));

    await user.click(screen.getByRole('button', { name: 'Load older' }));
    expect(await screen.findByText('Session issued')).toBeTruthy();
    expect(api.calls.some(call => call.path.endsWith('cursor=fresh-cursor'))).toBe(true);
    expect(api.calls.filter(call => call.path.endsWith('cursor=event-cursor'))).toHaveLength(1);
  });
});
