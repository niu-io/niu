import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { IconLogout as LogOut } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconBuildings as Building2, IconFolder } from "@tabler/icons-react";
import { IconSparkles } from "@tabler/icons-react";
import { IconCpu as Boxes } from "@tabler/icons-react";
import { IconBook as CircleHelp } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { settingsHref } from '@/features/account/settings-routes';
import { prefetchRouteIntent } from './prefetch';
import { workspaceModelsHref } from './workspace-route';
import { IconChartLine, IconExternalLink, IconSettings, IconShieldLock, IconUser } from '@tabler/icons-react';
import { useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useLocale } from './ui-locale';
import type { DashboardContext } from './dashboard-context';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function AccountMenu({ context, workspacePath, supplierArea = false, mobile = false, showDestinations = true }: { context: DashboardContext; workspacePath: string; supplierArea?: boolean; mobile?: boolean; showDestinations?: boolean }) {
  const { t: uiT } = useUILocale();
  const {isMobile: compactNavigation, setOpenMobile} = useSidebar();
  const { t } = useLocale();
  const location = useLocation();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const profile = context.session?.profile ?? null;
  const { session, token, signOut, organizations, organization, selectOrganization, organizationSwitching, organizationSwitchError, workspaceLoading, workspaceError } = context;
  const modelsHref = workspaceModelsHref(token ? context.workspace : null, context.workspaces);
  const installation = session?.kind === 'installation';
  const platformAdmin = Boolean(session?.permissions?.platform_admin || (installation && session?.permissions?.manage_operators !== false));
  const supplierOnly = supplierArea && !installation && !session?.operator;
  const label = profile?.name || (installation ? t('Administrator access', '管理员访问') : t('Account', '账户'));
  const avatarInitial = (session ? label[0] : 'N').toUpperCase();
  const roles = context.roleSwitch;

  const dismissMobileSidebar = () => {
    if (compactNavigation) window.requestAnimationFrame(() => setOpenMobile(false));
  };

  return <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
      {mobile ? <DropdownMenuTrigger asChild><Button variant="ghost" className="w-full justify-start gap-2 px-2 group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-0" data-account-menu-trigger aria-label={uiT("Account menu")} title={label}>{profile ? <Avatar className="size-6 shrink-0"><AvatarImage src={profile.avatar_data_url ?? undefined} alt=""/><AvatarFallback>{avatarInitial}</AvatarFallback></Avatar> : <span className="rail-avatar size-6 shrink-0" aria-hidden="true">{avatarInitial}</span>}<span className="min-w-0 flex-1 truncate text-left text-sm font-medium group-data-[collapsible=icon]:hidden">{label}</span><ChevronDown size={16} className="shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" /></Button></DropdownMenuTrigger> : <DropdownMenuTrigger className="rail-avatar account-trigger" data-account-menu-trigger aria-label={uiT("Account menu")} title={t('Account', '账户')}>
        {profile ? <Avatar className="size-full"><AvatarImage src={profile.avatar_data_url ?? undefined} alt=""/><AvatarFallback>{avatarInitial}</AvatarFallback></Avatar> : avatarInitial}
      </DropdownMenuTrigger>}
        <DropdownMenuContent onCloseAutoFocus={event => {if(document.querySelector('[data-global-settings-dialog]'))event.preventDefault();}} className="account-menu" side={mobile ? "bottom" : "right"} align="end" sideOffset={12} collisionPadding={12}>
          {mobile && showDestinations && <>
            {!supplierOnly && <>
              <DropdownMenuItem asChild><Link onClick={dismissMobileSidebar} to={workspacePath}><IconFolder />{t('Workspace', '工作空间')}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link onClick={dismissMobileSidebar} to="/generations"><IconSparkles />{t('Generations', '生成对话')}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link onClick={dismissMobileSidebar} to="/activity"><IconChartLine />{t('Activity', '活动')}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link onClick={dismissMobileSidebar} to={modelsHref}><Boxes />{t('Models', '模型')}</Link></DropdownMenuItem>
            </>}
            {platformAdmin && <DropdownMenuItem asChild><Link onClick={dismissMobileSidebar} to="/admin/providers"><IconShieldLock />{t('Admin', '管理后台')}</Link></DropdownMenuItem>}
            <DropdownMenuItem asChild><a href={`${import.meta.env.BASE_URL}docs/`} target="_blank" rel="noopener" aria-label={t('Docs (opens in a new tab)', '文档（在新标签页打开）')}><CircleHelp />{t('Docs', '文档')}<IconExternalLink className="ml-auto" aria-hidden="true" /></a></DropdownMenuItem>
            <DropdownMenuSeparator />
          </>}
          <DropdownMenuLabel className="account-identity">
            <Avatar className="size-9 shrink-0" aria-hidden="true"><AvatarImage src={profile?.avatar_data_url ?? undefined} alt=""/><AvatarFallback>{avatarInitial}</AvatarFallback></Avatar>
            <div className="account-identity-details"><strong>{label}</strong>
            <span>{profile?.email || (installation ? t('Administrator token session', '管理员令牌会话') : token ? t('Account settings', '账户设置') : t('Sign in', '登录'))}</span>
            {roles && roles.available.length > 1 && <span className="text-xs text-muted-foreground">{roles.active === 'admin' ? t('Platform administrator mode', '平台管理员模式') : t('User mode', '普通用户模式')}</span>}</div>
          </DropdownMenuLabel>
          {roles && roles.available.length > 1 && <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground" aria-live="polite">{roles.saving ? t('Switching role…', '正在切换角色…') : t('Role', '角色')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup aria-label={uiT("Role")} value={roles.active} onValueChange={value => {
              if (value !== 'user' && value !== 'admin' || value === roles.active) return;
              void roles.setRole(value).then(changed => { if (changed) { setAccountMenuOpen(false); dismissMobileSidebar(); } });
            }}>
              {roles.available.map(role => <DropdownMenuRadioItem key={role} value={role} disabled={roles.saving} onSelect={event => event.preventDefault()}>
                {role === 'admin' ? <IconShieldLock /> : <IconUser />}
                <span>{role === 'admin' ? t('Platform administrator', '平台管理员') : t('User', '普通用户')}</span>
              </DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
            {roles.active === 'admin' && !location.pathname.startsWith('/admin') && <DropdownMenuItem asChild><Link onClick={() => { setAccountMenuOpen(false); dismissMobileSidebar(); }} to="/admin/providers"><IconShieldLock />{t('Open Admin console', '打开管理后台')}</Link></DropdownMenuItem>}
          </>}
          {roles?.error && <DropdownMenuLabel role="alert" className="text-destructive whitespace-normal">{uiT(roles.error)}</DropdownMenuLabel>}
          {!supplierOnly && token && organizations.length > 0 && <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground" aria-live="polite">{organizationSwitching ? t('Switching organization…', '正在切换组织…') : t('Organizations', '组织')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup className="account-organizations" aria-label={uiT("Organization")} value={organization?.id ?? ''} onValueChange={id => {
              const next = organizations.find(item => item.id === id);
              if (next) selectOrganization(next);
            }}>
              {organizations.map(item => <DropdownMenuRadioItem key={item.id} value={item.id} disabled={workspaceLoading || Boolean(organizationSwitching) || Boolean(workspaceError && workspaceError.kind !== 'missing')}>
                <Building2 /><span>{item.name}</span>
              </DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </>}
          {organizationSwitchError && <DropdownMenuLabel role="alert" className="text-destructive whitespace-normal">{uiT(organizationSwitchError)}</DropdownMenuLabel>}
          {(!supplierOnly && organization) && <DropdownMenuSeparator />}
          <DropdownMenuLabel className="text-xs text-muted-foreground">{t('Account & preferences', '个人账户与偏好')}</DropdownMenuLabel>
          {!supplierOnly && token && (!showDestinations || !mobile) && <DropdownMenuItem asChild><Link onMouseEnter={() => prefetchRouteIntent('/activity')} onFocus={() => prefetchRouteIntent('/activity')} onClick={dismissMobileSidebar} to="/activity"><IconChartLine size={18}/>{t('Activity', '活动')}</Link></DropdownMenuItem>}
          <DropdownMenuItem asChild><Link onMouseEnter={() => prefetchRouteIntent(settingsHref(!token || installation ? 'appearance' : 'account'))} onFocus={() => prefetchRouteIntent(settingsHref(!token || installation ? 'appearance' : 'account'))} onClick={dismissMobileSidebar} state={{settingsReturnTo: location.pathname + location.search + location.hash}} to={settingsHref(!token || installation ? 'appearance' : 'account')}><IconSettings size={18}/>{t('Settings', '设置')}</Link></DropdownMenuItem>
          {!token && <><DropdownMenuSeparator /><DropdownMenuItem asChild><Link onMouseEnter={() => prefetchRouteIntent('/login')} onFocus={() => prefetchRouteIntent('/login')} onClick={dismissMobileSidebar} to="/login" state={{ from: `${location.pathname}${location.search}${location.hash}` }}><KeyRound size={18}/>{t('Sign in', '登录')}</Link></DropdownMenuItem></>}
          {token && <><DropdownMenuSeparator/><DropdownMenuItem onSelect={signOut}><LogOut/>{t('Sign out', '退出登录')}</DropdownMenuItem></>}
        </DropdownMenuContent>
    </DropdownMenu>;
}
