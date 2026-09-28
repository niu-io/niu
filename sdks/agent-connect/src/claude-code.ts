export type AgentReportedUsageV1 = {
  authority: 'agent_reported_estimate';
  agent_version: string | null;
  request_count: number;
  retry_count: number;
  input_tokens: string | null;
  output_tokens: string | null;
  cache_read_tokens: string | null;
  cache_creation_tokens: string | null;
  cost_nanos: string | null;
  currency: string | null;
};

export type ExternalExecutionRecordV1 = {
  schema_version: 1;
  source: 'claude-code-otel';
  record_id: string;
  task_id: string;
  coverage: 'partial';
  spans: Array<{
    id: string;
    kind: 'task' | 'step' | 'model_invocation' | 'tool_invocation' | 'attempt';
    status: 'unknown' | 'completed' | 'failed';
    started_at_ms: number | null;
    ended_at_ms: number | null;
    requested_model: string | null;
    reported_model: string | null;
    charge_ref: null;
  }>;
  links: Array<{ from: string; to: string; kind: 'contains' }>;
  outcomes: [];
  external_usage: AgentReportedUsageV1;
};

type EventName = 'user_prompt' | 'assistant_response' | 'api_request' | 'api_error' | 'api_refusal' | 'tool_result';
type Event = {
  name: EventName;
  sequence: string;
  timestampMs: number | null;
  durationMs: number | null;
  sessionId: string;
  promptId: string | null;
  sourceEventId: string | null;
  agentVersion: string | null;
  model: string | null;
  success: boolean | null;
  attempts: number | null;
  inputTokens: string | null;
  outputTokens: string | null;
  cacheReadTokens: string | null;
  cacheCreationTokens: string | null;
  costNanos: string | null;
};

const supportedEvents = new Set<EventName>([
  'user_prompt', 'assistant_response', 'api_request', 'api_error', 'api_refusal', 'tool_result',
]);
const maximumLogRecords = 10_000;

/** Sanitizes opt-in Claude Code OTLP logs into metadata-only, project-scoped task records. */
export class ClaudeCodeOtelCollector {
  private readonly eventIds = new Set<string>();
  private readonly acceptedEvents: Event[] = [];
  private pendingEvents: Event[] = [];
  private accepted = 0;
  private skipped = 0;

  ingest(payload: unknown): { accepted: number; skipped: number } {
    const root = object(payload);
    if (!root || !Array.isArray(root.resourceLogs)) throw new Error('Expected an OTLP resourceLogs payload');
    let seen = 0;
    for (const resourceLogValue of root.resourceLogs) {
      const resourceLog = object(resourceLogValue);
      if (!resourceLog) continue;
      const resourceAttributes = attributes(object(resourceLog.resource)?.attributes);
      const scopeLogs = Array.isArray(resourceLog.scopeLogs) ? resourceLog.scopeLogs : [];
      for (const scopeLogValue of scopeLogs) {
        const scopeLog = object(scopeLogValue);
        if (!scopeLog || !Array.isArray(scopeLog.logRecords)) continue;
        for (const logRecordValue of scopeLog.logRecords) {
          seen += 1;
          if (seen > maximumLogRecords) throw new Error('OTLP export exceeds the 10000 log record limit');
          const logRecord = object(logRecordValue);
          const event = logRecord && readEvent(logRecord, resourceAttributes);
          if (!event) {
            this.skipped += 1;
            continue;
          }
          const identity = [
            event.sessionId,
            event.promptId ?? 'session',
            event.name,
            event.sourceEventId ?? '',
            event.sequence,
            event.timestampMs ?? '',
            event.model ?? '',
          ].join('\u0000');
          if (this.eventIds.has(identity)) {
            this.skipped += 1;
            continue;
          }
          this.eventIds.add(identity);
          if (this.acceptedEvents.length >= maximumLogRecords) {
            throw new Error('Collector session exceeds the 10000 accepted event limit');
          }
          this.acceptedEvents.push(event);
          this.pendingEvents.push(event);
          this.accepted += 1;
        }
      }
    }
    return { accepted: this.accepted, skipped: this.skipped };
  }

  records(): ExternalExecutionRecordV1[] {
    return this.acceptedEvents.map(toExecutionRecord);
  }

  /** Return immutable event records once so retried OTLP exports cannot conflict with later updates. */
  takeRecords(): ExternalExecutionRecordV1[] {
    const pending = this.pendingEvents;
    this.pendingEvents = [];
    return pending.map(toExecutionRecord);
  }
}

function toExecutionRecord(event: Event): ExternalExecutionRecordV1 {
  const taskId = event.promptId
    ? `claude-${event.sessionId}-prompt-${event.promptId}`
    : `claude-${event.sessionId}-session`;
  const identity = [event.sessionId, event.promptId ?? 'session', event.name,
    event.sourceEventId ?? '', event.sequence, event.timestampMs ?? '', event.model ?? ''].join('\u0000');
  const eventId = stableHash(identity);
  const eventStart = event.timestampMs === null || event.durationMs === null
    ? event.timestampMs
    : event.timestampMs - event.durationMs;
  const modelEvent = ['api_request', 'api_error', 'api_refusal'].includes(event.name);
  const status = event.name === 'api_error'
    ? 'failed'
    : event.name === 'tool_result'
      ? event.success === true ? 'completed' : event.success === false ? 'failed' : 'unknown'
      : modelEvent ? 'completed' : 'unknown';
  const kind = modelEvent ? 'model_invocation' : event.name === 'tool_result' ? 'tool_invocation' : 'step';
  const childId = `${kind}-${eventId}`;
  const spans: ExternalExecutionRecordV1['spans'] = [
    {
      id: taskId,
      kind: 'task',
      status: 'unknown',
      started_at_ms: eventStart,
      ended_at_ms: event.timestampMs,
      requested_model: null,
      reported_model: null,
      charge_ref: null,
    },
    {
      id: childId,
      kind,
      status,
      started_at_ms: eventStart,
      ended_at_ms: event.timestampMs,
      requested_model: null,
      reported_model: modelEvent ? event.model : null,
      charge_ref: null,
    },
  ];
  const links: ExternalExecutionRecordV1['links'] = [{ from: taskId, to: childId, kind: 'contains' }];
  const requestEvent = event.name === 'api_request';
  const failedRequest = event.name === 'api_error';
  const retryCount = failedRequest ? Math.max(0, (event.attempts ?? 1) - 1) : 0;
  if (modelEvent) {
    const attemptId = `attempt-${eventId}`;
    spans.push({
      id: attemptId,
      kind: 'attempt',
      status,
      started_at_ms: eventStart,
      ended_at_ms: event.timestampMs,
      requested_model: null,
      reported_model: null,
      charge_ref: null,
    });
    links.push({ from: childId, to: attemptId, kind: 'contains' });
  }
  const cost = requestEvent ? event.costNanos : null;
  const usage = requestEvent ? {
    input_tokens: event.inputTokens,
    output_tokens: event.outputTokens,
    cache_read_tokens: event.cacheReadTokens,
    cache_creation_tokens: event.cacheCreationTokens,
  } : {
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    cache_creation_tokens: null,
  };
  return {
    schema_version: 1,
    source: 'claude-code-otel',
    record_id: `cc-otel-event-${eventId}`,
    task_id: taskId,
    coverage: 'partial',
    spans,
    links,
    outcomes: [],
    external_usage: {
      authority: 'agent_reported_estimate',
      agent_version: event.agentVersion,
      request_count: modelEvent ? 1 : 0,
      retry_count: retryCount,
      ...usage,
      cost_nanos: cost,
      currency: cost === null ? null : 'USD',
    },
  };
}

function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(value.charCodeAt(index))) * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function readEvent(logRecord: Record<string, unknown>, resourceAttributes: Map<string, unknown>): Event | null {
  const recordAttributes = attributes(logRecord.attributes);
  const merged = new Map([...resourceAttributes, ...recordAttributes]);
  const nameValue = scalar(merged.get('event.name')) ?? scalar(logRecord.eventName) ?? scalar(logRecord.body);
  const name = normalizeEventName(nameValue);
  const sessionId = safeId(scalar(merged.get('session.id')));
  if (!name || !sessionId) return null;
  const timestampMs = timestamp(scalar(merged.get('event.timestamp')))
    ?? nanosToMillis(scalar(logRecord.timeUnixNano))
    ?? nanosToMillis(scalar(logRecord.observedTimeUnixNano));
  const sequence = String(safeCounter(scalar(merged.get('event.sequence'))) ?? timestampMs ?? 0);
  const model = safeLabel(scalar(merged.get('model')));
  const attempts = safeCounter(scalar(merged.get('attempt')));
  return {
    name,
    sequence,
    timestampMs,
    durationMs: safeCounter(scalar(merged.get('duration_ms'))),
    sessionId,
    promptId: safeId(scalar(merged.get('prompt.id'))),
    sourceEventId: safeId(scalar(merged.get('client_request_id')))
      ?? safeId(scalar(merged.get('request_id')))
      ?? safeId(scalar(merged.get('tool_use_id'))),
    agentVersion: safeLabel(scalar(resourceAttributes.get('service.version'))),
    model,
    success: parseBoolean(scalar(merged.get('success'))),
    attempts,
    inputTokens: safeQuantity(scalar(merged.get('input_tokens'))),
    outputTokens: safeQuantity(scalar(merged.get('output_tokens'))),
    cacheReadTokens: safeQuantity(scalar(merged.get('cache_read_tokens'))),
    cacheCreationTokens: safeQuantity(scalar(merged.get('cache_creation_tokens'))),
    costNanos: costNanos(merged),
  };
}

function normalizeEventName(value: unknown): EventName | null {
  if (typeof value !== 'string') return null;
  const suffix = value.startsWith('claude_code.') ? value.slice('claude_code.'.length) : value;
  return supportedEvents.has(suffix as EventName) ? suffix as EventName : null;
}

function attributes(value: unknown): Map<string, unknown> {
  const result = new Map<string, unknown>();
  if (!Array.isArray(value)) return result;
  for (const item of value) {
    const entry = object(item);
    if (!entry || typeof entry.key !== 'string') continue;
    result.set(entry.key, scalar(entry.value));
  }
  return result;
}

function scalar(value: unknown): unknown {
  const item = object(value);
  if (!item) return value;
  for (const key of ['stringValue', 'intValue', 'doubleValue', 'boolValue']) {
    if (key in item) return item[key];
  }
  return undefined;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > 64 || !/^[A-Za-z0-9._:-]+$/.test(value)) return null;
  return value;
}

function safeLabel(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200 || !/^[A-Za-z0-9._:/-]+$/.test(value)) return null;
  return value;
}

function safeQuantity(value: unknown): string | null {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === 'string' && /^\d{1,38}$/.test(text) ? text : null;
}

function safeCounter(value: unknown): number | null {
  const text = safeQuantity(value);
  if (text === null) return null;
  const count = Number(text);
  return Number.isSafeInteger(count) ? count : null;
}

function parseBoolean(value: unknown): boolean | null {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isSafeInteger(time) && time >= 0 ? time : null;
}

function nanosToMillis(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,30}$/.test(value)) return null;
  const time = BigInt(value) / 1_000_000n;
  return time <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(time) : null;
}

function costNanos(attributes: Map<string, unknown>): string | null {
  const micros = safeQuantity(scalar(attributes.get('cost_usd_micros')));
  if (micros !== null) return (BigInt(micros) * 1_000n).toString();
  const value = scalar(attributes.get('cost_usd'));
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(String(value));
  if (!match) return null;
  return (BigInt(match[1]) * 1_000_000_000n + BigInt((match[2] ?? '').padEnd(9, '0') || '0')).toString();
}
