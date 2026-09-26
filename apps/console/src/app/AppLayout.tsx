import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, ChevronDown, CircleHelp } from 'lucide-react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import type { AdminSession, ConsoleContext, GatewayStatus, Health, Model } from './console-context';
import { navigation } from './navigation';
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
  const { workspace = 'default' } = useParams();

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/healthz', { signal: controller.signal })
      .then(response => response.json())
      .then((value: Health) => { if (!controller.signal.aborted) setHealth(value); })
      .catch(() => { if (!controller.signal.aborted) setHealth(null); })
      .finally(() => { if (!controller.signal.aborted) setHealthChecked(true); });
    return () => controller.abort();
  }, []);

  const connect = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    connectionController.current?.abort();
    const controller = new AbortController();
    connectionController.current = controller;
    const revision = ++connectionRevision.current;
    try {
      const sessionResponse = await fetch('/admin/v1/session', {
        headers: { authorization: 'Bearer ' + draftToken },
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
        headers: { authorization: `Bearer ${draftToken}` },
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
      setToken(draftToken);
      setDraftToken('');
    } catch {
      if (revision === connectionRevision.current) setError('The admin token was rejected or the Niu gateway is unavailable.');
    }
  }, [draftToken]);

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
          setError('This admin session has expired or been revoked. Connect with an active token.');
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

  const disconnect = useCallback(() => {
    connectionController.current?.abort();
    connectionController.current = null;
    connectionRevision.current += 1;
    setToken('');
    setDraftToken('');
    setModels([]);
    setSession(null);
    setError('');
  }, []);

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
    disconnect,
  }), [token, session, draftToken, models, health, gatewayStatus, error, connect, refreshModels, refreshWorkspace, disconnect]);
  const workspacePath = location.pathname.split('/').filter(Boolean).slice(2).join('/');
  const activePath = workspacePath || '.';
  const title = navigation.find(item => item.to === activePath)?.label ?? 'Page not found';

  useEffect(() => {
    document.title = `${title} · Niu Console`;
  }, [title]);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup">
        <img src={logo} alt="" /><span className="brand-name">niu.io</span>
        <span className="console-label">Console</span>
      </div>
      <div className="workspace-switcher">
        <span className="workspace-mark">N</span>
        <span className="workspace-name">{workspace === 'default' ? 'Niu workspace' : workspace}</span>
        <ChevronDown className="chevron" size={14} />
      </div>
      <nav aria-label="Main navigation">
        <p className="nav-caption">Workspace</p>
        {navigation.map(item => <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '.'}
          aria-label={item.label}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <item.icon className="nav-icon" aria-hidden="true" />
          <span>{item.label}</span>
          {item.to === 'models' && models.length > 0 && <span className="nav-count">{models.length}</span>}
        </NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <a href="/docs/">Documentation <ArrowUpRight size={14} /></a>
        <div className="user-chip"><span className="avatar">{session?.kind === 'operator' ? (session.operator?.role?.[0]?.toUpperCase() ?? 'O') : session?.kind === 'installation' ? 'I' : '—'}</span><span>{session?.kind === 'operator' ? (session.operator?.role ?? 'Operator') + ' session' : session?.kind === 'installation' ? 'Installation admin' : 'Not connected'}</span><ChevronDown className="chevron" size={14} /></div>
      </div>
    </aside>

    <main className="main-panel">
      <header className="topbar">
        <div className="breadcrumbs"><span>Workspace</span><span className="crumb-divider">/</span><strong>{title}</strong></div>
        <div className="topbar-actions">
          <span className={`status-pill ${gatewayStatus}`}>
            <span className="status-dot" />{gatewayStatus === 'online' ? 'Gateway online' : gatewayStatus === 'checking' ? 'Checking gateway' : 'Gateway unavailable'}
          </span>
          {token && <Button variant="ghost" size="sm" type="button" onClick={disconnect}>Disconnect</Button>}
          <Button variant="outline" size="icon" asChild><a href="/docs/" aria-label="Help"><CircleHelp /></a></Button>
        </div>
      </header>

      <div className="page-content"><Outlet context={context} /></div>
    </main>
  </div>;
}
