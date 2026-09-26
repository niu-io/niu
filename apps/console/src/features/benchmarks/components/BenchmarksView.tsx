import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock3, FileUp, FlaskConical, Gauge, ReceiptText } from "lucide-react";
import { useState, type FormEvent } from "react";
import { money } from "@/lib/money";

type Ratio = { numerator_nanos: string; denominator: number };
type CandidateReport = {
  candidate_id: string;
  model_alias: string;
  offer_revision: string;
  runs: number;
  complete_coverage_runs: number;
  source_accepted_runs: number;
  qualified_completions: number;
  qualification_rate_basis_points: number;
  api_equivalent_per_qualified_completion: Ratio | null;
  cash_per_qualified_completion: Ratio | null;
  api_equivalent_nanos: string;
  evaluator_api_equivalent_nanos: string;
  total_api_equivalent_nanos: string;
  cash_nanos: string;
  evaluator_cash_nanos: string;
  total_cash_nanos: string;
  observed_latency_p50_ms: number | null;
  observed_latency_p95_ms: number | null;
};
type Pair = { task_snapshot_id: string; repetition: number; result: string };
type Diagnostic = { label: string; rule: string; summary: string; evidence: Array<{ candidate_id: string; task_snapshot_id: string; record_id: string; span_ids: string[] }> };
type BenchmarkReport = {
  schema_version: number;
  evidence_kind: string;
  currency: string;
  cash_budget_nanos: string;
  total_cash_nanos: string;
  api_equivalent_nanos: string;
  candidates: CandidateReport[];
  pairs: Pair[];
  paired_uncertainty_95: { wins: number; losses: number; ties: number; both_failed: number; evaluated_pairs: number; lower_95: number | null; upper_95: number | null };
  diagnostics: Diagnostic[];
  limits: string[];
};

function ratio(value: Ratio | null, currency: string) {
  return value ? `${money(value.numerator_nanos, currency)} ÷ ${value.denominator}` : "Undefined · no qualifying completions";
}

function percentage(basisPoints: number) {
  const value = basisPoints / 100;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

function candidateName(candidate: CandidateReport) {
  return `${candidate.model_alias} · ${candidate.candidate_id}`;
}

function pairText(pair: Pair, candidates: CandidateReport[]) {
  if (pair.result === "candidate_a_wins") return `${candidateName(candidates[0])} wins`;
  if (pair.result === "candidate_b_wins") return `${candidateName(candidates[1])} wins`;
  if (pair.result === "tie") return "Tie · equal cost with both meeting criteria";
  return "Both missed the acceptance criteria";
}

export default function BenchmarksView({ token }: { token: string }) {
  const [dataset, setDataset] = useState("");
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setDataset(await file.text());
    setError("");
    setReport(null);
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setReport(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(dataset);
    } catch {
      setError("The dataset must be valid JSON.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/admin/v1/benchmarks/compare", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? `Request failed (${response.status}).`);
      }
      const payload = (await response.json()) as { data: BenchmarkReport };
      setReport(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The gateway could not analyze this dataset.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">EVALUATION</p><h1>Benchmarks</h1><p className="page-subtitle">Compare matched task outcomes against the same tools and acceptance criteria.</p></div>
      <span className="benchmark-mode"><span /> Offline analysis</span>
    </div>

    <div className="benchmark-safety-note" role="note"><FlaskConical size={17} /><p><strong>Analysis only.</strong> Niu evaluates the dataset you provide. It does not send model requests, run task tools, or spend your budget.</p></div>

    <section className="panel benchmark-input-panel">
      <div className="panel-heading"><div><h2>Analyze a paired dataset</h2><p>Provide the version 1 JSON emitted by your authorized evaluator.</p></div><span className="benchmark-schema">PAIRED DATASET · V1</span></div>
      <form onSubmit={analyze} className="benchmark-form">
        <Label htmlFor="benchmark-file" className="benchmark-file-control"><FileUp size={15} />{fileName || "Choose JSON file"}<Input id="benchmark-file" aria-label="Choose JSON file" type="file" accept="application/json,.json" onChange={event => void loadFile(event.target.files?.[0])} /></Label>
        <Label htmlFor="benchmark-dataset">Dataset JSON<textarea id="benchmark-dataset" aria-label="Dataset JSON" className="benchmark-json-input" placeholder={'Paste a paired experiment dataset, or analyze the synthetic fixture:\ncargo run --locked -p niu-benchmark -- compare contracts/fixtures/paired-experiment.v1.json'} value={dataset} onChange={event => setDataset(event.target.value)} spellCheck={false} /></Label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="benchmark-form-footer"><p>Inputs are processed in memory for this request. Reports are not saved. Unknown costs or unlinked billable spans are rejected.</p><Button type="submit" disabled={busy || !dataset.trim()}>{busy ? <Activity className="benchmark-spin" /> : <Gauge size={15} />}{busy ? "Analyzing" : "Analyze dataset"}<ArrowRight size={14} /></Button></div>
      </form>
    </section>

    {report && <div className="benchmark-results" aria-label="Benchmark results">
      <section className="benchmark-report-head">
        <div><p className="eyebrow">PAIRED EXPERIMENT</p><h2>Measured outcomes</h2><p>{report.pairs.length} matched pairs · {report.candidates.reduce((sum, item) => sum + item.runs, 0)} runs · {report.currency} · within declared {money(report.cash_budget_nanos, report.currency)} cap</p></div>
        <div className="benchmark-spend"><ReceiptText size={16} /><span>Total cash across every run</span><strong>{money(report.total_cash_nanos, report.currency)}</strong><small>Includes failed tasks and evaluator work</small></div>
      </section>

      <div className="benchmark-candidate-grid">
        {report.candidates.map((candidate, index) => <article className="benchmark-candidate panel" key={candidate.candidate_id}>
          <div className="benchmark-candidate-head"><div><span className={`benchmark-candidate-mark candidate-${index}`}><FlaskConical size={16} /></span><div><p className="eyebrow">CANDIDATE {index === 0 ? "A" : "B"}</p><h3>{candidate.model_alias}</h3></div></div><span className="benchmark-revision">{candidate.offer_revision}</span></div>
          <p className="benchmark-candidate-id">{candidate.candidate_id}</p>
          <div className="benchmark-qualification"><div><span>Qualified completions</span><strong>{candidate.qualified_completions}<small> / {candidate.runs}</small></strong></div><span>{percentage(candidate.qualification_rate_basis_points)}</span></div>
          <div className="benchmark-progress" aria-label={`${percentage(candidate.qualification_rate_basis_points)} qualified`}><span style={{ width: `${candidate.qualification_rate_basis_points / 100}%` }} /></div>
          <div className="benchmark-mini-grid"><div><span>Source accepted</span><strong>{candidate.source_accepted_runs} runs</strong></div><div><span>Complete coverage</span><strong>{candidate.complete_coverage_runs} / {candidate.runs}</strong></div><div><span>Latency p50 / p95</span><strong>{candidate.observed_latency_p50_ms ?? "—"} / {candidate.observed_latency_p95_ms ?? "—"} ms</strong></div></div>
          <div className="benchmark-costs"><div><span>Cash per qualified completion</span><strong>{ratio(candidate.cash_per_qualified_completion, report.currency)}</strong></div><div><span>API-equivalent per qualified completion</span><strong>{ratio(candidate.api_equivalent_per_qualified_completion, report.currency)}</strong></div><div><span>API-equivalent total</span><strong>{money(candidate.total_api_equivalent_nanos, report.currency)}</strong></div><div><span>Evaluator cash · API-equivalent</span><strong>{money(candidate.evaluator_cash_nanos, report.currency)} · {money(candidate.evaluator_api_equivalent_nanos, report.currency)}</strong></div></div>
        </article>)}
      </div>

      <section className="panel benchmark-pairs-panel">
        <div className="panel-heading"><div><h2>Paired result</h2><p>Both candidates receive the same task snapshot and policy hashes.</p></div><span className="benchmark-sample">{report.paired_uncertainty_95.evaluated_pairs} decisive pairs</span></div>
        <div className="benchmark-outcome-strip"><div><strong>{report.paired_uncertainty_95.wins}</strong><span>{report.candidates[0].candidate_id} wins</span></div><div><strong>{report.paired_uncertainty_95.losses}</strong><span>{report.candidates[1].candidate_id} wins</span></div><div><strong>{report.paired_uncertainty_95.ties}</strong><span>Ties</span></div><div><strong>{report.paired_uncertainty_95.both_failed}</strong><span>Both failed</span></div></div>
        {report.paired_uncertainty_95.lower_95 !== null && report.paired_uncertainty_95.upper_95 !== null && <div className="benchmark-uncertainty"><span>Candidate A decisive win-rate interval · Wilson 95%</span><strong>{(report.paired_uncertainty_95.lower_95 * 100).toFixed(0)}–{(report.paired_uncertainty_95.upper_95 * 100).toFixed(0)}%</strong><div className="benchmark-interval"><span style={{ left: `${report.paired_uncertainty_95.lower_95 * 100}%`, width: `${(report.paired_uncertainty_95.upper_95 - report.paired_uncertainty_95.lower_95) * 100}%` }} /></div><small>Decisive pairs only: {report.paired_uncertainty_95.wins + report.paired_uncertainty_95.losses}. Ties and pairs where both candidates fail are listed separately.</small></div>}
        <div className="benchmark-pair-list">{report.pairs.map((pair, index) => <div className="benchmark-pair-row" key={`${pair.task_snapshot_id}-${pair.repetition}-${index}`}><span className="benchmark-pair-index">{String(index + 1).padStart(2, "0")}</span><code>{pair.task_snapshot_id}</code><span>{pairText(pair, report.candidates)}</span><small>Run {pair.repetition}</small></div>)}</div>
      </section>

      {report.diagnostics.length > 0 && <section className="panel benchmark-diagnostics"><div className="panel-heading"><div><h2>Investigation signals</h2><p>Heuristics point to observed records; they do not prove causation.</p></div><span className="benchmark-heuristic-tag">HEURISTIC</span></div><div>{report.diagnostics.map((item, index) => <article className="benchmark-diagnostic" key={`${item.rule}-${index}`}><AlertTriangle size={16} /><div><strong>{item.summary}</strong><span>{item.rule}</span>{item.evidence.map(link => <p key={`${link.candidate_id}-${link.record_id}`}>{link.candidate_id} · <code>{link.record_id}</code> · spans {link.span_ids.map(id => <code key={id}>{id} </code>)}</p>)}</div></article>)}</div></section>}

      <p className="benchmark-limit-note"><CheckCircle2 size={14} /> Results are measured from supplied trace and ledger evidence. A paired interval describes this sample and does not predict future quality or savings.</p>
      {report.limits.map(limit => <p className="benchmark-limit-detail" key={limit}><Clock3 size={13} />{limit}</p>)}
    </div>}
  </>;
}
