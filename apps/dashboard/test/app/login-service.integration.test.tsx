import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import LoginRoute from '../../app/features/login/page';
import InstallationRoute from '../../app/features/login/installation-page';
import AppLayout from '../../app/shell/AppLayout';
import { BrandingProvider, defaultBranding } from '../../app/shell/branding';

function showLogin(withBranding = false) {
  const context = { token: '', error: '', connect: vi.fn(), connectWithToken: vi.fn(), draftToken: '', setDraftToken: vi.fn() };
  const router = createMemoryRouter([{ element: <Outlet context={context} />, children: [{ path: '/login', element: <LoginRoute /> }] }], { initialEntries: ['/login'] });
  const app = <RouterProvider router={router} />;
  render(withBranding ? <BrandingProvider>{app}</BrandingProvider> : app);
  return context;
}

describe('account sign-in service availability', () => {
  it('explains how to obtain or recover account access when password sign-in is available', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({password_login:true,browser_token_login:false})));
    showLogin();
    await screen.findByText('Need an account or forgot your password? Ask your organization owner or installation administrator for help.');
    expect(screen.queryByRole('link', {name:/reset password/i})).toBeNull();
  });
  it.each([
    { display_name: 'Example Cloud', logo_data_url: null },
    { display_name: 'Niu', logo_data_url: 'data:image/png;base64,iVBORw0KGgo=' },
  ])('preserves deployment branding on the sign-in header: $display_name', async override => {
    vi.stubGlobal('fetch', vi.fn(async input => String(input) === '/v1/branding'
      ? Response.json({ data: { revision: '7', settings: { ...defaultBranding, ...override } } })
      : Response.json({ password_login: true })));
    showLogin(true);
    await waitFor(() => {
      const home = screen.getByRole('link', { name: `${override.display_name} home` });
      expect(home.textContent).toBe(override.display_name);
      const image = home.querySelector('img');
      expect(image).not.toBeNull();
      if (override.logo_data_url) expect(image?.getAttribute('src')).toBe(override.logo_data_url);
      else expect(image?.getAttribute('src')).toContain('niu-mark.png');
    });
  });

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
  it('offers the installation administrator path when account sign-in is not configured', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({password_login:false,browser_token_login:false})));
    showLogin();
    await screen.findByText('Account sign-in is not configured. Contact your installation administrator.');
    expect(screen.getByRole('link', {name:'Open installation administration'}).getAttribute('href')).toBe('/installation');
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByLabelText('User access token')).toBeNull();
  });
  it('shows user-token sign-in directly when it is available without password login', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({password_login:false,browser_token_login:true})));
    showLogin();
    expect(await screen.findByLabelText('User access token')).toBeTruthy();
    expect((screen.getByRole('button', {name:'Sign in'}) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByLabelText('Password')).toBeNull();
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
