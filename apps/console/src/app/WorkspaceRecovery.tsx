import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import type { WorkspaceProblem } from './console-context';

export default function WorkspaceRecovery({ problem, onRetry }: {
  problem: WorkspaceProblem;
  onRetry: () => void;
}) {
  if (problem.kind === 'missing') return <section className="workspace-recovery" role="alert" aria-labelledby="workspace-recovery-title">
    <div className="workspace-recovery-icon"><AlertTriangle aria-hidden="true" size={22} /></div>
    <div className="workspace-recovery-copy">
      <p className="workspace-recovery-label">Workspace unavailable</p>
      <h2 id="workspace-recovery-title">This workspace link can’t be opened</h2>
      <p>The workspace <code>{problem.workspace}</code> is not available to this account. Choose an accessible workspace to continue.</p>
      <div className="workspace-recovery-actions">
        <Button asChild><Link to="/workspaces/default/">Open an available workspace<ArrowRight aria-hidden="true" size={16} /></Link></Button>
        <Button type="button" variant="ghost" onClick={onRetry}><RefreshCw aria-hidden="true" size={16} />Check again</Button>
      </div>
    </div>
  </section>;

  const versionMismatch = problem.kind === 'api' && problem.status === 404;
  const unauthorized = problem.kind === 'api' && problem.status === 401;
  const forbidden = problem.kind === 'api' && problem.status === 403;
  const heading = versionMismatch
    ? 'This console and gateway are out of sync'
    : unauthorized
      ? 'Administrator access needs to be renewed'
      : forbidden
        ? 'You don’t have access to this workspace'
        : 'Workspace data isn’t available';
  const description = versionMismatch
    ? 'The gateway is responding, but it does not recognize the workspace API used by this console. Update or restart the gateway so both are on the same release.'
    : unauthorized
      ? 'The gateway rejected the request to load workspaces. Sign in again with an installation administrator credential, then retry.'
      : forbidden
        ? 'This administrator session cannot list workspaces. Sign in with installation administrator access or ask an administrator to grant access.'
        : problem.kind === 'network'
          ? 'The console could not reach the workspace management API. Check the gateway process, then retry.'
          : 'The gateway returned a response the console could not use. Check the gateway version and retry.';

  return <section className="workspace-recovery" role="alert" aria-labelledby="workspace-recovery-title">
    <div className={`workspace-recovery-icon${versionMismatch || unauthorized || forbidden ? ' is-warning' : ''}`}><AlertTriangle aria-hidden="true" size={22} /></div>
    <div className="workspace-recovery-copy">
      <p className="workspace-recovery-label">Workspace access</p>
      <h2 id="workspace-recovery-title">{heading}</h2>
      <p>{description}</p>
      {problem.kind === 'api' && <div className="workspace-recovery-request">
        <span>Request</span>
        <code>GET {problem.endpoint}</code>
        <strong>HTTP {problem.status}</strong>
      </div>}
      <div className="workspace-recovery-actions">
        <Button type="button" onClick={onRetry}><RefreshCw aria-hidden="true" size={16} />Retry workspace access</Button>
        {versionMismatch && <span>Restarting the gateway keeps its database data in place.</span>}
      </div>
    </div>
  </section>;
}
