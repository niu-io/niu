import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatExactUnitAtoms, formatUnitAtoms, money, unitAmountFromAtoms, unitAmountToAtoms } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { request } from '@/features/providers/api';

type UnitBalanceGroup = {
  definition_revision: string;
  name: string;
  display_precision: number;
  provenance: 'purchased' | 'promotional' | 'simulated';
  issued_atoms: string;
  held_atoms: string;
  charged_atoms: string;
  restored_atoms: string;
  expired_atoms: string;
  available_atoms: string;
};

type UnitPurchaseSummary = {
  order_id: string;
  created_at: string;
  definition_revision: string;
  name: string;
  display_precision: number;
  provenance: 'purchased' | 'simulated';
  payment_currency: string;
  payment_nanos: string;
  issued_atoms: string;
  reversed_atoms: string;
  available_atoms: string;
};

type UnitRecentCharge = {
  attempt_id: string;
  reference: string;
  charged_at: string;
  model_alias: string;
  definition_revision: string;
  name: string;
  display_precision: number;
  charged_atoms: string;
  restored_atoms: string;
  refundable_atoms: string;
};

type CompanyUnitSnapshot = {
  billing_mode: 'currency' | 'credits';
  atoms_per_unit: string;
  definition: {
    revision: string;
    name: string;
    display_precision: number;
    atoms_per_unit: string;
  } | null;
  balances: UnitBalanceGroup[];
  purchases?: UnitPurchaseSummary[];
  recent_charges?: UnitRecentCharge[];
};

type PurchaseReversalPreview = {
  order_id: string;
  definition_revision: string;
  name: string;
  display_precision: number;
  provenance: 'purchased' | 'simulated';
  payment_currency: string;
  payment_nanos: string;
  issued_atoms: string;
  available_atoms: string;
  requested_atoms: string;
  reversible_atoms: string;
  refund_payment_nanos: string;
  refund_backing_nanos: string;
  residual_credit_atoms: string;
  residual_payment_nanos: string;
  reversals: {
    created_at: string;
    credit_atoms: string;
    refund_payment_nanos: string;
    reason: string;
  }[];
};

export function CompanyBrandedUnitsDialog({
  token,
  organizationId,
  organizationName,
  onClose,
  onChanged,
}: {
  token: string;
  organizationId: string;
  organizationName: string;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<CompanyUnitSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Grant state
  const [grantAmount, setGrantAmount] = useState('50');
  const [grantProvenance, setGrantProvenance] = useState<'promotional' | 'simulated'>('promotional');
  const [grantReason, setGrantReason] = useState('');
  const [grantExpiryDays, setGrantExpiryDays] = useState('');
  const [issuingGrant, setIssuingGrant] = useState(false);

  // Refund state
  const [selectedAttemptId, setSelectedAttemptId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundingCharge, setRefundingCharge] = useState(false);

  // Purchase reversal state
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [reversalPreview, setReversalPreview] = useState<PurchaseReversalPreview | null>(null);
  const [loadingReversal, setLoadingReversal] = useState(false);
  const [reversalReason, setReversalReason] = useState('');
  const [reversingPurchase, setReversingPurchase] = useState(false);

  async function loadSnapshot() {
    setLoading(true);
    setError('');
    try {
      const resp = await request<{ data: CompanyUnitSnapshot }>(
        token,
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/billing/units`,
        'GET',
      );
      const data = resp.data;
      setSnapshot(data);
      const refundable = (data.recent_charges ?? []).find(c => BigInt(c.refundable_atoms) > 0n);
      if (refundable && !selectedAttemptId) {
        setSelectedAttemptId(refundable.attempt_id);
        setRefundAmount(unitAmountFromAtoms(refundable.refundable_atoms));
      }
      const reversibleOrder = (data.purchases ?? []).find(p => BigInt(p.available_atoms) > 0n) ?? data.purchases?.[0];
      if (reversibleOrder && !selectedOrderId) {
        setSelectedOrderId(reversibleOrder.order_id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Company Credits ledger unavailable.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, [token, organizationId]);

  useEffect(() => {
    if (!selectedOrderId) {
      setReversalPreview(null);
      return;
    }
    let cancelled = false;
    setLoadingReversal(true);
    void request<{ data: PurchaseReversalPreview }>(
      token,
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/billing/units/purchases/${encodeURIComponent(selectedOrderId)}/reversals`,
      'GET',
    )
      .then(resp => {
        if (!cancelled) setReversalPreview(resp.data);
      })
      .catch(() => {
        if (!cancelled) setReversalPreview(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingReversal(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, organizationId, selectedOrderId]);

  const unitName = snapshot?.definition?.name ?? 'Niu Credits';
  const precision = snapshot?.definition?.display_precision ?? 2;

  async function handleIssueGrant(event: FormEvent) {
    event.preventDefault();
    if (!snapshot?.definition || issuingGrant) return;
    const reason = grantReason.trim();
    if (!reason) {
      setError('Provide a customer-appropriate grant reason.');
      return;
    }
    let atoms: string;
    try {
      atoms = unitAmountToAtoms(grantAmount, false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a positive grant amount.');
      return;
    }
    let expiresAtMs: string | null = null;
    if (grantExpiryDays.trim()) {
      const days = Number(grantExpiryDays.trim());
      if (!Number.isFinite(days) || days <= 0) {
        setError('Enter a positive number of days for optional grant expiry.');
        return;
      }
      expiresAtMs = String(Date.now() + Math.round(days * 86400 * 1000));
    }

    setIssuingGrant(true);
    setError('');
    setNotice('');
    try {
      await request(
        token,
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/billing/units/grants`,
        'POST',
        {
          definition_revision: snapshot.definition.revision,
          credit_atoms: atoms,
          provenance: grantProvenance,
          reason,
          expires_at_ms: expiresAtMs,
          idempotency_key: crypto.randomUUID(),
        },
      );
      const msg = `Issued ${formatUnitAtoms(atoms, unitName, precision)} (${grantProvenance}) to ${organizationName}.`;
      setNotice(msg);
      setGrantReason('');
      onChanged(msg);
      await loadSnapshot();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not issue noncash Credits grant.');
    } finally {
      setIssuingGrant(false);
    }
  }

  async function handleRefundCharge(event: FormEvent) {
    event.preventDefault();
    if (!selectedAttemptId || refundingCharge) return;
    const reason = refundReason.trim();
    if (!reason) {
      setError('Enter a reason for the Credits charge refund.');
      return;
    }
    let atoms: string;
    try {
      atoms = unitAmountToAtoms(refundAmount, false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a positive Credits refund amount.');
      return;
    }

    setRefundingCharge(true);
    setError('');
    setNotice('');
    try {
      await request(
        token,
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/billing/units/charges/${encodeURIComponent(selectedAttemptId)}/refunds`,
        'POST',
        {
          credit_atoms: atoms,
          reason,
          idempotency_key: crypto.randomUUID(),
        },
      );
      const msg = `Restored ${formatUnitAtoms(atoms, unitName, precision)} from settled charge to ${organizationName}.`;
      setNotice(msg);
      setRefundReason('');
      onChanged(msg);
      await loadSnapshot();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refund Credits charge.');
    } finally {
      setRefundingCharge(false);
    }
  }

  async function handleReversePurchase(event: FormEvent) {
    event.preventDefault();
    if (!selectedOrderId || !reversalPreview || reversingPurchase) return;
    const reason = reversalReason.trim();
    if (!reason) {
      setError('Enter a reason for the Credits purchase reversal.');
      return;
    }
    if (BigInt(reversalPreview.reversible_atoms) <= 0n) {
      setError('No unoccupied processor-representable Credits are available to reverse on this purchase.');
      return;
    }

    setReversingPurchase(true);
    setError('');
    setNotice('');
    try {
      await request(
        token,
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/billing/units/purchases/${encodeURIComponent(selectedOrderId)}/reversals`,
        'POST',
        {
          credit_atoms: reversalPreview.reversible_atoms,
          reason,
          idempotency_key: crypto.randomUUID(),
        },
      );
      const msg = `Reversed ${formatUnitAtoms(reversalPreview.reversible_atoms, unitName, precision)} (${money(reversalPreview.refund_payment_nanos, reversalPreview.payment_currency)}) for ${organizationName}.`;
      setNotice(msg);
      setReversalReason('');
      onChanged(msg);
      await loadSnapshot();
      const updated = await request<{ data: PurchaseReversalPreview }>(
        token,
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/billing/units/purchases/${encodeURIComponent(selectedOrderId)}/reversals`,
        'GET',
      );
      setReversalPreview(updated.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reverse Credits purchase.');
    } finally {
      setReversingPurchase(false);
    }
  }

  const selectedCharge = (snapshot?.recent_charges ?? []).find(c => c.attempt_id === selectedAttemptId) ?? null;
  const selectedPurchase = (snapshot?.purchases ?? []).find(p => p.order_id === selectedOrderId) ?? null;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        className="w-[calc(100vw-2rem)] sm:max-w-5xl max-h-[90dvh] overflow-y-auto"
        style={{ maxWidth: 'min(58rem, calc(100vw - 2rem))' }}
      >
        <DialogHeader>
          <DialogTitle>Manage Branded Credits · {organizationName}</DialogTitle>
          <DialogDescription>
            Inspect exact {unitName} lot balances by provenance, issue promotional or simulated grants, restore settled
            consumption charges, and reverse unoccupied purchase lots at processor minor-unit precision.
          </DialogDescription>
        </DialogHeader>

        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading && !snapshot && <p role="status">Loading company Credits ledger…</p>}

        {snapshot && (
          <div className="space-y-6 min-w-0">
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">1. Exact {unitName} balances by provenance</h3>
                <Badge variant={snapshot.billing_mode === 'credits' ? 'default' : 'outline'}>
                  Mode: {snapshot.billing_mode === 'credits' ? `Branded Credits (${unitName})` : 'Settlement Currency'}
                </Badge>
              </div>
              {snapshot.balances.length > 0 ? (
                <Table
                  aria-label="Company Branded Credits balances"
                  className="[&_th]:px-2.5 [&_td]:px-2.5 [&_th]:tracking-normal"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unit &amp; provenance</TableHead>
                      <TableHead className="text-right">Net issued</TableHead>
                      <TableHead className="text-right">Held / Charged / Restored</TableHead>
                      <TableHead className="text-right">Available ({unitName})</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.balances.map(b => (
                      <TableRow key={`${b.definition_revision}:${b.provenance}`}>
                        <TableCell>
                          <p className="font-medium">
                            {b.name} (v{b.definition_revision})
                          </p>
                          <Badge variant="outline" className="mt-0.5 capitalize">
                            {b.provenance}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          <p className="font-medium text-sm">
                            {formatUnitAtoms(b.issued_atoms, b.name, b.display_precision)}
                          </p>
                          {formatExactUnitAtoms(b.issued_atoms, b.name, b.display_precision) !==
                            formatUnitAtoms(b.issued_atoms, b.name, b.display_precision) && (
                            <p className="text-muted-foreground">
                              {formatExactUnitAtoms(b.issued_atoms, b.name, b.display_precision)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          <p>Held: {formatUnitAtoms(b.held_atoms, b.name, b.display_precision)}</p>
                          <p>Charged: {formatUnitAtoms(b.charged_atoms, b.name, b.display_precision)}</p>
                          {BigInt(b.restored_atoms || '0') > 0n && (
                            <p>Restored: {formatUnitAtoms(b.restored_atoms, b.name, b.display_precision)}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          <p className="font-semibold text-sm">
                            {formatUnitAtoms(b.available_atoms, b.name, b.display_precision)}
                          </p>
                          {formatExactUnitAtoms(b.available_atoms, b.name, b.display_precision) !==
                            formatUnitAtoms(b.available_atoms, b.name, b.display_precision) && (
                            <p className="text-muted-foreground">
                              {formatExactUnitAtoms(b.available_atoms, b.name, b.display_precision)}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-xs text-muted-foreground">No {unitName} lots have been issued for this company yet.</p>
              )}
            </div>

            <div className="space-y-3 rounded-lg bg-muted/30 p-4 min-w-0">
              <div>
                <h3 className="text-sm font-semibold">2. Issue noncash {unitName} grant</h3>
                <p className="text-xs text-muted-foreground">
                  Promotional and simulated grants have zero monetary backing and never create a cash funding receipt.
                </p>
              </div>
              <form className="space-y-3" onSubmit={event => void handleIssueGrant(event)}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="unit-grant-amount">Grant amount ({unitName})</Label>
                    <Input
                      id="unit-grant-amount"
                      inputMode="decimal"
                      value={grantAmount}
                      disabled={issuingGrant || snapshot.billing_mode !== 'credits'}
                      onChange={event => setGrantAmount(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="unit-grant-provenance">Provenance</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          id="unit-grant-provenance"
                          type="button"
                          variant="outline"
                          disabled={issuingGrant || snapshot.billing_mode !== 'credits'}
                          className="w-full justify-between capitalize"
                        >
                          <span>{grantProvenance}</span>
                          <ChevronDown className="size-4 shrink-0" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuRadioGroup
                          value={grantProvenance}
                          onValueChange={v => setGrantProvenance(v as 'promotional' | 'simulated')}
                        >
                          <DropdownMenuRadioItem value="promotional">Promotional</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="simulated">Simulated</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="unit-grant-expiry">Expiry (days, optional)</Label>
                    <Input
                      id="unit-grant-expiry"
                      inputMode="numeric"
                      placeholder="No expiry"
                      value={grantExpiryDays}
                      disabled={issuingGrant || snapshot.billing_mode !== 'credits'}
                      onChange={event => setGrantExpiryDays(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unit-grant-reason">Reason</Label>
                  <Input
                    id="unit-grant-reason"
                    value={grantReason}
                    disabled={issuingGrant || snapshot.billing_mode !== 'credits'}
                    placeholder="Customer onboarding promotional Credits grant"
                    onChange={event => setGrantReason(event.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={issuingGrant || snapshot.billing_mode !== 'credits' || !snapshot.definition}
                >
                  {issuingGrant ? 'Issuing grant…' : `Issue ${unitName} grant`}
                </Button>
              </form>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-lg bg-muted/30 p-4">
                <div>
                  <h3 className="text-sm font-semibold">3. Restore settled {unitName} charge</h3>
                  <p className="text-xs text-muted-foreground">
                    Restores the next unrefunded atom prefix of a settled consumption charge back to its original lot.
                  </p>
                </div>
                {(snapshot.recent_charges ?? []).length > 0 ? (
                  <form className="space-y-3" onSubmit={event => void handleRefundCharge(event)}>
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-refund-charge">Settled charge</Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            id="unit-refund-charge"
                            type="button"
                            variant="outline"
                            disabled={refundingCharge}
                            className="w-full justify-between text-left"
                          >
                            <span className="truncate">
                              {selectedCharge
                                ? `${selectedCharge.reference} · ${selectedCharge.model_alias} · ${formatUnitAtoms(selectedCharge.refundable_atoms, selectedCharge.name, selectedCharge.display_precision)} refundable`
                                : 'Choose settled charge'}
                            </span>
                            <ChevronDown className="size-4 shrink-0" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-96 max-w-[calc(100vw-3rem)] max-h-64 overflow-y-auto">
                          <DropdownMenuRadioGroup
                            value={selectedAttemptId}
                            onValueChange={val => {
                              setSelectedAttemptId(val);
                              const found = snapshot.recent_charges?.find(c => c.attempt_id === val);
                              if (found) setRefundAmount(unitAmountFromAtoms(found.refundable_atoms));
                            }}
                          >
                            {(snapshot.recent_charges ?? []).map(charge => (
                              <DropdownMenuRadioItem key={charge.attempt_id} value={charge.attempt_id}>
                                {charge.reference} · {charge.model_alias} ·{' '}
                                {formatUnitAtoms(charge.refundable_atoms, charge.name, charge.display_precision)} refundable
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-refund-amount">Restore amount ({unitName})</Label>
                      <Input
                        id="unit-refund-amount"
                        inputMode="decimal"
                        value={refundAmount}
                        disabled={refundingCharge || !selectedCharge}
                        onChange={event => setRefundAmount(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-refund-reason">Reason</Label>
                      <Input
                        id="unit-refund-reason"
                        value={refundReason}
                        disabled={refundingCharge || !selectedCharge}
                        placeholder="Service quality credit restoration"
                        onChange={event => setRefundReason(event.target.value)}
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={
                        refundingCharge ||
                        !selectedCharge ||
                        BigInt(selectedCharge.refundable_atoms) <= 0n
                      }
                    >
                      {refundingCharge ? 'Restoring…' : `Restore ${unitName} charge`}
                    </Button>
                  </form>
                ) : (
                  <p className="text-xs text-muted-foreground">No settled {unitName} charges recorded for this company.</p>
                )}
              </div>

              <div className="space-y-3 rounded-lg bg-muted/30 p-4">
                <div>
                  <h3 className="text-sm font-semibold">4. Reverse unoccupied {unitName} purchase</h3>
                  <p className="text-xs text-muted-foreground">
                    Reverses unoccupied purchase ranges at exact processor minor-unit precision without discarding
                    residual atoms.
                  </p>
                </div>
                {(snapshot.purchases ?? []).length > 0 ? (
                  <form className="space-y-3" onSubmit={event => void handleReversePurchase(event)}>
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-reverse-order">Settled purchase lot</Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            id="unit-reverse-order"
                            type="button"
                            variant="outline"
                            disabled={reversingPurchase}
                            className="w-full justify-between text-left"
                          >
                            <span className="truncate">
                              {selectedPurchase
                                ? `${new Date(selectedPurchase.created_at).toLocaleDateString()} · ${money(selectedPurchase.payment_nanos, selectedPurchase.payment_currency)} · ${formatUnitAtoms(selectedPurchase.available_atoms, selectedPurchase.name, selectedPurchase.display_precision)} available`
                                : 'Choose purchase lot'}
                            </span>
                            <ChevronDown className="size-4 shrink-0" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-96 max-w-[calc(100vw-3rem)] max-h-64 overflow-y-auto">
                          <DropdownMenuRadioGroup value={selectedOrderId} onValueChange={setSelectedOrderId}>
                            {(snapshot.purchases ?? []).map(p => (
                              <DropdownMenuRadioItem key={p.order_id} value={p.order_id}>
                                {new Date(p.created_at).toLocaleDateString()} ·{' '}
                                {money(p.payment_nanos, p.payment_currency)} ({p.provenance}) ·{' '}
                                {formatUnitAtoms(p.available_atoms, p.name, p.display_precision)} available
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {loadingReversal && <p className="text-xs text-muted-foreground">Evaluating processor refund preview…</p>}
                    {reversalPreview && (
                      <div className="rounded border bg-background p-2.5 text-xs space-y-1">
                        <p>
                          <span className="text-muted-foreground">Reversible unoccupied:</span>{' '}
                          <span className="font-medium">
                            {formatUnitAtoms(
                              reversalPreview.reversible_atoms,
                              reversalPreview.name,
                              reversalPreview.display_precision,
                            )}
                          </span>{' '}
                          ({formatExactUnitAtoms(reversalPreview.reversible_atoms, reversalPreview.name)})
                        </p>
                        <p>
                          <span className="text-muted-foreground">Processor-precision refund:</span>{' '}
                          <span className="font-medium">
                            {money(reversalPreview.refund_payment_nanos, reversalPreview.payment_currency)}
                          </span>{' '}
                          ({reversalPreview.provenance})
                        </p>
                        <p className="text-muted-foreground">
                          Residual unrepresentable:{' '}
                          {formatExactUnitAtoms(reversalPreview.residual_credit_atoms, reversalPreview.name)} /{' '}
                          {money(reversalPreview.residual_payment_nanos, reversalPreview.payment_currency)}
                        </p>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="unit-reverse-reason">Reason</Label>
                      <Input
                        id="unit-reverse-reason"
                        value={reversalReason}
                        disabled={reversingPurchase || !reversalPreview}
                        placeholder="Customer requested refund of unused Credits purchase"
                        onChange={event => setReversalReason(event.target.value)}
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={
                        reversingPurchase ||
                        !reversalPreview ||
                        BigInt(reversalPreview.reversible_atoms) <= 0n
                      }
                    >
                      {reversingPurchase ? 'Reversing purchase…' : 'Reverse unoccupied purchase'}
                    </Button>
                  </form>
                ) : (
                  <p className="text-xs text-muted-foreground">No settled {unitName} purchase orders for this company.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
