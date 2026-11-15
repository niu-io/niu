export type PeriodMode = 'mtd' | 'month' | 'range' | 'rolling';

export type MonthOption = {
  key: string; // YYYY-MM
  year: number;
  monthIndex: number; // 0-11
  periodLabel: string;
  shortLabel: string;
  isCurrent: boolean;
};

export type ResolvedInterval = {
  mode: PeriodMode;
  periodLabel: string;
  comparisonLabel: string;
  days?: 7 | 30 | 90;
  from: string;
  until: string;
  priorFrom: string;
  priorUntil: string;
};

type MessageFormatter = (pattern: string, values: readonly unknown[]) => string;

const defaultFormat: MessageFormatter = (pattern, values) =>
  pattern.replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)]));

/** Build recent calendar month options in UTC for commercial reporting filters. */
export function buildRecentMonths(
  count = 12,
  now = new Date(),
  locale = 'en',
  uiF: MessageFormatter = defaultFormat,
): MonthOption[] {
  const curYear = now.getUTCFullYear();
  const curMonth = now.getUTCMonth();
  const options: MonthOption[] = [];
  for (let offset = 0; offset < count; offset++) {
    const d = new Date(Date.UTC(curYear, curMonth - offset, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const full = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }).format(d);
    const short = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      month: 'short',
      year: 'numeric',
    }).format(d);
    options.push({
      key,
      year: y,
      monthIndex: m,
      periodLabel: offset === 0 ? uiF('{0} (MTD)', [full]) : full,
      shortLabel: short,
      isCurrent: offset === 0,
    });
  }
  return options;
}

export function parseMonthKey(key: string): { year: number; monthIndex: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1 };
}

/** Resolve the reporting period and prior comparison interval from URL search parameters. */
export function resolveInterval(
  search: URLSearchParams,
  months: MonthOption[],
  now = new Date(),
  locale = 'en',
  uiF: MessageFormatter = defaultFormat,
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
      periodLabel: uiF('Last {0} days', [d]),
      comparisonLabel: uiF('Prior {0} days', [d]),
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
    const monthLabel = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }).format(start);
    const prevLabel = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      month: 'short',
      year: 'numeric',
    }).format(prevStart);
    return {
      mode: 'month',
      periodLabel: isCurrentMonth ? uiF('{0} (Month to date)', [monthLabel]) : monthLabel,
      comparisonLabel: isCurrentMonth ? uiF('{0} (same MTD span)', [prevLabel]) : prevLabel,
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
    const maxIdx = Math.max(startIdx, endIdx);
    const minIdx = Math.max(Math.min(startIdx, endIdx), maxIdx - 11);
    const spanMonths = Math.min(12, Math.max(1, maxIdx - minIdx + 1));
    const startDate = new Date(Date.UTC(Math.floor(minIdx / 12), minIdx % 12, 1));
    const isEndCurrent = Math.floor(maxIdx / 12) === curYear && (maxIdx % 12) === curMonth;
    const endDate = isEndCurrent
      ? now
      : new Date(Date.UTC(Math.floor(maxIdx / 12), (maxIdx % 12) + 1, 1));
    const priorStartIdx = minIdx - spanMonths;
    const priorStartDate = new Date(Date.UTC(Math.floor(priorStartIdx / 12), ((priorStartIdx % 12) + 12) % 12, 1));
    const priorEndDate = isEndCurrent
      ? new Date(Math.min(
          startDate.getTime(),
          priorStartDate.getTime() + Math.max(60_000, now.getTime() - startDate.getTime()),
        ))
      : startDate;
    const fmt = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', year: 'numeric' });
    return {
      mode: 'range',
      periodLabel: uiF('{0} – {1} ({2} mo)', [fmt.format(startDate), fmt.format(new Date(Date.UTC(Math.floor(maxIdx / 12), maxIdx % 12, 1))), spanMonths]),
      comparisonLabel: uiF('Prior {0} mo ({1} – {2})', [spanMonths, fmt.format(priorStartDate), fmt.format(new Date(startDate.getTime() - 86_400_000))]),
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
  const curLabel = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(start);
  const prevLabel = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    month: 'short',
    year: 'numeric',
  }).format(prevStart);
  return {
    mode: 'mtd',
    periodLabel: uiF('{0} · Month to date', [curLabel]),
    comparisonLabel: uiF('{0} MTD', [prevLabel]),
    from: start.toISOString(),
    until: now.toISOString(),
    priorFrom: prevStart.toISOString(),
    priorUntil: prevUntil.toISOString(),
  };
}
