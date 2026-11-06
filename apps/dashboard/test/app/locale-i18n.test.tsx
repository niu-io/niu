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
} from '@/shell/locale';
import { BrandingProvider } from '@/shell/branding';
import { translateUI } from '@/shell/ui-locale';
import { generationOutcome } from '@/features/playground/generation-outcome';
import { contentRulesError } from '@/features/guardrails/rules';
import { SidebarProvider } from '@/components/ui/sidebar';
import AccountMenu from '@/shell/AccountMenu';
import { SettingsContent } from '@/features/account/settings-shell';
import LoginRoute from '@/features/login/page';
import PublicHeader from '../../../docs/src/components/PublicHeader';
import WorkspaceKeyConnection from '../../../docs/src/components/live-api/WorkspaceKeyConnection';
import type { DashboardContext } from '@/shell/dashboard-context';

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


  it('translates dynamic helper copy after a locale switch', () => {
    saveLocale('zh-CN');
    expect(translateUI('Video')).toBe('视频');
    expect(translateUI('1 year')).toBe('1 年');
    expect(translateUI('Enter a prompt.')).toBe('请输入提示词。');
    expect(translateUI('At most 32 rules are supported per stage.')).toBe('每个阶段最多支持 32 条规则。');
    expect(translateUI(generationOutcome('length').label)).toBe('已达到输出上限');
    expect(translateUI(generationOutcome('length').detail ?? '')).toBe('回答可能不完整。请提高对话设置中的输出上限后再生成。');
    expect(translateUI(contentRulesError(Array.from({ length: 33 }, () => ({ preset: 'email_v1' as const, action: 'block' as const }))))).toBe('每个阶段最多支持 32 条规则。');
    saveLocale('en');
    expect(translateUI('Video')).toBe('Video');
    expect(translateUI(generationOutcome('length').label)).toBe('Output limit reached');
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

  it('persists locale changes, updates documentElement.lang, and localizes PublicHeader with Niu brand', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 401 }));

    render(<PublicHeader path="/docs/quickstart/" />);
    expect(screen.getByRole('link', { name: 'Niu home' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Docs' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'AgentDoc' })).toBeTruthy();

    expect(screen.getByRole('button', { name: 'Language' }).textContent).toContain('EN');
    await user.click(screen.getByRole('button', { name: 'Language' }));
    await user.click(screen.getByRole('menuitemradio', { name: '简体中文' }));

    expect(window.localStorage.getItem('niu-dashboard-locale')).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.documentElement.dataset.locale).toBe('zh-CN');
    expect(screen.getByRole('button', { name: '界面语言' }).textContent).toContain('中文');
    expect(screen.getByRole('link', { name: 'Niu 首页' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '文档' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'AgentDoc' })).toBeTruthy();
  });

  it('switches language from Settings -> Appearance and AccountMenu using shadcn DropdownMenu', async () => {
    const user = userEvent.setup();
    const context = stubDashboardContext();

    render(
      <MemoryRouter initialEntries={['/settings/appearance']}>
        <SidebarProvider>
          <AccountMenu context={context} workspacePath="/workspaces/production" />
          <SettingsContent context={context} section="appearance" />
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

    await user.click(screen.getByRole('button', { name: '界面语言' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }));

    expect(readLocale()).toBe('en');
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  });
});
