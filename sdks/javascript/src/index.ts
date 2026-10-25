export type { GenerationsVideoIntentReference } from './generations-sessions.js';
export type { ProviderDiscovery, ProviderIntegration, ProviderIntegrationType } from './admin.js';
export type { CustomerUnitDefinition, CustomerUnitPurchaseRule, CustomerUnitConfiguration, CustomerUnitDefinitionInput, CustomerUnitPurchaseRuleInput } from './admin.js';
export type { CustomerUnitQuote, CustomerUnitQuoteInput } from './admin.js';
export type { CustomerUnitGrant, CustomerUnitGrantInput } from './admin.js';
export type { CustomerUnitBalance } from './admin.js';
export type { CustomerUnitTextPrice, CustomerUnitTextTariff, CustomerUnitTextTariffInput } from './admin.js';
import { notifyResponse } from './response-metadata.js';
import { videoObservationQuery, type VideoQueryObservationPage, type VideoQueryObservationQuery } from './video-query-observations.js';
import type { ContextPriceTier } from './admin.js';
import { waitForVideoJob, type VideoWaitOptions } from './video-wait.js';
export type { VideoWaitOptions } from './video-wait.js';
import { normalizeVideoGeneration, type NiuVideoGenerationInput } from './video-generation.js';
import { createMediaAssetsClient } from './media-assets.js';
export type { MediaAssetObservation, MediaAssetGroupObservation, MediaAsset, MediaAssetGroup, MediaAssetOperation, MediaAssetMutation, MediaAssetMutationOptions, MediaAssetOperationInput, MediaAssetPreparationOptions, MediaAssetPage } from './media-assets.js';
export type { MediaVerificationSession, MediaVerificationInput, MediaVerificationLink } from './media-verification.js';
export type { NiuVideoGenerationInput } from './video-generation.js';
/** Buffered native Gemini text. Requires an explicitly declared static or managed gemini route. */
export type GenerateContentRequest = {
  contents: Array<{ role?: 'user' | 'model'; parts: Array<{ text: string }> }>;
  systemInstruction?: { role?: 'user' | 'model' | 'system'; parts: Array<{ text: string }> };
  generationConfig: { maxOutputTokens: number; candidateCount?: 1; temperature?: number; topP?: number; topK?: number; stopSequences?: string[] };
};
export type GenerateContentResponse = {
  candidates: Array<{ index: 0; content: { role: 'model'; parts: Array<{ text: string }> }; finishReason: 'STOP' | 'MAX_TOKENS' }>;
  modelVersion: string;
  responseId?: string;
  /** Missing categories remain null; usage is not a settlement receipt. */
  usageMetadata: { promptTokenCount: number | null; candidatesTokenCount: number | null; totalTokenCount: number | null; cachedContentTokenCount: number | null; thoughtsTokenCount: number | null };
};

/** Buffered native text and opted-in client tools; no media or beta features. */
export type MessagesRequest = {
  model: string;
  max_tokens: number;
  messages: Array<{ role: 'user' | 'assistant'; content: MessagesText | Array<MessagesTextBlock | MessagesToolUse | MessagesToolResult> }>;
  tools?: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>;
  tool_choice?: { type: 'auto' | 'any' | 'none'; disable_parallel_tool_use?: boolean } | { type: 'tool'; name: string; disable_parallel_tool_use?: boolean };
  system?: MessagesText;
  stream?: false;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
};
/** Tool SSE requires the route's explicit supports_messages_streaming_tools opt-in. */
export type MessagesStreamRequest = Omit<MessagesRequest, 'stream'>;
export type MessagesToolUse = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
export type MessagesToolResult = { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
export type MessagesTextBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' } };
export type MessagesText = string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' } }>;
export type MessagesResponse = {
  id: string; type: 'message'; role: 'assistant'; model: string;
  content: Array<{ type: 'text'; text: string } | MessagesToolUse>;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence: string | null;
  /** Null categories do not establish zero usage or settled customer charges. */
  usage: { input_tokens: number | null; output_tokens: number | null;
    cache_creation_input_tokens: number | null; cache_read_input_tokens: number | null };
};

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
  /** Optional position retained by compatible upstreams, including buffered calls. */
  index?: number;
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

export type KeyIntrospection = {
  object: 'api_key';
  label: string;
  allowed_models: string[];
  /** Unix milliseconds; null means no automatic expiration. */
  expires_at_ms: number | null;
  /** Last recorded dispatch in Unix milliseconds. */
  last_used_at_ms: number | null;
  revoked: boolean;
  expired: boolean;
  spending_limits: Array<{
    currency: string;
    limit_nanos: string | null;
    committed_nanos: string;
    remaining_nanos: string | null;
  }>;
  rate_limits: {
    requests_per_minute: number | null;
    tokens_per_minute: number | null;
    max_concurrent_requests: number | null;
    active_requests: number;
  };
  usage_window: {
    window_seconds: 60;
    window_end: string;
    requests: number;
    known_usage_requests: number;
    unknown_usage_requests: number;
    known_prompt_tokens: string;
    known_completion_tokens: string;
  };
  allowed_cidrs: string[] | null;
};

export type GenerationView = {
  id: string;
  model: string;
  provider_model: string | null;
  request_kind: 'video' | 'inference';
  created_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  execution: string;
  usage_confidence: string;
  usage: {
    prompt_tokens: string | null;
    completion_tokens: string | null;
    cached_input_tokens: string | null;
    cache_write_input_tokens: string | null;
    reasoning_output_tokens: string | null;
  };
  finish_reasons: Array<{ index: number; reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' }> | null;
  timing: {
    dispatch_ms: number | null;
    headers_ms: number | null;
    first_output_ms: number | null;
    total_ms: number;
    complete: boolean;
    http_status: number | null;
  } | null;
  customer_charge: {
    status: 'charged' | 'owner_funded' | 'pending' | 'unpriced' | 'not_charged';
    currency: string | null;
    amount_nanos: string | null;
  };
  output_guardrail_outcome: 'allowed' | 'redacted' | 'blocked' | 'indeterminate' | null;
  failure: {
    kind: 'upstream_http_error' | 'upstream_region_unavailable' | 'upstream_timeout'
      | 'upstream_connection_error' | 'upstream_transport_error' | 'upstream_invalid_response' | 'response_stream_cancelled';
    upstream_http_status: number | null;
    transport_phase?: 'connection' | 'request' | null;
  } | null;
};

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ChatFunctionTool[];
  tool_choice?: ChatToolChoice;
  parallel_tool_calls?: boolean;
  response_format?: ChatResponseFormat;
  /** Priced OpenRouter Chat: positive reasoning subset below the total output limit. */
  reasoning?: { max_tokens: number; exclude?: boolean };
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
  customer_pricing?: { pricing_source?: 'workspace' | 'platform'; promotion_scope?: 'global' | 'customer' | null; selected_at?: string; price_version?: string; currency: string; unit: 'nanounits_per_million_tokens'; context_tiers?: ContextPriceTier[]; prompt_rate: string; completion_rate: string; cached_prompt_rate?: string | null; reasoning_completion_rate?: string | null; cache_write_prompt_rate?: string | null; minimum_charge_nanos?: string; request_fee_nanos?: string } | null;
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
  /** Optional workspace API key ID when apiKey is a console session token. Sends X-Niu-Key-Id. */
  keyId?: string;
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
  /** Niu-specific reason when the operation supplies x-niu-error-code. */
  readonly gatewayCode?: string;
  /** Raw Retry-After value, when supplied. Absence is not permission to retry. */
  readonly retryAfter?: string;

  constructor(status: number, responseBody: unknown, requestId?: string, attemptId?: string, operationId?: string, gatewayCode?: string, retryAfter?: string) {
    super(errorMessage(responseBody, status));
    this.name = 'NiuAPIError';
    this.status = status;
    this.responseBody = responseBody;
    this.requestId = requestId;
    this.attemptId = attemptId;
    this.operationId = operationId;
    this.gatewayCode = gatewayCode;
    this.retryAfter = retryAfter;
  }

  static fromResponse(response: Response, payload: unknown): NiuAPIError {
    return new NiuAPIError(
      response.status, payload,
      response.headers.get('x-request-id') ?? response.headers.get('x-niu-operation-id') ?? undefined,
      response.headers.get('x-niu-attempt-id') ?? undefined,
      response.headers.get('x-niu-operation-id') ?? undefined,
      response.headers.get('x-niu-error-code') ?? undefined,
      response.headers.get('retry-after') ?? undefined,
    );
  }
}

/** Failure after response headers arrive. Status remains the actual HTTP status.
 * Inspect kind and responseBody; partial output never makes a failed stream safe to retry.
 * Caller cancellation preserves the AbortSignal's original reason instead.
 */
export class NiuStreamError extends NiuAPIError {
  readonly kind: 'api' | 'invalid_stream' | 'incomplete_stream' | 'transport';
  readonly eventType?: string;

  constructor(
    kind: NiuStreamError['kind'], message: string, response: Response,
    responseBody?: unknown, eventType?: string, cause?: unknown,
  ) {
    const metadata = NiuAPIError.fromResponse(response, responseBody);
    super(metadata.status, responseBody, metadata.requestId, metadata.attemptId,
      metadata.operationId, metadata.gatewayCode, metadata.retryAfter);
    this.name = 'NiuStreamError';
    this.message = message;
    this.kind = kind;
    this.eventType = eventType;
    if (cause !== undefined) this.cause = cause;
  }
}

export type VideoResultAvailability = { video: 'available' | 'missing' | 'unavailable'; last_frame: 'available' | 'missing' | 'unavailable' };

export type VideoLifecycleTiming = {
  source: 'gateway_observation';
  submitted_unix_ms: number | null;
  observations: Array<{ status: 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown'; observed_unix_ms: number }>;
  conflicting_terminal: boolean;
};

/** Result spans measure upstream retrieval, not client delivery or generation billing. */
export type VideoTransportTimings = {
  /** First gateway observations, not exact Provider queue/run transitions. */
  lifecycle?: VideoLifecycleTiming;
  data: Array<{ phase: 'submission' | 'query' | 'result'; started_unix_ms: number; elapsed_ms: number; outcome: 'received' | 'unavailable'; upstream_http_status?: number | null; upstream_error_code?: string | null; upstream_request_id?: string | null }>;
  has_more: boolean;
};

/** Configured video controls, not a quote or admission guarantee. */
export type VideoControl =
  | { kind: 'integer'; minimum: number; maximum: number; default: number | null }
  | { kind: 'choice'; values: string[]; default: string | null }
  | { kind: 'boolean'; default: boolean | null };
export type VideoModel = {
  object: 'video.model'; id: string; mode: 'owner_funded' | 'customer';
  input_types: ['text', ...Array<'image_url' | 'audio_url' | 'video_url'>]; text: { maximum_items: number; maximum_bytes: number };
  requires_image?: boolean;
  workspace_asset?: { media_kind: 'image'; requires_consent: true; requires_current_inspection: boolean; maximum_items: number; requires_text: true };
  image_url?: {
    maximum_items: number; maximum_bytes: number; https: boolean;
    data_mime_types: Array<'image/png' | 'image/jpeg' | 'image/webp'>;
    roles: string[]; role_required: boolean; requires_text: boolean;
    maximum_width?: number; maximum_height?: number; maximum_decoded_bytes?: number;
  };
  audio_url?: { maximum_items: number; maximum_bytes: number; https: true; data_mime_types: []; roles: string[]; role_required: boolean; requires_text: false };
  video_url?: { maximum_items: number; maximum_bytes: number; https: true; data_mime_types: []; roles: string[]; role_required: boolean; requires_text: false };
  maximum_body_bytes: number; maximum_content_items: number;
  controls: Record<string, VideoControl>; required_controls: string[]; exclusive_controls: string[][];
  /** The meter follows the configured estimator; discovery is not a billing quote. */
  output: ({ specifications: Array<{ resolution: string; ratio: string; width: number; height: number }> } & (
    | { meter: 'video_tokens'; estimator: 'SeedancePixelsV1' }
    | { meter: 'seconds'; estimator: 'OutputSecondsV1' }
  )) | null;
};
export type VideoModelList = { object: 'list'; data: VideoModel[] };

/** Short-lived ordinary image reuse; raw Provider asset URIs are not accepted. */
export type IngestedVideoImageInput = {
  type: 'ingested_image'; role?: string;
  ingested_image: { ingestion_id: string; readiness_id: string; consent_to_reuse: true };
};

/** Saved workspace images undergo fresh inspection before generation. */
export type WorkspaceAssetVideoImageInput = {
  type: 'workspace_asset'; role?: string;
  workspace_asset: { asset_id: string; consent_to_process: true };
};

/** A saved Niu asset ID; upstream type and URI are resolved by the backend. */
export type ProviderAssetVideoInput = {
  type: 'provider_asset';
  provider_asset: { id: string };
  role?: string;
};
export type VideoCreateRequest = {
  model: string;
  content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string }; role?: string } | { type: 'audio_url'; audio_url: { url: string }; role?: string } | { type: 'video_url'; video_url: { url: string }; role?: string } | IngestedVideoImageInput | WorkspaceAssetVideoImageInput | ProviderAssetVideoInput>;
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
  /** Public branding projection; the regular client credential does not expand it. */
  getPublicBranding(options?: RequestOptions): Promise<import('./admin.js').BrandingConfiguration> {
    return this.request('/branding', undefined, options);
  }

  /** Inspect the current API key's label, model grants, limits, and 60s usage window. */
  getKey(options?: RequestOptions): Promise<{ data: KeyIntrospection }> {
    return this.request('/key', undefined, options);
  }

  /** Retrieve token breakdown, timings, and customer charge for one generation attempt. */
  getGeneration(id: string, options?: RequestOptions): Promise<{ data: GenerationView }> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new TypeError('A canonical generation attempt UUID is required');
    }
    return this.request(`/generations/${encodeURIComponent(id)}`, undefined, options);
  }

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
  readonly media: ReturnType<typeof createMediaAssetsClient>;
  readonly video: { generate: (input: NiuVideoGenerationInput, options?: VideoCreateOptions) => Promise<VideoJobState>; models: { list: (options?: RequestOptions) => Promise<VideoModelList> }; estimate: (request: VideoCreateRequest, options?: RequestOptions) => Promise<VideoEstimate>; jobs: { wait: (id: string, options?: VideoWaitOptions) => Promise<VideoJobState>; results: { status: (id: string, options?: RequestOptions) => Promise<VideoResultAvailability>; retrieve: (id: string, kind: 'video' | 'last_frame', options?: RequestOptions) => Promise<Response>; refresh: (id: string, kind: 'video' | 'last_frame', options?: RequestOptions) => Promise<Response>; delete: (id: string, options?: RequestOptions) => Promise<{ deleted: true }> }; list: (query?: VideoJobHistoryQuery, options?: RequestOptions) => Promise<VideoJobHistory>; billing: (id: string, options?: RequestOptions) => Promise<VideoJobBilling>; timings: (id: string, options?: RequestOptions) => Promise<VideoTransportTimings>; observations: (id: string, query?: VideoQueryObservationQuery, options?: RequestOptions) => Promise<VideoQueryObservationPage>; refresh: (id: string, options?: RequestOptions) => Promise<VideoJobState>; create: (request: VideoCreateRequest, options?: VideoCreateOptions) => Promise<VideoJobState>; retrieve: (id: string, options?: RequestOptions) => Promise<VideoJobState> } };
  readonly models: { list: (options?: RequestOptions) => Promise<ModelList> };
  readonly embeddings: { create: (request: EmbeddingRequest, options?: RequestOptions) => Promise<EmbeddingResponse> };
  readonly generateContent: (model: string, request: GenerateContentRequest, options?: RequestOptions) => Promise<GenerateContentResponse>;
  readonly messages: { create: (request: MessagesRequest, options?: RequestOptions) => Promise<MessagesResponse>; stream: (request: MessagesStreamRequest, options?: RequestOptions) => AsyncGenerator<unknown> };
  readonly responses: { create: (request: ResponsesRequest, options?: RequestOptions) => Promise<ResponsesResponse>; stream: (request: ResponsesRequest, options?: RequestOptions) => AsyncGenerator<unknown> };
  readonly chat: {
    completions: (request: ChatCompletionRequest, options?: RequestOptions) => Promise<ChatCompletionResponse>;
    stream: (request: ChatStreamRequest, options?: RequestOptions) => AsyncGenerator<unknown>;
  };

  private readonly apiKey: string;
  private readonly keyId: string | undefined;
  private readonly credentialHeader: NiuCredentialHeader;
  private readonly baseURL: string;
  private readonly requestFetch: typeof globalThis.fetch;
  private readonly defaultHeaders: HeadersInit;

  constructor(options: NiuClientOptions) {
    if (!options.apiKey.trim()) throw new Error('apiKey is required');
    if (options.keyId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.keyId)) {
      throw new TypeError('keyId must be a canonical UUID');
    }
    this.apiKey = options.apiKey;
    this.keyId = options.keyId;
    this.credentialHeader = options.credentialHeader ?? 'authorization';
    this.baseURL = (options.baseURL ?? 'http://localhost:2555/v1').replace(/\/+$/, '');
    this.requestFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = options.defaultHeaders ?? {};

    this.media = createMediaAssetsClient(async <T>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body: unknown, requestOptions = {}) => await readPayload(await this.send(path, body, requestOptions, 'application/json', method)) as T);
    this.video = { generate: (input, requestOptions) => this.video.jobs.create(normalizeVideoGeneration(input), requestOptions), models: { list: (requestOptions) => this.request('/video/models', undefined, requestOptions) }, estimate: (request, requestOptions) => this.request('/video/estimate', request, requestOptions), jobs: { wait: (id, requestOptions) => waitForVideoJob(this.video.jobs, id, requestOptions), results: { status: (id, requestOptions) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new TypeError('A Niu video job reference is required');
      return this.request(`/video/jobs/${encodeURIComponent(id)}/results`,undefined,requestOptions);
    }, retrieve: (id, kind, requestOptions = {}) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !['video','last_frame'].includes(kind)) throw new TypeError('A Niu video job reference and result kind are required');
      return this.send(`/video/jobs/${encodeURIComponent(id)}/results/${kind}`,undefined,requestOptions,'video/mp4,video/webm,image/png,image/jpeg');
    }, refresh: (id, kind, requestOptions = {}) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !['video','last_frame'].includes(kind)) throw new TypeError('A Niu video job reference and result kind are required');
      return this.send(`/video/jobs/${encodeURIComponent(id)}/results/${kind}/refresh`,undefined,requestOptions,'video/mp4,video/webm,image/png,image/jpeg','POST');
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
    }, observations: (id, query = {}, requestOptions) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new TypeError('A Niu video job reference is required');
      return this.request(`/video/jobs/${encodeURIComponent(id)}/observations${videoObservationQuery(query)}`, undefined, requestOptions);
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
    this.generateContent = (model, request, options) => {
      if (typeof model !== 'string' || !model.trim() || model !== model.trim() || model === '.' || model.includes('..') || /[?#:\\\x00-\x1f\x7f]/.test(model)) {
        throw new TypeError('model must be a non-empty model identifier without path traversal or query delimiters');
      }
      return this.request(`/models/${encodeURIComponent(model)}:generateContent`, request, options, true);
    };
    this.messages = {
      create: (request, requestOptions) => {
        if ((request as { stream?: boolean }).stream === true) throw new Error('Use messages.stream() for streaming requests');
        return this.request('/messages', request, requestOptions);
      },
      stream: (request, requestOptions) => this.streamMessages(request, requestOptions),
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
    nativeGemini = false,
  ): Promise<T> {
    const response = await this.send(path, body, options, 'application/json', body === undefined ? 'GET' : 'POST', nativeGemini);
    return await readPayload(response) as T;
  }

  private async *streamMessages(request: MessagesStreamRequest, options: RequestOptions = {}): AsyncGenerator<unknown> {
    const response = await this.send('/messages', { ...request, stream: true }, options, 'text/event-stream');
    if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/event-stream' || !response.body) {
      await response.body?.cancel();
      throw new NiuStreamError('invalid_stream', 'Expected an event-stream response', response);
    }
    yield* parseChatStream(response, options.signal, 'messages');
  }

  private async *streamResponses(request: ResponsesRequest, options: RequestOptions = {}): AsyncGenerator<unknown> {
    const response = await this.send('/responses', { ...request, stream: true }, options, 'text/event-stream');
    if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/event-stream' || !response.body) {
      await response.body?.cancel();
      throw new NiuStreamError('invalid_stream', 'Expected an event-stream response', response);
    }
    yield* parseChatStream(response, options.signal, 'responses');
  }

  private async *streamChat(request: ChatStreamRequest, options: RequestOptions = {}): AsyncGenerator<unknown> {
    const response = await this.send('/chat/completions', {
      ...request,
      stream: true,
      stream_options: { ...(request.stream_options as Record<string, unknown> ?? {}), include_usage: true },
    }, options, 'text/event-stream');
    if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/event-stream' || !response.body) {
      await response.body?.cancel();
      throw new NiuStreamError('invalid_stream', 'Expected an event-stream response', response);
    }
    yield* parseChatStream(response, options.signal);
  }

  private async send(path: string, body: unknown, options: RequestOptions & { idempotencyKey?: string }, accept: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = body === undefined ? 'GET' : 'POST', nativeGemini = false): Promise<Response> {
    const headers = new Headers(this.defaultHeaders);
    if (options.idempotencyKey !== undefined) {
      const videoCreation = path === '/video/jobs' && method === 'POST';
      const mediaPreparation = method === 'POST' && /^\/media\/operations\/(?:prepare|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/dispatch)$/.test(path);
      const mediaMutation = mediaPreparation || (/^\/media\/(?:groups|assets|verifications)(?:\/[0-9a-f-]{36})?(?:\?[^#]*)?$/.test(path) && ['POST', 'PATCH', 'DELETE'].includes(method));
      if (typeof options.idempotencyKey !== 'string' || (videoCreation
        ? !/^[\x21-\x7e]{1,128}$/.test(options.idempotencyKey)
        : !mediaMutation || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(options.idempotencyKey) || (mediaPreparation && options.idempotencyKey === '00000000-0000-0000-0000-000000000000'))) {
        throw new TypeError('idempotencyKey requires video creation or a media mutation with a canonical UUID');
      }
      headers.set('idempotency-key', options.idempotencyKey);
    }
    if (options.logPayloads !== undefined) {
      if (typeof options.logPayloads !== 'boolean') throw new TypeError('logPayloads must be a boolean');
      headers.set('x-niu-log-payloads', String(options.logPayloads));
    }
    if (this.keyId !== undefined) {
      headers.set('x-niu-key-id', this.keyId);
    }
    if (this.credentialHeader === 'authorization') {
      headers.set('authorization', `Bearer ${this.apiKey}`);
    } else {
      headers.set('x-niu-api-key', this.apiKey);
    }
    headers.set('accept', accept);
    if (body !== undefined) headers.set('content-type', 'application/json');

    if (nativeGemini && !this.baseURL.endsWith('/v1')) {
      throw new TypeError('GenerateContent requires a client baseURL ending in /v1');
    }
    const base = nativeGemini ? this.baseURL.slice(0, -3) + '/v1beta' : this.baseURL;
    const response = await this.requestFetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    });
    await notifyResponse(response, options);
    if (!response.ok) {
      throw NiuAPIError.fromResponse(response, await readPayload(response));
    }
    return response;
  }
}

export type VideoCreateOptions = RequestOptions & {
  /** Reuse with the same text-video document to recover the original submission. */
  idempotencyKey?: string;
};

export type ResponseMetadata = {
  readonly status: number;
  readonly requestId: string | null;
  readonly attemptId: string | null;
  readonly operationId: string | null;
};

export type RequestOptions = {
  signal?: AbortSignal;
  /** Called once when response headers arrive, including streams and HTTP errors. Does not consume the body. */
  onResponse?: (metadata: ResponseMetadata) => void;
  /** Override payload retention for this request. Metadata collection is unaffected. */
  logPayloads?: boolean;
};

function errorMessage(body: unknown, status: number, fallback = `Niu API request failed with status ${status}`): string {
  if (typeof body === 'object' && body !== null) {
    const root = body as { error?: { message?: unknown }; message?: unknown };
    if (typeof root.error?.message === 'string') return root.error.message;
    if (typeof root.message === 'string') return root.message;
  }
  return fallback;
}


async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  try { return text ? JSON.parse(text) : undefined; } catch { return text; }
}

async function* parseChatStream(response: Response, signal?: AbortSignal, protocol: 'chat' | 'responses' | 'messages' = 'chat'): AsyncGenerator<unknown> {
  const responses = protocol === 'responses';
  const reader = response.body!.getReader();
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let line = '';
  let data = '';
  let skipLF = false;
  let eventSize = 0;
  let eventType: string | undefined;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const result = await reader.read();
      signal?.throwIfAborted();
      if (result.done) break;
      let text: string;
      try { text = decoder.decode(result.value, { stream: true }); }
      catch (cause) { throw new NiuStreamError('invalid_stream', 'Invalid UTF-8 stream', response, undefined, eventType, cause); }
      for (const char of text) {
        if (skipLF) { skipLF = false; if (char === '\n') continue; }
        const point = char.codePointAt(0)!;
        eventSize += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
        if (eventSize > (responses ? 16 * 1024 * 1024 : 65_536)) throw new NiuStreamError('invalid_stream', 'SSE event exceeds client buffer limit', response, undefined, eventType);
        if (char !== '\r' && char !== '\n') { line += char; continue; }
        skipLF = char === '\r';
        if (line === '') {
          signal?.throwIfAborted();
          eventSize = 0;
          if (eventType === 'error' && data === '') throw new NiuStreamError('api', 'Upstream returned an SSE error event', response, undefined, eventType);
          if (data !== '') {
            const event = data.slice(0, -1);
            data = '';
            if (event === '[DONE]') {
              if (eventType === 'error') throw new NiuStreamError('api', 'Upstream returned an SSE error event', response, event, eventType);
              if (protocol !== 'chat') throw new NiuStreamError('incomplete_stream', 'Stream ended without its protocol terminal event', response);
              return;
            }
            let value: unknown;
            try { value = JSON.parse(event); }
            catch (cause) {
              throw new NiuStreamError(eventType === 'error' ? 'api' : 'invalid_stream',
                eventType === 'error' ? 'Upstream returned an SSE error event' : 'Invalid JSON stream event', response, event, eventType, cause);
            }
            if (eventType === 'error') throw new NiuStreamError('api', errorMessage(value, response.status, 'Upstream returned an SSE error event'), response, value, eventType);
            if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new NiuStreamError('invalid_stream', 'Invalid chat stream event', response, value, eventType);
            if ('error' in value) throw new NiuStreamError('api', errorMessage(value, response.status, 'Upstream stream failed'), response, value, eventType);
            if (responses && 'type' in value && value.type === 'response.failed') {
              const nested = 'response' in value ? value.response : undefined;
              throw new NiuStreamError('api', errorMessage(nested, response.status, 'Upstream response failed'), response, value, 'response.failed');
            }
            yield value;
            if (protocol === 'messages' && 'type' in value && value.type === 'message_stop') return;
            if (responses && 'type' in value && (value.type === 'response.completed' || value.type === 'response.incomplete')) return;
          }
          eventType = undefined;
        } else if (!line.startsWith(':')) {
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          let value = colon < 0 ? '' : line.slice(colon + 1);
          if (value.startsWith(' ')) value = value.slice(1);
          if (field === 'data') data += value + '\n';
          if (field === 'event') eventType = value;
        }
        line = '';
      }
    }
    try { decoder.decode(); }
    catch (cause) { throw new NiuStreamError('invalid_stream', 'Invalid UTF-8 stream', response, undefined, eventType, cause); }
    throw new NiuStreamError('incomplete_stream', 'Stream ended without a terminal event', response);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof NiuStreamError) throw error;
    throw new NiuStreamError('transport', 'Stream transport failed', response, undefined, eventType, error);
  } finally {
    signal?.removeEventListener('abort', abort);
    try { await reader.cancel().catch(() => {}); } finally { reader.releaseLock(); }
  }
}

export { NiuAdminClient, chatBranchMessages } from './admin.js';
export type { MemberPasswordConfiguration, MemberPasswordInput, OperatorAccessRole, OperatorRoleUpdate, OperatorAccessView, ChatDraftPayload, ChatDraftState } from './admin.js';
export type { OrdinaryAssetGroupDeletionConsentInput, OrdinaryAssetGroupDeletionConsentStatus, AssetManagementConfiguration, AssetManagementConfigurationInput, AssetOperationAuthorizationInput, AssetOperationAuthorization, OrdinaryAssetGroupInput, OrdinaryAssetGroupUpdateInput, OrdinaryAssetGroupUpdatePreparation, OrdinaryAssetGroupUpdateAudit, OrdinaryAssetGroupReadInput, OrdinaryAssetListingInput, OrdinaryAssetListing, OrdinaryAssetListingAudit, OrdinaryAssetLookupInput, OrdinaryAssetLookupAudit, OrdinaryAssetLookupResult } from './admin.js';
export type { ContextPriceTier, CustomerInvoiceInput, CustomerInvoiceLine } from './admin.js';
export type { WorkspaceSpendingAccount, WorkspaceSpendingLimit, WorkspaceSpendingLimitRevision } from './admin.js';
export type { ProviderMediaOfferInput, ProviderMediaOfferModel, ProviderMediaRateModel, ProviderMediaRateRecord, ProviderMediaRateCard, SupplierMediaOfferInput, SupplierMediaOfferModel, SupplierMediaRateModel, SupplierMediaRateRecord, SupplierMediaRateCard, CustomerMediaRateCard, CustomerMediaRateRecord, CustomerMediaRateModel, VideoOutputSchema, ExactMediaQuantity, MediaBillingDimensions } from './admin.js';
export type { GuardrailPreparationDenial } from './admin.js';
export type { ProviderCatalogMetadata, ProviderCatalogModel, ProviderModelCheck, ProviderModelInput, ProviderModel, ProviderModelAvailability, ProviderCredentialCreateInput, ProviderCredentialUpdateInput, ProviderMember, ProviderMemberUpdate, ProviderBusiness, ProviderBusinessCreate, ProviderProfile, ProviderProfileUpdate, ProviderCredential, ProviderCooldown, ProviderRequestRateLimit, ProviderRequestRateLimitRevision, ProviderRateInput, ProviderOffer, ProviderOfferRevision, ProviderOfferHistory, ProviderSettlement, ProviderSettlementPage, ProviderSettlementInput, ProviderEarning, ProviderEarningPage, ProviderSettlementQuery, ProviderQualificationInput, ProviderOfferQualificationInput, ProviderAccountInput, ProviderAccount, SupplierCatalogMetadata, SupplierCatalogModel, SupplierModelCheck, SupplierModelInput, SupplierModel, SupplierModelAvailability, SupplierCredentialCreateInput, SupplierCredentialUpdateInput, SupplierMember, SupplierMemberUpdate, SupplierBusiness, SupplierProfile, SupplierProfileUpdate, SupplierCredential, RequestUsageReconciliation, VendorCooldown, VendorRequestRateLimit, VendorRequestRateLimitRevision, WorkspaceKey, WorkspaceKeyPage, WorkspaceKeyDetail, WorkspaceKeyDetailPage, WorkspaceKeyUpdateInput, WorkspaceKeySpendingLimitPatch, WorkspaceKeyRequestRateLimitPatch, WorkspaceKeyTokenRateLimitPatch, WorkspaceKeyConcurrencyLimitPatch, WorkspaceKeyIpPolicyPatch, NiuAdminOptions, CustomerTariffInput, CustomerTariff, CustomerTariffHistory, CustomerTariffHistoryEntry, CustomerBalance, CustomerBalanceReservation, CustomerBalanceReservationQuery, CustomerChargeReconciliation, CustomerTopupInput, CustomerTopup, CustomerPaymentMethods, CustomerBalanceTransaction, CustomerBalanceReversalInput, RetailTextEnrollmentPublication, RetailTextEnrollment, RetailSchedule, RetailStandardPublication, RetailPromotionPublication, RetailPromotionRetirement, RetailPublicationResult, RetailPriceRecord, RetailSelection, RetailPriceHistory, RetailPromotionPage, CustomerFinancialSummary, PreparedCustomerBalanceGrant, CustomerBalanceGrantInput, CustomerBalanceGiftCorrectionInput, IssuedCustomerBalanceGrant, CustomerBalancePolicyInput, CustomerBalancePolicyHistory, CustomerBilling, CustomerInvoicePage, LedgerHistoryQuery, SupplierRateInput, SupplierOffer, SupplierOfferRevision, SupplierOfferHistory, SupplierSettlement, SupplierSettlementPage, SupplierSettlementInput, SupplierEarning, SupplierEarningPage, SupplierSettlementQuery, SupplierQualificationInput, SupplierOfferQualificationInput, TenantScope, WorkspaceScope, MediaOperationHistoryContext, MediaOperationHistoryQuery, ChatResult, ChatTurn, ChatSession, ChatSessionPage, ChatSessionPageQuery, ChatExport, ChatAttachment, GuardrailAccessRule, WorkspaceDetectorDescription, WorkspaceImageDetectorDescription, WorkspaceMediaDetectorDescription, ImageDetectorPreviewInput, ImageDetectorPreviewResult, GuardrailPolicy, GuardrailPreview, GuardrailInputTest, GuardrailInputTestResult, GuardrailOutputTest, GuardrailOutputTestResult, RequestGuardrailDecision, SupplierAccountInput, SupplierAccount, GatewayActivityOutcome, GatewayTaskEvidence, GatewayActivityEntry, GatewayAdmissionDenial, GatewayActivityPage, GatewayActivityQuery, GatewayActivityExportQuery, GatewayActivitySummary, GatewayChargeSummary, GatewayUsageSummary, RequestTiming, RequestFailure, RequestPayload } from './admin.js';

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

export type { VideoIntentRequest, VideoIntentIndexEntry, VideoSubmissionIntent, VideoIntentIndex, VideoIntentDeletion } from './admin.js';

export type { GenerationTaskDiagnostics } from './admin.js';

export type { ProviderMembership, SupplierMembership } from './admin.js';

export type { Workspace, WorkspaceInput, WorkspaceCreateOptions, WorkspaceRoute } from './admin.js';

export type { CompanyCreationInput, CreatedCompany, CompanyCreateOptions } from './admin.js';

export type { CompanyMetadata, CompanyPage, CompanyPageOptions } from './admin.js';

export type { FinancialRecoveryDiagnostics } from './admin.js';

export type { ProviderConfigurationUsage, ProviderConfigurationUsageQuery, ProviderConfigurationUsageTotals, SupplierConfigurationUsage, SupplierConfigurationUsageQuery, SupplierConfigurationUsageTotals } from './admin.js';

export type { RoutingRegistryStatus } from './admin.js';

export type { WorkspaceKeyCreateInput, WorkspaceKeyMetadataInput, IssuedWorkspaceKey, WorkspaceKeyMutationResult, WorkspaceKeyRequestStatus } from './admin.js';

export type { VideoReportedQuantity, VideoProviderTimes, VideoQueryObservation, VideoQueryObservationPage, VideoQueryObservationQuery } from './video-query-observations.js';

export type { MemberProfile, MemberProfileUpdate, MemberPreferences } from './admin.js';

export type { GuardrailDetectorDescription, GuardrailDetectorPreviewInput, GuardrailDetectorPreviewResult } from './admin.js';

export type { EPayConfiguration, EPayConfigurationInput } from './admin.js';

export type { WorkspaceAsset, WorkspaceAssetKind, WorkspaceAssetPage, WorkspaceAssetPageOptions } from './workspace-assets.js';

export type { VideoGenerationsSessionSummary, VideoGenerationsSession, VideoGenerationsSessionPage, ChatGenerationsInstruction, ChatGenerationsTaskReference, ChatGenerationsBranch, ChatGenerationsTurn, ChatGenerationsSessionSummary, ChatGenerationsSession, ChatGenerationsSessionPage, GenerationsInstruction, GenerationsTaskReference, GenerationsTurn, GenerationsSessionSummary, GenerationsSession, GenerationsSessionPage, GenerationsSessionPageOptions } from './generations-sessions.js';
export type { GenerationArtifactCapture, GenerationArtifactCaptureInput, GenerationArtifactCaptureFailureCode, GenerationArtifactCaptureClient, GenerationArtifactCaptureSender } from './generation-artifact-capture.js';
export type { GenerationTaskState, GenerationArtifactAvailability, GenerationArtifactKind, GenerationTask, GenerationExecutionContext, GenerationArtifact, GenerationInventoryPage, GenerationInventoryQuery } from './generations-inventory.js';
export type { PlatformAuditCategory, PlatformAuditSource, PlatformAuditEvent, PlatformAuditPage, PlatformAuditQuery } from './platform-audit.js';

export type { CommercialPosition, CommercialPositionRow } from './admin.js';

export type { MediaLiabilityIdentity, MediaLiabilityPublication, MediaLiabilityRevocation, MediaLiabilityPublicationResult, MediaLiabilityQualificationRecord, MediaLiabilityQualificationPage } from './admin.js';

export type { RetailMediaEnrollmentPublication, RetailMediaEnrollment, RetailMediaEnrollmentResult } from './admin.js';
