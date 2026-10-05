import { describe, expect, it, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { appRoutes } from '../../src/app/routes';

describe('workspace navigation URLs', () => {
  it.each(['/workspaces/research/keys', '/workspaces/research/activity'])('keeps workspace scope from %s before authentication', async (path) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }))));
    const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    const navigation = within(await screen.findByRole('navigation', { name: 'Main navigation' }));
    for (const [label, suffix] of [['Overview', ''], ['API keys', '/keys'], ['Observability', '/executions'], ['Usage', '/usage'], ['Access management', '/operators']]) {
      expect(navigation.getByRole('link', { name: label, exact: true }).getAttribute('href')).toBe(`/workspaces/research${suffix}`);
    }
    const user = userEvent.setup();
    await user.click(navigation.getByRole('link', { name: 'Overview', exact: true }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/research'));
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    const menu = within(await screen.findByRole('menu'));
    expect(menu.getByRole('menuitem', { name: 'Sign in', exact: true }).getAttribute('href')).toBe('/login');
    expect(menu.queryByRole('menuitem', { name: 'Organization settings' })).toBeNull();
    await user.click(menu.getByRole('menuitem', { name: 'Sign in', exact: true }));
    expect(await screen.findByLabelText('Administrator token')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/login');
  });
});
