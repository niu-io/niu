import { useLocale as useUILocale } from '@/shell/ui-locale';
import { workspaceDisplayName } from '@/shell/workspace-route';
import { IconX as X } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconPlus as Plus } from "@tabler/icons-react";
import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import { IconShieldCheck as ShieldCheck } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import type { AdminSession } from '@/shell/dashboard-context';
import {
  AdminRequestError,
  cachedGet,
  cancelMemberInvitation,
  createMemberInvitation,
  listMemberInvitations,
  listOperators,
  peekCachedGet,
  request,
  type CreatedMemberInvitation,
  type IssuedSession,
  type MemberInvitation,
  type NamedResource,
  type NewMemberInvitation,
  type Operator,
  type OperatorAuditEvent,
  type OperatorSession,
} from '../api';
import InvitationLinkPanel from './InvitationLinkPanel';
import InviteMemberForm from './InviteMemberForm';
import OperatorDirectory from './OperatorDirectory';
import OperatorDetails from './OperatorDetails';
import PendingInvitations from './PendingInvitations';
import type { ConfirmTarget, CredentialView } from './operator-types';

type OperatorsViewProps = { token: string; session: AdminSession; refreshWorkspace?: () => Promise<void>; initialOrganization?: string; initialWorkspace?: string; embedded?: boolean };

function roleLabel(role: 'owner' | 'admin' | 'viewer', uiT: (en: string, zh?: string) => string) {
  if (role === 'owner') return uiT('Owner', '所有者');
  if (role === 'admin') return uiT('Admin', '管理员');
  return uiT('Viewer', '查看者');
}

export default function OperatorsView({ token, session, refreshWorkspace, initialOrganization, initialWorkspace, embedded = false }: OperatorsViewProps) {
  const { t: uiT, format: uiF } = useUILocale();
  const canManage = session.permissions.manage_operators;
  const lockedOrganization = session.kind === 'operator' ? session.operator?.organization_id ?? '' : '';
  const lockedProject = session.kind === 'operator' ? session.operator?.project_id ?? '' : '';
  const initialOrgs = canManage ? (peekCachedGet<{ data: NamedResource[] }>(token, '/api/v1/organizations')?.data ?? null) : null;
  const initialOpsPage = canManage ? peekCachedGet<{ data: Operator[]; next_cursor?: string | null }>(token, '/api/v1/operators?limit=1000') : undefined;
  const initialOps = initialOpsPage && Array.isArray(initialOpsPage.data) && !initialOpsPage.next_cursor ? initialOpsPage.data : null;
  const initialOrgId = lockedOrganization || initialOrganization || initialOrgs?.[0]?.id || '';
  const initialProjects = canManage && initialOrgId ? (peekCachedGet<{ data: NamedResource[] }>(token, '/api/v1/organizations/' + initialOrgId + '/projects')?.data ?? []) : [];
  const [organizations, setOrganizations] = useState<NamedResource[]>(() => initialOrgs ?? []);
  const [projects, setProjects] = useState<NamedResource[]>(() => initialProjects);
  const [operators, setOperators] = useState<Operator[]>(() => initialOps ?? []);
  const [organization, setOrganization] = useState(initialOrgId);
  const [project, setProject] = useState(lockedProject || initialWorkspace || '');
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const [sessions, setSessions] = useState<OperatorSession[]>([]);
  const [auditEvents, setAuditEvents] = useState<OperatorAuditEvent[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(canManage && (!initialOrgs || !initialOps)));
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const createEmailRef = useRef<HTMLInputElement>(null);
  const [invitations, setInvitations] = useState<MemberInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [issuedInvitation, setIssuedInvitation] = useState<CreatedMemberInvitation | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [credential, setCredential] = useState<CredentialView | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);
  const auditRevision = useRef(0);
  const auditController = useRef<AbortController | null>(null);
  const auditContext = useRef({ operatorId: selectedOperatorId, organization, project, token, actor: session.kind + ':' + (session.operator?.id ?? '') });
  auditContext.current = { operatorId: selectedOperatorId, organization, project, token, actor: session.kind + ':' + (session.operator?.id ?? '') };

  const selectedOperator = operators.find(item => item.id === selectedOperatorId) ?? null;
  const visibleOperators = useMemo(() => operators.filter(item => {
    if (organization && item.organization_id !== organization) return false;
    if (project && item.project_id && item.project_id !== project) return false;
    return true;
  }), [operators, organization, project]);
  const pendingInvitations = useMemo(() => invitations.filter(item => {
    if (item.status !== 'pending') return false;
    if (project && item.project_id && item.project_id !== project) return false;
    return true;
  }), [invitations, project]);
  const [revokeTarget, setRevokeTarget] = useState<Operator | null>(null);

  const roleController = useRef<AbortController | null>(null);
  useEffect(() => () => {
    if (roleController.current) { roleController.current.abort(); roleController.current = null; setBusy(false); }
  }, [token, organization, project, selectedOperatorId, session.kind, session.operator?.id]);
  useEffect(() => { setSelectedOperatorId(''); }, [token, session.kind, session.operator?.id]);
  const canChangeRole = Boolean(canManage && (session.kind === 'installation' || session.operator?.role === 'owner')
    && selectedOperator && !selectedOperator.revoked && selectedOperator.organization_id
    && selectedOperator.organization_id === organization && selectedOperator.id !== session.operator?.id
    && (!lockedProject || selectedOperator.project_id === lockedProject));
  const roleContext = JSON.stringify([token, organization, project, selectedOperatorId, session.kind, session.operator?.id]);
  const [openedRoleContext, setOpenedRoleContext] = useState('');
  const [roleOpenError, setRoleOpenError] = useState('');
  const [roleRefreshError, setRoleRefreshError] = useState('');
  const [roleOpenRevision, setRoleOpenRevision] = useState(0);
  useEffect(() => {
    if (!selectedOperatorId || !canChangeRole) return;
    const controller = new AbortController();
    setOpenedRoleContext('');
    setRoleOpenError('');
    setRoleRefreshError('');
    void listOperators(token, organization, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        const saved = result.data.find(item => item.id === selectedOperatorId);
        if (!saved || saved.revoked || saved.organization_id !== organization
          || (lockedProject && saved.project_id !== lockedProject)) throw new Error('User access is unavailable in this scope.');
        setOperators(previous => previous.map(item => item.id === saved.id ? saved : item));
        setOpenedRoleContext(roleContext);
      }).catch(reason => {
        if (!controller.signal.aborted) setRoleOpenError(reason instanceof Error ? reason.message : 'Could not load the saved role.');
      });
    return () => controller.abort();
  }, [token, organization, project, selectedOperatorId, canChangeRole, lockedProject, roleContext, roleOpenRevision]);
  async function roleRequest(nextRole?: Operator['role'], expectedRole?: Operator['role']) {
    if (!selectedOperator || !canChangeRole || openedRoleContext !== roleContext || busy || loading) throw new Error('Role editing is unavailable in this scope.');
    const context = { ...auditContext.current };
    const controller = new AbortController();
    roleController.current?.abort();
    roleController.current = controller;
    const current = () => !controller.signal.aborted && Object.keys(context).every(key =>
      context[key as keyof typeof context] === auditContext.current[key as keyof typeof context]);
    setBusy(true);
    setRoleRefreshError('');
    try {
      const result = nextRole
        ? await request<{ data: Operator }>(token, '/api/v1/operators/' + selectedOperator.id, 'PATCH', { role: nextRole, expected_role: expectedRole }, controller.signal)
        : await listOperators(token, organization, controller.signal);
      if (!current()) throw new DOMException('Role context changed.', 'AbortError');
      const saved = Array.isArray(result.data) ? result.data.find(item => item.id === context.operatorId) : result.data;
      if (!saved || saved.revoked || saved.organization_id !== context.organization
        || (lockedProject && saved.project_id !== lockedProject)) throw new Error('User access is unavailable.');
      setOperators(previous => previous.map(item => item.id === saved.id ? saved : item));
      // A confirmed mutation stays confirmed even if its later activity read fails.
      if (nextRole) void loadAudit(saved.id).then(loaded => {
        if (loaded === false && Object.keys(context).every(key => context[key as keyof typeof context] === auditContext.current[key as keyof typeof context])) {
          setRoleRefreshError('Role saved, but recent activity could not be refreshed.');
        }
      });
      return saved;
    } finally {
      if (roleController.current === controller) { roleController.current = null; setBusy(false); }
    }
  }

  const loadOperators = useCallback(async (signal?: AbortSignal) => {
    const result = await listOperators(token, undefined, signal);
    setOperators(result.data);
  }, [token]);

  const invalidateAudit = useCallback(() => {
    auditRevision.current += 1;
    auditController.current?.abort();
    auditController.current = null;
    setAuditEvents([]);
    setAuditCursor(null);
    setAuditLoading(false);
  }, []);

  const loadAudit = useCallback(async (operatorId: string, cursor?: string, append = false, signal?: AbortSignal, expectedRevision?: number) => {
    const revision = expectedRevision ?? auditRevision.current;
    const requestSignal = signal ?? auditController.current?.signal;
    const context = auditContext.current;
    const isCurrent = () => revision === auditRevision.current
      && context.operatorId === operatorId
      && auditContext.current.operatorId === operatorId
      && auditContext.current.organization === context.organization
      && auditContext.current.project === context.project
      && auditContext.current.token === context.token
      && auditContext.current.actor === context.actor;
    if (!requestSignal || requestSignal.aborted || !isCurrent()) return;
    const query = cursor
      ? '?limit=50&cursor=' + encodeURIComponent(cursor)
      : '?limit=50';
    setAuditLoading(true);
    try {
      const result = await request<{ data: OperatorAuditEvent[]; next_cursor: string | null }>(
        token,
        '/api/v1/operators/' + operatorId + '/events' + query,
        'GET',
        undefined,
        requestSignal,
      );
      if (requestSignal.aborted || !isCurrent()) return;
      setAuditEvents(previous => append ? [...previous, ...result.data] : result.data);
      setAuditCursor(result.next_cursor);
      return true;
    } catch (reason) {
      if (requestSignal.aborted || !isCurrent()) return;
      if (reason instanceof AdminRequestError && reason.status === 401) {
        setError(reason.message);
        await refreshWorkspace?.();
        return;
      }
      if (append) {
        // A cursor can become invalid while activity is changing. Drop it and
        // recover from the first page so the UI cannot retry it forever.
        setAuditCursor(null);
        try {
          const firstPage = await request<{ data: OperatorAuditEvent[]; next_cursor: string | null }>(
            token,
            '/api/v1/operators/' + operatorId + '/events?limit=50',
            'GET',
            undefined,
            requestSignal,
          );
          if (requestSignal.aborted || !isCurrent()) return;
          setAuditEvents(firstPage.data);
          setAuditCursor(firstPage.next_cursor);
          setError('');
        } catch (recoveryReason) {
          if (requestSignal.aborted || !isCurrent()) return;
          setError(recoveryReason instanceof Error ? recoveryReason.message : 'Could not refresh operator activity.');
          if (recoveryReason instanceof AdminRequestError && recoveryReason.status === 401) {
            await refreshWorkspace?.();
          }
        }
      } else {
        setError(reason instanceof Error ? reason.message : 'Could not load operator activity.');
        return false;
      }
    } finally {
      if (!requestSignal.aborted && isCurrent()) setAuditLoading(false);
    }
  }, [refreshWorkspace, token]);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const hasSeed = Array.isArray(peekCachedGet<{ data: NamedResource[] }>(token, '/api/v1/organizations')?.data)
      && Array.isArray(peekCachedGet<{ data: Operator[] }>(token, '/api/v1/operators?limit=1000')?.data);
    if (!hasSeed) setLoading(true);
    setError('');
    Promise.all([
      cachedGet<{ data: NamedResource[] }>(token, '/api/v1/organizations', { signal: controller.signal }),
      listOperators(token, undefined, controller.signal),
    ]).then(([organizationResult, operatorResult]) => {
      if (controller.signal.aborted) return;
      setOrganizations(organizationResult.data);
      setOperators(operatorResult.data);
      setOrganization(current => {
        if (lockedOrganization) return lockedOrganization;
        return organizationResult.data.some(item => item.id === current) ? current : organizationResult.data[0]?.id ?? '';
      });
      setSelectedOperatorId(current => operatorResult.data.some(item => item.id === current) ? current : '');
      setLoading(false);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : 'Could not load operators.');
      if (reason instanceof AdminRequestError && reason.status === 401) void refreshWorkspace?.();
      setLoading(false);
    });
    return () => controller.abort();
  }, [canManage, lockedOrganization, refreshWorkspace, token]);

  useEffect(() => {
    if (!canManage || !organization) {
      setProjects([]);
      return;
    }
    const controller = new AbortController();
    const projectsPath = '/api/v1/organizations/' + organization + '/projects';
    const cachedProjects = peekCachedGet<{ data: NamedResource[] }>(token, projectsPath)?.data;
    setProjects(Array.isArray(cachedProjects) ? cachedProjects : []);
    cachedGet<{ data: NamedResource[] }>(
      token,
      projectsPath,
      { signal: controller.signal },
    ).then(result => {
      if (controller.signal.aborted) return;
      setProjects(result.data);
      setProject(current => lockedProject || (result.data.some(item => item.id === current) ? current : ''));
    }).catch(reason => {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'Could not load workspaces.');
        if (reason instanceof AdminRequestError && reason.status === 401) void refreshWorkspace?.();
      }
    });
    return () => controller.abort();
  }, [canManage, lockedProject, organization, refreshWorkspace, token]);

  const loadInvitations = useCallback(async (signal?: AbortSignal) => {
    if (!organization) {
      setInvitations([]);
      return;
    }
    const result = await listMemberInvitations(token, organization, signal);
    setInvitations(result.data);
  }, [organization, token]);

  useEffect(() => {
    if (!canManage || !organization) {
      setInvitations([]);
      setInvitationsLoading(false);
      return;
    }
    const controller = new AbortController();
    setInvitationsLoading(true);
    setInvitations([]);
    void loadInvitations(controller.signal)
      .catch(reason => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Could not load invitations.');
          if (reason instanceof AdminRequestError && reason.status === 401) void refreshWorkspace?.();
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setInvitationsLoading(false);
      });
    return () => controller.abort();
  }, [canManage, loadInvitations, organization, refreshWorkspace]);

  useEffect(() => {
    if (!canManage || !selectedOperatorId) {
      setSessions([]);
      setSessionsLoading(false);
      return;
    }
    const controller = new AbortController();
    setSessions([]);
    setSessionsLoading(true);
    request<{ data: OperatorSession[] }>(
      token,
      '/api/v1/operators/' + selectedOperatorId + '/sessions',
      'GET',
      undefined,
      controller.signal,
    ).then(result => {
      if (!controller.signal.aborted) setSessions(result.data);
    }).catch(reason => {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'Could not load sessions.');
        if (reason instanceof AdminRequestError && reason.status === 401) void refreshWorkspace?.();
      }
    }).finally(() => {
      if (!controller.signal.aborted) setSessionsLoading(false);
    });
    return () => controller.abort();
  }, [canManage, refreshWorkspace, selectedOperatorId, token]);

  useEffect(() => {
    const revision = ++auditRevision.current;
    const controller = new AbortController();
    auditController.current = controller;
    setAuditEvents([]);
    setAuditCursor(null);
    if (!canManage || !selectedOperatorId) {
      setAuditLoading(false);
    } else {
      void loadAudit(selectedOperatorId, undefined, false, controller.signal, revision);
    }
    return () => {
      controller.abort();
      if (auditController.current === controller) auditController.current = null;
      if (auditRevision.current === revision) auditRevision.current += 1;
    };
  }, [canManage, loadAudit, organization, project, selectedOperatorId]);

  useEffect(() => {
    if (selectedOperatorId && !visibleOperators.some(item => item.id === selectedOperatorId)) {
      setSelectedOperatorId('');
      setSessions([]);
      setCredential(null);
    }
  }, [selectedOperatorId, visibleOperators]);

  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The change could not be saved.');
      if (reason instanceof AdminRequestError && reason.status === 401) await refreshWorkspace?.();
    } finally {
      setBusy(false);
    }
  }

  function onCreateInvitation(invitation: NewMemberInvitation) {
    const targetProject = lockedProject || invitation.projectId;
    if (!organization || (lockedProject && !targetProject)) return;
    void perform(async () => {
      const result = await createMemberInvitation(token, organization, {
        ...invitation,
        projectId: targetProject || null,
      });
      setInvitations(previous => [result.invitation, ...previous.filter(item => item.id !== result.invitation.id)]);
      setIssuedInvitation(result);
      setCreateOpen(true);
    });
  }

  function onCancelInvitation(invitation: MemberInvitation) {
    void perform(async () => {
      await cancelMemberInvitation(token, invitation.id);
      setInvitations(previous => previous.map(item => item.id === invitation.id
        ? { ...item, status: 'canceled' as const, revoked_at: new Date().toISOString() }
        : item));
    });
  }

  function onReplaceInvitation(invitation: MemberInvitation) {
    if (!organization) return;
    void perform(async () => {
      const result = await createMemberInvitation(token, organization, {
        email: invitation.recipient_email,
        name: invitation.recipient_name,
        role: invitation.role,
        projectId: invitation.project_id,
        expiresInSeconds: 7 * 86_400,
      });
      setInvitations(previous => [result.invitation, ...previous.map(item => item.id === invitation.id
        ? { ...item, status: 'canceled' as const, revoked_at: new Date().toISOString() }
        : item)]);
      setIssuedInvitation(result);
      setCreateOpen(true);
    });
  }

  function onIssueSession(expiresInSeconds: number) {
    if (!selectedOperator) return;
    const operatorId = selectedOperator.id;
    void perform(async () => {
      const result = await request<IssuedSession>(
        token,
        '/api/v1/operators/' + operatorId + '/sessions',
        'POST',
        { expires_in_seconds: expiresInSeconds },
      );
      setSessions(previous => [result.session, ...previous]);
      setCredential({ operatorId, token: result.token, session: result.session });
      setConfirmTarget(null);
      await loadAudit(operatorId);
    });
  }

  function onRevokeOperator(operator: Operator) {
    void perform(async () => {
      await request<void>(token, '/api/v1/operators/' + operator.id, 'DELETE');
      setOperators(previous => previous.map(item => item.id === operator.id ? { ...item, revoked: true } : item));
      setSessions(previous => previous.map(item => ({ ...item, revoked: true })));
      if (credential?.operatorId === operator.id) setCredential(null);
      setConfirmTarget(null);
      setRevokeTarget(null);
      await loadAudit(operator.id);
      await refreshWorkspace?.();
    });
  }

  function onRevokeSession(operatorId: string, sessionId: string) {
    void perform(async () => {
      await request<void>(
        token,
        '/api/v1/operators/' + operatorId + '/sessions/' + sessionId,
        'DELETE',
      );
      setSessions(previous => previous.map(item => item.id === sessionId ? { ...item, revoked: true } : item));
      if (credential?.operatorId === operatorId && credential.session.id === sessionId) setCredential(null);
      setConfirmTarget(null);
      await loadAudit(operatorId);
      await refreshWorkspace?.();
    });
  }

  if (!canManage) {
    const isViewer = session.operator?.role === 'viewer';
    return <>
      {!embedded && <PageHeader title={uiT("Users")} />}
      <section className="panel operator-denied" role="status">
        <span className="operator-denied-icon"><ShieldCheck size={19} /></span>
        <div><h2>{uiT("Owner access required")}</h2><p>{isViewer
          ? uiT("Your viewer session can inspect workspace data, but only an owner can add users, issue sessions, or revoke access.")
          : uiT("Your admin session can update workspace data. User access is managed by an owner for this organization.")}</p></div>
        <span className="operator-role-chip">{roleLabel(session.operator?.role ?? 'viewer', uiT)}{" "}{uiT("session")}</span>
      </section>
    </>;
  }

  const actions = <div className="operator-page-actions">
    <Button type="button" variant="ghost" className="header-icon-action" aria-label={uiT("Refresh users")} title={uiT("Refresh users")} disabled={loading || busy} onClick={() => void perform(() => loadOperators())}><RefreshCw size={15} /><span>{uiT("Refresh")}</span></Button>
    <Button ref={createButtonRef} type="button" className="header-icon-action" aria-label={uiT("Invite member", "邀请成员")} title={uiT("Invite member", "邀请成员")} disabled={loading || busy || !organization || Boolean(lockedProject && !project)} onClick={() => { setIssuedInvitation(null); setCreateOpen(true); }}><Plus size={16} /><span>{uiT("Invite member", "邀请成员")}</span></Button>
  </div>;

  return <>
    {embedded ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : <PageHeader title={uiT("Users")} action={actions} />}
    {error && <div className="operator-error" role="alert"><span>{error}</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => loadOperators())}>{uiT("Try again")}</Button></div>}

    <div className="operator-directory-region">
      <OperatorDirectory
        operators={visibleOperators}
        organizations={organizations}
        projects={projects}
        selectedId={selectedOperatorId}
        loading={loading}
        disabled={busy}
        projectScope={Boolean(project)}
        onSelect={(id, trigger) => {
          detailTriggerRef.current = trigger ?? null;
          if (selectedOperatorId !== id) {
            setOpenedRoleContext('');
            setRoleRefreshError('');
            setSelectedOperatorId(id);
            setCredential(null);
            setConfirmTarget(null);
            invalidateAudit();
          }
        }}
        onRevoke={setRevokeTarget}
        onAdd={() => { setIssuedInvitation(null); setCreateOpen(true); }}
      />
    </div>
    {organization && (
      <PendingInvitations
        invitations={pendingInvitations}
        loading={invitationsLoading}
        busy={busy}
        onCancel={onCancelInvitation}
        onReplace={onReplaceInvitation}
      />
    )}
    <Dialog open={Boolean(selectedOperator)} onOpenChange={open => { if (!open && !busy) { setOpenedRoleContext(''); setRoleRefreshError(''); setSelectedOperatorId(''); setCredential(null); setConfirmTarget(null); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={event => { if (detailTriggerRef.current?.isConnected) { event.preventDefault(); detailTriggerRef.current.focus(); } }}>
        <DialogHeader><DialogTitle>{uiT("User access")}</DialogTitle><DialogDescription>{uiT("Access sessions for")}{" "}{selectedOperator?.name}{uiT(". Revoke a session to end that connection.")}</DialogDescription></DialogHeader>
      {selectedOperator && canChangeRole && openedRoleContext !== roleContext && credential?.operatorId !== selectedOperator.id
        ? (roleOpenError
          ? <div className="space-y-3"><p role="alert">{uiT(roleOpenError)}</p><Button variant="outline" onClick={() => setRoleOpenRevision(value => value + 1)}>{uiT("Reload saved role")}</Button></div>
          : <FormSectionSkeleton fields={2} label={uiT("Loading the saved role…")} />)
        : selectedOperator && <OperatorDetails
        key={[session.kind, session.operator?.id ?? '', organization, project, selectedOperator.id].join(':')}
        operator={selectedOperator}
        canChangeRole={canChangeRole}
        roleRefreshError={roleRefreshError}
        onSaveRole={(role, expectedRole) => roleRequest(role, expectedRole)}
        onReloadRole={() => roleRequest()}
        organizations={organizations}
        projects={projects}
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        events={auditEvents}
        eventsLoading={auditLoading}
        hasMoreEvents={Boolean(auditCursor)}
        busy={busy}
        credential={credential}
        confirmTarget={confirmTarget}
        onDismissCredential={() => setCredential(null)}
        onIssueSession={onIssueSession}
        onConfirm={setConfirmTarget}
        onRevokeSession={sessionId => {
          if (selectedOperator) onRevokeSession(selectedOperator.id, sessionId);
        }}
        onRevokeOperator={() => {
          if (selectedOperator) onRevokeOperator(selectedOperator);
        }}
        onLoadMoreEvents={() => {
          const controller = auditController.current;
          if (selectedOperator && auditCursor && controller && !controller.signal.aborted) {
            void loadAudit(selectedOperator.id, auditCursor, true, controller.signal, auditRevision.current);
          }
        }}
      />}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(revokeTarget)} onOpenChange={open => { if (!open && !busy) setRevokeTarget(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{uiT("Revoke access for")}{" "}{revokeTarget?.name}?</DialogTitle><DialogDescription>{revokeTarget?.project_id
          ? uiT("This user will lose access to this workspace. All of their access sessions will end immediately.")
          : uiT("This user has organization-wide access. Revoking it removes access to every workspace in the organization, not just this workspace.")}</DialogDescription></DialogHeader>
        {revokeTarget && (revokeTarget.role === 'owner' || (session.kind === 'operator' && revokeTarget.id === session.operator?.id)) && <p role="status" className="text-sm text-muted-foreground">
          {session.kind === 'operator' && revokeTarget.id === session.operator?.id ? uiT("This is your current account. Revoking your own access ends all your sessions immediately.") : null}
          {revokeTarget.role === 'owner' ? <>{(session.kind === 'operator' && revokeTarget.id === session.operator?.id) ? ' ' : null}{uiT("The server prevents removing the final owner. Transfer ownership before revoking the last owner.")}</> : null}
        </p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setRevokeTarget(null)}>{uiT("Cancel")}</Button><Button variant="destructive" disabled={busy} onClick={() => { if (revokeTarget) onRevokeOperator(revokeTarget); }}>{uiT("Revoke access")}</Button></div>
        {error && <p role="alert" className="text-sm text-destructive">{uiT(error)}</p>}
      </DialogContent>
    </Dialog>
    <Dialog open={createOpen} onOpenChange={open => { if (!open && !busy) { setIssuedInvitation(null); setCreateOpen(false); } }}>
      <DialogContent className="niu-modal operator-dialog" showCloseButton={false} onOpenAutoFocus={event => { if (issuedInvitation) return; if (createEmailRef.current && !createEmailRef.current.disabled) {event.preventDefault();createEmailRef.current.focus();} }} onCloseAutoFocus={event => {if (createButtonRef.current) {event.preventDefault();createButtonRef.current.focus();}}}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div>
            <DialogTitle>{issuedInvitation ? uiT("Invitation created", "邀请已创建") : uiT("Invite member", "邀请成员")}</DialogTitle>
            <DialogDescription>{issuedInvitation
              ? uiT("Copy the one-time link now. No email was sent.", "请立即复制一次性链接。系统未发送邮件。")
              : uiF("Invite a member to {0}.", [workspaceDisplayName(projects.find(item => item.id === (lockedProject || project))?.name ?? '') || uiT("this workspace", "此工作空间")])}</DialogDescription>
          </div>
          <DialogClose className="niu-modal-close" aria-label={uiT("Close dialog")}><X size={18} /></DialogClose>
        </DialogHeader>
        {issuedInvitation
          ? <InvitationLinkPanel created={issuedInvitation} onDismiss={() => { setIssuedInvitation(null); setCreateOpen(false); }} />
          : <InviteMemberForm emailInputRef={createEmailRef} disabled={busy || loading || !organization} projects={projects} defaultProjectId={project || null} canChooseOrganizationScope={!lockedProject} onCreate={onCreateInvitation} />}
        {error && <p className="error-text operator-dialog-error" role="alert">{uiT(error)}</p>}
      </DialogContent>
    </Dialog>
  </>;
}
