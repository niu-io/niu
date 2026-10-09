import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { request } from '@/features/vendors/api';
import type { SupplierMediaRateRecord, CustomerMediaRateRecord } from '../../../../../sdks/javascript/src/admin';
import MediaRatePublisher from './MediaRatePublisher';

type RateRecord = SupplierMediaRateRecord | CustomerMediaRateRecord;
type RatePage = { data: RateRecord[]; has_more: boolean; next_after: string | null };

function exactAmount(units: string, places: number) {
  const amount = BigInt(units);
  const scale = 10n ** BigInt(places);
  const fraction = (amount % scale).toString().padStart(places, '0').replace(/0+$/, '');
  return `${amount / scale}${fraction ? `.${fraction}` : ''}`;
}

function quantity(value: { numerator: string; denominator: string }) {
  const numerator = BigInt(value.numerator).toLocaleString();
  return value.denominator === '1' ? numerator : `${numerator}/${BigInt(value.denominator).toLocaleString()}`;
}

function date(seconds: string | null) {
  if (seconds === null) return 'No end date';
  const value = new Date(Number(seconds) * 1000);
  return Number.isNaN(value.getTime()) ? 'Date unavailable' : value.toLocaleString();
}

function cutoff(record: SupplierMediaRateRecord) {
  const end = record.card.tariff.effective_until;
  const retired = record.retirement_effective_until;
  return end === null ? retired : retired === null ? end : BigInt(end) < BigInt(retired) ? end : retired;
}

function period(record: SupplierMediaRateRecord, now: bigint) {
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
export default function MediaRateHistory({ token, supplier, organization, canConfigure = true }: { token: string; canConfigure?: boolean } & ({ supplier: string; organization?: never } | { organization: string; supplier?: never })) {
  const customer = organization !== undefined;
  const [records, setRecords] = useState<RateRecord[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<RateRecord | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [end, setEnd] = useState(localDateNow);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [notice, setNotice] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [replacement, setReplacement] = useState<RateRecord | undefined>();
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  const endpoint = customer ? `/admin/v1/organizations/${encodeURIComponent(organization)}/billing/media-rates` : `/admin/v1/providers/${encodeURIComponent(supplier!)}/media-rates`;

  useEffect(() => {
    const timer = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void request<RatePage>(token, `${endpoint}?limit=50`, 'GET', undefined, controller.signal)
      .then(page => {
        if (controller.signal.aborted) return;
        setRecords(page.data);
        setNext(page.has_more ? page.next_after : null);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error && !(reason instanceof TypeError) ? reason.message : 'Media rates could not be loaded. Check your connection and retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, endpoint, revision]);

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
      setNotice('Rate end date saved. Existing jobs keep their original price.');
      setRevision(value => value + 1);
    } catch (reason) {
      setDialogError(reason instanceof Error ? reason.message : 'Rate end date could not be saved.');
    } finally { setBusy(false); }
  }

  return <>
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 pb-4"><p className="max-w-xl text-sm text-muted-foreground">{customer ? 'Customer prices by model and specification.' : 'Supplier purchase rates by model and specification. These are separate from customer selling prices.'}</p><Button variant="outline" disabled={!canConfigure} onClick={() => { setReplacement(undefined); setPublishing(true); }}>{customer ? 'Publish selling rate' : 'Publish media rate'}</Button></div>
    {notice && <p role="status" className="px-6 pb-4 text-sm">{notice}</p>}
    {error && <div role="alert" className="px-6 pb-4 text-sm">{error} <Button variant="ghost" size="sm" disabled={loading} onClick={() => records.length && next ? void more() : setRevision(value => value + 1)}>Retry</Button></div>}
    {loading && !records.length ? <p role="status" className="px-6 pb-4">Loading media rates…</p> : !error && !records.length ?
      <div className="provider-empty-state"><strong>{customer ? 'No media selling rates' : 'No media purchase rates'}</strong><span>{customer ? 'Publish a customer price and reviewed liability bound for a qualified video model.' : 'Publish an agreed rate for a qualified media model before customer-funded generation.'}</span></div> : records.length > 0 && <>
      <div className="table-wrap"><Table className="provider-ledger">
        <TableHeader><TableRow><TableHead>Model / specification</TableHead><TableHead>{customer ? 'Selling rate' : 'Purchase rate'}</TableHead><TableHead>Effective period</TableHead>{!customer && <TableHead>Period status</TableHead>}<TableHead className="supplier-offer-actions"><span className="sr-only">Details</span></TableHead></TableRow></TableHeader>
        <TableBody>{records.map(record => {
          const tariff = record.card.tariff;
          const dimensions = tariff.dimensions;
          return <TableRow key={record.card.revision}>
            <TableCell><strong>{dimensions.model}</strong><div className="text-sm text-muted-foreground">{dimensions.resolution} · {dimensions.reference_video ? 'Video reference' : 'No video reference'}</div></TableCell>
            <TableCell>{tariff.currency} {exactAmount(tariff.amount_units, tariff.decimal_places)}<div className="text-sm text-muted-foreground">per {quantity(tariff.per_quantity)} {tariff.meter.replaceAll('_', ' ')}</div></TableCell>
            <TableCell>{date(tariff.effective_from)}<div className="text-sm text-muted-foreground">{date(cutoff(record))}</div>{customer && <Badge variant="secondary">{period(record, now)}</Badge>}</TableCell>
            {!customer && <TableCell><Badge variant="secondary">{period(record, now)}</Badge></TableCell>}
            <TableCell className="supplier-offer-actions"><Button variant="ghost" size="sm" onClick={() => { setSelected(record); setRetiring(false); setDialogError(''); }}>View rate<span className="sr-only"> for {dimensions.model}</span></Button></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></div>
      {next && <div className="px-6 py-4"><Button variant="outline" disabled={loading} onClick={() => void more()}>{loading ? 'Loading…' : 'Load more rates'}</Button></div>}
    </>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !busy) setSelected(null); }}>
      <DialogContent className="niu-modal vendor-dialog">
        <DialogHeader><DialogTitle>{retiring ? 'End media rate' : customer ? 'Media selling rate' : 'Media purchase rate'}</DialogTitle><DialogDescription>{selected?.card.tariff.dimensions.model}</DialogDescription></DialogHeader>
        {selected && <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Specification</dt><dd>{selected.card.tariff.dimensions.resolution} · {selected.card.tariff.dimensions.reference_video ? 'Video reference' : 'No video reference'}</dd>
            <dt className="text-muted-foreground">{customer ? 'Selling rate' : 'Purchase rate'}</dt><dd>{selected.card.tariff.currency} {exactAmount(selected.card.tariff.amount_units, selected.card.tariff.decimal_places)} per {quantity(selected.card.tariff.per_quantity)} {selected.card.tariff.meter.replaceAll('_', ' ')}</dd>
            <dt className="text-muted-foreground">Minimum quantity</dt><dd>{quantity(selected.card.tariff.minimum_quantity)}</dd>
            <dt className="text-muted-foreground">Rounding</dt><dd>{selected.card.tariff.rounding === 'HalfEven' ? 'Half to even' : selected.card.tariff.rounding}</dd>
            <dt className="text-muted-foreground">Starts</dt><dd>{date(selected.card.tariff.effective_from)}</dd>
            <dt className="text-muted-foreground">Ends</dt><dd>{date(cutoff(selected))}</dd>
          </dl>
          {customer && <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><dt className="text-muted-foreground">Maximum billable quantity</dt><dd>{quantity((selected.card as CustomerMediaRateRecord['card']).maximum_quantity)}</dd></dl>}
          {selected.card.discounts.length > 0 && <div><h3 className="mb-2 text-sm font-medium">Discount rules</h3><ul className="space-y-2 text-sm">{selected.card.discounts.map((discount, index) => <li key={index}>{quantity(discount.multiplier)} multiplier · {discount.stacking === 'Exclusive' ? 'Exclusive' : 'Stacked'} · priority {discount.priority}<div className="text-muted-foreground">{discount.dimensions ? `${discount.dimensions.model} · ${discount.dimensions.resolution} · ${discount.dimensions.reference_video ? 'Video reference' : 'No video reference'}` : 'All specifications'}{discount.offer && ' · Offer-specific'}{discount.customer && ' · Customer-specific'}</div><div className="text-muted-foreground">{date(discount.effective_from)} → {date(discount.effective_until)}</div></li>)}</ul></div>}
          {retiring ? <form onSubmit={event => void retire(event)} className="space-y-4">
            <p className="text-sm text-muted-foreground">The end date is permanent. Existing jobs retain this rate; no job is cancelled or refunded.</p>
            <div className="space-y-2"><Label htmlFor="media-rate-end">End date</Label><Input id="media-rate-end" type="datetime-local" step="1" required value={end} onChange={event => setEnd(event.target.value)} disabled={busy} /></div>
            {dialogError && <p role="alert" className="text-sm">{dialogError}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setRetiring(false)}>Back</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save end date'}</Button></div>
          </form> : <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setSelected(null)}>Close</Button>{canConfigure && period(selected, now) !== 'Ended' && <Button variant="outline" onClick={() => { setReplacement(selected); setSelected(null); setPublishing(true); }}>Replace rate</Button>}{canConfigure && selected.retirement_effective_until === null && period(selected, now) !== 'Ended' && <Button onClick={() => { setEnd(localDateNow(selected.card.tariff.effective_from)); setRetiring(true); }}>End rate</Button>}</div>}
        </>}
      </DialogContent>
    </Dialog>
    {publishing && <MediaRatePublisher token={token} {...(customer ? { organization } : { supplier: supplier! })} previous={replacement} existing={records} onClose={() => { setPublishing(false); setRevision(value => value + 1); }} onSaved={() => { setPublishing(false); setNotice(replacement ? 'Replacement saved. Existing jobs keep their original price.' : customer ? 'Media selling rate published.' : 'Media purchase rate published.'); setRevision(value => value + 1); }} />}
  </>;
}
