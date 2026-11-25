import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import OverviewRoute from '../../../app/features/overview/page';
import ModelsRoute from '../../../app/features/models/page';
import { SidebarProvider } from '../../../app/components/ui/sidebar';
import type { DashboardContext } from '../../../app/shell/dashboard-context';

const fixture = vi.hoisted(() => ({ context: {} as DashboardContext }));
vi.mock('../../../app/shell/dashboard-context', () => ({ useDashboardContext: () => fixture.context }));
vi.mock('../../../app/features/executions/components/GatewayActivity', () => ({ default: () => <div>Customer activity</div> }));

describe('customer model workflow', () => {
  it('lets an installation administrator open Admin setup for the first upstream route', () => {
    fixture.context = {
      token: 'test-session', models: [], workspace: null,
      session: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } },
    } as unknown as DashboardContext;
    render(<MemoryRouter><OverviewRoute /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Admin setup' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Admin setup' }).getAttribute('href')).toBe('/admin');
  });
  it('allows a user account with platform administration permissions to open Admin setup', () => {
    fixture.context = {token: 'test-session', models: [], workspace: null,
      session: {kind: 'operator', permissions: {platform_admin: true, manage_operators: true}},
    } as unknown as DashboardContext;
    render(<MemoryRouter><OverviewRoute /></MemoryRouter>);
    expect(screen.getByRole('link', {name: 'Admin setup'}).getAttribute('href')).toBe('/admin');
  });
  it('keeps operator setup in the model catalog instead of upstream configuration', () => {
    fixture.context = {
      token: 'test-session', models: [], workspace: null,
      session: { kind: 'operator', operator: null, permissions: { read: true, write: true, manage_operators: true } },
    } as unknown as DashboardContext;
    const { container } = render(<MemoryRouter><OverviewRoute /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Browse models' })).toBeTruthy();
    expect(container.querySelector('a[href="/providers"], a[href="/admin/providers"], a[href="/suppliers"], a[href="/admin/suppliers"]')).toBeNull();
  });
  it('starts Chat directly in the current workspace', () => {
    fixture.context = { token: 'test-session', models: [{id: 'model'}], workspace: {id: 'internal-workspace', organization_id: 'org', active_key_count: 1}, session: null } as unknown as DashboardContext;
    render(<MemoryRouter initialEntries={['/workspaces/customer-workspace']}><Routes><Route path="/workspaces/:workspace" element={<OverviewRoute />} /></Routes></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Open Generations' }).getAttribute('href')).toBe('/generations?new=1&workspace=customer-workspace');
  });
  it('prompts API key creation with 1-click auto-provisioning instead of sending zero-key workspaces straight to Generations', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/v1/workspaces/ws-empty/keys' && init?.method === 'POST') {
        return Response.json({ id: 'key-auto-1', token: 'niu_live_secret', allowed_models: ['*'], key: { id: 'key-auto-1', slug: 'playground', name: 'Playground', allowed_models: ['*'], invocation_allowed: true, revoked: false, expired: false } }, { status: 201 });
      }
      return Response.json({ data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const rememberChatKey = vi.fn();
    const reloadWorkspaces = vi.fn();
    fixture.context = {
      token: 'test-session',
      models: [{ id: 'model' }],
      workspace: { id: 'ws-empty', slug: 'customer-workspace', organization_id: 'org', name: 'Customer workspace', active_key_count: 0 },
      workspaces: [{ id: 'ws-empty', slug: 'customer-workspace', organization_id: 'org', name: 'Customer workspace', active_key_count: 0 }],
      session: { kind: 'operator', operator: null, permissions: { read: true, write: true, manage_operators: false } },
      rememberChatKey,
      reloadWorkspaces,
    } as unknown as DashboardContext;
    render(
      <MemoryRouter initialEntries={['/workspaces/customer-workspace']}>
        <Routes>
          <Route path="/workspaces/:workspace" element={<OverviewRoute />} />
          <Route path="/generations" element={<div data-testid="generations-landed">Generations</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: 'Open Generations' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Create API key' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(dialog.querySelector('button:last-of-type')!);
    expect(await screen.findByTestId('generations-landed')).toBeTruthy();
    expect(rememberChatKey).toHaveBeenCalledOnce();
    expect(reloadWorkspaces).toHaveBeenCalledOnce();
  });
  it('points read-only members with zero active keys to Keys instead of Generations', () => {
    fixture.context = {
      token: 'test-session',
      models: [{ id: 'model' }],
      workspace: { id: 'ws-ro', slug: 'customer-workspace', organization_id: 'org', name: 'Customer workspace', active_key_count: 0 },
      session: { kind: 'operator', operator: null, permissions: { read: true, write: false, manage_operators: false } },
    } as unknown as DashboardContext;
    render(<MemoryRouter initialEntries={['/workspaces/customer-workspace']}><Routes><Route path="/workspaces/:workspace" element={<OverviewRoute />} /></Routes></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'Open Generations' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Keys' }).getAttribute('href')).toBe('/workspaces/customer-workspace/keys');
  });
  it('keeps the empty model catalog customer-facing', () => {
    fixture.context = { token: 'test-session', models: [], workspace: null, session: null } as unknown as DashboardContext;
    const { container } = render(<MemoryRouter><SidebarProvider><ModelsRoute /></SidebarProvider></MemoryRouter>);
    expect(screen.getByText('Ask a platform administrator to connect a Provider and import its models.')).toBeTruthy();
    expect(container.querySelector('a[href="/providers"], a[href="/admin/providers"], a[href="/suppliers"], a[href="/admin/suppliers"]')).toBeNull();
  });
});
