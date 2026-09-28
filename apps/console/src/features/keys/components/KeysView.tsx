import { X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, ChevronDown, Clipboard, KeyRound, Plus, RefreshCw, RotateCw, Trash2 } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageHeader from '@/components/PageHeader';
import { useConsoleContext } from '@/app/console-context';
import { keyRequest, keyStatus, projectKeyPath, workspacePath, type ProjectKey, type IssuedProjectKey } from '../api';

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
  const { workspace, workspaceLoading, rememberChatKey, forgetChatKey } = useConsoleContext();
  const location = useLocation();
  const [keys, setKeys] = useState<ProjectKey[]>([]);
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
  const exampleModel = secretModel || models[0] || 'your-model';
  const command = useMemo(() => requestExample(baseUrl(), exampleModel), [exampleModel]);

  const loadController = useRef<AbortController | null>(null);

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
    setBusy(true); setDialogError('');
    try {
      const result = await keyRequest<IssuedProjectKey>(token, collectionPath, 'POST', {
        name: name.trim(), ttl_seconds: ttl,
      });
      setIssued(result);
      setSecretModel(models[0] ?? 'your-model');
      if (initialScope) rememberChatKey({ ...result, name: name.trim(), allowedModels: ['*'], ...initialScope });
      setDialog({ kind: 'secret' });
      await reload();
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : 'Could not create this key.');
    } finally { setBusy(false); }
  }

  async function rotate(key: ProjectKey) {
    if (!collectionPath || busy) return;
    setBusy(true); setDialogError('');
    try {
      const result = await keyRequest<IssuedProjectKey>(token, `${collectionPath}/${encodeURIComponent(key.id)}/rotate`, 'POST');
      setIssued(result);
      setSecretModel(key.allowed_models.includes('*') ? models[0] ?? 'your-model' : key.allowed_models[0] ?? models[0] ?? 'your-model');
      if (initialScope) rememberChatKey({ ...result, name: key.name, allowedModels: key.allowed_models, ...initialScope });
      setDialog({ kind: 'secret', key });
      await reload();
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : 'Could not rotate this key.');
    } finally { setBusy(false); }
  }

  async function revoke(key: ProjectKey) {
    if (!collectionPath || busy) return;
    setBusy(true); setDialogError('');
    try {
      await keyRequest<void>(token, `${collectionPath}/${encodeURIComponent(key.id)}`, 'DELETE');
      forgetChatKey(key.id);
      setDialog(null);
      await reload();
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : 'Could not revoke this key.');
    } finally { setBusy(false); }
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
      ? <Button onClick={openCreate}><Plus size={16} />New API key</Button>
      : <Button type="button" variant="ghost" size="icon" aria-label="Refresh API keys" title="Refresh" disabled={loading} onClick={() => void reload()}><RefreshCw size={16} /></Button>} />
    {!workspaceLoading && !workspace && <p className="key-scope-empty">Choose a workspace from the sidebar to manage its keys.</p>}
    {workspace && <div className="keys-scope-line"><span>{keys.length.toLocaleString()} key{keys.length === 1 ? '' : 's'}</span><Button type="button" variant="ghost" size="icon" aria-label="Refresh API keys" title="Refresh" disabled={loading} onClick={() => void reload()}><RefreshCw size={16} /></Button></div>}
    {!canWrite && workspace && <p className="key-read-only">This session can review keys but does not have permission to create, rotate, or revoke them.</p>}
    {error && <p className="key-error" role="alert">{error}<Button type="button" variant="ghost" size="sm" onClick={() => void reload()}>Try again</Button></p>}
    {workspace && <section className="key-list" aria-label="API keys" aria-busy={loading}>
      {loading && !keys.length && <p className="key-list-state" role="status">Loading keys…</p>}
      {!loading && !error && !keys.length && <div className="key-empty"><span><KeyRound size={21} /></span><strong>No API keys yet</strong><p>{canIssue ? 'Create a key for an app or agent to send requests through Niu.' : 'Your session can review keys, but cannot create them.'}</p></div>}
      {keys.length > 0 && <div className="table-wrap"><Table className="key-table"><TableHeader><TableRow><TableHead>Key</TableHead><TableHead>Model access</TableHead><TableHead>Expires</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{keys.map(key => <TableRow key={key.id}>
        <TableCell><span className="key-name-link"><KeyRound size={15} />{key.name}</span><span className="key-id">{key.id}</span></TableCell>
        <TableCell><span className="key-model-summary" title={key.allowed_models.includes('*') ? 'Every model available in this workspace' : key.allowed_models.join(', ')}>{key.allowed_models.includes('*') ? 'All workspace models' : key.allowed_models.join(', ')}</span></TableCell>
        <TableCell>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(key.expires_at_ms))}</TableCell>
        <TableCell><Badge variant={key.revoked || key.expired ? 'secondary' : 'outline'}>{keyStatus(key)}</Badge></TableCell>
        <TableCell><div className="key-row-actions">{canWrite && !key.revoked && !key.expired && <><Button type="button" size="sm" variant="ghost" onClick={() => { setDialogError(''); setDialog({ kind: 'rotate', key }); }}><RotateCw size={14} />Rotate</Button><Button type="button" size="sm" variant="ghost" className="key-revoke-button" onClick={() => { setDialogError(''); setDialog({ kind: 'revoke', key }); }}><Trash2 size={14} />Revoke</Button></>}</div></TableCell>
      </TableRow>)}</TableBody></Table></div>}
    </section>}
    {workspace && <section className="key-endpoint"><div><h2>Use your key</h2><p>Send an OpenAI-compatible request to Niu. Provider credentials never leave the gateway.</p></div><dl><div><dt>Base URL</dt><dd><code>{baseUrl()}</code><Button type="button" variant="ghost" size="sm" aria-label="Copy base URL" onClick={() => void copy('base-url', baseUrl())}><Clipboard size={14} />{copied === 'base-url' ? 'Copied' : 'Copy'}</Button></dd></div><div><dt>Authentication</dt><dd><code>Authorization: Bearer $NIU_API_KEY</code></dd></div></dl><Button asChild variant="outline"><Link to={`${root}/playground`}>Open Chat<ArrowUpRight size={14} /></Link></Button></section>}

    {copyError && <p role="alert" className="error-text">{copyError}</p>}
    <Dialog open={dialogOpen} onOpenChange={open => { if (!open && !busy) { setDialog(null); setDialogError(''); } }}>
      <DialogContent className="niu-modal key-dialog" showCloseButton={false}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>{dialogTitle}</DialogTitle><DialogDescription>{dialogDescription}</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
        </DialogHeader>
      {dialog?.kind === 'create' && <form className="niu-modal-form" onSubmit={event => void issue(event)}>
        <Label htmlFor="api-key-name">Name<Input id="api-key-name" autoFocus maxLength={200} autoComplete="off" placeholder="e.g. production app" value={name} onChange={event => setName(event.target.value)} required /></Label>
        <div className="key-expiration-field">
          <Label htmlFor="api-key-expiry">Expiration</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button id="api-key-expiry" type="button" variant="outline" className="h-10 w-full justify-between font-normal">
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
        <footer className="niu-modal-actions"><Button type="button" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create key'}</Button></footer>
      </form>}
      {dialog?.kind === 'secret' && issued && <div className="niu-modal-form key-issued-view">
        <div className="key-once-notice"><Check size={17} /><span>Copy this secret before closing. Niu cannot reveal it again.</span></div>
        <div className="key-copy-row"><Label htmlFor="issued-api-key">API key</Label><div><Input id="issued-api-key" value={issued.token} readOnly type="text" /><Button type="button" variant="outline" onClick={() => void copy('key', issued.token)}><Clipboard size={15} />{copied === 'key' ? 'Copied' : 'Copy key'}</Button></div></div>
        <div className="key-copy-row"><Label htmlFor="issued-base-url">Base URL</Label><div><Input id="issued-base-url" value={baseUrl()} readOnly /><Button type="button" variant="outline" onClick={() => void copy('url', baseUrl())}><Clipboard size={15} />{copied === 'url' ? 'Copied' : 'Copy URL'}</Button></div></div>
        <div className="key-example"><div><strong>First request</strong><Button type="button" variant="ghost" size="sm" onClick={() => void copy('example', command)}><Clipboard size={14} />{copied === 'example' ? 'Copied' : 'Copy example'}</Button></div><pre><code>{command}</code></pre></div>
        {dialogError && <p role="alert" className="error-text">{dialogError}</p>}
        <footer className="niu-modal-actions"><Button asChild><Link to={`${root}/playground?key=${encodeURIComponent(issued.id)}`} onClick={() => setDialog(null)}>Use in Chat<ArrowUpRight size={14} /></Link></Button><Button variant="outline" onClick={() => setDialog(null)}>Done</Button></footer>
      </div>}
      {dialog?.kind === 'rotate' && <div className="niu-modal-form"><p className="key-confirm-copy">The current credential stops working as soon as rotation succeeds. The replacement secret is shown once.</p>{dialogError && <p role="alert" className="error-text">{dialogError}</p>}<footer className="niu-modal-actions"><Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button disabled={busy} onClick={() => void rotate(dialog.key)}>{busy ? 'Rotating…' : 'Rotate key'}</Button></footer></div>}
      {dialog?.kind === 'revoke' && <div className="niu-modal-form"><p className="key-confirm-copy">Any service using this key will receive an authorization error. This cannot be undone.</p>{dialogError && <p role="alert" className="error-text">{dialogError}</p>}<footer className="niu-modal-actions"><Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Keep key</Button><Button variant="destructive" disabled={busy} onClick={() => void revoke(dialog.key)}>{busy ? 'Revoking…' : 'Revoke key'}</Button></footer></div>}
    </DialogContent>
    </Dialog>
  </div>;
}
