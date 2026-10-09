import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import LoginRoute from '../../src/features/login/page';
import InstallationRoute from '../../src/features/login/installation-page';
import AppLayout from '../../src/app/AppLayout';

function showLogin() {
  const context = { token: '', error: '', connect: vi.fn(), connectWithToken: vi.fn(), draftToken: '', setDraftToken: vi.fn() };
  const router = createMemoryRouter([{ element: <Outlet context={context} />, children: [{ path: '/login', element: <LoginRoute /> }] }], { initialEntries: ['/login'] });
  render(<RouterProvider router={router} />);
  return context;
}

describe('account sign-in service availability', () => {
  it('keeps installation administration explicitly accessible while account sign-in is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const router = createMemoryRouter([{ element: <AppLayout />, children: [
      { path: '/installation', element: <InstallationRoute /> },
      { path: '/login', element: <LoginRoute /> },
    ] }], { initialEntries: ['/installation'] });
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: 'Installation administration' })).toBeTruthy();
    expect(screen.getByLabelText('Administrator token')).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(router.state.location.pathname).toBe('/installation');
  });
  it.each(['offline', 'disabled', 'missing', 'malformed'])('keeps account fields when configuration is %s', async failure => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failure === 'offline') throw new Error('offline');
      if (failure === 'missing') return new Response('', { status: 404 });
      if (failure === 'malformed') return new Response('invalid JSON');
      return Response.json({ enabled: false });
    }));
    const context = showLogin();
    await screen.findByText('Sign-in is temporarily unavailable.');
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryByLabelText('Administrator token')).toBeNull();
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(true);
    expect(context.connect).not.toHaveBeenCalled();
  });

  it('retries configuration and submits account credentials without token fallback', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ password_login: true }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    const context = showLogin();
    await screen.findByText('Sign-in is temporarily unavailable.');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'another@example.test');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('another@example.test');
    await user.type(screen.getByLabelText('Password'), 'fixture-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(context.connectWithToken).toHaveBeenCalledWith('niu-browser-member-session'));
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ email: 'another@example.test', password: 'fixture-password' });
    expect(context.connect).not.toHaveBeenCalled();
  });
});
