import AgentConnection from './AgentConnection';
import { createContext, useContext, useEffect } from 'react';
import { useLocation } from 'react-router';
import { Cpu, FolderKey } from 'lucide-react';
import { IconBook, IconChartLine, IconShieldLock, IconSparkles } from '@tabler/icons-react';
import { useSidebar, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import AccountMenu from './AccountMenu';
import ProductRailLink from './ProductRailLink';
import { canManagePlatform, type DashboardContext } from './dashboard-context';
import { useBranding } from './branding';
import { useLocale } from './ui-locale';

export const ShellNavigationContext = createContext<{ context: DashboardContext; workspacePath: string; modelsHref: string; generationsHref: string } | null>(null);

/** Product destinations share the same sidebar as route-specific navigation. */
export function ShellNavigation() {
  const value = useContext(ShellNavigationContext);
  const { t } = useLocale();
  const { settings, logo } = useBranding();
  const { pathname } = useLocation();
  if (!value) return null;
  const { context, workspacePath, modelsHref, generationsHref } = value;
  const workspaceAreas = Boolean(context.session?.operator || context.session?.kind === 'installation');
  const entries = [
    ...(workspaceAreas ? [
      { to: workspacePath, label: t('Workspace', '工作空间'), icon: FolderKey, active: pathname.startsWith('/workspaces') },
      { to: generationsHref, label: t('Generations', '生成对话'), icon: IconSparkles, active: pathname.startsWith('/generations') },
      { to: '/activity', label: t('Activity', '活动'), icon: IconChartLine, active: pathname.startsWith('/activity') },
      { to: modelsHref, label: t('Models', '模型'), icon: Cpu, active: pathname.startsWith('/models') },
    ] : []),
    ...(canManagePlatform(context.session) ? [{ to: '/admin/providers', label: t('Admin', '管理后台'), icon: IconShieldLock, active: pathname.startsWith('/admin') || pathname === '/providers' }] : []),
    { to: '/help/', label: t('Docs', '文档'), icon: IconBook, active: pathname.startsWith('/help') },
  ];
  return <SidebarHeader className="px-3 pt-3 pb-2">
    <a href={import.meta.env.BASE_URL} className="mb-2 flex h-9 items-center gap-2 px-2 font-semibold"><img className="size-7" src={logo} alt="" />{settings.display_name}</a>
    {workspaceAreas && <AgentConnection context={context} />}
    <nav aria-label={t('Product navigation', '产品导航')}><SidebarMenu>{entries.map(item => <SidebarMenuItem key={item.to}>
      <SidebarMenuButton asChild isActive={item.active}><ProductRailLink to={item.to}><item.icon aria-hidden="true" /><span>{item.label}</span></ProductRailLink></SidebarMenuButton>
    </SidebarMenuItem>)}</SidebarMenu></nav>
  </SidebarHeader>;
}

export function ShellAccount() {
  const value = useContext(ShellNavigationContext);
  const { pathname } = useLocation();
  if (!value) return null;
  return <SidebarFooter><AccountMenu context={value.context} workspacePath={value.workspacePath} supplierArea={pathname.startsWith('/admin/providers')} mobile showDestinations={false} /></SidebarFooter>;
}

/** Persist outside the mobile sheet so opening it does not trigger dismissal. */
export function SidebarRouteDismiss() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  useEffect(() => { setOpenMobile(false); }, [pathname, setOpenMobile]);
  return null;
}
