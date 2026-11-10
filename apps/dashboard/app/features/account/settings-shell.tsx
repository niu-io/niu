import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useState } from 'react';
import { Navigate, NavLink, Link, useLocation, useNavigate } from 'react-router';
import AccountProfile from './AccountProfile';
import PasswordSettings from './PasswordSettings';
import AccountBilling from '@/features/billing/AccountBilling';
import OperatorsView from '@/features/operators/components/OperatorsView';
import { OrganizationSettings } from '@/features/organization/settings-section';
import { resolveWorkspacePathSegment, workspaceDisplayName } from '@/shell/workspace-route';
import { SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import type { DashboardContext } from '@/shell/dashboard-context';
import { readTheme, saveTheme, subscribeTheme, type Theme } from '@/shell/theme';
import { useLocale, type Locale } from '@/shell/ui-locale';
import { IconChevronDown, IconSun, IconMoon, IconDeviceDesktop, IconUserCircle, IconCreditCard, IconLanguage, IconUsers, IconBuildings } from '@tabler/icons-react';
import { IconBook, IconVersions, IconBrandGithub, IconBug, IconLicense, IconCopyright, IconChevronRight } from '@tabler/icons-react';
import NiuBrand from '@/components/NiuBrand';
import { MetricStripSkeleton } from '@/components/PageSkeletons';
import { settingsHref } from './settings-routes';

export function SettingsContent({context, section}: {context: DashboardContext; section: string | undefined}) {
  const { t: uiT } = useUILocale();
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
  if (!section || !['organization', 'account', 'appearance', 'billing', 'payments', 'members', 'about'].includes(section)) return <Navigate state={location.state} to={context.session?.kind === 'operator' ? '/settings/account' : '/settings/appearance'} replace />;
  if (section === 'account' && context.session?.kind !== 'operator') return <Navigate state={location.state} to="/settings/appearance" replace />;
  const requestedWorkspace = section === 'members' ? new URLSearchParams(location.search).get('workspace') : null;
  const scopedWorkspace = requestedWorkspace ? resolveWorkspacePathSegment(requestedWorkspace, context.workspaces) : undefined;
  const personal = context.session?.kind === 'operator';
  const canViewBilling = context.session?.operating_mode !== 'internal' && (context.session?.kind === 'installation' || (context.session?.operator?.project_id === null && ['owner', 'admin'].includes(context.session.operator.role)));
  const themeLabel = theme === 'light' ? t('Light', '浅色') : theme === 'dark' ? t('Dark', '深色') : t('System', '跟随系统');
  return <div className="settings-page w-full min-w-0 space-y-8">
    {section === 'organization' && <OrganizationSettings key={context.organization?.id} context={context} />}
    {personal ? <div hidden={section !== 'account'}>
      <AccountProfile key={'profile-' + identity} token={context.token} initialProfile={profile} onSaved={value => {setProfileState({identity,value});context.updateProfile?.(value);}}/>
      <PasswordSettings key={'password-' + identity} token={context.token} hasPassword={Boolean(profile?.email)} onChanged={async () => { await context.signOut(); navigate('/login', {replace:true,state:{passwordChanged:true}}); }}/>
    </div> : null}
    {section === 'members' && <section aria-label={scopedWorkspace ? t('Workspace members', '工作空间成员') : t('Organization members', '组织成员管理')} className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-base font-semibold">{scopedWorkspace ? t('Workspace members', '工作空间成员') : t('Members', '成员管理')}</h2>
        <p className="text-sm text-muted-foreground">{scopedWorkspace
          ? t(
            'Members with access to {0}. Organization-wide access is shown as All workspaces.',
            '可访问{0}的成员。组织范围访问权限显示为“全部工作空间”。',
          ).replace('{0}', workspaceDisplayName(scopedWorkspace.name))
          : t('Manage organization members, roles, and workspace access.', '管理组织成员、角色与工作空间访问权限。')}</p>
      </header>
      {requestedWorkspace && !scopedWorkspace ? (
        context.workspaceLoading
          ? <MetricStripSkeleton count={2} label={t('Loading workspace members…', '正在加载工作空间成员…')} />
          : <div role="alert" className="space-y-3">
              <p>{t('This workspace membership scope is unavailable. Choose organization-wide members instead.', '此工作空间成员范围不可用，请改为查看组织范围成员。')}</p>
              <Button asChild variant="secondary"><Link to={settingsHref('members')}>{t('View all organization members', '查看全部组织成员')}</Link></Button>
            </div>
      ) : context.session ? (
        <>
          {scopedWorkspace && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">{t('Showing members with access to this workspace.', '仅显示可访问此工作空间的成员。')}</p>
            <Button asChild variant="ghost" size="sm"><Link to={settingsHref('members')}>{t('View all organization members', '查看全部组织成员')}</Link></Button>
          </div>}
          <OperatorsView
            embedded
            key={`${context.token}:${context.organization?.id}:${scopedWorkspace?.id ?? 'organization'}`}
            initialOrganization={context.organization?.id ?? context.workspace?.organization_id}
            initialWorkspace={scopedWorkspace?.id}
            token={context.token}
            session={context.session}
            refreshWorkspace={context.refreshWorkspace}
          />
        </>
      ) : (
        <MetricStripSkeleton count={2} label={t('Loading organization members…', '正在加载组织成员…')} />
      )}
    </section>}
    {section === 'about' && <section aria-label={uiT("About Niu")} className="space-y-8">
      <header className="flex items-center gap-4">
        <div className="min-w-0"><h2 aria-label={t('About Niu', '关于 Niu')}><NiuBrand locale={locale} /></h2><p className="mt-1 text-sm text-muted-foreground">{import.meta.env.VITE_NIU_VERSION ? `${t('Version', '版本')} ${import.meta.env.VITE_NIU_VERSION}` : t('Development build', '开发构建版')}</p></div>
      </header>
      <dl className="space-y-3 text-sm">
        {import.meta.env.VITE_NIU_RELEASE_DATE && <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted-foreground">{t('Release date', '发布日期')}</dt><dd>{import.meta.env.VITE_NIU_RELEASE_DATE}</dd></div>}
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted-foreground">{t('License', '开源许可')}</dt><dd>MIT</dd></div>
      </dl>
      <nav aria-label={uiT("Product resources")} className="grid gap-1 sm:grid-cols-2">
        <Button asChild variant="ghost" className="justify-start"><NavLink to="/help/"><IconBook aria-hidden="true"/>{t('Docs', '文档')}<IconChevronRight className="ml-auto text-muted-foreground" aria-hidden="true"/></NavLink></Button>
        <Button asChild variant="ghost" className="justify-start"><a href="https://github.com/niu-io/niu/releases" target="_blank" rel="noopener noreferrer"><IconVersions aria-hidden="true"/>{t('Release notes', '版本发布说明')}</a></Button>
        <Button asChild variant="ghost" className="justify-start"><a href="https://github.com/niu-io/niu" target="_blank" rel="noopener noreferrer"><IconBrandGithub aria-hidden="true"/>GitHub</a></Button>
        <Button asChild variant="ghost" className="justify-start"><a href="https://github.com/niu-io/niu/issues" target="_blank" rel="noopener noreferrer"><IconBug aria-hidden="true"/>{t('Report an issue', '反馈问题')}</a></Button>
      </nav>
      <nav aria-label={uiT("Legal resources")} className="flex flex-wrap gap-x-5 gap-y-3 text-xs text-muted-foreground">
        <a href="https://github.com/niu-io/niu/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4"><IconLicense size={14} aria-hidden="true"/>{t('License', '许可证')}</a>
        <a href="https://github.com/niu-io/niu/blob/main/THIRD-PARTY-NOTICES.md" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4"><IconCopyright size={14} aria-hidden="true"/>{t('Third-party notices', '第三方声明')}</a>
      </nav>
    </section>}
    {(section === 'appearance' || section === 'account') && <section aria-label={uiT("Appearance preferences")} className="space-y-3">
      <div className="flex max-w-xl flex-wrap items-center justify-between gap-4 py-4">
        <div><h2 className="text-sm font-medium">{t('Color mode', '外观模式')}</h2><p className="text-sm text-muted-foreground">{t('System follows your device’s appearance.', '跟随系统将自动匹配您设备的外观模式。')}</p></div>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary" aria-label={uiT("Color mode")} disabled={context.appearance?.ready === false}>{theme === 'light' ? <IconSun/> : theme === 'dark' ? <IconMoon/> : <IconDeviceDesktop/>}{themeLabel}<IconChevronDown/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={theme} onValueChange={value => saveTheme(value as Theme)}>
            <DropdownMenuRadioItem value="system"><IconDeviceDesktop/>{t('System', '跟随系统')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="light"><IconSun/>{t('Light', '浅色')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark"><IconMoon/>{t('Dark', '深色')}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex max-w-xl flex-wrap items-center justify-between gap-4 py-4">
        <div><h2 className="text-sm font-medium">{t('Language', '界面语言')}</h2><p className="text-sm text-muted-foreground">{t('Choose the language used across Niu.', '选择 Niu 界面显示的语言。')}</p></div>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary" aria-label={uiT("Language")}><IconLanguage/>{locale === 'zh-CN' ? '简体中文' : 'English'}<IconChevronDown/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={locale} onValueChange={value => setLocale(value as Locale)}>
            <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>
      </div>
      {context.appearance?.saving && <p role="status">{t('Saving color mode…', '正在保存外观模式…')}</p>}
      {context.appearance?.error && <div role="alert"><p>{context.appearance.error}</p><Button variant="secondary" onClick={context.appearance.reload}>{t('Reload color mode', '重新加载外观模式')}</Button></div>}
    </section>}
    {(section === 'account' || section === 'appearance') && <Button asChild variant="link" className="px-0"><Link to="/settings/about">{t('About Niu', '关于 Niu')}</Link></Button>}
    {['billing', 'payments'].includes(section) && <header className="space-y-2">
      <h2 className="text-base font-semibold">{t('Credits', '额度与充值')}</h2>
      <p className="text-sm text-muted-foreground">{t('Manage shared funds, add money, and review payment orders and balance activity.', '管理共享资金、充值额度，并查看支付订单与余额变动明细。')}</p>
    </header>}
    {['billing', 'payments'].includes(section) && context.organization && <p className="text-muted-foreground">{context.organization.name} · {t('Shared across workspaces', '跨工作空间共享')}</p>}
    {['billing', 'payments'].includes(section) && (canViewBilling
      ? context.organization
        ? <AccountBilling section="all" key={context.token + context.organization.id} token={context.token} organization={context.organization.id} canConfigure={Boolean(context.session?.permissions?.write)}/>
        : context.workspaceLoading
          ? <MetricStripSkeleton count={2} label={t('Loading billing account…', '正在加载计费账户…')} />
          : <div role="alert" className="space-y-3"><p>{t('Could not load your billing account.', '无法加载您的计费账户。')}</p><Button variant="secondary" onClick={context.reloadWorkspaces}>{t('Retry', '重试')}</Button></div>
      : <p className="text-muted-foreground">{t('Only company owners and administrators can manage shared credits. Contact your company owner to add credits.', '仅组织所有者与管理员可管理共享额度，请联系组织所有者进行充值。')}</p>)}
  </div>;
}


export function SettingsNavigation({ context, section }: { context: DashboardContext; section?: string }) {
  const { t: uiT } = useUILocale();
  const { t } = useLocale();
  const location = useLocation();
  const personal = context.session?.kind === 'operator';
  const canViewBilling = context.session?.operating_mode !== 'internal' && (context.session?.kind === 'installation' || (context.session?.operator?.project_id === null && ['owner', 'admin'].includes(context.session.operator.role)));
  const canManageMembers = Boolean(context.organization && context.session?.permissions?.manage_operators);
  const entries = [
    ...(context.organization ? [{path:'organization',label:t('Organization', '组织'),icon:IconBuildings}] : []),
    ...(canManageMembers ? [{path:'members',label:t('Members', '成员管理'),icon:IconUsers}] : []),
    ...(canViewBilling ? [{path:'billing',label:t('Credits', '额度与充值'),icon:IconCreditCard}] : []),
    ...(personal ? [{path:'account',label:t('Account', '账户'),icon:IconUserCircle}] : []),
    ...(!personal ? [{path:'appearance',label:t('Preferences', '偏好设置'),icon:IconUserCircle}] : []),
  ];
  return <>
    <SidebarHeader className="sidebar-heading"><h2 className="sidebar-heading-row">{t('Settings', '设置')}</h2></SidebarHeader>
    <SidebarContent className="px-3 pb-3"><nav aria-label={uiT("Settings navigation")}><SidebarMenu>
      {entries.map(item => {
        const selectedSection = section ?? location.pathname.split('/')[2];
        const selected = (selectedSection === 'payments' ? 'billing' : selectedSection) === item.path;
        return <SidebarMenuItem key={item.path}><SidebarMenuButton asChild tooltip={item.label} isActive={selected}><Link aria-current={selected ? 'page' : undefined} state={location.state} to={settingsHref(item.path)}><item.icon aria-hidden="true"/><span>{item.label}</span></Link></SidebarMenuButton></SidebarMenuItem>;
      })}
    </SidebarMenu></nav></SidebarContent>
  </>;
}
