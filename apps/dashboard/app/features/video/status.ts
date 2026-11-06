/** Saved video task states shown in results. Translation stays at the call site. */
export const videoStatusLabel: Record<string, string> = {
  submission_unknown: 'Submission uncertain',
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  unknown: 'Status unavailable',
  reconciliation_required: 'Needs reconciliation',
};
