import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, CircleHelp, PanelsTopLeft, Boxes, FlaskConical, Settings2, PanelLeft, PanelLeftClose } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import type { AdminSession, ConsoleContext, GatewayStatus, Health, Model } from './console-context';
import { navigation } from './navigation';
import AccountMenu from './AccountMenu';
import logo from '../../../../branding/assets/niu-mark.png';

export default function AppLayout() {
  const [token, setToken] = useState('');
  const [draftToken, setDraftToken] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthChecked, setHealthChecked] = useState(false);
  const [error, setError] = useState('');
  const connectionRevision = useRef(0);
  const connectionController = useRef<AbortController | null>(null);
  const location = useLocation();

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/healthz', { signal: controller.signal })
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
      const response = await fetch('/healthz', controller ? { signal: controller.signal } : undefined);
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

  const gatewayStatus: GatewayStatus = health?.status === 'ok'
    ? 'online'
    : healthChecked
      ? 'offline'
      : 'checking';
  const context = useMemo<ConsoleContext>(() => ({
    token,
    session,
    draftToken,
    setDraftToken,
    models,
    health,
    gatewayStatus,
    error,
    connect,
    refreshModels,
    refreshWorkspace,
  }), [token, session, draftToken, models, health, gatewayStatus, error, connect, refreshModels, refreshWorkspace]);
  const workspacePath = location.pathname.split('/').filter(Boolean).slice(2).join('/');
  const activePath = workspacePath || '.';
  const title = navigation.find(item => item.to === activePath)?.label ?? 'Page not found';

  useEffect(() => {
    document.title = `${title} · Niu Console`;
  }, [title]);

  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 960);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const destination = navigation.find(item => item.to === activePath)?.destination ?? 'Workspace';
  const platform = destination === 'Administration';
  const hasSidebar = destination === 'Workspace';
  const isInstallation = session?.kind === 'installation';
  const scopeLabel = isInstallation ? 'Installation admin' : session?.operator?.project_id ? 'Project access' : session?.operator ? 'Organization access' : 'Administrator access needed';
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSidebarOpen(false); toggleRef.current?.focus(); }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const closeOnMobile = () => { if (window.innerWidth < 960) setSidebarOpen(false); };

  return <div className={`app-shell${hasSidebar && sidebarOpen ? ' sidebar-open' : ''}`}>
    <a className="console-skip" href="#console-content">Skip to content</a>
    <nav className="app-rail" aria-label="Product navigation">
      <a className="rail-logo" href="/" aria-label="niu.io home"><img src={logo} alt="" /></a>
      <NavLink to="." end className={`rail-item${destination === 'Workspace' ? ' selected' : ''}`} aria-label="Workspace" title="Workspace"><PanelsTopLeft size={21} /></NavLink>
      <NavLink to="models" className={`rail-item${destination === 'Models' ? ' selected' : ''}`} aria-label="Models" title="Models"><Boxes size={21} /></NavLink>
      <NavLink to="benchmarks" className={`rail-item${destination === 'Benchmarks' ? ' selected' : ''}`} aria-label="Benchmarks" title="Benchmarks"><FlaskConical size={21} /></NavLink>
      <div className="rail-bottom">{isInstallation && <NavLink to="vendors" className={`rail-item${platform ? ' selected' : ''}`} aria-label="Platform settings" title="Platform settings"><Settings2 size={21} /></NavLink>}<a className="rail-item" href="/docs/" aria-label="Documentation" title="Documentation"><CircleHelp size={21} /></a><AccountMenu context={context}/></div>
    </nav>
    {hasSidebar && sidebarOpen && <>
      <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => { setSidebarOpen(false); toggleRef.current?.focus(); }} />
      <aside className="sidebar" id="workspace-navigation">
        <div className="sidebar-heading"><strong>{destination}</strong><button type="button" aria-label="Close sidebar" onClick={() => { setSidebarOpen(false); toggleRef.current?.focus(); }}><PanelLeftClose size={19} /></button></div>
        <div className="session-context"><span>{scopeLabel}</span>{session?.operator && <details><summary>View access scope</summary><dl><dt>Organization</dt><dd>{session.operator.organization_id}</dd>{session.operator.project_id && <><dt>Project</dt><dd>{session.operator.project_id}</dd></>}<dt>Role</dt><dd>{session.operator.role}</dd></dl></details>}{isInstallation && <p>Access across this installation</p>}{!session && <p>The gateway is available. Sign in with an installation admin token to manage it.</p>}</div>
        <nav aria-label="Main navigation">
          {navigation.filter(item => item.destination === 'Workspace').map(item => <NavLink key={item.to} to={item.to} end={item.to === '.'} onClick={closeOnMobile} aria-label={item.label} className={({isActive}) => `nav-item${isActive ? ' active' : ''}`}><item.icon className="nav-icon" aria-hidden="true"/><span>{item.label}</span>{item.to === 'models' && models.length > 0 && <span className="nav-count">{models.length}</span>}</NavLink>)}
        </nav>
        <div className="sidebar-bottom"><a href="/docs/">Documentation <ArrowUpRight size={16} /></a></div>
      </aside>
    </>}
    <main className="main-panel" id="console-content" tabIndex={-1}>
      <header className="topbar">
        <div className="breadcrumbs">{hasSidebar && <button ref={toggleRef} className="sidebar-toggle" type="button" aria-label="Toggle navigation" aria-expanded={sidebarOpen} aria-controls="workspace-navigation" onClick={() => setSidebarOpen(value => !value)}><PanelLeft size={20}/></button>}{destination !== title && <><span>{destination}</span><span className="crumb-divider">/</span></>}<strong>{title}</strong></div>
        <div className="topbar-status" />
      </header>
      <div className="page-content">{gatewayStatus === 'offline' ? <section className="gateway-recovery" role="alert"><h1>Restore your gateway connection</h1><p>The console cannot reach the gateway. Restore the service before continuing.</p><p>For local development, start the stack with <code>pnpm dev</code>. For a hosted installation, ask your administrator to check the service.</p><Button onClick={() => { void refreshWorkspace(); }}>Retry connection</Button></section> : <>{destination === 'Models' && <nav className="section-tabs" aria-label="Model views"><NavLink to="models">Configured models</NavLink><a href="/models/">Browse catalog <ArrowUpRight size={16}/></a></nav>}<Outlet context={context}/></>}</div>
    </main>
  </div>;
}
