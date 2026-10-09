import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { IconPencil as Pencil } from '@tabler/icons-react';
import { IconSearch as Search } from '@tabler/icons-react';
import { IconX as X } from "@tabler/icons-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { IconArrowUpRight as ArrowUpRight } from "@tabler/icons-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageHeader from '@/components/PageHeader';
import { useDashboardContext } from '@/app/dashboard-context';
import { keyRequest, keyStatus, keyLastUsed, projectKeyPath, workspacePath, type ProjectKey, type IssuedProjectKey } from '../api';

type KeyDialog = { kind: 'create' } | { kind: 'secret'; key?: ProjectKey } | { kind: 'rotate'; key: ProjectKey } | { kind: 'revoke'; key: ProjectKey } | null;
const expiryOptions = [{ label: '7 days', seconds: 7 * 86400 }, { label: '30 days', seconds: 30 * 86400 }, { label: '90 days', seconds: 90 * 86400 }, { label: '1 year', seconds: 365 * 86400 }];

function baseUrl() {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return `${window.location.origin}${base}/v1`;
}

function requestExample(url: string, model: string) {
  const body = JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with a short greeting.' }] });
  return [
    `curl "${url}/chat/completions"`,
    '  -H "Authorization: Bearer $NIU_API_KEY"',
    '  -H "Content-Type: application/json"',
    `  -d '${body.replaceAll("'", "'\\''")}'`,
  ].join(` ${String.fromCharCode(92)}\n`);
}

export default function KeysView({ token, models, canWrite, initialScope }: {
  token: string;
  models: string[];
  canWrite: boolean;
  initialScope: { organizationId: string; projectId: string } | null;
}) {
  const { workspace, workspaceLoading, rememberChatKey, forgetChatKey, session } = useDashboardContext();
  const canManagePlatform = Boolean((session?.kind === 'installation' || session?.permissions?.platform_admin) && session?.permissions?.manage_operators);
  const location = useLocation();
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ProjectKey[]>([]);
  const [keyQuery, setKeyQuery] = useState('');
  const visibleKeys = keys.filter(key => key.name.toLocaleLowerCase().includes(keyQuery.trim().toLocaleLowerCase()));
  useEffect(() => { setKeyQuery(''); }, [initialScope?.organizationId, initialScope?.projectId]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<KeyDialog>(null);
  const [name, setName] = useState('');
  const [copyError, setCopyError] = useState('');
  const [ttl, setTtl] = useState(expiryOptions[1].seconds);
  const [issued, setIssued] = useState<IssuedProjectKey | null>(null);
  const [secretModel, setSecretModel] = useState('');
  const [copied, setCopied] = useState('');
  const [dialogError, setDialogError] = useState('');
  const root = workspacePath(location.pathname);
  const collectionPath = initialScope ? projectKeyPath(initialScope.organizationId, initialScope.projectId) : '';
  const canIssue = canWrite && Boolean(workspace);
  const showActions = canWrite && keys.some(key => !key.revoked && !key.expired);
  const exampleModel = secretModel || models[0] || '';
  const command = useMemo(() => exampleModel ? requestExample(baseUrl(), exampleModel) : '', [exampleModel]);

  const dialogReturnFocus = useRef<HTMLButtonElement | null>(null);
  const actionButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const loadController = useRef<AbortController | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  useEffect(() => () => mutationController.current?.abort(), [collectionPath, token]);

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

  function openCreate() {
    setName('');
    setTtl(expiryOptions[1].seconds);
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
    if (!collectionPath || !name.trim() || busy) return;
    const pending = new AbortController();
    mutationController.current = pending;
    setBusy(true); setDialogError('');
    try {
      const result = await keyRequest<IssuedProjectKey>(token, collectionPath, 'POST', {
        name: name.trim(), ttl_seconds: ttl,
      }, pending.signal);
      if (pending.signal.aborted) return;
      setIssued(result);
      setSecretModel(models[0] ?? '');
      if (initialScope) rememberChatKey({ ...result, name: name.trim(), allowedModels: ['*'], ...initialScope });
      setDialog({ kind: 'secret' });
      await reload();
    } catch (cause) {
      if (!pending.signal.aborted) setDialogError(cause instanceof Error ? cause.message : 'Could not create this key.');
    } finally { if (!pending.signal.aborted) setBusy(false); }
  }

  async function rotate(key: ProjectKey) {
    if (!collectionPath || busy) return;
    const pending = new AbortController();
    mutationController.current = pending;
    setBusy(true); setDialogError('');
    try {
      const result = await keyRequest<IssuedProjectKey>(token, `${collectionPath}/${encodeURIComponent(key.id)}/rotate`, 'POST', undefined, pending.signal);
      if (pending.signal.aborted) return;
      setIssued(result);
      setSecretModel(key.allowed_models.includes('*') ? models[0] ?? '' : key.allowed_models[0] ?? models[0] ?? '');
      if (initialScope) rememberChatKey({ ...result, name: key.name, allowedModels: key.allowed_models, ...initialScope });
      setDialog({ kind: 'secret', key });
      await reload();
    } catch (cause) {
      if (!pending.signal.aborted) setDialogError(cause instanceof Error ? cause.message : 'Could not rotate this key.');
    } finally { if (!pending.signal.aborted) setBusy(false); }
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
  const dialogTitle = dialog?.kind === 'secret' ? 'Save your API key'
    : dialog?.kind === 'rotate' ? 'Rotate API key'
      : dialog?.kind === 'revoke' ? 'Revoke API key'
        : 'Create an API key';
  const dialogDescription = dialog?.kind === 'secret'
    ? 'This secret is shown once. Copy it now, then use it from your application.'
    : dialog?.kind === 'rotate' ? `Rotating ${dialog.key.name} immediately revokes its current secret.`
      : dialog?.kind === 'revoke' ? `Requests using ${dialog.key.name} will stop working immediately.`
        : '';

  return <div className="keys-page">
    <PageHeader title="API keys" action={canIssue
      ? <Button className="header-icon-action" aria-label="New API key" title="New API key" onClick={event => {dialogReturnFocus.current=event.currentTarget;openCreate();}}><Plus size={16} aria-hidden="true" /><span>New API key</span></Button>
      : undefined} />
    {!workspaceLoading && !workspace && <p className="key-scope-empty">Choose a workspace from the sidebar to manage its keys.</p>}
    {workspace && <div className="keys-scope-line"><Popover><PopoverTrigger asChild><Button ref={searchTriggerRef} type="button" variant="ghost" size="icon" aria-label="Search API keys" title="Search API keys" className={keyQuery ? "text-primary bg-accent" : undefined}><Search size={17}/></Button></PopoverTrigger><PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-2"><Input autoFocus ref={searchInputRef} aria-label="Search API keys" placeholder="Search keys…" value={keyQuery} onChange={event => setKeyQuery(event.target.value)} />{keyQuery && <Button variant="ghost" size="sm" onClick={()=>setKeyQuery('')}>Reset search</Button>}</PopoverContent></Popover><span role="status">{loading ? (keys.length ? 'Refreshing keys…' : 'Loading keys…') : error && !keys.length ? 'Keys unavailable' : keyQuery.trim() ? `${visibleKeys.length} of ${keys.length} ${keys.length === 1 ? 'key' : 'keys'}` : `${keys.length} ${keys.length === 1 ? 'key' : 'keys'}`}</span><Button type="button" variant="ghost" size="icon" aria-label="Refresh API keys" title="Refresh" disabled={loading} onClick={() => void reload()}><RefreshCw size={16} /></Button></div>}
    {!canWrite && workspace && <p className="key-read-only">You have read-only access.</p>}
    {error && <p className="key-error" role="alert">{error}<Button type="button" variant="ghost" size="sm" onClick={() => void reload()}>Try again</Button></p>}
    {workspace && <section className="key-list" aria-label="API keys" aria-busy={loading}>

      {!loading && !error && !keys.length && <Empty className="key-empty"><EmptyHeader><EmptyMedia variant="icon"><KeyRound aria-hidden="true"/></EmptyMedia><EmptyTitle>No API keys yet</EmptyTitle><EmptyDescription>{canIssue ? 'Create a key for an app or agent to send requests through Niu.' : 'Your session can review keys, but cannot create them.'}</EmptyDescription></EmptyHeader></Empty>}
      {!loading && keys.length > 0 && visibleKeys.length === 0 && <Empty className="key-empty"><EmptyHeader><EmptyMedia variant="icon"><Search aria-hidden="true"/></EmptyMedia><EmptyTitle>No matching keys</EmptyTitle><EmptyDescription>Try another name or clear your search.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => {setKeyQuery('');searchTriggerRef.current?.focus();}}>Clear search</Button></EmptyContent></Empty>}
      {visibleKeys.length > 0 && <div className="table-wrap"><Table className="key-table"><TableHeader><TableRow><TableHead>Key</TableHead><TableHead className="key-table-metadata">Model access</TableHead><TableHead className="key-table-metadata">Expires</TableHead><TableHead className="key-table-metadata">Last used</TableHead><TableHead>Status</TableHead>{showActions && <TableHead>Actions</TableHead>}</TableRow></TableHeader><TableBody>{visibleKeys.map(key => <TableRow key={key.id}>
        <TableCell><Link className="key-name-link" to={`${root}/keys/${encodeURIComponent(key.id)}`} aria-label={`View key ${key.name}`}><KeyRound size={15} />{key.name}</Link></TableCell>
        <TableCell className="key-table-metadata"><span className="key-model-summary" title={key.allowed_models.includes('*') ? 'Every configured model route' : key.allowed_models.join(', ')}>{key.allowed_models.includes('*') ? 'All configured models' : key.allowed_models.join(', ')}</span></TableCell>
        <TableCell className="key-table-metadata">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(key.expires_at_ms))}</TableCell>
        <TableCell className="key-table-metadata">{keyLastUsed(key)}</TableCell>
        <TableCell><Badge variant={key.revoked || key.expired ? 'secondary' : 'outline'}>{keyStatus(key)}</Badge></TableCell>
        {showActions && <TableCell>{!key.revoked && !key.expired && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="icon-sm" variant="ghost" aria-label={`Actions for ${key.name}`} ref={element => {if (element) actionButtonRefs.current.set(key.id,element);else actionButtonRefs.current.delete(key.id);}}><EllipsisVertical /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" collisionPadding={12}><DropdownMenuItem asChild><Link to={`${root}/keys/${encodeURIComponent(key.id)}`}><Pencil />Edit</Link></DropdownMenuItem><DropdownMenuItem onSelect={() => { dialogReturnFocus.current=actionButtonRefs.current.get(key.id) ?? null;setDialogError(''); setDialog({kind: 'rotate', key}); }}><RotateCw />Rotate</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => { dialogReturnFocus.current=actionButtonRefs.current.get(key.id) ?? null;setDialogError(''); setDialog({kind: 'revoke', key}); }}><Trash2 />Revoke</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</TableCell>}
      </TableRow>)}</TableBody></Table></div>}
    </section>}


    {copyError && <p role="alert" className="error-text">{copyError}</p>}
    <Dialog open={dialogOpen} onOpenChange={open => { if (!open && !busy) { setDialog(null); setDialogError(''); } }}>
      <DialogContent className="niu-modal key-dialog" showCloseButton={false} onCloseAutoFocus={event => {const target=dialogReturnFocus.current?.isConnected ? dialogReturnFocus.current : searchTriggerRef.current;if (target) {event.preventDefault();target.focus();}}}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>{dialogTitle}</DialogTitle>{dialogDescription && <DialogDescription>{dialogDescription}</DialogDescription>}</div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog" disabled={busy}><X size={18} /></DialogClose>
        </DialogHeader>
      {dialog?.kind === 'create' && <form className="niu-modal-form" onSubmit={event => void issue(event)}>
        <Label htmlFor="api-key-name">Name<Input id="api-key-name" disabled={busy} autoFocus maxLength={200} autoComplete="off" placeholder="e.g. production app" value={name} onChange={event => setName(event.target.value)} required /></Label>
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
              <DropdownMenuRadioGroup value={String(ttl)} onValueChange={value => setTtl(Number(value))}>
                {expiryOptions.map(option => <DropdownMenuRadioItem key={option.seconds} value={String(option.seconds)}>{option.label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {dialogError && <p role="alert" className="error-text">{dialogError}</p>}
        <footer className="niu-modal-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create key'}</Button></footer>
      </form>}
      {dialog?.kind === 'secret' && issued && <div className="niu-modal-form key-issued-view">
        <div className="key-once-notice"><Check size={17} /><span>Copy this secret before closing. Niu cannot reveal it again.</span></div>
        <div className="key-copy-row"><Label htmlFor="issued-api-key">API key</Label><div><Input id="issued-api-key" value={issued.token} readOnly type="text" /><Button type="button" variant="outline" onClick={() => void copy('key', issued.token)}><Clipboard size={15} />{copied === 'key' ? 'Copied' : 'Copy key'}</Button></div></div>
        <div className="key-copy-row"><Label htmlFor="issued-base-url">Base URL</Label><div><Input id="issued-base-url" value={baseUrl()} readOnly /><Button type="button" variant="outline" onClick={() => void copy('url', baseUrl())}><Clipboard size={15} />{copied === 'url' ? 'Copied' : 'Copy URL'}</Button></div></div>
        {exampleModel
          ? <div className="key-example"><div><strong>First request</strong><Button type="button" variant="ghost" size="sm" onClick={() => void copy('example', command)}><Clipboard size={14} />{copied === 'example' ? 'Copied' : 'Copy example'}</Button></div><pre><code>{command}</code></pre></div>
          : <div className="key-example key-example-prerequisite" role="status"><div><strong>Request example unavailable</strong></div><p>{canManagePlatform ? 'Connect a supplier and add a model route to get a runnable request example for this key.' : 'Ask a platform administrator to add a model route to the catalog.'}</p>{canManagePlatform && <Button asChild variant="outline"><Link to="/admin/suppliers">Connect supplier</Link></Button>}</div>}
        {dialogError && <p role="alert" className="error-text">{dialogError}</p>}
        <footer className="niu-modal-actions"><Button asChild><Link to={`/generations?${new URLSearchParams({new: '1', workspace: decodeURIComponent(root.split('/').pop() ?? 'default'), key: issued.id})}`} onClick={() => setDialog(null)}>Use in Chat<ArrowUpRight size={14} /></Link></Button><Button variant="outline" onClick={() => setDialog(null)}>Done</Button></footer>
      </div>}
      {dialog?.kind === 'rotate' && <div className="niu-modal-form"><p className="key-confirm-copy">The replacement secret is shown once.</p>{dialogError && <p role="alert" className="error-text">{dialogError}</p>}<footer className="niu-modal-actions"><Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button disabled={busy} onClick={() => void rotate(dialog.key)}>{busy ? 'Rotating…' : 'Rotate key'}</Button></footer></div>}
      {dialog?.kind === 'revoke' && <div className="niu-modal-form"><p className="key-confirm-copy">This cannot be undone.</p>{dialogError && <p role="alert" className="error-text">{dialogError}</p>}<footer className="niu-modal-actions"><Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Keep key</Button><Button variant="destructive" disabled={busy} onClick={() => void revoke(dialog.key)}>{busy ? 'Revoking…' : 'Revoke key'}</Button></footer></div>}
    </DialogContent>
    </Dialog>
  </div>;
}
