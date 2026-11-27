import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import OverviewQuickStart from '../../../app/features/overview/components/OverviewQuickStart';
import OverviewRoute from '../../../app/features/overview/page';
import type { DashboardContext } from '../../../app/shell/dashboard-context';

const fixture = vi.hoisted(() => ({
  context: {} as DashboardContext,
  gatewayProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../app/shell/dashboard-context', () => ({ useDashboardContext: () => fixture.context }));
vi.mock('../../../app/features/executions/components/GatewayActivity', () => ({
  default: (props: Record<string, unknown>) => {
    fixture.gatewayProps.push(props);
    return <div data-testid="gateway-activity" />;
  },
}));

it('offers agent and manual setup without repeating the page actions', () => {
  render(<MemoryRouter><OverviewQuickStart /></MemoryRouter>);
  expect(screen.getByText('No requests yet')).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Install MCP'})).toBeTruthy();
  expect(screen.getByRole('link', {name: 'API quickstart'}).getAttribute('href')).toBe('/docs/guides/api-quickstart/');
  expect(screen.queryByRole('button', {name: /Create.*key/i})).toBeNull();
  expect(screen.queryByRole('link', {name: /View requests/i})).toBeNull();
});

describe('workspace overview route', () => {
  it('keeps breakdown tables on Activity and supplies the compact first-use state', () => {
    fixture.gatewayProps.length = 0;
    fixture.context = {
      token: 'test-session',
      models: [{id: 'model'}],
      workspace: {id: 'workspace-1', slug: 'customer-workspace', organization_id: 'org-1', name: 'Customer workspace'},
      workspaces: [{id: 'workspace-1', slug: 'customer-workspace', organization_id: 'org-1', name: 'Customer workspace'}],
      session: {kind: 'operator', operator: null, permissions: {read: true, write: true, manage_operators: false}},
    } as unknown as DashboardContext;
    render(<MemoryRouter initialEntries={['/workspaces/customer-workspace']}><Routes><Route path="/workspaces/:workspace" element={<OverviewRoute />} /></Routes></MemoryRouter>);
    const props = fixture.gatewayProps.at(-1)!;
    expect(props.compact).toBe(true);
    expect(props.workspaceRoute).toBe('/workspaces/customer-workspace');
    expect(props.emptyState).toBeTruthy();
    expect('showBreakdowns' in props).toBe(false);
  });

  it('withholds zero-model admin setup warnings while the workspace catalog is still loading', () => {
    fixture.gatewayProps.length = 0;
    fixture.context = {
      token: 'test-session',
      models: [],
      modelsLoading: true,
      workspace: {id: 'workspace-1', slug: 'customer-workspace', organization_id: 'org-1', name: 'Customer workspace', active_key_count: 1},
      workspaces: [{id: 'workspace-1', slug: 'customer-workspace', organization_id: 'org-1', name: 'Customer workspace', active_key_count: 1}],
      session: {kind: 'installation', operator: null, permissions: {read: true, write: true, platform_admin: true}},
    } as unknown as DashboardContext;
    render(<MemoryRouter initialEntries={['/workspaces/customer-workspace']}><Routes><Route path="/workspaces/:workspace" element={<OverviewRoute />} /></Routes></MemoryRouter>);
    expect(screen.queryByRole('link', {name: 'Admin setup'})).toBeNull();
    expect(screen.getByText('—')).toBeTruthy();
  });
});
