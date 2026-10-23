import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import {
  applyLocale,
  detectBrowserLocale,
  normalizeLocale,
  readLocale,
  saveLocale,
} from '@/app/locale';
import { BrandingProvider } from '@/app/branding';
import { SidebarProvider } from '@/components/ui/sidebar';
import AccountMenu from '@/app/AccountMenu';
import { SettingsDialog } from '@/features/account/settings-page';
import LoginRoute from '@/features/login/page';
import PublicHeader from '../../../docs/src/components/PublicHeader';
import WorkspaceKeyConnection from '../../../docs/src/components/live-api/WorkspaceKeyConnection';
import type { DashboardContext } from '@/app/dashboard-context';

function stubDashboardContext(overrides: Partial<DashboardContext> = {}): DashboardContext {
  return {
    token: 'niu-browser-member-session',
    session: {
      kind: 'operator',
      operator: {
        id: 'op-1',
        project_id: 'ws-1',
        role: 'owner',
        email: 'operator@niu.io',
        name: 'Alice Operator',
      },
      permissions: {
        read: true,
        write: true,
        manage_operators: true,
        platform_admin: false,
      },
    },
    sessionError: null,
    sessionReady: true,
    gatewayOffline: false,
    authConfig: {
      password_login: true,
      browser_token_login: true,
    },
    organizations: [],
    organization: null,
    selectOrganization: vi.fn(),
    workspace: {
      id: 'ws-1',
      name: 'Production',
      organization_name: 'Niu Team',
      route_slug: 'production',
      created_at_ms: 1700000000000,
    },
    workspaces: [
      {
        id: 'ws-1',
        name: 'Production',
        organization_name: 'Niu Team',
        route_slug: 'production',
        created_at_ms: 1700000000000,
      },
    ],
    workspaceLoading: false,
    workspaceError: null,
    workspacesError: null,
    workspacesReady: true,
    selectedWorkspaceId: 'ws-1',
    setSelectedWorkspaceId: vi.fn(),
    reloadWorkspaces: vi.fn(),
    refreshWorkspaces: vi.fn().mockResolvedValue(undefined),
    refreshSession: vi.fn().mockResolvedValue(undefined),
    setToken: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  } as unknown as DashboardContext;
}

describe('i18n and Simplified Chinese (zh-CN) localization', () => {
  beforeEach(() => {
    window.localStorage.clear();
    applyLocale('en');
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
    applyLocale('en');
  });

  it('normalizes locale identifiers and detects browser language preference', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh-CN');
    expect(normalizeLocale('zh-Hans-CN')).toBe('zh-CN');
    expect(normalizeLocale('zh')).toBe('zh-CN');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('fr-FR')).toBeNull();
    expect(normalizeLocale(null)).toBeNull();

    const languageGetter = vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['zh-CN', 'en-US']);
    expect(detectBrowserLocale()).toBe('zh-CN');
    expect(readLocale()).toBe('zh-CN');
    languageGetter.mockRestore();
  });

  it('persists locale changes, updates documentElement.lang, and localizes PublicHeader with Niu 牛元 brand', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 401 }));

    render(<PublicHeader path="/docs/quickstart/" brandSrc="/brand.png" />);
    expect(screen.getByRole('link', { name: 'Niu home' }).textContent).toContain('Niu');
    expect(screen.getByRole('link', { name: 'Why Niu?' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Docs' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Color mode' }));
    await user.click(screen.getByRole('menuitemradio', { name: '简体中文' }));

    expect(window.localStorage.getItem('niu-dashboard-locale')).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.documentElement.dataset.locale).toBe('zh-CN');
    expect(screen.getByRole('link', { name: 'Niu home' }).textContent).toContain('Niu 牛元');
    expect(screen.getByRole('link', { name: '为什么选择牛元？' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '文档' })).toBeTruthy();
  });

  it('switches language from Settings -> Appearance and AccountMenu using shadcn DropdownMenu', async () => {
    const user = userEvent.setup();
    const context = stubDashboardContext();

    render(
      <MemoryRouter initialEntries={['/settings/appearance']}>
        <SidebarProvider>
          <AccountMenu context={context} workspacePath="/workspaces/production" />
          <SettingsDialog context={context} section="appearance" onClose={() => {}} />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Color mode' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Language' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Language' }));
    await user.click(screen.getByRole('menuitemradio', { name: '简体中文' }));

    expect(readLocale()).toBe('zh-CN');
    expect(screen.getByRole('heading', { name: '外观模式' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '界面语言' })).toBeTruthy();
  });

  it('renders localized WorkspaceKeyConnection and LoginRoute in zh-CN', async () => {
    const user = userEvent.setup();
    saveLocale('zh-CN');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/v1/auth/config')) {
        return new Response(JSON.stringify({ password_login: true, browser_token_login: true }), { status: 200 });
      }
      if (url.includes('/api/v1/session')) {
        return new Response(
          JSON.stringify({
            data: {
              kind: 'operator',
              operator: { id: 'op-1', project_id: 'ws-1', role: 'owner' },
              permissions: { read: true, write: true, manage_operators: true, platform_admin: false },
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/v1/workspaces?limit=100')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'ws-1', name: '默认空间', organization_name: '牛元团队', route_slug: 'default', created_at_ms: 1700000000000 }],
            next_cursor: null,
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/v1/workspaces/ws-1/keys')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'key-1', name: '生产密钥', revoked: false, expired: false }],
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    });

    const context = stubDashboardContext({ token: '' });
    render(
      <BrandingProvider>
        <MemoryRouter initialEntries={['/login']}>
          <WorkspaceKeyConnection onChange={() => {}} />
          <Routes>
            <Route element={<Outlet context={context} />}>
              <Route path="/login" element={<LoginRoute />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </BrandingProvider>,
    );

    expect(await screen.findByText('工作空间')).toBeTruthy();
    expect(await screen.findByText('API 密钥')).toBeTruthy();
    expect(await screen.findByText('已连接')).toBeTruthy();
    expect(await screen.findByLabelText('邮箱')).toBeTruthy();
    expect(await screen.findByLabelText('密码')).toBeTruthy();
    expect(await screen.findByRole('button', { name: '使用访问令牌' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Language' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }));

    expect(readLocale()).toBe('en');
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  });
});
