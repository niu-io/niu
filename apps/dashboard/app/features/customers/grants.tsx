import { readLocale } from '@/shell/ui-locale';
import { translateUI } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { usePlatformCurrency } from '@/shell/platform-currency';
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
import { IssuedGiftHistory } from './gift-corrections';
import { ProviderRequestError, request } from '@/features/providers/api';
import { amountFromNanos, amountToNanos, money } from '@/lib/money';
import type { CustomerBalanceGrantInput, PreparedCustomerBalanceGrant, IssuedCustomerBalanceGrant } from '@niu-io/sdk/admin';
import type { Editor } from './page';

type Intent = PreparedCustomerBalanceGrant;
type Result = NonNullable<Intent['result']>;
const policyLabel = (policy: Intent['application_policy']) => policy === 'future_only' ? 'Future consumption only' : 'Unpaid credit first';
const base = (organization: string, currency: string) => `/api/v1/organizations/${encodeURIComponent(organization)}/billing/accounts/${currency}/grants`;
function checkedIntent(value: Intent, expected?: CustomerBalanceGrantInput, currency?: string): Intent {
  if (!value || !['prepared', 'issued'].includes(value.status) || !['future_only', 'unpaid_credit_first'].includes(value.application_policy)
    || !/^[A-Z]{3}$/.test(value.currency) || !/^[1-9][0-9]*$/.test(value.amount_nanos) || !value.idempotency_key
    || (currency !== undefined && value.currency !== currency) || typeof value.reason !== 'string' || (value.status === 'issued' && !value.result)) throw new Error('Saved grant state could not be confirmed.');
  if (expected && (value.idempotency_key !== expected.idempotency_key || value.amount_nanos !== expected.amount_nanos
    || value.reason !== expected.reason || value.application_policy !== expected.application_policy)) throw new Error('Saved grant differs from the requested intent.');
  return value;
}
function checkedResult(value: Result | null | undefined, intent: Intent): Result {
  if (!value?.id || value.application_policy !== intent.application_policy
    || BigInt(value.applied_to_credit_nanos) + BigInt(value.retained_for_future_consumption_nanos) !== BigInt(intent.amount_nanos)) throw new Error('Issuance could not be confirmed.');
  return value;
}
const inputOf = (value: Intent): CustomerBalanceGrantInput => ({ amount_nanos: value.amount_nanos, reason: value.reason, application_policy: value.application_policy, idempotency_key: value.idempotency_key });
function createdAt(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? new Intl.DateTimeFormat(readLocale(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC', hourCycle: 'h23' }).format(date) : translateUI('Date unavailable');
}

/**
 * One explicit action prepares then issues the exact same immutable intent.
 * An uncertain response is reconciled against the saved intent; retries reuse
 * the original key, so they can never create a second grant or issue twice.
 */
export function GrantEditor({ token, editor, onClose, onIssued }: { token: string; editor: Editor; onClose: () => void; onIssued: () => void }) {
  const { t: uiT } = useUILocale();
  const resumed = editor.prepared;
  const [saved, setSaved] = useState<Intent | null>(resumed ?? null);
  const [amount, setAmount] = useState(resumed ? amountFromNanos(resumed.amount_nanos) : '');
  const [reason, setReason] = useState(resumed?.reason ?? '');
  const [policy, setPolicy] = useState<Intent['application_policy']>(resumed?.application_policy ?? 'future_only');
  const [attempt, setAttempt] = useState<CustomerBalanceGrantInput | null>(resumed ? inputOf(resumed) : null);
  const key = useRef(resumed?.idempotency_key ?? crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const {currency:platformCurrency}=usePlatformCurrency();
  const currency = resumed?.currency ?? editor.account?.currency ?? platformCurrency;
  const endpoint = base(editor.company.organization_id, currency);
  const issued = saved?.status === 'issued' && saved.result ? saved : null;
  const locked = pending || !!attempt || !!issued;
  async function reconcile(input: CustomerBalanceGrantInput): Promise<'issued' | 'prepared' | 'missing' | 'unread'> {
    try {
      const result = await request<{ data: Intent }>(token, endpoint + '/prepared/' + encodeURIComponent(input.idempotency_key), 'GET');
      const value = checkedIntent(result.data, input, currency); setSaved(value);
      if (value.status === 'issued' && value.result) { setError(''); onIssued(); return 'issued'; }
      return 'prepared';
    } catch (failure) { return failure instanceof ProviderRequestError && failure.status === 404 ? 'missing' : 'unread'; }
  }
  async function submit(event: FormEvent) {
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
    try {
      const prepared = await request<{ data: Intent }>(token, endpoint + '/prepare', 'POST', input);
      const intent = checkedIntent(prepared.data, input, currency); setSaved(intent);
      if (intent.status === 'issued') { onIssued(); return; }
      const published = await request<{ data: Result }>(token, endpoint, 'POST', inputOf(intent));
      setSaved({ ...intent, status: 'issued', result: checkedResult(published.data, intent) }); onIssued();
    } catch (failure) {
      const recovery = await reconcile(input);
      if (recovery === 'issued') return;
      const message = failure instanceof Error ? failure.message : 'Grant issuance could not be confirmed.';
      setError(message + (recovery === 'prepared'
        ? ' The saved grant is still awaiting issuance. Retry this same grant with its original key; retrying cannot create a second grant.'
        : recovery === 'missing'
          ? ' No saved grant was found. Retry this same grant with its original key; retrying cannot create a second grant.'
          : ' The saved grant state could not be read. Retry this same grant with its original key; retrying cannot create a second grant.'));
    } finally { setPending(false); }
  }
  let preview: string | null = null;
  try { preview = money((BigInt(editor.account?.balance_nanos ?? '0') + BigInt(amountToNanos(amount))).toString(), currency); } catch { /* Submit explains invalid input. */ }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{uiT("Grant noncash balance")}</DialogTitle><DialogDescription>{editor.company.organization_name || uiT("Unnamed company")} · {currency}{uiT(". This is a gift, not a cash receipt. Consumed gifts reduce revenue; issuance alone recognizes no income.")}</DialogDescription></DialogHeader>
    {issued ? <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-lg font-medium">{money(issued.amount_nanos, issued.currency)}</p><Badge variant="outline">{uiT("Issued")}</Badge></div>
      <p className="break-words">{issued.reason}</p><p className="text-sm text-muted-foreground">{uiT(policyLabel(issued.application_policy))}{" "}{uiT("· Prepared")}{" "}{createdAt(issued.created_at)} UTC</p>
      <div className="space-y-2"><p>{uiT("Noncash grant issued.")}</p><p className="text-sm">{uiT("Applied to credit:")}{" "}{money(issued.result!.applied_to_credit_nanos, issued.currency)}</p><p className="text-sm">{uiT("Original future allocation:")}{" "}{money(issued.result!.retained_for_future_consumption_nanos, issued.currency)}</p><p className="text-sm text-muted-foreground">{uiT("This is the original allocation, not current spendable balance or received cash.")}</p></div>
      <div className="flex justify-end"><Button variant="outline" onClick={onClose}>{uiT("Close")}</Button></div>
    </div> : <form className="space-y-4" onSubmit={event => void submit(event)}>
      <div className="grid grid-cols-2 gap-4 border-b pb-4"><div><p className="text-sm text-muted-foreground">{uiT("Posted balance")}</p><p className="font-medium">{editor.account ? money(editor.account.balance_nanos, currency) : uiT("No currency account")}</p></div><div><p className="text-sm text-muted-foreground">{uiT("Estimated after grant")}</p><p className="font-medium">{preview ?? uiT("Enter an amount")}</p></div></div>
      <div className="space-y-2"><Label htmlFor="grant-amount">{uiT("Gift amount in")}{" "}{currency}</Label><Input id="grant-amount" inputMode="decimal" value={amount} disabled={locked} onChange={event => { setAmount(event.target.value); setError(''); }} /></div>
      <div className="space-y-2"><Label htmlFor="grant-reason">{uiT("Reason")}</Label><Input id="grant-reason" maxLength={500} value={reason} disabled={locked} onChange={event => { setReason(event.target.value); setError(''); }} /><p className="text-sm text-muted-foreground">{uiT("A single-line administration note.")}</p></div>
      <div className="space-y-2"><Label>{uiT("Application policy")}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={locked} aria-label={uiT("Gift application policy")}>{uiT(policyLabel(policy))}<IconChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={policy} onValueChange={value => setPolicy(value as Intent['application_policy'])}><DropdownMenuRadioItem value="future_only">{uiT("Future consumption only")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="unpaid_credit_first">{uiT("Unpaid credit first")}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
      <p className="text-sm text-muted-foreground">{uiT("Unpaid credit first applies to known debt, with the remainder available for future consumption. Unknown debt sources prevent issuance. Issuance adds no funds.")}</p>
      {saved?.status === 'prepared' && <p className="text-sm text-muted-foreground">{uiT("This grant is saved but not issued. Retry issuance with its original key.")}</p>}
      {error && <Alert variant="destructive"><AlertDescription>{uiT(error)}</AlertDescription></Alert>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{uiT("Cancel")}</Button><Button type="submit" disabled={pending}>{pending ? uiT("Issuing…") : uiT("Issue grant")}</Button></div>
    </form>}
  </DialogContent></Dialog>;
}

/** Issued gifts plus a recovery-only view of saved grants that never issued. */
export function GrantHistory({ token, editor, onClose, onOpen, onCorrect }: { token: string; editor: Editor; onClose: () => void; onOpen: (intent: Intent) => void; onCorrect:(gift:IssuedCustomerBalanceGrant)=>void }) {
  const { t: uiT } = useUILocale();
  const [rows, setRows] = useState<Intent[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [failedCursor, setFailedCursor] = useState<string>();
  const {currency:platformCurrency}=usePlatformCurrency();
  const active = useRef<AbortController | null>(null), currency = editor.account?.currency ?? platformCurrency;
  async function load(before?: string) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(''); setFailedCursor(undefined);
    try {
      const page = await request<{ data: Intent[]; next_before: string | null }>(token, base(editor.company.organization_id, currency) + '/prepared?limit=50' + (before ? '&before=' + encodeURIComponent(before) : ''), 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (!Array.isArray(page.data) || page.next_before === before) throw new Error('Saved grant history did not advance. Refresh history.');
      const checked = page.data.map(row => checkedIntent(row, undefined, currency)).filter(row => row.status === 'prepared');
      setRows(current => before ? [...current, ...checked.filter(row => !current.some(saved => saved.id === row.id))] : checked); setCursor(page.next_before);
    } catch (failure) { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : 'Saved grant history unavailable.'); setFailedCursor(before); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => active.current?.abort(); }, [token, editor.company.organization_id, currency]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="w-[calc(100vw-2rem)] sm:max-w-5xl max-h-[90dvh] grid-cols-[minmax(0,1fr)] overflow-y-auto"><DialogHeader><DialogTitle>{uiT("Noncash grants")}</DialogTitle><DialogDescription>{editor.company.organization_name || uiT("Unnamed company")} · {currency}{uiT(". Issued gifts and separate corrections. A saved grant awaiting issuance can be resumed here.")}</DialogDescription></DialogHeader>
    {error && <Alert variant="destructive"><AlertDescription>{uiT(error)} <Button variant="outline" disabled={loading} onClick={() => void load(failedCursor)}>{uiT("Retry")}</Button></AlertDescription></Alert>}
    {!!rows.length && <section className="space-y-3" aria-label={uiT("Awaiting issuance")}>
      <div><p className="text-sm font-medium">{uiT("Awaiting issuance")}</p><p className="text-sm text-muted-foreground">{uiT("A saved grant is waiting to be issued. Resume it to finish with its original key.")}</p></div>
      <Table aria-label={uiT("Awaiting issuance")}><TableHeader><TableRow>{[uiT('Prepared (UTC)'), uiT('Reason'), uiT('Gift amount'), uiT('Application policy'), uiT('Actions')].map((label, index) => <TableHead key={label} className={`whitespace-nowrap${index === 2 || index === 4 ? ' text-right' : ''}`}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.id}><TableCell className="whitespace-nowrap">{createdAt(row.created_at)}</TableCell><TableCell className="min-w-44 max-w-64 whitespace-normal break-words">{row.reason}</TableCell><TableCell className="whitespace-nowrap text-right tabular-nums">{money(row.amount_nanos, row.currency)}</TableCell><TableCell className="whitespace-nowrap">{uiT(policyLabel(row.application_policy))}</TableCell><TableCell className="text-right"><Button variant="outline" disabled={loading || !!error} onClick={() => onOpen(row)}>{uiT("Resume grant")}</Button></TableCell></TableRow>)}</TableBody></Table>
      {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>{loading ? uiT("Loading…") : uiT("More awaiting grants")}</Button>}
    </section>}
    <IssuedGiftHistory token={token} organization={editor.company.organization_id} currency={currency} onCorrect={onCorrect}/>
    <div className="flex justify-end"><Button variant="outline" onClick={onClose}>{uiT("Close")}</Button></div>
  </DialogContent></Dialog>;
}
