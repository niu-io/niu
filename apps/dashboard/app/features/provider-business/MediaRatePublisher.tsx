import { Empty, EmptyHeader, EmptyDescription } from '@/components/ui/empty';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Link } from 'react-router';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { IconChevronDown as ChevronDown } from '@tabler/icons-react';
import { cachedGet, peekCachedGet, request, ProviderRequestError } from '@/features/providers/api';
import {
  discountMultiplier, discountPercent, formatMediaAmount, formatMediaQuantity, mediaMeterName,
  mediaRateBasis, parseMediaPrice, parseMediaQuantity, quantityText,
  type ExactQuantity,
} from '@/lib/media-rate';
import type {
  ProviderMediaOfferInput, ProviderMediaOfferModel, ProviderMediaRateCard,
  ProviderMediaRateRecord, CustomerMediaRateCard, CustomerMediaRateRecord,
} from '@niu-io/sdk/admin';

/** A configured purchase choice augments the qualified rate projection with offer state. */
type RateModel = {
  model_alias: string; api_key_name: string; offer_revision: string | null;
  vendor_id?: string; vendor_revision: string; model_revision: string;
  schema_revision: string; channel: string; resolutions: string[];
  reference_video: boolean; meter: string | null;
  offer_id?: string | null; offer_active?: boolean; offer_qualified?: boolean;
  offer_current?: boolean; route_ready?: boolean;
};
type ModelPage = { data: RateModel[]; has_more: boolean; next_after: string | null };
type Provision = { offerId: string; offerRevision: string; authorized: boolean };

function localDate(seconds = Math.floor(Date.now() / 1000)) {
  const date = new Date(seconds * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 19);
}
function safeInteger(value: string) {
  const integer = Number(value);
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(integer)) throw new Error('The selected configuration exceeds the supported exact integer range.');
  return integer;
}
function canonicalRevision(value: string) {
  return /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}
function sameDimensions(left: ProviderMediaRateCard['tariff']['dimensions'], right: ProviderMediaRateCard['tariff']['dimensions']) {
  return left.model === right.model && left.channel === right.channel && left.resolution === right.resolution && left.reference_video === right.reference_video;
}
function basisText(quantity: ExactQuantity, meter: string) {
  return `${quantityText(quantity)} ${mediaMeterName(meter, quantity)}`;
}
/** Draft reads omit status only on older servers; treat that as already eligible and let the server enforce. */
function normalizePurchaseChoice(model: ProviderMediaOfferModel): RateModel {
  return {
    ...model,
    resolutions: model.resolutions ?? [],
    reference_video: model.reference_video === true,
    meter: model.meter ?? null,
    offer_active: model.offer_active !== false,
    offer_qualified: model.offer_qualified !== false,
    offer_current: model.offer_current !== false,
    route_ready: model.route_ready !== false,
  };
}

export default function MediaRatePublisher({ token, supplier, organization, previous, existing = [], initialModel = '', onClose, onSaved, returnFocus }: {
  token: string; previous?: ProviderMediaRateRecord | CustomerMediaRateRecord; existing?: Array<ProviderMediaRateRecord | CustomerMediaRateRecord>; initialModel?: string; onClose: () => void; onSaved: () => void; returnFocus?: { current: HTMLElement | null };
} & ({ supplier: string; organization?: never } | { organization: string; supplier?: never })) {
  const { t: uiT } = useUILocale();
  const customer = organization !== undefined;
  const previousCustomer = customer ? previous?.card as CustomerMediaRateRecord['card'] | undefined : undefined;
  const base = previous?.card.tariff;
  const [maximum, setMaximum] = useState(() => previousCustomer ? formatMediaQuantity(previousCustomer.maximum_quantity) ?? '' : '');
  const maximumExact = previousCustomer && formatMediaQuantity(previousCustomer.maximum_quantity) === null ? previousCustomer.maximum_quantity : null;
  // A manual contract reference is not a human pricing field. An existing
  // revision keeps its qualification reference; a new revision gets a stable
  // system reference so liability bounds stay traceable without inventing review.
  const [liabilityReference] = useState(() => previousCustomer?.liability_qualification_revision || crypto.randomUUID());
  const endpoint = customer ? `/api/v1/organizations/${encodeURIComponent(organization)}/billing` : `/api/v1/providers/${encodeURIComponent(supplier!)}`;
  // Purchase rates read every configured video model, including those whose
  // offer is paused, stale or not created yet. Saving the rate resolves the
  // offer binding instead of requiring a separate pinning dialog. Customer
  // selling rates still require an eligible existing offer.
  const modelsPath = customer ? `${endpoint}/media-rate-models?limit=50` : `${endpoint}/media-offer-models?limit=50`;
  const initialPage = token ? peekCachedGet<ModelPage>(token, modelsPath) : undefined;
  const [models, setModels] = useState<RateModel[]>(() => initialPage?.data ?? []);
  const [cursor, setCursor] = useState<string | null>(() => initialPage?.has_more ? initialPage.next_after : null);
  const [loading, setLoading] = useState(() => Boolean(token && !initialPage));
  const [readError, setReadError] = useState('');
  const [readRevision, setReadRevision] = useState(0);
  const lastReadRevision = useRef(0);
  const [model, setModel] = useState(base?.dimensions.model ?? initialModel);
  const [resolution, setResolution] = useState(base?.dimensions.resolution ?? '');
  const [reference, setReference] = useState(base?.dimensions.reference_video ?? false);
  const {currency:platformCurrency}=usePlatformCurrency();
  const currency=base?.currency ?? platformCurrency;
  const currencyConfigured = /^[A-Z]{3}$/.test(currency);
  const [price, setPrice] = useState(base ? formatMediaAmount(base.amount_units, base.decimal_places) : '');
  const [from, setFrom] = useState(() => {
    if (!previous) return localDate();
    if (previous.retirement_effective_until !== null) return localDate(Number(previous.retirement_effective_until));
    return localDate(Math.max(Math.floor(Date.now() / 1000), Number(previous.card.tariff.effective_from)));
  });
  const [until, setUntil] = useState(() => base?.effective_until ? localDate(Number(base.effective_until)) : '');
  const [discount, setDiscount] = useState(() => {
    if (!previous || previous.card.discounts.length !== 1) return '';
    const rule = previous.card.discounts[0];
    return discountPercent(rule.multiplier) ?? '';
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [frozen, setFrozen] = useState<ProviderMediaRateCard | CustomerMediaRateCard | null>(null);
  const inFlight = useRef(false);
  const modelReads = useRef<AbortController | null>(null);
  // Provisioning state is deliberately kept across explicit retries. A lost
  // offer publication or authorization response must not create a second
  // revision for the same user action.
  const provision = useRef<Provision | null>(null);
  const offerRequest = useRef<ProviderMediaOfferInput | null>(null);
  const selected = models.find(item => item.model_alias === model);
  const meter = base?.meter ?? selected?.meter ?? '';
  const basis = base?.per_quantity ?? mediaRateBasis(meter);
  const priorDiscount = previous?.card.discounts.length === 1 ? previous.card.discounts[0] : null;
  const preservedDiscounts = previous ? previous.card.discounts.map(rule => ({
    ...rule,
    effective_from: Number(rule.effective_from),
    effective_until: rule.effective_until === null ? null : Number(rule.effective_until),
  })) : [];
  // A single rule that stays on this exact specification can be shown as a
  // percentage. Other saved rules are retained verbatim instead of flattened.
  const simplePriorDiscount = previous && priorDiscount && base
    && priorDiscount.dimensions !== null && sameDimensions(priorDiscount.dimensions, base.dimensions)
    && priorDiscount.offer === previous.card.offer_revision
    && priorDiscount.customer === (customer ? organization : null)
    && discountPercent(priorDiscount.multiplier) !== null;
  const complexDiscounts = priorDiscount !== null && !simplePriorDiscount;
  const multipleDiscounts = previous ? previous.card.discounts.length > 1 : false;
  const discountsLocked = complexDiscounts || multipleDiscounts;
  const initialDiscount = simplePriorDiscount ? discountPercent(priorDiscount!.multiplier) ?? '' : '';
  const offerInactive = !customer && !!selected && (!selected.offer_active || !selected.offer_qualified);
  const needsProvision = offerInactive && !previous;
  const connectionBlocked = needsProvision && selected?.route_ready === false;
  const offerBlocked = offerInactive && !!previous;
  const unavailable = !selected || !basis
    || !selected.resolutions.includes(resolution)
    || (reference && !selected.reference_video)
    || (base ? selected.channel !== base.dimensions.channel || (selected.meter !== null && selected.meter !== base.meter) : false)
    || connectionBlocked
    || offerBlocked
    || (!customer && !previous && !selected.offer_revision && !offerInactive);

  useEffect(() => {
    const controller = new AbortController();
    modelReads.current = controller;
    const force = lastReadRevision.current !== readRevision;
    lastReadRevision.current = readRevision;
    const cached = token ? peekCachedGet<ModelPage>(token, modelsPath) : undefined;
    if (cached && !force) {
      setModels(customer ? cached.data : (cached.data as ProviderMediaOfferModel[]).map(normalizePurchaseChoice));
      setCursor(cached.has_more ? cached.next_after : null);
      setLoading(false);
    } else {
      setLoading(true);
      setModels([]);
      setCursor(null);
    }
    setReadError('');
    void cachedGet<ModelPage>(token, modelsPath, { signal: controller.signal, force })
      .then(page => {
        if (controller.signal.aborted) return;
        setModels(customer ? page.data : (page.data as ProviderMediaOfferModel[]).map(normalizePurchaseChoice));
        setCursor(page.has_more ? page.next_after : null);
      })
      .catch(reason => { if (!controller.signal.aborted) setReadError(reason instanceof Error ? reason.message : 'Model choices could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); modelReads.current = null; };
  }, [token, modelsPath, readRevision, customer]);

  // Deep links from the configured-model table preselect their model without
  // overriding a model the administrator already chose.
  useEffect(() => {
    if (!initialModel || model) return;
    const choice = models.find(item => item.model_alias === initialModel);
    if (!choice) return;
    setModel(choice.model_alias);
    setResolution(choice.resolutions.length === 1 ? choice.resolutions[0] : '');
    setReference(false);
  }, [initialModel, models, model]);

  async function more() {
    if (!cursor || loading) return;
    const controller = modelReads.current;
    if (!controller || controller.signal.aborted) return;
    setLoading(true);
    setReadError('');
    try {
      const page = await request<ModelPage>(token, `${modelsPath}&after=${encodeURIComponent(cursor)}`, 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      setModels(current => [...current, ...(customer ? page.data : (page.data as ProviderMediaOfferModel[]).map(normalizePurchaseChoice))]);
      setCursor(page.has_more ? page.next_after : null);
    } catch (reason) { if (!controller.signal.aborted) setReadError(reason instanceof Error ? reason.message : 'More models could not be loaded.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }

  function resetProvision() {
    provision.current = null;
    offerRequest.current = null;
  }

  function chooseModel(value: string) {
    const choice = models.find(item => item.model_alias === value);
    if (value !== model) { resetProvision(); setFrozen(null); setError(''); }
    setModel(value);
    setResolution(choice?.resolutions.length === 1 ? choice.resolutions[0] : '');
    setReference(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || (!frozen && unavailable)) return;
    setError('');
    try {
      let card = frozen;
      if (!card) {
        const parsedPrice = parseMediaPrice(price);
        if (!basis) throw new Error('Choose a model with a configured billing unit.');
        if (!/^[A-Z]{3}$/.test(currency)) throw new Error('The platform currency is not available. Configure it in Admin before saving a rate.');
        const start = Math.floor(Date.parse(from) / 1000);
        const end = until ? Math.floor(Date.parse(until) / 1000) : null;
        if (!Number.isSafeInteger(start) || (end !== null && (!Number.isSafeInteger(end) || end <= start))) throw new Error('Choose a valid effective period.');
        if (base && (start < Number(base.effective_from) || (base.effective_until !== null && start > Number(base.effective_until)))) throw new Error('Choose a start within the current rate’s effective period.');
        if (previous?.retirement_effective_until !== null && previous?.retirement_effective_until !== undefined && start !== Number(previous.retirement_effective_until)) throw new Error('New terms must start when the current rate ends.');
        const dimensions = { model, channel: selected!.channel, resolution, reference_video: reference };
        if (!previous && existing.some(record => {
          const rate = record.card.tariff;
          if ((!customer && record.card.offer_revision !== selected!.offer_revision) || rate.dimensions.model !== model || rate.dimensions.channel !== dimensions.channel || rate.dimensions.resolution !== resolution || rate.dimensions.reference_video !== reference) return false;
          const ends = [rate.effective_until, record.retirement_effective_until].filter((value): value is string => value !== null).map(BigInt);
          const stop = ends.length ? ends.reduce((a,b) => a < b ? a : b) : null;
          return (stop === null || stop > BigInt(start)) && (end === null || BigInt(rate.effective_from) < BigInt(end));
        })) throw new Error('This specification already has an active rate. Edit that rate instead.');

        let offerRevision: string;
        if (previous) {
          offerRevision = previous.card.offer_revision;
        } else if (customer) {
          if (!selected!.offer_revision) throw new Error('The selected model is missing its current offer. Refresh model choices.');
          offerRevision = selected!.offer_revision;
        } else if (needsProvision) {
          if (selected!.route_ready === false) throw new Error('This model’s Provider connection is unavailable. Restore its API key and model route before publishing a rate.');
          if (!selected!.vendor_id) throw new Error('The selected model is missing its credential reference. Refresh model choices.');
          if (!canonicalRevision(selected!.vendor_revision) || !canonicalRevision(selected!.model_revision)) throw new Error('This configuration cannot be represented safely. Refresh model choices.');
          let current = provision.current;
          if (!current) {
            if (selected!.offer_id && selected!.offer_current && selected!.offer_revision && !selected!.offer_active) {
              // The offer is paused but still bound to this exact configuration.
              // Enabling it directly avoids an unnecessary revision and pause.
              current = { offerId: selected!.offer_id, offerRevision: selected!.offer_revision, authorized: false };
            } else {
              const body: ProviderMediaOfferInput = offerRequest.current ?? {
                revision: crypto.randomUUID(),
                model_alias: selected!.model_alias,
                vendor_id: selected!.vendor_id,
                vendor_revision: selected!.vendor_revision,
                model_revision: selected!.model_revision,
                schema_revision: selected!.schema_revision,
                expected_revision: selected!.offer_revision,
              };
              offerRequest.current = body;
              const saved = await request<{data:{revision:string;offer_id:string}}>(token, `${endpoint}/media-offers`, 'POST', body);
              if (!saved?.data?.offer_id || !saved.data.revision) throw new Error('The offer was saved without a usable reference. Refresh model choices.');
              current = { offerId: saved.data.offer_id, offerRevision: saved.data.revision, authorized: false };
            }
            provision.current = current;
          }
          if (!current.authorized) {
            // This is the explicit commercial authorization: it records the
            // acting administrator against the exact offer revision.
            await request(token, `${endpoint}/offers/${encodeURIComponent(current.offerId)}/authorization`, 'PUT', { rate_revision: current.offerRevision });
            current = { ...current, authorized: true };
            provision.current = current;
          }
          offerRevision = current.offerRevision;
        } else {
          if (!selected!.offer_revision) throw new Error('The selected model is missing its current offer. Refresh model choices.');
          offerRevision = selected!.offer_revision;
        }

        let discounts: CustomerMediaRateCard['discounts'] = [];
        if (previous && discountsLocked) {
          discounts = preservedDiscounts;
        } else if (discount.trim()) {
          const unchanged = simplePriorDiscount && discount.trim() === initialDiscount;
          if (unchanged) {
            discounts = preservedDiscounts;
          } else {
            const multiplier = discountMultiplier(discount);
            if (multiplier.numerator !== multiplier.denominator) {
              discounts = [{ revision: crypto.randomUUID(), dimensions, offer: offerRevision, customer: customer ? organization : null, effective_from: start, effective_until: end, priority: 0, stacking: 'Exclusive', multiplier }];
            }
          }
        }
        const minimum = base?.minimum_quantity ?? { numerator: '0', denominator: '1' };
        card = {
          revision: crypto.randomUUID(),
          offer_revision: offerRevision,
          vendor_revision: safeInteger(selected!.vendor_revision),
          model_revision: safeInteger(selected!.model_revision),
          schema_revision: selected!.schema_revision,
          tariff: {
            revision: crypto.randomUUID(),
            dimensions,
            meter,
            currency,
            decimal_places: parsedPrice.decimalPlaces,
            amount_units: Number(parsedPrice.amountUnits),
            per_quantity: basis,
            minimum_quantity: minimum,
            // Rounding and minimums are retained terms, not editing choices.
            rounding: base?.rounding ?? 'HalfEven',
            effective_from: start,
            effective_until: end,
          },
          discounts,
        };
        if (customer) {
          if (!selected!.vendor_id) throw new Error('The selected model is missing its vendor configuration. Refresh model choices.');
          const maximumQuantity = maximumExact ?? parseMediaQuantity(maximum, false);
          card = { ...card, vendor_id: selected!.vendor_id, maximum_quantity: maximumQuantity, liability_qualification_revision: liabilityReference };
        }
        setFrozen(card);
      }
      setBusy(true);
      inFlight.current = true;
      await request(token, `${endpoint}/media-rates${previous ? '/replace' : ''}`, 'POST', previous ? { previous_revision: previous.card.revision, rate: card } : card);
      onSaved();
    } catch (reason) {
      if (reason instanceof ProviderRequestError && (reason.status === 400 || reason.status === 422)) setFrozen(null);
      setError(reason instanceof Error ? reason.message : 'Media rate could not be saved.');
    }
    finally { inFlight.current = false; setBusy(false); }
  }

  const basisLabel = basis ? (meter === 'seconds' && basis.numerator === '1' && basis.denominator === '1'
    ? uiT("per second")
    : meter === 'video_tokens' && basis.numerator === '1000000' && basis.denominator === '1'
      ? uiT("per 1M video tokens")
      : `${uiT("per")} ${basisText(basis, meter)}`) : uiT("Choose a model to see the billing unit");
  const startLocked = Boolean(previous);

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="niu-modal vendor-dialog" showCloseButton={!busy} onCloseAutoFocus={event => { if (returnFocus?.current?.isConnected) { event.preventDefault(); returnFocus.current.focus(); } }}>
    <DialogHeader><DialogTitle>{previous ? customer ? uiT("Edit selling rate") : uiT("Edit media rate") : customer ? uiT("Publish selling rate") : uiT("Publish media rate")}</DialogTitle><DialogDescription>{previous ? uiT("Save changes to this rate. Only future charges use the new price; existing jobs keep their original price.") : customer ? uiT("Customer prices for this specification. The model determines the billing unit.") : uiT("Agreed Provider purchase terms, separate from customer selling prices.")}</DialogDescription></DialogHeader>
    {readError && <div role="alert" className="text-sm">{readError} <Button variant="ghost" size="sm" onClick={() => cursor ? void more() : setReadRevision(value => value + 1)}>{uiT("Retry")}</Button></div>}
    {loading && !models.length ? <FormSectionSkeleton fields={3} label={uiT("Loading model choices…")} /> : !readError && !models.length && !cursor ? <Empty className="min-h-40"><EmptyHeader><EmptyDescription>{uiT("No eligible media models.")}{" "}<Link className="underline" to="/admin/providers" target="_blank" rel="noopener noreferrer">{uiT("Configure and qualify a Provider model (opens in a new tab)")}</Link>{uiT(", then refresh the choices here.")}</EmptyDescription></EmptyHeader><Button variant="outline" onClick={() => setReadRevision(value => value + 1)}>{uiT("Refresh model choices")}</Button></Empty> : <form onSubmit={event => void submit(event)} className="min-w-0 space-y-5">
      <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-model">{uiT("Model")}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="media-rate-model" type="button" variant="outline" className="h-auto min-h-9 min-w-0 w-full justify-between whitespace-normal py-2 text-left" disabled={Boolean(previous) || Boolean(frozen) || busy}>{selected ? `${selected.model_alias} · ${selected.api_key_name}` : base?.dimensions.model ?? uiT("Choose model")}<ChevronDown aria-hidden="true" className="size-4 shrink-0" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-72 max-w-[calc(100vw-2rem)] overflow-y-auto"><DropdownMenuRadioGroup value={model} onValueChange={chooseModel}>{models.map(item => <DropdownMenuRadioItem key={item.model_alias} value={item.model_alias} disabled={!item.meter}>{item.model_alias} · {item.api_key_name}{!item.meter ? ` · ${uiT("No billing unit")}` : !customer && item.route_ready === false ? ` · ${uiT("Connection unavailable")}` : !customer && item.offer_active === false ? ` · ${uiT("Offer not enabled")}` : ''}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
      {cursor && <Button type="button" variant="ghost" size="sm" disabled={loading || Boolean(frozen)} onClick={() => void more()}>{loading ? uiT("Loading…") : uiT("Load more models")}</Button>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-resolution">{uiT("Resolution")}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="media-rate-resolution" type="button" variant="outline" className="w-full justify-between" disabled={!selected || Boolean(previous) || Boolean(frozen) || busy}>{resolution || uiT("Choose resolution")}<ChevronDown aria-hidden="true" className="size-4 shrink-0" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={resolution} onValueChange={setResolution}>{selected?.resolutions.map(value => <DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
        <div className="min-w-0 space-y-2"><Label>{uiT("Billing unit")}</Label><p className="flex min-h-9 items-center text-sm">{meter ? uiT(mediaMeterName(meter, { numerator: '2', denominator: '1' })) : uiT("Not configured")}</p></div>
      </div>
      <div className="flex items-center gap-2"><Checkbox id="media-rate-reference" checked={reference} onCheckedChange={checked => setReference(checked === true)} disabled={!selected?.reference_video || Boolean(previous) || Boolean(frozen) || busy} /><Label htmlFor="media-rate-reference">{uiT("With video reference")}</Label></div>
      {selected && !selected.resolutions.length && <p className="text-sm text-muted-foreground">{uiT("This model has no configured resolution choices. Update its capability schema first.")}</p>}
      {selected && !selected.meter && !base && <p role="alert" className="text-sm">{uiT("This model has no configured billing unit. Add a validated output schema before setting a rate.")}</p>}
      {previous && unavailable && !loading && <p role="alert" className="text-sm">{uiT("The original model or specification is no longer eligible. Review its current offer and capability configuration.")}</p>}
      {connectionBlocked && <p role="alert" className="text-sm">{uiT("This model’s Provider connection is unavailable. Restore its API key and model route before publishing a rate.")}</p>}
      {offerBlocked && <p role="alert" className="text-sm">{uiT("This offer is paused or needs its current configuration. Enable it from Media rates, or set a new rate instead of replacing the old one.")}</p>}
      {needsProvision && !connectionBlocked && <p className="text-sm text-muted-foreground">{uiT("Saving this rate creates the offer binding for the current video configuration and enables the offer for commercial supply. This records your authorization for this configuration; existing jobs keep their original route and prices.")}</p>}
      <div className="min-w-0 space-y-2">
        <Label htmlFor="media-rate-price">{uiT("Price")}</Label>
        <div className="flex min-w-0 items-center gap-3">
          <Input id="media-rate-price" required inputMode="decimal" autoComplete="off" className="min-w-0 flex-1" value={price} onChange={event => setPrice(event.target.value)} disabled={Boolean(frozen) || busy} aria-describedby="media-rate-price-basis" />
          <p id="media-rate-price-basis" className="shrink-0 text-sm text-muted-foreground">{currencyConfigured ? `${currency} ${basisLabel}` : uiT("Configure the platform currency in Admin before publishing a rate.")}</p>
        </div>
        {previous && base && price === formatMediaAmount(base.amount_units, base.decimal_places) ? <p className="text-xs text-muted-foreground">{uiT("Exact stored amount")}{" "}{currency} {formatMediaAmount(base.amount_units, base.decimal_places)}.</p> : null}
      </div>
      {customer && <div className="min-w-0 space-y-2">
        <Label htmlFor="media-rate-maximum">{uiT("Maximum billable quantity")}</Label>
        {maximumExact ? <p className="text-sm">{quantityText(maximumExact)} {uiT(mediaMeterName(meter, maximumExact))}</p> : <Input id="media-rate-maximum" required inputMode="decimal" value={maximum} onChange={event => setMaximum(event.target.value)} disabled={Boolean(frozen) || busy} />}
        <p className="text-xs text-muted-foreground">{uiT("Largest job allowed at this price. Funds are reserved for this quantity.")}</p>
      </div>}
      <div className="space-y-2">
        <Label htmlFor="media-rate-discount">{uiT("Discount (%)")}</Label>
        {discountsLocked ? <p className="text-sm text-muted-foreground">{uiT("This rate has saved discount terms. They are retained unchanged with this revision.")}</p> : <><Input id="media-rate-discount" inputMode="decimal" autoComplete="off" value={discount} onChange={event => setDiscount(event.target.value)} disabled={Boolean(frozen) || busy} placeholder="0" /><p className="text-xs text-muted-foreground">{uiT("Optional. Applies to this specification and offer for the rate’s effective period.")}</p></>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-start">{uiT("Starts")}</Label><Input id="media-rate-start" type="datetime-local" step="1" required value={from} onChange={event => setFrom(event.target.value)} disabled={Boolean(frozen) || busy || startLocked} />{startLocked && <p className="text-xs text-muted-foreground">{uiT("Edits take effect from this date; earlier charges keep their original rate.")}</p>}</div>
        <div className="min-w-0 space-y-2"><Label htmlFor="media-rate-end">{uiT("Ends (optional)")}</Label><Input id="media-rate-end" type="datetime-local" step="1" value={until} onChange={event => setUntil(event.target.value)} disabled={Boolean(frozen) || busy} /></div>
      </div>
      {error && <p role="alert" className="text-sm">{error}{frozen && " " + uiT("Retry preserves the same terms. Close to review saved history before creating another rate.")}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{uiT("Cancel")}</Button><Button type="submit" disabled={busy || loading || (!frozen && (Boolean(unavailable) || !currencyConfigured))}>{busy ? uiT("Saving…") : frozen ? uiT("Retry save") : previous ? uiT("Save changes") : needsProvision ? uiT("Publish rate and enable offer") : uiT("Publish rate")}</Button></div>
    </form>}
  </DialogContent></Dialog>;
}
