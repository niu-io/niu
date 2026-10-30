import { useIsMobile } from '@/hooks/use-mobile';
import { useLayoutEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Link, useLocation, useNavigate } from 'react-router';
import AccountProfile from './AccountProfile';
import PasswordSettings from './PasswordSettings';
import AccountBilling from '@/features/billing/AccountBilling';
import { Sidebar, SidebarProvider, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import type { DashboardContext } from '@/app/dashboard-context';
import { readTheme, saveTheme, subscribeTheme, type Theme } from '@/app/theme';
import { useLocale, type Locale } from '@/app/locale';
import { useEffect } from 'react';
import { IconChevronDown, IconSun, IconMoon, IconDeviceDesktop, IconUserCircle, IconPalette, IconCreditCard, IconInfoCircle, IconLanguage } from '@tabler/icons-react';
import { IconBook, IconVersions, IconBrandGithub, IconBug, IconLicense, IconCopyright, IconChevronRight } from '@tabler/icons-react';
import NiuBrand from '@/components/NiuBrand';

function SettingsContent({context, section}: {context: DashboardContext; section: string | undefined}) {
  // Legacy Payments bookmarks resolve to the same account funding home.
  if (section === 'payments') section = 'billing';
  const { locale, setLocale, t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const identity = JSON.stringify([context.token, context.session?.operator?.id]);
  const [profileState, setProfileState] = useState({identity, value:context.session?.profile ?? null});
  const profile = profileState.identity === identity ? profileState.value : context.session?.profile ?? null;
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => subscribeTheme(() => setTheme(readTheme())), []);
  useEffect(() => setProfileState({identity,value:context.session?.profile ?? null}), [identity,context.session?.profile]);
  if (!section || !['account', 'appearance', 'billing', 'payments', 'about'].includes(section)) return <Navigate state={location.state} to={context.session?.kind === 'operator' ? '/settings/account' : '/settings/appearance'} replace />;
  if (section === 'account' && context.session?.kind !== 'operator') return <Navigate state={location.state} to="/settings/appearance" replace />;
  const personal = context.session?.kind === 'operator';
  const canViewBilling = context.session?.kind === 'installation' || (context.session?.operator?.project_id === null && ['owner', 'admin'].includes(context.session.operator.role));
  const themeLabel = theme === 'light' ? t('Light', '浅色') : theme === 'dark' ? t('Dark', '深色') : t('System', '跟随系统');
  return <div className={`settings-page w-full min-w-0 space-y-8${section === 'payments' ? ' settings-payments-page' : ''}`}>
    {personal ? <div hidden={section !== 'account'}>
      <AccountProfile key={'profile-' + identity} token={context.token} initialProfile={profile} onSaved={value => {setProfileState({identity,value});context.updateProfile?.(value);}}/>
      <PasswordSettings key={'password-' + identity} token={context.token} hasPassword={Boolean(profile?.email)} onChanged={async () => { await context.signOut(); navigate('/login', {replace:true,state:{passwordChanged:true}}); }}/>
    </div> : null}
    {section === 'about' && <section aria-label="About Niu" className="space-y-8">
      <header className="flex items-center gap-4">
        <div className="min-w-0"><h2 aria-label={t('About Niu', '关于 Niu 牛元')}><NiuBrand locale={locale} /></h2><p className="mt-1 text-sm text-muted-foreground">{import.meta.env.VITE_NIU_VERSION ? `${t('Version', '版本')} ${import.meta.env.VITE_NIU_VERSION}` : t('Development build', '开发构建版')}</p></div>
      </header>
      <dl className="space-y-3 text-sm">
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted-foreground">{t('Release date', '发布日期')}</dt><dd>{import.meta.env.VITE_NIU_RELEASE_DATE || t('Not released', '未发布')}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted-foreground">{t('License', '开源许可')}</dt><dd>MIT</dd></div>
      </dl>
      <nav aria-label="Product resources" className="grid gap-1 sm:grid-cols-2">
        <Button asChild variant="ghost" className="justify-start"><NavLink to="/help/"><IconBook aria-hidden="true"/>{t('Documentation', '文档')}<IconChevronRight className="ml-auto text-muted-foreground" aria-hidden="true"/></NavLink></Button>
        <Button asChild variant="ghost" className="justify-start"><a href="https://github.com/niu-io/niu/releases" target="_blank" rel="noopener noreferrer"><IconVersions aria-hidden="true"/>{t('Release notes', '版本发布说明')}</a></Button>
        <Button asChild variant="ghost" className="justify-start"><a href="https://github.com/niu-io/niu" target="_blank" rel="noopener noreferrer"><IconBrandGithub aria-hidden="true"/>GitHub</a></Button>
        <Button asChild variant="ghost" className="justify-start"><a href="https://github.com/niu-io/niu/issues" target="_blank" rel="noopener noreferrer"><IconBug aria-hidden="true"/>{t('Report an issue', '反馈问题')}</a></Button>
      </nav>
      <nav aria-label="Legal resources" className="flex flex-wrap gap-x-5 gap-y-3 text-xs text-muted-foreground">
        <a href="https://github.com/niu-io/niu/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4"><IconLicense size={14} aria-hidden="true"/>{t('License', '许可证')}</a>
        <a href="https://github.com/niu-io/niu/blob/main/THIRD-PARTY-NOTICES.md" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4"><IconCopyright size={14} aria-hidden="true"/>{t('Third-party notices', '第三方声明')}</a>
      </nav>
    </section>}
    {section === 'appearance' && <section aria-label="Appearance preferences" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div><h2 className="text-sm font-medium">{t('Color mode', '外观模式')}</h2><p className="text-sm text-muted-foreground">{t('System follows your device’s appearance.', '跟随系统将自动匹配您设备的外观模式。')}</p></div>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary" aria-label="Color mode" disabled={context.appearance?.ready === false}>{theme === 'light' ? <IconSun/> : theme === 'dark' ? <IconMoon/> : <IconDeviceDesktop/>}{themeLabel}<IconChevronDown/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={theme} onValueChange={value => saveTheme(value as Theme)}>
            <DropdownMenuRadioItem value="system"><IconDeviceDesktop/>{t('System', '跟随系统')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="light"><IconSun/>{t('Light', '浅色')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark"><IconMoon/>{t('Dark', '深色')}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div><h2 className="text-sm font-medium">{t('Language', '界面语言')}</h2><p className="text-sm text-muted-foreground">{t('Choose the language used across Niu.', '选择 Niu 牛元界面显示的语言。')}</p></div>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary" aria-label="Language"><IconLanguage/>{locale === 'zh-CN' ? '简体中文' : 'English'}<IconChevronDown/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={locale} onValueChange={value => setLocale(value as Locale)}>
            <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>
      </div>
      {context.appearance?.saving && <p role="status">{t('Saving color mode…', '正在保存外观模式…')}</p>}
      {context.appearance?.error && <div role="alert"><p>{context.appearance.error}</p><Button variant="secondary" onClick={context.appearance.reload}>{t('Reload color mode', '重新加载外观模式')}</Button></div>}
    </section>}
    {['billing', 'payments'].includes(section) && <header className="space-y-2">
      <h2 className="text-base font-semibold">{t('Credits', '额度与充值')}</h2>
      <p className="text-sm text-muted-foreground">{t('Manage shared funds, add money, and review payment orders and balance activity.', '管理共享资金、充值额度，并查看支付订单与余额变动明细。')}</p>
    </header>}
    {['billing', 'payments'].includes(section) && context.organization && <p className="text-muted-foreground">{context.organization.name} · {t('Shared across workspaces', '跨工作空间共享')}</p>}
    {['billing', 'payments'].includes(section) && (canViewBilling
      ? context.organization
        ? <AccountBilling section="all" key={context.token + context.organization.id} token={context.token} organization={context.organization.id} canConfigure={Boolean(context.session?.permissions?.write)}/>
        : context.workspaceLoading
          ? <p role="status" className="text-muted-foreground">{t('Loading billing account…', '正在加载计费账户…')}</p>
          : <div role="alert" className="space-y-3"><p>{t('Could not load your billing account.', '无法加载您的计费账户。')}</p><Button variant="secondary" onClick={context.reloadWorkspaces}>{t('Retry', '重试')}</Button></div>
      : <p className="text-muted-foreground">{t('Only company owners and administrators can manage shared credits. Contact your company owner to add credits.', '仅组织所有者与管理员可管理共享额度，请联系组织所有者进行充值。')}</p>)}
  </div>;
}


export function SettingsNavigation({ context, section, href }: { context: DashboardContext; section?: string; href?: (section:string)=>string }) {
  const { t } = useLocale();
  const location = useLocation();
  const personal = context.session?.kind === 'operator';
  const canViewBilling = context.session?.kind === 'installation' || (context.session?.operator?.project_id === null && ['owner', 'admin'].includes(context.session.operator.role));
  const entries = [
    ...(personal ? [{path:'account',label:t('Account', '账户'),icon:IconUserCircle}] : []),
    {path:'appearance',label:t('Appearance', '外观'),icon:IconPalette},
    ...(canViewBilling ? [{path:'billing',label:t('Credits', '额度与充值'),icon:IconCreditCard}] : []),
    {path:'about',label:t('About', '关于'),icon:IconInfoCircle},
  ];
  return <>
    <SidebarHeader className="sidebar-heading"><h2 className="sidebar-heading-row group-data-[collapsible=icon]:sr-only">{t('Settings', '设置')}</h2></SidebarHeader>
    <SidebarContent className="px-3 pb-3"><nav aria-label="Settings navigation"><SidebarMenu>
      {entries.map(item => {
        const selectedSection = section ?? location.pathname.split('/')[2];
        const selected = (selectedSection === 'payments' ? 'billing' : selectedSection) === item.path;
        return <SidebarMenuItem key={item.path}><SidebarMenuButton asChild tooltip={item.label} isActive={selected}><Link aria-current={selected ? 'page' : undefined} state={location.state} to={href ? href(item.path) : '/settings/'+item.path}><item.icon aria-hidden="true"/><span>{item.label}</span></Link></SidebarMenuButton></SidebarMenuItem>;
      })}
    </SidebarMenu></nav></SidebarContent>
  </>;
}

export function settingsReturnDestination(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  const destination = new URL(value, 'https://niu.invalid');
  if (destination.origin !== 'https://niu.invalid' || /^\/(settings|login|installation)(\/|$)/.test(destination.pathname)) return fallback;
  return destination.pathname + destination.search + destination.hash;
}

export function settingsHref(pathname: string, search: string, hash: string, section: string): string {
  const query = new URLSearchParams(search);
  query.set('settings', section);
  return pathname + '?' + query.toString() + hash;
}

export function SettingsDialog({context, section, onClose, href}: {context:DashboardContext; section:string|undefined; onClose:()=>void; href?:(section:string)=>string}) {
  const { t } = useLocale();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [section]);
  const isMobile = useIsMobile();
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent onOpenAutoFocus={event => { event.preventDefault(); headingRef.current?.focus(); }} onCloseAutoFocus={event => {
      // Prefer the actual task entry point; menu items may unmount, so retain
      // the persistent account/navigation triggers as fallbacks.
      const destination = [openerRef.current, ...Array.from(document.querySelectorAll<HTMLElement>('[aria-label="Account menu"], [aria-label="Open navigation menu"], .sidebar-toggle'))]
        .find((element): element is HTMLElement => !!element && element !== document.body && element.isConnected && element.getClientRects().length > 0 && !element.closest('[role="dialog"]'));
      if (destination) { event.preventDefault(); destination.focus(); }
    }} aria-describedby="settings-description" className="settings-dialog !max-w-5xl !w-[calc(100%-2rem)] !p-0 !gap-0 overflow-hidden h-[min(760px,85dvh)]">
      <DialogTitle ref={headingRef} tabIndex={-1} className="sr-only">{t('Settings', '设置')}</DialogTitle>
      <DialogDescription id="settings-description" className="sr-only">{t('Account preferences and company billing.', '账户偏好与组织计费设置。')}</DialogDescription>
      <SidebarProvider style={{'--sidebar-width': '200px'} as React.CSSProperties} className="!min-h-0 h-full overflow-hidden">
        <Sidebar collapsible={isMobile ? "none" : "icon"} className="settings-dialog-navigation shrink-0 bg-muted/40">
          <SettingsNavigation context={context} section={section} href={href}/>
        </Sidebar>
        <div ref={contentRef} role="region" aria-label="Settings content" tabIndex={0} className="settings-dialog-content min-w-0 flex-1 overflow-y-auto p-6 pt-12 sm:p-10 sm:pt-12 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">{!isMobile && <SidebarTrigger aria-label="Toggle Settings navigation" className="absolute top-3 left-[calc(var(--sidebar-width)+12px)] settings-navigation-trigger"/>}<SettingsContent context={context} section={section}/></div>
      </SidebarProvider>
    </DialogContent>
  </Dialog>;
}
