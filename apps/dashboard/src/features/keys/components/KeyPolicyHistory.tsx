import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { keyRequest } from '../api';
import { money } from '@/lib/money';
import type { KeyRequestRateLimitRevision, KeyConcurrencyLimitRevision, KeyTokenRateLimitRevision, KeyIpPolicyRevision, KeySpendingLimitRevision } from '../../../../../../sdks/javascript/src/admin';

type Change = KeyRequestRateLimitRevision | KeyConcurrencyLimitRevision | KeyTokenRateLimitRevision | KeyIpPolicyRevision | KeySpendingLimitRevision;
type Field = 'requests_per_minute' | 'max_concurrent_requests' | 'tokens_per_minute' | 'allowed_cidrs' | 'limit_nanos';
const pageSize = 20;
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Time unavailable';
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
    <DialogTrigger asChild><Button variant="ghost" aria-label={`${label} history`}>History</Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{label} history</DialogTitle><DialogDescription>Recorded policy changes for this API key, newest first.</DialogDescription></DialogHeader>
      {rows.length > 0 && <Table className="w-full table-fixed text-xs sm:text-sm"><TableHeader><TableRow><TableHead className="whitespace-normal! text-xs! sm:text-sm! w-[45%] px-2!">{field === 'allowed_cidrs' ? 'Access' : 'Limit'}</TableHead><TableHead className="whitespace-normal! text-xs! sm:text-sm! w-1/4 px-2!">Changed by</TableHead><TableHead className="whitespace-normal! text-xs! sm:text-sm! px-2!">Date</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.revision}><TableCell className="text-xs! sm:text-sm! whitespace-normal break-words px-2!">{field === 'limit_nanos' ? valueOf(row,field) === null ? 'Unlimited' : money(valueOf(row,field) as string,currency ?? ('currency' in row ? row.currency : '')) : field === 'allowed_cidrs' ? valueOf(row, field) === null ? 'Allow all sources' : (valueOf(row, field) as string[]).length ? (valueOf(row, field) as string[]).join(', ') : 'Block all sources' : valueOf(row, field) === null ? 'Unlimited' : valueOf(row, field) === 0 ? '0 · New requests blocked' : valueOf(row, field)?.toLocaleString()}</TableCell><TableCell className="text-xs! sm:text-sm! whitespace-normal break-words px-2!">{row.actor_name || 'Name unavailable'}</TableCell><TableCell className="text-xs! sm:text-sm! whitespace-normal break-words px-2!">{date(row.recorded_at)}</TableCell></TableRow>)}</TableBody></Table>}
      {loading && <p role="status">{rows.length ? 'Loading older changes…' : 'Loading limit history…'}</p>}
      {error && <div className="grid justify-items-start gap-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" disabled={loading} onClick={() => rows.length && cursor ? void older() : setReload(value => value + 1)}>Retry history</Button></div>}
      {!loading && !error && !rows.length && <p className="text-sm text-muted-foreground">{field === 'allowed_cidrs' ? 'No source IP changes recorded.' : 'No limit changes recorded.'}</p>}
      {!error && cursor && <Button variant="outline" disabled={loading} onClick={() => void older()}>Load older changes</Button>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
