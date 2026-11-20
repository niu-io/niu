import { readLocale as readUILocale, translateUI, useLocale as useUILocale } from '@/shell/ui-locale';
import { MetricStripSkeleton } from '@/components/PageSkeletons';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  IconArrowBackUp,
  IconArrowLeft,
  IconChevronDown,
  IconChevronRight,
  IconGift,
  IconReceiptRefund,
} from '@tabler/icons-react';
import { formatUnitAtoms, money, unitAmountFromAtoms, unitAmountToAtoms } from '@/lib/money';
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
import { ProviderRequestError, request, writeMayHaveCommitted } from '@/features/providers/api';

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

type UnitSummary = {
  key: string;
  name: string;
  precision: number;
  current: boolean;
  issued: bigint;
  held: bigint;
  charged: bigint;
  expired: bigint;
  available: bigint;
};

type View = 'overview' | 'grant' | 'charge' | 'purchase';

const atoms = (value: string | null | undefined) => BigInt(value || '0');
const dateText = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.valueOf())
    ? new Intl.DateTimeFormat(readUILocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
    : translateUI('Date unavailable');
};

/** Group exact lot arithmetic into the unit totals an administrator can read. */
function summarizeBalances(balances: UnitBalanceGroup[], currentRevision: string | undefined): UnitSummary[] {
  const grouped = new Map<string, UnitSummary>();
  for (const balance of balances) {
    const key = `${balance.name}\u0000${balance.display_precision}`;
    const summary = grouped.get(key);
    const isCurrent = Boolean(currentRevision && balance.definition_revision === currentRevision);
    if (summary) {
      summary.current ||= isCurrent;
      summary.issued += atoms(balance.issued_atoms);
      summary.held += atoms(balance.held_atoms);
      summary.charged += atoms(balance.charged_atoms);
      summary.expired += atoms(balance.expired_atoms);
      summary.available += atoms(balance.available_atoms);
    } else {
      grouped.set(key, {
        key,
        name: balance.name,
        precision: balance.display_precision,
        current: isCurrent,
        issued: atoms(balance.issued_atoms),
        held: atoms(balance.held_atoms),
        charged: atoms(balance.charged_atoms),
        expired: atoms(balance.expired_atoms),
        available: atoms(balance.available_atoms),
      });
    }
  }
  return [...grouped.values()].sort(
    (a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name) || a.precision - b.precision,
  );
}

export function CompanyBrandedUnitsDialog({
  token,
  organizationId,
  organizationName,
  returnFocusTo,
  onClose,
  onChanged,
}: {
  token: string;
  organizationId: string;
  organizationName: string;
  returnFocusTo?: HTMLElement | null;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const openerRef = useRef<HTMLElement | null>(
    returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<View>('overview');
  const [snapshot, setSnapshot] = useState<CompanyUnitSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [conflict, setConflict] = useState(false);

  // Grant state. Noncash grants are promotional: purchase credits only come
  // from a completed, independently verified payment.
  const [grantAmount, setGrantAmount] = useState('50');
  const [grantReason, setGrantReason] = useState('');
  const [grantExpiryDays, setGrantExpiryDays] = useState('');
  const [issuingGrant, setIssuingGrant] = useState(false);
  const grantKey = useRef(crypto.randomUUID());

  // Settled-charge refund state.
  const [selectedAttemptId, setSelectedAttemptId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundingCharge, setRefundingCharge] = useState(false);
  const refundKey = useRef(crypto.randomUUID());

  // Purchase reversal state.
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [reversalPreview, setReversalPreview] = useState<PurchaseReversalPreview | null>(null);
  const [loadingReversal, setLoadingReversal] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewRevision, setPreviewRevision] = useState(0);
  const [reversalReason, setReversalReason] = useState('');
  const [reversingPurchase, setReversingPurchase] = useState(false);
  const reversalKey = useRef(crypto.randomUUID());

  const busy = issuingGrant || refundingCharge || reversingPurchase;

  async function loadSnapshot() {
    setLoading(true);
    setLoadError('');
    try {
      const resp = await request<{ data: CompanyUnitSnapshot }>(
        token,
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/billing/units`,
        'GET',
      );
      const data = resp.data;
      setSnapshot(data);
      const refundable = (data.recent_charges ?? []).find(charge => atoms(charge.refundable_atoms) > 0n);
      const keepCharge = (data.recent_charges ?? []).some(
        charge => charge.attempt_id === selectedAttemptId && atoms(charge.refundable_atoms) > 0n,
      );
      setSelectedAttemptId(keepCharge ? selectedAttemptId : refundable?.attempt_id ?? '');
      if (!keepCharge && refundable) {
        setRefundAmount(unitAmountFromAtoms(refundable.refundable_atoms, refundable.display_precision));
      }
      const reversibleOrder = (data.purchases ?? []).find(purchase => atoms(purchase.available_atoms) > 0n);
      const keepOrder = (data.purchases ?? []).some(
        purchase => purchase.order_id === selectedOrderId && atoms(purchase.available_atoms) > 0n,
      );
      setSelectedOrderId(keepOrder ? selectedOrderId : reversibleOrder?.order_id ?? '');
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : uiT("Could not load this customer's credits."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, [token, organizationId]);

  // Move focus with the task, not just with the dialog. The summary is the
  // stable starting point; each focused action begins at its first control.
  useEffect(() => {
    if (view === 'overview') {
      titleRef.current?.focus();
      return;
    }
    const firstControl = view === 'grant' ? 'unit-grant-amount' : view === 'charge' ? 'unit-refund-charge' : 'unit-reverse-order';
    document.getElementById(firstControl)?.focus();
  }, [view]);

  // Preselect a settled charge and initialize its refundable amount only when
  // the administrator enters the refund task, so typed amounts are not reset.
  useEffect(() => {
    if (view !== 'charge' || !selectedAttemptId) return;
    const charge = (snapshot?.recent_charges ?? []).find(entry => entry.attempt_id === selectedAttemptId);
    if (charge) setRefundAmount(unitAmountFromAtoms(charge.refundable_atoms, charge.display_precision));
  }, [view, selectedAttemptId]);

  useEffect(() => {
    if (view !== 'purchase' || !selectedOrderId) {
      setReversalPreview(null);
      setPreviewError('');
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoadingReversal(true);
    setPreviewError('');
    setReversalPreview(null);
    void request<{ data: PurchaseReversalPreview }>(
      token,
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/billing/units/purchases/${encodeURIComponent(selectedOrderId)}/reversals`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(resp => {
        if (!cancelled) setReversalPreview(resp.data);
      })
      .catch(cause => {
        if (!cancelled) setPreviewError(cause instanceof Error ? cause.message : uiT("Could not calculate the refund amount."));
      })
      .finally(() => {
        if (!cancelled) setLoadingReversal(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, organizationId, selectedOrderId, view, previewRevision]);

  const summaries = snapshot ? summarizeBalances(snapshot.balances, snapshot.definition?.revision) : [];
  const unitName = snapshot?.definition?.name ?? summaries[0]?.name ?? uiT("Credits");
  const precision = snapshot?.definition?.display_precision ?? summaries[0]?.precision ?? 2;
  const currentAvailable = (snapshot?.balances ?? [])
    .filter(balance => balance.definition_revision === snapshot?.definition?.revision)
    .reduce((total, balance) => total + atoms(balance.available_atoms), 0n);
  const selectedCharge = (snapshot?.recent_charges ?? []).find(charge => charge.attempt_id === selectedAttemptId) ?? null;
  const selectedPurchase = (snapshot?.purchases ?? []).find(purchase => purchase.order_id === selectedOrderId) ?? null;
  const refundableCharges = (snapshot?.recent_charges ?? []).filter(charge => atoms(charge.refundable_atoms) > 0n);
  const refundablePurchases = (snapshot?.purchases ?? []).filter(purchase => atoms(purchase.available_atoms) > 0n);
  const creditsMode = snapshot?.billing_mode === 'credits' && Boolean(snapshot.definition);

  let grantAfter: string | null = null;
  try {
    grantAfter = formatUnitAtoms(
      currentAvailable + atoms(unitAmountToAtoms(grantAmount, false)),
      unitName,
      precision,
    );
  } catch {
    grantAfter = null;
  }

  function openView(next: View) {
    if (busy) return;
    setActionError('');
    setConflict(false);
    setNotice('');
    setView(next);
  }

  function backToOverview(message?: string) {
    if (busy) return;
    setView('overview');
    setActionError('');
    setConflict(false);
    if (message) setNotice(message);
  }

  function closeDialog() {
    if (busy) return;
    const opener = openerRef.current;
    onClose();
    if (opener?.isConnected) window.setTimeout(() => { if (opener.isConnected) opener.focus(); }, 50);
  }

  async function reloadCurrent() {
    setActionError('');
    setConflict(false);
    await loadSnapshot();
    if (view === 'purchase') setPreviewRevision(value => value + 1);
  }

  function checkedReason(raw: string): string | null {
    const reason = raw.trim();
    if (!reason || [...reason].length > 500 || /[\u0000-\u001f\u007f-\u009f]/.test(reason)) {
      setActionError(uiT("Enter a single-line reason of up to 500 characters."));
      return null;
    }
    return reason;
  }

  function requestFailure(cause: unknown, fallback: string) {
    const stale = cause instanceof ProviderRequestError && cause.status === 409;
    const message = cause instanceof Error ? cause.message : fallback;
    setConflict(stale);
    if (stale) {
      setActionError(uiT("This changed since the dialog opened. Reload the current credits and try again."));
    } else if (writeMayHaveCommitted(cause)) {
      setActionError(
        uiT("The outcome could not be confirmed. Retry with the same details; retrying cannot create a duplicate entry."),
      );
    } else {
      setActionError(message);
    }
  }

  async function handleIssueGrant(event: FormEvent) {
    event.preventDefault();
    if (!snapshot?.definition || issuingGrant) return;
    const reason = checkedReason(grantReason);
    if (!reason) return;
    let creditAtoms: string;
    try {
      creditAtoms = unitAmountToAtoms(grantAmount, false);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : uiT("Enter a positive grant amount."));
      return;
    }
    let expiresAtMs: string | null = null;
    if (grantExpiryDays.trim()) {
      const days = Number(grantExpiryDays.trim());
      if (!Number.isFinite(days) || days <= 0) {
        setActionError(uiT("Enter a positive number of days for the optional expiry."));
        return;
      }
      expiresAtMs = String(Date.now() + Math.round(days * 86400 * 1000));
    }

    setIssuingGrant(true);
    setActionError('');
    setConflict(false);
    setNotice('');
    try {
      await request(
        token,
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/billing/units/grants`,
        'POST',
        {
          definition_revision: snapshot.definition.revision,
          credit_atoms: creditAtoms,
          provenance: 'promotional',
          reason,
          expires_at_ms: expiresAtMs,
          idempotency_key: grantKey.current,
        },
      );
      const message = uiF("Granted {0} to {1}.", [
        formatUnitAtoms(creditAtoms, unitName, precision),
        organizationName,
      ]);
      grantKey.current = crypto.randomUUID();
      setGrantReason('');
      setGrantExpiryDays('');
      setGrantAmount('50');
      onChanged(message);
      backToOverview(message);
      await loadSnapshot();
    } catch (cause) {
      if (!writeMayHaveCommitted(cause)) grantKey.current = crypto.randomUUID();
      requestFailure(cause, uiT("Could not grant credits."));
    } finally {
      setIssuingGrant(false);
    }
  }

  async function handleRefundCharge(event: FormEvent) {
    event.preventDefault();
    if (!selectedCharge || refundingCharge) return;
    const reason = checkedReason(refundReason);
    if (!reason) return;
    let creditAtoms: string;
    try {
      creditAtoms = unitAmountToAtoms(refundAmount, false);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : uiT("Enter a positive refund amount."));
      return;
    }
    if (atoms(creditAtoms) > atoms(selectedCharge.refundable_atoms)) {
      setActionError(
        uiF("Enter no more than {0}.", [
          formatUnitAtoms(selectedCharge.refundable_atoms, selectedCharge.name, selectedCharge.display_precision),
        ]),
      );
      return;
    }

    setRefundingCharge(true);
    setActionError('');
    setConflict(false);
    setNotice('');
    try {
      await request(
        token,
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/billing/units/charges/${encodeURIComponent(selectedCharge.attempt_id)}/refunds`,
        'POST',
        {
          credit_atoms: creditAtoms,
          reason,
          idempotency_key: refundKey.current,
        },
      );
      const message = uiF("Restored {0} to {1}.", [
        formatUnitAtoms(creditAtoms, selectedCharge.name, selectedCharge.display_precision),
        organizationName,
      ]);
      refundKey.current = crypto.randomUUID();
      setRefundReason('');
      setRefundAmount('');
      onChanged(message);
      backToOverview(message);
      await loadSnapshot();
    } catch (cause) {
      if (!writeMayHaveCommitted(cause)) refundKey.current = crypto.randomUUID();
      requestFailure(cause, uiT("Could not refund this charge."));
    } finally {
      setRefundingCharge(false);
    }
  }

  async function handleReversePurchase(event: FormEvent) {
    event.preventDefault();
    if (!selectedOrderId || !reversalPreview || reversingPurchase) return;
    const reason = checkedReason(reversalReason);
    if (!reason) return;
    if (atoms(reversalPreview.reversible_atoms) <= 0n) {
      setActionError(uiT("No unused purchase credits can be refunded."));
      return;
    }

    setReversingPurchase(true);
    setActionError('');
    setConflict(false);
    setNotice('');
    try {
      await request(
        token,
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/billing/units/purchases/${encodeURIComponent(selectedOrderId)}/reversals`,
        'POST',
        {
          credit_atoms: reversalPreview.reversible_atoms,
          reason,
          idempotency_key: reversalKey.current,
        },
      );
      const message = uiF("Refunded {0} ({1}) to {2}.", [
        formatUnitAtoms(reversalPreview.reversible_atoms, reversalPreview.name, reversalPreview.display_precision),
        money(reversalPreview.refund_payment_nanos, reversalPreview.payment_currency),
        organizationName,
      ]);
      reversalKey.current = crypto.randomUUID();
      setReversalReason('');
      onChanged(message);
      backToOverview(message);
      await loadSnapshot();
    } catch (cause) {
      if (!writeMayHaveCommitted(cause)) reversalKey.current = crypto.randomUUID();
      requestFailure(cause, uiT("Could not refund this purchase."));
    } finally {
      setReversingPurchase(false);
    }
  }

  const title = view === 'overview'
    ? uiT("Branded Credits")
    : view === 'grant'
      ? uiT("Grant credits")
      : view === 'charge'
        ? uiT("Refund a charge")
        : uiT("Refund a purchase");
  const description = view === 'overview'
    ? uiF("{0} · Credits balance and adjustments.", [organizationName])
    : view === 'grant'
      ? uiF("Add promotional {0} to {1}. This is not a cash receipt.", [unitName, organizationName])
      : view === 'charge'
        ? uiF("Return unused {0} from a settled request to {1}. This is not a cash refund.", [unitName, organizationName])
        : uiF("Refund unused purchased {0} through the original payment method for {1}.", [unitName, organizationName]);

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) closeDialog(); }}>
      <DialogContent
        className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90dvh] overflow-y-auto"
        showCloseButton={!busy}
        onCloseAutoFocus={event => {
          if (openerRef.current?.isConnected) {
            event.preventDefault();
            openerRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <div className="flex items-start gap-2 pr-6">
            {view !== 'overview' && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-ml-2 shrink-0"
                aria-label={uiT("Back to credits overview")}
                disabled={busy}
                onClick={() => backToOverview()}
              >
                <IconArrowLeft className="size-4" aria-hidden="true" />
              </Button>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <DialogTitle ref={titleRef} tabIndex={-1} className="focus:outline-none">
                {title}
              </DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {notice && view === 'overview' && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {loadError && (
          <Alert variant="destructive">
            <AlertDescription>
              {uiT(loadError)}{" "}
              <Button variant="outline" disabled={loading} onClick={() => void loadSnapshot()}>
                {uiT("Reload credits")}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {loading && !snapshot && <MetricStripSkeleton count={3} label={uiT("Loading credits…")} />}

        {snapshot && view === 'overview' && (
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant={snapshot.billing_mode === 'credits' ? 'secondary' : 'outline'}>
                {snapshot.billing_mode === 'credits' ? uiF("Branded Credits ({0})", [unitName]) : uiT("Settlement Currency")}
              </Badge>
              {loading && <span role="status" className="text-sm text-muted-foreground">{uiT("Refreshing credits…")}</span>}
            </div>

            {snapshot.billing_mode !== 'credits' && (
              <p className="text-sm text-muted-foreground">
                {uiT("This customer now uses settlement currency. Existing credits can still be refunded, but new grants are unavailable.")}
              </p>
            )}

            {summaries.length > 0 ? (
              <div className="space-y-3">
                {summaries.map(summary => (
                  <section key={summary.key} className="min-w-0 rounded-lg bg-muted/30 p-4" aria-label={uiF("{0} balance", [summary.name])}>
                    <p className="text-sm text-muted-foreground">{uiF("{0} balance", [summary.name])}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {formatUnitAtoms(summary.available, summary.name, summary.precision)}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">{uiT("Issued")}</dt>
                        <dd className="tabular-nums">{formatUnitAtoms(summary.issued, summary.name, summary.precision)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{uiT("Held for active requests")}</dt>
                        <dd className="tabular-nums">{formatUnitAtoms(summary.held, summary.name, summary.precision)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{uiT("Consumed")}</dt>
                        <dd className="tabular-nums">{formatUnitAtoms(summary.charged, summary.name, summary.precision)}</dd>
                      </div>
                      {summary.expired > 0n && (
                        <div>
                          <dt className="text-muted-foreground">{uiT("Expired")}</dt>
                          <dd className="tabular-nums">{formatUnitAtoms(summary.expired, summary.name, summary.precision)}</dd>
                        </div>
                      )}
                    </dl>
                  </section>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{uiT("No credits have been issued for this customer yet.")}</p>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-medium">{uiT("Credit actions")}</h3>
              <div className="divide-y overflow-hidden rounded-lg bg-muted/30">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left whitespace-normal"
                  disabled={!creditsMode || busy}
                  onClick={() => openView('grant')}
                >
                  <IconGift className="size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{uiT("Grant credits")}</span>
                    <span className="block text-sm font-normal text-muted-foreground">
                      {creditsMode
                        ? uiT("Add promotional credits without a cash payment.")
                        : uiT("Unavailable while this customer uses settlement currency.")}
                    </span>
                  </span>
                  <IconChevronRight className="size-4 shrink-0" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left whitespace-normal"
                  disabled={!refundableCharges.length || busy}
                  onClick={() => openView('charge')}
                >
                  <IconReceiptRefund className="size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{uiT("Refund a charge")}</span>
                    <span className="block text-sm font-normal text-muted-foreground">
                      {refundableCharges.length
                        ? uiT("Return unused credits from a settled request.")
                        : uiT("No refundable charges.")}
                    </span>
                  </span>
                  <IconChevronRight className="size-4 shrink-0" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left whitespace-normal"
                  disabled={!refundablePurchases.length || busy}
                  onClick={() => openView('purchase')}
                >
                  <IconArrowBackUp className="size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{uiT("Refund a purchase")}</span>
                    <span className="block text-sm font-normal text-muted-foreground">
                      {refundablePurchases.length
                        ? uiT("Reverse unused purchased credits through the original payment method.")
                        : uiT("No purchases to refund.")}
                    </span>
                  </span>
                  <IconChevronRight className="size-4 shrink-0" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" disabled={busy} onClick={closeDialog}>
                {uiT("Close")}
              </Button>
            </div>
          </div>
        )}

        {snapshot && view === 'grant' && (
          <form className="space-y-4" onSubmit={event => void handleIssueGrant(event)}>
            <div className="space-y-1 rounded-lg bg-muted/30 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">{uiT("Available to spend")}</span>
                <span className="font-medium tabular-nums">{formatUnitAtoms(currentAvailable, unitName, precision)}</span>
              </div>
              {grantAfter && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">{uiT("After grant")}</span>
                  <span className="font-medium tabular-nums">{grantAfter}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit-grant-amount">{uiF("Amount ({0})", [unitName])}</Label>
              <Input
                id="unit-grant-amount"
                inputMode="decimal"
                value={grantAmount}
                disabled={issuingGrant}
                onChange={event => { setGrantAmount(event.target.value); setActionError(''); setConflict(false); }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit-grant-expiry">{uiT("Expiry (days, optional)")}</Label>
              <Input
                id="unit-grant-expiry"
                inputMode="numeric"
                placeholder={uiT("No expiry")}
                value={grantExpiryDays}
                disabled={issuingGrant}
                onChange={event => { setGrantExpiryDays(event.target.value); setActionError(''); setConflict(false); }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit-grant-reason">{uiT("Reason")}</Label>
              <Input
                id="unit-grant-reason"
                maxLength={500}
                value={grantReason}
                disabled={issuingGrant}
                placeholder={uiT("Customer onboarding promotional Credits grant")}
                onChange={event => { setGrantReason(event.target.value); setActionError(''); setConflict(false); }}
              />
              <p className="text-sm text-muted-foreground">{uiT("This note appears in the grant history.")}</p>
            </div>
            {actionError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {uiT(actionError)}{" "}
                  {conflict && (
                    <Button type="button" variant="outline" disabled={issuingGrant} onClick={() => void reloadCurrent()}>
                      {uiT("Reload credits")}
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={issuingGrant} onClick={() => backToOverview()}>
                {uiT("Cancel")}
              </Button>
              <Button type="submit" disabled={issuingGrant || !snapshot.definition}>
                {issuingGrant ? uiT("Granting…") : uiT("Grant credits")}
              </Button>
            </div>
          </form>
        )}

        {snapshot && view === 'charge' && (
          refundableCharges.length > 0 ? (
            <form className="space-y-4" onSubmit={event => void handleRefundCharge(event)}>
              <div className="space-y-2">
                <Label htmlFor="unit-refund-charge">{uiT("Settled charge")}</Label>
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
                          ? `${selectedCharge.reference} · ${selectedCharge.model_alias}`
                          : uiT("Choose settled charge")}
                      </span>
                      <IconChevronDown className="size-4 shrink-0" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-96 max-w-[calc(100vw-3rem)] max-h-64 overflow-y-auto">
                    <DropdownMenuRadioGroup
                      value={selectedAttemptId}
                      onValueChange={value => {
                        setSelectedAttemptId(value);
                        setRefundReason('');
                        setActionError('');
                        setConflict(false);
                      }}
                    >
                      {refundableCharges.map(charge => (
                        <DropdownMenuRadioItem key={charge.attempt_id} value={charge.attempt_id}>
                          <span className="min-w-0 whitespace-normal">
                            {charge.reference} · {charge.model_alias} · {dateText(charge.charged_at)} ·{" "}
                            {formatUnitAtoms(charge.refundable_atoms, charge.name, charge.display_precision)}{" "}
                            {uiT("refundable")}
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                {selectedCharge && (
                  <p className="text-sm text-muted-foreground">
                    {uiF("Refundable: {0}", [
                      formatUnitAtoms(selectedCharge.refundable_atoms, selectedCharge.name, selectedCharge.display_precision),
                    ])}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit-refund-amount">{uiF("Refund amount ({0})", [unitName])}</Label>
                <Input
                  id="unit-refund-amount"
                  inputMode="decimal"
                  value={refundAmount}
                  disabled={refundingCharge || !selectedCharge}
                  onChange={event => { setRefundAmount(event.target.value); setActionError(''); setConflict(false); }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit-refund-reason">{uiT("Reason")}</Label>
                <Input
                  id="unit-refund-reason"
                  maxLength={500}
                  value={refundReason}
                  disabled={refundingCharge || !selectedCharge}
                  placeholder={uiT("Service quality credit restoration")}
                  onChange={event => { setRefundReason(event.target.value); setActionError(''); setConflict(false); }}
                />
              </div>
              {actionError && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {uiT(actionError)}{" "}
                    {conflict && (
                      <Button type="button" variant="outline" disabled={refundingCharge} onClick={() => void reloadCurrent()}>
                        {uiT("Reload credits")}
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" disabled={refundingCharge} onClick={() => backToOverview()}>
                  {uiT("Cancel")}
                </Button>
                <Button type="submit" disabled={refundingCharge || !selectedCharge}>
                  {refundingCharge ? uiT("Refunding…") : uiT("Refund charge")}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{uiT("No settled charges are available to refund.")}</p>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => backToOverview()}>{uiT("Back")}</Button>
              </div>
            </div>
          )
        )}

        {snapshot && view === 'purchase' && (
          refundablePurchases.length > 0 ? (
            <form className="space-y-4" onSubmit={event => void handleReversePurchase(event)}>
              <div className="space-y-2">
                <Label htmlFor="unit-reverse-order">{uiT("Purchase to refund")}</Label>
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
                          ? `${dateText(selectedPurchase.created_at)} · ${money(selectedPurchase.payment_nanos, selectedPurchase.payment_currency)}`
                          : uiT("Choose a purchase")}
                      </span>
                      <IconChevronDown className="size-4 shrink-0" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-96 max-w-[calc(100vw-3rem)] max-h-64 overflow-y-auto">
                    <DropdownMenuRadioGroup
                      value={selectedOrderId}
                      onValueChange={value => {
                        setSelectedOrderId(value);
                        setReversalReason('');
                        setActionError('');
                        setConflict(false);
                      }}
                    >
                      {refundablePurchases.map(purchase => (
                        <DropdownMenuRadioItem key={purchase.order_id} value={purchase.order_id}>
                          <span className="min-w-0 whitespace-normal">
                            {dateText(purchase.created_at)} · {money(purchase.payment_nanos, purchase.payment_currency)} ·{" "}
                            {formatUnitAtoms(purchase.available_atoms, purchase.name, purchase.display_precision)}{" "}
                            {uiT("available")}
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {loadingReversal && <p role="status" className="text-sm text-muted-foreground">{uiT("Calculating refund amount…")}</p>}
              {previewError && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {uiT(previewError)}{" "}
                    <Button type="button" variant="outline" disabled={loadingReversal} onClick={() => setPreviewRevision(value => value + 1)}>
                      {uiT("Retry")}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {reversalPreview && (
                <dl className="space-y-2 rounded-lg bg-muted/30 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="text-muted-foreground">{uiT("Refundable credits")}</dt>
                    <dd className="font-medium tabular-nums">
                      {formatUnitAtoms(
                        reversalPreview.reversible_atoms,
                        reversalPreview.name,
                        reversalPreview.display_precision,
                      )}
                    </dd>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="text-muted-foreground">{uiT("Refund to original payment method")}</dt>
                    <dd className="font-medium tabular-nums">
                      {money(reversalPreview.refund_payment_nanos, reversalPreview.payment_currency)}
                    </dd>
                  </div>
                  <p className="text-muted-foreground">
                    {uiT("The payment provider calculates this refund at the original purchase rate.")}
                  </p>
                </dl>
              )}
              {reversalPreview && atoms(reversalPreview.reversible_atoms) === 0n && (
                <p className="text-sm text-muted-foreground">{uiT("No unused purchase credits can be refunded.")}</p>
              )}

              <div className="space-y-2">
                <Label htmlFor="unit-reverse-reason">{uiT("Reason")}</Label>
                <Input
                  id="unit-reverse-reason"
                  maxLength={500}
                  value={reversalReason}
                  disabled={reversingPurchase || !reversalPreview}
                  placeholder={uiT("Customer requested refund of unused Credits purchase")}
                  onChange={event => { setReversalReason(event.target.value); setActionError(''); setConflict(false); }}
                />
              </div>
              {actionError && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {uiT(actionError)}{" "}
                    {conflict && (
                      <Button type="button" variant="outline" disabled={reversingPurchase} onClick={() => void reloadCurrent()}>
                        {uiT("Reload credits")}
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" disabled={reversingPurchase} onClick={() => backToOverview()}>
                  {uiT("Cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={reversingPurchase || !reversalPreview || atoms(reversalPreview.reversible_atoms) <= 0n}
                >
                  {reversingPurchase ? uiT("Refunding…") : uiT("Refund purchase")}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{uiT("No purchases are available to refund.")}</p>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => backToOverview()}>{uiT("Back")}</Button>
              </div>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
