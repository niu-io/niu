import { useEffect, useState } from 'react';
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

type Tariff = { model_alias: string; revision: string; currency: string; prompt_rate: string; cached_prompt_rate?: string | null; completion_rate: string };
type Invoice = { id: string; from_ms: number; to_ms: number; currency: string; amount_nanos: string; status: string };
type Billing = {
  balances: { currency: string; charged_nanos: string }[];
  unresolved: string; unpriced: string; tariffs: Tariff[]; invoices: Invoice[];
};
type Line = {
  model_alias: string; revision: string; currency: string; requests: string;
  prompt_tokens: string; cached_prompt_tokens?: string | null; completion_tokens: string; prompt_rate: string; cached_prompt_rate?: string | null; completion_rate: string; amount_nanos: string;
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
    if (!selected) return;
    const controller = new AbortController();
    void request<{data: Line[]}>(token, `${base}/invoices/${selected.id}`, 'GET', undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setLines(result.data); })
      .catch(reason => { if (!controller.signal.aborted) setDetailError(reason.message); });
    return () => controller.abort();
  }, [token, base, selected]);

  return <>
    <PageHeader title="Usage statements" action={<Button variant="outline" aria-label="Refresh billing" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} /></Button>} />
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
          <div className="provider-panel-heading"><h2>Usage statements</h2>{data.invoices.length > 0 && <p className="provider-intro billing-description">Latest 100 issued records</p>}</div>
          {data.invoices.length ? <div className="table-wrap"><Table className="provider-ledger billing-invoices">
            <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>{data.invoices.map(invoice => <TableRow key={invoice.id}>
              <TableCell>{day(invoice.from_ms)} – {day(invoice.to_ms - 1)}<span className="billing-mobile-status">{invoice.status === 'paid' ? 'Payment recorded' : 'Issued'}</span></TableCell>
              <TableCell>{money(invoice.amount_nanos, invoice.currency)}</TableCell><TableCell>{invoice.status === 'paid' ? 'Payment recorded' : 'Issued'}</TableCell>
              <TableCell><Button size="sm" variant="ghost" onClick={() => setSelected(invoice)}>View details</Button></TableCell>
            </TableRow>)}</TableBody>
          </Table></div> : <Empty className="billing-empty"><EmptyHeader><EmptyMedia variant="icon"><IconReceipt aria-hidden="true"/></EmptyMedia><EmptyTitle>No statements yet</EmptyTitle><EmptyDescription>Issued usage statements appear here.</EmptyDescription></EmptyHeader></Empty>}
        </section>
      </TabsContent>
      <TabsContent value="rates">
        <section className="panel billing-rates">
          <div className="provider-panel-heading"><h2>Model rates</h2>{data.tariffs.length > 0 && <p className="provider-intro billing-description">Per million text tokens</p>}</div>
          {data.tariffs.length ? <div className="table-wrap"><Table className="provider-ledger"><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Input</TableHead><TableHead>Cache read</TableHead><TableHead>Output</TableHead></TableRow></TableHeader>
            <TableBody>{data.tariffs.map(tariff => <TableRow key={tariff.model_alias}><TableCell>{tariff.model_alias}</TableCell><TableCell>{money(tariff.prompt_rate, tariff.currency)}</TableCell><TableCell>{tariff.cached_prompt_rate != null ? money(tariff.cached_prompt_rate, tariff.currency) : "Input rate"}</TableCell><TableCell>{money(tariff.completion_rate, tariff.currency)}</TableCell></TableRow>)}</TableBody>
          </Table></div> : <Empty className="billing-empty"><EmptyHeader><EmptyMedia variant="icon"><IconCurrencyDollar aria-hidden="true"/></EmptyMedia><EmptyTitle>No rates published</EmptyTitle><EmptyDescription>Published customer prices appear here.</EmptyDescription></EmptyHeader></Empty>}
        </section>
      </TabsContent>
    </Tabs>}
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent className="niu-modal billing-detail-dialog">
        <DialogHeader className="text-left"><DialogTitle>Statement details</DialogTitle><DialogDescription>{selected ? `Billing period: ${day(selected.from_ms)} – ${day(selected.to_ms - 1)}` : 'Workspace usage'}</DialogDescription></DialogHeader>
        {selected && <p>{money(selected.amount_nanos, selected.currency)} · {selected.status === 'paid' ? 'Payment recorded' : 'Issued'}</p>}
        {detailError ? <Alert variant="destructive"><AlertTitle>Details unavailable</AlertTitle><AlertDescription>{detailError}<Button variant="outline" onClick={() => setSelected(value => value && {...value})}>Retry details</Button></AlertDescription></Alert> : lines && lines.length === 0 ? <p className="text-sm text-muted-foreground">No line items available.</p> : lines ? <div className="table-wrap"><Table className="provider-ledger"><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Amount</TableHead><TableHead>Requests</TableHead><TableHead>Input / output tokens</TableHead><TableHead>Rates / 1M</TableHead></TableRow></TableHeader>
          <TableBody>{lines.map(line => <TableRow key={line.revision}><TableCell>{line.model_alias}</TableCell><TableCell>{money(line.amount_nanos, line.currency)}</TableCell><TableCell>{line.requests}</TableCell><TableCell>{line.prompt_tokens} / {line.completion_tokens}{line.cached_prompt_rate != null && <small>Cached input: {line.cached_prompt_tokens ?? "Unknown"}</small>}</TableCell><TableCell>{money(line.prompt_rate, line.currency)} / {money(line.completion_rate, line.currency)}{line.cached_prompt_rate != null && <small>Cache read: {money(line.cached_prompt_rate, line.currency)}</small>}</TableCell></TableRow>)}</TableBody>
        </Table></div> : <p role="status">Loading line items…</p>}
      </DialogContent>
    </Dialog>
  </>;
}
