import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconArrowLeft,
  IconBook,
  IconChartLine,
  IconCpu as Cpu,
  IconCreditCard,
  IconDeviceDesktop,
  IconHistory,
  IconMoon,
  IconPalette,
  IconPlugConnected,
  IconRoute,
  IconShieldLock,
  IconSparkles,
  IconSun,
  IconUsers,
} from '@tabler/icons-react';
import { readTheme, saveTheme, subscribeTheme, type Theme } from './theme';
import AgentConnection from './AgentConnection';
import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { navigation } from './navigation';
import { useSidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import AccountMenu from './AccountMenu';
import ProductRailLink from './ProductRailLink';
import { canManagePlatform, type DashboardContext } from './dashboard-context';
import { useBranding } from './branding';
import { useLocale } from './ui-locale';

export const ShellNavigationContext = createContext<{ context: DashboardContext; workspacePath: string; modelsHref: string; generationsHref: string; onCreateWorkspace?: () => void } | null>(null);

/** Stable product destinations across every route. */
export function ShellNavigation() {
  const value = useContext(ShellNavigationContext);
  const { t, isZh } = useLocale();
  const { settings, logo } = useBranding();
  const { pathname } = useLocation();
  if (!value) return null;
  const { context, workspacePath, modelsHref, generationsHref } = value;
  const adminScope = (pathname === '/admin' || pathname.startsWith('/admin/')) && canManagePlatform(context.session);
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
    ].filter(item => context.session?.operating_mode !== 'internal' || !['/admin/reports', '/admin/pricing', '/admin/payments'].includes(item.to));
    return <>
      <SidebarHeader className="px-3 pt-3 pb-2">
        <div className="flex h-10 items-center gap-2.5 rounded-lg px-2.5 font-semibold text-sidebar-foreground group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" title={t('Platform admin', '管理后台')}>
          <IconShieldLock className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm group-data-[collapsible=icon]:hidden">{t('Platform admin', '管理后台')}</span>
        </div>
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
  const workspaceModelsChildActive = /^\/workspaces\/[^/]+\/(routing|evaluations)(\/|$)/.test(pathname);
  const workspaceSettingsChildActive = /^\/workspaces\/[^/]+\/(settings|guardrails|billing)(\/|$)/.test(pathname);
  const entries = workspaceAreas ? [
    ...navigation.filter(item => item.destination === 'Workspace' && !item.hidden).map(item => {
      const to = item.to === '.' ? workspacePath : `${workspacePath}/${item.to}`;
      const active = item.to === '.'
        ? pathname === to || pathname === `${to}/`
        : item.to === 'settings'
          ? workspaceSettingsChildActive || pathname === to || pathname.startsWith(`${to}/`)
          : pathname === to || pathname.startsWith(`${to}/`);
      return { to, label: isZh ? item.labelZh : item.label, icon: item.icon, active };
    }),
  ] : [];
  entries.splice(1, 0,
    { to: generationsHref, label: t('Generations', '生成对话'), icon: IconSparkles, active: pathname.startsWith('/generations') || workspaceAssetsActive },
    { to: modelsHref, label: t('Models', '模型'), icon: Cpu, active: pathname.startsWith('/models') || workspaceModelsChildActive },
  );
  return <>
    <SidebarHeader className="px-3 pt-3 pb-2">
      {!workspaceAreas && <a href={import.meta.env.BASE_URL} className="flex h-10 items-center gap-2 px-2 font-semibold group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"><img className="size-6 shrink-0" src={logo} alt="" /><span className="group-data-[collapsible=icon]:hidden">{settings.display_name}</span></a>}
      {workspaceAreas && <WorkspaceSwitcher logo={logo} context={context} onCreateWorkspace={value.onCreateWorkspace ?? (() => {})} creationAvailable={Boolean(value.onCreateWorkspace)} />}
    </SidebarHeader>
    <SidebarContent className="px-3">
      {workspaceAreas && <SidebarMenu><SidebarMenuItem><AgentConnection context={context} sidebar /></SidebarMenuItem></SidebarMenu>}
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
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => subscribeTheme(() => setTheme(readTheme())), []);
  const ThemeIcon = theme === 'dark' ? IconMoon : theme === 'light' ? IconSun : IconDeviceDesktop;
  if (!value) return null;
  const adminScope = (pathname === '/admin' || pathname.startsWith('/admin/')) && canManagePlatform(value.context.session);
  const workspaceAreas = Boolean(value.context.session?.operator || value.context.session?.kind === 'installation');
  const footerLinks = adminScope
    ? [
        { to: '/help/', label: t('Docs', '文档'), icon: IconBook, active: pathname.startsWith('/help') },
        ...(workspaceAreas ? [{ to: value.workspacePath, label: t('Back to workspace', '返回工作空间'), icon: IconArrowLeft, active: false }] : []),
      ]
    : [
        { to: '/help/', label: t('Docs', '文档'), icon: IconBook, active: pathname.startsWith('/help') },
        ...(canManagePlatform(value.context.session) ? [{ to: '/admin/providers', label: t('Admin', '管理后台'), icon: IconShieldLock, active: pathname.startsWith('/admin') }] : []),
      ];
  return <SidebarFooter className="gap-2 p-3">
    <SidebarMenu>{footerLinks.map(item => <SidebarMenuItem key={item.to}><SidebarMenuButton asChild tooltip={item.label} isActive={item.active}><ProductRailLink to={item.to} aria-label={item.label}><item.icon aria-hidden="true" /><span>{item.label}</span></ProductRailLink></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>
    <div className="flex items-center gap-1 border-t border-sidebar-border pt-2 group-data-[collapsible=icon]:flex-col-reverse group-data-[collapsible=icon]:items-center">
      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none"><AccountMenu context={value.context} workspacePath={value.workspacePath} supplierArea={pathname.startsWith('/admin/providers')} mobile showDestinations={false} /></div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-9 shrink-0" aria-label={t('Theme', '主题')} title={t('Theme', '主题')}><ThemeIcon size={18} /></Button></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end"><DropdownMenuRadioGroup value={theme} onValueChange={next => saveTheme(next as Theme)}><DropdownMenuRadioItem value="light"><IconSun />{t('Light', '浅色')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark"><IconMoon />{t('Dark', '深色')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="system"><IconDeviceDesktop />{t('System', '跟随系统')}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent>
      </DropdownMenu>
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
