import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { request, writeMayHaveCommitted } from '@/features/vendors/api';
import { amountFromNanos, amountToNanos } from '@/lib/money';
import { registeredRetailModels } from './api';
import type { RetailPriceRecord, RetailPublicationResult, RetailStandardPublication } from '../../../../../sdks/javascript/src/admin';

import { categories, ratesFrom, checkedRates, type Rates, type Tier } from './text-terms';

/** Full text selling terms; optional categories stay distinct from explicit zero. */
export function TextStandardEditor({ token, previous, onClose, onSaved }: { token: string; previous: RetailPriceRecord | null; onClose: () => void; onSaved: () => void }) {
  const original = previous?.schedule.kind === 'text' ? previous.schedule : undefined;
  const [model, setModel] = useState(previous?.model_alias ?? ''), [currency, setCurrency] = useState(previous?.currency ?? 'USD');
  const [models, setModels] = useState<string[]>([]), [modelsError, setModelsError] = useState(''), [query, setQuery] = useState('');
  const [rates, setRates] = useState<Rates>(() => ratesFrom(original));
  const [tiers, setTiers] = useState<Tier[]>(() => (original?.context_tiers ?? []).map(tier => ({ minimum_input_tokens: tier.minimum_input_tokens, rates: ratesFrom(tier) })));
  const [fee, setFee] = useState(amountFromNanos(original?.request_fee_nanos ?? '0')), [minimum, setMinimum] = useState(amountFromNanos(original?.minimum_charge_nanos ?? '0'));
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false);
  const [attempt, setAttempt] = useState<RetailStandardPublication | null>(null);
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    if (previous) return;
    const controller = new AbortController();
    void registeredRetailModels(token, controller.signal)
      .then(names => { if (!controller.signal.aborted) setModels(names); })
      .catch(failure => { if (!controller.signal.aborted) setModelsError(failure instanceof Error ? failure.message : 'Registered models unavailable.'); });
    return () => controller.abort();
  }, [token, previous]);
  const locked = busy || !!attempt || conflict;
  async function publish(event: FormEvent) {
    event.preventDefault(); if (busy || conflict) return;
    let input = attempt;
    if (!input) {
      try {
        const note = reason.trim();
        if (!model || !/^[A-Z]{3}$/.test(currency) || !note || [...note].length > 500 || /[\u0000-\u001f\u007f-\u009f]/.test(note)) throw new Error('Choose a model, uppercase three-letter currency and a single-line reason of up to 500 characters.');
        let last = -1n;
        const context_tiers = tiers.map(tier => {
          if (!/^\d+$/.test(tier.minimum_input_tokens) || BigInt(tier.minimum_input_tokens) <= last || BigInt(tier.minimum_input_tokens) > 9_223_372_036_854_775_807n) throw new Error('Context thresholds must be increasing nonnegative integer token counts.');
          last = BigInt(tier.minimum_input_tokens);
          return { minimum_input_tokens: last.toString(), ...checkedRates(tier.rates) };
        });
        input = { model_alias: model, currency, schedule: { kind: 'text', ...checkedRates(rates), request_fee_nanos: amountToNanos(fee, true), minimum_charge_nanos: amountToNanos(minimum, true), context_tiers }, expected_version: previous?.version ?? '0', idempotency_key: key.current, reason: note };
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid selling terms.'); return; }
    }
    setAttempt(input); setBusy(true); setError('');
    try {
      const result = await request<{ data: RetailPublicationResult }>(token, '/api/v1/pricing/standard-prices', 'POST', input);
      if (!result.data?.price_id || !result.data.revision || BigInt(result.data.version) !== BigInt(input.expected_version) + 1n) throw new Error('Publication response could not be confirmed.');
      onSaved();
    } catch (failure) {
      const uncertain = writeMayHaveCommitted(failure) || !(failure instanceof Error) || failure.message === 'Publication response could not be confirmed.';
      if (!uncertain) setConflict(true);
      setError((failure instanceof Error ? failure.message : 'Publication outcome unavailable.') + (uncertain ? ' Keep this form open and retry this exact submission with its original key before starting another publication.' : ' Close and refresh current prices before editing again.'));
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy && (!attempt || conflict)) onClose(); }}><DialogContent className="sm:max-w-3xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{previous ? 'Revise text standard price' : 'Publish text standard price'}</DialogTitle><DialogDescription>Customer selling terms in {currency}. Existing requests retain their pinned prices; existing finite promotions retain their original terms. Publishing does not qualify supply or enroll a workspace.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={event => void publish(event)}>
    <div className="space-y-2"><Label>Model</Label>{previous ? <p className="break-words">{model}</p> : <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={locked || !!modelsError} aria-label="Standard price model">{model || 'Choose registered model'}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto"><Input aria-label="Filter registered models" placeholder="Filter models" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') event.stopPropagation(); }} /><DropdownMenuRadioGroup value={model} onValueChange={setModel}>{models.filter(name => name.toLowerCase().includes(query.trim().toLowerCase())).map(name => <DropdownMenuRadioItem key={name} value={name}>{name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>{!models.length && <p className="p-2 text-sm">No registered shared models loaded.</p>}</DropdownMenuContent></DropdownMenu>}</div>
    {modelsError && <Alert variant="destructive"><AlertDescription>{modelsError}</AlertDescription></Alert>}
    <div className="space-y-2"><Label htmlFor="standard-currency">Currency</Label><Input id="standard-currency" value={currency} disabled={locked || !!previous} maxLength={3} onChange={event => setCurrency(event.target.value)} /><p className="text-sm text-muted-foreground">No currency conversion. Disabled registered models may be priced before supply is qualified.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">{categories.map(([field, label]) => <div key={field} className="space-y-2"><Label htmlFor={'standard-' + field}>{label}</Label><Input id={'standard-' + field} inputMode="decimal" value={rates[field]} disabled={locked} onChange={event => setRates(current => ({ ...current, [field]: event.target.value }))} /></div>)}</div><p className="text-sm text-muted-foreground">Input and output are required. Optional blank categories use ordinary pricing; zero is an explicit rate.</p>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="standard-fee">Request fee</Label><Input id="standard-fee" value={fee} disabled={locked} inputMode="decimal" onChange={event => setFee(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="standard-minimum">Minimum charge</Label><Input id="standard-minimum" value={minimum} disabled={locked} inputMode="decimal" onChange={event => setMinimum(event.target.value)} /></div></div>
    <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">Context tiers</p><Button type="button" variant="outline" disabled={locked || tiers.length >= 128} onClick={() => setTiers(current => [...current, { minimum_input_tokens: '', rates: ratesFrom() }])}>Add tier</Button></div>{tiers.map((tier, index) => <section key={index} className="space-y-3 border-b pb-4"><div className="flex flex-wrap items-end gap-2"><div className="space-y-2"><Label htmlFor={'tier-threshold-' + index}>Minimum input tokens</Label><Input id={'tier-threshold-' + index} inputMode="numeric" disabled={locked} value={tier.minimum_input_tokens} onChange={event => setTiers(current => current.map((value, i) => i === index ? { ...value, minimum_input_tokens: event.target.value } : value))} /></div><Button type="button" variant="outline" disabled={locked} onClick={() => setTiers(current => current.filter((_, i) => i !== index))}>Remove tier {index + 1}</Button></div><div className="grid gap-4 sm:grid-cols-2">{categories.map(([field, label]) => <div key={field} className="space-y-2"><Label htmlFor={`tier-${index}-${field}`}>{label}</Label><Input id={`tier-${index}-${field}`} inputMode="decimal" value={tier.rates[field]} disabled={locked} onChange={event => setTiers(current => current.map((value, i) => i === index ? { ...value, rates: { ...value.rates, [field]: event.target.value } } : value))} /></div>)}</div></section>)}</div>
    <div className="space-y-2"><Label htmlFor="standard-reason">Reason</Label><Input id="standard-reason" value={reason} maxLength={500} disabled={locked} onChange={event => setReason(event.target.value)} /></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy || (!!attempt && !conflict)} onClick={onClose}>Close</Button><Button type="submit" disabled={busy || conflict || !model}>{busy ? 'Publishing…' : attempt ? 'Retry exact publication' : 'Publish standard price'}</Button></div>
  </form></DialogContent></Dialog>;
}
