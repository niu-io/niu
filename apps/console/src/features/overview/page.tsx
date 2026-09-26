import { Link } from 'react-router';
import {
  Activity,
  ArrowRight,
  Boxes,
  Bot,
  CheckCircle2,
  FlaskConical,
  GitBranch,
  Network,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConnectPrompt from '@/components/ConnectPrompt';
import WorkflowCard from './components/WorkflowCard';
import { useConsoleContext } from '@/app/console-context';

export default function OverviewRoute() {
  const { token, draftToken, setDraftToken, models, health, gatewayStatus, error, connect, refreshWorkspace } = useConsoleContext();

  return <>
    <div className="page-heading overview-heading">
      <div><p className="eyebrow">Agent observability</p><h1>See the work behind agent runs.</h1><p className="page-subtitle">Inspect a task across agents, model and tool calls, outcome evidence, and observed cost.</p></div>
      <Button variant="outline" onClick={() => void refreshWorkspace()} type="button"><RefreshCw size={14} /> <span>Refresh</span></Button>
    </div>
    <section className="overview-gateway panel" aria-label="Gateway connection">
      <div className="overview-gateway-summary">
        <span className={`overview-gateway-mark ${gatewayStatus}`}><Network size={17} /></span>
        <div className="overview-gateway-copy"><strong>Niu gateway</strong><span>{gatewayStatus === 'online' ? 'Ready to serve configured model routes' : gatewayStatus === 'checking' ? 'Checking the health endpoint' : 'The health endpoint could not be reached'}</span></div>
      </div>
      <div className="overview-gateway-count"><span>Configured routes</span><strong>{token ? models.length : health?.model_count ?? '—'}</strong></div>
      {token
        ? <Button asChild variant="outline"><Link to="models">Review models <ArrowRight size={14} /></Link></Button>
        : <ConnectPrompt draft={draftToken} error={error} onChange={setDraftToken} onSubmit={connect} />}
    </section>
    <section className="overview-trace panel" aria-labelledby="overview-trace-title">
      <div className="overview-trace-heading"><div><p className="eyebrow">One task, connected evidence</p><h2 id="overview-trace-title">Follow a run from intent to outcome</h2></div><GitBranch size={19} aria-hidden="true" /></div>
      <div className="overview-trace-flow" aria-label="Example execution structure">
        <div className="overview-trace-node task-node"><span><Activity size={16} /></span><div><strong>Task</strong><small>One accepted outcome</small></div></div>
        <span className="overview-trace-link" aria-hidden="true" />
        <div className="overview-trace-node agent-node"><span><Bot size={16} /></span><div><strong>Agents</strong><small>Delegation and parallel work</small></div></div>
        <span className="overview-trace-link" aria-hidden="true" />
        <div className="overview-trace-node calls-node"><span><Wrench size={16} /></span><div><strong>Model &amp; tool calls</strong><small>Attempts, retries and charges</small></div></div>
        <span className="overview-trace-link" aria-hidden="true" />
        <div className="overview-trace-node outcome-node"><span><CheckCircle2 size={16} /></span><div><strong>Outcome</strong><small>Claims, validation and review</small></div></div>
      </div>
      <p className="overview-trace-note">Illustrative structure. Imported records keep unknown activity and cost visible instead of filling gaps.</p>
    </section>
    <div className="overview-workflows">
      <WorkflowCard icon={Activity} title="Inspect agent runs" detail="Import metadata-only traces and review agents, tool calls, retries, and outcome evidence." action="Open executions" to="executions" />
      <WorkflowCard icon={FlaskConical} title="Compare task evidence" detail="Pair matching task runs and compare quality, latency, failures, and total observed cost." action="Open benchmarks" to="benchmarks" />
      <WorkflowCard icon={Boxes} title="Review model routes" detail="See the public aliases and provider models configured for this gateway." action="Open models" to="models" />
    </div>
  </>;
}
