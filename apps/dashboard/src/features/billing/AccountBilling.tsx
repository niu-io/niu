import { amountFromNanos } from '@/lib/money';
import { usePlatformCurrency } from '@/app/platform-currency';
import { useEffect, useRef, useState } from 'react';
import { IconRefresh } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { money, amountToNanos, formatExactUnitAtoms, formatUnitAtoms } from '@/lib/money';
import { request, VendorRequestError } from '@/features/providers/api';
import TopupFunding, { type UnitBalanceSnapshot } from './TopupFunding';
const provenanceLabels: Record<'purchased' | 'promotional' | 'simulated', string> = {
  purchased: 'Purchased',
  promotional: 'Promotional',
  simulated: 'Simulated',
};
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
 const {currency:platformCurrency, billingMode:platformBillingMode, unit:platformUnit}=usePlatformCurrency();
 const accessGeneration = useRef({token,organization,value:0});
 if (accessGeneration.current.token !== token || accessGeneration.current.organization !== organization) {
  accessGeneration.current = {token,organization,value:accessGeneration.current.value+1};
 }
 const [accounts,setAccounts] = useState<Balance[] | null>(null);
 const [unitSnapshot,setUnitSnapshot] = useState<UnitBalanceSnapshot | null>(null);
 const [transactions,setTransactions] = useState<BalanceTransaction[] | null>(null);
 const [accountError,setAccountError] = useState('');
 const [transactionError,setTransactionError] = useState('');
 const [transactionFailure,setTransactionFailure] = useState<'latest' | 'older' | null>(null);
 const [transactionsLoading,setTransactionsLoading] = useState(true);
 const [nextCursor,setNextCursor] = useState<string | null>(null);
 const [loadingOlder,setLoadingOlder] = useState(false);
 const olderController = useRef<AbortController | null>(null);
 const [revision,setRevision] = useState(0);
 const [refreshing,setRefreshing] = useState(true);
 const companyAccess = true;
 const showTransactions = section !== 'payments';
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
 const loadedScope = useRef('');
 useEffect(() => {
  const controller = new AbortController();
  olderController.current?.abort(); setLoadingOlder(false);
  const nextScope = `${token}:${organization}`;
  if (loadedScope.current !== nextScope) {
   loadedScope.current = nextScope;
   setAccounts(null); setUnitSnapshot(null); setTransactions(null); setNextCursor(null); setEditing(null);
  }
  setAccountError(''); setTransactionError(''); setTransactionFailure(null); setTransactionsLoading(showTransactions);
  setRefreshing(true);
  const creditsConfigured = platformBillingMode === 'credits' || Boolean(platformUnit);
  void request<{data: Balance[]}>(token, `/api/v1/organizations/${organization}/billing/balance`, 'GET', undefined, controller.signal).then(r => {if (!controller.signal.aborted) setAccounts(checkedAccounts(r));}).catch(e => {if (!controller.signal.aborted) setAccountError(e.message);}).finally(() => {if (!controller.signal.aborted) setRefreshing(false);});
  if (creditsConfigured) {
   void request<{data: UnitBalanceSnapshot}>(token, `/api/v1/organizations/${organization}/billing/units`, 'GET', undefined, controller.signal).then(r => {if (!controller.signal.aborted && r?.data && Array.isArray(r.data.balances)) setUnitSnapshot(r.data);}).catch(() => {});
  }
  if (showTransactions) void request<{data: BalanceTransaction[]; next_cursor?: string | null}>(token, `/api/v1/organizations/${organization}/billing/transactions`, 'GET', undefined, controller.signal).then(r => {if (!controller.signal.aborted) {const result=checkedTransactions(r);setTransactions(result.data);setNextCursor(result.next_cursor ?? null);}}).catch(e => {if (!controller.signal.aborted) {setTransactionError(e.message);setTransactionFailure('latest');}}).finally(() => {if (!controller.signal.aborted) setTransactionsLoading(false);});
  return () => {controller.abort();olderController.current?.abort();};
 }, [token,organization,revision,showTransactions,platformBillingMode,platformUnit]);
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
 {!accounts && !accountError && <p role="status">{section === 'payments' ? 'Loading payment options…' : 'Loading account balance…'}</p>}
 {section === 'payments' && accountError && <Alert variant="destructive"><AlertTitle>Payment options unavailable</AlertTitle><AlertDescription>Could not load the account data needed for payment options.<Button variant="outline" disabled={refreshing} onClick={() => setRevision(value => value + 1)}>Retry payment options</Button></AlertDescription></Alert>}
        {companyAccess && section !== 'payments' && <section aria-label="Account balance" className="billing-account-section">
          <div className="flex items-center justify-between gap-3"><h2>Available credits</h2><Button variant="ghost" size="icon" aria-label="Refresh account balance" title="Refresh account balance" disabled={refreshing} onClick={() => setRevision(value => value + 1)}><IconRefresh className="size-4" aria-hidden="true" /></Button></div>
          {accountError && <Alert variant="destructive"><AlertTitle>Account balance unavailable</AlertTitle><AlertDescription>{accountError}<Button variant="outline" onClick={() => setRevision(value => value + 1)}>Retry account balance</Button></AlertDescription></Alert>}
          {(unitSnapshot?.billing_mode === 'credits' || platformBillingMode === 'credits' || (Array.isArray(unitSnapshot?.balances) && unitSnapshot.balances.length > 0)) && (() => {
            const groups = Array.isArray(unitSnapshot?.balances) ? unitSnapshot.balances : [];
            const def = unitSnapshot?.definition ?? platformUnit ?? (groups[0] ? { revision: groups[0].definition_revision, name: groups[0].name, display_precision: groups[0].display_precision, atoms_per_unit: '1000000000' } : null);
            const unitName = def?.name ?? 'Credits';
            const prec = def?.display_precision ?? 2;
            const sumField = (field: 'available_atoms' | 'held_atoms' | 'charged_atoms' | 'restored_atoms' | 'expired_atoms' | 'issued_atoms') =>
              groups.reduce((acc, g) => acc + BigInt(g[field] || '0'), 0n);
            const totalAvailable = sumField('available_atoms');
            const totalHeld = sumField('held_atoms');
            const totalCharged = sumField('charged_atoms');
            const totalRestored = sumField('restored_atoms');
            const totalExpired = sumField('expired_atoms');
            const totalIssued = sumField('issued_atoms');
            return <div className="billing-account space-y-4" aria-label="Branded Credits balance">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">{(unitSnapshot?.billing_mode ?? platformBillingMode) === 'credits' ? `Available to spend (${unitName})` : `Recorded ${unitName} balance`}</span>
                <Badge variant="secondary">{(unitSnapshot?.billing_mode ?? platformBillingMode) === 'credits' ? 'Active billing unit' : 'Historical unit'}</Badge>
              </div>
              <div>
                <strong className="billing-available">{formatUnitAtoms(totalAvailable, unitName, prec)}</strong>
                <p className="text-xs text-muted-foreground mt-1">Exact available: {formatExactUnitAtoms(totalAvailable, unitName, prec)} ({totalAvailable.toString()} atoms)</p>
              </div>
              <dl className="billing-account-details">
                <div><dt>Net issued</dt><dd>{formatUnitAtoms(totalIssued, unitName, prec)}</dd></div>
                <div><dt>Held for active requests</dt><dd>{formatUnitAtoms(totalHeld, unitName, prec)}</dd></div>
                <div><dt>Consumed (gross charged)</dt><dd>{formatUnitAtoms(totalCharged, unitName, prec)}</dd></div>
                {totalRestored > 0n && <div><dt>Restored / refunded</dt><dd>{formatUnitAtoms(totalRestored, unitName, prec)}</dd></div>}
                {totalExpired > 0n && <div><dt>Expired</dt><dd>{formatUnitAtoms(totalExpired, unitName, prec)}</dd></div>}
              </dl>
              {groups.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Lots by definition & provenance</h3>
                  <Table aria-label="Credits lots by provenance" className="[&_th]:px-2.5 [&_td]:px-2.5 [&_th]:tracking-normal">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Unit &amp; provenance</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Held / Consumed</TableHead>
                        <TableHead className="text-right">Restored / Expired</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groups.map(group => (
                        <TableRow key={`${group.definition_revision}:${group.provenance}`}>
                          <TableCell>
                            <div className="font-medium">{group.name} <span className="text-xs text-muted-foreground">(v{group.definition_revision})</span></div>
                            <Badge variant="outline" className="mt-0.5">{provenanceLabels[group.provenance] ?? group.provenance}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium" title={`${formatExactUnitAtoms(group.available_atoms, group.name, group.display_precision)} (${group.available_atoms} atoms)`}>
                            {formatUnitAtoms(group.available_atoms, group.name, group.display_precision)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                            <div>Held: {formatUnitAtoms(group.held_atoms, group.name, group.display_precision)}</div>
                            <div title={`${formatExactUnitAtoms(group.charged_atoms, group.name, group.display_precision)} (${group.charged_atoms} atoms)`}>
                              Consumed: {formatUnitAtoms(group.charged_atoms, group.name, group.display_precision)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                            <div>Restored: {formatUnitAtoms(group.restored_atoms, group.name, group.display_precision)}</div>
                            <div>Expired: {formatUnitAtoms(group.expired_atoms, group.name, group.display_precision)}</div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Consumption order: Promotional and Simulated lots with the earliest expiration date are consumed first, followed by non-expiring Promotional and Simulated lots, and Purchased lots last (FIFO by issuance).
              </p>
            </div>;
          })()}
          {accounts?.map(account => <div className="billing-account" key={account.currency}>
            <span className="text-muted-foreground">{(unitSnapshot?.billing_mode ?? platformBillingMode) === 'credits' ? `Preserved monetary balance (${account.currency})` : account.currency === platformCurrency ? 'Available to spend' : 'Recorded balance (original currency)'}</span>
            <strong className="billing-available">{money(account.available_nanos, account.currency)}</strong>
            {(account.balance_nanos !== account.available_nanos || BigInt(account.credit_limit_nanos) > 0n || BigInt(account.reserved_nanos) > 0n) && <dl className="billing-account-details">
              {account.balance_nanos !== account.available_nanos && <div><dt>Balance</dt><dd>{money(account.balance_nanos, account.currency)}</dd></div>}
              {BigInt(account.credit_limit_nanos) > 0n && <div><dt>Approved credit</dt><dd>{money(account.credit_limit_nanos, account.currency)}</dd></div>}
              {BigInt(account.reserved_nanos) > 0n && <div><dt>Reserved for requests</dt><dd>{money(account.reserved_nanos, account.currency)}</dd></div>}
            </dl>}
            <div className="flex items-center justify-between gap-3 py-3">
              <div><h3 className="font-medium">Low balance warning</h3><p className="text-sm text-muted-foreground">{account.warning_threshold_nanos === null ? 'Disabled' : `Below ${money(account.warning_threshold_nanos,account.currency)} · In app`}</p></div>
              {canConfigure && account.currency === platformCurrency && <Button variant="ghost" size="sm" aria-label={`Configure ${account.currency} low balance warning`} onClick={event=>{warningOpener.current=event.currentTarget;editWarning(account);}}>Configure</Button>}
            </div>
            {(unitSnapshot?.billing_mode ?? platformBillingMode) !== 'credits' && account.currency === platformCurrency && (BigInt(account.available_nanos) <= 0n
              ? <Alert variant="destructive"><AlertTitle>Insufficient funds</AlertTitle><AlertDescription>{canConfigure ? 'Paid requests are paused until funds are added.' : 'Paid requests are paused. Contact your billing administrator to add funds.'}</AlertDescription></Alert>
              : account.low_balance && <Alert><AlertTitle>Low balance</AlertTitle><AlertDescription>Your account balance is below the warning threshold. Approved credit is excluded from this warning.</AlertDescription></Alert>)}
          </div>)}
          {!accountError && accounts?.length === 0 && (unitSnapshot?.balances.length ?? 0) === 0 && <p className="text-muted-foreground">{canConfigure ? 'No prepaid account configured.' : 'No prepaid account configured. Contact your billing administrator.'}</p>}
        </section>}
        {accounts && section !== 'billing' && <TopupFunding key={`funding-${accessGeneration.current.value}`} token={token} organization={organization} canCreate={canConfigure} currencies={accounts.map(account => account.currency)} unitSnapshot={unitSnapshot} onPaid={() => setRevision(value => value + 1)} />}
        {companyAccess && section !== 'payments' && ((accounts?.length ?? 0) > 0 || (transactions?.length ?? 0) > 0 || transactionError) && <section aria-label="Recent balance transactions">
          <div className="flex items-center justify-between gap-3"><h2>Balance activity</h2>{nextCursor && <Button variant="ghost" size="sm" disabled={loadingOlder || transactionsLoading || transactionFailure === 'latest'} onClick={() => void loadOlder()}>{loadingOlder ? 'Loading…' : 'History'}</Button>}</div>
          {transactionError && <Alert variant="destructive"><AlertTitle>Transactions unavailable</AlertTitle><AlertDescription>{transactionError}<Button variant="outline" onClick={() => transactionFailure === 'older' ? void loadOlder() : setRevision(value => value + 1)}>Retry transactions</Button></AlertDescription></Alert>}
          {transactions?.length ? <>
            <Table className="billing-transactions"><TableHeader><TableRow><TableHead>Date (UTC)</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>{transactions.map(entry => <TableRow key={entry.id}>
                <TableCell><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString(undefined, {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})}</time></TableCell>
                <TableCell>{transactionNames[entry.kind]}</TableCell><TableCell className="text-right">{money(entry.amount_nanos, entry.currency)}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </> : !transactionError && (transactionsLoading ? <p role="status" className="text-muted-foreground">Loading transactions…</p> : <p className="text-muted-foreground">No transactions yet.</p>)}
        </section>}
<Dialog open={editing !== null} onOpenChange={open=>{if (!open && !saving) setEditing(null);}}>
 <DialogContent onCloseAutoFocus={event=>{if(warningOpener.current?.isConnected){event.preventDefault();warningOpener.current.focus();}}}>
  <DialogHeader><DialogTitle>Low balance warning</DialogTitle><DialogDescription>Show an in-app warning when your account balance falls below this amount. Credit allowances are excluded.</DialogDescription></DialogHeader>
  <form onSubmit={event=>{event.preventDefault();void saveWarning();}} className="grid gap-4">
  <div className="flex items-center gap-3"><Checkbox id="balance-warning-enabled" checked={warningEnabled} disabled={saving} onCheckedChange={value=>setWarningEnabled(value===true)}/><Label htmlFor="balance-warning-enabled">Enabled</Label></div>
  <div className="grid gap-2"><Label htmlFor="balance-warning-threshold">Threshold ({editing?.currency})</Label><Input id="balance-warning-threshold" inputMode="decimal" value={threshold} disabled={!warningEnabled || saving} onChange={event=>setThreshold(event.target.value)}/></div>
  {saveError && <Alert variant="destructive"><AlertDescription>{saveError}{conflict && <Button type="button" variant="outline" disabled={saving} onClick={()=>void reloadWarning()}>Reload current settings</Button>}</AlertDescription></Alert>}
  <DialogFooter><Button type="button" variant="ghost" disabled={saving} onClick={()=>setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving || conflict || !warningChanged}>{saving ? 'Saving…' : 'Save'}</Button></DialogFooter>
  </form>
 </DialogContent>
</Dialog>
</div>;
}
