import { Empty, EmptyHeader, EmptyDescription } from '@/components/ui/empty';
import { translateUI } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Fragment, useEffect, useRef, useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { keyRequest, type ProjectKey } from '../api';
import { formatUnitAtoms, money } from '@/lib/money';
import type { KeyRequestRateLimitRevision, KeyConcurrencyLimitRevision, KeyTokenRateLimitRevision, KeyIpPolicyRevision, KeySpendingLimitRevision } from '@niu-io/sdk/admin';

type Change = KeyRequestRateLimitRevision | KeyConcurrencyLimitRevision | KeyTokenRateLimitRevision | KeyIpPolicyRevision | KeySpendingLimitRevision | UnitHistoryRow;
type Field = 'requests_per_minute' | 'max_concurrent_requests' | 'tokens_per_minute' | 'allowed_cidrs' | 'limit_nanos' | 'limit_atoms';
type UnitHistoryRow = {
  revision: string;
  limit_atoms: string | null;
  definition_revision: string;
  recorded_at: string;
  actor_kind: string;
  actor_name: string;
};
type Option = {
  id: string;
  label: string;
  endpoint: string;
  field: Field;
  currency?: string;
  unit?: { name: string; precision: number };
  empty: string;
};
const pageSize = 20;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat(readUILocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : translateUI('Time unavailable');
const valueOf = (row: Change, field: Field) => (row as unknown as Record<Field, number | string | string[] | null>)[field];
function validateRows(rows: unknown, option: Option, before?: string) {
  if (!Array.isArray(rows) || rows.length > pageSize) throw new Error('The history response could not be read.');
  let previous = before ? BigInt(before) : 9223372036854775808n;
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') throw new Error('The history response could not be read.');
    const row = raw as Record<string, unknown>;
    const revision = row.revision;
    if (typeof revision !== 'string' || !/^[1-9]\d*$/.test(revision) || BigInt(revision) >= previous) throw new Error('The history response could not be read.');
    previous = BigInt(revision);
    if (option.field === 'limit_nanos') {
      if (row.currency !== option.currency || (row.limit_nanos !== null && (typeof row.limit_nanos !== 'string' || !/^\d{1,19}$/.test(row.limit_nanos) || BigInt(row.limit_nanos) > 9223372036854775807n))) throw new Error('The history response could not be read.');
    } else if (option.field === 'limit_atoms') {
      if ((row.limit_atoms !== null && (typeof row.limit_atoms !== 'string' || !/^\d{1,19}$/.test(row.limit_atoms) || BigInt(row.limit_atoms) > 9223372036854775807n))
        || typeof row.definition_revision !== 'string' || !/^\d+$/.test(row.definition_revision)) throw new Error('The history response could not be read.');
    } else if (option.field === 'allowed_cidrs') {
      const value = row.allowed_cidrs;
      if (value !== null && (!Array.isArray(value) || value.some(entry => typeof entry !== 'string'))) throw new Error('The history response could not be read.');
    } else {
      const value = row[option.field];
      if (value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) throw new Error('The history response could not be read.');
    }
  }
}
export default function KeyHistoryDialog({ token, projectKey, keyPath }: { token: string; projectKey: ProjectKey; keyPath: string }) {
  const { t: uiT, format: uiF } = useUILocale();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('requests_per_minute');
  const [rows, setRows] = useState<Change[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const pending = useRef<AbortController | null>(null);

  const unitAccount = projectKey.unit_spending_limit ?? null;
  const unitName = unitAccount?.unit?.name ?? uiT("Credits");
  const unitPrecision = unitAccount?.unit?.display_precision ?? 2;
  const options: Option[] = [
    { id: 'requests_per_minute', label: uiT("Requests per minute"), endpoint: `${keyPath}/request-rate-limit`, field: 'requests_per_minute', empty: uiT("No limit changes recorded.") },
    { id: 'max_concurrent_requests', label: uiT("Concurrent requests"), endpoint: `${keyPath}/concurrency-limit`, field: 'max_concurrent_requests', empty: uiT("No limit changes recorded.") },
    { id: 'tokens_per_minute', label: uiT("Tokens per minute"), endpoint: `${keyPath}/token-rate-limit`, field: 'tokens_per_minute', empty: uiT("No limit changes recorded.") },
    { id: 'allowed_cidrs', label: uiT("Source IP access"), endpoint: `${keyPath}/ip-policy`, field: 'allowed_cidrs', empty: uiT("No source IP changes recorded.") },
  ];
  for (const row of projectKey.spending_limits ?? []) {
    if (row.revision === null && row.limit_nanos === null && !/^\d+$/.test(row.committed_nanos)) continue;
    if (row.revision === null && row.limit_nanos === null && BigInt(row.committed_nanos) === 0n) continue;
    options.push({
      id: `spending:${row.currency}`,
      label: uiF("{0} spending limit", [row.currency]),
      endpoint: `${keyPath}/spending-limit/${encodeURIComponent(row.currency)}`,
      field: 'limit_nanos',
      currency: row.currency,
      empty: uiT("No limit changes recorded."),
    });
  }
  if (unitAccount) {
    options.push({
      id: 'unit',
      label: uiF("{0} spending limit", [unitName]),
      endpoint: `${keyPath}/units/limit`,
      field: 'limit_atoms',
      unit: { name: unitName, precision: unitPrecision },
      empty: uiT("No Credits limit changes recorded."),
    });
  }
  const option = options.find(item => item.id === selected) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    pending.current = controller;
    setRows([]); setCursor(null); setLoading(true); setError('');
    void keyRequest<{ data: Change[] }>(token, `${option.endpoint}/history?limit=${pageSize}`, 'GET', undefined, controller.signal)
      .then(page => {
        if (controller.signal.aborted) return;
        validateRows(page.data, option);
        setRows(page.data);
        setCursor(page.data.length === pageSize ? page.data[page.data.length - 1].revision : null);
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load limit history.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); pending.current?.abort(); };
  }, [open, token, option.endpoint, option.field, selected, reload, projectKey]);

  async function older() {
    if (!cursor || loading) return;
    const controller = new AbortController(); pending.current = controller; setLoading(true); setError('');
    try {
      const page = await keyRequest<{ data: Change[] }>(token, `${option.endpoint}/history?limit=${pageSize}&before_revision=${encodeURIComponent(cursor)}`, 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      validateRows(page.data, option, cursor);
      setRows(current => [...current, ...page.data]);
      setCursor(page.data.length === pageSize ? page.data[page.data.length - 1].revision : null);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load older changes.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }

  function display(row: Change) {
    if (option.field === 'limit_nanos') return valueOf(row, option.field) === null ? uiT("Unlimited") : money(valueOf(row, option.field) as string, option.currency ?? '');
    if (option.field === 'limit_atoms') return valueOf(row, option.field) === null ? uiT("Unlimited") : formatUnitAtoms(valueOf(row, option.field) as string, option.unit?.name ?? unitName, option.unit?.precision ?? unitPrecision);
    if (option.field === 'allowed_cidrs') {
      const value = valueOf(row, option.field);
      return value === null || value === undefined ? uiT("Allow all sources") : (value as string[]).length ? (value as string[]).join(', ') : uiT("Block all sources");
    }
    const value = valueOf(row, option.field);
    if (value === undefined) return '';
    return value === null ? uiT("Unlimited") : value === 0 ? uiT("0 · New requests blocked") : (value as number).toLocaleString(readUILocale());
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline">{uiT("History")}</Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{uiT("Policy history")}</DialogTitle><DialogDescription>{uiT("Recorded policy changes for this API key, newest first.")}</DialogDescription></DialogHeader>
      <div className="grid gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" className="justify-between" aria-label={uiT("Policy history")} disabled={loading}>{option.label}<IconChevronDown size={16} /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 max-w-[calc(100vw-2rem)] overflow-y-auto">
            <DropdownMenuRadioGroup value={option.id} onValueChange={value => { setSelected(value); setRows([]); setCursor(null); setLoading(true); }}>
              {options.map((item, index) => <Fragment key={item.id}>{index === 4 && <DropdownMenuSeparator />}<DropdownMenuRadioItem value={item.id}>{item.label}</DropdownMenuRadioItem></Fragment>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {rows.length > 0 && <Table className="w-full table-fixed text-xs sm:text-sm"><TableHeader><TableRow><TableHead className="whitespace-normal! text-xs! sm:text-sm! w-[45%] px-2!">{option.field === 'allowed_cidrs' ? uiT("Access") : uiT("Limit")}</TableHead><TableHead className="whitespace-normal! text-xs! sm:text-sm! w-1/4 px-2!">{uiT("Changed by")}</TableHead><TableHead className="whitespace-normal! text-xs! sm:text-sm! px-2!">{uiT("Date")}</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.revision}><TableCell className="text-xs! sm:text-sm! whitespace-normal break-words px-2!">{display(row)}</TableCell><TableCell className="text-xs! sm:text-sm! whitespace-normal break-words px-2!">{row.actor_name || uiT("Name unavailable")}</TableCell><TableCell className="text-xs! sm:text-sm! whitespace-normal break-words px-2!">{date(row.recorded_at)}</TableCell></TableRow>)}</TableBody></Table>}
      {loading && (rows.length ? <p role="status" className="text-sm text-muted-foreground">{uiT("Loading older changes…")}</p> : <TableSkeleton columns={3} rows={3} label={uiT("Loading limit history…")} />)}
      {error && <div className="grid justify-items-start gap-2"><p role="alert" className="text-sm text-destructive">{uiT(error)}</p><Button variant="outline" disabled={loading} onClick={() => rows.length && cursor ? void older() : setReload(value => value + 1)}>{uiT("Retry history")}</Button></div>}
      {!loading && !error && !rows.length && <Empty className="min-h-48"><EmptyHeader><EmptyDescription>{option.empty}</EmptyDescription></EmptyHeader></Empty>}
      {!error && cursor && <Button variant="outline" disabled={loading} onClick={() => void older()}>{uiT("Load older changes")}</Button>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{uiT("Close")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
