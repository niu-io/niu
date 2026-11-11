import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { IconLogout as LogOut } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconSun as Sun } from "@tabler/icons-react";
import { IconMoon as Moon } from "@tabler/icons-react";
import { IconDeviceDesktop as Monitor } from "@tabler/icons-react";
import { IconBuildings as Building2, IconFolder } from "@tabler/icons-react";
import { IconSparkles } from "@tabler/icons-react";
import { IconCpu as Boxes } from "@tabler/icons-react";
import { IconBook as CircleHelp } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { settingsHref } from '@/features/account/settings-routes';
import { prefetchRouteIntent } from './prefetch';
import { workspaceModelsHref } from './workspace-route';
import { IconChartLine, IconExternalLink, IconLanguage, IconSettings, IconShieldLock, IconUser } from '@tabler/icons-react';
import { useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { applyTheme, readTheme, saveTheme, subscribeTheme, type Theme } from './theme';
import { useLocale, type Locale } from './ui-locale';
import type { DashboardContext } from './dashboard-context';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';

export default function AccountMenu({ context, workspacePath, supplierArea = false, mobile = false, showDestinations = true }: { context: DashboardContext; workspacePath: string; supplierArea?: boolean; mobile?: boolean; showDestinations?: boolean }) {
  const { t: uiT, format: uiF } = useUILocale();
  const {isMobile: compactNavigation, setOpenMobile} = useSidebar();
  const { locale, setLocale, t } = useLocale();
  const location = useLocation();
  const appearance = context.appearance ?? {ready:true,saving:false,error:'',reload:()=>{}};
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => subscribeTheme(() => setTheme(readTheme())), []);
  const profile = context.session?.profile ?? null;
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(theme);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);
  const { session, token, signOut, organizations, organization, selectOrganization, organizationSwitching, organizationSwitchError, workspaceLoading, workspaceError } = context;
  const modelsHref = workspaceModelsHref(token ? context.workspace : null, context.workspaces);
  const installation = session?.kind === 'installation';
  const platformAdmin = Boolean(session?.permissions?.platform_admin || (installation && session?.permissions?.manage_operators !== false));
  const supplierOnly = supplierArea && !installation && !session?.operator;
  const label = profile?.name || (installation ? t('Administrator access', '管理员访问') : t('Account', '账户'));
  const avatarInitial = (session ? label[0] : 'N').toUpperCase();
  const themeLabel = theme === 'light' ? t('Light', '浅色') : theme === 'dark' ? t('Dark', '深色') : t('System', '跟随系统');
  const localeLabel = locale === 'zh-CN' ? '简体中文' : 'English';
  const roles = context.roleSwitch;

  return <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
      {mobile ? <DropdownMenuTrigger asChild><Button variant="ghost" className="w-full justify-start gap-2 px-2 group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0" aria-label={uiT("Account menu")} title={label}>{profile ? <Avatar className="size-6 shrink-0"><AvatarImage src={profile.avatar_data_url ?? undefined} alt=""/><AvatarFallback>{avatarInitial}</AvatarFallback></Avatar> : <span className="rail-avatar size-6 shrink-0" aria-hidden="true">{avatarInitial}</span>}<span className="min-w-0 flex-1 truncate text-left text-sm font-medium group-data-[collapsible=icon]:hidden">{label}</span><ChevronDown size={16} className="shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" /></Button></DropdownMenuTrigger> : <DropdownMenuTrigger className="rail-avatar account-trigger" aria-label={uiT("Account menu")} title={t('Account', '账户')}>
        {profile ? <Avatar className="size-full"><AvatarImage src={profile.avatar_data_url ?? undefined} alt=""/><AvatarFallback>{avatarInitial}</AvatarFallback></Avatar> : avatarInitial}
      </DropdownMenuTrigger>}
        <DropdownMenuContent className="account-menu" side={mobile ? "bottom" : "right"} align="end" sideOffset={12} collisionPadding={12}>
          {mobile && showDestinations && <>
            {!supplierOnly && <>
              <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to={workspacePath}><IconFolder />{t('Workspace', '工作空间')}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to="/generations"><IconSparkles />{t('Generations', '生成对话')}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to="/activity"><IconChartLine />{t('Activity', '活动')}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to={modelsHref}><Boxes />{t('Models', '模型')}</Link></DropdownMenuItem>
            </>}
            {platformAdmin && <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to="/admin/providers"><IconShieldLock />{t('Admin', '管理后台')}</Link></DropdownMenuItem>}
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
              void roles.setRole(value).then(changed => { if (changed) { setAccountMenuOpen(false); if (compactNavigation) setOpenMobile(false); } });
            }}>
              {roles.available.map(role => <DropdownMenuRadioItem key={role} value={role} disabled={roles.saving} onSelect={event => event.preventDefault()}>
                {role === 'admin' ? <IconShieldLock /> : <IconUser />}
                <span>{role === 'admin' ? t('Platform administrator', '平台管理员') : t('User', '普通用户')}</span>
              </DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
            {roles.active === 'admin' && !location.pathname.startsWith('/admin') && <DropdownMenuItem asChild><Link onClick={() => { setAccountMenuOpen(false); if (compactNavigation) setOpenMobile(false); }} to="/admin/providers"><IconShieldLock />{t('Open Admin console', '打开管理后台')}</Link></DropdownMenuItem>}
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
          {!supplierOnly && organization && <DropdownMenuItem asChild><Link onMouseEnter={() => prefetchRouteIntent(settingsHref('organization'))} onFocus={() => prefetchRouteIntent(settingsHref('organization'))} onClick={() => { if (compactNavigation) setOpenMobile(false); }} state={{settingsReturnTo: location.pathname + location.search + location.hash}} to={settingsHref('organization')}><Building2 size={18}/>{t('Organization settings', '组织设置')}</Link></DropdownMenuItem>}
          {(!supplierOnly && organization) && <DropdownMenuSeparator />}
          <DropdownMenuLabel className="text-xs text-muted-foreground">{t('Account & preferences', '个人账户与偏好')}</DropdownMenuLabel>
          {!supplierOnly && token && (!showDestinations || !mobile) && <DropdownMenuItem asChild><Link onMouseEnter={() => prefetchRouteIntent('/activity')} onFocus={() => prefetchRouteIntent('/activity')} onClick={() => { if (compactNavigation) setOpenMobile(false); }} to="/activity"><IconChartLine size={18}/>{t('Activity', '活动')}</Link></DropdownMenuItem>}
          <DropdownMenuItem asChild><Link onMouseEnter={() => prefetchRouteIntent(settingsHref(!token || installation ? 'appearance' : 'account'))} onFocus={() => prefetchRouteIntent(settingsHref(!token || installation ? 'appearance' : 'account'))} onClick={() => { if (compactNavigation) setOpenMobile(false); }} state={{settingsReturnTo: location.pathname + location.search + location.hash}} to={settingsHref(!token || installation ? 'appearance' : 'account')}><IconSettings size={18}/>{t('Settings', '设置')}</Link></DropdownMenuItem>
          {!token && <><DropdownMenuSeparator /><DropdownMenuItem asChild><Link onMouseEnter={() => prefetchRouteIntent('/login')} onFocus={() => prefetchRouteIntent('/login')} onClick={() => { if (compactNavigation) setOpenMobile(false); }} to="/login" state={{ from: `${location.pathname}${location.search}${location.hash}` }}><KeyRound size={18}/>{t('Sign in', '登录')}</Link></DropdownMenuItem></>}
          <DropdownMenuSeparator />
          {compactNavigation ? <>
            <DropdownMenuLabel>{t('Theme', '主题')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup aria-label={uiT("Appearance")} value={theme} onValueChange={value => { const next = value as Theme; setTheme(next); saveTheme(next); setAccountMenuOpen(false); }}>
              {([{value: 'system', label: t('System', '跟随系统'), icon: Monitor}, {value: 'light', label: t('Light', '浅色'), icon: Sun}, {value: 'dark', label: t('Dark', '深色'), icon: Moon}] as const).map(option => <DropdownMenuRadioItem key={option.value} value={option.value} disabled={!appearance.ready}><option.icon/><span>{uiT(option.label)}</span></DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
            <DropdownMenuLabel>{t('Language', '界面语言')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup aria-label={uiT("Language")} value={locale} onValueChange={value => { setLocale(value as Locale); setAccountMenuOpen(false); }}>
              <DropdownMenuRadioItem value="en"><span>English</span></DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="zh-CN"><span>简体中文</span></DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </> : <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger aria-label={uiF("Theme: {0}", [themeLabel])}><Monitor/><span className="flex-1">{t('Theme', '主题')}</span><span className="text-muted-foreground">{themeLabel}</span></DropdownMenuSubTrigger>
              <DropdownMenuSubContent collisionPadding={12}>
                <DropdownMenuRadioGroup aria-label={uiT("Appearance")} value={theme} onValueChange={value => { const next = value as Theme; setTheme(next); saveTheme(next); setAccountMenuOpen(false); }}>
                  {([{value: 'system', label: t('System', '跟随系统'), icon: Monitor}, {value: 'light', label: t('Light', '浅色'), icon: Sun}, {value: 'dark', label: t('Dark', '深色'), icon: Moon}] as const).map(option => <DropdownMenuRadioItem key={option.value} value={option.value} disabled={!appearance.ready} onSelect={() => setAccountMenuOpen(false)}><option.icon/><span>{uiT(option.label)}</span></DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger aria-label={uiF("Language: {0}", [localeLabel])}><IconLanguage size={18}/><span className="flex-1">{t('Language', '界面语言')}</span><span className="text-muted-foreground">{localeLabel}</span></DropdownMenuSubTrigger>
              <DropdownMenuSubContent collisionPadding={12}>
                <DropdownMenuRadioGroup aria-label={uiT("Language")} value={locale} onValueChange={value => { setLocale(value as Locale); setAccountMenuOpen(false); }}>
                  <DropdownMenuRadioItem value="en" onSelect={() => setAccountMenuOpen(false)}><span>English</span></DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="zh-CN" onSelect={() => setAccountMenuOpen(false)}><span>简体中文</span></DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>}
          {appearance.error && <><DropdownMenuLabel className="text-destructive whitespace-normal">{uiT(appearance.error)}</DropdownMenuLabel><DropdownMenuItem onSelect={appearance.reload}>{t('Reload color mode', '重新加载外观模式')}</DropdownMenuItem></>}
          {token && <><DropdownMenuSeparator/><DropdownMenuItem onSelect={signOut}><LogOut/>{t('Sign out', '退出登录')}</DropdownMenuItem></>}
        </DropdownMenuContent>
    </DropdownMenu>;
}
