import { translateUI } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { confirmedKeyValidationFailure, forgetKeyMutationHint, keyMutationHintKey, readKeyMutationHint, reconcileKeyMutation, rememberKeyMutationHint, submitKeyMutation, type PendingKeyMutation } from '../mutation-recovery';
import { currencySymbol } from '@/lib/money';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { IconPencil as Pencil } from '@tabler/icons-react';
import { IconSearch as Search } from '@tabler/icons-react';
import { IconFilter as ListFilter } from '@tabler/icons-react';
import { IconX as X } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconCheck as Check } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconCopy as Clipboard } from "@tabler/icons-react";
import { IconDotsVertical as EllipsisVertical } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconAlertTriangle as AlertTriangle } from "@tabler/icons-react";
import { IconPlus as Plus } from "@tabler/icons-react";
import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import { IconRefresh as RotateCw } from "@tabler/icons-react";
import { IconTrash as Trash2 } from "@tabler/icons-react";
import { Link, useLocation, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { TableSkeleton } from '@/components/PageSkeletons';
import PageHeader from '@/components/PageHeader';
import { useDashboardContext, type Model } from '@/shell/dashboard-context';
import { amountToNanos, formatUnitAtoms, money } from '@/lib/money';
import { cachedKeyGet, keyRequest, keyStatus, keyLastUsed, peekCachedKeyGet, workspaceKeyPath, workspacePath, type ProjectKey, type IssuedProjectKey } from '../api';

type KeyDialog = { kind: 'create' } | { kind: 'secret'; key?: ProjectKey } | { kind: 'rotate'; key: ProjectKey } | { kind: 'revoke'; key: ProjectKey } | null;
// A request whose outcome is unknown stays visible as a non-blocking notice.
// It never gates the create or rotate forms, and client-side data is not
// treated as proof that the server committed or rejected the request.
type KeyRequestNotice =
  | { kind: 'uncertain'; pending: PendingKeyMutation; error?: string }
  | { kind: 'unconfirmed'; pending: PendingKeyMutation; error?: string }
  | { kind: 'committed'; pending: PendingKeyMutation; key: ProjectKey }
  | { kind: 'rejected'; error: string };
const expiryOptions = [{ label: '7 days', seconds: 7 * 86400 }, { label: '30 days', seconds: 30 * 86400 }, { label: '90 days', seconds: 90 * 86400 }, { label: '1 year', seconds: 365 * 86400 }, { label: 'Never', seconds: null }];

function baseUrl() {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return `${window.location.origin}${base}/v1`;
}

function keyLimitsSummary(key: ProjectKey): string {
  const parts: string[] = [];
  if (key.unit_spending_limit?.limit_atoms !== null && key.unit_spending_limit?.limit_atoms !== undefined && key.unit_spending_limit.unit) {
    parts.push(formatUnitAtoms(key.unit_spending_limit.limit_atoms, key.unit_spending_limit.unit.name, key.unit_spending_limit.unit.display_precision));
  }
  if (key.spending_limits?.length) {
    for (const limit of key.spending_limits) {
      if (limit.limit_nanos !== null) {
        parts.push(money(limit.limit_nanos, limit.currency));
      }
    }
  }
  const rpm = key.request_rate_limit?.requests_per_minute ?? key.requests_per_minute;
  if (rpm !== undefined && rpm !== null) {
    parts.push(`${rpm.toLocaleString(readUILocale())} req/m`);
  }
  const conc = key.concurrency_limit?.max_concurrent_requests ?? key.max_concurrent_requests;
  if (conc !== undefined && conc !== null) {
    parts.push(`${conc.toLocaleString(readUILocale())} concurrent`);
  }
  const tpm = key.token_rate_limit?.tokens_per_minute ?? key.tokens_per_minute;
  if (tpm !== undefined && tpm !== null) {
    parts.push(`${tpm.toLocaleString(readUILocale())} tok/m`);
  }
  const cidrs = key.ip_policy ? key.ip_policy.allowed_cidrs : key.allowed_cidrs;
  if (cidrs !== undefined && cidrs !== null) {
    parts.push(cidrs.length ? `${cidrs.length} IP${cidrs.length === 1 ? '' : 's'}` : 'IPs blocked');
  }
  return parts.length ? parts.join(' · ') : translateUI('Unlimited');
}

export default function KeysView({ token, models, canWrite, initialScope, loaderKeys }: {
  token: string;
  models: Model[];
  canWrite: boolean;
  initialScope: { organizationId: string; projectId: string } | null;
  loaderKeys?: ProjectKey[];
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const { workspace, workspaceLoading, rememberChatKey, forgetChatKey, session } = useDashboardContext();
  const location = useLocation();
  const navigate = useNavigate();
  const generationReturn = useRef<string | null>(null);
  const initialCollectionPath = initialScope ? workspaceKeyPath(initialScope.projectId) : '';
  const initialCachedKeys = initialCollectionPath ? peekCachedKeyGet<{ data: ProjectKey[] }>(token, initialCollectionPath) : undefined;
  const [keys, setKeys] = useState<ProjectKey[]>(() => loaderKeys ?? initialCachedKeys?.data ?? []);
  const [keyQuery, setKeyQuery] = useState('');
  const [keyStatusFilter, setKeyStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const visibleKeys = keys.filter(key => key.name.toLocaleLowerCase().includes(keyQuery.trim().toLocaleLowerCase())).filter(key => keyStatusFilter === 'all' || (keyStatusFilter === 'inactive' ? key.revoked || key.expired : !(key.revoked || key.expired))).sort((a, b) => Number(Boolean(a.revoked || a.expired)) - Number(Boolean(b.revoked || b.expired)));
  useEffect(() => { setKeyQuery(''); }, [initialScope?.organizationId, initialScope?.projectId]);
  const [loading, setLoading] = useState(() => Boolean(initialCollectionPath && !loaderKeys && !initialCachedKeys));
  useEffect(() => {
    if (loaderKeys) {
      setKeys(loaderKeys);
      setLoading(false);
    }
  }, [loaderKeys]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<KeyDialog>(null);
  const [name, setName] = useState('');
  const [copyError, setCopyError] = useState('');
  const [ttl, setTtl] = useState<number|null>(expiryOptions[1].seconds);
  const [allowedModels, setAllowedModels] = useState<string[]>(['*']);
  const [showAdvancedPolicies, setShowAdvancedPolicies] = useState(false);
  const {currency:spendingCurrency} = usePlatformCurrency();
  const [spendingAmount, setSpendingAmount] = useState('');
  const [requestsPerMinute, setRequestsPerMinute] = useState('');
  const [maxConcurrentRequests, setMaxConcurrentRequests] = useState('');
  const [tokensPerMinute, setTokensPerMinute] = useState('');
  const [allowedCidrsText, setAllowedCidrsText] = useState('');
  const [issued, setIssued] = useState<IssuedProjectKey | null>(null);
  const [secretModel, setSecretModel] = useState('');
  const [copied, setCopied] = useState('');
  const [dialogError, setDialogError] = useState('');
  const root = workspacePath(location.pathname);
  const collectionPath = initialScope ? workspaceKeyPath(initialScope.projectId) : '';
  const canIssue = canWrite && Boolean(workspace);
  const hintKey = keyMutationHintKey(session?.operator?.id ?? 'installation', `${initialScope?.organizationId ?? ''}:${initialScope?.projectId ?? ''}`);
  const [pendingRequest, setPendingRequest] = useState<PendingKeyMutation | null>(null);
  const [storedHint, setStoredHint] = useState<PendingKeyMutation | null>(null);
  const [requestNotice, setRequestNotice] = useState<KeyRequestNotice | null>(null);
  const [checking, setChecking] = useState(false);
  const activePending = pendingRequest ?? storedHint;

  const showActions = canWrite && keys.some(key => !key.revoked && !key.expired);
  const modelIds = models.map(model => typeof model === 'string' ? model : model.id);
  const exampleModel = secretModel || modelIds[0] || '';
  const exampleMetadata = models.find(model => (typeof model === 'string' ? model : model.id) === exampleModel);
  // Catalog text output is descriptive, not a Chat protocol capability.
  const videoExample = typeof exampleMetadata === 'object' && exampleMetadata?.catalog?.output_modalities?.includes('video') === true;

  const dialogReturnFocus = useRef<HTMLButtonElement | null>(null);
  const actionButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const loadController = useRef<AbortController | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  useEffect(() => () => mutationController.current?.abort(), [collectionPath, token, canWrite]);

  async function reload(force = true) {
    loadController.current?.abort();
    if (!collectionPath) return;
    const controller = new AbortController();
    loadController.current = controller;
    const cached = !force ? peekCachedKeyGet<{ data: ProjectKey[] }>(token, collectionPath) : undefined;
    if (cached) {
      setKeys(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError('');
    try {
      const value = await cachedKeyGet<{ data: ProjectKey[] }>(token, collectionPath, {
        signal: controller.signal,
        force,
      });
      if (!controller.signal.aborted) setKeys(value.data);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load API keys.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const cached = collectionPath ? peekCachedKeyGet<{ data: ProjectKey[] }>(token, collectionPath) : undefined;
    if (cached) {
      setKeys(cached.data);
    } else {
      setKeys([]);
    }
    void reload(false);
    return () => loadController.current?.abort();
  }, [collectionPath, token]);

  useEffect(() => {
    setDialog(null); setIssued(null); setBusy(false); setPendingRequest(null); setRequestNotice(null); setChecking(false);
    // The stored hint is disposable. Reading it can never fail the page or
    // block a mutation, and an unreadable value is simply ignored.
    setStoredHint(initialScope ? readKeyMutationHint(hintKey) : null);
  }, [hintKey, token, canWrite]);

  function forgetHint(pending: PendingKeyMutation) {
    forgetKeyMutationHint(hintKey, pending.requestId);
  }

  function clearActiveRequest(pending: PendingKeyMutation) {
    forgetHint(pending);
    setPendingRequest(current => current?.requestId === pending.requestId ? null : current);
    setStoredHint(current => current?.requestId === pending.requestId ? null : current);
    setRequestNotice(current => current && 'pending' in current && current.pending.requestId === pending.requestId ? null : current);
  }

  async function checkRequest(pending: PendingKeyMutation) {
    if (!canIssue || checking || busy) return;
    mutationController.current?.abort();
    const controller = new AbortController(); mutationController.current = controller;
    setChecking(true);
    try {
      const result = await reconcileKeyMutation(token, collectionPath, pending, controller.signal);
      if (controller.signal.aborted) return;
      if (result.kind === 'recovered') {
        clearActiveRequest(pending);
        if (pending.action === 'rotate' && pending.keyId) forgetChatKey(pending.keyId);
        setRequestNotice({kind:'committed', pending, key:result.key});
        await reload();
      } else {
        setRequestNotice({kind:'unconfirmed', pending});
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = cause instanceof Error ? cause.message : 'Could not check the previous key request.';
        setRequestNotice(current => (current?.kind === 'uncertain' || current?.kind === 'unconfirmed')
          ? {...current, error: message} : {kind:'uncertain', pending, error: message});
      }
    } finally { if (mutationController.current === controller) setChecking(false); }
  }

  async function sendKeyRequest(pending: PendingKeyMutation) {
    if (!canIssue || busy) return;
    mutationController.current?.abort();
    const controller = new AbortController(); mutationController.current = controller;
    setChecking(false);
    setPendingRequest(pending);
    setStoredHint(null);
    setRequestNotice(null);
    // Best-effort navigation hint only. A failed write is ignored so browser
    // storage can never prevent the POST below.
    rememberKeyMutationHint(hintKey, pending);
    setBusy(true); setDialogError('');
    try {
      const result = await submitKeyMutation(token, collectionPath, pending, controller.signal);
      if (controller.signal.aborted) return;
      if (result.kind === 'issued') {
        clearActiveRequest(pending); setCopyError(''); setIssued(result.issued);
        const effectiveModels = result.issued.allowed_models ?? result.issued.key?.allowed_models
          ?? (pending.action === 'create' ? (pending.body?.allowed_models as string[] | undefined) ?? ['*'] : keys.find(key => key.id === pending.keyId)?.allowed_models ?? ['*']);
        setSecretModel(effectiveModels.includes('*') ? modelIds[0] ?? '' : effectiveModels[0] ?? '');
        if (initialScope && result.issued.key?.invocation_allowed === true) rememberChatKey({...result.issued,name:pending.label,allowedModels:effectiveModels,...initialScope});
        if (pending.action === 'rotate' && pending.keyId) forgetChatKey(pending.keyId);
        setDialog({kind:'secret'});
      } else if (result.kind === 'recovered') {
        // The server committed but the secret is not retrievable. Offer a
        // non-blocking way to rotate the resulting key; never force revocation.
        clearActiveRequest(pending);
        if (pending.action === 'rotate' && pending.keyId) forgetChatKey(pending.keyId);
        setRequestNotice({kind:'committed', pending, key:result.key});
        setDialog(null);
      } else {
        // No committed result was observed. The request may still be running,
        // so keep the same identity for a safe retry.
        setPendingRequest(pending);
        setRequestNotice({kind:'unconfirmed', pending});
        setDialog(null);
      }
      await reload();
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (confirmedKeyValidationFailure(cause)) {
        clearActiveRequest(pending);
        // The unchanged form remains correctable after a confirmed rejection.
        const message = cause instanceof Error ? cause.message : 'The key request was rejected. Review the input before creating a new request.';
        if (dialog) setDialogError(message);
        else setRequestNotice({kind:'rejected', error:message});
        return;
      }
      setPendingRequest(pending);
      setRequestNotice({kind:'uncertain', pending, error: cause instanceof Error ? cause.message : 'The result could not be confirmed.'});
      setDialog(null);
    } finally { if (mutationController.current === controller) setBusy(false); }
  }

  function dismissRequestNotice() {
    if (activePending) forgetHint(activePending);
    setPendingRequest(null); setStoredHint(null); setRequestNotice(null);
  }

  function openCreate() {
    setName('');
    setTtl(expiryOptions[1].seconds);
    setAllowedModels(['*']);
    setShowAdvancedPolicies(false);
    setSpendingAmount('');
    setRequestsPerMinute('');
    setMaxConcurrentRequests('');
    setTokensPerMinute('');
    setAllowedCidrsText('');
    setIssued(null);
    setSecretModel('');
    setDialogError('');
    setCopied('');
    setDialog({ kind: 'create' });
  }

  useEffect(() => {
    if (location.state?.createKey !== true || workspaceLoading) return;
    const returnTo = location.state?.returnTo;
    if (typeof returnTo === 'string' && /^\/generations(?:\/[^/?#]+)?(?:[?#]|$)/.test(returnTo) && !returnTo.startsWith('//')) generationReturn.current = returnTo;
    if (canIssue) openCreate();
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, workspaceLoading, canIssue, navigate]);

  async function copy(label: string, value: string) {
    try {
      setCopyError('');
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(current => current === label ? '' : current), 1800);
    } catch {
      const message = 'Clipboard access is unavailable. Select and copy the value instead.';
      if (dialog) setDialogError(message); else setCopyError(message);
    }
  }

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!collectionPath || !name.trim() || !allowedModels.length || busy) return;
    const body: Record<string, unknown> = {
      name: name.trim(),
      ttl_seconds: ttl,
    };
    if (!allowedModels.includes('*')) {
      body.allowed_models = allowedModels;
    }
    try {
      if (spendingAmount.trim()) {
        const nanos = /^0+(?:\.0{1,9})?$/.test(spendingAmount.trim()) ? '0' : amountToNanos(spendingAmount.trim());
        body.spending_limit = { currency: spendingCurrency, limit_nanos: nanos };
      }
      if (requestsPerMinute.trim()) {
        if (!/^\d+$/.test(requestsPerMinute.trim())) throw new Error('Requests per minute must be a whole number.');
        body.requests_per_minute = Number(requestsPerMinute.trim());
      }
      if (maxConcurrentRequests.trim()) {
        if (!/^\d+$/.test(maxConcurrentRequests.trim())) throw new Error('Concurrent requests must be a whole number.');
        body.max_concurrent_requests = Number(maxConcurrentRequests.trim());
      }
      if (tokensPerMinute.trim()) {
        if (!/^\d+$/.test(tokensPerMinute.trim())) throw new Error('Tokens per minute must be a whole number.');
        body.tokens_per_minute = Number(tokensPerMinute.trim());
      }
      const cidrs = allowedCidrsText.split('\n').map(entry => entry.trim()).filter(Boolean);
      if (cidrs.length > 0) {
        body.allowed_cidrs = cidrs;
      }
    } catch (validationError) {
      setDialogError(validationError instanceof Error ? validationError.message : 'Enter valid key limits.');
      return;
    }
    await sendKeyRequest({version:1,requestId:crypto.randomUUID(),action:'create',label:name.trim(),body});
  }

  async function rotate(key: ProjectKey) {
    await sendKeyRequest({version:1,requestId:crypto.randomUUID(),action:'rotate',label:key.name,keyId:key.id});
  }

  async function revoke(key: ProjectKey) {
    if (!collectionPath || busy) return;
    const pending = new AbortController();
    mutationController.current = pending;
    setBusy(true); setDialogError('');
    try {
      await keyRequest<void>(token, `${collectionPath}/${encodeURIComponent(key.id)}`, 'DELETE', undefined, pending.signal);
      if (pending.signal.aborted) return;
      forgetChatKey(key.id);
      setDialog(null);
      await reload();
    } catch (cause) {
      if (!pending.signal.aborted) setDialogError(cause instanceof Error ? cause.message : 'Could not revoke this key.');
    } finally { if (!pending.signal.aborted) setBusy(false); }
  }

  const dialogOpen = dialog !== null;
  const dialogTitle = dialog?.kind === 'secret' ? uiT("Save your API key")
    : dialog?.kind === 'rotate' ? uiT("Rotate API key")
      : dialog?.kind === 'revoke' ? uiT("Revoke API key")
        : uiT("Create an API key");
  const dialogDescription = dialog?.kind === 'secret'
    ? uiT("This secret is shown once. Copy it now, then use it from your application.")
    : dialog?.kind === 'rotate' ? uiF("Rotating {0} immediately revokes its current secret.", [dialog.key.name])
      : dialog?.kind === 'revoke' ? uiF("Requests using {0} will stop working immediately.", [dialog.key.name])
        : '';

  function requestNoticeMessage(notice: KeyRequestNotice): string {
    if (notice.kind === 'rejected') return uiT("The key request was rejected. Review the input before creating a new request.");
    if (notice.kind === 'committed') return !notice.key.revoked && !notice.key.expired
      ? uiT("The request completed, but its secret cannot be shown again. Rotate the resulting key to get a new secret.")
      : uiT("The request completed, but the resulting key is no longer active. Create a new key when you are ready.");
    if (notice.kind === 'unconfirmed') return uiT("No completed result was found yet. The request may still be processing.");
    return uiT("The previous key request may not have completed. Check its status or retry the same request. You can still create or rotate keys.");
  }
  // A stored hint is only a non-blocking reminder. It is never cached state and
  // never prevents either mutation form from opening or submitting.
  const activeNotice: KeyRequestNotice | null = requestNotice ?? (activePending ? {kind:'uncertain', pending:activePending} : null);

  const usageExample = issued ? `curl "${baseUrl()}/models" ${String.fromCharCode(92)}
  -H "Authorization: Bearer ${issued.token}"` : '';
  const invocationAllowed = issued?.key?.invocation_allowed !== false;

  return <div className="keys-page">
    <PageHeader title={uiT("API keys")} action={canIssue
      ? <Button className="header-icon-action" aria-label={uiT("New API key")} title={uiT("New API key")} onClick={event => {dialogReturnFocus.current=event.currentTarget;openCreate();}}><Plus size={16} aria-hidden="true" /><span>{uiT("New API key")}</span></Button>
      : undefined} />
    {activeNotice && (() => {
      const noticeError = 'error' in activeNotice ? activeNotice.error : '';
      const pendingAction = 'pending' in activeNotice ? activeNotice.pending.action : null;
      const noticeTitle = noticeError
        ? pendingAction === 'rotate' ? uiT("Could not rotate API key") : uiT("Could not create API key")
        : activeNotice.kind === 'unconfirmed' ? uiT("API key request still processing")
          : activeNotice.kind === 'uncertain' ? uiT("API key request status unknown")
            : activeNotice.kind === 'committed' ? uiT("API key request completed")
              : uiT("API key request rejected");
      return <Alert variant={noticeError ? 'destructive' : 'default'} role="alert">
        {noticeError && <AlertTriangle aria-hidden="true" />}
        <AlertTitle>{noticeTitle}</AlertTitle>
        <AlertDescription>
          {noticeError
            ? <><p className="font-medium">{uiT(noticeError)}</p><p>{uiT("The API key request failed. It may still have been saved; check its status before retrying.")}</p></>
            : <p>{requestNoticeMessage(activeNotice)}</p>}
          {!canIssue && activeNotice.kind !== 'committed' && activeNotice.kind !== 'rejected' && <p>{uiT("Write access is required to check this request.")}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {activeNotice.kind === 'committed' ? <>
              {canIssue && !activeNotice.key.revoked && !activeNotice.key.expired && <Button variant="outline" size="sm" disabled={busy} onClick={() => { dialogReturnFocus.current = null; setDialogError(''); setDialog({kind:'rotate', key:activeNotice.key}); }}>{uiT("Rotate to get a new secret")}</Button>}
              <Button variant="ghost" size="sm" disabled={busy} onClick={dismissRequestNotice}>{uiT("Dismiss")}</Button>
            </> : activeNotice.kind === 'rejected' ? <>
              <Button variant="ghost" size="sm" disabled={busy} onClick={dismissRequestNotice}>{uiT("Dismiss")}</Button>
            </> : <>
              {canIssue && <Button variant="outline" size="sm" disabled={checking || busy} onClick={() => void checkRequest(activeNotice.pending)}>{checking ? uiT("Checking…") : uiT("Check status")}</Button>}
              {canIssue && <Button variant="ghost" size="sm" disabled={checking || busy} onClick={() => void sendKeyRequest(activeNotice.pending)}>{uiT("Retry request")}</Button>}
              <Button variant="ghost" size="sm" disabled={checking || busy} onClick={dismissRequestNotice}>{uiT("Dismiss")}</Button>
            </>}
          </div>
        </AlertDescription>
      </Alert>;
    })()}
    {!workspaceLoading && !workspace && <p className="key-scope-empty">{uiT("Choose a workspace from the sidebar to manage its keys.")}</p>}
    {workspace && <div className="keys-scope-line"><Popover><PopoverTrigger asChild><Button ref={searchTriggerRef} type="button" variant="ghost" size="icon" aria-label={uiT("Search API keys")} title={uiT("Search API keys")} className={keyQuery ? "text-primary bg-accent" : undefined}><Search size={17}/></Button></PopoverTrigger><PopoverContent align="start" collisionPadding={16} className="w-80 max-w-[calc(100vw-2rem)] space-y-2"><Input autoFocus ref={searchInputRef} aria-label={uiT("Search API keys")} placeholder={uiT("Search keys…")} value={keyQuery} onChange={event => setKeyQuery(event.target.value)} />{keyQuery && <Button variant="ghost" size="sm" onClick={()=>setKeyQuery('')}>{uiT("Reset search")}</Button>}</PopoverContent></Popover><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={uiT("Filter by key status")} title={uiT("Filter by key status")} className={keyStatusFilter !== 'all' ? 'text-primary bg-accent' : undefined}><ListFilter size={17}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={keyStatusFilter} onValueChange={value => setKeyStatusFilter(value as typeof keyStatusFilter)}><DropdownMenuRadioItem value="all">{uiT("All keys")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="active">{uiT("Active keys")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="inactive">{uiT("Revoked or expired")}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu><span role="status">{loading ? (keys.length ? uiT("Refreshing keys…") : uiT("Loading keys…")) : error && !keys.length ? uiT("Keys unavailable") : keyQuery.trim() || keyStatusFilter !== 'all' ? uiF("{0} of {1} {2}", [visibleKeys.length, keys.length, keys.length === 1 ? uiT("key") : uiT("keys")]) : `${keys.length} ${keys.length === 1 ? uiT("key") : uiT("keys")}`}</span><Button type="button" variant="ghost" size="icon" aria-label={uiT("Refresh API keys")} title={uiT("Refresh")} disabled={loading} onClick={() => void reload()}><RefreshCw size={16} /></Button></div>}
    {!canWrite && workspace && <p className="key-read-only">{uiT("You have read-only access.")}</p>}
    {error && <p className="key-error" role="alert">{uiT(error)}<Button type="button" variant="ghost" size="sm" onClick={() => void reload()}>{uiT("Try again")}</Button></p>}
    {workspace && <section className="key-list" aria-label={uiT("API keys")} aria-busy={loading}>
      {loading && !keys.length && <TableSkeleton columns={6} rows={4} label="" />}
      {!loading && !error && !keys.length && <Empty className="key-empty"><EmptyHeader><EmptyMedia variant="icon"><KeyRound aria-hidden="true"/></EmptyMedia><EmptyTitle>{uiT("No API keys yet")}</EmptyTitle><EmptyDescription>{canIssue ? uiT("Create a key for an app or agent to send requests through Niu.") : uiT("Your session can review keys, but cannot create them.")}</EmptyDescription></EmptyHeader></Empty>}
      {!loading && keys.length > 0 && visibleKeys.length === 0 && <Empty className="key-empty"><EmptyHeader><EmptyMedia variant="icon"><Search aria-hidden="true"/></EmptyMedia><EmptyTitle>{keyStatusFilter === 'active' && !keyQuery.trim() ? uiT("No active API keys") : uiT("No matching keys")}</EmptyTitle><EmptyDescription>{keyStatusFilter === 'active' && !keyQuery.trim() ? uiT("Every key in this workspace is revoked or expired.") : keyQuery.trim() && keyStatusFilter === 'active' ? uiT("Try another name or clear your search.") : keyStatusFilter === 'all' ? uiT("Try another name or clear your search.") : uiT("No keys match this status and search.")}</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => {if (keyStatusFilter === 'active' && !keyQuery.trim()) setKeyStatusFilter('inactive'); else {setKeyQuery(''); if (keyStatusFilter !== 'active') setKeyStatusFilter('all');} searchTriggerRef.current?.focus();}}>{keyStatusFilter === 'active' && !keyQuery.trim() ? uiT("Show revoked and expired") : keyQuery.trim() && keyStatusFilter === 'active' || keyStatusFilter === 'all' ? uiT("Clear search") : uiT("Clear filters")}</Button></EmptyContent></Empty>}
      {visibleKeys.length > 0 && <div className="table-wrap"><Table className="key-table"><TableHeader><TableRow><TableHead>{uiT("Key")}</TableHead><TableHead className="key-table-metadata">{uiT("Model access")}</TableHead><TableHead className="key-table-metadata">{uiT("Limits")}</TableHead><TableHead className="key-table-metadata">{uiT("Expires")}</TableHead><TableHead className="key-table-metadata">{uiT("Last used")}</TableHead><TableHead>{uiT("Status")}</TableHead>{showActions && <TableHead>{uiT("Actions")}</TableHead>}</TableRow></TableHeader><TableBody>{visibleKeys.map(key => <TableRow key={key.id}>
        <TableCell><Link className="key-name-link" to={`${root}/keys/${encodeURIComponent(key.slug || key.id)}`} aria-label={uiF("View key {0}", [key.name])}><KeyRound size={15} /><span>{key.name}{visibleKeys.filter(item => item.name === key.name).length > 1 && <small className="mt-0.5 block text-xs font-normal text-muted-foreground">{key.expires_at_ms === null ? uiT("Never expires") : uiF("Expires {0}", [new Intl.DateTimeFormat(readUILocale(), { dateStyle: 'medium' }).format(new Date(key.expires_at_ms))])}{' · '}{keyLastUsed(key)}</small>}</span></Link></TableCell>
        <TableCell className="key-table-metadata"><span className="key-model-summary" title={key.allowed_models.includes('*') ? uiT("Every configured model route") : key.allowed_models.join(', ')}>{key.allowed_models.includes('*') ? uiT("All configured models") : key.allowed_models.join(', ')}</span></TableCell>
        <TableCell className="key-table-metadata"><span className="key-model-summary">{keyLimitsSummary(key)}</span></TableCell>
        <TableCell className="key-table-metadata">{key.expires_at_ms === null ? uiT("Never") : new Intl.DateTimeFormat(readUILocale(), { dateStyle: 'medium' }).format(new Date(key.expires_at_ms))}</TableCell>
        <TableCell className="key-table-metadata">{keyLastUsed(key)}</TableCell>
        <TableCell><Badge variant={key.revoked || key.expired ? 'secondary' : 'outline'} className="lifecycle-badge" data-tone={key.revoked || key.expired ? 'inactive' : 'active'}><span className="status-dot" aria-hidden="true" />{uiT(keyStatus(key))}</Badge></TableCell>
        {showActions && <TableCell>{!key.revoked && !key.expired && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="icon-sm" variant="ghost" aria-label={uiF("Actions for {0}", [key.name])} ref={element => {if (element) actionButtonRefs.current.set(key.id,element);else actionButtonRefs.current.delete(key.id);}}><EllipsisVertical /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" collisionPadding={12}><DropdownMenuItem asChild><Link to={`${root}/keys/${encodeURIComponent(key.slug || key.id)}`}><Pencil />{uiT("Edit")}</Link></DropdownMenuItem><DropdownMenuItem onSelect={() => { dialogReturnFocus.current=actionButtonRefs.current.get(key.id) ?? null;setDialogError(''); setDialog({kind: 'rotate', key}); }}><RotateCw />{uiT("Rotate")}</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => { dialogReturnFocus.current=actionButtonRefs.current.get(key.id) ?? null;setDialogError(''); setDialog({kind: 'revoke', key}); }}><Trash2 />{uiT("Revoke")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</TableCell>}
      </TableRow>)}</TableBody></Table></div>}
    </section>}


    {copyError && <p role="alert" className="error-text">{uiT(copyError)}</p>}
    <Dialog open={dialogOpen} onOpenChange={open => { if (!open && !busy) { const returnTo = dialog?.kind === 'create' ? generationReturn.current : null; setDialog(null); setDialogError(''); if (returnTo) navigate(returnTo); } }}>
      <DialogContent className="niu-modal key-dialog max-h-[90dvh] overflow-y-auto" showCloseButton={false} onCloseAutoFocus={event => {const target=dialogReturnFocus.current?.isConnected ? dialogReturnFocus.current : searchTriggerRef.current;if (target) {event.preventDefault();target.focus();}}}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>{dialogTitle}</DialogTitle>{dialogDescription && <DialogDescription>{dialogDescription}</DialogDescription>}</div>
          <DialogClose className="niu-modal-close" aria-label={uiT("Close dialog")} disabled={busy}><X size={18} /></DialogClose>
        </DialogHeader>
      {dialog?.kind === 'create' && <form className="niu-modal-form" onSubmit={event => void issue(event)}>
        {activePending?.action === 'create' && <Alert><AlertDescription><p>{uiT("A previous key request may still complete. Creating another key could create a duplicate.")}</p><Button type="button" variant="outline" size="sm" onClick={() => { setDialog(null); void checkRequest(activePending); }}>{uiT("Check previous request")}</Button></AlertDescription></Alert>}
        <Label htmlFor="api-key-name">{uiT("Name")}<Input id="api-key-name" disabled={busy} autoFocus maxLength={200} autoComplete="off" placeholder={uiT("e.g. production app")} value={name} onChange={event => setName(event.target.value)} required /></Label>
        <div className="key-expiration-field">
          <Label htmlFor="api-key-models">{uiT("Model access")}</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button id="api-key-models" disabled={busy} type="button" variant="outline" className="h-10 w-full justify-between font-normal">
                {allowedModels.includes('*') ? uiT("All configured models") : uiF("{0} model{1} selected", [allowedModels.length, allowedModels.length === 1 ? '' : 's'])}
                <ChevronDown aria-hidden="true" size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto" align="start" sideOffset={5} collisionPadding={10}>
              <DropdownMenuCheckboxItem checked={allowedModels.includes('*')} onSelect={event => event.preventDefault()} onCheckedChange={checked => setAllowedModels(checked ? ['*'] : [])}>{uiT("All configured models")}</DropdownMenuCheckboxItem>
              {modelIds.length > 0 && <DropdownMenuSeparator />}
              {[...new Set(modelIds)].sort().map(modelId => (
                <DropdownMenuCheckboxItem
                  key={modelId}
                  checked={allowedModels.includes(modelId)}
                  onSelect={event => event.preventDefault()}
                  onCheckedChange={checked => setAllowedModels(current => checked ? [...current.filter(value => value !== '*'), modelId] : current.filter(value => value !== modelId))}
                >
                  {modelId}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="key-expiration-field">
          <Label htmlFor="api-key-expiry">{uiT("Expiration")}</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button id="api-key-expiry" disabled={busy} type="button" variant="outline" className="h-10 w-full justify-between font-normal">
                {uiT(expiryOptions.find(option => option.seconds === ttl)?.label ?? 'Never')}
                <ChevronDown aria-hidden="true" size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]" align="start" sideOffset={5} collisionPadding={10}>
              <DropdownMenuRadioGroup value={ttl === null ? 'never' : String(ttl)} onValueChange={value => setTtl(value === 'never' ? null : Number(value))}>
                {expiryOptions.map(option => <DropdownMenuRadioItem key={option.seconds === null ? 'never' : option.seconds} value={option.seconds === null ? 'never' : String(option.seconds)}>{uiT(option.label)}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="grid gap-3 pt-1">
          <Button type="button" variant="ghost" size="sm" className="justify-between px-2 text-muted-foreground" disabled={busy} onClick={() => setShowAdvancedPolicies(current => !current)}>
            <span>{uiT("Limits & access policies (optional)")}</span>
            <ChevronDown size={15} className={showAdvancedPolicies ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </Button>
          {showAdvancedPolicies && <div className="grid gap-3 rounded-md bg-muted/40 p-3">
            <div className="grid gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="api-key-spending-limit">{uiT("Spending limit")}{spendingCurrency ? ` (${currencySymbol(spendingCurrency)})` : ''}</Label>
                <Input id="api-key-spending-limit" aria-describedby="api-key-spending-help api-key-spending-scope" inputMode="decimal" disabled={busy || !spendingCurrency} placeholder={uiT("Unlimited")} value={spendingAmount} onChange={event => setSpendingAmount(event.target.value)} />
                <p id="api-key-spending-help" className="text-xs text-muted-foreground">{uiT("Lifetime spending allowance for this key. It does not reset monthly. Leave blank for unlimited spending.")}</p>
                <p id="api-key-spending-scope" className="text-xs text-muted-foreground">{uiT("This limit covers Niu customer charges and reserved requests. It does not cover charges paid directly to a Provider using your own API key. Manage those costs with the Provider.")}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="api-key-rpm">{uiT("Requests / min")}</Label>
                <Input id="api-key-rpm" inputMode="numeric" disabled={busy} placeholder={uiT("Unlimited")} value={requestsPerMinute} onChange={event => setRequestsPerMinute(event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="api-key-concurrency">{uiT("Concurrent")}</Label>
                <Input id="api-key-concurrency" inputMode="numeric" disabled={busy} placeholder={uiT("Unlimited")} value={maxConcurrentRequests} onChange={event => setMaxConcurrentRequests(event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="api-key-tpm">{uiT("Tokens / min")}</Label>
                <Input id="api-key-tpm" aria-describedby="api-key-token-help" inputMode="numeric" disabled={busy} placeholder={uiT("Unlimited")} value={tokensPerMinute} onChange={event => setTokensPerMinute(event.target.value)} />
              </div>
            </div>
            <p id="api-key-token-help" className="text-xs text-muted-foreground">{uiT("A finite token limit counts known usage and unresolved estimates. It requires supported text requests with an explicit output-token maximum and blocks video requests. Leave blank for no token-rate limit.")}</p>
            <div className="grid gap-1.5">
              <Label htmlFor="api-key-cidrs">{uiT("Allowed IP addresses or CIDRs")}</Label>
              <Textarea id="api-key-cidrs" rows={2} disabled={busy} className="font-mono text-xs" placeholder={uiT("Leave blank to allow all sources (one IP or CIDR per line)")} value={allowedCidrsText} onChange={event => setAllowedCidrsText(event.target.value)} />
            </div>
          </div>}
        </div>
        {dialogError && <p role="alert" className="error-text">{uiT(dialogError)}</p>}
        <footer className="niu-modal-actions sticky bottom-0 z-10 border-t bg-background pt-3"><Button type="button" variant="ghost" disabled={busy} onClick={() => {if (generationReturn.current) navigate(generationReturn.current); else setDialog(null);}}>{generationReturn.current ? uiT("Return to chat") : uiT("Cancel")}</Button><Button type="submit" disabled={busy || !name.trim() || !allowedModels.length}>{busy ? uiT("Creating…") : uiT("Create key")}</Button></footer>
      </form>}
      {dialog?.kind === 'secret' && issued && <div className="niu-modal-form key-issued-view">
        <div className="key-once-notice"><Check size={17} /><span>{uiT("Copy this secret before closing. Niu cannot reveal it again.")}</span></div>
        <div className="key-copy-row"><Label htmlFor="issued-api-key">{uiT("API key")}</Label><div><Input id="issued-api-key" value={issued.token} readOnly type="text" /><Button type="button" variant="outline" onClick={() => void copy('key', issued.token)}><Clipboard size={15} />{copied === 'key' ? uiT("Copied") : uiT("Copy key")}</Button></div></div>
        <div className="key-copy-row"><Label htmlFor="issued-base-url">{uiT("Base URL")}</Label><div><Input id="issued-base-url" value={baseUrl()} readOnly /><Button type="button" variant="outline" onClick={() => void copy('url', baseUrl())}><Clipboard size={15} />{copied === 'url' ? uiT("Copied") : uiT("Copy URL")}</Button></div></div>
        {invocationAllowed ? videoExample ? <div className="key-example key-example-prerequisite" role="status"><div><strong>{uiT("Request example unavailable")}</strong></div><p>{uiT("Video requests require the model’s current generation schema. Open Video to choose supported inputs and settings.")}</p></div> : <div className="key-example"><div className="model-route-example-heading"><strong>{uiT("Check access with your API key")}</strong><Button type="button" variant="ghost" size="sm" onClick={() => void copy('example', usageExample)}><Clipboard size={14} />{copied === 'example' ? <><Check size={14} />{uiT("Copied")}</> : uiT("Copy")}</Button></div><pre className="model-route-example"><code>{usageExample}</code></pre></div> : <p role="status">{!invocationAllowed ? uiT("This key is for management only and cannot invoke models.") : uiT("Model invocation permission is unavailable for this key.")}</p>}
        {dialogError && <p role="alert" className="error-text">{uiT(dialogError)}</p>}
        <footer className="niu-modal-actions">{invocationAllowed && <Button asChild><Link to={(() => {if (!generationReturn.current) return `/generations?${new URLSearchParams({new: videoExample?'video':'1', workspace: decodeURIComponent(root.split('/').pop() ?? 'default'), key: issued.key?.slug || issued.id})}`; const target = new URL(generationReturn.current, window.location.origin); target.searchParams.set('key', issued.key?.slug || issued.id); return target.pathname + target.search + target.hash;})()} onClick={() => setDialog(null)}>{generationReturn.current ? uiT("Return to chat") : videoExample?uiT("Use in Video"):uiT("Open Generations")}</Link></Button>}<Button variant={invocationAllowed ? "outline" : "default"} onClick={() => setDialog(null)}>{uiT("Done")}</Button></footer>
      </div>}
      {dialog?.kind === 'rotate' && <div className="niu-modal-form">
        {activePending?.action === 'rotate' && <Alert><AlertDescription><p>{uiT("A previous key rotation may still complete. Check it before rotating this key again.")}</p><Button type="button" variant="outline" size="sm" onClick={() => { setDialog(null); void checkRequest(activePending); }}>{uiT("Check previous request")}</Button></AlertDescription></Alert>}
        <p className="key-confirm-copy">{uiT("The replacement secret is shown once.")}</p>{dialogError && <p role="alert" className="error-text">{uiT(dialogError)}</p>}<footer className="niu-modal-actions"><Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>{uiT("Cancel")}</Button><Button disabled={busy} onClick={() => void rotate(dialog.key)}>{busy ? uiT("Rotating…") : uiT("Rotate key")}</Button></footer>
      </div>}
      {dialog?.kind === 'revoke' && <div className="niu-modal-form"><p className="key-confirm-copy">{uiT("This cannot be undone.")}</p>{dialogError && <p role="alert" className="error-text">{uiT(dialogError)}</p>}<footer className="niu-modal-actions"><Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>{uiT("Keep key")}</Button><Button variant="destructive" disabled={busy} onClick={() => void revoke(dialog.key)}>{busy ? uiT("Revoking…") : uiT("Revoke key")}</Button></footer></div>}
    </DialogContent>
    </Dialog>
  </div>;
}
