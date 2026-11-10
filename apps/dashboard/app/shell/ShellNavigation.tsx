import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { IconSun, IconMoon, IconDeviceDesktop } from '@tabler/icons-react';
import { readTheme, saveTheme, subscribeTheme, type Theme } from './theme';
import AgentConnection from './AgentConnection';
import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { IconCpu as Cpu } from '@tabler/icons-react';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { navigation } from './navigation';
import { IconBook, IconChartLine, IconShieldLock, IconSparkles } from '@tabler/icons-react';
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
  const workspaceAreas = Boolean(context.session?.operator || context.session?.kind === 'installation');
  const entries = workspaceAreas ? [
    ...navigation.filter(item => item.destination === 'Workspace' && !item.hidden).map(item => {
      const to = item.to === '.' ? workspacePath : `${workspacePath}/${item.to}`;
      return {to, label:isZh ? item.labelZh : item.label, icon:item.icon, active:item.to === '.' ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)};
    }),
  ] : [];
  entries.splice(1, 0,
    {to:generationsHref,label:t('Generations','生成对话'),icon:IconSparkles,active:pathname.startsWith('/generations')},
    {to:modelsHref,label:t('Models','模型'),icon:Cpu,active:pathname.startsWith('/models')},
  );
  return <>
    <SidebarHeader className="px-3 pt-3 pb-2">
      {!workspaceAreas && <a href={import.meta.env.BASE_URL} className="flex h-9 items-center gap-2 px-2 font-semibold group-data-[collapsible=icon]:px-0"><img className="size-7 shrink-0" src={logo} alt="" /><span className="group-data-[collapsible=icon]:hidden">{settings.display_name}</span></a>}
      {workspaceAreas && <WorkspaceSwitcher logo={logo} context={context} onCreateWorkspace={value.onCreateWorkspace ?? (() => {})} creationAvailable={Boolean(value.onCreateWorkspace)} />}
    </SidebarHeader>
    <SidebarContent className="px-3">
      {workspaceAreas && <AgentConnection context={context} sidebar />}
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
  return <SidebarFooter className="gap-1 p-3"><SidebarMenu>{[
    {to:'/activity',label:t('Activity','活动'),icon:IconChartLine},
    {to:'/help/',label:t('Docs','文档'),icon:IconBook},
    ...(canManagePlatform(value.context.session) ? [{to:'/admin/providers',label:t('Admin','管理后台'),icon:IconShieldLock}] : []),
  ].map(item => <SidebarMenuItem key={item.to}><SidebarMenuButton asChild tooltip={item.label} isActive={pathname.startsWith(item.to.split('/').slice(0,2).join('/'))}><ProductRailLink to={item.to} aria-label={item.label}><item.icon /><span>{item.label}</span></ProductRailLink></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu><div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col-reverse"><div className="min-w-0 flex-1"><AccountMenu context={value.context} workspacePath={value.workspacePath} supplierArea={pathname.startsWith('/admin/providers')} mobile showDestinations={false} /></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Theme', '主题')}><ThemeIcon size={18} /></Button></DropdownMenuTrigger><DropdownMenuContent side="top" align="end"><DropdownMenuRadioGroup value={theme} onValueChange={value => saveTheme(value as Theme)}><DropdownMenuRadioItem value="light"><IconSun />{t('Light','浅色')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark"><IconMoon />{t('Dark','深色')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="system"><IconDeviceDesktop />{t('System','跟随系统')}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div></SidebarFooter>;
}

/** Persist outside the mobile sheet so opening it does not trigger dismissal. */
export function SidebarRouteDismiss() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  useEffect(() => { setOpenMobile(false); }, [pathname, setOpenMobile]);
  return null;
}
