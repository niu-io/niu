import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
export type RequestTimings = {
  dispatch_ms: number | null;
  headers_ms: number | null;
  first_output_ms: number | null;
  total_ms: number;
  complete: boolean;
  http_status: number | null;
};

export default function RequestTiming({ timing, outputTokens }: { timing: RequestTimings | null | undefined; outputTokens: string | null }) {
  const { t: uiT, format: uiF } = useUILocale();
  if (!timing) return <section aria-label={uiT("Request timing")}><h3 className="text-sm font-medium">{uiT("Request timing")}</h3><p className="mt-2 text-sm text-muted-foreground">{uiT("Phase timing was not collected for this request.")}</p></section>;
  const total = timing.total_ms;
  const dispatch = timing.dispatch_ms;
  const first = timing.first_output_ms;
  const headers = timing.headers_ms ?? total;
  const rows = [
    ...(dispatch == null ? [] : [{ label: uiT('Preparation'), start: 0, end: dispatch, tone: 'bg-muted-foreground/45' }]),
    { label: first == null ? uiT('Response wait') : uiT('First output wait'), start: dispatch ?? 0, end: first ?? headers, tone: 'bg-[var(--chart-2)]' },
    ...(timing.headers_ms == null ? [] : [{ label: first == null ? uiT('Response delivery') : uiT('Output stream'), start: first ?? headers, end: total, tone: 'bg-primary' }]),
  ];
  const format = (ms: number) => ms < 1000 ? `${ms.toLocaleString(readUILocale())} ms` : `${(ms / 1000).toFixed(2)} s`;
  const outputDuration = first == null ? null : total - first;
  const tokens = outputTokens == null ? null : Number(outputTokens);
  const formattedOutputTokens = outputTokens == null ? null : /^\d+$/.test(outputTokens) ? BigInt(outputTokens).toLocaleString(readUILocale()) : outputTokens;
  const rate = timing.complete && outputDuration != null && outputDuration > 0 && tokens != null && Number.isSafeInteger(tokens) ? tokens / (outputDuration / 1000) : null;
  return <section aria-label={uiT("Request timing")} className="space-y-3">
    <h3 className="text-sm font-medium">{uiT("Request timing")}</h3>
    <div className="rounded-lg border p-3 space-y-3">
      {rows.map(row => <div key={row.label} className="grid grid-cols-[minmax(6.5rem,auto)_minmax(0,1fr)_auto] items-center gap-2.5 text-xs sm:grid-cols-[minmax(8.5rem,auto)_minmax(0,1fr)_auto]">
        <span className="truncate" title={row.label}>{row.label}</span>
        <div className="relative h-5 rounded bg-muted" aria-label={`${row.label}: ${format(row.end - row.start)}`}>
          <div className={`absolute top-0 h-full rounded ${row.tone}`} style={{ left: `${total > 0 ? row.start / total * 100 : 0}%`, width: `${total > 0 && row.end > row.start ? Math.max(1.5, (row.end - row.start) / total * 100) : 0}%` }} />
        </div>
        <span className="text-right tabular-nums">{format(row.end - row.start)}</span>
      </div>)}
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{rate == null ? '' : uiF("{0} output {1} · {2} tok/s", [formattedOutputTokens, tokens === 1 ? uiT("token") : uiT("tokens"), rate.toFixed(1)])}</span>
        <span className="tabular-nums">{timing.complete ? uiT("Total") : uiT("Observed")}: {format(total)}</span>
      </div>
    </div>
    {!timing.complete && <p className="text-xs text-muted-foreground">{uiT("Response interrupted; the bars cover the observed interval.")}</p>}
  </section>;
}
