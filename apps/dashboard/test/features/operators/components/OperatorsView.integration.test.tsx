import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminSession } from '../../../../app/shell/dashboard-context';
import OperatorsView from '../../../../app/features/operators/components/OperatorsView';

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
    created_at: '2026-01-01T00:00:00Z',
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
  const operators = [...(options.existing ?? [])];
  const invitations: Array<Record<string, unknown>> = [];
  let issuedCount = 0;
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined;
    calls.push({ path, method, body });

    if (path === '/api/v1/organizations' && method === 'GET') {
      return jsonResponse({ data: [organization] });
    }
    if (path === '/api/v1/organizations/org-1/projects' && method === 'GET') {
      return jsonResponse({ data: [project] });
    }
    if (path.split('?')[0] === '/api/v1/operators' && method === 'GET') {
      return jsonResponse({ data: operators });
    }
    if (path.startsWith('/api/v1/operators/') && path.endsWith('/sessions') && method === 'GET') {
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
    if (path === '/api/v1/organizations/org-1/invitations' && method === 'GET') {
      return jsonResponse({ data: invitations });
    }
    if (path === '/api/v1/organizations/org-1/invitations' && method === 'POST') {
      const input = body as { email: string; name?: string; role: string; project_id: string | null; expires_in_seconds: number };
      const created = {
        id: 'invitation-' + (invitations.length + 1),
        organization_id: organization.id,
        organization_name: organization.name,
        organization_slug: 'niu-labs',
        project_id: input.project_id,
        project_name: input.project_id ? project.name : null,
        project_slug: input.project_id ? 'production' : null,
        role: input.role,
        recipient_email: input.email,
        recipient_name: input.name ?? null,
        status: 'pending',
        delivery: 'not_configured',
        created_at: '2026-11-05T00:00:00Z',
        expires_at: '2026-11-12T00:00:00Z',
        accepted_at: null,
        revoked_at: null,
        invited_by: 'Owner',
      };
      invitations.unshift(created);
      return jsonResponse({
        invitation: created,
        token: 'niu_invite_once_only_secret',
        accept_path: '/invite/niu_invite_once_only_secret',
        delivery: { state: 'not_configured', email_sent: false },
      }, 201);
    }
    if (path.startsWith('/api/v1/invitations/') && method === 'DELETE') {
      const id = path.split('/').pop();
      const target = invitations.find(item => item.id === id);
      if (target) target.status = 'canceled';
      return new Response(null, { status: 204 });
    }
    if (path === '/api/v1/operators' && method === 'POST') {
      const created = {
        ...operator('operator-new', String((body as { name: string }).name)),
        role: (body as { role: 'owner' | 'admin' | 'viewer' }).role,
        project_id: (body as { project_id: string | null }).project_id,
      };
      const createdSession = session('session-new', created.id);
      sessions.set(created.id, [createdSession]);
      operators.unshift(created);
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
  return { calls, fetchMock, invitations };
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

  it('preserves the entered invite email after creation fails and never creates a temporary-token user', async () => {
    const api=stubOperatorApi();
    vi.stubGlobal('fetch',vi.fn<typeof fetch>(async(input,init)=>String(input)==='/api/v1/organizations/org-1/invitations' && init?.method==='POST'
      ? jsonResponse({error:{message:'Invitation unavailable'}},503)
      : api.fetchMock(input,init)));
    const user=userEvent.setup();
    render(<OperatorsView token="owner-token" session={ownerSession} initialOrganization={organization.id} initialWorkspace={project.id}/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Invite member'}).hasAttribute('disabled')).toBe(false));
    await user.click(screen.getByRole('button',{name:'Invite member'}));
    await user.type(screen.getByLabelText('Email'),'reviewer@example.test');
    await user.click(screen.getByRole('button',{name:'Create invitation'}));
    await screen.findByRole('alert');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('reviewer@example.test');
    expect((screen.getByRole('button',{name:'Create invitation'}) as HTMLButtonElement).disabled).toBe(false);
    expect(api.calls.some(call => call.path === '/api/v1/operators' && call.method === 'POST')).toBe(false);
  });

  it('uses the opened workspace for invitation scope and shows a copyable one-time link without claiming email delivery', async () => {
    const api = stubOperatorApi();
    const user = userEvent.setup();
    render(<OperatorsView token="owner-token" session={ownerSession} initialOrganization={organization.id} initialWorkspace={project.id} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Invite member' }).hasAttribute('disabled')).toBe(false));
    await user.click(screen.getByRole('button', { name: 'Invite member' }));
    await user.type(screen.getByLabelText('Email'), 'reviewer@example.test');
    await user.click(screen.getByRole('button', { name: 'Create invitation' }));

    expect(await screen.findByRole('heading', { name: 'Invitation link ready' })).toBeTruthy();
    const link = (screen.getByLabelText('One-time invitation link') as HTMLInputElement).value;
    expect(link).toBe(window.location.origin + '/invite/niu_invite_once_only_secret');
    expect(screen.getByText('No email was sent')).toBeTruthy();
    expect(screen.getByText(/Email delivery is not configured/)).toBeTruthy();
    expect(screen.queryByText(/invitation sent/i)).toBeNull();
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
    const createCall = api.calls.find(call => call.path === '/api/v1/organizations/org-1/invitations' && call.method === 'POST');
    expect(createCall?.body).toEqual({
      email: 'reviewer@example.test',
      role: 'viewer',
      project_id: project.id,
      expires_in_seconds: 7 * 86400,
    });
    expect(api.calls.some(call => call.path === '/api/v1/operators' && call.method === 'POST')).toBe(false);
    expect(api.calls.some(call => call.path.includes('/sessions') && call.method === 'POST')).toBe(false);
  });

  it('lists a pending invitation and cancels it after confirmation', async () => {
    const api = stubOperatorApi();
    const user = userEvent.setup();
    render(<OperatorsView token="owner-token" session={ownerSession} initialOrganization={organization.id} initialWorkspace={project.id} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Invite member' }).hasAttribute('disabled')).toBe(false));
    await user.click(screen.getByRole('button', { name: 'Invite member' }));
    await user.type(screen.getByLabelText('Email'), 'pending@example.test');
    await user.click(screen.getByRole('button', { name: 'Create invitation' }));
    await screen.findByRole('heading', { name: 'Invitation link ready' });
    await user.click(screen.getByRole('button', { name: 'Done — hide link' }));

    expect(await screen.findByRole('heading', { name: 'Pending invitations' })).toBeTruthy();
    expect(screen.getByText('pending@example.test')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Actions for pending@example.test' }));
    await user.click(screen.getByRole('menuitem', { name: 'Cancel invitation' }));
    expect(screen.getByRole('heading', { name: /Cancel invitation for/ })).toBeTruthy();
    expect(api.calls.some(call => call.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Cancel invitation', exact: true }));
    await waitFor(() => expect(screen.queryByText('pending@example.test')).toBeNull());
    expect(api.calls.some(call => call.path === '/api/v1/invitations/invitation-1' && call.method === 'DELETE')).toBe(true);
  });

  it('issues sessions only for the selected operator and clears one-time credentials when selection changes', async () => {
    const first = operator('operator-a', 'Avery');
    const second = operator('operator-b', 'Morgan');
    const api = stubOperatorApi({ existing: [first, second] });
    const user = userEvent.setup();
    render(<OperatorsView token="owner-token" session={ownerSession} initialOrganization={organization.id} initialWorkspace={project.id} />);

    await user.click(await screen.findByRole('button', { name: 'Avery', exact: true }));
    await user.click(await screen.findByRole('button', { name: 'Create access token' }));
    expect((await screen.findByLabelText('Access token') as HTMLInputElement).value).toBe('niu_once_session_operator-a');
    expect(api.calls.some(call => call.path === '/api/v1/operators/operator-a/sessions' && call.method === 'POST')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Close', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Morgan', exact: true }));
    await waitFor(() => expect(screen.queryByDisplayValue('niu_once_session_operator-a')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Morgan' })).toBeTruthy();
    expect(api.calls.some(call => call.path === '/api/v1/operators/operator-b/sessions' && call.method === 'POST')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Create access token' }));
    expect((await screen.findByLabelText('Access token') as HTMLInputElement).value).toBe('niu_once_session_operator-b');
    expect(api.calls.some(call => call.path === '/api/v1/operators/operator-b/sessions' && call.method === 'POST')).toBe(true);
    expect(api.calls.some(call => call.path === '/api/v1/operators/sessions' && call.method === 'POST')).toBe(false);
  });

  it('keeps the list simple and requires confirmation before revoking organization-wide access', async () => {
    const target = { ...operator('operator-a', 'Avery'), project_id: null };
    const api = stubOperatorApi({ existing: [target] });
    const user = userEvent.setup();
    render(<OperatorsView token="owner-token" session={ownerSession} initialOrganization={organization.id} initialWorkspace={project.id} />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Avery' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Revoke access' }));
    expect(screen.getByText(/removes access to every workspace/)).toBeTruthy();
    expect(api.calls.some(call => call.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.calls.some(call => call.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Actions for Avery' }));
    await user.click(screen.getByRole('menuitem', { name: 'Revoke access' }));
    await user.click(screen.getByRole('button', { name: 'Revoke access' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.calls.some(call => call.path === '/api/v1/operators/operator-a' && call.method === 'DELETE')).toBe(true);
    expect(screen.getAllByText('Revoked').length).toBeGreaterThan(0);
  });

  it('shows operator activity and pages with the server cursor', async () => {
    const api = stubOperatorApi({ existing: [operator('operator-a', 'Avery')] });
    const user = userEvent.setup();
    render(<OperatorsView token="owner-token" session={ownerSession} initialOrganization={organization.id} initialWorkspace={project.id} />);

    await user.click(await screen.findByRole('button', { name: 'Avery', exact: true }));
    expect(await screen.findByText('User added')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Load older' }));
    expect(await screen.findByText('Access token created')).toBeTruthy();
    expect(api.calls.some(call => call.path === '/api/v1/operators/operator-a/events?limit=50&cursor=event-cursor')).toBe(true);
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
    render(<OperatorsView token="owner-token" session={ownerSession} initialOrganization={organization.id} initialWorkspace={project.id} />);

    await user.click(await screen.findByRole('button', { name: 'Avery', exact: true }));
    expect(await screen.findByText('User added')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Load older' }));
    await waitFor(() => expect(api.calls.some(call => call.path.includes('cursor=event-cursor'))).toBe(true));

    await user.click(screen.getByRole('button', { name: 'Close', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Morgan', exact: true }));
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
    render(<OperatorsView token="owner-token" session={ownerSession} initialOrganization={organization.id} initialWorkspace={project.id} />);

    await user.click(await screen.findByRole('button', { name: 'Avery', exact: true }));
    expect(await screen.findByText('User added')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Load older' }));
    await waitFor(() => expect(firstPageCount).toBe(2));

    await user.click(screen.getByRole('button', { name: 'Load older' }));
    expect(await screen.findByText('Access token created')).toBeTruthy();
    expect(api.calls.some(call => call.path.endsWith('cursor=fresh-cursor'))).toBe(true);
    expect(api.calls.filter(call => call.path.endsWith('cursor=event-cursor'))).toHaveLength(1);
  });
});
