import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { request, writeMayHaveCommitted } from '@/features/providers/api';
import { amountFromNanos, amountToNanos, money } from '@/lib/money';
import { mediaAmount, mediaAmountUnits } from '@/lib/media-price';
import { retailCustomers, type RetailCustomer } from './api';
import { categories, checkedRates, ratesFrom, type Rates } from './text-terms';
import type { RetailPriceRecord, RetailPromotionPublication, RetailPublicationResult, RetailSchedule } from '@niu-io/sdk/admin';

function discountedRates(draft: Rates, original: Parameters<typeof ratesFrom>[0]) {
  const rates = checkedRates(draft);
  for (const [key] of categories) {
    const before = original?.[key] ?? null, after = rates[key];
    if (before === null ? after !== null : after === null || BigInt(after) > BigInt(before)) throw new Error('Result rates must preserve every original category and cannot exceed its original price.');
  }
  return rates;
}
function epoch(value: string): string {
  const seconds = Math.floor(Date.parse(value) / 1000);
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 253402300799) throw new Error('Choose a valid start and end time.');
  return String(seconds);
}
/** Explicit results relative to one immutable undiscounted standard revision. */
export function PromotionEditor({ token, baseline, onClose, onSaved }: { token: string; baseline: RetailPriceRecord; onClose: () => void; onSaved: () => void }) {
  const text = baseline.schedule.kind === 'text' ? baseline.schedule : null, media = baseline.schedule.kind === 'media' ? baseline.schedule : null;
  const [rates, setRates] = useState(() => ratesFrom(text ?? undefined));
  const [tiers, setTiers] = useState(() => (text?.context_tiers ?? []).map(tier => ratesFrom(tier)));
  const [fee, setFee] = useState(amountFromNanos(text?.request_fee_nanos ?? '0')), [minimum, setMinimum] = useState(amountFromNanos(text?.minimum_charge_nanos ?? '0'));
  const [amount, setAmount] = useState(media ? mediaAmount(media.amount_units, media.decimal_places) : '');
  const [scope, setScope] = useState('global'), [customers, setCustomers] = useState<RetailCustomer[]>([]), [customersError, setCustomersError] = useState(''), [query, setQuery] = useState('');
  const [from, setFrom] = useState(''), [until, setUntil] = useState(''), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false), [error, setError] = useState('');
  const [attempt, setAttempt] = useState<RetailPromotionPublication | null>(null); const key = useRef(crypto.randomUUID());
  useEffect(() => {
    const controller = new AbortController(); void retailCustomers(token, controller.signal).then(rows => { if (!controller.signal.aborted) setCustomers(rows); }).catch(failure => { if (!controller.signal.aborted) setCustomersError(failure instanceof Error ? failure.message : 'Customers unavailable.'); });
    return () => controller.abort();
  }, [token]);
  const selected = customers.find(row => row.organization_id === scope), locked = busy || conflict || !!attempt;
  const ambiguous = (row: RetailCustomer) => customers.some(other => other.organization_id !== row.organization_id && other.organization_name === row.organization_name && other.created_at === row.created_at);
  async function publish(event: FormEvent) {
    event.preventDefault(); if (busy || conflict) return;
    let input = attempt;
    if (!input) {
      try {
        const note = reason.trim(), effective_from = epoch(from), effective_until = epoch(until);
        if (BigInt(effective_until) <= BigInt(effective_from)) throw new Error('End must follow start.');
        if (!note || [...note].length > 500 || /[\u0000-\u001f\u007f-\u009f]/.test(note)) throw new Error('Enter a single-line reason of up to 500 characters.');
        if (scope !== 'global' && (!selected || ambiguous(selected))) throw new Error('Choose an unambiguous named customer.');
        let schedule: RetailSchedule;
        if (text) {
          const request_fee_nanos = amountToNanos(fee, true), minimum_charge_nanos = amountToNanos(minimum, true);
          if (BigInt(request_fee_nanos) > BigInt(text.request_fee_nanos) || BigInt(minimum_charge_nanos) > BigInt(text.minimum_charge_nanos)) throw new Error('Result fees and minimum cannot exceed the original standard.');
          schedule = { kind: 'text', ...discountedRates(rates, text), request_fee_nanos, minimum_charge_nanos, context_tiers: text.context_tiers.map((tier, index) => ({ minimum_input_tokens: tier.minimum_input_tokens, ...discountedRates(tiers[index], tier) })) };
        } else if (media) {
          const amount_units = mediaAmountUnits(amount, media.decimal_places);
          if (BigInt(amount_units) > BigInt(media.amount_units)) throw new Error('Result price cannot exceed the original standard.');
          schedule = { ...media, amount_units };
        } else throw new Error('Original selling terms unavailable.');
        input = { baseline_revision: baseline.revision, customer_organization_id: scope === 'global' ? null : scope, schedule, effective_from, effective_until, expected_version: baseline.version, idempotency_key: key.current, reason: note };
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid promotion.'); return; }
    }
    setAttempt(input); setBusy(true); setError('');
    try {
      const result = await request<{ data: RetailPublicationResult }>(token, '/api/v1/pricing/standard-prices/' + encodeURIComponent(baseline.price_id) + '/promotions', 'POST', input);
      if (result.data?.price_id !== baseline.price_id || !result.data.revision || BigInt(result.data.version) !== BigInt(input.expected_version) + 1n) throw new Error('Publication response could not be confirmed.');
      onSaved();
    } catch (failure) {
      const uncertain = writeMayHaveCommitted(failure); if (!uncertain) setConflict(true);
      setError((failure instanceof Error ? failure.message : 'Publication outcome unavailable.') + (uncertain ? ' Keep this form open and retry its exact original submission.' : ' Close and refresh prices/history before another edit.'));
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy && (!attempt || conflict)) onClose(); }}><DialogContent className="sm:max-w-3xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Publish finite promotion</DialogTitle><DialogDescription>{baseline.model_alias} · {baseline.currency}. Original standard published {new Date(baseline.published_at).toLocaleString()}. Customer-specific rules override global rules without stacking; existing requests keep their pinned prices.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={event => void publish(event)}>
    <div className="space-y-2"><Label>Applies to</Label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={locked} aria-label="Promotion customer scope">{scope === 'global' ? 'All customers' : selected?.organization_name || 'Customer unavailable'}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" collisionPadding={8} className="max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto"><Input aria-label="Filter promotion customers" placeholder="Filter customers" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') event.stopPropagation(); }} /><DropdownMenuRadioGroup value={scope} onValueChange={value => { setScope(value); setError(''); }}><DropdownMenuRadioItem value="global">All customers</DropdownMenuRadioItem>{customers.filter(row => row.organization_name.toLowerCase().includes(query.trim().toLowerCase())).map(row => <DropdownMenuRadioItem key={row.organization_id} value={row.organization_id} disabled={ambiguous(row)}><span>{row.organization_name}<span className="block text-xs text-muted-foreground">Created {row.created_at.replace('T', ' ')}{ambiguous(row) ? ' · Rename to distinguish' : ''}</span></span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>{selected && <p className="text-sm text-muted-foreground">Company created {selected.created_at.replace('T', ' ')}.</p>}</div>
    {customersError && <Alert variant="destructive"><AlertDescription>{customersError} Customer-specific publication requires a confirmed target.</AlertDescription></Alert>}
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="promotion-from">Starts</Label><Input id="promotion-from" type="datetime-local" step={1} value={from} disabled={locked} onChange={event => { setFrom(event.target.value); setError(''); }} /></div><div className="space-y-2"><Label htmlFor="promotion-until">Ends</Label><Input id="promotion-until" type="datetime-local" step={1} value={until} disabled={locked} onChange={event => { setUntil(event.target.value); setError(''); }} /></div></div><p className="text-sm text-muted-foreground">Times use this browser's local timezone. Start is inclusive; end is exclusive. This is an explicit resulting price, never a stacked multiplier.</p>
    {text && <><div className="grid gap-4 sm:grid-cols-2">{categories.map(([field, label]) => <div key={field} className="space-y-2"><Label htmlFor={'promotion-' + field}>{label}</Label><Input id={'promotion-' + field} inputMode="decimal" value={rates[field]} disabled={locked || text[field] === null} onChange={event => { setRates(current => ({ ...current, [field]: event.target.value })); setError(''); }} /><p className="text-xs text-muted-foreground">Original: {text[field] === null ? 'Ordinary pricing, unchanged' : money(text[field], baseline.currency)}</p></div>)}</div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="promotion-fee">Result request fee</Label><Input id="promotion-fee" value={fee} disabled={locked} inputMode="decimal" onChange={event => { setFee(event.target.value); setError(''); }} /><p className="text-xs text-muted-foreground">Original: {money(text.request_fee_nanos, baseline.currency)}</p></div><div className="space-y-2"><Label htmlFor="promotion-minimum">Result minimum charge</Label><Input id="promotion-minimum" value={minimum} disabled={locked} inputMode="decimal" onChange={event => { setMinimum(event.target.value); setError(''); }} /><p className="text-xs text-muted-foreground">Original: {money(text.minimum_charge_nanos, baseline.currency)}</p></div></div>{text.context_tiers.map((tier, index) => <section key={index} className="space-y-3 border-b pb-4"><p className="font-medium">From {tier.minimum_input_tokens} input tokens</p><div className="grid gap-4 sm:grid-cols-2">{categories.map(([field, label]) => <div key={field} className="space-y-2"><Label htmlFor={`promotion-tier-${index}-${field}`}>{label}</Label><Input id={`promotion-tier-${index}-${field}`} value={tiers[index][field]} inputMode="decimal" disabled={locked || tier[field] == null} onChange={event => { setTiers(current => current.map((value, i) => i === index ? { ...value, [field]: event.target.value } : value)); setError(''); }} /><p className="text-xs text-muted-foreground">Original: {tier[field] == null ? 'Ordinary pricing, unchanged' : money(tier[field], baseline.currency)}</p></div>)}</div></section>)}</>}
    {media && <><div className="space-y-2"><Label htmlFor="promotion-media-price">Result media price in {baseline.currency}</Label><Input id="promotion-media-price" value={amount} disabled={locked} inputMode="decimal" onChange={event => { setAmount(event.target.value); setError(''); }} /><p className="text-sm text-muted-foreground">Original: {baseline.currency} {mediaAmount(media.amount_units, media.decimal_places)} per {media.per_quantity.numerator}/{media.per_quantity.denominator} {media.meter}.</p></div><p className="text-sm text-muted-foreground">{media.dimensions.channel} · {media.dimensions.resolution} · {media.dimensions.reference_video ? 'Reference video' : 'No reference video'} · Scale {media.decimal_places} · Minimum {media.minimum_quantity.numerator}/{media.minimum_quantity.denominator} · Rounding {media.rounding}. These terms stay fixed.</p></>}
    <div className="space-y-2"><Label htmlFor="promotion-reason">Reason</Label><Input id="promotion-reason" maxLength={500} value={reason} disabled={locked} onChange={event => { setReason(event.target.value); setError(''); }} /></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy || (!!attempt && !conflict)} onClick={onClose}>Close</Button><Button type="submit" disabled={busy || conflict}>{busy ? 'Publishing…' : attempt ? 'Retry exact promotion' : 'Publish promotion'}</Button></div>
  </form></DialogContent></Dialog>;
}
