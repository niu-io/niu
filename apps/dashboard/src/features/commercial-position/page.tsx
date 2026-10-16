import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconCalendarStats,
  IconChevronDown,
  IconFileTypePdf,
  IconMinus,
  IconRefresh,
} from '@tabler/icons-react';
import { useDashboardContext } from '@/app/dashboard-context';
import { useBranding } from '@/app/branding';
import { request } from '@/features/vendors/api';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  CommercialPosition,
  CommercialPositionRow,
  CustomerFinancialSummary,
} from '../../../../../sdks/javascript/src/admin';

type PeriodMode = 'mtd' | 'month' | 'range' | 'rolling';

type MonthOption = {
  key: string; // YYYY-MM
  year: number;
  monthIndex: number; // 0-11
  label: string;
  shortLabel: string;
  isCurrent: boolean;
};

type ResolvedInterval = {
  mode: PeriodMode;
  label: string;
  comparisonLabel: string;
  days?: 7 | 30 | 90;
  from: string;
  until: string;
  priorFrom: string;
  priorUntil: string;
};

const SUPPORTED_CURRENCIES = ['USD', 'CNY'] as const;

function currencySymbol(currency: string): string {
  return currency.toUpperCase() === 'CNY' ? '¥' : '$';
}

/**
 * Formats financial statement figures (revenue, costs, payables, cash receipts, balances)
 * to standard 4 decimal places (.0000) with $ or ¥ currency symbols.
 */
function formatFinancialMoney(nanos: bigint | string, currency: string): string {
  const val = typeof nanos === 'bigint' ? nanos : BigInt(nanos || '0');
  const negative = val < 0n;
  const abs = negative ? -val : val;
  const scaled4 = (abs + 50_000n) / 100_000n;
  const whole = scaled4 / 10_000n;
  const frac = (scaled4 % 10_000n).toString().padStart(4, '0');
  const wholeFormatted = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sym = currencySymbol(currency);
  return `${negative && scaled4 > 0n ? '-' : ''}${sym}${wholeFormatted}.${frac}`;
}

/**
 * Formats model unit prices / offer quotes with $ or ¥ and preserves full significant
 * decimal precision (up to 9 decimal places, minimum 2 decimal places).
 */
function formatRateMoney(nanos: bigint | string, currency: string): string {
  const val = typeof nanos === 'bigint' ? nanos : BigInt(nanos || '0');
  const negative = val < 0n;
  const abs = negative ? -val : val;
  const scale = 1_000_000_000n;
  const whole = abs / scale;
  const rawFrac = (abs % scale).toString().padStart(9, '0').replace(/0+$/, '');
  const frac = rawFrac.length < 2 ? rawFrac.padEnd(2, '0') : rawFrac;
  const wholeFormatted = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sym = currencySymbol(currency);
  return `${negative && abs > 0n ? '-' : ''}${sym}${wholeFormatted}.${frac}`;
}

function buildRecentMonths(count = 12, now = new Date()): MonthOption[] {
  const curYear = now.getUTCFullYear();
  const curMonth = now.getUTCMonth();
  const options: MonthOption[] = [];
  for (let offset = 0; offset < count; offset++) {
    const d = new Date(Date.UTC(curYear, curMonth - offset, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const full = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }).format(d);
    const short = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      year: 'numeric',
    }).format(d);
    options.push({
      key,
      year: y,
      monthIndex: m,
      label: offset === 0 ? `${full} (MTD)` : full,
      shortLabel: short,
      isCurrent: offset === 0,
    });
  }
  return options;
}

function parseMonthKey(key: string): { year: number; monthIndex: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1 };
}

function resolveInterval(
  search: URLSearchParams,
  months: MonthOption[],
  now = new Date(),
): ResolvedInterval {
  const explicitMode = search.get('mode') as PeriodMode | null;
  const explicitDays = search.get('days');
  const mode: PeriodMode =
    explicitMode && ['mtd', 'month', 'range', 'rolling'].includes(explicitMode)
      ? explicitMode
      : explicitDays && ['7', '30', '90'].includes(explicitDays)
        ? 'rolling'
        : 'mtd';

  const curYear = now.getUTCFullYear();
  const curMonth = now.getUTCMonth();

  if (mode === 'rolling') {
    const d = (['7', '30', '90'].includes(explicitDays ?? '') ? Number(explicitDays) : 30) as 7 | 30 | 90;
    const untilMs = now.getTime();
    const fromMs = untilMs - d * 86_400_000;
    const priorUntilMs = fromMs;
    const priorFromMs = priorUntilMs - d * 86_400_000;
    return {
      mode: 'rolling',
      label: `Last ${d} days`,
      comparisonLabel: `Prior ${d} days`,
      days: d,
      from: new Date(fromMs).toISOString(),
      until: new Date(untilMs).toISOString(),
      priorFrom: new Date(priorFromMs).toISOString(),
      priorUntil: new Date(priorUntilMs).toISOString(),
    };
  }

  if (mode === 'month') {
    const defaultMonth = months[1]?.key ?? months[0]?.key ?? `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;
    const rawKey = search.get('month') ?? defaultMonth;
    const parsed = parseMonthKey(rawKey) ?? { year: curYear, monthIndex: curMonth };
    const start = new Date(Date.UTC(parsed.year, parsed.monthIndex, 1));
    const isCurrentMonth = parsed.year === curYear && parsed.monthIndex === curMonth;
    const end = isCurrentMonth ? now : new Date(Date.UTC(parsed.year, parsed.monthIndex + 1, 1));
    const prevStart = new Date(Date.UTC(parsed.year, parsed.monthIndex - 1, 1));
    const prevEnd = isCurrentMonth
      ? new Date(Math.min(
          Date.UTC(parsed.year, parsed.monthIndex, 1),
          prevStart.getTime() + (now.getTime() - start.getTime()),
        ))
      : start;
    const monthLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }).format(start);
    const prevLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      year: 'numeric',
    }).format(prevStart);
    return {
      mode: 'month',
      label: isCurrentMonth ? `${monthLabel} (Month to date)` : monthLabel,
      comparisonLabel: isCurrentMonth ? `${prevLabel} (same MTD span)` : prevLabel,
      from: start.toISOString(),
      until: end.toISOString(),
      priorFrom: prevStart.toISOString(),
      priorUntil: prevEnd.toISOString(),
    };
  }

  if (mode === 'range') {
    const fallbackStart = months[Math.min(2, months.length - 1)]?.key ?? months[0].key;
    const fallbackEnd = months[0].key;
    const rawStart = search.get('start_month') ?? fallbackStart;
    const rawEnd = search.get('end_month') ?? fallbackEnd;
    const pStart = parseMonthKey(rawStart) ?? { year: curYear, monthIndex: curMonth - 2 };
    const pEnd = parseMonthKey(rawEnd) ?? { year: curYear, monthIndex: curMonth };
    const startIdx = pStart.year * 12 + pStart.monthIndex;
    const endIdx = pEnd.year * 12 + pEnd.monthIndex;
    const minIdx = Math.min(startIdx, endIdx);
    const maxIdx = Math.max(startIdx, endIdx);
    const spanMonths = Math.min(12, Math.max(1, maxIdx - minIdx + 1));
    const startDate = new Date(Date.UTC(Math.floor(minIdx / 12), minIdx % 12, 1));
    const isEndCurrent = Math.floor(maxIdx / 12) === curYear && (maxIdx % 12) === curMonth;
    const endDate = isEndCurrent
      ? now
      : new Date(Date.UTC(Math.floor(maxIdx / 12), (maxIdx % 12) + 1, 1));
    const priorStartIdx = minIdx - spanMonths;
    const priorStartDate = new Date(Date.UTC(Math.floor(priorStartIdx / 12), ((priorStartIdx % 12) + 12) % 12, 1));
    const priorEndDate = startDate;
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' });
    return {
      mode: 'range',
      label: `${fmt.format(startDate)} – ${fmt.format(new Date(Date.UTC(Math.floor(maxIdx / 12), maxIdx % 12, 1)))} (${spanMonths} mo)`,
      comparisonLabel: `Prior ${spanMonths} mo (${fmt.format(priorStartDate)} – ${fmt.format(new Date(priorEndDate.getTime() - 86_400_000))})`,
      from: startDate.toISOString(),
      until: endDate.toISOString(),
      priorFrom: priorStartDate.toISOString(),
      priorUntil: priorEndDate.toISOString(),
    };
  }

  // Default: 'mtd' (Current Month from Day 1 to Today)
  const start = new Date(Date.UTC(curYear, curMonth, 1));
  const elapsedMs = Math.max(60_000, now.getTime() - start.getTime());
  const prevStart = new Date(Date.UTC(curYear, curMonth - 1, 1));
  const prevMonthEnd = start;
  const prevUntil = new Date(Math.min(prevMonthEnd.getTime(), prevStart.getTime() + elapsedMs));
  const curLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(start);
  const prevLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    year: 'numeric',
  }).format(prevStart);
  return {
    mode: 'mtd',
    label: `${curLabel} · Month to date`,
    comparisonLabel: `${prevLabel} MTD`,
    from: start.toISOString(),
    until: now.toISOString(),
    priorFrom: prevStart.toISOString(),
    priorUntil: prevUntil.toISOString(),
  };
}

async function fetchPeriodBundle(
  token: string,
  currency: string,
  opts: { from: string; until: string },
  signal: AbortSignal,
): Promise<{ position: CommercialPosition; summary: CustomerFinancialSummary }> {
  const query = new URLSearchParams({ currency, from: opts.from, until: opts.until });
  const [position, summary] = await Promise.all([
    request<CommercialPosition>(token, '/api/v1/commercial-position?' + query, 'GET', undefined, signal),
    request<CustomerFinancialSummary>(token, '/api/v1/financial-summary?' + query, 'GET', undefined, signal),
  ]);
  return { position, summary };
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
        // If a row has unresolved attempts, still accumulate known net contribution from fully resolved rows
        // while tracking that unresolved traffic exists.
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
    netContribution: contributionKnown ? netContribution : null,
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
  current: bigint | null,
  prior: bigint | null,
  currency: string,
  invertSentiment = false,
) {
  if (current === null || prior === null) {
    return <span className="whitespace-nowrap shrink-0 text-xs text-muted-foreground">{current === null ? 'Change unavailable' : 'No prior baseline'}</span>;
  }
  const diff = current - prior;
  const absDiff = diff < 0n ? -diff : diff;
  const roundedDiff4 = (absDiff + 50_000n) / 100_000n;
  if (diff === 0n) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-xs text-muted-foreground tabular-nums">
        <IconMinus size={13} /> No change
      </span>
    );
  }
  const isPositive = diff > 0n;
  if (roundedDiff4 === 0n) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-xs text-muted-foreground tabular-nums">
            {isPositive ? <IconArrowUpRight size={14} /> : <IconArrowDownRight size={14} />}
            {isPositive ? '+' : '-'}&lt;{currencySymbol(currency)}0.0001
          </span>
        </TooltipTrigger>
        <TooltipContent>Exact change: {isPositive ? '+' : '-'}{formatRateMoney(absDiff, currency)}</TooltipContent>
      </Tooltip>
    );
  }
  const pct =
    prior >= 50_000n
      ? `${isPositive ? '+' : ''}${(Number((diff * 10000n) / prior) / 100).toFixed(1)}%`
      : isPositive
        ? 'New'
        : '—';
  const absMoney = formatFinancialMoney(absDiff, currency);
  const signedMoney = `${isPositive ? '+' : '-'}${absMoney}`;
  const good = invertSentiment ? !isPositive : isPositive;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-xs font-medium tabular-nums ${
        good ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
      }`}
    >
      {isPositive ? <IconArrowUpRight size={14} /> : <IconArrowDownRight size={14} />}
      <span>{signedMoney}</span>
      <span className="text-muted-foreground font-normal">({pct})</span>
    </span>
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
  const { settings: branding, logo } = useBranding();
  const [search, setSearch] = useSearchParams();
  const [refresh, setRefresh] = useState(0);
  const asOf = useMemo(() => new Date(), [search, refresh]);
  const months = useMemo(() => buildRecentMonths(12, asOf), [asOf]);
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
  const rawCurrency = (search.get('currency') ?? 'USD').toUpperCase();
  const currency = rawCurrency === 'CNY' ? 'CNY' : 'USD';
  const interval = useMemo(() => resolveInterval(normalizedSearch, months, asOf), [normalizedSearch, months, asOf]);

  const [position, setPosition] = useState<CommercialPosition | null>(null);
  const [summary, setSummary] = useState<CustomerFinancialSummary | null>(null);
  const [priorPosition, setPriorPosition] = useState<CommercialPosition | null>(null);
  const [priorSummary, setPriorSummary] = useState<CustomerFinancialSummary | null>(null);
  const [modelFilter, setModelFilter] = useState<'active' | 'all'>('active');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setPosition(null);
    setSummary(null);
    setPriorPosition(null);
    setPriorSummary(null);

    const currentPromise = fetchPeriodBundle(
      token,
      currency,
      { from: interval.from, until: interval.until },
      controller.signal,
    );
    const priorPromise = fetchPeriodBundle(
      token,
      currency,
      { from: interval.priorFrom, until: interval.priorUntil },
      controller.signal,
    ).catch(() => null);

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
  }, [token, currency, interval.mode, interval.days, interval.from, interval.until, interval.priorFrom, interval.priorUntil, asOf]);

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
        ? BigInt(summary.known_revenue_subtotal_nanos)
        : currentCohort.netRevenue;
  const priorRecognizedRevenue =
    priorSummary?.recognized_revenue_nanos != null
      ? BigInt(priorSummary.recognized_revenue_nanos)
      : priorSummary
        ? BigInt(priorSummary.known_revenue_subtotal_nanos)
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

  const netContribution =
    recognizedRevenue !== null ? recognizedRevenue - currentCohort.providerPayable : currentCohort.netContribution;
  const priorNetContribution =
    priorRecognizedRevenue !== null && priorCohort
      ? priorRecognizedRevenue - priorCohort.providerPayable
      : priorCohort?.netContribution ?? null;

  const verifiedCashReceipts =
    summary?.verified_cash_receipts_nanos != null ? BigInt(summary.verified_cash_receipts_nanos) : null;
  const priorVerifiedCashReceipts =
    priorSummary?.verified_cash_receipts_nanos != null ? BigInt(priorSummary.verified_cash_receipts_nanos) : null;

  const prepaidCash =
    summary?.balance_credit_sources?.prepaid_cash_nanos != null
      ? BigInt(summary.balance_credit_sources.prepaid_cash_nanos)
      : summary?.balance_credit_sources?.known_prepaid_cash_subtotal_nanos != null
        ? BigInt(summary.balance_credit_sources.known_prepaid_cash_subtotal_nanos)
        : null;
  const outstandingCredit =
    summary?.balance_credit_sources?.outstanding_credit_nanos != null
      ? BigInt(summary.balance_credit_sources.outstanding_credit_nanos)
      : summary?.balance_credit_sources?.known_outstanding_credit_subtotal_nanos != null
        ? BigInt(summary.balance_credit_sources.known_outstanding_credit_subtotal_nanos)
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

  const displayedRows =
    modelFilter === 'active' && activeRows.length > 0 ? activeRows : sortedRows;

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
    mtd: 'Month to date (Current month)',
    month: 'Single calendar month',
    range: 'Multi-month range',
    rolling: 'Rolling day window',
  };

  return (
    <section className="commercial-statement min-w-0 space-y-6" aria-label="Financial statements">
      {/* Print-only formal branded document header */}
      <header className="commercial-print-only commercial-print-header hidden">
        <div className="commercial-print-header-top">
          <div className="commercial-print-brand">
            <img src={logo} alt={branding.display_name} className="commercial-print-logo" />
            <div>
              <div className="commercial-print-brand-eyebrow">
                <span>{branding.display_name}</span>
                <span className="commercial-print-brand-dot">·</span>
                <span>PLATFORM FINANCIAL REPORTING</span>
              </div>
              <h1 className="commercial-print-title">Financial Statements</h1>
              <p className="commercial-print-subtitle">
                Statement of Operations (P&amp;L), Cash Receipts &amp; Wallet Position, and Provider Unit Economics
              </p>
            </div>
          </div>
          <div className="commercial-print-meta-box">
            <div className="commercial-print-classification">CONFIDENTIAL · PLATFORM ADMIN</div>
            <dl className="commercial-print-meta-grid">
              <div>
                <dt>Reporting Period</dt>
                <dd>{interval.label}</dd>
              </div>
              <div>
                <dt>Comparison Baseline</dt>
                <dd>{interval.comparisonLabel}</dd>
              </div>
              <div>
                <dt>UTC Window</dt>
                <dd>
                  {formatInstant(position?.from ?? interval.from)} –{' '}
                  {formatInstant(position?.until ?? interval.until)} UTC
                </dd>
              </div>
              <div>
                <dt>Reporting Currency</dt>
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
              <Button variant="outline" aria-label="Reporting period mode" className="gap-2 font-normal">
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
                <DropdownMenuRadioItem value="mtd">Month to date (Current month)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="month">Single calendar month</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="range">Multi-month range</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="rolling">Rolling day window (7 / 30 / 90d)</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Secondary Period Picker based on mode */}
          {interval.mode === 'month' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" aria-label="Select calendar month" className="gap-2 font-normal">
                  <span>{months.find(m => m.key === selectedMonthKey)?.label ?? selectedMonthKey}</span>
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
                      {m.label}
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
                  <Button variant="outline" aria-label="Start month" className="gap-2 font-normal">
                    <span>From: {months.find(m => m.key === selectedStartMonthKey)?.shortLabel ?? selectedStartMonthKey}</span>
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
                        {m.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" aria-label="End month" className="gap-2 font-normal">
                    <span>To: {months.find(m => m.key === selectedEndMonthKey)?.shortLabel ?? selectedEndMonthKey}</span>
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
                        {m.label}
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
                <Button variant="outline" aria-label="Commercial period" className="gap-2 font-normal">
                  <span>Last {interval.days ?? 30} days</span>
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
                      Last {value} days
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Currency Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label="Statement currency" className="gap-2 font-normal">
                <span>Currency: {currencySymbol(currency)} {currency}</span>
                <IconChevronDown size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={currency}
                onValueChange={value => updateParams({ currency: value })}
              >
                {SUPPORTED_CURRENCIES.map(curr => (
                  <DropdownMenuRadioItem key={curr} value={curr}>
                    {currencySymbol(curr)} {curr}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right Actions: Refresh & Export PDF */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => setRefresh(value => value + 1)}
          >
            <IconRefresh size={16} />
            <span>Refresh</span>
          </Button>
          <Button
            variant="outline"
            disabled={loading || !position}
            onClick={() => window.print()}
            aria-label="Export PDF statement"
          >
            <IconFileTypePdf size={16} />
            <span>Export PDF</span>
          </Button>
        </div>
      </div>

      {/* Period Interval Subtitle */}
      <div className="commercial-print-hide flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          <strong className="font-medium text-foreground">{interval.label}</strong> · UTC window:{' '}
          {formatInstant(position?.from ?? interval.from)} to{' '}
          {formatInstant(position?.until ?? interval.until)} · Compared against{' '}
          <strong className="font-medium text-foreground">{interval.comparisonLabel}</strong>
        </span>
        <span>Personal owner-funded calls are excluded from commercial revenue and cost.</span>
      </div>

      {loading && <p role="status" className="text-sm text-muted-foreground">Loading financial statement…</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!loading && position && (
        <>
          {/* Layer 1: Executive Financial KPI Cards with Period-over-Period Comparison */}
          <div className="commercial-kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="min-w-0 rounded-xl bg-card p-5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Net recognized revenue</span>
                <Badge variant="outline">Income</Badge>
              </div>
              <div className="text-xl xl:text-[22px] font-semibold tracking-tight tabular-nums">
                {recognizedRevenue === null ? 'Unavailable' : formatFinancialMoney(recognizedRevenue, currency)}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 pt-0.5">
                {formatDeltaBadge(recognizedRevenue, priorRecognizedRevenue, currency)}
                <span className="whitespace-nowrap text-xs text-muted-foreground">vs {interval.comparisonLabel}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1 border-t border-border/60 tabular-nums">
                Gross usage {formatFinancialMoney(nominalConsumption, currency)} · Gifts &amp; refunds{' '}
                {consumedGifts + customerRefunds >= 50_000n ? '-' : ''}
                {formatFinancialMoney(consumedGifts + customerRefunds, currency)}
              </p>
            </article>

            <article className="min-w-0 rounded-xl bg-card p-5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Cost of supply (Provider payable)</span>
                <Badge variant="outline">COGS</Badge>
              </div>
              <div className="text-xl xl:text-[22px] font-semibold tracking-tight tabular-nums">
                {formatFinancialMoney(currentCohort.providerPayable, currency)}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 pt-0.5">
                {formatDeltaBadge(
                  currentCohort.providerPayable,
                  priorCohort?.providerPayable ?? null,
                  currency,
                  true,
                )}
                <span className="whitespace-nowrap text-xs text-muted-foreground">vs {interval.comparisonLabel}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1 border-t border-border/60 tabular-nums">
                Settled {formatFinancialMoney(currentCohort.settledPayable, currency)} · Unpaid{' '}
                {formatFinancialMoney(currentCohort.unpaidPayable, currency)}
              </p>
            </article>

            <article className="min-w-0 rounded-xl bg-card p-5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Platform net contribution</span>
                <Badge variant="secondary">
                  {formatMarginPercent(netContribution, recognizedRevenue)} margin
                </Badge>
              </div>
              <div className="text-xl xl:text-[22px] font-semibold tracking-tight tabular-nums">
                {netContribution === null ? 'Unavailable' : formatFinancialMoney(netContribution, currency)}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 pt-0.5">
                {formatDeltaBadge(netContribution, priorNetContribution, currency)}
                <span className="whitespace-nowrap text-xs text-muted-foreground">vs {interval.comparisonLabel}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1 border-t border-border/60 tabular-nums">
                {currentCohort.matchedAttempts.toString()} settled requests ·{' '}
                {currentCohort.activeModelCount} active{' '}
                {currentCohort.activeModelCount === 1 ? 'model' : 'models'}
              </p>
            </article>

            <article className="min-w-0 rounded-xl bg-card p-5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Verified cash receipts</span>
                <Badge variant="outline">Cash flow</Badge>
              </div>
              <div className="text-xl xl:text-[22px] font-semibold tracking-tight tabular-nums">
                {verifiedCashReceipts === null
                  ? 'Unavailable'
                  : formatFinancialMoney(verifiedCashReceipts, currency)}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 pt-0.5">
                {formatDeltaBadge(verifiedCashReceipts, priorVerifiedCashReceipts, currency)}
                <span className="whitespace-nowrap text-xs text-muted-foreground">vs {interval.comparisonLabel}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1 border-t border-border/60 tabular-nums">
                Unused prepaid wallet:{' '}
                {prepaidCash === null ? '—' : formatFinancialMoney(prepaidCash, currency)}
              </p>
            </article>
          </div>

          {/* Layer 2: Financial Statements (Income Statement + Cash Flow & Wallet Position) */}
          <div className="grid grid-cols-1 gap-6">
            {/* Table 1: Statement of Operations (Income Statement) */}
            <div className="min-w-0 rounded-xl bg-card p-5 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">Statement of operations (P&amp;L)</h2>
                  <p className="text-xs text-muted-foreground">
                    Accrual operating revenue, promotional allowances, and supply cost
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  Amounts in {currency} ({currencySymbol(currency)})
                </span>
              </div>
              <Table aria-label="Statement of operations" className="table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Line item</TableHead>
                    <TableHead className="w-[17%] text-right">Current</TableHead>
                    <TableHead className="w-[17%] text-right hidden sm:table-cell">
                      {interval.comparisonLabel}
                    </TableHead>
                    <TableHead className="w-[26%] text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <StatementRow
                    label="Gross customer usage charges"
                    current={nominalConsumption}
                    prior={priorNominalConsumption}
                    currency={currency}
                  />
                  <StatementRow
                    label="Less: Customer balance refunds"
                    current={customerRefunds}
                    prior={priorCustomerRefunds}
                    currency={currency}
                    indented
                    negateDisplay
                    invertSentiment
                  />
                  <StatementRow
                    label="Less: Consumed promotional gift allowance"
                    current={consumedGifts}
                    prior={priorConsumedGifts}
                    currency={currency}
                    indented
                    negateDisplay
                  />
                  <StatementRow
                    label="Net recognized customer revenue"
                    current={recognizedRevenue}
                    prior={priorRecognizedRevenue}
                    currency={currency}
                    strong
                  />
                  <StatementRow
                    label="Less: Provider payable (Cost of model supply)"
                    current={currentCohort.providerPayable}
                    prior={priorCohort?.providerPayable ?? null}
                    currency={currency}
                    indented
                    negateDisplay
                    invertSentiment
                  />
                  <StatementRow
                    label="Memo: Recorded upstream API cost subtotal"
                    current={currentCohort.recordedUpstreamCost}
                    prior={priorCohort?.recordedUpstreamCost ?? null}
                    currency={currency}
                    indented
                    muted
                  />
                  <StatementRow
                    label="Platform net contribution (Gross profit)"
                    current={netContribution}
                    prior={priorNetContribution}
                    currency={currency}
                    strong
                  />
                  <TableRow className="bg-muted/30 font-medium">
                    <TableCell>Effective gross margin (%)</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMarginPercent(netContribution, recognizedRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden sm:table-cell text-muted-foreground">
                      {formatMarginPercent(priorNetContribution, priorRecognizedRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {currentCohort.unresolvedAttempts > 0n
                        ? `${currentCohort.unresolvedAttempts.toString()} unresolved`
                        : 'Fully resolved'}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Table 2: Cash Flow, Payables & Wallet Balance Sheet */}
            <div className="min-w-0 rounded-xl bg-card p-5 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">Cash receipts, payables &amp; wallet position</h2>
                  <p className="text-xs text-muted-foreground">
                    Verified cash inflows, Provider settlement status, and customer balances
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  Amounts in {currency} ({currencySymbol(currency)})
                </span>
              </div>
              <Table aria-label="Customer financial posting summary" className="table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Measure</TableHead>
                    <TableHead className="w-[17%] text-right">Current</TableHead>
                    <TableHead className="w-[17%] text-right hidden sm:table-cell">
                      {interval.comparisonLabel}
                    </TableHead>
                    <TableHead className="w-[26%] text-right">Change / Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <StatementRow
                    label="Wallet cash funding receipts"
                    current={summary ? BigInt(summary.balance_funding_receipts_nanos) : null}
                    prior={priorSummary ? BigInt(priorSummary.balance_funding_receipts_nanos) : null}
                    currency={currency}
                  />
                  <StatementRow
                    label="External invoice payment receipts"
                    current={summary ? BigInt(summary.external_invoice_receipts_nanos) : null}
                    prior={priorSummary ? BigInt(priorSummary.external_invoice_receipts_nanos) : null}
                    currency={currency}
                  />
                  <StatementRow
                    label="Less: Recorded funding reversals"
                    current={summary ? BigInt(summary.recorded_funding_reversals_nanos) : null}
                    prior={priorSummary ? BigInt(priorSummary.recorded_funding_reversals_nanos) : null}
                    currency={currency}
                    indented
                    negateDisplay
                    invertSentiment
                  />
                  <StatementRow
                    label="Total verified cash receipts"
                    current={verifiedCashReceipts}
                    prior={priorVerifiedCashReceipts}
                    currency={currency}
                    strong
                  />
                  <StatementRow
                    label="Memo: Noncash promotional gifts issued"
                    current={summary ? BigInt(summary.issued_gifts_nanos) : null}
                    prior={priorSummary ? BigInt(priorSummary.issued_gifts_nanos) : null}
                    currency={currency}
                    indented
                    muted
                  />
                  <StatementRow
                    label="Memo: Unused noncash gifts corrected"
                    current={summary?.corrected_unused_gifts_nanos != null ? BigInt(summary.corrected_unused_gifts_nanos) : null}
                    prior={priorSummary?.corrected_unused_gifts_nanos != null ? BigInt(priorSummary.corrected_unused_gifts_nanos) : null}
                    currency={currency}
                    indented
                    muted
                  />
                  <StatementRow
                    label="Settled with Providers"
                    current={currentCohort.settledPayable}
                    prior={priorCohort?.settledPayable ?? null}
                    currency={currency}
                  />
                  <StatementRow
                    label="Outstanding unpaid Provider payable"
                    current={currentCohort.unpaidPayable}
                    prior={priorCohort?.unpaidPayable ?? null}
                    currency={currency}
                    strong
                    invertSentiment
                  />
                  <TableRow className="border-t-2">
                    <TableCell className="font-medium">
                      Unused verified prepaid cash (Wallet liability)
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {prepaidCash === null ? 'Unavailable' : formatFinancialMoney(prepaidCash, currency)}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell text-xs text-muted-foreground">
                      Point-in-time
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      Current balance
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      Outstanding customer credit consumption
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {outstandingCredit === null
                        ? 'Unavailable'
                        : formatFinancialMoney(outstandingCredit, currency)}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell text-xs text-muted-foreground">
                      Point-in-time
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      Receivable
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Layer 3: Unit Economics by Provider & Model */}
          <div className="min-w-0 rounded-xl bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Unit economics by Provider &amp; model</h2>
                <p className="text-xs text-muted-foreground">
                  {activeRows.length} active {activeRows.length === 1 ? 'model' : 'models'} with traffic in
                  this period · {sortedRows.length} total configured routes
                </p>
              </div>
              <div className="commercial-print-hide flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={modelFilter === 'active' ? 'secondary' : 'ghost'}
                  onClick={() => setModelFilter('active')}
                >
                  Active in period ({activeRows.length})
                </Button>
                <Button
                  size="sm"
                  variant={modelFilter === 'all' ? 'secondary' : 'ghost'}
                  onClick={() => setModelFilter('all')}
                >
                  All configured ({sortedRows.length})
                </Button>
              </div>
            </div>

            {displayedRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No commercial model configurations or activity in {currency} for this period.
              </p>
            ) : (
              <Table aria-label="Provider commercial positions">
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider / model</TableHead>
                    <TableHead className="hidden md:table-cell">Agreed offer quote</TableHead>
                    <TableHead className="text-right">Gross charges</TableHead>
                    <TableHead className="text-right">Net revenue</TableHead>
                    <TableHead className="text-right">Customer cash applied</TableHead>
                    <TableHead className="text-right">Customer unpaid credit</TableHead>
                    <TableHead className="text-right">Provider payable</TableHead>
                    <TableHead className="text-right">Recorded upstream cost</TableHead>
                    <TableHead className="text-right">Net contribution</TableHead>
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
                    const matched = BigInt(row.matched_attempts || '0');
                    const revenueUncovered = BigInt(row.revenue_uncovered_attempts || '0');
                    const cashUncovered = BigInt(row.cash_source_uncovered_attempts || '0');
                    const costRecorded = BigInt(row.upstream_cost_recorded_attempts || '0');
                    const costKnown = BigInt(row.cost_known_attempts || '0');

                    return (
                      <TableRow key={row.supplier_id + ':' + row.model_alias + ':' + row.currency}>
                        <TableCell className="align-top whitespace-normal">
                          <div className="font-medium text-foreground">{row.model_alias}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                            <Link
                              className="hover:underline"
                              to={'/admin/suppliers/' + encodeURIComponent(row.supplier_id)}
                            >
                              {row.supplier_name}
                            </Link>
                            <span>·</span>
                            <span>
                              {matched.toString()} matched
                              {unresolved > 0n ? ` · ${unresolved.toString()} unresolved` : ''}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="align-top whitespace-normal hidden md:table-cell text-xs max-w-[240px]">
                          {row.offers.length === 0 ? (
                            <span className="text-muted-foreground">No quote in {row.currency}</span>
                          ) : (
                            row.offers.map(offer => (
                              <div
                                key={offer.offer_id + ':' + offer.route_alias + ':' + offer.state}
                                className="space-y-0.5"
                              >
                                <span className="text-muted-foreground">
                                  {offer.rate_kind === 'text'
                                    ? `In ${
                                        offer.prompt_rate == null
                                          ? '—'
                                          : formatRateMoney(offer.prompt_rate, row.currency)
                                      } · Out ${
                                        offer.completion_rate == null
                                          ? '—'
                                          : formatRateMoney(offer.completion_rate, row.currency)
                                      } / 1M`
                                    : offer.media_rates.length === 0
                                      ? 'Media rate'
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

                        <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                          <div>
                            {rowCharge === null ? (
                              <span className="text-muted-foreground" aria-label="Unavailable">—</span>
                            ) : (
                              formatFinancialMoney(rowCharge, row.currency)
                            )}
                          </div>
                          {(rowGifts >= 50_000n || rowRefunds >= 50_000n) && (
                            <div className="text-xs text-muted-foreground">
                              {rowGifts >= 50_000n ? `Gift -${formatFinancialMoney(rowGifts, row.currency)}` : ''}
                              {rowRefunds >= 50_000n
                                ? ` Refund -${formatFinancialMoney(rowRefunds, row.currency)}`
                                : ''}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                          <div>
                            {rowNetRev === null ? (
                              <span className="text-muted-foreground" aria-label="Unavailable">
                                {unresolved > 0n ? 'Pending' : revenueUncovered > 0n ? 'Unavailable' : '—'}
                              </span>
                            ) : (
                              formatFinancialMoney(rowNetRev, row.currency)
                            )}
                          </div>
                          {revenueUncovered > 0n && (
                            <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                              {revenueUncovered.toString()} revenue uncovered
                            </div>
                          )}
                          {rowNetRev !== null && priorNetRev !== null && (
                            <div className="mt-0.5">
                              {formatDeltaBadge(rowNetRev, priorNetRev, row.currency)}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                          <div>
                            {rowCashApplied === null ? (
                              <span className="text-muted-foreground" aria-label="Unavailable">
                                {unresolved > 0n ? 'Pending' : cashUncovered > 0n ? 'Unavailable' : '—'}
                              </span>
                            ) : (
                              formatFinancialMoney(rowCashApplied, row.currency)
                            )}
                          </div>
                          {(cashUncovered > 0n || rowCashApplied !== null) && (
                            <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                              {cashUncovered.toString()} uncovered cash{' '}
                              {cashUncovered === 1n ? 'request' : 'requests'}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                          <div>
                            {rowUnpaidCredit === null ? (
                              <span className="text-muted-foreground" aria-label="Unavailable">
                                {unresolved > 0n ? 'Pending' : cashUncovered > 0n ? 'Unavailable' : '—'}
                              </span>
                            ) : (
                              formatFinancialMoney(rowUnpaidCredit, row.currency)
                            )}
                          </div>
                          {cashUncovered > 0n && (
                            <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                              {cashUncovered.toString()} cash uncovered
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                          {rowPayable === null ? (
                            <span className="text-muted-foreground" aria-label="Unavailable">—</span>
                          ) : (
                            <div>
                              <div>{formatFinancialMoney(rowPayable, row.currency)}</div>
                              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                                <div>
                                  Settled{' '}
                                  {row.settled_earning_nanos
                                    ? formatFinancialMoney(row.settled_earning_nanos, row.currency)
                                    : formatFinancialMoney(0n, row.currency)}
                                </div>
                                <div>
                                  Unpaid{' '}
                                  {row.unsettled_earning_nanos
                                    ? formatFinancialMoney(row.unsettled_earning_nanos, row.currency)
                                    : formatFinancialMoney(0n, row.currency)}
                                </div>
                              </div>
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                          <div>
                            {rowUpstreamCost === null ? (
                              <span className="text-muted-foreground" aria-label="Unavailable">—</span>
                            ) : (
                              formatFinancialMoney(rowUpstreamCost, row.currency)
                            )}
                          </div>
                          {(costRecorded > 0n || matched > 0n) && (
                            <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                              {costRecorded.toString()} recorded · {costKnown.toString()}/{matched.toString()}{' '}
                              matched covered
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                          {rowContrib !== null ? (
                            <div>
                              <div className="font-medium">
                                {formatFinancialMoney(rowContrib, row.currency)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatMarginPercent(rowContrib, rowNetRev)}
                              </div>
                            </div>
                          ) : unresolved > 0n ? (
                            <Badge variant="outline">Pending ({unresolved.toString()} unresolved)</Badge>
                          ) : (
                            <span className="text-muted-foreground" aria-label="Unavailable">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Print-only formal document footer */}
          <footer className="commercial-print-only commercial-print-footer hidden">
            <div className="commercial-print-notes">
              <strong>Accounting &amp; Attribution Notes:</strong> Accrual operating revenue is recognized net of recorded customer balance refunds and consumed promotional gift allowances. Cost of supply reflects accrued Provider payables for matched dispatch cohorts; personal owner-funded calls are excluded. Financial statement figures are rounded to 4 decimal places (.0000); model unit quotes retain full tariff precision.
            </div>
            <div className="commercial-print-footer-bar">
              <div className="commercial-print-footer-brand">
                <img src={logo} alt="" className="commercial-print-footer-logo" />
                <strong>{branding.display_name}</strong>
                <span>·</span>
                <span>Platform Financial Reporting</span>
                <span>·</span>
                <span>Financial Statements ({currencySymbol(currency)} {currency})</span>
              </div>
              <div className="commercial-print-footer-meta">
                <span>Confidential — Internal &amp; Audit Use Only</span>
                <span>·</span>
                <span>Generated {formatInstant(new Date().toISOString())} UTC</span>
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
  const formatVal = (val: bigint | null) => {
    if (val === null) return 'Unavailable';
    if (negateDisplay && val >= 50_000n) return `-${formatFinancialMoney(val, currency)}`;
    return formatFinancialMoney(val, currency);
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
            <TooltipContent>Exact amount: {formatRateMoney(negateDisplay ? -current : current, currency)}</TooltipContent>
          </Tooltip>
        )}
      </TableCell>
      <TableCell className="text-right align-top whitespace-nowrap tabular-nums hidden sm:table-cell text-muted-foreground">
        {prior === null ? formatVal(prior) : (
          <Tooltip>
            <TooltipTrigger asChild><span tabIndex={0}>{formatVal(prior)}</span></TooltipTrigger>
            <TooltipContent>Exact amount: {formatRateMoney(negateDisplay ? -prior : prior, currency)}</TooltipContent>
          </Tooltip>
        )}
      </TableCell>
      <TableCell className="text-right align-top whitespace-nowrap">
        {formatDeltaBadge(current, prior, currency, invertSentiment)}
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
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(value));
}
