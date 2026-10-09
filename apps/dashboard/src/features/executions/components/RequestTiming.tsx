export type RequestTimings = {
  dispatch_ms: number | null;
  headers_ms: number | null;
  first_output_ms: number | null;
  total_ms: number;
  complete: boolean;
  http_status: number | null;
};

export default function RequestTiming({ timing, outputTokens }: { timing: RequestTimings | null | undefined; outputTokens: string | null }) {
  if (!timing) return <section aria-label="Request timing"><h3 className="text-sm font-medium">Request timing</h3><p className="mt-2 text-sm text-muted-foreground">Phase timing was not collected for this request.</p></section>;
  const total = timing.total_ms;
  const dispatch = timing.dispatch_ms;
  const first = timing.first_output_ms;
  const headers = timing.headers_ms ?? total;
  const rows = [
    ...(dispatch == null ? [] : [{ label: 'Preparation', start: 0, end: dispatch, tone: 'bg-muted-foreground/40' }]),
    { label: first == null ? 'Response wait' : 'First output wait', start: dispatch ?? 0, end: first ?? headers, tone: 'bg-emerald-500' },
    ...(timing.headers_ms == null ? [] : [{ label: first == null ? 'Response delivery' : 'Output stream', start: first ?? headers, end: total, tone: 'bg-primary' }]),
  ];
  const format = (ms: number) => ms < 1000 ? `${ms.toLocaleString()} ms` : `${(ms / 1000).toFixed(2)} s`;
  const outputDuration = first == null ? null : total - first;
  const tokens = outputTokens == null ? null : Number(outputTokens);
  const rate = timing.complete && outputDuration != null && outputDuration > 0 && tokens != null && Number.isSafeInteger(tokens) ? tokens / (outputDuration / 1000) : null;
  return <section aria-label="Request timing" className="space-y-3">
    <h3 className="text-sm font-medium">Request timing</h3>
    <div className="rounded-lg border p-3 space-y-3">
      {rows.map(row => <div key={row.label} className="grid grid-cols-[7rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-xs sm:grid-cols-[8rem_minmax(0,1fr)_4.5rem]">
        <span>{row.label}</span>
        <div className="relative h-5 rounded bg-muted" aria-label={`${row.label}: ${format(row.end - row.start)}`}>
          <div className={`absolute top-0 h-full rounded ${row.tone}`} style={{ left: `${total > 0 ? row.start / total * 100 : 0}%`, width: `${total > 0 ? (row.end - row.start) / total * 100 : 0}%` }} />
        </div>
        <span className="text-right tabular-nums">{format(row.end - row.start)}</span>
      </div>)}
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{rate == null ? '' : `${outputTokens} output ${tokens === 1 ? 'token' : 'tokens'} · ${rate.toFixed(1)} tok/s`}</span>
        <span className="tabular-nums">{timing.complete ? 'Total' : 'Observed'}: {format(total)}</span>
      </div>
    </div>
    {!timing.complete && <p className="text-xs text-muted-foreground">Response interrupted; the bars cover the observed interval.</p>}
  </section>;
}
