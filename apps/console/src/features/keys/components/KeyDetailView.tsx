import { useEffect, useState } from 'react';
import { ArrowLeft, Ban, Check, KeyRound } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { keyRequest, keyStatus, projectKeyPath, workspacePath, type ProjectKey } from '../api';
import GatewayActivity from '@/features/executions/components/GatewayActivity';

type Scope = { organizationId: string; projectId: string };

export default function KeyDetailView({ token, models, canWrite, initialScope }: {
  token: string;
  models: string[];
  canWrite: boolean;
  initialScope: Scope | null;
}) {
  const { keyId = '' } = useParams();
  const location = useLocation();
  const root = workspacePath(location.pathname);
  const [keys, setKeys] = useState<ProjectKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [notice, setNotice] = useState('');
  const collectionPath = initialScope ? projectKeyPath(initialScope.organizationId, initialScope.projectId) : '';

  useEffect(() => {
    if (!collectionPath) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void keyRequest<{ data: ProjectKey[] }>(token, collectionPath, 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setKeys(result.data); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load this key.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [collectionPath, keyId, token]);

  const key = keys.find(item => item.id === keyId);

  async function revoke() {
    if (!canWrite || !collectionPath || !key || revoking) return;
    setRevoking(true);
    setError('');
    try {
      await keyRequest<void>(token, `${collectionPath}/${encodeURIComponent(key.id)}`, 'DELETE');
      setKeys(current => current.map(item => item.id === key.id ? { ...item, revoked: true } : item));
      setConfirmRevoke(false);
      setNotice('Key revoked. Requests using it will be rejected.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not revoke this key.');
    } finally {
      setRevoking(false);
    }
  }

  return <>
    <div className="page-heading key-page-heading">
      <p className="page-subtitle">Workspace-scoped access and request activity.</p>
      <Button asChild variant="outline"><Link to={`${root}/keys`}><ArrowLeft size={15} />All API keys</Link></Button>
    </div>
    {error && <p role="alert" className="key-page-error">{error}</p>}
    {notice && <p role="status" className="key-revoke-notice"><Check size={15} />{notice}</p>}
    {loading && <section className="panel key-detail-card" role="status">Loading key…</section>}
    {!loading && !key && <section className="panel key-detail-card key-not-found"><KeyRound size={20} /><strong>This key is not in the selected workspace.</strong><Link to={`${root}/keys`}>Return to API keys</Link></section>}
    {key && <>
      <section className="panel key-detail-card" aria-label="API key details">
        <div className="key-detail-heading"><div><span className="key-detail-icon"><KeyRound size={18} /></span><div><h2>{key.name}</h2><span className="mono">{key.id}</span></div></div><Badge variant={key.revoked || key.expired ? 'secondary' : 'outline'}>{keyStatus(key)}</Badge></div>
        <dl className="key-detail-facts"><div><dt>Allowed models</dt><dd>{key.allowed_models.length ? key.allowed_models.join(', ') : 'None'}</dd></div><div><dt>Expires</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(key.expires_at_ms))}</dd></div><div><dt>Secret</dt><dd>Shown once when created</dd></div></dl>
        {canWrite && !key.revoked && <div className="key-revoke-actions">
          {!confirmRevoke
            ? <Button type="button" variant="outline" onClick={() => setConfirmRevoke(true)}><Ban size={15} />Revoke key</Button>
            : <div role="group" aria-label="Confirm API key revocation"><span>Revoke this key now?</span><Button type="button" variant="destructive" disabled={revoking} onClick={() => void revoke()}>{revoking ? 'Revoking…' : 'Confirm revoke'}</Button><Button type="button" variant="outline" disabled={revoking} onClick={() => setConfirmRevoke(false)}>Keep key</Button></div>}
        </div>}
      </section>
      {initialScope && <GatewayActivity
        key={`${token}:${key.id}`}
        compact
        token={token}
        models={models}
        initialScope={initialScope}
        preferredKeyId={key.id}
      />}
    </>}
  </>;
}
