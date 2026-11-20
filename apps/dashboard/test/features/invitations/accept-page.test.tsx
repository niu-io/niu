import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router';
import AcceptInvitationPage from '@/features/invitations/accept-page';
import type { DashboardContext } from '@/shell/dashboard-context';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

const invitation = {
  id: 'invitation-1',
  organization_id: 'org-1',
  organization_name: 'Niu Labs',
  organization_slug: 'niu-labs',
  project_id: 'workspace-1',
  project_name: 'Production',
  project_slug: 'production',
  role: 'admin',
  recipient_email: 'person@example.test',
  recipient_name: 'Person',
  status: 'pending',
  delivery: 'not_configured',
  created_at: '2026-11-05T00:00:00Z',
  expires_at: '2026-11-12T00:00:00Z',
  accepted_at: null,
  revoked_at: null,
  invited_by: 'Owner',
};

function context(overrides: Partial<DashboardContext> = {}): DashboardContext {
  return {
    token: 'member-token',
    sessionChecked: true,
    session: { kind: 'operator', operator: { id: 'operator-1', role: 'viewer', organization_id: 'other-org', project_id: null }, permissions: { read: true, write: true, manage_operators: false } },
    organizations: [],
    organization: null,
    workspaces: [],
    workspace: null,
    workspaceLoading: false,
    selectOrganization: vi.fn(),
    selectWorkspace: vi.fn(),
    reloadWorkspaces: vi.fn(),
    workspaceError: null,
    createWorkspace: vi.fn(),
    applyWorkspaceRename: vi.fn(),
    deleteWorkspace: vi.fn(),
    chatKeys: [],
    rememberChatKey: vi.fn(),
    forgetChatKey: vi.fn(),
    models: [],
    health: { status: 'ok' },
    gatewayStatus: 'online',
    error: '',
    connect: vi.fn(),
    connectWithToken: vi.fn(),
    signOut: vi.fn(),
    modelsLoading: false,
    modelsError: '',
    refreshModels: vi.fn(),
    refreshWorkspace: vi.fn(),
    ...overrides,
  } as unknown as DashboardContext;
}

function renderPage(ctx: DashboardContext, token = 'niu_invite_once_only_secret') {
  const router = createMemoryRouter(
    [{ element: <Outlet context={ctx} />, children: [{ path: '/invite/:token', element: <AcceptInvitationPage /> }] }],
    { initialEntries: [`/invite/${token}`] },
  );
  return render(<RouterProvider router={router} />);
}

describe('invitation acceptance page', () => {
  it('shows the organization, exact scope, role consequences and expiry before accepting', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ data: { ...invitation, caller_email: 'person@example.test', email_matches: true, already_accepted_by_caller: false } })));
    const acceptInvitation = vi.fn(async () => ({ kind: 'operator' }));
    const user = userEvent.setup();
    renderPage(context({ acceptInvitation: acceptInvitation as unknown as DashboardContext['acceptInvitation'] }));

    expect(await screen.findByRole('heading', { name: 'Niu Labs' })).toBeTruthy();
    expect(screen.getByText('Workspace: Production')).toBeTruthy();
    expect(screen.getByText(/Can read and change workspace data/)).toBeTruthy();
    expect(screen.getByText('person@example.test')).toBeTruthy();
    expect(screen.getByText(/Nov 12, 2026|2026/)).toBeTruthy();
    expect(screen.queryByText(/invitation sent/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith('niu_invite_once_only_secret'));
  });

  it('does not offer acceptance to the wrong signed-in email and explains the sign-in handoff', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ data: { ...invitation, caller_email: 'other@example.test', email_matches: false, already_accepted_by_caller: false } })));
    const acceptInvitation = vi.fn();
    const signOut = vi.fn();
    renderPage(context({ acceptInvitation, signOut }));

    expect(await screen.findByText('This invitation is for another email')).toBeTruthy();
    expect(screen.getByText(/other@example.test/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).toBeNull();
    expect(acceptInvitation).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('explains an expired invitation and asks for a replacement link', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ data: { ...invitation, status: 'expired', caller_email: 'person@example.test', email_matches: true, already_accepted_by_caller: false } })));
    renderPage(context());
    expect(await screen.findByText(/This invitation expired/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).toBeNull();
  });

  it('reports an unavailable link without disclosing internal identifiers', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { message: 'This invitation is invalid, expired, canceled, already used, or no longer authorized.' } }, 404)));
    renderPage(context());
    expect(await screen.findByRole('heading', { name: 'This invitation is no longer available' })).toBeTruthy();
    expect(screen.getByText(/Ask the organization owner for a new invitation/)).toBeTruthy();
    expect(screen.queryByText(/invitation-1|org-1|workspace-1/)).toBeNull();
  });
});
