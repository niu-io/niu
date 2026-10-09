import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { IconChevronDown as ChevronDown } from '@tabler/icons-react';
import { request, VendorRequestError } from '@/features/vendors/api';
import type { SupplierMediaRateCard, SupplierMediaRateModel, SupplierMediaRateRecord, CustomerMediaRateCard, CustomerMediaRateModel, CustomerMediaRateRecord } from '../../../../../sdks/javascript/src/admin';

type RateModel = SupplierMediaRateModel & Partial<Pick<CustomerMediaRateModel, 'vendor_id'>>;
type ModelPage = { data: RateModel[]; has_more: boolean; next_after: string | null };
type DiscountDraft = { multiplier: string; priority: string; stacking: 'Exclusive' | 'Multiply' };

function localDate(seconds = Math.floor(Date.now() / 1000)) {
  const date = new Date(seconds * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 19);
}
function exactQuantity(value: string, allowZero: boolean) {
  const decimal = /^(\d{1,38})(?:\.(\d{1,18}))?$/.exec(value.trim());
  const fraction = /^(\d{1,38})\/(\d{1,38})$/.exec(value.trim());
  if (!decimal && !fraction) throw new Error('Enter quantities as decimals or numerator/denominator fractions.');
  const numerator = fraction ? BigInt(fraction[1]) : BigInt(decimal![1] + (decimal![2] ?? ''));
  const denominator = fraction ? BigInt(fraction[2]) : 10n ** BigInt(decimal![2]?.length ?? 0);
  const maximum = (1n << 128n) - 1n;
  if (denominator <= 0n || (!allowZero && numerator === 0n) || numerator > maximum || denominator > maximum) throw new Error('Quantity is outside the supported range.');
  return { numerator: numerator.toString(), denominator: denominator.toString() };
}
function safeInteger(value: string) {
  const integer = Number(value);
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(integer)) throw new Error('The selected configuration exceeds the supported exact integer range.');
  return integer;
}
function amount(units: string, places: number) {
  const digits = units.padStart(places + 1, '0');
  return places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits;
}
function quantityInput(value: { numerator: string; denominator: string }) {
  return value.denominator === '1' ? value.numerator : `${value.numerator}/${value.denominator}`;
}

export default function MediaRatePublisher({ token, supplier, organization, previous, existing = [], onClose, onSaved }: {
  token: string; previous?: SupplierMediaRateRecord | CustomerMediaRateRecord; existing?: Array<SupplierMediaRateRecord | CustomerMediaRateRecord>; onClose: () => void; onSaved: () => void;
} & ({ supplier: string; organization?: never } | { organization: string; supplier?: never })) {
  const customer = organization !== undefined;
  const previousCustomer = customer ? previous?.card as CustomerMediaRateRecord['card'] | undefined : undefined;
  const base = previous?.card.tariff;
  const [maximum, setMaximum] = useState(previousCustomer ? quantityInput(previousCustomer.maximum_quantity) : '');
  const [liabilityReview, setLiabilityReview] = useState(() => { const review = previousCustomer?.liability_qualification_revision ?? ''; return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(review) ? '' : review; });
  const [models, setModels] = useState<RateModel[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState('');
  const [readRevision, setReadRevision] = useState(0);
  const [model, setModel] = useState(base?.dimensions.model ?? '');
  const [resolution, setResolution] = useState(base?.dimensions.resolution ?? '');
  const [reference, setReference] = useState(base?.dimensions.reference_video ?? false);
  const [currency, setCurrency] = useState(base?.currency ?? 'CNY');
  const [meter, setMeter] = useState(base?.meter ?? '');
  const [places, setPlaces] = useState(base?.decimal_places ?? 9);
  const [price, setPrice] = useState(base ? amount(base.amount_units, base.decimal_places) : '');
  const [per, setPer] = useState(base ? quantityInput(base.per_quantity) : '');
  const [minimum, setMinimum] = useState(base ? quantityInput(base.minimum_quantity) : '0');
  const [rounding, setRounding] = useState<SupplierMediaRateCard['tariff']['rounding']>(base?.rounding ?? 'HalfEven');
  const [from, setFrom] = useState(() => localDate(Math.max(Math.floor(Date.now() / 1000), Number(previous?.retirement_effective_until ?? base?.effective_from ?? 0))));
  const [until, setUntil] = useState('');
  const [discounts, setDiscounts] = useState<DiscountDraft[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [frozen, setFrozen] = useState<SupplierMediaRateCard | CustomerMediaRateCard | null>(null);
  const inFlight = useRef(false);
  const modelReads = useRef<AbortController | null>(null);
  const selected = models.find(item => item.model_alias === model);
  const unavailable = !selected || !selected.resolutions.includes(resolution) || (reference && !selected.reference_video) || (base && selected.channel !== base.dimensions.channel);
  const endpoint = customer ? `/admin/v1/organizations/${encodeURIComponent(organization)}/billing` : `/admin/v1/providers/${encodeURIComponent(supplier!)}`;

  useEffect(() => {
    const controller = new AbortController();
    modelReads.current = controller;
    setLoading(true);
    setModels([]);
    setCursor(null);
    setReadError('');
    void request<ModelPage>(token, `${endpoint}/media-rate-models?limit=50`, 'GET', undefined, controller.signal)
      .then(page => { if (!controller.signal.aborted) { setModels(page.data); setCursor(page.has_more ? page.next_after : null); } })
      .catch(reason => { if (!controller.signal.aborted) setReadError(reason instanceof Error ? reason.message : 'Model choices could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); modelReads.current = null; };
  }, [token, endpoint, readRevision]);

  async function more() {
    if (!cursor || loading) return;
    const controller = modelReads.current;
    if (!controller || controller.signal.aborted) return;
    setLoading(true);
    setReadError('');
    try {
      const page = await request<ModelPage>(token, `${endpoint}/media-rate-models?limit=50&after=${encodeURIComponent(cursor)}`, 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      setModels(current => [...current, ...page.data]);
      setCursor(page.has_more ? page.next_after : null);
    } catch (reason) { if (!controller.signal.aborted) setReadError(reason instanceof Error ? reason.message : 'More models could not be loaded.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || (!frozen && unavailable)) return;
    setError('');
    try {
      let card = frozen;
      if (!card) {
        const match = /^(\d+)(?:\.(\d+))?$/.exec(price.trim());
        const fraction = (match?.[2] ?? '').replace(/0+$/, '');
        if (!match || fraction.length > places) throw new Error(`Enter a nonnegative price with at most ${places} decimal places.`);
        const units = safeInteger((BigInt(match[1]) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0') || '0')).toString());
        const start = Math.floor(Date.parse(from) / 1000);
        const end = until ? Math.floor(Date.parse(until) / 1000) : null;
        if (!Number.isSafeInteger(start) || (end !== null && (!Number.isSafeInteger(end) || end <= start))) throw new Error('Choose a valid effective period.');
        if (base && (start < Number(base.effective_from) || (base.effective_until !== null && start > Number(base.effective_until)))) throw new Error('Replacement must start within the original rate’s effective period.');
        if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Enter a three-letter currency code.');
        if (!meter.trim() || meter.trim() === 'text_tokens') throw new Error('Enter the agreed media billing unit.');
        const dimensions = { model, channel: selected!.channel, resolution, reference_video: reference };
        if (!previous && existing.some(record => {
          const rate = record.card.tariff;
          if ((!customer && record.card.offer_revision !== selected!.offer_revision) || rate.dimensions.model !== model || rate.dimensions.channel !== dimensions.channel || rate.dimensions.resolution !== resolution || rate.dimensions.reference_video !== reference) return false;
          const ends = [rate.effective_until, record.retirement_effective_until].filter((value): value is string => value !== null).map(BigInt);
          const stop = ends.length ? ends.reduce((a,b) => a < b ? a : b) : null;
          return (stop === null || stop > BigInt(start)) && (end === null || BigInt(rate.effective_from) < BigInt(end));
        })) throw new Error('This specification already has overlapping terms. Open the saved rate and use Replace rate.');
        const priorities = new Set<number>();
        const rules = discounts.map(draft => {
          const multiplier = exactQuantity(draft.multiplier, true);
          const priority = safeInteger(draft.priority);
          if (BigInt(multiplier.numerator) > BigInt(multiplier.denominator) || priority < -2147483648 || priority > 2147483647 || priorities.has(priority)) throw new Error('Discount multipliers must be between 0 and 1, with distinct integer priorities.');
          priorities.add(priority);
          return { revision: crypto.randomUUID(), dimensions, offer: selected!.offer_revision, customer: customer ? organization : null, effective_from: start, effective_until: end, priority, stacking: draft.stacking, multiplier };
        });
        card = { revision: crypto.randomUUID(), offer_revision: selected!.offer_revision, vendor_revision: safeInteger(selected!.vendor_revision), model_revision: safeInteger(selected!.model_revision), schema_revision: selected!.schema_revision,
          tariff: { revision: crypto.randomUUID(), dimensions, meter: meter.trim(), currency, decimal_places: places, amount_units: units, per_quantity: exactQuantity(per, false), minimum_quantity: exactQuantity(minimum, true), rounding, effective_from: start, effective_until: end }, discounts: rules };
        if (customer) {
          if (!selected!.vendor_id || !liabilityReview.trim() || liabilityReview.trim().length > 256 || /[\x00-\x1f\x7f]/.test(liabilityReview.trim())) throw new Error('Enter the reviewed maximum-liability reference.');
          card = { ...card, vendor_id: selected!.vendor_id, maximum_quantity: exactQuantity(maximum, false), liability_qualification_revision: liabilityReview.trim() };
        }
        setFrozen(card);
      }
      setBusy(true);
      inFlight.current = true;
      await request(token, `${endpoint}/media-rates${previous ? '/replace' : ''}`, 'POST', previous ? { previous_revision: previous.card.revision, rate: card } : card);
      onSaved();
    } catch (reason) {
      if (reason instanceof VendorRequestError && (reason.status === 400 || reason.status === 422)) setFrozen(null);
      setError(reason instanceof Error ? reason.message : 'Media rate could not be saved.');
    }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="niu-modal vendor-dialog" showCloseButton={!busy}>
    <DialogHeader><DialogTitle>{previous ? customer ? 'Replace selling rate' : 'Replace media rate' : customer ? 'Publish selling rate' : 'Publish media rate'}</DialogTitle><DialogDescription>{previous ? 'New terms start when the previous rate ends. Existing jobs keep their original price.' : customer ? 'Customer prices and the reviewed maximum liability for this specification.' : 'Agreed Supplier purchase terms, separate from customer selling prices.'}</DialogDescription></DialogHeader>
    {readError && <div role="alert" className="text-sm">{readError} <Button variant="ghost" size="sm" onClick={() => cursor ? void more() : setReadRevision(value => value + 1)}>Retry</Button></div>}
    {loading && !models.length ? <p role="status">Loading model choices…</p> : !readError && !models.length && !cursor ? <p>No eligible media models. Configure a media schema and qualify an active offer first.</p> : <form onSubmit={event => void submit(event)} className="min-w-0 space-y-4">
      <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-model">Model</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="media-rate-model" type="button" variant="outline" className="h-auto min-h-9 min-w-0 w-full justify-between whitespace-normal py-2 text-left" disabled={Boolean(previous) || Boolean(frozen) || busy}>{selected ? `${selected.model_alias} · ${selected.api_key_name}` : base?.dimensions.model ?? 'Choose model'}<ChevronDown aria-hidden="true" className="size-4 shrink-0" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-72 max-w-[calc(100vw-2rem)] overflow-y-auto"><DropdownMenuRadioGroup value={model} onValueChange={value => { setModel(value); setResolution(''); setReference(false); }}>{models.map(item => <DropdownMenuRadioItem key={item.model_alias} value={item.model_alias}>{item.model_alias} · {item.api_key_name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
      {cursor && <Button type="button" variant="ghost" size="sm" disabled={loading || Boolean(frozen)} onClick={() => void more()}>{loading ? 'Loading…' : 'Load more models'}</Button>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-resolution">Resolution</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="media-rate-resolution" type="button" variant="outline" className="w-full justify-between" disabled={!selected || Boolean(previous) || Boolean(frozen) || busy}>{resolution || 'Choose resolution'}<ChevronDown aria-hidden="true" className="size-4 shrink-0" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={resolution} onValueChange={setResolution}>{selected?.resolutions.map(value => <DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-currency">Currency</Label><Input id="media-rate-currency" required maxLength={3} value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} disabled={Boolean(frozen) || busy} /></div>
      </div>
      <div className="flex items-center gap-2"><Checkbox id="media-rate-reference" checked={reference} onCheckedChange={checked => setReference(checked === true)} disabled={!selected?.reference_video || Boolean(previous) || Boolean(frozen) || busy} /><Label htmlFor="media-rate-reference">With video reference</Label></div>
      {selected && !selected.resolutions.length && <p className="text-sm text-muted-foreground">This model has no configured resolution choices. Update its capability schema first.</p>}
      {previous && unavailable && !loading && <p role="alert" className="text-sm">The original model or specification is no longer eligible. Review its current offer and capability configuration.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-price">Unit price</Label><Input id="media-rate-price" required inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} disabled={Boolean(frozen) || busy} /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-meter">Billing unit</Label><Input id="media-rate-meter" required placeholder="e.g. video_tokens" value={meter} onChange={event => setMeter(event.target.value)} disabled={Boolean(previous) || Boolean(frozen) || busy} /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-per">Units per price</Label><Input id="media-rate-per" required value={per} onChange={event => setPer(event.target.value)} disabled={Boolean(frozen) || busy} /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-minimum">Minimum billable quantity</Label><Input id="media-rate-minimum" required value={minimum} onChange={event => setMinimum(event.target.value)} disabled={Boolean(frozen) || busy} /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-precision">Monetary decimal places</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="media-rate-precision" type="button" variant="outline" className="w-full justify-between" disabled={Boolean(frozen) || busy}>{places}<ChevronDown aria-hidden="true" className="size-4 shrink-0" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={String(places)} onValueChange={value => setPlaces(Number(value))}>{Array.from({length:10}, (_, value) => <DropdownMenuRadioItem key={value} value={String(value)}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-rounding">Rounding</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="media-rate-rounding" type="button" variant="outline" className="w-full justify-between" disabled={Boolean(frozen) || busy}>{rounding === 'HalfEven' ? 'Half to even' : rounding}<ChevronDown aria-hidden="true" className="size-4 shrink-0" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={rounding} onValueChange={value => setRounding(value as typeof rounding)}><DropdownMenuRadioItem value="HalfEven">Half to even</DropdownMenuRadioItem><DropdownMenuRadioItem value="Up">Up</DropdownMenuRadioItem><DropdownMenuRadioItem value="Down">Down</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-start">Starts</Label><Input id="media-rate-start" type="datetime-local" step="1" required value={from} onChange={event => setFrom(event.target.value)} disabled={Boolean(frozen) || busy || Boolean(previous?.retirement_effective_until)} /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-end">Ends (optional)</Label><Input id="media-rate-end" type="datetime-local" step="1" value={until} onChange={event => setUntil(event.target.value)} disabled={Boolean(frozen) || busy} /></div>
      </div>
      {customer && <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-maximum">Maximum billable quantity</Label><Input id="media-rate-maximum" required value={maximum} onChange={event => setMaximum(event.target.value)} disabled={Boolean(frozen) || busy}/><p className="text-xs text-muted-foreground">Reviewed upper bound in this billing unit, used to reserve funds.</p></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-liability-review">Liability review reference</Label><Input id="media-rate-liability-review" required maxLength={256} value={liabilityReview} onChange={event => setLiabilityReview(event.target.value)} disabled={Boolean(frozen) || busy}/><p className="text-xs text-muted-foreground">Reference your reviewed contract or limit evidence; an estimate is insufficient.</p></div>
      </div>}
      <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-sm font-medium">Discount rules</h3><Button type="button" variant="ghost" size="sm" disabled={Boolean(frozen) || busy || discounts.length >= 32} onClick={() => setDiscounts(current => { let priority = 0; while (current.some(rule => rule.priority === String(priority))) priority++; return [...current, { multiplier: '', priority: String(priority), stacking: 'Exclusive' }]; })}>Add discount</Button></div>
        {previous && previous.card.discounts.length > 0 && <p className="text-sm text-muted-foreground">The previous rate has {previous.card.discounts.length} discount {previous.card.discounts.length === 1 ? 'rule' : 'rules'}. Add the agreed rules for this replacement; previous discounts are not copied.</p>}
        {discounts.length > 0 && <p className="text-sm text-muted-foreground">Rules apply to this specification and offer during this rate’s effective period. A multiplier of 0.8 means 20% off.</p>}
        {discounts.map((rule, index) => <div key={index} className="min-w-0 space-y-2"><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="min-w-0 space-y-2"><Label htmlFor={`discount-multiplier-${index}`}>Price multiplier {index + 1}</Label><Input id={`discount-multiplier-${index}`} required value={rule.multiplier} onChange={event => setDiscounts(current => current.map((item, i) => i === index ? {...item,multiplier:event.target.value} : item))} disabled={Boolean(frozen) || busy} /></div><div className="min-w-0 space-y-2"><Label htmlFor={`discount-priority-${index}`}>Priority {index + 1}</Label><Input id={`discount-priority-${index}`} required inputMode="numeric" value={rule.priority} onChange={event => setDiscounts(current => current.map((item,i) => i === index ? {...item,priority:event.target.value} : item))} disabled={Boolean(frozen) || busy} /></div><div className="min-w-0 space-y-2"><Label htmlFor={`discount-stacking-${index}`}>Stacking {index + 1}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id={`discount-stacking-${index}`} type="button" variant="outline" className="w-full justify-between" disabled={Boolean(frozen) || busy}>{rule.stacking === 'Exclusive' ? 'Exclusive' : 'Multiply'}<ChevronDown aria-hidden="true" className="size-4 shrink-0" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={rule.stacking} onValueChange={value => setDiscounts(current => current.map((item,i) => i === index ? {...item,stacking:value as DiscountDraft['stacking']} : item))}><DropdownMenuRadioItem value="Exclusive">Exclusive</DropdownMenuRadioItem><DropdownMenuRadioItem value="Multiply">Multiply</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div></div><Button type="button" variant="ghost" size="sm" disabled={Boolean(frozen) || busy} onClick={() => setDiscounts(current => current.filter((_,i) => i !== index))}>Remove discount {index + 1}</Button></div>)}
      </div>
      {error && <p role="alert" className="text-sm">{error}{frozen && ' Retry preserves the same terms. Close to review saved history before creating another rate.'}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || loading || (!frozen && Boolean(unavailable))}>{busy ? 'Saving…' : frozen ? 'Retry save' : previous ? 'Publish replacement' : 'Publish rate'}</Button></div>
    </form>}
  </DialogContent></Dialog>;
}
