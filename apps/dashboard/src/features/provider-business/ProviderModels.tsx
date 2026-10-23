import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { IconChevronDown, IconPlus, IconSearch } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import ModelMappingForm from '@/features/providers/components/ModelMappingForm';
import ProviderEditor from '@/features/providers/components/ProviderEditor';
import { request, writeMayHaveCommitted, type ProviderConnection, type ProviderModel, type ModelWrite, type ProviderConnectionWrite, type ProviderCatalogModel } from '@/features/providers/api';
import type { ProviderOffer } from '@niu-io/sdk/admin';

type Entry = { connection: ProviderConnection; model: ProviderModel };
type Props = {
  token: string; providerId: string; providerSlug: string; canManage: boolean;
  offers: ProviderOffer[]; offersComplete: boolean; qualified: boolean;
  onOffer: (alias: string, media: boolean) => void;
  onQualification: () => void;
  onReviewOffer: (id: string) => void;
  onSaved: () => void;
};

/** Provider-specific model task: connection configuration and purchase readiness stay distinct. */
export default function ProviderModels(props: Props) {
  // Remount on authorization/provider changes so neither reads nor dialogs cross scopes.
  return <ScopedModels key={`${props.token}:${props.providerId}:${props.canManage}`} {...props} />;
}
function ScopedModels({ token, providerId, providerSlug, canManage, offers, offersComplete, qualified, onOffer, onQualification, onReviewOffer, onSaved }: Props) {
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const opener = useRef<HTMLElement | null>(null);
  const [editor, setEditor] = useState<{ connectionId: string; model: ProviderModel | null; credential?: boolean; initialAlias?: string } | null>(null);
  const [catalog, setCatalog] = useState<ProviderCatalogModel[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const catalogRequest = useRef<AbortController | null>(null);
  useEffect(() => { catalogRequest.current?.abort(); setCatalog([]); setCatalogError(''); setCatalogLoading(false); return () => catalogRequest.current?.abort(); }, [editor?.connectionId]);
  const [busy, setBusy] = useState(false);
  const write = useRef<AbortController | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; write.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setEntries([]); setConnections([]);
    void (async () => {
      const result = await request<{data: ProviderConnection[]}>(token, `/api/v1/vendors?supplier=${encodeURIComponent(providerId)}`, 'GET', undefined, controller.signal);
      const scoped = result.data.filter(item => (item.provider ?? item.supplier)?.id === providerId);
      const models = await Promise.all(scoped.map(async connection => {
        const response = await request<{data: ProviderModel[]}>(token, `/api/v1/vendors/${encodeURIComponent(connection.id)}/models`, 'GET', undefined, controller.signal);
        return response.data.map(model => ({ connection, model }));
      }));
      if (!controller.signal.aborted) { setConnections(scoped); setEntries(models.flat()); }
    })().catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Models could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, providerId, revision]);
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
      const result = await request<{data: ProviderCatalogModel[]}>(token, `/api/v1/vendors/${encodeURIComponent(editor.connectionId)}/catalog`, 'GET', undefined, controller.signal);
      if (!controller.signal.aborted) setCatalog(result.data);
    } catch { if (!controller.signal.aborted) setCatalogError('Catalog unavailable.'); }
    finally { if (!controller.signal.aborted) setCatalogLoading(false); }
  }
  async function save(input: ModelWrite | ProviderConnectionWrite, credential: boolean) {
    if (!canManage || !editor || !selectedConnection || write.current) return;
    const controller = new AbortController(); write.current = controller; setBusy(true); setNotice('');
    try {
      await request(token, `/api/v1/vendors/${encodeURIComponent(selectedConnection.id)}${credential ? '' : '/models'}`, credential ? 'PUT' : 'POST', input, controller.signal);
      if (!active.current || controller.signal.aborted) return;
      setEditor(null); setNotice(credential ? 'API key updated. Model availability is being refreshed.' : 'Model saved. Availability is being refreshed.');
      setRevision(value => value + 1); onSaved();
    } catch (reason) {
      if (!active.current || controller.signal.aborted) return;
      if (writeMayHaveCommitted(reason)) {
        setEditor(null); setNotice('The save could not be confirmed. Review the refreshed configuration before trying again.'); setRevision(value => value + 1);
      } else throw reason;
    } finally { if (active.current) { setBusy(false); write.current = null; } }
  }
  return <div className="space-y-4 px-4 py-4 sm:px-6">
    {!loading && !error && (offers.length > 0 || entries.some(entry => !entry.connection.owner_funded)) && !qualified && <div className="flex flex-wrap items-center gap-2 text-sm"><span>Provider review required for commercial supply.</span><Button variant="outline" size="sm" onClick={onQualification}>Review Provider</Button></div>}
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1"><IconSearch size={16} aria-hidden="true" /><Input aria-label="Filter configured models" placeholder="Filter by model or API key…" value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }} /></div>
      <Button disabled={!canManage || loading || !!error || !connections.length} onClick={() => openEditor({connectionId: connections[0].id, model: null})}><IconPlus size={16} />Add model</Button>
      <Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh</Button>
    </div>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {loading ? <p role="status">Loading models…</p> : error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Retry loading models</Button></div> : <>
      {!connections.length && <p>Connect a Provider API key before adding models. <Link className="underline" to={`/admin/providers/${encodeURIComponent(providerSlug)}/keys`}>Connect API key</Link></p>}
      {!aliases.length ? <p>{query ? 'No models match this filter.' : 'No models configured yet.'}</p> : <Table className="table-fixed">
        <TableHeader className="hidden sm:table-header-group"><TableRow><TableHead className="w-[35%]">Model</TableHead><TableHead>Connection and availability</TableHead></TableRow></TableHeader>
        <TableBody>{aliases.slice(0, limit).map(alias => {
          const routes = entries.filter(entry => entry.model.alias === alias);
          const offer = offers.find(item => item.model_alias === alias);
          const commercial = routes.some(entry => !entry.connection.owner_funded);
          const media = offer?.rate_kind === 'media' || routes.some(entry => !!entry.model.capabilities.video_schema);
          const supplyStatus = !offer ? offersComplete ? 'No purchase offer' : 'Offer status not loaded' : !qualified ? 'Provider review required' : !offer.qualified ? 'Offer review required' : !offer.active ? 'Offer paused' : !offer.route_ready ? 'No eligible connection' : 'Ready for commercial supply';
          return <TableRow key={alias} className="flex flex-col sm:table-row">
            <TableCell className="block align-top whitespace-normal break-words font-medium sm:table-cell">{alias}</TableCell>
            <TableCell className="block space-y-3 whitespace-normal sm:table-cell">
              {routes.map(({connection, model}) => <div key={connection.id} className="space-y-1">
                <div className="break-words">{model.upstream_model} <span className="text-muted-foreground">via {connection.name || 'Unnamed API key'}</span></div>
                <p className="text-sm text-muted-foreground">{connection.owner_funded ? 'Personal use · billed by Provider' : 'Commercial connection'} · {!connection.has_credential ? 'API key missing' : !connection.enabled ? 'API key disabled' : !model.enabled ? 'Model disabled' : model.available === true ? 'Connection available' : model.available === false ? 'Connection unavailable' : 'Connection status unknown'}</p>
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!canManage} onClick={() => openEditor({connectionId: connection.id, model})}>Edit model</Button><Button size="sm" variant="ghost" disabled={!canManage} onClick={() => openEditor({connectionId: connection.id, model, credential: true})}>Edit API key</Button></div>
              </div>)}
              {!routes.length && <div><p>No model connection configured.</p><Button size="sm" variant="outline" disabled={!canManage || !connections.length} onClick={() => openEditor({connectionId: connections[0].id, model: null, initialAlias: alias})}>Add model connection</Button></div>}
              {(commercial || offer) && <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><p className="text-sm">{supplyStatus}</p><div><Button size="sm" variant="outline" onClick={() => onOffer(alias, media)}>Manage offer</Button>{offer && !offer.qualified && <Button size="sm" variant="ghost" disabled={!qualified || !canManage} onClick={() => onReviewOffer(offer.id)}>Review offer</Button>}</div></div>}
            </TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>}
      {aliases.length > limit && <Button variant="outline" onClick={() => setLimit(value => value + 20)}>Show more models ({aliases.length - limit} remaining)</Button>}
    </>}
    <Dialog open={!!editor} onOpenChange={open => { if (!open && !busy) setEditor(null); }}>
      <DialogContent onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{editor?.credential ? 'Edit Provider API key' : editor?.model ? `Edit ${editor.model.alias}` : 'Add model'}</DialogTitle><DialogDescription>{editor?.credential ? 'Changes to this API key apply to every model using it.' : 'Choose a saved API key and configure the model it connects to.'}</DialogDescription></DialogHeader>
        {editor && selectedConnection && (editor.credential ? <ProviderEditor token={token} connection={selectedConnection} disabled={busy} onCreate={async () => {}} onSave={input => save(input, true)} /> : <>
          <div className="space-y-2"><Label>Provider API key</Label>{editor.model ? <p>{selectedConnection.name}</p> : <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={busy}>{selectedConnection.name || 'Unnamed API key'}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuRadioGroup value={selectedConnection.id} onValueChange={connectionId => setEditor({...editor, connectionId, model: null})}>{connections.map(connection => <DropdownMenuRadioItem key={connection.id} value={connection.id}>{connection.name || 'Unnamed API key'}{!connection.enabled ? ' · Disabled' : ''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}</div>
          <ModelMappingForm key={`${selectedConnection.id}:${editor.model?.alias ?? 'new'}`} initialAlias={editor.initialAlias} ownerFunded={selectedConnection.owner_funded} model={editor.model} catalog={catalog} catalogLoading={catalogLoading} catalogError={catalogError} onRetryCatalog={() => void loadCatalog()} disabled={busy} onCancel={() => setEditor(null)} onSave={input => save(input, false)} />
        </>)}
      </DialogContent>
    </Dialog>
  </div>;
}
