import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { money, currencySymbol } from '@/lib/money';
import { exactAmount, quantity, mediaMeterLabel } from './MediaRateHistory';

export type MediaConsumptionRecord = {
  model_alias: string; meter: string; currency: string; rate_revision: string;
  resolution: string; reference_video: boolean; amount_units: string; decimal_places: number;
  per_quantity: { numerator: string; denominator: string }; requests: string;
  quantity?: string; quantity_denominator?: string; amount_nanos: string; unpaid_nanos: string;
};

/** Provider-owned recorded media obligations, shared by its portal and platform administration. */
export default function MediaConsumption({ records, administrator = false }: { records?: MediaConsumptionRecord[]; administrator?: boolean }) {
  const { t: uiT } = useUILocale();
  if (!Array.isArray(records)) return <p role="status" className="mt-4 text-sm text-muted-foreground">{uiT("Media usage is unavailable. Refresh Provider data; if it remains unavailable, contact the platform administrator. This does not mean there was no media usage.")}</p>;
  if (!records.length) return null;
  return <section className="mt-6 space-y-3" aria-label={uiT("Media usage")}>
    <h3 className="font-semibold">{uiT("Media usage")}</h3>
    <p className="text-sm text-muted-foreground">{administrator ? uiT("Accrued charges") : uiT("Earnings")}{" "}{uiT("use the agreed rate recorded for each request, including older rate revisions.")}</p>
    <Table aria-label={uiT("Media consumption")}><TableHeader><TableRow>
      <TableHead>{uiT("Model")}</TableHead>
      <TableHead>{uiT("Specification")}</TableHead>
      <TableHead className="text-right">{uiT("Requests")}</TableHead>
      <TableHead className="text-right">{uiT("Usage")}</TableHead>
      <TableHead className="text-right">{uiT("Recorded payout rate")}</TableHead>
      <TableHead className="text-right">{administrator ? uiT("Accrued charges") : uiT("Earnings")}</TableHead>
      <TableHead className="text-right">{uiT("Unpaid")}</TableHead>
    </TableRow></TableHeader><TableBody>{records.map((entry, index) => <TableRow key={`${entry.rate_revision}:${entry.meter}:${index}`}>
      <TableCell className="font-medium break-words whitespace-normal">{entry.model_alias}</TableCell>
      <TableCell className="text-muted-foreground whitespace-normal">{entry.resolution} · {entry.reference_video ? uiT("Video reference") : uiT("No video reference")}</TableCell>
      <TableCell className="text-right tabular-nums">{BigInt(entry.requests).toLocaleString(readUILocale())}</TableCell>
      <TableCell className="text-right tabular-nums">{entry.quantity == null || entry.quantity_denominator == null ? uiT("Usage unavailable") : `${quantity({ numerator: entry.quantity, denominator: entry.quantity_denominator })} ${mediaMeterLabel(entry.meter, { numerator: entry.quantity, denominator: entry.quantity_denominator })}`}</TableCell>
      <TableCell className="text-right tabular-nums"><div>{currencySymbol(entry.currency)}{exactAmount(entry.amount_units, entry.decimal_places)}</div><div className="text-xs text-muted-foreground">{uiT("per")}{" "}{quantity(entry.per_quantity)} {uiT(mediaMeterLabel(entry.meter, entry.per_quantity))}</div></TableCell>
      <TableCell className="text-right tabular-nums">{money(entry.amount_nanos, entry.currency)}</TableCell>
      <TableCell className="text-right tabular-nums">{money(entry.unpaid_nanos, entry.currency)}</TableCell>
    </TableRow>)}</TableBody></Table>
  </section>;
}
