import { useLocale as useUILocale } from '@/shell/ui-locale';
import type { LoaderFunctionArgs } from 'react-router';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconDots, IconRefresh } from '@tabler/icons-react';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import { canManagePlatform, useDashboardContext } from '@/shell/dashboard-context';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cachedGet, markCachedStale, peekCachedGet, request, writeMayHaveCommitted } from '@/features/providers/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { GrantEditor, GrantHistory } from './grants';
import { GiftCorrectionEditor } from './gift-corrections';
import { CompanyBrandedUnitsDialog } from './unit-accounts';
import { amountFromNanos, amountToNanos, money } from '@/lib/money';
import type { CustomerBalance, PreparedCustomerBalanceGrant, IssuedCustomerBalanceGrant } from '@niu-io/sdk/admin';

type Company = { organization_id: string; organization_name: string; accounts: CustomerBalance[] };
type AccountPage = { data: Company[]; next_after: string | null };
export type Editor = { kind: 'credit' | 'grant' | 'history' | 'correction' | 'units'; company: Company; account: CustomerBalance | null; prepared?: PreparedCustomerBalanceGrant; gift?:IssuedCustomerBalanceGrant };

const CUSTOMER_ACCOUNTS_PATH = '/api/v1/platform/customer-accounts?limit=50';

export function loader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ snapshot }) => ({
    authorized: canManagePlatform(snapshot.session),
    endpoint: CUSTOMER_ACCOUNTS_PATH,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function CustomerAccountsRoute() {
  useOptionalRouteLoaderData();
  const { token } = useDashboardContext();
  return <Accounts key={token} token={token} />;
}

/** Platform financial scope is explicit; customer pages keep their own authorization. */
function Accounts({ token }: { token: string }) {
  const { t: uiT, format: uiF } = useUILocale();
  const {currency:platformCurrency}=usePlatformCurrency();
  const initialPage = token ? peekCachedGet<AccountPage>(token, CUSTOMER_ACCOUNTS_PATH) : undefined;
  const initialValid = initialPage && Array.isArray(initialPage.data) ? initialPage : undefined;
  const [companies, setCompanies] = useState<Company[]>(() => initialValid?.data ?? []);
  const [cursor, setCursor] = useState<string | null>(() => initialValid?.next_after ?? null);
  const [loading, setLoading] = useState(() => Boolean(token && !initialValid));
  const [error, setError] = useState('');
  const [failedCursor, setFailedCursor] = useState<string>();
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const active = useRef<AbortController | null>(null);
  async function load(after?: string, force = true) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    if (after || force || !initialValid) setLoading(true);
    setError(''); setFailedCursor(undefined);
    const path = CUSTOMER_ACCOUNTS_PATH + (after ? '&after=' + encodeURIComponent(after) : '');
    try {
      const page = after
        ? await request<AccountPage>(token, path, 'GET', undefined, controller.signal)
        : await cachedGet<AccountPage>(token, path, { signal: controller.signal, force });
      if (controller.signal.aborted) return;
      if (!Array.isArray(page.data) || page.next_after === after) throw new Error('Account page did not advance. Refresh accounts.');
      setCompanies(current => after ? [...current, ...page.data.filter(row => !current.some(saved => saved.organization_id === row.organization_id))] : page.data);
      setCursor(page.next_after);
    } catch (reason) {
      if (!after) markCachedStale(token, CUSTOMER_ACCOUNTS_PATH);
      if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'Customer balances unavailable.'); setFailedCursor(after); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(undefined, false); return () => active.current?.abort(); }, [token]);
  return <section className="min-w-0 space-y-5" aria-label={uiT("Account balances")}>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{uiT("Manage customer balances, credit limits, and noncash grants. Each company shares its balance across workspaces. Credit permits borrowing; it does not add funds or recognize revenue.")}</p><Button variant="outline" disabled={loading} onClick={() => void load()}><IconRefresh size={16} />{uiT("Refresh balances")}</Button></div>
    {notice && <p role="status">{uiT(notice)}</p>}
    {loading && !companies.length && <TableSkeleton columns={7} rows={5} label={uiT("Loading customer balances…")} />}
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" disabled={loading} onClick={() => void load(failedCursor)}>{uiT("Retry")}</Button></AlertDescription></Alert>}
    {!loading && !error && !companies.length && <p>{uiT("No customer companies are available.")}</p>}
    {!!companies.length && <Table aria-label={uiT("Customer billing accounts")}><TableHeader><TableRow>{[uiT('Company'), uiT('Currency'), uiT('Posted balance'), uiT('Approved credit'), uiT('Outstanding liability'), uiT('Available capacity'), uiT('Actions')].map((name, index) => <TableHead key={name} className={index > 1 && index < 6 ? 'text-right whitespace-nowrap' : 'whitespace-nowrap'}>{name}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{companies.flatMap(company => company.accounts.length ? company.accounts.map(account => <TableRow key={company.organization_id + ':' + account.currency}>
        <TableCell className="whitespace-normal min-w-44 max-w-64">{company.organization_name || uiT("Unnamed company")}</TableCell><TableCell>{account.currency}</TableCell>
        {[account.balance_nanos, account.credit_limit_nanos, account.outstanding_nanos ?? null, account.available_nanos].map((amount, index) => <TableCell key={index} className="text-right whitespace-nowrap tabular-nums" aria-label={amount === null ? uiT("Unavailable") : undefined}>{amount === null ? null : money(amount, account.currency)}</TableCell>)}
        <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={loading || !!error} aria-label={uiF("Account actions for {0} in {1}", [company.organization_name || uiT("Unnamed company"), account.currency])}><IconDots size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { setNotice(''); setEditor({ kind: 'units', company, account }); }}>{uiT("Manage Branded Credits")}</DropdownMenuItem><DropdownMenuItem disabled={account.currency !== platformCurrency} onSelect={() => { setNotice(''); setEditor({ kind: 'credit', company, account }); }}>{uiT("Set credit")}</DropdownMenuItem><DropdownMenuItem disabled={account.currency !== platformCurrency} onSelect={() => { setNotice(''); setEditor({ kind: 'grant', company, account }); }}>{uiT("Grant noncash balance")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setEditor({ kind: 'history', company, account })}>{uiT("Noncash grants")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>
      </TableRow>) : [<TableRow key={company.organization_id}><TableCell className="whitespace-normal min-w-44 max-w-64">{company.organization_name || uiT("Unnamed company")}</TableCell><TableCell colSpan={5} className="text-muted-foreground">{uiT("No currency accounts")}</TableCell><TableCell><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={loading || !!error} onClick={() => { setNotice(''); setEditor({ kind: 'units', company, account: null }); }}>{uiT("Manage Branded Credits")}</Button><Button variant="outline" size="sm" disabled={loading || !!error || !platformCurrency} onClick={() => { setNotice(''); setEditor({ kind: 'credit', company, account: null }); }}>{uiT("Set credit")}</Button></div></TableCell></TableRow>])}</TableBody>
    </Table>}
    {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>{loading ? uiT("Loading…") : uiT("More companies")}</Button>}
    {editor?.kind === 'units' && <CompanyBrandedUnitsDialog token={token} organizationId={editor.company.organization_id} organizationName={editor.company.organization_name || uiT("Unnamed company")} onClose={() => { setEditor(null); void load(); }} onChanged={msg => { setNotice(msg); void load(); }} />}
    {editor?.kind === 'grant' && <GrantEditor token={token} editor={editor} onClose={() => { setEditor(null); void load(); }} onIssued={() => { setNotice('Noncash grant issuance confirmed. This is not a cash receipt.'); void load(); }} />}
    {editor?.kind === 'history' && <GrantHistory token={token} editor={editor} onClose={() => { setEditor(null); void load(); }} onOpen={prepared => setEditor({ ...editor, kind: 'grant', prepared })} onCorrect={gift=>setEditor({...editor,kind:'correction',gift})} />}
    {editor?.kind === 'correction' && editor.gift && <GiftCorrectionEditor token={token} editor={{...editor,gift:editor.gift}} onClose={()=>{setEditor({...editor,kind:'history'});void load();}} onCorrected={()=>{setNotice('Noncash gift correction confirmed. No cash refund was recorded.');void load();}}/>}
    {editor?.kind === 'credit' && <CreditEditor token={token} editor={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice('Credit policy saved.'); void load(); }} />}
  </section>;
}
/** Compare-and-set approval never posts funds; unknown outcomes require reread. */
function CreditEditor({ token, editor, onClose, onSaved }: { token: string; editor: Editor; onClose: () => void; onSaved: () => void }) {
  const { t: uiT } = useUILocale();
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
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto" onCloseAutoFocus={event => { if (openerRef.current?.isConnected) { event.preventDefault(); openerRef.current.focus(); } }}><DialogHeader><DialogTitle>{uiT("Set approved credit")}</DialogTitle><DialogDescription>{company.organization_name || uiT("Unnamed company")}{" "}{uiT("· Allows the balance to become negative up to this limit. It does not change the posted balance.")}</DialogDescription></DialogHeader>
    <div className="grid grid-cols-2 gap-4 border-b pb-4"><div><p className="text-sm text-muted-foreground">{uiT("Current credit")}</p><p className="font-medium">{account ? money(account.credit_limit_nanos, currency) : uiT("No currency account")}</p></div><div><p className="text-sm text-muted-foreground">{uiT("New credit")}</p><p className="font-medium">{preview ?? uiT("Enter a valid amount")}</p></div></div>
    <form className="space-y-4" onSubmit={event => void submit(event)}>
      <p className="text-sm text-muted-foreground">{uiT("Currency:")}{" "}{currency || uiT("configure in Admin")}</p>
      <div className="space-y-2"><Label htmlFor="approved-credit">{uiT("Approved credit limit")}</Label><Input id="approved-credit" inputMode="decimal" value={amount} disabled={pending || uncertain} onChange={event => { setAmount(event.target.value); setError(''); }} /><p className="text-sm text-muted-foreground">{uiT("Zero requires prepayment. Existing request liabilities must still settle.")}</p></div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{uiT("Cancel")}</Button><Button type="submit" disabled={pending || uncertain}>{pending ? uiT("Saving…") : uiT("Save credit policy")}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
