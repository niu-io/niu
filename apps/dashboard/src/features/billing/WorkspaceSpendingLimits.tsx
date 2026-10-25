import { amountFromNanos, amountToNanos, formatExactUnitAtoms, formatUnitAtoms, money, unitAmountFromAtoms, unitAmountToAtoms } from '@/lib/money';
import { usePlatformCurrency } from '@/app/platform-currency';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { request, VendorRequestError, writeMayHaveCommitted } from '@/features/providers/api';

type SpendingAccount = { currency: string; committed_nanos: string; limit_nanos: string | null; revision: string | null };
type WorkspaceUnitLimit = {
  unit: { definition_revision: string; name: string; display_precision: number; atoms_per_unit: string } | null;
  limit_atoms: string | null;
  revision: string | null;
  definition_revision: string | null;
  committed_atoms: string;
  remaining_atoms: string | null;
  monetary_limit_preserved: boolean;
  credits_admission_blocked_by_monetary_limit: boolean;
};
type UnitLimitHistoryEntry = {
  revision: string;
  expected_revision: string;
  definition_revision: string;
  limit_atoms: string | null;
  recorded_at: string;
  actor_kind: string;
  actor_name: string;
};
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
  const {currency:platformCurrency, billingMode:platformBillingMode, unit:platformUnit} = usePlatformCurrency();
  const base = `/api/v1/organizations/${organization}/projects/${project}/spending-limit`;
  const unitBase = `/api/v1/organizations/${organization}/projects/${project}/units/limit`;
  const [accounts, setAccounts] = useState<SpendingAccount[] | null>(null);
  const [unitLimit, setUnitLimit] = useState<WorkspaceUnitLimit | null>(null);
  const [unitHistory, setUnitHistory] = useState<UnitLimitHistoryEntry[]>([]);
  const [editingUnit, setEditingUnit] = useState(false);
  const [unitAmount, setUnitAmount] = useState('');
  const [unitSaving, setUnitSaving] = useState(false);
  const [unitSaveError, setUnitSaveError] = useState('');
  const [unitSaved, setUnitSaved] = useState(false);
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
      setAccounts(null); setUnitLimit(null); setUnitHistory([]); setEditing(null); setEditingUnit(false); setSaved(false); setUnitSaved(false); setSaveError(''); setUnitSaveError(''); setReloadRequired(false);
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
    void request<{data: WorkspaceUnitLimit}>(token, unitBase, 'GET', undefined, controller.signal)
      .then(result => {
        if (!controller.signal.aborted && generation === readGeneration.current && result?.data) {
          setUnitLimit(result.data);
        }
      })
      .catch(() => {});
    void request<{data: UnitLimitHistoryEntry[]}>(token, `${unitBase}/history?limit=10`, 'GET', undefined, controller.signal)
      .then(result => {
        if (!controller.signal.aborted && generation === readGeneration.current && Array.isArray(result?.data)) {
          setUnitHistory(result.data);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [token, base, unitBase, reload, refresh]);
  function edit(account: SpendingAccount) {
    if (reloadRequired || loading || error || saving) return;
    setEditing(account); setAmount(account.limit_nanos === null ? '' : amountFromNanos(account.limit_nanos));
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
  async function saveUnitLimit(limitAtoms: string | null) {
    if (!unitLimit || unitSaving || !canConfigure) return;
    setUnitSaving(true); setUnitSaveError(''); setUnitSaved(false);
    try {
      await request(token, unitBase, 'PUT', {
        limit_atoms: limitAtoms,
        expected_revision: unitLimit.revision ?? '0',
        idempotency_key: crypto.randomUUID(),
      });
      setEditingUnit(false);
      setUnitSaved(true);
      setReload(value => value + 1);
    } catch (reason) {
      setUnitSaveError(reason instanceof Error ? reason.message : 'Could not save the Credits spending limit.');
    } finally {
      setUnitSaving(false);
    }
  }
  function submitUnitLimit(event: FormEvent) {
    event.preventDefault();
    if (!unitLimit) return;
    try {
      const atoms = /^0+(?:\.0{1,9})?$/.test(unitAmount.trim()) ? '0' : unitAmountToAtoms(unitAmount, true);
      if (BigInt(atoms) < BigInt(unitLimit.committed_atoms)) {
        throw new Error('The Credits limit must cover current workspace charges and reserved requests.');
      }
      void saveUnitLimit(atoms);
    } catch (reason) {
      setUnitSaveError(reason instanceof Error ? reason.message : 'Enter a valid Credits amount.');
    }
  }
  const activeUnit = unitLimit?.unit ?? (platformUnit ? { definition_revision: platformUnit.revision, name: platformUnit.name, display_precision: platformUnit.display_precision, atoms_per_unit: platformUnit.atoms_per_unit } : null);
  return <section aria-label="Workspace spending limits" className="mt-8 space-y-4">
    <div><h2>Spending limits</h2><p className="text-muted-foreground">Lifetime limits include charges and reserved requests.</p></div>
    {error && <Alert variant="destructive"><AlertTitle>Spending limits unavailable</AlertTitle><AlertDescription>Could not load this workspace’s spending limits.<Button variant="outline" onClick={() => setReload(value => value + 1)}>Retry spending limits</Button></AlertDescription></Alert>}
    {unitLimit && (activeUnit || platformBillingMode === 'credits' || unitLimit.limit_atoms !== null || BigInt(unitLimit.committed_atoms || '0') > 0n) && (() => {
      const unitName = activeUnit?.name ?? 'Credits';
      const prec = activeUnit?.display_precision ?? 2;
      return <div className="space-y-3 py-2" aria-label="Workspace Credits spending limit">
        {unitLimit.credits_admission_blocked_by_monetary_limit && (
          <Alert variant="destructive">
            <AlertTitle>Credits admission blocked by preserved monetary limit</AlertTitle>
            <AlertDescription>
              This workspace has a preserved monetary spending limit without an explicit {unitName} spending policy. Configure a {unitName} limit or explicitly allow unlimited {unitName} spending to admit Credits requests.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium">{unitName}</h3>
            <p className="text-sm text-muted-foreground">
              {unitLimit.limit_atoms === null
                ? `No workspace ${unitName} limit set (${formatUnitAtoms(unitLimit.committed_atoms, unitName, prec)} committed).`
                : `${formatUnitAtoms(unitLimit.committed_atoms, unitName, prec)} committed of ${formatUnitAtoms(unitLimit.limit_atoms, unitName, prec)}${unitLimit.remaining_atoms !== null ? ` · ${formatUnitAtoms(unitLimit.remaining_atoms, unitName, prec)} remaining` : ''}`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Exact committed: {formatExactUnitAtoms(unitLimit.committed_atoms, unitName, prec)} ({unitLimit.committed_atoms} atoms)
              {unitLimit.limit_atoms !== null && ` · Exact limit: ${formatExactUnitAtoms(unitLimit.limit_atoms, unitName, prec)} (${unitLimit.limit_atoms} atoms)`}
            </p>
          </div>
          {canConfigure && !editingUnit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={unitSaving || loading} onClick={() => { setEditingUnit(true); setUnitAmount(unitLimit.limit_atoms === null ? '' : unitAmountFromAtoms(unitLimit.limit_atoms, prec)); setUnitSaveError(''); setUnitSaved(false); }}>
                {unitLimit.limit_atoms === null ? `Set ${unitName} limit` : `Edit ${unitName} limit`}
              </Button>
              {(unitLimit.limit_atoms !== null || unitLimit.credits_admission_blocked_by_monetary_limit) && (
                <Button variant="ghost" size="sm" disabled={unitSaving || loading} onClick={() => void saveUnitLimit(null)}>
                  Set unlimited
                </Button>
              )}
            </div>
          )}
        </div>
        {canConfigure && editingUnit && (
          <form onSubmit={submitUnitLimit} className="space-y-3 max-w-lg">
            <div className="space-y-2">
              <Label htmlFor="workspace-unit-spending-amount">Lifetime limit ({unitName})</Label>
              <Input autoFocus id="workspace-unit-spending-amount" inputMode="decimal" value={unitAmount} disabled={unitSaving} onChange={event => setUnitAmount(event.target.value)} required />
              <p className="text-sm text-muted-foreground">No periodic reset. A zero limit blocks new paid requests in {unitName}.</p>
            </div>
            {unitSaveError && <p role="alert" className="text-sm text-destructive">{unitSaveError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={unitSaving || !unitAmount.trim()}>{unitSaving ? 'Saving…' : 'Save Credits limit'}</Button>
              <Button type="button" variant="ghost" disabled={unitSaving} onClick={() => setEditingUnit(false)}>Cancel</Button>
            </div>
          </form>
        )}
        {unitSaved && <p role="status" className="text-sm text-muted-foreground">{unitName} spending limit saved.</p>}
        {unitHistory.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium">Policy revision history ({unitHistory.length})</summary>
            <ul className="mt-2 space-y-1">
              {unitHistory.map(item => (
                <li key={item.revision}>
                  Revision {item.revision}: {item.limit_atoms === null ? 'Unlimited' : `${formatExactUnitAtoms(item.limit_atoms, unitName, prec)} (${item.limit_atoms} atoms)`} · {item.actor_name} · {new Date(item.recorded_at).toLocaleString(undefined, { timeZone: 'UTC' })} UTC
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>;
    })()}
    {!platformCurrency && <p className="text-sm text-muted-foreground">Spending limits will be available after the platform currency is configured in Admin.</p>}
    {loading && <p role="status" className="text-muted-foreground">Loading spending limits…</p>}
    {!error && accounts?.length === 0 && !loading && <p className="text-muted-foreground">No billing currency is available yet.</p>}
    {!error && accounts?.filter(account => account.currency === platformCurrency || account.limit_nanos !== null || BigInt(account.committed_nanos) > 0n).map(account => <div key={account.currency} className="space-y-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-medium">{account.currency}</h3><p className="text-sm text-muted-foreground">{account.limit_nanos === null ? 'No workspace limit set.' : `${money(account.committed_nanos, account.currency)} committed of ${money(account.limit_nanos, account.currency)}`}</p></div>
        {canConfigure && account.currency === platformCurrency && editing?.currency !== account.currency && <Button ref={element => { if (element && cancelFocusCurrency.current === account.currency) { cancelFocusCurrency.current = null; element.focus(); } }} variant="outline" size="sm" disabled={saving || loading || reloadRequired} aria-label={`${account.limit_nanos === null ? 'Add' : 'Edit'} ${account.currency} spending limit`} onClick={() => edit(account)}>{account.limit_nanos === null ? 'Add limit' : 'Edit limit'}</Button>}
      </div>
      {canConfigure && account.currency === platformCurrency && editing?.currency === account.currency && <form onSubmit={save} className="space-y-3 max-w-lg">
        <div className="space-y-2"><Label htmlFor="workspace-spending-amount">Lifetime limit ({account.currency})</Label><Input autoFocus id="workspace-spending-amount" inputMode="decimal" value={amount} disabled={saving || reloadRequired} onChange={event => setAmount(event.target.value)} aria-describedby="workspace-spending-help" required/><p id="workspace-spending-help" className="text-sm text-muted-foreground">No periodic reset. A zero limit blocks new paid requests.</p></div>
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        <div className="flex flex-wrap gap-2">{reloadRequired ? <Button type="button" disabled={loading} onClick={() => {setEditing(null);setReload(value => value + 1);}}>Reload limits</Button> : <Button type="submit" disabled={saving || loading || !amount.trim()}>{saving ? 'Saving…' : 'Save limit'}</Button>}<Button type="button" variant="ghost" disabled={saving || reloadRequired} onClick={() => { cancelFocusCurrency.current = account.currency; setEditing(null); }}>Cancel</Button></div>
      </form>}
    </div>)}
    {saved && <p role="status" className="text-sm text-muted-foreground">Spending limit saved.</p>}
  </section>;
}
