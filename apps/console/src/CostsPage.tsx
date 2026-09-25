import { money } from '@/lib/money';
import { useEffect, useState } from 'react';
import { RefreshCw, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

type Named = { id: string; name: string };
type Budget = { currency: string; limit_nanos: string; reserved_nanos: string; spent_nanos: string };
type Entry = {
  attempt_id: string; price_revision_id: string; currency: string;
  cash_nanos: string; api_equivalent_nanos: string;
  usage_prompt_tokens: string; usage_completion_tokens: string; bound_exceeded: boolean;
};
type Report = { budget: Budget | null; data: Entry[]; next_cursor: string | null };

export default function CostsPage({ token }: { token: string }) {
  const [organizations, setOrganizations] = useState<Named[]>([]);
  const [projects, setProjects] = useState<Named[]>([]);
  const [organization, setOrganization] = useState('');
  const [project, setProject] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setError(''); setProjects([]); setReport(null);
    async function load() {
      const url = organization ? `/admin/v1/organizations/${organization}/projects` : '/admin/v1/organizations';
      const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
      if (!response.ok) throw new Error('Unable to load project scopes.');
      const result = await response.json() as { data: Named[] };
      if (!controller.signal.aborted) {
        if (organization) setProjects(result.data); else setOrganizations(result.data);
      }
    }
    void load().catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [token, organization]);

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

  return <>
    <div className="page-heading"><div><p className="eyebrow">COST MANAGEMENT</p><h1>Usage & cost</h1><p className="page-subtitle">Durable project budgets and settled per-attempt charges.</p></div>
      <Button variant="outline" disabled={!project || loading} onClick={() => { setCursor(null); setRevision(x => x + 1); }}><RefreshCw />Refresh</Button>
    </div>
    <section className="panel keys-controls">
      <div className="key-scope-grid">
        <Label htmlFor="cost-organization">Organization<NativeSelect id="cost-organization" value={organization} onChange={e => { setOrganization(e.target.value); setProject(''); setCursor(null); setReport(null); }}>
          <NativeSelectOption value="">Select organization</NativeSelectOption>{organizations.map(x => <NativeSelectOption key={x.id} value={x.id}>{x.name}</NativeSelectOption>)}
        </NativeSelect></Label>
        <Label htmlFor="cost-project">Project<NativeSelect id="cost-project" disabled={!organization} value={project} onChange={e => { setProject(e.target.value); setCursor(null); setReport(null); }}>
          <NativeSelectOption value="">Select project</NativeSelectOption>{projects.map(x => <NativeSelectOption key={x.id} value={x.id}>{x.name}</NativeSelectOption>)}
        </NativeSelect></Label>
      </div>
      <p>Settled charges only. Unsettled attempts may still incur cost. Subscription fee allocations and capacity reports are not included yet.</p>
    </section>
    {error && <p role="alert" className="error-text">{error}</p>}
    {loading && <p role="status">Loading accounting records…</p>}
    {!project && <p className="page-subtitle">Select a project to inspect its accounting records.</p>}
    {report && <>
      <section className="panel keys-controls"><h2>Lifetime cash budget</h2>
        {report.budget ? <dl className="budget-grid">
          {([['Limit', report.budget.limit_nanos], ['Reserved exposure', report.budget.reserved_nanos], ['Settled cash spend', report.budget.spent_nanos]] as const).map(([label, value]) =>
            <div key={label}><dt>{label}</dt><dd>{money(value, report.budget!.currency)}</dd></div>)}
        </dl> : <p>No cash budget configured. This does not mean a zero spending limit.</p>}
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
