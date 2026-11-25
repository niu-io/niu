import { translateUI } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { workspaceDisplayName } from '@/shell/workspace-route';
import { useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconBan as Ban, IconChevronDown as ChevronDown, IconKey as KeyRound, IconLoader2 as Loader2, IconPencil } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ListRowsSkeleton, TableSkeleton } from '@/components/PageSkeletons';
import { AdminRequestError, formatExpiry, type NamedResource, type Operator, type OperatorAuditEvent, type OperatorSession } from '../api';
import type { ConfirmTarget, CredentialView } from './operator-types';

const expiryChoices = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
];

function roleLabel(role: Operator['role'], uiT: (en: string, zh?: string) => string) {
  if (role === 'admin') return uiT('Admin', '管理员');
  if (role === 'owner') return uiT('Owner', '所有者');
  return uiT('Viewer', '查看者');
}

function displayScope(operator: Operator, organizations: NamedResource[], projects: NamedResource[]) {
  const organization = organizations.find(item => item.id === operator.organization_id)?.name ?? translateUI('Organization');
  if (!operator.project_id) return organization + ' · ' + translateUI('all workspaces');
  const workspace = projects.find(item => item.id === operator.project_id)?.name ?? translateUI('Workspace');
  return organization + ' · ' + workspaceDisplayName(workspace);
}

type SessionStatus = 'revoked' | 'expired' | 'active';

function sessionStatus(session: OperatorSession): SessionStatus {
  if (session.revoked) return 'revoked';
  if (session.expires_at_unix * 1000 <= Date.now()) return 'expired';
  return 'active';
}

function expiryStateLabel(status: SessionStatus) {
  if (status === 'revoked') return translateUI('Revoked');
  if (status === 'expired') return translateUI('Expired');
  return translateUI('Active');
}

function activityLabel(action: string) {
  switch (action) {
    case 'role_changed': return translateUI('Role changed');
    case 'operator_created': return translateUI('User added');
    case 'session_created': return translateUI('Access token created');
    case 'session_revoked': return translateUI('Session revoked');
    case 'operator_revoked': return translateUI('User access revoked');
    default: return action.replaceAll('_', ' ');
  }
}

type OperatorDetailsProps = {
  operator: Operator | null;
  organizations: NamedResource[];
  projects: NamedResource[];
  sessions: OperatorSession[];
  sessionsLoading: boolean;
  events: OperatorAuditEvent[];
  eventsLoading: boolean;
  hasMoreEvents: boolean;
  busy: boolean;
  credential: CredentialView | null;
  confirmTarget: ConfirmTarget;
  canChangeRole: boolean;
  roleOpening?: boolean;
  roleOpenError?: string;
  onRetryRoleOpen?: () => void;
  roleRefreshError: string;
  onSaveRole: (role: Operator['role'], expectedRole: Operator['role']) => Promise<Operator>;
  onReloadRole: () => Promise<Operator>;
  onDismissCredential: () => void;
  onIssueSession: (expiresInSeconds: number) => void;
  onConfirm: (target: ConfirmTarget) => void;
  onRevokeSession: (sessionId: string) => void;
  onRevokeOperator: () => void;
  onLoadMoreEvents: () => void;
  onSubviewChange?: (active: boolean) => void;
};

export default function OperatorDetails({ operator, organizations, projects, sessions, sessionsLoading, events, eventsLoading, hasMoreEvents, busy, credential, confirmTarget, canChangeRole, roleOpening = false, roleOpenError = '', onRetryRoleOpen, roleRefreshError, onSaveRole, onReloadRole, onDismissCredential, onIssueSession, onConfirm, onRevokeSession, onRevokeOperator, onLoadMoreEvents, onSubviewChange }: OperatorDetailsProps) {
  const { t: uiT } = useUILocale();
  const [draftRole, setDraftRole] = useState<Operator['role']>(operator?.role ?? 'viewer');
  const [expectedRole, setExpectedRole] = useState<Operator['role']>(operator?.role ?? 'viewer');
  const [roleLocked, setRoleLocked] = useState(false);
  const [roleMessage, setRoleMessage] = useState('');
  const [roleBusy, setRoleBusy] = useState(false);
  const wasRoleOpening = useRef(roleOpening);
  useEffect(() => {
    if (wasRoleOpening.current && !roleOpening && !roleOpenError && operator) {
      setExpectedRole(operator.role);
      setDraftRole(operator.role);
    }
    wasRoleOpening.current = roleOpening;
  }, [roleOpening, roleOpenError, operator?.role]);
  const roleUnavailable = roleOpening || Boolean(roleOpenError);
  const roleConflict = !roleUnavailable && (roleLocked || Boolean(operator && operator.role !== expectedRole));
  async function saveRole(): Promise<boolean> {
    if (busy || roleBusy || roleUnavailable || roleConflict || !canChangeRole || draftRole === expectedRole) return false;
    setRoleBusy(true);
    setRoleMessage('');
    try {
      const saved = await onSaveRole(draftRole, expectedRole);
      setExpectedRole(saved.role);
      setDraftRole(saved.role);
      setRoleLocked(false);
      setRoleMessage('Role saved.');
      return true;
    } catch (reason) {
      setRoleLocked(true);
      setRoleMessage(reason instanceof AdminRequestError
        ? reason.status === 409 ? 'The role could not be saved against the current state. Reload the saved role before saving again.' : reason.message
        : 'The save could not be confirmed. Reload the saved role before saving again.');
      return false;
    } finally { setRoleBusy(false); }
  }
  async function reloadRole() {
    if (busy || roleBusy) return;
    setRoleBusy(true);
    try {
      const saved = await onReloadRole();
      setExpectedRole(saved.role);
      setRoleLocked(false);
      setRoleMessage(uiT('Saved role reloaded. Review your choice before saving.'));
    } catch (reason) {
      setRoleLocked(true);
      setRoleMessage(uiT('Could not reload the saved role. Your choice is retained.') + ' ' + uiT(reason instanceof Error ? reason.message : 'Try again.'));
    } finally { setRoleBusy(false); }
  }
  const [expiryDays, setExpiryDays] = useState(30);
  const [expandedHistoryFor, setExpandedHistoryFor] = useState<string | null>(null);
  const [tokenCopy, setTokenCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [subview, setSubview] = useState<'role' | 'token' | null>(null);
  const subviewTriggerRef = useRef<HTMLButtonElement | null>(null);

  function closeSubview() {
    setSubview(null);
    onConfirm(null);
    requestAnimationFrame(() => {
      if (subviewTriggerRef.current?.isConnected) {
        subviewTriggerRef.current.focus();
      }
    });
  }

  if (!operator) return <section className="operator-detail" aria-labelledby="operator-detail-title">
    <div className="operator-detail-empty"><span className="operator-empty-icon"><KeyRound size={18} /></span><h2 id="operator-detail-title">{uiT("Select a member", "选择一位成员")}</h2><p>{uiT("Review their role, create an access token, or revoke their access.")}</p></div>
  </section>;

  const activeSessions = sessions.filter(item => sessionStatus(item) === 'active');
  const pastSessions = sessions.filter(item => sessionStatus(item) !== 'active');
  const historyExpanded = expandedHistoryFor === operator.id;
  const visibleSessions = historyExpanded ? [...activeSessions, ...pastSessions] : activeSessions;
  const confirmSession = confirmTarget?.kind === 'session' ? sessions.find(item => item.id === confirmTarget.id) ?? null : null;
  const confirmOperatorRevoke = confirmTarget?.kind === 'operator' && confirmTarget.id === operator.id;
  const activeSubview = confirmSession ? 'revoke-session' : confirmOperatorRevoke ? 'revoke-operator' : subview;
  const onSubviewChangeRef = useRef(onSubviewChange);
  onSubviewChangeRef.current = onSubviewChange;
  useEffect(() => {
    onSubviewChangeRef.current?.(Boolean(activeSubview));
    return () => onSubviewChangeRef.current?.(false);
  }, [activeSubview]);

  return <section className="operator-detail" aria-labelledby="operator-detail-title">
    <div hidden={Boolean(activeSubview)}>
    <div className="operator-detail-heading">
      <span className="operator-detail-avatar">{operator.name.trim().charAt(0).toUpperCase() || 'O'}</span>
      <div className="operator-detail-copy"><p className="eyebrow">{uiT("MEMBER", "成员")}</p><h2 className="scroll-mt-20" id="operator-detail-title">{operator.name}</h2><p>{displayScope(operator, organizations, projects)}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={'operator-role-chip role-' + operator.role}>{roleLabel(operator.role, uiT)}</span>
        {canChangeRole && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || roleBusy}
            onClick={event => {
              subviewTriggerRef.current = event.currentTarget;
              setRoleMessage('');
              setSubview('role');
            }}
          >
            <IconPencil size={14} aria-hidden="true" />
            {uiT("Change role", "修改角色")}
          </Button>
        )}
      </div>
    </div>
    <p className="operator-scope-footnote px-4">{uiT({ viewer: 'Can read workspace data. Cannot change settings or manage user access.', admin: 'Can read and change workspace data. Cannot manage user access.', owner: 'Can read and change workspace data, add users, and revoke access.' }[operator.role])}{!operator.project_id && operator.role !== 'viewer' && <> {uiT("This organization-wide role can access organization billing and shared funds.", "此组织级角色可以访问组织账单及共享资金。")}</>}</p>
    {roleMessage && !roleConflict && !activeSubview && (
      <p className="px-4 pt-2 text-sm text-muted-foreground" role="status">{uiT(roleMessage)}</p>
    )}
    {credential?.operatorId === operator.id && <section className="operator-credential" aria-labelledby="operator-credential-title" role="status">
      <div className="operator-credential-title"><span><KeyRound size={16} /></span><div><h3 id="operator-credential-title">{uiT("Save this user’s access token")}</h3><p>{uiT("Shown once · expires")}{" "}{formatExpiry(credential.session.expires_at_unix)}{uiT(". Share it securely with this user. It grants management API and CLI access, not model API access or browser sign-in. For browser sign-in, use email and password or an invitation link; existing Niu users can link this organization in Organization settings → Join an organization.", "。请安全地分享给该用户。它仅用于管理 API 与 CLI 认证，不用于模型 API 调用或浏览器登录。浏览器登录请使用邮箱与密码或邀请链接；已有 Niu 账户的用户可在“组织设置 → 加入组织”中绑定该组织。")}</p></div></div>
      <Label htmlFor="new-operator-token">{uiT("Access token")}<Input id="new-operator-token" className="mono operator-token-input" readOnly value={credential.token} onFocus={event => event.target.select()} /></Label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => {
          void navigator.clipboard?.writeText(credential.token)
            .then(() => setTokenCopy('copied'))
            .catch(() => setTokenCopy('failed'));
        }}>{tokenCopy === 'copied' ? uiT("Copied") : uiT("Copy token")}</Button>
        <Button type="button" variant="outline" onClick={onDismissCredential}>{uiT("Done — hide token")}</Button>
        {tokenCopy === 'failed' && <span role="alert" className="text-sm text-destructive">{uiT("Copy failed. Select the token and copy it manually.")}</span>}
      </div>
    </section>}
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div><h3 className="text-sm font-medium">{uiT("Access sessions")}</h3><p className="mt-1 text-sm text-muted-foreground">{uiT("Revoking a session leaves this user’s other sessions active.")}</p></div>
      {operator.revoked
        ? <span className="operator-revoked-note">{uiT("User access revoked")}</span>
        : <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={event => {
              subviewTriggerRef.current = event.currentTarget;
              setSubview('token');
            }}
          >
            <KeyRound size={14} />{uiT("Create access token")}
          </Button>}
    </div>
    <div className="operator-session-table">
      {sessionsLoading
        ? <TableSkeleton columns={4} rows={3} label={uiT("Loading sessions…")} />
        : sessions.length === 0
          ? <div className="operator-session-empty">{uiT("This user has no access sessions. Create an access token to let them connect.")}</div>
          : <>{activeSessions.length === 0 && <div className="operator-session-empty">{uiT("No active sessions.", "没有有效的访问会话。")}</div>}{pastSessions.length > 0 && <Button type="button" variant="ghost" size="sm" aria-expanded={historyExpanded} onClick={() => setExpandedHistoryFor(historyExpanded ? null : operator.id)}>{historyExpanded ? uiT("Hide past sessions", "隐藏历史会话") : uiT("Show past sessions", "显示历史会话")} ({pastSessions.length})<ChevronDown aria-hidden="true" className={historyExpanded ? 'rotate-180' : ''} /></Button>}{visibleSessions.length > 0 && <div className="table-wrap"><Table>
            <TableHeader><TableRow><TableHead>{uiT("Created")}</TableHead><TableHead className="hidden sm:table-cell">{uiT("Expires")}</TableHead><TableHead className="hidden sm:table-cell">{uiT("Status")}</TableHead><TableHead className="w-28"><span className="sr-only">{uiT("Actions")}</span></TableHead></TableRow></TableHeader>
            <TableBody>{visibleSessions.map(item => {
              const status = sessionStatus(item);
              const stateLabel = expiryStateLabel(status);
              return <TableRow key={item.id}>
                <TableCell>{new Date(item.created_at).toLocaleString(readUILocale())}<dl className="mt-2 space-y-2 sm:hidden"><div><dt className="text-xs text-muted-foreground">{uiT("Expires")}</dt><dd>{formatExpiry(item.expires_at_unix)}</dd></div><div><dt className="text-xs text-muted-foreground">{uiT("Status")}</dt><dd><span className={'operator-session-state state-' + status}>{stateLabel}</span></dd></div></dl></TableCell>
                <TableCell className="hidden sm:table-cell">{formatExpiry(item.expires_at_unix)}</TableCell>
                <TableCell className="hidden sm:table-cell"><span className={'operator-session-state state-' + status}>{stateLabel}</span></TableCell>
                <TableCell>{status === 'active' && !operator.revoked
                  ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={event => { subviewTriggerRef.current = event.currentTarget; onConfirm({ kind: 'session', id: item.id }); }}><Ban size={14} />{uiT("Revoke")}</Button>
                  : <span className="operator-no-action">—</span>}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table></div>}</>}
    </div>
    <section className="operator-activity" aria-labelledby="operator-activity-title">
      <div className="operator-activity-heading"><div><h3 id="operator-activity-title">{uiT("Recent access activity")}</h3></div>{hasMoreEvents && <Button type="button" variant="ghost" size="sm" disabled={eventsLoading} onClick={onLoadMoreEvents}>{eventsLoading ? uiT("Loading…") : uiT("Load older")}</Button>}</div>
      {events.length === 0
        ? (eventsLoading
          ? <ListRowsSkeleton rows={3} label={uiT("Loading activity…")} />
          : <div className="operator-activity-empty">{uiT("No activity recorded yet.")}</div>)
        : <ol className="operator-activity-list">{events.map(event => {
          const actor = event.actor_kind === 'installation'
            ? uiT("Installation owner")
            : event.actor_operator_id === operator.id ? operator.name : uiT("Workspace user");
          return <li key={event.id}>
            <span className="operator-activity-mark" aria-hidden="true" />
            <div className="operator-activity-copy"><strong>{activityLabel(event.action)}{event.action === 'role_changed' && event.before_role && event.after_role ? ' · ' + roleLabel(event.before_role, uiT) + ' → ' + roleLabel(event.after_role, uiT) : ''}</strong><small>{uiT("By")}{" "}{actor}</small></div>
            <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString(readUILocale())}</time>
          </li>;
        })}</ol>}
      {eventsLoading && events.length > 0 && <p className="operator-activity-loading" role="status">{uiT("Loading older activity…")}</p>}
    </section>
    <div className="operator-revoke-row flex-wrap">
      <div><strong>{uiT("Revoke user access")}</strong><p>{operator.project_id ? uiT("This user will lose access to this workspace. All of their access sessions will be revoked.") : uiT("This user will lose access to every workspace in the organization. All of their access sessions will be revoked.")}</p></div>
      {operator.revoked
        ? <span className="operator-revoked-note">{uiT("Access revoked")}</span>
        : <Button type="button" variant="destructive" disabled={busy} onClick={event => { subviewTriggerRef.current = event.currentTarget; onConfirm({ kind: 'operator', id: operator.id }); }}><Ban size={14} />{uiT("Revoke access")}</Button>}
    </div>
    </div>

    {activeSubview === 'role' && canChangeRole && (
      <section className="space-y-4 py-2" aria-labelledby="operator-role-subview-title">
        <Button type="button" variant="ghost" size="sm" data-settings-back disabled={busy || roleBusy} onClick={closeSubview}>
          <IconArrowLeft size={16} aria-hidden="true" />
          {uiT("Back to member", "返回成员详情")}
        </Button>
        <header className="space-y-1">
          <h3 id="operator-role-subview-title" className="text-base font-semibold">{uiT("Change role", "修改角色")}</h3>
          <p className="text-sm text-muted-foreground">{operator.name} · {displayScope(operator, organizations, projects)}</p>
        </header>
        <div className="grid max-w-md gap-4">
          <div className="grid gap-2">
            <Label htmlFor="operator-role">{uiT("Role")}</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button id="operator-role" variant="outline" size="sm" aria-busy={roleOpening || undefined} className="justify-between font-normal" disabled={busy || roleBusy || roleUnavailable || roleConflict}>
                  {roleOpening ? <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 size={14} className="animate-spin" aria-hidden="true" />{uiT("Loading the saved role…")}</span> : roleLabel(draftRole, uiT)}
                  <ChevronDown size={16} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup value={draftRole} onValueChange={value => setDraftRole(value as Operator['role'])}>
                  <DropdownMenuRadioItem value="viewer">{uiT("Viewer · read workspace data")}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="admin">{uiT("Admin · change workspace data")}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="owner">{uiT("Owner · manage user access")}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {roleOpenError && <p className="text-sm text-destructive" role="alert">{uiT(roleOpenError)}</p>}
          {!operator.project_id && draftRole !== 'viewer' && draftRole !== operator.role && (
            <p className="text-sm text-muted-foreground">{uiT("This organization-wide role can access organization billing and shared funds.", "此组织级角色可以访问组织账单及共享资金。")}</p>
          )}
          {roleRefreshError && <p className="text-sm text-muted-foreground" role="status">{uiT(roleRefreshError)}</p>}
          {(roleMessage || roleConflict) && (
            <p className="text-sm text-muted-foreground" role={roleConflict ? 'alert' : 'status'}>{uiT(roleMessage) || uiT("The saved role changed. Reload it before saving again.")}</p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy || roleBusy} onClick={closeSubview}>{uiT("Cancel")}</Button>
            {roleOpenError && onRetryRoleOpen && <Button size="sm" variant="outline" disabled={busy || roleBusy} onClick={onRetryRoleOpen}>{uiT("Reload saved role")}</Button>}
            {!roleOpenError && (roleConflict || roleMessage) && <Button size="sm" variant="outline" disabled={busy || roleBusy} onClick={() => void reloadRole()}>{uiT("Reload saved role")}</Button>}
            <Button
              size="sm"
              disabled={busy || roleBusy || roleUnavailable || roleConflict || draftRole === expectedRole}
              onClick={() => void saveRole().then(ok => { if (ok) closeSubview(); })}
            >
              {uiT("Save role")}
            </Button>
          </div>
        </div>
      </section>
    )}

    {activeSubview === 'token' && !operator.revoked && (
      <section className="space-y-4 py-2" aria-labelledby="operator-token-subview-title">
        <Button type="button" variant="ghost" size="sm" data-settings-back disabled={busy} onClick={closeSubview}>
          <IconArrowLeft size={16} aria-hidden="true" />
          {uiT("Back to member", "返回成员详情")}
        </Button>
        <header className="space-y-1">
          <h3 id="operator-token-subview-title" className="text-base font-semibold">{uiT("Create access token")}</h3>
          <p className="text-sm text-muted-foreground">
            {uiT("Choose how long the new management API and CLI access token remains valid.", "选择新创建的管理 API 与 CLI 访问令牌的有效期。")}
          </p>
        </header>
        <div className="grid max-w-md gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-session-expiry">{uiT("Expires in")}</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button id="new-session-expiry" type="button" variant="outline" size="sm" className="w-full justify-between font-normal" disabled={busy}>
                  {uiT(expiryChoices.find(item => item.days === expiryDays)?.label ?? "")}
                  <ChevronDown size={16} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                <DropdownMenuRadioGroup value={String(expiryDays)} onValueChange={value => setExpiryDays(Number(value))}>
                  {expiryChoices.map(item => <DropdownMenuRadioItem key={item.days} value={String(item.days)}>{uiT(item.label)}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={closeSubview}>{uiT("Cancel")}</Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => {
                setSubview(null);
                onIssueSession(expiryDays * 86400);
              }}
            >
              <KeyRound size={14} />{uiT("Issue access token", "签发访问令牌")}
            </Button>
          </div>
        </div>
      </section>
    )}

    {activeSubview === 'revoke-session' && confirmSession && (
      <section className="space-y-4 py-2" aria-labelledby="operator-revoke-session-title">
        <Button type="button" variant="ghost" size="sm" data-settings-back disabled={busy} onClick={closeSubview}>
          <IconArrowLeft size={16} aria-hidden="true" />
          {uiT("Back to member", "返回成员详情")}
        </Button>
        <header className="space-y-1">
          <h3 id="operator-revoke-session-title" className="text-base font-semibold">{uiT("Revoke access session?", "确定撤销此访问会话？")}</h3>
          <p className="text-sm text-muted-foreground">{uiT("This session will stop working immediately. This user’s other sessions remain active.", "此会话将立即失效，该用户的其他会话不受影响。")}</p>
        </header>
        <dl className="grid max-w-md gap-2 rounded-lg bg-muted/40 p-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{uiT("Created")}</dt><dd>{new Date(confirmSession.created_at).toLocaleString(readUILocale())}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{uiT("Expires")}</dt><dd>{formatExpiry(confirmSession.expires_at_unix)}</dd></div>
        </dl>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={closeSubview}>{uiT("Cancel")}</Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => onRevokeSession(confirmSession.id)}>{uiT("Confirm revoke")}</Button>
        </div>
      </section>
    )}

    {activeSubview === 'revoke-operator' && (
      <section className="space-y-4 py-2" aria-labelledby="operator-revoke-user-title">
        <Button type="button" variant="ghost" size="sm" data-settings-back disabled={busy} onClick={closeSubview}>
          <IconArrowLeft size={16} aria-hidden="true" />
          {uiT("Back to member", "返回成员详情")}
        </Button>
        <header className="space-y-1">
          <h3 id="operator-revoke-user-title" className="text-base font-semibold">{uiT("Revoke user access")}</h3>
          <p className="text-sm text-muted-foreground">
            {operator.project_id
              ? uiT("This user will lose access to this workspace. All of their access sessions will be revoked.")
              : uiT("This user will lose access to every workspace in the organization. All of their access sessions will be revoked.")}
          </p>
        </header>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={closeSubview}>{uiT("Cancel")}</Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={onRevokeOperator}>{uiT("Confirm revoke user access")}</Button>
        </div>
      </section>
    )}
  </section>;
}
