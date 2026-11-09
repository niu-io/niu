import type { ProviderServiceDescriptor } from '@niu-io/sdk';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { providerPathSegment } from '@/shell/provider-route';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDashboardContext } from '@/shell/dashboard-context';
import { providerAvailability, type ProviderSetup } from './provider-setup';
import ProviderMark from './components/ProviderMark';
import { providerPreset, type ProviderPreset } from './provider-presets';
import ProviderConnectDialog from './components/ProviderConnectDialog';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { IconDots as MoreHorizontal, IconPlus as Plus, IconChevronDown, IconPlugConnected, IconRoute } from '@tabler/icons-react';
import { providerLogoPresets, providerLogoIsMonochrome } from './provider-logos';
import { TableSkeleton } from '@/components/PageSkeletons';
import { fetchQuery, invalidateForMutation, peekQuery } from '@/lib/query-cache';
import { prefetchRouteIntent } from '@/shell/prefetch';
import { prefetchGet, request, writeMayHaveCommitted } from './api';

type ProviderSummary = ProviderSetup & { id: string; slug?: string; name: string; logo_url?: string; api_keys?: number; models?: number; members: number };
const PROVIDERS_PATH = '/api/v1/providers';
export default function ProviderList() {
  const { t: uiT, format: uiF } = useUILocale();
  const { token, session } = useDashboardContext();
  const navigate = useNavigate();
  const scope = token || 'public';
  const initialProviders = token ? peekQuery<{ data: ProviderSummary[] }>(scope, PROVIDERS_PATH)?.data ?? null : null;
  const [providers, setProviders] = useState<ProviderSummary[]>(() => initialProviders ?? []);
  const [loading, setLoading] = useState(() => Boolean(token && !initialProviders));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const lastRevision = useRef(0);
  const [providerPresets, setProviderPresets] = useState<ProviderPreset[]>([]);
  const [presetError, setPresetError] = useState('');
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [preset, setPreset] = useState<ProviderPreset | null>(null);
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
    const force = lastRevision.current !== revision;
    lastRevision.current = revision;
    const cached = token ? peekQuery<{ data: ProviderSummary[] }>(scope, PROVIDERS_PATH)?.data ?? null : null;
    if (cached && !force) {
      setProviders(cached);
      setLoading(false);
    } else if (!cached) {
      setLoading(true);
    }
    setError('');
    void fetchQuery<{ data: ProviderSummary[] }>(
      scope,
      PROVIDERS_PATH,
      signal => request<{ data: ProviderSummary[] }>(token, PROVIDERS_PATH, 'GET', undefined, signal),
      { signal: controller.signal, force, awaitRevalidate: true },
    )
      .then(result => { if (!controller.signal.aborted) setProviders(result.data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [scope, token, revision]);
  useEffect(() => {
    const controller = new AbortController();
    setPresetsLoading(true); setPresetError(''); setProviderPresets([]);
    void request<{data:ProviderServiceDescriptor[]}>(token, '/api/v1/providers/presets', 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setProviderPresets(result.data.map(providerPreset)); })
      .catch(reason => { if (!controller.signal.aborted) setPresetError(reason instanceof Error ? reason.message : 'Could not load Provider presets.'); })
      .finally(() => { if (!controller.signal.aborted) setPresetsLoading(false); });
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
      invalidateForMutation(token, PROVIDERS_PATH, dialog === 'delete' ? 'DELETE' : 'POST');
      if (dialog === 'add') {
        setDialog('');
        window.dispatchEvent(new Event('niu:provider-profile-updated'));
        if (typeof result?.data?.id === 'string' && result.data.id.trim()) {
          navigate('/admin/providers/' + encodeURIComponent(result.data.slug || result.data.id) + (session?.operating_mode === 'internal' ? '/keys' : ''));
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
    {preset && <ProviderConnectDialog key={preset.id} preset={preset} onClose={() => setPreset(null)} onSaved={() => { invalidateForMutation(token, PROVIDERS_PATH, 'POST'); setRevision(value => value + 1); window.dispatchEvent(new Event('niu:provider-profile-updated')); }} />}
    <PageHeader title={uiT("Providers")} action={<div className="flex flex-wrap items-center gap-2"><Button asChild variant="outline" className="header-icon-action"><Link to="/admin/routing" aria-label={uiT("Routing")} title={uiT("Routing")}><IconRoute className="size-4"/><span>{uiT("Routing")}</span></Link></Button><Button className="header-icon-action" aria-label={uiT("Add Provider")} title={uiT("Add Provider")} onClick={event => { dialogTrigger.current = event.currentTarget; open('add'); }}><Plus className="size-4" /><span>{uiT("Add Provider")}</span></Button></div>} />
    <div className="empty-region space-y-5 py-5">
      <p className="text-sm text-muted-foreground">{session?.operating_mode === 'resale' ? uiT("Manage upstream supply for customer billing. Commercial offers and customer prices are required.") : uiT("Connect Providers for your internal workspaces. You pay each Provider directly.")}</p>

      <h2 className="text-base font-semibold">{uiT("Configured Providers")}</h2>
      {error && !dialog && <p role="alert">{error}<Button variant="ghost" onClick={() => setRevision(value => value + 1)}>{uiT("Retry")}</Button></p>}
      {loading ? <TableSkeleton columns={3} rows={5} label={uiT("Loading Providers…")} /> : !visible.length ? !error && <Empty className="min-h-36 rounded-xl border border-dashed border-border/60 bg-muted/20 py-7"><EmptyHeader><EmptyMedia variant="icon"><IconPlugConnected size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("No Providers yet. Choose one below to connect.")}</EmptyDescription></EmptyHeader></Empty> : <ul className="divide-y divide-border" aria-label={uiT("Configured Providers")}>
        {visible.map(provider => { const availability = providerAvailability(provider); const warmProvider = () => { prefetchRouteIntent('providers'); if (token) prefetchGet(token, `/api/v1/providers/${encodeURIComponent(provider.id)}`); }; return <li key={provider.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
          <div className="flex min-w-48 flex-1 items-center gap-3"><ProviderMark url={provider.logo_url} preset={providerPresets.find(item => item.name === provider.name)} /><Link className="min-w-0 break-words font-medium hover:underline" to={'/admin/providers/' + encodeURIComponent(providerPathSegment(provider))} onMouseEnter={warmProvider} onFocus={warmProvider}>{provider.name}</Link></div>
          <div className="min-w-48 flex-[2]"><Badge className="whitespace-normal" variant={availability.usable ? "secondary" : "outline"}>{uiT(availability.label)}</Badge>{!(provider.internal_api_keys && provider.internal_api_keys === provider.api_keys) && <p className="mt-1 text-xs text-muted-foreground">{availability.label === 'Ready to supply' ? uiF("{0} of {1} offers ready", [provider.ready_offers ?? 0, provider.offers ?? '—']) : uiT(availability.detail)}</p>}</div>
          <div className="flex items-center gap-2"><Button asChild={availability.section !== 'refresh'} onClick={availability.section === 'refresh' ? () => setRevision(value => value + 1) : undefined} variant="outline" size="sm">{availability.section === 'refresh' ? uiT(availability.action) : <Link to={'/admin/providers/' + encodeURIComponent(providerPathSegment(provider)) + '/' + availability.section} onMouseEnter={warmProvider} onFocus={warmProvider}>{uiT(availability.action)}</Link>}</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" ref={node => { if (node) actionTriggers.current.set(provider.id, node); else actionTriggers.current.delete(provider.id); }} onClick={event => { dialogTrigger.current = event.currentTarget; }} onFocus={event => { dialogTrigger.current = event.currentTarget; }} aria-label={uiF("Actions for {0}", [provider.name])}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to={'/admin/providers/' + encodeURIComponent(providerPathSegment(provider))} onMouseEnter={warmProvider} onFocus={warmProvider}>{uiT("Open Provider")}</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to={'/admin/providers/' + encodeURIComponent(providerPathSegment(provider)) + '/settings'} onMouseEnter={warmProvider} onFocus={warmProvider}>{uiT("Edit Provider")}</Link></DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => { dialogTrigger.current = actionTriggers.current.get(provider.id) ?? null; open('delete', provider); }}>{uiT("Delete Provider")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
        </li>; })}
      </ul>}
      <section aria-labelledby="provider-presets-title" className="space-y-3">
        <h2 id="provider-presets-title" className="text-base font-semibold">{uiT("Available Providers")}</h2>
        <p className="text-sm text-muted-foreground">{session?.operating_mode === 'resale' ? uiT("Choose a Provider and save its API key. Commercial offers and customer prices are required before selling.") : uiT("Choose a Provider and enter its API key to import models. You pay the Provider directly.")}</p>
        {presetError && <p role="alert">{presetError}<Button variant="ghost" onClick={() => setRevision(value => value + 1)}>{uiT("Retry")}</Button></p>}
        {presetsLoading ? <TableSkeleton columns={2} rows={5} label={uiT("Loading Providers…")} /> : <ul className="divide-y divide-border" aria-label={uiT("Available Providers")}>
          {providerPresets.map(item => { const isConfigured = visible.some(p => p.name.toLowerCase() === item.name.toLowerCase()); return <li key={item.id} className="flex min-w-0 items-center justify-between gap-4 py-4"><span className="flex min-w-0 items-center gap-3 font-medium"><ProviderMark preset={item} /><span>{item.name}</span>{isConfigured && <Badge variant="secondary" className="font-normal">{uiT("Configured")}</Badge>}</span><Button variant="outline" size="sm" onClick={() => setPreset(item)} aria-label={uiF("Connect {0}", [item.name])}>{uiT("Connect")}</Button></li>; })}
        </ul>}
      </section>
    </div>
    <Dialog open={Boolean(dialog)} onOpenChange={open => { if (!open && !busy) setDialog(''); }}><DialogContent className="niu-modal max-h-[calc(100dvh-2rem)] overflow-y-auto" onCloseAutoFocus={event => { if (dialogTrigger.current?.isConnected) { event.preventDefault(); dialogTrigger.current.focus(); } }}><DialogHeader><DialogTitle>{dialog === 'delete' ? uiF("Delete {0}?", [selected?.name]) : uiT("Add Provider")}</DialogTitle><DialogDescription>{dialog === 'delete' ? deletionBlocked ? uiT("This Provider has API keys, models, or members and cannot be deleted. Audit history is retained.") : uiT("Only Providers without API keys, offers, or members can be deleted. Audit history is retained.") : uiT("Add the business supplying your models. Only the name is required; you can update these details in Settings.")}</DialogDescription></DialogHeader><form onSubmit={event => void save(event)} className="space-y-5">{dialog !== 'delete' && <fieldset disabled={busy} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="supplier-name">{uiT("Provider name")}</Label><Input id="supplier-name" autoFocus maxLength={100} required value={name} onChange={event => setName(event.target.value)} placeholder={uiT("e.g. OpenRouter")} /></div>
          <div className="space-y-2"><Label htmlFor="provider-create-website">{uiT("Website (optional)")}</Label><Input id="provider-create-website" type="url" maxLength={2048} value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://example.com" /></div>
          <div className="space-y-2"><Label htmlFor="provider-create-description">{uiT("Description (optional)")}</Label><Textarea id="provider-create-description" rows={3} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder={uiT("A short description of this Provider.")} /></div>
          <div className="space-y-2">
            <Label htmlFor="provider-create-logo">{uiT("Logo URL (optional)")}</Label>
            <div className="flex min-w-0 items-center gap-3"><ProviderMark url={logo} /><Input id="provider-create-logo" type="url" maxLength={2048} value={logo} onChange={event => setLogo(event.target.value)} placeholder="https://example.com/logo.png" aria-describedby="provider-create-logo-help" /></div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label={uiT("Choose Provider logo")} disabled={busy}>{providerLogoPresets.find(preset => preset.url === logo)?.name ?? (logo ? uiT("Custom logo") : uiT("Default logo"))}<IconChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup value={logo} onValueChange={setLogo}>
                  <DropdownMenuRadioItem value=""><IconPlugConnected aria-hidden="true" />{uiT("Default logo")}</DropdownMenuRadioItem>
                  {providerLogoPresets.map(preset => <DropdownMenuRadioItem key={preset.name} value={preset.url}><img src={preset.src} alt="" className={`size-4 object-contain${providerLogoIsMonochrome(preset.url) ? ' dark:invert' : ''}`} />{preset.name}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <p id="provider-create-logo-help" className="text-sm text-muted-foreground">{uiT("Choose a preset or enter a public image URL. Leave empty to use the default logo.")}</p>
          </div>
        </fieldset>}{error && <p role="alert" className="text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDialog('')}>{uiT("Cancel")}</Button><Button variant={dialog === 'delete' ? 'destructive' : 'default'} disabled={busy || (dialog === 'delete' ? deletionBlocked : !name.trim())}>{busy ? dialog === 'delete' ? uiT("Deleting…") : uiT("Adding…") : dialog === 'delete' ? uiT("Delete Provider") : uiT("Add Provider")}</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}
