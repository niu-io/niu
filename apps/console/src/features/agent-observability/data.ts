import { useEffect, useState } from 'react';
export const base = '/admin/v1/agent-observability';
export type Span = { id: string; kind: string; status?: string; started_at_ms: number | null; ended_at_ms: number | null; requested_model: string | null; reported_model: string | null };
export type Trace = { unassembled_event?: boolean; id: string; name: string; source: string; occurred_at: string; received_at?: string; time_basis: string; status: string; coverage: string; duration_ms: number | null; span_count: number; error_count: number; model_calls: number; tool_calls: number; span_names?: Record<string, string>; record?: { task_id: string; spans: Span[]; links: { from: string; to: string; kind: string }[]; external_usage?: { input_tokens: string | null; output_tokens: string | null; cost_nanos: string | null; currency: string | null }; outcomes: { span_id: string; authority: string; result: string }[] } };
export type TraceReport = { rows: Trace[]; summary: { trace_count: string; completed: string; failed: string; unknown_status: string; partial: string; untimed: string; span_count: string; error_count: string; model_calls: string; tool_calls: string; p50_duration_ms: number | null; p95_duration_ms: number | null }; by_day: { day: string; trace_count: string; failed: string }[]; offset: number; limit: number };
export type Connection = { id: string; name: string; source: string; client_version: string; paused: boolean; revoked: boolean; expired: boolean; created_at: string; expires_at: string; last_received_at: string | null };
export type UsageRow = { model?: string; day?: string; billing_mode: string; response_count: string; input_tokens: string; output_tokens: string; cached_input_tokens: string; priced_value_usd_nanos: string; unknown_value_count: string };
export type UsageReport = { summary: UsageRow & { unknown_billing_count: string }; sources: { source: string; client_version: string; paused: boolean }[]; by_model: UsageRow[]; by_day: UsageRow[]; fees: { from_ms: number; to_ms: number; subscription_fee_usd_cents: number | null; paid_overflow_usd_cents: number | null } | null; comparison: { subscription_priced_count: string; subscription_unknown_count: string; subscription_api_equivalent_usd_nanos: string; value_multiple: string | null }; coverage: string };
export function useAgentRead<T>(token: string, path: string | null, revision = 0): { key: string; data?: T; error?: string } {
  const scope = `${token}:${path}`;
  const key = `${scope}:${revision}`;
  const [state, setState] = useState<{ key: string; scope: string; data?: T; error?: string }>({ key: '', scope: '' });
  useEffect(() => {
    const controller = new AbortController();
    if (path) void agentRequest<{ data: T }>(token, path, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setState({ key, scope, data: result.data }); })
      .catch(error => { if (!controller.signal.aborted) setState(previous => ({ key, scope, data: previous.scope === scope ? previous.data : undefined, error: error instanceof Error ? error.message : 'Unable to load observations.' })); });
    return () => controller.abort();
  }, [key, scope, token, path]);
  return state.key === key ? state : state.scope === scope ? { key, data: state.data } : { key };
}
export async function agentRequest<T = void>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { authorization: `Bearer ${token}`, ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } });
  if (!response.ok) throw new Error(response.status === 403 ? 'Sign in with your personal account to view agent observations.' : response.status === 409 ? 'This record changed or is no longer available. Refresh and try again.' : `Unable to complete this request (${response.status}). Try again.`);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export const number = (value: string | number | null | undefined) => value == null ? 'Unknown' : typeof value === 'string' ? BigInt(value).toLocaleString() : value.toLocaleString();
export function dollars(nanos: string | null | undefined) {
  if (nanos == null) return 'Unknown';
  const amount = BigInt(nanos), cents = (amount + 5_000_000n) / 10_000_000n;
  if (amount > 0n && cents === 0n) return '< $0.01';
  return `$${(cents / 100n).toLocaleString()}.${(cents % 100n).toString().padStart(2, '0')}`;
}
export const duration = (ms: number | null | undefined) => ms == null ? 'Unknown' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(2)} s` : `${(ms / 60_000).toFixed(1)} min`;
export const words = (value: string) => value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
export const safeLabel = (value: string | null | undefined, fallback: string) => !value || /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i.test(value) ? fallback : value;
export const spanName = (trace: Trace, span: Span) => safeLabel(trace.span_names?.[span.id], span.kind === 'task' ? safeLabel(trace.name, 'Agent run') : words(span.kind));
export function traceOrder(trace: Trace) {
  const spans = trace.record?.spans ?? [], links = trace.record?.links ?? [];
  const containment = links.filter(l => l.kind === 'contains' || l.kind === 'delegates');
  const byId = new Map(spans.map(s => [s.id, s]));
  const seen = new Set<string>(), result: { span: Span; depth: number }[] = [];
  const stack = trace.record ? [{ id: trace.record.task_id, depth: 0 }] : [];
  while (stack.length) {
    const item = stack.pop()!;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const span = byId.get(item.id);
    if (span) result.push({ span, depth: item.depth });
    const children = containment.filter(l => l.from === item.id).map(l => ({ id: l.to, depth: item.depth + 1 }));
    stack.push(...children.reverse());
  }
  for (const span of spans) if (!seen.has(span.id)) result.push({ span, depth: 0 });
  return result;
}

export function traceExport(trace: Trace) {
  const order = traceOrder(trace), references = new Map(order.map(({ span }, i) => [span.id, `Event ${i + 1}`]));
  const usage = trace.record?.external_usage;
  return { name: safeLabel(trace.name, 'Agent run'), source: safeLabel(trace.source, 'Agent'), observed_at: trace.occurred_at,
    time_basis: trace.time_basis, status: trace.status, coverage: trace.coverage, duration_ms: trace.duration_ms,
    spans: order.map(({ span: s }) => ({ event: references.get(s.id), name: spanName(trace, s), kind: s.kind, status: s.status ?? 'unknown', started_at_ms: s.started_at_ms, ended_at_ms: s.ended_at_ms, requested_model: safeLabel(s.requested_model, 'Unknown'), reported_model: safeLabel(s.reported_model, 'Unknown') })),
    relationships: trace.record?.links.map(l => ({ from: references.get(l.from), to: references.get(l.to), kind: l.kind })),
    outcomes: trace.record?.outcomes.map(o => ({ event: references.get(o.span_id), authority: o.authority, result: o.result })),
    usage: usage ? { authority: 'agent_reported_estimate', input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_nanos: usage.cost_nanos, currency: safeLabel(usage.currency, 'Unknown') } : null };
}
