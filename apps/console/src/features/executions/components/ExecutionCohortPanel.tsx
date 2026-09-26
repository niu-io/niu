import { Badge } from '@/components/ui/badge';
import { money } from '@/lib/money';
import type { ExecutionCohort } from '@/features/executions/utils';

export default function ExecutionCohortPanel({ cohort, loading, error }: {
  cohort: ExecutionCohort | null;
  loading: boolean;
  error: string;
}) {
  const apiAmounts = cohort?.api_equivalent_by_currency ?? [];
  const cashAmounts = cohort?.configured_rate_cash_by_currency ?? [];
  const acceptedApiCosts = cohort?.api_equivalent_per_accepted_completion ?? [];
  const acceptedCashCosts = cohort?.configured_rate_cash_per_accepted_completion ?? [];

  function amounts(values: Array<{ currency: string; amount_nanos: string }>) {
    return values.length ? values.map(value => <span key={value.currency}>{money(value.amount_nanos, value.currency)}</span>) : <span className="execution-cohort-empty-value">No settled entries</span>;
  }
  function rationalAmounts(values: Array<{ currency: string; numerator_nanos: string; denominator: number }>) {
    const emptyLabel = !cohort?.cost_evidence.complete
      ? 'Unavailable while evidence is incomplete'
      : cohort.accepted_completions === 0
        ? 'Undefined with zero accepted tasks'
        : 'No settled currency totals';
    return values.length ? values.map(value => <span key={value.currency}>{money(value.numerator_nanos, value.currency)}<small>÷ {value.denominator} accepted tasks</small></span>) : <span className="execution-cohort-empty-value">{emptyLabel}</span>;
  }

  return <section className="execution-cohort panel" aria-labelledby="execution-cohort-title" aria-busy={loading}>
    <header className="execution-cohort-head">
      <div><p className="eyebrow">PROJECT ROLLUP</p><h2 id="execution-cohort-title">Cohort outcomes</h2><p>Per-record outcomes and deduplicated ledger evidence.</p></div>
      {cohort && <Badge variant={cohort.cost_evidence.complete ? 'secondary' : 'outline'}>{cohort.cost_evidence.complete ? 'Evidence complete' : 'Evidence incomplete'}</Badge>}
    </header>
    {error && <p role="alert" className="execution-cohort-error">Cohort report unavailable. {error}</p>}
    {loading && !cohort && <p role="status" className="execution-cohort-loading">Loading project rollup…</p>}
    {cohort && <>
      <div className="execution-cohort-grid">
        <div className="execution-cohort-stat"><span>Imported task records</span><strong>{cohort.records_scanned}{cohort.truncated ? '+' : ''}</strong><small>{cohort.coverage.complete} complete · {cohort.coverage.partial} partial · {cohort.coverage.unknown} unknown coverage</small></div>
        <div className="execution-cohort-stat execution-cohort-accepted"><span>Accepted completions</span><strong>{cohort.accepted_completions}</strong><small>{cohort.outcomes.rejected} rejected · {cohort.outcomes.inconclusive} inconclusive · {cohort.outcomes.conflicting} conflicting · {cohort.outcomes.unverified} unverified</small></div>
        <div className="execution-cohort-stat execution-cohort-money"><span>API-equivalent cost</span><strong>{amounts(apiAmounts)}</strong><small>{cohort.cost_evidence.settled_cost_entries} {cohort.cost_evidence.complete ? 'deduplicated settled entries' : 'known settled entries'}</small></div>
        <div className="execution-cohort-stat execution-cohort-money"><span>Configured-rate cash</span><strong>{amounts(cashAmounts)}</strong><small>Niu rate calculation · not supplier invoices</small></div>
        <div className="execution-cohort-stat execution-cohort-money execution-cohort-ratio"><span>API cost / accepted task</span><strong>{rationalAmounts(acceptedApiCosts)}</strong><small>Exact ratio across all known cohort spend</small></div>
        <div className="execution-cohort-stat execution-cohort-money execution-cohort-ratio"><span>Cash / accepted task</span><strong>{rationalAmounts(acceptedCashCosts)}</strong><small>Exact ratio using configured rates</small></div>
      </div>
      <div className="execution-cohort-authorities" aria-label="Outcome evidence by authority">
        <span className="execution-cohort-authorities-title">Outcome evidence</span>
        {([
          ['Agent claim', cohort.outcome_evidence.agent_claim],
          ['Deterministic validator', cohort.outcome_evidence.deterministic_validator],
          ['Human acceptance', cohort.outcome_evidence.human_acceptance],
        ] as const).map(([label, evidence]) => <div key={label}><span>{label}</span><small>{evidence.accepted} accepted · {evidence.rejected} rejected · {evidence.inconclusive} inconclusive · {evidence.conflicting} conflicting · {evidence.absent} absent</small></div>)}
      </div>
      <div className="execution-cohort-foot">
        <span>{cohort.cost_evidence.complete ? 'Every imported record has complete coverage and its observed billable work resolves to a settled ledger entry.' : `${cohort.cost_evidence.unresolved_references} unresolved refs · ${cohort.cost_evidence.attempts_without_cost_entries} attempts without cost · ${cohort.work.billable_roots_without_charge_references} billable roots without refs`}</span>
        <span>{cohort.capacity.quota_observations} quota samples · task attribution unavailable</span>
      </div>
      <p className="execution-cohort-disclosure">Outcomes are counted per imported record. Invoice cash and subscription allocations are not imported. {cohort.truncated && `Showing the first ${cohort.record_limit.toLocaleString()} records in stable UUID order. `}{!cohort.cost_evidence.complete && 'Known settled costs include failed work when a canonical charge is linked; missing references remain unknown.'}</p>
    </>}
  </section>;
}
