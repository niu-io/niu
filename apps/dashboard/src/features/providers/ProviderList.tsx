import { providerPathSegment } from '@/app/provider-route';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDashboardContext } from '@/app/dashboard-context';
import { providerAvailability, type ProviderSetup } from './provider-setup';
import ProviderMark from './components/ProviderMark';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { IconDots as MoreHorizontal, IconPlus as Plus, IconChevronDown, IconPlugConnected, IconRoute } from '@tabler/icons-react';
import { providerLogoPresets, providerLogoIsMonochrome } from './provider-logos';
import { request, writeMayHaveCommitted } from './api';

type ProviderSummary = ProviderSetup & { id: string; slug?: string; name: string; logo_url?: string; api_keys?: number; models?: number; members: number; qualification_status: string };
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
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [logo, setLogo] = useState('');
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
  function open(action: typeof dialog, provider: ProviderSummary | null = null) {
    setError(''); setSelected(provider); setName(provider?.name ?? '');
    setDescription(''); setWebsite(''); setLogo(''); setDialog(action);
  }
  const deletionBlocked = Boolean(selected && ((selected.api_keys ?? 0) > 0 || (selected.models ?? 0) > 0 || selected.members > 0));
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || (dialog === 'delete' && deletionBlocked)) return;
    setBusy(true); setError('');
    try {
      const result = await request<{ data?: { id?: string; slug?: string } }>(token, '/api/v1/providers' + (selected ? '/' + encodeURIComponent(selected.id) : ''), dialog === 'delete' ? 'DELETE' : 'POST', dialog === 'delete' ? undefined : {
        name: name.trim(),
        ...(description.trim() && { description: description.trim() }),
        ...(website.trim() && { website_url: website.trim() }),
        ...(logo.trim() && { logo_url: logo.trim() }),
      });
      if (dialog === 'add') {
        setDialog('');
        window.dispatchEvent(new Event('niu:provider-profile-updated'));
        if (typeof result?.data?.id === 'string' && result.data.id.trim()) {
          navigate('/admin/providers/' + encodeURIComponent(result.data.slug || result.data.id));
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
    <PageHeader title="Providers" action={<div className="flex flex-wrap items-center gap-2"><Button asChild variant="outline" className="header-icon-action"><Link to="/admin/pools" aria-label="Model pools" title="Model pools"><IconRoute className="size-4"/><span>Model pools</span></Link></Button><Button className="header-icon-action" aria-label="Add Provider" title="Add Provider" onClick={event => { dialogTrigger.current = event.currentTarget; open('add'); }}><Plus className="size-4" /><span>Add Provider</span></Button></div>} />
    <div className="space-y-5 py-5">
      <p className="text-sm text-muted-foreground">Connect an upstream API key, then add model routes. Commercial supply requires current Provider and offer approval, agreed rates, and enabled API routes. Personal API keys do not require commercial approval; usage is billed directly by the Provider. Set customer selling prices in Pricing. Manage model access and limits in each workspace.</p>
      {error && !dialog && <p role="alert">{error}<Button variant="ghost" onClick={() => setRevision(value => value + 1)}>Retry</Button></p>}
      {loading ? <p role="status">Loading Providers…</p> : <Table className="supplier-directory-table"><TableHeader><TableRow><TableHead>Provider</TableHead><TableHead className="hidden sm:table-cell">API keys</TableHead><TableHead className="hidden sm:table-cell">Model routes</TableHead><TableHead>Commercial supply</TableHead><TableHead className="hidden sm:table-cell">Next step</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
        {visible.map(provider => { const availability = providerAvailability(provider); return <TableRow key={provider.id}><TableCell className="whitespace-normal"><div className="flex items-center gap-3"><ProviderMark url={provider.logo_url} /><Link className="min-w-0 break-words font-medium hover:underline" to={'/admin/providers/' + encodeURIComponent(providerPathSegment(provider))}>{provider.name}</Link></div></TableCell><TableCell className="hidden sm:table-cell">{provider.api_keys ?? '—'}</TableCell><TableCell className="hidden sm:table-cell">{provider.models ?? '—'}</TableCell><TableCell className="whitespace-normal"><Badge className="whitespace-normal" variant={availability.usable ? "secondary" : "outline"}>{availability.label}</Badge><p className="mt-1 whitespace-normal text-xs text-muted-foreground">{availability.detail}</p><Button asChild={availability.section !== 'refresh'} onClick={availability.section === 'refresh' ? () => setRevision(value => value + 1) : undefined} variant="link" className="mt-2 h-auto whitespace-normal p-0 text-left sm:hidden">{availability.section === 'refresh' ? availability.action : <Link to={'/admin/providers/' + encodeURIComponent(providerPathSegment(provider)) + '/' + availability.section}>{availability.action}</Link>}</Button></TableCell><TableCell className="hidden sm:table-cell"><Button asChild={availability.section !== 'refresh'} onClick={availability.section === 'refresh' ? () => setRevision(value => value + 1) : undefined} variant="link" className="h-auto whitespace-normal p-0 text-left">{availability.section === 'refresh' ? availability.action : <Link to={'/admin/providers/' + encodeURIComponent(providerPathSegment(provider)) + '/' + availability.section}>{availability.action}</Link>}</Button></TableCell><TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" ref={node => { if (node) actionTriggers.current.set(provider.id, node); else actionTriggers.current.delete(provider.id); }} onClick={event => { dialogTrigger.current = event.currentTarget; }} onFocus={event => { dialogTrigger.current = event.currentTarget; }} aria-label={'Actions for ' + provider.name}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to={'/admin/providers/' + encodeURIComponent(providerPathSegment(provider))}>Open Provider</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to={'/admin/providers/' + encodeURIComponent(providerPathSegment(provider)) + '/settings'}>Edit Provider</Link></DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => { dialogTrigger.current = actionTriggers.current.get(provider.id) ?? null; open('delete', provider); }}>Delete Provider</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>; })}
        {!visible.length && <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">{providers.length ? 'No matching Providers.' : 'No Providers yet. Add your first Provider to configure its API keys and models.'}</TableCell></TableRow>}
      </TableBody></Table>}
    </div>
    <Dialog open={Boolean(dialog)} onOpenChange={open => { if (!open && !busy) setDialog(''); }}><DialogContent className="niu-modal max-h-[calc(100dvh-2rem)] overflow-y-auto" onCloseAutoFocus={event => { if (dialogTrigger.current?.isConnected) { event.preventDefault(); dialogTrigger.current.focus(); } }}><DialogHeader><DialogTitle>{dialog === 'delete' ? `Delete ${selected?.name}?` : 'Add Provider'}</DialogTitle><DialogDescription>{dialog === 'delete' ? deletionBlocked ? 'This Provider has API keys, models, or members and cannot be deleted. Audit history is retained.' : 'Only Providers without API keys, offers, or members can be deleted. Audit history is retained.' : 'Add the business supplying your models. Only the name is required; you can update these details in Settings.'}</DialogDescription></DialogHeader><form onSubmit={event => void save(event)} className="space-y-5">{dialog !== 'delete' && <fieldset disabled={busy} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="supplier-name">Provider name</Label><Input id="supplier-name" autoFocus maxLength={100} required value={name} onChange={event => setName(event.target.value)} placeholder="e.g. OpenRouter" /></div>
          <div className="space-y-2"><Label htmlFor="provider-create-website">Website (optional)</Label><Input id="provider-create-website" type="url" maxLength={2048} value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://example.com" /></div>
          <div className="space-y-2"><Label htmlFor="provider-create-description">Description (optional)</Label><Textarea id="provider-create-description" rows={3} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder="A short description of this Provider." /></div>
          <div className="space-y-2">
            <Label htmlFor="provider-create-logo">Logo URL (optional)</Label>
            <div className="flex min-w-0 items-center gap-3"><ProviderMark url={logo} /><Input id="provider-create-logo" type="url" maxLength={2048} value={logo} onChange={event => setLogo(event.target.value)} placeholder="https://example.com/logo.png" aria-describedby="provider-create-logo-help" /></div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label="Choose Provider logo" disabled={busy}>{providerLogoPresets.find(preset => preset.url === logo)?.name ?? (logo ? 'Custom logo' : 'Default logo')}<IconChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup value={logo} onValueChange={setLogo}>
                  <DropdownMenuRadioItem value=""><IconPlugConnected aria-hidden="true" />Default logo</DropdownMenuRadioItem>
                  {providerLogoPresets.map(preset => <DropdownMenuRadioItem key={preset.name} value={preset.url}><img src={preset.src} alt="" className={`size-4 object-contain${providerLogoIsMonochrome(preset.url) ? ' dark:invert' : ''}`} />{preset.name}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <p id="provider-create-logo-help" className="text-sm text-muted-foreground">Choose a preset or enter a public image URL. Leave empty to use the default logo.</p>
          </div>
        </fieldset>}{error && <p role="alert" className="text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDialog('')}>Cancel</Button><Button variant={dialog === 'delete' ? 'destructive' : 'default'} disabled={busy || (dialog === 'delete' ? deletionBlocked : !name.trim())}>{busy ? dialog === 'delete' ? 'Deleting…' : 'Adding…' : dialog === 'delete' ? 'Delete Provider' : 'Add Provider'}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}
