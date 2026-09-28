import { amountToNanos, money } from '@/lib/money';
import { useEffect, useState, type FormEvent } from 'react';
import { RefreshCw, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

type Budget = { currency: string; limit_nanos: string; reserved_nanos: string; spent_nanos: string };
type Entry = {
  attempt_id: string; price_revision_id: string; currency: string;
  cash_nanos: string; api_equivalent_nanos: string;
  usage_prompt_tokens: string; usage_completion_tokens: string; bound_exceeded: boolean;
};
type Report = { budget: Budget | null; data: Entry[]; next_cursor: string | null };

export default function CostsView({ token, initialScope }: { token: string; initialScope: { organizationId: string; projectId: string } | null }) {
  const organization = initialScope?.organizationId ?? '';
  const project = initialScope?.projectId ?? '';
  const [cursor, setCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('USD');
  const [budgetAmount, setBudgetAmount] = useState('100.00');
  const [budgetError, setBudgetError] = useState('');
  const [budgetNotice, setBudgetNotice] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [loading, setLoading] = useState(false);

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
      setBudgetNotice('Lifetime project budget saved.');
      setRevision(value => value + 1);
    } catch (cause) {
      setBudgetError((cause as Error).message);
    } finally {
      setSavingBudget(false);
    }
  }

  return <>
    <div className="page-heading"><div><p className="page-subtitle">Durable project budgets and settled per-attempt charges.</p></div>
      <Button variant="outline" disabled={!project || loading} onClick={() => { setCursor(null); setRevision(x => x + 1); }}><RefreshCw />Refresh</Button>
    </div>
    <p className="scope-notice">{project ? 'Showing settled charges and budgets for the selected workspace.' : 'Create or select a workspace from the navigation to inspect its accounting records.'} Unsettled attempts may still incur cost; subscription fees are not included.</p>
    {error && <p role="alert" className="error-text">{error}</p>}
    {budgetNotice && <p role="status" className="success-text">{budgetNotice}</p>}
    {loading && <p role="status">Loading accounting records…</p>}
    {!project && <p className="page-subtitle">No workspace selected.</p>}
    {report && <>
      <section className="panel keys-controls budget-panel"><div className="budget-panel-heading"><div><h2>Lifetime cash budget</h2><p>Project-level cash limit</p></div>{report.budget && <Badge variant="secondary">Configured</Badge>}</div>
        {report.budget ? <dl className="budget-grid">
          {([['Limit', report.budget.limit_nanos], ['Reserved exposure', report.budget.reserved_nanos], ['Settled cash spend', report.budget.spent_nanos]] as const).map(([label, value]) =>
            <div key={label}><dt>{label}</dt><dd>{money(value, report.budget!.currency)}</dd></div>)}
        </dl> : <>
          <form className="budget-setup-form" onSubmit={createBudget}>
            <Label htmlFor="budget-amount">Cash limit<Input id="budget-amount" inputMode="decimal" autoComplete="off" required value={budgetAmount} onChange={event => setBudgetAmount(event.target.value)} /></Label>
            <Label htmlFor="budget-currency">Currency code<Input id="budget-currency" autoComplete="off" maxLength={3} required value={budgetCurrency} onChange={event => setBudgetCurrency(event.target.value.toUpperCase())} /></Label>
            <Button type="submit" disabled={savingBudget || loading}>{savingBudget ? 'Saving…' : 'Set lifetime budget'}</Button>
          </form>
          {budgetError && <p role="alert" className="error-text budget-form-error">{budgetError}</p>}
          <p className="budget-policy-note">Enforcement requires a model route with configured pricing and operator-attested token bounds. Unpriced routes are not capped by this budget.</p>
        </>}
      </section>
      <section className="panel"><div className="panel-heading"><div><h2>Settled attempts</h2><p>Live ledger ordered by attempt ID. Refresh to restart traversal.</p></div></div>
        <Table><TableHeader><TableRow><TableHead>ATTEMPT</TableHead><TableHead>CASH COST</TableHead><TableHead>API-EQUIVALENT</TableHead><TableHead>INPUT / OUTPUT TOKENS</TableHead><TableHead>BOUND</TableHead></TableRow></TableHeader>
          <TableBody>{report.data.map(entry => <TableRow key={entry.attempt_id}>
            <TableCell><code title={entry.attempt_id}>{entry.attempt_id.slice(0, 8)}</code><small className="price-revision" title={entry.price_revision_id}>Price {entry.price_revision_id.slice(0, 8)}</small></TableCell>
            <TableCell>{money(entry.cash_nanos, entry.currency)}</TableCell><TableCell>{money(entry.api_equivalent_nanos, entry.currency)}</TableCell>
            <TableCell>{entry.usage_prompt_tokens} / {entry.usage_completion_tokens}</TableCell><TableCell><Badge variant={entry.bound_exceeded ? 'destructive' : 'secondary'}>{entry.bound_exceeded ? 'Exceeded' : 'Within bound'}</Badge></TableCell>
          </TableRow>)}</TableBody>
        </Table>
        {report.data.length === 0 && <p className="empty-state">No settled entries on this page. This does not establish zero incurred cost.</p>}
        {report.next_cursor && <div className="ledger-pagination"><Button variant="outline" onClick={() => setCursor(report.next_cursor)}>Next page<ArrowRight /></Button></div>}
      </section>
    </>}
  </>;
}
