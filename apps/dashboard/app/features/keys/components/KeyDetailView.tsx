import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState } from 'react';
import { IconBan as Ban } from "@tabler/icons-react";
import { IconCheck as Check } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconRefresh as RotateCw } from "@tabler/icons-react";
import { IconCopy as Copy } from "@tabler/icons-react";
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { cachedKeyGet, keyRequest, keyStatus, keyLastUsed, peekCachedKeyGet, projectKeyPath, workspaceKeyPath, workspacePath, type ProjectKey } from '../api';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import KeyGuardrails from './KeyGuardrails';
import KeyHistoryDialog from './KeyHistoryDialog';
import KeyLimits from './KeyLimits';
import KeySettingsEditor from './KeySettingsEditor';
import KeySourceAccess from './KeySourceAccess';
import KeySpendingLimits from './KeySpendingLimits';

type Scope = { organizationId: string; projectId: string };

export default function KeyDetailView({ token, models, canWrite, canConfigureSpending, initialScope, initialData }: {
  token: string;
  models: string[];
  canWrite: boolean;
  canConfigureSpending: boolean;
  initialScope: Scope | null;
  initialData?: { data: ProjectKey[] };
}) {
  const { t: uiT } = useUILocale();
  const protocolLabel = (protocol: string) => ({
    chat: uiT('Chat completions'),
    responses: uiT('Responses'),
    messages: uiT('Messages'),
    content: uiT('GenerateContent'),
    decisions: uiT('Structured decisions'),
    embeddings: uiT('Embeddings'),
    video: uiT('Video'),
  } as Record<string, string>)[protocol] ?? protocol;
  const { keyId = '' } = useParams();
  const [capacityRequest,setCapacityRequest]=useState<{attemptId:string;nonce:number;opener:HTMLElement|null}|null>(null);
  useEffect(()=>setCapacityRequest(null),[keyId,token]);
  const location = useLocation();
  const navigate = useNavigate();
  const root = workspacePath(location.pathname);
  const collectionPath = initialScope ? workspaceKeyPath(initialScope.projectId) : '';
  const adminCollectionPath = initialScope ? projectKeyPath(initialScope.organizationId, initialScope.projectId) : '';
  const scopeIdentity = JSON.stringify([token, collectionPath]);
  const initialCachedKeys = collectionPath ? peekCachedKeyGet<{ data: ProjectKey[] }>(token, collectionPath) ?? initialData : undefined;
  const [keys, setKeys] = useState<ProjectKey[]>(() => initialCachedKeys?.data ?? []);
  const [loadedScope, setLoadedScope] = useState(() => (initialCachedKeys ? scopeIdentity : ''));
  const revokeController = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(() => Boolean(collectionPath && !initialCachedKeys));
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotatedSecret, setRotatedSecret] = useState('');
  const [rotateError, setRotateError] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [guardrailRefresh, setGuardrailRefresh] = useState(0);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreEditFocus = useRef(false);
  useEffect(() => {
    if (!editing && restoreEditFocus.current) {
      restoreEditFocus.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    setConfirmRevoke(false);setNotice('');setRevoking(false);
    setEditing(false);
    return () => { revokeController.current?.abort(); };
  }, [token, collectionPath, keyId]);

  useEffect(() => {
    if (!collectionPath) { setLoading(false); return; }
    const controller = new AbortController();
    const cached = revision === 0 ? peekCachedKeyGet<{ data: ProjectKey[] }>(token, collectionPath) : undefined;
    if (cached) {
      setKeys(cached.data);
      setLoadedScope(scopeIdentity);
      setLoading(false);
    } else if (loadedScope !== scopeIdentity || keys.length === 0) {
      setLoading(true);
    }
    setLoadFailed(false);
    setError('');
    void cachedKeyGet<{ data: ProjectKey[] }>(token, collectionPath, {
      signal: controller.signal,
      force: revision > 0,
    })
      .then(result => { if (!controller.signal.aborted) {setKeys(result.data);setLoadedScope(scopeIdentity);} })
      .catch(cause => { if (!controller.signal.aborted) {setLoadFailed(true);setError(cause instanceof Error ? cause.message : 'Could not load this key.');} })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [collectionPath, keyId, token, revision, scopeIdentity]);

  const key = !loadFailed && loadedScope === scopeIdentity ? keys.find(item => item.slug === keyId || item.id === keyId) : undefined;

  useEffect(() => {
    if (key?.slug && key.slug !== keyId) navigate({pathname: `${root}/keys/${encodeURIComponent(key.slug)}`, search:location.search, hash:location.hash}, {replace:true});
  }, [key?.slug, keyId, root, location.search, location.hash, navigate]);

  const getKeyRpm = (item?: ProjectKey) => item?.request_rate_limit?.requests_per_minute ?? item?.requests_per_minute ?? null;
  const getKeyConc = (item?: ProjectKey) => item?.concurrency_limit?.max_concurrent_requests ?? item?.max_concurrent_requests ?? null;
  const getKeyTpm = (item?: ProjectKey) => item?.token_rate_limit?.tokens_per_minute ?? item?.tokens_per_minute ?? null;

  function startEdit() {
    if (!key) return;
    setEditing(true);
    setError('');
    setNotice('');
  }

  function updateKey(updated: ProjectKey) {
    if (!key) return;
    setKeys(current => current.map(item => item.id === key.id ? { ...item, ...updated } : item));
  }

  async function revoke() {
    if (!canWrite || !collectionPath || !key || revoking) return;
    const controller = new AbortController();
    revokeController.current = controller;
    setRevoking(true);
    setError('');
    try {
      await keyRequest<void>(token, `${collectionPath}/${encodeURIComponent(key.id)}`, 'DELETE', undefined, controller.signal);
      if (controller.signal.aborted) return;
      setKeys(current => current.map(item => item.id === key.id ? { ...item, revoked: true } : item));
      setConfirmRevoke(false);
      setNotice('Key revoked. Requests using it will be rejected.');
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not revoke this key.');
    } finally {
      if (!controller.signal.aborted) setRevoking(false);
    }
  }

  async function rotate() {
    if (!canWrite || !adminCollectionPath || !key || rotating) return;
    setRotating(true);
    setRotateError('');
    try {
      const result = await keyRequest<{token?: string; secret_available?: boolean}>(token, `${adminCollectionPath}/${encodeURIComponent(key.id)}/rotate`, 'POST');
      if (!result.token) throw new Error('The replacement secret was not returned. Reload the key before retrying.');
      setRotatedSecret(result.token);
      setConfirmRotate(false);
      setNotice('Key rotated. The previous secret no longer works.');
      setRevision(value => value + 1);
    } catch (cause) {
      setRotateError(cause instanceof Error ? cause.message : 'Could not rotate this key.');
    } finally {
      setRotating(false);
    }
  }

  const describeLimit = (value: number | null) => value === null ? uiT("Unlimited") : value === 0 ? uiT("0 · New requests blocked") : value.toLocaleString(readUILocale());
  const keyPath = key && adminCollectionPath ? `${adminCollectionPath}/${encodeURIComponent(key.id)}` : '';

  return <>
    {error && <div className="grid justify-items-start gap-2"><p role="alert" className="key-page-error">{error}</p>{loadFailed && <Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}>{uiT("Retry API key")}</Button>}</div>}
    {notice && <p role="status" className="key-revoke-notice"><Check size={15} />{notice}</p>}
    {loading && !key && <section className="panel key-detail-card"><FormSectionSkeleton fields={3} label={uiT("Loading key…")} /></section>}
    {!loading && !loadFailed && loadedScope === scopeIdentity && !key && <section className="panel key-detail-card key-not-found"><KeyRound size={20} /><strong>{uiT("This key could not be found or accessed in this workspace.")}</strong><Link to={`${root}/keys`}>{uiT("Return to API keys")}</Link></section>}
    {key && <>
      <section className="panel key-detail-card" aria-label={uiT("API key details")}>
        <div className="key-detail-heading"><div><span className="key-detail-icon"><KeyRound size={18} /></span><div><h2>{key.name}</h2></div></div><Badge variant={key.revoked || key.expired ? 'secondary' : 'outline'} className="lifecycle-badge" data-tone={key.revoked || key.expired ? 'inactive' : 'active'}><span className="status-dot" aria-hidden="true" />{uiT(keyStatus(key))}</Badge></div>
        {editing && initialScope && keyPath && <KeySettingsEditor
          token={token}
          projectKey={key}
          models={models}
          canWrite={canWrite}
          canConfigureSpending={canConfigureSpending}
          metadataPath={`${collectionPath}/${encodeURIComponent(key.id)}`}
          guardrailPath={`${keyPath}/guardrail`}
          workspaceGuardrailsPath={`${adminCollectionPath.replace(/\/keys$/, '')}/guardrails`}
          unitLimitPath={`${keyPath}/units/limit`}
          onKeyChanged={updateKey}
          onSaved={updated => {
            updateKey(updated);
            setEditing(false);
            setNotice('Key settings saved.');
            setGuardrailRefresh(value => value + 1);
          }}
          onReload={() => { setEditing(false); setGuardrailRefresh(value => value + 1); setRevision(value => value + 1); }}
          onCancel={() => { restoreEditFocus.current = true; setEditing(false); setError(''); }}
        />}
        {!editing && <dl className="key-detail-facts">
          <div><dt>{uiT("Allowed models")}</dt><dd>{key.allowed_models.includes('*') ? uiT("All configured models") : key.allowed_models.length ? key.allowed_models.join(', ') : uiT("None")}</dd></div>
          <div><dt>{uiT("Model calls")}</dt><dd>{key.invocation_allowed === false ? uiT("Blocked (management only)") : key.invocation_allowed === true ? (key.invocation_protocols?.length ? `${uiT("Allowed for")} ${key.invocation_protocols.map(protocolLabel).join(', ')}` : uiT("Allowed; interface scope not reported")) : uiT("Not reported")}</dd></div>
          <div><dt>{uiT("Limits")}</dt><dd><span className="block">{uiT("Requests per minute")}: {describeLimit(getKeyRpm(key))}</span><span className="block">{uiT("Concurrent requests")}: {describeLimit(getKeyConc(key))}</span><span className="block">{uiT("Tokens per minute")}: {describeLimit(getKeyTpm(key))}</span></dd></div>
          <div><dt>{uiT("Expires")}</dt><dd>{key.expires_at_ms === null ? uiT("Never") : new Intl.DateTimeFormat(readUILocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(key.expires_at_ms))}</dd></div>
          <div><dt>{uiT("Last used")}</dt><dd>{keyLastUsed(key)}</dd></div>
        </dl>}
        {!editing && <div className="key-revoke-actions">
          {initialScope && canWrite && !key.revoked && !key.expired && key.revision && <Button ref={editButtonRef} type="button" variant="outline" onClick={startEdit}>{uiT("Edit key")}</Button>}
          {initialScope && keyPath && <KeyHistoryDialog token={token} projectKey={key} keyPath={keyPath} />}
          {canWrite && !key.revoked && <>
            {!confirmRotate
              ? <Button type="button" variant="outline" onClick={() => {setConfirmRotate(true);setRotateError('');}}><RotateCw size={15} />{uiT("Rotate key")}</Button>
              : <div role="group" aria-label={uiT("Confirm API key rotation")}><span>{uiT("Rotate this key now? The current secret stops working.")}</span><Button type="button" variant="destructive" disabled={rotating} onClick={() => void rotate()}>{rotating ? uiT("Rotating…") : uiT("Confirm rotate")}</Button><Button type="button" variant="outline" disabled={rotating} onClick={() => setConfirmRotate(false)}>{uiT("Keep key")}</Button></div>}
            {rotateError && <p role="alert" className="key-page-error">{uiT(rotateError)}</p>}
            {!confirmRevoke
              ? <Button type="button" variant="outline" onClick={() => setConfirmRevoke(true)}><Ban size={15} />{uiT("Revoke key")}</Button>
              : <div role="group" aria-label={uiT("Confirm API key revocation")}><span>{uiT("Revoke this key now?")}</span><Button type="button" variant="destructive" disabled={revoking} onClick={() => void revoke()}>{revoking ? uiT("Revoking…") : uiT("Confirm revoke")}</Button><Button type="button" variant="outline" disabled={revoking} onClick={() => setConfirmRevoke(false)}>{uiT("Keep key")}</Button></div>}
          </>}
        </div>}
      </section>
      {initialScope && keyPath && <KeyGuardrails
        key={`${token}:${key.id}:guardrails:${guardrailRefresh}`}
        token={token}
        endpoint={`${keyPath}/guardrail`}
        workspaceEndpoint={`${adminCollectionPath.replace(/\/keys$/, '')}/guardrails`}
        root={root}
        canWrite={false}
        active={!key.revoked && !key.expired}
      />}
      {initialScope && keyPath && <KeyLimits key={`${token}:${key.id}:usage`} token={token} projectKey={key} keyPath={keyPath} onInspectRequest={(attemptId,opener)=>setCapacityRequest({attemptId,opener,nonce:Date.now()})} />}
      {initialScope && <KeySourceAccess key={`${token}:${key.id}:source`} projectKey={key} />}
      {initialScope && <KeySpendingLimits key={`${token}:${key.id}:spending`} projectKey={key} />}
      {initialScope && <GatewayActivity
        key={`${token}:${key.id}`}
        compact
        token={token}
        models={models}
        initialScope={initialScope}
        preferredKeyId={key.id}
        preferredKeySlug={key.slug}
        externalRequest={capacityRequest}
        onExternalRequestClose={()=>setCapacityRequest(null)}
      />}
    </>}
    <Dialog open={Boolean(rotatedSecret)} onOpenChange={open => { if (!open) setRotatedSecret(''); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{uiT("Save the replacement API key")}</DialogTitle><DialogDescription>{uiT("This secret is shown once. The previous secret no longer works.")}</DialogDescription></DialogHeader>
        <div className="grid gap-2"><Label htmlFor="rotated-key-secret">{uiT("API key secret")}</Label><Input id="rotated-key-secret" readOnly value={rotatedSecret} className="font-mono text-xs" /></div>
        <DialogFooter><Button variant="outline" onClick={() => setRotatedSecret('')}>{uiT("Close")}</Button><Button onClick={() => void navigator.clipboard.writeText(rotatedSecret)}><Copy size={15} />{uiT("Copy secret")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
