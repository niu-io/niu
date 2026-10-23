import { usePlatformCurrency } from '@/app/platform-currency';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { request, writeMayHaveCommitted } from '@/features/providers/api';
import { mediaAmount, mediaAmountUnits, mediaQuantity, mediaQuantityInput, mediaPriceExample } from '@/lib/media-price';
import { registeredRetailModelChoices, type RetailModelChoice } from './api';
import { money } from '@/lib/money';
import { Link } from 'react-router';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import type { RetailPriceRecord, RetailPublicationResult, RetailSchedule, RetailStandardPublication } from '@niu-io/sdk/admin';

type MediaSchedule = Extract<RetailSchedule, { kind: 'media' }>;
/** Explicit media dimensions and metering; price configuration is not qualification. */
export function MediaStandardEditor({ token, previous, onClose, onSaved }: { token: string; previous: RetailPriceRecord | null; onClose: () => void; onSaved: () => void }) {
  const original = previous?.schedule.kind === 'media' ? previous.schedule : undefined;
  const [model, setModel] = useState(previous?.model_alias ?? '');
  const {currency:platformCurrency}=usePlatformCurrency();
  const currency=previous?.currency ?? platformCurrency;
  const [modelsRevision, setModelsRevision] = useState(0);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [models, setModels] = useState<RetailModelChoice[]>([]), [modelsError, setModelsError] = useState(''), [query, setQuery] = useState('');
  const [channel, setChannel] = useState(original?.dimensions.channel ?? ''), [resolution, setResolution] = useState(original?.dimensions.resolution ?? ''), [reference, setReference] = useState(original?.dimensions.reference_video ?? false);
  const [meter, setMeter] = useState(original?.meter ?? ''), [places, setPlaces] = useState(original?.decimal_places ?? 9);
  const [price, setPrice] = useState(original ? mediaAmount(original.amount_units, original.decimal_places) : ''), [per, setPer] = useState(original ? mediaQuantityInput(original.per_quantity) : '1'), [minimum, setMinimum] = useState(original ? mediaQuantityInput(original.minimum_quantity) : '0');
  const [rounding, setRounding] = useState<MediaSchedule['rounding']>(original?.rounding ?? 'HalfEven');
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false);
  const [attempt, setAttempt] = useState<RetailStandardPublication | null>(null); const key = useRef(crypto.randomUUID());
  useEffect(() => {
    if (previous) return;
    const controller = new AbortController();
    setModelsLoaded(false); setModelsError('');
    void registeredRetailModelChoices(token, controller.signal).then(choices => { if (!controller.signal.aborted) setModels(choices.filter(choice => choice.media)); }).catch(failure => { if (!controller.signal.aborted) setModelsError(failure instanceof Error ? failure.message : 'Registered models unavailable.'); }).finally(()=>{if(!controller.signal.aborted)setModelsLoaded(true);});
    return () => controller.abort();
  }, [token, previous, modelsRevision]);
  const selected = models.find(item => item.model_alias === model)?.media;
  const unitLabel = meter === 'video_tokens' ? 'video tokens' : meter === 'seconds' ? 'seconds' : meter;
  const exampleQuantity = meter === 'seconds' ? '10' : '1000000';
  let example = '';
  try { if (meter && price) example = mediaPriceExample(price, places, per, minimum, exampleQuantity, rounding); } catch { /* Invalid draft fields have no price example. */ }
  const locked = busy || !!attempt || conflict, identityLocked = locked || !!previous;
  async function publish(event: FormEvent) {
    event.preventDefault(); if (busy || conflict) return;
    let input = attempt;
    if (!input) {
      try {
        if (!previous && (!selected || !selected.resolutions.includes(resolution) || (reference && !selected.reference_video) || channel !== selected.channel || meter !== selected.meter)) throw new Error('Choose a supported media specification.');
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
  return <Dialog open onOpenChange={open => { if (!open && !busy && (!attempt || conflict)) onClose(); }}><DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{previous ? 'Revise media standard price' : 'Publish media standard price'}</DialogTitle><DialogDescription>Set customer prices for the selected media specifications and units across workspaces. Existing requests and promotions keep their original prices. Model availability and access are managed separately.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={event => void publish(event)}>
    <div className="space-y-2"><Label>Model</Label>{previous ? <p className="break-words">{model}</p> : <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={locked || !modelsLoaded || !!modelsError} aria-label="Media standard model">{model || (modelsLoaded ? 'Choose media model' : 'Loading media models…')}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto"><Input aria-label="Filter registered media models" placeholder="Filter models" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') event.stopPropagation(); }} /><DropdownMenuRadioGroup value={model} onValueChange={value => { const choice=models.find(item=>item.model_alias===value)?.media; setModel(value);setChannel(choice?.channel ?? '');setMeter(choice?.meter ?? '');setResolution(choice?.resolutions.length===1?choice.resolutions[0]:'');setReference(false);setError(''); }}>{models.filter(item => item.model_alias.toLowerCase().includes(query.trim().toLowerCase())).map(item => <DropdownMenuRadioItem key={item.model_alias} value={item.model_alias}>{item.model_alias}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>{!models.length && <p className="p-2 text-sm">No configured media models available.</p>}</DropdownMenuContent></DropdownMenu>}</div>
    {modelsError && <Alert variant="destructive"><AlertDescription>{modelsError}</AlertDescription></Alert>}
    {!previous && modelsLoaded && !models.length && !modelsError && <Alert><AlertDescription>Media pricing requires configured output specifications. <Link className="underline" to="/admin/providers" target="_blank" rel="noopener noreferrer">Configure a Provider model (opens in a new tab)</Link>, then refresh model choices here.</AlertDescription></Alert>}
    <p className="text-sm text-muted-foreground">Prices in {currency || 'the platform currency (configure in Admin)'}{unitLabel ? ` per ${unitLabel}` : ''}.</p>
    <div className="space-y-2"><Label>Resolution</Label>{previous ? <p>{resolution}</p> : <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={!selected || identityLocked} aria-label="Media resolution">{resolution || 'Choose resolution'}<IconChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={resolution} onValueChange={setResolution}>{selected?.resolutions.map(value=><DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}</div>
    {!previous && <Button type="button" variant="outline" disabled={!modelsLoaded || locked} onClick={() => setModelsRevision(value => value + 1)}>Refresh model choices</Button>}
    {(previous || selected?.reference_video) && <div className="flex items-center gap-2"><Checkbox id="media-reference" checked={reference} disabled={identityLocked} onCheckedChange={value => setReference(value === true)} /><Label htmlFor="media-reference">With reference video</Label></div>}
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="media-price">Selling price in {currency}</Label><Input id="media-price" inputMode="decimal" value={price} disabled={locked} onChange={event => { setPrice(event.target.value); setError(''); }} /></div><div className="space-y-2"><Label htmlFor="media-per">Price per quantity</Label><Input id="media-per" value={per} disabled={locked} onChange={event => { setPer(event.target.value); setError(''); }} /></div><div className="space-y-2"><Label htmlFor="media-minimum">Minimum quantity</Label><Input id="media-minimum" value={minimum} disabled={locked} onChange={event => { setMinimum(event.target.value); setError(''); }} /></div></div>
    <p className="text-sm text-muted-foreground">Set the charge for the number of billing units above. A minimum of zero applies no minimum quantity. Existing requests keep the price used when they started.</p>
    {example && <p className="text-sm" role="status">Example charge for {meter === 'seconds' ? '10 seconds' : `1,000,000 ${unitLabel}`}:  {money((BigInt(mediaAmountUnits(example, places)) * 10n ** BigInt(9 - places)).toString(), currency)}. Includes the minimum quantity and selected rounding; excludes promotions.</p>}
    <Collapsible><CollapsibleTrigger asChild><Button type="button" variant="ghost">Advanced calculation settings<IconChevronDown size={16}/></Button></CollapsibleTrigger><CollapsibleContent className="space-y-4 pt-3"><div className="space-y-2"><Label>Decimal scale</Label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={locked} aria-label="Media price decimal scale">{places} decimal places<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={String(places)} onValueChange={value => { setPlaces(Number(value)); setError(''); }}>{Array.from({ length: 10 }, (_, n) => <DropdownMenuRadioItem key={n} value={String(n)}>{n} decimal places</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>    <div className="space-y-2"><Label>Rounding</Label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={locked} aria-label="Media price rounding">{rounding === 'HalfEven' ? 'Half even' : rounding}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={rounding} onValueChange={value => { setRounding(value as MediaSchedule['rounding']); setError(''); }}><DropdownMenuRadioItem value="Down">Down</DropdownMenuRadioItem><DropdownMenuRadioItem value="Up">Up</DropdownMenuRadioItem><DropdownMenuRadioItem value="HalfEven">Half even</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div></CollapsibleContent></Collapsible>
    <div className="space-y-2"><Label htmlFor="media-reason">Reason</Label><Input id="media-reason" maxLength={500} value={reason} disabled={locked} onChange={event => { setReason(event.target.value); setError(''); }} /></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy || (!!attempt && !conflict)} onClick={onClose}>Close</Button><Button type="submit" disabled={busy || conflict || !model || (!previous && (!selected || !resolution))}>{busy ? 'Publishing…' : attempt ? 'Retry exact publication' : 'Publish media standard'}</Button></div>
  </form></DialogContent></Dialog>;
}
