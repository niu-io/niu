import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDashboardContext } from '@/app/dashboard-context';
import { providerAvailability, type ProviderSetup } from './provider-setup';
import ProviderMark from './components/ProviderMark';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { IconDots as MoreHorizontal, IconPlus as Plus } from '@tabler/icons-react';
import { request, writeMayHaveCommitted } from './api';

type ProviderSummary = ProviderSetup & { id: string; name: string; logo_url?: string; api_keys?: number; models?: number; members: number; qualification_status: string };
export default function ProviderList() {
  const { token } = useDashboardContext();
  const navigate = useNavigate();
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [dialog, setDialog] = useState<'add' | 'delete' | ''>('');
  const [selected, setSelected] = useState<ProviderSummary | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogTrigger = useRef<HTMLButtonElement | null>(null);
  const actionTriggers = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void request<{data: ProviderSummary[]}>(token, '/api/v1/providers', 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setProviders(result.data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, revision]);
  function open(action: typeof dialog, provider: ProviderSummary | null = null) { setError(''); setSelected(provider); setName(provider?.name ?? ''); setDialog(action); }
  const deletionBlocked = Boolean(selected && ((selected.api_keys ?? 0) > 0 || (selected.models ?? 0) > 0 || selected.members > 0));
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || (dialog === 'delete' && deletionBlocked)) return;
    setBusy(true); setError('');
    try {
      const result = await request<{ data?: { id?: string } }>(token, '/api/v1/providers' + (selected ? '/' + encodeURIComponent(selected.id) : ''), dialog === 'delete' ? 'DELETE' : 'POST', dialog === 'delete' ? undefined : { name: name.trim() });
      if (dialog === 'add') {
        setDialog('');
        if (typeof result?.data?.id === 'string' && result.data.id.trim()) {
          navigate('/admin/providers/' + encodeURIComponent(result.data.id));
        } else {
          setError('Provider was created, but its page could not be opened. Refresh the list to find it before adding another Provider.');
        }
        return;
      }
      setDialog(''); setRevision(value => value + 1);
    } catch (reason) {
      if (dialog === 'add' && writeMayHaveCommitted(reason)) {
        setDialog('');
        setError('Provider creation could not be confirmed. Refresh the list before adding another Provider; the previous request may have saved it.');
      } else setError(dialog === 'delete' ? 'This Provider could not be deleted. Providers with API keys, offers, or members must retain their records.' : reason instanceof Error ? reason.message : 'Could not save Provider.');
    }
    finally { setBusy(false); }
  }
  const visible = providers;
  return <>
    <PageHeader title="Providers" action={<div className="flex flex-wrap items-center gap-2"><Button asChild variant="outline"><Link to="/admin/route-pools">Route pools</Link></Button><Button onClick={event => { dialogTrigger.current = event.currentTarget; open('add'); }}><Plus className="size-4" />Add Provider</Button></div>} />
    <div className="space-y-5 py-5">
      <p className="text-sm text-muted-foreground">Connect an upstream API key, then add model routes. Supply readiness requires current Provider and offer approval, agreed rates, and enabled API routes. Customer selling prices and access are configured per workspace.</p>
      {error && !dialog && <p role="alert">{error}<Button variant="ghost" onClick={() => setRevision(value => value + 1)}>Retry</Button></p>}
      {loading ? <p role="status">Loading Providers…</p> : <Table className="supplier-directory-table"><TableHeader><TableRow><TableHead>Provider</TableHead><TableHead className="hidden sm:table-cell">API keys</TableHead><TableHead className="hidden sm:table-cell">Model routes</TableHead><TableHead>Supply readiness</TableHead><TableHead className="hidden sm:table-cell">Next step</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
        {visible.map(provider => { const availability = providerAvailability(provider); return <TableRow key={provider.id}><TableCell className="whitespace-normal"><div className="flex items-center gap-3"><ProviderMark url={provider.logo_url} /><Link className="min-w-0 break-words font-medium hover:underline" to={'/admin/providers/' + encodeURIComponent(provider.id)}>{provider.name}</Link></div></TableCell><TableCell className="hidden sm:table-cell">{provider.api_keys ?? '—'}</TableCell><TableCell className="hidden sm:table-cell">{provider.models ?? '—'}</TableCell><TableCell className="whitespace-normal"><Badge className="whitespace-normal" variant={availability.usable ? "secondary" : "outline"}>{availability.label}</Badge><p className="mt-1 whitespace-normal text-xs text-muted-foreground">{availability.detail}</p><Button asChild={availability.section !== 'refresh'} onClick={availability.section === 'refresh' ? () => setRevision(value => value + 1) : undefined} variant="link" className="mt-2 h-auto whitespace-normal p-0 text-left sm:hidden">{availability.section === 'refresh' ? availability.action : <Link to={'/admin/providers/' + encodeURIComponent(provider.id) + '/' + availability.section}>{availability.action}</Link>}</Button></TableCell><TableCell className="hidden sm:table-cell"><Button asChild={availability.section !== 'refresh'} onClick={availability.section === 'refresh' ? () => setRevision(value => value + 1) : undefined} variant="link" className="h-auto whitespace-normal p-0 text-left">{availability.section === 'refresh' ? availability.action : <Link to={'/admin/providers/' + encodeURIComponent(provider.id) + '/' + availability.section}>{availability.action}</Link>}</Button></TableCell><TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" ref={node => { if (node) actionTriggers.current.set(provider.id, node); else actionTriggers.current.delete(provider.id); }} onClick={event => { dialogTrigger.current = event.currentTarget; }} onFocus={event => { dialogTrigger.current = event.currentTarget; }} aria-label={'Actions for ' + provider.name}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to={'/admin/providers/' + encodeURIComponent(provider.id)}>Open Provider</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to={'/admin/providers/' + encodeURIComponent(provider.id) + '/settings'}>Edit Provider</Link></DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => { dialogTrigger.current = actionTriggers.current.get(provider.id) ?? null; open('delete', provider); }}>Delete Provider</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>; })}
        {!visible.length && <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">{providers.length ? 'No matching Providers.' : 'No Providers yet. Add your first Provider to configure its API keys and models.'}</TableCell></TableRow>}
      </TableBody></Table>}
    </div>
    <Dialog open={Boolean(dialog)} onOpenChange={open => { if (!open && !busy) setDialog(''); }}><DialogContent className="niu-modal" onCloseAutoFocus={event => { if (dialogTrigger.current?.isConnected) { event.preventDefault(); dialogTrigger.current.focus(); } }}><DialogHeader><DialogTitle>{dialog === 'delete' ? `Delete ${selected?.name}?` : 'Add Provider'}</DialogTitle><DialogDescription>{dialog === 'delete' ? deletionBlocked ? 'This Provider has API keys, models, or members and cannot be deleted. Audit history is retained.' : 'Only Providers without API keys, offers, or members can be deleted. Audit history is retained.' : 'Add the business supplying your models. Configure API keys and rates in its detail page.'}</DialogDescription></DialogHeader><form onSubmit={event => void save(event)} className="space-y-5">{dialog !== 'delete' && <div className="space-y-2"><Label htmlFor="supplier-name">Provider name</Label><Input id="supplier-name" autoFocus maxLength={100} required value={name} disabled={busy} onChange={event => setName(event.target.value)} /></div>}{error && <p role="alert" className="text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDialog('')}>Cancel</Button><Button variant={dialog === 'delete' ? 'destructive' : 'default'} disabled={busy || (dialog === 'delete' ? deletionBlocked : !name.trim())}>{busy ? dialog === 'delete' ? 'Deleting…' : 'Adding…' : dialog === 'delete' ? 'Delete Provider' : 'Add Provider'}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}
