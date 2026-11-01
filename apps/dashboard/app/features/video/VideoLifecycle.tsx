import { useLocale as useUILocale } from '@/shell/ui-locale';
import type {VideoLifecycleTiming} from '@niu-io/sdk';
import {observedLifecycle} from './lifecycle';
const format=(ms:number)=>ms<1000 ? `${ms} ms`:`${(ms/1000).toFixed(1)} s`;
export default function VideoLifecycle({timing}:{timing:VideoLifecycleTiming}) {
  const { t: uiT } = useUILocale();
  const timeline=observedLifecycle(timing);
  if(!timeline)return null;
  return <section className="video-timings" aria-label={uiT("Video lifecycle timing")}>
    <h3>{uiT("Observed lifecycle")}</h3>
    <p className="video-muted">{uiT("Measured when Niu received status updates. Polling delay is included; exact Provider queue and generation times are unavailable.")}</p>
    {timeline.conflict ? <p role="status" className="video-muted">{uiT("Conflicting completion statuses. Duration breakdown is unavailable.")}</p>:!timeline.ordered ? <p role="status" className="video-muted">{uiT("Status observations arrived out of order. Duration breakdown is unavailable.")}</p>:timeline.rows.map(row=><div className="video-span" key={row.label}><span>{row.label}</span><div className="video-span-track" aria-label={`${row.label}: ${format(row.duration)}`}><i style={{marginLeft:`${timeline.total>0 ? row.start/timeline.total*100:0}%`,width:`${timeline.total>0 ? row.duration/timeline.total*100:0}%`}}/></div><small>{format(row.duration)}</small></div>)}
    {!timeline.conflict && <p className="video-muted video-lifecycle-total">{timeline.terminal ? uiT("Observed completion"):uiT("Last observed")}: {format(timeline.total)}{!timeline.terminal && uiT(". Completion not observed.")}</p>}
  </section>;
}
