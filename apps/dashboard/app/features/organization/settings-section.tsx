import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkspaceCreateDialog } from '@/shell/WorkspaceSwitcher';
import type { DashboardContext } from '@/shell/dashboard-context';
import ConnectGate from '@/shell/ConnectGate';
import { prefetchRouteIntent } from '@/shell/prefetch';
import { workspaceDisplayName, workspacePathSegment } from '@/shell/workspace-route';
import { settingsHref } from '@/features/account/settings-routes';
import { useLocale, useLocale as useUILocale } from '@/shell/ui-locale';
import { IconBuildings, IconPlus, IconSettings, IconUsers } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

/**
 * Canonical organization general settings. Member management and shared
 * credits remain dedicated Settings sections; this page links to them rather
 * than mounting a second copy of either management surface.
 */
export function OrganizationSettings({ context }: { context: DashboardContext }) {
  const { t: uiT, format: uiF } = useUILocale();
  const { t } = useLocale();
  const { organization, workspaces, session } = context;
  const [createOpen, setCreateOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(organization?.name ?? '');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [renameSaved, setRenameSaved] = useState(false);
  const [joinToken, setJoinToken] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const entries = workspaces.filter(item => item.organization_id === organization?.id);
  const canCreate = Boolean(session?.permissions.write && (session.kind === 'installation' || session.operator?.project_id === null));
  const canManageMembers = Boolean(organization && session?.permissions?.manage_operators);
  const canViewBilling = session?.operating_mode !== 'internal';

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization || !context.renameOrganization || renaming) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setRenameError(t('Enter an organization name.', '请输入组织名称。'));
      return;
    }
    setRenaming(true);
    setRenameError('');
    setRenameSaved(false);
    try {
      await context.renameOrganization(organization, trimmed);
      setRenameSaved(true);
    } catch (error) {
      setRenameError(error instanceof Error && error.message ? error.message : t('Could not update organization name.', '无法更新组织名称。'));
    } finally {
      setRenaming(false);
    }
  }

  async function handleJoinOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context.joinOrganization || joining) return;
    const trimmed = joinToken.trim();
    if (!trimmed) {
      setJoinError(t('Enter a member access token.', '请输入成员访问令牌。'));
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      await context.joinOrganization(trimmed);
      setJoinToken('');
    } catch (error) {
      setJoinError(error instanceof Error && error.message ? error.message : t('Could not join organization.', '无法加入该组织。'));
    } finally {
      setJoining(false);
    }
  }

  return <div className="organization-settings w-full min-w-0 space-y-8">
    {context.openCreateOrganization && (
      <div className="flex justify-end">
        <Button variant="outline" onClick={context.openCreateOrganization}>
          <IconBuildings size={16} />
          {t('Create organization', '创建组织')}
        </Button>
      </div>
    )}
    {!organization ? <Empty><EmptyHeader><EmptyDescription>{uiT("No organization is available. Create a workspace to get started.")}</EmptyDescription></EmptyHeader></Empty> : <>
      <section className="organization-settings-card space-y-4" aria-labelledby="organization-details-title">
        <h2 id="organization-details-title">{uiT("General")}</h2>
        <dl className="organization-details">
          <div><dt>{uiT("Organization name")}</dt><dd>{organization.name}</dd></div>
          {organization.slug ? <div><dt>{t('URL slug', '路径标识')}</dt><dd className="font-mono text-sm">{organization.slug}</dd></div> : null}
        </dl>
        {canCreate && context.renameOrganization && (
          <form className="flex flex-wrap items-end gap-3 pt-2" onSubmit={handleRename}>
            <div className="grid min-w-64 flex-1 gap-1.5">
              <Label htmlFor="organization-rename-name">{t('Update organization name', '修改组织名称')}</Label>
              <Input
                id="organization-rename-name"
                value={nameDraft}
                maxLength={200}
                disabled={renaming}
                onChange={event => {
                  setNameDraft(event.target.value);
                  setRenameError('');
                  setRenameSaved(false);
                }}
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={renaming || !nameDraft.trim() || nameDraft.trim() === organization.name}
            >
              {renaming ? t('Saving…', '保存中…') : t('Save name', '保存名称')}
            </Button>
          </form>
        )}
        {renameError ? <p role="alert" className="text-sm text-destructive">{uiT(renameError)}</p> : null}
        {renameSaved ? <p role="status" className="text-sm text-muted-foreground">{t('Organization name saved.', '组织名称已保存。')}</p> : null}
      </section>
      <section className="organization-settings-card" aria-labelledby="organization-members-title">
        <div className="organization-section-heading">
          <div className="space-y-1">
            <h2 id="organization-members-title">{t('Members', '成员')}</h2>
            <p className="text-sm text-muted-foreground">
              {t(
                'Manage organization members, roles, and workspace access in Settings.',
                '在设置中管理组织成员、角色与工作空间访问权限。',
              )}
            </p>
          </div>
          {canManageMembers && (
            <Button asChild variant="outline">
              <Link
                to={settingsHref('members')}
                onMouseEnter={() => prefetchRouteIntent(settingsHref('members'))}
                onFocus={() => prefetchRouteIntent(settingsHref('members'))}
              >
                {t('Manage members', '管理成员')}
              </Link>
            </Button>
          )}
        </div>
      </section>
      {canViewBilling && (
        <section className="organization-settings-card" aria-labelledby="organization-billing-title">
          <div className="organization-section-heading">
            <div className="space-y-1">
              <h2 id="organization-billing-title">{t('Credits and billing', '额度与账单')}</h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  `Credits and billing belong to ${organization.name}, are shared across its workspaces, and remain isolated from other organizations. Newly created organizations start with zero balance and require top-up funding or configured payment and model supply before paid requests run.`,
                  `余额与账单归属于 ${organization.name}，并在其工作空间之间共享，与其他组织完全隔离。新创建的组织初始余额为零，发起付费请求前需先充值或配置支付与模型供应。`,
                )}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link
                to={settingsHref('billing')}
                onMouseEnter={() => prefetchRouteIntent(settingsHref('billing'))}
                onFocus={() => prefetchRouteIntent(settingsHref('billing'))}
              >
                {t('Manage credits', '管理额度')}
              </Link>
            </Button>
          </div>
        </section>
      )}
      <section className="organization-settings-card" aria-labelledby="organization-workspaces-title">
        <div className="organization-section-heading"><div><h2 id="organization-workspaces-title">{uiT("Workspaces")}</h2></div>{canCreate && <Button variant="outline" onClick={() => setCreateOpen(true)}><IconPlus size={16} />{uiT("Create workspace")}</Button>}</div>
        {entries.length ? <ul className="organization-workspaces">{entries.map(item => { const seg = workspacePathSegment(item, workspaces); const overviewTo = `/workspaces/${seg}`; const settingsTo = `/workspaces/${seg}/settings`; const membersTo = `${settingsHref('members')}?workspace=${encodeURIComponent(seg)}`; return <li key={item.id} className="flex items-center gap-2"><Link className="min-w-0 flex-1" to={overviewTo} onMouseEnter={() => prefetchRouteIntent(overviewTo)} onFocus={() => prefetchRouteIntent(overviewTo)}><span>{workspaceDisplayName(item.name)}</span></Link><Button asChild variant="ghost" size="icon"><Link to={settingsTo} onMouseEnter={() => prefetchRouteIntent(settingsTo)} onFocus={() => prefetchRouteIntent(settingsTo)} aria-label={uiF("Settings for {0}", [workspaceDisplayName(item.name)])} title={uiF("Settings for {0}", [workspaceDisplayName(item.name)])}><IconSettings size={16}/></Link></Button>{canManageMembers && <Button asChild variant="ghost" size="icon"><Link to={membersTo} onMouseEnter={() => prefetchRouteIntent(membersTo)} onFocus={() => prefetchRouteIntent(membersTo)} aria-label={uiF("Users for {0}", [workspaceDisplayName(item.name)])} title={uiF("Users for {0}", [workspaceDisplayName(item.name)])}><IconUsers size={16} /></Link></Button>}</li>; })}</ul> : <Empty className="min-h-40"><EmptyHeader><EmptyDescription>{uiT("No workspaces yet.")}</EmptyDescription></EmptyHeader></Empty>}
      </section>
      {session?.kind === 'operator' && context.joinOrganization && (
        <section className="organization-settings-card space-y-3" aria-labelledby="organization-join-title">
          <div className="space-y-1">
            <h2 id="organization-join-title">{t('Join an existing organization', '加入已有组织')}</h2>
            <p className="text-sm text-muted-foreground">
              {t(
                'Paste a member access token issued by an organization owner to link that organization to your account and switch to it.',
                '粘贴由组织所有者签发的成员访问令牌，将该组织关联到当前账户并切换过去。',
              )}
            </p>
          </div>
          <form className="flex flex-wrap items-end gap-3" onSubmit={handleJoinOrganization}>
            <div className="grid min-w-64 flex-1 gap-1.5">
              <Label htmlFor="organization-join-token">{t('Member access token', '成员访问令牌')}</Label>
              <Input
                id="organization-join-token"
                type="password"
                autoComplete="off"
                value={joinToken}
                disabled={joining}
                placeholder={t('Paste issued token', '粘贴签发的令牌')}
                onChange={event => {
                  setJoinToken(event.target.value);
                  setJoinError('');
                }}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={joining || !joinToken.trim()}>
              {joining ? t('Joining…', '正在加入…') : t('Join organization', '加入组织')}
            </Button>
          </form>
          {joinError ? <p role="alert" className="text-sm text-destructive">{uiT(joinError)}</p> : null}
        </section>
      )}
      <WorkspaceCreateDialog context={context} open={createOpen} onOpenChange={setCreateOpen}/>
    </>}
  </div>;
}

export default function OrganizationSettingsRoute() {
  return <ConnectGate>{context => <OrganizationSettings key={context.organization?.id} context={context} />}</ConnectGate>;
}
