import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from '@/components/ui/empty';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { IconChevronDown, IconDownload, IconPlus, IconSearch } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { TableSkeleton } from '@/components/PageSkeletons';
import ProviderLogo from '@/components/ProviderLogo';
import { modelIdentity } from '@/lib/providers';
import ModelMappingForm from '@/features/providers/components/ModelMappingForm';
import { cachedGet, peekCachedGet, request, writeMayHaveCommitted, integrationLabels, type ProviderConnection, type ProviderModel, type ModelWrite, type ProviderCatalogModel, type ProviderDiscoveryEvidence, type ProviderModelCheck } from '@/features/providers/api';
import { modelCapabilityLabels, modelCheckLabel } from '@/features/providers/model-presentation';
import type { ProviderOffer } from '@niu-io/sdk/admin';

type Entry = { connection: ProviderConnection; model: ProviderModel };
type CheckState = { identity: string; sequence: number; pending: boolean; result?: ProviderModelCheck; error?: string };
function peekScopedModels(token: string, providerId: string): { connections: ProviderConnection[]; entries: Entry[] } | null {
  if (!token || !providerId) return null;
  const vendors = peekCachedGet<{ data: ProviderConnection[] }>(token, `/api/v1/vendors?supplier=${encodeURIComponent(providerId)}`)?.data;
  if (!vendors) return null;
  const scoped = vendors.filter(item => (item.provider ?? item.supplier)?.id === providerId);
  const entries: Entry[] = [];
  for (const connection of scoped) {
    const models = peekCachedGet<{ data: ProviderModel[] }>(token, `/api/v1/vendors/${encodeURIComponent(connection.id)}/models`)?.data;
    if (!models) return null;
    for (const model of models) entries.push({ connection, model });
  }
  return { connections: scoped, entries };
}
type Props = {
  token: string; providerId: string; providerSlug: string; canManage: boolean;
  offers: ProviderOffer[]; offersComplete: boolean;
  commercialEnabled?: boolean;
  onOffer: (alias: string, media: boolean) => void;
  onEnableOffer: (id: string) => void;
  onSaved: () => void;
};

/** Provider-specific model task: connection configuration and purchase readiness stay distinct. */
export default function ProviderModels(props: Props) {
  // Remount on authorization/provider changes so neither reads nor dialogs cross scopes.
  return <ScopedModels key={`${props.token}:${props.providerId}:${props.canManage}`} {...props} />;
}
function ScopedModels({ token, providerId, providerSlug, canManage, offers, offersComplete, commercialEnabled = true, onOffer, onEnableOffer: _onEnableOffer, onSaved }: Props) {
  const { t: uiT, format: uiF } = useUILocale();
  const initial = peekScopedModels(token, providerId);
  const [connections, setConnections] = useState<ProviderConnection[]>(() => initial?.connections ?? []);
  const [entries, setEntries] = useState<Entry[]>(() => initial?.entries ?? []);
  const [loading, setLoading] = useState(() => !initial);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [revision, setRevision] = useState(0);
  const lastRevision = useRef(0);
  const offerState = JSON.stringify(offers.map(({id, revision: offerRevision, active, qualified, route_ready}) => [id, offerRevision, active, qualified, route_ready]));
  const previousOfferState = useRef(offerState);
  useEffect(() => {
    if (previousOfferState.current !== offerState) {
      previousOfferState.current = offerState;
      setRevision(value => value + 1);
    }
  }, [offerState]);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const opener = useRef<HTMLElement | null>(null);
  const [editor, setEditor] = useState<{ connectionId: string; model: ProviderModel | null; initialAlias?: string } | null>(null);
  const [catalog, setCatalog] = useState<ProviderCatalogModel[]>([]);
  const [discovery, setDiscovery] = useState<ProviderDiscoveryEvidence | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const catalogRequest = useRef<AbortController | null>(null);
  useEffect(() => { catalogRequest.current?.abort(); setCatalog([]); setDiscovery(null); setCatalogError(''); setCatalogLoading(false); return () => catalogRequest.current?.abort(); }, [editor?.connectionId]);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState('');
  const write = useRef<AbortController | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; write.current?.abort(); }; }, []);
  const checkSequence = useRef(0);
  const [checks, setChecks] = useState<Record<string, CheckState>>({});
  useEffect(() => {
    const controller = new AbortController();
    const force = lastRevision.current !== revision;
    lastRevision.current = revision;
    const cached = peekScopedModels(token, providerId);
    if (cached && !force) {
      setConnections(cached.connections);
      setEntries(cached.entries);
      setLoading(false);
    } else if (!cached) {
      setLoading(true); setEntries([]); setConnections([]);
    }
    setError('');
    void (async () => {
      const result = await cachedGet<{data: ProviderConnection[]}>(token, `/api/v1/vendors?supplier=${encodeURIComponent(providerId)}`, { signal: controller.signal, force });
      const scoped = result.data.filter(item => (item.provider ?? item.supplier)?.id === providerId);
      const models = await Promise.all(scoped.map(async connection => {
        const response = await cachedGet<{data: ProviderModel[]}>(token, `/api/v1/vendors/${encodeURIComponent(connection.id)}/models`, { signal: controller.signal, force });
        return response.data.map(model => ({ connection, model }));
      }));
      if (!controller.signal.aborted) { setConnections(scoped); setEntries(models.flat()); }
    })().catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Models could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, providerId, revision]);
  const keysHref = `/admin/providers/${encodeURIComponent(providerSlug)}/keys`;
  const aliases = [...new Set([...entries.map(entry => entry.model.alias), ...offers.map(offer => offer.model_alias)])]
    .sort((a, b) => a.localeCompare(b)).filter(alias => {
      const details = entries.filter(entry => entry.model.alias === alias).map(entry => `${entry.model.upstream_model} ${entry.connection.name}`).join(' ');
      return `${alias} ${details}`.toLowerCase().includes(query.trim().toLowerCase());
    });
  function openEditor(value: NonNullable<typeof editor>) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditor(value);
  }
  const selectedConnection = connections.find(connection => connection.id === editor?.connectionId);
  async function loadCatalog() {
    if (!editor || !canManage || catalogLoading) return;
    const controller = new AbortController(); catalogRequest.current?.abort(); catalogRequest.current = controller;
    setCatalogLoading(true); setCatalogError('');
    try {
      const result = await request<{data: ProviderCatalogModel[]; discovery?: ProviderDiscoveryEvidence}>(token, `/api/v1/vendors/${encodeURIComponent(editor.connectionId)}/catalog`, 'GET', undefined, controller.signal);
      if (!controller.signal.aborted) { setCatalog(result.data); setDiscovery(result.discovery ?? null); }
    } catch { if (!controller.signal.aborted) { setCatalogError('Catalog unavailable.'); setDiscovery(null); } }
    finally { if (!controller.signal.aborted) setCatalogLoading(false); }
  }
  function checkIdentity(connection: ProviderConnection, model: ProviderModel) {
    return JSON.stringify([connection.id, connection.revision, model.alias, model.revision, model.upstream_model, model.enabled]);
  }
  async function checkModel(connection: ProviderConnection, model: ProviderModel) {
    if (!canManage) return;
    const key = `${connection.id}:${model.alias}`;
    const identity = checkIdentity(connection, model);
    const sequence = ++checkSequence.current;
    setChecks(current => ({ ...current, [key]: { identity, sequence, pending: true } }));
    try {
      const result = await request<{ data: ProviderModelCheck }>(token, `/api/v1/vendors/${encodeURIComponent(connection.id)}/check`, 'POST', { alias: model.alias });
      if (!active.current) return;
      setChecks(current => current[key]?.sequence === sequence
        ? { ...current, [key]: { identity, sequence, pending: false, result: result.data } } : current);
    } catch (reason) {
      if (!active.current) return;
      setChecks(current => current[key]?.sequence === sequence
        ? { ...current, [key]: { identity, sequence, pending: false, error: reason instanceof Error ? reason.message : 'Check failed.' } } : current);
    }
  }
  async function save(input: ModelWrite) {
    if (!canManage || !editor || !selectedConnection || write.current) return;
    const controller = new AbortController(); write.current = controller; setBusy(true); setNotice(''); setActionError('');
    try {
      await request(token, `/api/v1/vendors/${encodeURIComponent(selectedConnection.id)}/models`, 'POST', input, controller.signal);
      if (!active.current || controller.signal.aborted) return;
      setEditor(null); setNotice('Model saved. Availability is being refreshed.');
      setRevision(value => value + 1); onSaved();
    } catch (reason) {
      if (!active.current || controller.signal.aborted) return;
      if (writeMayHaveCommitted(reason)) {
        setEditor(null); setNotice('The save could not be confirmed. Review the refreshed configuration before trying again.'); setRevision(value => value + 1);
      } else throw reason;
    } finally { if (active.current) { setBusy(false); write.current = null; } }
  }
  async function importModels(connection: ProviderConnection) {
    if (!canManage || write.current || loading || error) return;
    const controller = new AbortController(); write.current = controller; setBusy(true); setImporting(connection.id); setNotice(''); setActionError('');
    try {
      const result = await request<{ data: { imported: number; discovered: number } }>(token, `/api/v1/vendors/${encodeURIComponent(connection.id)}/import`, 'POST', {}, controller.signal);
      if (!active.current || controller.signal.aborted) return;
      setNotice(uiF('Imported {0} of {1} discovered models.', [result.data.imported, result.data.discovered]));
      setRevision(value => value + 1); onSaved();
    } catch (reason) {
      if (!active.current || controller.signal.aborted) return;
      if (writeMayHaveCommitted(reason)) {
        setNotice('The import could not be confirmed. Review the refreshed models before importing again.');
        setRevision(value => value + 1);
      } else setActionError(reason instanceof Error ? reason.message : 'Could not import models.');
    } finally { if (active.current) { setBusy(false); setImporting(''); write.current = null; } }
  }
  return <div className="empty-region space-y-4 py-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="relative w-full min-w-56 sm:max-w-sm sm:flex-1">
        <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input className="pl-9" aria-label={uiT("Filter configured models")} placeholder={uiT("Filter by model or API key…")} value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!canManage || loading || !!error || !connections.length} onClick={() => openEditor({connectionId: connections[0].id, model: null})}><IconPlus size={16} />{uiT("Add model")}</Button>
        {connections.length === 1 && <Button size="sm" variant="outline" disabled={!canManage || loading || !!error || busy} onClick={() => void importModels(connections[0])}><IconDownload size={16} />{importing ? uiT("Importing…") : uiT("Import models")}</Button>}
        {connections.length > 1 && <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={!canManage || loading || !!error || busy}><IconDownload size={16} />{importing ? uiT("Importing…") : uiT("Import models")}<IconChevronDown size={16} /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">{connections.map(connection => <DropdownMenuItem key={connection.id} disabled={busy} onSelect={() => void importModels(connection)}>{uiF('Import from {0}', [connection.name || uiT("Unnamed API key")])}</DropdownMenuItem>)}</DropdownMenuContent>
        </DropdownMenu>}
        <Button size="sm" variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}>{uiT("Refresh")}</Button>
        <Button asChild size="sm" variant="ghost"><Link to={keysHref}>{uiT("Manage API keys")}</Link></Button>
      </div>
    </div>
    {notice && <p role="status" className="text-sm">{uiT(notice)}</p>}
    {actionError && <p role="alert" className="text-sm text-destructive">{uiT(actionError)}</p>}
    {loading ? <TableSkeleton columns={commercialEnabled ? 5 : 4} rows={4} label={uiT("Loading models…")} /> : error ? <div role="alert"><p>{uiT(error)}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>{uiT("Retry loading models")}</Button></div> : <>
      {!connections.length && <p className="text-sm text-muted-foreground">{uiT("Connect a Provider API key before adding models.")}{" "}<Link className="underline text-foreground" to={keysHref}>{uiT("Connect API key")}</Link></p>}
      {!aliases.length ? <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><IconSearch size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{query ? uiT("No models match this filter.") : uiT("No models configured yet.")}</EmptyDescription></EmptyHeader></Empty> : <Table>
        <TableHeader><TableRow><TableHead className="whitespace-nowrap">{uiT("Model")}</TableHead><TableHead>{uiT("Upstream route")}</TableHead><TableHead className="hidden whitespace-nowrap lg:table-cell">{uiT("Route status")}</TableHead>{commercialEnabled && <TableHead className="hidden whitespace-nowrap lg:table-cell">{uiT("Commercial offer")}</TableHead>}<TableHead className="whitespace-nowrap text-right">{uiT("Actions")}</TableHead></TableRow></TableHeader>
        <TableBody>{aliases.slice(0, limit).map(alias => {
          const routes = entries.filter(entry => entry.model.alias === alias);
          const offer = offers.find(item => item.model_alias === alias);
          const commercial = routes.some(entry => !entry.connection.owner_funded);
          const media = offer?.rate_kind === 'media' || routes.some(entry => !!entry.model.capabilities.video_schema);
          const supplyStatus = !offer ? offersComplete ? uiT("No purchase offer") : uiT("Offer status not loaded") : !offer.active ? uiT("Offer paused") : !offer.route_ready ? uiT("No eligible connection") : uiT("Ready for commercial supply");
          return <TableRow key={alias}>
            <TableCell className="align-middle whitespace-nowrap font-medium"><span className="inline-flex items-center gap-2"><ProviderLogo provider={modelIdentity({ id: alias, upstream_model: routes[0]?.model.upstream_model, catalog: routes[0]?.model.capabilities?.catalog })} size="small" /><span>{alias}</span></span></TableCell>
            <TableCell className="align-middle whitespace-normal lg:whitespace-nowrap">
              <div className="space-y-1">
                {routes.map(({connection, model}) => {
                  const capabilities = modelCapabilityLabels(model.capabilities);
                  const fullStatus = `${connection.access_scope === 'internal' ? uiT("Internal shared · billed by Provider") : connection.owner_funded ? uiT("Personal use · billed by Provider") : uiT("Commercial connection")} · ${!connection.has_credential ? uiT("API key missing") : !connection.enabled ? uiT("API key disabled") : !model.enabled ? uiT("Model disabled") : model.available === true ? uiT("Route configured · Provider access not verified") : model.available === false ? uiT("Route unavailable") : uiT("Route status unknown")}`;
                  return <div key={connection.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-1 lg:flex-nowrap">
                    <span className="font-mono text-[13px] font-medium text-foreground">{model.upstream_model}</span>
                    {connections.length > 1 && <span className="text-xs text-muted-foreground">{uiT("via")}{" "}{connection.name || uiT("Unnamed API key")}</span>}
                    {capabilities.length > 0 && <span role="group" className="inline-flex flex-wrap items-center gap-1 lg:flex-nowrap" aria-label={uiT("Optional capabilities")}>{capabilities.map(label => <Badge key={label} variant="secondary" className="px-1.5 py-0 text-[11px] font-normal">{label}</Badge>)}</span>}
                    <span className="sr-only">{fullStatus}</span>
                  </div>;
                })}
                {!routes.length && <span className="text-sm text-muted-foreground">{uiT("No model connection configured.")}</span>}
              </div>
            </TableCell>
            <TableCell className="hidden align-middle whitespace-nowrap lg:table-cell">
              <div className="space-y-1">
                {routes.map(({connection, model}) => {
                  const check = checks[`${connection.id}:${model.alias}`];
                  const currentCheck = check?.identity === checkIdentity(connection, model) ? check : undefined;
                  const shortStatus = !connection.has_credential ? uiT("API key missing") : !connection.enabled ? uiT("API key disabled") : !model.enabled ? uiT("Model disabled") : model.available === true ? uiT("Route configured") : model.available === false ? uiT("Route unavailable") : uiT("Route status unknown");
                  return <div key={connection.id} className="space-y-1">
                    <Badge variant={model.enabled && connection.enabled && connection.has_credential && model.available !== false ? "secondary" : "outline"} className="font-normal">{shortStatus}</Badge>
                    {currentCheck?.error
                      ? <span className="vendor-check-result is-error block text-xs whitespace-normal" role="alert">{uiT(currentCheck.error)}</span>
                      : currentCheck?.result
                        ? <span className="vendor-check-result block text-xs whitespace-normal" aria-live="polite">{modelCheckLabel(currentCheck.result, model.capabilities)}</span>
                        : null}
                  </div>;
                })}
                {!routes.length && <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </TableCell>
            {commercialEnabled && <TableCell className="hidden align-middle whitespace-nowrap lg:table-cell">
              {(commercial || offer) ? <div className="inline-flex items-center gap-1">
                <Badge variant={offer?.active && offer?.route_ready ? "secondary" : "outline"} className="font-normal">{supplyStatus}</Badge>
                <Button size="xs" variant="ghost" className="px-1.5" onClick={() => onOffer(alias, media)}>{uiT("Manage offer")}</Button>
              </div> : <span className="text-xs text-muted-foreground">—</span>}
            </TableCell>}
            <TableCell className="align-middle whitespace-nowrap text-right">
              <div className="inline-flex items-center justify-end gap-1">
                {routes.map(({connection, model}) => {
                  const check = checks[`${connection.id}:${model.alias}`];
                  const currentCheck = check?.identity === checkIdentity(connection, model) ? check : undefined;
                  return <span key={connection.id} className="inline-flex items-center gap-1">
                    <Button size="xs" variant="ghost" className="px-1.5" disabled={!canManage || currentCheck?.pending} onClick={() => void checkModel(connection, model)}>{currentCheck?.pending ? uiT("Checking…") : uiT("Check")}</Button>
                    <Button size="xs" variant="outline" disabled={!canManage} onClick={() => openEditor({connectionId: connection.id, model})}>{uiT("Edit model")}</Button>
                  </span>;
                })}
                {!routes.length && <Button size="xs" variant="outline" disabled={!canManage || !connections.length} onClick={() => openEditor({connectionId: connections[0].id, model: null, initialAlias: alias})}>{uiT("Add model connection")}</Button>}
              </div>
            </TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>}
      {aliases.length > limit && <Button variant="outline" onClick={() => setLimit(value => value + 20)}>{uiF("Show more models ({0} remaining)", [aliases.length - limit])}</Button>}
    </>}
    <Dialog open={!!editor} onOpenChange={open => { if (!open && !busy) setEditor(null); }}>
      <DialogContent onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{editor?.model ? uiF("Edit {0}", [editor.model.alias]) : uiT("Add model")}</DialogTitle><DialogDescription>{uiT("Choose a saved API key and configure the model it connects to.")}</DialogDescription></DialogHeader>
        {editor && selectedConnection && <>
          <div className="space-y-2"><Label>{uiT("Provider API key")}</Label>{editor.model ? <p>{selectedConnection.name}</p> : <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={busy}>{selectedConnection.name || uiT("Unnamed API key")}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuRadioGroup value={selectedConnection.id} onValueChange={connectionId => setEditor({...editor, connectionId, model: null})}>{connections.map(connection => <DropdownMenuRadioItem key={connection.id} value={connection.id}>{connection.name || uiT("Unnamed API key")}{!connection.enabled ? uiT("· Disabled") : ''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}</div>
          {discovery && !catalogLoading && !catalogError && <div className="space-y-1 text-sm text-muted-foreground" role="status">
            <p>{integrationLabels[discovery.integration.effective_type]} · {discovery.inventory_scope === 'credential_filtered' ? uiT("Credential-filtered inventory") : uiT("Instance-reported inventory")}</p>
            <p>{commercialEnabled ? uiT("Catalog read succeeded. Inference and management access have not been verified. Review the selected model and its route settings before saving. Advertised prices do not set purchase rates or customer prices.") : uiT("Catalog read succeeded. Inference and management access have not been verified. Review the selected model and its route settings before saving.")}</p>
          </div>}
          <ModelMappingForm key={`${selectedConnection.id}:${editor.model?.alias ?? 'new'}`} initialAlias={editor.initialAlias} ownerFunded={selectedConnection.owner_funded} accessScope={selectedConnection.access_scope} model={editor.model} catalog={catalog} catalogLoading={catalogLoading} catalogError={catalogError} onRetryCatalog={() => void loadCatalog()} disabled={busy} onCancel={() => setEditor(null)} onSave={input => save(input)} />
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}
