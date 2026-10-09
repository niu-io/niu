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
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.state.from).toBe(path);
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });
});
