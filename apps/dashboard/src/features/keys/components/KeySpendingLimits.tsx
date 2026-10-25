import { amountFromNanos, amountToNanos, formatUnitAtoms, money, unitAmountFromAtoms, unitAmountToAtoms } from '@/lib/money';
import { usePlatformCurrency } from '@/app/platform-currency';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { keyRequest, KeyRequestError, type KeyUnitSpendingAccount } from '../api';
import KeyPolicyHistory from './KeyPolicyHistory';
import type { KeySpendingAccount } from '@niu-io/sdk/admin';

type UnitHistoryRow = {
  revision: string;
  expected_revision: string;
  definition_revision: string;
  limit_atoms: string | null;
  recorded_at: string;
  actor_kind: string;
  actor_name: string;
};

const maxInt64 = 9223372036854775807n;
const exact = (value: unknown): value is string => typeof value === 'string' && /^\d{1,64}$/.test(value);
function checked(rows: KeySpendingAccount[]) {
  if (!Array.isArray(rows) || rows.some(row => !row || !/^[A-Z]{3}$/.test(row.currency)
    || !exact(row.committed_nanos)
    || (row.limit_nanos !== null && (!exact(row.limit_nanos) || BigInt(row.limit_nanos) > maxInt64))
    || (row.revision !== null && (!exact(row.revision) || BigInt(row.revision) < 1n || BigInt(row.revision) > maxInt64))
    || (row.limit_nanos !== null && row.revision === null)
    || (row.limit_nanos === null ? row.remaining_nanos !== null : !exact(row.remaining_nanos)
      || BigInt(row.remaining_nanos) !== (BigInt(row.limit_nanos) > BigInt(row.committed_nanos) ? BigInt(row.limit_nanos) - BigInt(row.committed_nanos) : 0n)))
    || new Set(rows.map(row => row.currency)).size !== rows.length) throw new Error('The spending limits response could not be read.');
  return rows;
}
const inputAmount = (row: KeySpendingAccount) => row.limit_nanos === null ? '' : amountFromNanos(row.limit_nanos);
function parseAmount(draft: string): string | null {
  if (!draft.trim()) return null;
  return /^0+(?:\.0{1,9})?$/.test(draft.trim()) ? '0' : amountToNanos(draft);
}
export default function KeySpendingLimits(props: {token: string; endpoint: string; canWrite: boolean; active: boolean}) {
  return <SpendingPolicies key={`${props.token}:${props.endpoint}`} {...props} />;
}
function SpendingPolicies({token,endpoint,canWrite,active}: {token: string; endpoint: string; canWrite: boolean; active: boolean}) {
  const {currency:platformCurrency, billingMode, unit:platformUnit} = usePlatformCurrency();
  const unitEndpoint = endpoint.replace(/\/spending-limit$/, '/units/limit');
  const [rows,setRows] = useState<KeySpendingAccount[]>([]);
  const [unitAccount,setUnitAccount] = useState<KeyUnitSpendingAccount | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [reload,setReload] = useState(0);
  const [currency,setCurrency] = useState<string | null>(null);
  const [open,setOpen] = useState(false);
  const [draft,setDraft] = useState('');
  const [saving,setSaving] = useState(false);
  const [editError,setEditError] = useState('');
  const [conflicts,setConflicts] = useState<Set<string>>(new Set());
  const [notice,setNotice] = useState('');

  const [unitOpen,setUnitOpen] = useState(false);
  const [unitDraft,setUnitDraft] = useState('');
  const [unitSaving,setUnitSaving] = useState(false);
  const [unitEditError,setUnitEditError] = useState('');
  const [unitConflict,setUnitConflict] = useState(false);
  const [unitIdempotencyKey,setUnitIdempotencyKey] = useState('');
  const [unitHistoryOpen,setUnitHistoryOpen] = useState(false);
  const [unitHistoryRows,setUnitHistoryRows] = useState<UnitHistoryRow[]>([]);
  const [unitHistoryLoading,setUnitHistoryLoading] = useState(false);
  const [unitHistoryError,setUnitHistoryError] = useState('');

  const creditsConfigured = billingMode === 'credits' || Boolean(platformUnit);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();setLoading(true);setError('');
    void Promise.all([
      keyRequest<{data: KeySpendingAccount[]}>(token,endpoint,'GET',undefined,controller.signal),
      creditsConfigured
        ? keyRequest<{data: KeyUnitSpendingAccount}>(token,unitEndpoint,'GET',undefined,controller.signal).catch(() => null)
        : Promise.resolve(null),
    ]).then(([result, unitResult]) => {
      if (controller.signal.aborted) return;
      const saved = checked(result.data);setRows(saved);setConflicts(new Set());setEditError('');
      setUnitAccount(unitResult?.data ?? null);
      setUnitConflict(false);
      if (currency) {
        const row = saved.find(item => item.currency === currency);
        if (row) setDraft(inputAmount(row)); else setOpen(false);
      }
      if (unitOpen && unitResult?.data) {
        setUnitDraft(unitResult.data.limit_atoms === null ? '' : unitAmountFromAtoms(unitResult.data.limit_atoms));
      }
    }).catch(cause => {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not read spending limits.');})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  },[token,endpoint,unitEndpoint,reload,creditsConfigured]);
  useEffect(() => () => pending.current?.abort(),[]);

  useEffect(() => {
    if (!unitHistoryOpen) return;
    const controller = new AbortController();
    setUnitHistoryLoading(true);setUnitHistoryError('');
    void keyRequest<{data: UnitHistoryRow[]}>(token, `${unitEndpoint}/history?limit=20`, 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setUnitHistoryRows(result.data ?? []); })
      .catch(cause => { if (!controller.signal.aborted) setUnitHistoryError(cause instanceof Error ? cause.message : 'Could not load Credits limit history.'); })
      .finally(() => { if (!controller.signal.aborted) setUnitHistoryLoading(false); });
    return () => controller.abort();
  }, [unitHistoryOpen, token, unitEndpoint, reload]);

  const editing = rows.find(row => row.currency === currency);
  const conflict = currency !== null && conflicts.has(currency);
  let amount: string | null = null;
  let validation = '';
  try {
    amount = parseAmount(draft);
    if (editing && amount !== null && BigInt(amount) < BigInt(editing.committed_nanos)) validation = 'The limit must cover current charges and reserved requests.';
  } catch (cause) {validation = cause instanceof Error ? cause.message : 'Enter a valid amount.';}
  const changed = editing && amount !== editing.limit_nanos;
  async function save() {
    if (!editing || !canWrite || !active || saving || loading || error || validation || conflict || !changed) return;
    const controller = new AbortController();pending.current=controller;setSaving(true);setEditError('');
    try {
      await keyRequest(token,`${endpoint}/${editing.currency}`,'PUT',{limit_nanos:amount,expected_revision:editing.revision ?? '0'},controller.signal);
      if (controller.signal.aborted) return;
      setOpen(false);setNotice(`${editing.currency} spending limit saved.`);setReload(current => current+1);
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof KeyRequestError && (cause.status === 409 || cause.status === 402)) {
          setConflicts(current => new Set([...current,editing.currency]));
          setEditError(cause.status === 409 ? 'This limit changed. Reload the saved limits before trying again.' : 'Committed spending changed. Reload the saved limits before trying again.');
        } else setEditError(cause instanceof Error ? cause.message : 'Could not save this limit.');
      }
    } finally {if (!controller.signal.aborted) setSaving(false);}
  }

  const effectiveUnitName = unitAccount?.unit?.name ?? platformUnit?.name ?? 'Credits';
  const effectiveUnitPrecision = unitAccount?.unit?.display_precision ?? platformUnit?.display_precision ?? 2;
  let parsedUnitAtoms: string | null = null;
  let unitValidation = '';
  try {
    parsedUnitAtoms = unitDraft.trim() ? unitAmountToAtoms(unitDraft, false) : null;
    if (unitAccount && parsedUnitAtoms !== null && BigInt(parsedUnitAtoms) < BigInt(unitAccount.committed_atoms)) {
      unitValidation = 'The limit must cover current committed Credits charges and reserved requests.';
    }
  } catch (cause) {
    unitValidation = cause instanceof Error ? cause.message : `Enter a valid ${effectiveUnitName} amount.`;
  }
  const unitChanged = unitAccount ? (parsedUnitAtoms !== unitAccount.limit_atoms || unitAccount.credits_admission_blocked_by_monetary_limit) : false;

  async function saveUnitLimit() {
    if (!unitAccount || !canWrite || !active || unitSaving || loading || error || unitValidation || unitConflict || !unitChanged) return;
    const controller = new AbortController();pending.current=controller;setUnitSaving(true);setUnitEditError('');
    try {
      await keyRequest(token, unitEndpoint, 'PUT', {
        limit_atoms: parsedUnitAtoms,
        expected_revision: unitAccount.revision ?? '0',
        idempotency_key: unitIdempotencyKey || crypto.randomUUID(),
      }, controller.signal);
      if (controller.signal.aborted) return;
      setUnitOpen(false);
      setNotice(`${effectiveUnitName} key spending limit saved.`);
      setReload(current => current + 1);
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof KeyRequestError && (cause.status === 409 || cause.status === 402)) {
          setUnitConflict(true);
          setUnitEditError(cause.status === 409 ? 'This Credits limit changed. Reload the saved limits before trying again.' : 'Committed Credits changed. Reload the saved limits before trying again.');
        } else {
          setUnitEditError(cause instanceof Error ? cause.message : 'Could not save this Credits limit.');
        }
      }
    } finally { if (!controller.signal.aborted) setUnitSaving(false); }
  }

  const showUnitSection = Boolean(unitAccount && (billingMode === 'credits' || unitAccount.unit !== null || unitAccount.limit_atoms !== null || BigInt(unitAccount.committed_atoms) > 0n));

  return <Card><CardHeader><CardTitle>Spending limits</CardTitle><CardDescription>Lifetime customer spending allowances. Account and workspace limits still apply.</CardDescription></CardHeader><CardContent className="space-y-4">
    {!platformCurrency && !showUnitSection && <p className="text-sm text-muted-foreground">Spending limits will be available after the platform currency is configured in Admin.</p>}
    {loading && <p role="status">Loading spending limits…</p>}
    {error && <div className="grid justify-items-start gap-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => setReload(current => current+1)}>Retry spending limits</Button></div>}
    {!loading && !error && showUnitSection && unitAccount && <div className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{effectiveUnitName}</h3>
          {billingMode === 'credits' && <Badge variant="secondary">Active billing mode</Badge>}
          {unitAccount.credits_admission_blocked_by_monetary_limit && <Badge variant="destructive">Monetary limit blocks Credits</Badge>}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" aria-label={`${effectiveUnitName} spending limit history`} onClick={() => setUnitHistoryOpen(true)}>History</Button>
          {canWrite && active && unitAccount.unit && <Button variant="outline" aria-label={`Edit ${effectiveUnitName} key spending limit`} onClick={() => {
            setUnitDraft(unitAccount.limit_atoms === null ? '' : unitAmountFromAtoms(unitAccount.limit_atoms));
            setUnitIdempotencyKey(crypto.randomUUID());
            setUnitEditError('');
            setUnitConflict(false);
            setNotice('');
            setUnitOpen(true);
          }}>Edit</Button>}
        </div>
      </div>
      {unitAccount.credits_admission_blocked_by_monetary_limit && <p role="alert" className="text-sm text-destructive">A preserved monetary key limit is blocking paid Credits requests for this key. Save an explicit {effectiveUnitName} limit (or Unlimited) to allow Credits requests.</p>}
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        {[
          ['Lifetime limit', unitAccount.limit_atoms === null ? 'Unlimited' : formatUnitAtoms(unitAccount.limit_atoms, effectiveUnitName, effectiveUnitPrecision)],
          ['Committed', formatUnitAtoms(unitAccount.committed_atoms, effectiveUnitName, effectiveUnitPrecision)],
          ['Remaining allowance', unitAccount.remaining_atoms === null ? 'Unlimited' : formatUnitAtoms(unitAccount.remaining_atoms, effectiveUnitName, effectiveUnitPrecision)],
        ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value}</dd></div>)}
      </dl>
    </div>}
    {!loading && !error && !rows.length && !showUnitSection && <p className="text-sm text-muted-foreground">No billing currency is available for this key yet.</p>}
    {!loading && !error && rows.filter(row => row.currency === platformCurrency || row.limit_nanos !== null || BigInt(row.committed_nanos) > 0n).map(row => <div key={row.currency} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium">{row.currency}</h3><div className="flex flex-wrap gap-1"><KeyPolicyHistory token={token} endpoint={`${endpoint}/${row.currency}`} label={`${row.currency} spending limit`} field="limit_nanos" currency={row.currency}/>{canWrite && active && row.currency === platformCurrency && <Button variant="outline" aria-label={`Edit ${row.currency} key spending limit`} onClick={() => {setCurrency(row.currency);setDraft(inputAmount(row));if (!conflicts.has(row.currency)) setEditError('');setNotice('');setOpen(true);}}>Edit</Button>}</div></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">{[['Lifetime limit',row.limit_nanos === null ? 'Unlimited' : money(row.limit_nanos,row.currency)],['Committed',money(row.committed_nanos,row.currency)],['Remaining allowance',row.remaining_nanos === null ? 'Unlimited' : money(row.remaining_nanos,row.currency)]].map(([label,value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>
    </div>)}
    {!loading && !error && (rows.length > 0 || showUnitSection) && <p className="text-sm text-muted-foreground">Committed amounts include charges minus refunds and reserved requests. These limits do not add funds or reset when the key is rotated. Own API key routes do not consume this allowance.</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    <Dialog open={open} onOpenChange={next => {if (!saving) setOpen(next);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Edit spending limit · {currency}</DialogTitle><DialogDescription>This is a key allowance, not your company account balance.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={event => {event.preventDefault();void save();}}>
      <div className="grid gap-2"><Label htmlFor="key-spending-amount">Lifetime limit ({currency})</Label><Input id="key-spending-amount" inputMode="decimal" autoComplete="off" value={draft} onChange={event => setDraft(event.target.value)} disabled={saving || loading || conflict || Boolean(error)} aria-describedby="key-spending-help"/><p id="key-spending-help" className="text-sm text-muted-foreground">Leave blank for unlimited. Zero blocks new paid requests in this currency. No periodic reset.</p></div>
      {editing && <p className="text-sm text-muted-foreground">Committed at last refresh: {money(editing.committed_nanos,editing.currency)}. The limit must cover this amount.</p>}
      {validation && <p role="alert" className="text-sm text-destructive">{validation}</p>}{editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>{conflict || error ? <Button type="button" disabled={loading} onClick={() => setReload(current => current+1)}>Reload limits</Button> : <Button type="submit" disabled={saving || loading || Boolean(validation) || !changed || !canWrite || !active}>{saving ? 'Saving…' : 'Save limit'}</Button>}</DialogFooter>
    </form></DialogContent></Dialog>
    <Dialog open={unitOpen} onOpenChange={next => {if (!unitSaving) setUnitOpen(next);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Edit spending limit · {effectiveUnitName}</DialogTitle><DialogDescription>This is a key allowance in {effectiveUnitName}, not your company account balance.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={event => {event.preventDefault();void saveUnitLimit();}}>
      <div className="grid gap-2"><Label htmlFor="key-unit-spending-amount">Lifetime limit ({effectiveUnitName})</Label><Input id="key-unit-spending-amount" inputMode="decimal" autoComplete="off" value={unitDraft} onChange={event => setUnitDraft(event.target.value)} disabled={unitSaving || loading || unitConflict || Boolean(error)} aria-describedby="key-unit-spending-help"/><p id="key-unit-spending-help" className="text-sm text-muted-foreground">Leave blank for unlimited. Zero blocks new paid requests in {effectiveUnitName}. No periodic reset.</p></div>
      {unitAccount && <p className="text-sm text-muted-foreground">Committed at last refresh: {formatUnitAtoms(unitAccount.committed_atoms, effectiveUnitName, effectiveUnitPrecision)}. The limit must cover this amount.</p>}
      {unitValidation && <p role="alert" className="text-sm text-destructive">{unitValidation}</p>}{unitEditError && <p role="alert" className="text-sm text-destructive">{unitEditError}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={unitSaving} onClick={() => setUnitOpen(false)}>Cancel</Button>{unitConflict || error ? <Button type="button" disabled={loading} onClick={() => setReload(current => current+1)}>Reload limits</Button> : <Button type="submit" disabled={unitSaving || loading || Boolean(unitValidation) || !unitChanged || !canWrite || !active}>{unitSaving ? 'Saving…' : 'Save limit'}</Button>}</DialogFooter>
    </form></DialogContent></Dialog>
    <Dialog open={unitHistoryOpen} onOpenChange={setUnitHistoryOpen}><DialogContent className="max-h-[85dvh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{effectiveUnitName} spending limit history</DialogTitle><DialogDescription>Recorded Credits policy changes for this API key, newest first.</DialogDescription></DialogHeader>
      {unitHistoryRows.length > 0 && <Table className="w-full table-fixed text-xs sm:text-sm"><TableHeader><TableRow><TableHead className="whitespace-normal! text-xs! sm:text-sm! w-[45%] px-2!">Limit</TableHead><TableHead className="whitespace-normal! text-xs! sm:text-sm! w-1/4 px-2!">Changed by</TableHead><TableHead className="whitespace-normal! text-xs! sm:text-sm! px-2!">Date</TableHead></TableRow></TableHeader><TableBody>{unitHistoryRows.map(row => <TableRow key={row.revision}><TableCell className="text-xs! sm:text-sm! whitespace-normal break-words px-2!">{row.limit_atoms === null ? 'Unlimited' : formatUnitAtoms(row.limit_atoms, effectiveUnitName, effectiveUnitPrecision)}</TableCell><TableCell className="text-xs! sm:text-sm! whitespace-normal break-words px-2!">{row.actor_name || 'Name unavailable'}</TableCell><TableCell className="text-xs! sm:text-sm! whitespace-normal break-words px-2!">{Number.isFinite(Date.parse(row.recorded_at)) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.recorded_at)) : 'Time unavailable'}</TableCell></TableRow>)}</TableBody></Table>}
      {unitHistoryLoading && <p role="status">Loading limit history…</p>}
      {unitHistoryError && <p role="alert" className="text-sm text-destructive">{unitHistoryError}</p>}
      {!unitHistoryLoading && !unitHistoryError && !unitHistoryRows.length && <p className="text-sm text-muted-foreground">No Credits limit changes recorded.</p>}
      <DialogFooter><Button variant="outline" onClick={() => setUnitHistoryOpen(false)}>Close</Button></DialogFooter>
    </DialogContent></Dialog>
  </CardContent></Card>;
}
