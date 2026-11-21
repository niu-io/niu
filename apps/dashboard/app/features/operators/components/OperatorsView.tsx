import { useLocale as useUILocale } from '@/shell/ui-locale';
import { workspaceDisplayName } from '@/shell/workspace-route';
import { IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { DialogFooter } from '@/components/ui/dialog';
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

type OperatorsViewProps = { token: string; session: AdminSession; refreshWorkspace?: () => Promise<void>; initialOrganization?: string; initialWorkspace?: string };

function roleLabel(role: 'owner' | 'admin' | 'viewer', uiT: (en: string, zh?: string) => string) {
  if (role === 'owner') return uiT('Owner', '所有者');
  if (role === 'admin') return uiT('Admin', '管理员');
  return uiT('Viewer', '查看者');
}

export default function OperatorsView({ token, session, refreshWorkspace, initialOrganization, initialWorkspace }: OperatorsViewProps) {
  const { t: uiT, format: uiF } = useUILocale();
  const canManage = session.permissions.manage_operators;
  const lockedOrganization = session.kind === 'operator' ? session.operator?.organization_id ?? '' : '';
  const lockedProject = session.kind === 'operator' ? session.operator?.project_id ?? '' : '';
  const initialOrgs = canManage ? (peekCachedGet<{ data: NamedResource[] }>(token, '/api/v1/organizations')?.data ?? null) : null;
  const initialOpsPage = canManage ? peekCachedGet<{ data: Operator[]; next_cursor?: string | null }>(token, '/api/v1/operators?limit=1000') : undefined;
  const initialOps = initialOpsPage && Array.isArray(initialOpsPage.data) && !initialOpsPage.next_cursor ? initialOpsPage.data : null;
  const initialOrgId = lockedOrganization || initialOrganization || initialOrgs?.[0]?.id || '';
  const initialProjects = canManage && initialOrgId ? (peekCachedGet<{ data: NamedResource[] }>(token, '/api/v1/workspaces?organization_id=' + encodeURIComponent(initialOrgId))?.data ?? []) : [];
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
  const [cancelInvitation, setCancelInvitation] = useState<MemberInvitation | null>(null);
  const subviewHeading = useRef<HTMLHeadingElement>(null);
  const returnTrigger = useRef<HTMLButtonElement | null>(null);
  const subview = createOpen ? 'invite' : revokeTarget ? 'revoke' : cancelInvitation ? 'cancel' : selectedOperator ? 'detail' : null;
  useEffect(() => {
    if (!subview) return;
    const frame = requestAnimationFrame(() => {
      (subview === 'invite' && !issuedInvitation ? createEmailRef.current : subviewHeading.current)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [subview, issuedInvitation]);

  function closeMemberView() {
    if (busy) return;
    const trigger = returnTrigger.current ?? (createOpen ? createButtonRef.current : detailTriggerRef.current);
    setOpenedRoleContext(''); setRoleRefreshError(''); setSelectedOperatorId('');
    setCredential(null); setConfirmTarget(null); setRevokeTarget(null);
    setIssuedInvitation(null); setCreateOpen(false); setCancelInvitation(null);
    setError('');
    requestAnimationFrame(() => { (trigger?.isConnected ? trigger : createButtonRef.current)?.focus(); });
    returnTrigger.current = null;
  }

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
    const projectsPath = '/api/v1/workspaces?organization_id=' + encodeURIComponent(organization);
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
      setCancelInvitation(null);
      requestAnimationFrame(() => { (returnTrigger.current?.isConnected ? returnTrigger.current : createButtonRef.current)?.focus(); });
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
      requestAnimationFrame(() => { (returnTrigger.current?.isConnected ? returnTrigger.current : createButtonRef.current)?.focus(); });
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
      <section className="panel operator-denied" role="status">
        <span className="operator-denied-icon"><ShieldCheck size={19} /></span>
        <div><h2>{uiT("Owner access required")}</h2><p>{isViewer
          ? uiT("Your viewer session can inspect workspace data, but only an owner can add users, issue sessions, or revoke access.")
          : uiT("Your admin session can update workspace data. User access is managed by an owner for this organization.")}</p></div>
        <span className="operator-role-chip">{roleLabel(session.operator?.role ?? 'viewer', uiT)}{" "}{uiT("session")}</span>
      </section>
    </>;
  }

  const invitationTitle = issuedInvitation ? uiT("Invitation created", "邀请已创建") : uiT("Invite member", "邀请成员");
  const invitationDescription = issuedInvitation
    ? uiT("Copy the one-time link now. No email was sent.", "请立即复制一次性链接。系统未发送邮件。")
    : lockedProject
      ? uiF("Invite a member to {0}.", [workspaceDisplayName(projects.find(item => item.id === lockedProject)?.name ?? '') || uiT("this workspace", "此工作空间")])
      : uiT("Choose the scope and role for this invitation.", "选择此邀请的访问范围和角色。");
  const revokeTitle = `${uiT("Revoke access for")} ${revokeTarget?.name ?? ''}?`;
  const revokeDescription = revokeTarget?.project_id
    ? uiT("This user will lose access to this workspace. All of their access sessions will end immediately.")
    : uiT("This user has organization-wide access. Revoking it removes access to every workspace in the organization, not just this workspace.");
  const detailDescription = uiF("Access sessions for {0}. Revoke a session to end that connection.", [selectedOperator?.name ?? ""]);
  const cancelDescription = uiT('The one-time link will stop working immediately. The person can still be invited again later.', '一次性链接将立即失效。之后仍可重新邀请此人。');
  const detailBody = <>{selectedOperator && canChangeRole && openedRoleContext !== roleContext && credential?.operatorId !== selectedOperator.id
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
      />}</>;
  const revokeBody = <>{revokeTarget && (revokeTarget.role === 'owner' || (session.kind === 'operator' && revokeTarget.id === session.operator?.id)) && <p role="status" className="text-sm text-muted-foreground">
          {session.kind === 'operator' && revokeTarget.id === session.operator?.id ? uiT("This is your current account. Revoking your own access ends all your sessions immediately.") : null}
          {revokeTarget.role === 'owner' ? <>{(session.kind === 'operator' && revokeTarget.id === session.operator?.id) ? ' ' : null}{uiT("The server prevents removing the final owner. Transfer ownership before revoking the last owner.")}</> : null}
        </p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={closeMemberView}>{uiT("Cancel")}</Button><Button variant="destructive" disabled={busy} onClick={() => { if (revokeTarget) onRevokeOperator(revokeTarget); }}>{uiT("Revoke access")}</Button></DialogFooter>
        {error && <p role="alert" className="text-sm text-destructive">{uiT(error)}</p>}</>;
  const invitationBody = <>{error && <p className="text-sm text-destructive" role="alert">{uiT(error)}</p>}{issuedInvitation
          ? <InvitationLinkPanel created={issuedInvitation} onDismiss={closeMemberView} />
          : <InviteMemberForm emailInputRef={createEmailRef} onCancel={closeMemberView} disabled={busy || loading || !organization} projects={projects} defaultProjectId={project || null} canChooseOrganizationScope={!lockedProject} onCreate={onCreateInvitation} />}</>;

  const actions = <div className="operator-page-actions">
    <Button type="button" variant="ghost" size="icon-sm" aria-label={uiT("Refresh members", "刷新成员")} title={uiT("Refresh members", "刷新成员")} disabled={loading || busy} onClick={() => void perform(() => loadOperators())}><RefreshCw size={15} className={loading ? 'animate-spin' : undefined} /></Button>
    <Button ref={createButtonRef} type="button" className="header-icon-action" aria-label={uiT("Invite member", "邀请成员")} title={uiT("Invite member", "邀请成员")} disabled={loading || busy || !organization || Boolean(lockedProject && !project)} onClick={() => { returnTrigger.current = null; setIssuedInvitation(null); setCreateOpen(true); }}><Plus size={16} /><span>{uiT("Invite member", "邀请成员")}</span></Button>
  </div>;

  return <>
    <PageHeader title={uiT("Members")} action={subview ? undefined : actions} />
    <div hidden={Boolean(subview)}>
    {error && <div className="operator-error" role="alert"><span>{uiT(error)}</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => loadOperators())}>{uiT("Try again")}</Button></div>}

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
          returnTrigger.current = null;
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
        onRevoke={(operator, trigger) => { returnTrigger.current = trigger ?? null; setRevokeTarget(operator); }}
        onAdd={() => { setIssuedInvitation(null); setCreateOpen(true); }}
      />
    </div>
    {organization && (
      <PendingInvitations
        invitations={pendingInvitations}
        loading={invitationsLoading}
        busy={busy}
        onRequestCancel={(invitation, trigger) => { returnTrigger.current = trigger; setCancelInvitation(invitation); }}
        onReplace={onReplaceInvitation}
      />
    )}
    </div>
    {subview && <section className="space-y-5" aria-labelledby="member-subview-title">
      <Button type="button" variant="ghost" size="sm" data-settings-member-back disabled={busy} onClick={closeMemberView}><ArrowLeft size={16} />{uiT('Back to members', '返回成员列表')}</Button>
      <header className="space-y-2">
        <h3 id="member-subview-title" ref={subviewHeading} tabIndex={-1} className="text-base font-semibold outline-none">{createOpen ? invitationTitle : revokeTarget ? revokeTitle : cancelInvitation ? `${uiT('Cancel invitation for', '取消此邀请：')} ${cancelInvitation.recipient_email}?` : uiT('Member access', '成员访问权限')}</h3>
        <p className="text-sm text-muted-foreground">{createOpen ? invitationDescription : revokeTarget ? revokeDescription : cancelInvitation ? cancelDescription : detailDescription}</p>
      </header>
      {createOpen ? invitationBody : revokeTarget ? revokeBody : cancelInvitation ? <>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={closeMemberView}>{uiT('Keep invitation', '保留邀请')}</Button><Button variant="destructive" disabled={busy} onClick={() => onCancelInvitation(cancelInvitation)}>{uiT('Cancel invitation', '取消邀请')}</Button></DialogFooter>
        {error && <p role="alert" className="text-sm text-destructive">{uiT(error)}</p>}
      </> : detailBody}
    </section>}
  </>;
}
