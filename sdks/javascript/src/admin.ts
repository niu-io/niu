import { NiuAPIError, type RequestOptions, type VideoModelList, type VideoResultAvailability, type VideoCreateRequest, type VideoEstimate, type VideoJobHistory, type VideoJobHistoryQuery, type VideoJobState, type VideoJobBilling, type VideoTransportTimings } from './index.js';

/** Deployment display settings only; no credentials or procurement configuration. */
export type BrandingSettings = {
  display_name: string; default_appearance: 'system' | 'light' | 'dark';
  logo_data_url?: string | null; favicon_data_url?: string | null;
  light: Partial<Record<BrandingColorToken, string>>;
  dark: Partial<Record<BrandingColorToken, string>>;
};
export type BrandingColorToken = 'background' | 'foreground' | 'primary' | 'primary-foreground' | 'sidebar' | 'sidebar-foreground' | 'accent' | 'accent-foreground';
export type BrandingConfiguration = { data: { revision: string; settings: BrandingSettings } };

export type TenantScope = { organizationId: string; projectId: string };
export type WorkspaceSpendingLimit = { currency: string; limit_nanos: string; committed_nanos: string; revision: string };
export type WorkspaceSpendingAccount = { currency: string; limit_nanos: string | null; committed_nanos: string; revision: string | null };
export type WorkspaceSpendingLimitRevision = { currency: string; limit_nanos: string; revision: string; recorded_at: string | null; source: 'configuration' | 'migration_baseline'; actor_kind: 'unknown' | 'installation' | 'member'; actor_name: string | null };
/** Agreed Supplier rates in currency nanounits per million tokens. */
export type SupplierRateInput = {
  model_alias: string; currency: string; prompt_rate: string; completion_rate: string;
  expected_revision: string | null;
};
/** Customer selling rates, independent from Supplier procurement prices. */
export type CustomerTariffInput = SupplierRateInput;
export type CustomerTariff = Omit<CustomerTariffInput, 'expected_revision'> & { revision: string };
/** Optional versioned output mapping inside model capabilities.video_schema. Estimates are not liability bounds. */
export type VideoOutputSchema = {
  specifications: Array<{ resolution: string; ratio: string; width: number; height: number }>;
  estimator: 'SeedancePixelsV1' | 'OutputSecondsV1'; estimator_revision: string;
};
export type ExactMediaQuantity = { numerator: string; denominator: string };
export type MediaBillingDimensions = { model: string; channel: string; resolution: string; reference_video: boolean };
/** Customer selling configuration; Supplier purchase prices do not belong here. */
export type CustomerMediaRateCard = {
  revision: string; vendor_id: string; vendor_revision: number; model_revision: number;
  schema_revision: string; offer_revision: string;
  tariff: {
    revision: string; dimensions: MediaBillingDimensions; meter: string; currency: string;
    decimal_places: number; amount_units: number; per_quantity: ExactMediaQuantity;
    minimum_quantity: ExactMediaQuantity; rounding: 'Down' | 'Up' | 'HalfEven';
    effective_from: number; effective_until: number | null;
  };
  discounts: Array<{
    revision: string; dimensions: MediaBillingDimensions | null; offer: string | null; customer: string | null;
    effective_from: number; effective_until: number | null; priority: number;
    stacking: 'Exclusive' | 'Multiply'; multiplier: ExactMediaQuantity;
  }>;
  maximum_quantity: ExactMediaQuantity; liability_qualification_revision: string;
};
/** Confidential Supplier purchase card; never submit to customer selling configuration. */
export type SupplierMediaRateCard = Omit<CustomerMediaRateCard, 'vendor_id' | 'maximum_quantity' | 'liability_qualification_revision'>;
export type SupplierMediaRateRecord = {
  card: Omit<SupplierMediaRateCard, 'vendor_revision' | 'model_revision' | 'tariff' | 'discounts'> & {
    vendor_revision: string; model_revision: string;
    tariff: Omit<SupplierMediaRateCard['tariff'], 'amount_units' | 'effective_from' | 'effective_until'> & {
      amount_units: string; effective_from: string; effective_until: string | null;
    };
    discounts: Array<Omit<SupplierMediaRateCard['discounts'][number], 'effective_from' | 'effective_until'> & {
      effective_from: string; effective_until: string | null;
    }>;
  };
  retirement_effective_until: string | null; created_at: string | null;
};
/** Platform-administrator selling history, with exact amounts and timestamps. */
export type CustomerMediaRateRecord = Omit<SupplierMediaRateRecord, 'card'> & {
  card: SupplierMediaRateRecord['card'] & Pick<CustomerMediaRateCard, 'vendor_id' | 'maximum_quantity' | 'liability_qualification_revision'>;
};
/** Platform-administrator current qualified offer bindings for media pricing configuration. */
export type SupplierMediaRateModel = {
  model_alias: string; api_key_name: string; offer_revision: string;
  vendor_revision: string; model_revision: string; schema_revision: string;
  channel: string; resolutions: string[]; reference_video: boolean;
};
/** Platform-administrator choices; vendor_id binds configuration and is never a display label. */
export type CustomerMediaRateModel = SupplierMediaRateModel & { vendor_id: string };
export type CustomerInvoiceInput = { from_ms: number; to_ms: number; currency: string; idempotency_key: string };
export type CustomerInvoiceLine = {
  model_alias: string; revision: string; currency: string; requests: string;
  prompt_tokens: string; completion_tokens: string; prompt_rate: string; completion_rate: string; amount_nanos: string;
};
export type CustomerBalance = {
  currency: string; balance_nanos: string; reserved_nanos: string; available_nanos: string;
  credit_limit_nanos: string; warning_threshold_nanos: string | null; policy_revision: string;
  low_balance: boolean; posted_credit_exhausted: boolean;
};
export type CustomerTopupInput = {
  currency?: string;
  payment_gateway?: 'epay' | 'stripe' | 'zhifux';
  amount_nanos: string; payment_method: string; idempotency_key: string;
};
export type CustomerPaymentMethods = {
  currency: string; available: boolean; payment_methods: string[];
  /** Selected integration; forward with currency to bind initiation to discovery. */
  payment_gateway: 'epay' | 'stripe' | 'zhifux' | null;
  unavailable_reason: 'integration_unavailable' | 'currency_account_missing' | null;
};
/** Saved customer payment status. IDs are routing references, not display labels. */
export type CustomerTopup = {
  id: string; currency: string; amount_nanos: string; payment_method: string;
  status: 'reconciliation_required' | 'pending' | 'paid' | 'closed'; checkout_url: string | null;
};
/** Append-only company ledger entry; signed currency nanounits remain exact strings. */
export type CustomerBalanceTransaction = {
  id: string; kind: 'funding' | 'charge' | 'refund' | 'funding_reversal' | 'adjustment';
  currency: string; amount_nanos: string; created_at: string; reverses_entry_id: string | null;
};
export type CustomerBilling = {
  balances: Array<{ currency: string; charged_nanos: string; unbilled_nanos: string; due_nanos: string; paid_nanos: string }>;
  unresolved: string; unpriced: string; tariffs: CustomerTariff[];
  invoices: Array<{ id: string; from_ms: number; to_ms: number; currency: string; amount_nanos: string; created_at: string; status: 'issued' | 'paid'; payment_reference: string | null }>;
};
export type SupplierOffer = {
  id: string; model_alias: string; revision: string; active: boolean; qualified: boolean; route_ready: boolean;
} & ({ rate_kind?: 'text'; currency: string; prompt_rate: string; completion_rate: string }
  | { rate_kind: 'media'; currency: null; prompt_rate: null; completion_rate: null });
/** Draft media model bindings. Availability and purchase-rate qualification are separate. */
export type SupplierMediaOfferModel = {
  model_alias: string; api_key_name: string; vendor_id: string;
  vendor_revision: string; model_revision: string; schema_revision: string;
  channel: string; offer_revision: string | null;
};
/** Client-owned immutable receipt; explicitly replay the same document after uncertainty. */
export type SupplierMediaOfferInput = {
  revision: string; model_alias: string; vendor_id: string; vendor_revision: number | string;
  model_revision: number | string; schema_revision: string; expected_revision: string | null;
};
/** Digests of reviewed private evidence; a digest alone does not establish supply rights. */
export type SupplierQualificationInput = {
  supply_rights_sha256: string; supply_capability_sha256: string;
  data_handling_sha256: string; valid_until_ms: number;
};
export type SupplierOfferQualificationInput = {
  rate_revision: string; model_identity_sha256: string;
  protocol_matrix_sha256: string; protocol_matrix_version: string;
  data_handling_sha256: string; availability_sha256: string;
  agreed_rates_sha256: string; valid_until_ms: number;
};
export type GuardrailAccessRule = { mode: 'inherit' | 'allow_all' | 'deny_all' } | { mode: 'allow_list'; values: string[] };
export type WorkspaceDetectorDescription = {
  detector: string; schema_version: 1; detector_revision: string; configuration_fingerprint: string;
  recipient: string; region: string; retention: string; processing_guarantees: 'declared_unverified';
  content_sent: 'request_text_after_local_redaction'; credential_source: 'server_environment'; timeout_ms: number;
  concurrency: number; max_text_bytes: number; max_response_bytes: 4096;
  external_charge: 'unknown' | 'declared_unmetered'; customer_billing: 'not_integrated'; policy_activation: boolean;
};
export type WorkspaceImageDetectorDescription = {
  detector: string; schema_version: 2; detector_revision: string; configuration_fingerprint: string;
  recipient: string; region: string; retention: string; processing_guarantees: 'declared_unverified';
  content_sent: 'exact_encoded_image'; timeout_ms: number; maximum_encoded_bytes: number;
  maximum_width: number; maximum_height: number; maximum_decoded_bytes: number;
  concurrency: number; declared_unmetered: boolean; policy_activation: false;
};
export type ImageDetectorPreviewInput = {
  consent: { configuration_fingerprint: string; consent_to_image_processing: true };
  image: string;
};
export type ImageDetectorPreviewResult = {
  outcome: 'clear' | 'matched' | 'indeterminate';
  reason: 'inspected_image' | 'image_match' | 'inspection_unavailable';
  synthetic: true; enforcement: false; policy_activation: false;
};
export type GuardrailPolicy = { schema_version: 1; name: string; models: GuardrailAccessRule; providers: GuardrailAccessRule; input_rules?: GuardrailInputTest['rules']; input_detectors?: Array<{ detector: string; configuration_fingerprint: string; consent_to_external_processing: true }>; image_detectors?: Array<{ detector: string; configuration_fingerprint: string; consent_to_image_processing: true }>; output?: { mode: 'buffered_full' | 'observe_only'; rules: GuardrailInputTest['rules'] } };
export type RequestGuardrailDecision = {
  stage: 'dispatch'; outcome: 'allowed'; coverage: 'model_provider_access'; enforcer_version: 'access-v1';
  output_inspection: { outcome: 'allowed' | 'redacted' | 'blocked' | 'indeterminate'; reason: 'inspected_text' | 'pattern_denial' | 'unsupported_content' | 'resource_limit' | 'inspection_unavailable'; mode: 'buffered_full'; coverage: 'local_text'; enforcer_version: 'local-output-v1'; elapsed_ms: number } | null;
  output_observation: { outcome: 'clear' | 'matched' | 'indeterminate'; reason: 'inspected_text' | 'pattern_match' | 'unsupported_content' | 'resource_limit' | 'inspection_unavailable'; mode: 'observe_only'; enforcement: false; coverage: 'local_text'; enforcer_version: 'local-output-v1'; elapsed_ms: number } | null;
  input_detectors: Array<{ detector: string; configuration_fingerprint: string; stage: 'input'; coverage: 'local_text'; outcome: 'clear' | 'matched' | 'indeterminate'; reason: string; elapsed_ms: number }>;
  input_inspection: { outcome: 'allowed' | 'redacted'; coverage: 'local_text'; enforcer_version: 'local-input-v1'; elapsed_ms: number } | null;
  workspace_revision: number | null; workspace_policy_name: string | null;
  key_policy_revision: number | null; key_policy_name: string | null;
  key_assignment_revision: number | null; recorded_at: string;
};
export type GuardrailPreparationDenial = {
  stage: 'preparation'; outcome: 'blocked'; coverage: 'model_provider_access' | 'local_input' | 'external_input' | 'output_configuration'; enforcer_version: 'access-v1' | 'local-input-v1' | 'external-input-v1' | 'buffer-mode-v1';
  reason: 'model_denied' | 'provider_denied' | 'unsupported_policy' | 'input_blocked' | 'input_unsupported' | 'input_resource_limit' | 'input_unavailable' | 'output_incompatible' | 'detector_blocked' | 'detector_unavailable' | 'detector_unsupported';
  key_name: string; workspace_policy_name: string | null; key_policy_name: string | null;
  workspace_revision: number | null; key_policy_revision: number | null; key_assignment_revision: number | null;
  recorded_at: string;
};
export type GuardrailInputTest = {
  protocol: 'chat' | 'responses' | 'embeddings';
  rules: Array<({ pattern: string; preset?: never } | { preset: 'email_v1' | 'api_key_prefix_v1' | 'niu_api_key_v1'; pattern?: never }) & { action: 'block' | 'redact' }>;
  request: unknown;
};
export type GuardrailInputTestResult = {
  outcome: 'allowed' | 'blocked' | 'indeterminate';
  reason: 'inspected_text' | 'pattern_denial' | 'unsupported_content' | 'resource_limit' | 'invalid_pattern';
  redacted: boolean;
  synthetic: true;
  enforcement: false;
};
export type GuardrailOutputTest = { mode?: 'buffered_full' | 'observe_only'; protocol: 'chat' | 'responses'; rules: GuardrailInputTest['rules']; response: unknown };
export type GuardrailOutputTestResult = (GuardrailInputTestResult & { mode: 'buffered_full'; coverage: 'local_text' }) | { outcome: 'clear' | 'matched' | 'indeterminate'; reason: 'inspected_text' | 'pattern_match' | 'unsupported_content' | 'resource_limit' | 'invalid_pattern'; redacted: false; synthetic: true; enforcement: false; mode: 'observe_only'; coverage: 'local_text' };
export type GuardrailPreview = { allowed: boolean; coverage: 'model_provider_access'; route_availability_checked: false };
export type ChatResult = {
  model: string; content: string; elapsedMs: number;
  phase: 'connecting' | 'streaming' | 'complete' | 'failed' | 'cancelled';
  promptTokens?: number | null; completionTokens?: number | null; totalTokens?: number | null;
  attemptId?: string | null; error?: string | null;
  customerChargeNanos?: string | null; customerChargeCurrency?: string | null;
  customerChargeStatus?: 'charged' | 'owner_funded' | 'pending' | 'unpriced' | 'not_charged' | 'unknown';
};
export type ChatAttachment = { name: string; type: string; content: string };
export type ChatTurn = { prompt: string; results: ChatResult[]; attachments?: ChatAttachment[] };
/** Reconstruct completed text exchanges for one comparison branch. */
export function chatBranchMessages(turns: readonly ChatTurn[], model: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!model.trim()) throw new Error('A branch model is required');
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const turn of turns) {
    const matching = turn.results.filter(result => result.model === model);
    if (matching.length > 1) throw new Error('Duplicate model results in a Chat turn');
    const result = matching[0];
    if (result?.phase !== 'complete') continue;
    messages.push({ role: 'user', content: turn.prompt }, { role: 'assistant', content: result.content });
  }
  return messages;
}
export type ChatSession = ChatTurn & {
  id?: string; title?: string; createdAt: number; turns?: ChatTurn[];
  attachments?: ChatAttachment[];
  settings?: { systemPrompt?: string; maxTokens?: number; temperature?: number; logPayloads?: boolean };
};
/** Portable conversation content; excludes internal IDs, errors and accounting. */
export type ChatExport = {
  format: 'niu-chat'; version: 1; title?: string; createdAt?: number;
  turns: Array<{prompt: string; results: Array<Pick<ChatResult, 'model' | 'content' | 'phase'>>; attachments?: ChatAttachment[]}>;
};
export type SupplierAccountInput = {
  provider: string; plan: string;
  authentication_mode: 'api_key' | 'oauth_refresh';
  billing_mode: 'metered_api' | 'subscription';
  credential_reference: string;
  concurrency_limit: number;
};
export type SupplierAccount = Omit<SupplierAccountInput, 'credential_reference'> & {
  id: string; credential_revision: number; health: string; refreshing: boolean;
};
export type QuotaObservation = {
  window_key: string;
  unit: 'tokens' | 'requests' | 'millionths_of_window';
  remaining: string | null;
  maximum: string | null;
  observed_at_ms: number;
  valid_until_ms: number;
  resets_at_ms: number;
  source: string;
};
export type QuotaWindow = QuotaObservation & { fresh: boolean };
export type NiuAdminOptions = {
  adminToken: string;
  /** Administration API base; defaults to http://localhost:2555/admin/v1. */
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
};
export type ExecutionReceipt = { id: string; created: boolean };
export type WorkspaceKey = {
  id: string;
  revision: number;
  name: string;
  allowed_models: string[];
  expires_at_ms: number;
  /** Latest durable dispatch intent; null means no recorded dispatch, not no authentication. */
  last_used_at_ms: number | null;
  revoked: boolean;
  expired: boolean;
};
export type CollectorKeyView = {
  id: string;
  name: string;
  purpose: 'quota' | 'execution';
  created_at_ms: number;
  expires_at_ms: number;
  revoked: boolean;
  expired: boolean;
};
export type GatewayActivityOutcome = {
  authority: 'agent_claim' | 'deterministic_validator' | 'human_acceptance';
  result: 'accepted' | 'rejected' | 'inconclusive';
};
export type GatewayTaskEvidence = {
  execution_id: string;
  source: string;
  record_id: string;
  coverage: 'complete' | 'partial' | 'unknown';
  outcomes: GatewayActivityOutcome[];
};
export type GatewayActivityEntry = {
  attempt_id: string;
  operation_id: string;
  api_key_id: string | null;
  key_name: string | null;
  provider_model: string | null;
  timing: RequestTiming | null;
  task_id: string | null;
  task_evidence: GatewayTaskEvidence | null;
  /** Durable video route identity; absent on older servers. */
  request_kind?: 'video' | 'inference';
  model: string;
  created_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
  /** Legacy dispatch-to-completion interval; complete timing.total_ms includes gateway handling. */
  duration_ms: number | null;
  execution: string;
  /** Recorded output inspection only; null does not establish delivery or protection. */
  output_guardrail_outcome: 'allowed' | 'redacted' | 'blocked' | 'indeterminate' | null;
  usage_confidence: string;
  prompt_tokens: string | null;
  completion_tokens: string | null;
  cached_input_tokens: string | null;
  reasoning_output_tokens: string | null;
  /** Explicit terminal observations; Chat choice indexes, or index zero for a
   * whole Responses interruption. Null means unknown, not successful completion. */
  finish_reasons: Array<{ index: number; reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' }> | null;
  customer_charge_currency: string | null;
  customer_charge_nanos: string | null;
  customer_charge_status: 'charged' | 'owner_funded' | 'pending' | 'unpriced' | 'not_charged';
};
export type RequestTiming = {
  dispatch_ms: number | null; headers_ms: number | null; first_output_ms: number | null;
  total_ms: number; complete: boolean; http_status: number | null;
};
export type RequestPayload = {
  request: unknown; response: string; content_type: string;
  complete: boolean; truncated: boolean; expires_at: string;
};
export type GatewayUsageSummary = {
  request_count: number; usage_count: number; prompt_tokens: string;
  completion_tokens: string; unknown_usage_count: number;
};
export type GatewayActivitySummary = {
  /** Reported subsets only; coverage counts prevent treating partial sums as complete totals. */
  token_categories: {
    cached_input_tokens: string | null; cached_input_requests: number; cached_input_unknown_requests: number;
    reasoning_output_tokens: string | null; reasoning_output_requests: number; reasoning_output_unknown_requests: number;
  };
  charges_by_model: Array<GatewayChargeSummary & { model_alias: string }>;
  charges_by_key: Array<GatewayChargeSummary & { api_key_id: string | null; key_name: string | null }>;
  delivery_statuses: Array<{http_status: number | null; request_count: number}>;
  latency_percentiles: { boundary: 'gateway_body_ms'; sample_count: number; p50_ms: number | null; p95_ms: number | null; p99_ms: number | null };
  request_histogram: Array<{ start_ms: number; end_ms: number; request_count: number }>;
  request_count: number; usage_count: number; prompt_tokens: string; completion_tokens: string;
  /** Completed gateway body-consumption totals only; missing/incomplete timing is excluded. */
  timing_count: number; average_duration_ms: number | null;
  unresolved_customer_charge_count: number; unpriced_request_count: number; owner_funded_request_count: number;
  customer_charges: Array<{ currency: string; amount_nanos: string; charged_requests: number }>;
  usage_by_model: Array<GatewayUsageSummary & { model_alias: string }>;
  usage_by_key: Array<GatewayUsageSummary & { api_key_id: string | null; key_name: string | null }>;
};
export type GatewayChargeSummary = {
  currency: string | null; amount_nanos: string | null; request_count: number;
  charged_requests: number; unresolved_requests: number; owner_funded_requests: number;
  unpriced_requests: number; not_charged_requests: number;
};
export type GatewayActivityPage = { data: GatewayActivityEntry[]; next_cursor: string | null; summary: GatewayActivitySummary };
export type GatewayActivityQuery = {
  limit?: number; after?: string; fromMs?: number; toMs?: number;
  sort?: 'time_desc' | 'time_asc' | 'latency_desc' | 'input_desc' | 'output_desc';
  modelAlias?: string; apiKeyId?: string; httpStatus?: number | 'unknown';
  status?: 'not_sent' | 'may_have_executed' | 'confirmed_completed' | 'confirmed_not_executed' | 'output_withheld' | 'delivery_failed';
};

/** Full filtered range; pagination is intentionally unavailable. */
export type GatewayActivityExportQuery = Omit<GatewayActivityQuery, 'limit' | 'after'>;

/** Server-side bootstrap administration. Never expose the admin token to clients.
 * No implicit retries: a collector explicitly resubmits identical observations.
 */
/** Reviewed evidence references; creating this record does not enable dispatch. */
export interface OrdinaryAssetGroupInput {
  organization_id: string;
  project_id: string;
  idempotency_key: string;
  vendor_revision: number;
  credential_revision: number;
  name: string;
  description?: string;
}

/** Preparation only; no mutation dispatch or automatic retry. */
export interface OrdinaryAssetGroupDeletionConsentInput {
  organization_id: string;
  project_id: string;
  intent_id: string;
  consent_id: string;
  authorization_id: string;
  valid_for_seconds: number;
  confirm_cascade: true;
}
export interface OrdinaryAssetGroupDeletionConsentStatus {
  status: 'consented' | 'expired' | 'revoked' | 'unresolved' | 'acknowledged' | 'uncertain';
  created_at: string;
  expires_at: string;
  reason: string | null;
  duration_ms: number | null;
  dispatch_available: false;
}
export interface OrdinaryAssetGroupUpdateInput {
  organization_id: string;
  project_id: string;
  intent_id: string;
  update_id: string;
  name?: string;
  description?: string;
}
export interface OrdinaryAssetGroupUpdatePreparation {
  update_id: string;
  prepared: true;
  dispatch_available: false;
}

export interface OrdinaryAssetGroupUpdateAudit {
  update_id: string;
  intent_id: string;
  status: 'prepared' | 'unresolved' | 'acknowledged' | 'uncertain' | 'reconciled';
  created_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  reason: string | null;
  patch_status: 'retained' | 'erased' | 'expired';
  reconciliation_required: boolean;
}

export interface OrdinaryAssetGroupReadInput {
  organization_id: string;
  project_id: string;
  intent_id: string;
  read_id: string;
}

export interface OrdinaryAssetListingInput {
  organization_id: string;
  project_id: string;
  intent_id: string;
  listing_id: string;
  maximum_items: number;
  previous_listing_id?: string;
}
export interface OrdinaryAssetListing {
  listing_id: string;
  items: Array<{name: string; status: 'Active' | 'Processing' | 'Failed'; asset_type: 'Image' | 'Video' | 'Audio'; created_at: string; updated_at: string; last_inference_at: string | null}>;
  has_more: boolean;
}

/** Platform audit metadata, independently retained from descriptive page content. */
export interface OrdinaryAssetLookupInput {
  organization_id: string; project_id: string; listing_id: string; lookup_id: string; item_index: number;
}
export interface OrdinaryAssetLookupResult {
  lookup_id: string;
  asset: {name: string; status: 'Active' | 'Processing' | 'Failed'; asset_type: 'Image' | 'Video' | 'Audio'; created_at: string; updated_at: string; last_inference_at: string | null};
}
export interface OrdinaryAssetLookupAudit {
  lookup_id: string; listing_id: string; status: 'unresolved' | 'succeeded' | 'failed';
  asset_status: 'Active' | 'Processing' | 'Failed' | null;
  started_at: string; completed_at: string | null; duration_ms: number | null; reason: string | null;
}
export interface OrdinaryAssetListingAudit {
  listing_id: string;
  previous_listing_id: string | null;
  page_number: number;
  status: 'unresolved' | 'succeeded' | 'failed';
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  reason: string | null;
  item_count: number | null;
  has_more: boolean | null;
}

export interface AssetOperationAuthorizationInput {
  /** Omitted means creation only; read rights must be reviewed separately. */
  operation?: 'CreateAssetGroup' | 'GetAssetGroup' | 'ListAssets' | 'GetAsset' | 'UpdateAssetGroup' | 'DeleteAssetGroup' | 'CreateAsset';
  organization_id: string;
  project_id: string;
  vendor_revision: number;
  credential_revision: number;
  rights_sha256: string;
  protocol_sha256: string;
  data_handling_sha256: string;
  free_operation_sha256: string;
  valid_for_seconds: number;
}
export interface AssetOperationAuthorization extends Omit<AssetOperationAuthorizationInput, 'valid_for_seconds'> {
  id: string;
  operation: 'CreateAssetGroup' | 'GetAssetGroup' | 'ListAssets' | 'GetAsset' | 'UpdateAssetGroup' | 'DeleteAssetGroup' | 'CreateAsset';
  created_at: string;
  expires_at: string;
  revoked: boolean;
}

export interface AssetManagementConfiguration {
  revision: number;
  upstream_project: string;
  configured: boolean;
  dispatch_available: false;
}

export interface AssetManagementConfigurationInput {
  expected_revision: number;
  upstream_project: string;
  access_key: string;
  secret_key: string;
}

export class NiuAdminClient {
  private readonly token: string;
  private readonly base: string;
  private readonly requestFetch: typeof globalThis.fetch;

  /** Platform administrator read. Public display settings also exist at GET /v1/branding. */
  getBranding(options?: RequestOptions): Promise<BrandingConfiguration> {
    return this.request('/platform/branding', undefined, options);
  }

  /** Revision-checked save. Empty palettes inherit NIU.IO theme defaults. */
  saveBranding(expectedRevision: string, settings: BrandingSettings, options?: RequestOptions): Promise<BrandingConfiguration> {
    if (!/^(0|[1-9][0-9]*)$/.test(expectedRevision) || BigInt(expectedRevision) > 9223372036854775807n) throw new TypeError('A canonical branding revision is required');
    return this.request('/platform/branding', { expected_revision: expectedRevision, settings: {
      display_name: settings.display_name, default_appearance: settings.default_appearance,
      logo_data_url: settings.logo_data_url, favicon_data_url: settings.favicon_data_url,
      light: settings.light, dark: settings.dark,
    } }, options, 'PUT');
  }

  private dashboardVideoPath(scope: TenantScope, keyId: string): string {
    return `/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/keys/${uuid(keyId)}/video`;
  }

  /** Uses the member session and current key grants; never requires the key secret. */
  listDashboardVideoJobs(scope: TenantScope, keyId: string, query: VideoJobHistoryQuery = {}, options?: RequestOptions): Promise<VideoJobHistory> {
    if (query.limit !== undefined && (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100)) throw new TypeError('Video history limit must be an integer from 1 to 100');
    const parameters = new URLSearchParams();
    if (query.before !== undefined) parameters.set('before', uuid(query.before));
    if (query.limit !== undefined) parameters.set('limit', String(query.limit));
    return this.request(`${this.dashboardVideoPath(scope, keyId)}/jobs${parameters.size ? `?${parameters}` : ''}`, undefined, options);
  }

  listDashboardVideoModels(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<VideoModelList> {
    return this.request(`${this.dashboardVideoPath(scope, keyId)}/models`, undefined, options);
  }

  estimateDashboardVideo(scope: TenantScope, keyId: string, input: VideoCreateRequest, options?: RequestOptions): Promise<VideoEstimate> {
    return this.request(`${this.dashboardVideoPath(scope, keyId)}/estimate`, input, options);
  }

  createDashboardVideoJob(scope: TenantScope, keyId: string, input: VideoCreateRequest, options?: RequestOptions): Promise<VideoJobState> {
    return this.request(`${this.dashboardVideoPath(scope, keyId)}/jobs`, input, options);
  }

  getDashboardVideoJob(scope: TenantScope, keyId: string, jobId: string, options?: RequestOptions): Promise<VideoJobState> {
    return this.request(`${this.dashboardVideoPath(scope, keyId)}/jobs/${uuid(jobId)}`, undefined, options);
  }

  getDashboardVideoBilling(scope: TenantScope, keyId: string, jobId: string, options?: RequestOptions): Promise<VideoJobBilling> {
    return this.request(`${this.dashboardVideoPath(scope, keyId)}/jobs/${uuid(jobId)}/billing`, undefined, options);
  }

  getDashboardVideoTimings(scope: TenantScope, keyId: string, jobId: string, options?: RequestOptions): Promise<VideoTransportTimings> {
    return this.request(`${this.dashboardVideoPath(scope, keyId)}/jobs/${uuid(jobId)}/timings`, undefined, options);
  }

  /** May query the original Supplier job; never resubmits generation. */
  refreshDashboardVideoJob(scope: TenantScope, keyId: string, jobId: string, options?: RequestOptions): Promise<VideoJobState> {
    return this.request(`${this.dashboardVideoPath(scope, keyId)}/jobs/${uuid(jobId)}/refresh`, {}, options);
  }

  getDashboardVideoResultsStatus(scope: TenantScope, keyId: string, jobId: string, options?: RequestOptions): Promise<VideoResultAvailability> {
    return this.request(`${this.dashboardVideoPath(scope,keyId)}/jobs/${uuid(jobId)}/results`,undefined,options);
  }

  getDashboardVideoResult(scope: TenantScope, keyId: string, jobId: string, kind: 'video' | 'last_frame', options: RequestOptions = {}): Promise<Response> {
    if (!['video','last_frame'].includes(kind)) throw new TypeError('A video result kind is required');
    return this.raw(`${this.dashboardVideoPath(scope,keyId)}/jobs/${uuid(jobId)}/results/${kind}`,undefined,options,undefined,'video/mp4,video/webm,image/png,image/jpeg');
  }

  deleteDashboardVideoResults(scope: TenantScope, keyId: string, jobId: string, options?: RequestOptions): Promise<{ deleted: true }> {
    return this.request(`${this.dashboardVideoPath(scope,keyId)}/jobs/${uuid(jobId)}/results`,undefined,options,'DELETE');
  }

  /** Platform-administrator current agreed rates; excludes earnings and settlement records. */
  async listSupplierOffers(supplierId: string, options?: RequestOptions): Promise<SupplierOffer[]> {
    const response = await this.request<{ data: { offers: SupplierOffer[] } }>(`/providers/${uuid(supplierId)}/administration`, undefined, options);
    return response.data.offers;
  }

  /** Platform-administrator publication of a new immutable rate revision and clears prior qualification. */
  publishSupplierRates(supplierId: string, rates: SupplierRateInput, options?: RequestOptions): Promise<{ data: { revision: string } }> {
    validateRates(rates);
    return this.request(`/providers/${uuid(supplierId)}/offers`, rates, options);
  }

  /** Platform-administrator review. Does not activate offers or verify the underlying evidence. */
  qualifySupplier(supplierId: string, input: SupplierQualificationInput, options?: RequestOptions): Promise<{data: {qualification_status: 'qualified'}}> {
    const body = {supply_rights_sha256: evidenceDigest(input.supply_rights_sha256),
      supply_capability_sha256: evidenceDigest(input.supply_capability_sha256),
      data_handling_sha256: evidenceDigest(input.data_handling_sha256), valid_until_ms: qualificationExpiry(input.valid_until_ms)};
    return this.request(`/providers/${uuid(supplierId)}/qualification`, body, options, 'PUT');
  }

  /** Platform-administrator activation, pinned to the current rate revision and reviewed model/protocol evidence. */
  qualifySupplierOffer(supplierId: string, offerId: string, input: SupplierOfferQualificationInput, options?: RequestOptions): Promise<{data: {qualification_status: 'qualified'}}> {
    if (typeof input.protocol_matrix_version !== 'string' || !input.protocol_matrix_version.trim()
      || new TextEncoder().encode(input.protocol_matrix_version).length > 100) throw new TypeError('A bounded protocol matrix version is required');
    const body = {rate_revision: uuid(input.rate_revision), model_identity_sha256: evidenceDigest(input.model_identity_sha256),
      protocol_matrix_sha256: evidenceDigest(input.protocol_matrix_sha256), protocol_matrix_version: input.protocol_matrix_version,
      data_handling_sha256: evidenceDigest(input.data_handling_sha256), availability_sha256: evidenceDigest(input.availability_sha256),
      agreed_rates_sha256: evidenceDigest(input.agreed_rates_sha256), valid_until_ms: qualificationExpiry(input.valid_until_ms)};
    return this.request(`/providers/${uuid(supplierId)}/offers/${uuid(offerId)}/qualification`, body, options, 'PUT');
  }

  revokeSupplierQualification(supplierId: string, reasonSha256: string, options?: RequestOptions): Promise<{data: {qualification_status: 'revoked'}}> {
    return this.request(`/providers/${uuid(supplierId)}/qualification/revoke`, {reason_sha256:evidenceDigest(reasonSha256)}, options, 'POST');
  }

  revokeSupplierOfferQualification(supplierId: string, offerId: string, reasonSha256: string, options?: RequestOptions): Promise<{data: {qualification_status: 'revoked'}}> {
    return this.request(`/providers/${uuid(supplierId)}/offers/${uuid(offerId)}/qualification/revoke`, {reason_sha256:evidenceDigest(reasonSha256)}, options, 'POST');
  }

  /** Requires Supplier owner/admin or installation access; activation still requires current qualification. */
  setSupplierOfferActive(supplierId: string, offerId: string, active: boolean, options?: RequestOptions): Promise<{data: {active: boolean}}> {
    if (typeof active !== 'boolean') throw new TypeError('Offer active state must be boolean');
    return this.request(`/providers/${uuid(supplierId)}/offers/${uuid(offerId)}`, {active}, options, 'PATCH');
  }

  /** Scoped key metadata without secrets; uncertain dispatches still count as last use. */
  listWorkspaceKeys(scope: TenantScope, options?: RequestOptions): Promise<{ data: WorkspaceKey[] }> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/keys`, undefined, options);
  }

  /** Shared company funds require organization-wide owner/admin authorization. */
  getCustomerBalance(organizationId: string, options?: RequestOptions): Promise<{ data: CustomerBalance[] }> {
    return this.request(`/organizations/${uuid(organizationId)}/billing/balance`, undefined, options);
  }

  /** Create/replay a CNY top-up; preserve the idempotency key after uncertainty. No automatic retry. */
  createCustomerTopup(organizationId: string, input: CustomerTopupInput, options?: RequestOptions): Promise<{ data: CustomerTopup }> {
    if (input.payment_gateway !== undefined && !['epay', 'stripe', 'zhifux'].includes(input.payment_gateway)) throw new Error('Choose a supported payment gateway');
    if (input.currency !== undefined && !/^[A-Z]{3}$/.test(input.currency)) throw new Error('Provide a three-letter uppercase currency');
    if (typeof input.amount_nanos !== 'string' || !/^\d{1,19}$/.test(input.amount_nanos)
      || BigInt(input.amount_nanos) <= 0n || BigInt(input.amount_nanos) > 9223372036854775807n
      || BigInt(input.amount_nanos) % 10000000n !== 0n) throw new TypeError('Use an exact positive CNY amount with at most two decimal places');
    if (typeof input.payment_method !== 'string' || !/^[A-Za-z0-9.-]{1,64}$/.test(input.payment_method)) throw new TypeError('Choose an enabled payment method');
    if (typeof input.idempotency_key !== 'string') throw new TypeError('Use a UUID idempotency key');
    return this.request(`/organizations/${uuid(organizationId)}/billing/topups`, {
      amount_nanos: input.amount_nanos, payment_method: input.payment_method, idempotency_key: uuid(input.idempotency_key),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
      ...(input.payment_gateway === undefined ? {} : { payment_gateway: input.payment_gateway }),
    }, options);
  }

  /** Read saved status without an upstream query or payment mutation. */
  getCustomerTopup(organizationId: string, orderId: string, options?: RequestOptions): Promise<{ data: CustomerTopup }> {
    return this.request(`/organizations/${uuid(organizationId)}/billing/topups/${uuid(orderId)}`, undefined, options);
  }
  getCustomerPaymentMethods(organizationId: string, options?: RequestOptions & { currency?: string; payment_gateway?: CustomerTopupInput['payment_gateway'] }): Promise<{ data: CustomerPaymentMethods }> {
    const { currency, payment_gateway, ...transport } = options ?? {};
    if (payment_gateway !== undefined && !['epay', 'stripe', 'zhifux'].includes(payment_gateway)) throw new Error('Choose a supported payment gateway');
    if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) throw new Error('Provide a three-letter uppercase currency');
    const query = new URLSearchParams();
    if (currency !== undefined) query.set('currency', currency);
    if (payment_gateway !== undefined) query.set('payment_gateway', payment_gateway);
    return this.request(`/organizations/${uuid(organizationId)}/billing/payment-methods${query.size === 0 ? '' : `?${query}`}`, undefined, transport);
  }
  listCustomerTopups(organizationId: string, options?: RequestOptions & { before?: string }): Promise<{ data: (CustomerTopup & { created_at: string })[]; next_cursor: string | null }> {
    const { before, ...transport } = options ?? {};
    const query = before === undefined ? '' : `?before=${uuid(before)}`;
    return this.request(`/organizations/${uuid(organizationId)}/billing/topups${query}`, undefined, transport);
  }

  /** Company ledger pages of up to 100 entries. Pass next_cursor as before. */
  getCustomerBalanceTransactions(organizationId: string, options?: RequestOptions & { before?: string }): Promise<{ data: CustomerBalanceTransaction[]; next_cursor: string | null }> {
    const { before, ...transport } = options ?? {};
    const query = before === undefined ? '' : `?before=${uuid(before)}`;
    return this.request(`/organizations/${uuid(organizationId)}/billing/transactions${query}`, undefined, transport);
  }

  /** Company warning preference only; cannot alter funds or approved credit. */
  setCustomerBalanceWarning(organizationId: string, currency: string, input: { warning_threshold_nanos: string | null; expected_revision: string }, options?: RequestOptions): Promise<{ data: { revision: string } }> {
    if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError('Use an uppercase currency code');
    const exact = (value: unknown, maximum: bigint) => typeof value === 'string' && /^\d+$/.test(value) && BigInt(value) <= maximum;
    if (input.warning_threshold_nanos !== null && !exact(input.warning_threshold_nanos, 9223372036854775807n)
      || !exact(input.expected_revision, 9223372036854775806n)) throw new TypeError('Use exact nonnegative amounts and revision');
    return this.request(`/organizations/${uuid(organizationId)}/billing/accounts/${currency}/warning-threshold`, { warning_threshold_nanos: input.warning_threshold_nanos, expected_revision: input.expected_revision }, options, 'PUT');
  }

  /** Customer-safe billing read; server workspace authorization is authoritative. */
  getCustomerBilling(scope: TenantScope, options?: RequestOptions): Promise<{ data: CustomerBilling }> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/billing`, undefined, options);
  }

  /** Installation-only retail publication. No retry or Supplier-price fallback. */
  publishCustomerTariff(scope: TenantScope, rates: CustomerTariffInput, options?: RequestOptions): Promise<{ data: { revision: string } }> {
    validateRates(rates);
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/billing/tariffs`, rates, options);
  }

  /** Platform-administrator video selling configuration; publication does not qualify dispatch. */
  publishCustomerMediaRate(organizationId: string, input: CustomerMediaRateCard, options?: RequestOptions): Promise<{ data: { revision: string } }> {
    return this.request(`/organizations/${uuid(organizationId)}/billing/media-rates`, customerMediaRateBody(input), options);
  }

  /** Named qualified commercial video choices without procurement or credentials. */
  listCustomerMediaRateModels(organizationId: string, page: { after?: string; limit?: number } = {}, options?: RequestOptions): Promise<{ data: CustomerMediaRateModel[]; has_more: boolean; next_after: string | null }> {
    if (page.limit !== undefined && (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100)) throw new TypeError('Choose a model page size from 1 to 100');
    if (page.after !== undefined && (!page.after || page.after.trim() !== page.after || new TextEncoder().encode(page.after).length > 256 || /[\x00-\x1f\x7f]/.test(page.after))) throw new TypeError('Choose a valid model cursor');
    const query = new URLSearchParams();
    if (page.after !== undefined) query.set('after', page.after);
    if (page.limit !== undefined) query.set('limit', String(page.limit));
    return this.request(`/organizations/${uuid(organizationId)}/billing/media-rate-models${query.size ? '?' + query : ''}`, undefined, options);
  }

  /** Platform-administrator customer price history; never includes purchase prices. */
  listCustomerMediaRates(organizationId: string, page: { after?: string; limit?: number } = {}, options?: RequestOptions): Promise<{ data: CustomerMediaRateRecord[]; has_more: boolean; next_after: string | null }> {
    if (page.limit !== undefined && (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100)) throw new TypeError('Choose a rate page size from 1 to 100');
    if (page.after !== undefined && (!page.after || page.after.trim() !== page.after || new TextEncoder().encode(page.after).length > 256 || /[\x00-\x1f\x7f]/.test(page.after))) throw new TypeError('Choose a valid rate cursor');
    const query = new URLSearchParams();
    if (page.after !== undefined) query.set('after', page.after);
    if (page.limit !== undefined) query.set('limit', String(page.limit));
    return this.request(`/organizations/${uuid(organizationId)}/billing/media-rates${query.size ? '?' + query : ''}`, undefined, options);
  }

  /** Atomically replace a dimensional selling schedule; no automatic mutation retries. */
  replaceCustomerMediaRate(organizationId: string, previousRevision: string, input: CustomerMediaRateCard, options?: RequestOptions): Promise<{ data: { revision: string; effective_from: string } }> {
    if (!previousRevision || previousRevision.trim() !== previousRevision || new TextEncoder().encode(previousRevision).length > 256 || /[\x00-\x1f\x7f]/.test(previousRevision)) throw new TypeError('Choose a valid previous customer media revision');
    return this.request(`/organizations/${uuid(organizationId)}/billing/media-rates/replace`, {
      previous_revision: previousRevision, rate: customerMediaRateBody(input),
    }, options);
  }

  /** Platform-administrator agreed Supplier media purchase terms; independent from retail pricing. */
  publishSupplierMediaRate(supplierId: string, input: SupplierMediaRateCard, options?: RequestOptions): Promise<{ data: { revision: string } }> {
    return this.request(`/providers/${uuid(supplierId)}/media-rates`, supplierMediaRateBody(input), options);
  }

  /** Atomically publish new terms and end the previous schedule at their start. */
  replaceSupplierMediaRate(supplierId: string, previousRevision: string, input: SupplierMediaRateCard, options?: RequestOptions): Promise<{ data: { revision: string; effective_from: string } }> {
    if (!previousRevision || previousRevision.trim() !== previousRevision || previousRevision.length > 256 || /[\x00-\x1f\x7f]/.test(previousRevision)) throw new TypeError('Choose a valid previous Supplier media revision');
    return this.request(`/providers/${uuid(supplierId)}/media-rates/replace`, {
      previous_revision: previousRevision, rate: supplierMediaRateBody(input),
    }, options);
  }

  /** Exact purchase history, authorized for installation or this Supplier's active member. */
  listSupplierMediaRates(supplierId: string, page: { after?: string; limit?: number } = {}, options?: RequestOptions): Promise<{ data: SupplierMediaRateRecord[]; has_more: boolean; next_after: string | null }> {
    if (page.limit !== undefined && (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100)) throw new TypeError('Choose a rate page size from 1 to 100');
    if (page.after !== undefined && (!page.after || page.after.trim() !== page.after || page.after.length > 256 || /[\x00-\x1f\x7f]/.test(page.after))) throw new TypeError('Choose a valid rate cursor');
    const query = new URLSearchParams();
    if (page.after !== undefined) query.set('after', page.after);
    if (page.limit !== undefined) query.set('limit', String(page.limit));
    return this.request(`/providers/${uuid(supplierId)}/media-rates${query.size ? '?' + query : ''}`, undefined, options);
  }

  /** Read named configuration choices without credentials or purchase/customer prices. */
  listSupplierMediaRateModels(supplierId: string, page: { after?: string; limit?: number } = {}, options?: RequestOptions): Promise<{ data: SupplierMediaRateModel[]; has_more: boolean; next_after: string | null }> {
    if (page.limit !== undefined && (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100)) throw new TypeError('Choose a model page size from 1 to 100');
    if (page.after !== undefined && (!page.after || page.after.trim() !== page.after || page.after.length > 256 || /[\x00-\x1f\x7f]/.test(page.after))) throw new TypeError('Choose a valid model cursor');
    const query = new URLSearchParams();
    if (page.after !== undefined) query.set('after', page.after);
    if (page.limit !== undefined) query.set('limit', String(page.limit));
    return this.request(`/providers/${uuid(supplierId)}/media-rate-models${query.size ? '?' + query : ''}`, undefined, options);
  }

  /** Platform-administrator draft choices; no credentials, procurement or customer prices. Continue by next_after while has_more, even when data is empty. */
  listSupplierMediaOfferModels(supplierId: string, page: { after?: string; limit?: number } = {}, options?: RequestOptions): Promise<{ data: SupplierMediaOfferModel[]; has_more: boolean; next_after: string | null }> {
    if (page.limit !== undefined && (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100)) throw new TypeError('Choose a model page size from 1 to 100');
    if (page.after !== undefined && (!page.after || page.after.trim() !== page.after || new TextEncoder().encode(page.after).length > 256 || /\p{Cc}/u.test(page.after))) throw new TypeError('Choose a valid model cursor');
    const query = new URLSearchParams();
    if (page.after !== undefined) query.set('after', page.after);
    if (page.limit !== undefined) query.set('limit', String(page.limit));
    return this.request(`/providers/${uuid(supplierId)}/media-offer-models${query.size ? '?' + query : ''}`, undefined, options);
  }

  /** Publishes an inactive media offer without text prices. Never retries automatically. */
  publishSupplierMediaOffer(supplierId: string, input: SupplierMediaOfferInput, options?: RequestOptions): Promise<{ data: { revision: string } }> {
    for (const value of [input.model_alias, input.schema_revision]) {
      if (typeof value !== 'string' || !value || value.trim() !== value || new TextEncoder().encode(value).length > 256 || /\p{Cc}/u.test(value)) throw new TypeError('A bounded model and schema binding is required');
    }
    for (const value of [input.vendor_revision, input.model_revision]) {
      if (typeof value === 'string' ? !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n : !Number.isSafeInteger(value) || value < 1) throw new TypeError('Configuration revisions must be exact positive integers');
    }
    const body = { revision: uuid(input.revision), model_alias: input.model_alias, vendor_id: uuid(input.vendor_id),
      vendor_revision: input.vendor_revision, model_revision: input.model_revision, schema_revision: input.schema_revision,
      expected_revision: input.expected_revision === null ? null : uuid(input.expected_revision) };
    return this.request(`/providers/${uuid(supplierId)}/media-offers`, body, options);
  }

  /** Platform-administrator cutoff; existing purchase snapshots and earnings stay immutable. */
  retireSupplierMediaRate(supplierId: string, revision: string, effectiveUntil: number, options?: RequestOptions): Promise<{ data: { revision: string; effective_until: string } }> {
    if (!revision || revision.trim() !== revision || revision.length > 256 || /[\x00-\x1f\x7f/]/.test(revision)) throw new TypeError('Choose a valid Supplier media revision');
    if (!Number.isSafeInteger(effectiveUntil)) throw new TypeError('Retirement time must be exact Unix seconds');
    return this.request(`/providers/${uuid(supplierId)}/media-rates/${encodeURIComponent(revision)}/retire`, { effective_until: effectiveUntil }, options);
  }

  /** End eligibility without changing published prices or historical job snapshots. */
  retireCustomerMediaRate(organizationId: string, revision: string, effectiveUntil: number, options?: RequestOptions): Promise<{ data: { revision: string; effective_until: string } }> {
    if (!revision || revision.trim() !== revision || revision.length > 256 || /[\x00-\x1f\x7f/]/.test(revision)) throw new TypeError('Choose a valid media selling revision');
    if (!Number.isSafeInteger(effectiveUntil)) throw new TypeError('Retirement time must be exact Unix seconds');
    return this.request(`/organizations/${uuid(organizationId)}/billing/media-rates/${encodeURIComponent(revision)}/retire`, { effective_until: effectiveUntil }, options);
  }

  /** Installation-only invoice closure. Preserve the caller's idempotency key on manual replay. */
  issueCustomerInvoice(scope: TenantScope, input: CustomerInvoiceInput, options?: RequestOptions): Promise<{ data: { id: string } }> {
    if (!Number.isSafeInteger(input.from_ms) || !Number.isSafeInteger(input.to_ms)
      || input.from_ms < 0 || input.to_ms <= input.from_ms || input.to_ms - input.from_ms > 366 * 86_400_000
      || !/^[A-Z]{3}$/.test(input.currency)) throw new Error('Choose a nonnegative invoice range of at most 366 days and a three-letter currency');
    uuid(input.idempotency_key);
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/billing/invoices`, input, options);
  }

  /** Workspace-authorized customer line items; amounts and token counts remain exact decimal strings. */
  getCustomerInvoiceLines(scope: TenantScope, invoiceId: string, options?: RequestOptions): Promise<{ data: CustomerInvoiceLine[] }> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/billing/invoices/${uuid(invoiceId)}`, undefined, options);
  }

  /** Installation-only record of a confirmed external payment; does not collect or transfer money. */
  recordCustomerInvoicePayment(scope: TenantScope, invoiceId: string, paymentReference: string, options?: RequestOptions): Promise<{ data: { id: string } }> {
    const reference = paymentReference.trim();
    if (!reference || new TextEncoder().encode(reference).length > 200 || /\p{Cc}/u.test(reference)) throw new Error('Choose a payment reference of at most 200 bytes without control characters');
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/billing/invoices/${uuid(invoiceId)}/payment`, { payment_reference: reference }, options);
  }

  getWorkspaceGuardrail(scope: TenantScope, options?: RequestOptions): Promise<{ data: { revision: number; policy: GuardrailPolicy } | null }> {
    return this.request(`${this.guardrailsPath(scope)}`, undefined, options);
  }

  /** Currency discovery exposes this workspace's commitments, never company funds. */
  listWorkspaceSpendingLimits(scope: TenantScope, options?: RequestOptions): Promise<{ data: WorkspaceSpendingAccount[] }> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/spending-limit`, undefined, options);
  }

  getWorkspaceSpendingLimit(scope: TenantScope, currency: string, options?: RequestOptions): Promise<{ data: WorkspaceSpendingLimit | null }> {
    if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError('Use an uppercase currency code');
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/spending-limit/${currency}`, undefined, options);
  }

  /** Owner-only retail limit; never changes company funds or procurement budgets. */
  setWorkspaceSpendingLimit(scope: TenantScope, currency: string, input: { limit_nanos: string; expected_revision: string }, options?: RequestOptions): Promise<{ data: { revision: string } }> {
    if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError('Use an uppercase currency code');
    const exact = (value: unknown, maximum: bigint) => typeof value === 'string' && /^\d+$/.test(value) && BigInt(value) <= maximum;
    if (!exact(input.limit_nanos, 9223372036854775807n) || !exact(input.expected_revision, 9223372036854775806n)) throw new TypeError('Use exact nonnegative amounts and revision');
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/spending-limit/${currency}`, { limit_nanos: input.limit_nanos, expected_revision: input.expected_revision }, options, 'PUT');
  }

  listWorkspaceSpendingLimitHistory(scope: TenantScope, currency: string, query: { beforeRevision?: string; limit?: number } = {}, options?: RequestOptions): Promise<{ data: WorkspaceSpendingLimitRevision[]; next_before_revision: string | null }> {
    if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError('Use an uppercase currency code');
    const params = new URLSearchParams();
    if (query.beforeRevision !== undefined) {
      if (!/^\d+$/.test(query.beforeRevision) || BigInt(query.beforeRevision) < 1n || BigInt(query.beforeRevision) > 9223372036854775807n) throw new TypeError('Invalid history revision');
      params.set('before_revision', query.beforeRevision);
    }
    if (query.limit !== undefined) {
      if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new TypeError('Invalid history page size');
      params.set('limit', String(query.limit));
    }
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/spending-limit/${currency}/history${params.size ? `?${params}` : ''}`, undefined, options);
  }

  /** Immutable metadata only; excludes policy patterns and internal actor identifiers. */
  listWorkspaceGuardrailHistory(scope: TenantScope, beforeRevision?: number, options?: RequestOptions): Promise<{ data: Array<{ revision: number; policy_name: string; active: boolean; actor_name: string; activated_at: string; restored_from_revision: number | null }>; next_cursor: number | null }> {
    if (beforeRevision !== undefined && (!Number.isSafeInteger(beforeRevision) || beforeRevision < 1)) throw new Error('Invalid policy history cursor');
    const suffix = beforeRevision === undefined ? '' : `?before_revision=${beforeRevision}`;
    return this.request(`${this.guardrailsPath(scope)}/history${suffix}`, undefined, options);
  }

  getWorkspaceGuardrailRevision(scope: TenantScope, revision: number, options?: RequestOptions): Promise<{ data: { revision: number; policy: GuardrailPolicy } }> {
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid policy revision');
    return this.request(`${this.guardrailsPath(scope)}/revisions/${revision}`, undefined, options);
  }

  /** Creates a new active revision from an existing one; stale heads conflict without retries. */
  rollbackWorkspaceGuardrail(scope: TenantScope, expectedRevision: number, targetRevision: number, options?: RequestOptions): Promise<{ revision: number; restored_from_revision: number }> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !Number.isSafeInteger(targetRevision) || targetRevision < 1 || targetRevision > expectedRevision) throw new Error('Invalid rollback revision');
    return this.request(`${this.guardrailsPath(scope)}/rollback`, { expected_revision: expectedRevision, target_revision: targetRevision }, options);
  }

  getKeyGuardrail(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<{ data: { assignment_revision: number; policy_revision: number | null; policy: GuardrailPolicy | null } | null }> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/keys/${uuid(keyId)}/guardrail`, undefined, options);
  }

  assignKeyGuardrail(scope: TenantScope, keyId: string, policyRevision: number, expectedAssignmentRevision: number, options?: RequestOptions): Promise<{ assignment_revision: number }> {
    if (!Number.isSafeInteger(policyRevision) || policyRevision < 1 || !Number.isSafeInteger(expectedAssignmentRevision) || expectedAssignmentRevision < 0) throw new Error('Invalid policy or assignment revision');
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/keys/${uuid(keyId)}/guardrail`, { policy_revision: policyRevision, expected_assignment_revision: expectedAssignmentRevision }, options, 'PUT');
  }

  listKeyGuardrailHistory(scope: TenantScope, keyId: string, beforeAssignmentRevision?: number, options?: RequestOptions): Promise<{ data: Array<{ assignment_revision: number; policy_revision: number | null; policy_name: string | null; actor_name: string; created_at: string }>; next_cursor: number | null }> {
    if (beforeAssignmentRevision !== undefined && (!Number.isSafeInteger(beforeAssignmentRevision) || beforeAssignmentRevision < 1)) throw new Error('Invalid assignment history cursor');
    const suffix = beforeAssignmentRevision === undefined ? '' : `?before_assignment_revision=${beforeAssignmentRevision}`;
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/keys/${uuid(keyId)}/guardrail/history${suffix}`, undefined, options);
  }

  clearKeyGuardrail(scope: TenantScope, keyId: string, expectedAssignmentRevision: number, options?: RequestOptions): Promise<{ assignment_revision: number }> {
    if (!Number.isSafeInteger(expectedAssignmentRevision) || expectedAssignmentRevision < 1) throw new Error('Invalid assignment revision');
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/keys/${uuid(keyId)}/guardrail`, { policy_revision: null, expected_assignment_revision: expectedAssignmentRevision }, options, 'PUT');
  }

  activateWorkspaceGuardrail(scope: TenantScope, expectedRevision: number, policy: GuardrailPolicy, options?: RequestOptions): Promise<{ revision: number }> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('expectedRevision must be a nonnegative safe integer');
    return this.request(this.guardrailsPath(scope), { expected_revision: expectedRevision, policy }, options, 'PUT');
  }

  previewWorkspaceGuardrail(scope: TenantScope, policy: GuardrailPolicy, model: string, provider: string, options?: RequestOptions): Promise<GuardrailPreview> {
    return this.request(`${this.guardrailsPath(scope)}/preview`, { policy, model, provider }, options);
  }

  /** Synthetic local test only: no policy activation or inference dispatch. */
  previewGuardrailInput(scope: TenantScope, input: GuardrailInputTest, options?: RequestOptions): Promise<GuardrailInputTestResult> {
    if (!['chat', 'responses', 'embeddings'].includes(input.protocol)) throw new Error('Unsupported input protocol');
    if (!Array.isArray(input.rules) || input.rules.length > 32) throw new Error('At most 32 input rules are supported');
    for (const rule of input.rules) {
      const custom = typeof rule.pattern === 'string' && rule.pattern.length > 0 && new TextEncoder().encode(rule.pattern).length <= 4096 && rule.preset === undefined;
      const preset = rule.pattern === undefined && ['email_v1', 'api_key_prefix_v1', 'niu_api_key_v1'].includes(rule.preset ?? '');
      if ((!custom && !preset) || !['block', 'redact'].includes(rule.action)) throw new Error('Invalid input rule');
    }
    return this.request(`${this.guardrailsPath(scope)}/input-preview`, input, options);
  }

  /** Synthetic local test only: no policy activation or inference dispatch. */
  previewGuardrailOutput(scope: TenantScope, input: GuardrailOutputTest, options?: RequestOptions): Promise<GuardrailOutputTestResult> {
    if (input.mode !== undefined && !['buffered_full', 'observe_only'].includes(input.mode)) throw new Error('Unsupported output mode');
    if (!['chat', 'responses'].includes(input.protocol)) throw new Error('Unsupported output protocol');
    if (!Array.isArray(input.rules) || input.rules.length < 1 || input.rules.length > 32) throw new Error('Output preview requires 1–32 rules');
    for (const rule of input.rules) {
      const custom = typeof rule.pattern === 'string' && rule.pattern.length > 0 && new TextEncoder().encode(rule.pattern).length <= 4096 && rule.preset === undefined;
      const preset = rule.pattern === undefined && ['email_v1', 'api_key_prefix_v1', 'niu_api_key_v1'].includes(rule.preset ?? '');
      if ((!custom && !preset) || !['block', 'redact'].includes(rule.action)) throw new Error('Invalid output rule');
    }
    return this.request(`${this.guardrailsPath(scope)}/output-preview`, input, options);
  }

  private guardrailsPath(scope: TenantScope): string {
    return `/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/guardrails`;
  }

  listChatSessions(scope: TenantScope, options?: RequestOptions): Promise<{ data: ChatSession[] }> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/chat-sessions`, undefined, options);
  }

  listArchivedChatSessions(scope: TenantScope, options?: RequestOptions): Promise<{ data: ChatSession[] }> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/chat-sessions?archived=true`, undefined, options);
  }

  setChatSessionArchived(scope: TenantScope, sessionId: string, archived: boolean, options?: RequestOptions): Promise<void> {
    if (typeof archived !== 'boolean') throw new Error('archived must be a boolean');
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/chat-sessions/${uuid(sessionId)}/archive`, { archived }, options, 'PUT');
  }

  exportChatSession(scope: TenantScope, sessionId: string, options?: RequestOptions): Promise<ChatExport> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/chat-sessions/${uuid(sessionId)}/export`, undefined, options);
  }

  saveChatSession(scope: TenantScope, sessionId: string, session: ChatSession, options?: RequestOptions): Promise<{ saved: boolean }> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/chat-sessions/${uuid(sessionId)}`, session, options, 'PUT');
  }

  deleteChatSession(scope: TenantScope, sessionId: string, options?: RequestOptions): Promise<void> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/chat-sessions/${uuid(sessionId)}`, undefined, options, 'DELETE');
  }

  getSupplierAssociation(configurationId: string, options?: RequestOptions): Promise<{ data: { id: string; name: string } | null }> {
    return this.request(`/vendors/${uuid(configurationId)}/supplier`, undefined, options);
  }

  associateSupplier(configurationId: string, supplierId: string, expectedRevision: number, options?: RequestOptions): Promise<void> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error('expectedRevision must be a positive safe integer');
    return this.request(`/vendors/${uuid(configurationId)}/supplier`, {
      supplier_id: uuid(supplierId), expected_revision: expectedRevision,
    }, options, 'PUT');
  }

  /** Platform-only fixed Ark operation; use getAssetGroupRequest for saved status.
   * Never automatically retry an uncertain upstream creation with a new key.
   */
  createOrdinaryAssetGroup(configurationId: string, input: OrdinaryAssetGroupInput, options?: RequestOptions): Promise<{data: {id: string; status: 'dispatching' | 'uncertain' | 'succeeded'}}> {
    if ([input.vendor_revision, input.credential_revision].some(value => !Number.isSafeInteger(value) || value < 1)) throw new TypeError('Asset revisions must be positive safe integers');
    if (typeof input.name !== 'string' || !input.name.trim() || [...input.name].length > 64 || /\p{Cc}/u.test(input.name)) throw new TypeError('Invalid ordinary asset group name');
    if (input.description !== undefined && (typeof input.description !== 'string' || [...input.description].length > 300 || /\p{Cc}/u.test(input.description.replace(/[\n\r\t]/g, '')))) throw new TypeError('Invalid ordinary asset group description');
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/groups`, {
      organization_id: uuid(input.organization_id), project_id: uuid(input.project_id),
      idempotency_key: uuid(input.idempotency_key), vendor_revision: input.vendor_revision,
      credential_revision: input.credential_revision, name: input.name,
      ...(input.description === undefined ? {} : {description: input.description}),
    }, options);
  }

  /** Encrypt a metadata patch for the saved original group. This never dispatches.
   * Reuse update_id only for the identical patch; omitted fields stay unchanged.
   */
  prepareOrdinaryAssetGroupUpdate(configurationId: string, input: OrdinaryAssetGroupUpdateInput, options?: RequestOptions): Promise<{data: OrdinaryAssetGroupUpdatePreparation}> {
    if (input.name === undefined && input.description === undefined) throw new TypeError('An ordinary asset group metadata patch is required');
    if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim() || [...input.name].length > 64 || /\p{Cc}/u.test(input.name))) throw new TypeError('Invalid ordinary asset group name');
    if (input.description !== undefined && (typeof input.description !== 'string' || [...input.description].length > 300 || /\p{Cc}/u.test(input.description.replace(/[\n\r\t]/g, '')))) throw new TypeError('Invalid ordinary asset group description');
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/group-updates`, {
      organization_id: uuid(input.organization_id), project_id: uuid(input.project_id),
      intent_id: uuid(input.intent_id), update_id: uuid(input.update_id),
      ...(input.name === undefined ? {} : {name: input.name}),
      ...(input.description === undefined ? {} : {description: input.description}),
    }, options);
  }

  /** Explicit one-shot dispatch. Uncertainty must never be retried automatically.
   * Caller cancellation does not cancel claimed work. Both outcomes need read-back.
   */
  dispatchOrdinaryAssetGroupUpdate(configurationId: string, updateId: string, scope: TenantScope, options?: RequestOptions): Promise<{data: {update_id: string; status: 'acknowledged' | 'uncertain'; reconciliation_required: true}}> {
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/group-updates/${uuid(updateId)}/dispatch`, {
      organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId),
    }, options);
  }

  /** Fresh authorized read-back; mismatch and uncertainty preserve the hold. */
  reconcileOrdinaryAssetGroupUpdate(configurationId: string, updateId: string, readId: string, scope: TenantScope, options?: RequestOptions): Promise<{data: {update_id: string; status: 'reconciled'; reconciliation_required: false}}> {
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/group-updates/${uuid(updateId)}/reconcile`, {
      organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId), read_id: uuid(readId),
    }, options);
  }

  /** Audit only: no retained patch, upstream identities or procurement data. */
  listOrdinaryAssetGroupUpdates(configurationId: string, scope: TenantScope, query: {after?: string; limit?: number} = {}, options?: RequestOptions): Promise<{data: OrdinaryAssetGroupUpdateAudit[]; next_cursor: string | null}> {
    const parameters = new URLSearchParams({organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId)});
    if (query.after !== undefined) parameters.set('after', uuid(query.after));
    if (query.limit !== undefined) {
      if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new TypeError('Asset update history limit must be from 1 to 100');
      parameters.set('limit', String(query.limit));
    }
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/group-updates?${parameters}`, undefined, options);
  }

  /** Erasure preserves immutable audit, mutation holds and replay protection. */
  deleteOrdinaryAssetGroupUpdatePatch(configurationId: string, updateId: string, scope: TenantScope, options?: RequestOptions): Promise<void> {
    const parameters = new URLSearchParams({organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId)});
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/group-updates/${uuid(updateId)}?${parameters}`, undefined, options, 'DELETE');
  }

  /** Platform-only targeted read. A read identity is one-shot; no automatic retry.
   * Caller cancellation does not cancel already claimed upstream work.
   */
  readOrdinaryAssetGroup(configurationId: string, input: OrdinaryAssetGroupReadInput, options?: RequestOptions): Promise<{data: {read_id: string; name: string; description: string | null; created_at: string; updated_at: string}}> {
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/group-reads`, {
      organization_id: uuid(input.organization_id), project_id: uuid(input.project_id),
      intent_id: uuid(input.intent_id), read_id: uuid(input.read_id),
    }, options);
  }

  /** Audit metadata only. Unresolved does not mean an upstream read is running. */
  listOrdinaryAssetGroupReads(configurationId: string, scope: TenantScope, query: {after?: string; limit?: number} = {}, options?: RequestOptions): Promise<{data: Array<{read_id: string; status: 'unresolved' | 'succeeded' | 'failed'; started_at: string; completed_at: string | null; duration_ms: number | null; reason: string | null}>; next_cursor: string | null}> {
    const parameters = new URLSearchParams({organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId)});
    if (query.after !== undefined) parameters.set('after', uuid(query.after));
    if (query.limit !== undefined) {
      if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new TypeError('Asset read history limit must be from 1 to 100');
      parameters.set('limit', String(query.limit));
    }
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/group-reads?${parameters}`, undefined, options);
  }

  /** Saved encrypted result only; never sends an upstream read. */
  getOrdinaryAssetGroupRead(configurationId: string, readId: string, scope: TenantScope, options?: RequestOptions): Promise<{data: {read_id: string; name: string; description: string | null; created_at: string; updated_at: string}}> {
    const query = new URLSearchParams({organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId)});
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/group-reads/${uuid(readId)}?${query}`, undefined, options);
  }

  deleteOrdinaryAssetGroupRead(configurationId: string, readId: string, scope: TenantScope, options?: RequestOptions): Promise<void> {
    const query = new URLSearchParams({organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId)});
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/group-reads/${uuid(readId)}?${query}`, undefined, options, 'DELETE');
  }

  /** One-shot page; continuation uses a retained parent identity, never a raw cursor. */
  listOrdinaryAssets(configurationId: string, input: OrdinaryAssetListingInput, options?: RequestOptions): Promise<{data: OrdinaryAssetListing}> {
    if (!Number.isSafeInteger(input.maximum_items) || input.maximum_items < 1 || input.maximum_items > 100) throw new TypeError('Asset page size must be from 1 to 100');
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/listings`, {
      organization_id: uuid(input.organization_id), project_id: uuid(input.project_id),
      intent_id: uuid(input.intent_id), listing_id: uuid(input.listing_id), maximum_items: input.maximum_items,
      ...(input.previous_listing_id === undefined ? {} : {previous_listing_id: uuid(input.previous_listing_id)}),
    }, options);
  }

  /** Audit only; unresolved does not imply running or permit an upstream replay. */
  /** Platform-only one-shot lookup from a retained page. Never automatically retried. */
  lookupOrdinaryAsset(configurationId: string, input: OrdinaryAssetLookupInput, options?: RequestOptions): Promise<{data: {lookup_id: string; status: 'succeeded'; asset_status: 'Active' | 'Processing' | 'Failed'}}> {
    if (!Number.isSafeInteger(input.item_index) || input.item_index < 0 || input.item_index > 99) throw new TypeError('Asset item index must be from 0 to 99');
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/lookups`, {
      organization_id: uuid(input.organization_id), project_id: uuid(input.project_id),
      listing_id: uuid(input.listing_id), lookup_id: uuid(input.lookup_id), item_index: input.item_index,
    }, options);
  }

  /** Durable operational audit only; missing completion remains unresolved. */
  /** Saved content only; never sends another upstream lookup. */
  getOrdinaryAssetLookupResult(configurationId: string, scope: TenantScope, lookupId: string, options?: RequestOptions): Promise<{data: OrdinaryAssetLookupResult}> {
    const parameters = new URLSearchParams({organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId)});
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/lookups/${uuid(lookupId)}?${parameters}`, undefined, options);
  }

  /** Erases retained content; immutable operational history remains. */
  deleteOrdinaryAssetLookupResult(configurationId: string, scope: TenantScope, lookupId: string, options?: RequestOptions): Promise<void> {
    const parameters = new URLSearchParams({organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId)});
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/lookups/${uuid(lookupId)}?${parameters}`, undefined, options, 'DELETE');
  }

  listOrdinaryAssetLookups(configurationId: string, scope: TenantScope, query: {after?: string; limit?: number} = {}, options?: RequestOptions): Promise<{data: OrdinaryAssetLookupAudit[]; next_cursor: string | null}> {
    const parameters = new URLSearchParams({organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId)});
    if (query.after !== undefined) parameters.set('after', uuid(query.after));
    if (query.limit !== undefined) {
      if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new TypeError('Asset lookup history limit must be from 1 to 100');
      parameters.set('limit', String(query.limit));
    }
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/lookups?${parameters}`, undefined, options);
  }

  listOrdinaryAssetListings(configurationId: string, scope: TenantScope, query: {after?: string; limit?: number} = {}, options?: RequestOptions): Promise<{data: OrdinaryAssetListingAudit[]; next_cursor: string | null}> {
    const parameters = new URLSearchParams({organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId)});
    if (query.after !== undefined) parameters.set('after', uuid(query.after));
    if (query.limit !== undefined) {
      if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new TypeError('Asset listing history limit must be from 1 to 100');
      parameters.set('limit', String(query.limit));
    }
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/listings?${parameters}`, undefined, options);
  }

  /** Recovers retained encrypted content without an upstream listing call. */
  getOrdinaryAssetListing(configurationId: string, listingId: string, scope: TenantScope, options?: RequestOptions): Promise<{data: OrdinaryAssetListing}> {
    const query = new URLSearchParams({organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId)});
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/listings/${uuid(listingId)}?${query}`, undefined, options);
  }

  deleteOrdinaryAssetListing(configurationId: string, listingId: string, scope: TenantScope, options?: RequestOptions): Promise<void> {
    const query = new URLSearchParams({organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId)});
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/listings/${uuid(listingId)}?${query}`, undefined, options, 'DELETE');
  }

  /** Records explicit cascading-deletion consent; never dispatches deletion. */
  prepareOrdinaryAssetGroupDeletionConsent(configurationId: string, input: OrdinaryAssetGroupDeletionConsentInput, options?: RequestOptions): Promise<{data: {consent_id: string; prepared: true; dispatch_available: false}}> {
    if (input.confirm_cascade !== true) throw new TypeError('Explicit cascading deletion consent is required');
    if (!Number.isSafeInteger(input.valid_for_seconds) || input.valid_for_seconds < 1 || input.valid_for_seconds > 900) throw new TypeError('Deletion consent validity must be from 1 to 900 seconds');
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/group-deletion-consents`, {
      organization_id: uuid(input.organization_id), project_id: uuid(input.project_id),
      intent_id: uuid(input.intent_id), consent_id: uuid(input.consent_id), authorization_id: uuid(input.authorization_id),
      valid_for_seconds: input.valid_for_seconds, confirm_cascade: true,
    }, options);
  }

  /** Irreversible one-shot deletion; never automatically retries uncertain outcomes. */
  dispatchOrdinaryAssetGroupDeletion(configurationId: string, scope: TenantScope, consentId: string, options?: RequestOptions): Promise<{data: {consent_id: string; status: 'acknowledged' | 'uncertain'; reconciliation_required: true}}> {
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/group-deletion-consents/${uuid(consentId)}/dispatch`, {
      organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId),
    }, options);
  }

  /** Consent status is descriptive; it never establishes current dispatch rights. */
  getOrdinaryAssetGroupDeletionConsent(configurationId: string, scope: TenantScope, consentId: string, options?: RequestOptions): Promise<{data: OrdinaryAssetGroupDeletionConsentStatus}> {
    const parameters = new URLSearchParams({organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId)});
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/group-deletion-consents/${uuid(consentId)}?${parameters}`, undefined, options);
  }

  /** Idempotent local revocation; it does not erase claims or cancel dispatched work. */
  revokeOrdinaryAssetGroupDeletionConsent(configurationId: string, scope: TenantScope, consentId: string, options?: RequestOptions): Promise<void> {
    const parameters = new URLSearchParams({organization_id: uuid(scope.organizationId), project_id: uuid(scope.projectId)});
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/group-deletion-consents/${uuid(consentId)}?${parameters}`, undefined, options, 'DELETE');
  }

  createAssetOperationAuthorization(configurationId: string, input: AssetOperationAuthorizationInput, options?: RequestOptions): Promise<{data: {id: string; operation: 'CreateAssetGroup' | 'GetAssetGroup' | 'ListAssets' | 'GetAsset' | 'UpdateAssetGroup' | 'DeleteAssetGroup' | 'CreateAsset'; dispatch_available: false}}> {
    if (input.operation !== undefined && !['CreateAssetGroup', 'GetAssetGroup', 'ListAssets', 'GetAsset', 'UpdateAssetGroup', 'DeleteAssetGroup', 'CreateAsset'].includes(input.operation)) throw new TypeError('Unsupported asset qualification operation');
    for (const revision of [input.vendor_revision, input.credential_revision]) {
      if (!Number.isSafeInteger(revision) || revision < 1) throw new TypeError('Asset authorization revisions must be positive safe integers');
    }
    if (!Number.isSafeInteger(input.valid_for_seconds) || input.valid_for_seconds < 1 || input.valid_for_seconds > 7_776_000) throw new TypeError('Asset authorization validity must be from 1 second to 90 days');
    for (const hash of [input.rights_sha256, input.protocol_sha256, input.data_handling_sha256, input.free_operation_sha256]) {
      if (typeof hash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(hash) || /^0{64}$/.test(hash)) throw new TypeError('Asset evidence references must be nonzero SHA-256 hex digests');
    }
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/authorizations`, {
      organization_id: uuid(input.organization_id), project_id: uuid(input.project_id),
      vendor_revision: input.vendor_revision, credential_revision: input.credential_revision,
      rights_sha256: input.rights_sha256, protocol_sha256: input.protocol_sha256,
      data_handling_sha256: input.data_handling_sha256, free_operation_sha256: input.free_operation_sha256,
      valid_for_seconds: input.valid_for_seconds,
      ...(input.operation === undefined ? {} : {operation: input.operation}),
    }, options);
  }

  listAssetOperationAuthorizations(configurationId: string, query: {after?: string; limit?: number} = {}, options?: RequestOptions): Promise<{data: AssetOperationAuthorization[]; next_cursor: string | null}> {
    const parameters = new URLSearchParams();
    if (query.after !== undefined) parameters.set('after', uuid(query.after));
    if (query.limit !== undefined) {
      if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new TypeError('Asset authorization limit must be from 1 to 100');
      parameters.set('limit', String(query.limit));
    }
    const suffix = parameters.size ? `?${parameters}` : '';
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/authorizations${suffix}`, undefined, options);
  }

  revokeAssetOperationAuthorization(configurationId: string, authorizationId: string, options?: RequestOptions): Promise<void> {
    return this.request(`/vendors/${uuid(configurationId)}/asset-management/authorizations/${uuid(authorizationId)}`, undefined, options, 'DELETE');
  }

  getAssetManagementConfiguration(configurationId: string, options?: RequestOptions): Promise<{data: AssetManagementConfiguration | null}> {
    return this.request(`/vendors/${uuid(configurationId)}/asset-management`, undefined, options);
  }

  revokeAssetManagement(configurationId: string, input: {expected_revision: number; erase_history?: boolean; confirm_erase?: boolean}, options?: RequestOptions): Promise<{data: {revision: number; configured: false; dispatch_available: false; erased_revisions: number}}> {
    if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 1) throw new Error('expected_revision must be a positive safe integer');
    if ((input.erase_history !== undefined && typeof input.erase_history !== 'boolean') || (input.confirm_erase !== undefined && typeof input.confirm_erase !== 'boolean')) throw new Error('Erasure options must be booleans');
    if (input.erase_history && input.confirm_erase !== true) throw new Error('Explicit confirmation is required to erase stored asset credentials');
    return this.request(`/vendors/${uuid(configurationId)}/asset-management`, {
      expected_revision: input.expected_revision, erase_history: input.erase_history ?? false,
      confirm_erase: input.confirm_erase ?? false,
    }, options, 'DELETE');
  }

  configureAssetManagement(configurationId: string, input: AssetManagementConfigurationInput, options?: RequestOptions): Promise<{data: AssetManagementConfiguration}> {
    if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0 || input.expected_revision === Number.MAX_SAFE_INTEGER) throw new Error('expected_revision must be a nonnegative safe integer with room for the next revision');
    if (typeof input.upstream_project !== 'string' || !input.upstream_project.trim() || input.upstream_project.trim() !== input.upstream_project || [...input.upstream_project].length > 1024 || /[\u0000-\u001f\u007f]/.test(input.upstream_project)) throw new Error('Invalid upstream project');
    if (typeof input.access_key !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(input.access_key) || typeof input.secret_key !== 'string' || !input.secret_key || input.secret_key.length > 4096 || /[\u0000-\u001f\u007f]/.test(input.secret_key)) throw new Error('Invalid asset management credentials');
    return this.request(`/vendors/${uuid(configurationId)}/asset-management`, {
      expected_revision: input.expected_revision, upstream_project: input.upstream_project,
      access_key: input.access_key, secret_key: input.secret_key,
    }, options, 'PUT');
  }

  assignPersonalCredentialOwner(configurationId: string, organizationId: string, expectedRevision: number, options?: RequestOptions): Promise<{ assigned: boolean }> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error('expectedRevision must be a positive safe integer');
    return this.request(`/vendors/${uuid(configurationId)}/personal-owner`, {
      organization_id: uuid(organizationId), expected_revision: expectedRevision,
    }, options, 'PUT');
  }

  constructor(options: NiuAdminOptions) {
    if (!options.adminToken.trim()) throw new Error('adminToken is required');
    this.token = options.adminToken;
    this.base = (options.baseURL ?? 'http://localhost:2555/admin/v1').replace(/\/+$/, '');
    const url = new URL(this.base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('baseURL must be an HTTP(S) API base without credentials, query or fragment');
    }
    this.requestFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  issueCollectorKey(scope: TenantScope, input: { name: string; ttl_seconds: number; purpose?: 'quota' }, options?: RequestOptions): Promise<{ id: string; token: string }> {
    if (!input.name.trim() || !Number.isSafeInteger(input.ttl_seconds) || input.ttl_seconds < 1 || input.ttl_seconds > 31_536_000) {
      throw new Error('Collector key requires a name and a lifetime of 1 to 31536000 seconds');
    }
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/collector-keys`, input, options);
  }

  listCollectorKeys(scope: TenantScope, purpose?: 'quota', options?: RequestOptions): Promise<{ data: CollectorKeyView[] }> {
    const query = purpose ? `?purpose=${purpose}` : '';
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/collector-keys${query}`, undefined, options);
  }

  revokeCollectorKey(scope: TenantScope, keyId: string, options?: RequestOptions): Promise<void> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/collector-keys/${uuid(keyId)}`, undefined, options, 'DELETE');
  }


  listGatewayActivity(scope: TenantScope, query: GatewayActivityQuery = {}, options?: RequestOptions): Promise<GatewayActivityPage> {
    if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100)) {
      throw new Error('Gateway activity limit must be an integer from 1 to 100');
    }
    const parameters = gatewayActivityParameters(query);
    const suffix = parameters.size ? `?${parameters.toString()}` : '';
    const path = `/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/requests${suffix}`;
    return this.request(path, undefined, options);
  }

  /** Customer-safe CSV; HTTP 413 rejects oversized ranges without a partial file. */
  exportGatewayActivity(scope: TenantScope, query: GatewayActivityExportQuery = {}, options?: RequestOptions): Promise<string> {
    if ('limit' in query || 'after' in query) throw new Error('Exports do not accept pagination parameters');
    const parameters = gatewayActivityParameters(query);
    const suffix = parameters.size ? `?${parameters}` : '';
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/requests/export${suffix}`, undefined, options, 'GET', 'text/csv');
  }

  /** Missing historical/denied attribution stays null; this does not claim content inspection. */
  getRequestGuardrailDecision(scope: TenantScope, attemptId: string, options?: RequestOptions): Promise<{data: RequestGuardrailDecision | null}> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/requests/${uuid(attemptId)}/guardrails`, undefined, options);
  }

  /** Declared processing conditions for deployment-authorized workspace detectors. */
  listWorkspaceDetectors(scope: TenantScope, options?: RequestOptions): Promise<{ data: WorkspaceDetectorDescription[] }> {
    return this.request(`${this.guardrailsPath(scope)}/detectors`, undefined, options);
  }

  /** Image disclosure is separate from text consent; policy activation remains unavailable. */
  listWorkspaceImageDetectors(scope: TenantScope, options?: RequestOptions): Promise<{ data: WorkspaceImageDetectorDescription[] }> {
    return this.request(`${this.guardrailsPath(scope)}/image-detectors`, undefined, options);
  }

  /** Explicit image consent for a synthetic test; does not save or activate a policy. */
  previewWorkspaceImageDetector(scope: TenantScope, detector: string, input: ImageDetectorPreviewInput, options?: RequestOptions): Promise<ImageDetectorPreviewResult> {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(detector)) throw new TypeError('Invalid image detector name');
    if (input.consent?.consent_to_image_processing !== true || !/^[a-f0-9]{64}$/.test(input.consent.configuration_fingerprint)) throw new TypeError('Current explicit image processing consent is required');
    if (typeof input.image !== 'string' || !input.image.startsWith('data:image/') || input.image.length > 2 * 1024 * 1024) throw new TypeError('A bounded inline image is required');
    return this.request(`${this.guardrailsPath(scope)}/image-detectors/${detector}/preview`, {
      consent: {configuration_fingerprint: input.consent.configuration_fingerprint, consent_to_image_processing: true}, image: input.image,
    }, options, 'POST');
  }

  /** Metadata-only required input decisions, including pre-admission denials. */
  listInputDetectorDecisions(scope: TenantScope, options?: RequestOptions): Promise<{ data: Array<{ detector: string; configuration_fingerprint: string; stage: 'input'; coverage: 'local_text'; enforcer_version: 'external-input-v1'; outcome: 'clear' | 'matched' | 'indeterminate'; reason: string; elapsed_ms: number; key_name: string; workspace_revision: number | null; key_policy_revision: number | null; key_assignment_revision: number | null; recorded_at: string }>; coverage: 'latest_100_input_detector_decisions' }> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/guardrails/detector-decisions`, undefined, options);
  }

  /** Latest 100 pre-admission access denials; excludes content and dispatch-time race denials. */
  listGuardrailPreparationDenials(scope: TenantScope, options?: RequestOptions): Promise<{ data: GuardrailPreparationDenial[]; coverage: 'latest_100_preparation_denials' }> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/guardrails/denials`, undefined, options);
  }

  /** Recorded policy exceptions only; eligibility status denials remain outside coverage. */
  listGuardrailDispatchDenials(scope: TenantScope, options?: RequestOptions): Promise<{ data: Array<{
    stage: 'dispatch' | 'batch_admission'; outcome: 'blocked';
    coverage: 'model_provider_access' | 'policy_binding';
    reason: 'access_denied' | 'input_binding_missing' | 'policy_changed';
    key_name: string; workspace_policy_name: string | null; key_policy_name: string | null;
    workspace_revision: number | null; key_policy_revision: number | null;
    key_assignment_revision: number | null; recorded_at: string;
  }>; coverage: 'latest_100_dispatch_policy_exceptions' }> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/guardrails/dispatch-denials`, undefined, options);
  }

  getRequestPayload(scope: TenantScope, attemptId: string, options?: RequestOptions): Promise<{data: RequestPayload | null}> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/requests/${uuid(attemptId)}/payloads`, undefined, options);
  }

  /** Local request discovery only; does not query upstream or establish asset readiness. */
  listAssetGroupRequests(scope: TenantScope, query: {after?: string; limit?: number} = {}, options?: RequestOptions): Promise<{data: Array<{id: string; name: string|null; status: 'prepared'|'dispatching'|'uncertain'|'succeeded'; created_at: string; request_content_status: 'retained'|'deleted'|'expired'}>; next_cursor: string|null}> {
    const search = new URLSearchParams();
    if (query.after !== undefined) search.set('after', uuid(query.after));
    if (query.limit !== undefined) {
      if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new TypeError('limit must be between 1 and 100');
      search.set('limit', String(query.limit));
    }
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/asset-group-intents${search.size ? '?' + search : ''}`, undefined, options);
  }

  getAssetGroupRequest(scope: TenantScope, intentId: string, options?: RequestOptions): Promise<{data: {status: 'prepared'|'dispatching'|'uncertain'|'succeeded'; created_at: string; request_content_status: 'retained'|'deleted'|'expired'; request: {name: string; description: string|null}|null; dispatch?: {outcome: 'succeeded'|'uncertain'; reason: 'invalid_configuration'|'destination_rejected'|'upstream_uncertain'|'timeout'|null; duration_ms: number}|null}|null}> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/asset-group-intents/${uuid(intentId)}/request`, undefined, options);
  }

  deleteAssetGroupRequest(scope: TenantScope, intentId: string, options?: RequestOptions): Promise<void> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/asset-group-intents/${uuid(intentId)}/request`, undefined, options, 'DELETE');
  }

  deleteRequestPayload(scope: TenantScope, attemptId: string, options?: RequestOptions): Promise<void> {
    return this.request(`/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/requests/${uuid(attemptId)}/payloads`, undefined, options, 'DELETE');
  }

  listAccounts(scope: TenantScope, options?: RequestOptions): Promise<{ data: SupplierAccount[] }> {
    return this.request(this.accountsPath(scope), undefined, options);
  }

  createAccount(scope: TenantScope, account: SupplierAccountInput, options?: RequestOptions): Promise<{ id: string; health: string }> {
    return this.request(this.accountsPath(scope), account, options);
  }

  quota(scope: TenantScope, accountId: string, options?: RequestOptions): Promise<{ data: QuotaWindow[] }> {
    return this.request(`${this.accountsPath(scope)}/${uuid(accountId)}/quota`, undefined, options);
  }

  observeQuota(scope: TenantScope, accountId: string, observation: QuotaObservation, options?: RequestOptions): Promise<{ id: string }> {
    for (const value of [observation.remaining, observation.maximum]) {
      if (value !== null && (typeof value !== 'string' || !/^\d+$/.test(value) || BigInt(value) > 9223372036854775807n)) {
        throw new Error('Quota quantities must be nonnegative signed-64-bit decimal strings or null');
      }
    }
    for (const value of [observation.observed_at_ms, observation.valid_until_ms, observation.resets_at_ms]) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Quota timestamps must be nonnegative safe-integer milliseconds');
    }
    return this.request(`${this.accountsPath(scope)}/${uuid(accountId)}/quota`, observation, options);
  }

  private accountsPath(scope: TenantScope): string {
    return `/organizations/${uuid(scope.organizationId)}/projects/${uuid(scope.projectId)}/accounts`;
  }

  private async raw(path: string, body: unknown, options: RequestOptions, method?: string, accept = 'application/json'): Promise<Response> {
    const response = await this.requestFetch(`${this.base}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { authorization: `Bearer ${this.token}`, accept, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
      redirect: 'error',
    });
    if (!response.ok) {
      const text=await response.text();let payload:unknown;
      try {payload=text ? JSON.parse(text):undefined;} catch {payload=text;}
      throw new NiuAPIError(response.status,payload,response.headers.get('x-request-id') ?? undefined);
    }
    return response;
  }

  private async request<T>(path: string, body?: unknown, options: RequestOptions = {}, method?: string, accept = 'application/json'): Promise<T> {
    const response = await this.raw(path,body,options,method,accept);
    const text = await response.text();
    let payload: unknown;
    try { payload = text ? JSON.parse(text) : undefined; } catch { payload = text; }
    if (!response.ok) throw new NiuAPIError(response.status, payload, response.headers.get('x-request-id') ?? undefined);
    if (accept === 'text/csv') {
      if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/csv') throw new Error('Expected a CSV export response');
      options.signal?.throwIfAborted();
      return text as T;
    }
    return payload as T;
  }
}

function gatewayActivityParameters(query: GatewayActivityQuery): URLSearchParams {
  const parameters = new URLSearchParams();
  if (query.httpStatus !== undefined) {
    if (query.httpStatus !== 'unknown' && (!Number.isInteger(query.httpStatus) || query.httpStatus < 100 || query.httpStatus > 599)) throw new Error('httpStatus must be an integer from 100 to 599 or unknown');
    parameters.set('http_status', String(query.httpStatus));
  }
  if (query.sort !== undefined) {
    if (!['time_desc', 'time_asc', 'latency_desc', 'input_desc', 'output_desc'].includes(query.sort)) throw new Error('Invalid request sort');
    parameters.set('sort', query.sort);
  }
  if (query.limit !== undefined) parameters.set('limit', String(query.limit));
  if (query.after !== undefined) parameters.set('after', uuid(query.after));
  for (const [name, value] of [['from_ms', query.fromMs], ['to_ms', query.toMs]] as const) {
    if (value !== undefined) {
      if (!Number.isSafeInteger(value)) throw new Error(`${name} must be safe-integer milliseconds`);
      parameters.set(name, String(value));
    }
  }
  if (query.fromMs !== undefined && query.toMs !== undefined && query.fromMs >= query.toMs) throw new Error('Activity range requires fromMs before toMs');
  if (query.modelAlias !== undefined) {
    if (!query.modelAlias.length || query.modelAlias.length > 200) throw new Error('modelAlias must contain 1 to 200 characters');
    parameters.set('model_alias', query.modelAlias);
  }
  if (query.apiKeyId !== undefined) parameters.set('key_id', uuid(query.apiKeyId));
  if (query.status !== undefined) {
    if (!['not_sent', 'may_have_executed', 'confirmed_completed', 'confirmed_not_executed', 'output_withheld', 'delivery_failed'].includes(query.status)) throw new Error('Invalid gateway execution status');
    parameters.set('status', query.status);
  }
  return parameters;
}

function evidenceDigest(value: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError('Reviewed evidence requires a lowercase SHA-256 digest');
  return value;
}
function qualificationExpiry(value: number): number {
  if (!Number.isSafeInteger(value) || value <= Date.now() || value > 253402300799999) throw new TypeError('Qualification requires a future supported expiry timestamp');
  return value;
}
function validateRates(rates: SupplierRateInput | CustomerTariffInput): void {
  if (!rates.model_alias.trim() || rates.model_alias.length > 200 || !/^[A-Z]{3}$/.test(rates.currency)) throw new Error('A model alias and three-letter currency are required');
  for (const value of [rates.prompt_rate, rates.completion_rate]) {
    if (typeof value !== 'string' || !/^\d+$/.test(value) || BigInt(value) > 1_000_000_000_000_000n) throw new Error('Rates must be nonnegative integer strings up to 1000000000000000');
  }
  if (rates.expected_revision !== null) uuid(rates.expected_revision);
}

function uuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('Scope and account IDs must be UUIDs');
  return value;
}

export type NiuCollectorOptions = {
  collectorToken: string;
  scope: TenantScope;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
};

/** Quota writer bound to one project. Server authorization is authoritative. */
export class NiuCollectorClient {
  readonly #client: NiuAdminClient;
  readonly #scope: TenantScope;

  constructor(options: NiuCollectorOptions) {
    if (!options.collectorToken.trim()) throw new Error('collectorToken is required');
    this.#scope = { organizationId: uuid(options.scope.organizationId), projectId: uuid(options.scope.projectId) };
    this.#client = new NiuAdminClient({ adminToken: options.collectorToken, baseURL: options.baseURL, fetch: options.fetch });
  }

  observeQuota(accountId: string, observation: QuotaObservation, options?: RequestOptions): Promise<{ id: string }> {
    return this.#client.observeQuota(this.#scope, accountId, observation, options);
  }

}

function supplierMediaRateBody(input: SupplierMediaRateCard): SupplierMediaRateCard {
  uuid(input.offer_revision);
  const integers = [input.vendor_revision, input.model_revision, input.tariff.amount_units,
    input.tariff.decimal_places, input.tariff.effective_from,
    ...(input.tariff.effective_until === null ? [] : [input.tariff.effective_until]),
    ...input.discounts.flatMap(rule => [rule.effective_from, rule.priority,
      ...(rule.effective_until === null ? [] : [rule.effective_until])])];
  if (!integers.every(Number.isSafeInteger)) throw new TypeError('Media rate integers must be exact JavaScript safe integers');
  return { revision: input.revision, offer_revision: input.offer_revision, vendor_revision: input.vendor_revision,
    model_revision: input.model_revision, schema_revision: input.schema_revision, tariff: input.tariff, discounts: input.discounts };
}

function customerMediaRateBody(input: CustomerMediaRateCard): CustomerMediaRateCard {
    uuid(input.vendor_id);
    const integers = [input.vendor_revision, input.model_revision, input.tariff.amount_units,
      input.tariff.decimal_places, input.tariff.effective_from,
      ...(input.tariff.effective_until === null ? [] : [input.tariff.effective_until]),
      ...input.discounts.flatMap(rule => [rule.effective_from, rule.priority,
        ...(rule.effective_until === null ? [] : [rule.effective_until])])];
    if (!integers.every(Number.isSafeInteger)) throw new Error('Media rate integers must be exact JavaScript safe integers');
    return {
      revision: input.revision, vendor_id: input.vendor_id, vendor_revision: input.vendor_revision,
      model_revision: input.model_revision, schema_revision: input.schema_revision, offer_revision: input.offer_revision,
      tariff: input.tariff, discounts: input.discounts, maximum_quantity: input.maximum_quantity,
      liability_qualification_revision: input.liability_qualification_revision,
    };
}
