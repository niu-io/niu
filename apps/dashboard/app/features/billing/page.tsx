import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Link, useLocation, type LoaderFunctionArgs } from 'react-router';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import { settingsHref } from '@/features/account/settings-shell';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { CustomerTariff, CustomerInvoiceLine, CustomerInvoiceMediaLine } from '@niu-io/sdk/admin';
import { useSearchParams } from 'react-router';
import { IconReceipt, IconCurrencyDollar } from '@tabler/icons-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { IconRefresh as RefreshCw } from '@tabler/icons-react';
import { useDashboardContext } from '@/shell/dashboard-context';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatExactUnitAtoms, formatUnitAtoms, money } from '@/lib/money';
import { cachedGet, markCachedStale, peekCachedGet, request } from '@/features/providers/api';
import { TableSkeleton, WorkspaceShellSkeleton } from '@/components/PageSkeletons';
import WorkspaceSpendingLimits from './WorkspaceSpendingLimits';

type Tariff = CustomerTariff;
// An absent category rate is neither a zero price nor an inherited tier rate.
const categoryRate = (rate: string | null | undefined, currency: string) => rate === undefined ? 'Unknown' : rate === null ? 'Not configured' : money(rate, currency);
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
type WorkspaceUnitBalance = {
  definition_revision: string;
  name: string;
  display_precision: number;
  atoms_per_unit: string;
  held_atoms: string;
  charged_atoms: string;
  restored_atoms: string;
  net_charged_atoms: string;
  charged_requests: number;
};
type UnitTextTariff = {
  model_alias: string;
  revision: string;
  definition_revision: string;
  unit_name: string;
  display_precision: number;
  atoms_per_unit: string;
  price: {
    prompt_rate: string;
    completion_rate: string;
    cached_prompt_rate?: string | null;
    cache_write_prompt_rate?: string | null;
    reasoning_completion_rate?: string | null;
    request_fee_atoms?: string | null;
    minimum_charge_atoms?: string | null;
    context_tiers?: Array<{
      minimum_input_tokens: string;
      prompt_rate: string;
      completion_rate: string;
      cached_prompt_rate?: string | null;
      cache_write_prompt_rate?: string | null;
      reasoning_completion_rate?: string | null;
    }>;
  };
  created_at: string;
};
type UnitMediaTariff = {
  model_alias: string;
  channel: string;
  resolution: string;
  reference_video: boolean;
  meter: string;
  revision: string;
  definition_revision: string;
  unit_name: string;
  display_precision: number;
  atoms_per_unit: string;
  price: {
    amount_atoms: string;
    per_quantity: { numerator: string; denominator: string };
    minimum_quantity: { numerator: string; denominator: string };
    rounding?: 'Down' | 'Up' | 'HalfEven';
  };
  created_at: string;
};
type WorkspaceUnitCharge = {
  reference: string;
  model_alias: string;
  request_kind: 'inference' | 'video';
  definition_revision: string;
  unit_name: string;
  display_precision: number;
  atoms_per_unit: string;
  charged_atoms: string;
  restored_atoms: string;
  net_atoms: string;
  charged_at: string;
};
type Billing = {
  billing_mode?: 'currency' | 'credits';
  balances: { currency: string; charged_nanos: string }[];
  unit_balances?: WorkspaceUnitBalance[];
  unresolved: string; unpriced: string;
  tariffs: Tariff[];
  unit_tariffs?: UnitTextTariff[];
  unit_media_tariffs?: UnitMediaTariff[];
  unit_charges?: WorkspaceUnitCharge[];
  invoices: Invoice[];
};
type Line = CustomerInvoiceLine;
type InvoiceDetails = { data: Line[]; media_lines?: CustomerInvoiceMediaLine[]; media_next_cursor?: string | null };
const quantity = (value: { numerator: string; denominator: string }) => value.denominator === '1' ? value.numerator : `${value.numerator}/${value.denominator}`;
const mediaMeter = (value: string, count: { numerator: string; denominator: string }) => {
  const single = count.numerator === '1' && count.denominator === '1';
  return value === 'seconds' ? single ? 'second' : 'seconds' : value === 'video_tokens' ? single ? 'video token' : 'video tokens' : single ? 'billing unit' : 'billing units';
};
const day = (ms: number) => new Date(ms).toLocaleDateString(readUILocale(), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function loader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ workspace }) => ({
    endpoint: workspace
      ? `/api/v1/organizations/${workspace.organization_id}/projects/${workspace.id}/billing`
      : null,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function BillingRoute() {
  const { t: uiT } = useUILocale();
  useOptionalRouteLoaderData();
  const { token, workspace, session } = useDashboardContext();
  const location = useLocation();
  const canFund = session?.kind === 'installation' || (session?.operator?.project_id === null && ['owner','admin'].includes(session.operator.role));
  if (!token || !workspace) return <><PageHeader title={uiT("Usage statements")} /><p>{uiT("Select a workspace to review billing.")}</p></>;
  return <><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{uiT("Spending and limits apply to this workspace. Funds are shared across the account.")}</p>{canFund ? <Button asChild variant="outline"><Link to={settingsHref(location.pathname,location.search,location.hash,'billing')}>{uiT("Manage credits")}</Link></Button> : <p className="text-sm text-muted-foreground">{uiT("Contact your company owner to add credits.")}</p>}</div><BillingView key={`${token}:${workspace.id}`} token={token} organization={workspace.organization_id} project={workspace.id} canConfigure={session?.kind === 'installation' || session?.operator?.role === 'owner'} /></>;
}

function BillingView({ token, organization, project, canConfigure }: { token: string; organization: string; project: string; canConfigure: boolean }) {
  const { t: uiT, format: uiF } = useUILocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab = requestedTab === 'statements' || requestedTab === 'rates' ? requestedTab : 'balance';
  function selectTab(value: string) {
    const query = new URLSearchParams(searchParams);
    if (value === 'balance') query.delete('tab'); else query.set('tab', value);
    setSearchParams(query);
  }
  const base = `/api/v1/organizations/${organization}/projects/${project}/billing`;
  const invoicesPath = `${base}/invoices?limit=50`;
  const initialBilling = peekCachedGet<{ data: Billing }>(token, base)?.data ?? null;
  const initialInvoices = (() => {
    try {
      const cached = peekCachedGet<InvoicePage>(token, invoicesPath);
      return cached ? checkedInvoices(cached) : null;
    } catch {
      return null;
    }
  })();
  const [data, setData] = useState<Billing | null>(() => initialBilling);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(() => !initialBilling);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [detailError, setDetailError] = useState('');
  const [mediaLines, setMediaLines] = useState<CustomerInvoiceMediaLine[]>([]);
  const [mediaNext, setMediaNext] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const mediaRequest = useRef<AbortController | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(() => initialInvoices?.data ?? null);
  const [invoiceNext, setInvoiceNext] = useState<string | null>(() => initialInvoices?.next_cursor ?? null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [invoiceFailure, setInvoiceFailure] = useState<'latest' | 'older' | null>(null);
  const [invoiceRevision, setInvoiceRevision] = useState(0);
  const invoiceRequest = useRef<AbortController | null>(null);
  const lastBillingRevision = useRef(0);
  const lastInvoiceTrigger = useRef({ revision: 0, invoiceRevision: 0 });
  const lastSelectedId = useRef<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'statements') { setInvoiceLoading(false); return; }
    const controller = new AbortController();
    invoiceRequest.current = controller;
    const force = lastInvoiceTrigger.current.revision !== revision || lastInvoiceTrigger.current.invoiceRevision !== invoiceRevision;
    lastInvoiceTrigger.current = { revision, invoiceRevision };
    const hasCachedInvoices = !force && Boolean(peekCachedGet<InvoicePage>(token, invoicesPath));
    setInvoiceLoading(!hasCachedInvoices); setInvoiceError(''); setInvoiceFailure(null);
    void cachedGet<InvoicePage>(token, invoicesPath, { signal: controller.signal, force })
      .then(result => { if (!controller.signal.aborted) { const page = checkedInvoices(result); setInvoices(page.data); setInvoiceNext(page.next_cursor); } })
      .catch(() => { markCachedStale(token, invoicesPath); if (!controller.signal.aborted) { setInvoiceError('Could not load statements.'); setInvoiceFailure('latest'); } })
      .finally(() => { if (invoiceRequest.current === controller) { invoiceRequest.current = null; if (!controller.signal.aborted) setInvoiceLoading(false); } });
    return () => { controller.abort(); invoiceRequest.current?.abort(); invoiceRequest.current = null; };
  }, [token, invoicesPath, activeTab, revision, invoiceRevision]);

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
    const force = lastBillingRevision.current !== revision;
    lastBillingRevision.current = revision;
    const hasCachedBilling = !force && Boolean(peekCachedGet<{ data: Billing }>(token, base)?.data);
    setLoading(!hasCachedBilling); setError('');
    const workspaceRead = cachedGet<{data: Billing}>(token, base, { signal: controller.signal, force })
      .then(result => { if (!controller.signal.aborted) setData(result.data); })
      .catch(reason => { markCachedStale(token, base); if (!controller.signal.aborted) setError(reason.message); });
    void workspaceRead.finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, base, organization, revision]);

  useEffect(() => {
    setDetailError('');
    setMediaLoading(false); setMediaError('');
    if (!selected) {
      lastSelectedId.current = null;
      setLines(null); setMediaLines([]); setMediaNext(null);
      return;
    }
    const detailPath = `${base}/invoices/${selected.id}`;
    const isRetry = lastSelectedId.current === selected.id;
    lastSelectedId.current = selected.id;
    const cachedDetail = !isRetry ? peekCachedGet<InvoiceDetails>(token, detailPath) : undefined;
    if (cachedDetail && Array.isArray(cachedDetail.data)) {
      setLines(cachedDetail.data);
      setMediaLines(cachedDetail.media_lines ?? []);
      setMediaNext(cachedDetail.media_next_cursor ?? null);
    } else {
      setLines(null); setMediaLines([]); setMediaNext(null);
    }
    const controller = new AbortController();
    void cachedGet<InvoiceDetails>(token, detailPath, { signal: controller.signal, force: isRetry })
      .then(result => { if (!controller.signal.aborted) { setLines(result.data); setMediaLines(result.media_lines ?? []); setMediaNext(result.media_next_cursor ?? null); } })
      .catch(reason => { markCachedStale(token, detailPath); if (!controller.signal.aborted) setDetailError(reason.message); });
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
    <PageHeader title={uiT("Usage statements")} action={<Button variant="outline" aria-label={uiT("Refresh billing")} disabled={loading || invoiceLoading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} /></Button>} />
    {error && <Alert variant="destructive"><AlertTitle>{uiT("Billing unavailable")}</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={() => setRevision(value => value + 1)}>{uiT("Retry")}</Button></AlertDescription></Alert>}
    {loading && !data ? <WorkspaceShellSkeleton label={uiT("Loading billing…")} /> : data && <Tabs value={activeTab} onValueChange={selectTab} className="billing-content">
      <TabsList variant="line" aria-label={uiT("Billing sections")}><TabsTrigger value="balance">{uiT("Spending")}</TabsTrigger><TabsTrigger value="statements">{uiT("Statements")}</TabsTrigger><TabsTrigger value="rates">{uiT("Rates")}</TabsTrigger></TabsList>
      <TabsContent value="balance" className="billing-balance-content">
        <section aria-label={uiT("Workspace spending")}>
          <h2>{uiT("Workspace spending")}</h2>
          <p className="text-muted-foreground">{uiT("All-time customer charges for this workspace.")}</p>
          {(data.unit_balances?.length ?? 0) > 0 && (
            <div className="space-y-3 my-3" aria-label={uiT("Workspace Credits spending")}>
              {data.unit_balances!.map(ub => (
                <div key={ub.definition_revision} className="space-y-1">
                  <p className="billing-spending" title={uiF("{0} ({1} atoms)", [formatExactUnitAtoms(ub.net_charged_atoms, ub.name, ub.display_precision), ub.net_charged_atoms])}>
                    {formatUnitAtoms(ub.net_charged_atoms, ub.name, ub.display_precision)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {uiT("Exact net consumed:")}{" "}{formatExactUnitAtoms(ub.net_charged_atoms, ub.name, ub.display_precision)} ({ub.net_charged_atoms}{" "}{uiT("atoms) ·")}{" "}{ub.charged_requests}{" "}{uiT("settled")}{" "}{ub.charged_requests === 1 ? uiT("request") : uiT("requests")}
                    {BigInt(ub.restored_atoms || '0') > 0n && uiF(" · Restored: {0}", [formatExactUnitAtoms(ub.restored_atoms, ub.name, ub.display_precision)])}
                    {BigInt(ub.held_atoms || '0') > 0n && uiF(" · Held for active requests: {0}", [formatExactUnitAtoms(ub.held_atoms, ub.name, ub.display_precision)])}
                  </p>
                </div>
              ))}
            </div>
          )}
          {data.balances.length ? data.balances.map(balance => <p className="billing-spending" key={balance.currency}>{money(balance.charged_nanos, balance.currency)}</p>) : (data.unit_balances?.length ?? 0) === 0 ? <p className="billing-spending-empty">{uiT("No charges yet.")}</p> : null}
          {(data.unresolved !== '0' || data.unpriced !== '0') && <p className="text-muted-foreground">{[data.unresolved !== '0' && `${data.unresolved} ${data.unresolved === '1' ? 'request' : 'requests'} awaiting settlement`, data.unpriced !== '0' && `${data.unpriced} ${data.unpriced === '1' ? 'request' : 'requests'} without a customer rate`].filter(Boolean).join(' · ')}.</p>}
        </section>
        <WorkspaceSpendingLimits token={token} organization={organization} project={project} canConfigure={canConfigure} refresh={revision} />
      </TabsContent>
      <TabsContent value="statements">
        {(data.billing_mode === 'credits' || (data.unit_charges?.length ?? 0) > 0) && (
          <section className="panel mb-6" aria-label={uiT("Workspace Credits usage statements")}>
            <div className="provider-panel-heading"><h2>{uiT("Credits usage ledger")}</h2></div>
            {data.unit_charges?.length ? (
              <div className="px-6 pb-4">
                <Table aria-label={uiT("Credits usage charges")} className="[&_th]:px-2.5 [&_td]:px-2.5 [&_th]:tracking-normal">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{uiT("Time (UTC)")}</TableHead>
                      <TableHead>{uiT("Reference")}</TableHead>
                      <TableHead>{uiT("Model")}</TableHead>
                      <TableHead>{uiT("Kind")}</TableHead>
                      <TableHead className="text-right">{uiT("Gross charge")}</TableHead>
                      <TableHead className="text-right">{uiT("Restored")}</TableHead>
                      <TableHead className="text-right">{uiT("Net charge")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.unit_charges.map(charge => (
                      <TableRow key={charge.reference}>
                        <TableCell>{new Date(charge.charged_at).toLocaleString(readUILocale(), { timeZone: 'UTC' })}</TableCell>
                        <TableCell className="font-mono text-xs">{charge.reference}</TableCell>
                        <TableCell>{charge.model_alias}</TableCell>
                        <TableCell>{charge.request_kind === 'video' ? 'Video' : uiT("Inference")}</TableCell>
                        <TableCell className="text-right tabular-nums" title={uiF("{0} ({1} atoms)", [formatExactUnitAtoms(charge.charged_atoms, charge.unit_name, charge.display_precision), charge.charged_atoms])}>
                          {formatUnitAtoms(charge.charged_atoms, charge.unit_name, charge.display_precision)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {BigInt(charge.restored_atoms || '0') > 0n ? formatUnitAtoms(charge.restored_atoms, charge.unit_name, charge.display_precision) : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums" title={uiF("{0} ({1} atoms)", [formatExactUnitAtoms(charge.net_atoms, charge.unit_name, charge.display_precision), charge.net_atoms])}>
                          <div className="font-medium">{formatUnitAtoms(charge.net_atoms, charge.unit_name, charge.display_precision)}</div>
                          {formatExactUnitAtoms(charge.net_atoms, charge.unit_name, charge.display_precision) !== formatUnitAtoms(charge.net_atoms, charge.unit_name, charge.display_precision) && (
                            <div className="text-xs text-muted-foreground">{formatExactUnitAtoms(charge.net_atoms, charge.unit_name, charge.display_precision)}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Empty className="billing-empty"><EmptyHeader><EmptyMedia variant="icon"><IconReceipt aria-hidden="true"/></EmptyMedia><EmptyTitle>{uiT("No Credits charges yet")}</EmptyTitle><EmptyDescription>{uiT("Settled Credits usage for this workspace appears here.")}</EmptyDescription></EmptyHeader></Empty>
            )}
          </section>
        )}
        <section className="panel">
          <div className="provider-panel-heading"><h2>{uiT("Usage statements")}</h2></div>
          {invoiceLoading && !invoices && <TableSkeleton columns={4} rows={4} label={uiT("Loading statements…")} className="px-6 pb-4" />}
          {invoiceError && <Alert variant="destructive"><AlertDescription>{invoiceError}<Button variant="outline" disabled={invoiceLoading} onClick={() => invoiceFailure === 'older' ? void loadOlderInvoices() : setInvoiceRevision(value => value + 1)}>{invoiceFailure === 'older' ? uiT("Retry older statements") : uiT("Retry statements")}</Button></AlertDescription></Alert>}
          {invoices?.length ? <div className="table-wrap"><Table className="provider-ledger billing-invoices">
            <TableHeader><TableRow><TableHead>{uiT("Period")}</TableHead><TableHead>{uiT("Amount")}</TableHead><TableHead>{uiT("Status")}</TableHead><TableHead>{uiT("Actions")}</TableHead></TableRow></TableHeader>
            <TableBody>{invoices.map(invoice => <TableRow key={invoice.id}>
              <TableCell>{day(invoice.from_ms)} – {day(invoice.to_ms - 1)}<span className="billing-mobile-status">{invoice.status === 'paid' ? uiT("Settled") : uiT("Issued")}</span></TableCell>
              <TableCell>{money(invoice.amount_nanos, invoice.currency)}</TableCell><TableCell>{invoice.status === 'paid' ? uiT("Settled") : uiT("Issued")}</TableCell>
              <TableCell><Button size="sm" variant="ghost" onClick={() => setSelected(invoice)}>{uiT("View details")}</Button></TableCell>
            </TableRow>)}</TableBody>
          </Table></div> : invoices && !invoiceLoading && !invoiceError ? <Empty className="billing-empty"><EmptyHeader><EmptyMedia variant="icon"><IconReceipt aria-hidden="true"/></EmptyMedia><EmptyTitle>{uiT("No statements yet")}</EmptyTitle><EmptyDescription>{uiT("Issued usage statements appear here.")}</EmptyDescription></EmptyHeader></Empty> : null}
          {invoiceNext && !invoiceError && <Button variant="outline" disabled={invoiceLoading} onClick={() => void loadOlderInvoices()}>{uiT("Older statements")}</Button>}
        </section>
      </TabsContent>
      <TabsContent value="rates">
        {(data.billing_mode === 'credits' || (data.unit_tariffs?.length ?? 0) > 0 || (data.unit_media_tariffs?.length ?? 0) > 0) && (
          <section className="panel billing-rates mb-6" aria-label={uiT("Customer Credits model rates")}>
            <div className="provider-panel-heading">
              <h2>{uiT("Credits model rates")}</h2>
              <p className="provider-intro billing-description">{uiT("Token rates per million · fees per request")}</p>
            </div>
            {(data.unit_tariffs?.length ?? 0) > 0 ? (
              <div className="px-6 pb-4">
                <Table aria-label={uiT("Customer Credits text model rates")} className="[&_th]:px-2.5 [&_td]:px-2.5 [&_th]:tracking-normal">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{uiT("Model")}</TableHead>
                      <TableHead>{uiT("Input")}</TableHead>
                      <TableHead>{uiT("Cache read")}</TableHead>
                      <TableHead>{uiT("Cache write")}</TableHead>
                      <TableHead>{uiT("Output")}</TableHead>
                      <TableHead>{uiT("Reasoning")}</TableHead>
                      <TableHead>{uiT("Fixed fee")}</TableHead>
                      <TableHead>{uiT("Minimum")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.unit_tariffs!.map(tariff => (
                      <Fragment key={tariff.model_alias}>
                        <TableRow>
                          <TableCell className="font-medium">{tariff.model_alias}{Boolean(tariff.price.context_tiers?.length) && <p className="mt-1 text-xs text-muted-foreground">{uiT("Base rate")}</p>}</TableCell>
                          <TableCell className="tabular-nums">{formatUnitAtoms(tariff.price.prompt_rate, tariff.unit_name, tariff.display_precision)}</TableCell>
                          <TableCell className="tabular-nums">{tariff.price.cached_prompt_rate != null ? formatUnitAtoms(tariff.price.cached_prompt_rate, tariff.unit_name, tariff.display_precision) : '—'}</TableCell>
                          <TableCell className="tabular-nums">{tariff.price.cache_write_prompt_rate != null ? formatUnitAtoms(tariff.price.cache_write_prompt_rate, tariff.unit_name, tariff.display_precision) : '—'}</TableCell>
                          <TableCell className="tabular-nums">{formatUnitAtoms(tariff.price.completion_rate, tariff.unit_name, tariff.display_precision)}</TableCell>
                          <TableCell className="tabular-nums">{tariff.price.reasoning_completion_rate != null ? formatUnitAtoms(tariff.price.reasoning_completion_rate, tariff.unit_name, tariff.display_precision) : '—'}</TableCell>
                          <TableCell className="tabular-nums">{tariff.price.request_fee_atoms != null && BigInt(tariff.price.request_fee_atoms) > 0n ? formatUnitAtoms(tariff.price.request_fee_atoms, tariff.unit_name, tariff.display_precision) : '0'}</TableCell>
                          <TableCell className="tabular-nums">{tariff.price.minimum_charge_atoms != null && BigInt(tariff.price.minimum_charge_atoms) > 0n ? formatUnitAtoms(tariff.price.minimum_charge_atoms, tariff.unit_name, tariff.display_precision) : '0'}</TableCell>
                        </TableRow>
                        {tariff.price.context_tiers?.map(tier => (
                          <TableRow key={tier.minimum_input_tokens}>
                            <TableCell className="font-medium">{tariff.model_alias}<p className="mt-1 text-xs text-muted-foreground">{uiT("From")}{" "}{BigInt(tier.minimum_input_tokens).toLocaleString(readUILocale())}{" "}{uiT("input tokens (inclusive)")}</p></TableCell>
                            <TableCell className="tabular-nums">{formatUnitAtoms(tier.prompt_rate, tariff.unit_name, tariff.display_precision)}</TableCell>
                            <TableCell className="tabular-nums">{tier.cached_prompt_rate != null ? formatUnitAtoms(tier.cached_prompt_rate, tariff.unit_name, tariff.display_precision) : '—'}</TableCell>
                            <TableCell className="tabular-nums">{tier.cache_write_prompt_rate != null ? formatUnitAtoms(tier.cache_write_prompt_rate, tariff.unit_name, tariff.display_precision) : '—'}</TableCell>
                            <TableCell className="tabular-nums">{formatUnitAtoms(tier.completion_rate, tariff.unit_name, tariff.display_precision)}</TableCell>
                            <TableCell className="tabular-nums">{tier.reasoning_completion_rate != null ? formatUnitAtoms(tier.reasoning_completion_rate, tariff.unit_name, tariff.display_precision) : '—'}</TableCell>
                            <TableCell className="tabular-nums">{tariff.price.request_fee_atoms != null && BigInt(tariff.price.request_fee_atoms) > 0n ? formatUnitAtoms(tariff.price.request_fee_atoms, tariff.unit_name, tariff.display_precision) : '0'}</TableCell>
                            <TableCell className="tabular-nums">{tariff.price.minimum_charge_atoms != null && BigInt(tariff.price.minimum_charge_atoms) > 0n ? formatUnitAtoms(tariff.price.minimum_charge_atoms, tariff.unit_name, tariff.display_precision) : '0'}</TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            {(data.unit_media_tariffs?.length ?? 0) > 0 && (
              <div className="px-6 pb-4 mt-2">
                <Table aria-label={uiT("Customer Credits video model rates")} className="[&_th]:px-2.5 [&_td]:px-2.5 [&_th]:tracking-normal">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{uiT("Video model")}</TableHead>
                      <TableHead>{uiT("Channel")}</TableHead>
                      <TableHead>{uiT("Resolution")}</TableHead>
                      <TableHead>{uiT("Reference video")}</TableHead>
                      <TableHead>{uiT("Rate")}</TableHead>
                      <TableHead>{uiT("Minimum billable")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.unit_media_tariffs!.map(mt => (
                      <TableRow key={`${mt.model_alias}:${mt.channel}:${mt.resolution}:${mt.reference_video}`}>
                        <TableCell className="font-medium">{mt.model_alias}</TableCell>
                        <TableCell>{mt.channel}</TableCell>
                        <TableCell>{mt.resolution}</TableCell>
                        <TableCell>{mt.reference_video ? uiT("Yes") : uiT("No")}</TableCell>
                        <TableCell className="tabular-nums">
                          {formatUnitAtoms(mt.price.amount_atoms, mt.unit_name, mt.display_precision)}{" "}{uiT("per")}{" "}{quantity(mt.price.per_quantity)} {uiT(mediaMeter(mt.meter, mt.price.per_quantity))}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {quantity(mt.price.minimum_quantity)} {uiT(mediaMeter(mt.meter, mt.price.minimum_quantity))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        )}
        <section className="panel billing-rates">
          <div className="provider-panel-heading"><h2>{uiT("Model rates")}</h2>{data.tariffs.length > 0 && <p className="provider-intro billing-description">{uiT("Token rates per million · fees per request")}</p>}</div>
          {data.tariffs.length > 0 && <p className="mb-4 px-6 text-sm text-muted-foreground">{uiT("Context tiers price the whole request. The highest matching input-token threshold applies, including the threshold itself. Not configured means no separate category rate is saved.")}</p>}
          {data.tariffs.length ? <div className="table-wrap"><Table className="provider-ledger" aria-label={uiT("Customer model rates")} style={{minWidth:"70rem",tableLayout:"auto"}}>
            <TableHeader><TableRow><TableHead style={{width:"18rem"}}>{uiT("Model")}</TableHead><TableHead>{uiT("Input")}</TableHead><TableHead>{uiT("Cache read")}</TableHead><TableHead>{uiT("Cache write")}</TableHead><TableHead>{uiT("Output")}</TableHead><TableHead>{uiT("Reasoning")}</TableHead><TableHead>{uiT("Fixed fee / request")}</TableHead><TableHead>{uiT("Minimum / request")}</TableHead></TableRow></TableHeader>
            <TableBody>{data.tariffs.map(tariff => <Fragment key={tariff.model_alias}>
              <TableRow>
                <TableCell>{tariff.model_alias}{Boolean(tariff.context_tiers?.length) && <p className="mt-1 text-xs text-muted-foreground">{uiT("Base rate")}</p>}{tariff.context_tiers === undefined && <p className="mt-1 text-xs text-muted-foreground">{uiT("Context tiers unavailable")}</p>}</TableCell>
                <TableCell>{money(tariff.prompt_rate, tariff.currency)}</TableCell>
                <TableCell>{categoryRate(tariff.cached_prompt_rate, tariff.currency)}</TableCell>
                <TableCell>{categoryRate(tariff.cache_write_prompt_rate, tariff.currency)}</TableCell>
                <TableCell>{money(tariff.completion_rate, tariff.currency)}</TableCell>
                <TableCell>{categoryRate(tariff.reasoning_completion_rate, tariff.currency)}</TableCell>
                <TableCell>{tariff.request_fee_nanos != null ? money(tariff.request_fee_nanos, tariff.currency) : uiT("Unknown")}</TableCell>
                <TableCell>{tariff.minimum_charge_nanos != null ? money(tariff.minimum_charge_nanos, tariff.currency) : uiT("Unknown")}</TableCell>
              </TableRow>
              {tariff.context_tiers?.map(tier => <TableRow key={tier.minimum_input_tokens}>
                <TableCell>{tariff.model_alias}<p className="mt-1 text-xs text-muted-foreground">{uiT("From")}{" "}{BigInt(tier.minimum_input_tokens).toLocaleString(readUILocale())}{" "}{uiT("input tokens (inclusive)")}</p></TableCell>
                <TableCell>{money(tier.prompt_rate, tariff.currency)}</TableCell>
                <TableCell>{categoryRate(tier.cached_prompt_rate, tariff.currency)}</TableCell>
                <TableCell>{categoryRate(tier.cache_write_prompt_rate, tariff.currency)}</TableCell>
                <TableCell>{money(tier.completion_rate, tariff.currency)}</TableCell>
                <TableCell>{categoryRate(tier.reasoning_completion_rate, tariff.currency)}</TableCell>
                <TableCell>{tariff.request_fee_nanos != null ? money(tariff.request_fee_nanos, tariff.currency) : uiT("Unknown")}</TableCell>
                <TableCell>{tariff.minimum_charge_nanos != null ? money(tariff.minimum_charge_nanos, tariff.currency) : uiT("Unknown")}</TableCell>
              </TableRow>)}
            </Fragment>)}</TableBody>
          </Table></div> : <Empty className="billing-empty"><EmptyHeader><EmptyMedia variant="icon"><IconCurrencyDollar aria-hidden="true"/></EmptyMedia><EmptyTitle>{uiT("No rates published")}</EmptyTitle><EmptyDescription>{uiT("Published customer prices appear here.")}</EmptyDescription></EmptyHeader></Empty>}
        </section>
      </TabsContent>
    </Tabs>}
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent className="niu-modal billing-detail-dialog">
        <DialogHeader className="text-left"><DialogTitle>{uiT("Statement details")}</DialogTitle><DialogDescription>{selected ? uiF("Billing period: {0} – {1}", [day(selected.from_ms), day(selected.to_ms - 1)]) : uiT("Workspace usage")}</DialogDescription></DialogHeader>
        {selected && <p>{money(selected.amount_nanos, selected.currency)} · {selected.status === 'paid' ? uiT("Settled") : uiT("Issued")}</p>}
        {detailError ? <Alert variant="destructive"><AlertTitle>{uiT("Details unavailable")}</AlertTitle><AlertDescription>{detailError}<Button variant="outline" onClick={() => setSelected(value => value && {...value})}>{uiT("Retry details")}</Button></AlertDescription></Alert> : lines ? <>
          {lines.length > 0 && <div className="table-wrap"><Table className="provider-ledger" aria-label={uiT("Text charges")}><TableHeader><TableRow><TableHead>{uiT("Model")}</TableHead><TableHead>{uiT("Amount")}</TableHead><TableHead>{uiT("Requests")}</TableHead><TableHead>{uiT("Input / output tokens")}</TableHead><TableHead>{uiT("Rates")}</TableHead></TableRow></TableHeader>
            <TableBody>{lines.map(line => <TableRow key={`${line.revision}:${line.currency}:${line.context_minimum_input_tokens ?? 'base'}`}>
              <TableCell>{line.model_alias}</TableCell>
              <TableCell>{money(line.amount_nanos, line.currency)}</TableCell>
              <TableCell>{line.requests}</TableCell>
              <TableCell>{line.prompt_tokens} / {line.completion_tokens}
                {(line.cached_prompt_tokens != null || line.cached_prompt_rate != null) && <small>{uiT("Cached input:")}{" "}{line.cached_prompt_tokens ?? uiT("Unknown")}</small>}
                {(line.cache_write_prompt_tokens != null || line.cache_write_prompt_rate != null) && <small>{uiT("Cache-write input:")}{" "}{line.cache_write_prompt_tokens ?? uiT("Unknown")}</small>}
                {(line.reasoning_completion_tokens != null || line.reasoning_completion_rate != null) && <small>{uiT("Reasoning output:")}{" "}{line.reasoning_completion_tokens ?? uiT("Unknown")}</small>}
              </TableCell>
              <TableCell>{money(line.prompt_rate, line.currency)} / {money(line.completion_rate, line.currency)}{" "}{uiT("per 1M")}{(line.cached_prompt_tokens != null || line.cached_prompt_rate != null) && <small>{uiT("Cache read:")}{" "}{categoryRate(line.cached_prompt_rate, line.currency)}{line.cached_prompt_rate != null ? " " + uiT("per 1M") : ''}</small>}
                {(line.cache_write_prompt_tokens != null || line.cache_write_prompt_rate != null) && <small>{uiT("Cache write:")}{" "}{categoryRate(line.cache_write_prompt_rate, line.currency)}{line.cache_write_prompt_rate != null ? " " + uiT("per 1M") : ''}</small>}
                {(line.reasoning_completion_tokens != null || line.reasoning_completion_rate != null) && <small>{uiT("Reasoning output:")}{" "}{categoryRate(line.reasoning_completion_rate, line.currency)}{line.reasoning_completion_rate != null ? " " + uiT("per 1M") : ''}</small>}
                {line.context_minimum_input_tokens != null && <small>{uiT("Context input threshold:")}{" "}{line.context_minimum_input_tokens}{" "}{uiT("tokens (inclusive)")}</small>}
                <small>{uiT("Fixed fee / request:")}{" "}{line.request_fee_nanos != null ? money(line.request_fee_nanos, line.currency) : uiT("Unknown")}</small>
                <small>{uiT("Minimum / request:")}{" "}{line.minimum_charge_nanos != null ? money(line.minimum_charge_nanos, line.currency) : uiT("Unknown")}</small>
              </TableCell>
            </TableRow>)}</TableBody>
          </Table></div>}
          {mediaLines.length > 0 && <section aria-label={uiT("Media charges")} className="min-w-0 space-y-3">
            <h3 className="text-sm font-medium">{uiT("Media usage")}</h3>
            <div className="table-wrap"><Table className="provider-ledger"><TableHeader><TableRow><TableHead>{uiT("Model")}</TableHead><TableHead>{uiT("Amount")}</TableHead><TableHead>{uiT("Measured usage")}</TableHead><TableHead>{uiT("Billable usage")}</TableHead></TableRow></TableHeader>
              <TableBody>{mediaLines.map((line, index) => <TableRow key={index}>
                <TableCell>{line.model_alias}</TableCell>
                <TableCell>{money(line.amount_nanos, line.currency)}</TableCell>
                <TableCell>{quantity(line.measured_quantity)} {uiT(mediaMeter(line.meter, line.measured_quantity))}</TableCell>
                <TableCell>{quantity(line.billable_quantity)} {uiT(mediaMeter(line.meter, line.billable_quantity))}</TableCell>
              </TableRow>)}</TableBody>
            </Table></div>
          </section>}
          {mediaError && <Alert variant="destructive"><AlertTitle>{uiT("More media charges unavailable")}</AlertTitle><AlertDescription>{mediaError}<Button variant="outline" disabled={mediaLoading} onClick={() => void loadMoreMedia()}>{mediaLoading ? uiT("Loading more…") : uiT("Retry media charges")}</Button></AlertDescription></Alert>}
          {mediaNext && !mediaError && <Button variant="outline" disabled={mediaLoading} onClick={() => void loadMoreMedia()}>{mediaLoading ? uiT("Loading more…") : uiT("Show more media charges")}</Button>}
          {lines.length === 0 && mediaLines.length === 0 && !mediaNext && <p className="text-sm text-muted-foreground">{uiT("No line items available.")}</p>}
        </> : <TableSkeleton columns={5} rows={4} label={uiT("Loading line items…")} />}

      </DialogContent>
    </Dialog>
  </>;
}
