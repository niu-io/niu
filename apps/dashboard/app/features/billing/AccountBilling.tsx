import { Empty, EmptyHeader, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { readLocale, useLocale } from '@/shell/ui-locale';
import { amountFromNanos } from '@/lib/money';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { useEffect, useRef, useState } from 'react';
import { IconCoins, IconReceipt, IconRefresh } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { money, amountToNanos, formatUnitAtoms } from '@/lib/money';
import { FormSectionSkeleton, MetricStripSkeleton, TableSkeleton } from '@/components/PageSkeletons';
import { cachedGet, markCachedStale, peekCachedGet, request, VendorRequestError } from '@/features/providers/api';
import TopupFunding, { type UnitBalanceSnapshot } from './TopupFunding';
type Balance = {
  currency: string; balance_nanos: string; available_nanos: string; reserved_nanos: string;
  credit_limit_nanos: string; policy_revision: string; warning_threshold_nanos: string | null; low_balance: boolean;
};
type BalanceTransaction = { id: string; kind: 'funding' | 'charge' | 'refund' | 'funding_reversal' | 'adjustment'; currency: string; amount_nanos: string; created_at: string };
const transactionNames = { funding: 'Top-up', charge: 'Request charge', refund: 'Refund', funding_reversal: 'Payment reversal', adjustment: 'Balance adjustment' };

function validNanos(value:unknown, nonnegative=false):value is string {
 if (typeof value !== 'string' || !/^-?\d{1,19}$/.test(value)) return false;
 const amount=BigInt(value);
 return amount >= (nonnegative ? 0n : -9_223_372_036_854_775_808n) && amount <= 9_223_372_036_854_775_807n;
}
function checkedAccounts(result:{data:Balance[]}):Balance[] {
 if (!Array.isArray(result?.data) || !result.data.every(account => account && /^[A-Z]{3}$/.test(account.currency)
  && validNanos(account.balance_nanos) && validNanos(account.available_nanos)
  && validNanos(account.reserved_nanos,true) && validNanos(account.credit_limit_nanos,true)
  && (account.warning_threshold_nanos===null || validNanos(account.warning_threshold_nanos,true))
  && typeof account.policy_revision==='string' && /^\d{1,20}$/.test(account.policy_revision)
  && BigInt(account.policy_revision)<=18_446_744_073_709_551_615n && typeof account.low_balance==='boolean')) {
  throw new Error('Could not load account balance. Try again.');
 }
 return result.data;
}
function checkedTransactions(result:{data:BalanceTransaction[];next_cursor?:string|null}) {
 if (!Array.isArray(result?.data) || !result.data.every(entry=>entry && typeof entry.id==='string'
  && Object.hasOwn(transactionNames,entry.kind) && /^[A-Z]{3}$/.test(entry.currency)
  && validNanos(entry.amount_nanos) && typeof entry.created_at==='string' && Number.isFinite(Date.parse(entry.created_at)))
  || (result.next_cursor!=null && typeof result.next_cursor!=='string')) {
  throw new Error('Could not load transactions. Try again.');
 }
 return result;
}

export default function AccountBilling({token, organization, canConfigure = false, section = 'all'}: {token: string; organization: string; canConfigure?: boolean; section?: 'all' | 'billing' | 'payments'}) {
 const { t } = useLocale();
 const {currency:platformCurrency, billingMode:platformBillingMode, unit:platformUnit}=usePlatformCurrency();
 const accessGeneration = useRef({token,organization,value:0});
 if (accessGeneration.current.token !== token || accessGeneration.current.organization !== organization) {
  accessGeneration.current = {token,organization,value:accessGeneration.current.value+1};
 }
 const balancePath = `/api/v1/organizations/${organization}/billing/balance`;
 const unitsPath = `/api/v1/organizations/${organization}/billing/units`;
 const txPath = `/api/v1/organizations/${organization}/billing/transactions`;
 const showTransactions = section !== 'payments';
 const readCachedAccounts = (tok: string, path: string) => {
  try {
   const cached = peekCachedGet<{data: Balance[]}>(tok, path);
   return cached ? checkedAccounts(cached) : null;
  } catch {
   return null; // A corrupt cache entry is optional; the fetch below reports failures.
  }
 };
 const readCachedTransactions = (tok: string, path: string) => {
  try {
   const cached = peekCachedGet<{data: BalanceTransaction[]; next_cursor?: string | null}>(tok, path);
   return cached ? checkedTransactions(cached) : null;
  } catch {
   return null; // A corrupt cache entry is optional; the fetch below reports failures.
  }
 };
 const initialAccounts = readCachedAccounts(token, balancePath);
 const initialTx = showTransactions ? readCachedTransactions(token, txPath) : null;
 const [accounts,setAccounts] = useState<Balance[] | null>(() => initialAccounts);
 const [unitSnapshot,setUnitSnapshot] = useState<UnitBalanceSnapshot | null>(() => {
  const cached = peekCachedGet<{data: UnitBalanceSnapshot}>(token, unitsPath);
  return cached?.data && Array.isArray(cached.data.balances) ? cached.data : null;
 });
 const [transactions,setTransactions] = useState<BalanceTransaction[] | null>(() => initialTx?.data ?? null);
 const [accountError,setAccountError] = useState('');
 const [unitSnapshotError,setUnitSnapshotError] = useState(false);
 const [transactionError,setTransactionError] = useState('');
 const [transactionFailure,setTransactionFailure] = useState<'latest' | 'older' | null>(null);
 const [transactionsLoading,setTransactionsLoading] = useState(() => showTransactions && !initialTx);
 const [nextCursor,setNextCursor] = useState<string | null>(() => initialTx?.next_cursor ?? null);
 const [loadingOlder,setLoadingOlder] = useState(false);
 const olderController = useRef<AbortController | null>(null);
 const [revision,setRevision] = useState(0);
 const [refreshing,setRefreshing] = useState(() => !initialAccounts);
 const companyAccess = true;
 const [editing,setEditing] = useState<Balance | null>(null);
 const warningOpener = useRef<HTMLButtonElement | null>(null);
 const [warningEnabled,setWarningEnabled] = useState(false);
 const [threshold,setThreshold] = useState('');
 const [saving,setSaving] = useState(false);
 const [saveError,setSaveError] = useState('');
 const [conflict,setConflict] = useState(false);
 const saveController = useRef<AbortController | null>(null);
 const warningChanged = editing !== null && (warningEnabled !== (editing.warning_threshold_nanos !== null)
  || (warningEnabled && threshold.trim() !== (editing.warning_threshold_nanos === null ? '' : amountFromNanos(editing.warning_threshold_nanos))));
 useEffect(() => () => {saveController.current?.abort();}, [token,organization]);
 const editWarning = (account: Balance) => {
  setEditing(account); setWarningEnabled(account.warning_threshold_nanos !== null);
  setThreshold(account.warning_threshold_nanos === null ? '' : amountFromNanos(account.warning_threshold_nanos));
  setSaveError(''); setConflict(false);
 };
 const saveWarning = async () => {
  if (!editing || !canConfigure || saving || conflict || !warningChanged) return;
  setSaveError(''); setConflict(false);
  let nanos: string | null = null;
  if (warningEnabled && threshold.trim().startsWith('-')) {
   setSaveError('Enter a threshold of zero or greater.'); return;
  }
  try {
   if (warningEnabled) nanos = /^0+(?:\.0{1,9})?$/.test(threshold.trim()) ? '0' : amountToNanos(threshold);
  } catch (error) {setSaveError(error instanceof Error ? error.message : 'Enter a valid amount.');return;}
  const controller = new AbortController(); saveController.current = controller; setSaving(true);
  try {
   await request(token, `/api/v1/organizations/${organization}/billing/accounts/${editing.currency}/warning-threshold`, 'PUT', {warning_threshold_nanos:nanos,expected_revision:editing.policy_revision},controller.signal);
   if (!controller.signal.aborted) {setEditing(null);setRevision(value=>value+1);}
  } catch (error) {
   if (!controller.signal.aborted) {
    const stale = error instanceof VendorRequestError && error.status === 409;
    setConflict(stale);setSaveError(stale ? 'The account policy changed. Reload its current settings before saving.' : error instanceof Error ? error.message : 'Could not save the warning.');
   }
  } finally {if (!controller.signal.aborted) setSaving(false);}
 };
 const reloadWarning = async () => {
  if (!editing || saving) return;
  const controller = new AbortController();saveController.current=controller;setSaving(true);
  try {
   const result = await request<{data:Balance[]}>(token, `/api/v1/organizations/${organization}/billing/balance`, 'GET',undefined,controller.signal);
   if (!controller.signal.aborted) {
    const accounts = checkedAccounts(result);
    setAccounts(accounts);
    const current = accounts.find(account=>account.currency===editing.currency);
    if (current) editWarning(current);else {setEditing(null);setRevision(value=>value+1);}
   }
  } catch (error) {if (!controller.signal.aborted) setSaveError(error instanceof Error ? error.message : 'Could not reload the account.');}
  finally {if (!controller.signal.aborted) setSaving(false);}
 };
 const loadedScope = useRef(`${token}:${organization}`);
 const lastRevision = useRef(0);
 useEffect(() => {
  const controller = new AbortController();
  olderController.current?.abort(); setLoadingOlder(false);
  const nextScope = `${token}:${organization}`;
  if (loadedScope.current !== nextScope) {
   loadedScope.current = nextScope;
   const nextAccounts = readCachedAccounts(token, balancePath);
   const nextUnits = peekCachedGet<{data: UnitBalanceSnapshot}>(token, unitsPath);
   const nextTx = showTransactions ? readCachedTransactions(token, txPath) : null;
   setAccounts(nextAccounts);
   setUnitSnapshot(nextUnits?.data && Array.isArray(nextUnits.data.balances) ? nextUnits.data : null);
   setTransactions(nextTx?.data ?? null);
   setNextCursor(nextTx?.next_cursor ?? null);
   setEditing(null);
  }
  const force = lastRevision.current !== revision;
  lastRevision.current = revision;
  setAccountError(''); setUnitSnapshotError(false); setTransactionError(''); setTransactionFailure(null); setTransactionsLoading(showTransactions);
  setRefreshing(true);
  const creditsConfigured = platformBillingMode === 'credits' || Boolean(platformUnit);
  void cachedGet<{data: Balance[]}>(token, balancePath, { signal: controller.signal, force }).then(r => {if (!controller.signal.aborted) setAccounts(checkedAccounts(r));}).catch(() => {markCachedStale(token, balancePath); if (!controller.signal.aborted) setAccountError('Could not load account balance. Try again.');}).finally(() => {if (!controller.signal.aborted) setRefreshing(false);});
  if (creditsConfigured) {
   void cachedGet<{data: UnitBalanceSnapshot}>(token, unitsPath, { signal: controller.signal, force }).then(r => {if (!controller.signal.aborted && r?.data && Array.isArray(r.data.balances)) setUnitSnapshot(r.data);}).catch(cause => {
    if (controller.signal.aborted) return;
    // 404 means branded credit units are not configured for this organization.
    if (cause instanceof VendorRequestError && cause.status === 404) return;
    setUnitSnapshotError(true);
   });
  }
  if (showTransactions) void cachedGet<{data: BalanceTransaction[]; next_cursor?: string | null}>(token, txPath, { signal: controller.signal, force }).then(r => {if (!controller.signal.aborted) {const result=checkedTransactions(r);setTransactions(result.data);setNextCursor(result.next_cursor ?? null);}}).catch(() => {markCachedStale(token, txPath); if (!controller.signal.aborted) {setTransactionError('Could not load transactions. Try again.');setTransactionFailure('latest');}}).finally(() => {if (!controller.signal.aborted) setTransactionsLoading(false);});
  return () => {controller.abort();olderController.current?.abort();};
 }, [token,organization,balancePath,unitsPath,txPath,revision,showTransactions,platformBillingMode,platformUnit]);
 const loadOlder = async () => {
  if (!nextCursor || loadingOlder || transactionsLoading) return;
  const controller = new AbortController(); olderController.current = controller;
  setLoadingOlder(true); setTransactionError(''); setTransactionFailure(null);
  try {
   const result = await request<{data: BalanceTransaction[];next_cursor: string | null}>(token, `/api/v1/organizations/${organization}/billing/transactions?before=${encodeURIComponent(nextCursor)}`, 'GET', undefined, controller.signal);
   if (controller.signal.aborted) return;
   checkedTransactions(result);
   if (result.next_cursor === nextCursor) throw new Error('Could not advance transaction history.');
   setTransactions(current => {const seen = new Set(current?.map(entry=>entry.id));return [...(current ?? []),...result.data.filter(entry=>!seen.has(entry.id))];});
   setNextCursor(result.next_cursor);
  } catch (error) {if (!controller.signal.aborted) {setTransactionError(error instanceof Error ? error.message : 'Could not load older transactions.');setTransactionFailure('older');}}
  finally {if (!controller.signal.aborted) setLoadingOlder(false);}
 };
 return <div className="billing-balance-content">
 {!accounts && !accountError && (section === 'payments' ? <FormSectionSkeleton fields={2} label={t("Loading payment options…")} /> : <MetricStripSkeleton count={2} label={t("Loading account balance…")} />)}
 {section === 'payments' && accountError && <Alert variant="destructive"><AlertTitle>{t("Payment options unavailable")}</AlertTitle><AlertDescription>{t("Could not load the account data needed for payment options.")}<Button variant="outline" disabled={refreshing} onClick={() => setRevision(value => value + 1)}>{t("Retry payment options")}</Button></AlertDescription></Alert>}
        {companyAccess && section !== 'payments' && Boolean(accounts || accountError || unitSnapshot || unitSnapshotError) && <section aria-label={t("Account balance")} className="billing-account-section">
          <div className="flex items-center justify-between gap-3"><h2>{t("Available credits")}</h2><Button variant="ghost" size="icon" aria-label={t("Refresh account balance")} title={t("Refresh account balance")} disabled={refreshing} onClick={() => setRevision(value => value + 1)}><IconRefresh className="size-4" aria-hidden="true" /></Button></div>
          {accountError && <Alert variant="destructive"><AlertTitle>{t("Account balance unavailable")}</AlertTitle><AlertDescription>{t(accountError)}<Button variant="outline" onClick={() => setRevision(value => value + 1)}>{t("Retry account balance")}</Button></AlertDescription></Alert>}
          {unitSnapshotError && <Alert><AlertTitle>{t("Credits balance unavailable")}</AlertTitle><AlertDescription>{t("Could not refresh the branded Credits balance. The last loaded values are still shown.")}<Button variant="outline" onClick={() => setRevision(value => value + 1)}>{t("Retry Credits balance")}</Button></AlertDescription></Alert>}
          {(unitSnapshot?.billing_mode === 'credits' || platformBillingMode === 'credits' || (Array.isArray(unitSnapshot?.balances) && unitSnapshot.balances.length > 0)) && (() => {
            const groups = Array.isArray(unitSnapshot?.balances) ? unitSnapshot.balances : [];
            const def = unitSnapshot?.definition ?? platformUnit ?? (groups[0] ? { revision: groups[0].definition_revision, name: groups[0].name, display_precision: groups[0].display_precision, atoms_per_unit: '1000000000' } : null);
            const unitName = def?.name ?? t("Credits");
            const prec = def?.display_precision ?? 2;
            const sumField = (field: 'available_atoms' | 'held_atoms' | 'charged_atoms' | 'restored_atoms' | 'expired_atoms' | 'issued_atoms') =>
              groups.reduce((acc, g) => acc + BigInt(g[field] || '0'), 0n);
            const totalAvailable = sumField('available_atoms');
            const totalHeld = sumField('held_atoms');
            const totalCharged = sumField('charged_atoms');
            const totalRestored = sumField('restored_atoms');
            const totalExpired = sumField('expired_atoms');
            const totalIssued = sumField('issued_atoms');
            return <div className="billing-account space-y-4" aria-label={t("Branded Credits balance")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">{(unitSnapshot?.billing_mode ?? platformBillingMode) === 'credits' ? t(`Available to spend (${unitName})`, `可用余额（${unitName}）`) : t(`Recorded ${unitName} balance`, `${unitName} 记账余额`)}</span>
                <Badge variant="secondary">{(unitSnapshot?.billing_mode ?? platformBillingMode) === 'credits' ? t("Active billing unit") : t("Historical unit")}</Badge>
              </div>
              <div>
                <strong className="billing-available">{formatUnitAtoms(totalAvailable, unitName, prec)}</strong>
              </div>
              <dl className="billing-account-details">
                <div><dt>{t("Net issued")}</dt><dd>{formatUnitAtoms(totalIssued, unitName, prec)}</dd></div>
                <div><dt>{t("Held for active requests")}</dt><dd>{formatUnitAtoms(totalHeld, unitName, prec)}</dd></div>
                <div><dt>{t("Consumed (gross charged)")}</dt><dd>{formatUnitAtoms(totalCharged, unitName, prec)}</dd></div>
                {totalRestored > 0n && <div><dt>{t("Restored / refunded")}</dt><dd>{formatUnitAtoms(totalRestored, unitName, prec)}</dd></div>}
                {totalExpired > 0n && <div><dt>{t("Expired")}</dt><dd>{formatUnitAtoms(totalExpired, unitName, prec)}</dd></div>}
              </dl>
            </div>;
          })()}
          {(unitSnapshot?.billing_mode ?? platformBillingMode) !== 'credits' && accounts?.map(account => <div className="billing-account" key={account.currency}>
            <span className="text-muted-foreground">{(unitSnapshot?.billing_mode ?? platformBillingMode) === 'credits' ? t(`Preserved monetary balance (${account.currency})`, `保留的货币余额（${account.currency}）`) : account.currency === platformCurrency ? t("Available to spend") : t("Recorded balance (original currency)")}</span>
            <strong className="billing-available">{money(account.available_nanos, account.currency)}</strong>
            {(account.balance_nanos !== account.available_nanos || BigInt(account.credit_limit_nanos) > 0n || BigInt(account.reserved_nanos) > 0n) && <dl className="billing-account-details">
              {account.balance_nanos !== account.available_nanos && <div><dt>{t("Balance")}</dt><dd>{money(account.balance_nanos, account.currency)}</dd></div>}
              {BigInt(account.credit_limit_nanos) > 0n && <div><dt>{t("Approved credit")}</dt><dd>{money(account.credit_limit_nanos, account.currency)}</dd></div>}
              {BigInt(account.reserved_nanos) > 0n && <div><dt>{t("Reserved for requests")}</dt><dd>{money(account.reserved_nanos, account.currency)}</dd></div>}
            </dl>}
            <div className="flex items-center justify-between gap-3 py-3">
              <div><h3 className="font-medium">{t("Low balance warning")}</h3><p className="text-sm text-muted-foreground">{account.warning_threshold_nanos === null ? t("Disabled") : t(`Below ${money(account.warning_threshold_nanos,account.currency)} · In app`, `低于 ${money(account.warning_threshold_nanos,account.currency)} · 应用内提醒`)}</p></div>
              {canConfigure && account.currency === platformCurrency && <Button variant="ghost" size="sm" aria-label={t(`Configure ${account.currency} low balance warning`, `设置 ${account.currency} 余额提醒`)} onClick={event=>{warningOpener.current=event.currentTarget;editWarning(account);}}>{t("Configure")}</Button>}
            </div>
            {(unitSnapshot?.billing_mode ?? platformBillingMode) !== 'credits' && account.currency === platformCurrency && (BigInt(account.available_nanos) <= 0n
              ? <Alert variant="destructive"><AlertTitle>{t("Insufficient funds")}</AlertTitle><AlertDescription>{canConfigure ? t("Paid requests are paused until funds are added.") : t("Paid requests are paused. Contact your billing administrator to add funds.")}</AlertDescription></Alert>
              : account.low_balance && <Alert><AlertTitle>{t("Low balance")}</AlertTitle><AlertDescription>{t("Your account balance is below the warning threshold. Approved credit is excluded from this warning.")}</AlertDescription></Alert>)}
          </div>)}
          {!accountError && accounts?.length === 0 && (unitSnapshot?.balances.length ?? 0) === 0 && <Empty className="min-h-40 rounded-xl border border-dashed border-border/60 bg-muted/20 py-7"><EmptyHeader><EmptyMedia variant="icon"><IconCoins size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{canConfigure ? t("No prepaid account configured.") : t("No prepaid account configured. Contact your billing administrator.")}</EmptyDescription></EmptyHeader></Empty>}
        </section>}
        {accounts && section !== 'billing' && <TopupFunding key={`funding-${accessGeneration.current.value}`} token={token} organization={organization} canCreate={canConfigure} currencies={accounts.map(account => account.currency)} unitSnapshot={unitSnapshot} onPaid={() => setRevision(value => value + 1)} />}
        {companyAccess && section !== 'payments' && ((accounts?.length ?? 0) > 0 || (transactions?.length ?? 0) > 0 || transactionError) && <section aria-label={t("Recent balance transactions")}>
          <div className="flex items-center justify-between gap-3"><h2>{t("Balance activity")}</h2>{nextCursor && <Button variant="ghost" size="sm" disabled={loadingOlder || transactionsLoading || transactionFailure === 'latest'} onClick={() => void loadOlder()}>{loadingOlder ? t('Loading…', '正在加载…') : t("History")}</Button>}</div>
          {transactionError && <Alert variant="destructive"><AlertTitle>{t("Transactions unavailable")}</AlertTitle><AlertDescription>{t(transactionError)}<Button variant="outline" onClick={() => transactionFailure === 'older' ? void loadOlder() : setRevision(value => value + 1)}>{t("Retry transactions")}</Button></AlertDescription></Alert>}
          {transactions?.length ? <>
            <Table className="billing-transactions"><TableHeader><TableRow><TableHead>{t("Date (UTC)")}</TableHead><TableHead>{t("Type")}</TableHead><TableHead className="text-right">{t("Amount")}</TableHead></TableRow></TableHeader>
              <TableBody>{transactions.map(entry => <TableRow key={entry.id}>
                <TableCell><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString(readLocale(), {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})}</time></TableCell>
                <TableCell>{t(transactionNames[entry.kind])}</TableCell><TableCell className="text-right tabular-nums">{money(entry.amount_nanos, entry.currency)}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </> : !transactionError && (transactionsLoading ? <TableSkeleton columns={3} rows={3} label={t("Loading transactions…")} /> : <Empty className="mt-2 min-h-32 rounded-xl border border-dashed border-border/60 bg-muted/20 py-6"><EmptyHeader><EmptyMedia variant="icon"><IconReceipt size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{t("No transactions yet.")}</EmptyDescription></EmptyHeader></Empty>)}
        </section>}
<Dialog open={editing !== null} onOpenChange={open=>{if (!open && !saving) setEditing(null);}}>
 <DialogContent onCloseAutoFocus={event=>{if(warningOpener.current?.isConnected){event.preventDefault();warningOpener.current.focus();}}}>
  <DialogHeader><DialogTitle>{t("Low balance warning")}</DialogTitle><DialogDescription>{t("Show an in-app warning when your account balance falls below this amount. Credit allowances are excluded.")}</DialogDescription></DialogHeader>
  <form onSubmit={event=>{event.preventDefault();void saveWarning();}} className="grid gap-4">
  <div className="flex items-center gap-3"><Checkbox id="balance-warning-enabled" checked={warningEnabled} disabled={saving} onCheckedChange={value=>setWarningEnabled(value===true)}/><Label htmlFor="balance-warning-enabled">{t("Enable warning", "启用提醒")}</Label></div>
  <div className="grid gap-2"><Label htmlFor="balance-warning-threshold">{t("Threshold (")}{editing?.currency})</Label><Input id="balance-warning-threshold" inputMode="decimal" value={threshold} disabled={!warningEnabled || saving} onChange={event=>setThreshold(event.target.value)}/></div>
  {saveError && <Alert variant="destructive"><AlertDescription>{t(saveError)}{conflict && <Button type="button" variant="outline" disabled={saving} onClick={()=>void reloadWarning()}>{t("Reload current settings")}</Button>}</AlertDescription></Alert>}
  <DialogFooter><Button type="button" variant="ghost" disabled={saving} onClick={()=>setEditing(null)}>{t("Cancel")}</Button><Button type="submit" disabled={saving || conflict || !warningChanged}>{saving ? t('Saving…', '正在保存…') : t("Save")}</Button></DialogFooter>
  </form>
 </DialogContent>
</Dialog>
</div>;
}
