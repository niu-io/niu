import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useState } from 'react';
import { Navigate, Link, useLocation, useNavigate } from 'react-router';
import AccountProfile from './AccountProfile';
import PasswordSettings from './PasswordSettings';
import AccountBilling from '@/features/billing/AccountBilling';
import OperatorsView from '@/features/operators/components/OperatorsView';
import { OrganizationSettings } from '@/features/organization/settings-section';
import { organizationDisplayName, resolveWorkspacePathSegment, workspaceDisplayName, workspacePathSegment } from '@/shell/workspace-route';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import type { DashboardContext } from '@/shell/dashboard-context';
import { readTheme, saveTheme, subscribeTheme, type Theme } from '@/shell/theme';
import { useLocale, type Locale } from '@/shell/ui-locale';
import { IconChevronDown, IconSun, IconMoon, IconDeviceDesktop, IconLanguage } from '@tabler/icons-react';
import { IconBook, IconVersions, IconBrandGithub, IconBug, IconLicense, IconCopyright } from '@tabler/icons-react';
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
  const [passwordEditingState, setPasswordEditingState] = useState({ identity, editing: false });
  const passwordEditing = passwordEditingState.identity === identity && passwordEditingState.editing;
  useEffect(() => subscribeTheme(() => setTheme(readTheme())), []);
  useEffect(() => setProfileState({identity,value:context.session?.profile ?? null}), [identity,context.session?.profile]);
  if (!section || !['organization', 'account', 'appearance', 'billing', 'payments', 'members', 'about'].includes(section)) return <Navigate state={location.state} to={context.session?.kind === 'operator' ? '/settings/account' : '/settings/appearance'} replace />;
  if (section === 'account' && context.session?.kind !== 'operator') return <Navigate state={location.state} to="/settings/appearance" replace />;
  const lockedWorkspace = context.session?.kind === 'operator' ? context.session.operator?.project_id : null;
  const requestedWorkspace = section === 'members' ? lockedWorkspace || new URLSearchParams(location.search).get('workspace') : null;
  const scopedWorkspace = lockedWorkspace ? context.workspaces.find(item => item.id === lockedWorkspace) : requestedWorkspace ? resolveWorkspacePathSegment(requestedWorkspace, context.workspaces) : undefined;
  const personal = context.session?.kind === 'operator';
  const canViewBilling = context.session?.kind === 'installation' || (context.session?.operator?.project_id === null && ['owner', 'admin'].includes(context.session.operator.role));
  const themeLabel = theme === 'light' ? t('Light', '浅色') : theme === 'dark' ? t('Dark', '深色') : t('System', '系统');
  return <div className="settings-page w-full min-w-0 space-y-8">
    {section === 'organization' && <OrganizationSettings key={context.organization?.id} context={context} />}
    {personal ? <div hidden={section !== 'account'}>
      <div hidden={passwordEditing} className="settings-section">
        <header className="settings-section-heading">
          <h3>{t('Profile', '个人资料')}</h3>
          <p>{t('Your name, photo, and email as shown to your organization.', '向组织展示的名称、头像和邮箱。')}</p>
        </header>
        <AccountProfile key={'profile-' + identity} token={context.token} initialProfile={profile} onSaved={value => {setProfileState({identity,value});context.updateProfile?.(value);}}/>
      </div>
      <div className="settings-section">
        <PasswordSettings key={`password-${identity}`} token={context.token} hasPassword={Boolean(profile?.email)} onEditingChange={editing => setPasswordEditingState({ identity, editing })} onChanged={async () => { await context.signOut(); navigate('/login', {replace:true,state:{passwordChanged:true}}); }}/>
      </div>
    </div> : null}
    {section === 'members' && <section aria-label={scopedWorkspace ? t('Workspace members', '工作空间成员') : t('Organization members', '组织成员')} className="space-y-6">
      {scopedWorkspace && <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t('Workspace members', '工作空间成员')} · {workspaceDisplayName(scopedWorkspace.name)}</h2>
        {!lockedWorkspace && <Button asChild variant="ghost" size="sm"><Link replace state={location.state} to={settingsHref('members')}>{t('View all organization members', '查看全部成员')}</Link></Button>}
      </header>}
      {requestedWorkspace && !scopedWorkspace ? (
        context.workspaceLoading
          ? <MetricStripSkeleton count={2} label={t('Loading workspace members…', '加载成员…')} />
          : <div role="alert" className="space-y-3">
              <p>{t('This workspace membership scope is unavailable. Choose organization-wide members instead.', '此范围不可用，请查看组织成员。')}</p>
              <Button asChild variant="secondary"><Link replace state={location.state} to={settingsHref('members')}>{t('View all organization members', '查看全部成员')}</Link></Button>
            </div>
      ) : context.session ? (
        <OperatorsView
          key={`${context.token}:${context.organization?.id}:${scopedWorkspace?.id ?? 'organization'}`}
          initialOrganization={context.organization?.id ?? context.workspace?.organization_id}
          initialWorkspace={scopedWorkspace?.id}
          token={context.token}
          session={context.session}
          refreshWorkspace={context.refreshWorkspace}
        />
      ) : (
        <MetricStripSkeleton count={2} label={t('Loading organization members…', '加载成员…')} />
      )}
    </section>}
    {section === 'about' && <section aria-label={uiT("About Niu")} className="settings-about">
      <header className="settings-about-hero">
        <div className="settings-about-brand"><NiuBrand locale={locale} /></div>
        <p className="settings-about-summary">{t('Niu is the model platform for agents: trustworthy model information and authorized model management.', 'Niu 是面向 Agent 的模型平台，提供可信的模型信息与授权的模型管理能力。')}</p>
        <p className="settings-about-meta">
          <span>{import.meta.env.VITE_NIU_VERSION ? `${t('Version', '版本')} ${import.meta.env.VITE_NIU_VERSION}` : t('Development build', '开发版')}</span>
          {import.meta.env.VITE_NIU_RELEASE_DATE && <><span aria-hidden="true">·</span><span>{t('Released', '发布')} {import.meta.env.VITE_NIU_RELEASE_DATE}</span></>}
          <span aria-hidden="true">·</span>
          <span><IconLicense size={14} aria-hidden="true" />{t('License', '许可证')} <a href="https://github.com/niu-io/niu/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT</a></span>
        </p>
      </header>
      <section className="settings-about-resources" aria-labelledby="settings-about-resources-title">
        <header className="settings-about-resources-heading">
          <h3 id="settings-about-resources-title">{t('Resources', '资源')}</h3>
          <p>{t('Documentation, releases, source, and support.', '文档、发布说明、源码与支持。')}</p>
        </header>
        <nav aria-label={uiT("Product resources")} className="settings-about-links">
          <Button asChild variant="ghost" className="settings-about-link"><a href={`${import.meta.env.BASE_URL}docs/`} target="_blank" rel="noopener" aria-label={t('Docs (opens in a new tab)', '文档（新标签页）')}><IconBook aria-hidden="true"/><span className="settings-about-link-label">{t('Docs', '文档')}</span></a></Button>
          <Button asChild variant="ghost" className="settings-about-link"><a href="https://github.com/niu-io/niu/releases" target="_blank" rel="noopener noreferrer"><IconVersions aria-hidden="true"/><span className="settings-about-link-label">{t('Release notes', '发布说明')}</span></a></Button>
          <Button asChild variant="ghost" className="settings-about-link"><a href="https://github.com/niu-io/niu" target="_blank" rel="noopener noreferrer"><IconBrandGithub aria-hidden="true"/><span className="settings-about-link-label">GitHub</span></a></Button>
          <Button asChild variant="ghost" className="settings-about-link"><a href="https://github.com/niu-io/niu/issues" target="_blank" rel="noopener noreferrer"><IconBug aria-hidden="true"/><span className="settings-about-link-label">{t('Report an issue', '反馈')}</span></a></Button>
        </nav>
      </section>
      <footer className="settings-about-legal">
        <a href="https://github.com/niu-io/niu/blob/main/THIRD-PARTY-NOTICES.md" target="_blank" rel="noopener noreferrer"><IconCopyright size={14} aria-hidden="true"/>{t('Third-party notices', '第三方声明')}</a>
      </footer>
    </section>}
    {section === 'appearance' && <section aria-label={uiT("Appearance preferences")} className="settings-section-group">
      <section className="settings-section">
        <div className="settings-row">
          <div><h3>{t('Color mode', '颜色模式')}</h3><p>{personal ? t('Saved to your account. System follows your device’s appearance.', '保存到账户；系统模式跟随设备。') : t('System follows your device’s appearance.', '系统模式跟随设备。')}</p></div>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label={uiT("Color mode")} disabled={context.appearance?.ready === false}>{theme === 'light' ? <IconSun/> : theme === 'dark' ? <IconMoon/> : <IconDeviceDesktop/>}{themeLabel}<IconChevronDown/></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={theme} onValueChange={value => saveTheme(value as Theme)}>
              <DropdownMenuRadioItem value="system"><IconDeviceDesktop/>{t('System', '系统')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="light"><IconSun/>{t('Light', '浅色')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark"><IconMoon/>{t('Dark', '深色')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup></DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-row">
          <div><h3>{t('Language', '语言')}</h3><p>{t('Choose the interface language for this browser.', '仅用于此浏览器。')}</p></div>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label={uiT("Language")}><IconLanguage/>{locale === 'zh-CN' ? '简体中文' : 'English'}<IconChevronDown/></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={locale} onValueChange={value => setLocale(value as Locale)}>
              <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup></DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>
      {context.appearance?.saving && <p role="status">{t('Saving color mode…', '保存中…')}</p>}
      {context.appearance?.error && <div role="alert" className="grid justify-items-start gap-2"><p>{uiT(context.appearance.error)}</p><Button variant="outline" onClick={context.appearance.reload}>{t('Reload color mode', '重新加载')}</Button></div>}
    </section>}
    {['billing', 'payments'].includes(section) && context.organization && <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"><span>{organizationDisplayName(context.organization.name)} · {t('Shared across workspaces', '跨工作空间共享')}</span>{context.workspace && <Link className="underline underline-offset-4 hover:text-foreground" to={`/workspaces/${encodeURIComponent(workspacePathSegment(context.workspace, context.workspaces))}/billing`}>{t('View workspace billing', '工作空间计费')}</Link>}</p>}
    {['billing', 'payments'].includes(section) && (canViewBilling
      ? context.organization
        ? <AccountBilling section="all" key={context.token + context.organization.id} token={context.token} organization={context.organization.id} canConfigure={Boolean(context.session?.permissions?.write)}/>
        : context.workspaceLoading
          ? <MetricStripSkeleton count={2} label={t('Loading billing account…', '加载账户…')} />
          : <div role="alert" className="space-y-3"><p>{t('Could not load your billing account.', '无法加载账户。')}</p><Button variant="secondary" onClick={context.reloadWorkspaces}>{t('Retry', '重试')}</Button></div>
      : <p className="text-muted-foreground">{t('Only organization owners and administrators can manage shared credits. Contact your organization owner to add credits.', '仅组织所有者与管理员可管理额度。')}</p>)}
  </div>;
}


export { SettingsNavigation, settingsNavigationEntries } from './settings-navigation';
