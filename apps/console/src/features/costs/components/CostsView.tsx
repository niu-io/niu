import { X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { amountToNanos, money } from '@/lib/money';
import { useEffect, useState, type FormEvent } from 'react';
import { RefreshCw, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/PageHeader';

type Budget = { currency: string; limit_nanos: string; reserved_nanos: string; spent_nanos: string };
type Entry = {
  attempt_id: string; price_revision_id: string; currency: string;
  cash_nanos: string; api_equivalent_nanos: string;
  usage_prompt_tokens: string; usage_completion_tokens: string; bound_exceeded: boolean;
};
type Report = { budget: Budget | null; data: Entry[]; next_cursor: string | null };

export default function CostsView({ token, initialScope, canWrite = false }: { canWrite?: boolean; token: string; initialScope: { organizationId: string; projectId: string } | null }) {
  const organization = initialScope?.organizationId ?? '';
  const project = initialScope?.projectId ?? '';
  const [cursor, setCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<Array<string | null>>([]);
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('USD');
  const [budgetAmount, setBudgetAmount] = useState('100.00');
  const [budgetError, setBudgetError] = useState('');
  const [budgetNotice, setBudgetNotice] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [loading, setLoading] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setReport(null); setError('');
    if (!organization || !project) { setLoading(false); return; }
    setLoading(true);
    const base = `/admin/v1/organizations/${organization}/projects/${project}`;
    async function read(path: string) {
      const response = await fetch(path, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
      if (!response.ok) throw new Error('Unable to load accounting records. Try refreshing.');
      return response.json();
    }
    void Promise.all([read(`${base}/budget`), read(`${base}/costs?limit=25${cursor ? '&after=' + cursor : ''}`)])
      .then(([budget, costs]) => { if (!controller.signal.aborted) setReport({ budget: budget.data, ...costs }); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, organization, project, cursor, revision]);

  async function createBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || savingBudget) return;
    setBudgetError(''); setBudgetNotice('');
    const currency = budgetCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      setBudgetError('Enter a 3-letter currency code, such as USD.');
      return;
    }
    let limitNanos: string;
    try { limitNanos = amountToNanos(budgetAmount); }
    catch (cause) { setBudgetError((cause as Error).message); return; }

    setSavingBudget(true);
    try {
      const response = await fetch(`/admin/v1/organizations/${organization}/projects/${project}/budget`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ currency, limit_nanos: limitNanos }),
      });
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message ?? 'Unable to save this budget. Try again.');
      setBudgetNotice('Lifetime workspace budget saved.');
      setRevision(value => value + 1);
      setBudgetDialogOpen(false);
    } catch (cause) {
      setBudgetError((cause as Error).message);
    } finally {
      setSavingBudget(false);
    }
  }

  return <>
    <PageHeader title="Upstream costs" action={<div className="usage-page-actions">{canWrite && report && !report.budget && project && <Button type="button" onClick={() => { setBudgetError(''); setBudgetDialogOpen(true); }}>Set budget</Button>}<Button variant="outline" disabled={!project || loading} onClick={() => { setPreviousCursors([]); setCursor(null); setRevision(x => x + 1); }}><RefreshCw />Refresh</Button></div>} />
    {error && <p role="alert" className="error-text">{error}</p>}
    {budgetNotice && <p role="status" className="success-text">{budgetNotice}</p>}
    {loading && <p role="status">Loading accounting records…</p>}
    {!project && <section className="panel empty-state"><strong>Select a workspace</strong><span>Choose one from the sidebar to review platform expenses and cost limits.</span></section>}
    {report && <>
      <section className="panel keys-controls budget-panel"><div className="budget-panel-heading"><div><h2>Upstream cost budget</h2></div>{report.budget && <Badge variant="secondary">Configured</Badge>}</div>
        {report.budget ? <dl className="budget-grid">
          {([['Limit', report.budget.limit_nanos], ['Reserved exposure', report.budget.reserved_nanos], ['Settled cash spend', report.budget.spent_nanos]] as const).map(([label, value]) =>
            <div key={label}><dt>{label}</dt><dd>{money(value, report.budget!.currency)}</dd></div>)}
        </dl> : <>
          <p className="budget-policy-note">No budget is set. A lifetime budget caps requests with configured prices and token limits. Unpriced routes remain uncapped.</p>
        </>}
      </section>
      <section className="panel"><div className="panel-heading"><div><h2>Settled upstream expenses</h2><p>Platform expenses for completed accounting entries. Pending or unpriced requests may not appear here.</p></div></div>
        {report.data.length > 0 && <Table><TableHeader><TableRow><TableHead>ATTEMPT</TableHead><TableHead>CASH COST</TableHead><TableHead>API-EQUIVALENT</TableHead><TableHead>INPUT / OUTPUT TOKENS</TableHead><TableHead>BOUND</TableHead></TableRow></TableHeader>
          <TableBody>{report.data.map(entry => <TableRow key={entry.attempt_id}>
            <TableCell><code title={entry.attempt_id}>{entry.attempt_id.slice(0, 8)}</code><small className="price-revision" title={entry.price_revision_id}>Price {entry.price_revision_id.slice(0, 8)}</small></TableCell>
            <TableCell>{money(entry.cash_nanos, entry.currency)}</TableCell><TableCell>{money(entry.api_equivalent_nanos, entry.currency)}</TableCell>
            <TableCell>{entry.usage_prompt_tokens} / {entry.usage_completion_tokens}</TableCell><TableCell><Badge variant={entry.bound_exceeded ? 'destructive' : 'secondary'}>{entry.bound_exceeded ? 'Exceeded' : 'Within bound'}</Badge></TableCell>
          </TableRow>)}</TableBody>
        </Table>}
        {report.data.length === 0 && <p className="empty-state">No settled upstream expenses on this page. Pending requests may still incur costs.</p>}
        {(previousCursors.length > 0 || report.next_cursor) && <div className="ledger-pagination"><Button variant="outline" disabled={!previousCursors.length || loading} onClick={() => { setCursor(previousCursors.at(-1) ?? null); setPreviousCursors(values => values.slice(0, -1)); }}><ArrowLeft />Previous page</Button><span>Page {previousCursors.length + 1}</span><Button variant="outline" disabled={!report.next_cursor || loading} onClick={() => { setPreviousCursors(values => [...values, cursor]); setCursor(report.next_cursor); }}>Next page<ArrowRight /></Button></div>}
      </section>
    </>}
    <Dialog open={budgetDialogOpen} onOpenChange={open => { if (!savingBudget) setBudgetDialogOpen(open); }}>
      <DialogContent className="niu-modal budget-dialog" showCloseButton={false}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>Set a workspace budget</DialogTitle><DialogDescription>Create a lifetime cash limit. Only priced requests within configured token bounds can be enforced.</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
        </DialogHeader>
      <form className="niu-modal-form" onSubmit={createBudget}>
        <Label htmlFor="budget-amount">Cash limit<Input id="budget-amount" inputMode="decimal" autoComplete="off" required value={budgetAmount} onChange={event => setBudgetAmount(event.target.value)} /></Label>
        <Label htmlFor="budget-currency">Currency<Input id="budget-currency" autoComplete="off" maxLength={3} required value={budgetCurrency} onChange={event => setBudgetCurrency(event.target.value.toUpperCase())} /></Label>
        {budgetError && <p role="alert" className="error-text budget-form-error">{budgetError}</p>}
        <footer className="niu-modal-actions"><Button type="button" variant="ghost" onClick={() => setBudgetDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={savingBudget || loading}>{savingBudget ? 'Saving…' : 'Set lifetime budget'}</Button></footer>
      </form>
    </DialogContent>
    </Dialog>
  </>;
}
