import { useEffect, useRef, useState } from 'react';
import type { CustomerInvoiceLine, CustomerInvoiceMediaLine } from '../../../../../sdks/javascript/src/admin';
import { useSearchParams } from 'react-router';
import { IconReceipt, IconCurrencyDollar } from '@tabler/icons-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { IconRefresh as RefreshCw } from '@tabler/icons-react';
import { useDashboardContext } from '@/app/dashboard-context';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { money } from '@/lib/money';
import { request } from '@/features/vendors/api';
import WorkspaceSpendingLimits from './WorkspaceSpendingLimits';

type Tariff = { model_alias: string; revision: string; currency: string; prompt_rate: string; cached_prompt_rate?: string | null; completion_rate: string; request_fee_nanos?: string; minimum_charge_nanos?: string };
type Invoice = { id: string; from_ms: number; to_ms: number; currency: string; amount_nanos: string; status: string };
type InvoicePage = { data: Invoice[]; next_cursor: string | null };
function checkedInvoices(page: InvoicePage) {
  if (!Array.isArray(page.data) || (page.next_cursor !== null && (typeof page.next_cursor !== 'string' || !page.next_cursor))) throw new Error('Invalid statement history');
  for (const row of page.data) {
    if (!row || typeof row.id !== 'string' || !row.id || !Number.isSafeInteger(row.from_ms) || !Number.isSafeInteger(row.to_ms) || row.from_ms < 0 || row.to_ms <= row.from_ms || row.to_ms > 253402300799999
      || !/^[A-Z]{3}$/.test(row.currency) || typeof row.amount_nanos !== 'string' || !/^[0-9]{1,19}$/.test(row.amount_nanos) || BigInt(row.amount_nanos) > 9_223_372_036_854_775_807n || !['issued', 'paid'].includes(row.status)) throw new Error('Invalid statement history');
  }
  return page;
}
type Billing = {
  balances: { currency: string; charged_nanos: string }[];
  unresolved: string; unpriced: string; tariffs: Tariff[]; invoices: Invoice[];
};
type Line = CustomerInvoiceLine;
type InvoiceDetails = { data: Line[]; media_lines?: CustomerInvoiceMediaLine[]; media_next_cursor?: string | null };
const quantity = (value: { numerator: string; denominator: string }) => value.denominator === '1' ? value.numerator : `${value.numerator}/${value.denominator}`;
const mediaMeter = (value: string, count: { numerator: string; denominator: string }) => {
  const single = count.numerator === '1' && count.denominator === '1';
  return value === 'seconds' ? single ? 'second' : 'seconds' : value === 'video_tokens' ? single ? 'video token' : 'video tokens' : single ? 'billing unit' : 'billing units';
};
const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function BillingRoute() {
  const { token, workspace, session } = useDashboardContext();
  if (!token || !workspace) return <><PageHeader title="Usage statements" /><p>Select a workspace to review billing.</p></>;
  return <BillingView key={`${token}:${workspace.id}`} token={token} organization={workspace.organization_id} project={workspace.id} canConfigure={session?.kind === 'installation' || session?.operator?.role === 'owner'} />;
}

function BillingView({ token, organization, project, canConfigure }: { token: string; organization: string; project: string; canConfigure: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab = requestedTab === 'statements' || requestedTab === 'rates' ? requestedTab : 'balance';
  function selectTab(value: string) {
    const query = new URLSearchParams(searchParams);
    if (value === 'balance') query.delete('tab'); else query.set('tab', value);
    setSearchParams(query);
  }
  const base = `/admin/v1/organizations/${organization}/projects/${project}/billing`;
  const [data, setData] = useState<Billing | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [detailError, setDetailError] = useState('');
  const [mediaLines, setMediaLines] = useState<CustomerInvoiceMediaLine[]>([]);
  const [mediaNext, setMediaNext] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const mediaRequest = useRef<AbortController | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [invoiceNext, setInvoiceNext] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [invoiceFailure, setInvoiceFailure] = useState<'latest' | 'older' | null>(null);
  const [invoiceRevision, setInvoiceRevision] = useState(0);
  const invoiceRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (activeTab !== 'statements') { setInvoiceLoading(false); return; }
    const controller = new AbortController();
    invoiceRequest.current = controller;
    setInvoiceLoading(true); setInvoiceError(''); setInvoiceFailure(null);
    void request<InvoicePage>(token, `${base}/invoices?limit=50`, 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) { const page = checkedInvoices(result); setInvoices(page.data); setInvoiceNext(page.next_cursor); } })
      .catch(() => { if (!controller.signal.aborted) { setInvoiceError('Could not load statements.'); setInvoiceFailure('latest'); } })
      .finally(() => { if (invoiceRequest.current === controller) { invoiceRequest.current = null; if (!controller.signal.aborted) setInvoiceLoading(false); } });
    return () => { controller.abort(); invoiceRequest.current?.abort(); invoiceRequest.current = null; };
  }, [token, base, activeTab, revision, invoiceRevision]);

  async function loadOlderInvoices() {
    if (!invoiceNext || invoiceRequest.current) return;
    const cursor = invoiceNext;
    const controller = new AbortController(); invoiceRequest.current = controller;
    setInvoiceLoading(true); setInvoiceError(''); setInvoiceFailure(null);
    try {
      const result = await request<InvoicePage>(token, `${base}/invoices?limit=50&before=${encodeURIComponent(cursor)}`, 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      const page = checkedInvoices(result);
      if (page.next_cursor === cursor) throw new Error('Statement history did not advance');
      setInvoices(current => [...(current ?? []), ...page.data.filter(row => !current?.some(saved => saved.id === row.id))]);
      setInvoiceNext(page.next_cursor);
    } catch { if (!controller.signal.aborted) { setInvoiceError('Could not load older statements.'); setInvoiceFailure('older'); } }
    finally { if (invoiceRequest.current === controller) { invoiceRequest.current = null; if (!controller.signal.aborted) setInvoiceLoading(false); } }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const workspaceRead = request<{data: Billing}>(token, base, 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result.data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    void workspaceRead.finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, base, organization, revision]);

  useEffect(() => {
    setLines(null); setDetailError('');
    setMediaLines([]); setMediaNext(null); setMediaLoading(false); setMediaError('');
    if (!selected) return;
    const controller = new AbortController();
    void request<InvoiceDetails>(token, `${base}/invoices/${selected.id}`, 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setLines(result.data); setMediaLines(result.media_lines ?? []); setMediaNext(result.media_next_cursor ?? null); } })
      .catch(reason => { if (!controller.signal.aborted) setDetailError(reason.message); });
    return () => { controller.abort(); mediaRequest.current?.abort(); mediaRequest.current = null; };
  }, [token, base, selected]);

  async function loadMoreMedia() {
    if (!selected || !mediaNext || mediaRequest.current) return;
    const controller = new AbortController();
    mediaRequest.current = controller;
    const cursor = mediaNext;
    setMediaLoading(true); setMediaError('');
    try {
      const result = await request<InvoiceDetails>(token, `${base}/invoices/${selected.id}?media_after=${encodeURIComponent(cursor)}`, 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (result.media_next_cursor === cursor) throw new Error('Media charges could not advance to the next page. Retry later.');
      setMediaLines(current => [...current, ...(result.media_lines ?? [])]);
      setMediaNext(result.media_next_cursor ?? null);
    } catch (reason) {
      if (!controller.signal.aborted) setMediaError(reason instanceof Error && !(reason instanceof TypeError) ? reason.message : 'More media charges could not be loaded. Check your connection and retry.');
    } finally {
      if (mediaRequest.current === controller) { mediaRequest.current = null; if (!controller.signal.aborted) setMediaLoading(false); }
    }
  }

  return <>
    <PageHeader title="Usage statements" action={<Button variant="outline" aria-label="Refresh billing" disabled={loading || invoiceLoading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} /></Button>} />
    {error && <Alert variant="destructive"><AlertTitle>Billing unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={() => setRevision(value => value + 1)}>Retry</Button></AlertDescription></Alert>}
    {loading && !data ? <p role="status">Loading billing…</p> : data && <Tabs value={activeTab} onValueChange={selectTab} className="billing-content">
      <TabsList aria-label="Billing sections"><TabsTrigger value="balance">Spending</TabsTrigger><TabsTrigger value="statements">Statements</TabsTrigger><TabsTrigger value="rates">Rates</TabsTrigger></TabsList>
      <TabsContent value="balance" className="billing-balance-content">
        <section aria-label="Workspace spending">
          <h2>Workspace spending</h2>
          <p className="text-muted-foreground">All-time customer charges for this workspace.</p>
          {data.balances.length ? data.balances.map(balance => <p className="billing-spending" key={balance.currency}>{money(balance.charged_nanos, balance.currency)}</p>) : <p>No charges yet.</p>}
          {(data.unresolved !== '0' || data.unpriced !== '0') && <p className="text-muted-foreground">{[data.unresolved !== '0' && `${data.unresolved} ${data.unresolved === '1' ? 'request' : 'requests'} awaiting settlement`, data.unpriced !== '0' && `${data.unpriced} ${data.unpriced === '1' ? 'request' : 'requests'} without a customer rate`].filter(Boolean).join(' · ')}.</p>}
        </section>
        <WorkspaceSpendingLimits token={token} organization={organization} project={project} canConfigure={canConfigure} refresh={revision} />
      </TabsContent>
      <TabsContent value="statements">
        <section className="panel">
          <div className="provider-panel-heading"><h2>Usage statements</h2></div>
          {invoiceLoading && <p role="status">Loading statements…</p>}
          {invoiceError && <Alert variant="destructive"><AlertDescription>{invoiceError}<Button variant="outline" disabled={invoiceLoading} onClick={() => invoiceFailure === 'older' ? void loadOlderInvoices() : setInvoiceRevision(value => value + 1)}>{invoiceFailure === 'older' ? 'Retry older statements' : 'Retry statements'}</Button></AlertDescription></Alert>}
          {invoices?.length ? <div className="table-wrap"><Table className="provider-ledger billing-invoices">
            <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>{invoices.map(invoice => <TableRow key={invoice.id}>
              <TableCell>{day(invoice.from_ms)} – {day(invoice.to_ms - 1)}<span className="billing-mobile-status">{invoice.status === 'paid' ? 'Settled' : 'Issued'}</span></TableCell>
              <TableCell>{money(invoice.amount_nanos, invoice.currency)}</TableCell><TableCell>{invoice.status === 'paid' ? 'Settled' : 'Issued'}</TableCell>
              <TableCell><Button size="sm" variant="ghost" onClick={() => setSelected(invoice)}>View details</Button></TableCell>
            </TableRow>)}</TableBody>
          </Table></div> : invoices && !invoiceLoading && !invoiceError ? <Empty className="billing-empty"><EmptyHeader><EmptyMedia variant="icon"><IconReceipt aria-hidden="true"/></EmptyMedia><EmptyTitle>No statements yet</EmptyTitle><EmptyDescription>Issued usage statements appear here.</EmptyDescription></EmptyHeader></Empty> : null}
          {invoiceNext && !invoiceError && <Button variant="outline" disabled={invoiceLoading} onClick={() => void loadOlderInvoices()}>Older statements</Button>}
        </section>
      </TabsContent>
      <TabsContent value="rates">
        <section className="panel billing-rates">
          <div className="provider-panel-heading"><h2>Model rates</h2>{data.tariffs.length > 0 && <p className="provider-intro billing-description">Token rates per million · fees per request</p>}</div>
          {data.tariffs.length ? <div className="table-wrap"><Table className="provider-ledger"><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Input</TableHead><TableHead>Cache read</TableHead><TableHead>Output</TableHead><TableHead>Fixed fee / request</TableHead><TableHead>Minimum / request</TableHead></TableRow></TableHeader>
            <TableBody>{data.tariffs.map(tariff => <TableRow key={tariff.model_alias}><TableCell>{tariff.model_alias}</TableCell><TableCell>{money(tariff.prompt_rate, tariff.currency)}</TableCell><TableCell>{tariff.cached_prompt_rate != null ? money(tariff.cached_prompt_rate, tariff.currency) : "Input rate"}</TableCell><TableCell>{money(tariff.completion_rate, tariff.currency)}</TableCell><TableCell>{tariff.request_fee_nanos != null ? money(tariff.request_fee_nanos, tariff.currency) : "Unknown"}</TableCell><TableCell>{tariff.minimum_charge_nanos != null ? money(tariff.minimum_charge_nanos, tariff.currency) : "Unknown"}</TableCell></TableRow>)}</TableBody>
          </Table></div> : <Empty className="billing-empty"><EmptyHeader><EmptyMedia variant="icon"><IconCurrencyDollar aria-hidden="true"/></EmptyMedia><EmptyTitle>No rates published</EmptyTitle><EmptyDescription>Published customer prices appear here.</EmptyDescription></EmptyHeader></Empty>}
        </section>
      </TabsContent>
    </Tabs>}
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent className="niu-modal billing-detail-dialog">
        <DialogHeader className="text-left"><DialogTitle>Statement details</DialogTitle><DialogDescription>{selected ? `Billing period: ${day(selected.from_ms)} – ${day(selected.to_ms - 1)}` : 'Workspace usage'}</DialogDescription></DialogHeader>
        {selected && <p>{money(selected.amount_nanos, selected.currency)} · {selected.status === 'paid' ? 'Settled' : 'Issued'}</p>}
        {detailError ? <Alert variant="destructive"><AlertTitle>Details unavailable</AlertTitle><AlertDescription>{detailError}<Button variant="outline" onClick={() => setSelected(value => value && {...value})}>Retry details</Button></AlertDescription></Alert> : lines ? <>
          {lines.length > 0 && <div className="table-wrap"><Table className="provider-ledger" aria-label="Text charges"><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Amount</TableHead><TableHead>Requests</TableHead><TableHead>Input / output tokens</TableHead><TableHead>Rates</TableHead></TableRow></TableHeader>
            <TableBody>{lines.map(line => <TableRow key={line.revision}><TableCell>{line.model_alias}</TableCell><TableCell>{money(line.amount_nanos, line.currency)}</TableCell><TableCell>{line.requests}</TableCell><TableCell>{line.prompt_tokens} / {line.completion_tokens}{line.cached_prompt_rate != null && <small>Cached input: {line.cached_prompt_tokens ?? "Unknown"}</small>}</TableCell><TableCell>{money(line.prompt_rate, line.currency)} / {money(line.completion_rate, line.currency)} per 1M{line.cached_prompt_rate != null && <small>Cache read: {money(line.cached_prompt_rate, line.currency)} per 1M</small>}<small>Fixed fee / request: {line.request_fee_nanos != null ? money(line.request_fee_nanos, line.currency) : "Unknown"}</small><small>Minimum / request: {line.minimum_charge_nanos != null ? money(line.minimum_charge_nanos, line.currency) : "Unknown"}</small></TableCell></TableRow>)}</TableBody>
          </Table></div>}
          {mediaLines.length > 0 && <section aria-label="Media charges" className="min-w-0 space-y-3">
            <h3 className="text-sm font-medium">Media usage</h3>
            <div className="table-wrap"><Table className="provider-ledger"><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Amount</TableHead><TableHead>Measured usage</TableHead><TableHead>Billable usage</TableHead></TableRow></TableHeader>
              <TableBody>{mediaLines.map((line, index) => <TableRow key={index}>
                <TableCell>{line.model_alias}</TableCell>
                <TableCell>{money(line.amount_nanos, line.currency)}</TableCell>
                <TableCell>{quantity(line.measured_quantity)} {mediaMeter(line.meter, line.measured_quantity)}</TableCell>
                <TableCell>{quantity(line.billable_quantity)} {mediaMeter(line.meter, line.billable_quantity)}</TableCell>
              </TableRow>)}</TableBody>
            </Table></div>
          </section>}
          {mediaError && <Alert variant="destructive"><AlertTitle>More media charges unavailable</AlertTitle><AlertDescription>{mediaError}<Button variant="outline" disabled={mediaLoading} onClick={() => void loadMoreMedia()}>{mediaLoading ? 'Loading more…' : 'Retry media charges'}</Button></AlertDescription></Alert>}
          {mediaNext && !mediaError && <Button variant="outline" disabled={mediaLoading} onClick={() => void loadMoreMedia()}>{mediaLoading ? 'Loading more…' : 'Show more media charges'}</Button>}
          {lines.length === 0 && mediaLines.length === 0 && !mediaNext && <p className="text-sm text-muted-foreground">No line items available.</p>}
        </> : <p role="status">Loading line items…</p>}

      </DialogContent>
    </Dialog>
  </>;
}
