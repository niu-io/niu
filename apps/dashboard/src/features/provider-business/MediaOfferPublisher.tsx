import { useEffect, useState, type FormEvent } from 'react';
import { IconChevronDown as ChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { request } from '@/features/vendors/api';
import type { SupplierMediaOfferInput, SupplierMediaOfferModel } from '../../../../../sdks/javascript/src/admin';

type Page = { data: SupplierMediaOfferModel[]; has_more: boolean; next_after: string | null };

/** Publish a pinned model/credential binding; purchase terms and review are separate. */
export default function MediaOfferPublisher({ token, supplier, initialModel = '', onClose, onSaved }: {
  token: string; supplier: string; initialModel?: string; onClose: () => void; onSaved: () => void;
}) {
  const [models, setModels] = useState<SupplierMediaOfferModel[]>([]);
  const [selected, setSelected] = useState(initialModel);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [frozen, setFrozen] = useState<SupplierMediaOfferInput | null>(null);
  const endpoint = `/admin/v1/providers/${encodeURIComponent(supplier)}`;
  const chosen = models.find(model => model.model_alias === selected);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void request<Page>(token, `${endpoint}/media-offer-models?limit=50`, 'GET', undefined, controller.signal)
      .then(page => { if (!controller.signal.aborted) { setModels(page.data); setNext(page.has_more ? page.next_after : null); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Models could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, endpoint, reload]);

  async function more() {
    if (!next || loading || frozen) return;
    setLoading(true); setError('');
    try {
      const page = await request<Page>(token, `${endpoint}/media-offer-models?limit=50&after=${encodeURIComponent(next)}`);
      setModels(current => [...current, ...page.data]); setNext(page.has_more ? page.next_after : null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'More models could not be loaded.'); }
    finally { setLoading(false); }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (busy || (!frozen && !chosen)) return;
    setError('');
    let body = frozen;
    if (!body && chosen) {
      const vendorRevision = chosen.vendor_revision;
      const modelRevision = chosen.model_revision;
      if (![vendorRevision, modelRevision].every(value => /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n)) {
        setError('This configuration cannot be represented safely. Refresh the model configuration.'); return;
      }
      body = { revision: crypto.randomUUID(), model_alias: chosen.model_alias, vendor_id: chosen.vendor_id,
        vendor_revision: vendorRevision, model_revision: modelRevision, schema_revision: chosen.schema_revision,
        expected_revision: chosen.offer_revision };
      setFrozen(body);
    }
    setBusy(true);
    try { await request(token, `${endpoint}/media-offers`, 'POST', body); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Offer publication could not be confirmed.'); }
    finally { setBusy(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="niu-modal vendor-dialog">
      <DialogHeader className="min-w-0 text-left"><DialogTitle>Set up media offer</DialogTitle><DialogDescription>Select a configured video model. Save its offer, review it, then publish its purchase rates.</DialogDescription></DialogHeader>
      <form onSubmit={event => void publish(event)} className="min-w-0 space-y-5">
        <div className="space-y-2"><Label htmlFor="media-offer-model">Model</Label>
          <DropdownMenu><DropdownMenuTrigger asChild><Button id="media-offer-model" type="button" variant="outline" className="w-full min-w-0 justify-between text-left" disabled={loading || busy || Boolean(frozen)}><span className="min-w-0 truncate">{chosen ? `${chosen.model_alias} · ${chosen.api_key_name}` : loading ? 'Loading models…' : 'Choose a model'}</span><ChevronDown className="ml-2 size-4 shrink-0" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={selected} onValueChange={setSelected}>{models.map(model => <DropdownMenuRadioItem key={model.model_alias} value={model.model_alias}>{model.model_alias} · {model.api_key_name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent>
          </DropdownMenu>
          {!loading && !models.length && !error && !next && <div className="space-y-2"><p className="text-sm text-muted-foreground">No configured video models. Add a video schema to a model on this Supplier’s API key first.</p><Button asChild variant="outline" size="sm"><a href={`/admin/suppliers/${encodeURIComponent(supplier)}/configuration`}>Configure model routes</a></Button></div>}
          {next && <Button type="button" variant="ghost" size="sm" disabled={loading || Boolean(frozen)} onClick={() => void more()}>Load more models</Button>}
        </div>
        {chosen && <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm"><dt className="text-muted-foreground">API key</dt><dd className="break-words">{chosen.api_key_name}</dd><dt className="text-muted-foreground">Channel</dt><dd className="break-words">{chosen.channel}</dd></dl>}
        <p className="text-sm text-muted-foreground">Saving pauses the offer and requires a new review. Existing jobs keep their original route and prices.</p>
        {error && <div role="alert" className="space-y-2 text-sm"><p>{error}</p>{!frozen && <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => setReload(value => value + 1)}>Reload models</Button>}</div>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || loading || (!chosen && !frozen)}>{busy ? 'Saving…' : frozen ? 'Retry save' : 'Save offer'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
