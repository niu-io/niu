import { PricingHealthNotice, type PricingHealth } from './pricing-health';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { request, writeMayHaveCommitted } from '@/features/vendors/api';
import { SellingSchedule } from './schedule';
import type { RetailPriceRecord, RetailPromotionPage, RetailPromotionRetirement, RetailPublicationResult } from '../../../../../sdks/javascript/src/admin';

type Promotion = RetailPromotionPage['data'][number] & { pricing_health?: PricingHealth };
type Observed = { row: Promotion; asOf: string; version: string };
const at = (seconds: string) => new Date(Number(seconds) * 1000).toLocaleString();
const date = (value: string) => new Date(value).toLocaleString();
const state = (value: Promotion['state']) => value === 'within_period' ? 'Within period' : value === 'scheduled' ? 'Scheduled' : 'Ended';
const endpoint = (price: string) => '/api/v1/pricing/standard-prices/' + encodeURIComponent(price) + '/promotions';

/** Cutoffs are server projections; event pagination never establishes active status. */
export function PromotionsManager({ token, price, onClose, onPublish }: { token: string; price: RetailPriceRecord; onClose: () => void; onPublish: (baseline: RetailPriceRecord) => void }) {
  const [rows, setRows] = useState<Observed[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [failed, setFailed] = useState<string>();
  const [cutoff, setCutoff] = useState<Observed | null>(null), [terms, setTerms] = useState<string | null>(null);
  const [notice, setNotice] = useState(''); const [standard, setStandard] = useState<RetailPriceRecord | null>(null); const active = useRef<AbortController | null>(null);
  async function load(before?: string) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller; setLoading(true); setError(''); setFailed(undefined); let restart = false;
    try {
      const page = await request<RetailPromotionPage>(token, endpoint(price.price_id) + '?limit=50' + (before ? '&before=' + encodeURIComponent(before) : ''), 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (page.standard?.price_id !== price.price_id || page.standard.version !== page.current_version || page.price_id !== price.price_id || !Array.isArray(page.data) || !/^\d+$/.test(page.as_of) || page.next_before === before) throw new Error('Promotion page could not be confirmed. Refresh states.');
      const values = page.data.map(row => ({ row, asOf: page.as_of, version: page.current_version }));
      if (before && rows.some(item => item.version !== page.current_version)) { restart = true; throw new Error('Prices changed while loading. Refresh states before another change.'); }
      setRows(current => before ? [...current, ...values.filter(item => !current.some(old => old.row.revision === item.row.revision))] : values); setCursor(page.next_before); setStandard(page.standard);
    } catch (failure) { if (!controller.signal.aborted) { setFailed(restart ? undefined : before); setError(failure instanceof Error ? failure.message : 'Promotion states unavailable.'); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => active.current?.abort(); }, [token, price.price_id]);
  if (cutoff) return <CutoffEditor token={token} price={price} observed={cutoff} onClose={() => { setCutoff(null); void load(); }} onSaved={() => { setCutoff(null); setNotice('Promotion cutoff saved. Existing request prices are unchanged.'); void load(); }} />;
  const selected = rows.find(item => item.row.revision === terms)?.row;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Promotions</DialogTitle><DialogDescription>{price.model_alias} · {price.currency}. State reflects the returned database observation time. Within period is temporal eligibility; customer-specific rules can override a global rule. It does not authorize spending or qualify supply.</DialogDescription></DialogHeader>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={loading} onClick={() => void load()}>Refresh states</Button><Button disabled={loading || !!error || !standard} onClick={() => { if (standard) onPublish(standard); }}>Publish promotion</Button></div>
    {notice && <p role="status">{notice}</p>}{loading && !rows.length && <p role="status">Loading promotion states…</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" disabled={loading} onClick={() => void load(failed)}>Retry states</Button></AlertDescription></Alert>}
    {!loading && !error && !rows.length && <p>No promotions have been published for this price.</p>}
    {!!rows.length && <Table aria-label="Promotion states"><TableHeader><TableRow>{['Scope', 'State', 'Price checks', 'Period', 'Original price', 'Observed', 'Actions'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(item => <TableRow key={item.row.revision}><TableCell className="w-52 min-w-44 max-w-52 whitespace-normal"><p>{item.row.scope === 'global' ? 'All customers' : item.row.customer_name || 'Customer name unavailable'}</p>{item.row.customer_created_at && <p className="text-xs text-muted-foreground">Created {date(item.row.customer_created_at)}</p>}<p className="text-sm text-muted-foreground break-words">{item.row.reason}</p></TableCell><TableCell><Badge variant="outline">{state(item.row.state)}</Badge></TableCell><TableCell><PricingHealthNotice health={item.row.pricing_health} /></TableCell><TableCell className="whitespace-nowrap"><p>{at(item.row.effective_from)}</p><p>Published end: {at(item.row.effective_until)}</p>{item.row.retirement_effective_until !== null && <><p className="text-xs text-muted-foreground">Cutoff: {at(item.row.retirement_effective_until)}</p>{BigInt(item.row.retirement_effective_until) <= BigInt(item.row.effective_from) && <p className="text-xs text-muted-foreground">Cancelled before start</p>}</>}</TableCell><TableCell className="whitespace-nowrap"><p>Revision {item.row.baseline_version}</p><p className="text-sm text-muted-foreground">{date(item.row.baseline_published_at)}</p></TableCell><TableCell className="whitespace-nowrap">{at(item.asOf)}</TableCell><TableCell><div className="flex flex-col items-start gap-1"><Button variant="outline" onClick={() => setTerms(current => current === item.row.revision ? null : item.row.revision)}>{terms === item.row.revision ? 'Hide terms' : 'View terms'}</Button>{item.row.retirement_effective_until === null && item.row.state !== 'ended' && <Button variant="outline" disabled={loading || !!error} onClick={() => setCutoff(item)}>Set cutoff</Button>}</div></TableCell></TableRow>)}</TableBody></Table>}
    {selected && <section className="space-y-4 border-t pt-4"><p className="font-medium">Original and result terms · {selected.scope === 'global' ? 'All customers' : selected.customer_name || 'Customer name unavailable'}</p><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><p className="font-medium">Original standard · revision {selected.baseline_version}</p><SellingSchedule schedule={selected.original_schedule} currency={price.currency} /></div><div className="space-y-2"><p className="font-medium">Published result</p><SellingSchedule schedule={selected.schedule} currency={price.currency} /></div></div><p className="text-sm text-muted-foreground">Original published end: {at(selected.effective_until)}. A cutoff changes future eligibility; it never reprices an admitted request.</p></section>}
    {cursor && <Button variant="outline" disabled={loading || !!error} onClick={() => void load(cursor)}>Older promotions</Button>}<div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
  </DialogContent></Dialog>;
}
function CutoffEditor({ token, price, observed, onClose, onSaved }: { token: string; price: RetailPriceRecord; observed: Observed; onClose: () => void; onSaved: () => void }) {
  const [until, setUntil] = useState(() => { const value = new Date(Number(observed.asOf) * 1000); value.setMinutes(value.getMinutes() - value.getTimezoneOffset()); return value.toISOString().slice(0, 19); });
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false);
  const [attempt, setAttempt] = useState<RetailPromotionRetirement | null>(null); const key = useRef(crypto.randomUUID()); const locked = busy || !!attempt || conflict;
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || conflict) return;
    let input = attempt;
    if (!input) {
      try {
        const seconds = Math.floor(Date.parse(until) / 1000), note = reason.trim();
        if (!Number.isSafeInteger(seconds) || seconds < 0 || BigInt(seconds) > BigInt(observed.row.effective_until)) throw new Error('Choose a valid cutoff no later than the original published end.');
        if (!note || [...note].length > 500 || /[\u0000-\u001f\u007f-\u009f]/.test(note)) throw new Error('Enter a single-line reason of up to 500 characters.');
        input = { effective_until: String(seconds), expected_version: observed.version, idempotency_key: key.current, reason: note };
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid cutoff.'); return; }
    }
    setAttempt(input); setBusy(true); setError('');
    try {
      const result = await request<{ data: RetailPublicationResult }>(token, endpoint(price.price_id) + '/' + encodeURIComponent(observed.row.revision) + '/retire', 'POST', input);
      if (result.data?.price_id !== price.price_id || !result.data.revision || BigInt(result.data.version) !== BigInt(input.expected_version) + 1n) throw new Error('Cutoff response could not be confirmed.');
      onSaved();
    } catch (failure) { const uncertain = writeMayHaveCommitted(failure); if (!uncertain) setConflict(true); setError((failure instanceof Error ? failure.message : 'Cutoff outcome unavailable.') + (uncertain ? ' Keep this form open and retry its exact original submission.' : ' Close and refresh states before another change.')); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy && (!attempt || conflict)) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Set promotion cutoff</DialogTitle><DialogDescription>{price.model_alias} · {price.currency} · {observed.row.scope === 'global' ? 'All customers' : observed.row.customer_name || 'Customer name unavailable'}. Existing request prices remain unchanged.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={event => void save(event)}><p className="text-sm text-muted-foreground">Original period: {at(observed.row.effective_from)} – {at(observed.row.effective_until)}. A cutoff before the start cancels a scheduled promotion. Only one cutoff can be recorded.</p><div className="space-y-2"><Label htmlFor="promotion-cutoff">Eligibility ends</Label><Input id="promotion-cutoff" type="datetime-local" step={1} value={until} disabled={locked} onChange={event => { setUntil(event.target.value); setError(''); }} /><p className="text-sm text-muted-foreground">Browser local timezone. Default uses the last database observation time.</p></div><div className="space-y-2"><Label htmlFor="cutoff-reason">Reason</Label><Input id="cutoff-reason" maxLength={500} value={reason} disabled={locked} onChange={event => { setReason(event.target.value); setError(''); }} /></div>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy || (!!attempt && !conflict)} onClick={onClose}>Close</Button><Button type="submit" disabled={busy || conflict}>{busy ? 'Saving…' : attempt ? 'Retry exact cutoff' : 'Save cutoff'}</Button></div></form></DialogContent></Dialog>;
}
