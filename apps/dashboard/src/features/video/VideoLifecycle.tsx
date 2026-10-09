import type {VideoLifecycleTiming} from '../../../../../sdks/javascript/src/index';
import {observedLifecycle} from './lifecycle';
const format=(ms:number)=>ms<1000 ? `${ms} ms`:`${(ms/1000).toFixed(1)} s`;
export default function VideoLifecycle({timing}:{timing:VideoLifecycleTiming}) {
  const timeline=observedLifecycle(timing);
  if(!timeline)return null;
  return <section className="video-timings" aria-label="Video lifecycle timing">
    <h3>Observed lifecycle</h3>
    <p className="video-muted">Measured when Niu received status updates. Polling delay is included; exact Supplier queue and generation times are unavailable.</p>
    {timeline.conflict ? <p role="status" className="video-muted">Conflicting completion statuses. Duration breakdown is unavailable.</p>:!timeline.ordered ? <p role="status" className="video-muted">Status observations arrived out of order. Duration breakdown is unavailable.</p>:timeline.rows.map(row=><div className="video-span" key={row.label}><span>{row.label}</span><div className="video-span-track" aria-label={`${row.label}: ${format(row.duration)}`}><i style={{marginLeft:`${timeline.total>0 ? row.start/timeline.total*100:0}%`,width:`${timeline.total>0 ? row.duration/timeline.total*100:0}%`}}/></div><small>{format(row.duration)}</small></div>)}
    {!timeline.conflict && <p className="video-muted video-lifecycle-total">{timeline.terminal ? 'Observed completion':'Last observed'}: {format(timeline.total)}{!timeline.terminal && '. Completion not observed.'}</p>}
  </section>;
}
