import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState } from 'react';
import { IconBan as Ban } from "@tabler/icons-react";
import { IconCheck as Check } from "@tabler/icons-react";
import { IconEye as Eye, IconEyeOff as EyeOff } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconRefresh as RotateCw } from "@tabler/icons-react";
import { IconCopy as Copy } from "@tabler/icons-react";
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import PageHeader from '@/components/PageHeader';
import { formatUnitAtoms, money } from '@/lib/money';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { cachedKeyGet, formatMaskedKey, keyRequest, keyStatus, keyLastUsed, peekCachedKeyGet, workspaceKeyPath, workspacePath, type ProjectKey } from '../api';
import GatewayActivity from '@/features/executions/components/GatewayActivity';
import KeyHistoryDialog from './KeyHistoryDialog';
import KeyLimits from './KeyLimits';
import KeySettingsEditor from './KeySettingsEditor';

type Scope = { organizationId: string; projectId: string };

export default function KeyDetailView({ token, models, canWrite, canConfigureSpending = false, initialScope, initialData }: {
  token: string;
  models: string[];
  canWrite: boolean;
  canConfigureSpending?: boolean;
  initialScope: Scope | null;
  initialData?: { data: ProjectKey[] };
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const { currency: platformCurrency } = usePlatformCurrency();
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
  const adminCollectionPath = collectionPath;
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
  const [revokeError, setRevokeError] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState('');
  const [secretVisible, setSecretVisible] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedRotatedSecret, setCopiedRotatedSecret] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const rotateButtonRef = useRef<HTMLButtonElement>(null);
  const revokeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreEditFocus = useRef(false);
  const autoOpenedEdit = useRef('');
  useEffect(() => {
    if (!editing && restoreEditFocus.current) {
      restoreEditFocus.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    setConfirmRevoke(false);setConfirmRotate(false);setNotice('');setRevoking(false);setRotating(false);setRotateError('');setRevokeError('');
    setEditing(false);
    setRevealedSecret('');setSecretVisible(false);setCopiedSecret(false);
    return () => { revokeController.current?.abort(); };
  }, [token, collectionPath, keyId]);

  useEffect(() => {
    if (initialData && revision === 0) {
      setKeys(initialData.data);
      setLoadedScope(scopeIdentity);
      setLoading(false);
    }
  }, [initialData, revision, scopeIdentity]);

  useEffect(() => {
    if (!collectionPath) { setLoading(false); return; }
    const controller = new AbortController();
    const cached = revision === 0 ? peekCachedKeyGet<{ data: ProjectKey[] }>(token, collectionPath) : undefined;
    if (cached) {
      setKeys(cached.data);
      setLoadedScope(scopeIdentity);
      setLoading(false);
    } else if (loadedScope !== scopeIdentity) {
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
    if (key?.slug && key.slug !== keyId) navigate({pathname: `${root}/keys/${encodeURIComponent(key.slug)}`, search:location.search, hash:location.hash}, {replace:true, state: location.state});
  }, [key?.slug, keyId, root, location.search, location.hash, location.state, navigate]);

  useEffect(() => {
    if (!key || !initialScope || !canWrite || key.revoked || key.expired || !key.revision) return;
    const state = location.state as { editKey?: boolean } | null;
    if (!state?.editKey) return;
    const signature = `${token}:${key.id}:${location.key}`;
    if (autoOpenedEdit.current === signature) return;
    autoOpenedEdit.current = signature;
    setEditing(true);
    setError('');
    setNotice('');
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null });
  }, [key, initialScope, canWrite, token, location.key, location.pathname, location.search, location.hash, location.state, navigate]);

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
    setRevokeError('');
    try {
      await keyRequest<void>(token, `${collectionPath}/${encodeURIComponent(key.id)}`, 'DELETE', undefined, controller.signal);
      if (controller.signal.aborted) return;
      setKeys(current => current.map(item => item.id === key.id ? { ...item, revoked: true } : item));
      setConfirmRevoke(false);
      setNotice('Key revoked. Requests using it will be rejected.');
    } catch (cause) {
      if (!controller.signal.aborted) setRevokeError(cause instanceof Error ? cause.message : 'Could not revoke this key.');
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
      setRevealedSecret(result.token);
      setConfirmRotate(false);
      setNotice('Key rotated. The previous secret no longer works.');
      setRevision(value => value + 1);
    } catch (cause) {
      setRotateError(cause instanceof Error ? cause.message : 'Could not rotate this key.');
    } finally {
      setRotating(false);
    }
  }

  async function fetchDetailSecret(): Promise<string | null> {
    if (!key) return null;
    const existing = revealedSecret || key.token;
    if (existing) return existing;
    if (!collectionPath) return null;
    try {
      setError('');
      const res = await keyRequest<ProjectKey & { data?: ProjectKey[] }>(token, `${collectionPath}/${encodeURIComponent(key.id)}?reveal=true`, 'GET');
      const secret = res?.token ?? res?.data?.find(item => item.id === key.id)?.token ?? null;
      if (!secret) {
        setError('This key was created before secret reveal was enabled. Rotate the key once to enable reveal and copy.');
        return null;
      }
      setRevealedSecret(secret);
      return secret;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reveal this API key.');
      return null;
    }
  }

  async function toggleRevealSecret() {
    if (secretVisible) {
      setSecretVisible(false);
      return;
    }
    const secret = await fetchDetailSecret();
    if (secret) setSecretVisible(true);
  }

  async function copyDetailSecret() {
    const secret = await fetchDetailSecret();
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopiedSecret(true);
      window.setTimeout(() => setCopiedSecret(false), 1800);
    } catch {
      setError('Clipboard access is unavailable. Select and copy the value instead.');
    }
  }

  const describeLimit = (value: number | null) => value === null ? uiT("Unlimited") : value === 0 ? uiT("0 · New requests blocked") : value.toLocaleString(readUILocale());
  const keyPath = key && adminCollectionPath ? `${adminCollectionPath}/${encodeURIComponent(key.id)}` : '';

  const cidrs = key ? (key.ip_policy ? key.ip_policy.allowed_cidrs : key.allowed_cidrs ?? null) : null;
  const configuredSpendingRows = key ? (key.spending_limits ?? []).filter(row => row.limit_nanos !== null || BigInt(/^\d+$/.test(row.committed_nanos) ? row.committed_nanos : '0') > 0n) : [];
  const spendingRows = platformCurrency && !configuredSpendingRows.some(row => row.currency === platformCurrency)
    ? [...configuredSpendingRows, { currency: platformCurrency, limit_nanos: null, committed_nanos: '0', remaining_nanos: null }]
    : configuredSpendingRows;
  const unitSpending = key?.unit_spending_limit ?? null;
  const showUnitSpending = Boolean(unitSpending && (unitSpending.limit_atoms !== null || unitSpending.unit !== null || BigInt(unitSpending.committed_atoms) > 0n));
  const unitSpendingName = unitSpending?.unit?.name ?? uiT("Credits");
  const unitSpendingPrecision = unitSpending?.unit?.display_precision ?? 2;

  return <>
    <PageHeader title={key?.name ?? uiT("API key")} syncRouteTitle={Boolean(key?.name)} routeTitleKey={location.pathname} action={key ? <Badge variant={key.revoked || key.expired ? 'secondary' : 'outline'} className="lifecycle-badge" data-tone={key.revoked || key.expired ? 'inactive' : 'active'}><span className="status-dot" aria-hidden="true" />{uiT(keyStatus(key))}</Badge> : undefined} />
    {error && <div className="grid justify-items-start gap-2"><p role="alert" className="key-page-error">{uiT(error)}</p>{loadFailed && <Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}>{uiT("Retry API key")}</Button>}</div>}
    {notice && <p role="status" className="key-revoke-notice"><Check size={15} />{uiT(notice)}</p>}
    {(loading || (Boolean(collectionPath) && loadedScope !== scopeIdentity && !loadFailed)) && !key && <section className="key-detail-card border-0 bg-transparent p-0 shadow-none"><FormSectionSkeleton fields={3} label={uiT("Loading key…")} /></section>}
    {!loading && !loadFailed && loadedScope === scopeIdentity && !key && <section className="key-detail-card key-not-found border-0 bg-muted/40 p-6 shadow-none"><KeyRound size={20} /><strong>{uiT("This key could not be found or accessed in this workspace.")}</strong><Link to={`${root}/keys`}>{uiT("Return to keys")}</Link></section>}
    {key && <>
      {(key.revoked || key.expired) && <Alert className="mb-4"><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{key.revoked ? uiT("This API key was revoked and cannot send new requests.", "此 API 密钥已撤销，无法发送新请求。") : uiT("This API key has expired and cannot send new requests.", "此 API 密钥已过期，无法发送新请求。")}</span>{canWrite && initialScope && <Button asChild variant="outline" size="sm"><Link to={`${root}/keys`} state={{createKey: true}}>{uiT("Create replacement key", "创建替代密钥")}</Link></Button>}</AlertDescription></Alert>}
      <section className="key-detail-card rounded-[var(--radius-panel)] border-0 bg-card p-6 shadow-none" aria-label={uiT("API key details")}>
        <h2 className="sr-only">{key.name}</h2>
        <dl className="key-detail-facts">
          {canWrite && !key.revoked && !key.expired && <div className="col-span-full">
            <dt>{uiT("API key")}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 font-mono text-xs break-all select-all">{secretVisible && (revealedSecret || key.token) ? (revealedSecret || key.token) : formatMaskedKey(revealedSecret || key.token, key.token_preview)}</code>
              <Button type="button" variant="outline" size="sm" onClick={() => void toggleRevealSecret()}>{secretVisible ? <EyeOff size={14} /> : <Eye size={14} />}{secretVisible ? uiT("Hide API key") : uiT("Reveal API key")}</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void copyDetailSecret()}>{copiedSecret ? <Check size={14} /> : <Copy size={14} />}{copiedSecret ? uiT("Copied") : uiT("Copy key")}</Button>
            </dd>
          </div>}
          <div><dt>{uiT("Allowed models")}</dt><dd>{key.allowed_models.includes('*') ? uiT("All configured models") : key.allowed_models.length ? key.allowed_models.join(', ') : uiT("None")}</dd></div>
          <div><dt>{uiT("Model calls")}</dt><dd>{key.invocation_allowed === false ? uiT("Blocked (management only)") : key.invocation_allowed === true ? (key.invocation_protocols?.length ? (key.invocation_protocols.length >= 7 ? <>{uiT("All model endpoints")}<span className="sr-only"> ({key.invocation_protocols.map(protocolLabel).join(', ')})</span></> : `${uiT("Allowed for")} ${key.invocation_protocols.map(protocolLabel).join(', ')}`) : uiT("Allowed; interface scope not reported")) : uiT("Not reported")}</dd></div>
          <div><dt>{uiT("Limits")}</dt><dd><span className="block">{uiT("Requests per minute")}: {describeLimit(getKeyRpm(key))}</span><span className="block">{uiT("Concurrent requests")}: {describeLimit(getKeyConc(key))}</span><span className="block">{uiT("Tokens per minute")}: {describeLimit(getKeyTpm(key))}</span></dd></div>
          <div><dt>{uiT("Source IP access")}</dt><dd><span className="block">{cidrs === null || cidrs === undefined ? uiT("Allow all sources") : cidrs.length ? (cidrs.length === 1 ? uiT("1 allowed network") : uiF("{0} allowed networks", [cidrs.length])) : uiT("Block all sources")}</span>{cidrs?.length ? <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">{cidrs.join(', ')}</span> : null}</dd></div>
          <div><dt>{uiT("Spending limits")}</dt><dd>{!showUnitSpending && !spendingRows.length ? uiT("Unlimited") : <>{showUnitSpending && unitSpending && <span className="block">{unitSpendingName}: {unitSpending.limit_atoms === null ? uiT("Unlimited") : `${formatUnitAtoms(unitSpending.committed_atoms, unitSpendingName, unitSpendingPrecision)} / ${formatUnitAtoms(unitSpending.limit_atoms, unitSpendingName, unitSpendingPrecision)}`}</span>}{spendingRows.map(row => <span key={row.currency} className="block">{row.currency}: {row.limit_nanos === null ? uiT("Unlimited") : `${money(row.committed_nanos, row.currency)} / ${money(row.limit_nanos, row.currency)}`}</span>)}</>}</dd></div>
          <div><dt>{uiT("Expires")}</dt><dd>{key.expires_at_ms === null ? uiT("Never") : new Intl.DateTimeFormat(readUILocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(key.expires_at_ms))}</dd></div>
          <div><dt>{uiT("Last used")}</dt><dd>{keyLastUsed(key)}</dd></div>
        </dl>
        <div className="key-revoke-actions">
          {initialScope && canWrite && !key.revoked && !key.expired && key.revision && <Button ref={editButtonRef} type="button" variant="outline" onClick={startEdit}>{uiT("Edit key")}</Button>}
          {initialScope && keyPath && <KeyHistoryDialog token={token} projectKey={key} keyPath={keyPath} />}
          {canWrite && !key.revoked && <>
            <Button ref={rotateButtonRef} type="button" variant="outline" onClick={() => { setConfirmRotate(true); setRotateError(''); }}><RotateCw size={15} />{uiT("Rotate key")}</Button>
            <Button ref={revokeButtonRef} type="button" variant="outline" onClick={() => { setConfirmRevoke(true); setRevokeError(''); }}><Ban size={15} />{uiT("Revoke key")}</Button>
          </>}
        </div>
      </section>
      {initialScope && keyPath && <KeyLimits key={`${token}:${key.id}:usage`} token={token} projectKey={key} keyPath={keyPath} onInspectRequest={(attemptId,opener)=>setCapacityRequest({attemptId,opener,nonce:Date.now()})} />}
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
      <Dialog open={editing && Boolean(initialScope) && Boolean(keyPath)} onOpenChange={open => { if (!open) { restoreEditFocus.current = true; setEditing(false); setError(''); } }}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-2xl" onCloseAutoFocus={event => { if (editButtonRef.current?.isConnected) { event.preventDefault(); editButtonRef.current.focus(); } }}>
          <DialogHeader className="shrink-0">
            <DialogTitle>{uiT("Edit key", "编辑密钥")}</DialogTitle>
            <DialogDescription>{uiT("Update model access, throughput limits, source IP restrictions, spending allowance, and Guardrails.", "更新此密钥的模型访问范围、速率限制、来源 IP 限制、消费额度及护栏策略。")}</DialogDescription>
          </DialogHeader>
          {editing && initialScope && keyPath && <KeySettingsEditor
            key={`${key.id}:${key.revision ?? 0}`}
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
              restoreEditFocus.current = true;
              setEditing(false);
              setNotice('Key settings saved.');
            }}
            onReload={() => { restoreEditFocus.current = true; setEditing(false); setRevision(value => value + 1); }}
            onCancel={() => { restoreEditFocus.current = true; setEditing(false); setError(''); }}
          />}
        </DialogContent>
      </Dialog>
      <Dialog open={confirmRotate} onOpenChange={open => { if (!rotating) { setConfirmRotate(open); if (!open) setRotateError(''); } }}>
        <DialogContent onCloseAutoFocus={event => { if (!rotatedSecret && rotateButtonRef.current?.isConnected) { event.preventDefault(); rotateButtonRef.current.focus(); } }}>
          <DialogHeader>
            <DialogTitle>{uiT("Rotate API key")}</DialogTitle>
            <DialogDescription>{uiT("Rotate this key now? The current secret stops working.")}</DialogDescription>
          </DialogHeader>
          {rotateError && <Alert variant="destructive"><AlertDescription>{uiT(rotateError)}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={rotating} onClick={() => { setConfirmRotate(false); setRotateError(''); }}>{uiT("Keep key")}</Button>
            <Button type="button" variant="destructive" disabled={rotating} onClick={() => void rotate()}>{rotating ? uiT("Rotating…") : uiT("Confirm rotate")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmRevoke} onOpenChange={open => { if (!revoking) { setConfirmRevoke(open); if (!open) setRevokeError(''); } }}>
        <DialogContent onCloseAutoFocus={event => { if (revokeButtonRef.current?.isConnected) { event.preventDefault(); revokeButtonRef.current.focus(); } }}>
          <DialogHeader>
            <DialogTitle>{uiT("Revoke API key")}</DialogTitle>
            <DialogDescription>{uiT("Revoke this key now?")}</DialogDescription>
          </DialogHeader>
          {revokeError && <Alert variant="destructive"><AlertDescription>{uiT(revokeError)}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={revoking} onClick={() => { setConfirmRevoke(false); setRevokeError(''); }}>{uiT("Keep key")}</Button>
            <Button type="button" variant="destructive" disabled={revoking} onClick={() => void revoke()}>{revoking ? uiT("Revoking…") : uiT("Confirm revoke")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>}
    <Dialog open={Boolean(rotatedSecret)} onOpenChange={open => { if (!open) { setRotatedSecret(''); setCopiedRotatedSecret(false); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{uiT("Save the replacement API key")}</DialogTitle><DialogDescription>{uiT("The previous secret no longer works. You can also reveal and copy this secret anytime from the key details.")}</DialogDescription></DialogHeader>
        <div className="grid gap-2"><Label htmlFor="rotated-key-secret">{uiT("API key secret")}</Label><Input id="rotated-key-secret" readOnly value={rotatedSecret} className="font-mono text-xs" /></div>
        <DialogFooter><Button variant="outline" onClick={() => { setRotatedSecret(''); setCopiedRotatedSecret(false); }}>{uiT("Close")}</Button><Button onClick={() => { void navigator.clipboard.writeText(rotatedSecret).then(() => { setCopiedRotatedSecret(true); window.setTimeout(() => setCopiedRotatedSecret(false), 1800); }).catch(() => undefined); }}>{copiedRotatedSecret ? <Check size={15} /> : <Copy size={15} />}{copiedRotatedSecret ? uiT("Copied") : uiT("Copy secret")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
