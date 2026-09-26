import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, ChevronDown, CircleHelp } from 'lucide-react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import type { ConsoleContext, GatewayStatus, Health, Model } from './console-context';
import { navigation } from './navigation';
import logo from '../../../../branding/assets/niu-mark.png';

export default function AppLayout() {
  const [token, setToken] = useState('');
  const [draftToken, setDraftToken] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthChecked, setHealthChecked] = useState(false);
  const [error, setError] = useState('');
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
    try {
      const response = await fetch('/admin/v1/models', {
        headers: { authorization: `Bearer ${draftToken}` },
      });
      if (!response.ok) {
        setError('The admin token was rejected or the Niu gateway is unavailable.');
        return;
      }
      const value = await response.json() as { data: Model[] };
      setModels(value.data);
      setToken(draftToken);
      setDraftToken('');
    } catch {
      setError('The admin token was rejected or the Niu gateway is unavailable.');
    }
  }, [draftToken]);

  const refreshModels = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch('/admin/v1/models', {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const value = await response.json() as { data: Model[] };
      setModels(value.data);
    } catch {
      // Keep the last known route list visible during a transient gateway failure.
    }
  }, [token]);

  const refreshWorkspace = useCallback(async () => {
    try {
      const response = await fetch('/healthz');
      if (!response.ok) throw new Error('Health check failed');
      setHealth(await response.json() as Health);
    } catch {
      setHealth(null);
    }
    setHealthChecked(true);
    await refreshModels();
  }, [refreshModels]);

  const disconnect = useCallback(() => {
    setToken('');
    setModels([]);
    setError('');
  }, []);

  const gatewayStatus: GatewayStatus = health?.status === 'ok'
    ? 'online'
    : healthChecked
      ? 'offline'
      : 'checking';
  const context = useMemo<ConsoleContext>(() => ({
    token,
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
  }), [token, draftToken, models, health, gatewayStatus, error, connect, refreshModels, refreshWorkspace, disconnect]);
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
        <div className="user-chip"><span className="avatar">A</span><span>Administrator</span><ChevronDown className="chevron" size={14} /></div>
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
