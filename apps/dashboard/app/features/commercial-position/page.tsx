import { readLocale, useLocale as useUILocale } from '@/shell/ui-locale';
import { currencySymbol, formatFinancialMoney, formatRateMoney, formatStatementMoney } from '@/lib/money';
import { MetricStripSkeleton, TableSkeleton } from '@/components/PageSkeletons';
import { fetchQuery, peekQuery } from '@/lib/query-cache';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { useLocale } from '@/shell/ui-locale';
import { providerPathSegment } from '@/shell/provider-route';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { IconCoin, IconArrowDownRight, IconArrowUpRight, IconCalendarStats, IconChevronDown, IconFileTypePdf, IconMinus, IconRefresh } from '@tabler/icons-react';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useBranding } from '@/shell/branding';
import { request, VendorRequestError } from '@/features/providers/api';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge'; import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CommercialPosition, CommercialPositionRow, CustomerFinancialSummary } from '@niu-io/sdk/admin';
import {
  buildRecentMonths,
  parseMonthKey,
  resolveInterval,
  type MonthOption,
  type PeriodMode,
  type ResolvedInterval,
} from './period';

export {
  buildRecentMonths,
  parseMonthKey,
  resolveInterval,
  type MonthOption,
  type PeriodMode,
  type ResolvedInterval,
};

async function fetchPeriodBundle(
  token: string,
  currency: string,
  opts: { from: string; until: string },
  signal: AbortSignal,
): Promise<{ position: CommercialPosition; summary: CustomerFinancialSummary }> {
  const query = new URLSearchParams({ currency, from: opts.from, until: opts.until });
  const [position, summary] = await Promise.all([
    request<CommercialPosition>(token, '/api/v1/admin/finance/position?pending_limit=5&' + query, 'GET', undefined, signal),
    request<CustomerFinancialSummary>(token, '/api/v1/admin/finance/summary?' + query, 'GET', undefined, signal),
  ]);
  return { position, summary };
}

function PendingAttempts({ row, from, until, token }: {
  row: CommercialPositionRow; from: string; until: string; token: string;
}) {
  const { t: uiT } = useLocale();
  const first = row.pending_attempts ?? [];
  const [rest, setRest] = useState<typeof first>([]);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    setRest([]); setFinished(false); setLoading(false); setError('');
    return () => pending.current?.abort();
  }, [row]);
  const attempts = [...first, ...rest];
  async function more() {
    if (loading || !attempts.length) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ currency: row.currency, from, until, supplier: row.supplier_id,
        model: row.model_alias, pending_before: attempts[attempts.length - 1].attempt });
      const page = await request<CommercialPosition>(token, '/api/v1/admin/finance/position?' + params, 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      const next = page.data[0]?.pending_attempts ?? [];
      setRest(previous => [...previous, ...next]);
      setFinished(next.length < 50);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : uiT("Could not load requests", "无法加载请求"));
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return <Sheet>
    <SheetTrigger asChild><Button variant="link" size="sm">{uiT("Pending (")}{row.unresolved_attempts} {uiT("unresolved)")}</Button></SheetTrigger>
    <SheetContent className="overflow-y-auto">
      <SheetHeader>
        <SheetTitle>{uiT("Unresolved attempts", "待核对请求")}</SheetTitle>
        <SheetDescription>{row.model_alias} · {row.supplier_name} · {row.currency}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        <ul className="divide-y">{attempts.map(attempt => <li className="space-y-1 py-3" key={attempt.attempt}>
          <code className="break-all text-xs">{attempt.attempt}</code>
          <p className="text-sm">{[
            attempt.execution !== 'confirmed_completed' && uiT("Execution unconfirmed", "执行结果未确认"),
            attempt.usage_confidence !== 'provider_reported' && uiT("Usage unconfirmed", "用量未确认"),
            attempt.charge_missing && uiT("Customer charge missing", "缺少客户扣费"),
            attempt.revenue_source_missing && uiT("Revenue source unverified", "收入来源未核定"),
            attempt.payable_missing && uiT("Supplier payable missing", "缺少采购应付"),
          ].filter(Boolean).join(' · ')}</p>
        </li>)}</ul>
        {error && <p role="alert">{error}</p>}
        {!finished && BigInt(attempts.length) < BigInt(row.unresolved_attempts) &&
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void more()}>{uiT("Load more")}</Button>}
      </div>
    </SheetContent>
  </Sheet>;
}

type CohortAggregates = {
  nominalCharges: bigint;
  refunds: bigint;
  giftAllowance: bigint;
  netRevenue: bigint | null;
  cashApplied: bigint | null;
  unpaidCredit: bigint | null;
  providerPayable: bigint;
  settledPayable: bigint;
  unpaidPayable: bigint;
  recordedUpstreamCost: bigint | null;
  netContribution: bigint | null;
  matchedAttempts: bigint;
  unresolvedAttempts: bigint;
  activeModelCount: number;
};

function aggregateCohort(rows?: CommercialPositionRow[] | null): CohortAggregates {
  let nominalCharges = 0n;
  let refunds = 0n;
  let giftAllowance = 0n;
  let netRevenue = 0n;
  let netRevenueKnown = true;
  let cashApplied = 0n;
  let cashKnown = true;
  let unpaidCredit = 0n;
  let providerPayable = 0n;
  let settledPayable = 0n;
  let unpaidPayable = 0n;
  let recordedUpstreamCost = 0n;
  let hasRecordedUpstreamCost = false;
  let netContribution = 0n;
  let contributionKnown = true;
  let matchedAttempts = 0n;
  let unresolvedAttempts = 0n;
  let activeModelCount = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const hasActivity =
      row.customer_charge_nanos !== null ||
      row.earning_nanos !== null ||
      BigInt(row.matched_attempts || '0') > 0n ||
      BigInt(row.unresolved_attempts || '0') > 0n;
    if (hasActivity) activeModelCount++;

    if (row.customer_charge_nanos !== null) nominalCharges += BigInt(row.customer_charge_nanos);
    if (row.customer_refunds_nanos !== null) refunds += BigInt(row.customer_refunds_nanos);
    if (row.consumed_gift_allowance_nanos !== null) giftAllowance += BigInt(row.consumed_gift_allowance_nanos);

    if (row.customer_charge_nanos !== null) {
      if (row.net_customer_revenue_nanos === null) netRevenueKnown = false;
      else netRevenue += BigInt(row.net_customer_revenue_nanos);

      if (row.customer_cash_applied_nanos === null) cashKnown = false;
      else cashApplied += BigInt(row.customer_cash_applied_nanos);

      if (row.customer_outstanding_credit_nanos !== null) {
        unpaidCredit += BigInt(row.customer_outstanding_credit_nanos);
      }
    }

    if (row.earning_nanos !== null) providerPayable += BigInt(row.earning_nanos);
    if (row.settled_earning_nanos !== null) settledPayable += BigInt(row.settled_earning_nanos);
    if (row.unsettled_earning_nanos !== null) unpaidPayable += BigInt(row.unsettled_earning_nanos);
    if (row.known_upstream_cost_subtotal_nanos !== null) {
      recordedUpstreamCost += BigInt(row.known_upstream_cost_subtotal_nanos);
      hasRecordedUpstreamCost = true;
    }

    if (row.customer_charge_nanos !== null || row.earning_nanos !== null) {
      if (row.net_contribution_nanos === null) {
        contributionKnown = false;
      } else {
        netContribution += BigInt(row.net_contribution_nanos);
      }
    }

    matchedAttempts += BigInt(row.matched_attempts || '0');
    unresolvedAttempts += BigInt(row.unresolved_attempts || '0');
  }

  return {
    nominalCharges,
    refunds,
    giftAllowance,
    netRevenue: netRevenueKnown ? netRevenue : null,
    cashApplied: cashKnown ? cashApplied : null,
    unpaidCredit: cashKnown ? unpaidCredit : null,
    providerPayable,
    settledPayable,
    unpaidPayable,
    recordedUpstreamCost: hasRecordedUpstreamCost ? recordedUpstreamCost : null,
    netContribution: contributionKnown && unresolvedAttempts === 0n ? netContribution : null,
    matchedAttempts,
    unresolvedAttempts,
    activeModelCount,
  };
}

function formatMarginPercent(contribution: bigint | null, revenue: bigint | null): string {
  if (contribution === null || revenue === null || revenue <= 0n) return '—';
  const bps = Number((contribution * 10000n) / revenue);
  return `${(bps / 100).toFixed(1)}%`;
}

function formatDeltaBadge(
  uiT: (text: string) => string,
  current: bigint | null,
  prior: bigint | null,
  currency: string,
  invertSentiment = false,
) {
  if (current === null || prior === null) {
    return <span className="whitespace-nowrap shrink-0 text-xs text-muted-foreground">{current === null ? uiT('Change unavailable') : uiT('No prior baseline')}</span>;
  }
  const diff = current - prior;
  const absDiff = diff < 0n ? -diff : diff;
  if (diff === 0n) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-xs text-muted-foreground tabular-nums">
        <IconMinus size={13} />{" "}{uiT("No change")}
      </span>
    );
  }
  const isPositive = diff > 0n;
  if (absDiff < 100_000n) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-xs text-muted-foreground tabular-nums">
            {isPositive ? <IconArrowUpRight size={14} /> : <IconArrowDownRight size={14} />}
            {isPositive ? '+' : '-'}{formatStatementMoney(absDiff, currency)}
          </span>
        </TooltipTrigger>
        <TooltipContent>{uiT("Exact change:")}{" "} {isPositive ? '+' : '-'}{formatRateMoney(absDiff, currency)}</TooltipContent>
      </Tooltip>
    );
  }
  const pct =
    prior >= 50_000n
      ? `${isPositive ? '+' : ''}${(Number((diff * 10000n) / prior) / 100).toFixed(1)}%`
      : isPositive
        ? uiT('New')
        : '—';
  const absMoney = formatStatementMoney(absDiff, currency);
  const signedMoney = `${isPositive ? '+' : '-'}${absMoney}`;
  const good = invertSentiment ? !isPositive : isPositive;
  const badge = (
    <span
      tabIndex={absDiff % 100_000n !== 0n ? 0 : undefined}
      className={`inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-xs font-medium tabular-nums ${
        good ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
      }`}
    >
      {isPositive ? <IconArrowUpRight size={14} /> : <IconArrowDownRight size={14} />}
      <span>{signedMoney}</span>
      <span className="text-muted-foreground font-normal">({pct})</span>
    </span>
  );
  if (absDiff % 100_000n !== 0n) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{uiT("Exact change:")}{" "} {isPositive ? '+' : '-'}{formatRateMoney(absDiff, currency)}</TooltipContent>
      </Tooltip>
    );
  }
  return badge;
}

function StatementMoney({ amount, currency }: { amount: bigint; currency: string }) {
  const { t: uiT } = useUILocale();
  const abs = amount < 0n ? -amount : amount;
  const display = formatStatementMoney(amount, currency);
  if (abs === 0n || abs % 100_000n === 0n) return <>{display}</>;
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="inline border-0 bg-transparent p-0 font-inherit text-inherit cursor-help underline decoration-dotted underline-offset-2"
      >
        {display}
      </TooltipTrigger>
      <TooltipContent>{uiT("Exact amount:")}{" "}{formatFinancialMoney(amount, currency)}</TooltipContent>
    </Tooltip>
  );
}

/** Procurement and financial statements remain in Admin, behind the central platform permission boundary. */
export default function CommercialPositionPage() {
  const { token } = useDashboardContext();
  return (
    <TooltipProvider>
      <CommercialStatement key={token} token={token} />
    </TooltipProvider>
  );
}

function CommercialStatement({ token }: { token: string }) {
  const { t: uiT, format: uiF, locale } = useUILocale();
  const { t } = useLocale();
  const { providerDirectory } = useDashboardContext();
  const { settings: branding, logo } = useBranding();
  const [search, setSearch] = useSearchParams();
  const [refresh, setRefresh] = useState(0);
  const asOf = useMemo(() => new Date(), [search, refresh]);
  const months = useMemo(() => buildRecentMonths(12, asOf, locale, uiF), [asOf, locale]);
  const normalizedSearch = useMemo(() => {
    const next = new URLSearchParams(search);
    if (next.get('mode') === 'range') {
      const start = next.get('start_month');
      const end = next.get('end_month');
      if (start && end && parseMonthKey(start) && parseMonthKey(end) && start > end) {
        next.set('start_month', end);
        next.set('end_month', start);
      }
    }
    return next;
  }, [search]);
  useEffect(() => {
    if (search.toString() !== normalizedSearch.toString()) setSearch(normalizedSearch, { replace: true });
  }, [search, normalizedSearch, setSearch]);
  const {currency,ready:currencyReady,failed:currencyFailed,reload:reloadCurrency} = usePlatformCurrency();
  const interval = useMemo(() => resolveInterval(normalizedSearch, months, asOf, locale, uiF), [normalizedSearch, months, asOf, locale]);

  const scope = token || 'public';
  const currentBundleKey = currency
    ? `/api/v1/admin/finance/position:bundle:${currency}:${interval.mode}:${interval.days ?? ''}:${interval.from.slice(0, 16)}:${interval.until.slice(0, 16)}`
    : '';
  const priorBundleKey = currency
    ? `/api/v1/admin/finance/position:prior:${currency}:${interval.mode}:${interval.days ?? ''}:${interval.priorFrom.slice(0, 16)}:${interval.priorUntil.slice(0, 16)}`
    : '';
  const initialCurr = currentBundleKey
    ? peekQuery<{ position: CommercialPosition; summary: CustomerFinancialSummary }>(scope, currentBundleKey)
    : undefined;
  const initialPrior = priorBundleKey
    ? peekQuery<{ position: CommercialPosition; summary: CustomerFinancialSummary }>(scope, priorBundleKey)
    : undefined;

  const [position, setPosition] = useState<CommercialPosition | null>(() => initialCurr?.position ?? null);
  const [summary, setSummary] = useState<CustomerFinancialSummary | null>(() => initialCurr?.summary ?? null);
  const [priorPosition, setPriorPosition] = useState<CommercialPosition | null>(() => initialPrior?.position ?? null);
  const [priorSummary, setPriorSummary] = useState<CustomerFinancialSummary | null>(() => initialPrior?.summary ?? null);
  const [modelFilter, setModelFilter] = useState<'active' | 'all'>('active');
  const [error, setError] = useState('');
  const [priorError, setPriorError] = useState(false);
  const [priorAttempt, setPriorAttempt] = useState(0);
  const [loading, setLoading] = useState(() => Boolean(currency) && !initialCurr);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setPriorError(false);
    if (!currency) {
      setPosition(null);
      setSummary(null);
      setPriorPosition(null);
      setPriorSummary(null);
      setLoading(false);
      return () => controller.abort();
    }

    const cachedCurr = peekQuery<{ position: CommercialPosition; summary: CustomerFinancialSummary }>(scope, currentBundleKey);
    const cachedPrior = peekQuery<{ position: CommercialPosition; summary: CustomerFinancialSummary }>(scope, priorBundleKey);
    if (cachedCurr) {
      setPosition(cachedCurr.position);
      setSummary(cachedCurr.summary);
      if (cachedPrior) {
        setPriorPosition(cachedPrior.position);
        setPriorSummary(cachedPrior.summary);
      }
      setLoading(false);
    } else if (refresh === 0) {
      setPosition(null);
      setSummary(null);
      setPriorPosition(null);
      setPriorSummary(null);
      setLoading(true);
    } else {
      setLoading(true);
    }

    const force = refresh > 0;
    const currentPromise = fetchQuery(
      scope,
      currentBundleKey,
      signal => fetchPeriodBundle(token, currency, { from: interval.from, until: interval.until }, signal),
      { signal: controller.signal, force, awaitRevalidate: true, freshMs: 30_000 },
    );
    const priorPromise = fetchQuery(
      scope,
      priorBundleKey,
      signal => fetchPeriodBundle(token, currency, { from: interval.priorFrom, until: interval.priorUntil }, signal),
      { signal: controller.signal, force, awaitRevalidate: true, freshMs: 30_000 },
    ).catch(reason => {
      if (controller.signal.aborted) return null;
      // A missing prior snapshot is a valid empty comparison. Other failures
      // keep the last loaded comparison and are surfaced below.
      if (reason instanceof VendorRequestError && reason.status === 404) return null;
      setPriorError(true);
      return null;
    });

    void Promise.all([currentPromise, priorPromise])
      .then(([curr, prior]) => {
        if (controller.signal.aborted) return;
        setPosition(curr.position);
        setSummary(curr.summary);
        if (prior) {
          setPriorPosition(prior.position);
          setPriorSummary(prior.summary);
        }
      })
      .catch(reason => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Commercial statement could not be loaded.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [scope, token, currency, currentBundleKey, priorBundleKey, interval.mode, interval.days, interval.from, interval.until, interval.priorFrom, interval.priorUntil, asOf, refresh, priorAttempt]);

  function updateParams(patch: Record<string, string | null>) {
    setSearch(current => {
      const next = new URLSearchParams(current);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      return next;
    });
  }

  const currentCohort = useMemo(() => aggregateCohort(position?.data ?? []), [position]);
  const priorCohort = useMemo(
    () => (priorPosition ? aggregateCohort(priorPosition.data) : null),
    [priorPosition],
  );

  // Use posting-period recognized revenue when available, falling back to cohort net revenue
  const recognizedRevenue =
    summary?.recognized_revenue_nanos != null
      ? BigInt(summary.recognized_revenue_nanos)
      : summary
        ? null
        : currentCohort.netRevenue;
  const priorRecognizedRevenue =
    priorSummary?.recognized_revenue_nanos != null
      ? BigInt(priorSummary.recognized_revenue_nanos)
      : priorSummary
        ? null
        : priorCohort?.netRevenue ?? null;

  const nominalConsumption = summary ? BigInt(summary.nominal_consumption_nanos) : currentCohort.nominalCharges;
  const priorNominalConsumption = priorSummary
    ? BigInt(priorSummary.nominal_consumption_nanos)
    : priorCohort?.nominalCharges ?? null;

  const customerRefunds = summary ? BigInt(summary.customer_refunds_nanos) : currentCohort.refunds;
  const priorCustomerRefunds = priorSummary
    ? BigInt(priorSummary.customer_refunds_nanos)
    : priorCohort?.refunds ?? null;

  const consumedGifts =
    summary?.consumed_gift_allowance_nanos != null
      ? BigInt(summary.consumed_gift_allowance_nanos)
      : summary
        ? BigInt(summary.known_gift_allowance_subtotal_nanos)
        : currentCohort.giftAllowance;
  const priorConsumedGifts =
    priorSummary?.consumed_gift_allowance_nanos != null
      ? BigInt(priorSummary.consumed_gift_allowance_nanos)
      : priorSummary
        ? BigInt(priorSummary.known_gift_allowance_subtotal_nanos)
        : priorCohort?.giftAllowance ?? null;

  const netContribution = currentCohort.netContribution;
  const priorNetContribution = priorCohort?.netContribution ?? null;

  const verifiedCashReceipts =
    summary?.verified_cash_receipts_nanos != null ? BigInt(summary.verified_cash_receipts_nanos) : null;
  const priorVerifiedCashReceipts =
    priorSummary?.verified_cash_receipts_nanos != null ? BigInt(priorSummary.verified_cash_receipts_nanos) : null;

  const prepaidCash =
    summary?.balance_credit_sources?.prepaid_cash_nanos != null
      ? BigInt(summary.balance_credit_sources.prepaid_cash_nanos)
      : null;
  const knownPrepaidCash =
    summary?.balance_credit_sources?.known_prepaid_cash_subtotal_nanos != null
      ? BigInt(summary.balance_credit_sources.known_prepaid_cash_subtotal_nanos)
      : null;
  const simAccounts = BigInt(summary?.balance_credit_sources?.simulated_funding_accounts ?? '0');
  const uncoveredAccounts = BigInt(summary?.balance_credit_sources?.uncovered_accounts ?? '0');
  const outstandingCredit =
    summary?.balance_credit_sources?.outstanding_credit_nanos != null
      ? BigInt(summary.balance_credit_sources.outstanding_credit_nanos)
      : null;

  const sortedRows = useMemo(() => {
    const list = Array.isArray(position?.data) ? [...position.data] : [];
    return list.sort((a, b) => {
      const aActive =
        a.customer_charge_nanos !== null ||
        a.earning_nanos !== null ||
        BigInt(a.matched_attempts || '0') > 0n ||
        BigInt(a.unresolved_attempts || '0') > 0n;
      const bActive =
        b.customer_charge_nanos !== null ||
        b.earning_nanos !== null ||
        BigInt(b.matched_attempts || '0') > 0n ||
        BigInt(b.unresolved_attempts || '0') > 0n;
      if (aActive !== bActive) return aActive ? -1 : 1;
      const aCharge = BigInt(a.customer_charge_nanos ?? '0');
      const bCharge = BigInt(b.customer_charge_nanos ?? '0');
      if (aCharge !== bCharge) return bCharge > aCharge ? 1 : -1;
      const aEarn = BigInt(a.earning_nanos ?? '0');
      const bEarn = BigInt(b.earning_nanos ?? '0');
      if (aEarn !== bEarn) return bEarn > aEarn ? 1 : -1;
      return a.model_alias.localeCompare(b.model_alias);
    });
  }, [position]);

  const activeRows = useMemo(
    () =>
      sortedRows.filter(
        r =>
          r.customer_charge_nanos !== null ||
          r.earning_nanos !== null ||
          BigInt(r.matched_attempts || '0') > 0n ||
          BigInt(r.unresolved_attempts || '0') > 0n,
      ),
    [sortedRows],
  );

  const inspectedModel = search.get('model');
  const section = search.get('tab');
  const selectedSection = section === 'cash' || section === 'operations' || section === 'unit-economics'
    ? section : inspectedModel ? 'unit-economics' : 'operations';
  const economicsHeading = useRef<HTMLHeadingElement>(null);
  const focusEconomics = useRef(false);
  useEffect(() => {
    if (focusEconomics.current && selectedSection === 'unit-economics' && economicsHeading.current) {
      focusEconomics.current = false;
      economicsHeading.current.focus();
      economicsHeading.current.scrollIntoView({ block: 'start' });
    }
  }, [selectedSection, loading]);
  function showSection(value: string) {
    setSearch(params => {
      const next = new URLSearchParams(params);
      next.set('tab', value);
      return next;
    });
  }

  const displayedRows = inspectedModel ? sortedRows.filter(row => row.model_alias === inspectedModel)
    : modelFilter === 'active' ? activeRows : sortedRows;

  const priorRowMap = useMemo(() => {
    const map = new Map<string, CommercialPositionRow>();
    for (const row of Array.isArray(priorPosition?.data) ? priorPosition.data : []) {
      map.set(`${row.supplier_id}:${row.model_alias}`, row);
    }
    return map;
  }, [priorPosition]);

  const selectedMonthKey = search.get('month') ?? months[1]?.key ?? months[0].key;
  const selectedStartMonthKey = normalizedSearch.get('start_month') ?? months[Math.min(2, months.length - 1)]?.key ?? months[0].key;
  const selectedEndMonthKey = normalizedSearch.get('end_month') ?? months[0].key;

  const modeLabels: Record<PeriodMode, string> = {
    mtd: uiT('Month to date (Current month)'),
    month: uiT('Single calendar month'),
    range: uiT('Multi-month range'),
    rolling: uiT('Rolling day window'),
  };

    if (!currency) return <Empty className="min-h-48 py-8" aria-label={uiT("Financial reports")}>
    <EmptyHeader>
      <EmptyMedia variant="icon"><IconCoin size={18} aria-hidden="true" /></EmptyMedia>
      <EmptyDescription>{currencyReady === false ? uiT("Loading platform currency…") : currencyFailed ? uiT("Could not load the platform currency.") : uiT("Set the platform currency before viewing financial reports.")}</EmptyDescription>
    </EmptyHeader>
    {(currencyFailed || currencyReady !== false) && <EmptyContent>{currencyFailed ? <Button variant="outline" onClick={reloadCurrency}>{uiT("Retry")}</Button> : <Button asChild><Link to="/admin/settings">{uiT("Open platform settings")}</Link></Button>}</EmptyContent>}
  </Empty>;

  return (
    <section className="commercial-statement min-w-0 space-y-6" aria-label={uiT("Financial statements")}>
      {/* Print-only formal branded document header */}
      <header className="commercial-print-only commercial-print-header hidden">
        <div className="commercial-print-header-top">
          <div className="commercial-print-brand">
            <img src={logo} alt={branding.display_name} className="commercial-print-logo" />
            <div>
              <div className="commercial-print-brand-eyebrow">
                <span>{branding.display_name}</span>
                <span className="commercial-print-brand-dot">·</span>
                <span>{uiT("PLATFORM FINANCIAL REPORTING")}</span>
              </div>
              <p className="commercial-print-title">{uiT("Financial Statements")}</p>
              <p className="commercial-print-subtitle">
                {uiT("Statement of Operations (P&L), Cash Receipts & Wallet Position, and Provider Unit Economics")}</p>
            </div>
          </div>
          <div className="commercial-print-meta-box">
            <div className="commercial-print-classification">{uiT("CONFIDENTIAL · PLATFORM ADMIN")}</div>
            <dl className="commercial-print-meta-grid">
              <div>
                <dt>{uiT("Reporting Period")}</dt>
                <dd>{interval.periodLabel}</dd>
              </div>
              <div>
                <dt>{uiT("Comparison Baseline")}</dt>
                <dd>{interval.comparisonLabel}</dd>
              </div>
              <div>
                <dt>{uiT("UTC Window")}</dt>
                <dd>
                  {formatInstant(position?.from ?? interval.from)} –{' '}
                  {formatInstant(position?.until ?? interval.until)} UTC
                </dd>
              </div>
              <div>
                <dt>{uiT("Reporting Currency")}</dt>
                <dd>
                  {currencySymbol(currency)} {currency}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      {/* Top Controls Toolbar */}
      <div className="commercial-print-hide flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 p-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period Mode Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label={uiT("Reporting period mode")} className="gap-2 font-normal">
                <IconCalendarStats size={16} />
                <span>{modeLabels[interval.mode]}</span>
                <IconChevronDown size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={interval.mode}
                onValueChange={val => {
                  const nextMode = val as PeriodMode;
                  if (nextMode === 'mtd') {
                    updateParams({ mode: 'mtd', days: null, month: null, start_month: null, end_month: null });
                  } else if (nextMode === 'month') {
                    updateParams({ mode: 'month', month: months[1]?.key ?? months[0].key, days: null, start_month: null, end_month: null });
                  } else if (nextMode === 'range') {
                    updateParams({
                      mode: 'range',
                      start_month: months[Math.min(2, months.length - 1)]?.key ?? months[0].key,
                      end_month: months[0].key,
                      days: null,
                      month: null,
                    });
                  } else {
                    updateParams({ mode: 'rolling', days: '30', month: null, start_month: null, end_month: null });
                  }
                }}
              >
                <DropdownMenuRadioItem value="mtd">{uiT("Month to date (Current month)")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="month">{uiT("Single calendar month")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="range">{uiT("Multi-month range")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="rolling">{uiT("Rolling day window (7 / 30 / 90d)")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Secondary Period Picker based on mode */}
          {interval.mode === 'month' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" aria-label={uiT("Select calendar month")} className="gap-2 font-normal">
                  <span>{months.find(m => m.key === selectedMonthKey)?.periodLabel ?? selectedMonthKey}</span>
                  <IconChevronDown size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                <DropdownMenuRadioGroup
                  value={selectedMonthKey}
                  onValueChange={value => updateParams({ mode: 'month', month: value })}
                >
                  {months.map(m => (
                    <DropdownMenuRadioItem key={m.key} value={m.key}>
                      {m.periodLabel}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {interval.mode === 'range' && (
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" aria-label={uiT("Start month")} className="gap-2 font-normal">
                    <span>{uiT("From:")}{" "}{months.find(m => m.key === selectedStartMonthKey)?.shortLabel ?? selectedStartMonthKey}</span>
                    <IconChevronDown size={15} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                  <DropdownMenuRadioGroup
                    value={selectedStartMonthKey}
                    onValueChange={value => updateParams({ mode: 'range', start_month: value, end_month: selectedEndMonthKey })}
                  >
                    {months.map(m => (
                      <DropdownMenuRadioItem key={m.key} value={m.key}>
                        {m.periodLabel}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" aria-label={uiT("End month")} className="gap-2 font-normal">
                    <span>{uiT("To:")}{" "}{months.find(m => m.key === selectedEndMonthKey)?.shortLabel ?? selectedEndMonthKey}</span>
                    <IconChevronDown size={15} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                  <DropdownMenuRadioGroup
                    value={selectedEndMonthKey}
                    onValueChange={value => updateParams({ mode: 'range', start_month: selectedStartMonthKey, end_month: value })}
                  >
                    {months.map(m => (
                      <DropdownMenuRadioItem key={m.key} value={m.key}>
                        {m.periodLabel}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {interval.mode === 'rolling' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" aria-label={uiT("Commercial period")} className="gap-2 font-normal">
                  <span>{uiT("Last")}{" "}{interval.days ?? 30}{" "}{uiT("days")}</span>
                  <IconChevronDown size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={String(interval.days ?? 30)}
                  onValueChange={value => updateParams({ mode: 'rolling', days: value })}
                >
                  {['7', '30', '90'].map(value => (
                    <DropdownMenuRadioItem key={value} value={value}>
                      {uiT("Last")}{" "}{value}{" "}{uiT("days")}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <span className="text-sm text-muted-foreground">{currency}</span>
        </div>

        {/* Right Actions: Refresh & Export PDF */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => setRefresh(value => value + 1)}
          >
            <IconRefresh size={16} />
            <span>{uiT("Refresh")}</span>
          </Button>
          <Button
            variant="outline"
            disabled={loading || !position}
            onClick={() => window.print()}
            aria-label={uiT("Export PDF statement")}
          >
            <IconFileTypePdf size={16} />
            <span>{uiT("Export PDF")}</span>
          </Button>
        </div>
      </div>

      {/* Period Interval Subtitle */}
      <div className="commercial-print-hide flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          <strong className="font-medium text-foreground">{interval.periodLabel}</strong>{" "}{uiT("· UTC window:")}{' '}
          {formatInstant(position?.from ?? interval.from)}{" "}{uiT("to")}{' '}
          {formatInstant(position?.until ?? interval.until)}{" "}{uiT("· Compared against")}{' '}
          <strong className="font-medium text-foreground">{interval.comparisonLabel}</strong>
        </span>
        <span>{uiT("Personal owner-funded calls are excluded from commercial revenue and cost.")}</span>
      </div>

      {loading && !position && (
        <div role="status" className="space-y-6" aria-label={uiT("Loading financial statement…")}>
          <MetricStripSkeleton count={4} label="" />
          <TableSkeleton columns={6} rows={6} label="" />
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{uiT(error)}</span>
          <Button variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>
              {uiT("Retry")}</Button>
          </AlertDescription>
        </Alert>
      )}
      {priorError && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{uiT("The comparison period could not be loaded. Current period totals are unchanged.")}</span>
            <Button variant="outline" size="sm" onClick={() => setPriorAttempt(value => value + 1)}>
              {uiT("Retry comparison")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {position && (
        <>
          <Tabs value={selectedSection} onValueChange={showSection} className="min-w-0 space-y-4">
            <div className="max-w-full overflow-x-auto overflow-y-hidden commercial-print-hide">
              <TabsList variant="line" aria-label={uiT("Financial statement sections")}>
                <TabsTrigger value="operations">{uiT("Statement of operations")}</TabsTrigger>
                <TabsTrigger value="cash">{uiT("Cash & wallet position")}</TabsTrigger>
                <TabsTrigger value="unit-economics">{uiT("Unit economics")}</TabsTrigger>
              </TabsList>
            </div>
          {/* Layer 1: Executive Financial KPI Cards with Period-over-Period Comparison */}
          {!inspectedModel && <div className="commercial-kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="min-w-0 rounded-xl bg-card p-5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{uiT("Net recognized revenue")}</span>
                <Badge variant="outline">{uiT("Income")}</Badge>
              </div>
              <div className="text-xl xl:text-[22px] font-semibold tracking-tight tabular-nums">
                {recognizedRevenue === null ? uiT("Unavailable") : <StatementMoney amount={recognizedRevenue} currency={currency} />}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 pt-0.5">
                {formatDeltaBadge(uiT, recognizedRevenue, priorRecognizedRevenue, currency)}
                <span className="whitespace-nowrap text-xs text-muted-foreground">{uiT("vs")}{" "}{interval.comparisonLabel}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1 tabular-nums">
                {uiT("Gross usage")}{" "}{formatStatementMoney(nominalConsumption, currency)}{" "}{uiT("· Gifts & refunds")}{' '}
                {consumedGifts + customerRefunds > 0n ? '-' : ''}
                {formatStatementMoney(consumedGifts + customerRefunds, currency)}
              </p>
            </article>

            <article className="min-w-0 rounded-xl bg-card p-5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{uiT("Cost of supply (Provider payable)")}</span>
                <Badge variant="outline">{uiT("COGS")}</Badge>
              </div>
              <div className="text-xl xl:text-[22px] font-semibold tracking-tight tabular-nums">
                <StatementMoney amount={currentCohort.providerPayable} currency={currency} />
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 pt-0.5">
                {formatDeltaBadge(uiT,
                  currentCohort.providerPayable,
                  priorCohort?.providerPayable ?? null,
                  currency,
                  true,
                )}
                <span className="whitespace-nowrap text-xs text-muted-foreground">{uiT("vs")}{" "}{interval.comparisonLabel}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1 tabular-nums">
                {uiT("Settled")}{" "}{formatStatementMoney(currentCohort.settledPayable, currency)}{" "}{uiT("· Unpaid")}{' '}
                {formatStatementMoney(currentCohort.unpaidPayable, currency)}
              </p>
            </article>

            <article className="min-w-0 rounded-xl bg-card p-5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{uiT("Request contribution", "请求净贡献")}</span>
                <Badge variant="secondary">
                  {formatMarginPercent(netContribution, currentCohort.netRevenue)}{" "}{uiT("margin")}</Badge>
              </div>
              <div className="text-xl xl:text-[22px] font-semibold tracking-tight tabular-nums">
                {netContribution === null ? uiT("Pending reconciliation", "待核定") : <StatementMoney amount={netContribution} currency={currency} />}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 pt-0.5">
                {formatDeltaBadge(uiT, netContribution, priorNetContribution, currency)}
                <span className="whitespace-nowrap text-xs text-muted-foreground">{uiT("vs")}{" "}{interval.comparisonLabel}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1 tabular-nums">
                {currentCohort.unresolvedAttempts > 0n && <><Button variant="link" size="sm" className="h-auto p-0 text-xs underline" onClick={() => {
                  if (selectedSection === 'unit-economics') {
                    economicsHeading.current?.focus();
                    economicsHeading.current?.scrollIntoView({ block: 'start' });
                  } else {
                    focusEconomics.current = true;
                    showSection('unit-economics');
                  }
                }}>{uiF("{0} unresolved", [currentCohort.unresolvedAttempts.toString()])}</Button> · </>}{uiF("Matched charges and payables ({0})", [currentCohort.matchedAttempts.toString()])} ·{' '}
                {uiF('{0} active models', [currentCohort.activeModelCount])}
              </p>
            </article>

            <article className="min-w-0 rounded-xl bg-card p-5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{uiT("Verified cash receipts")}</span>
                <Badge variant="outline">{uiT("Cash flow")}</Badge>
              </div>
              <div className="text-xl xl:text-[22px] font-semibold tracking-tight tabular-nums">
                {verifiedCashReceipts === null
                  ? uiT("Unavailable")
                  : <StatementMoney amount={verifiedCashReceipts} currency={currency} />}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 pt-0.5">
                {formatDeltaBadge(uiT, verifiedCashReceipts, priorVerifiedCashReceipts, currency)}
                <span className="whitespace-nowrap text-xs text-muted-foreground">{uiT("vs")}{" "}{interval.comparisonLabel}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1 tabular-nums">
                {uiT("Unused prepaid wallet:")}{' '}
                {prepaidCash !== null
                  ? formatStatementMoney(prepaidCash, currency)
                  : uncoveredAccounts > 0n && simAccounts === uncoveredAccounts && knownPrepaidCash !== null
                    ? `${formatStatementMoney(knownPrepaidCash, currency)} · ${t('simulated excluded', '已排除模拟账户')}`
                    : uiT("Unavailable")}
              </p>
            </article>
          </div>}

            <TabsContent value="operations" forceMount className="data-[state=inactive]:hidden print:data-[state=inactive]:block">
            <div className="min-w-0 rounded-xl bg-card p-5 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-[15px] font-semibold">{uiT("Statement of operations (P&L)")}</h2>
                  <p className="text-xs text-muted-foreground">
                    {uiT("Accrual operating revenue, promotional allowances, and supply cost")}</p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {uiT("Amounts in")}{" "}{currency} ({currencySymbol(currency)})
                </span>
              </div>
              <Table aria-label={uiT("Statement of operations")} className="commercial-statement-table table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">{uiT("Line item")}</TableHead>
                    <TableHead className="w-[17%] text-right">{uiT("Current")}</TableHead>
                    <TableHead className="w-[17%] text-right hidden sm:table-cell">
                      {interval.comparisonLabel}
                    </TableHead>
                    <TableHead className="w-[26%] text-right">{uiT("Change")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <StatementRow
                    label={uiT("Gross customer usage charges")}
                    current={nominalConsumption}
                    prior={priorNominalConsumption}
                    currency={currency}
                  />
                  <StatementRow
                    label={uiT("Less: Customer balance refunds")}
                    current={customerRefunds}
                    prior={priorCustomerRefunds}
                    currency={currency}
                    indented
                    negateDisplay
                    invertSentiment
                  />
                  <StatementRow
                    label={uiT("Less: Consumed promotional gift allowance")}
                    current={consumedGifts}
                    prior={priorConsumedGifts}
                    currency={currency}
                    indented
                    negateDisplay
                  />
                  <StatementRow
                    label={uiT("Net revenue posted in period", "本期入账净收入")}
                    current={recognizedRevenue}
                    prior={priorRecognizedRevenue}
                    currency={currency}
                    strong
                  />
                  <StatementRow
                    label={uiT("Net revenue from requests in period", "本期请求净收入")}
                    current={currentCohort.netRevenue}
                    prior={priorCohort?.netRevenue ?? null}
                    currency={currency}
                  />
                  <StatementRow
                    label={uiT("Less: Provider payable (Cost of model supply)")}
                    current={currentCohort.providerPayable}
                    prior={priorCohort?.providerPayable ?? null}
                    currency={currency}
                    indented
                    negateDisplay
                    invertSentiment
                  />
                  <StatementRow
                    label={uiT("Memo: Recorded upstream API cost subtotal")}
                    current={currentCohort.recordedUpstreamCost}
                    prior={priorCohort?.recordedUpstreamCost ?? null}
                    currency={currency}
                    indented
                    muted
                  />
                  <StatementRow
                    label={uiT("Request contribution", "请求净贡献")}
                    current={netContribution}
                    prior={priorNetContribution}
                    currency={currency}
                    strong
                  />
                  <TableRow className="bg-muted/30 font-medium">
                    <TableCell>{uiT("Effective gross margin (%)")}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMarginPercent(netContribution, currentCohort.netRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden sm:table-cell text-muted-foreground">
                      {formatMarginPercent(priorNetContribution, priorCohort?.netRevenue ?? null)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {currentCohort.unresolvedAttempts > 0n
                        ? uiF("{0} unresolved", [currentCohort.unresolvedAttempts.toString()])
                        : netContribution === null ? uiT("Pending reconciliation", "待核定") : uiT("Fully resolved")}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            </TabsContent>

            <TabsContent value="cash" forceMount className="data-[state=inactive]:hidden print:data-[state=inactive]:block">
            <div className="min-w-0 rounded-xl bg-card p-5 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-[15px] font-semibold">{uiT("Cash receipts, payables & wallet position")}</h2>
                  <p className="text-xs text-muted-foreground">
                    {uiT("Verified cash inflows, Provider settlement status, and customer balances")}</p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {uiT("Amounts in")}{" "}{currency} ({currencySymbol(currency)})
                </span>
              </div>
              <Table aria-label={uiT("Customer financial posting summary")} className="commercial-statement-table table-auto [&_th]:whitespace-normal [&_td]:whitespace-normal">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">{uiT("Measure")}</TableHead>
                    <TableHead className="w-[17%] text-right">{uiT("Current")}</TableHead>
                    <TableHead className="w-[17%] text-right hidden sm:table-cell">
                      {interval.comparisonLabel}
                    </TableHead>
                    <TableHead className="w-[26%] text-right">{uiT("Change / Status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <StatementRow
                    label={uiT("Wallet cash funding receipts")}
                    current={summary ? BigInt(summary.balance_funding_receipts_nanos) : null}
                    prior={priorSummary ? BigInt(priorSummary.balance_funding_receipts_nanos) : null}
                    currency={currency}
                  />
                  <StatementRow
                    label={uiT("External invoice payment receipts")}
                    current={summary ? BigInt(summary.external_invoice_receipts_nanos) : null}
                    prior={priorSummary ? BigInt(priorSummary.external_invoice_receipts_nanos) : null}
                    currency={currency}
                  />
                  <StatementRow
                    label={uiT("Less: Recorded funding reversals")}
                    current={summary ? BigInt(summary.recorded_funding_reversals_nanos) : null}
                    prior={priorSummary ? BigInt(priorSummary.recorded_funding_reversals_nanos) : null}
                    currency={currency}
                    indented
                    negateDisplay
                    invertSentiment
                  />
                  <StatementRow
                    label={uiT("Total verified cash receipts")}
                    current={verifiedCashReceipts}
                    prior={priorVerifiedCashReceipts}
                    currency={currency}
                    strong
                  />
                  <StatementRow
                    label={t('Memo: Simulated funding (not cash)', '备查：模拟充值（非现金）')}
                    current={summary?.simulated_funding_receipts_nanos != null ? BigInt(summary.simulated_funding_receipts_nanos) : null}
                    prior={priorSummary?.simulated_funding_receipts_nanos != null ? BigInt(priorSummary.simulated_funding_receipts_nanos) : null}
                    currency={currency}
                  />
                  <StatementRow
                    label={uiT("Memo: Noncash promotional gifts issued")}
                    current={summary ? BigInt(summary.issued_gifts_nanos) : null}
                    prior={priorSummary ? BigInt(priorSummary.issued_gifts_nanos) : null}
                    currency={currency}
                    indented
                    muted
                  />
                  <StatementRow
                    label={uiT("Memo: Unused noncash gifts corrected")}
                    current={summary?.corrected_unused_gifts_nanos != null ? BigInt(summary.corrected_unused_gifts_nanos) : null}
                    prior={priorSummary?.corrected_unused_gifts_nanos != null ? BigInt(priorSummary.corrected_unused_gifts_nanos) : null}
                    currency={currency}
                    indented
                    muted
                  />
                  <StatementRow
                    label={uiT("Settled with Providers")}
                    current={currentCohort.settledPayable}
                    prior={priorCohort?.settledPayable ?? null}
                    currency={currency}
                  />
                  <StatementRow
                    label={uiT("Outstanding unpaid Provider payable")}
                    current={currentCohort.unpaidPayable}
                    prior={priorCohort?.unpaidPayable ?? null}
                    currency={currency}
                    strong
                    invertSentiment
                  />
                  <TableRow className="border-t-2">
                    <TableCell className="font-medium">
                      {uiT("Unused verified prepaid cash (Wallet liability)")}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {prepaidCash === null ? (
                        <div>
                          <div>{uiT("Unavailable")}</div>
                          {uncoveredAccounts > 0n && simAccounts === uncoveredAccounts && knownPrepaidCash !== null && (
                            <div className="text-[11px] font-normal text-muted-foreground">
                              {t("Verified subtotal:", "已核实小计：")}{" "}{formatStatementMoney(knownPrepaidCash, currency)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <StatementMoney amount={prepaidCash} currency={currency} />
                      )}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell text-xs text-muted-foreground">
                      {uiT("Point-in-time")}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {uiT("Current balance")}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      {uiT("Outstanding customer credit consumption")}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {outstandingCredit === null
                        ? uiT("Unavailable")
                        : <StatementMoney amount={outstandingCredit} currency={currency} />}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell text-xs text-muted-foreground">
                      {uiT("Point-in-time")}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {uiT("Receivable")}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {BigInt(summary?.balance_credit_sources?.simulated_funding_accounts ?? '0') > 0n && (
                <p className="text-sm text-muted-foreground" role="note">
                  {t(
                    'Simulated receipts are excluded from cash. Wallets with mixed historical funding do not have a verified cash or credit allocation; their totals and related revenue remain unavailable. Disabling mock payments does not change this history.',
                    '模拟收款不计入现金。历史资金来源混合的账户尚无可确认的现金或信用分摊，其合计及相关收入显示为不可用。关闭模拟支付不会改变这些历史记录。',
                  )}
                </p>
              )}
            </div>
            </TabsContent>

            <TabsContent value="unit-economics" forceMount className="data-[state=inactive]:hidden print:data-[state=inactive]:block">
          <div className="min-w-0 rounded-xl bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 ref={economicsHeading} tabIndex={-1} className="sr-only print:not-sr-only">{uiT("Unit economics by Provider & model")}</h2>
              </div>
              <div className="commercial-print-hide flex flex-wrap items-center gap-1.5">
                {inspectedModel && <span className="break-all text-sm">{inspectedModel}</span>}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-pressed={!inspectedModel && modelFilter === 'active'}
                  onClick={() => { setModelFilter('active'); if (inspectedModel) setSearch(params => { params.delete('model'); return params; }); }}
                >
                  {uiF("Active in period ({0})", [activeRows.length])}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-pressed={!inspectedModel && modelFilter === 'all'}
                  onClick={() => { setModelFilter('all'); if (inspectedModel) setSearch(params => { params.delete('model'); return params; }); }}
                >
                  {uiF("All configured ({0})", [sortedRows.length])}
                </Button>
              </div>
            </div>

            {displayedRows.length === 0 ? (
              <Empty className="min-h-36 py-7"><EmptyHeader><EmptyMedia variant="icon"><IconCalendarStats size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>
                {inspectedModel ? uiT('No report row for this model and period.', '该模型在本期暂无报表记录。') : modelFilter === 'active' ? uiT("No models had activity in this period.") : uiT("No models are configured for this currency.")}</EmptyDescription></EmptyHeader></Empty>
            ) : (
              <div className="table-wrap"><Table className="commercial-position-table" aria-label={uiT("Provider commercial positions")}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{uiT("Provider / model")}</TableHead>
                    <TableHead className="text-right">{uiT("Net contribution")}</TableHead>
                    <TableHead className="hidden md:table-cell">{uiT("Agreed offer quote")}</TableHead>
                    <TableHead className="text-right">{uiT("Gross charges")}</TableHead>
                    <TableHead className="text-right">{uiT("Net revenue")}</TableHead>
                    <TableHead className="text-right">{uiT("Customer cash applied")}</TableHead>
                    <TableHead className="text-right">{uiT("Customer unpaid credit")}</TableHead>
                    <TableHead className="text-right">{uiT("Provider payable")}</TableHead>
                    <TableHead className="text-right">{uiT("Recorded upstream cost")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedRows.map(row => {
                    const priorRow = priorRowMap.get(`${row.supplier_id}:${row.model_alias}`);
                    const rowCharge =
                      row.customer_charge_nanos !== null ? BigInt(row.customer_charge_nanos) : null;
                    const rowNetRev =
                      row.net_customer_revenue_nanos !== null
                        ? BigInt(row.net_customer_revenue_nanos)
                        : null;
                    const priorNetRev =
                      priorRow?.net_customer_revenue_nanos != null
                        ? BigInt(priorRow.net_customer_revenue_nanos)
                        : null;
                    const rowCashApplied =
                      row.customer_cash_applied_nanos !== null
                        ? BigInt(row.customer_cash_applied_nanos)
                        : null;
                    const rowUnpaidCredit =
                      row.customer_outstanding_credit_nanos !== null
                        ? BigInt(row.customer_outstanding_credit_nanos)
                        : null;
                    const rowPayable =
                      row.earning_nanos !== null ? BigInt(row.earning_nanos) : null;
                    const rowUpstreamCost =
                      row.known_upstream_cost_subtotal_nanos !== null
                        ? BigInt(row.known_upstream_cost_subtotal_nanos)
                        : null;
                    const rowContrib =
                      row.net_contribution_nanos !== null
                        ? BigInt(row.net_contribution_nanos)
                        : null;
                    const rowGifts =
                      row.consumed_gift_allowance_nanos !== null
                        ? BigInt(row.consumed_gift_allowance_nanos)
                        : 0n;
                    const rowRefunds =
                      row.customer_refunds_nanos !== null ? BigInt(row.customer_refunds_nanos) : 0n;
                    const unresolved = BigInt(row.unresolved_attempts || '0');

                    return (
                      <TableRow key={row.supplier_id + ':' + row.model_alias + ':' + row.currency}>
                        <TableCell data-label={uiT("Provider / model")} className="align-top whitespace-normal">
                          <div className="font-medium text-foreground">{row.model_alias}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                            <Link
                              className="hover:underline"
                              to={'/admin/providers/' + encodeURIComponent(providerPathSegment(providerDirectory?.find(item => item.id === row.supplier_id) ?? {id:row.supplier_id}))}
                            >
                              {row.supplier_name}
                            </Link>
                          </div>
                        </TableCell>

                        <TableCell data-label={uiT("Net contribution")} className="text-right align-top whitespace-nowrap tabular-nums">
                          {rowContrib !== null ? (
                            <div>
                              <div className="font-medium">
                                <StatementMoney amount={rowContrib} currency={row.currency} />
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatMarginPercent(rowContrib, rowNetRev)}
                              </div>
                            </div>
                          ) : unresolved > 0n ? (
                            row.pending_attempts?.length && position ? <PendingAttempts key={[position.from, position.until, row.currency, row.supplier_id, row.model_alias, token].join('|')}
                              row={row} from={position.from} until={position.until} token={token} /> : <Badge variant="outline">{uiT("Pending (")}{unresolved.toString()} {uiT("unresolved)")}</Badge>
                          ) : (
                            <span className="text-muted-foreground" aria-label={uiT("Unavailable")}>—</span>
                          )}
                        </TableCell>

                        <TableCell data-label={uiT("Agreed offer quote")} className="align-top whitespace-normal hidden md:table-cell text-xs max-w-[240px]">
                          {row.offers.length === 0 ? (
                            <span className="text-muted-foreground">{uiT("No quote in")}{" "}{row.currency}</span>
                          ) : (
                            row.offers.map(offer => (
                              <div
                                key={offer.offer_id + ':' + offer.route_alias + ':' + offer.state}
                                className="space-y-0.5"
                              >
                                <span className="text-muted-foreground">
                                  {offer.rate_kind === 'text' ? (
                                    uiF("In {0} · Out {1} / 1M", [
                                      offer.prompt_rate == null ? '—' : formatRateMoney(offer.prompt_rate, row.currency),
                                      offer.completion_rate == null ? '—' : formatRateMoney(offer.completion_rate, row.currency),
                                    ])
                                  ) : offer.media_rates.length === 0
                                      ? uiT("Media rate")
                                      : offer.media_rates
                                          .map(
                                            rate =>
                                              `${rate.tariff.dimensions.resolution} · ${currencySymbol(rate.tariff.currency)}${formatUnits(
                                                rate.tariff.amount_units,
                                                rate.tariff.decimal_places,
                                              )}`,
                                          )
                                          .join(', ')}
                                </span>
                              </div>
                            ))
                          )}
                        </TableCell>

                        <TableCell data-label={uiT("Gross charges")} className="text-right align-top whitespace-nowrap tabular-nums">
                          <div>
                            {rowCharge === null ? (
                              <span className="text-muted-foreground" aria-label={uiT("Unavailable")}>—</span>
                            ) : (
                              <StatementMoney amount={rowCharge} currency={row.currency} />
                            )}
                          </div>
                          {(rowGifts > 0n || rowRefunds > 0n) && (
                            <div className="text-xs text-muted-foreground">
                              {rowGifts > 0n ? uiF("Gift -{0}", [formatStatementMoney(rowGifts, row.currency)]) : ''}
                              {rowRefunds > 0n
                                ? uiF(" Refund -{0}", [formatStatementMoney(rowRefunds, row.currency)])
                                : ''}
                            </div>
                          )}
                        </TableCell>

                        <TableCell data-label={uiT("Net revenue")} className="text-right align-top whitespace-nowrap tabular-nums">
                          <div>
                            {rowNetRev === null ? (
                              <span className="text-muted-foreground" aria-label={uiT("Unavailable")}>
                                {unresolved > 0n ? uiT("Pending") : '—'}
                              </span>
                            ) : (
                              <StatementMoney amount={rowNetRev} currency={row.currency} />
                            )}
                          </div>
                          {rowNetRev !== null && priorNetRev !== null && (
                            <div className="mt-0.5">
                              {formatDeltaBadge(uiT, rowNetRev, priorNetRev, row.currency)}
                            </div>
                          )}
                        </TableCell>

                        <TableCell data-label={uiT("Customer cash applied")} className="text-right align-top whitespace-nowrap tabular-nums">
                          <div>
                            {rowCashApplied === null ? (
                              <span className="text-muted-foreground" aria-label={uiT("Unavailable")}>
                                {unresolved > 0n ? uiT("Pending") : '—'}
                              </span>
                            ) : (
                              <StatementMoney amount={rowCashApplied} currency={row.currency} />
                            )}
                          </div>
                        </TableCell>

                        <TableCell data-label={uiT("Customer unpaid credit")} className="text-right align-top whitespace-nowrap tabular-nums">
                          <div>
                            {rowUnpaidCredit === null ? (
                              <span className="text-muted-foreground" aria-label={uiT("Unavailable")}>
                                {unresolved > 0n ? uiT("Pending") : '—'}
                              </span>
                            ) : (
                              <StatementMoney amount={rowUnpaidCredit} currency={row.currency} />
                            )}
                          </div>
                        </TableCell>

                        <TableCell data-label={uiT("Provider payable")} className="text-right align-top whitespace-nowrap tabular-nums">
                          {rowPayable === null ? (
                            <span className="text-muted-foreground" aria-label={uiT("Unavailable")}>—</span>
                          ) : (
                            <div>
                              <div><StatementMoney amount={rowPayable} currency={row.currency} /></div>
                              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                                <div>
                                  {uiT("Settled")}{' '}
                                  {row.settled_earning_nanos
                                    ? formatStatementMoney(row.settled_earning_nanos, row.currency)
                                    : formatStatementMoney(0n, row.currency)}
                                </div>
                                <div>
                                  {uiT("Unpaid")}{' '}
                                  {row.unsettled_earning_nanos
                                    ? formatStatementMoney(row.unsettled_earning_nanos, row.currency)
                                    : formatStatementMoney(0n, row.currency)}
                                </div>
                              </div>
                            </div>
                          )}
                        </TableCell>

                        <TableCell data-label={uiT("Recorded upstream cost")} className="text-right align-top whitespace-nowrap tabular-nums">
                          <div>
                            {rowUpstreamCost === null ? (
                              <span className="text-muted-foreground" aria-label={uiT("Unavailable")}>—</span>
                            ) : (
                              <StatementMoney amount={rowUpstreamCost} currency={row.currency} />
                            )}
                          </div>
                        </TableCell>

                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table></div>
            )}
          </div>
            </TabsContent>
          </Tabs>

          {/* Print-only formal document footer */}
          <footer className="commercial-print-only commercial-print-footer hidden">
            <div className="commercial-print-notes">
              <strong>{uiT("Accounting & Attribution Notes:")}</strong>{" "}{uiT("Accrual operating revenue is recognized net of recorded customer balance refunds and consumed promotional gift allowances. Cost of supply reflects accrued Provider payables for matched dispatch cohorts; personal owner-funded calls are excluded. Financial statement figures display at least 4 decimal places (.0000) while preserving exact nanounit precision; model unit quotes retain full tariff precision.")}</div>
            <div className="commercial-print-footer-bar">
              <div className="commercial-print-footer-brand">
                <img src={logo} alt="" className="commercial-print-footer-logo" />
                <strong>{branding.display_name}</strong>
                <span>·</span>
                <span>{uiT("Platform Financial Reporting")}</span>
                <span>·</span>
                <span>{uiT("Financial Statements (")}{currencySymbol(currency)} {currency})</span>
              </div>
              <div className="commercial-print-footer-meta">
                <span>{uiT("Confidential — Internal & Audit Use Only")}</span>
                <span>·</span>
                <span>{uiT("Generated")}{" "}{formatInstant(new Date().toISOString())} UTC</span>
              </div>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}

function StatementRow({
  label,
  current,
  prior,
  currency,
  indented = false,
  strong = false,
  muted = false,
  negateDisplay = false,
  invertSentiment = false,
}: {
  label: string;
  current: bigint | null;
  prior: bigint | null;
  currency: string;
  indented?: boolean;
  strong?: boolean;
  muted?: boolean;
  negateDisplay?: boolean;
  invertSentiment?: boolean;
}) {
  const { t: uiT } = useUILocale();
  const formatVal = (val: bigint | null) => {
    if (val === null) return uiT('Unavailable');
    if (negateDisplay && val > 0n) return `-${formatStatementMoney(val, currency)}`;
    return formatStatementMoney(val, currency);
  };
  return (
    <TableRow className={strong ? 'bg-muted/30 font-semibold' : muted ? 'text-muted-foreground text-xs' : undefined}>
      <TableCell className={`whitespace-normal ${indented ? 'pl-6 text-muted-foreground' : ''}`}>
        {label}
      </TableCell>
      <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
        {current === null ? formatVal(current) : (
          <Tooltip>
            <TooltipTrigger asChild><span tabIndex={0}>{formatVal(current)}</span></TooltipTrigger>
            <TooltipContent>{uiT("Exact amount:")}{" "}{formatRateMoney(negateDisplay ? -current : current, currency)}</TooltipContent>
          </Tooltip>
        )}
      </TableCell>
      <TableCell className="text-right align-top whitespace-nowrap tabular-nums hidden sm:table-cell text-muted-foreground">
        {prior === null ? formatVal(prior) : (
          <Tooltip>
            <TooltipTrigger asChild><span tabIndex={0}>{formatVal(prior)}</span></TooltipTrigger>
            <TooltipContent>{uiT("Exact amount:")}{" "}{formatRateMoney(negateDisplay ? -prior : prior, currency)}</TooltipContent>
          </Tooltip>
        )}
      </TableCell>
      <TableCell className="text-right align-top whitespace-nowrap">
        {formatDeltaBadge(uiT, current, prior, currency, invertSentiment)}
      </TableCell>
    </TableRow>
  );
}

function formatUnits(units: string, places: number) {
  const amount = BigInt(units);
  const scale = 10n ** BigInt(places);
  const fraction = (amount % scale).toString().padStart(places, '0').replace(/0+$/, '');
  return `${amount / scale}${fraction ? '.' + fraction : ''}`;
}

function formatInstant(value: string) {
  return new Intl.DateTimeFormat(readLocale(), {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(value));
}
