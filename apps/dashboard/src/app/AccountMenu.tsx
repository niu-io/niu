import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { IconLogout as LogOut } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconSun as Sun } from "@tabler/icons-react";
import { IconMoon as Moon } from "@tabler/icons-react";
import { IconDeviceDesktop as Monitor } from "@tabler/icons-react";
import { IconBuildings as Building2 } from "@tabler/icons-react";
import { FolderKey } from "lucide-react";
import { IconSparkles } from "@tabler/icons-react";
import { IconCpu as Boxes } from "@tabler/icons-react";
import { IconPlugConnected as SupplierConnection } from "@tabler/icons-react";
import { IconBook as CircleHelp } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { settingsHref } from '@/features/account/settings-page';
import { workspaceModelsHref } from './workspace-route';
import { IconChartLine, IconLanguage, IconSettings, IconShieldLock } from '@tabler/icons-react';
import { useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { applyTheme, readTheme, saveTheme, subscribeTheme, type Theme } from './theme';
import { useLocale, type Locale } from './locale';
import type { DashboardContext } from './dashboard-context';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';

export default function AccountMenu({ context, workspacePath, supplierArea = false, mobile = false }: { context: DashboardContext; workspacePath: string; supplierArea?: boolean; mobile?: boolean }) {
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
  const { session, token, signOut, organizations, organization, selectOrganization, workspaceLoading, workspaceError } = context;
  const modelsHref = token ? workspaceModelsHref(context.workspace, context.workspaces) : '/models/';
  const installation = session?.kind === 'installation';
  const platformAdmin = installation || Boolean(session?.permissions.platform_admin);
  const supplierOnly = supplierArea && !installation && !session?.operator;
  const label = profile?.name || (installation ? t('Administrator access', '管理员访问') : t('Account', '账户'));
  const themeLabel = theme === 'light' ? t('Light', '浅色') : theme === 'dark' ? t('Dark', '深色') : t('System', '跟随系统');
  const localeLabel = locale === 'zh-CN' ? '简体中文' : 'English';
  return <>
    <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
      {mobile ? <DropdownMenuTrigger asChild><Button variant="ghost" aria-label="Open navigation menu">{t('Navigation', '导航')}<ChevronDown size={16} /></Button></DropdownMenuTrigger> : <DropdownMenuTrigger className="rail-avatar account-trigger" aria-label="Account menu" title={t('Account', '账户')}>
        {profile ? <Avatar className="size-full"><AvatarImage src={profile.avatar_data_url ?? undefined} alt=""/><AvatarFallback>{label[0]}</AvatarFallback></Avatar> : session ? label[0] : 'N'}
      </DropdownMenuTrigger>}
        <DropdownMenuContent onEscapeKeyDown={event => event.stopPropagation()} className="account-menu" side={mobile ? "bottom" : "right"} align="end" sideOffset={12} collisionPadding={12}>
          {mobile && <>
            {!supplierOnly && <>
              <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to={workspacePath}><FolderKey />{t('Workspace', '工作空间')}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to="/generations"><IconSparkles />{t('Generations', '生成对话')}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to="/activity"><IconChartLine />{t('Activity', '活动')}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to={modelsHref} reloadDocument={!token}><Boxes />{t('Models', '模型')}</Link></DropdownMenuItem>
            </>}
            {((platformAdmin && session?.permissions.manage_operators) || Boolean(session?.provider_memberships?.length)) && <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to={platformAdmin ? '/admin/suppliers' : session?.provider_memberships?.length ? `/suppliers/${session.provider_memberships[0].id}` : '/suppliers'}>{platformAdmin ? <IconShieldLock size={16} /> : <SupplierConnection size={16} />}{platformAdmin ? t("Admin", "管理后台") : t("Providers", "模型供应商")}</Link></DropdownMenuItem>}
            <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to="/help/"><CircleHelp />{t('Documentation', '文档')}</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
          </>}
          <DropdownMenuLabel className="account-identity">
            <Avatar className="size-9 shrink-0" aria-hidden="true"><AvatarImage src={profile?.avatar_data_url ?? undefined} alt=""/><AvatarFallback>{label[0].toUpperCase()}</AvatarFallback></Avatar>
            <div className="account-identity-details"><strong>{label}</strong>
            <span>{profile?.email || (installation ? t('Administrator token session', '管理员令牌会话') : token ? t('Account settings', '账户设置') : t('Sign in', '登录'))}</span></div>
          </DropdownMenuLabel>
          {!supplierOnly && token && organizations.length > 0 && <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('Organizations', '组织')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup className="account-organizations" aria-label="Organization" value={organization?.id ?? ''} onValueChange={id => {
              const next = organizations.find(item => item.id === id);
              if (next) selectOrganization(next);
            }}>
              {organizations.map(item => <DropdownMenuRadioItem key={item.id} value={item.id} disabled={workspaceLoading || Boolean(workspaceError && workspaceError.kind !== 'missing')}>
                <span>{item.name}</span>
              </DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </>}
          {!supplierOnly && organization && <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to={`${workspacePath}/organization`}><Building2 size={18}/>{t('Organization settings', '组织设置')}</Link></DropdownMenuItem>}
          <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} state={{settingsReturnTo: location.pathname + location.search + location.hash}} to={settingsHref(location.pathname, location.search, location.hash, !token || installation ? "appearance" : "account")}><IconSettings size={18}/>{t('Settings', '设置')}</Link></DropdownMenuItem>
          {!token && <><DropdownMenuSeparator /><DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} to="/login" state={{ from: `${location.pathname}${location.search}${location.hash}` }}><KeyRound size={18}/>{t('Sign in', '登录')}</Link></DropdownMenuItem></>}
          <DropdownMenuSeparator />
          {compactNavigation ? <>
            <DropdownMenuItem asChild><Link onClick={() => { if (compactNavigation) setOpenMobile(false); }} state={{settingsReturnTo: location.pathname + location.search + location.hash}} to={settingsHref(location.pathname, location.search, location.hash, "appearance")}><Monitor/><span className="flex-1">{t('Appearance', '外观')}</span><span className="text-muted-foreground">{themeLabel} · {localeLabel}</span></Link></DropdownMenuItem>
          </> : <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger aria-label={`Theme: ${theme[0].toUpperCase()+theme.slice(1)}`}><Monitor/><span className="flex-1">{t('Theme', '主题')}</span><span className="text-muted-foreground">{themeLabel}</span></DropdownMenuSubTrigger>
              <DropdownMenuSubContent collisionPadding={12}>
                <DropdownMenuRadioGroup aria-label="Appearance" value={theme} onValueChange={value => { const next = value as Theme; setTheme(next); saveTheme(next); setAccountMenuOpen(false); }}>
                  {([{value: 'system', label: t('System', '跟随系统'), icon: Monitor}, {value: 'light', label: t('Light', '浅色'), icon: Sun}, {value: 'dark', label: t('Dark', '深色'), icon: Moon}] as const).map(option => <DropdownMenuRadioItem key={option.value} value={option.value} disabled={!appearance.ready} onSelect={() => setAccountMenuOpen(false)}><option.icon/><span>{option.label}</span></DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger aria-label={`Language: ${localeLabel}`}><IconLanguage size={18}/><span className="flex-1">{t('Language', '界面语言')}</span><span className="text-muted-foreground">{localeLabel}</span></DropdownMenuSubTrigger>
              <DropdownMenuSubContent collisionPadding={12}>
                <DropdownMenuRadioGroup aria-label="Language" value={locale} onValueChange={value => { setLocale(value as Locale); setAccountMenuOpen(false); }}>
                  <DropdownMenuRadioItem value="en" onSelect={() => setAccountMenuOpen(false)}><span>English</span></DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="zh-CN" onSelect={() => setAccountMenuOpen(false)}><span>简体中文</span></DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>}
          {appearance.error && <><DropdownMenuLabel className="text-destructive">{appearance.error}</DropdownMenuLabel><DropdownMenuItem onSelect={appearance.reload}>{t('Reload color mode', '重新加载外观模式')}</DropdownMenuItem></>}
          {token && <><DropdownMenuSeparator/><DropdownMenuItem onSelect={signOut}><LogOut/>{t('Sign out', '退出登录')}</DropdownMenuItem></>}
        </DropdownMenuContent>
    </DropdownMenu>

  </>;
}
