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
  if (!Array.isArray(records)) return <p role="status" className="mt-4 text-sm text-muted-foreground">Media usage is unavailable. Refresh Provider data; if it remains unavailable, contact the platform administrator. This does not mean there was no media usage.</p>;
  if (!records.length) return null;
  return <section className="mt-6 space-y-3" aria-label="Media usage">
    <h3 className="font-semibold">Media usage</h3>
    <p className="text-sm text-muted-foreground">{administrator ? 'Accrued charges' : 'Earnings'} use the agreed rate recorded for each request, including older rate revisions.</p>
    <Table className="table-fixed [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:align-top [&_td]:break-words" aria-label="Media consumption"><TableHeader><TableRow>
      <TableHead className="w-[38%]">Model / usage</TableHead><TableHead className="w-[30%]">Recorded payout rate</TableHead><TableHead>{administrator ? 'Accrued charges' : 'Earnings'} / unpaid</TableHead>
    </TableRow></TableHeader><TableBody>{records.map((entry, index) => <TableRow key={`${entry.rate_revision}:${entry.meter}:${index}`}>
      <TableCell><strong>{entry.model_alias}</strong><div className="text-sm text-muted-foreground">{entry.resolution} · {entry.reference_video ? 'Video reference' : 'No video reference'}</div><div className="mt-2">{BigInt(entry.requests).toLocaleString()} requests</div><div className="text-sm text-muted-foreground">{entry.quantity == null || entry.quantity_denominator == null ? 'Usage unavailable' : `${quantity({ numerator: entry.quantity, denominator: entry.quantity_denominator })} ${mediaMeterLabel(entry.meter, { numerator: entry.quantity, denominator: entry.quantity_denominator })}`}</div></TableCell>
      <TableCell>{currencySymbol(entry.currency)}{exactAmount(entry.amount_units, entry.decimal_places)}<div className="text-sm text-muted-foreground">per {quantity(entry.per_quantity)} {mediaMeterLabel(entry.meter, entry.per_quantity)}</div></TableCell>
      <TableCell><div>{money(entry.amount_nanos, entry.currency)}</div><div className="mt-2 text-sm text-muted-foreground">Unpaid</div>{money(entry.unpaid_nanos, entry.currency)}</TableCell>
    </TableRow>)}</TableBody></Table>
  </section>;
}
