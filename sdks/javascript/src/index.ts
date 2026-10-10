export type ChatMessage = {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  content: string | Array<Record<string, unknown>> | null;
  [key: string]: unknown;
};

export type ChatFunctionTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
};

export type ChatToolChoice = 'none' | 'auto' | 'required' | {
  type: 'function';
  function: { name: string };
};

export type ChatResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean; description?: string } };

export type ChatToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type ChatCompletionResponse = {
  id: string;
  object: string;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage & { tool_calls?: ChatToolCall[]; refusal?: string | null };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens?: number };
};

export { NiuExecutionRecorder } from './execution.js';
export type {
  ExecutionCoverage,
  ExecutionLinkKind,
  ExecutionLinkV1,
  ExecutionOutcomeAuthority,
  ExecutionOutcomeResult,
  ExecutionOutcomeV1,
  ExternalUsageV1,
  ExecutionRecordV1,
  ExecutionRecorderOptions,
  ExecutionSpanKind,
  ExecutionSpanStatus,
  ExecutionSpanV1,
  ModelExecutionEvidence,
  StartExecutionSpanOptions,
} from './execution.js';

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ChatFunctionTool[];
  tool_choice?: ChatToolChoice;
  response_format?: ChatResponseFormat;
  stream?: false;
  [key: string]: unknown;
};

export type ChatStreamRequest = Omit<ChatCompletionRequest, 'stream'> & {
  model: string;
  messages: ChatMessage[];
  stream?: true;
};

export type Model = {
  id: string;
  object: 'model' | string;
  owned_by?: string;
  customer_pricing?: { revision: string; currency: string; unit: 'nanounits_per_million_tokens'; prompt_rate: string; completion_rate: string } | null;
};

export type ModelList = {
  object?: 'list' | string;
  data: Model[];
};

export type EmbeddingRequest = {
  model: string;
  input: string | string[];
  encoding_format?: 'float' | 'base64';
  dimensions?: number;
  user?: string;
};

export type EmbeddingResponse = {
  object: 'list' | string;
  data: Array<{
    object?: 'embedding' | string;
    embedding: number[] | string;
    index?: number;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens?: number;
    completion_tokens?: number;
  };
};

export type ResponsesRequest = {
  model: string;
  input: string;
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  metadata?: Record<string, string>;
  user?: string;
  stream?: false;
};

export type ResponsesOutputText = {
  type: 'output_text';
  text: string;
  annotations?: unknown[];
} | {
  type: 'refusal';
  refusal: string;
};

export type ResponsesMessage = {
  id?: string;
  type: 'message';
  role: 'assistant';
  status?: string;
  content: ResponsesOutputText[];
};

export type ResponsesReasoning = {
  id?: string;
  type: 'reasoning';
  summary?: unknown[];
};

export type ResponsesResponse = {
  id: string;
  object: 'response';
  status: 'completed' | 'incomplete';
  model: string;
  output: Array<ResponsesMessage | ResponsesReasoning>;
  usage?: { input_tokens: number; output_tokens: number; total_tokens?: number };
};

export type NiuClientOptions = {
  apiKey: string;
  /** Defaults to Authorization: Bearer. Use x-niu-api-key to preserve a separate provider Authorization header. */
  credentialHeader?: NiuCredentialHeader;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
  defaultHeaders?: HeadersInit;
};

export type NiuCredentialHeader = 'authorization' | 'x-niu-api-key';

export type ImageIngestionConsentInput = { source_id: string; group_intent_id: string; authorization_id: string; valid_for_seconds: number; confirm_ingestion: true };
export type ImageReadinessObservation = { read_id: string; status: 'pending' | 'succeeded' | 'failed'; asset_status: 'Active' | 'Processing' | 'Failed' | null; reason: string | null; duration_ms: number | null; observed_at: string | null; reuse_available: false };
export type ImageIngestionConsentStatus = { consent_id: string; expires_at: string; status: 'consented' | 'expired' | 'revoked' | 'pending' | 'accepted' | 'uncertain'; reason: 'invalid_configuration' | 'destination_rejected' | 'unavailable' | 'transport' | 'timeout' | 'response_limit' | 'invalid_response' | null; duration_ms: number | null; observed_at: string | null; consent_revoked: boolean; dispatch_available: boolean };

export class NiuAPIError extends Error {
  readonly status: number;
  readonly requestId?: string;
  readonly attemptId?: string;
  readonly operationId?: string;
  readonly responseBody: unknown;

  constructor(status: number, responseBody: unknown, requestId?: string, attemptId?: string, operationId?: string) {
    super(errorMessage(responseBody, status));
    this.name = 'NiuAPIError';
    this.status = status;
    this.responseBody = responseBody;
    this.requestId = requestId;
    this.attemptId = attemptId;
    this.operationId = operationId;
  }
}

export type VideoResultAvailability = { video: 'available' | 'missing' | 'unavailable'; last_frame: 'available' | 'missing' | 'unavailable' };

export type VideoLifecycleTiming = {
  source: 'gateway_observation';
  submitted_unix_ms: number | null;
  observations: Array<{ status: 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown'; observed_unix_ms: number }>;
  conflicting_terminal: boolean;
};

export type VideoTransportTimings = {
  /** First gateway observations, not exact Supplier queue/run transitions. */
  lifecycle?: VideoLifecycleTiming;
  data: Array<{ phase: 'submission' | 'query'; started_unix_ms: number; elapsed_ms: number; outcome: 'received' | 'unavailable' }>;
  has_more: boolean;
};

/** Configured video controls, not a quote or admission guarantee. */
export type VideoControl =
  | { kind: 'integer'; minimum: number; maximum: number; default: number | null }
  | { kind: 'choice'; values: string[]; default: string | null }
  | { kind: 'boolean'; default: boolean | null };
export type VideoModel = {
  object: 'video.model'; id: string; mode: 'owner_funded' | 'customer';
  input_types: ['text'] | ['text', 'image_url']; text: { maximum_items: number; maximum_bytes: number };
  requires_image?: boolean;
  image_url?: {
    maximum_items: number; maximum_bytes: number; https: false;
    data_mime_types: Array<'image/png' | 'image/jpeg' | 'image/webp'>;
    roles: string[]; role_required: boolean; requires_text: true;
    maximum_width: number; maximum_height: number; maximum_decoded_bytes: number;
  };
  maximum_body_bytes: number; maximum_content_items: number;
  controls: Record<string, VideoControl>; required_controls: string[]; exclusive_controls: string[][];
  output: { specifications: Array<{ resolution: string; ratio: string; width: number; height: number }>; meter: 'video_tokens'; estimator: 'SeedancePixelsV1' };
};
export type VideoModelList = { object: 'list'; data: VideoModel[] };

export type VideoCreateRequest = {
  model: string;
  content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string }; role?: string }>;
  [control: string]: unknown;
};

export type VideoEffectiveOutput = {
  specification: { resolution: string; ratio: string; width: number; height: number };
  duration_seconds: number; frames_per_second: number | null;
  schema_revision: string; estimator: 'SeedancePixelsV1' | 'OutputSecondsV1'; estimator_revision: string;
};

export type VideoJobBilling = {
  mode: 'owner_funded' | 'customer' | 'unavailable';
  state: 'owner_funded' | 'unavailable' | 'reserved' | 'awaiting_usage' | 'awaiting_settlement' | 'settled' | 'reconciliation_required';
  currency: string | null; reserved_nanos: string | null; charge_nanos: string | null;
  usage: { meter: string; quantity: { numerator: string; denominator: string } } | null;
  settled_usage?: { meter: string; quantity: { numerator: string; denominator: string }; billable_quantity: { numerator: string; denominator: string }; provenance: 'Reported' } | null;
  bound_exceeded: boolean | null;
  effective_output: VideoEffectiveOutput | null;
  estimate: {
    meter: string; quantity: { numerator: string; denominator: string }; provenance: 'Estimate';
    currency: string | null; amount_nanos: string | null;
  } | null;
  price: {
    meter: string; amount_units: string; decimal_places: number;
    per_quantity: { numerator: string; denominator: string };
    minimum_quantity: { numerator: string; denominator: string };
    rounding: 'Down' | 'Up' | 'HalfEven'; resolution: string; reference_video: boolean;
    effective_from: string; effective_until: string | null;
    discounts: Array<{ multiplier: { numerator: string; denominator: string }; stacking: 'Exclusive' | 'Multiply'; effective_from: string; effective_until: string | null }>;
  } | null;
};

export type VideoEstimate = {
  object: 'video.estimate'; model: string; mode: 'owner_funded' | 'customer';
  effective_output: VideoEffectiveOutput;
  estimate: NonNullable<VideoJobBilling['estimate']>;
  maximum_charge_nanos: string | null; selected_at: string | null;
};

export type VideoJobState = {
  id: string;
  object: 'video.job';
  model: string;
  status: 'submission_unknown' | 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'reconciliation_required';
};

export type VideoJobHistory = {
  data: Array<VideoJobState & { created_at_ms: string }>;
  has_more: boolean; next_before: string | null;
};
export type VideoJobHistoryQuery = { before?: string; limit?: number };

export class NiuClient {
  readonly imageSources: {
    prepare: (input: { image: string; valid_for_seconds: number }, options?: RequestOptions) => Promise<{ data: { source_id: string; retained: true; retention_seconds: number } }>;
    erase: (id: string, options?: RequestOptions) => Promise<void>;
  };
  readonly imageIngestions: {
    list: (query?: { before?: string }, options?: RequestOptions) => Promise<{ data: ImageIngestionConsentStatus[]; next_cursor: string | null }>;
    readiness: {
      refresh: (id: string, readId: string, options?: RequestOptions) => Promise<{ data: ImageReadinessObservation }>;
      retrieve: (id: string, readId: string, options?: RequestOptions) => Promise<{ data: ImageReadinessObservation }>;
    };
    dispatch: (id: string, options?: RequestOptions) => Promise<{ data: ImageIngestionConsentStatus }>;
    prepare: (id: string, input: ImageIngestionConsentInput, options?: RequestOptions) => Promise<{ data: ImageIngestionConsentStatus }>;
    retrieve: (id: string, options?: RequestOptions) => Promise<{ data: ImageIngestionConsentStatus }>;
    revoke: (id: string, options?: RequestOptions) => Promise<void>;
  };
  readonly video: { models: { list: (options?: RequestOptions) => Promise<VideoModelList> }; estimate: (request: VideoCreateRequest, options?: RequestOptions) => Promise<VideoEstimate>; jobs: { results: { status: (id: string, options?: RequestOptions) => Promise<VideoResultAvailability>; retrieve: (id: string, kind: 'video' | 'last_frame', options?: RequestOptions) => Promise<Response>; delete: (id: string, options?: RequestOptions) => Promise<{ deleted: true }> }; list: (query?: VideoJobHistoryQuery, options?: RequestOptions) => Promise<VideoJobHistory>; billing: (id: string, options?: RequestOptions) => Promise<VideoJobBilling>; timings: (id: string, options?: RequestOptions) => Promise<VideoTransportTimings>; refresh: (id: string, options?: RequestOptions) => Promise<VideoJobState>; create: (request: VideoCreateRequest, options?: VideoCreateOptions) => Promise<VideoJobState>; retrieve: (id: string, options?: RequestOptions) => Promise<VideoJobState> } };
  readonly models: { list: (options?: RequestOptions) => Promise<ModelList> };
  readonly embeddings: { create: (request: EmbeddingRequest, options?: RequestOptions) => Promise<EmbeddingResponse> };
  readonly responses: { create: (request: ResponsesRequest, options?: RequestOptions) => Promise<ResponsesResponse>; stream: (request: ResponsesRequest, options?: RequestOptions) => AsyncGenerator<unknown> };
  readonly chat: {
    completions: (request: ChatCompletionRequest, options?: RequestOptions) => Promise<ChatCompletionResponse>;
    stream: (request: ChatStreamRequest, options?: RequestOptions) => AsyncGenerator<unknown>;
  };

  private readonly apiKey: string;
  private readonly credentialHeader: NiuCredentialHeader;
  private readonly baseURL: string;
  private readonly requestFetch: typeof globalThis.fetch;
  private readonly defaultHeaders: HeadersInit;

  constructor(options: NiuClientOptions) {
    if (!options.apiKey.trim()) throw new Error('apiKey is required');
    this.apiKey = options.apiKey;
    this.credentialHeader = options.credentialHeader ?? 'authorization';
    this.baseURL = (options.baseURL ?? 'http://localhost:2555/v1').replace(/\/+$/, '');
    this.requestFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = options.defaultHeaders ?? {};

    this.video = { models: { list: (requestOptions) => this.request('/video/models', undefined, requestOptions) }, estimate: (request, requestOptions) => this.request('/video/estimate', request, requestOptions), jobs: { results: { status: (id, requestOptions) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new TypeError('A Niu video job reference is required');
      return this.request(`/video/jobs/${encodeURIComponent(id)}/results`,undefined,requestOptions);
    }, retrieve: (id, kind, requestOptions = {}) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !['video','last_frame'].includes(kind)) throw new TypeError('A Niu video job reference and result kind are required');
      return this.send(`/video/jobs/${encodeURIComponent(id)}/results/${kind}`,undefined,requestOptions,'video/mp4,video/webm,image/png,image/jpeg');
    }, delete: async (id, requestOptions = {}) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new TypeError('A Niu video job reference is required');
      return await readPayload(await this.send(`/video/jobs/${encodeURIComponent(id)}/results`,undefined,requestOptions,'application/json','DELETE')) as { deleted: true };
    } }, list: (query = {}, requestOptions) => {
      if (query.limit !== undefined && (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100)) throw new TypeError('Video history limit must be an integer from 1 to 100');
      if (query.before !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.before)) throw new TypeError('A Niu video history cursor is required');
      const parameters = new URLSearchParams();
      if (query.before !== undefined) parameters.set('before',query.before);
      if (query.limit !== undefined) parameters.set('limit',String(query.limit));
      return this.request(`/video/jobs${parameters.size ? `?${parameters}` : ''}`, undefined, requestOptions);
    }, billing: (id, requestOptions) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new TypeError('A Niu video job reference is required');
      return this.request(`/video/jobs/${encodeURIComponent(id)}/billing`, undefined, requestOptions);
    }, timings: (id, requestOptions) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new TypeError('A Niu video job reference is required');
      return this.request(`/video/jobs/${encodeURIComponent(id)}/timings`, undefined, requestOptions);
    }, refresh: (id, requestOptions) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new TypeError('A Niu video job reference is required');
      return this.request(`/video/jobs/${encodeURIComponent(id)}/refresh`, {}, requestOptions);
    }, create: (request, requestOptions) => this.request('/video/jobs', request, requestOptions), retrieve: (id, requestOptions) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new TypeError('A Niu video job reference is required');
      }
      return this.request(`/video/jobs/${encodeURIComponent(id)}`, undefined, requestOptions);
    } } };
    const ingestionPath = (id: string) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new TypeError('An image ingestion consent reference is required');
      return `/media/image-ingestions/${encodeURIComponent(id)}`;
    };
    this.imageSources = {
      prepare: (input, requestOptions) => {
        if (!input.image.startsWith('data:image/') || input.image.length > 12*1024*1024 || !Number.isInteger(input.valid_for_seconds) || input.valid_for_seconds < 1 || input.valid_for_seconds > 900) throw new TypeError('One inline image and retention from 1 to 900 seconds are required');
        return this.request('/media/image-sources', input, requestOptions);
      },
      erase: async (id, requestOptions = {}) => {
        ingestionPath(id);
        await this.send(`/media/image-sources/${encodeURIComponent(id)}`, undefined, requestOptions, 'application/json', 'DELETE');
      },
    };
    this.imageIngestions = {
      list: (query = {}, requestOptions) => {
        if (query.before !== undefined) ingestionPath(query.before);
        return this.request('/media/image-ingestions' + (query.before ? `?before=${encodeURIComponent(query.before)}` : ''), undefined, requestOptions);
      },
      readiness: {
        refresh: (id, readId, requestOptions) => {
          ingestionPath(readId);
          return this.request(`${ingestionPath(id)}/readiness/${encodeURIComponent(readId)}`, {}, requestOptions);
        },
        retrieve: (id, readId, requestOptions) => {
          ingestionPath(readId);
          return this.request(`${ingestionPath(id)}/readiness/${encodeURIComponent(readId)}`, undefined, requestOptions);
        },
      },
      dispatch: (id, requestOptions) => this.request(`${ingestionPath(id)}/dispatch`, {}, requestOptions),
      prepare: async (id, input, requestOptions = {}) => {
        const path = ingestionPath(id);
        for (const reference of [input.source_id, input.group_intent_id, input.authorization_id]) ingestionPath(reference);
        if (input.confirm_ingestion !== true || !Number.isInteger(input.valid_for_seconds) || input.valid_for_seconds < 1 || input.valid_for_seconds > 900) throw new TypeError('Confirmed ingestion requires a lifetime from 1 to 900 seconds');
        return await readPayload(await this.send(path, input, requestOptions, 'application/json', 'PUT')) as { data: ImageIngestionConsentStatus };
      },
      retrieve: (id, requestOptions) => this.request(ingestionPath(id), undefined, requestOptions),
      revoke: async (id, requestOptions = {}) => { await this.send(ingestionPath(id), undefined, requestOptions, 'application/json', 'DELETE'); },
    };
    this.models = { list: (requestOptions) => this.request('/models', undefined, requestOptions) };
    this.embeddings = {
      create: (request, requestOptions) => this.request('/embeddings', request, requestOptions),
    };
    this.responses = {
      create: (request, requestOptions) => {
        if ((request as { stream?: boolean }).stream === true) throw new Error('Use responses.stream() for streaming requests');
        return this.request('/responses', request, requestOptions);
      },
      stream: (request, requestOptions) => this.streamResponses(request, requestOptions),
    };
    this.chat = {
      stream: (request, requestOptions) => this.streamChat(request, requestOptions),
      completions: async (request, requestOptions) => {
        if ((request as { stream?: boolean }).stream === true) {
          throw new Error('Use chat.stream() for streaming requests');
        }
        return this.request('/chat/completions', request, requestOptions);
      },
    };
  }

  private async request<T>(
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const response = await this.send(path, body, options, 'application/json');
    return await readPayload(response) as T;
  }

  private async *streamResponses(request: ResponsesRequest, options: RequestOptions = {}): AsyncGenerator<unknown> {
    const response = await this.send('/responses', { ...request, stream: true }, options, 'text/event-stream');
    if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/event-stream' || !response.body) {
      await response.body?.cancel();
      throw new Error('Expected an event-stream response');
    }
    yield* parseChatStream(response.body, options.signal, true);
  }

  private async *streamChat(request: ChatStreamRequest, options: RequestOptions = {}): AsyncGenerator<unknown> {
    const response = await this.send('/chat/completions', {
      ...request,
      stream: true,
      stream_options: { ...(request.stream_options as Record<string, unknown> ?? {}), include_usage: true },
    }, options, 'text/event-stream');
    if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/event-stream' || !response.body) {
      await response.body?.cancel();
      throw new Error('Expected an event-stream response');
    }
    yield* parseChatStream(response.body, options.signal);
  }

  private async send(path: string, body: unknown, options: RequestOptions & { idempotencyKey?: string }, accept: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = body === undefined ? 'GET' : 'POST'): Promise<Response> {
    const headers = new Headers(this.defaultHeaders);
    if (options.idempotencyKey !== undefined) {
      if (path !== '/video/jobs' || method !== 'POST' || typeof options.idempotencyKey !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(options.idempotencyKey)) {
        throw new TypeError('idempotencyKey requires video creation and 1 to 128 visible ASCII characters');
      }
      headers.set('idempotency-key', options.idempotencyKey);
    }
    if (options.logPayloads !== undefined) {
      if (typeof options.logPayloads !== 'boolean') throw new TypeError('logPayloads must be a boolean');
      headers.set('x-niu-log-payloads', String(options.logPayloads));
    }
    if (this.credentialHeader === 'authorization') {
      headers.set('authorization', `Bearer ${this.apiKey}`);
    } else {
      headers.set('x-niu-api-key', this.apiKey);
    }
    headers.set('accept', accept);
    if (body !== undefined) headers.set('content-type', 'application/json');

    const response = await this.requestFetch(`${this.baseURL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    });
    if (!response.ok) {
      throw new NiuAPIError(
        response.status,
        await readPayload(response),
        response.headers.get('x-request-id') ?? response.headers.get('x-niu-operation-id') ?? undefined,
        response.headers.get('x-niu-attempt-id') ?? undefined,
        response.headers.get('x-niu-operation-id') ?? undefined,
      );
    }
    return response;
  }
}

export type VideoCreateOptions = RequestOptions & {
  /** Reuse with the same text-video document to recover the original submission. */
  idempotencyKey?: string;
};

export type RequestOptions = {
  signal?: AbortSignal;
  /** Override payload retention for this request. Metadata collection is unaffected. */
  logPayloads?: boolean;
};

function errorMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null) {
    const root = body as { error?: { message?: unknown }; message?: unknown };
    if (typeof root.error?.message === 'string') return root.error.message;
    if (typeof root.message === 'string') return root.message;
  }
  return `Niu API request failed with status ${status}`;
}


async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  try { return text ? JSON.parse(text) : undefined; } catch { return text; }
}

async function* parseChatStream(body: ReadableStream<Uint8Array>, signal?: AbortSignal, responses = false): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let line = '';
  let data = '';
  let skipLF = false;
  let eventSize = 0;
  let errorEvent = false;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const result = await reader.read();
      signal?.throwIfAborted();
      if (result.done) break;
      const text = decoder.decode(result.value, { stream: true });
      for (const char of text) {
        if (skipLF) { skipLF = false; if (char === '\n') continue; }
        eventSize += char.length;
        if (eventSize > 65_536) throw new Error('SSE event exceeds client buffer limit');
        if (char !== '\r' && char !== '\n') { line += char; continue; }
        skipLF = char === '\r';
        if (line === '') {
          signal?.throwIfAborted();
          eventSize = 0;
          if (errorEvent) throw new Error('Upstream returned an SSE error event');
          if (data !== '') {
            const event = data.slice(0, -1);
            data = '';
            if (event === '[DONE]') {
              if (responses) throw new Error('Responses stream ended without a terminal response');
              return;
            }
            const value: unknown = JSON.parse(event);
            if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid chat stream event');
            if ('error' in value) throw new Error(errorMessage(value, 200));
            if (responses && 'type' in value && value.type === 'response.failed') throw new Error('Upstream response failed');
            yield value;
            if (responses && 'type' in value && (value.type === 'response.completed' || value.type === 'response.incomplete')) return;
          }
          errorEvent = false;
        } else if (!line.startsWith(':')) {
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          let value = colon < 0 ? '' : line.slice(colon + 1);
          if (value.startsWith(' ')) value = value.slice(1);
          if (field === 'data') data += value + '\n';
          if (field === 'event') errorEvent = value === 'error';
        }
        line = '';
      }
    }
    throw new Error('Stream ended without a terminal event');
  } finally {
    signal?.removeEventListener('abort', abort);
    try { await reader.cancel(); } finally { reader.releaseLock(); }
  }
}

export { NiuAdminClient, NiuCollectorClient, chatBranchMessages } from './admin.js';
export type { OrdinaryAssetGroupDeletionConsentInput, OrdinaryAssetGroupDeletionConsentStatus, AssetManagementConfiguration, AssetManagementConfigurationInput, AssetOperationAuthorizationInput, AssetOperationAuthorization, OrdinaryAssetGroupInput, OrdinaryAssetGroupUpdateInput, OrdinaryAssetGroupUpdatePreparation, OrdinaryAssetGroupUpdateAudit, OrdinaryAssetGroupReadInput, OrdinaryAssetListingInput, OrdinaryAssetListing, OrdinaryAssetListingAudit, OrdinaryAssetLookupInput, OrdinaryAssetLookupAudit, OrdinaryAssetLookupResult } from './admin.js';
export type { CustomerInvoiceInput, CustomerInvoiceLine } from './admin.js';
export type { WorkspaceSpendingAccount, WorkspaceSpendingLimit, WorkspaceSpendingLimitRevision } from './admin.js';
export type { SupplierMediaOfferInput, SupplierMediaOfferModel, SupplierMediaRateModel, SupplierMediaRateRecord, SupplierMediaRateCard, CustomerMediaRateCard, CustomerMediaRateRecord, CustomerMediaRateModel, VideoOutputSchema, ExactMediaQuantity, MediaBillingDimensions } from './admin.js';
export type { GuardrailPreparationDenial } from './admin.js';
export type { WorkspaceKey, NiuAdminOptions, CustomerTariffInput, CustomerTariff, CustomerBalance, CustomerChargeReconciliation, CustomerTopupInput, CustomerTopup, CustomerPaymentMethods, CustomerBalanceTransaction, CustomerBilling, SupplierRateInput, SupplierOffer, SupplierOfferRevision, SupplierQualificationInput, SupplierOfferQualificationInput, NiuCollectorOptions, TenantScope, ChatResult, ChatTurn, ChatSession, ChatExport, ChatAttachment, GuardrailAccessRule, WorkspaceDetectorDescription, WorkspaceImageDetectorDescription, ImageDetectorPreviewInput, ImageDetectorPreviewResult, GuardrailPolicy, GuardrailPreview, GuardrailInputTest, GuardrailInputTestResult, GuardrailOutputTest, GuardrailOutputTestResult, RequestGuardrailDecision, SupplierAccountInput, SupplierAccount, QuotaObservation, QuotaWindow, ExecutionReceipt, GatewayActivityOutcome, GatewayTaskEvidence, GatewayActivityEntry, GatewayActivityPage, GatewayActivityQuery, GatewayActivityExportQuery, GatewayActivitySummary, GatewayChargeSummary, GatewayUsageSummary, RequestTiming, RequestFailure, RequestPayload } from './admin.js';

export { NiuAuthClient } from './auth.js';
export type { NiuAuthOptions, MemberSignIn, MemberSession } from './auth.js';

export type { BrandingSettings, BrandingColorToken, BrandingConfiguration } from './admin.js';

export type { PaymentIntegration } from './admin.js';

export type { KeySpendingAccount, KeySpendingLimitRevision } from './admin.js';

export type { KeyIpPolicy, KeyIpPolicyRevision } from './admin.js';

export type { KeyRequestRateLimit, KeyRequestRateLimitRevision } from './admin.js';

export type { KeyConcurrencyLimit, KeyConcurrencyLimitRevision } from './admin.js';

export type { KeyTokenUsageWindow } from './admin.js';

export type { KeyTokenRateLimit, KeyTokenRateLimitRevision } from './admin.js';

export type { ModelRoutePool, ModelRoutePoolCandidate, ModelRoutePoolInput, ModelRoutePoolRevision } from './admin.js';
