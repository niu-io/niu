import type {VideoLifecycleTiming} from '../../../../../sdks/javascript/src/index';
export function observedLifecycle(timing:VideoLifecycleTiming) {
  const submitted=timing.submitted_unix_ms;
  if(submitted == null || !Number.isSafeInteger(submitted) || submitted<0)return null;
  const observations=timing.observations.filter(item=>Number.isSafeInteger(item.observed_unix_ms) && item.observed_unix_ms>=submitted);
  const running=observations.find(item=>item.status === 'running')?.observed_unix_ms;
  const terminal=observations.filter(item=>item.status === 'succeeded' || item.status === 'failed');
  const conflict=timing.conflicting_terminal || new Set(terminal.map(item=>item.status)).size>1;
  const end=conflict ? null:terminal[0]?.observed_unix_ms ?? null;
  // A late running observation does not prove that a terminal job ran backwards.
  const ordered=running == null || end == null || running<=end;
  const latest=Math.max(submitted,...observations.map(item=>item.observed_unix_ms));
  const total=(end ?? latest)-submitted;
  const rows:Array<{label:string;start:number;duration:number}>=[];
  if(!conflict && ordered && running != null) {
    rows.push({label:'Before running',start:0,duration:running-submitted});
    if(end != null)rows.push({label:'Running observed',start:running-submitted,duration:end-running});
  }
  return {total,rows,conflict,ordered,terminal:end != null};
}
