import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import OverviewRoute from '../../../src/features/overview/page';
import ModelsRoute from '../../../src/features/models/page';
import { SidebarProvider } from '../../../src/components/ui/sidebar';
import type { DashboardContext } from '../../../src/app/dashboard-context';

const fixture = vi.hoisted(() => ({ context: {} as DashboardContext }));
vi.mock('../../../src/app/dashboard-context', () => ({ useDashboardContext: () => fixture.context }));
vi.mock('../../../src/features/executions/components/GatewayActivity', () => ({ default: () => <div>Customer activity</div> }));

describe('customer model workflow', () => {
  it('lets an installation administrator connect the first upstream route', () => {
    fixture.context = {
      token: 'test-session', models: [], workspace: null,
      session: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } },
    } as unknown as DashboardContext;
    const { container } = render(<MemoryRouter><OverviewRoute /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Connect supplier' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Connect supplier' }).getAttribute('href')).toBe('/admin/suppliers');
  });
  it('allows a user account with platform administration permissions to connect a Supplier', () => {
    fixture.context = {token: 'test-session', models: [], workspace: null,
      session: {kind: 'operator', permissions: {platform_admin: true, manage_operators: true}},
    } as unknown as DashboardContext;
    render(<MemoryRouter><OverviewRoute /></MemoryRouter>);
    expect(screen.getByRole('link', {name: 'Connect supplier'}).getAttribute('href')).toBe('/admin/suppliers');
  });
  it('keeps operator setup in the model catalog instead of upstream configuration', () => {
    fixture.context = {
      token: 'test-session', models: [], workspace: null,
      session: { kind: 'operator', operator: null, permissions: { read: true, write: true, manage_operators: true } },
    } as unknown as DashboardContext;
    const { container } = render(<MemoryRouter><OverviewRoute /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Browse models' })).toBeTruthy();
    expect(container.querySelector('a[href="/suppliers"], a[href="/admin/suppliers"]')).toBeNull();
  });
  it('starts Chat directly in the current workspace', () => {
    fixture.context = { token: 'test-session', models: [{id: 'model'}], workspace: {id: 'internal-workspace', organization_id: 'org'}, session: null } as unknown as DashboardContext;
    render(<MemoryRouter initialEntries={['/workspaces/customer-workspace']}><Routes><Route path="/workspaces/:workspace" element={<OverviewRoute />} /></Routes></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Compare models' }).getAttribute('href')).toBe('/generations?new=1&workspace=customer-workspace');
  });
  it('keeps the empty model catalog customer-facing', () => {
    fixture.context = { token: 'test-session', models: [], workspace: null, session: null } as unknown as DashboardContext;
    const { container } = render(<MemoryRouter><SidebarProvider><ModelsRoute /></SidebarProvider></MemoryRouter>);
    expect(screen.getByText('Ask a platform administrator to connect a provider and add a model route to the catalog.')).toBeTruthy();
    expect(container.querySelector('a[href="/suppliers"], a[href="/admin/suppliers"]')).toBeNull();
  });
});
