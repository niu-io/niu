import { useLocale as useUILocale } from '@/shell/ui-locale';
import type {VideoLifecycleTiming} from '@niu-io/sdk';
import {formatDurationMs} from '@/lib/duration';
import {observedLifecycle} from './lifecycle';
export default function VideoLifecycle({timing}:{timing:VideoLifecycleTiming}) {
  const { t: uiT } = useUILocale();
  const timeline=observedLifecycle(timing);
  if(!timeline)return null;
  return <section className="video-timings" aria-label={uiT("Video lifecycle timing")}>
    <h3>{uiT("Observed lifecycle")}</h3>
    <p className="video-muted">{uiT("Timing comes from status updates Niu received.")}</p>
    {timeline.conflict ? <p role="status" className="video-muted">{uiT("Conflicting completion statuses. Duration breakdown is unavailable.")}</p>:!timeline.ordered ? <p role="status" className="video-muted">{uiT("Status observations arrived out of order. Duration breakdown is unavailable.")}</p>:timeline.rows.map(row=>{const label=uiT(row.label);return <div className="video-span" key={row.label}><span>{label}</span><div className="video-span-track" aria-label={`${label}: ${formatDurationMs(row.duration)}`}><i style={{marginLeft:`${timeline.total>0 ? row.start/timeline.total*100:0}%`,width:`${timeline.total>0 ? row.duration/timeline.total*100:0}%`}}/></div><small>{formatDurationMs(row.duration)}</small></div>})}
    {!timeline.conflict && <p className="video-muted video-lifecycle-total">{timeline.terminal ? uiT("Observed completion"):uiT("Last observed")}: {formatDurationMs(timeline.total)}{!timeline.terminal && uiT(". Completion not observed.")}</p>}
  </section>;
}
