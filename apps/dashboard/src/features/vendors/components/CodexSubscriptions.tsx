import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconPlus as Plus } from "@tabler/icons-react";
import { IconRefresh as RefreshCw } from "@tabler/icons-react";
import type { Workspace } from '@/app/dashboard-context';
import { workspaceDisplayName } from '@/app/workspace-route';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { request } from '../api';

type Account = { id: string; name: string; health: string; busy: boolean; models: Array<{ slug: string; display_name: string }> };
const healthLabels: Record<string, string> = { ready: 'Ready', cooldown: 'Cooling down', authentication_expired: 'Sign in required', disabled: 'Paused', unverified: 'Unverified' };

export default function CodexSubscriptions({ token, workspaces = [] }: { token: string; workspaces?: Workspace[] }) {
  const [search] = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState(search.get('workspace') ?? '');
  const workspace = workspaces.find(item => item.id === workspaceId) ?? workspaces[0];
  const path = workspace ? `/admin/v1/organizations/${workspace.organization_id}/projects/${workspace.id}/codex-connections` : '';
  const currentPath = useRef(path); currentPath.current = path;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const [reconnect, setReconnect] = useState<Account | null>(null);
  const [name, setName] = useState('My Codex');
  const [modelSlug, setModelSlug] = useState('');
  const local = location.protocol === 'http:' && location.hostname === '127.0.0.1';
  const models = Array.from(new Map(accounts.filter(account => account.health !== 'disabled').flatMap(account => account.models).map(model => [model.slug, model])).values());
  const selectedModel = models.find(model => model.slug === modelSlug) ?? models[0];

  useEffect(() => {
    setAccounts([]); setError(''); setOpen(false); setBusy(false);
    if (!path) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    void request<{ data: Account[] }>(token, path, 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setAccounts(result.data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load subscriptions.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, path, reload]);

  function connect(account: Account | null) {
    setReconnect(account); setName(account?.name ?? 'My Codex'); setError(''); setOpen(true);
  }
  async function signIn(event: FormEvent) {
    event.preventDefault(); if (!path || busy || !local || !name.trim()) return;
    const pendingPath = path; setBusy(true); setError('');
    try {
      const result = await request<{ data: { authorization_url: string } }>(token, `${pendingPath}/sign-in`, 'POST', {
        name: name.trim(), callback_origin: location.origin, ...(reconnect ? { account_id: reconnect.id } : {}),
      });
      if (currentPath.current !== pendingPath) return;
      const url = new URL(result.data.authorization_url);
      if (url.origin !== 'https://auth.openai.com' || url.pathname !== '/api/accounts/authorize') throw new Error('Could not start ChatGPT sign-in.');
      window.location.assign(url.href);
    } catch (reason) {
      if (currentPath.current === pendingPath) { setError(reason instanceof Error ? reason.message : 'Could not start sign-in.'); setBusy(false); }
    }
  }
  async function toggle(account: Account) {
    if (busy) return;
    const pendingPath = path; setBusy(true); setError('');
    try {
      await request(token, `${pendingPath}/${account.id}`, 'PATCH', { enabled: account.health === 'disabled' });
      if (currentPath.current === pendingPath) setReload(value => value + 1);
    } catch (reason) {
      if (currentPath.current === pendingPath) setError(reason instanceof Error ? reason.message : 'Could not update subscription.');
    } finally { if (currentPath.current === pendingPath) setBusy(false); }
  }

  return <Card className="mt-6 shadow-none">
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2"><CardTitle>Private Codex subscriptions</CardTitle><CardDescription>Use your own ChatGPT accounts through Niu. Connected accounts form a private pool for one workspace.</CardDescription></div>
        <div className="flex gap-2"><Button type="button" size="sm" variant="outline" aria-label="Refresh Codex subscriptions" disabled={busy || loading || !path} onClick={() => setReload(value => value + 1)}><RefreshCw size={15} /></Button><Button type="button" size="sm" disabled={busy || !path} onClick={() => connect(null)}><Plus size={15} />Connect Codex</Button></div>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="max-w-sm space-y-2">
        <Label htmlFor="codex-workspace">Workspace</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button id="codex-workspace" type="button" variant="outline" className="w-full justify-between font-normal" disabled={busy || !workspaces.length}>{workspace ? workspaceDisplayName(workspace.name) : 'Create a workspace first'}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={workspace?.id ?? ''} onValueChange={setWorkspaceId}>
            {workspaces.map(item => <DropdownMenuRadioItem key={item.id} value={item.id}>{workspaceDisplayName(item.name)}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>
      </div>
      {search.get('codex') === 'connected' && <p role="status" className="text-sm">Codex connected. Select the workspace you connected to view its accounts.</p>}
      {search.get('codex') === 'cancelled' && <p role="status" className="text-sm">ChatGPT sign-in was cancelled.</p>}
      {search.get('codex') === 'failed' && <p role="alert" className="text-sm text-destructive">Codex could not be connected. Try sign-in again and authorize ChatGPT plan usage. An existing account must be reconnected using its Sign in action.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading subscriptions…</p> : accounts.length ? <Table>
        <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Status</TableHead><TableHead>Models</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>{accounts.map(account => <TableRow key={account.id}>
          <TableCell><div className="flex items-center gap-3"><ProviderLogo provider={modelIdentity({ id: 'openai' })} /><span className="max-w-64 break-words">{account.name}</span></div></TableCell>
          <TableCell><Badge variant="secondary">{account.busy ? 'Reserved' : healthLabels[account.health] ?? 'Unavailable'}</Badge></TableCell>
          <TableCell>{account.models.length}</TableCell>
          <TableCell className="text-right"><div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" disabled={busy || account.busy} onClick={() => connect(account)}>Sign in</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void toggle(account)}>{account.health === 'disabled' ? 'Resume' : 'Pause'}</Button></div></TableCell>
        </TableRow>)}</TableBody>
      </Table> : <p className="text-sm text-muted-foreground">No Codex subscriptions connected to this workspace.</p>}
      {accounts.some(account => account.busy) && <p className="text-sm text-muted-foreground">Reserved accounts may have an active request or an uncertain outcome. Niu keeps them reserved until execution is confirmed.</p>}
      {selectedModel && <div className="space-y-3 border-t pt-4">
        <div className="max-w-sm space-y-2"><Label htmlFor="codex-model">Available model</Label>
          <DropdownMenu><DropdownMenuTrigger asChild><Button id="codex-model" type="button" variant="outline" className="w-full justify-between font-normal">{selectedModel.display_name}<ChevronDown size={16} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={selectedModel.slug} onValueChange={setModelSlug}>{models.map(model => <DropdownMenuRadioItem key={model.slug} value={model.slug}>{model.display_name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-sm text-muted-foreground">Call this model with a Niu API key from {workspace ? workspaceDisplayName(workspace.name) : 'your workspace'}. Text responses are buffered; sampling options, token limits and tools are not supported yet.</p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">{`curl ${location.origin}/v1/responses \\\n  -H "Authorization: Bearer $NIU_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ model: `codex/${selectedModel.slug}`, input: 'Say hello.', stream: false })}'`}</pre>
      </div>}
      <p className="text-sm text-muted-foreground">Requests use only this workspace’s connected accounts. Manage plan limits and app access in <a className="underline underline-offset-4" href="https://chatgpt.com/#settings/Usage" target="_blank" rel="noreferrer">ChatGPT settings</a>.</p>
    </CardContent>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent><DialogHeader><DialogTitle>{reconnect ? 'Reconnect Codex' : 'Connect Codex subscription'}</DialogTitle><DialogDescription>Authorize your ChatGPT plan for private API calls in {workspace ? workspaceDisplayName(workspace.name) : 'your workspace'}.</DialogDescription></DialogHeader>
        <form onSubmit={event => void signIn(event)} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="codex-account-name">Account name</Label><Input id="codex-account-name" value={name} maxLength={100} required disabled={busy} onChange={event => setName(event.target.value)} placeholder="e.g. My Codex" /></div>
          {!local && <p role="alert" className="text-sm">Open this self-hosted dashboard at http://127.0.0.1 on the gateway computer to connect Codex.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <p className="text-sm text-muted-foreground">Your credentials stay encrypted in the gateway. Each account serves one request at a time.</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || !local || !name.trim()}>{busy ? 'Opening ChatGPT…' : 'Continue with ChatGPT'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </Card>;
}
