import { useState } from 'react';
import { Ban, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
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
  if (!operator.project_id) return organization + ' · all projects';
  const project = projects.find(item => item.id === operator.project_id)?.name ?? 'Project';
  return organization + ' · ' + project;
}

function expiryState(session: OperatorSession) {
  if (session.revoked) return 'Revoked';
  if (session.expires_at_unix * 1000 <= Date.now()) return 'Expired';
  return 'Active';
}

function activityLabel(action: string) {
  switch (action) {
    case 'operator_created': return 'Operator created';
    case 'session_created': return 'Session issued';
    case 'session_revoked': return 'Session revoked';
    case 'operator_revoked': return 'Operator revoked';
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
  if (!operator) return <section className="panel operator-detail" aria-labelledby="operator-detail-title">
    <div className="operator-detail-empty"><span className="operator-empty-icon"><KeyRound size={18} /></span><h2 id="operator-detail-title">Select an operator</h2><p>Review session expiry, issue an additional credential, or revoke access.</p></div>
  </section>;

  return <section className="panel operator-detail" aria-labelledby="operator-detail-title">
    <div className="operator-detail-heading">
      <span className="operator-detail-avatar">{operator.name.trim().charAt(0).toUpperCase() || 'O'}</span>
      <div className="operator-detail-copy"><p className="eyebrow">OPERATOR</p><h2 id="operator-detail-title">{operator.name}</h2><p>{displayScope(operator, organizations, projects)}</p></div>
      <span className={'operator-role-chip role-' + operator.role}>{roleLabel(operator.role)}</span>
    </div>
    {credential?.operatorId === operator.id && <section className="operator-credential" aria-labelledby="operator-credential-title" role="status">
      <div className="operator-credential-title"><span><KeyRound size={16} /></span><div><h3 id="operator-credential-title">Save this session token</h3><p>Shown once · expires {formatExpiry(credential.session.expires_at_unix)}</p></div></div>
      <Label htmlFor="new-operator-token">Session token<Input id="new-operator-token" className="mono operator-token-input" readOnly value={credential.token} onFocus={event => event.target.select()} /></Label>
      <Button type="button" variant="outline" onClick={onDismissCredential}>Dismiss token</Button>
    </section>}
    <div className="operator-session-controls">
      <div><h3>Sessions</h3><p>Each session has its own expiry and can be revoked separately.</p></div>
      {operator.revoked
        ? <span className="operator-revoked-note">Operator revoked</span>
        : <div className="operator-issue-controls">
          <Label htmlFor="new-session-expiry">Expires in
            <NativeSelect id="new-session-expiry" size="sm" disabled={busy} value={expiryDays} onChange={event => setExpiryDays(Number(event.target.value))}>
              {expiryChoices.map(item => <NativeSelectOption key={item.days} value={item.days}>{item.label}</NativeSelectOption>)}
            </NativeSelect>
          </Label>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onIssueSession(expiryDays * 86400)}><KeyRound size={14} />Issue new session</Button>
        </div>}
    </div>
    <div className="operator-session-table">
      {sessionsLoading
        ? <div className="operator-loading" role="status">Loading sessions…</div>
        : sessions.length === 0
          ? <div className="operator-session-empty">No sessions have been issued for this operator.</div>
          : <div className="table-wrap"><Table>
            <TableHeader><TableRow><TableHead>SESSION</TableHead><TableHead>EXPIRES</TableHead><TableHead>STATUS</TableHead><TableHead>ACTIONS</TableHead></TableRow></TableHeader>
            <TableBody>{sessions.map(item => {
              const state = expiryState(item);
              const confirming = confirmTarget?.kind === 'session' && confirmTarget.id === item.id;
              return <TableRow key={item.id}>
                <TableCell><span className="operator-session-id mono">{item.id.slice(0, 8)}</span></TableCell>
                <TableCell>{formatExpiry(item.expires_at_unix)}</TableCell>
                <TableCell><span className={'operator-session-state state-' + state.toLowerCase()}>{state}</span></TableCell>
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
      <div className="operator-activity-heading"><div><h3 id="operator-activity-title">Recent access activity</h3><p>Creation and session changes for this operator.</p></div>{hasMoreEvents && <Button type="button" variant="ghost" size="sm" disabled={eventsLoading} onClick={onLoadMoreEvents}>{eventsLoading ? 'Loading…' : 'Load older'}</Button>}</div>
      {events.length === 0
        ? <div className="operator-activity-empty" role={eventsLoading ? 'status' : undefined}>{eventsLoading ? 'Loading activity…' : 'No activity recorded yet.'}</div>
        : <ol className="operator-activity-list">{events.map(event => {
          const actor = event.actor_kind === 'installation'
            ? 'Installation owner'
            : 'Operator ' + (event.actor_operator_id ?? '').slice(0, 8);
          return <li key={event.id}>
            <span className="operator-activity-mark" aria-hidden="true" />
            <div className="operator-activity-copy"><strong>{activityLabel(event.action)}</strong><small>By {actor}{event.target_session_id ? ' · session ' + event.target_session_id.slice(0, 8) : ''}</small></div>
            <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
          </li>;
        })}</ol>}
      {eventsLoading && events.length > 0 && <p className="operator-activity-loading" role="status">Loading older activity…</p>}
    </section>
    <div className="operator-revoke-row">
      <div><strong>Revoke operator</strong><p>Revoking an operator immediately revokes every active session.</p></div>
      {operator.revoked
        ? <span className="operator-revoked-note">Access revoked</span>
        : confirmTarget?.kind === 'operator' && confirmTarget.id === operator.id
          ? <span className="operator-confirm-actions"><Button type="button" variant="destructive" disabled={busy} onClick={onRevokeOperator}>Confirm revoke operator</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => onConfirm(null)}>Cancel</Button></span>
          : <Button type="button" variant="destructive" disabled={busy} onClick={() => onConfirm({ kind: 'operator', id: operator.id })}><Ban size={14} />Revoke access</Button>}
    </div>
  </section>;
}
