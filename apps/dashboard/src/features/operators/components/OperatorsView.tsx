import { IconX as X } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconPlus as Plus } from "@tabler/icons-react";
import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import { IconShieldCheck as ShieldCheck } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import type { AdminSession } from '@/app/dashboard-context';
import { AdminRequestError, request, type IssuedSession, type NamedResource, type Operator, type OperatorAuditEvent, type OperatorSession } from '../api';
import OperatorCreateForm, { type NewOperator } from './OperatorCreateForm';
import OperatorDirectory from './OperatorDirectory';
import OperatorDetails from './OperatorDetails';
import type { ConfirmTarget, CredentialView } from './operator-types';

type OperatorsViewProps = { token: string; session: AdminSession; refreshWorkspace?: () => Promise<void>; initialOrganization?: string; initialWorkspace?: string };

function roleLabel(role: 'owner' | 'admin' | 'viewer') {
  return role[0].toUpperCase() + role.slice(1);
}

export default function OperatorsView({ token, session, refreshWorkspace, initialOrganization, initialWorkspace }: OperatorsViewProps) {
  const canManage = session.permissions.manage_operators;
  const lockedOrganization = session.kind === 'operator' ? session.operator?.organization_id ?? '' : '';
  const lockedProject = session.kind === 'operator' ? session.operator?.project_id ?? '' : '';
  const [organizations, setOrganizations] = useState<NamedResource[]>([]);
  const [projects, setProjects] = useState<NamedResource[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [organization, setOrganization] = useState(lockedOrganization || initialOrganization || '');
  const [project, setProject] = useState(lockedProject || initialWorkspace || '');
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const [sessions, setSessions] = useState<OperatorSession[]>([]);
  const [auditEvents, setAuditEvents] = useState<OperatorAuditEvent[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const createNameRef = useRef<HTMLInputElement>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [credential, setCredential] = useState<CredentialView | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);
  const auditRevision = useRef(0);
  const auditController = useRef<AbortController | null>(null);
  const auditContext = useRef({ operatorId: selectedOperatorId, organization, project, token });
  auditContext.current = { operatorId: selectedOperatorId, organization, project, token };

  const selectedOperator = operators.find(item => item.id === selectedOperatorId) ?? null;
  const visibleOperators = useMemo(() => operators.filter(item => {
    if (organization && item.organization_id !== organization) return false;
    if (project && item.project_id && item.project_id !== project) return false;
    return true;
  }), [operators, organization, project]);
  const [revokeTarget, setRevokeTarget] = useState<Operator | null>(null);

  const loadOperators = useCallback(async (signal?: AbortSignal) => {
    const result = await request<{ data: Operator[] }>(token, '/admin/v1/operators', 'GET', undefined, signal);
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
      && auditContext.current.token === context.token;
    if (!requestSignal || requestSignal.aborted || !isCurrent()) return;
    const query = cursor
      ? '?limit=50&cursor=' + encodeURIComponent(cursor)
      : '?limit=50';
    setAuditLoading(true);
    try {
      const result = await request<{ data: OperatorAuditEvent[]; next_cursor: string | null }>(
        token,
        '/admin/v1/operators/' + operatorId + '/events' + query,
        'GET',
        undefined,
        requestSignal,
      );
      if (requestSignal.aborted || !isCurrent()) return;
      setAuditEvents(previous => append ? [...previous, ...result.data] : result.data);
      setAuditCursor(result.next_cursor);
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
            '/admin/v1/operators/' + operatorId + '/events?limit=50',
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
    setLoading(true);
    setError('');
    Promise.all([
      request<{ data: NamedResource[] }>(token, '/admin/v1/organizations', 'GET', undefined, controller.signal),
      request<{ data: Operator[] }>(token, '/admin/v1/operators', 'GET', undefined, controller.signal),
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
    setProjects([]);
    request<{ data: NamedResource[] }>(
      token,
      '/admin/v1/organizations/' + organization + '/projects',
      'GET',
      undefined,
      controller.signal,
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
      '/admin/v1/operators/' + selectedOperatorId + '/sessions',
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

  function onCreateOperator(newOperator: NewOperator) {
    if (!organization || !project) return;
    void perform(async () => {
      const result = await request<{ operator: Operator } & IssuedSession>(
        token,
        '/admin/v1/operators',
        'POST',
        {
          organization_id: organization,
          project_id: project || null,
          name: newOperator.name,
          role: newOperator.role,
          expires_in_seconds: newOperator.expiresInSeconds,
        },
      );
      setOperators(previous => [result.operator, ...previous.filter(item => item.id !== result.operator.id)]);
      setSelectedOperatorId(result.operator.id);
      setSessions([result.session]);
      setCredential({ operatorId: result.operator.id, token: result.token, session: result.session });
      setCreateOpen(false);
      setConfirmTarget(null);
    });
  }

  function onIssueSession(expiresInSeconds: number) {
    if (!selectedOperator) return;
    const operatorId = selectedOperator.id;
    void perform(async () => {
      const result = await request<IssuedSession>(
        token,
        '/admin/v1/operators/' + operatorId + '/sessions',
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
      await request<void>(token, '/admin/v1/operators/' + operator.id, 'DELETE');
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
        '/admin/v1/operators/' + operatorId + '/sessions/' + sessionId,
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
      <PageHeader title="Users" />
      <section className="panel operator-denied" role="status">
        <span className="operator-denied-icon"><ShieldCheck size={19} /></span>
        <div><h2>Owner access required</h2><p>{isViewer
          ? 'Your viewer session can inspect workspace data, but only an owner can add users, issue sessions, or revoke access.'
          : 'Your admin session can update workspace data. User access is managed by an owner for this organization.'}</p></div>
        <span className="operator-role-chip">{roleLabel(session.operator?.role ?? 'viewer')} session</span>
      </section>
    </>;
  }

  return <>
    <PageHeader title="Users" action={<div className="operator-page-actions">
        <Button type="button" variant="ghost" className="header-icon-action" aria-label="Refresh users" title="Refresh users" disabled={loading || busy} onClick={() => void perform(() => loadOperators())}><RefreshCw size={15} /><span>Refresh</span></Button>
        <Button ref={createButtonRef} type="button" className="header-icon-action" aria-label="Add user" title="Add user" disabled={loading || busy || !organization || !project} onClick={() => setCreateOpen(true)}><Plus size={16} /><span>Add user</span></Button>
      </div>} />
    {error && <div className="operator-error" role="alert"><span>{error}</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => loadOperators())}>Try again</Button></div>}

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
            setSelectedOperatorId(id);
            setCredential(null);
            setConfirmTarget(null);
            invalidateAudit();
          }
        }}
        onRevoke={setRevokeTarget}
        onAdd={() => setCreateOpen(true)}
      />
    </div>
    <Dialog open={Boolean(selectedOperator)} onOpenChange={open => { if (!open && !busy) { setSelectedOperatorId(''); setCredential(null); setConfirmTarget(null); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={event => { if (detailTriggerRef.current?.isConnected) { event.preventDefault(); detailTriggerRef.current.focus(); } }}>
        <DialogHeader><DialogTitle>User access</DialogTitle><DialogDescription>Access sessions for {selectedOperator?.name}. Revoke a session to end that connection.</DialogDescription></DialogHeader>
      {selectedOperator && <OperatorDetails
        operator={selectedOperator}
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
        <DialogHeader><DialogTitle>Revoke access for {revokeTarget?.name}?</DialogTitle><DialogDescription>{revokeTarget?.project_id
          ? 'This user will lose access to this workspace. All of their access sessions will end immediately.'
          : 'This user has organization-wide access. Revoking it removes access to every workspace in the organization, not just this workspace.'}</DialogDescription></DialogHeader>
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setRevokeTarget(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={() => { if (revokeTarget) onRevokeOperator(revokeTarget); }}>Revoke access</Button></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
    <Dialog open={createOpen} onOpenChange={open => { if (!open && !busy) setCreateOpen(false); }}>
      <DialogContent className="niu-modal operator-dialog" showCloseButton={false} onOpenAutoFocus={event => {if (createNameRef.current && !createNameRef.current.disabled) {event.preventDefault();createNameRef.current.focus();}}} onCloseAutoFocus={event => {if (createButtonRef.current) {event.preventDefault();createButtonRef.current.focus();}}}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>Add a user</DialogTitle><DialogDescription>Choose a role for this person. Save their temporary access token after adding them; no email invitation is sent.</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
        </DialogHeader>
      <OperatorCreateForm nameInputRef={createNameRef} disabled={busy || loading || !organization} onCreate={onCreateOperator} />
      {error && <p className="error-text operator-dialog-error" role="alert">{error}</p>}
    </DialogContent>
    </Dialog>
  </>;
}
