import { Link, useLocation } from 'react-router';
import { IconUserCircle, IconSun, IconBuildings, IconUsers, IconCreditCard, IconBook } from '@tabler/icons-react';
import { SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import type { DashboardContext } from '@/shell/dashboard-context';
import { useLocale, useLocale as useUILocale } from '@/shell/ui-locale';
import { settingsHref } from './settings-routes';

export function settingsNavigationEntries(context: DashboardContext, t: ReturnType<typeof useLocale>['t']) {
  const personal = context.session?.kind === 'operator';
  const canViewBilling = context.session?.operating_mode !== 'internal' && (context.session?.kind === 'installation' || (context.session?.operator?.project_id === null && ['owner', 'admin'].includes(context.session.operator.role)));
  const canManageMembers = Boolean(context.organization && context.session?.permissions?.manage_operators);
  return [
    ...(personal ? [{path:'account',label:t('Account', '账户'),icon:IconUserCircle}] : []),
    {path:'appearance',label:t('Appearance', '外观与语言'),icon:IconSun},
    ...(context.organization ? [{path:'organization',label:t('Organization', '组织'),icon:IconBuildings}] : []),
    ...(canManageMembers ? [{path:'members',label:t('Members', '成员管理'),icon:IconUsers}] : []),
    ...(canViewBilling ? [{path:'billing',label:t('Credits', '额度与充值'),icon:IconCreditCard}] : []),
    {path:'about',label:t('About Niu', '关于牛元'),icon:IconBook},
  ];
}

export function SettingsNavigation({ context, section }: { context: DashboardContext; section?: string }) {
  const { t: uiT } = useUILocale();
  const { t } = useLocale();
  const location = useLocation();
  const entries = settingsNavigationEntries(context, t);
  return <>
    <SidebarHeader className="sidebar-heading"><h2 className="sidebar-heading-row">{t('Settings', '设置')}</h2></SidebarHeader>
    <SidebarContent className="px-3 pb-3"><nav aria-label={uiT("Settings navigation")}><SidebarMenu>
      {entries.map(item => {
        const selectedSection = section ?? location.pathname.split('/')[2];
        const normalizedSection = selectedSection === 'payments' ? 'billing' : selectedSection;
        const selected = normalizedSection === item.path;
        return <SidebarMenuItem key={item.path}><SidebarMenuButton asChild tooltip={item.label} isActive={selected}><Link replace aria-current={selected ? 'page' : undefined} state={location.state} to={settingsHref(item.path)}><item.icon aria-hidden="true"/><span>{item.label}</span></Link></SidebarMenuButton></SidebarMenuItem>;
      })}
    </SidebarMenu></nav></SidebarContent>
  </>;
}
