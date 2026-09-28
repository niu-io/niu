/** First-party, metadata-only task adapter for agents that send model calls through Niu. */

import { NiuCollectorClient, type ExecutionReceipt, type TenantScope } from './admin.js';
import {
  NiuAPIError,
  NiuClient,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
  type ChatStreamRequest,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type RequestOptions,
  type NiuCredentialHeader,
  type ResponsesRequest,
  type ResponsesResponse,
} from './index.js';
import {
  NiuExecutionRecorder,
  type ExecutionCoverage,
  type ExecutionOutcomeResult,
  type ExecutionSpanStatus,
} from './execution.js';

export type NiuAgentAdapterOptions = {
  /** Project-scoped inference key. It is sent only to the Niu API base. */
  apiKey: string;
  /** Defaults to Authorization: Bearer; x-niu-api-key keeps provider auth separate. */
  credentialHeader?: NiuCredentialHeader;
  /** Collector credential issued with purpose "execution" for this scope. */
  collectorToken: string;
  scope: TenantScope;
  /** Defaults to http://localhost:2555/v1. */
  apiBaseURL?: string;
  /** Defaults to http://localhost:2555/admin/v1. */
  adminBaseURL?: string;
  /** Defaults to niu-javascript-sdk. Keep names free of customer content. */
  source?: string;
  fetch?: typeof globalThis.fetch;
  defaultHeaders?: HeadersInit;
  /** Injected clock and ID source make adapter records deterministic in tests. */
  now?: () => number;
  createId?: () => string;
};

export type NiuAgentTaskOptions = {
  taskId?: string;
  recordId?: string;
  /** Defaults to partial because unwrapped agent actions cannot be observed. */
  coverage?: ExecutionCoverage;
};

export type AgentCallOptions = RequestOptions & {
  parentSpanId?: string;
  /** Stable ID for this model invocation, useful as a later fallback source. */
  executionSpanId?: string;
  /** Previous model invocation replaced by this explicitly selected fallback. */
  fallbackFromSpanId?: string;
};
export type AgentRetryOptions = { maxAttempts?: number; parentSpanId?: string };
export type ValidationResult = boolean | ExecutionOutcomeResult;

export class NiuAgentAdapter {
  private readonly options: NiuAgentAdapterOptions;

  constructor(options: NiuAgentAdapterOptions) {
    if (!options.apiKey.trim()) throw new Error('apiKey is required');
    if (!options.collectorToken.trim()) throw new Error('collectorToken is required');
    this.options = options;
  }

  /** Start a local task scope. Finish it to submit metadata to the scoped collector. */
  createTask(options: NiuAgentTaskOptions = {}): NiuAgentTask {
    return new NiuAgentTask(this.options, options);
  }
}

export class NiuAgentTask {
  readonly taskId: string;
  private readonly recorder: NiuExecutionRecorder;
  private readonly collector: NiuCollectorClient;
  private readonly apiKey: string;
  private readonly credentialHeader: NiuCredentialHeader | undefined;
  private readonly apiBaseURL: string | undefined;
  private readonly fetcher: typeof globalThis.fetch | undefined;
  private readonly defaultHeaders: HeadersInit;
  private readonly createId: () => string;
  private finalRecord: ReturnType<NiuExecutionRecorder['export']> | null = null;

  constructor(adapter: NiuAgentAdapterOptions, options: NiuAgentTaskOptions = {}) {
    this.createId = adapter.createId ?? randomId;
    this.taskId = options.taskId ?? this.createId();
    const headers = new Headers(adapter.defaultHeaders);
    headers.set('x-niu-task-id', this.taskId);
    this.defaultHeaders = headers;
    this.apiKey = adapter.apiKey;
    this.credentialHeader = adapter.credentialHeader;
    this.apiBaseURL = adapter.apiBaseURL;
    this.fetcher = adapter.fetch;
    this.recorder = new NiuExecutionRecorder({
      source: adapter.source ?? 'niu-javascript-sdk',
      recordId: options.recordId ?? this.createId(),
      taskId: this.taskId,
      coverage: options.coverage ?? 'partial',
      now: adapter.now,
      createId: this.createId,
    });
    this.collector = new NiuCollectorClient({
      collectorToken: adapter.collectorToken,
      scope: adapter.scope,
      baseURL: adapter.adminBaseURL,
      fetch: adapter.fetch,
    });
  }

  setCoverage(coverage: ExecutionCoverage): void {
    this.recorder.setCoverage(coverage);
  }

  withAgent<T>(operation: (spanId: string) => T | Promise<T>, parentSpanId?: string): Promise<T> {
    return this.recorder.withSpan('agent', { parentId: parentSpanId ?? this.taskId }, operation);
  }

  withStep<T>(operation: (spanId: string) => T | Promise<T>, parentSpanId?: string): Promise<T> {
    return this.recorder.withSpan('step', { parentId: parentSpanId ?? this.taskId }, operation);
  }

  /** Records timing and status only; arguments and tool output are never retained. */
  withTool<T>(operation: (spanId: string) => T | Promise<T>, parentSpanId?: string): Promise<T> {
    return this.recorder.withSpan('tool_invocation', { parentId: parentSpanId ?? this.taskId }, operation);
  }

  /** Record a retry chain while leaving the retry policy with the caller. */
  async retry<T>(
    operation: (context: { spanId: string; attempt: number }) => T | Promise<T>,
    options: AgentRetryOptions = {},
  ): Promise<T> {
    const maxAttempts = options.maxAttempts ?? 2;
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
      throw new RangeError('maxAttempts must be between 1 and 100');
    }
    let previousAttempt: string | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const spanId = this.recorder.startSpan('attempt', {
        parentId: options.parentSpanId ?? this.taskId,
        ...(previousAttempt ? { cause: { from: previousAttempt, kind: 'retries' as const } } : {}),
      });
      try {
        const result = await operation({ spanId, attempt });
        this.recorder.endSpan(spanId, 'completed');
        return result;
      } catch (error) {
        const status = spanStatus(error);
        this.recorder.endSpan(spanId, status);
        if (status === 'cancelled' || attempt === maxAttempts) throw error;
        previousAttempt = spanId;
      }
    }
    throw new Error('Retry policy ended without a result');
  }

  /** Record validator evidence without storing the checked value or error text. */
  async validate(
    check: () => ValidationResult | Promise<ValidationResult>,
    parentSpanId?: string,
  ): Promise<ValidationResult> {
    const spanId = this.recorder.startSpan('validation', { parentId: parentSpanId ?? this.taskId });
    try {
      const value = await check();
      const result = typeof value === 'boolean' ? (value ? 'accepted' : 'rejected') : value;
      this.recorder.addOutcome({
        span_id: spanId,
        evidence_id: this.createId(),
        authority: 'deterministic_validator',
        result,
      });
      this.recorder.endSpan(spanId, 'completed');
      return value;
    } catch (error) {
      this.recorder.endSpan(spanId, spanStatus(error));
      throw error;
    }
  }

  /** An agent's self-report remains distinct from deterministic or human evidence. */
  agentClaim(result: ValidationResult = 'accepted', evidenceId = this.createId()): void {
    this.addOutcome('agent_claim', result, evidenceId);
  }

  humanAcceptance(result: ValidationResult, evidenceId = this.createId()): void {
    this.addOutcome('human_acceptance', result, evidenceId);
  }

  chatCompletions(request: ChatCompletionRequest, options: AgentCallOptions = {}): Promise<ChatCompletionResponse> {
    return this.modelCall(request.model, options, client => client.chat.completions(request, options), result => result.model);
  }

  responses(request: ResponsesRequest, options: AgentCallOptions = {}): Promise<ResponsesResponse> {
    return this.modelCall(request.model, options, client => client.responses.create(request, options), result => result.model);
  }

  embeddings(request: EmbeddingRequest, options: AgentCallOptions = {}): Promise<EmbeddingResponse> {
    return this.modelCall(request.model, options, client => client.embeddings.create(request, options), result => result.model);
  }

  async *chatStream(request: ChatStreamRequest, options: AgentCallOptions = {}): AsyncGenerator<unknown> {
    const spanId = this.recorder.startSpan('model_invocation', {
      parentId: options.parentSpanId ?? this.taskId,
      requestedModel: request.model,
      ...(options.executionSpanId ? { id: options.executionSpanId } : {}),
      ...(options.fallbackFromSpanId ? { cause: { from: options.fallbackFromSpanId, kind: 'fallbacks' as const } } : {}),
    });
    let status: Exclude<ExecutionSpanStatus, 'running'> = 'cancelled';
    try {
      for await (const event of this.clientFor(spanId).chat.stream(request, options)) {
        const reportedModel = responseModel(event);
        if (reportedModel) this.recorder.setModelEvidence(spanId, { reportedModel });
        yield event;
      }
      status = 'completed';
    } catch (error) {
      this.recordErrorAttempt(spanId, error);
      status = spanStatus(error);
      throw error;
    } finally {
      this.recorder.endSpan(spanId, status);
    }
  }

  /** Finalize and submit once. If the network call fails, call report() again. */
  async finish(status: Exclude<ExecutionSpanStatus, 'running'> = 'completed', options?: RequestOptions): Promise<ExecutionReceipt> {
    if (!this.finalRecord) {
      this.recorder.finish(status);
      this.finalRecord = this.recorder.export();
    }
    return this.collector.reportExecution(this.finalRecord, options);
  }

  /** Retry an idempotent metadata submission after a transport or server error. */
  async report(options?: RequestOptions): Promise<ExecutionReceipt> {
    if (!this.finalRecord) throw new Error('Finish the task before reporting its record');
    return this.collector.reportExecution(this.finalRecord, options);
  }

  export(): ReturnType<NiuExecutionRecorder['export']> {
    return this.recorder.export();
  }

  private async modelCall<T>(
    requestedModel: string,
    options: AgentCallOptions,
    call: (client: NiuClient) => Promise<T>,
    reportedModel: (result: T) => string | undefined,
  ): Promise<T> {
    const spanId = this.recorder.startSpan('model_invocation', {
      parentId: options.parentSpanId ?? this.taskId,
      requestedModel,
      ...(options.executionSpanId ? { id: options.executionSpanId } : {}),
      ...(options.fallbackFromSpanId ? { cause: { from: options.fallbackFromSpanId, kind: 'fallbacks' as const } } : {}),
    });
    try {
      const result = await call(this.clientFor(spanId));
      const model = reportedModel(result);
      if (model) this.recorder.setModelEvidence(spanId, { reportedModel: model });
      this.recorder.endSpan(spanId, 'completed');
      return result;
    } catch (error) {
      this.recordErrorAttempt(spanId, error);
      this.recorder.endSpan(spanId, spanStatus(error));
      throw error;
    }
  }

  private clientFor(spanId: string): NiuClient {
    const fetcher = this.fetcher ?? globalThis.fetch.bind(globalThis);
    return new NiuClient({
      apiKey: this.apiKey,
      credentialHeader: this.credentialHeader,
      baseURL: this.apiBaseURL,
      defaultHeaders: this.defaultHeaders,
      fetch: async (input, init) => {
        const response = await fetcher(input, init);
        this.recordAttempt(spanId, response.headers.get('x-niu-attempt-id'));
        return response;
      },
    });
  }

  private recordErrorAttempt(spanId: string, error: unknown): void {
    if (error instanceof NiuAPIError) this.recordAttempt(spanId, error.attemptId);
  }

  private recordAttempt(spanId: string, attemptId: string | null | undefined): void {
    if (!attemptId) return;
    this.recorder.setModelEvidence(spanId, { chargeRef: attemptId });
  }

  private addOutcome(
    authority: 'agent_claim' | 'human_acceptance',
    value: ValidationResult,
    evidenceId: string,
  ): void {
    const result = typeof value === 'boolean' ? (value ? 'accepted' : 'rejected') : value;
    this.recorder.addOutcome({ span_id: this.taskId, evidence_id: evidenceId, authority, result });
  }
}

function responseModel(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const model = (value as { model?: unknown }).model;
  return typeof model === 'string' ? model : undefined;
}

function spanStatus(error: unknown): Exclude<ExecutionSpanStatus, 'running'> {
  return error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed';
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
