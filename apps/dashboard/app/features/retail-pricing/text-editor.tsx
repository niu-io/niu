import { useLocale as useUILocale } from '@/shell/ui-locale';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconAlertTriangle, IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProviderRequestError, request, writeMayHaveCommitted } from '@/features/providers/api';
import { amountFromNanos, amountToNanos } from '@/lib/money';
import { lookupProviderDefaultTextSchedule, registeredRetailModels } from './api';
import type { RetailPriceRecord, RetailPublicationResult, RetailStandardPublication } from '@niu-io/sdk/admin';

import { TextRateBand } from './text-rate-band';
import { tokenBand, ratesFrom, checkedRates, type Rates, type Tier } from './text-terms';

/** Full text selling terms; optional categories stay distinct from explicit zero. */
export function TextStandardEditor({ token, previous, initialModel = '', open = true, onCloseAutoFocus, onClose, onSaved }: { token: string; previous: RetailPriceRecord | null; initialModel?: string; open?: boolean; onCloseAutoFocus?: (event: Event) => void; onClose: (pending: boolean) => void; onSaved: () => void }) {
  const { t: uiT } = useUILocale();
  const original = previous?.schedule.kind === 'text' ? previous.schedule : undefined;
  const [model, setModel] = useState(previous?.model_alias ?? initialModel);
  const {currency:platformCurrency}=usePlatformCurrency();
  const currency=previous?.currency ?? platformCurrency;
  const [models, setModels] = useState<string[]>([]), [modelsError, setModelsError] = useState(''), [query, setQuery] = useState('');
  const [rates, setRates] = useState<Rates>(() => ratesFrom(original));
  const [tiers, setTiers] = useState<Tier[]>(() => (original?.context_tiers ?? []).map(tier => ({ minimum_input_tokens: tier.minimum_input_tokens, rates: ratesFrom(tier) })));
  const [fee, setFee] = useState(amountFromNanos(original?.request_fee_nanos ?? '0')), [minimum, setMinimum] = useState(amountFromNanos(original?.minimum_charge_nanos ?? '0'));
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false);
  const [zeroConfirmed, setZeroConfirmed] = useState(false);
  const [attempt, setAttempt] = useState<RetailStandardPublication | null>(null);
  const key = useRef(crypto.randomUUID());
  const isZeroRateText = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return false;
    try { return amountToNanos(trimmed, true) === '0'; } catch { return false; }
  };
  const hasZeroBaseRate = isZeroRateText(rates.prompt_rate) || isZeroRateText(rates.completion_rate);
  useEffect(() => { setZeroConfirmed(false); }, [rates.prompt_rate, rates.completion_rate]);
  useEffect(() => {
    if (previous) return;
    const controller = new AbortController();
    void registeredRetailModels(token, controller.signal)
      .then(names => { if (!controller.signal.aborted) setModels(names); })
      .catch(failure => { if (!controller.signal.aborted) setModelsError(failure instanceof Error ? failure.message : 'Registered models unavailable.'); });
    return () => controller.abort();
  }, [token, previous]);
  useEffect(() => {
    if (previous || !model || !/^[A-Z]{3}$/.test(currency)) return;
    const controller = new AbortController();
    void lookupProviderDefaultTextSchedule(token, model, currency, controller.signal).then(schedule => {
      if (controller.signal.aborted || !schedule) return;
      setRates(current => {
        if (current.prompt_rate.trim() || current.completion_rate.trim()) return current;
        return ratesFrom(schedule);
      });
      setTiers(current => {
        if (current.length > 0 || !schedule.context_tiers.length) return current;
        return schedule.context_tiers.map(tier => ({
          minimum_input_tokens: tier.minimum_input_tokens,
          rates: ratesFrom(tier),
        }));
      });
    });
    return () => controller.abort();
  }, [token, previous, model, currency]);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  function requestClose() {
    if (busy) return;
    if (dirty && !attempt && !conflict) setConfirmDiscard(true);
    else onClose(!!attempt && !conflict);
  }
  const locked = busy || !!attempt || conflict;
  async function publish(event: FormEvent) {
    event.preventDefault(); if (busy || conflict) return;
    let input = attempt;
    if (!input) {
      try {
        const note = reason.trim();
        if (!model || !/^[A-Z]{3}$/.test(currency) || [...note].length > 500 || /[\u0000-\u001f\u007f-\u009f]/.test(note)) throw new Error('Choose a model, uppercase three-letter currency and an optional single-line note of up to 500 characters.');
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
      const result = await request<{ data: RetailPublicationResult }>(token, '/api/v1/admin/pricing/standard-prices', 'POST', input);
      if (!result.data?.price_id || !result.data.revision || typeof result.data.version !== 'string' || !/^\d+$/.test(result.data.version) || BigInt(result.data.version) !== BigInt(input.expected_version) + 1n) throw new Error('Publication response could not be confirmed.');
      onSaved();
    } catch (failure) {
      const uncertain = writeMayHaveCommitted(failure) || !(failure instanceof Error) || failure.message === 'Publication response could not be confirmed.';
      if (!uncertain) {
        if (failure instanceof ProviderRequestError && failure.status === 409) setConflict(true);
        else { setAttempt(null); key.current = crypto.randomUUID(); }
      }
      setError((failure instanceof Error ? failure.message : 'Publication outcome unavailable.') + (uncertain ? ' Retry this submission to confirm the original outcome before starting another publication.' : failure instanceof ProviderRequestError && failure.status === 409 ? ' Close and refresh current prices before editing again.' : ' Correct the fields and submit again. Your draft has been preserved.'));
    } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!value) requestClose(); }}><DialogContent aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus} className="w-[calc(100vw-2rem)] sm:max-w-3xl"><DialogHeader><DialogTitle>{previous ? uiT("Revise text standard price") : uiT("Publish text standard price")}</DialogTitle></DialogHeader><form onChange={() => setDirty(true)} className="space-y-4" onSubmit={event => void publish(event)}>
    <div className="space-y-2"><Label>{uiT("Model")}</Label>{previous ? <p className="break-words">{model}</p> : <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={locked || !!modelsError} aria-label={uiT("Standard price model")}>{model || uiT("Choose registered model")}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto"><Input aria-label={uiT("Filter registered models")} placeholder={uiT("Filter models")} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') event.stopPropagation(); }} /><DropdownMenuRadioGroup value={model} onValueChange={value => { setDirty(true); setModel(value); }}>{models.filter(name => name.toLowerCase().includes(query.trim().toLowerCase())).map(name => <DropdownMenuRadioItem key={name} value={name}>{name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>{!models.length && <p className="p-2 text-sm">{uiT("No registered shared models loaded.")}</p>}</DropdownMenuContent></DropdownMenu>}</div>
    {modelsError && <Alert variant="destructive"><AlertDescription>{uiT(modelsError)}</AlertDescription></Alert>}
    <p className="text-sm text-muted-foreground">{uiT("Currency:")}{" "}{currency || uiT("configure in Admin")}</p>
    <h3 className="font-medium">{uiT("Base rates", "基础单价")}{tiers.length > 0 && ' · ' + tokenBand('0', tiers[0].minimum_input_tokens) + ' ' + uiT('Tokens')}</h3>
    <TextRateBand id="standard" rates={rates} previous={original ? ratesFrom(original) : undefined}
      disabled={locked} onChange={(field, value) => setRates(current => ({ ...current, [field]: value }))} />

    <div className="space-y-4">
      {tiers.map((tier, index) => {
        const savedTier = original?.context_tiers.find(saved => saved.minimum_input_tokens === tier.minimum_input_tokens);
        return <section key={index} className="space-y-3 border-t pt-4">
          <h3 className="font-medium">{uiT("Input tokens", "输入 Token")} · {tokenBand(tier.minimum_input_tokens, tiers[index + 1]?.minimum_input_tokens)}</h3>
          <div className="flex items-end gap-2">
            <div className="grid gap-2">
              <Label htmlFor={'tier-threshold-' + index}>{uiT("Minimum input tokens")}</Label>
              <Input id={'tier-threshold-' + index} inputMode="numeric" disabled={locked} value={tier.minimum_input_tokens}
                onChange={event => setTiers(current => current.map((item, i) => i === index ? { ...item, minimum_input_tokens: event.target.value } : item))} />
            </div>
            <Button type="button" variant="outline" disabled={locked} onClick={() => {
              setDirty(true);
              setTiers(current => current.filter((_, i) => i !== index));
            }}>{uiT("Remove tier")} {index + 1}</Button>
          </div>
          <TextRateBand id={'tier-' + index} rates={tier.rates} previous={savedTier ? ratesFrom(savedTier) : undefined} disabled={locked}
            onChange={(field, value) => setTiers(current => current.map((item, i) => i === index ? { ...item, rates: { ...item.rates, [field]: value } } : item))} />
        </section>;
      })}
      <Button type="button" variant="outline" disabled={locked || tiers.length >= 128} onClick={() => {
        setDirty(true);
        setTiers(current => [...current, { minimum_input_tokens: '', rates: ratesFrom() }]);
      }}>{uiT("Add tier")}</Button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="standard-fee">{uiT("Request fee")}</Label><Input id="standard-fee" value={fee} disabled={locked} inputMode="decimal" onChange={event => setFee(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="standard-minimum">{uiT("Minimum charge")}</Label><Input id="standard-minimum" value={minimum} disabled={locked} inputMode="decimal" onChange={event => setMinimum(event.target.value)} /></div></div>
    <div className="space-y-2"><Label htmlFor="standard-reason">{uiT("Note (optional)")}</Label><Input id="standard-reason" value={reason} maxLength={500} disabled={locked} onChange={event => setReason(event.target.value)} /></div>
    {hasZeroBaseRate && (
      <Alert variant="destructive">
        <IconAlertTriangle size={16} aria-hidden="true" />
        <AlertDescription className="space-y-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id="standard-confirm-zero"
              checked={zeroConfirmed}
              disabled={locked}
              onCheckedChange={checked => setZeroConfirmed(checked === true)}
            />
            <Label htmlFor="standard-confirm-zero" className="text-sm font-medium text-foreground">
              {uiT("Confirm zero-priced base rates", "确认将上述零价基础费率按免费发布")}
            </Label>
          </div>
        </AlertDescription>
      </Alert>
    )}
    {error && <Alert variant="destructive"><AlertDescription>{uiT(error)}</AlertDescription></Alert>}
    {confirmDiscard && <Alert><AlertDescription className="flex flex-wrap items-center gap-2">
      {uiT("Discard unpublished changes?", "放弃未发布的修改？")}
      <Button type="button" onClick={() => setConfirmDiscard(false)}>{uiT("Keep editing", "继续编辑")}</Button>
      <Button type="button" variant="outline" onClick={() => onClose(false)}>{uiT("Discard changes", "放弃修改")}</Button>
    </AlertDescription></Alert>}
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={requestClose}>{uiT("Close")}</Button><Button type="submit" disabled={busy || conflict || !model || (hasZeroBaseRate && !zeroConfirmed)}>{busy ? uiT("Publishing…") : attempt ? uiT("Retry exact publication") : uiT("Publish standard price")}</Button></div>
  </form></DialogContent></Dialog>;
}
