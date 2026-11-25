import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginRoute from '../../app/features/login/page';
import SetupRoute from '../../app/features/login/setup-page';
import { invalidateAuthConfigCache } from '../../app/lib/auth-config';
import AppLayout from '../../app/shell/AppLayout';
import { BrandingProvider, defaultBranding } from '../../app/shell/branding';

vi.mock('../../app/features/models/public-catalog', () => ({
  loadPublicCatalogModels: vi.fn(async () => ({ models: [] })),
}));

beforeEach(() => {
  invalidateAuthConfigCache();
});

function showLogin(withBranding = false, initialPath = '/login') {
  const context = { token: '', error: '', connect: vi.fn(), connectWithToken: vi.fn(), draftToken: '', setDraftToken: vi.fn() };
  const router = createMemoryRouter([{ element: <Outlet context={context} />, children: [
    { path: '/login', element: <LoginRoute /> },
    { path: '/setup', element: <SetupRoute /> },
    { path: '/admin', element: <div>Admin destination</div> },
    { path: '/workspaces/default/', element: <div>Workspace destination</div> },
  ] }], { initialEntries: [initialPath] });
  const app = <RouterProvider router={router} />;
  render(withBranding ? <BrandingProvider>{app}</BrandingProvider> : app);
  return { context, router };
}

describe('account sign-in service availability', () => {
  it('renders clean email and password sign-in without access-token mode or /setup link once initialized', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ password_login: true, browser_token_login: true, setup_required: false })));
    showLogin();
    await screen.findByText(/Need an account or forgot your password\? Ask your organization owner for an invitation or contact your installation administrator\./);
    expect(screen.queryByRole('button', { name: 'Use an access token' })).toBeNull();
    expect(screen.queryByLabelText('User access token')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Administrator token sign-in' })).toBeNull();
    expect(screen.queryByRole('link', { name: /reset password/i })).toBeNull();
  });

  it('redirects /login to /setup for first-run setup when setup_required is true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ password_login: true, browser_token_login: true, setup_required: true })));
    const { router } = showLogin(false, '/login');
    expect(await screen.findByRole('heading', { name: 'Set up administrator account' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/setup');
    expect(screen.getByLabelText('Setup token (NIU_ADMIN_TOKENS)')).toBeTruthy();
    expect(screen.getByLabelText('Administrator email')).toBeTruthy();
  });

  it('completes first-run administrator setup on /setup via Authorization Bearer and navigates to /admin', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/v1/auth/config') {
        return Response.json({ password_login: true, browser_token_login: true, setup_required: true });
      }
      if (path === '/api/v1/setup' && init?.method === 'POST') {
        return Response.json({ data: { session: { id: 'sess-1', operator_id: 'op-1' } } }, { status: 201 });
      }
      return Response.json({});
    });
    vi.stubGlobal('fetch', fetcher);
    const { context, router } = showLogin(false, '/setup');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Setup token (NIU_ADMIN_TOKENS)'), '  bootstrap-secret-123  ');
    await user.type(screen.getByLabelText('Display name'), 'Platform Owner');
    await user.type(screen.getByLabelText('Administrator email'), 'owner@example.test');
    await user.type(screen.getByLabelText('Password'), 'strong initial admin passphrase');
    await user.type(screen.getByLabelText('Confirm password'), 'strong initial admin passphrase');
    await user.click(screen.getByRole('button', { name: 'Create administrator account' }));

    await waitFor(() => expect(context.connectWithToken).toHaveBeenCalledWith('niu-browser-member-session'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
    const setupCall = fetcher.mock.calls.find(([url]) => String(url) === '/api/v1/setup');
    expect(setupCall).toBeTruthy();
    expect(new Headers(setupCall?.[1]?.headers).get('authorization')).toBe('Bearer bootstrap-secret-123');
    expect(JSON.parse(String(setupCall?.[1]?.body))).toEqual({
      name: 'Platform Owner',
      email: 'owner@example.test',
      password: 'strong initial admin passphrase',
    });
  });

  it('redirects /setup back to /login once initialization is complete', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ password_login: true, browser_token_login: true, setup_required: false })));
    const { router } = showLogin(false, '/setup');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/login');
  });

  it.each([
    { display_name: 'Example Cloud', logo_data_url: null },
    { display_name: 'Niu', logo_data_url: 'data:image/png;base64,iVBORw0KGgo=' },
  ])('preserves deployment branding on the sign-in header: $display_name', async override => {
    vi.stubGlobal('fetch', vi.fn(async input => String(input) === '/api/v1/public/branding'
      ? Response.json({ data: { revision: '7', settings: { ...defaultBranding, ...override } } })
      : Response.json({ password_login: true, setup_required: false })));
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

  it('keeps setup fallback explicitly accessible while account sign-in is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const router = createMemoryRouter([{ element: <AppLayout />, children: [
      { path: '/setup', element: <SetupRoute /> },
      { path: '/login', element: <LoginRoute /> },
    ] }], { initialEntries: ['/setup'] });
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: 'Installation administration' })).toBeTruthy();
    expect(screen.getByLabelText('Administrator token')).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(router.state.location.pathname).toBe('/setup');
  });
  it('offers the setup administrator path when account sign-in is not configured', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ password_login: false, browser_token_login: false, setup_required: false })));
    showLogin();
    await screen.findByText('Account sign-in is not configured. Contact your installation administrator.');
    expect(screen.getByRole('link', { name: 'Open installation administration' }).getAttribute('href')).toBe('/setup');
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByLabelText('User access token')).toBeNull();
  });
  it.each(['offline', 'disabled', 'missing', 'malformed'])('keeps account fields when configuration is %s', async failure => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failure === 'offline') throw new Error('offline');
      if (failure === 'missing') return new Response('', { status: 404 });
      if (failure === 'malformed') return new Response('invalid JSON');
      return Response.json({ enabled: false });
    }));
    const { context } = showLogin();
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
      .mockResolvedValueOnce(Response.json({ password_login: true, setup_required: false }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    const { context } = showLogin();
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

  it('trims whitespace on /setup administrator token and shows a clear 401 error when password sign-in is disabled', async () => {
    const seenAuth: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/healthz') return Response.json({ status: 'ok' });
      if (path === '/api/v1/auth/config') return Response.json({ password_login: false, setup_required: false });
      if (path === '/api/v1/session') {
        const auth = new Headers(init?.headers).get('authorization') ?? '';
        seenAuth.push(auth);
        return Response.json({ error: { message: 'Unauthorized' } }, { status: 401 });
      }
      return Response.json({ data: [] });
    }));
    const router = createMemoryRouter([{ element: <AppLayout />, children: [
      { path: '/setup', element: <SetupRoute /> },
      { path: '/login', element: <LoginRoute /> },
    ] }], { initialEntries: ['/setup'] });
    render(<RouterProvider router={router} />);
    const user = userEvent.setup();
    const input = await screen.findByLabelText('Administrator token');
    await user.type(input, '  my-env-admin-token  ');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('That administrator token is invalid. Verify NIU_ADMIN_TOKENS and try again.');
    expect(seenAuth).toContain('Bearer my-env-admin-token');
  });
});
