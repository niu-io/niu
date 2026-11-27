import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import LoginRoute from '@/features/login/page';
import RegisterRoute from '@/features/login/register-page';
import { RegistrationRequestsQueue } from '@/features/platform-settings/registration-review';
import { saveLocale } from '@/shell/locale';

vi.mock('@/features/models/public-catalog', () => ({
  loadPublicCatalogModels: vi.fn(async () => ({ models: [] })),
}));

vi.mock('@/shell/branding', () => ({
  useBranding: () => ({
    settings: { display_name: 'Niu', logo_data_url: null },
    logo: '/favicon.ico',
  }),
}));

const connectWithToken = vi.fn(async () => {});

vi.mock('@/shell/dashboard-context', () => ({
  useDashboardContext: () => ({
    token: '',
    sessionChecked: true,
    session: null,
    error: '',
    connectWithToken,
  }),
}));

describe('Limited Preview registration flow', () => {
  it('submits a registration request on /register when approval_required is enabled', async () => {
    saveLocale('en');
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/auth/config') {
        return Response.json({
          password_login: true,
          browser_token_login: true,
          registration_mode: 'approval_required',
        });
      }
      if (url === '/api/v1/auth/registrations' && init?.method === 'POST') {
        return Response.json({ status: 'pending_approval' }, { status: 202 });
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterRoute />} />
          <Route path="/login" element={<LoginRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Limited Preview')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Submit registration request' }));
    const fullName = screen.getByLabelText('Full name');
    expect(document.activeElement).toBe(fullName);
    expect(fullName.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
    await user.type(fullName, 'Ada Lovelace');
    await user.type(screen.getByLabelText('Work email'), 'ada@example.test');
    await user.type(screen.getByLabelText('Organization or team'), 'Analytical Engine');
    await user.type(screen.getByLabelText('Password'), 'synthetic preview passphrase');
    await user.type(screen.getByLabelText('Intended use (optional)'), 'Coding agent evaluation');
    await user.click(screen.getByRole('button', { name: 'Submit registration request' }));

    expect(await screen.findByText('Request submitted for review')).toBeTruthy();
    const applicant = screen.getByText('ada@example.test').closest('li');
    expect(applicant?.textContent).toContain('Ada Lovelace');
    expect(applicant?.textContent).toContain('Approve');
    expect(applicant?.textContent).toContain('Reject');
    const submitCall = fetchMock.mock.calls.find(call => String(call[0]) === '/api/v1/auth/registrations');
    expect(submitCall).toBeTruthy();
    expect(JSON.parse(String(submitCall?.[1]?.body))).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.test',
      password: 'synthetic preview passphrase',
      organization_name: 'Analytical Engine',
      note: 'Coding agent evaluation',
    });
  });

  it('shows a calm pending-approval notice on /login instead of generic failure', async () => {
    saveLocale('en');
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/v1/auth/config') {
          return Response.json({
            password_login: true,
            browser_token_login: true,
            registration_mode: 'approval_required',
          });
        }
        if (url === '/api/v1/auth/browser/login') {
          return Response.json(
            { error: { type: 'registration_pending_approval', code: 403, message: 'Pending approval' } },
            { status: 403 },
          );
        }
        return Response.json({}, { status: 404 });
      }),
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: /Limited Preview/i })).toBeTruthy();
    await user.type(screen.getByLabelText('Email'), 'ada@example.test');
    await user.type(screen.getByLabelText('Password'), 'synthetic preview passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('awaiting administrator approval');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lets administrators review and approve pending registrations without rendering UUIDs or <select>', async () => {
    saveLocale('en');
    const requestId = '99999999-9999-4999-8999-999999999999';
    const pendingRow = {
      id: requestId,
      email: 'ada@example.test',
      applicant_name: 'Ada Lovelace',
      organization_name: 'Analytical Engine',
      workspace_name: 'Default workspace',
      note: 'Need Codex access',
      status: 'pending',
      revision: '1',
      created_at: '2026-11-16T08:00:00Z',
      reviewed_at: null,
      reviewed_by_kind: null,
      reviewed_by_label: null,
      decision_note: null,
      approved_organization_slug: null,
      approved_workspace_slug: null,
    };
    const approvedRow = {
      ...pendingRow,
      status: 'approved',
      revision: '2',
      reviewed_at: '2026-11-16T08:05:00Z',
      reviewed_by_kind: 'installation',
      reviewed_by_label: 'Installation administrator',
      approved_organization_slug: 'analytical-engine',
      approved_workspace_slug: 'default-workspace',
    };
    let approved = false;
    const onApproved = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/v1/admin/registration') {
          return Response.json({
            data: {
              mode: 'approval_required',
              revision: '1',
              updated_at: '2026-11-16T00:00:00Z',
              password_login_configured: true,
            },
          });
        }
        if (url.startsWith('/api/v1/admin/registrations?')) {
          return Response.json({
            data: approved ? [] : [pendingRow],
            next_cursor: null,
            counts: approved
              ? { pending: 0, approved: 1, rejected: 0 }
              : { pending: 1, approved: 0, rejected: 0 },
            policy: {
              mode: 'approval_required',
              revision: '1',
              updated_at: '2026-11-16T00:00:00Z',
            },
          });
        }
        if (url === `/api/v1/admin/registrations/${requestId}/approve` && init?.method === 'POST') {
          approved = true;
          return Response.json({ data: approvedRow });
        }
        return Response.json({}, { status: 404 });
      }),
    );

    const user = userEvent.setup();
    const onCountsChange = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <RegistrationRequestsQueue onCountsChange={onCountsChange} token="platform-token" onApproved={onApproved} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    const applicant = screen.getByText('ada@example.test').closest('li');
    expect(applicant?.textContent).toContain('Ada Lovelace');
    expect(applicant?.textContent).toContain('Approve');
    expect(applicant?.textContent).toContain('Reject');
    expect(container.querySelector('select')).toBeNull();
    expect(container.textContent).not.toContain(requestId);

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Approve & provision' }));

    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onCountsChange).toHaveBeenLastCalledWith({ pending: 0, approved: 1, rejected: 0 }));
    expect(await screen.findByText(/Registration approved and account provisioned/)).toBeTruthy();
    const emptyTitle = await screen.findByText('No pending registration requests');
    expect(emptyTitle.closest('[data-slot="empty"]')?.textContent).toBe(emptyTitle.textContent);
  });
});
