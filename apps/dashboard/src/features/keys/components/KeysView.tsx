import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { confirmedKeyValidationFailure, forgetPendingKeyMutation, readPendingKeyMutation, reconcileKeyMutation, recoveryCacheKey, savePendingKeyMutation, submitKeyMutation, type PendingKeyMutation } from '../mutation-recovery';
import { currencySymbol } from '@/lib/money';
import { usePlatformCurrency } from '@/app/platform-currency';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { IconPencil as Pencil } from '@tabler/icons-react';
import { IconSearch as Search } from '@tabler/icons-react';
import { IconX as X } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconCheck as Check } from "@tabler/icons-react";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconCopy as Clipboard } from "@tabler/icons-react";
import { IconDotsVertical as EllipsisVertical } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
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
import PageHeader from '@/components/PageHeader';
import { useDashboardContext, type Model } from '@/app/dashboard-context';
import { amountToNanos, formatUnitAtoms, money } from '@/lib/money';
import { KeyRequestError, keyRequest, keyStatus, keyLastUsed, workspaceKeyPath, workspacePath, type ProjectKey, type IssuedProjectKey } from '../api';

type KeyDialog = { kind: 'recover' } | { kind: 'create' } | { kind: 'secret'; key?: ProjectKey } | { kind: 'rotate'; key: ProjectKey } | { kind: 'revoke'; key: ProjectKey } | null;
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
    parts.push(`${rpm.toLocaleString()} req/m`);
  }
  const conc = key.concurrency_limit?.max_concurrent_requests ?? key.max_concurrent_requests;
  if (conc !== undefined && conc !== null) {
    parts.push(`${conc.toLocaleString()} concurrent`);
  }
  const tpm = key.token_rate_limit?.tokens_per_minute ?? key.tokens_per_minute;
  if (tpm !== undefined && tpm !== null) {
    parts.push(`${tpm.toLocaleString()} tok/m`);
  }
  const cidrs = key.ip_policy ? key.ip_policy.allowed_cidrs : key.allowed_cidrs;
  if (cidrs !== undefined && cidrs !== null) {
    parts.push(cidrs.length ? `${cidrs.length} IP${cidrs.length === 1 ? '' : 's'}` : 'IPs blocked');
  }
  return parts.length ? parts.join(' · ') : 'Unlimited';
}

export default function KeysView({ token, models, canWrite, initialScope }: {
  token: string;
  models: Model[];
  canWrite: boolean;
  initialScope: { organizationId: string; projectId: string } | null;
}) {
  const { workspace, workspaceLoading, rememberChatKey, forgetChatKey, session } = useDashboardContext();
  const canManagePlatform = Boolean(session?.permissions?.platform_admin || (session?.kind === 'installation' && session?.permissions?.manage_operators !== false));
  const location = useLocation();
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ProjectKey[]>([]);
  const [keyQuery, setKeyQuery] = useState('');
  const visibleKeys = keys.filter(key => key.name.toLocaleLowerCase().includes(keyQuery.trim().toLocaleLowerCase())).sort((a, b) => Number(Boolean(a.revoked || a.expired)) - Number(Boolean(b.revoked || b.expired)));
  useEffect(() => { setKeyQuery(''); }, [initialScope?.organizationId, initialScope?.projectId]);
  const [loading, setLoading] = useState(false);
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
  const cacheKey = recoveryCacheKey(session?.operator?.id ?? 'installation', `${initialScope?.organizationId ?? ''}:${initialScope?.projectId ?? ''}`);
  const [recovery, setRecovery] = useState<PendingKeyMutation | null>(null);
  const [recoveredKey, setRecoveredKey] = useState<ProjectKey | null>(null);
  const [recoveryDenied, setRecoveryDenied] = useState(false);
  const [cacheError, setCacheError] = useState('');

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

  async function reload() {
    loadController.current?.abort();
    if (!collectionPath) return;
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    setError('');
    try {
      const value = await keyRequest<{ data: ProjectKey[] }>(token, collectionPath, 'GET', undefined, controller.signal);
      if (!controller.signal.aborted) setKeys(value.data);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load API keys.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => { setKeys([]); void reload(); return () => loadController.current?.abort(); }, [collectionPath, token]);

  useEffect(() => {
    setDialog(null); setIssued(null); setBusy(false); setRecoveredKey(null); setRecoveryDenied(false); setCacheError('');
    try { setRecovery(initialScope ? readPendingKeyMutation(localStorage, cacheKey) : null); }
    catch (cause) { setRecovery(null); setCacheError(cause instanceof Error ? cause.message : 'Key recovery is unavailable.'); }
  }, [cacheKey, token, canWrite]);

  function clearRecovery(pending: PendingKeyMutation) {
    forgetPendingKeyMutation(localStorage, cacheKey, pending.requestId);
    setRecovery(null); setRecoveredKey(null); setRecoveryDenied(false);
  }

  async function checkRecovery(pending = recovery) {
    if (!pending || !canIssue || busy || recoveryDenied) return;
    const controller = new AbortController(); mutationController.current = controller;
    setBusy(true); setDialogError('');
    try {
      const result = await reconcileKeyMutation(token, collectionPath, pending, controller.signal);
      if (controller.signal.aborted) return;
      if (result.kind === 'recovered') {
        setRecoveredKey(result.key);
        if (pending.action === 'rotate' && pending.keyId) forgetChatKey(pending.keyId);
        await reload();
      } else setDialogError('No completed result was found yet. The request may still be processing. You can retry the same request safely.');
    } catch (cause) {
      if (!controller.signal.aborted) {
        setRecoveryDenied(cause instanceof KeyRequestError && [401,403].includes(cause.status));
        setDialogError(cause instanceof Error ? cause.message : 'Could not check the saved result.');
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  async function sendKeyRequest(pending: PendingKeyMutation) {
    if (!canIssue || busy || recoveryDenied || cacheError) return;
    try {
      const saved = readPendingKeyMutation(localStorage, cacheKey);
      if (saved && saved.requestId !== pending.requestId) {
        setRecovery(saved); setRecoveredKey(null); setDialog({kind:'recover'}); return;
      }
      savePendingKeyMutation(localStorage, cacheKey, pending);
    }
    catch (cause) { setDialogError(cause instanceof Error ? cause.message : 'The request has not been sent.'); return; }
    setRecovery(pending);
    const controller = new AbortController(); mutationController.current = controller;
    setBusy(true); setDialogError('');
    try {
      const result = await submitKeyMutation(token, collectionPath, pending, controller.signal);
      if (controller.signal.aborted) return;
      if (result.kind === 'issued') {
        clearRecovery(pending); setIssued(result.issued);
        const effectiveModels = result.issued.allowed_models ?? result.issued.key?.allowed_models
          ?? (pending.action === 'create' ? (pending.body?.allowed_models as string[] | undefined) ?? ['*'] : keys.find(key => key.id === pending.keyId)?.allowed_models ?? ['*']);
        setSecretModel(effectiveModels.includes('*') ? modelIds[0] ?? '' : effectiveModels[0] ?? '');
        if (initialScope) rememberChatKey({...result.issued,name:pending.label,allowedModels:effectiveModels,...initialScope});
        if (pending.action === 'rotate' && pending.keyId) forgetChatKey(pending.keyId);
        setDialog({kind:'secret'});
      } else {
        setRecoveredKey(result.kind === 'recovered' ? result.key : null);
        if (result.kind === 'recovered' && pending.action === 'rotate' && pending.keyId) forgetChatKey(pending.keyId);
        setDialog({kind:'recover'});
      }
      await reload();
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (confirmedKeyValidationFailure(cause)) {
        clearRecovery(pending);
        // The unchanged form remains correctable after a confirmed rejection.
        if (dialog?.kind === 'recover') { setDialog(null); setCopyError(cause instanceof Error ? cause.message : 'The key request was rejected. Review the input before creating a new request.'); }
      } else {
        setRecoveryDenied(cause instanceof KeyRequestError && [401,403].includes(cause.status));
        setDialog({kind:'recover'});
      }
      setDialogError(cause instanceof Error ? cause.message : 'The result could not be confirmed.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  async function finishRecovery() {
    if (!recovery || !recoveredKey || !canIssue || busy || recoveryDenied) return;
    const pending = recovery, key = recoveredKey;
    const controller = new AbortController(); mutationController.current = controller;
    setBusy(true); setDialogError('');
    try {
      if (!key.revoked && !key.expired) await keyRequest<void>(token, `${collectionPath}/${encodeURIComponent(key.id)}`, 'DELETE', undefined, controller.signal);
      if (controller.signal.aborted) return;
      forgetChatKey(key.id); clearRecovery(pending); setDialog(null); await reload();
    } catch (cause) {
      if (!controller.signal.aborted) {
        setRecoveryDenied(cause instanceof KeyRequestError && [401,403].includes(cause.status));
        setDialogError(cause instanceof Error ? cause.message : 'Revocation could not be confirmed. Check the saved result before continuing.');
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  function openCreate() {
    if (recovery || cacheError) { setDialog({kind:'recover'}); return; }

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
    if (recovery || cacheError) { setDialog({kind:'recover'}); return; }
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
  const dialogTitle = dialog?.kind === 'recover' ? 'Review key request' : dialog?.kind === 'secret' ? 'Save your API key'
    : dialog?.kind === 'rotate' ? 'Rotate API key'
      : dialog?.kind === 'revoke' ? 'Revoke API key'
        : 'Create an API key';
  const dialogDescription = dialog?.kind === 'recover' ? 'Confirm what happened before creating or rotating another key.' : dialog?.kind === 'secret'
    ? 'This secret is shown once. Copy it now, then use it from your application.'
    : dialog?.kind === 'rotate' ? `Rotating ${dialog.key.name} immediately revokes its current secret.`
      : dialog?.kind === 'revoke' ? `Requests using ${dialog.key.name} will stop working immediately.`
        : '';

  return <div className="keys-page">
    <PageHeader title="API keys" action={canIssue
      ? <Button className="header-icon-action" aria-label="New API key" title="New API key" onClick={event => {dialogReturnFocus.current=event.currentTarget;openCreate();}}><Plus size={16} aria-hidden="true" /><span>New API key</span></Button>
      : undefined} />
    {(recovery || cacheError) && <Alert><AlertTitle>Key request needs review</AlertTitle><AlertDescription><p>{cacheError || (canIssue ? 'A previous key request has an unresolved outcome.' : 'Write access is required to recover this key request. Contact your workspace owner.')}</p>{canIssue && <Button variant="outline" onClick={event => {dialogReturnFocus.current=event.currentTarget;setDialogError('');setDialog({kind:'recover'});}}>Review request</Button>}</AlertDescription></Alert>}
    {!workspaceLoading && !workspace && <p className="key-scope-empty">Choose a workspace from the sidebar to manage its keys.</p>}
    {workspace && <div className="keys-scope-line"><Popover><PopoverTrigger asChild><Button ref={searchTriggerRef} type="button" variant="ghost" size="icon" aria-label="Search API keys" title="Search API keys" className={keyQuery ? "text-primary bg-accent" : undefined}><Search size={17}/></Button></PopoverTrigger><PopoverContent align="start" collisionPadding={16} className="w-80 max-w-[calc(100vw-2rem)] space-y-2"><Input autoFocus ref={searchInputRef} aria-label="Search API keys" placeholder="Search keys…" value={keyQuery} onChange={event => setKeyQuery(event.target.value)} />{keyQuery && <Button variant="ghost" size="sm" onClick={()=>setKeyQuery('')}>Reset search</Button>}</PopoverContent></Popover><span role="status">{loading ? (keys.length ? 'Refreshing keys…' : 'Loading keys…') : error && !keys.length ? 'Keys unavailable' : keyQuery.trim() ? `${visibleKeys.length} of ${keys.length} ${keys.length === 1 ? 'key' : 'keys'}` : `${keys.length} ${keys.length === 1 ? 'key' : 'keys'}`}</span><Button type="button" variant="ghost" size="icon" aria-label="Refresh API keys" title="Refresh" disabled={loading} onClick={() => void reload()}><RefreshCw size={16} /></Button></div>}
    {!canWrite && workspace && <p className="key-read-only">You have read-only access.</p>}
    {error && <p className="key-error" role="alert">{error}<Button type="button" variant="ghost" size="sm" onClick={() => void reload()}>Try again</Button></p>}
    {workspace && <section className="key-list" aria-label="API keys" aria-busy={loading}>

      {!loading && !error && !keys.length && <Empty className="key-empty"><EmptyHeader><EmptyMedia variant="icon"><KeyRound aria-hidden="true"/></EmptyMedia><EmptyTitle>No API keys yet</EmptyTitle><EmptyDescription>{canIssue ? 'Create a key for an app or agent to send requests through Niu.' : 'Your session can review keys, but cannot create them.'}</EmptyDescription></EmptyHeader></Empty>}
      {!loading && keys.length > 0 && visibleKeys.length === 0 && <Empty className="key-empty"><EmptyHeader><EmptyMedia variant="icon"><Search aria-hidden="true"/></EmptyMedia><EmptyTitle>No matching keys</EmptyTitle><EmptyDescription>Try another name or clear your search.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => {setKeyQuery('');searchTriggerRef.current?.focus();}}>Clear search</Button></EmptyContent></Empty>}
      {visibleKeys.length > 0 && <div className="table-wrap"><Table className="key-table"><TableHeader><TableRow><TableHead>Key</TableHead><TableHead className="key-table-metadata">Model access</TableHead><TableHead className="key-table-metadata">Limits</TableHead><TableHead className="key-table-metadata">Expires</TableHead><TableHead className="key-table-metadata">Last used</TableHead><TableHead>Status</TableHead>{showActions && <TableHead>Actions</TableHead>}</TableRow></TableHeader><TableBody>{visibleKeys.map(key => <TableRow key={key.id}>
        <TableCell><Link className="key-name-link" to={`${root}/keys/${encodeURIComponent(key.slug || key.id)}`} aria-label={`View key ${key.name}`}><KeyRound size={15} />{key.name}</Link></TableCell>
        <TableCell className="key-table-metadata"><span className="key-model-summary" title={key.allowed_models.includes('*') ? 'Every configured model route' : key.allowed_models.join(', ')}>{key.allowed_models.includes('*') ? 'All configured models' : key.allowed_models.join(', ')}</span></TableCell>
        <TableCell className="key-table-metadata"><span className="key-model-summary">{keyLimitsSummary(key)}</span></TableCell>
        <TableCell className="key-table-metadata">{key.expires_at_ms === null ? 'Never' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(key.expires_at_ms))}</TableCell>
        <TableCell className="key-table-metadata">{keyLastUsed(key)}</TableCell>
        <TableCell><Badge variant={key.revoked || key.expired ? 'secondary' : 'outline'}>{keyStatus(key)}</Badge></TableCell>
        {showActions && <TableCell>{!key.revoked && !key.expired && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="icon-sm" variant="ghost" aria-label={`Actions for ${key.name}`} ref={element => {if (element) actionButtonRefs.current.set(key.id,element);else actionButtonRefs.current.delete(key.id);}}><EllipsisVertical /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" collisionPadding={12}><DropdownMenuItem asChild><Link to={`${root}/keys/${encodeURIComponent(key.slug || key.id)}`}><Pencil />Edit</Link></DropdownMenuItem><DropdownMenuItem onSelect={() => { dialogReturnFocus.current=actionButtonRefs.current.get(key.id) ?? null;setDialogError(''); setDialog({kind: 'rotate', key}); }}><RotateCw />Rotate</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => { dialogReturnFocus.current=actionButtonRefs.current.get(key.id) ?? null;setDialogError(''); setDialog({kind: 'revoke', key}); }}><Trash2 />Revoke</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</TableCell>}
      </TableRow>)}</TableBody></Table></div>}
    </section>}


    {copyError && <p role="alert" className="error-text">{copyError}</p>}
    <Dialog open={dialogOpen} onOpenChange={open => { if (!open && !busy) { setDialog(null); setDialogError(''); } }}>
      <DialogContent className="niu-modal key-dialog max-h-[90dvh] overflow-y-auto" showCloseButton={false} onCloseAutoFocus={event => {const target=dialogReturnFocus.current?.isConnected ? dialogReturnFocus.current : searchTriggerRef.current;if (target) {event.preventDefault();target.focus();}}}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>{dialogTitle}</DialogTitle>{dialogDescription && <DialogDescription>{dialogDescription}</DialogDescription>}</div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog" disabled={busy}><X size={18} /></DialogClose>
        </DialogHeader>
      {dialog?.kind === 'recover' && <div className="niu-modal-form">
        {cacheError ? <><p role="alert" className="error-text">{cacheError}</p><p>Review the key list and revoke any key whose secret you did not save before clearing this reminder. Clearing it does not revoke a key.</p><Button variant="outline" onClick={() => { try { localStorage.removeItem(cacheKey); setCacheError(''); setDialog(null); } catch { setCacheError('Browser storage is unavailable. Restore access to browser storage before clearing this reminder.'); } }}>I reviewed my keys</Button></> : <>
          <p className="break-words">{recovery?.label}</p>
          {recoveredKey ? <><p>{recovery?.action === 'rotate' ? 'Rotation completed. The old secret no longer works.' : 'The key was created.'} Its secret cannot be retrieved.</p><p>{recoveredKey.revoked || recoveredKey.expired ? 'This key is no longer active. You can finish recovery and create a new key.' : 'Revoke this key before creating a new one. Revocation prevents new requests using this key.'}</p></> : <p>{recovery?.action === 'rotate' ? 'Rotation may have completed, so the old secret may no longer work.' : 'Creation may have completed even though its response was not received.'} Check the saved result or retry the same request. A retry will not create a second key.</p>}
          {(!canIssue || recoveryDenied) && <p role="alert">Access is unavailable. Sign in again with workspace write access or ask the workspace owner to review this request.</p>}
          {dialogError && <p role="alert" className="error-text">{dialogError}</p>}
          <footer className="niu-modal-actions flex-wrap"><Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Close</Button>{!recoveredKey && recovery && <Button variant="outline" disabled={busy || !canIssue || recoveryDenied} onClick={() => void sendKeyRequest(recovery)}>Retry same request</Button>}<Button variant={recoveredKey ? 'outline' : 'default'} disabled={busy || !canIssue || recoveryDenied} onClick={() => void checkRecovery()}>{busy ? 'Working…' : 'Check saved result'}</Button>{recoveredKey && <Button variant={recoveredKey.revoked || recoveredKey.expired ? 'default' : 'destructive'} disabled={busy || !canIssue || recoveryDenied} onClick={() => void finishRecovery()}>{recoveredKey.revoked || recoveredKey.expired ? 'Finish recovery' : 'Revoke key'}</Button>}</footer>
        </>}
      </div>}
      {dialog?.kind === 'create' && <form className="niu-modal-form" onSubmit={event => void issue(event)}>
        <Label htmlFor="api-key-name">Name<Input id="api-key-name" disabled={busy} autoFocus maxLength={200} autoComplete="off" placeholder="e.g. production app" value={name} onChange={event => setName(event.target.value)} required /></Label>
        <div className="key-expiration-field">
          <Label htmlFor="api-key-models">Model access</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button id="api-key-models" disabled={busy} type="button" variant="outline" className="h-10 w-full justify-between font-normal">
                {allowedModels.includes('*') ? 'All configured models' : `${allowedModels.length} model${allowedModels.length === 1 ? '' : 's'} selected`}
                <ChevronDown aria-hidden="true" size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto" align="start" sideOffset={5} collisionPadding={10}>
              <DropdownMenuCheckboxItem checked={allowedModels.includes('*')} onSelect={event => event.preventDefault()} onCheckedChange={checked => setAllowedModels(checked ? ['*'] : [])}>All configured models</DropdownMenuCheckboxItem>
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
          <Label htmlFor="api-key-expiry">Expiration</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button id="api-key-expiry" disabled={busy} type="button" variant="outline" className="h-10 w-full justify-between font-normal">
                {expiryOptions.find(option => option.seconds === ttl)?.label}
                <ChevronDown aria-hidden="true" size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]" align="start" sideOffset={5} collisionPadding={10}>
              <DropdownMenuRadioGroup value={ttl === null ? 'never' : String(ttl)} onValueChange={value => setTtl(value === 'never' ? null : Number(value))}>
                {expiryOptions.map(option => <DropdownMenuRadioItem key={option.seconds === null ? 'never' : option.seconds} value={option.seconds === null ? 'never' : String(option.seconds)}>{option.label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="grid gap-3 pt-1">
          <Button type="button" variant="ghost" size="sm" className="justify-between px-2 text-muted-foreground" disabled={busy} onClick={() => setShowAdvancedPolicies(current => !current)}>
            <span>Limits & access policies (optional)</span>
            <ChevronDown size={15} className={showAdvancedPolicies ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </Button>
          {showAdvancedPolicies && <div className="grid gap-3 rounded-md bg-muted/40 p-3">
            <div className="grid gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="api-key-spending-limit">Spending limit{spendingCurrency ? ` (${currencySymbol(spendingCurrency)})` : ''}</Label>
                <Input id="api-key-spending-limit" aria-describedby="api-key-spending-help" inputMode="decimal" disabled={busy || !spendingCurrency} placeholder="Unlimited" value={spendingAmount} onChange={event => setSpendingAmount(event.target.value)} />
                <p id="api-key-spending-help" className="text-xs text-muted-foreground">Lifetime spending allowance for this key. It does not reset monthly. Leave blank for unlimited spending.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="api-key-rpm">Requests / min</Label>
                <Input id="api-key-rpm" inputMode="numeric" disabled={busy} placeholder="Unlimited" value={requestsPerMinute} onChange={event => setRequestsPerMinute(event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="api-key-concurrency">Concurrent</Label>
                <Input id="api-key-concurrency" inputMode="numeric" disabled={busy} placeholder="Unlimited" value={maxConcurrentRequests} onChange={event => setMaxConcurrentRequests(event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="api-key-tpm">Tokens / min</Label>
                <Input id="api-key-tpm" aria-describedby="api-key-token-help" inputMode="numeric" disabled={busy} placeholder="Unlimited" value={tokensPerMinute} onChange={event => setTokensPerMinute(event.target.value)} />
              </div>
            </div>
            <p id="api-key-token-help" className="text-xs text-muted-foreground">A finite token limit counts known usage and unresolved estimates. It requires supported text requests with an explicit output-token maximum and blocks video requests. Leave blank for no token-rate limit.</p>
            <div className="grid gap-1.5">
              <Label htmlFor="api-key-cidrs">Allowed IP addresses or CIDRs</Label>
              <Textarea id="api-key-cidrs" rows={2} disabled={busy} className="font-mono text-xs" placeholder="Leave blank to allow all sources (one IP or CIDR per line)" value={allowedCidrsText} onChange={event => setAllowedCidrsText(event.target.value)} />
            </div>
          </div>}
        </div>
        {dialogError && <p role="alert" className="error-text">{dialogError}</p>}
        <footer className="niu-modal-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" disabled={busy || !name.trim() || !allowedModels.length}>{busy ? 'Creating…' : 'Create key'}</Button></footer>
      </form>}
      {dialog?.kind === 'secret' && issued && <div className="niu-modal-form key-issued-view">
        <div className="key-once-notice"><Check size={17} /><span>Copy this secret before closing. Niu cannot reveal it again.</span></div>
        <div className="key-copy-row"><Label htmlFor="issued-api-key">API key</Label><div><Input id="issued-api-key" value={issued.token} readOnly type="text" /><Button type="button" variant="outline" onClick={() => void copy('key', issued.token)}><Clipboard size={15} />{copied === 'key' ? 'Copied' : 'Copy key'}</Button></div></div>
        <div className="key-copy-row"><Label htmlFor="issued-base-url">Base URL</Label><div><Input id="issued-base-url" value={baseUrl()} readOnly /><Button type="button" variant="outline" onClick={() => void copy('url', baseUrl())}><Clipboard size={15} />{copied === 'url' ? 'Copied' : 'Copy URL'}</Button></div></div>
        <div className="key-example key-example-prerequisite" role="status"><div><strong>Request example unavailable</strong></div><p>{videoExample ? 'Video requests require the model’s current generation schema. Open Video to choose supported inputs and settings.' : exampleModel ? 'A runnable request example cannot be confirmed from this model’s catalog metadata. Open Generations to choose a supported workflow.' : canManagePlatform ? 'Connect a Provider and add a supported model route to use this key.' : 'Ask a platform administrator to add a model route to the catalog.'}</p>{!exampleModel&&canManagePlatform && <Button asChild variant="outline"><Link to="/admin/providers">Connect provider</Link></Button>}</div>
        {dialogError && <p role="alert" className="error-text">{dialogError}</p>}
        <footer className="niu-modal-actions"><Button asChild><Link to={`/generations?${new URLSearchParams({new: videoExample?'video':'1', workspace: decodeURIComponent(root.split('/').pop() ?? 'default'), key: issued.key?.slug || issued.id})}`} onClick={() => setDialog(null)}>{videoExample?'Use in Video':'Open Generations'}</Link></Button><Button variant="outline" onClick={() => setDialog(null)}>Done</Button></footer>
      </div>}
      {dialog?.kind === 'rotate' && <div className="niu-modal-form"><p className="key-confirm-copy">The replacement secret is shown once.</p>{dialogError && <p role="alert" className="error-text">{dialogError}</p>}<footer className="niu-modal-actions"><Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button disabled={busy} onClick={() => void rotate(dialog.key)}>{busy ? 'Rotating…' : 'Rotate key'}</Button></footer></div>}
      {dialog?.kind === 'revoke' && <div className="niu-modal-form"><p className="key-confirm-copy">This cannot be undone.</p>{dialogError && <p role="alert" className="error-text">{dialogError}</p>}<footer className="niu-modal-actions"><Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Keep key</Button><Button variant="destructive" disabled={busy} onClick={() => void revoke(dialog.key)}>{busy ? 'Revoking…' : 'Revoke key'}</Button></footer></div>}
    </DialogContent>
    </Dialog>
  </div>;
}
