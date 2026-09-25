import { money } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export type TaskChargeEvidence = {
  entries: {
    attempt_id: string; price_revision_id: string; currency: string;
    api_equivalent_nanos: string; cash_nanos: string;
    usage_prompt_tokens: string; usage_completion_tokens: string;
    bound_exceeded: boolean;
  }[];
  unresolved: string[];
  attribution: 'imported_reference';
  task_total_complete: boolean;
};

export default function TaskCharges({ charges }: { charges?: TaskChargeEvidence }) {
  return <section className="panel">
    <div className="panel-heading"><h2>Referenced charges</h2><Badge variant="secondary">Task total unknown</Badge></div>
    <div className="keys-controls">
      <p>Settled ledger entries referenced by this import, counted once per attempt. The importer supplied these links; attribution is not independently verified.</p>
      <p>These entries do not establish complete task cost. Unreferenced work, tool costs, subscription fees and allocations may be missing.</p>
      {!charges && <p role="status">Charge evidence is unavailable. Refresh to request the latest ledger evidence.</p>}
      {charges && <p>{charges.entries.length} resolved {charges.entries.length === 1 ? 'charge' : 'charges'} · {charges.unresolved.length} unresolved {charges.unresolved.length === 1 ? 'reference' : 'references'}</p>}
    </div>
    {charges && charges.entries.length > 0 && <Table>
      <TableHeader><TableRow><TableHead>ATTEMPT / PRICE REVISION</TableHead><TableHead>API-EQUIVALENT COST</TableHead><TableHead>CASH COST</TableHead><TableHead>REPORTED TOKENS</TableHead><TableHead>RESERVATION</TableHead></TableRow></TableHeader>
      <TableBody>{charges.entries.map(entry => <TableRow key={entry.attempt_id}>
        <TableCell>{entry.attempt_id}<small className="price-revision">{entry.price_revision_id}</small></TableCell>
        <TableCell>{money(entry.api_equivalent_nanos, entry.currency)}</TableCell>
        <TableCell>{money(entry.cash_nanos, entry.currency)}</TableCell>
        <TableCell>{entry.usage_prompt_tokens} input / {entry.usage_completion_tokens} output</TableCell>
        <TableCell><Badge variant={entry.bound_exceeded ? 'destructive' : 'outline'}>{entry.bound_exceeded ? 'Bound exceeded' : 'Within bound'}</Badge></TableCell>
      </TableRow>)}</TableBody>
    </Table>}
    {charges && !charges.entries.length && <p className="empty-state">No resolved ledger charges. This does not mean the task was free.</p>}
    {!!charges?.unresolved.length && <div className="keys-controls"><h3>Unresolved references</h3><p>External, unavailable or unsettled references remain unknown.</p><ul className="trace-links">{charges.unresolved.map(reference => <li key={reference}><code>{reference}</code></li>)}</ul></div>}
  </section>;
}
