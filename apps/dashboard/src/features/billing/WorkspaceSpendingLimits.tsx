import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { request, VendorRequestError, writeMayHaveCommitted } from '@/features/vendors/api';
import { amountToNanos, money } from '@/lib/money';

type SpendingAccount = { currency: string; committed_nanos: string; limit_nanos: string | null; revision: string | null };
function checked(result: {data: SpendingAccount[]}): SpendingAccount[] {
  const exact = (value: unknown): value is string => typeof value === 'string' && /^\d{1,64}$/.test(value);
  if (!Array.isArray(result?.data) || !result.data.every(row => row && /^[A-Z]{3}$/.test(row.currency)
    && exact(row.committed_nanos) && ((row.limit_nanos === null && row.revision === null)
      || (exact(row.limit_nanos) && BigInt(row.limit_nanos) <= 9223372036854775807n && exact(row.revision) && BigInt(row.revision) > 0n && BigInt(row.revision) <= 9223372036854775807n)))
    || new Set(result.data.map(row => row.currency)).size !== result.data.length) throw new Error('Invalid spending response');
  return result.data;
}

export default function WorkspaceSpendingLimits({token, organization, project, canConfigure, refresh}: {
  token: string; organization: string; project: string; canConfigure: boolean; refresh: number;
}) {
  const base = `/api/v1/organizations/${organization}/projects/${project}/spending-limit`;
  const [accounts, setAccounts] = useState<SpendingAccount[] | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<SpendingAccount | null>(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [reloadRequired, setReloadRequired] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveController = useRef<AbortController | null>(null);
  const readGeneration = useRef(0);
  const cancelFocusCurrency = useRef<string | null>(null);
  const loadedScope = useRef('');
  useEffect(() => () => { saveController.current?.abort(); }, [token, base]);
  useEffect(() => {
    const controller = new AbortController();
    const nextScope = `${token}:${base}`;
    if (loadedScope.current !== nextScope) {
      loadedScope.current = nextScope;
      readGeneration.current += 1;
      setAccounts(null); setEditing(null); setSaved(false); setSaveError(''); setReloadRequired(false);
    }
    const generation = readGeneration.current;
    setLoading(true); setError(false);
    void request<{data: SpendingAccount[]}>(token, base, 'GET', undefined, controller.signal)
      .then(result => {
        if (!controller.signal.aborted && generation === readGeneration.current) {
          setAccounts(checked(result));
          setReloadRequired(false);
        }
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, base, reload, refresh]);
  function edit(account: SpendingAccount) {
    if (reloadRequired || loading || error || saving) return;
    setEditing(account); setAmount(account.limit_nanos === null ? '' : money(account.limit_nanos, account.currency).slice(account.currency.length + 1));
    setSaveError(''); setSaved(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || saving || loading || error || !canConfigure || reloadRequired) return;
    let nanos: string;
    try {
      nanos = /^0+(?:\.0{1,9})?$/.test(amount.trim()) ? '0' : amountToNanos(amount);
      if (BigInt(nanos) < BigInt(editing.committed_nanos)) throw new Error('The limit must cover current charges and reserved requests.');
    } catch (reason) { setSaveError(reason instanceof Error ? reason.message : 'Enter a valid amount.'); return; }
    const controller = new AbortController(); saveController.current = controller;
    setSaving(true); setSaveError('');
    try {
      await request(token, `${base}/${editing.currency}`, 'PUT', {limit_nanos: nanos, expected_revision: editing.revision ?? '0'}, controller.signal);
      if (!controller.signal.aborted) { setEditing(null); setSaved(true); setReload(value => value + 1); }
    } catch (reason) {
      if (!controller.signal.aborted) {
        const stale = reason instanceof VendorRequestError && reason.status === 409;
        const unconfirmed = writeMayHaveCommitted(reason);
        // A read started before this failure cannot confirm the write outcome.
        if (stale || unconfirmed) readGeneration.current += 1;
        setReloadRequired(stale || unconfirmed);
        setSaveError(stale ? 'The limit or reserved spending changed. Reload before editing again.'
          : unconfirmed ? 'Could not confirm the saved spending limit. Reload limits before editing again.'
          : 'Could not save the spending limit. Check your access and current spending, then try again.');
      }
    } finally { if (!controller.signal.aborted) setSaving(false); }
  }
  return <section aria-label="Workspace spending limits" className="mt-8 space-y-4">
    <div><h2>Spending limits</h2><p className="text-muted-foreground">Lifetime limits include charges and reserved requests.</p></div>
    {error && <Alert variant="destructive"><AlertTitle>Spending limits unavailable</AlertTitle><AlertDescription>Could not load this workspace’s spending limits.<Button variant="outline" onClick={() => setReload(value => value + 1)}>Retry spending limits</Button></AlertDescription></Alert>}
    {loading && <p role="status" className="text-muted-foreground">Loading spending limits…</p>}
    {!error && accounts?.length === 0 && !loading && <p className="text-muted-foreground">No billing currency is available yet.</p>}
    {!error && accounts?.map(account => <div key={account.currency} className="space-y-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-medium">{account.currency}</h3><p className="text-sm text-muted-foreground">{account.limit_nanos === null ? 'No workspace limit set.' : `${money(account.committed_nanos, account.currency)} committed of ${money(account.limit_nanos, account.currency)}`}</p></div>
        {canConfigure && editing?.currency !== account.currency && <Button ref={element => { if (element && cancelFocusCurrency.current === account.currency) { cancelFocusCurrency.current = null; element.focus(); } }} variant="outline" size="sm" disabled={saving || loading || reloadRequired} aria-label={`${account.limit_nanos === null ? 'Add' : 'Edit'} ${account.currency} spending limit`} onClick={() => edit(account)}>{account.limit_nanos === null ? 'Add limit' : 'Edit limit'}</Button>}
      </div>
      {canConfigure && editing?.currency === account.currency && <form onSubmit={save} className="space-y-3 max-w-lg">
        <div className="space-y-2"><Label htmlFor="workspace-spending-amount">Lifetime limit ({account.currency})</Label><Input autoFocus id="workspace-spending-amount" inputMode="decimal" value={amount} disabled={saving || reloadRequired} onChange={event => setAmount(event.target.value)} aria-describedby="workspace-spending-help" required/><p id="workspace-spending-help" className="text-sm text-muted-foreground">No periodic reset. A zero limit blocks new paid requests.</p></div>
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        <div className="flex flex-wrap gap-2">{reloadRequired ? <Button type="button" disabled={loading} onClick={() => {setEditing(null);setReload(value => value + 1);}}>Reload limits</Button> : <Button type="submit" disabled={saving || loading || !amount.trim()}>{saving ? 'Saving…' : 'Save limit'}</Button>}<Button type="button" variant="ghost" disabled={saving || reloadRequired} onClick={() => { cancelFocusCurrency.current = account.currency; setEditing(null); }}>Cancel</Button></div>
      </form>}
    </div>)}
    {saved && <p role="status" className="text-sm text-muted-foreground">Spending limit saved.</p>}
  </section>;
}
