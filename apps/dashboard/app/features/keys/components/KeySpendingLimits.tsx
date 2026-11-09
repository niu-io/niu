import { useLocale as useUILocale } from '@/shell/ui-locale';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { formatUnitAtoms, money } from '@/lib/money';
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from '@/components/ui/empty';
import { IconCurrencyDollar } from '@tabler/icons-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import type { ProjectKey } from '../api';

/** Read-only lifetime allowances. Editing lives in the single key settings surface. */
export default function KeySpendingLimits({ projectKey }: { projectKey: ProjectKey }) {
  const { t: uiT } = useUILocale();
  const { currency: platformCurrency } = usePlatformCurrency();
  const configuredRows = (projectKey.spending_limits ?? []).filter(row => row.limit_nanos !== null || BigInt(/^\d+$/.test(row.committed_nanos) ? row.committed_nanos : '0') > 0n);
  // A key without an explicit limit is unlimited in the platform currency; it
  // is not a key with no billing currency. Show that default instead of an
  // empty state that contradicts the settings editor.
  const rows = platformCurrency && !configuredRows.some(row => row.currency === platformCurrency)
    ? [...configuredRows, { currency: platformCurrency, limit_nanos: null, committed_nanos: '0', remaining_nanos: null }]
    : configuredRows;
  const unit = projectKey.unit_spending_limit ?? null;
  const showUnit = Boolean(unit && (unit.limit_atoms !== null || unit.unit !== null || BigInt(unit.committed_atoms) > 0n));
  const unitName = unit?.unit?.name ?? uiT("Credits");
  const unitPrecision = unit?.unit?.display_precision ?? 2;
  const hasAny = rows.length > 0 || showUnit;
  return <Card>
    <CardHeader><CardTitle>{uiT("Spending limits")}</CardTitle><CardDescription>{uiT("Lifetime customer spending allowances. Account and workspace limits still apply.")}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {!hasAny && <Empty className="min-h-32"><EmptyHeader><EmptyMedia variant="icon"><IconCurrencyDollar size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("No billing currency is available for this key yet.")}</EmptyDescription></EmptyHeader></Empty>}
      {showUnit && unit && <div className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
        <h3 className="font-medium">{unitName}</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="min-w-0"><dt className="text-muted-foreground">{uiT("Lifetime limit")}</dt><dd className="break-words">{unit.limit_atoms === null ? uiT("Unlimited") : formatUnitAtoms(unit.limit_atoms, unitName, unitPrecision)}</dd></div>
          <div className="min-w-0"><dt className="text-muted-foreground">{uiT("Committed")}</dt><dd className="break-words">{formatUnitAtoms(unit.committed_atoms, unitName, unitPrecision)}</dd></div>
          <div className="min-w-0"><dt className="text-muted-foreground">{uiT("Remaining allowance")}</dt><dd className="break-words">{unit.remaining_atoms === null ? uiT("Unlimited") : formatUnitAtoms(unit.remaining_atoms, unitName, unitPrecision)}</dd></div>
        </dl>
      </div>}
      {rows.map(row => <div key={row.currency} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
        <h3 className="font-medium">{row.currency}</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="min-w-0"><dt className="text-muted-foreground">{uiT("Lifetime limit")}</dt><dd className="break-words">{row.limit_nanos === null ? uiT("Unlimited") : money(row.limit_nanos, row.currency)}</dd></div>
          <div className="min-w-0"><dt className="text-muted-foreground">{uiT("Committed")}</dt><dd className="break-words">{money(row.committed_nanos, row.currency)}</dd></div>
          <div className="min-w-0"><dt className="text-muted-foreground">{uiT("Remaining allowance")}</dt><dd className="break-words">{row.remaining_nanos === null ? uiT("Unlimited") : money(row.remaining_nanos, row.currency)}</dd></div>
        </dl>
      </div>)}
      {hasAny && <p className="text-sm text-muted-foreground">{uiT("Committed amounts include charges minus refunds and reserved requests. These limits do not add funds or reset when the key is rotated. Own API key routes do not consume this allowance.")}</p>}
    </CardContent>
  </Card>;
}
