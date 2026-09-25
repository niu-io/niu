import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { LayoutDashboard, Boxes, KeyRound, ChartNoAxesCombined, Settings, ChevronDown, ArrowUpRight, ArrowRight, RefreshCw, CircleHelp, Network, Activity } from "lucide-react";
import { useEffect, useState } from 'react';
import KeysPage from './KeysPage';
import CostsPage from './CostsPage';
import logo from '../../../branding/assets/niu-mark.png';

type Model = { id: string; provider: string; upstream_model: string };
type Health = { status: string; model_count: number };

const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'models', label: 'Models', icon: Boxes },
  { id: 'keys', label: 'API keys', icon: KeyRound },
  { id: 'usage', label: 'Usage & cost', icon: ChartNoAxesCombined },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [active, setActive] = useState('overview');
  const [token, setToken] = useState('');
  const [draftToken, setDraftToken] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/healthz')
      .then((response) => response.json())
      .then((value: Health) => setHealth(value))
      .catch(() => setHealth(null));
  }, []);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const response = await fetch('/admin/v1/models', {
      headers: { authorization: `Bearer ${draftToken}` },
    }).catch(() => null);
    if (!response?.ok) {
      setError('The admin token was rejected or the Niu gateway is unavailable.');
      return;
    }
    const value = (await response.json()) as { data: Model[] };
    setModels(value.data);
    setToken(draftToken);
    setDraftToken('');
  }

  async function refreshModels() {
    const response = await fetch('/admin/v1/models', {
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (response?.ok) {
      const value = (await response.json()) as { data: Model[] };
      setModels(value.data);
    }
  }

  const title = navigation.find((item) => item.id === active)?.label ?? 'Overview';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <img src={logo} alt="" /><span className="brand-name">niu.io</span>
          <span className="console-label">Console</span>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-mark">N</span>
          <span className="workspace-name">Niu workspace</span>
          <ChevronDown className="chevron" size={14} />
        </div>
        <nav aria-label="Main navigation">
          <p className="nav-caption">WORKSPACE</p>
          {navigation.map((item) => (
            <Button
              variant="ghost" aria-label={item.label} aria-current={active === item.id ? "page" : undefined} className={`nav-item ${active === item.id ? 'active' : ''}`}
              key={item.id}
              onClick={() => setActive(item.id)}
              type="button"
            >
              <item.icon className="nav-icon" aria-hidden="true" />
              <span>{item.label}</span>
              {item.id === 'models' && models.length > 0 && <span className="nav-count">{models.length}</span>}
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="https://docs.niu.io" rel="noreferrer" target="_blank">Documentation <ArrowUpRight size={14} /></a>
          <div className="user-chip"><span className="avatar">A</span><span>Administrator</span><ChevronDown className="chevron" size={14} /></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-divider">/</span><strong>{title}</strong></div>
          <div className="topbar-actions">
            <span className={`status-pill ${health?.status === 'ok' ? 'online' : 'offline'}`}>
              <span className="status-dot" />{health?.status === 'ok' ? 'Gateway online' : 'Connecting'}
            </span>
            {token && <Button variant="ghost" size="sm" type="button" onClick={() => { setToken(''); setModels([]); setError(''); }}>Disconnect</Button>}
            <Button variant="outline" size="icon" asChild><a href="https://docs.niu.io" aria-label="Help" target="_blank" rel="noreferrer"><CircleHelp /></a></Button>
          </div>
        </header>

        <div className="page-content">
          {active === 'overview' && (
            <>
              <div className="page-heading">
                <div><p className="eyebrow">MONITOR YOUR AI STACK</p><h1>Overview</h1><p className="page-subtitle">A live view of the models and traffic managed by Niu.</p></div>
                <Button variant="outline" onClick={() => void refreshModels()} type="button"><RefreshCw size={14} /> <span>Refresh</span></Button>
              </div>
              <div className="metric-grid">
                <Metric label="Gateway status" value={health?.status === 'ok' ? 'Operational' : 'Waiting'} detail="Health endpoint" accent="green" />
                <Metric label="Configured models" value={String(health?.model_count ?? '—')} detail="Available routes" accent="blue" />
                <Metric label="Requests today" value="—" detail="Usage reporting is not connected" accent="violet" />
                <Metric label="Provider spend" value="—" detail="Cost ledger is not connected" accent="amber" />
              </div>
              <section className="panel model-panel">
                <div className="panel-heading"><div><h2>Model routes</h2><p>Models exposed through the Niu gateway.</p></div><Button variant="ghost" size="sm" onClick={() => setActive('models')} type="button">View all <ArrowRight size={14} /></Button></div>
                {token ? <ModelTable models={models.slice(0, 5)} /> : <ConnectPrompt draft={draftToken} error={error} onChange={setDraftToken} onSubmit={connect} />}
              </section>
              <section className="panel setup-panel">
                <div className="setup-icon"><Network size={20} /></div>
                <div className="setup-copy"><h2>Build on one unified gateway</h2><p>Connect providers once, then control routing, security, and cost from a single place.</p></div>
                <Button  onClick={() => setActive('models')} type="button">Explore models <ArrowRight size={14} /></Button>
              </section>
            </>
          )}

          {active === 'models' && <Page title="Models" subtitle="Review the provider routes exposed by this Niu gateway."><section className="panel"><div className="panel-heading"><div><h2>Configured routes</h2><p>Provider credentials stay on the server.</p></div><Button variant="outline" onClick={() => void refreshModels()} type="button"><RefreshCw size={14} /> <span>Refresh</span></Button></div>{token ? <ModelTable models={models} /> : <ConnectPrompt draft={draftToken} error={error} onChange={setDraftToken} onSubmit={connect} />}</section></Page>}
          {active === 'keys' && (token ? <KeysPage key={token} token={token} models={models.map(model => model.id)} /> : <Page title="API keys" subtitle="Connect to manage organizations, projects and client keys."><section className="panel"><ConnectPrompt draft={draftToken} error={error} onChange={setDraftToken} onSubmit={connect} /></section></Page>)}
          {active === 'usage' && (token ? <CostsPage key={token} token={token} /> : <Page title="Usage & cost" subtitle="Connect to inspect project accounting."><section className="panel"><ConnectPrompt draft={draftToken} error={error} onChange={setDraftToken} onSubmit={connect} /></section></Page>)}
          {active === 'settings' && <Placeholder title="Settings" detail="Workspace identity, authentication, provider policy, and configuration publishing will be managed here." />}
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  return <article className="metric-card"><div className={`metric-icon ${accent}`}><Activity size={15} /></div><p>{label}</p><strong>{value}</strong><small>{detail}</small></article>;
}

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <><div className="page-heading"><div><p className="eyebrow">CONTROL PLANE</p><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div></div>{children}</>;
}

function ModelTable({ models }: { models: Model[] }) {
  if (models.length === 0) return <div className="empty-state"><div className="empty-icon"><Boxes size={18} /></div><strong>No model routes yet</strong><span>Add a model route to the gateway configuration to see it here.</span></div>;
  return <div className="table-wrap"><Table><TableHeader><TableRow><TableHead>MODEL</TableHead><TableHead>PROVIDER</TableHead><TableHead>UPSTREAM MODEL</TableHead><TableHead>STATUS</TableHead></TableRow></TableHeader><TableBody>{models.map((model) => <TableRow key={model.id}><TableCell><span className="model-mark"><Boxes size={16} /></span><strong>{model.id}</strong></TableCell><TableCell><Badge variant="outline">{model.provider}</Badge></TableCell><TableCell className="mono">{model.upstream_model}</TableCell><TableCell><span className="status-pill online"><span className="status-dot" />Configured</span></TableCell></TableRow>)}</TableBody></Table></div>;
}

function ConnectPrompt({ draft, error, onChange, onSubmit }: { draft: string; error: string; onChange: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <div className="connect-panel"><div className="empty-icon"><KeyRound size={18} /></div><div><strong>Connect to the gateway admin API</strong><p>Enter the admin token configured for this Niu instance. It stays in this browser tab.</p>{error && <p className="error-text">{error}</p>}<form onSubmit={onSubmit}><Input aria-label="Admin token" autoComplete="off" onChange={(event) => onChange(event.target.value)} placeholder="Admin token" type="password" value={draft} /><Button  type="submit">Connect</Button></form></div></div>;
}

function Placeholder({ title, detail }: { title: string; detail: string }) {
  return <Page title={title} subtitle={detail}><section className="panel coming-panel"><div className="coming-art"><Network size={32} /></div><div><span className="coming-label">IN DEVELOPMENT</span><h2>{title} is part of the Niu product</h2><p>{detail}</p></div></section></Page>;
}
