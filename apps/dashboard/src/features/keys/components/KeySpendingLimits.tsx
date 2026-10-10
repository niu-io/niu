import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { amountToNanos, money } from '@/lib/money';
import { keyRequest, KeyRequestError } from '../api';
import KeyPolicyHistory from './KeyPolicyHistory';
import type { KeySpendingAccount } from '../../../../../../sdks/javascript/src/admin';

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
const inputAmount = (row: KeySpendingAccount) => row.limit_nanos === null ? '' : money(row.limit_nanos, row.currency).slice(row.currency.length + 1);
function parseAmount(draft: string): string | null {
  if (!draft.trim()) return null;
  return /^0+(?:\.0{1,9})?$/.test(draft.trim()) ? '0' : amountToNanos(draft);
}
export default function KeySpendingLimits(props: {token: string; endpoint: string; canWrite: boolean; active: boolean}) {
  return <SpendingPolicies key={`${props.token}:${props.endpoint}`} {...props} />;
}
function SpendingPolicies({token,endpoint,canWrite,active}: {token: string; endpoint: string; canWrite: boolean; active: boolean}) {
  const [rows,setRows] = useState<KeySpendingAccount[]>([]);
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
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();setLoading(true);setError('');
    void keyRequest<{data: KeySpendingAccount[]}>(token,endpoint,'GET',undefined,controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const saved = checked(result.data);setRows(saved);setConflicts(new Set());setEditError('');
      if (currency) {
        const row = saved.find(item => item.currency === currency);
        if (row) setDraft(inputAmount(row)); else setOpen(false);
      }
    }).catch(cause => {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not read spending limits.');})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  },[token,endpoint,reload]);
  useEffect(() => () => pending.current?.abort(),[]);
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
  return <Card><CardHeader><CardTitle>Spending limits</CardTitle><CardDescription>Lifetime customer spending allowances. Account and workspace limits still apply.</CardDescription></CardHeader><CardContent className="space-y-4">
    {loading && <p role="status">Loading spending limits…</p>}
    {error && <div className="grid justify-items-start gap-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => setReload(current => current+1)}>Retry spending limits</Button></div>}
    {!loading && !error && !rows.length && <p className="text-sm text-muted-foreground">No billing currency is available for this key yet.</p>}
    {!loading && !error && rows.map(row => <div key={row.currency} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium">{row.currency}</h3><div className="flex flex-wrap gap-1"><KeyPolicyHistory token={token} endpoint={`${endpoint}/${row.currency}`} label={`${row.currency} spending limit`} field="limit_nanos" currency={row.currency}/>{canWrite && active && <Button variant="outline" aria-label={`Edit ${row.currency} key spending limit`} onClick={() => {setCurrency(row.currency);setDraft(inputAmount(row));if (!conflicts.has(row.currency)) setEditError('');setNotice('');setOpen(true);}}>Edit</Button>}</div></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">{[['Lifetime limit',row.limit_nanos === null ? 'Unlimited' : money(row.limit_nanos,row.currency)],['Committed',money(row.committed_nanos,row.currency)],['Remaining allowance',row.remaining_nanos === null ? 'Unlimited' : money(row.remaining_nanos,row.currency)]].map(([label,value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>
    </div>)}
    {!loading && !error && rows.length > 0 && <p className="text-sm text-muted-foreground">Committed amounts include charges minus refunds and reserved requests. These limits do not add funds or reset when the key is rotated. Own API key routes do not consume this allowance.</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    <Dialog open={open} onOpenChange={next => {if (!saving) setOpen(next);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Edit spending limit · {currency}</DialogTitle><DialogDescription>This is a key allowance, not your company account balance.</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={event => {event.preventDefault();void save();}}>
      <div className="grid gap-2"><Label htmlFor="key-spending-amount">Lifetime limit ({currency})</Label><Input id="key-spending-amount" inputMode="decimal" autoComplete="off" value={draft} onChange={event => setDraft(event.target.value)} disabled={saving || loading || conflict || Boolean(error)} aria-describedby="key-spending-help"/><p id="key-spending-help" className="text-sm text-muted-foreground">Leave blank for unlimited. Zero blocks new paid requests in this currency. No periodic reset.</p></div>
      {editing && <p className="text-sm text-muted-foreground">Committed at last refresh: {money(editing.committed_nanos,editing.currency)}. The limit must cover this amount.</p>}
      {validation && <p role="alert" className="text-sm text-destructive">{validation}</p>}{editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>{conflict || error ? <Button type="button" disabled={loading} onClick={() => setReload(current => current+1)}>Reload limits</Button> : <Button type="submit" disabled={saving || loading || Boolean(validation) || !changed || !canWrite || !active}>{saving ? 'Saving…' : 'Save limit'}</Button>}</DialogFooter>
    </form></DialogContent></Dialog>
  </CardContent></Card>;
}
