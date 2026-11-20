import { translateUI } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { currencySymbol } from '@/lib/money';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cachedGet, peekCachedGet, request } from '@/features/providers/api';
import { discountPercent, mediaMeterName } from '@/lib/media-rate';
import type { ProviderMediaOfferModel, ProviderMediaRateRecord, CustomerMediaRateRecord } from '@niu-io/sdk/admin';
import MediaRatePublisher from './MediaRatePublisher';

type RateRecord = ProviderMediaRateRecord | CustomerMediaRateRecord;
type RatePage = { data: RateRecord[]; has_more: boolean; next_after: string | null };

export function exactAmount(units: string, places: number) {
  const amount = BigInt(units);
  const scale = 10n ** BigInt(places);
  const fraction = (amount % scale).toString().padStart(places, '0').replace(/0+$/, '');
  return `${amount / scale}${fraction ? `.${fraction}` : ''}`;
}

export function quantity(value: { numerator: string; denominator: string }) {
  const numerator = BigInt(value.numerator).toLocaleString(readUILocale());
  return value.denominator === '1' ? numerator : `${numerator}/${BigInt(value.denominator).toLocaleString(readUILocale())}`;
}

export function mediaMeterLabel(meter: string, amount: {numerator:string;denominator:string}) {
  return mediaMeterName(meter, amount);
}

function date(seconds: string | null) {
  if (seconds === null) return translateUI('No end date');
  const value = new Date(Number(seconds) * 1000);
  return Number.isNaN(value.getTime()) ? translateUI('Date unavailable') : value.toLocaleString(readUILocale());
}

function cutoff(record: ProviderMediaRateRecord) {
  const end = record.card.tariff.effective_until;
  const retired = record.retirement_effective_until;
  return end === null ? retired : retired === null ? end : BigInt(end) < BigInt(retired) ? end : retired;
}

function period(record: ProviderMediaRateRecord, now: bigint) {
  const end = cutoff(record);
  if (end !== null && BigInt(end) <= now) return 'Ended';
  if (BigInt(record.card.tariff.effective_from) > now) return 'Scheduled';
  return 'In effect';
}

function localDateNow(starts = '0') {
  const seconds = Math.max(Math.floor(Date.now() / 1000), Number(starts));
  const value = new Date(seconds * 1000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 19);
}

/** Niu media schedules; purchase and selling endpoints remain strictly separate. */
export default function MediaRateHistory({ token, supplier, organization, canConfigure = true, providerView = false, allowPublish = true, showConfiguredModels = false, refreshSignal = 0 }: { token: string; canConfigure?: boolean; providerView?: boolean; allowPublish?: boolean; showConfiguredModels?: boolean; refreshSignal?: number } & ({ supplier: string; organization?: never } | { organization: string; supplier?: never })) {
  const { t: uiT } = useUILocale();
  const customer = organization !== undefined;
  const endpoint = customer ? `/api/v1/organizations/${encodeURIComponent(organization)}/billing/media-rates` : `/api/v1/providers/${encodeURIComponent(supplier!)}/media-rates`;
  const firstPagePath = `${endpoint}?limit=50`;
  const initialPage = token ? peekCachedGet<RatePage>(token, firstPagePath) : undefined;
  const [records, setRecords] = useState<RateRecord[]>(() => initialPage?.data ?? []);
  const [next, setNext] = useState<string | null>(() => initialPage?.has_more ? initialPage.next_after : null);
  const [loading, setLoading] = useState(() => Boolean(token && !initialPage));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const lastRevision = useRef(0);
  const detailOpener=useRef<HTMLElement|null>(null);
  const [selected, setSelected] = useState<RateRecord | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [end, setEnd] = useState(localDateNow);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [notice, setNotice] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [editing, setEditing] = useState<RateRecord | undefined>();
  const [initialModel, setInitialModel] = useState('');
  const [configuredModels, setConfiguredModels] = useState<ProviderMediaOfferModel[]>([]);
  const [modelsCursor, setModelsCursor] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [modelsRevision, setModelsRevision] = useState(0);
  const [modelBusy, setModelBusy] = useState<string | null>(null);
  const [modelActionError, setModelActionError] = useState('');
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));

  useEffect(() => {
    const timer = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const force = lastRevision.current !== revision;
    lastRevision.current = revision;
    const cached = token ? peekCachedGet<RatePage>(token, firstPagePath) : undefined;
    if (cached && !force) {
      setRecords(cached.data);
      setNext(cached.has_more ? cached.next_after : null);
      setLoading(false);
    } else if (!cached) {
      setRecords([]);
      setNext(null);
      setLoading(true);
    }
    setError('');
    void cachedGet<RatePage>(token, firstPagePath, { signal: controller.signal, force })
      .then(page => {
        if (controller.signal.aborted) return;
        setRecords(page.data);
        setNext(page.has_more ? page.next_after : null);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error && !(reason instanceof TypeError) ? reason.message : 'Media rates could not be loaded. Check your connection and retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, firstPagePath, revision, refreshSignal]);

  async function more() {
    if (!next || loading) return;
    setLoading(true);
    setError('');
    try {
      const page = await request<RatePage>(token, `${endpoint}?limit=50&after=${encodeURIComponent(next)}`);
      setRecords(current => [...current, ...page.data]);
      setNext(page.has_more ? page.next_after : null);
    } catch (reason) {
      setError(reason instanceof Error && !(reason instanceof TypeError) ? reason.message : 'More media rates could not be loaded. Check your connection and retry.');
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!showConfiguredModels || customer || !canConfigure || !supplier) return;
    const controller = new AbortController();
    setModelsLoading(true);
    setModelsError('');
    void request<{data: ProviderMediaOfferModel[];has_more:boolean;next_after:string|null}>(token, `/api/v1/providers/${encodeURIComponent(supplier)}/media-offer-models?limit=100`, 'GET', undefined, controller.signal)
      .then(page => {
        if (controller.signal.aborted) return;
        setConfiguredModels(page.data);
        setModelsCursor(page.has_more ? page.next_after : null);
      })
      .catch(reason => { if (!controller.signal.aborted) setModelsError(reason instanceof Error ? reason.message : 'Configured video models could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setModelsLoading(false); });
    return () => controller.abort();
  }, [token, supplier, customer, showConfiguredModels, canConfigure, modelsRevision, refreshSignal]);

  async function moreModels() {
    if (!modelsCursor || modelsLoading || !supplier) return;
    setModelsLoading(true);
    setModelsError('');
    try {
      const page = await request<{data: ProviderMediaOfferModel[];has_more:boolean;next_after:string|null}>(token, `/api/v1/providers/${encodeURIComponent(supplier)}/media-offer-models?limit=100&after=${encodeURIComponent(modelsCursor)}`);
      setConfiguredModels(current => [...current, ...page.data]);
      setModelsCursor(page.has_more ? page.next_after : null);
    } catch (reason) {
      setModelsError(reason instanceof Error ? reason.message : 'More configured video models could not be loaded.');
    } finally { setModelsLoading(false); }
  }

  function configureRate(modelAlias: string) {
    detailOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(undefined);
    setInitialModel(modelAlias);
    setPublishing(true);
  }

  async function setOfferActive(model: ProviderMediaOfferModel, active: boolean) {
    if (!model.offer_id || !model.offer_revision) {
      setModelsError('This offer has no current revision. Refresh the configured models and retry.');
      return;
    }
    setModelBusy(model.model_alias);
    setModelActionError('');
    try {
      if (active) await request(token, `/api/v1/providers/${encodeURIComponent(supplier!)}/offers/${encodeURIComponent(model.offer_id)}/authorization`, 'PUT', { rate_revision: model.offer_revision });
      else await request(token, `/api/v1/providers/${encodeURIComponent(supplier!)}/offers/${encodeURIComponent(model.offer_id)}`, 'PATCH', { active: false });
      setNotice(active ? uiT('Offer enabled. Provider access and customer selling prices remain separate.') : uiT('Offer paused. Existing jobs keep their original route and prices.'));
      setModelsRevision(value => value + 1);
      setRevision(value => value + 1);
    } catch (reason) {
      setModelActionError(reason instanceof Error ? reason.message : active ? 'Offer could not be enabled.' : 'Offer could not be paused.');
    } finally { setModelBusy(null); }
  }

  function offerStatus(model: ProviderMediaOfferModel): string {
    if (!model.route_ready) return uiT('Connection unavailable');
    if (model.offer_active && model.offer_qualified) return uiT('Active');
    if (model.offer_active) return uiT('Authorization unavailable');
    if (model.offer_id) return model.offer_current ? uiT('Offer paused') : uiT('Needs configuration');
    return uiT('No offer yet');
  }

  function edit(record: RateRecord) {
    setEditing(record);
    setInitialModel('');
    setSelected(null);
    setPublishing(true);
  }

  async function retire(event: FormEvent) {
    event.preventDefault();
    if (!selected || busy) return;
    setDialogError('');
    const seconds = Math.floor(Date.parse(end) / 1000);
    if (!Number.isSafeInteger(seconds) || BigInt(seconds) < BigInt(selected.card.tariff.effective_from) ||
      (selected.card.tariff.effective_until !== null && BigInt(seconds) > BigInt(selected.card.tariff.effective_until))) {
      setDialogError('Choose an end date within this rate’s effective period.');
      return;
    }
    setBusy(true);
    try {
      await request(token, `${endpoint}/${encodeURIComponent(selected.card.revision)}/retire`, 'POST', { effective_until: seconds });
      setSelected(null);
      setNotice(uiT('Rate end date saved. Existing jobs keep their original price.'));
      setRevision(value => value + 1);
    } catch (reason) {
      setDialogError(reason instanceof Error ? reason.message : 'Rate end date could not be saved.');
    } finally { setBusy(false); }
  }

  const editable = (record: RateRecord) => canConfigure && period(record, now) !== 'Ended';

  return <>
    <div className={`flex min-w-0 flex-wrap items-start justify-between gap-3 pb-4 ${providerView ? 'px-4 sm:px-6' : ''}`}><p className="max-w-xl text-sm text-muted-foreground">{customer ? uiT("Customer prices by model and specification.") : providerView ? uiT("Your agreed payouts by model and specification. Existing requests retain their original rate.") : uiT("Provider purchase rates by model and specification. These are separate from customer selling prices.")}</p>{canConfigure && allowPublish && <Button variant="outline" onClick={event => { detailOpener.current = event.currentTarget; setEditing(undefined); setInitialModel(''); setPublishing(true); }}>{customer ? uiT("Publish selling rate") : uiT("Publish media rate")}</Button>}</div>
    {showConfiguredModels && !customer && canConfigure && <section className="mb-6" aria-labelledby="configured-video-models-heading">
      <div className="pb-3"><h3 id="configured-video-models-heading" className="text-sm font-medium">{uiT("Configured video models")}</h3><p className="max-w-2xl text-sm text-muted-foreground">{uiT("Every model with a saved video schema on this Provider. Saving a purchase rate creates or refreshes its offer for the current configuration; it does not change customer selling prices.")}</p></div>
      {modelsError && <div role="alert" className="pb-3 text-sm">{modelsError} <Button variant="ghost" size="sm" onClick={() => setModelsRevision(value => value + 1)}>{uiT("Refresh")}</Button></div>}
      {modelActionError && <div role="alert" className="pb-3 text-sm">{uiT(modelActionError)}</div>}
      {modelsLoading && !configuredModels.length ? <TableSkeleton columns={4} rows={3} label={uiT("Loading configured video models…")} /> : !modelsError && !configuredModels.length ? <div className="provider-empty-state"><strong>{uiT("No configured video models")}</strong><span>{uiT("Add a video schema to a model on this Provider’s API key first.")}</span></div> : configuredModels.length > 0 && <>
        <div className="table-wrap"><Table className="provider-ledger">
          <TableHeader><TableRow><TableHead>{uiT("Model")}</TableHead><TableHead>{uiT("API key")}</TableHead><TableHead>{uiT("Offer status")}</TableHead><TableHead className="supplier-offer-actions"><span className="sr-only">{uiT("Actions")}</span></TableHead></TableRow></TableHeader>
          <TableBody>{configuredModels.map(item => <TableRow key={item.model_alias}>
            <TableCell><strong>{item.model_alias}</strong></TableCell>
            <TableCell>{item.api_key_name}</TableCell>
            <TableCell><Badge variant="secondary">{offerStatus(item)}</Badge></TableCell>
            <TableCell className="supplier-offer-actions"><div className="flex flex-wrap justify-end gap-1">
              <Button variant="ghost" size="sm" disabled={modelBusy !== null || !item.route_ready} onClick={() => configureRate(item.model_alias)}>{uiT("Set rate")}{" "}<span className="sr-only">{uiT("for")}{" "}{item.model_alias}</span></Button>
              {item.offer_id && item.offer_active && <Button variant="ghost" size="sm" disabled={modelBusy !== null} onClick={() => void setOfferActive(item, false)}>{uiT("Pause offer")}{" "}<span className="sr-only">{uiT("for")}{" "}{item.model_alias}</span></Button>}
              {item.offer_id && !item.offer_active && item.offer_current && item.route_ready && <Button variant="ghost" size="sm" disabled={modelBusy !== null} onClick={() => void setOfferActive(item, true)}>{uiT("Enable offer")}{" "}<span className="sr-only">{uiT("for")}{" "}{item.model_alias}</span></Button>}
            </div></TableCell>
          </TableRow>)}</TableBody>
        </Table></div>
        {modelsCursor && <div className="py-3"><Button variant="outline" disabled={modelsLoading} onClick={() => void moreModels()}>{modelsLoading ? uiT("Loading…") : uiT("Load more models")}</Button></div>}
      </>}
    </section>}
    {notice && <p role="status" className="px-6 pb-4 text-sm">{notice}</p>}
    {error && <div role="alert" className="px-6 pb-4 text-sm">{error} <Button variant="ghost" size="sm" disabled={loading} onClick={() => records.length && next ? void more() : setRevision(value => value + 1)}>{uiT("Retry")}</Button></div>}
    {loading && !records.length ? <div className="px-6 pb-4"><TableSkeleton columns={customer ? 4 : 5} rows={4} label={uiT("Loading media rates…")} /></div> : !error && !records.length ?
      <div className="provider-empty-state"><strong>{customer ? uiT("No media selling rates") : providerView ? uiT("No agreed media rates") : uiT("No media purchase rates")}</strong><span>{customer ? allowPublish ? uiT("Publish a customer price for an authorized video model.") : uiT("No existing customer-specific media rates. Use Publish media price in Pricing for platform prices.") : providerView ? uiT("Contact the platform administrator to agree and publish a media payout rate.") : uiT("Publish an agreed rate for an authorized media model before customer-funded generation.")}</span></div> : records.length > 0 && <>
      <div className="table-wrap"><Table className="provider-ledger">
        <TableHeader><TableRow><TableHead>{uiT("Model / specification")}</TableHead><TableHead>{customer ? uiT("Selling rate") : providerView ? uiT("Your payout rate") : uiT("Purchase rate")}</TableHead><TableHead>{uiT("Effective period")}</TableHead>{!customer && <TableHead>{uiT("Period status")}</TableHead>}<TableHead className="supplier-offer-actions"><span className="sr-only">{uiT("Details")}</span></TableHead></TableRow></TableHeader>
        <TableBody>{records.map(record => {
          const tariff = record.card.tariff;
          const dimensions = tariff.dimensions;
          return <TableRow key={record.card.revision}>
            <TableCell><strong>{dimensions.model}</strong><div className="text-sm text-muted-foreground">{dimensions.resolution} · {dimensions.reference_video ? uiT("Video reference") : uiT("No video reference")}</div></TableCell>
            <TableCell>{currencySymbol(tariff.currency)}{exactAmount(tariff.amount_units, tariff.decimal_places)}<div className="text-sm text-muted-foreground">{uiT("per")}{" "}{quantity(tariff.per_quantity)} {uiT(mediaMeterLabel(tariff.meter,tariff.per_quantity))}</div></TableCell>
            <TableCell>{date(tariff.effective_from)}<div className="text-sm text-muted-foreground">{date(cutoff(record))}</div>{customer && <Badge variant="secondary">{uiT(period(record, now))}</Badge>}</TableCell>
            {!customer && <TableCell><Badge variant="secondary">{uiT(period(record, now))}</Badge></TableCell>}
            <TableCell className="supplier-offer-actions">
              <div className="flex flex-wrap justify-end gap-1">
                {editable(record) && <Button variant="ghost" size="sm" onClick={event => { detailOpener.current=event.currentTarget; edit(record); }}>{uiT("Edit rate")}<span className="sr-only">{" "}{uiT("for")}{" "}{dimensions.model}</span></Button>}
                <Button variant="ghost" size="sm" onClick={event => { detailOpener.current=event.currentTarget; setSelected(record); setRetiring(false); setDialogError(''); }}>{uiT("Details")}<span className="sr-only">{" "}{uiT("for")}{" "}{dimensions.model}</span></Button>
              </div>
            </TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></div>
      {next && <div className="px-6 py-4"><Button variant="outline" disabled={loading} onClick={() => void more()}>{loading ? uiT("Loading…") : uiT("Load more rates")}</Button></div>}
    </>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !busy) setSelected(null); }}>
      <DialogContent className="niu-modal vendor-dialog" onCloseAutoFocus={event=>{if(detailOpener.current?.isConnected){event.preventDefault();detailOpener.current.focus();}}}>
        <DialogHeader><DialogTitle>{retiring ? uiT("End media rate") : customer ? uiT("Media selling rate") : providerView ? uiT("Agreed media payout rate") : uiT("Media purchase rate")}</DialogTitle><DialogDescription>{selected?.card.tariff.dimensions.model}</DialogDescription></DialogHeader>
        {selected && <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">{uiT("Specification")}</dt><dd>{selected.card.tariff.dimensions.resolution} · {selected.card.tariff.dimensions.reference_video ? uiT("Video reference") : uiT("No video reference")}</dd>
            <dt className="text-muted-foreground">{customer ? uiT("Selling rate") : providerView ? uiT("Your payout rate") : uiT("Purchase rate")}</dt><dd>{currencySymbol(selected.card.tariff.currency)}{exactAmount(selected.card.tariff.amount_units, selected.card.tariff.decimal_places)}{" "}{uiT("per")}{" "}{quantity(selected.card.tariff.per_quantity)} {uiT(mediaMeterLabel(selected.card.tariff.meter,selected.card.tariff.per_quantity))}</dd>
            {selected.card.tariff.minimum_quantity.numerator !== '0' && <><dt className="text-muted-foreground">{uiT("Minimum quantity")}</dt><dd>{quantity(selected.card.tariff.minimum_quantity)} {uiT(mediaMeterLabel(selected.card.tariff.meter, selected.card.tariff.minimum_quantity))}</dd></>}
            <dt className="text-muted-foreground">{uiT("Starts")}</dt><dd>{date(selected.card.tariff.effective_from)}</dd>
            <dt className="text-muted-foreground">{uiT("Ends")}</dt><dd>{date(cutoff(selected))}</dd>
          </dl>
          {customer && <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><dt className="text-muted-foreground">{uiT("Maximum billable quantity")}</dt><dd>{quantity((selected.card as CustomerMediaRateRecord['card']).maximum_quantity)} {uiT(mediaMeterLabel(selected.card.tariff.meter, (selected.card as CustomerMediaRateRecord['card']).maximum_quantity))}</dd></dl>}
          {selected.card.discounts.length > 0 && <div><h3 className="mb-2 text-sm font-medium">{uiT("Discounts")}</h3><ul className="space-y-2 text-sm">{selected.card.discounts.map((discount, index) => {
            const percent = discountPercent(discount.multiplier);
            return <li key={index}>{percent !== null ? <>{percent}% {uiT("off")}</> : <>× {quantity(discount.multiplier)}</>}<div className="text-muted-foreground">{discount.dimensions ? `${discount.dimensions.model} · ${discount.dimensions.resolution} · ${discount.dimensions.reference_video ? uiT("Video reference") : uiT("No video reference")}` : uiT("All specifications")}{discount.offer && uiT("· Offer-specific")}{discount.customer && uiT("· Customer-specific")}</div><div className="text-muted-foreground">{date(discount.effective_from)} → {date(discount.effective_until)}</div></li>;
          })}</ul></div>}
          {retiring ? <form onSubmit={event => void retire(event)} className="space-y-4">
            <p className="text-sm text-muted-foreground">{uiT("The end date is permanent. Existing jobs retain this rate; no job is cancelled or refunded.")}</p>
            <div className="space-y-2"><Label htmlFor="media-rate-end">{uiT("End date")}</Label><Input id="media-rate-end" type="datetime-local" step="1" required value={end} onChange={event => setEnd(event.target.value)} disabled={busy} /></div>
            {dialogError && <p role="alert" className="text-sm">{uiT(dialogError)}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setRetiring(false)}>{uiT("Back")}</Button><Button type="submit" disabled={busy}>{busy ? uiT("Saving…") : uiT("Save end date")}</Button></div>
          </form> : <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setSelected(null)}>{uiT("Close")}</Button>{editable(selected) && <Button variant="outline" onClick={() => edit(selected)}>{uiT("Edit rate")}</Button>}{canConfigure && selected.retirement_effective_until === null && period(selected, now) !== 'Ended' && <Button onClick={() => { setEnd(localDateNow(selected.card.tariff.effective_from)); setRetiring(true); }}>{uiT("End rate")}</Button>}</div>}
        </>}
      </DialogContent>
    </Dialog>
    {publishing && <MediaRatePublisher token={token} {...(customer ? { organization } : { supplier: supplier! })} previous={editing} existing={records} initialModel={initialModel} returnFocus={detailOpener} onClose={() => { setEditing(undefined); setInitialModel(''); setPublishing(false); setRevision(value => value + 1); }} onSaved={() => { setPublishing(false); setEditing(undefined); setInitialModel(''); setNotice(uiT(editing ? (customer ? 'Selling rate updated. Existing jobs keep their original price.' : 'Media rate updated. Existing jobs keep their original price.') : customer ? 'Media selling rate published.' : 'Media purchase rate published.')); setRevision(value => value + 1); setModelsRevision(value => value + 1); }} />}
  </>;
}
