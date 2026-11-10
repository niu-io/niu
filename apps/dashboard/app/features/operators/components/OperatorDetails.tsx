import { translateUI } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { workspaceDisplayName } from '@/shell/workspace-route';
import { useState } from 'react';
import { IconBan as Ban } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
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

function roleLabel(role: Operator['role']) {
  return translateUI(role[0].toUpperCase() + role.slice(1));
}

function displayScope(operator: Operator, organizations: NamedResource[], projects: NamedResource[]) {
  const organization = organizations.find(item => item.id === operator.organization_id)?.name ?? translateUI('Organization');
  if (!operator.project_id) return organization + ' · ' + translateUI('all workspaces');
  const workspace = projects.find(item => item.id === operator.project_id)?.name ?? translateUI('Workspace');
  return organization + ' · ' + workspaceDisplayName(workspace);
}

function expiryState(session: OperatorSession) {
  if (session.revoked) return translateUI('Revoked');
  if (session.expires_at_unix * 1000 <= Date.now()) return translateUI('Expired');
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
  roleRefreshError: string;
  onSaveRole: (role: Operator['role'], expectedRole: Operator['role']) => Promise<Operator>;
  onReloadRole: () => Promise<Operator>;
  onDismissCredential: () => void;
  onIssueSession: (expiresInSeconds: number) => void;
  onConfirm: (target: ConfirmTarget) => void;
  onRevokeSession: (sessionId: string) => void;
  onRevokeOperator: () => void;
  onLoadMoreEvents: () => void;
};

export default function OperatorDetails({ operator, organizations, projects, sessions, sessionsLoading, events, eventsLoading, hasMoreEvents, busy, credential, confirmTarget, canChangeRole, roleRefreshError, onSaveRole, onReloadRole, onDismissCredential, onIssueSession, onConfirm, onRevokeSession, onRevokeOperator, onLoadMoreEvents }: OperatorDetailsProps) {
  const { t: uiT } = useUILocale();
  const [draftRole, setDraftRole] = useState<Operator['role']>(operator?.role ?? 'viewer');
  const [expectedRole, setExpectedRole] = useState<Operator['role']>(operator?.role ?? 'viewer');
  const [roleLocked, setRoleLocked] = useState(false);
  const [roleMessage, setRoleMessage] = useState('');
  const [roleBusy, setRoleBusy] = useState(false);
  const roleConflict = roleLocked || Boolean(operator && operator.role !== expectedRole);
  async function saveRole() {
    if (busy || roleBusy || roleConflict || !canChangeRole || draftRole === expectedRole) return;
    setRoleBusy(true);
    setRoleMessage('');
    try {
      const saved = await onSaveRole(draftRole, expectedRole);
      setExpectedRole(saved.role);
      setDraftRole(saved.role);
      setRoleLocked(false);
      setRoleMessage('Role saved.');
    } catch (reason) {
      setRoleLocked(true);
      setRoleMessage(reason instanceof AdminRequestError
        ? reason.status === 409 ? 'The role could not be saved against the current state. Reload the saved role before saving again.' : reason.message
        : 'The save could not be confirmed. Reload the saved role before saving again.');
    } finally { setRoleBusy(false); }
  }
  async function reloadRole() {
    if (busy || roleBusy) return;
    setRoleBusy(true);
    try {
      const saved = await onReloadRole();
      setExpectedRole(saved.role);
      setRoleLocked(false);
      setRoleMessage('Saved role reloaded. Review your choice before saving.');
    } catch (reason) {
      setRoleLocked(true);
      setRoleMessage('Could not reload the saved role. Your choice is retained. ' + (reason instanceof Error ? reason.message : 'Try again.'));
    } finally { setRoleBusy(false); }
  }
  const [expiryDays, setExpiryDays] = useState(30);
  const [expandedHistoryFor, setExpandedHistoryFor] = useState<string | null>(null);
  const [tokenCopy, setTokenCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  if (!operator) return <section className="operator-detail" aria-labelledby="operator-detail-title">
    <div className="operator-detail-empty"><span className="operator-empty-icon"><KeyRound size={18} /></span><h2 id="operator-detail-title">{uiT("Select a user")}</h2><p>{uiT("Review their role, create an access token, or revoke their access.")}</p></div>
  </section>;

  const activeSessions = sessions.filter(item => expiryState(item) === 'Active');
  const pastSessions = sessions.filter(item => expiryState(item) !== 'Active');
  const historyExpanded = expandedHistoryFor === operator.id;
  const visibleSessions = historyExpanded ? [...activeSessions, ...pastSessions] : activeSessions;

  return <section className="operator-detail" aria-labelledby="operator-detail-title">
    <div className="operator-detail-heading">
      <span className="operator-detail-avatar">{operator.name.trim().charAt(0).toUpperCase() || 'O'}</span>
      <div className="operator-detail-copy"><p className="eyebrow">{uiT("USER")}</p><h2 className="scroll-mt-20" id="operator-detail-title">{operator.name}</h2><p>{displayScope(operator, organizations, projects)}</p></div>
      <span className={'operator-role-chip role-' + operator.role}>{roleLabel(operator.role)}</span>
    </div>
    <p className="operator-scope-footnote px-4">{uiT({ viewer: 'Can read workspace data. Cannot change settings or manage user access.', admin: 'Can read and change workspace data. Cannot manage user access.', owner: 'Can read and change workspace data, add users, and revoke access.' }[operator.role])}{!operator.project_id && operator.role !== 'viewer' && <> {uiT("This organization-wide role can access organization billing and shared funds.", "此组织级角色可以访问组织账单及共享资金。")}</>}</p>
    {canChangeRole && <div className="space-y-3 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Label className="grid gap-2" htmlFor="operator-role">{uiT("Role")}<DropdownMenu><DropdownMenuTrigger asChild><Button id="operator-role" variant="outline" size="sm" className="justify-between font-normal" disabled={busy || roleBusy || roleConflict}>{roleLabel(draftRole)}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start"><DropdownMenuRadioGroup value={draftRole} onValueChange={value => setDraftRole(value as Operator['role'])}>
              <DropdownMenuRadioItem value="viewer">{uiT("Viewer · read workspace data")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="admin">{uiT("Admin · change workspace data")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="owner">{uiT("Owner · manage user access")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup></DropdownMenuContent>
          </DropdownMenu>
        </Label>
        <Button size="sm" disabled={busy || roleBusy || roleConflict || draftRole === expectedRole} onClick={() => void saveRole()}>{uiT("Save role")}</Button>
        {(roleConflict || roleMessage) && <Button size="sm" variant="outline" disabled={busy || roleBusy} onClick={() => void reloadRole()}>{uiT("Reload saved role")}</Button>}
      </div>
      {!operator.project_id && draftRole !== 'viewer' && draftRole !== operator.role && <p className="text-sm text-muted-foreground">{uiT("This organization-wide role can access organization billing and shared funds.", "此组织级角色可以访问组织账单及共享资金。")}</p>}
      {roleRefreshError && <p className="text-sm text-muted-foreground" role="status">{uiT(roleRefreshError)}</p>}
      {(roleMessage || roleConflict) && <p className="text-sm text-muted-foreground" role={roleConflict ? 'alert' : 'status'}>{roleMessage || uiT("The saved role changed. Reload it before saving again.")}</p>}
    </div>}
    {credential?.operatorId === operator.id && <section className="operator-credential" aria-labelledby="operator-credential-title" role="status">
      <div className="operator-credential-title"><span><KeyRound size={16} /></span><div><h3 id="operator-credential-title">{uiT("Save this user’s access token")}</h3><p>{uiT("Shown once · expires")}{" "}{formatExpiry(credential.session.expires_at_unix)}{uiT(". Share it securely with this user. It grants dashboard and management API access, not model API access. Existing Niu users can link this organization in Organization settings → Join an organization.", "。请安全地分享给该用户。它授予控制台与管理 API 权限，而非模型 API 权限。已有 Niu 账户的用户可在“组织设置 → 加入组织”中绑定该组织。")}</p></div></div>
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
    <div className="flex flex-col gap-3 py-4">
      <div><h3 className="text-sm font-medium">{uiT("Access sessions")}</h3><p className="mt-1 text-sm text-muted-foreground">{uiT("Revoking a session leaves this user’s other sessions active.")}</p></div>
      {operator.revoked
        ? <span className="operator-revoked-note">{uiT("User access revoked")}</span>
        : <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Label className="grid gap-2" htmlFor="new-session-expiry">{uiT("Expires in")}<DropdownMenu><DropdownMenuTrigger asChild><Button id="new-session-expiry" type="button" variant="outline" size="sm" className="w-full justify-between font-normal" disabled={busy}>{uiT(expiryChoices.find(item => item.days === expiryDays)?.label ?? "")}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={String(expiryDays)} onValueChange={value => setExpiryDays(Number(value))}>
                {expiryChoices.map(item => <DropdownMenuRadioItem key={item.days} value={String(item.days)}>{uiT(item.label)}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup></DropdownMenuContent>
            </DropdownMenu>
          </Label>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onIssueSession(expiryDays * 86400)}><KeyRound size={14} />{uiT("Create access token")}</Button>
        </div>}
    </div>
    <div className="operator-session-table">
      {sessionsLoading
        ? <TableSkeleton columns={4} rows={3} label={uiT("Loading sessions…")} />
        : sessions.length === 0
          ? <div className="operator-session-empty">{uiT("This user has no access sessions. Create an access token to let them connect.")}</div>
          : <>{activeSessions.length === 0 && <div className="operator-session-empty">{uiT("No active sessions.", "没有有效的访问会话。")}</div>}{pastSessions.length > 0 && <Button type="button" variant="ghost" size="sm" aria-expanded={historyExpanded} onClick={() => setExpandedHistoryFor(historyExpanded ? null : operator.id)}>{historyExpanded ? uiT("Hide past sessions", "隐藏历史会话") : uiT("Show past sessions", "显示历史会话")} ({pastSessions.length})<ChevronDown aria-hidden="true" className={historyExpanded ? 'rotate-180' : ''} /></Button>}{visibleSessions.length > 0 && <div className="table-wrap"><Table>
            <TableHeader><TableRow><TableHead>{uiT("Created")}</TableHead><TableHead className="hidden sm:table-cell">{uiT("Expires")}</TableHead><TableHead className="hidden sm:table-cell">{uiT("Status")}</TableHead><TableHead className="w-28"><span className="sr-only">{uiT("Actions")}</span></TableHead></TableRow></TableHeader>
            <TableBody>{visibleSessions.map(item => {
              const state = expiryState(item);
              const confirming = confirmTarget?.kind === 'session' && confirmTarget.id === item.id;
              return <TableRow key={item.id}>
                <TableCell>{new Date(item.created_at).toLocaleString(readUILocale())}<dl className="mt-2 space-y-2 sm:hidden"><div><dt className="text-xs text-muted-foreground">{uiT("Expires")}</dt><dd>{formatExpiry(item.expires_at_unix)}</dd></div><div><dt className="text-xs text-muted-foreground">{uiT("Status")}</dt><dd><span className={'operator-session-state state-' + state.toLowerCase()}>{uiT(state)}</span></dd></div></dl></TableCell>
                <TableCell className="hidden sm:table-cell">{formatExpiry(item.expires_at_unix)}</TableCell>
                <TableCell className="hidden sm:table-cell"><span className={'operator-session-state state-' + state.toLowerCase()}>{uiT(state)}</span></TableCell>
                <TableCell>{state === 'Active' && !operator.revoked
                  ? confirming
                    ? <span className="operator-confirm-actions"><Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => onRevokeSession(item.id)}>{uiT("Confirm revoke")}</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onConfirm(null)}>{uiT("Cancel")}</Button></span>
                    : <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onConfirm({ kind: 'session', id: item.id })}><Ban size={14} />{uiT("Revoke")}</Button>
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
            <div className="operator-activity-copy"><strong>{activityLabel(event.action)}{event.action === 'role_changed' && event.before_role && event.after_role ? ' · ' + roleLabel(event.before_role) + ' → ' + roleLabel(event.after_role) : ''}</strong><small>{uiT("By")}{" "}{actor}</small></div>
            <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString(readUILocale())}</time>
          </li>;
        })}</ol>}
      {eventsLoading && events.length > 0 && <p className="operator-activity-loading" role="status">{uiT("Loading older activity…")}</p>}
    </section>
    <div className="operator-revoke-row flex-wrap">
      <div><strong>{uiT("Revoke user access")}</strong><p>{operator.project_id ? uiT("This user will lose access to this workspace. All of their access sessions will be revoked.") : uiT("This user will lose access to every workspace in the organization. All of their access sessions will be revoked.")}</p></div>
      {operator.revoked
        ? <span className="operator-revoked-note">{uiT("Access revoked")}</span>
        : confirmTarget?.kind === 'operator' && confirmTarget.id === operator.id
          ? <span className="operator-confirm-actions"><Button type="button" variant="destructive" disabled={busy} onClick={onRevokeOperator}>{uiT("Confirm revoke user access")}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => onConfirm(null)}>{uiT("Cancel")}</Button></span>
          : <Button type="button" variant="destructive" disabled={busy} onClick={() => onConfirm({ kind: 'operator', id: operator.id })}><Ban size={14} />{uiT("Revoke access")}</Button>}
    </div>
  </section>;
}
