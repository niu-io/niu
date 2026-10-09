import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import AppLayout from '../../src/app/AppLayout';
import LoginRoute from '../../src/features/login/page';

describe('sign-in destination restoration', () => {
  it.each([
    ['/login?returnTo=%2Fmodels%3Fsearch%3Dflash%23pricing', null, '/models', '?search=flash', '#pricing'],
    ['/login?returnTo=%2Fmodels', { from: '/workspaces/research/keys?sort=activity' }, '/workspaces/research/keys', '?sort=activity', ''],
    ['/login?returnTo=%2F%2Fexample.invalid', null, '/workspaces/default/', '', ''],
    ['/login?returnTo=%2Flogin', null, '/workspaces/default/', '', ''],
    ['/login?returnTo=%2Finstallation', null, '/workspaces/default/', '', ''],
    ['/login', { from: '/\\example.invalid/' }, '/workspaces/default/', '', ''],
  ])('restores only safe destinations from %s', async (initial, state, pathname, search, hash) => {
    vi.stubGlobal('fetch', vi.fn(async input => {
      const path = String(input);
      return new Response(JSON.stringify(path === '/healthz' ? { status: 'ok' }
        : path === '/admin/v1/auth/config' ? { password_login: true }
        : path === '/admin/v1/session' ? { data: { kind: 'installation', operator: null, permissions: { read: true, write: true, manage_operators: true } } }
        : { data: [] }));
    }));
    const router = createMemoryRouter([{ element: <AppLayout />, children: [
      { path: '/login', element: <LoginRoute /> },
      { path: '*', element: <p>Destination</p> },
    ] }], { initialEntries: [{ pathname: initial.split('?')[0], search: initial.includes('?') ? '?' + initial.split('?')[1] : '', state }] });
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(router.state.location.pathname).toBe(pathname));
    expect(router.state.location.search).toBe(search);
    expect(router.state.location.hash).toBe(hash);
  });
});
