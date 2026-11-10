import { formatLocalizedMessage, readLocale, translateUI } from '@/shell/ui-locale';

export function executionStatusLabel(value: string) {
  const labels: Record<string, string> = {
    not_sent: 'Not sent', may_have_executed: 'Unresolved',
    confirmed_completed: 'Completed', confirmed_not_executed: 'Not executed',
    output_withheld: 'Output withheld', delivery_failed: 'Delivery failed',
  };
  return translateUI(labels[value] ?? 'Unknown');
}

export function requestOutcomeLabel(item: { execution: string; timing?: { http_status?: number | null } | null; output_guardrail_outcome?: string | null }) {
  if (item.output_guardrail_outcome === 'blocked' || item.output_guardrail_outcome === 'indeterminate') return translateUI('Output withheld');
  if (item.timing?.http_status != null && item.timing.http_status >= 400) return formatLocalizedMessage('Failed · HTTP {0}', [item.timing.http_status], readLocale());
  const outcome = executionStatusLabel(item.execution);
  return item.output_guardrail_outcome === 'redacted' ? `${outcome} · ${translateUI('Redacted')}` : outcome;
}
