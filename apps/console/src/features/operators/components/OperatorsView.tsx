import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { AdminSession } from '@/app/console-context';
import { AdminRequestError, request, type IssuedSession, type NamedResource, type Operator, type OperatorAuditEvent, type OperatorSession } from '../api';
import OperatorCreateForm, { type NewOperator } from './OperatorCreateForm';
import OperatorDirectory from './OperatorDirectory';
import OperatorDetails from './OperatorDetails';
import type { ConfirmTarget, CredentialView } from './operator-types';

type OperatorsViewProps = { token: string; session: AdminSession; refreshWorkspace?: () => Promise<void> };

function roleLabel(role: 'owner' | 'admin' | 'viewer') {
  return role[0].toUpperCase() + role.slice(1);
}

export default function OperatorsView({ token, session, refreshWorkspace }: OperatorsViewProps) {
  const canManage = session.permissions.manage_operators;
  const lockedOrganization = session.kind === 'operator' ? session.operator?.organization_id ?? '' : '';
  const lockedProject = session.kind === 'operator' ? session.operator?.project_id ?? '' : '';
  const [organizations, setOrganizations] = useState<NamedResource[]>([]);
  const [projects, setProjects] = useState<NamedResource[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [organization, setOrganization] = useState(lockedOrganization);
  const [project, setProject] = useState(lockedProject);
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
  const activeOperatorCount = visibleOperators.filter(item => !item.revoked).length;
  const revokedOperatorCount = visibleOperators.length - activeOperatorCount;

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
        setError(reason instanceof Error ? reason.message : 'Could not load projects.');
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
    if (!organization) return;
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
      <div className="page-heading"><div><p className="eyebrow">ACCESS CONTROL</p><h1>Operators</h1><p className="page-subtitle">Manage people who can access this Niu installation.</p></div></div>
      <section className="panel operator-denied" role="status">
        <span className="operator-denied-icon"><ShieldCheck size={19} /></span>
        <div><h2>Owner access required</h2><p>{isViewer
          ? 'Your viewer session can inspect workspace data, but only an owner can create operators, issue sessions, or revoke access.'
          : 'Your admin session can update workspace data. Operator access is managed by an owner for this organization.'}</p></div>
        <span className="operator-role-chip">{roleLabel(session.operator?.role ?? 'viewer')} session</span>
      </section>
    </>;
  }

  return <>
    <div className="page-heading operator-page-heading">
      <div><p className="eyebrow">ACCESS CONTROL</p><h1>Operators</h1><p className="page-subtitle">Give each person a scoped role and short lived session credentials.</p></div>
      <div className="operator-page-actions">
        <Button type="button" variant="outline" disabled={loading || busy} onClick={() => void perform(() => loadOperators())}><RefreshCw size={15} />Refresh</Button>
        <Button type="button" disabled={loading || busy || !organizations.length} onClick={() => setCreateOpen(value => !value)}><Plus size={16} />{createOpen ? 'Close form' : 'Add operator'}</Button>
      </div>
    </div>
    {error && <div className="operator-error" role="alert"><span>{error}</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void perform(() => loadOperators())}>Try again</Button></div>}
    <section className="operator-summary" aria-label="Operator summary">
      <div className="operator-summary-item"><span>In this scope</span><strong>{loading ? '—' : visibleOperators.length}</strong><small>operators listed</small></div>
      <div className="operator-summary-item"><span>Active operators</span><strong>{loading ? '—' : activeOperatorCount}</strong><small>able to start sessions</small></div>
      <div className="operator-summary-item"><span>Revoked</span><strong>{loading ? '—' : revokedOperatorCount}</strong><small>kept in the access record</small></div>
      <div className="operator-summary-context"><span className="operator-summary-mark"><ShieldCheck size={17} /></span><div><strong>{session.kind === 'installation' ? 'Installation owner' : lockedProject ? 'Project owner' : 'Organization owner'}</strong><small>Operator secrets are shown once and kept in this tab only.</small></div></div>
    </section>

    <section className="panel operator-scope-panel" aria-label="Operator scope">
      <div className="operator-section-title"><div><h2>Scope</h2><p>Choose which organization and projects to manage.</p></div><span className="operator-scope-note"><ShieldCheck size={14} />New operators inherit this scope</span></div>
      <div className="operator-scope-fields">
        <Label htmlFor="operator-organization">Organization
          <NativeSelect id="operator-organization" disabled={busy || loading || Boolean(lockedOrganization)} value={organization} onChange={event => {
          setOrganization(event.target.value);
          setProject('');
          setSelectedOperatorId('');
          setSessions([]);
          setCredential(null);
          invalidateAudit();
          }}>
            <NativeSelectOption value="">Select organization</NativeSelectOption>
            {organizations.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}
          </NativeSelect>
        </Label>
        <Label htmlFor="operator-project">Project
          <NativeSelect id="operator-project" disabled={busy || loading || !organization || Boolean(lockedProject)} value={project} onChange={event => {
          setProject(event.target.value);
          setSelectedOperatorId('');
          setSessions([]);
          setCredential(null);
          invalidateAudit();
          }}>
            <NativeSelectOption value="">All projects in organization</NativeSelectOption>
            {projects.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}
          </NativeSelect>
        </Label>
      </div>
      {lockedProject && <p className="operator-scope-footnote">Your owner session is limited to its assigned project.</p>}
    </section>

    {createOpen && <OperatorCreateForm
      disabled={busy || loading || !organization}
      onCreate={onCreateOperator}
    />}

    <div className="operator-workspace-grid">
      <OperatorDirectory
        operators={visibleOperators}
        organizations={organizations}
        projects={projects}
        selectedId={selectedOperatorId}
        loading={loading}
        disabled={busy}
        projectScope={Boolean(project)}
        onSelect={id => {
          if (selectedOperatorId !== id) {
            setSelectedOperatorId(id);
            setCredential(null);
            setConfirmTarget(null);
            invalidateAudit();
          }
        }}
        onAdd={() => setCreateOpen(true)}
      />
      <OperatorDetails
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
      />
    </div>
  </>;
}
