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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { CommercialPosition, CustomerFinancialSummary } from '../../../../../sdks/javascript/src/admin';

/** Procurement remains in Admin, behind the central platform permission boundary. */
export default function CommercialPositionPage() {
  const { token } = useDashboardContext();
  return <Position key={token} token={token} />;
}

function Position({ token }: { token: string }) {
  const [search, setSearch] = useSearchParams();
  const currency = search.get('currency') ?? 'USD';
  const period = search.get('days') ?? '30';
  const view = search.get('view') === 'financial' ? 'financial' : 'suppliers';
  const valid = /^[A-Z]{3}$/.test(currency) && ['7', '30', '90'].includes(period);
  const [input, setInput] = useState(currency);
  const [position, setPosition] = useState<CommercialPosition | null>(null);
  const [summary, setSummary] = useState<CustomerFinancialSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { setInput(currency); }, [currency]);
  useEffect(() => {
    const controller = new AbortController();
    setPosition(null); setSummary(null); setError(''); setLoading(true);
    if (!valid) { setError('Choose a configured uppercase currency and a 7, 30 or 90 day period.'); setLoading(false); return; }
    const query = new URLSearchParams({ currency, days: period });
    const pending = view === 'financial'
      ? request<CustomerFinancialSummary>(token, '/api/v1/financial-summary?' + query, 'GET', undefined, controller.signal)
        .then(value => { if (!controller.signal.aborted) setSummary(value); })
      : request<CommercialPosition>(token, '/api/v1/commercial-position?' + query, 'GET', undefined, controller.signal)
        .then(value => { if (!controller.signal.aborted) setPosition(value); });
    void pending
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Commercial report could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, currency, period, valid, refresh, view]);
  function update(name: string, value: string) {
    setSearch(current => { const next = new URLSearchParams(current); next.set(name, value); return next; });
  }
  return <section className="min-w-0 space-y-5" aria-label="Commercial overview">
    <p className="text-sm text-muted-foreground">Review Provider positions, customer revenue, receipts and credit by currency. Personal model calls are excluded from consumption.</p>
    <Tabs value={view} onValueChange={value => update('view', value)} className="min-w-0 space-y-5">
      <TabsList variant="line" aria-label="Commercial reports">
        <TabsTrigger value="suppliers">Provider positions</TabsTrigger>
        <TabsTrigger value="financial">Financial summary</TabsTrigger>
      </TabsList>
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
      {loading && <p role="status">Loading commercial report…</p>}
      {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" onClick={() => setRefresh(value => value + 1)}>Retry</Button></AlertDescription></Alert>}
      <TabsContent value="suppliers" className="min-w-0 space-y-5">{position && <>
        <div className="space-y-1 text-sm text-muted-foreground"><p>{position.data.length} Provider/model positions · {position.data.reduce((sum, row) => sum + BigInt(row.unresolved_attempts), 0n).toString()} unresolved requests</p><p className="break-words">UTC dispatch interval: {formatInstant(position.from)} to {formatInstant(position.until)} (end excluded).</p></div>
        <p className="text-sm text-muted-foreground">Blank amounts are unavailable, not zero. Nominal charges are usage charges, not cash receipts. Refunds and consumed gifts reduce net revenue. Customer cash applied includes verified wallet cash and repayments, less cash balance restorations; unpaid credit excludes repaid or forgiven amounts. These follow the dispatch cohort, not the receipt posting period. Net contribution subtracts Provider payable once; recorded upstream cost is a separate partial subtotal.</p>
        {position.data.length === 0 ? <p>No commercial model configurations or activity in this currency and period.</p> : <Table aria-label="Provider commercial positions">
          <TableHeader><TableRow>{['Provider / model', 'Current agreed quotes', 'Nominal charges', 'Balance refunds', 'Gift allowance', 'Net revenue', 'Customer cash applied', 'Customer unpaid credit', 'Provider payable', 'Settled', 'Outstanding', 'Recorded upstream cost', 'Net contribution', 'Unresolved requests', 'Uncovered revenue requests', 'Uncovered cash requests', 'Recorded cost requests'].map((label, index) => <TableHead key={label} className={index > 1 ? 'text-right whitespace-nowrap' : 'whitespace-nowrap'}>{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{position.data.map(row => <TableRow key={row.supplier_id + ':' + row.model_alias + ':' + row.currency}>
            <TableCell className="align-top whitespace-normal min-w-44 max-w-64"><Link className="font-medium hover:underline" to={'/admin/suppliers/' + encodeURIComponent(row.supplier_id)}>{row.supplier_name}</Link><p className="text-muted-foreground break-all">{row.model_alias}</p></TableCell>
            <TableCell className="align-top whitespace-normal min-w-44">{row.offers.length === 0 ? <><p>No quote in {row.currency}</p><Link className="text-sm underline" to={'/admin/suppliers/' + encodeURIComponent(row.supplier_id) + '/models'}>Configure offers</Link></> : row.offers.map(offer => <div key={offer.offer_id + ':' + offer.route_alias + ':' + offer.state} className="mb-2 space-y-1 last:mb-0">
              <Badge variant="outline">{offer.state === 'qualified' ? 'Qualified offer' : offer.state === 'paused' ? 'Paused' : 'Review required'}</Badge>
              {offer.rate_kind === 'text' ? <p><span className="block">Input {offer.prompt_rate == null ? 'unavailable' : money(offer.prompt_rate, row.currency)}</span><span className="block">Output {offer.completion_rate == null ? 'unavailable' : money(offer.completion_rate, row.currency)}</span><span className="text-muted-foreground">per 1M tokens</span></p> : offer.media_rates.length === 0 ? <p>No current media rate</p> : offer.media_rates.map(rate => <p key={rate.revision}>{rate.tariff.dimensions.resolution} · {rate.tariff.meter} · {rate.tariff.currency} {formatUnits(rate.tariff.amount_units, rate.tariff.decimal_places)} per {rate.tariff.per_quantity.numerator}/{rate.tariff.per_quantity.denominator}</p>)}
              <Link className="text-sm underline" to={'/admin/suppliers/' + encodeURIComponent(row.supplier_id) + '/models'}>Review offers</Link>
            </div>)}</TableCell>
            {[row.customer_charge_nanos, row.customer_refunds_nanos, row.consumed_gift_allowance_nanos, row.net_customer_revenue_nanos, row.customer_cash_applied_nanos, row.customer_outstanding_credit_nanos, row.earning_nanos, row.settled_earning_nanos, row.unsettled_earning_nanos, row.known_upstream_cost_subtotal_nanos, row.net_contribution_nanos].map((value, index) => <TableCell key={index} className="text-right align-top whitespace-nowrap tabular-nums" aria-label={value === null ? 'Unavailable' : undefined}>{value === null ? null : money(value, row.currency)}</TableCell>)}
            <TableCell className="text-right align-top tabular-nums">{row.unresolved_attempts}</TableCell>
            <TableCell className="text-right align-top whitespace-nowrap tabular-nums">{row.revenue_uncovered_attempts}</TableCell>
            <TableCell className="text-right align-top whitespace-nowrap tabular-nums">{row.cash_source_uncovered_attempts}</TableCell>
            <TableCell className="text-right align-top whitespace-nowrap tabular-nums">{row.upstream_cost_recorded_attempts}</TableCell>
          </TableRow>)}</TableBody>
        </Table>}
      </>}</TabsContent>
      <TabsContent value="financial" className="min-w-0 space-y-5">{summary && <FinancialSummary summary={summary} />}</TabsContent>
    </Tabs>
  </section>;
}
/** Posting and current wallet scopes remain distinct; no synthesized financial totals. */
function FinancialSummary({ summary }: { summary: CustomerFinancialSummary }) {
  const credit = summary.balance_credit_sources;
  const rows: { label: string; amount: string | null }[] = [
    { label: 'Nominal consumption', amount: summary.nominal_consumption_nanos },
    { label: 'Customer balance refunds', amount: summary.customer_refunds_nanos },
    { label: 'Consumed gift sales allowance', amount: summary.consumed_gift_allowance_nanos },
    { label: 'Net customer revenue', amount: summary.recognized_revenue_nanos },
    ...(summary.recognized_revenue_nanos === null ? [
      { label: 'Known revenue subtotal', amount: summary.known_revenue_subtotal_nanos },
      { label: 'Known gift allowance subtotal', amount: summary.known_gift_allowance_subtotal_nanos },
    ] : []),
    { label: 'Verified cash receipt records', amount: summary.verified_cash_receipts_nanos },
    { label: 'Wallet cash receipt records', amount: summary.balance_funding_receipts_nanos },
    { label: 'External invoice receipt records', amount: summary.external_invoice_receipts_nanos },
    { label: 'Recorded funding reversals', amount: summary.recorded_funding_reversals_nanos },
    { label: 'Issued noncash gifts', amount: summary.issued_gifts_nanos },
  ];
  return <>
    <p className="break-words text-sm text-muted-foreground">UTC posting interval: {formatInstant(summary.from)} to {formatInstant(summary.until)} (end excluded). Blank amounts are unavailable, not zero.</p>
    {BigInt(summary.uncovered_entries) > 0n && <Alert><AlertDescription>{summary.uncovered_entries} {summary.uncovered_entries === '1' ? 'consumption or refund entry has' : 'consumption or refund entries have'} unknown sources. Full revenue and gift allowance are unavailable; known subtotals are partial.</AlertDescription></Alert>}
    {BigInt(summary.cash_receipt_reference_conflicts) > 0n && <Alert><AlertDescription>{summary.cash_receipt_reference_conflicts} {summary.cash_receipt_reference_conflicts === '1' ? 'receipt reference overlaps' : 'receipt references overlap'}. The combined receipt amount is unavailable.</AlertDescription></Alert>}
    <p className="text-sm text-muted-foreground">Gifts reduce revenue when consumed or applied to credit. Cash receipts and repayments are separate from revenue. Balance refunds and recorded funding reversals do not establish external cash transfers.</p>
    <Table aria-label="Customer financial posting summary">
      <TableHeader><TableRow><TableHead>Posting measure</TableHead><TableHead className="text-right">Amount in {summary.currency}</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map(row => <TableRow key={row.label}><TableCell className="whitespace-normal">{row.label}</TableCell><TableCell className="text-right align-top whitespace-nowrap tabular-nums" aria-label={row.amount === null ? 'Unavailable' : undefined}>{row.amount === null ? null : money(row.amount, summary.currency)}</TableCell></TableRow>)}</TableBody>
    </Table>
    <div className="space-y-2"><h2 className="text-base font-medium">Current wallet sources</h2><p className="break-words text-sm text-muted-foreground">Snapshot at {formatInstant(credit.as_of)} UTC; independent of the posting interval. Approved credit limits are not funding. External invoice receivables are excluded.</p></div>
    {BigInt(credit.uncovered_accounts) > 0n && <Alert><AlertDescription>{credit.uncovered_accounts} {credit.uncovered_accounts === '1' ? 'account has' : 'accounts have'} incomplete funding sources. Full cash and credit totals are unavailable; known subtotals include only fully covered accounts.</AlertDescription></Alert>}
    <Table aria-label="Current wallet cash and credit">
      <TableHeader><TableRow><TableHead>Wallet source</TableHead><TableHead className="text-right">Amount in {summary.currency}</TableHead></TableRow></TableHeader>
      <TableBody>{[
        { label: 'Unused verified prepaid cash', amount: credit.prepaid_cash_nanos },
        { label: 'Outstanding credit consumption', amount: credit.outstanding_credit_nanos },
        ...(BigInt(credit.uncovered_accounts) > 0n ? [
          { label: 'Known prepaid cash subtotal', amount: credit.known_prepaid_cash_subtotal_nanos },
          { label: 'Known outstanding credit subtotal', amount: credit.known_outstanding_credit_subtotal_nanos },
        ] : []),
      ].map(row => <TableRow key={row.label}><TableCell className="whitespace-normal">{row.label}</TableCell><TableCell className="text-right whitespace-nowrap tabular-nums" aria-label={row.amount === null ? 'Unavailable' : undefined}>{row.amount === null ? null : money(row.amount, summary.currency)}</TableCell></TableRow>)}</TableBody>
    </Table>
  </>;
}
function formatUnits(units: string, places: number) {
  const amount = BigInt(units); const scale = 10n ** BigInt(places);
  const fraction = (amount % scale).toString().padStart(places, '0').replace(/0+$/, '');
  return `${amount / scale}${fraction ? '.' + fraction : ''}`;
}

function formatInstant(value: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(value));
}
