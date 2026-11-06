import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, Outlet, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import SettingsPage, { SettingsNavigation } from '../../app/features/account/settings-page';
import { SidebarProvider } from '../../app/components/ui/sidebar';
import type { DashboardContext } from '../../app/shell/dashboard-context';

function context(kind: 'installation' | 'operator' = 'installation'): DashboardContext {
  return {
    token: 'fixture',
    session: kind === 'operator'
      ? { kind, operator: { id: 'member', role: 'owner', project_id: null, organization_id: 'org' }, permissions: { read: true, write: true, manage_operators: true } }
      : { kind, operator: null, permissions: { read: true, write: true, manage_operators: true } },
    appearance: { ready: true },
    organization: kind === 'operator' ? { id: 'org', name: 'Example company' } : null,
  } as unknown as DashboardContext;
}

function mount(path: string, session = context()) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const requestPath = String(input);
    if (requestPath === '/api/v1/auth/profile') {
      return Response.json({ data: { name: 'Member', email: null, avatar_data_url: null, revision: 0 } });
    }
    if (requestPath.endsWith('/billing/balance') || requestPath.endsWith('/billing/transactions')) {
      return Response.json({ data: [] });
    }
    return Response.json({ data: [] });
  }));
  const router = createMemoryRouter(
    [
      {
        element: (
          <SidebarProvider>
            <SettingsNavigation context={session} />
            <Outlet context={session} />
          </SidebarProvider>
        ),
        children: [
          { path: '/settings/:section?', Component: SettingsPage },
          { path: '/workspaces/default', element: <p>Workspace</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('settings routes', () => {
  it('renders Settings as a page inside the existing shell instead of a modal', async () => {
    const router = mount('/settings/appearance');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Settings navigation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Color mode' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/settings/appearance');
    expect(screen.getByRole('link', { name: 'Credits' }).getAttribute('href')).toBe('/settings/billing');
    await userEvent.click(screen.getByRole('link', { name: 'About', exact: true }));
    expect(router.state.location.pathname).toBe('/settings/about');
    expect(screen.getByRole('region', { name: 'About Niu' })).toBeTruthy();
  });

  it('defaults /settings to the personal account section for operators', async () => {
    const router = mount('/settings', context('operator'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/account'));
    expect(screen.getByRole('navigation', { name: 'Settings navigation' })).toBeTruthy();
  });

  it('defaults /settings to appearance for installation administrators', async () => {
    const router = mount('/settings', context('installation'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/appearance'));
    expect(screen.queryByRole('link', { name: 'Account', exact: true })).toBeNull();
  });

  it('redirects legacy Payments bookmarks directly to the canonical Billing section', async () => {
    const router = mount('/settings/payments?view=history#balance');
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/billing'));
    expect(router.state.location.search).toBe('?view=history');
    expect(router.state.location.hash).toBe('#balance');
    expect(screen.queryByRole('link', { name: 'Payments' })).toBeNull();
  });

  it('redirects unknown sections to the usable default', async () => {
    const router = mount('/settings/unknown');
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/appearance'));
  });

  it('marks only the selected canonical section as current', () => {
    render(
      <MemoryRouter initialEntries={['/settings/account']}>
        <SidebarProvider>
          <SettingsNavigation context={context('operator')} />
        </SidebarProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Account' }).getAttribute('aria-current')).toBe('page');
    for (const name of ['Organization', 'Members', 'Appearance', 'Credits', 'About']) {
      expect(screen.getByRole('link', { name }).hasAttribute('aria-current')).toBe(false);
    }
  });

  it('links organization and members to their canonical Settings homes', () => {
    render(
      <MemoryRouter initialEntries={['/settings/organization']}>
        <SidebarProvider>
          <SettingsNavigation context={context('operator')} />
        </SidebarProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Organization' }).getAttribute('href')).toBe('/settings/organization');
    expect(screen.getByRole('link', { name: 'Organization' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Members' }).getAttribute('href')).toBe('/settings/members');
  });

  it('keeps the legacy Payments path selected on Billing navigation', () => {
    render(
      <MemoryRouter initialEntries={['/settings/payments']}>
        <SidebarProvider>
          <SettingsNavigation context={context('installation')} />
        </SidebarProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Credits' }).getAttribute('aria-current')).toBe('page');
  });
});
