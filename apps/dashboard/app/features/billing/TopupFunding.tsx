import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useLocale } from '@/shell/ui-locale';
import { useMockPayments } from '@/shell/mock-payments';
import { TriangleAlert } from 'lucide-react';
import { currencySymbol } from '@/lib/money';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { IconRefresh, IconReceipt } from '@tabler/icons-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/PageSkeletons';
import { cachedGet, markCachedStale, peekCachedGet, ProviderRequestError, request } from '@/features/providers/api';
import { amountToNanos, formatExactUnitAtoms, formatUnitAtoms, money } from '@/lib/money';

type PaymentGateway = 'epay' | 'stripe' | 'zhifux';
type Availability = { currency: string; payment_gateway: PaymentGateway | null; available: boolean; payment_methods: string[]; unavailable_reason: string | null };
export type TopupCreditsInfo = {
  credit_atoms: string;
  definition_revision: string;
  rule_revision: string;
  name: string;
  display_precision: number;
  atoms_per_unit: string;
};
export type UnitDefinitionSummary = {
  revision: string;
  name: string;
  display_precision: number;
  atoms_per_unit: string;
};
export type UnitPurchaseRuleSummary = {
  revision: string;
  definition_revision: string;
  payment_currency: string;
  numerator: string;
  denominator: string;
};
export type UnitBalanceGroup = {
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
export type UnitBalanceSnapshot = {
  billing_mode: 'currency' | 'credits';
  atoms_per_unit: string;
  definition?: UnitDefinitionSummary | null;
  purchase_rules?: UnitPurchaseRuleSummary[];
  balances: UnitBalanceGroup[];
};
type QuoteResponse = {
  id: string;
  rule_revision: string;
  definition_revision: string;
  payment_currency: string;
  payment_nanos: string;
  credit_atoms: string;
  numerator: string;
  denominator: string;
  name: string;
  display_precision: number;
  atoms_per_unit: string;
  created_at: string;
  expires_at: string;
};
type Topup = { id: string; currency: string; amount_nanos: string; payment_method: string; status: 'pending' | 'paid' | 'closed' | 'reconciliation_required'; checkout_url: string | null; created_at?: string; simulated?: boolean; credits?: TopupCreditsInfo | null };
const names = { pending: 'Awaiting payment', paid: 'Paid', closed: 'Closed', reconciliation_required: 'Checking payment' };
const statusHelp = {
  pending: 'Payment has not been confirmed. Continue the saved checkout if available, or check its status before starting another top-up.',
  paid: 'Payment is confirmed. The credits are recorded in your shared account balance.',
  closed: 'This checkout ended without a confirmed payment. No funds were added. You can start a new top-up.',
  reconciliation_required: 'The payment is being verified. Credits may not yet be available. Check its status before starting another top-up.',
};
const methodName = (method: string) => ({ card: 'Card', wxpaynative: 'WeChat Pay', alipay: 'Alipay' }[method] ?? method);
/** Poll a pending checkout without contacting the merchant; paid status still comes only from the backend. */
export const TOPUP_STATUS_POLL_MS = 5000;
type PaymentLaunch = 'opened' | 'fallback' | 'unavailable';
function checkedTopup(value: Topup): Topup {
  if (!value || typeof value.id !== 'string' || !value.id || typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)
    || typeof value.amount_nanos !== 'string' || !/^[0-9]{1,19}$/.test(value.amount_nanos)
    || BigInt(value.amount_nanos) <= 0n || BigInt(value.amount_nanos) > 9_223_372_036_854_775_807n
    || typeof value.payment_method !== 'string' || !value.payment_method
    || !Object.hasOwn(names, value.status)
    || (value.checkout_url !== null && typeof value.checkout_url !== 'string')
    || (value.created_at !== undefined && (typeof value.created_at !== 'string' || !Number.isFinite(Date.parse(value.created_at))))) {
    throw new Error('Invalid saved top-up');
  }
  return value;
}
function checkedHistory(page: { data: Topup[]; next_cursor: string | null }) {
  if (!Array.isArray(page.data) || (page.next_cursor !== null && (typeof page.next_cursor !== 'string' || !page.next_cursor))) throw new Error('Invalid payment history');
  page.data.forEach(checkedTopup);
  return page;
}
function checkoutLink(order: Topup) {
  if (order.status !== 'pending' || !order.checkout_url) return null;
  try {
    const url = new URL(order.checkout_url);
    const hostedMock = url.origin === window.location.origin && /^\/api\/plugins\/v1\/mock-payments\/checkout\/[a-f0-9]{48}$/.test(url.pathname) && !url.search;
    const mock = hostedMock || import.meta.env.DEV && url.protocol === 'http:' && url.hostname === '127.0.0.1' && !!url.port && /^\/checkout\/[a-f0-9]{48}$/.test(url.pathname) && !url.search;
    return (url.protocol === 'https:' || mock) && !url.username && !url.password && !url.hash ? url.href : null;
  } catch { return null; }
}

/** Company payment workflow; the backend owns intent, history and settlement. */
export default function TopupFunding({ token, organization, canCreate, unitSnapshot, onPaid }: { token: string; organization: string; canCreate: boolean; currencies?: string[]; unitSnapshot?: UnitBalanceSnapshot | null; onPaid: () => void }) {
  const { t: uiT, format: uiF } = useUILocale();
 const { t } = useLocale();
  const {currency, billingMode: platformBillingMode, unit: platformUnit} = usePlatformCurrency();
  const effectiveBillingMode = unitSnapshot?.billing_mode ?? platformBillingMode;
  const activeUnit = unitSnapshot?.definition ?? platformUnit;
  const mockEnabled = useMockPayments();
  const methodsPath = `/api/v1/organizations/${organization}/billing/payment-methods${currency ? '?currency=' + encodeURIComponent(currency) : ''}`;
  const topupsPath = `/api/v1/organizations/${organization}/billing/topups`;
  const readCachedAvailability = () => {
    try {
      const methods = peekCachedGet<{ data: Availability }>(token, methodsPath);
      if (!methods || !Array.isArray(methods.data?.payment_methods) || typeof methods.data.available !== 'boolean') return null;
      if (typeof methods.data.currency !== 'string' || !/^[A-Z]{3}$/.test(methods.data.currency) || (methods.data.available && !['epay', 'stripe', 'zhifux'].includes(methods.data.payment_gateway ?? ''))) return null;
      if (currency && methods.data.currency !== currency) return null;
      return methods.data;
    } catch {
      return null;
    }
  };
  const readCachedTopups = () => {
    try {
      const cached = peekCachedGet<{ data: Topup[]; next_cursor: string | null }>(token, topupsPath);
      return cached ? checkedHistory(cached) : null;
    } catch {
      return null;
    }
  };
  const initialAvailability = readCachedAvailability();
  const initialTopups = readCachedTopups();
  const [availability, setAvailability] = useState<Availability | null>(() => initialAvailability);
  const activeRule = unitSnapshot?.purchase_rules?.find(r => r.payment_currency === (availability?.currency || currency)) ?? null;
  const [orders, setOrders] = useState<Topup[]>(() => initialTopups?.data ?? []);
  const [next, setNext] = useState<string | null>(() => initialTopups?.next_cursor ?? null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(() => !initialAvailability || !initialTopups);
  const [loadFailure, setLoadFailure] = useState<'latest' | 'older' | null>(null);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(() => initialAvailability?.payment_methods[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Topup | null>(null);
  const [paymentLaunch, setPaymentLaunch] = useState<PaymentLaunch | null>(null);
  const intent = useRef<{ currency: string; payment_gateway: PaymentGateway; amount_nanos: string; payment_method: string; idempotency_key: string; quote_id?: string; quote_idempotency_key?: string } | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const older = useRef<AbortController | null>(null);
  const poll = useRef<AbortController | null>(null);
  const paymentWindow = useRef<Window | null>(null);
  const paymentWindowReady = useRef(false);
  const paidSeen = useRef(new Set<string>());
  const lastRevision = useRef(0);
  useEffect(() => () => {
    mutation.current?.abort(); older.current?.abort(); poll.current?.abort();
    // Close a tab that never received a checkout URL; a navigated payment tab belongs to the customer.
    if (paymentWindow.current && !paymentWindowReady.current) { try { paymentWindow.current.close(); } catch { /* The window may already be gone. */ } }
  }, [token, organization]);
  useEffect(() => {
    const controller = new AbortController();
    const force = lastRevision.current !== revision;
    lastRevision.current = revision;
    setLoadError(''); setLoadFailure(null); setLoading(true);
    void Promise.allSettled([
      cachedGet<{ data: Availability }>(token, methodsPath, { signal: controller.signal, force }),
      cachedGet<{ data: Topup[]; next_cursor: string | null }>(token, topupsPath, { signal: controller.signal, force }),
    ]).then(([methodsResult, historyResult]) => {
      if (controller.signal.aborted) return;
      let failed = false;
      try {
        if (methodsResult.status === 'rejected') throw methodsResult.reason;
        const methods = methodsResult.value;
        if (!Array.isArray(methods.data?.payment_methods) || typeof methods.data.available !== 'boolean') throw new Error('Invalid payment response');
        if (typeof methods.data.currency !== 'string' || !/^[A-Z]{3}$/.test(methods.data.currency) || (methods.data.available && !['epay', 'stripe', 'zhifux'].includes(methods.data.payment_gateway ?? ''))) throw new Error('Invalid payment integration');
        if (currency && methods.data.currency !== currency) throw new Error('Mismatched payment currency');
        setAvailability(methods.data);
        setMethod(current => methods.data.payment_methods.includes(current) ? current : methods.data.payment_methods[0] ?? '');
      } catch { markCachedStale(token, methodsPath); failed = true; setAvailability(null); }
      try {
        if (historyResult.status === 'rejected') throw historyResult.reason;
        const history = checkedHistory(historyResult.value);
        setOrders(history.data); setNext(history.next_cursor);
        for (const order of history.data) if (order.status === 'paid' && !paidSeen.current.has(order.id)) { paidSeen.current.add(order.id); onPaid(); }
        setResult(current => current ? history.data.find(order => order.id === current.id) ?? current : current);
      } catch { markCachedStale(token, topupsPath); failed = true; }
      if (failed) { setLoadFailure('latest'); setLoadError('Could not load payment options and saved top-ups.'); }
      setLoading(false);
    });
    return () => controller.abort();
  }, [token, organization, currency, methodsPath, topupsPath, revision]);
  useEffect(() => {
    if (!open || !result || result.status !== 'pending' || busy) return;
    const order = result;
    let inFlight = false;
    const controller = new AbortController();
    poll.current = controller;
    const check = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const response = await request<{ data: Topup }>(token, `/api/v1/organizations/${organization}/billing/topups/${order.id}`, 'GET', undefined, controller.signal);
        checkedTopup(response.data);
        if (response.data.id !== order.id || response.data.currency !== order.currency || response.data.amount_nanos !== order.amount_nanos) throw new Error('Mismatched saved top-up');
        if (controller.signal.aborted) return;
        setResult(current => current?.id === response.data.id ? response.data : current);
        if (response.data.status !== 'pending') {
          setRevision(value => value + 1);
          if (response.data.status === 'paid' && !paidSeen.current.has(response.data.id)) { paidSeen.current.add(response.data.id); onPaid(); }
        }
      } catch { /* Background checks stay quiet; the manual status check reports failures. */ }
      finally { inFlight = false; }
    };
    const timer = window.setInterval(() => void check(), TOPUP_STATUS_POLL_MS);
    const onVisible = () => { if (document.visibilityState !== 'hidden') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible);
      if (poll.current === controller) poll.current = null;
    };
  }, [open, result?.id, result?.status, busy, token, organization]);
  const closePreparedPaymentWindow = () => {
    const opened = paymentWindow.current;
    paymentWindow.current = null; paymentWindowReady.current = false;
    if (opened && !opened.closed) { try { opened.close(); } catch { /* The window may already be gone. */ } }
  };
  /** Open the tab during the submit gesture so the browser allows it; navigate it only after the order is saved. */
  const preparePaymentWindow = () => {
    let opened: Window | null = null;
    try {
      opened = window.open('', '_blank');
      if (opened) {
        try {
          opened.opener = null;
          opened.document.title = 'Niu';
          opened.document.body.textContent = t("Preparing secure payment…");
        } catch { /* A cross-origin or already closed window cannot show the placeholder. */ }
      }
    } catch { opened = null; }
    paymentWindow.current = opened; paymentWindowReady.current = false;
    return opened;
  };
  const create = async () => {
    if (!canCreate || !availability?.available || !availability.payment_gateway || busy || intent.current) return;
    setError('');
    try {
      if (!/^\d+(?:\.\d{1,2})?$/.test(amount.trim())) throw new Error('Invalid amount');
      const amount_nanos = amountToNanos(amount);
      if (!availability.payment_methods.includes(method)) throw new Error('Choose an available payment method.');
      if (effectiveBillingMode === 'credits') {
        if (!activeRule) {
          setError(uiF("No Credits purchase conversion rule is published for {0}.", [availability.currency]));
          return;
        }
        const scaled = BigInt(amount_nanos) * BigInt(activeRule.numerator);
        const denom = BigInt(activeRule.denominator);
        if (scaled % denom !== 0n || scaled / denom <= 0n) {
          setError(uiF("This {0} amount cannot be represented as a whole number of {1} under the active conversion rule.", [availability.currency, activeUnit?.name ?? 'Credits']));
          return;
        }
      }
      intent.current = {
        currency: availability.currency,
        payment_gateway: availability.payment_gateway,
        amount_nanos,
        payment_method: method,
        idempotency_key: crypto.randomUUID(),
        quote_idempotency_key: effectiveBillingMode === 'credits' ? crypto.randomUUID() : undefined,
      };
    } catch { setError(uiF("Enter a positive {0} amount with at most two decimal places and choose a payment method.", [availability.currency])); return; }
    const opened = preparePaymentWindow();
    setPaymentLaunch(null);
    const controller = new AbortController(); mutation.current = controller; setBusy(true);
    try {
      let body: Record<string, unknown> = {
        currency: intent.current.currency,
        payment_gateway: intent.current.payment_gateway,
        amount_nanos: intent.current.amount_nanos,
        payment_method: intent.current.payment_method,
        idempotency_key: intent.current.idempotency_key,
      };
      if (effectiveBillingMode === 'credits' && activeRule && intent.current.quote_idempotency_key) {
        const quoteResp = await request<{ data: QuoteResponse }>(
          token,
          `/api/v1/organizations/${organization}/billing/quotes`,
          'POST',
          {
            rule_revision: activeRule.revision,
            payment_nanos: intent.current.amount_nanos,
            idempotency_key: intent.current.quote_idempotency_key,
          },
          controller.signal,
        );
        intent.current.quote_id = quoteResp.data.id;
        body = { ...body, quote_id: quoteResp.data.id };
      }
      const response = await request<{ data: Topup }>(token, `/api/v1/organizations/${organization}/billing/topups`, 'POST', body, controller.signal);
      checkedTopup(response.data);
      if (response.data.currency !== intent.current.currency || response.data.amount_nanos !== intent.current.amount_nanos || response.data.payment_method !== intent.current.payment_method) throw new Error('Mismatched checkout intent');
      if (!controller.signal.aborted) {
        setResult(response.data); setRevision(value => value + 1);
        const checkout = checkoutLink(response.data);
        if (!checkout) {
          closePreparedPaymentWindow(); setPaymentLaunch('unavailable');
        } else if (opened && !opened.closed) {
          try {
            paymentWindowReady.current = true;
            opened.location.replace(checkout);
            setPaymentLaunch('opened');
          } catch {
            closePreparedPaymentWindow(); setPaymentLaunch('fallback');
          }
        } else {
          closePreparedPaymentWindow(); setPaymentLaunch('fallback');
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        closePreparedPaymentWindow(); setPaymentLaunch(null);
        setError(effectiveBillingMode === 'credits' && !intent.current?.quote_id && cause instanceof Error && cause.message ? cause.message : 'Checkout was not confirmed. Check saved top-ups before starting another payment.');
        setRevision(value => value + 1);
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const loadOlder = async () => {
    if (!next || busy) return;
    const controller = new AbortController(); older.current = controller; setBusy(true); setLoadError(''); setLoadFailure(null);
    try {
      const page = await request<{ data: Topup[]; next_cursor: string | null }>(token, `/api/v1/organizations/${organization}/billing/topups?before=${encodeURIComponent(next)}`, 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      checkedHistory(page);
      if (!Array.isArray(page.data) || page.next_cursor === undefined || page.next_cursor === next) throw new Error('Invalid payment history');
      setOrders(current => [...current, ...page.data.filter(order => !current.some(saved => saved.id === order.id))]); setNext(page.next_cursor);
    } catch { if (!controller.signal.aborted) { setLoadFailure('older'); setLoadError('Could not load older top-ups.'); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const resume = (order: Topup) => { if (busy) return; setResult(order); setPaymentLaunch(null); setError(''); setOpen(true); };
  const checkResult = async () => {
    if (!result || busy) return;
    const controller = new AbortController(); mutation.current = controller; setBusy(true); setError('');
    try {
      const verifyWithMerchant = canCreate && result.status !== 'paid' && result.status !== 'closed';
      const path = `/api/v1/organizations/${organization}/billing/topups/${result.id}`;
      const response = await request<{ data: Topup }>(token, `${path}${verifyWithMerchant ? '/reconcile' : ''}`, verifyWithMerchant ? 'POST' : 'GET', undefined, controller.signal).catch(reason => {
        if (!(reason instanceof ProviderRequestError) || reason.status !== 501) throw reason;
        return request<{ data: Topup }>(token, path, 'GET', undefined, controller.signal);
      });
      checkedTopup(response.data);
      if (response.data.id !== result.id || response.data.currency !== result.currency || response.data.amount_nanos !== result.amount_nanos) throw new Error('Mismatched saved top-up');
      if (!controller.signal.aborted) { setResult(response.data); setRevision(value => value + 1); if (response.data.status === 'paid') onPaid(); }
    } catch { if (!controller.signal.aborted) setError('Could not check payment status. Try again.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const begin = () => { if (busy) return; intent.current = null; setResult(null); setPaymentLaunch(null); setAmount(''); setError(''); setOpen(true); };
  const link = result && checkoutLink(result);
  const previewCreditsAtoms = (() => {
    if (effectiveBillingMode !== 'credits' || !activeRule || !/^\d+(?:\.\d{1,2})?$/.test(amount.trim())) return null;
    try {
      const nanos = BigInt(amountToNanos(amount));
      const scaled = nanos * BigInt(activeRule.numerator);
      const denom = BigInt(activeRule.denominator);
      if (scaled % denom !== 0n) return 'inexact';
      return (scaled / denom).toString();
    } catch {
      return null;
    }
  })();
  const unitPerCurrencyPreview = (() => {
    if (!activeRule || !activeUnit) return null;
    const oneCurrencyNanos = 1_000_000_000n;
    const scaled = oneCurrencyNanos * BigInt(activeRule.numerator);
    const denom = BigInt(activeRule.denominator);
    if (scaled % denom === 0n) {
      return `1 ${activeRule.payment_currency} = ${formatExactUnitAtoms(scaled / denom, activeUnit.name, activeUnit.display_precision)}`;
    }
    return t(`The active rule does not produce a whole-unit rate for 1 ${activeRule.payment_currency}.`, `当前规则无法为 1 ${activeRule.payment_currency} 得出整数单位汇率。`);
  })();
  return <section aria-label={t("Account top-ups")} className="grid gap-3" aria-busy={loading}>
    <div className="flex flex-wrap items-center gap-3">

      {canCreate && availability?.available && <Button disabled={busy} onClick={event => { opener.current = event.currentTarget; begin(); }}>{effectiveBillingMode === 'credits' && activeUnit ? t(`Buy ${activeUnit.name}`, `购买 ${activeUnit.name}`) : t("Add credits")}</Button>}
      {canCreate && availability && !availability.available && <p className="text-sm text-muted-foreground">{availability.unavailable_reason === 'currency_account_missing' ? t(`Online top-ups require a ${availability.currency} account.`, `在线充值需要 ${availability.currency} 账户。`) : <>{t("Online top-ups are currently unavailable.")}{" "}{t("This can mean no payment gateway is configured or the payment service is unavailable. Ask an installation administrator to check payment configuration, then refresh. Existing orders remain available.")}</>}</p>}
      <Button variant="ghost" size="icon-sm" aria-label={t("Refresh top-ups")} title={t("Refresh top-ups")} disabled={busy || loading} onClick={() => setRevision(value => value + 1)}><IconRefresh size={16}/></Button>
    </div>
    {(mockEnabled || orders.some(order => order.simulated || (import.meta.env.DEV && order.checkout_url?.startsWith('http://127.0.0.1:')))) && <Alert className="mock-payment-warning"><TriangleAlert aria-hidden="true"/><AlertTitle className="line-clamp-none">{t("Mock payments · Real model costs")}</AlertTitle><AlertDescription>{t("Top-ups are simulated. LLM requests still incur upstream Provider charges. Do not share this environment’s API keys publicly.")}</AlertDescription></Alert>}
    {loadError && <Alert variant="destructive"><AlertDescription>{t(loadError)}<Button variant="outline" disabled={busy} onClick={() => loadFailure === 'older' ? void loadOlder() : setRevision(value => value + 1)}>{t("Retry top-ups")}</Button></AlertDescription></Alert>}
    {loading && !availability && <TableSkeleton columns={3} rows={3} label={t("Loading payments…")} />}
    {!loading && !loadError && orders.length === 0 && <section aria-labelledby="topup-history-title" className="flex min-h-60 flex-1 flex-col gap-3"><h3 id="topup-history-title" className="font-medium">{t("Payment orders")}</h3><Empty><EmptyHeader><EmptyMedia variant="icon"><IconReceipt aria-hidden="true"/></EmptyMedia><EmptyTitle>{t("No top-ups yet")}</EmptyTitle><EmptyDescription>{t("Track pending, completed and unsuccessful top-ups here.")}</EmptyDescription></EmptyHeader></Empty></section>}
    {orders.length > 0 && <><h3 className="font-medium">{t("Payment orders")}</h3><Table className="table-fixed" aria-label={t("Payment orders")}><TableHeader><TableRow><TableHead className="hidden sm:table-cell">{t("Date (UTC)")}</TableHead><TableHead className="text-right">{t("Amount")}</TableHead><TableHead>{t("Status")}</TableHead><TableHead className="text-right">{t("Actions")}</TableHead></TableRow></TableHeader><TableBody>{orders.map(order => <TableRow key={order.id}><TableCell className="hidden sm:table-cell">{order.created_at ? new Date(order.created_at).toLocaleDateString(readUILocale(), { timeZone: 'UTC' }) : '—'}</TableCell><TableCell className="whitespace-normal text-right tabular-nums [overflow-wrap:anywhere]"><div>{money(order.amount_nanos, order.currency)}</div>{order.credits && <div className="mt-0.5 text-xs text-muted-foreground">{t("Issued:")} {formatUnitAtoms(order.credits.credit_atoms, order.credits.name, order.credits.display_precision)}{formatExactUnitAtoms(order.credits.credit_atoms, order.credits.name, order.credits.display_precision) !== formatUnitAtoms(order.credits.credit_atoms, order.credits.name, order.credits.display_precision) && <> ({formatExactUnitAtoms(order.credits.credit_atoms, order.credits.name, order.credits.display_precision)})</>}</div>}<div className="mt-1 text-xs text-muted-foreground sm:hidden">{order.created_at ? new Date(order.created_at).toLocaleDateString(readUILocale(), { timeZone: 'UTC' }) : '—'}{" "}{uiT("(UTC)")}</div></TableCell><TableCell className="whitespace-normal"><span>{t(names[order.status])}{order.simulated && t(' · Simulated', ' · 模拟支付')}</span></TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" className="h-auto max-w-full whitespace-normal py-2 text-left" disabled={busy} onClick={event => { opener.current = event.currentTarget; resume(order); }}>{checkoutLink(order) ? t("Continue payment") : t("View details")}</Button></TableCell></TableRow>)}</TableBody></Table>{next && <Button variant="ghost" disabled={busy} onClick={() => void loadOlder()}>{t("Older top-ups")}</Button>}</>}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }}><DialogHeader><DialogTitle>{result ? uiT("Top-up") : effectiveBillingMode === 'credits' && activeUnit ? t(`Buy ${activeUnit.name}`, `购买 ${activeUnit.name}`) : t("Add credits")}</DialogTitle><DialogDescription>{result ? money(result.amount_nanos, result.currency) : effectiveBillingMode === 'credits' && activeUnit ? uiF("Purchase {0} with {1}, shared across workspaces.", [activeUnit.name, availability?.currency ?? currency]) : uiF("Add credits to your {0} account balance, shared across workspaces.", [availability?.currency ?? ''])}</DialogDescription></DialogHeader>
      {(mockEnabled || result?.simulated) && <Alert className="mock-payment-warning"><TriangleAlert aria-hidden="true"/><AlertTitle className="line-clamp-none">{t("Simulated funds do not cover real model costs")}</AlertTitle><AlertDescription>{t("LLM requests still incur upstream Provider charges. Simulated funds do not pay for upstream usage.")}</AlertDescription></Alert>}
      {result ? <><p role="status" aria-live="polite">{t(names[result.status])}{result.simulated && t(' · Simulated', ' · 模拟支付')}</p>{result.credits && <p className="text-sm font-medium">{t("Credits bound to order:")} {formatExactUnitAtoms(result.credits.credit_atoms, result.credits.name, result.credits.display_precision)}</p>}<p className="text-sm text-muted-foreground">{t(statusHelp[result.status])}</p>{paymentLaunch && (paymentLaunch === 'unavailable' ? <p role="status" className="text-sm text-destructive">{t("Your order is saved, but no payment page is available. Check its status before starting another top-up.")}</p> : <p role="status" className="text-sm text-muted-foreground">{paymentLaunch === 'opened' ? t("Payment page opened in a new tab. Complete the payment there; this page updates the order automatically.") : t("Your order is saved, but the payment page did not open automatically. Open the payment page to pay. This page updates the order automatically.")}</p>)}{link && <Button asChild variant={paymentLaunch === 'opened' ? 'outline' : 'default'}><a href={link} target="_blank" rel="noopener noreferrer">{t("Open payment page")}</a></Button>}{error && <Alert variant="destructive"><AlertDescription>{t(error)}</AlertDescription></Alert>}<Button variant="outline" disabled={busy} onClick={() => void checkResult()}>{busy ? t("Checking…") : t("Check payment status")}</Button>{result.status === 'closed' && canCreate && availability?.available && <Button disabled={busy} onClick={begin}>{t("Start a new top-up")}</Button>}</> : <form onSubmit={event => { event.preventDefault(); void create(); }} className="grid gap-4">
        <div className="grid gap-2"><Label htmlFor="topup-amount">{t("Amount (")}{currencySymbol(availability?.currency ?? '')})</Label><Input id="topup-amount" inputMode="decimal" autoComplete="off" value={amount} disabled={busy} onChange={event => {setAmount(event.target.value); if(intent.current){intent.current=null; setError('');}}} /></div>
        {effectiveBillingMode === 'credits' && (
          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1" aria-label={t("Credits conversion preview")}>
            <div className="font-medium">{activeUnit ? t(`${activeUnit.name} conversion quote`, `${activeUnit.name} 兑换报价`) : t("Credits conversion quote")}</div>
            {unitPerCurrencyPreview ? <p className="text-muted-foreground">{unitPerCurrencyPreview} {t("(pinned for 15 minutes at checkout)")}</p> : <p className="text-destructive">{t("No purchase conversion rule is published for")} {availability?.currency ?? currency}.</p>}
            {previewCreditsAtoms && previewCreditsAtoms !== 'inexact' && activeUnit && (
              <p className="font-medium text-foreground">{t("You will receive:")} {formatExactUnitAtoms(previewCreditsAtoms, activeUnit.name, activeUnit.display_precision)}</p>
            )}
            {previewCreditsAtoms === 'inexact' && (
              <p className="text-destructive">{t("Entered amount does not convert to a whole-unit quantity.")}</p>
            )}
          </div>
        )}
        <div className="grid gap-2"><Label>{t("Payment method")}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={busy || !!intent.current} aria-label={t("Payment method")}>{method ? t(methodName(method)) : t("Choose a payment method")}</Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={method} onValueChange={setMethod}>{availability?.payment_methods.map(value => <DropdownMenuRadioItem key={value} value={value}>{t(methodName(value))}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
        {error && <Alert variant="destructive"><AlertDescription>{t(error)}</AlertDescription></Alert>}
        <DialogFooter><Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>{t("Close")}</Button>{intent.current ? <Button type="button" variant="outline" disabled={busy} onClick={() => { setOpen(false); setRevision(value => value + 1); }}>{busy ? t("Preparing checkout…") : t("Check saved top-ups")}</Button> : <Button type="submit" disabled={busy || !canCreate || !availability?.available || (effectiveBillingMode === 'credits' && !activeRule)}>{t("Continue")}</Button>}</DialogFooter>
      </form>}
    </DialogContent></Dialog>
  </section>;
}
