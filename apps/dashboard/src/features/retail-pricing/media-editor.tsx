import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { request, writeMayHaveCommitted } from '@/features/vendors/api';
import { mediaAmount, mediaAmountUnits, mediaQuantity, mediaQuantityInput } from '@/lib/media-price';
import { registeredRetailModels } from './api';
import type { RetailPriceRecord, RetailPublicationResult, RetailSchedule, RetailStandardPublication } from '../../../../../sdks/javascript/src/admin';

type MediaSchedule = Extract<RetailSchedule, { kind: 'media' }>;
/** Explicit media dimensions and metering; price configuration is not qualification. */
export function MediaStandardEditor({ token, previous, onClose, onSaved }: { token: string; previous: RetailPriceRecord | null; onClose: () => void; onSaved: () => void }) {
  const original = previous?.schedule.kind === 'media' ? previous.schedule : undefined;
  const [model, setModel] = useState(previous?.model_alias ?? ''), [currency, setCurrency] = useState(previous?.currency ?? 'USD');
  const [models, setModels] = useState<string[]>([]), [modelsError, setModelsError] = useState(''), [query, setQuery] = useState('');
  const [channel, setChannel] = useState(original?.dimensions.channel ?? ''), [resolution, setResolution] = useState(original?.dimensions.resolution ?? ''), [reference, setReference] = useState(original?.dimensions.reference_video ?? false);
  const [meter, setMeter] = useState(original?.meter ?? ''), [places, setPlaces] = useState(original?.decimal_places ?? 9);
  const [price, setPrice] = useState(original ? mediaAmount(original.amount_units, original.decimal_places) : ''), [per, setPer] = useState(original ? mediaQuantityInput(original.per_quantity) : ''), [minimum, setMinimum] = useState(original ? mediaQuantityInput(original.minimum_quantity) : '0');
  const [rounding, setRounding] = useState<MediaSchedule['rounding']>(original?.rounding ?? 'HalfEven');
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false);
  const [attempt, setAttempt] = useState<RetailStandardPublication | null>(null); const key = useRef(crypto.randomUUID());
  useEffect(() => {
    if (previous) return;
    const controller = new AbortController();
    void registeredRetailModels(token, controller.signal).then(names => { if (!controller.signal.aborted) setModels(names); }).catch(failure => { if (!controller.signal.aborted) setModelsError(failure instanceof Error ? failure.message : 'Registered models unavailable.'); });
    return () => controller.abort();
  }, [token, previous]);
  const locked = busy || !!attempt || conflict, identityLocked = locked || !!previous;
  async function publish(event: FormEvent) {
    event.preventDefault(); if (busy || conflict) return;
    let input = attempt;
    if (!input) {
      try {
        const note = reason.trim();
        if (!model || !/^[A-Z]{3}$/.test(currency) || !channel.trim() || !resolution.trim() || !meter.trim() || !note || [...note].length > 500 || /[\u0000-\u001f\u007f-\u009f]/.test(note)) throw new Error('Complete the model, currency, exact media dimensions, meter and single-line reason.');
        const schedule: MediaSchedule = { kind: 'media', dimensions: { model, channel: channel.trim(), resolution: resolution.trim(), reference_video: reference }, meter: meter.trim(), decimal_places: places, amount_units: mediaAmountUnits(price, places), per_quantity: mediaQuantity(per, false), minimum_quantity: mediaQuantity(minimum, true), rounding };
        input = { model_alias: model, currency, schedule, expected_version: previous?.version ?? '0', idempotency_key: key.current, reason: note };
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid media selling terms.'); return; }
    }
    setAttempt(input); setBusy(true); setError('');
    try {
      const result = await request<{ data: RetailPublicationResult }>(token, '/api/v1/pricing/standard-prices', 'POST', input);
      if (!result.data?.price_id || !result.data.revision || BigInt(result.data.version) !== BigInt(input.expected_version) + 1n) throw new Error('Publication response could not be confirmed.');
      onSaved();
    } catch (failure) {
      const uncertain = writeMayHaveCommitted(failure);
      if (!uncertain) setConflict(true);
      setError((failure instanceof Error ? failure.message : 'Publication outcome unavailable.') + (uncertain ? ' Keep this form open and retry this exact submission with its original key.' : ' Close and refresh current prices before editing again.'));
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy && (!attempt || conflict)) onClose(); }}><DialogContent className="sm:max-w-3xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{previous ? 'Revise media standard price' : 'Publish media standard price'}</DialogTitle><DialogDescription>Customer selling terms only. Enter agreed dimensions and units; this does not discover model capabilities, qualify a Provider route or enroll a workspace. Existing requests and promotions retain their original terms.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={event => void publish(event)}>
    <div className="space-y-2"><Label>Model</Label>{previous ? <p className="break-words">{model}</p> : <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={locked || !!modelsError} aria-label="Media standard model">{model || 'Choose registered model'}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto"><Input aria-label="Filter registered media models" placeholder="Filter models" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') event.stopPropagation(); }} /><DropdownMenuRadioGroup value={model} onValueChange={value => { setModel(value); setError(''); }}>{models.filter(name => name.toLowerCase().includes(query.trim().toLowerCase())).map(name => <DropdownMenuRadioItem key={name} value={name}>{name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>{!models.length && <p className="p-2 text-sm">No registered shared models loaded.</p>}</DropdownMenuContent></DropdownMenu>}</div>
    {modelsError && <Alert variant="destructive"><AlertDescription>{modelsError}</AlertDescription></Alert>}
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="media-currency">Currency</Label><Input id="media-currency" maxLength={3} value={currency} disabled={identityLocked} onChange={event => { setCurrency(event.target.value); setError(''); }} /></div><div className="space-y-2"><Label htmlFor="media-channel">Channel</Label><Input id="media-channel" value={channel} disabled={identityLocked} onChange={event => { setChannel(event.target.value); setError(''); }} /></div><div className="space-y-2"><Label htmlFor="media-resolution">Resolution</Label><Input id="media-resolution" value={resolution} disabled={identityLocked} onChange={event => { setResolution(event.target.value); setError(''); }} /></div><div className="space-y-2"><Label htmlFor="media-meter">Billing meter</Label><Input id="media-meter" value={meter} disabled={identityLocked} onChange={event => { setMeter(event.target.value); setError(''); }} /></div></div>
    <div className="flex items-center gap-2"><Checkbox id="media-reference" checked={reference} disabled={identityLocked} onCheckedChange={value => setReference(value === true)} /><Label htmlFor="media-reference">Reference video</Label></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="media-price">Selling price in {currency}</Label><Input id="media-price" inputMode="decimal" value={price} disabled={locked} onChange={event => { setPrice(event.target.value); setError(''); }} /></div><div className="space-y-2"><Label>Decimal scale</Label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={locked} aria-label="Media price decimal scale">{places} decimal places<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={String(places)} onValueChange={value => { setPlaces(Number(value)); setError(''); }}>{Array.from({ length: 10 }, (_, n) => <DropdownMenuRadioItem key={n} value={String(n)}>{n} decimal places</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div><div className="space-y-2"><Label htmlFor="media-per">Price per quantity</Label><Input id="media-per" value={per} disabled={locked} onChange={event => { setPer(event.target.value); setError(''); }} /></div><div className="space-y-2"><Label htmlFor="media-minimum">Minimum quantity</Label><Input id="media-minimum" value={minimum} disabled={locked} onChange={event => { setMinimum(event.target.value); setError(''); }} /></div></div>
    <p className="text-sm text-muted-foreground">Quantities accept decimals or fractions such as 1/2 and are stored exactly. Price per quantity must be positive. Minimum zero means no quantity floor; zero price is an explicit selling rate. No currency conversion.</p>
    <div className="space-y-2"><Label>Rounding</Label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={locked} aria-label="Media price rounding">{rounding === 'HalfEven' ? 'Half even' : rounding}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={rounding} onValueChange={value => { setRounding(value as MediaSchedule['rounding']); setError(''); }}><DropdownMenuRadioItem value="Down">Down</DropdownMenuRadioItem><DropdownMenuRadioItem value="Up">Up</DropdownMenuRadioItem><DropdownMenuRadioItem value="HalfEven">Half even</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
    <div className="space-y-2"><Label htmlFor="media-reason">Reason</Label><Input id="media-reason" maxLength={500} value={reason} disabled={locked} onChange={event => { setReason(event.target.value); setError(''); }} /></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy || (!!attempt && !conflict)} onClick={onClose}>Close</Button><Button type="submit" disabled={busy || conflict || !model}>{busy ? 'Publishing…' : attempt ? 'Retry exact publication' : 'Publish media standard'}</Button></div>
  </form></DialogContent></Dialog>;
}
