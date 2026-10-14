import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { request } from '@/features/vendors/api';
import { amountFromNanos, amountToNanos, money } from '@/lib/money';
import type { CustomerBalanceGrantInput, PreparedCustomerBalanceGrant } from '../../../../../sdks/javascript/src/admin';
import type { Editor } from './page';

type Intent = PreparedCustomerBalanceGrant;
const policyLabel = (policy: Intent['application_policy']) => policy === 'future_only' ? 'Future consumption only' : 'Unpaid credit first';
const base = (organization: string, currency: string) => `/admin/v1/organizations/${encodeURIComponent(organization)}/billing/accounts/${currency}/grants`;
function checkedIntent(value: Intent, expected?: CustomerBalanceGrantInput, currency?: string): Intent {
  if (!value || !['prepared', 'issued'].includes(value.status) || !['future_only', 'unpaid_credit_first'].includes(value.application_policy)
    || !/^[A-Z]{3}$/.test(value.currency) || !/^[1-9][0-9]*$/.test(value.amount_nanos) || !value.idempotency_key
    || (currency !== undefined && value.currency !== currency) || typeof value.reason !== 'string' || (value.status === 'issued' && !value.result)) throw new Error('Saved grant state could not be confirmed.');
  if (expected && (value.idempotency_key !== expected.idempotency_key || value.amount_nanos !== expected.amount_nanos
    || value.reason !== expected.reason || value.application_policy !== expected.application_policy)) throw new Error('Saved grant differs from the requested intent.');
  return value;
}
function createdAt(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC', hourCycle: 'h23' }).format(date) : 'Date unavailable';
}

/** Preparation survives this form; issuance always reuses its original immutable key. */
export function GrantEditor({ token, editor, onClose, onIssued }: { token: string; editor: Editor; onClose: () => void; onIssued: () => void }) {
  const [saved, setSaved] = useState<Intent | null>(editor.prepared ?? null);
  const [amount, setAmount] = useState(editor.prepared ? amountFromNanos(editor.prepared.amount_nanos) : '');
  const [reason, setReason] = useState(editor.prepared?.reason ?? '');
  const [policy, setPolicy] = useState<Intent['application_policy']>(editor.prepared?.application_policy ?? 'future_only');
  const [attempt, setAttempt] = useState<CustomerBalanceGrantInput | null>(null);
  const key = useRef(editor.prepared?.idempotency_key ?? crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [statusVerified, setStatusVerified] = useState(!editor.prepared);
  const currency = editor.prepared?.currency ?? editor.account?.currency ?? 'USD';
  const endpoint = base(editor.company.organization_id, currency);
  const locked = pending || !!attempt || !!saved;
  useEffect(() => {
    if (!editor.prepared) return;
    const controller = new AbortController();
    const original = editor.prepared;
    setPending(true); setStatusVerified(false);
    void request<{ data: Intent }>(token, endpoint + '/prepared/' + encodeURIComponent(original.idempotency_key), 'GET', undefined, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        const expected: CustomerBalanceGrantInput = { amount_nanos: original.amount_nanos, reason: original.reason, application_policy: original.application_policy, idempotency_key: original.idempotency_key };
        setSaved(checkedIntent(result.data, expected, currency)); setStatusVerified(true);
      })
      .catch(failure => { if (!controller.signal.aborted) setError((failure instanceof Error ? failure.message : 'Saved status unavailable.') + ' Check saved status before issuance.'); })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [token, endpoint, editor.prepared?.idempotency_key, currency]);
  async function prepare(event: FormEvent) {
    event.preventDefault(); if (pending) return;
    let input = attempt;
    if (!input) {
      try {
        const nanos = amountToNanos(amount), note = reason.trim();
        if (BigInt(nanos) <= 0n || !note || [...note].length > 500 || /[\u0000-\u001f\u007f-\u009f]/.test(note)) throw new Error();
        input = { amount_nanos: nanos, reason: note, application_policy: policy, idempotency_key: key.current };
      } catch { setError('Enter a positive amount with at most nine decimal places and a single-line reason of up to 500 characters.'); return; }
      setAttempt(input);
    }
    setPending(true); setError('');
    try { const result = await request<{ data: Intent }>(token, endpoint + '/prepare', 'POST', input); setSaved(checkedIntent(result.data, input, currency)); setStatusVerified(true); }
    catch (failure) { setError((failure instanceof Error ? failure.message : 'Preparation could not be confirmed.') + ' Check saved status or retry this exact preparation. Preparation does not add funds.'); }
    finally { setPending(false); }
  }
  async function refresh() {
    if (pending) return; setPending(true); setError('');
    try {
      const result = await request<{ data: Intent }>(token, endpoint + '/prepared/' + encodeURIComponent(key.current));
      const original = attempt ?? (saved ? { amount_nanos: saved.amount_nanos, reason: saved.reason, application_policy: saved.application_policy, idempotency_key: saved.idempotency_key } : undefined);
      const value = checkedIntent(result.data, original, currency); setSaved(value); setStatusVerified(true);
      if (value.status === 'issued') onIssued();
    } catch (failure) { setError((failure instanceof Error ? failure.message : 'Saved status unavailable.') + ' A missing record in this snapshot does not prove an in-flight request failed. Retain the original submission.'); }
    finally { setPending(false); }
  }
  async function issue() {
    if (pending || !statusVerified || !saved || saved.status !== 'prepared') return;
    setPending(true); setError('');
    try {
      const input: CustomerBalanceGrantInput = { amount_nanos: saved.amount_nanos, reason: saved.reason, application_policy: saved.application_policy, idempotency_key: saved.idempotency_key };
      const result = await request<{ data: NonNullable<Intent['result']> }>(token, endpoint, 'POST', input);
      if (!result.data?.id || result.data.application_policy !== saved.application_policy
        || BigInt(result.data.applied_to_credit_nanos) + BigInt(result.data.retained_for_future_consumption_nanos) !== BigInt(saved.amount_nanos)) throw new Error('Issuance could not be confirmed.');
      setSaved({ ...saved, status: 'issued', result: result.data }); onIssued();
    } catch (failure) { setError((failure instanceof Error ? failure.message : 'Issuance could not be confirmed.') + ' Check saved status or retry this same grant. Do not create a new grant to recover this response.'); }
    finally { setPending(false); }
  }
  let preview: string | null = null;
  try { preview = money((BigInt(editor.account?.balance_nanos ?? '0') + BigInt(amountToNanos(amount))).toString(), currency); } catch { /* Submit explains invalid input. */ }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Grant noncash balance</DialogTitle><DialogDescription>{editor.company.organization_name || 'Unnamed company'} · {currency}. This is a gift, not a cash receipt. Consumed gifts reduce revenue; issuance alone recognizes no income.</DialogDescription></DialogHeader>
    {!saved ? <form className="space-y-4" onSubmit={event => void prepare(event)}>
      <div className="grid grid-cols-2 gap-4 border-b pb-4"><div><p className="text-sm text-muted-foreground">Posted balance</p><p className="font-medium">{editor.account ? money(editor.account.balance_nanos, currency) : 'No currency account'}</p></div><div><p className="text-sm text-muted-foreground">Estimated after grant</p><p className="font-medium">{preview ?? 'Enter an amount'}</p></div></div>
      <div className="space-y-2"><Label htmlFor="grant-amount">Gift amount in {currency}</Label><Input id="grant-amount" inputMode="decimal" value={amount} disabled={locked} onChange={event => { setAmount(event.target.value); setError(''); }} /></div>
      <div className="space-y-2"><Label htmlFor="grant-reason">Reason</Label><Input id="grant-reason" maxLength={500} value={reason} disabled={locked} onChange={event => { setReason(event.target.value); setError(''); }} /><p className="text-sm text-muted-foreground">A single-line administration note.</p></div>
      <div className="space-y-2"><Label>Application policy</Label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={locked} aria-label="Gift application policy">{policyLabel(policy)}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={policy} onValueChange={value => setPolicy(value as Intent['application_policy'])}><DropdownMenuRadioItem value="future_only">Future consumption only</DropdownMenuRadioItem><DropdownMenuRadioItem value="unpaid_credit_first">Unpaid credit first</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
      <p className="text-sm text-muted-foreground">Unpaid credit first applies to known debt, with the remainder available for future consumption. Unknown debt sources prevent issuance. Preparation adds no funds.</p>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>{attempt && <Button type="button" variant="outline" disabled={pending} onClick={() => void refresh()}>Check saved status</Button>}<Button type="submit" disabled={pending}>{pending ? 'Preparing…' : attempt ? 'Retry preparation' : 'Prepare grant'}</Button></div>
    </form> : <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-lg font-medium">{money(saved.amount_nanos, saved.currency)}</p><Badge variant="outline">{saved.status === 'issued' ? 'Issued' : 'Prepared'}</Badge></div>
      <p className="break-words">{saved.reason}</p><p className="text-sm text-muted-foreground">{policyLabel(saved.application_policy)} · Prepared {createdAt(saved.created_at)} UTC</p>
      {saved.status === 'prepared' ? <p className="text-sm text-muted-foreground">This intent is saved in the backend. Preparation adds no funds. Issue it once with its original key; close and recover it through Noncash grants if needed.</p> : <div className="space-y-2"><p>Noncash grant issued.</p><p className="text-sm">Applied to credit: {money(saved.result!.applied_to_credit_nanos, saved.currency)}</p><p className="text-sm">Original future allocation: {money(saved.result!.retained_for_future_consumption_nanos, saved.currency)}</p><p className="text-sm text-muted-foreground">This is the original allocation, not current spendable balance or received cash.</p></div>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={pending} onClick={onClose}>Close</Button><Button variant="outline" disabled={pending} onClick={() => void refresh()}>Check saved status</Button>{saved.status === 'prepared' && <Button disabled={pending || !statusVerified} onClick={() => void issue()}>{pending ? 'Issuing…' : error ? 'Retry same grant' : 'Issue noncash grant'}</Button>}</div>
    </div>}
  </DialogContent></Dialog>;
}

/** Durable preparation/issuance history, rather than browser-only drafts. */
export function GrantHistory({ token, editor, onClose, onOpen }: { token: string; editor: Editor; onClose: () => void; onOpen: (intent: Intent) => void }) {
  const [rows, setRows] = useState<Intent[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [failedCursor, setFailedCursor] = useState<string>();
  const active = useRef<AbortController | null>(null), currency = editor.account?.currency ?? 'USD';
  async function load(before?: string) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(''); setFailedCursor(undefined);
    try {
      const page = await request<{ data: Intent[]; next_before: string | null }>(token, base(editor.company.organization_id, currency) + '/prepared?limit=50' + (before ? '&before=' + encodeURIComponent(before) : ''), 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (!Array.isArray(page.data) || page.next_before === before) throw new Error('Grant history did not advance. Refresh history.');
      const checked = page.data.map(row => checkedIntent(row, undefined, currency));
      setRows(current => before ? [...current, ...checked.filter(row => !current.some(saved => saved.id === row.id))] : checked); setCursor(page.next_before);
    } catch (failure) { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : 'Grant history unavailable.'); setFailedCursor(before); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => active.current?.abort(); }, [token, editor.company.organization_id, currency]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="w-[calc(100vw-2rem)] sm:max-w-5xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Noncash grants</DialogTitle><DialogDescription>{editor.company.organization_name || 'Unnamed company'} · {currency}. Saved publication intents and original issuance allocations. Older direct API grants without preparation are outside this list. Prepared intents do not add funds; nothing issues automatically.</DialogDescription></DialogHeader>
    <div><Button variant="outline" disabled={loading} onClick={() => void load()}>Refresh history</Button></div>
    {loading && !rows.length && <p role="status">Loading grant history…</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" disabled={loading} onClick={() => void load(failedCursor)}>Retry history</Button></AlertDescription></Alert>}
    {!loading && !error && !rows.length && <p>No saved noncash grant intents in this currency.</p>}
    {!!rows.length && <Table aria-label="Saved noncash grant intents"><TableHeader><TableRow>{['Prepared (UTC)', 'Reason', 'Gift amount', 'Application policy', 'State', 'Actions'].map(label => <TableHead key={label} className="whitespace-nowrap">{label}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.id}><TableCell className="whitespace-nowrap">{createdAt(row.created_at)}</TableCell><TableCell className="min-w-44 max-w-64 whitespace-normal break-words">{row.reason}</TableCell><TableCell className="whitespace-nowrap tabular-nums">{money(row.amount_nanos, row.currency)}</TableCell><TableCell className="whitespace-nowrap">{policyLabel(row.application_policy)}</TableCell><TableCell><Badge variant="outline">{row.status === 'issued' ? 'Issued' : 'Prepared'}</Badge></TableCell><TableCell><Button variant="outline" disabled={loading || !!error} onClick={() => onOpen(row)}>{row.status === 'issued' ? 'View grant' : 'Resume grant'}</Button></TableCell></TableRow>)}</TableBody></Table>}
    {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>{loading ? 'Loading…' : 'More grants'}</Button>}
    <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
  </DialogContent></Dialog>;
}
