import { usePlatformCurrency } from '@/app/platform-currency';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconDots, IconRefresh } from '@tabler/icons-react';
import { useDashboardContext } from '@/app/dashboard-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { request, writeMayHaveCommitted } from '@/features/providers/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { GrantEditor, GrantHistory } from './grants';
import { GiftCorrectionEditor } from './gift-corrections';
import { amountFromNanos, amountToNanos, money } from '@/lib/money';
import type { CustomerBalance, PreparedCustomerBalanceGrant, IssuedCustomerBalanceGrant } from '../../../../../sdks/javascript/src/admin';

type Company = { organization_id: string; organization_name: string; accounts: CustomerBalance[] };
type AccountPage = { data: Company[]; next_after: string | null };
export type Editor = { kind: 'credit' | 'grant' | 'history' | 'correction'; company: Company; account: CustomerBalance | null; prepared?: PreparedCustomerBalanceGrant; gift?:IssuedCustomerBalanceGrant };

export default function CustomerAccountsRoute() {
  const { token } = useDashboardContext();
  return <Accounts key={token} token={token} />;
}
/** Platform financial scope is explicit; customer pages keep their own authorization. */
function Accounts({ token }: { token: string }) {
  const {currency:platformCurrency}=usePlatformCurrency();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [failedCursor, setFailedCursor] = useState<string>();
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const active = useRef<AbortController | null>(null);
  async function load(after?: string) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(''); setFailedCursor(undefined);
    try {
      const page = await request<AccountPage>(token, '/api/v1/platform/customer-accounts?limit=50' + (after ? '&after=' + encodeURIComponent(after) : ''), 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (!Array.isArray(page.data) || page.next_after === after) throw new Error('Account page did not advance. Refresh accounts.');
      setCompanies(current => after ? [...current, ...page.data.filter(row => !current.some(saved => saved.organization_id === row.organization_id))] : page.data);
      setCursor(page.next_after);
    } catch (reason) {
      if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'Customer balances unavailable.'); setFailedCursor(after); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => active.current?.abort(); }, [token]);
  return <section className="min-w-0 space-y-5" aria-label="Account balances">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Manage customer balances, credit limits, and noncash grants. Each company shares its balance across workspaces. Credit permits borrowing; it does not add funds or recognize revenue.</p><Button variant="outline" disabled={loading} onClick={() => void load()}><IconRefresh size={16} />Refresh balances</Button></div>
    {notice && <p role="status">{notice}</p>}
    {loading && !companies.length && <p role="status">Loading customer balances…</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" disabled={loading} onClick={() => void load(failedCursor)}>Retry</Button></AlertDescription></Alert>}
    {!loading && !error && !companies.length && <p>No customer companies are available.</p>}
    {!!companies.length && <Table aria-label="Customer billing accounts"><TableHeader><TableRow>{['Company', 'Currency', 'Posted balance', 'Approved credit', 'Outstanding liability', 'Available capacity', 'Actions'].map((name, index) => <TableHead key={name} className={index > 1 && index < 6 ? 'text-right whitespace-nowrap' : 'whitespace-nowrap'}>{name}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{companies.flatMap(company => company.accounts.length ? company.accounts.map(account => <TableRow key={company.organization_id + ':' + account.currency}>
        <TableCell className="align-top whitespace-normal min-w-44 max-w-64">{company.organization_name || 'Unnamed company'}</TableCell><TableCell>{account.currency}</TableCell>
        {[account.balance_nanos, account.credit_limit_nanos, account.outstanding_nanos ?? null, account.available_nanos].map((amount, index) => <TableCell key={index} className="text-right whitespace-nowrap tabular-nums" aria-label={amount === null ? 'Unavailable' : undefined}>{amount === null ? null : money(amount, account.currency)}</TableCell>)}
        <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={loading || !!error} aria-label={`Account actions for ${company.organization_name || 'Unnamed company'} in ${account.currency}`}><IconDots size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={account.currency !== platformCurrency} onSelect={() => { setNotice(''); setEditor({ kind: 'credit', company, account }); }}>Set credit</DropdownMenuItem><DropdownMenuItem disabled={account.currency !== platformCurrency} onSelect={() => { setNotice(''); setEditor({ kind: 'grant', company, account }); }}>Grant noncash balance</DropdownMenuItem><DropdownMenuItem onSelect={() => setEditor({ kind: 'history', company, account })}>Noncash grants</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>
      </TableRow>) : [<TableRow key={company.organization_id}><TableCell className="whitespace-normal min-w-44 max-w-64">{company.organization_name || 'Unnamed company'}</TableCell><TableCell colSpan={5} className="text-muted-foreground">No currency accounts</TableCell><TableCell><Button variant="outline" disabled={loading || !!error || !platformCurrency} onClick={() => { setNotice(''); setEditor({ kind: 'credit', company, account: null }); }}>Set credit</Button></TableCell></TableRow>])}</TableBody>
    </Table>}
    {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>{loading ? 'Loading…' : 'More companies'}</Button>}
    {editor?.kind === 'grant' && <GrantEditor token={token} editor={editor} onClose={() => { setEditor(null); void load(); }} onIssued={() => { setNotice('Noncash grant issuance confirmed. This is not a cash receipt.'); void load(); }} />}
    {editor?.kind === 'history' && <GrantHistory token={token} editor={editor} onClose={() => { setEditor(null); void load(); }} onOpen={prepared => setEditor({ ...editor, kind: 'grant', prepared })} onCorrect={gift=>setEditor({...editor,kind:'correction',gift})} />}
    {editor?.kind === 'correction' && editor.gift && <GiftCorrectionEditor token={token} editor={{...editor,gift:editor.gift}} onClose={()=>{setEditor({...editor,kind:'history'});void load();}} onCorrected={()=>{setNotice('Noncash gift correction confirmed. No cash refund was recorded.');void load();}}/>}
    {editor?.kind === 'credit' && <CreditEditor token={token} editor={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice('Credit policy saved.'); void load(); }} />}
  </section>;
}
/** Compare-and-set approval never posts funds; unknown outcomes require reread. */
function CreditEditor({ token, editor, onClose, onSaved }: { token: string; editor: Editor; onClose: () => void; onSaved: () => void }) {
  const { company, account } = editor;
  const openerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const {currency:platformCurrency} = usePlatformCurrency();
  const currency = account?.currency ?? platformCurrency;
  const [amount, setAmount] = useState(amountFromNanos(account?.credit_limit_nanos ?? '0'));
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending || uncertain) return;
    let nanos: string;
    if (!/^[A-Z]{3}$/.test(currency)) { setError('Configure the platform currency in Admin → Settings before approving credit.'); return; }
    try { nanos = amountToNanos(amount, true); }
    catch { setError('Enter a nonnegative credit amount with at most nine decimal places, within the supported range.'); return; }
    setPending(true); setError('');
    try {
      const result = await request<{ data: { revision: string } }>(token, `/api/v1/organizations/${encodeURIComponent(company.organization_id)}/billing/accounts/${currency}/policy`, 'PUT', {
        credit_limit_nanos: nanos, warning_threshold_nanos: account?.warning_threshold_nanos ?? null, expected_revision: account?.policy_revision ?? '0',
      });
      if (!result?.data?.revision || BigInt(result.data.revision) !== BigInt(account?.policy_revision ?? '0') + 1n) throw new Error('Credit approval could not be confirmed.');
      onSaved();
    } catch (reason) {
      if (writeMayHaveCommitted(reason)) { setUncertain(true); setError('Approval outcome is unconfirmed. Close this dialog and refresh accounts before another change.'); }
      else setError((reason instanceof Error ? reason.message : 'Credit approval failed.') + ' Refresh accounts if another administrator changed this policy.');
    } finally { setPending(false); }
  }
  let preview: string | null = null;
  try { preview = money(amountToNanos(amount, true), currency); } catch { /* Invalid input is explained on submit. */ }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto" onCloseAutoFocus={event => { if (openerRef.current?.isConnected) { event.preventDefault(); openerRef.current.focus(); } }}><DialogHeader><DialogTitle>Set approved credit</DialogTitle><DialogDescription>{company.organization_name || 'Unnamed company'} · Allows the balance to become negative up to this limit. It does not change the posted balance.</DialogDescription></DialogHeader>
    <div className="grid grid-cols-2 gap-4 border-b pb-4"><div><p className="text-sm text-muted-foreground">Current credit</p><p className="font-medium">{account ? money(account.credit_limit_nanos, currency) : 'No currency account'}</p></div><div><p className="text-sm text-muted-foreground">New credit</p><p className="font-medium">{preview ?? 'Enter a valid amount'}</p></div></div>
    <form className="space-y-4" onSubmit={event => void submit(event)}>
      <p className="text-sm text-muted-foreground">Currency: {currency || "configure in Admin"}</p>
      <div className="space-y-2"><Label htmlFor="approved-credit">Approved credit limit</Label><Input id="approved-credit" inputMode="decimal" value={amount} disabled={pending || uncertain} onChange={event => { setAmount(event.target.value); setError(''); }} /><p className="text-sm text-muted-foreground">Zero requires prepayment. Existing request liabilities must still settle.</p></div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending || uncertain}>{pending ? 'Saving…' : 'Save credit policy'}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
