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

function quickStart(overrides: Partial<Parameters<typeof OverviewQuickStart>[0]> = {}) {
  return <MemoryRouter><OverviewQuickStart
    workspaceRoot="/workspaces/demo"
    modelsHref="/models?workspace=demo"
    canWrite
    canManagePlatform={false}
    hasModels
    {...overrides}
  /></MemoryRouter>;
}

describe('workspace overview quick start', () => {
  it('prioritizes agent connection while retaining manual setup and request evidence', () => {
    render(quickStart());
    expect(screen.getByRole('heading', {name: 'Connect your agent'})).toBeTruthy();
    expect(screen.getByRole('link', {name: 'Create an API key'}).getAttribute('href')).toBe('/workspaces/demo/keys');
    expect(screen.getByRole('link', {name: 'Read the API quickstart'}).getAttribute('href')).toBe('/docs/guides/api-quickstart/');
    expect(screen.getByRole('link', {name: 'View requests'}).getAttribute('href')).toBe('/workspaces/demo/executions');
  });

  it('keeps API key creation out of the guidance for a read-only member', () => {
    render(quickStart({canWrite: false}));
    expect(screen.queryByRole('link', {name: 'Create an API key'})).toBeNull();
    expect(screen.getByRole('link', {name: 'API keys'}).getAttribute('href')).toBe('/workspaces/demo/keys');
    expect(screen.getByText('Ask a workspace administrator to create or share a key.')).toBeTruthy();
  });

  it('points administrators without models at Provider configuration', () => {
    render(quickStart({hasModels: false, canManagePlatform: true}));
    expect(screen.getByRole('heading', {name: 'Connect your agent'})).toBeTruthy();
    expect(screen.getByRole('link', {name: 'Connect provider'}).getAttribute('href')).toBe('/admin/providers');
  });

  it('points other members without models at the workspace model catalog', () => {
    render(quickStart({hasModels: false}));
    expect(screen.getByRole('link', {name: 'Browse models'}).getAttribute('href')).toBe('/models?workspace=demo');
    expect(screen.getByText('A platform administrator must connect a Provider and publish models before this workspace can send requests.')).toBeTruthy();
  });
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
});
