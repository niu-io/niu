import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, type LoaderFunctionArgs } from 'react-router';
import { IconBuilding, IconDots, IconPlus, IconRefresh } from '@tabler/icons-react';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import { canManagePlatform, useDashboardContext } from '@/shell/dashboard-context';
import { usePlatformCurrency } from '@/shell/platform-currency';
import PageHeader from '@/components/PageHeader';
import { TableSkeleton } from '@/components/PageSkeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cachedGet, markCachedStale, peekCachedGet, request, writeMayHaveCommitted } from '@/features/providers/api';
import { listOperators, type Operator } from '@/features/operators/api';
import { invalidateQueries } from '@/lib/query-cache';
import { amountFromNanos, amountToNanos, formatUnitAmountText, money } from '@/lib/money';
import { NiuAdminClient, type CompanyMetadata, type CustomerBalance, type IssuedCustomerBalanceGrant, type PlatformCustomerCreditSummary, type PreparedCustomerBalanceGrant, type Workspace } from '@niu-io/sdk/admin';
import CustomerSetup from './setup';
import { GrantEditor, GrantHistory } from './grants';
import { GiftCorrectionEditor } from './gift-corrections';
import { CompanyBrandedUnitsDialog } from './unit-accounts';
import { readPending, savePending, clearPending, type PendingCreation } from './pending';

type Company = { organization_id: string; organization_name: string; accounts: CustomerBalance[]; credits?: PlatformCustomerCreditSummary | null };
type AccountPage = { data: Company[]; next_after: string | null };
export type Editor = { kind: 'credit' | 'grant' | 'history' | 'correction' | 'units'; company: Company; account: CustomerBalance | null; prepared?: PreparedCustomerBalanceGrant; gift?: IssuedCustomerBalanceGrant };

const CUSTOMER_ACCOUNTS_PATH = '/api/v1/platform/customer-accounts?limit=50';
const COLUMN_WIDTHS = ['w-[22%]', 'w-[12%]', 'w-[8%]', 'w-[12%]', 'w-[12%]', 'w-[12%]', 'w-[12%]', 'w-[10%]'];

/** Company-level Credits summary; repeated on each currency row so it stays visible. */
export function CreditsSummaryCell({ credits }: { credits: PlatformCustomerCreditSummary | null }) {
  const { t: uiT, format: uiF } = useUILocale();
  if (!credits) return <span className="text-muted-foreground" aria-label={uiT("No Credits balance")}>—</span>;
  return <div className="space-y-0.5">
    <p className="whitespace-nowrap tabular-nums">{formatUnitAmountText(credits.available, credits.name)}</p>
    {credits.additional_units > 0 && <p className="text-xs text-muted-foreground">{credits.additional_units === 1 ? uiF("+{0} other unit", [credits.additional_units]) : uiF("+{0} other units", [credits.additional_units])}</p>}
  </div>;
}

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ snapshot }) => ({
    authorized: canManagePlatform(snapshot.session),
    endpoint: CUSTOMER_ACCOUNTS_PATH,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function CustomersRoute() {
  useOptionalRouteLoaderData();
  const { t: uiT } = useUILocale();
  const context = useDashboardContext();
  if (!canManagePlatform(context.session)) {
    return <Alert><AlertTitle>{uiT("Platform administrator access required")}</AlertTitle><AlertDescription><p>{uiT("Your account does not have Platform administrator access. Ask an installation administrator to grant it.")}</p></AlertDescription></Alert>;
  }
  return <Customers key={context.token} token={context.token} canSetup={canManagePlatform(context.session)} onWorkspaceCreated={context.reloadWorkspaces} />;
}

/**
 * One Customers directory for onboarding and financial administration. The
 * platform account endpoint is the single company list so setup status, Credits
 * summaries and currency balances can never disagree about which companies exist.
 */
export function Customers({ token, canSetup, onWorkspaceCreated }: { token: string; canSetup: boolean; onWorkspaceCreated: () => void }) {
  const { t: uiT, format: uiF } = useUILocale();
  const { currency: platformCurrency } = usePlatformCurrency();
  const client = useMemo(() => new NiuAdminClient({ adminToken: token, baseURL: new URL('/api/v1', location.origin).href }), [token]);
  const initialPage = token ? peekCachedGet<AccountPage>(token, CUSTOMER_ACCOUNTS_PATH) : undefined;
  const initialValid = initialPage && Array.isArray(initialPage.data) ? initialPage : undefined;
  const [companies, setCompanies] = useState<Company[]>(() => initialValid?.data ?? []);
  const [cursor, setCursor] = useState<string | null>(() => initialValid?.next_after ?? null);
  const [loading, setLoading] = useState(() => Boolean(token && !initialValid));
  const [error, setError] = useState('');
  const [failedCursor, setFailedCursor] = useState<string>();
  const [notice, setNotice] = useState('');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<CompanyMetadata | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [workspacesByCompany, setWorkspacesByCompany] = useState<Map<string, Workspace[]>>(() => new Map());
  const [ownersByCompany, setOwnersByCompany] = useState<Map<string, Operator[]>>(() => new Map());
  const [setupLoading, setSetupLoading] = useState(canSetup);
  const [setupError, setSetupError] = useState('');
  const [setupRevision, setSetupRevision] = useState(0);
  const active = useRef<AbortController | null>(null);
  const opener = useRef<HTMLElement | null>(null);

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

  // Workspaces and company owners are secondary setup status, not financial
  // authority. A failed read leaves the directory usable and shows the gap.
  useEffect(() => {
    if (!canSetup) {
      setWorkspacesByCompany(new Map()); setOwnersByCompany(new Map()); setSetupLoading(false); setSetupError('');
      return;
    }
    const controller = new AbortController();
    setSetupLoading(true); setSetupError('');
    Promise.all([client.listWorkspaces({ signal: controller.signal }), listOperators(token, undefined, controller.signal)])
      .then(([workspaceResult, userResult]) => {
        if (controller.signal.aborted) return;
        const workspaces = new Map<string, Workspace[]>();
        for (const workspace of workspaceResult.data) {
          const rows = workspaces.get(workspace.organization_id) ?? [];
          rows.push(workspace); workspaces.set(workspace.organization_id, rows);
        }
        const owners = new Map<string, Operator[]>();
        for (const user of userResult.data) {
          if (user.revoked || user.role !== 'owner' || user.project_id !== null || !user.organization_id) continue;
          const rows = owners.get(user.organization_id) ?? [];
          rows.push(user); owners.set(user.organization_id, rows);
        }
        setWorkspacesByCompany(workspaces); setOwnersByCompany(owners);
      })
      .catch(reason => { if (!controller.signal.aborted) setSetupError(reason instanceof Error ? reason.message : 'Could not read customer setup.'); })
      .finally(() => { if (!controller.signal.aborted) setSetupLoading(false); });
    return () => controller.abort();
  }, [client, token, canSetup, setupRevision]);

  useEffect(() => { void load(undefined, false); return () => active.current?.abort(); }, [token]);

  function refresh() {
    setSetupRevision(value => value + 1);
    void load();
  }

  function openSetup(company: Company) {
    setNotice('');
    setSelected({ id: company.organization_id, name: company.organization_name });
  }

  function openEditor(next: Editor) {
    setNotice('');
    setEditor(next);
  }

  function setupStatus(company: Company): ReactNode {
    if (!canSetup) return null;
    const line = 'mt-1 text-xs font-normal text-muted-foreground [overflow-wrap:anywhere]';
    if (setupError) return <p className={line}>{uiT("Workspace and owner status unavailable")}</p>;
    if (setupLoading && workspacesByCompany.size === 0 && ownersByCompany.size === 0) return <p className={line}>{uiT("Checking workspace and owner status…")}</p>;
    const workspaces = workspacesByCompany.get(company.organization_id) ?? [];
    const owner = ownersByCompany.get(company.organization_id)?.[0];
    const workspaceLabel = workspaces.length === 0 ? uiT("No workspaces") : workspaces.length === 1 ? uiT("1 workspace") : uiF("{0} workspaces", [workspaces.length]);
    return <p className={line}>{workspaceLabel}{" · "}{owner ? uiF("Owner: {0}", [owner.name]) : uiT("Owner not set")}</p>;
  }

  function companyLabel(company: Company) {
    return company.organization_name || uiT("Unnamed company");
  }

  function accountActions(company: Company, account: CustomerBalance | null) {
    return <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={loading || !!error} onPointerDown={event => { opener.current = event.currentTarget; }} onClick={event => { opener.current = event.currentTarget; }} aria-label={account ? uiF("Account actions for {0} in {1}", [companyLabel(company), account.currency]) : uiF("Customer actions for {0}", [companyLabel(company)])}><IconDots size={16} /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canSetup && <><DropdownMenuItem onSelect={() => openSetup(company)}>{uiT("Set up")}</DropdownMenuItem><DropdownMenuSeparator /></>}
        <DropdownMenuItem onSelect={() => openEditor({ kind: 'units', company, account })}>{uiT("Manage Branded Credits")}</DropdownMenuItem>
        <DropdownMenuItem disabled={!platformCurrency || (account !== null && account.currency !== platformCurrency)} onSelect={() => openEditor({ kind: 'credit', company, account })}>{uiT("Set credit")}</DropdownMenuItem>
        {account && <DropdownMenuItem disabled={account.currency !== platformCurrency} onSelect={() => openEditor({ kind: 'grant', company, account })}>{uiT("Grant noncash balance")}</DropdownMenuItem>}
        {account && <DropdownMenuItem onSelect={() => openEditor({ kind: 'history', company, account })}>{uiT("Noncash grants")}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>;
  }

  return <section className="empty-region min-w-0 space-y-5" aria-label={uiT("Customers")}>
    <PageHeader title={uiT("Customers")} action={<><Button variant="outline" disabled={loading} aria-label={uiT("Refresh customers")} title={uiT("Refresh customers")} onClick={refresh}><IconRefresh size={16} /><span className="hidden sm:inline">{uiT("Refresh")}</span></Button>{canSetup && <Button aria-label={uiT("New customer")} onClick={event => { opener.current = event.currentTarget; setCreate(true); }}><IconPlus size={16} /><span className="hidden sm:inline">{uiT("New customer")}</span></Button>}</>} />
    <p className="text-sm text-muted-foreground">{uiT("Each customer company has its own funds, users, and workspaces; workspaces within a company share its funds. Set up access, review Credits and currency balances, and manage approved credit or noncash grants. Credit permits borrowing; it does not add funds or recognize revenue.")}</p>
    {notice && <p role="status">{uiT(notice)}</p>}
    {error && <Alert variant="destructive"><AlertDescription>{uiT(error)} <Button variant="outline" disabled={loading} onClick={() => void load(failedCursor)}>{uiT("Retry")}</Button></AlertDescription></Alert>}
    {loading && !companies.length && <TableSkeleton columns={8} rows={5} label={uiT("Loading customer balances…")} />}
    {!loading && !error && !companies.length && <Empty><EmptyHeader><EmptyMedia variant="icon"><IconBuilding size={20} aria-hidden="true" /></EmptyMedia><EmptyTitle>{uiT("No customers yet")}</EmptyTitle><EmptyDescription>{uiT("No customers yet. Create a company to start setting up independent customer access.")}</EmptyDescription></EmptyHeader></Empty>}
    {!!companies.length && <Table className="table-fixed min-w-[680px]" aria-label={uiT("Customer companies")}><TableHeader><TableRow>{[uiT('Company'), uiT('Credits'), uiT('Currency'), uiT('Posted balance'), uiT('Approved credit'), uiT('Outstanding liability'), uiT('Available capacity'), uiT('Actions')].map((name, index) => <TableHead key={name} className={COLUMN_WIDTHS[index] + ' ' + (index > 2 && index < 7 ? 'text-right whitespace-normal' : 'whitespace-nowrap') + (index === 7 ? ' text-right' : '')}>{name}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{companies.flatMap(company => company.accounts.length ? company.accounts.map(account => <TableRow key={company.organization_id + ':' + account.currency}>
        <TableCell className="whitespace-normal min-w-48 max-w-72"><p className="[overflow-wrap:anywhere]">{companyLabel(company)}</p>{setupStatus(company)}</TableCell>
        <TableCell><CreditsSummaryCell credits={company.credits ?? null} /></TableCell><TableCell>{account.currency}</TableCell>
        {[account.balance_nanos, account.credit_limit_nanos, account.outstanding_nanos ?? null, account.available_nanos].map((amount, index) => <TableCell key={index} className="text-right whitespace-nowrap tabular-nums" aria-label={amount === null ? uiT("Unavailable") : undefined}>{amount === null ? null : money(amount, account.currency)}</TableCell>)}
        <TableCell className="text-right">{accountActions(company, account)}</TableCell>
      </TableRow>) : [<TableRow key={company.organization_id}>
        <TableCell className="whitespace-normal min-w-48 max-w-72"><p className="[overflow-wrap:anywhere]">{companyLabel(company)}</p>{setupStatus(company)}</TableCell>
        <TableCell><CreditsSummaryCell credits={company.credits ?? null} /></TableCell><TableCell colSpan={5} className="text-muted-foreground">{uiT("No currency accounts")}</TableCell>
        <TableCell className="text-right">{accountActions(company, null)}</TableCell>
      </TableRow>])}</TableBody>
    </Table>}
    {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>{loading ? uiT("Loading…") : uiT("More companies")}</Button>}
    <CreateCompany onRestoreFocus={() => opener.current?.focus()} open={create} onOpenChange={setCreate} client={client} onCreated={company => { invalidateQueries(CUSTOMER_ACCOUNTS_PATH); setCompanies(old => [{ organization_id: company.id, organization_name: company.name, accounts: [], credits: null }, ...old.filter(row => row.organization_id !== company.id)]); setCreate(false); setSelected(company); }} />
    {selected && <CustomerSetup onRestoreFocus={() => opener.current?.focus()} key={selected.id} company={selected} token={token} client={client} onClose={() => { setSelected(null); setSetupRevision(value => value + 1); void load(); }} onWorkspaceCreated={() => { onWorkspaceCreated(); setSetupRevision(value => value + 1); }} />}
    {editor?.kind === 'units' && <CompanyBrandedUnitsDialog token={token} organizationId={editor.company.organization_id} organizationName={companyLabel(editor.company)} returnFocusTo={opener.current} onClose={() => { setEditor(null); void load(); }} onChanged={msg => { setNotice(msg); void load(); }} />}
    {editor?.kind === 'grant' && <GrantEditor token={token} editor={editor} onClose={() => { setEditor(null); void load(); }} onIssued={() => { setNotice('Noncash grant issuance confirmed. This is not a cash receipt.'); void load(); }} />}
    {editor?.kind === 'history' && <GrantHistory token={token} editor={editor} onClose={() => { setEditor(null); void load(); }} onOpen={prepared => setEditor({ ...editor, kind: 'grant', prepared })} onCorrect={gift => setEditor({ ...editor, kind: 'correction', gift })} />}
    {editor?.kind === 'correction' && editor.gift && <GiftCorrectionEditor token={token} editor={{ ...editor, gift: editor.gift }} onClose={() => { setEditor({ ...editor, kind: 'history' }); void load(); }} onCorrected={() => { setNotice('Noncash gift correction confirmed. No cash refund was recorded.'); void load(); }} />}
    {editor?.kind === 'credit' && <CreditEditor token={token} editor={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice('Credit policy saved.'); void load(); }} />}
  </section>;
}

function CreateCompany({ open, onOpenChange, client, onCreated, onRestoreFocus }: { onRestoreFocus: () => void; open: boolean; onOpenChange: (open: boolean) => void; client: NiuAdminClient; onCreated: (company: CompanyMetadata) => void }) {
  const { t: uiT } = useUILocale();
  const [, setPendingVersion] = useState(0); const { currency, ready, error: currencyError } = usePlatformCurrency(); const pending = useRef<PendingCreation | null>(readPending('company')); const [name, setName] = useState(pending.current?.name ?? ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) { event.preventDefault(); if (busy || !currency || !name.trim() || (pending.current && name.trim() !== pending.current.name)) return;
    pending.current ??= { name: name.trim(), key: crypto.randomUUID() }; setBusy(true); setError('');
    try { savePending('company', pending.current); const saved = await client.createCompany({ name: pending.current.name }, { idempotencyKey: pending.current.key }); if (!saved?.id || !saved.name) throw new Error('Creation could not be confirmed.'); clearPending('company'); pending.current = null; setName(''); onCreated(saved); }
    catch (reason) { const status = (reason as { status?: number })?.status; if (status === 400 || status === 422) { clearPending('company'); pending.current = null; setError(reason instanceof Error ? reason.message : 'Check the company name.'); } else setError('Creation could not be confirmed. Retry uses the same request and cannot create a second company. You can also close this dialog and refresh the customer list.'); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }}><DialogHeader><DialogTitle>{uiT("New customer")}</DialogTitle><DialogDescription>{uiT("Create a separately funded company. You will set up its workspace and owner next.")}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="customer-name">{uiT("Company name")}</Label><Input id="customer-name" required maxLength={200} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></div><p className="text-sm text-muted-foreground">{uiT("Uses the platform currency")}{currency ? ` (${currency})` : ''}{uiT(". New companies start with no funds or approved credit.")}</p>{currencyError && <Alert><AlertDescription>{uiT(currencyError)} <Link to="/admin/settings" className="underline">{uiT("Open Settings")}</Link></AlertDescription></Alert>}{error && <Alert variant="destructive"><AlertDescription>{uiT(error)}</AlertDescription></Alert>}{pending.current && name.trim() !== pending.current.name && <Alert><AlertDescription>{uiT("The previous request may have succeeded. Check the saved list before starting a new request; otherwise you may create a duplicate.")} <Button type="button" variant="outline" onClick={() => { clearPending('company'); pending.current = null; setError(''); setPendingVersion(value => value + 1); }}>{uiT("Start a new request")}</Button></AlertDescription></Alert>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{uiT("Close")}</Button><Button disabled={busy || !ready || !currency || !name.trim() || !!(pending.current && name.trim() !== pending.current.name)}>{busy ? uiT("Creating…") : pending.current ? uiT("Retry creation") : uiT("Create company")}</Button></div></form></DialogContent></Dialog>;
}

/** Compare-and-set approval never posts funds; unknown outcomes require reread. */
function CreditEditor({ token, editor, onClose, onSaved }: { token: string; editor: Editor; onClose: () => void; onSaved: () => void }) {
  const { t: uiT } = useUILocale();
  const { company, account } = editor;
  const openerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const { currency: platformCurrency } = usePlatformCurrency();
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
      {error && <Alert variant="destructive"><AlertDescription>{uiT(error)}</AlertDescription></Alert>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{uiT("Cancel")}</Button><Button type="submit" disabled={pending || uncertain}>{pending ? uiT("Saving…") : uiT("Save credit policy")}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
