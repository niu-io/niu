import { translateUI } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { keyRequest } from '../api';
import { money } from '@/lib/money';
import type { KeyRequestRateLimitRevision, KeyConcurrencyLimitRevision, KeyTokenRateLimitRevision, KeyIpPolicyRevision, KeySpendingLimitRevision } from '@niu-io/sdk/admin';

type Change = KeyRequestRateLimitRevision | KeyConcurrencyLimitRevision | KeyTokenRateLimitRevision | KeyIpPolicyRevision | KeySpendingLimitRevision;
type Field = 'requests_per_minute' | 'max_concurrent_requests' | 'tokens_per_minute' | 'allowed_cidrs' | 'limit_nanos';
const pageSize = 20;
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(readUILocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : translateUI('Time unavailable');
const valueOf = (row: Change, field: Field) => (row as unknown as Record<Field, number | string | string[] | null>)[field];
function validate(rows: Change[], field: Field, before?: string, currency?: string) {
  if (!Array.isArray(rows) || rows.length > pageSize) throw new Error('The history response could not be read.');
  let previous = before ? BigInt(before) : 9223372036854775808n;
  for (const row of rows) {
    const value = valueOf(row, field);
    if (field === 'limit_nanos' && (!('currency' in row) || row.currency !== currency)) throw new Error('The history response could not be read.');
    if (typeof row.revision !== 'string' || !/^[1-9]\d*$/.test(row.revision) || BigInt(row.revision) >= previous || (field === 'limit_nanos' ? value !== null && (typeof value !== 'string' || !/^\d{1,19}$/.test(value) || BigInt(value) > 9223372036854775807n) : field === 'allowed_cidrs' ? value !== null && (!Array.isArray(value) || value.some(entry => typeof entry !== 'string')) : value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0))) throw new Error('The history response could not be read.');
    previous = BigInt(row.revision);
  }
}
export default function KeyPolicyHistory({ token, endpoint, label, field, currency }: { token: string; endpoint: string; label: string; field: Field; currency?: string }) {
  const { t: uiT, format: uiF } = useUILocale();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Change[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const pending = useRef<AbortController | null>(null);
  function accept(data: Change[], before?: string) {
    validate(data, field, before, currency);
    setRows(current => before ? [...current, ...data] : data);
    setCursor(data.length === pageSize ? data[data.length - 1].revision : null);
  }
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();pending.current = controller;
    setRows([]);setCursor(null);setLoading(true);setError('');
    void keyRequest<{data: Change[]}>(token, `${endpoint}/history?limit=${pageSize}`, 'GET', undefined, controller.signal)
      .then(page => {if (!controller.signal.aborted) accept(page.data);})
      .catch(cause => {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load limit history.');})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => {controller.abort();pending.current?.abort();};
  }, [open, token, endpoint, field, currency, reload]);
  async function older() {
    if (!cursor || loading) return;
    const controller = new AbortController();pending.current = controller;setLoading(true);setError('');
    try {
      const page = await keyRequest<{data: Change[]}>(token, `${endpoint}/history?limit=${pageSize}&before_revision=${encodeURIComponent(cursor)}`, 'GET', undefined, controller.signal);
      if (!controller.signal.aborted) accept(page.data, cursor);
    } catch (cause) {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load older changes.');}
    finally {if (!controller.signal.aborted) setLoading(false);}
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="ghost" aria-label={uiF("{0} history", [label])}>{uiT("History")}</Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{label}{" "}{uiT("history")}</DialogTitle><DialogDescription>{uiT("Recorded policy changes for this API key, newest first.")}</DialogDescription></DialogHeader>
      {rows.length > 0 && <Table className="w-full table-fixed text-xs sm:text-sm"><TableHeader><TableRow><TableHead className="whitespace-normal! text-xs! sm:text-sm! w-[45%] px-2!">{field === 'allowed_cidrs' ? uiT("Access") : uiT("Limit")}</TableHead><TableHead className="whitespace-normal! text-xs! sm:text-sm! w-1/4 px-2!">{uiT("Changed by")}</TableHead><TableHead className="whitespace-normal! text-xs! sm:text-sm! px-2!">{uiT("Date")}</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.revision}><TableCell className="text-xs! sm:text-sm! whitespace-normal break-words px-2!">{field === 'limit_nanos' ? valueOf(row,field) === null ? uiT("Unlimited") : money(valueOf(row,field) as string,currency ?? ('currency' in row ? row.currency : '')) : field === 'allowed_cidrs' ? valueOf(row, field) === null ? uiT("Allow all sources") : (valueOf(row, field) as string[]).length ? (valueOf(row, field) as string[]).join(', ') : uiT("Block all sources") : valueOf(row, field) === null ? uiT("Unlimited") : valueOf(row, field) === 0 ? uiT("0 · New requests blocked") : valueOf(row, field)?.toLocaleString(readUILocale())}</TableCell><TableCell className="text-xs! sm:text-sm! whitespace-normal break-words px-2!">{row.actor_name || uiT("Name unavailable")}</TableCell><TableCell className="text-xs! sm:text-sm! whitespace-normal break-words px-2!">{date(row.recorded_at)}</TableCell></TableRow>)}</TableBody></Table>}
      {loading && (rows.length ? <p role="status" className="text-sm text-muted-foreground">{uiT("Loading older changes…")}</p> : <TableSkeleton columns={3} rows={3} label={uiT("Loading limit history…")} />)}
      {error && <div className="grid justify-items-start gap-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" disabled={loading} onClick={() => rows.length && cursor ? void older() : setReload(value => value + 1)}>{uiT("Retry history")}</Button></div>}
      {!loading && !error && !rows.length && <p className="text-sm text-muted-foreground">{field === 'allowed_cidrs' ? uiT("No source IP changes recorded.") : uiT("No limit changes recorded.")}</p>}
      {!error && cursor && <Button variant="outline" disabled={loading} onClick={() => void older()}>{uiT("Load older changes")}</Button>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{uiT("Close")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
