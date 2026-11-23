import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/PageHeader';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { WorkspaceCreateDialog, OrganizationCreateDialog } from '@/shell/WorkspaceSwitcher';
import type { DashboardContext } from '@/shell/dashboard-context';
import ConnectGate from '@/shell/ConnectGate';
import { prefetchRouteIntent } from '@/shell/prefetch';
import { organizationDisplayName, workspaceDisplayName, workspacePathSegment } from '@/shell/workspace-route';
import { settingsHref } from '@/features/account/settings-routes';
import { useLocale, useLocale as useUILocale } from '@/shell/ui-locale';
import { IconArrowLeft, IconBuildings, IconPencil, IconPlus, IconSettings, IconUsers } from '@tabler/icons-react';
import { useRef, useState, type FormEvent } from 'react';
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
  const [subview, setSubview] = useState<'workspace' | 'organization' | 'rename' | 'join' | null>(null);
  const subviewTrigger = useRef<HTMLButtonElement | null>(null);
  const organizationTrigger = useRef<HTMLButtonElement>(null);
  function closeSubview() {
    setSubview(null);
    requestAnimationFrame(() => {
      const trigger = subviewTrigger.current;
      (trigger?.isConnected ? trigger : organizationTrigger.current)?.focus();
    });
  }
  function closeCreation(open: boolean) {
    if (open) return;
    closeSubview();
  }
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
      closeSubview();
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
      closeSubview();
    } catch (error) {
      setJoinError(error instanceof Error && error.message ? error.message : t('Could not join organization.', '无法加入该组织。'));
    } finally {
      setJoining(false);
    }
  }

  return <div className="organization-settings w-full min-w-0 space-y-4">
    <PageHeader
      title={t('Organization', '组织')}
      action={!subview && context.createOrganization ? (
        <Button ref={organizationTrigger} variant="outline" size="sm" onClick={event => { subviewTrigger.current = event.currentTarget; setSubview('organization'); }}>
          <IconBuildings size={16} />
          {t('Create organization', '创建组织')}
        </Button>
      ) : undefined}
    />
    <div hidden={Boolean(subview)} className="space-y-4">
    {!organization && context.workspaceLoading ? <FormSectionSkeleton fields={2} label={t('Loading organization…', '正在加载组织…')} /> : !organization ? <Empty><EmptyHeader><EmptyMedia variant="icon"><IconBuildings size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("No organization is available. Create a workspace to get started.")}</EmptyDescription></EmptyHeader></Empty> : <>
      <section className="space-y-4 rounded-[var(--radius-panel)] bg-card p-5" aria-labelledby="organization-details-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="organization-details-title" className="text-base font-semibold">{uiT("General")}</h2>
          {canCreate && context.renameOrganization && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={event => {
                subviewTrigger.current = event.currentTarget;
                setNameDraft(organization.name);
                setRenameError('');
                setRenameSaved(false);
                setSubview('rename');
              }}
            >
              <IconPencil size={15} aria-hidden="true" />
              {t('Rename', '重命名')}
            </Button>
          )}
        </div>
        <dl className="organization-details">
          <div><dt>{uiT("Organization name")}</dt><dd>{organizationDisplayName(organization.name)}</dd></div>
          {organization.slug ? <div><dt>{t('URL slug', '路径标识')}</dt><dd className="text-sm">{organization.slug}</dd></div> : null}
        </dl>
        {renameSaved ? <p role="status" className="text-sm text-muted-foreground">{t('Organization name saved.', '组织名称已保存。')}</p> : null}
      </section>
      <section className="space-y-4 rounded-[var(--radius-panel)] bg-card p-5" aria-labelledby="organization-workspaces-title">
        <div className="organization-section-heading"><div><h2 id="organization-workspaces-title" className="text-base font-semibold">{uiT("Workspaces")}</h2></div>{canCreate && entries.length > 0 && <Button variant="outline" size="sm" onClick={event => { subviewTrigger.current = event.currentTarget; setSubview('workspace'); }}><IconPlus size={16} />{uiT("Create workspace")}</Button>}</div>
        {entries.length ? <ul className="organization-workspaces">{entries.map(item => { const seg = workspacePathSegment(item, workspaces); const overviewTo = `/workspaces/${seg}`; const settingsTo = `/workspaces/${seg}/settings`; const membersTo = `${settingsHref('members')}?workspace=${encodeURIComponent(seg)}`; return <li key={item.id} className="flex items-center gap-2"><Link className="min-w-0 flex-1" to={overviewTo} onMouseEnter={() => prefetchRouteIntent(overviewTo)} onFocus={() => prefetchRouteIntent(overviewTo)}><span>{workspaceDisplayName(item.name)}</span></Link><Button asChild variant="ghost" size="icon"><Link to={settingsTo} onMouseEnter={() => prefetchRouteIntent(settingsTo)} onFocus={() => prefetchRouteIntent(settingsTo)} aria-label={uiF("Settings for {0}", [workspaceDisplayName(item.name)])} title={uiF("Settings for {0}", [workspaceDisplayName(item.name)])}><IconSettings size={16}/></Link></Button>{canManageMembers && <Button asChild variant="ghost" size="icon"><Link replace to={membersTo} onMouseEnter={() => prefetchRouteIntent(membersTo)} onFocus={() => prefetchRouteIntent(membersTo)} aria-label={uiF("Members for {0}", [workspaceDisplayName(item.name)])} title={uiF("Members for {0}", [workspaceDisplayName(item.name)])}><IconUsers size={16} /></Link></Button>}</li>; })}</ul> : <Empty className="min-h-36 py-6"><EmptyHeader><EmptyMedia variant="icon"><IconBuildings size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("No workspaces yet.")}</EmptyDescription></EmptyHeader>{canCreate && <EmptyContent><Button variant="outline" onClick={event => { subviewTrigger.current = event.currentTarget; setSubview('workspace'); }}><IconPlus size={16} />{uiT("Create workspace")}</Button></EmptyContent>}</Empty>}
      </section>
      {session?.kind === 'operator' && context.joinOrganization && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-panel)] bg-card p-5" aria-labelledby="organization-join-title">
          <div className="min-w-0 space-y-1">
            <h2 id="organization-join-title" className="text-base font-semibold">{t('Join an existing organization', '加入已有组织')}</h2>
            <p className="text-sm text-muted-foreground">
              {t(
                'Standard invitation links open directly without a token. Use a member access token only when issued directly by an organization owner.',
                '通过邀请链接加入时无需令牌。仅在组织所有者直接签发成员访问令牌时使用。',
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={event => {
              subviewTrigger.current = event.currentTarget;
              setJoinToken('');
              setJoinError('');
              setSubview('join');
            }}
          >
            {t('Join with token', '使用令牌加入')}
          </Button>
        </section>
      )}
    </>}
    </div>
    {subview === 'rename' && organization && (
      <section className="space-y-4" aria-labelledby="organization-rename-title">
        <Button type="button" variant="ghost" size="sm" data-settings-back disabled={renaming} onClick={() => { setRenameError(''); closeSubview(); }}>
          <IconArrowLeft size={16} aria-hidden="true" />
          {t('Back to Organization', '返回组织设置')}
        </Button>
        <header className="space-y-1">
          <h3 id="organization-rename-title" className="text-base font-semibold">{t('Rename organization', '重命名组织')}</h3>
          <p className="text-sm text-muted-foreground">{t('Update the display name for this organization. Its URL slug remains unchanged.', '更新此组织的显示名称，路径标识将保持不变。')}</p>
        </header>
        <form className="grid max-w-md gap-4" onSubmit={handleRename}>
          <div className="grid gap-1.5">
            <Label htmlFor="organization-rename-name">{t('Organization name', '组织名称')}</Label>
            <Input
              id="organization-rename-name"
              autoFocus
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
          {renameError ? <p role="alert" className="text-sm text-destructive">{uiT(renameError)}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={renaming} onClick={() => { setRenameError(''); closeSubview(); }}>
              {t('Cancel', '取消')}
            </Button>
            <Button
              type="submit"
              disabled={renaming || !nameDraft.trim() || nameDraft.trim() === organization.name}
            >
              {renaming ? t('Saving…', '保存中…') : t('Save name', '保存名称')}
            </Button>
          </div>
        </form>
      </section>
    )}
    {subview === 'join' && (
      <section className="space-y-4" aria-labelledby="organization-join-subview-title">
        <Button type="button" variant="ghost" size="sm" data-settings-back disabled={joining} onClick={() => { setJoinToken(''); setJoinError(''); closeSubview(); }}>
          <IconArrowLeft size={16} aria-hidden="true" />
          {t('Back to Organization', '返回组织设置')}
        </Button>
        <header className="space-y-1">
          <h3 id="organization-join-subview-title" className="text-base font-semibold">{t('Join an existing organization', '加入已有组织')}</h3>
          <p className="text-sm text-muted-foreground">
            {t(
              'Paste the member access token issued directly by an organization owner to link that organization to your account.',
              '粘贴组织所有者直接签发的成员访问令牌，将该组织关联至您的账户。',
            )}
          </p>
        </header>
        <form className="grid max-w-md gap-4" onSubmit={handleJoinOrganization}>
          <div className="grid gap-1.5">
            <Label htmlFor="organization-join-token">{t('Member access token', '成员访问令牌')}</Label>
            <Input
              id="organization-join-token"
              type="password"
              autoFocus
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
          {joinError ? <p role="alert" className="text-sm text-destructive">{uiT(joinError)}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={joining} onClick={() => { setJoinToken(''); setJoinError(''); closeSubview(); }}>
              {t('Cancel', '取消')}
            </Button>
            <Button type="submit" disabled={joining || !joinToken.trim()}>
              {joining ? t('Joining…', '正在加入…') : t('Join organization', '加入组织')}
            </Button>
          </div>
        </form>
      </section>
    )}
    <WorkspaceCreateDialog withinSettings context={context} open={subview === 'workspace'} onOpenChange={closeCreation}/>
    <OrganizationCreateDialog withinSettings context={context} open={subview === 'organization'} onOpenChange={closeCreation}/>
  </div>;
}

export default function OrganizationSettingsRoute() {
  return <ConnectGate>{context => <OrganizationSettings key={context.organization?.id} context={context} />}</ConnectGate>;
}
