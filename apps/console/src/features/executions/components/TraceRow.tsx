import { timelineRows, type ExecutionRecordV1 } from '@/features/executions/utils';
import { kindLabel } from '@/features/executions/api';

export default function TraceRow({ row, active, onSelect, outcomes }: {
  row: ReturnType<typeof timelineRows>[number];
  active: boolean;
  onSelect: () => void;
  outcomes: ExecutionRecordV1['outcomes'];
}) {
  const { span, durationMs, startPercent, widthPercent, depth, structurallyLinked, clipped } = row;
  const left = startPercent ?? 0;
  const width = widthPercent ?? 0;
  return <div className={'trace-row' + (active ? ' is-active' : '') + (!structurallyLinked && span.kind !== 'task' ? ' is-unlinked' : '')} style={{ marginLeft: Math.min(depth, 5) * 15 }}>
    <button className="trace-span" type="button" aria-pressed={active} onClick={onSelect}>
      <span className={'trace-kind-mark kind-' + span.kind.replaceAll('_', '-')} aria-hidden="true" />
      <span className="trace-span-copy"><strong>{span.id}</strong><small>{kindLabel(span.kind)}{span.requested_model ? ' · ' + span.requested_model : ''}{span.status ? ' · ' + kindLabel(span.status) : ''}</small></span>
      {outcomes.length > 0 && <span className="trace-outcome-mark" title={outcomes.map(outcome => kindLabel(outcome.authority) + ': ' + outcome.result).join(', ')}>{outcomes.length} outcome{outcomes.length === 1 ? '' : 's'}</span>}
    </button>
    <div className="trace-track" aria-label={startPercent == null ? 'Observed interval unknown' : 'Observed task interval'}>
      {startPercent == null ? <span className="trace-no-time">Not timed</span> : <span className={'trace-bar' + (durationMs === 0 ? ' is-instant' : '') + (clipped ? ' is-clipped' : '')} style={{ left: left + '%', width: width + '%' }} title={durationMs == null ? 'Interval unknown' : durationMs + ' milliseconds observed'} />}
    </div>
    <span className="trace-duration">{durationMs == null ? '—' : durationMs + ' ms'}{clipped && <small>clipped</small>}</span>
  </div>;
}
