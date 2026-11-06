export type { GenerationsVideoIntentReference } from './generations-sessions.js';
export type { ProviderServiceDescriptor, ProviderPriceEvidence, ProviderPriceVersion, ProviderCostEstimate, ProviderDiscovery, ProviderIntegration, ProviderIntegrationType } from './admin.js';
export type { CustomerUnitDefinition, CustomerUnitPurchaseRule, CustomerUnitConfiguration, CustomerUnitDefinitionInput, CustomerUnitPurchaseRuleInput } from './admin.js';
export type { CustomerUnitQuote, CustomerUnitQuoteInput } from './admin.js';
export type { CustomerUnitGrant, CustomerUnitGrantInput } from './admin.js';
export type { CustomerUnitRefund, CustomerUnitRefundInput, CustomerUnitPurchaseReversalRange, CustomerUnitPurchaseReversal, CustomerUnitPurchaseReversalPreview } from './admin.js';
export type { CustomerUnitModePreview } from './admin.js';
export type { CustomerUnitModePreviewInput, CustomerUnitSavedModePreview, CustomerUnitModePublication } from './admin.js';
export type { CustomerUnitBalance } from './admin.js';
export type { CustomerUnitSpendingLimit, CustomerUnitSpendingLimitInput, CustomerUnitSpendingLimitRevision } from './admin.js';
export type { CustomerUnitTextPrice, CustomerUnitTextTariff, CustomerUnitTextTariffInput } from './admin.js';
import { notifyResponse } from './response-metadata.js';
import { videoObservationQuery, type VideoQueryObservationPage, type VideoQueryObservationQuery } from './video-query-observations.js';
import type { ContextPriceTier } from './admin.js';
import { waitForVideoJob, type VideoWaitOptions } from './video-wait.js';
export type { VideoWaitOptions } from './video-wait.js';
import { normalizeVideoGeneration, type NiuVideoGenerationInput } from './video-generation.js';
import { createMediaAssetsClient } from './media-assets.js';
export type { MediaAssetObservation, MediaAssetGroupObservation, MediaAsset, MediaAssetGroup, MediaAssetOperation, MediaAssetMutation, MediaAssetMutationOptions, MediaAssetOperationInput, MediaAssetCreateSource, MediaAssetCreateInput, MediaAssetPreparationOptions, MediaAssetPage } from './media-assets.js';
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

export type AgentManagementCapability = 'pools:read' | 'pools:write' | 'events:read' | 'events:write' | 'evaluations:read' | 'evaluations:write';

export type KeyIntrospection = {
  management_capabilities?: AgentManagementCapability[];
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

export type WorkspaceAutoResponseType = 'text' | 'structured' | 'embedding';
/** One declared Auto execution path. Candidates reference top-level aliases. */
export type WorkspaceAutoPath = {
  id: string;
  name?: string;
  description?: string;
  response_type: WorkspaceAutoResponseType;
  candidates: string[];
  /** Lowercase caller task keywords that select this path without a model call. */
  task?: string[];
  stage?: string[];
};
/**
 * Optional single-round semantic decider. Every dimension is explicit and
 * bounded. Its customer price must be comparable in `currency`; otherwise no
 * paid call is made and the failure action applies.
 */
export type WorkspaceAutoDecider = {
  model: string;
  currency: string;
  timeout_ms: number;
  max_calls: 1;
  max_input_tokens: number;
  max_output_tokens: number;
  max_spend_nanos: number;
  min_confidence: number;
  on_abstain?: 'fallback' | 'reject';
  on_failure?: 'fallback' | 'reject';
};
/** Versioned selection strategy for a customer-owned model policy. */
export type WorkspacePoolStrategy = {
  version: 1 | 2;
  mode: 'priority_weight' | 'customer_price' | 'auto';
  /**
   * Required exactly for `customer_price`. Ranks eligible candidates by the
   * estimated customer selling price in this currency and unit. Missing or
   * incomparable prices remain unknown; selection then falls back to priority
   * and weight. Provider procurement prices are never used.
   */
  customer_price?: {
    currency: string;
    unit: 'nanounits_per_million_tokens';
    input_tokens: number;
    output_tokens: number;
  };
  /**
   * Required exactly for version 2 `auto`. Caller task/stage context is
   * evaluated first; the optional decider may only select a declared,
   * response-compatible path. Unknown or incompatible decisions are failures,
   * never silent substitutions.
   */
  auto?: {
    paths: WorkspaceAutoPath[];
    decider?: WorkspaceAutoDecider;
  };
};
/** Customer-owned model policy; never contains Provider supply configuration. */
export type WorkspaceModelPool = {
  slug: string; name: string; description: string; enabled: boolean;
  /** Current revision for reads; expected revision for writes. Zero creates. */
  revision: number;
  candidates: import('./admin.js').ModelRoutePoolCandidate[];
  rules?: Array<Omit<import('./admin.js').ModelRoutePoolRule, 'conditions'> & { conditions: Omit<import('./admin.js').ModelRoutePoolRuleConditions, 'protocol'> & { protocol?: 'chat' | 'responses' | 'messages' | null } }>;
  default_action?: 'candidates' | 'reject';
  /** Omitted legacy configurations use version 1 priority/weight. */
  strategy?: WorkspacePoolStrategy;
};
export type WorkspacePoolPreviewContext = {
  protocol: 'chat' | 'responses' | 'messages' | 'embeddings' | 'generate_content';
  streaming?: boolean; vision?: boolean; tools?: boolean; structured_output?: boolean; reasoning?: boolean;
  embedding_dimensions?: boolean; embedding_base64?: boolean;
  estimated_input_tokens?: number; requested_output_tokens?: number;
  /** Optional caller task context for Auto preview; preview never calls the decider. */
  task?: string; stage?: string;
};
export type WorkspacePoolDecisionEvidence = {
  outcome: 'context_match' | 'decider_selected' | 'decider_required'
    | 'priority_weight_fallback' | 'rejected' | 'cancelled';
  path: string | null;
  fallback_reason: string | null;
  failure: string | null;
  calls: number;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  /** True when the upstream did not report usage and counts are estimates. */
  tokens_estimated: boolean;
  estimated_customer_charge_nanos: string | null;
  /** Present on preview evidence: preview never dispatches inference. */
  live_dispatch?: false;
  compatible_paths?: string[];
  decider?: {
    configured: true; model: string; currency: string; max_calls: number;
    max_input_tokens: number; max_output_tokens: number;
    max_spend_nanos: string; timeout_ms: number; min_confidence: number;
    prompt_estimated_tokens?: number; maximum_estimated_charge_nanos?: string;
    would_reject: boolean;
  };
};
export type WorkspacePoolPriceEvaluation = {
  source: 'customer_selling_price'; billing_mode: string; currency: string;
  unit: 'nanounits_per_million_tokens'; input_tokens: number; output_tokens: number;
  basis: 'customer_price' | 'priority_weight_fallback';
  fallback_reason: string | null; selected_candidate: string | null;
  candidates: Array<{
    alias: string;
    estimated_customer_charge_nanos: string | null;
    price_unknown_reason: string | null;
  }>;
};
export type WorkspacePoolPreview = {
  configuration_valid: boolean; persisted: false; live_model_verification: 'not_performed'; candidate_count: number; rule_count: number;
  strategy?: WorkspacePoolStrategy;
  simulation?: {
    protocol: WorkspacePoolPreviewContext['protocol']; matched_rule: string | null;
    outcome: 'pool_disabled' | 'default_reject' | 'no_eligible_candidates' | 'candidates';
    strategy?: WorkspacePoolStrategy;
    selection_basis?: 'not_evaluated' | 'priority_weight' | 'priority_weight_fallback' | 'customer_price'
      | 'auto_context' | 'auto_decider_required' | 'auto_rejected';
    /** Auto path selected deterministically from caller context. */
    selected_path?: string | null;
    selected_candidate?: string | null;
    fallback_reason?: string | null;
    price_evaluation?: WorkspacePoolPriceEvaluation | null;
    decision?: WorkspacePoolDecisionEvidence | null;
    live_dispatch: false;
    candidates: Array<{
      alias: string; priority: number; weight: number; eligible: boolean;
      exclusion_reason: string | null;
      selection_weight: { numerator: number; denominator: number };
      estimated_customer_charge_nanos?: string | null;
      price_unknown_reason?: string | null;
    }>;
  };
};
export type WorkspacePoolSelection = {
  pool_revision: number; selected_model: string; created_at: string;
  operation_id: string | null; attempt_id: string | null;
  /** Readable request reference for evidence navigation; null when unavailable. */
  reference: string | null;
  /** Returned HTTP status, not terminal generation or quality acceptance. */
  response_status: number | null;
  /** Bounded Auto decision evidence; null for non-Auto strategies. */
  decision?: WorkspacePoolDecisionEvidence | null;
};
/** Explicit System 1 decision types. These are separate from Auto path selection. */
export type DecisionValueType = 'string' | 'boolean' | 'integer' | 'number';
export type DecisionPropertySchema = {
  type: DecisionValueType;
  /** Prompt guidance; at most 200 single-line characters. */
  description?: string;
  /** Required for a finite string choice; 1-32 unique values of at most 64 characters. */
  enum?: string[];
  /** Integer or number bound only. */
  minimum?: number;
  maximum?: number;
};
export type DecisionOutputSchema = {
  type: 'object';
  /** 1-16 flat properties. Nested objects, arrays and null are unsupported. */
  properties: Record<string, DecisionPropertySchema>;
  /** At least one declared property; closed output rejects unknown fields. */
  required: string[];
  additionalProperties: false;
};
export type DecisionRequest = {
  /** Concrete workspace Chat model with declared structured-output support. */
  model: string;
  /** UTF-8 string or JSON object; at most 16 KiB serialized. */
  input: string | Record<string, unknown>;
  output_schema: DecisionOutputSchema;
  /** 50-5000; default 2000. A timeout is not a decision and may have incurred charges. */
  timeout_ms?: number;
  /** 1-1024; default 128. */
  max_output_tokens?: number;
};
export type DecisionEvidence = {
  outcome: 'decided' | 'abstained';
  model: string;
  calls: 1;
  input_tokens: number | null;
  output_tokens: number | null;
  /** True when either count is a character-based estimate, not exact tokenization. */
  tokens_estimated: boolean;
  latency_ms: number;
  timeout_ms: number;
  max_output_tokens: number;
};
export type DecisionResult = {
  /** Null only for an explicit model abstention, never a missing decision. */
  decision: Record<string, unknown> | null;
  evidence: DecisionEvidence;
};
function validateDecisionRequest(request: DecisionRequest): void {
  if (request === null || typeof request !== 'object') throw new TypeError('A decision request is required');
  const model = request.model;
  if (typeof model !== 'string' || model.length === 0 || model.length > 200 || model.trim() !== model) throw new TypeError('A concrete decision model alias of at most 200 characters is required');
  if (model.startsWith('pool/') || model.startsWith('codex/')) throw new TypeError('Decision requests require a concrete qualified model; pools and Auto are not accepted');
  const input = request.input;
  if (!(typeof input === 'string' || (input !== null && typeof input === 'object' && !Array.isArray(input)))) throw new TypeError('Decision input must be a string or an object');
  const schema = request.output_schema;
  if (schema === null || typeof schema !== 'object' || schema.type !== 'object' || schema.additionalProperties !== false) throw new TypeError('output_schema must be a closed object schema with additionalProperties false');
  if (schema.properties === null || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) throw new TypeError('output_schema.properties must be an object');
  const names = Object.keys(schema.properties);
  if (names.length < 1 || names.length > 16) throw new TypeError('output_schema must declare 1-16 properties');
  if (!Array.isArray(schema.required) || schema.required.length < 1 || schema.required.length > names.length) throw new TypeError('output_schema.required must name at least one declared property');
  const required = new Set<string>();
  for (const name of schema.required) {
    if (typeof name !== 'string' || required.has(name) || !Object.prototype.hasOwnProperty.call(schema.properties, name)) throw new TypeError('output_schema.required must name declared properties without duplicates');
    required.add(name);
  }
  for (const [name, property] of Object.entries(schema.properties)) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name) || name === 'abstain') throw new TypeError('Decision property names must be 1-64 ASCII letters, digits, underscores or hyphens; abstain is reserved');
    if (property === null || typeof property !== 'object') throw new TypeError('Each decision property must be an object');
    if (!['string', 'boolean', 'integer', 'number'].includes(property.type)) throw new TypeError('Decision properties must be string, boolean, integer or number');
    if (property.description !== undefined && (typeof property.description !== 'string' || property.description.length === 0 || property.description.length > 200 || /[\u0000-\u001f]/.test(property.description))) throw new TypeError('Decision property descriptions must be single-line text of at most 200 characters');
    if (property.enum !== undefined) {
      if (property.type !== 'string' || !Array.isArray(property.enum) || property.enum.length < 1 || property.enum.length > 32) throw new TypeError('Decision enums require 1-32 string values');
      const values = new Set<string>();
      for (const value of property.enum) {
        if (typeof value !== 'string' || value.length === 0 || value.length > 64 || value.trim() !== value || /[\u0000-\u001f]/.test(value) || values.has(value)) throw new TypeError('Decision enum values must be unique, trimmed strings of at most 64 characters');
        values.add(value);
      }
    }
    for (const bound of [property.minimum, property.maximum]) {
      if (bound !== undefined && (typeof bound !== 'number' || !Number.isFinite(bound))) throw new TypeError('Decision bounds must be finite numbers');
    }
    if ((property.minimum !== undefined || property.maximum !== undefined) && property.type !== 'integer' && property.type !== 'number') throw new TypeError('Decision bounds are only supported for integer and number properties');
    if (property.type === 'boolean' && (property.enum !== undefined || property.minimum !== undefined || property.maximum !== undefined)) throw new TypeError('Boolean decision properties cannot declare enums or bounds');
    if (property.type === 'integer' && ((property.minimum !== undefined && !Number.isInteger(property.minimum)) || (property.maximum !== undefined && !Number.isInteger(property.maximum)))) throw new TypeError('Integer decision bounds must be integers');
    if (property.minimum !== undefined && property.maximum !== undefined && property.minimum > property.maximum) throw new TypeError('Decision minimum cannot exceed maximum');
  }
  if (request.timeout_ms !== undefined && (!Number.isInteger(request.timeout_ms) || request.timeout_ms < 50 || request.timeout_ms > 5000)) throw new TypeError('timeout_ms must be an integer between 50 and 5000');
  if (request.max_output_tokens !== undefined && (!Number.isInteger(request.max_output_tokens) || request.max_output_tokens < 1 || request.max_output_tokens > 1024)) throw new TypeError('max_output_tokens must be an integer between 1 and 1024');
}
function workspacePoolSlug(slug: string): string {
  if (typeof slug !== 'string' || slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || ['index', 'history', 'preview', 'audit', 'new'].includes(slug)) throw new TypeError('A readable workspace pool slug is required');
  return slug;
}

export type EventSubscription = {
  slug: string; name: string; endpoint: string; event_types: Array<'pool.changed' | 'evaluation.recorded' | 'incident.opened' | 'incident.resolved'>; enabled: boolean;
  /** Expected revision on write; zero creates. */
  revision: number;
};
export type WorkspaceEvent = {
  id: string; sequence: string; type: 'pool.changed' | 'evaluation.recorded' | 'incident.opened' | 'incident.resolved' | 'subscription.test'; schema_version: 1; occurred_at: string;
  resource: { kind: 'pool' | 'evaluation' | 'incident' | 'subscription'; slug: string; revision: number; run?: string };
};
export type EventDelivery = {
  id: string; subscription_revision: number; sequence: string;
  state: 'pending' | 'sending' | 'delivered' | 'failed' | 'cancelled'; attempts: number;
  response_status: number | null; failure_kind: 'transport' | 'destination' | 'signature' | 'http' | 'authority' | 'superseded' | 'exhausted' | null;
  updated_at: string; lease_expires_at: string | null; lease_expired: boolean; next_attempt_at: string | null;
};
function eventSubscriptionSlug(slug: string): string {
  workspacePoolSlug(slug);
  if (['log', 'deliveries', 'test'].includes(slug)) throw new TypeError('Use a readable subscription slug');
  return slug;
}

export type EvaluationDefinition = {
  slug: string; name: string; task: string; rubric: string;
  protocol: 'chat' | 'responses' | 'messages' | 'embeddings' | 'generate_content';
  revision: number; samples: Array<{reference: string; request_sha256: string}>;
};
export type EvaluationRunSubmission = {
  slug: string; name: string; evaluation_revision: number;
  evaluator: {kind: 'agent' | 'check'; name: string; version: string};
  results: Array<{sample: string; attempt_id: string; verdict: 'accepted' | 'rejected' | 'unknown'; reason?: string | null}>;
};
/** Immutable attributed evidence; unknown fields remain forward compatible. */
export type EvaluationSummary = {
  samples: number; verified_inputs: number; unverified_inputs: number;
  verdicts: Partial<Record<'accepted' | 'rejected' | 'unknown', number>>;
  attempts: number; unknown_charge_attempts: number;
  customer_charge_totals: Array<{dimension: string; amount: string}>;
  cost_per_accepted: {dimension: string; numerator: string; denominator: number} | null;
  cost_per_accepted_basis: 'all_attempts_in_submitted_operations';
  duration_basis: 'evaluated_attempt_only';
};
export type EvaluationRunBrief = {
  slug: string; name: string; evaluation_revision: number; created_at: string;
  evaluator: EvaluationRunSubmission['evaluator']; summary: EvaluationSummary;
};
export type EvaluationReceipt = {
  slug: string; name: string; evaluation: string; evaluation_revision: number;
  definition: EvaluationDefinition; evaluator: EvaluationRunSubmission['evaluator'];
  submitter: {kind: 'delegated_agent_key'; label: string; key_id: string};
  capture: {consistency: 'repeatable_read'; started_at: string; finished_at: string};
  results: Array<{
    sample: string; request_sha256: string; input_match: 'verified' | 'unverified';
    source_binding: Record<string, unknown> | null; evaluated_attempt_id: string; operation_id: string;
    judgment: {verdict: 'accepted' | 'rejected' | 'unknown'; reason: string | null; source: 'submitter_reported'};
    duration_ms: number | null;
    attempts: Array<{
      attempt_id: string; model: string; provider_model: string | null; execution: string;
      duration_ms: number | null;
      customer_charge: {status: string; currency: string | null; amount_nanos: string | null; unit: Record<string, unknown> | null};
      [key: string]: unknown;
    }>;
    pool_selections: Array<{slug: string; revision: number; selected_model: string}>;
  }>;
  summary: EvaluationSummary;
};
export type EvaluationComparison = {
  left: string; right: string; same_task_protocol_and_rubric: boolean; same_evaluator: boolean;
  quality_comparable: boolean; matched_verified_samples: number; shared_operations: number;
  left_unmatched_samples: number; right_unmatched_samples: number;
  left_summary: EvaluationSummary; right_summary: EvaluationSummary;
};
export type EvaluationPage<T> = {data: T[]; next_after: string | null};
function evaluationSlug(value: string): string {
  if (typeof value !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) || value.length > 80) throw new TypeError('Use a readable evaluation/run slug');
  return value;
}
function evaluationRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Use a positive evaluation revision');
  return value;
}
export class NiuClient {
  listEvaluations(after?: string, options?: RequestOptions): Promise<EvaluationPage<EvaluationDefinition>> {
    return this.request(`/evaluations${after === undefined ? '' : `?after=${evaluationSlug(after)}`}`, undefined, options);
  }
  getEvaluation(slug: string, revision?: number, options?: RequestOptions): Promise<EvaluationDefinition> {
    return this.request(`/evaluations/${evaluationSlug(slug)}${revision === undefined ? '' : `?revision=${evaluationRevision(revision)}`}`, undefined, options);
  }
  async setEvaluation(configuration: EvaluationDefinition, options: RequestOptions = {}): Promise<EvaluationDefinition> {
    if (!Number.isSafeInteger(configuration.revision) || configuration.revision < 0) throw new TypeError('Use the current expected revision, or zero to create');
    return await readPayload(await this.send(`/evaluations/${evaluationSlug(configuration.slug)}`, configuration, options, 'application/json', 'PUT')) as EvaluationDefinition;
  }
  fingerprintEvaluationRequest(protocol: EvaluationDefinition['protocol'], request: Record<string, unknown>, options?: RequestOptions): Promise<{request_sha256: string; fingerprint_version: 1; protocol: string; inference_performed: false}> {
    return this.request('/evaluations/fingerprint', {protocol, request}, options);
  }
  /** Snapshot discovery: restart pagination for new work. Absence does not prove no execution. */
  listEvaluationAttempts(slug: string, revision: number, sample: string, after?: string, options?: RequestOptions): Promise<EvaluationPage<Record<string, unknown>>> {
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(sample)) throw new TypeError('Use the definition sample reference');
    if (after !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(after)) throw new TypeError('Use the returned attempt cursor');
    const query = new URLSearchParams({revision: String(evaluationRevision(revision)), sample});
    if (after !== undefined) query.set('after',after);
    return this.request(`/evaluations/${evaluationSlug(slug)}/attempts?${query}`, undefined, options);
  }
  listEvaluationRuns(slug: string, after?: string, options?: RequestOptions): Promise<EvaluationPage<EvaluationRunBrief>> {
    return this.request(`/evaluations/${evaluationSlug(slug)}/runs${after === undefined ? '' : `?after=${evaluationSlug(after)}`}`, undefined, options);
  }
  /** No inference. Same slug/submission replays the original immutable receipt. */
  recordEvaluationRun(slug: string, submission: EvaluationRunSubmission, options?: RequestOptions): Promise<EvaluationReceipt> {
    return this.request(`/evaluations/${evaluationSlug(slug)}/runs`, submission, options);
  }
  getEvaluationRun(slug: string, run: string, options?: RequestOptions): Promise<EvaluationReceipt> {
    return this.request(`/evaluations/${evaluationSlug(slug)}/runs/${evaluationSlug(run)}`, undefined, options);
  }
  compareEvaluationRuns(slug: string, left: string, right: string, options?: RequestOptions): Promise<EvaluationComparison> {
    return this.request(`/evaluations/${evaluationSlug(slug)}/compare?left=${evaluationSlug(left)}&right=${evaluationSlug(right)}`, undefined, options);
  }

  /** Requires events:read; never returns a signing secret. */
  listEventSubscriptions(options?: RequestOptions): Promise<{ data: EventSubscription[]; limit: 32 }> {
    return this.request('/events', undefined, options);
  }
  getEventSubscription(slug: string, options?: RequestOptions): Promise<{ data: EventSubscription; processed_cursor: string; authorization_active: boolean }> {
    return this.request(`/events/${eventSubscriptionSlug(slug)}`, undefined, options);
  }
  /** Requires events:write. Creation/rotation returns a secret ONCE: persist privately and never log it. No automatic retry on lost responses. */
  async setEventSubscription(configuration: EventSubscription, rotateSecret = false, options: RequestOptions = {}): Promise<{ data: EventSubscription; signing_secret?: string }> {
    if (!Number.isSafeInteger(configuration.revision) || configuration.revision < 0) throw new TypeError('Use the current expected revision, or zero to create');
    const response = await this.send(`/events/${eventSubscriptionSlug(configuration.slug)}`, { configuration, rotate_secret: rotateSecret }, options, 'application/json', 'PUT');
    return await readPayload(response) as { data: EventSubscription; signing_secret?: string };
  }
  listWorkspaceEvents(after = '0', options?: RequestOptions): Promise<{ data: WorkspaceEvent[]; has_more: boolean; next_after: string; retention: 'no_pruning' }> {
    if (!/^[0-9]+$/.test(after) || after.length > 19 || BigInt(after) > 9223372036854775807n) throw new TypeError('Use the returned decimal event cursor');
    return this.request(`/events/log?after=${after}`, undefined, options);
  }
  /** Reconcile one workspace-local incident reference from an event. */
  getWorkspaceIncidentEvent(reference: string, options?: RequestOptions): Promise<{ data: { reference: string; model: string; owner_funded: boolean; status: 'active' | 'resolved'; recovered_at: string | null; notification: { state: 'not_configured' | 'authority_inactive' | 'queued' | 'sending' | 'delivered' | 'failed' | 'partial'; event: 'opened' | 'resolved'; subscribers: number; authorized: number; delivered: number; failed: number; cancelled: number; queued: number; sending: number; last_attempt_at: string | null } } }> {
    if (!/^incident-[0-9a-f]{32}$/.test(reference)) throw new TypeError('Use the workspace incident event reference');
    return this.request(`/incidents/${reference}`, undefined, options);
  }
  getEventSubscriptionHistory(slug: string, before?: number, options?: RequestOptions): Promise<{ data: EventSubscription[]; next_before: number | null }> {
    if (before !== undefined && (!Number.isSafeInteger(before) || before < 1)) throw new TypeError('Use a positive revision cursor');
    return this.request(`/events/${eventSubscriptionSlug(slug)}/history${before === undefined ? '' : `?before=${before}`}`, undefined, options);
  }
  getEventDeliveries(slug: string, options?: RequestOptions): Promise<{ data: EventDelivery[]; limit: 100 }> {
    return this.request(`/events/${eventSubscriptionSlug(slug)}/deliveries`, undefined, options);
  }
  /** Queues a targeted test; this is not receiver acknowledgement. Repetition creates a new event. */
  testEventSubscription(slug: string, revision: number, options?: RequestOptions): Promise<{ data: { id: string; sequence: string; type: 'subscription.test'; subscription_revision: number; delivery: 'queued' } }> {
    if (!Number.isSafeInteger(revision) || revision < 1) throw new TypeError('Use the current subscription revision');
    return this.request(`/events/${eventSubscriptionSlug(slug)}/test`, { revision }, options);
  }
  /** Requires delegated pools:read. No inference or live qualification occurs. */
  listPools(after?: string, options?: RequestOptions): Promise<{ data: WorkspaceModelPool[]; has_more: boolean; next_after: string | null }> {
    return this.request(`/routing${after === undefined ? '' : `?after=${workspacePoolSlug(after)}`}`, undefined, options);
  }
  getPool(slug: string, options?: RequestOptions): Promise<{ data: WorkspaceModelPool }> {
    return this.request(`/routing/${workspacePoolSlug(slug)}`, undefined, options);
  }
  /** Non-dispatching policy/metadata simulation; never proves live access or full input validity. */
  previewPool(configuration: WorkspaceModelPool, context?: WorkspacePoolPreviewContext, options?: RequestOptions): Promise<{ data: WorkspacePoolPreview }> {
    workspacePoolSlug(configuration.slug);
    return this.request('/routing/preview', { configuration, ...(context === undefined ? {} : { context }) }, options);
  }

  /** Requires delegated pools:write. Conflicts must be read and reconciled; never automatically replay. */
  async setPool(configuration: WorkspaceModelPool, options: RequestOptions = {}): Promise<{ data: WorkspaceModelPool }> {
    if (!Number.isSafeInteger(configuration.revision) || configuration.revision < 0) throw new TypeError('A nonnegative expected revision is required');
    const response = await this.send(`/routing/${workspacePoolSlug(configuration.slug)}`, configuration, options, 'application/json', 'PUT');
    return await readPayload(response) as { data: WorkspaceModelPool };
  }
  /** Soft-delete the current pool revision; the slug and immutable history stay reserved. */
  async deletePool(slug: string, revision: number, options: RequestOptions = {}): Promise<void> {
    if (!Number.isSafeInteger(revision) || revision < 1) throw new TypeError('Use the current pool revision');
    await this.send(`/routing/${workspacePoolSlug(slug)}?revision=${revision}`, undefined, options, 'application/json', 'DELETE');
  }
  getPoolHistory(slug: string, before?: number, options?: RequestOptions): Promise<{ data: WorkspaceModelPool[]; next_before: number | null }> {
    if (before !== undefined && (!Number.isSafeInteger(before) || before <= 0)) throw new TypeError('A positive revision cursor is required');
    return this.request(`/routing/${workspacePoolSlug(slug)}/history${before === undefined ? '' : `?before=${before}`}`, undefined, options);
  }
  /** Latest 100 selections; retrieve generation diagnostics for terminal state and charges. */
  getPoolSelections(slug: string, options?: RequestOptions): Promise<{ data: WorkspacePoolSelection[] }> {
    return this.request(`/routing/${workspacePoolSlug(slug)}/selections`, undefined, options);
  }
  /**
   * Explicit System 1 structured decision. Requires a concrete workspace Chat
   * model with declared structured-output support and a key grant; pool/Auto
   * aliases are rejected so routing cannot substitute a generated response.
   * A null decision is an explicit abstention. Inspect evidence and use the
   * returned x-niu-attempt-id generation record for authoritative charges.
   */
  createDecision(request: DecisionRequest, options?: RequestOptions): Promise<DecisionResult> {
    validateDecisionRequest(request);
    return this.request('/decisions', request, options);
  }
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
    if (options.evaluation !== undefined) {
      if (typeof options.evaluation !== 'string' || options.evaluation.length > 200 || !/^[a-z0-9]+(-[a-z0-9]+)*@[1-9][0-9]*\/[A-Za-z0-9_.-]+$/.test(options.evaluation)) throw new TypeError('Use evaluation-slug@revision/sample');
      headers.set('x-niu-evaluation', options.evaluation);
    }
    if (options.routingContext !== undefined) {
      const context = options.routingContext;
      const task = context?.task;
      const stage = context?.stage;
      if (task === undefined && stage === undefined) throw new TypeError('routingContext requires task or stage');
      for (const value of [task, stage]) {
        if (value !== undefined && (typeof value !== 'string' || value.length > 64 || !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(value))) {
          throw new TypeError('routingContext task and stage must be lowercase tokens up to 64 characters');
        }
      }
      headers.set('x-niu-routing-context', JSON.stringify({ ...(task === undefined ? {} : { task }), ...(stage === undefined ? {} : { stage }) }));
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
  /** Routing evidence from response headers; does not prove terminal generation or task acceptance. */
  readonly pool?: { slug: string; revision: string | null; selectedModel: string | null; evidence: string | null };
  readonly status: number;
  readonly requestId: string | null;
  readonly attemptId: string | null;
  readonly operationId: string | null;
};

export type WorkspaceRoutingContext = { task?: string; stage?: string };
export type RequestOptions = {
  /** Opt-in binding: evaluation-slug@revision/sample. Requires evaluations:read. */
  evaluation?: string;
  /**
   * Optional bounded task context for an explicitly selected semantic Auto
   * policy on a `pool/<slug>` request. Values are lowercase tokens up to 64
   * characters. Sent as `x-niu-routing-context`; not forwarded upstream.
   */
  routingContext?: WorkspaceRoutingContext;
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
export type { ProviderCatalogMetadata, ProviderCatalogModel, ProviderModelCheck, ProviderModelInput, ProviderModel, ProviderModelAvailability, ProviderCredentialCreateInput, ProviderCredentialUpdateInput, ProviderMember, ProviderMemberUpdate, ProviderBusiness, ProviderBusinessCreate, ProviderProfile, ProviderProfileUpdate, ProviderCredential, ProviderCooldown, ProviderRequestRateLimit, ProviderRequestRateLimitRevision, ProviderRateInput, ProviderOffer, ProviderOfferRevision, ProviderOfferHistory, ProviderSettlement, ProviderSettlementPage, ProviderSettlementInput, ProviderSettlementPreview, SupplierSettlementPreview, ProviderEarning, ProviderEarningPage, ProviderSettlementQuery, ProviderAccountInput, ProviderAccount, SupplierCatalogMetadata, SupplierCatalogModel, SupplierModelCheck, SupplierModelInput, SupplierModel, SupplierModelAvailability, SupplierCredentialCreateInput, SupplierCredentialUpdateInput, SupplierMember, SupplierMemberUpdate, SupplierBusiness, SupplierProfile, SupplierProfileUpdate, SupplierCredential, RequestUsageReconciliation, VendorCooldown, VendorRequestRateLimit, VendorRequestRateLimitRevision, WorkspaceKey, WorkspaceKeyPage, WorkspaceKeyDetail, WorkspaceKeyDetailPage, WorkspaceKeyUpdateInput, WorkspaceKeySpendingLimitPatch, WorkspaceKeyRequestRateLimitPatch, WorkspaceKeyTokenRateLimitPatch, WorkspaceKeyConcurrencyLimitPatch, WorkspaceKeyIpPolicyPatch, NiuAdminOptions, CustomerTariffInput, CustomerTariff, CustomerTariffHistory, CustomerTariffHistoryEntry, CustomerBalance, CustomerBalanceReservation, CustomerBalanceReservationQuery, CustomerChargeReconciliation, CustomerTopupInput, CustomerTopup, CustomerPaymentMethods, CustomerBalanceTransaction, CustomerBalanceReversalInput, RetailTextEnrollmentPublication, RetailTextEnrollment, RetailSchedule, RetailStandardPublication, RetailPromotionPublication, RetailPromotionRetirement, RetailPublicationResult, RetailPriceRecord, RetailSelection, RetailPriceHistory, RetailPromotionPage, CustomerFinancialSummary, PreparedCustomerBalanceGrant, CustomerBalanceGrantInput, CustomerBalanceGiftCorrectionInput, IssuedCustomerBalanceGrant, CustomerBalancePolicyInput, CustomerBalancePolicyHistory, CustomerBilling, CustomerInvoicePage, LedgerHistoryQuery, SupplierRateInput, SupplierOffer, SupplierOfferRevision, SupplierOfferHistory, SupplierSettlement, SupplierSettlementPage, SupplierSettlementInput, SupplierEarning, SupplierEarningPage, SupplierSettlementQuery, TenantScope, WorkspaceScope, MediaOperationHistoryContext, MediaOperationHistoryQuery, ChatResult, ChatTurn, ChatSession, ChatSessionPage, ChatSessionPageQuery, ChatExport, ChatAttachment, GuardrailAccessRule, KeyGuardrailMode, WorkspaceDetectorDescription, WorkspaceImageDetectorDescription, WorkspaceMediaDetectorDescription, ImageDetectorPreviewInput, ImageDetectorPreviewResult, GuardrailPolicy, GuardrailPreview, GuardrailInputTest, GuardrailInputTestResult, GuardrailOutputTest, GuardrailOutputTestResult, RequestGuardrailDecision, SupplierAccountInput, SupplierAccount, GatewayActivityOutcome, GatewayTaskEvidence, GatewayActivityEntry, GatewayAdmissionDenial, GatewayActivityPage, GatewayActivityQuery, GatewayActivityExportQuery, GatewayActivitySummary, GatewayChargeSummary, GatewayUsageSummary, RequestTiming, RequestFailure, RequestPayload } from './admin.js';

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

export type { ModelRoutePool, ModelRoutePoolCandidate, ModelRoutePoolRuleConditions, ModelRoutePoolRule, ModelRoutePoolDefaultAction, ModelRoutePoolBillingMode, ModelRoutePoolInput, ModelRoutePoolRevision, ModelRoutePoolPreviewInput, ModelRoutePoolPreviewResult, ModelRoutePoolAuditCandidate, ModelRoutePoolAudit } from './admin.js';

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
