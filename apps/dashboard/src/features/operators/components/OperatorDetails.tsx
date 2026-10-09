import { workspaceDisplayName } from '@/app/workspace-route';
import { useState } from 'react';
import { IconBan as Ban } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatExpiry, type NamedResource, type Operator, type OperatorAuditEvent, type OperatorSession } from '../api';
import type { ConfirmTarget, CredentialView } from './operator-types';

const expiryChoices = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
];

function roleLabel(role: Operator['role']) {
  return role[0].toUpperCase() + role.slice(1);
}

function displayScope(operator: Operator, organizations: NamedResource[], projects: NamedResource[]) {
  const organization = organizations.find(item => item.id === operator.organization_id)?.name ?? 'Organization';
  if (!operator.project_id) return organization + ' · all workspaces';
  const workspace = projects.find(item => item.id === operator.project_id)?.name ?? 'Workspace';
  return organization + ' · ' + workspaceDisplayName(workspace);
}

function expiryState(session: OperatorSession) {
  if (session.revoked) return 'Revoked';
  if (session.expires_at_unix * 1000 <= Date.now()) return 'Expired';
  return 'Active';
}

function activityLabel(action: string) {
  switch (action) {
    case 'operator_created': return 'User added';
    case 'session_created': return 'Access token created';
    case 'session_revoked': return 'Session revoked';
    case 'operator_revoked': return 'User access revoked';
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
  onDismissCredential: () => void;
  onIssueSession: (expiresInSeconds: number) => void;
  onConfirm: (target: ConfirmTarget) => void;
  onRevokeSession: (sessionId: string) => void;
  onRevokeOperator: () => void;
  onLoadMoreEvents: () => void;
};

export default function OperatorDetails({ operator, organizations, projects, sessions, sessionsLoading, events, eventsLoading, hasMoreEvents, busy, credential, confirmTarget, onDismissCredential, onIssueSession, onConfirm, onRevokeSession, onRevokeOperator, onLoadMoreEvents }: OperatorDetailsProps) {
  const [expiryDays, setExpiryDays] = useState(30);
  if (!operator) return <section className="operator-detail" aria-labelledby="operator-detail-title">
    <div className="operator-detail-empty"><span className="operator-empty-icon"><KeyRound size={18} /></span><h2 id="operator-detail-title">Select a user</h2><p>Review their role, create an access token, or revoke their access.</p></div>
  </section>;

  return <section className="operator-detail" aria-labelledby="operator-detail-title">
    <div className="operator-detail-heading">
      <span className="operator-detail-avatar">{operator.name.trim().charAt(0).toUpperCase() || 'O'}</span>
      <div className="operator-detail-copy"><p className="eyebrow">USER</p><h2 className="scroll-mt-20" id="operator-detail-title">{operator.name}</h2><p>{displayScope(operator, organizations, projects)}</p></div>
      <span className={'operator-role-chip role-' + operator.role}>{roleLabel(operator.role)}</span>
    </div>
    <p className="operator-scope-footnote px-4">{{ viewer: 'Can read workspace data. Cannot change settings or manage user access.', admin: 'Can read and change workspace data. Cannot manage user access.', owner: 'Can read and change workspace data, add users, and revoke access.' }[operator.role]}</p>
    {credential?.operatorId === operator.id && <section className="operator-credential" aria-labelledby="operator-credential-title" role="status">
      <div className="operator-credential-title"><span><KeyRound size={16} /></span><div><h3 id="operator-credential-title">Save this user’s access token</h3><p>Shown once · expires {formatExpiry(credential.session.expires_at_unix)}. Share it securely with this user. It grants dashboard and management API access, not model API access.</p></div></div>
      <Label htmlFor="new-operator-token">Access token<Input id="new-operator-token" className="mono operator-token-input" readOnly value={credential.token} onFocus={event => event.target.select()} /></Label>
      <Button type="button" variant="outline" onClick={onDismissCredential}>Done — hide token</Button>
    </section>}
    <div className="flex flex-col gap-3 py-4">
      <div><h3 className="text-sm font-medium">Access sessions</h3><p className="mt-1 text-sm text-muted-foreground">Revoking a session leaves this user’s other sessions active.</p></div>
      {operator.revoked
        ? <span className="operator-revoked-note">User access revoked</span>
        : <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Label className="grid gap-2" htmlFor="new-session-expiry">Expires in
            <DropdownMenu><DropdownMenuTrigger asChild><Button id="new-session-expiry" type="button" variant="outline" size="sm" className="w-full justify-between font-normal" disabled={busy}>{expiryChoices.find(item => item.days === expiryDays)?.label}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={String(expiryDays)} onValueChange={value => setExpiryDays(Number(value))}>
                {expiryChoices.map(item => <DropdownMenuRadioItem key={item.days} value={String(item.days)}>{item.label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup></DropdownMenuContent>
            </DropdownMenu>
          </Label>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onIssueSession(expiryDays * 86400)}><KeyRound size={14} />Create access token</Button>
        </div>}
    </div>
    <div className="operator-session-table">
      {sessionsLoading
        ? <div className="operator-loading" role="status">Loading sessions…</div>
        : sessions.length === 0
          ? <div className="operator-session-empty">This user has no access sessions. Create an access token to let them connect.</div>
          : <div className="table-wrap"><Table>
            <TableHeader><TableRow><TableHead>Session</TableHead><TableHead className="hidden sm:table-cell">Expires</TableHead><TableHead className="hidden sm:table-cell">Status</TableHead><TableHead className="w-28"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>{sessions.map(item => {
              const state = expiryState(item);
              const confirming = confirmTarget?.kind === 'session' && confirmTarget.id === item.id;
              return <TableRow key={item.id}>
                <TableCell>Access session<dl className="mt-2 space-y-2 sm:hidden"><div><dt className="text-xs text-muted-foreground">Expires</dt><dd>{formatExpiry(item.expires_at_unix)}</dd></div><div><dt className="text-xs text-muted-foreground">Status</dt><dd><span className={'operator-session-state state-' + state.toLowerCase()}>{state}</span></dd></div></dl></TableCell>
                <TableCell className="hidden sm:table-cell">{formatExpiry(item.expires_at_unix)}</TableCell>
                <TableCell className="hidden sm:table-cell"><span className={'operator-session-state state-' + state.toLowerCase()}>{state}</span></TableCell>
                <TableCell>{state === 'Active' && !operator.revoked
                  ? confirming
                    ? <span className="operator-confirm-actions"><Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => onRevokeSession(item.id)}>Confirm revoke</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onConfirm(null)}>Cancel</Button></span>
                    : <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onConfirm({ kind: 'session', id: item.id })}><Ban size={14} />Revoke</Button>
                  : <span className="operator-no-action">—</span>}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table></div>}
    </div>
    <section className="operator-activity" aria-labelledby="operator-activity-title">
      <div className="operator-activity-heading"><div><h3 id="operator-activity-title">Recent access activity</h3></div>{hasMoreEvents && <Button type="button" variant="ghost" size="sm" disabled={eventsLoading} onClick={onLoadMoreEvents}>{eventsLoading ? 'Loading…' : 'Load older'}</Button>}</div>
      {events.length === 0
        ? <div className="operator-activity-empty" role={eventsLoading ? 'status' : undefined}>{eventsLoading ? 'Loading activity…' : 'No activity recorded yet.'}</div>
        : <ol className="operator-activity-list">{events.map(event => {
          const actor = event.actor_kind === 'installation'
            ? 'Installation owner'
            : event.actor_operator_id === operator.id ? operator.name : 'Workspace user';
          return <li key={event.id}>
            <span className="operator-activity-mark" aria-hidden="true" />
            <div className="operator-activity-copy"><strong>{activityLabel(event.action)}</strong><small>By {actor}</small></div>
            <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
          </li>;
        })}</ol>}
      {eventsLoading && events.length > 0 && <p className="operator-activity-loading" role="status">Loading older activity…</p>}
    </section>
    <div className="operator-revoke-row flex-wrap">
      <div><strong>Revoke user access</strong><p>{operator.project_id ? 'This user will lose access to this workspace. All of their access sessions will be revoked.' : 'This user will lose access to every workspace in the organization. All of their access sessions will be revoked.'}</p></div>
      {operator.revoked
        ? <span className="operator-revoked-note">Access revoked</span>
        : confirmTarget?.kind === 'operator' && confirmTarget.id === operator.id
          ? <span className="operator-confirm-actions"><Button type="button" variant="destructive" disabled={busy} onClick={onRevokeOperator}>Confirm revoke user access</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => onConfirm(null)}>Cancel</Button></span>
          : <Button type="button" variant="destructive" disabled={busy} onClick={() => onConfirm({ kind: 'operator', id: operator.id })}><Ban size={14} />Revoke access</Button>}
    </div>
  </section>;
}
