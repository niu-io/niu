import { useEffect, useState } from 'react';
import { ArrowUpRight, KeyRound, Plus, RefreshCw } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useConsoleContext } from '@/app/console-context';
import { keyRequest, keyStatus, projectKeyPath, workspacePath, type ProjectKey } from '../api';

export default function KeysView({ token, models, canWrite, initialScope }: {
  token: string;
  models: string[];
  canWrite: boolean;
  initialScope: { organizationId: string; projectId: string } | null;
}) {
  const { workspace, workspaceLoading } = useConsoleContext();
  const location = useLocation();
  const [keys, setKeys] = useState<ProjectKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const root = workspacePath(location.pathname);
  const collectionPath = initialScope ? projectKeyPath(initialScope.organizationId, initialScope.projectId) : '';

  async function reload() {
    if (!collectionPath) return;
    setLoading(true);
    setError('');
    try {
      const value = await keyRequest<{ data: ProjectKey[] }>(token, collectionPath);
      setKeys(value.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load API keys.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [collectionPath, token]);

  const canIssue = canWrite && Boolean(workspace) && models.length > 0;
  const issueButton = canIssue
    ? <Button asChild><Link to={`${root}/keys/new`}><Plus size={16} />New API key</Link></Button>
    : null;

  return <div className="keys-page">
    {!workspaceLoading && !workspace && <p className="key-scope-empty">Choose a workspace from the sidebar to manage its keys.</p>}
    {workspace && <div className="keys-toolbar">
      <div className="keys-scope"><strong>{workspace.name}</strong><span>{keys.length} key{keys.length === 1 ? '' : 's'}</span></div>
      <div className="keys-toolbar-actions">
        <Button type="button" variant="ghost" size="icon" aria-label="Refresh API keys" title="Refresh" disabled={loading} onClick={() => void reload()}><RefreshCw size={16} /></Button>
        {issueButton}
      </div>
    </div>}
    {!models.length && workspace && <section className="key-prerequisite" role="status">
      <div><KeyRound size={19} /><strong>Connect a model before creating a key</strong></div>
      <Button asChild variant="outline"><Link to={`${root}/vendors`}>Connect provider<ArrowUpRight size={14} /></Link></Button>
    </section>}
    {!canWrite && workspace && <p className="key-read-only">This session can view keys but cannot create, rotate, or revoke them.</p>}
    {error && <p className="key-error" role="alert">{error}<Button type="button" variant="ghost" size="sm" onClick={() => void reload()}>Try again</Button></p>}
    {workspace && <section className="key-list" aria-label="API keys" aria-busy={loading}>
      {loading && !keys.length && <p className="key-list-state" role="status">Loading keys…</p>}
      {!loading && !error && !keys.length && <div className="key-empty">
        <span><KeyRound size={20} /></span><strong>No API keys yet</strong>
        {canIssue ? issueButton : !models.length ? <Link to={`${root}/vendors`}>Connect a provider to continue<ArrowUpRight size={14} /></Link> : null}
      </div>}
      {keys.length > 0 && <Table className="key-table"><TableHeader><TableRow>
        <TableHead>Key</TableHead><TableHead>Models</TableHead><TableHead>Expires</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Open</span></TableHead>
      </TableRow></TableHeader><TableBody>{keys.map(key => <TableRow key={key.id}>
        <TableCell><Link className="key-name-link" to={`${root}/keys/${encodeURIComponent(key.id)}`}><KeyRound size={15} />{key.name}</Link></TableCell>
        <TableCell><span className="key-model-summary" title={key.allowed_models.join(', ')}>{key.allowed_models.join(', ')}</span></TableCell>
        <TableCell>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(key.expires_at_ms))}</TableCell>
        <TableCell><Badge variant={key.revoked || key.expired ? 'secondary' : 'outline'}>{keyStatus(key)}</Badge></TableCell>
        <TableCell><Link className="key-open-link" to={`${root}/keys/${encodeURIComponent(key.id)}`} aria-label={`View ${key.name} usage`}><ArrowUpRight size={16} /></Link></TableCell>
      </TableRow>)}</TableBody></Table>}
    </section>}
  </div>;
}
