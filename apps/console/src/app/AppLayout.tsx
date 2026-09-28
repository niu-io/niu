import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, CircleHelp, PanelsTopLeft, Boxes, FlaskConical, Settings2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import type { AdminSession, ConsoleContext, GatewayStatus, Health, Model, Organization, Workspace } from './console-context';
import { navigation } from './navigation';
import AccountMenu from './AccountMenu';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { resolveWorkspacePathSegment, workspacePathSegment } from './workspace-route';
import logo from '../../../../branding/assets/niu-mark.png';

const gatewayHealthUrl = `${import.meta.env.BASE_URL}healthz`;
const sidebarBreakpoint = 960;

export default function AppLayout() {
  const [token, setToken] = useState('');
  const [draftToken, setDraftToken] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspacesLoadedFor, setWorkspacesLoadedFor] = useState('');
  const [workspaceLoadRevision, setWorkspaceLoadRevision] = useState(0);
  const [workspaceError, setWorkspaceError] = useState('');
  const [health, setHealth] = useState<Health | null>(null);
  const [healthChecked, setHealthChecked] = useState(false);
  const [error, setError] = useState('');
  const connectionRevision = useRef(0);
  const connectionController = useRef<AbortController | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { workspace: routeWorkspaceId } = useParams();
  const routeWorkspace = routeWorkspaceId && routeWorkspaceId !== 'default'
    ? resolveWorkspacePathSegment(routeWorkspaceId, workspaces)
    : undefined;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(gatewayHealthUrl, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Gateway unavailable'); return response.json(); })
      .then((value: Health) => { if (!controller.signal.aborted) setHealth(value); })
      .catch(() => { if (!controller.signal.aborted) setHealth(null); })
      .finally(() => { if (!controller.signal.aborted) setHealthChecked(true); });
    return () => controller.abort();
  }, []);

  const authenticate = useCallback(async (credential: string) => {
    setError('');
    connectionController.current?.abort();
    const controller = new AbortController();
    connectionController.current = controller;
    const revision = ++connectionRevision.current;
    try {
      const sessionResponse = await fetch('/admin/v1/session', {
        headers: { authorization: 'Bearer ' + credential },
        signal: controller.signal,
      });
      if (revision !== connectionRevision.current || controller.signal.aborted) return;
      if (!sessionResponse.ok) {
        if (revision === connectionRevision.current) setError('The admin token was rejected or the Niu gateway is unavailable.');
        return;
      }
      const sessionValue = await sessionResponse.json() as { data: AdminSession };
      if (revision !== connectionRevision.current || controller.signal.aborted) return;
      const response = await fetch('/admin/v1/models', {
        headers: { authorization: `Bearer ${credential}` },
        signal: controller.signal,
      });
      if (revision !== connectionRevision.current || controller.signal.aborted) return;
      if (!response.ok) {
        if (revision === connectionRevision.current) setError('The admin token was rejected or the Niu gateway is unavailable.');
        return;
      }
      const value = await response.json() as { data: Model[] };
      if (revision !== connectionRevision.current || controller.signal.aborted) return;
      setModels(value.data);
      setSession(sessionValue.data);
      setToken(credential);
      setDraftToken('');
    } catch {
      if (revision === connectionRevision.current) setError('The admin token was rejected or the Niu gateway is unavailable.');
    }
  }, []);

  const connect = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await authenticate(draftToken);
  }, [authenticate, draftToken]);

  useEffect(() => {
    if (!import.meta.env.DEV || import.meta.env.MODE === 'test') return;
    const controller = new AbortController();
    void fetch('/__niu_dev_session', {
      method: 'POST', headers: { 'x-niu-dev-session': '1' }, signal: controller.signal,
    }).then(async response => {
      if (!response.ok) return;
      const value = await response.json() as { token?: string };
      if (!controller.signal.aborted && value.token) await authenticate(value.token);
    }).catch(() => { /* Manual connection remains available without the dev launcher. */ });
    return () => controller.abort();
  }, [authenticate]);

  const refreshModels = useCallback(async () => {
    if (!token) return;
    const controller = connectionController.current;
    if (!controller || controller.signal.aborted) return;
    const revision = connectionRevision.current;
    try {
      const response = await fetch('/admin/v1/models', {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (revision !== connectionRevision.current || controller.signal.aborted) return;
      if (!response.ok) return;
      const value = await response.json() as { data: Model[] };
      if (revision === connectionRevision.current && !controller.signal.aborted) setModels(value.data);
    } catch {
      // Keep the last known route list visible during a transient gateway failure.
    }
  }, [token]);

  const refreshWorkspace = useCallback(async () => {
    const revision = connectionRevision.current;
    const controller = token ? connectionController.current : null;
    if (token && (!controller || controller.signal.aborted)) return;
    try {
      const response = await fetch(gatewayHealthUrl, controller ? { signal: controller.signal } : undefined);
      if (!response.ok) throw new Error('Health check failed');
      const value = await response.json() as Health;
      if (revision === connectionRevision.current && !controller?.signal.aborted) setHealth(value);
    } catch {
      if (revision === connectionRevision.current && !controller?.signal.aborted) setHealth(null);
    }
    if (revision === connectionRevision.current && !controller?.signal.aborted) setHealthChecked(true);
    if (token && controller && revision === connectionRevision.current && !controller.signal.aborted) {
      try {
        const response = await fetch('/admin/v1/session', {
          headers: { authorization: 'Bearer ' + token },
          signal: controller.signal,
        });
        if (revision !== connectionRevision.current || controller.signal.aborted) return;
        if (response.status === 401) {
          controller.abort();
          if (connectionController.current === controller) connectionController.current = null;
          connectionRevision.current += 1;
          setToken('');
          setDraftToken('');
          setModels([]);
          setSession(null);
          setError('This admin session has expired or been revoked. Sign in again with valid administrator access.');
        } else if (response.ok) {
          const currentSession = (await response.json() as { data: AdminSession }).data;
          if (revision === connectionRevision.current && !controller.signal.aborted) setSession(currentSession);
        }
      } catch {
        // Preserve the last verified identity during a transient network failure.
      }
    }
    if (revision === connectionRevision.current && token && controller && !controller.signal.aborted) await refreshModels();
  }, [refreshModels, token]);

  useEffect(() => {
    setWorkspacesLoadedFor('');
    if (!token) {
      setOrganizations([]);
      setWorkspaces([]);
      setWorkspace(null);
      setWorkspaceLoading(false);
      setWorkspaceError('');
      return;
    }
    const controller = new AbortController();
    setOrganizations([]);
    setWorkspaces([]);
    setWorkspace(null);
    setWorkspaceLoading(true);
    setWorkspaceError('');
    const headers = { authorization: `Bearer ${token}` };
    void Promise.all([
      fetch('/admin/v1/organizations', { headers, signal: controller.signal }),
      fetch('/admin/v1/workspaces', { headers, signal: controller.signal }),
    ]).then(async ([organizationResponse, workspaceResponse]) => {
      if (!organizationResponse.ok || !workspaceResponse.ok) throw new Error('Could not load workspaces.');
      const [organizationData, workspaceData] = await Promise.all([
        organizationResponse.json() as Promise<{ data: Organization[] }>,
        workspaceResponse.json() as Promise<{ data: Workspace[] }>,
      ]);
      if (controller.signal.aborted) return;
      setOrganizations(organizationData.data);
      setWorkspaces(workspaceData.data);
      setWorkspacesLoadedFor(token);
    }).catch(cause => {
      if (!controller.signal.aborted) setWorkspaceError(cause instanceof Error ? cause.message : 'Could not load workspaces.');
    }).finally(() => {
      if (!controller.signal.aborted) setWorkspaceLoading(false);
    });
    return () => controller.abort();
  }, [token, workspaceLoadRevision]);

  const selectWorkspace = useCallback((next: Workspace) => {
    setWorkspace(next);
    setWorkspaceError('');
    try { window.localStorage.setItem('niu.active-workspace', next.id); } catch { /* URL remains the source of truth. */ }
    const nestedPath = location.pathname.split('/').filter(Boolean).slice(2).join('/');
    const knownWorkspaces = workspaces.some(item => item.id === next.id) ? workspaces : [...workspaces, next];
    navigate({
      pathname: `/workspaces/${workspacePathSegment(next, knownWorkspaces)}${nestedPath ? `/${nestedPath}` : ''}`,
      search: location.search,
      hash: location.hash,
    }, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate, workspaces]);

  const createWorkspace = useCallback(async (name: string, organizationId?: string) => {
    if (!token) throw new Error('Sign in before creating a workspace.');
    const response = await fetch('/admin/v1/workspaces', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name, organization_id: organizationId || null }),
    });
    const body = await response.json().catch(() => null) as (Workspace & { error?: { message?: string } }) | null;
    if (!response.ok || !body) throw new Error(body?.error?.message ?? `Could not create workspace (${response.status}).`);
    const created: Workspace = {
      id: body.id,
      name: body.name,
      organization_id: body.organization_id,
      organization_name: organizations.find(item => item.id === body.organization_id)?.name ?? 'Personal workspace',
    };
    setWorkspaces(previous => [...previous, created]);
    if (!organizations.some(item => item.id === created.organization_id)) {
      setOrganizations(previous => [...previous, { id: created.organization_id, name: created.organization_name }]);
    }
    selectWorkspace(created);
    return created;
  }, [organizations, selectWorkspace, token]);

  useEffect(() => {
    if (!token || workspaceLoading || workspacesLoadedFor !== token) return;
    let preferred = routeWorkspace;
    if (!preferred && routeWorkspaceId === 'default') {
      const operatorProjectId = session?.operator?.project_id;
      let storedId: string | null = null;
      try { storedId = window.localStorage.getItem('niu.active-workspace'); } catch { /* Storage is optional. */ }
      preferred = workspaces.find(item => item.id === operatorProjectId)
        ?? workspaces.find(item => item.id === storedId)
        ?? workspaces[0];
    }
    if (preferred) {
      setWorkspace(preferred);
      setWorkspaceError('');
      try { window.localStorage.setItem('niu.active-workspace', preferred.id); } catch { /* Route remains the source of truth. */ }
      const preferredSegment = workspacePathSegment(preferred, workspaces);
      if (routeWorkspaceId !== preferredSegment) {
        const nestedPath = location.pathname.split('/').filter(Boolean).slice(2).join('/');
        navigate({ pathname: `/workspaces/${preferredSegment}${nestedPath ? `/${nestedPath}` : ''}`, search: location.search, hash: location.hash }, { replace: true });
      }
    } else {
      setWorkspace(null);
      if (routeWorkspaceId && routeWorkspaceId !== 'default') setWorkspaceError('This workspace is unavailable. Choose another workspace.');
    }
  }, [location.pathname, location.search, location.hash, navigate, routeWorkspaceId, session, token, workspaceLoading, workspaces, workspacesLoadedFor]);

  const gatewayStatus: GatewayStatus = health?.status === 'ok'
    ? 'online'
    : healthChecked
      ? 'offline'
      : 'checking';
  const context = useMemo<ConsoleContext>(() => ({
    token,
    session,
    organizations,
    workspaces,
    workspace: workspace?.id === routeWorkspace?.id ? workspace : null,
    workspaceLoading,
    workspaceError,
    selectWorkspace,
    createWorkspace,
    draftToken,
    setDraftToken,
    models,
    health,
    gatewayStatus,
    error,
    connect,
    refreshModels,
    refreshWorkspace,
  }), [token, session, organizations, workspaces, workspace, routeWorkspaceId, workspaceLoading, workspaceError, selectWorkspace, createWorkspace, draftToken, models, health, gatewayStatus, error, connect, refreshModels, refreshWorkspace]);
  const workspacePath = location.pathname.split('/').filter(Boolean).slice(2).join('/');
  const activePath = workspacePath || '.';
  const activeNavigation = navigation.find(item => item.to === activePath)
    ?? navigation.filter(item => activePath.startsWith(`${item.to}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  const title = activeNavigation?.label ?? 'Page not found';

  useEffect(() => {
    document.title = `${title} · Niu Console`;
  }, [title]);

  const sidebarViewportWidth = useRef(typeof window !== 'undefined' ? window.innerWidth : sidebarBreakpoint);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= sidebarBreakpoint);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const destination = activeNavigation?.destination ?? 'Workspace';
  const platform = destination === 'Administration';
  const hasSidebar = destination === 'Workspace';
  const isInstallation = session?.kind === 'installation';
  const scopeLabel = session?.operator?.project_id ? 'Project access' : session?.operator ? 'Organization access' : 'Administrator access needed';
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[role="menu"], [role="dialog"]')) {
        setSidebarOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  useEffect(() => {
    const closeOnCompactViewport = () => {
      const width = window.innerWidth;
      if (sidebarViewportWidth.current >= sidebarBreakpoint && width < sidebarBreakpoint) {
        setSidebarOpen(false);
        if (sidebarRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
      }
      sidebarViewportWidth.current = width;
    };
    window.addEventListener('resize', closeOnCompactViewport);
    return () => window.removeEventListener('resize', closeOnCompactViewport);
  }, []);
  const closeOnMobile = () => { if (window.innerWidth < sidebarBreakpoint) setSidebarOpen(false); };

  return <div className={`app-shell${hasSidebar && sidebarOpen ? ' sidebar-open' : ''}`}>
    <a className="console-skip" href="#console-content">Skip to content</a>
    <nav className="app-rail" aria-label="Product navigation">
      <a className="rail-logo" href={import.meta.env.BASE_URL} aria-label="niu.io home"><img src={logo} alt="" /></a>
      <NavLink to="." end onClick={() => setSidebarOpen(true)} className={`rail-item${hasSidebar ? ' selected' : ''}`} aria-label="Workspace" title="Workspace"><PanelsTopLeft size={21} /></NavLink>
      <NavLink to="models" className={`rail-item${destination === 'Models' ? ' selected' : ''}`} aria-label="Models" title="Models"><Boxes size={21} /></NavLink>
      <NavLink to="benchmarks" className={`rail-item${destination === 'Benchmarks' ? ' selected' : ''}`} aria-label="Benchmarks" title="Benchmarks"><FlaskConical size={21} /></NavLink>
      <div className="rail-bottom">{isInstallation && <NavLink to="vendors" className={`rail-item${platform ? ' selected' : ''}`} aria-label="Platform settings" title="Platform settings"><Settings2 size={21} /></NavLink>}<a className="rail-item" href={`${import.meta.env.BASE_URL}docs/`} aria-label="Documentation" title="Documentation"><CircleHelp size={21} /></a><AccountMenu context={context}/></div>
    </nav>
    {hasSidebar && sidebarOpen && <>
      <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => { setSidebarOpen(false); toggleRef.current?.focus(); }} />
      <aside ref={sidebarRef} className="sidebar" id="workspace-navigation">
        <div className="sidebar-heading"><WorkspaceSwitcher context={context} /></div>
        {(session?.operator || !session) && <div className="session-context"><span>{scopeLabel}</span>{session?.operator && <details><summary>View access scope</summary><dl><dt>Organization</dt><dd>{session.operator.organization_id}</dd>{session.operator.project_id && <><dt>Project</dt><dd>{session.operator.project_id}</dd></>}<dt>Role</dt><dd>{session.operator.role}</dd></dl></details>}{!session && <p>The gateway is available. Sign in with an installation admin token to manage it.</p>}</div>}
        <nav aria-label="Main navigation">
          {navigation.filter(item => item.destination === 'Workspace').map(item => <NavLink key={item.to} to={item.to} end={item.to === '.'} onClick={closeOnMobile} aria-label={item.label} className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}><item.icon className="nav-icon" aria-hidden="true"/><span>{item.label}</span>{item.to === 'models' && models.length > 0 && <span className="nav-count">{models.length}</span>}</NavLink>)}
        </nav>
        <div className="sidebar-bottom"><a href={`${import.meta.env.BASE_URL}docs/`}>Documentation <ArrowUpRight size={16} /></a></div>
      </aside>
    </>}
    <main className="main-panel">
      <header className="console-page-header">
        {hasSidebar ? <button ref={toggleRef} type="button" className="sidebar-toggle" onClick={() => setSidebarOpen(open => !open)} aria-expanded={sidebarOpen} aria-controls={sidebarOpen ? 'workspace-navigation' : undefined} aria-label={sidebarOpen ? 'Collapse workspace navigation' : 'Expand workspace navigation'} title={sidebarOpen ? 'Collapse navigation' : 'Expand navigation'}>{sidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}</button> : <span className="sidebar-toggle-placeholder" aria-hidden="true" />}
        <h1>{title}</h1>
      </header>
      <div className="page-content" id="console-content" tabIndex={-1}>{gatewayStatus === 'offline' ? <section className="gateway-recovery" role="alert"><h2>Restore your gateway connection</h2><p>The console cannot reach the gateway. Restore the service before continuing.</p><p>For local development, start the stack with <code>pnpm dev</code>. For a hosted installation, ask your administrator to check the service.</p><Button onClick={() => { void refreshWorkspace(); }}>Retry connection</Button></section> : token && workspaceError ? <section className="gateway-recovery" role="alert"><h2>Could not open workspace</h2><p>{workspaceError}</p><Button onClick={() => setWorkspaceLoadRevision(value => value + 1)}>Retry</Button></section> : token && (workspaceLoading || workspacesLoadedFor !== token) ? <p role="status">Loading workspace…</p> : <Outlet context={context} />}</div>
    </main>
  </div>;
}
