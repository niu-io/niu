import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { IconChevronDown, IconRefresh } from '@tabler/icons-react';
import { useDashboardContext } from '@/app/dashboard-context';
import { request } from '@/features/vendors/api';
import { money } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { CommercialPosition } from '../../../../../sdks/javascript/src/admin';

/** Procurement remains in Admin, behind the central platform permission boundary. */
export default function CommercialPositionPage() {
  const { token } = useDashboardContext();
  return <Position key={token} token={token} />;
}

function Position({ token }: { token: string }) {
  const [search, setSearch] = useSearchParams();
  const currency = search.get('currency') ?? 'USD';
  const period = search.get('days') ?? '30';
  const valid = /^[A-Z]{3}$/.test(currency) && ['7', '30', '90'].includes(period);
  const [input, setInput] = useState(currency);
  const [position, setPosition] = useState<CommercialPosition | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { setInput(currency); }, [currency]);
  useEffect(() => {
    const controller = new AbortController();
    setPosition(null); setError(''); setLoading(true);
    if (!valid) { setError('Choose a configured uppercase currency and a 7, 30 or 90 day period.'); setLoading(false); return; }
    void request<CommercialPosition>(token, '/admin/v1/commercial-position?' + new URLSearchParams({ currency, days: period }), 'GET', undefined, controller.signal)
      .then(value => { if (!controller.signal.aborted) setPosition(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Commercial position could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, currency, period, valid, refresh]);
  function update(name: string, value: string) {
    setSearch(current => { const next = new URLSearchParams(current); next.set(name, value); return next; });
  }
  return <section className="min-w-0 space-y-5" aria-label="Commercial overview">
    <p className="text-sm text-muted-foreground">Compare agreed supply, customer charges and Supplier settlement for the same model and currency. Personal API keys are excluded.</p>
    <div className="flex flex-wrap items-end gap-3">
      <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); update('currency', input.trim().toUpperCase()); }}>
        <div className="space-y-1"><Label htmlFor="commercial-currency">Currency</Label><Input id="commercial-currency" className="w-24" value={input} maxLength={3} onChange={event => setInput(event.target.value)} /></div>
        <Button type="submit" variant="outline">Apply</Button>
      </form>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label="Commercial period">{['7', '30', '90'].includes(period) ? `Last ${period} days` : 'Choose period'}<IconChevronDown size={16} /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start"><DropdownMenuRadioGroup value={period} onValueChange={value => update('days', value)}>{['7', '30', '90'].map(value => <DropdownMenuRadioItem key={value} value={value}>Last {value} days</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" disabled={loading} onClick={() => setRefresh(value => value + 1)}><IconRefresh size={16} />Refresh</Button>
    </div>
    {loading && <p role="status">Loading commercial position…</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" onClick={() => setRefresh(value => value + 1)}>Retry</Button></AlertDescription></Alert>}
    {position && <>
      <div className="space-y-1 text-sm text-muted-foreground"><p>{position.data.length} Supplier/model positions · {position.data.reduce((sum, row) => sum + BigInt(row.unresolved_attempts), 0n).toString()} unresolved requests</p><p className="break-words">UTC dispatch interval: {position.from} to {position.until} (end excluded).</p></div>
      <p className="text-sm text-muted-foreground">Blank amounts are unavailable, not zero. Customer charges are confirmed usage charges, not cash receipts. Margin compares customer charges with Supplier payable; upstream cost is separate. Cost coverage counts known costs among matched charge/payable requests.</p>
      {position.data.length === 0 ? <p>No commercial model configurations or activity in this currency and period.</p> : <Table aria-label="Supplier commercial positions">
        <TableHeader><TableRow>{['Supplier / model', 'Current agreed quotes', 'Customer charges', 'Supplier payable', 'Settled', 'Outstanding', 'Known cost', 'Margin', 'Unresolved', 'Cost coverage'].map((label, index) => <TableHead key={label} className={index > 1 ? 'text-right whitespace-nowrap' : 'whitespace-nowrap'}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{position.data.map(row => <TableRow key={row.supplier_id + ':' + row.model_alias + ':' + row.currency}>
          <TableCell className="align-top whitespace-normal min-w-44 max-w-64"><Link className="font-medium hover:underline" to={'/admin/suppliers/' + encodeURIComponent(row.supplier_id)}>{row.supplier_name}</Link><p className="text-muted-foreground break-all">{row.model_alias}</p></TableCell>
          <TableCell className="align-top whitespace-normal min-w-44">{row.offers.length === 0 ? <><p>No quote in {row.currency}</p><Link className="text-sm underline" to={'/admin/suppliers/' + encodeURIComponent(row.supplier_id) + '/models'}>Configure offers</Link></> : row.offers.map(offer => <div key={offer.offer_id + ':' + offer.route_alias + ':' + offer.state} className="mb-2 space-y-1 last:mb-0">
            <Badge variant="outline">{offer.state === 'qualified' ? 'Qualified offer' : offer.state === 'paused' ? 'Paused' : 'Review required'}</Badge>
            {offer.rate_kind === 'text' ? <p><span className="block">Input {offer.prompt_rate == null ? 'unavailable' : money(offer.prompt_rate, row.currency)}</span><span className="block">Output {offer.completion_rate == null ? 'unavailable' : money(offer.completion_rate, row.currency)}</span><span className="text-muted-foreground">per 1M tokens</span></p> : offer.media_rates.length === 0 ? <p>No current media rate</p> : offer.media_rates.map(rate => <p key={rate.revision}>{rate.tariff.dimensions.resolution} · {rate.tariff.meter} · {rate.tariff.currency} {formatUnits(rate.tariff.amount_units, rate.tariff.decimal_places)} per {rate.tariff.per_quantity.numerator}/{rate.tariff.per_quantity.denominator}</p>)}
            <Link className="text-sm underline" to={'/admin/suppliers/' + encodeURIComponent(row.supplier_id) + '/models'}>Review offers</Link>
          </div>)}</TableCell>
          {[row.customer_charge_nanos, row.earning_nanos, row.settled_earning_nanos, row.unsettled_earning_nanos, row.cost_nanos, row.margin_nanos].map((value, index) => <TableCell key={index} className="text-right align-top whitespace-nowrap tabular-nums" aria-label={value === null ? 'Unavailable' : undefined}>{value === null ? null : money(value, row.currency)}</TableCell>)}
          <TableCell className="text-right align-top tabular-nums">{row.unresolved_attempts}</TableCell>
          <TableCell className="text-right align-top whitespace-nowrap tabular-nums">{row.cost_known_attempts} / {row.matched_attempts}</TableCell>
        </TableRow>)}</TableBody>
      </Table>}
    </>}
  </section>;
}
function formatUnits(units: string, places: number) {
  const amount = BigInt(units); const scale = 10n ** BigInt(places);
  const fraction = (amount % scale).toString().padStart(places, '0').replace(/0+$/, '');
  return `${amount / scale}${fraction ? '.' + fraction : ''}`;
}
