import {
  IconArrowLeft,
  IconBook,
  IconLayoutSidebarLeftCollapse as PanelLeftClose,
  IconLayoutSidebarLeftExpand as PanelLeftOpen,
  IconShieldLock,
  IconSparkles,
} from '@tabler/icons-react';
import type { PlatformRegistrationQueuePage } from '@niu-io/sdk';
import { Button } from '@/components/ui/button';
import AgentConnection from './AgentConnection';
import { createContext, useContext, useEffect, useState, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { navigation } from './navigation';
import { getAdminNavGroups } from './admin-navigation';
import { AdminSidebarMenu } from './AdminSidebarMenu';
import {
  useSidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { request } from '@/lib/api-client';
import AccountMenu from './AccountMenu';
import ThemeMenu from './ThemeMenu';
import ProductRailLink from './ProductRailLink';
import { canManagePlatform, type DashboardContext } from './dashboard-context';
import { useBranding } from './branding';
import { useLocale } from './ui-locale';
import { workspaceDisplayName } from './workspace-route';

export const ShellNavigationContext = createContext<{ context: DashboardContext; workspacePath: string; modelsHref: string; generationsHref: string; onCreateWorkspace?: () => void } | null>(null);

/** Stable product destinations across every route. */
export function ShellNavigation({
  toggleRef,
  adminArea = false,
  activityArea = false,
  settingsArea = false,
  supplierArea = false,
}: {
  toggleRef?: RefObject<HTMLButtonElement | null>;
  adminArea?: boolean;
  activityArea?: boolean;
  settingsArea?: boolean;
  supplierArea?: boolean;
} = {}) {
  const value = useContext(ShellNavigationContext);
  const { t, isZh } = useLocale();
  const { settings, logo } = useBranding();
  const { pathname } = useLocation();
  const { isMobile, openMobile, state, toggleSidebar } = useSidebar();
  const [pendingRegistrations, setPendingRegistrations] = useState(0);
  const context = value?.context;
  const adminScope = Boolean(context && (pathname === '/admin' || pathname.startsWith('/admin/')) && canManagePlatform(context.session));
  const isInternalAdmin = context?.session?.operating_mode === 'internal';
  const adminToken = context?.token ?? '';
  useEffect(() => {
    if (!adminScope || !adminToken || isInternalAdmin) {
      setPendingRegistrations(0);
      return;
    }
    let cancelled = false;
    const loadCount = () => {
      void request<PlatformRegistrationQueuePage>(
        adminToken,
        '/api/v1/admin/registrations?status=pending&limit=1',
        'GET',
      )
        .then(page => {
          if (!cancelled) setPendingRegistrations(page.counts.pending);
        })
        .catch(() => {
          // Leave badge absent when pending count cannot be read.
        });
    };
    loadCount();
    const onUpdated = () => loadCount();
    window.addEventListener('niu:registrations-updated', onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('niu:registrations-updated', onUpdated);
    };
  }, [adminScope, adminToken, isInternalAdmin]);
  if (!value || !context) return null;
  const { workspacePath, generationsHref } = value;
  const expanded = isMobile ? openMobile : state === 'expanded';
  const targetArea = adminArea || adminScope
    ? t('admin navigation')
    : activityArea
      ? t('activity navigation')
      : settingsArea
        ? t('settings navigation')
        : supplierArea
          ? t('provider navigation')
          : t('workspace navigation');
  const controlsId = adminArea || adminScope
    ? 'admin-navigation'
    : activityArea
      ? 'activity-navigation'
      : settingsArea
        ? 'settings-navigation'
        : supplierArea
          ? 'supplier-navigation'
          : 'workspace-navigation';
  const toggleButton = !isMobile && (
    <Button
      ref={!isMobile ? toggleRef : undefined}
      type="button"
      variant="ghost"
      size="icon"
      className="sidebar-toggle sidebar-header-toggle"
      onClick={toggleSidebar}
      aria-expanded={expanded}
      aria-controls={controlsId}
      aria-label={`${expanded ? t('Collapse') : t('Expand')} ${targetArea}`}
      title={expanded ? t('Collapse navigation', '收起导航') : t('Expand navigation', '展开导航')}
    >
      {expanded ? (
        <PanelLeftClose aria-hidden="true" />
      ) : (
        <>
          <img src={logo} alt="" className="sidebar-toggle-logo size-5 shrink-0" />
          <PanelLeftOpen aria-hidden="true" className="sidebar-toggle-expand-icon" />
        </>
      )}
    </Button>
  );
  if (adminScope) {
    const adminGroups = getAdminNavGroups(context.session?.operating_mode);
    return <>
      <SidebarHeader className="sidebar-header-row flex-row items-center justify-between gap-1 px-3 py-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <div className="sidebar-header-brand flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden" title={t('Platform admin', '管理后台')}>
          <IconShieldLock className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm">{t('Platform admin', '管理后台')}</span>
        </div>
        {toggleButton}
      </SidebarHeader>
      <SidebarContent className="px-2 pb-2 group-data-[collapsible=icon]:px-0">
        <nav aria-label={t('Admin navigation', '管理后台导航')}>
          <AdminSidebarMenu
            groups={adminGroups}
            pathname={pathname}
            pendingRegistrations={pendingRegistrations}
          />
        </nav>
      </SidebarContent>
    </>;
  }

  const workspaceAreas = Boolean(context.session?.operator || context.session?.kind === 'installation');
  const workspaceAssetsActive = /^\/workspaces\/[^/]+\/(assets|library|video)(\/|$)/.test(pathname);
  const workspaceModelsChildActive = /^\/workspaces\/[^/]+\/(models|routing|evaluations)(\/|$)/.test(pathname);
  const workspaceUsageChildActive = /^\/workspaces\/[^/]+\/(usage|billing)(\/|$)/.test(pathname);
  const workspaceSettingsChildActive = /^\/workspaces\/[^/]+\/(settings|guardrails|events)(\/|$)/.test(pathname);
  const entries = workspaceAreas ? [
    ...navigation.filter(item => item.destination === 'Workspace' && !item.hidden).map(item => {
      const to = item.to === '.' ? workspacePath : `${workspacePath}/${item.to}`;
      const active = item.to === '.'
        ? pathname === to || pathname === `${to}/`
        : item.to === 'models'
          ? workspaceModelsChildActive || pathname.startsWith('/models')
          : item.to === 'usage'
            ? workspaceUsageChildActive
            : item.to === 'settings'
              ? workspaceSettingsChildActive || pathname === to || pathname.startsWith(`${to}/`)
              : pathname === to || pathname.startsWith(`${to}/`);
      return { to, end: item.to === '.', label: isZh ? item.labelZh : item.label, icon: item.icon, active };
    }),
  ] : [];
  if (workspaceAreas) {
    entries.splice(1, 0,
      { to: generationsHref, end: false, label: t('Generations', '多模态生成'), icon: IconSparkles, active: pathname.startsWith('/generations') || workspaceAssetsActive },
    );
  }
  return <>
    <SidebarHeader className="sidebar-header-row flex-row items-center justify-between gap-1 px-3 py-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
      <div className="sidebar-header-brand min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
        {!workspaceAreas && <a href={import.meta.env.BASE_URL} className="flex h-9 items-center gap-2 px-2 font-semibold"><img className="size-5 shrink-0" src={logo} alt="" /><span className="truncate">{settings.display_name}</span></a>}
        {workspaceAreas && <WorkspaceSwitcher logo={logo} context={context} onCreateWorkspace={value.onCreateWorkspace ?? (() => {})} creationAvailable={Boolean(value.onCreateWorkspace)} />}
      </div>
      {toggleButton}
    </SidebarHeader>
    <SidebarContent className="px-3 group-data-[collapsible=icon]:px-0">
      <nav aria-label={t('Main navigation', '主导航')}><SidebarMenu>{entries.map(item => <SidebarMenuItem key={item.to}>
        <SidebarMenuButton asChild isActive={item.active} tooltip={item.label}><ProductRailLink to={item.to} end={item.end} aria-label={item.label}><item.icon aria-hidden="true" /><span>{item.label}</span></ProductRailLink></SidebarMenuButton>
      </SidebarMenuItem>)}</SidebarMenu></nav>
    </SidebarContent>
  </>;
}

export function ShellAccount() {
  const value = useContext(ShellNavigationContext);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useLocale();
  if (!value) return null;
  const session = value.context.session;
  const hasActiveAdmin = canManagePlatform(session);
  const canActivateAdmin = Boolean(session?.admin_mode?.available);
  const adminScope = (pathname === '/admin' || pathname.startsWith('/admin/')) && hasActiveAdmin;
  const workspaceAreas = Boolean(session?.operator || session?.kind === 'installation');
  const docsLabel = t('Docs', '文档');
  const docsLinkLabel = t('Docs (opens in a new tab)', '文档（在新标签页打开）');
  const returnWorkspaceName = value.context.workspace ? workspaceDisplayName(value.context.workspace.name) : '';
  const roleSwitch = value.context.roleSwitch;
  const footerLinks = adminScope
    ? workspaceAreas ? [{ to: value.workspacePath, label: t('Back to workspace', '返回工作空间'), tooltip: returnWorkspaceName ? `${t('Back to workspace', '返回工作空间')} · ${returnWorkspaceName}` : t('Back to workspace', '返回工作空间'), subtitle: returnWorkspaceName, icon: IconArrowLeft, active: false, activateAdmin: false }] : []
    : (hasActiveAdmin || canActivateAdmin)
      ? [{ to: '/admin', label: t('Admin', '管理后台'), tooltip: t('Admin', '管理后台'), subtitle: '', icon: IconShieldLock, active: pathname === '/admin' || pathname.startsWith('/admin/'), activateAdmin: !hasActiveAdmin && canActivateAdmin }]
      : [];
  return <SidebarFooter className="gap-2 p-3 group-data-[collapsible=icon]:px-0">
    <SidebarMenu>
      {workspaceAreas && !adminScope && <SidebarMenuItem><AgentConnection sidebar /></SidebarMenuItem>}
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={docsLinkLabel}>
          <a href={`${import.meta.env.BASE_URL}docs/`} target="_blank" rel="noopener" aria-label={docsLinkLabel}>
            <IconBook aria-hidden="true" />
            <span className="group-data-[collapsible=icon]:hidden">{docsLabel}</span>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {footerLinks.map(item => (
        <SidebarMenuItem key={item.to}>
          {item.activateAdmin ? (
            <SidebarMenuButton
              type="button"
              tooltip={item.tooltip}
              isActive={item.active}
              disabled={roleSwitch?.saving}
              aria-label={item.label}
              onClick={() => {
                if (!roleSwitch) return;
                void roleSwitch.setRole('admin').then(switched => {
                  if (switched) navigate('/admin');
                });
              }}
            >
              <item.icon aria-hidden="true" />
              <span className="truncate group-data-[collapsible=icon]:hidden">{roleSwitch?.saving ? t('Opening Admin…', '正在进入管理后台…') : item.label}</span>
            </SidebarMenuButton>
          ) : (
            <SidebarMenuButton asChild tooltip={item.tooltip} isActive={item.active}>
              <ProductRailLink to={item.to} aria-label={item.label}>
                <item.icon aria-hidden="true" />
                <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                {item.subtitle && <span className="ml-auto max-w-24 truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{item.subtitle}</span>}
              </ProductRailLink>
            </SidebarMenuButton>
          )}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
    <div className="flex items-center gap-1 pt-1 group-data-[collapsible=icon]:justify-center">
      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none"><AccountMenu context={value.context} workspacePath={value.workspacePath} supplierArea={pathname.startsWith('/admin/providers')} mobile sidebar showDestinations={false} /></div>
      <ThemeMenu context={value.context} />
    </div>
  </SidebarFooter>;
}

/** Persist outside the mobile sheet so opening it does not trigger dismissal. */
export function SidebarRouteDismiss() {
  const { pathname, search, hash } = useLocation();
  const { setOpenMobile } = useSidebar();
  useEffect(() => { setOpenMobile(false); }, [pathname, search, hash, setOpenMobile]);
  return null;
}
