import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { appRoutes } from '../../src/app/routes';

function renderAt(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

function mockHealth() {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => ({
    ok: true,
    json: async () => ({ status: 'ok', model_count: 2 }),
  }) as Response));
}

describe('console route layout', () => {
  it('renders the workspace overview and connects the sidebar to real routes', async () => {
    mockHealth();
    const user = userEvent.setup();
    const router = renderAt('/workspaces/default/');

    expect(await screen.findByRole('heading', { name: 'See the work behind agent runs.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Follow a run from intent to outcome' })).toBeTruthy();
    expect(screen.getByText('Illustrative structure. Imported records keep unknown activity and cost visible instead of filling gaps.')).toBeTruthy();
    expect(await screen.findByText('2')).toBeTruthy();
    expect(screen.getByLabelText('Admin token')).toBeTruthy();
    expect(screen.queryByText('Requests today')).toBeNull();

    await user.click(screen.getByRole('link', { name: /Open executions/ }));
    expect(await screen.findByRole('heading', { name: 'Executions' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Executions' }).getAttribute('aria-current')).toBe('page');
    expect(router.state.location.pathname).toBe('/workspaces/default/executions');
  });

  it('loads a feature route directly and shows a route-specific connection state', async () => {
    mockHealth();
    renderAt('/workspaces/production/usage');

    expect(await screen.findByRole('heading', { name: 'Usage & cost' })).toBeTruthy();
    expect(screen.getByText('Connect to the gateway admin API')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Usage & cost' }).getAttribute('aria-current')).toBe('page');
  });

  it('renders an intentional not-found view for unknown paths', async () => {
    mockHealth();
    renderAt('/workspaces/default/not-a-console-route');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Return to overview' })).toBeTruthy();
  });
});
