import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconArrowLeft,
  IconBook,
  IconChartLine,
  IconCreditCard,
  IconExternalLink,
  IconHistory,
  IconLayoutSidebarLeftCollapse as PanelLeftClose,
  IconLayoutSidebarLeftExpand as PanelLeftOpen,
  IconPalette,
  IconPlugConnected,
  IconRoute,
  IconShieldLock,
  IconSparkles,
  IconUsers,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import AgentConnection from './AgentConnection';
import { createContext, useContext, useEffect, type RefObject } from 'react';
import { useLocation } from 'react-router';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { navigation } from './navigation';
import { useSidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import AccountMenu from './AccountMenu';
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
  if (!value) return null;
  const { context, workspacePath, generationsHref } = value;
  const adminScope = (pathname === '/admin' || pathname.startsWith('/admin/')) && canManagePlatform(context.session);
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
  const toggleButton = (
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
    const adminEntries = [
      { to: '/admin/providers', label: t('Providers', '模型供应商'), icon: IconPlugConnected },
      { to: '/admin/routing', label: t('Routing', '模型路由'), icon: IconRoute },
      { to: '/admin/customers', label: t('Customers', '客户管理'), icon: IconUsers },
      { to: '/admin/reports', label: t('Financial reports', '财务报表'), icon: IconChartLine },
      { to: '/admin/pricing', label: t('Pricing', '定价配置'), icon: IconCreditCard },
      { to: '/admin/payments', label: t('Payment gateways', '支付网关'), icon: IconCreditCard },
      { to: '/admin/branding', label: t('Branding', '品牌定制'), icon: IconPalette },
      { to: '/admin/audit', label: t('Audit logs', '审计日志'), icon: IconHistory },
      { to: '/admin/incidents', label: t('Incidents', '事故'), icon: IconAlertTriangle },
      { to: '/admin/settings', label: t('Settings', '实例设置'), icon: IconAdjustmentsHorizontal },
    ].filter(item => context.session?.operating_mode !== 'internal' || !['/admin/customers', '/admin/reports', '/admin/pricing', '/admin/payments'].includes(item.to));
    return <>
      <SidebarHeader className="sidebar-header-row flex-row items-center justify-between gap-1 px-3 pt-3 pb-2 group-data-[collapsible=icon]:justify-center">
        <div className="sidebar-header-brand flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden" title={t('Platform admin', '管理后台')}>
          <IconShieldLock className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm">{t('Platform admin', '管理后台')}</span>
        </div>
        {toggleButton}
      </SidebarHeader>
      <SidebarContent className="px-3">
        <nav aria-label={t('Admin navigation', '管理后台导航')}><SidebarMenu>{adminEntries.map(item => {
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`) || (item.to === '/admin/providers' && pathname.startsWith('/admin/suppliers'));
          return <SidebarMenuItem key={item.to}>
            <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
              <ProductRailLink to={item.to} aria-label={item.label}><item.icon aria-hidden="true" /><span>{item.label}</span></ProductRailLink>
            </SidebarMenuButton>
          </SidebarMenuItem>;
        })}</SidebarMenu></nav>
      </SidebarContent>
    </>;
  }

  const workspaceAreas = Boolean(context.session?.operator || context.session?.kind === 'installation');
  const workspaceAssetsActive = /^\/workspaces\/[^/]+\/(assets|library|video)(\/|$)/.test(pathname);
  const workspaceModelsChildActive = /^\/workspaces\/[^/]+\/(models|routing|evaluations)(\/|$)/.test(pathname);
  const workspaceSettingsChildActive = /^\/workspaces\/[^/]+\/(settings|guardrails|billing)(\/|$)/.test(pathname);
  const entries = workspaceAreas ? [
    ...navigation.filter(item => item.destination === 'Workspace' && !item.hidden).map(item => {
      const to = item.to === '.' ? workspacePath : `${workspacePath}/${item.to}`;
      const active = item.to === '.'
        ? pathname === to || pathname === `${to}/`
        : item.to === 'models'
          ? workspaceModelsChildActive || pathname.startsWith('/models')
          : item.to === 'settings'
            ? workspaceSettingsChildActive || pathname === to || pathname.startsWith(`${to}/`)
            : pathname === to || pathname.startsWith(`${to}/`);
      return { to, label: isZh ? item.labelZh : item.label, icon: item.icon, active };
    }),
  ] : [];
  if (workspaceAreas) {
    entries.splice(1, 0,
      { to: generationsHref, label: t('Generations', '生成对话'), icon: IconSparkles, active: pathname.startsWith('/generations') || workspaceAssetsActive },
    );
  }
  return <>
    <SidebarHeader className="sidebar-header-row flex-row items-center justify-between gap-1 px-3 pt-3 pb-2 group-data-[collapsible=icon]:justify-center">
      <div className="sidebar-header-brand min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
        {!workspaceAreas && <a href={import.meta.env.BASE_URL} className="flex h-10 items-center gap-2 px-2 font-semibold"><img className="size-6 shrink-0" src={logo} alt="" /><span className="truncate">{settings.display_name}</span></a>}
        {workspaceAreas && <WorkspaceSwitcher logo={logo} context={context} onCreateWorkspace={value.onCreateWorkspace ?? (() => {})} creationAvailable={Boolean(value.onCreateWorkspace)} />}
      </div>
      {toggleButton}
    </SidebarHeader>
    <SidebarContent className="px-3">
      <nav aria-label={t('Main navigation', '主导航')}><SidebarMenu>{entries.map(item => <SidebarMenuItem key={item.to}>
        <SidebarMenuButton asChild isActive={item.active} tooltip={item.label}><ProductRailLink to={item.to} aria-label={item.label}><item.icon aria-hidden="true" /><span>{item.label}</span></ProductRailLink></SidebarMenuButton>
      </SidebarMenuItem>)}</SidebarMenu></nav>
    </SidebarContent>
  </>;
}

export function ShellAccount() {
  const value = useContext(ShellNavigationContext);
  const { pathname } = useLocation();
  const { t } = useLocale();
  if (!value) return null;
  const adminScope = (pathname === '/admin' || pathname.startsWith('/admin/')) && canManagePlatform(value.context.session);
  const workspaceAreas = Boolean(value.context.session?.operator || value.context.session?.kind === 'installation');
  const docsLabel = t('Docs', '文档');
  const docsLinkLabel = t('Docs (opens in a new tab)', '文档（在新标签页打开）');
  const returnWorkspaceName = value.context.workspace ? workspaceDisplayName(value.context.workspace.name) : '';
  const footerLinks = adminScope
    ? workspaceAreas ? [{ to: value.workspacePath, label: t('Back to workspace', '返回工作空间'), tooltip: returnWorkspaceName ? `${t('Back to workspace', '返回工作空间')} · ${returnWorkspaceName}` : t('Back to workspace', '返回工作空间'), subtitle: returnWorkspaceName, icon: IconArrowLeft, active: false }] : []
    : canManagePlatform(value.context.session) ? [{ to: '/admin/providers', label: t('Admin', '管理后台'), tooltip: t('Admin', '管理后台'), subtitle: '', icon: IconShieldLock, active: pathname.startsWith('/admin') }] : [];
  return <SidebarFooter className="gap-2 p-3">
    <SidebarMenu>
      {workspaceAreas && !adminScope && <SidebarMenuItem><AgentConnection context={value.context} sidebar /></SidebarMenuItem>}
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={docsLinkLabel}>
          <a href={`${import.meta.env.BASE_URL}docs/`} target="_blank" rel="noopener" aria-label={docsLinkLabel}>
            <IconBook aria-hidden="true" />
            <span className="group-data-[collapsible=icon]:hidden">{docsLabel}</span>
            <IconExternalLink className="ml-auto text-muted-foreground group-data-[collapsible=icon]:hidden" aria-hidden="true" />
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {footerLinks.map(item => <SidebarMenuItem key={item.to}><SidebarMenuButton asChild tooltip={item.tooltip} isActive={item.active}><ProductRailLink to={item.to} aria-label={item.label}><item.icon aria-hidden="true" /><span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>{item.subtitle && <span className="ml-auto max-w-24 truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{item.subtitle}</span>}</ProductRailLink></SidebarMenuButton></SidebarMenuItem>)}
    </SidebarMenu>
    <div className="flex items-center border-t border-sidebar-border pt-2 group-data-[collapsible=icon]:justify-center">
      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none"><AccountMenu context={value.context} workspacePath={value.workspacePath} supplierArea={pathname.startsWith('/admin/providers')} mobile showDestinations={false} /></div>
    </div>
  </SidebarFooter>;
}

/** Persist outside the mobile sheet so opening it does not trigger dismissal. */
export function SidebarRouteDismiss() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  useEffect(() => { setOpenMobile(false); }, [pathname, setOpenMobile]);
  return null;
}
