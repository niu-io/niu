use crate::{GatewayCompletion, PriceInput, Principal, Store, StoreError, TenantScope, TokenRates};
use sqlx::{QueryBuilder, Row, postgres::Postgres};
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
pub struct BudgetSnapshot {
    pub currency: String,
    pub limit_nanos: i64,
    pub reserved_nanos: i64,
    pub spent_nanos: i64,
}

#[derive(Debug, PartialEq, Eq, sqlx::FromRow)]
pub struct CostEntry {
    pub attempt_id: Uuid,
    pub price_revision_id: Uuid,
    pub currency: String,
    pub api_equivalent_nanos: i64,
    pub cash_nanos: i64,
    pub usage_prompt_tokens: i64,
    pub usage_completion_tokens: i64,
    pub bound_exceeded: bool,
}

/// Automatically retained metadata for one request admitted by the gateway.
/// Request and response bodies are deliberately not part of this record.
#[derive(Debug, sqlx::FromRow, serde::Serialize)]
pub struct GatewayActivityEntry {
    pub attempt_id: Uuid,
    pub reference: String,
    pub operation_id: Uuid,
    pub retry: Option<serde_json::Value>,
    pub api_key_id: Option<Uuid>,
    pub key_name: Option<String>,
    pub task_id: Option<String>,
    pub task_evidence: Option<serde_json::Value>,
    pub request_kind: String,
    pub model: String,
    pub provider_model: Option<String>,
    pub created_at: String,
    pub dispatched_at: Option<String>,
    pub completed_at: Option<String>,
    pub duration_ms: Option<i64>,
    pub timing: Option<serde_json::Value>,
    pub execution: String,
    pub output_guardrail_outcome: Option<String>,
    pub usage_confidence: String,
    pub prompt_tokens: Option<String>,
    pub completion_tokens: Option<String>,
    pub cached_input_tokens: Option<String>,
    pub cache_write_input_tokens: Option<String>,
    pub reasoning_output_tokens: Option<String>,
    pub finish_reasons: Option<sqlx::types::Json<Vec<crate::RequestChoiceFinish>>>,
    pub failure: Option<sqlx::types::Json<crate::RequestFailure>>,
    pub admission_denial: Option<sqlx::types::Json<crate::GatewayAdmissionDenial>>,
    pub customer_charge_currency: Option<String>,
    pub customer_charge_nanos: Option<String>,
    pub customer_unit_charge: Option<serde_json::Value>,
    pub customer_charge_status: String,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum GatewayActivitySort {
    #[default]
    Newest,
    Oldest,
    Latency,
    InputTokens,
    OutputTokens,
}

impl GatewayActivitySort {
    fn expression(self, cursor: bool) -> &'static str {
        match (self, cursor) {
            (Self::Newest | Self::Oldest, false) => "a.created_at",
            (Self::Newest | Self::Oldest, true) => "cursor.created_at",
            (Self::InputTokens, false) => "a.prompt_tokens",
            (Self::InputTokens, true) => "cursor.prompt_tokens",
            (Self::OutputTokens, false) => "a.completion_tokens",
            (Self::OutputTokens, true) => "cursor.completion_tokens",
            (Self::Latency, false) => {
                "CASE WHEN t.attempt_id IS NOT NULL THEN CASE WHEN t.complete THEN t.total_ms END WHEN a.dispatched_at IS NOT NULL AND a.completed_at IS NOT NULL THEN GREATEST(0, round(extract(epoch FROM (a.completed_at-a.dispatched_at))*1000))::bigint END"
            }
            (Self::Latency, true) => {
                "CASE WHEN cursor_t.attempt_id IS NOT NULL THEN CASE WHEN cursor_t.complete THEN cursor_t.total_ms END WHEN cursor.dispatched_at IS NOT NULL AND cursor.completed_at IS NOT NULL THEN GREATEST(0, round(extract(epoch FROM (cursor.completed_at-cursor.dispatched_at))*1000))::bigint END"
            }
        }
    }
    fn ascending(self) -> bool {
        matches!(self, Self::Oldest)
    }
}

fn push_activity_order(query: &mut QueryBuilder<'_, Postgres>, sort: GatewayActivitySort) {
    let direction = if sort.ascending() { " ASC" } else { " DESC" };
    query
        .push(" ORDER BY ")
        .push(sort.expression(false))
        .push(direction)
        .push(" NULLS LAST, a.created_at")
        .push(direction)
        .push(", a.id")
        .push(direction);
}

#[derive(Debug, Clone, Copy)]
pub enum GatewayDeliveryFilter {
    Unknown,
    HttpStatus(i32),
}

#[derive(Debug, Clone, Default)]
pub struct GatewayActivityFilter {
    pub search: Option<String>,
    pub operation_id: Option<Uuid>,
    pub from_ms: Option<i64>,
    pub to_ms: Option<i64>,
    pub model_alias: Option<String>,
    pub api_key_id: Option<Uuid>,
    pub execution: Option<String>,
    pub sort: GatewayActivitySort,
    pub delivery_status: Option<GatewayDeliveryFilter>,
}

/// Customer-safe export fields only: no credentials, internal identifiers,
/// payloads, Provider prices or procurement accounting.
#[derive(Debug, sqlx::FromRow)]
pub struct GatewayActivityExportEntry {
    pub created_at: String,
    pub model: String,
    pub key_name: Option<String>,
    pub http_status: Option<i32>,
    pub execution: String,
    pub usage_confidence: String,
    pub prompt_tokens: Option<String>,
    pub completion_tokens: Option<String>,
    pub customer_charge_status: String,
    pub customer_charge_currency: Option<String>,
    pub customer_charge_nanos: Option<String>,
    pub customer_unit_name: Option<String>,
    pub customer_unit_charge_atoms: Option<String>,
    pub total_ms: Option<i64>,
    pub timing_complete: Option<bool>,
    pub cached_input_tokens: Option<String>,
    pub cache_write_input_tokens: Option<String>,
    pub reasoning_output_tokens: Option<String>,
    pub finish_reasons: Option<sqlx::types::Json<Vec<crate::RequestChoiceFinish>>>,
    pub failure: Option<sqlx::types::Json<crate::RequestFailure>>,
}

/// Categories the response adapter can observe, not a promise that an upstream
/// response will supply them. Missing reported quantities always remain unknown.
#[derive(Clone, Copy, Debug)]
pub struct GatewayTokenUsageCapabilities {
    pub cached_input: bool,
    pub cache_write_input: bool,
    pub reasoning_output: bool,
}

/// Fixed price revision and worst-case token bounds for a priced gateway dispatch.
pub struct GatewayReservation {
    pub price_revision_id: Uuid,
    pub resource_id: String,
    pub offer_revision: String,
    pub prompt_bound: i64,
    pub completion_bound: i64,
    pub token_usage: GatewayTokenUsageCapabilities,
}

#[derive(Debug, sqlx::FromRow)]
struct GatewayActivitySummaryRow {
    request_count: i64,
    usage_count: i64,
    prompt_tokens: String,
    completion_tokens: String,
    timing_count: i64,
    average_duration_ms: Option<i64>,
    unresolved_customer_charge_count: i64,
    unpriced_request_count: i64,
    owner_funded_request_count: i64,
    latency_percentiles: serde_json::Value,
    token_categories: serde_json::Value,
    customer_charges: sqlx::types::Json<Vec<GatewayActivityCostSummary>>,
    customer_unit_charges: sqlx::types::Json<Vec<serde_json::Value>>,
    charges_by_model: sqlx::types::Json<Vec<serde_json::Value>>,
    charges_by_key: sqlx::types::Json<Vec<serde_json::Value>>,
    unit_charges_by_model: sqlx::types::Json<Vec<serde_json::Value>>,
    unit_charges_by_key: sqlx::types::Json<Vec<serde_json::Value>>,
    usage_by_model: sqlx::types::Json<Vec<GatewayActivityModelSummary>>,
    usage_by_key: sqlx::types::Json<Vec<GatewayActivityKeySummary>>,
    request_histogram: sqlx::types::Json<Vec<serde_json::Value>>,
    delivery_statuses: sqlx::types::Json<Vec<GatewayDeliverySummary>>,
}

#[derive(Debug, sqlx::FromRow)]
struct GatewaySettlementCandidate {
    attempt_id: Uuid,
    price_revision_id: Uuid,
    reserved_nanos: i64,
    prompt_bound: i64,
    completion_bound: i64,
    currency: String,
    api_prompt_rate: i64,
    api_completion_rate: i64,
    cash_prompt_rate: i64,
    cash_completion_rate: i64,
    prompt_tokens: i64,
    completion_tokens: i64,
}

struct GatewaySettlementEntry {
    attempt_id: Uuid,
    price_revision_id: Uuid,
    currency: String,
    api_equivalent_nanos: i64,
    cash_nanos: i64,
    prompt_tokens: i64,
    completion_tokens: i64,
    bound_exceeded: bool,
}

#[derive(Debug, sqlx::FromRow, serde::Serialize, serde::Deserialize)]
pub struct GatewayActivityCostSummary {
    pub currency: String,
    pub amount_nanos: String,
    pub charged_requests: i64,
}

#[derive(Debug, sqlx::FromRow, serde::Serialize, serde::Deserialize)]
pub struct GatewayActivityModelSummary {
    pub model_alias: String,
    pub request_count: i64,
    pub usage_count: i64,
    pub prompt_tokens: String,
    pub completion_tokens: String,
    pub unknown_usage_count: i64,
}

#[derive(Debug, sqlx::FromRow, serde::Serialize, serde::Deserialize)]
pub struct GatewayActivityKeySummary {
    pub api_key_id: Option<Uuid>,
    pub key_name: Option<String>,
    pub request_count: i64,
    pub usage_count: i64,
    pub prompt_tokens: String,
    pub completion_tokens: String,
    pub unknown_usage_count: i64,
}

#[derive(Debug, sqlx::FromRow, serde::Serialize, serde::Deserialize)]
pub struct GatewayDeliverySummary {
    pub http_status: Option<i32>,
    pub request_count: i64,
}

#[derive(Debug, serde::Serialize)]
pub struct GatewayActivitySummary {
    pub request_count: i64,
    pub usage_count: i64,
    pub prompt_tokens: String,
    pub completion_tokens: String,
    pub timing_count: i64,
    pub average_duration_ms: Option<i64>,
    pub unresolved_customer_charge_count: i64,
    pub unpriced_request_count: i64,
    pub owner_funded_request_count: i64,
    pub customer_charges: Vec<GatewayActivityCostSummary>,
    pub customer_unit_charges: Vec<serde_json::Value>,
    pub charges_by_model: Vec<serde_json::Value>,
    pub charges_by_key: Vec<serde_json::Value>,
    pub unit_charges_by_model: Vec<serde_json::Value>,
    pub unit_charges_by_key: Vec<serde_json::Value>,
    pub usage_by_model: Vec<GatewayActivityModelSummary>,
    pub usage_by_key: Vec<GatewayActivityKeySummary>,
    pub request_histogram: Vec<serde_json::Value>,
    pub latency_percentiles: serde_json::Value,
    pub delivery_statuses: Vec<GatewayDeliverySummary>,
    pub token_categories: serde_json::Value,
}

fn push_activity_scope_and_filters<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    scope: TenantScope,
    filter: &'a GatewayActivityFilter,
) {
    query
        .push(" WHERE a.organization_id = ")
        .push_bind(scope.organization_id)
        .push(" AND a.project_id = ")
        .push_bind(scope.project_id);
    if let Some(search) = filter.search.as_deref() {
        // Literal substring search over customer-visible request metadata.
        query.push(" AND (strpos(lower(concat_ws(' ', o.model_alias, a.provider_model, a.public_reference)), lower(")
            .push_bind(search)
            .push(")) > 0 OR strpos(translate(lower(concat_ws(' ', o.model_alias, a.provider_model)), '-_', '  '), translate(lower(")
            .push_bind(search)
            .push("), '-_', '  ')) > 0 OR EXISTS (SELECT 1 FROM api_keys search_key WHERE search_key.organization_id=a.organization_id AND search_key.project_id=a.project_id AND search_key.id=a.api_key_id AND strpos(lower(search_key.name), lower(")
            .push_bind(search)
            .push(")) > 0) OR EXISTS (SELECT 1 FROM request_timings search_timing WHERE search_timing.attempt_id=a.id AND search_timing.http_status IS NOT NULL AND strpos(lower('HTTP ' || search_timing.http_status::text), lower(")
            .push_bind(search)
            .push(")) > 0))");
    }
    if let Some(operation_id) = filter.operation_id {
        query.push(" AND a.operation_id = ").push_bind(operation_id);
    }
    if let Some(from_ms) = filter.from_ms {
        query
            .push(" AND a.created_at >= to_timestamp(")
            .push_bind(from_ms as f64 / 1000.0)
            .push("::double precision)");
    }
    if let Some(to_ms) = filter.to_ms {
        query
            .push(" AND a.created_at < to_timestamp(")
            .push_bind(to_ms as f64 / 1000.0)
            .push("::double precision)");
    }
    if let Some(model_alias) = filter.model_alias.as_deref() {
        query.push(" AND o.model_alias = ").push_bind(model_alias);
    }
    if let Some(api_key_id) = filter.api_key_id {
        query.push(" AND (a.api_key_id = ").push_bind(api_key_id)
            .push(" OR (a.dispatched_at IS NULL AND a.execution='not_sent' AND EXISTS (SELECT 1 FROM gateway_admission_denials denial WHERE denial.attempt_id=a.id AND denial.organization_id=a.organization_id AND denial.project_id=a.project_id AND denial.requested_key_id=")
            .push_bind(api_key_id).push(")))");
    }
    if let Some(execution) = filter.execution.as_deref() {
        if execution == "output_withheld" {
            query.push(" AND EXISTS (SELECT 1 FROM output_guardrail_decisions decision WHERE decision.organization_id=a.organization_id AND decision.project_id=a.project_id AND decision.attempt_id=a.id AND decision.outcome IN ('blocked','indeterminate'))");
        } else if execution == "recorded_failure" {
            query.push(" AND (EXISTS (SELECT 1 FROM request_failures failure WHERE failure.attempt_id=a.id) OR (a.dispatched_at IS NULL AND a.execution='not_sent' AND EXISTS (SELECT 1 FROM gateway_admission_denials denial WHERE denial.attempt_id=a.id AND denial.organization_id=a.organization_id AND denial.project_id=a.project_id)))");
        } else if execution == "delivery_failed" {
            query.push(" AND EXISTS (SELECT 1 FROM request_timings delivery WHERE delivery.attempt_id=a.id AND delivery.http_status>=400)");
        } else {
            query.push(" AND a.execution = ").push_bind(execution);
        }
    }
    match filter.delivery_status {
        Some(GatewayDeliveryFilter::Unknown) => {
            query.push(" AND NOT EXISTS (SELECT 1 FROM request_timings delivery WHERE delivery.attempt_id=a.id AND delivery.http_status IS NOT NULL)");
        }
        Some(GatewayDeliveryFilter::HttpStatus(status)) => {
            query.push(" AND EXISTS (SELECT 1 FROM request_timings delivery WHERE delivery.attempt_id=a.id AND delivery.http_status=").push_bind(status).push(")");
        }
        None => {}
    }
}

fn currency_valid(currency: &str) -> bool {
    currency.len() == 3 && currency.bytes().all(|b| b.is_ascii_uppercase())
}

pub(crate) fn map_gateway_admission_error(error: sqlx::Error) -> StoreError {
    crate::trigger_error::map(error)
}

pub(crate) fn map_reservation_error(error: sqlx::Error) -> StoreError {
    crate::trigger_error::map(error)
}

impl Store {
    /// Bound reporting contention without changing later work on the pooled connection.
    /// These short reporting queries have many subplans: cost-based JIT can spend
    /// their entire deadline compiling even when the result contains only a few rows.
    async fn begin_activity_read(
        &self,
    ) -> Result<sqlx::Transaction<'static, Postgres>, StoreError> {
        self.begin_tx_with(
            "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL lock_timeout = '1s'; SET LOCAL statement_timeout = '5s'; SET LOCAL jit = off",
        )
        .await
    }

    /// Check the limit before enrichment, within the same read snapshot as
    /// the export, so an oversized selection fails without materializing rows.
    pub async fn gateway_activity_export(
        &self,
        scope: TenantScope,
        filter: &GatewayActivityFilter,
    ) -> Result<Vec<GatewayActivityExportEntry>, StoreError> {
        let mut snapshot = self.begin_activity_read().await?;
        let mut count = QueryBuilder::new("SELECT count(*)::bigint FROM (SELECT 1 FROM attempts a");
        if filter.model_alias.is_some() || filter.search.is_some() {
            // The composite foreign key guarantees matching tenant scope.
            // Join on the unique operation ID to avoid a workspace-range
            // nested loop when statistics underestimate a new workspace.
            count.push(" JOIN operations o ON o.id=a.operation_id");
        }
        push_activity_scope_and_filters(&mut count, scope, filter);
        count.push(" LIMIT 10001) bounded");
        let matching: i64 = count.build_query_scalar().fetch_one(&mut *snapshot).await?;
        if matching > 10_000 {
            return Err(StoreError::RequestExportTooLarge);
        }
        let mut query = QueryBuilder::new(
            "SELECT to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at, \
             o.model_alias AS model, k.name AS key_name, t.http_status, a.execution, a.usage_confidence, \
             a.prompt_tokens::text AS prompt_tokens, a.completion_tokens::text AS completion_tokens, \
             CASE WHEN c.attempt_id IS NOT NULL OR uc.attempt_id IS NOT NULL THEN 'charged' \
               WHEN a.dispatched_at IS NULL OR a.execution='confirmed_not_executed' OR niu_attempt_failed_zero_cost(a.id) THEN 'not_charged' \
               WHEN EXISTS (SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=a.id) THEN 'owner_funded' \
               WHEN (EXISTS (SELECT 1 FROM customer_attempt_tariffs t1 WHERE t1.attempt_id=a.id) \
                  OR EXISTS (SELECT 1 FROM customer_media_attempt_pricing t2 WHERE t2.attempt_id=a.id) \
                  OR EXISTS (SELECT 1 FROM customer_unit_attempt_tariffs t3 WHERE t3.attempt_id=a.id) \
                  OR EXISTS (SELECT 1 FROM customer_unit_media_attempt_tariffs t4 WHERE t4.attempt_id=a.id)) THEN 'pending' \
               ELSE 'unpriced' END AS customer_charge_status, \
             c.currency AS customer_charge_currency, c.amount_nanos::text AS customer_charge_nanos, \
             uc.unit_name AS customer_unit_name, uc.net_atoms::text AS customer_unit_charge_atoms, \
             t.total_ms, t.complete AS timing_complete, \
             rtc.cache_write_input_tokens::text AS cache_write_input_tokens, \
             rtc.cached_input_tokens::text AS cached_input_tokens, \
             rtc.reasoning_output_tokens::text AS reasoning_output_tokens, \
             rfr.choices AS finish_reasons, \
             CASE WHEN f.attempt_id IS NULL THEN NULL ELSE jsonb_build_object('kind',f.kind,'upstream_http_status',f.upstream_http_status,'transport_phase',f.transport_phase) END AS failure \
             FROM attempts a JOIN operations o ON o.id=a.operation_id \
             LEFT JOIN api_keys k ON k.organization_id=a.organization_id AND k.project_id=a.project_id AND k.id=a.api_key_id \
             LEFT JOIN request_timings t ON t.attempt_id=a.id \
             LEFT JOIN customer_activity_charges c ON c.organization_id=a.organization_id AND c.project_id=a.project_id AND c.attempt_id=a.id \
             LEFT JOIN customer_activity_unit_charges uc ON uc.organization_id=a.organization_id AND uc.project_id=a.project_id AND uc.attempt_id=a.id \
             LEFT JOIN request_token_categories rtc ON rtc.attempt_id=a.id \
             LEFT JOIN request_finish_reasons rfr ON rfr.attempt_id=a.id \
             LEFT JOIN request_failures f ON f.attempt_id=a.id",
        );
        push_activity_scope_and_filters(&mut query, scope, filter);
        push_activity_order(&mut query, filter.sort);
        let rows = query.build_query_as().fetch_all(&mut *snapshot).await?;
        crate::commit_tx(snapshot).await?;
        Ok(rows)
    }

    /// Recent model requests recorded by the gateway itself, optionally grouped
    /// later by their caller-supplied task identifier.
    pub async fn gateway_activity(
        &self,
        scope: TenantScope,
        after: Option<Uuid>,
        limit: i64,
        filter: &GatewayActivityFilter,
    ) -> Result<Vec<GatewayActivityEntry>, StoreError> {
        self.gateway_activity_selection(scope, after, limit, filter, None)
            .await
    }

    pub async fn request_id_by_reference(
        &self,
        scope: TenantScope,
        reference: &str,
    ) -> Result<Option<Uuid>, StoreError> {
        Ok(sqlx::query_scalar("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND public_reference=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(reference)
            .fetch_optional(&self.pool).await?)
    }

    pub async fn gateway_request(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<Option<GatewayActivityEntry>, StoreError> {
        Ok(self
            .gateway_activity_selection(
                scope,
                None,
                1,
                &GatewayActivityFilter::default(),
                Some(attempt),
            )
            .await?
            .into_iter()
            .next())
    }

    /// One response observes one snapshot, including its page and full-range totals.
    /// A later cursor request opens a new snapshot rather than retaining a transaction.
    pub async fn gateway_activity_page(
        &self,
        scope: TenantScope,
        after: Option<Uuid>,
        limit: i64,
        filter: &GatewayActivityFilter,
    ) -> Result<(Vec<GatewayActivityEntry>, GatewayActivitySummary), StoreError> {
        let mut snapshot = self.begin_activity_read().await?;
        let summary = Self::gateway_activity_summary_on(&mut snapshot, scope, filter).await?;
        let data =
            Self::gateway_activity_selection_on(&mut snapshot, scope, after, limit, filter, None)
                .await?;
        crate::commit_tx(snapshot).await?;
        Ok((data, summary))
    }

    async fn gateway_activity_selection(
        &self,
        scope: TenantScope,
        after: Option<Uuid>,
        limit: i64,
        filter: &GatewayActivityFilter,
        attempt: Option<Uuid>,
    ) -> Result<Vec<GatewayActivityEntry>, StoreError> {
        let mut snapshot = self.begin_activity_read().await?;
        let rows = Self::gateway_activity_selection_on(
            &mut snapshot,
            scope,
            after,
            limit,
            filter,
            attempt,
        )
        .await?;
        crate::commit_tx(snapshot).await?;
        Ok(rows)
    }

    pub(crate) async fn gateway_activity_selection_on(
        connection: &mut sqlx::PgConnection,
        scope: TenantScope,
        after: Option<Uuid>,
        limit: i64,
        filter: &GatewayActivityFilter,
        attempt: Option<Uuid>,
    ) -> Result<Vec<GatewayActivityEntry>, StoreError> {
        if !(1..=101).contains(&limit) {
            return Err(StoreError::InvalidPrice);
        }
        let mut query = QueryBuilder::new(
            "SELECT a.id AS attempt_id, a.public_reference AS reference, a.operation_id, (SELECT jsonb_build_object('ordinal',r.ordinal,'predecessor_attempt_id',r.predecessor_id,'maximum_attempts',p.maximum_attempts,'policy_revision',p.policy_revision) FROM gateway_retry_attempts r JOIN gateway_retry_policies p ON p.operation_id=r.operation_id WHERE r.attempt_id=a.id) AS retry, a.api_key_id, k.name AS key_name, o.task_id, task.evidence AS task_evidence, CASE WHEN EXISTS(SELECT 1 FROM media_recovery_routes media WHERE media.organization_id=a.organization_id AND media.project_id=a.project_id AND media.attempt_id=a.id) THEN 'video' ELSE 'inference' END AS request_kind, o.model_alias AS model, a.provider_model, \
             to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at, \
             CASE WHEN a.dispatched_at IS NULL THEN NULL ELSE to_char(a.dispatched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') END AS dispatched_at, \
             CASE WHEN a.completed_at IS NULL THEN NULL ELSE to_char(a.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') END AS completed_at, \
             CASE WHEN a.dispatched_at IS NULL OR a.completed_at IS NULL OR EXISTS(SELECT 1 FROM openrouter_usage_reconciliations recovered WHERE recovered.attempt_id=a.id AND recovered.original_state->>'completed_at' IS NULL) THEN NULL ELSE GREATEST(0, round(extract(epoch FROM (a.completed_at - a.dispatched_at)) * 1000))::bigint END AS duration_ms, \
             CASE WHEN t.attempt_id IS NULL THEN NULL ELSE jsonb_build_object('dispatch_ms',t.dispatch_ms,'headers_ms',t.headers_ms,'first_output_ms',t.first_output_ms,'total_ms',t.total_ms,'complete',t.complete,'http_status',t.http_status) END AS timing, \
             a.execution, a.usage_confidence, a.prompt_tokens::text AS prompt_tokens, a.completion_tokens::text AS completion_tokens, \
             rtc.cache_write_input_tokens::text AS cache_write_input_tokens, \
             rtc.cached_input_tokens::text AS cached_input_tokens, \
             rtc.reasoning_output_tokens::text AS reasoning_output_tokens, \
             rfr.choices AS finish_reasons, \
             CASE WHEN f.attempt_id IS NULL THEN NULL ELSE jsonb_build_object('kind',f.kind,'upstream_http_status',f.upstream_http_status,'transport_phase',f.transport_phase) END AS failure, \
             (SELECT jsonb_build_object('kind',d.kind,'http_status',d.http_status,'requested_key_name',d.requested_key_name,'key_name_source','captured_at_admission','recorded_at',d.recorded_at) FROM gateway_admission_denials d WHERE d.attempt_id=a.id AND d.organization_id=a.organization_id AND d.project_id=a.project_id AND a.dispatched_at IS NULL AND a.execution='not_sent') AS admission_denial, \
             (SELECT decision.outcome FROM output_guardrail_decisions decision WHERE decision.organization_id=a.organization_id AND decision.project_id=a.project_id AND decision.attempt_id=a.id) AS output_guardrail_outcome, \
             customer_charge.currency AS customer_charge_currency, customer_charge.amount_nanos::text AS customer_charge_nanos, \
             CASE WHEN uc.attempt_id IS NULL THEN NULL ELSE jsonb_build_object( \
               'definition_revision', uc.definition_revision::text, \
               'name', uc.unit_name, \
               'display_precision', uc.display_precision, \
               'atoms_per_unit', '1000000000', \
               'charged_atoms', uc.charged_atoms::text, \
               'restored_atoms', uc.restored_atoms::text, \
               'net_atoms', uc.net_atoms::text \
             ) END AS customer_unit_charge, \
             CASE WHEN customer_charge.attempt_id IS NOT NULL OR uc.attempt_id IS NOT NULL THEN 'charged' \
               WHEN a.dispatched_at IS NULL OR a.execution='confirmed_not_executed' OR niu_attempt_failed_zero_cost(a.id) THEN 'not_charged' \
               WHEN EXISTS (SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=a.id) THEN 'owner_funded' \
               WHEN (EXISTS (SELECT 1 FROM customer_attempt_tariffs t1 WHERE t1.attempt_id=a.id) \
                  OR EXISTS (SELECT 1 FROM customer_media_attempt_pricing t2 WHERE t2.attempt_id=a.id) \
                  OR EXISTS (SELECT 1 FROM customer_unit_attempt_tariffs t3 WHERE t3.attempt_id=a.id) \
                  OR EXISTS (SELECT 1 FROM customer_unit_media_attempt_tariffs t4 WHERE t4.attempt_id=a.id)) THEN 'pending' \
               ELSE 'unpriced' END AS customer_charge_status \
             FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id \
             LEFT JOIN api_keys k ON k.organization_id=a.organization_id AND k.project_id=a.project_id AND k.id=a.api_key_id \
             LEFT JOIN request_timings t ON t.attempt_id=a.id \
             LEFT JOIN customer_activity_charges customer_charge ON customer_charge.organization_id=a.organization_id AND customer_charge.project_id=a.project_id AND customer_charge.attempt_id=a.id \
             LEFT JOIN customer_activity_unit_charges uc ON uc.organization_id=a.organization_id AND uc.project_id=a.project_id AND uc.attempt_id=a.id \
             LEFT JOIN request_token_categories rtc ON rtc.attempt_id=a.id \
             LEFT JOIN request_finish_reasons rfr ON rfr.attempt_id=a.id \
             LEFT JOIN request_failures f ON f.attempt_id=a.id \
             LEFT JOIN LATERAL (SELECT jsonb_build_object( \
               'execution_id', e.id, 'source', e.source, 'record_id', e.record_id, 'coverage', e.payload->>'coverage', \
               'outcomes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('authority', outcome->>'authority', 'result', outcome->>'result')), '[]'::jsonb) FROM jsonb_array_elements(e.payload->'outcomes') AS items(outcome)) \
             ) AS evidence FROM execution_imports e WHERE e.organization_id=o.organization_id AND e.project_id=o.project_id AND e.task_id=o.task_id ORDER BY e.imported_at DESC, e.id DESC LIMIT 1) task ON true",
        );
        push_activity_scope_and_filters(&mut query, scope, filter);
        if let Some(attempt) = attempt {
            query.push(" AND a.id = ").push_bind(attempt);
        }
        if let Some(after) = after {
            let value = filter.sort.expression(false);
            let anchor = filter.sort.expression(true);
            let comparator = if filter.sort.ascending() {
                " > "
            } else {
                " < "
            };
            query.push(" AND EXISTS (SELECT 1 FROM attempts cursor LEFT JOIN request_timings cursor_t ON cursor_t.attempt_id=cursor.id WHERE cursor.organization_id=a.organization_id AND cursor.project_id=a.project_id AND cursor.id = ").push_bind(after);
            query
                .push(" AND ((")
                .push(anchor)
                .push(") IS NOT NULL AND ((")
                .push(value)
                .push(") IS NULL OR (")
                .push(value)
                .push(")")
                .push(comparator)
                .push("(")
                .push(anchor)
                .push(") OR ((")
                .push(value)
                .push(") = (")
                .push(anchor)
                .push(") AND (a.created_at,a.id)")
                .push(comparator)
                .push("(cursor.created_at,cursor.id))) OR ((")
                .push(anchor)
                .push(") IS NULL AND (")
                .push(value)
                .push(") IS NULL AND (a.created_at,a.id)")
                .push(comparator)
                .push("(cursor.created_at,cursor.id))))");
        }
        push_activity_order(&mut query, filter.sort);
        query.push(" LIMIT ").push_bind(limit);
        Ok(query.build_query_as().fetch_all(connection).await?)
    }

    /// Exact totals for the current workspace and filter set. Pagination never
    /// changes these values; all sums stay in integer/string form for safety.
    pub async fn gateway_activity_summary(
        &self,
        scope: TenantScope,
        filter: &GatewayActivityFilter,
    ) -> Result<GatewayActivitySummary, StoreError> {
        let mut snapshot = self.begin_activity_read().await?;
        let summary = Self::gateway_activity_summary_on(&mut snapshot, scope, filter).await?;
        crate::commit_tx(snapshot).await?;
        Ok(summary)
    }

    async fn gateway_activity_summary_on(
        snapshot: &mut sqlx::PgConnection,
        scope: TenantScope,
        filter: &GatewayActivityFilter,
    ) -> Result<GatewayActivitySummary, StoreError> {
        // Only customer ledger amounts enter these summaries. Missing settlement
        // is represented by null amounts and explicit coverage, never supplier
        // expense. One materialized scan feeds counts, breakdowns and the histogram
        // without joining the multi-table tariff UNION view repeatedly.
        let mut query = QueryBuilder::new(
            "WITH filtered AS MATERIALIZED ( \
                SELECT \
                    a.id AS attempt_id, \
                    a.organization_id, \
                    a.project_id, \
                    a.created_at, \
                    a.dispatched_at, \
                    a.execution, \
                    a.usage_confidence, \
                    a.prompt_tokens, \
                    a.completion_tokens, \
                    a.api_key_id, \
                    o.model_alias \
                FROM attempts a \
                JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id",
        );
        push_activity_scope_and_filters(&mut query, scope, filter);
        query.push(
            "), \
            enriched AS MATERIALIZED ( \
                SELECT \
                    f.attempt_id, \
                    f.created_at, \
                    f.dispatched_at, \
                    f.execution, \
                    f.usage_confidence, \
                    f.prompt_tokens, \
                    f.completion_tokens, \
                    f.api_key_id, \
                    f.model_alias, \
                    k.name AS key_name, \
                    t.complete AS timing_complete, \
                    t.total_ms AS timing_total_ms, \
                    t.http_status AS timing_http_status, \
                    c.attempt_id AS charge_attempt_id, \
                    c.currency AS charge_currency, \
                    c.amount_nanos AS charge_amount_nanos, \
                    uc.attempt_id AS unit_attempt_id, \
                    uc.definition_revision AS unit_definition_revision, \
                    uc.unit_name, \
                    uc.display_precision AS unit_display_precision, \
                    uc.charged_atoms AS unit_charged_atoms, \
                    uc.restored_atoms AS unit_restored_atoms, \
                    uc.net_atoms AS unit_net_atoms, \
                    details.cache_write_input_tokens, \
                    details.cached_input_tokens, \
                    details.reasoning_output_tokens, \
                    CASE \
                        WHEN f.dispatched_at IS NULL OR f.execution='confirmed_not_executed' THEN false \
                        ELSE ( \
                            EXISTS (SELECT 1 FROM customer_attempt_tariffs t1 WHERE t1.attempt_id=f.attempt_id) \
                            OR EXISTS (SELECT 1 FROM customer_media_attempt_pricing t2 WHERE t2.attempt_id=f.attempt_id) \
                            OR EXISTS (SELECT 1 FROM customer_unit_attempt_tariffs t3 WHERE t3.attempt_id=f.attempt_id) \
                            OR EXISTS (SELECT 1 FROM customer_unit_media_attempt_tariffs t4 WHERE t4.attempt_id=f.attempt_id) \
                        ) \
                    END AS has_tariff, \
                    CASE \
                        WHEN f.dispatched_at IS NULL OR f.execution='confirmed_not_executed' THEN false \
                        ELSE EXISTS (SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=f.attempt_id) \
                    END AS is_owner_funded, \
                    CASE \
                        WHEN f.dispatched_at IS NULL OR f.execution='confirmed_not_executed' THEN false \
                        WHEN c.attempt_id IS NOT NULL OR uc.attempt_id IS NOT NULL THEN false \
                        ELSE niu_attempt_failed_zero_cost(f.attempt_id) \
                    END AS is_failed_zero_cost \
                FROM filtered f \
                LEFT JOIN api_keys k ON k.organization_id=f.organization_id AND k.project_id=f.project_id AND k.id=f.api_key_id \
                LEFT JOIN request_timings t ON t.attempt_id=f.attempt_id \
                LEFT JOIN customer_activity_charges c ON c.organization_id=f.organization_id AND c.project_id=f.project_id AND c.attempt_id=f.attempt_id \
                LEFT JOIN customer_activity_unit_charges uc ON uc.organization_id=f.organization_id AND uc.project_id=f.project_id AND uc.attempt_id=f.attempt_id \
                LEFT JOIN request_token_categories details ON details.attempt_id=f.attempt_id \
            ), \
            counts_row AS ( \
                SELECT \
                    COUNT(*)::bigint AS request_count, \
                    COUNT(*) FILTER (WHERE e.usage_confidence='provider_reported')::bigint AS usage_count, \
                    COALESCE(SUM(e.prompt_tokens::numeric) FILTER (WHERE e.usage_confidence='provider_reported'), 0)::text AS prompt_tokens, \
                    COALESCE(SUM(e.completion_tokens::numeric) FILTER (WHERE e.usage_confidence='provider_reported'), 0)::text AS completion_tokens, \
                    COUNT(*) FILTER (WHERE e.timing_complete)::bigint AS timing_count, \
                    ROUND(AVG(e.timing_total_ms::numeric) FILTER (WHERE e.timing_complete))::bigint AS average_duration_ms, \
                    COUNT(*) FILTER (WHERE e.dispatched_at IS NOT NULL AND e.execution <> 'confirmed_not_executed' AND e.has_tariff AND e.charge_attempt_id IS NULL AND e.unit_attempt_id IS NULL AND NOT e.is_failed_zero_cost)::bigint AS unresolved_customer_charge_count, \
                    COUNT(*) FILTER (WHERE e.dispatched_at IS NOT NULL AND e.execution <> 'confirmed_not_executed' AND e.charge_attempt_id IS NULL AND e.unit_attempt_id IS NULL AND e.is_owner_funded)::bigint AS owner_funded_request_count, \
                    COUNT(*) FILTER (WHERE e.dispatched_at IS NOT NULL AND e.execution <> 'confirmed_not_executed' AND NOT e.has_tariff AND NOT e.is_owner_funded)::bigint AS unpriced_request_count, \
                    jsonb_build_object( \
                        'boundary','gateway_body_ms', \
                        'sample_count',COUNT(*) FILTER (WHERE e.timing_complete), \
                        'p50_ms',percentile_disc(0.50) WITHIN GROUP (ORDER BY e.timing_total_ms) FILTER (WHERE e.timing_complete), \
                        'p95_ms',percentile_disc(0.95) WITHIN GROUP (ORDER BY e.timing_total_ms) FILTER (WHERE e.timing_complete), \
                        'p99_ms',percentile_disc(0.99) WITHIN GROUP (ORDER BY e.timing_total_ms) FILTER (WHERE e.timing_complete) \
                    ) AS latency_percentiles, \
                    jsonb_build_object( \
                        'cache_write_input_tokens',SUM(e.cache_write_input_tokens::numeric)::text, \
                        'cache_write_input_requests',COUNT(e.cache_write_input_tokens), \
                        'cache_write_input_unknown_requests',COUNT(*)-COUNT(e.cache_write_input_tokens), \
                        'cached_input_tokens',SUM(e.cached_input_tokens::numeric)::text, \
                        'cached_input_requests',COUNT(e.cached_input_tokens), \
                        'cached_input_unknown_requests',COUNT(*)-COUNT(e.cached_input_tokens), \
                        'reasoning_output_tokens',SUM(e.reasoning_output_tokens::numeric)::text, \
                        'reasoning_output_requests',COUNT(e.reasoning_output_tokens), \
                        'reasoning_output_unknown_requests',COUNT(*)-COUNT(e.reasoning_output_tokens) \
                    ) AS token_categories \
                FROM enriched e \
            ), \
            customer_charges_agg AS ( \
                SELECT COALESCE(jsonb_agg(item ORDER BY currency), '[]'::jsonb) AS items \
                FROM ( \
                    SELECT e.charge_currency AS currency, \
                           jsonb_build_object( \
                               'currency', e.charge_currency, \
                               'amount_nanos', COALESCE(SUM(e.charge_amount_nanos::numeric), 0)::text, \
                               'charged_requests', COUNT(*)::bigint \
                           ) AS item \
                    FROM enriched e \
                    WHERE e.charge_attempt_id IS NOT NULL \
                    GROUP BY e.charge_currency \
                ) s \
            ), \
            customer_unit_charges_agg AS ( \
                SELECT COALESCE(jsonb_agg(item ORDER BY unit_definition_revision DESC), '[]'::jsonb) AS items \
                FROM ( \
                    SELECT e.unit_definition_revision, \
                           jsonb_build_object( \
                               'definition_revision', e.unit_definition_revision::text, \
                               'name', e.unit_name, \
                               'display_precision', e.unit_display_precision, \
                               'atoms_per_unit', '1000000000', \
                               'charged_atoms', COALESCE(SUM(e.unit_charged_atoms::numeric), 0)::text, \
                               'restored_atoms', COALESCE(SUM(e.unit_restored_atoms::numeric), 0)::text, \
                               'net_atoms', COALESCE(SUM(e.unit_net_atoms::numeric), 0)::text, \
                               'charged_requests', COUNT(*)::bigint \
                           ) AS item \
                    FROM enriched e \
                    WHERE e.unit_attempt_id IS NOT NULL \
                    GROUP BY e.unit_definition_revision, e.unit_name, e.unit_display_precision \
                ) s \
            ), \
            charges_by_model_agg AS ( \
                SELECT COALESCE(jsonb_agg(item ORDER BY ord_currency NULLS LAST, ord_amount DESC NULLS LAST, model_alias), '[]'::jsonb) AS items \
                FROM ( \
                    SELECT e.charge_currency AS ord_currency, \
                           SUM(e.charge_amount_nanos::numeric) AS ord_amount, \
                           e.model_alias, \
                           jsonb_build_object( \
                               'model_alias', e.model_alias, \
                               'currency', e.charge_currency, \
                               'amount_nanos', CASE WHEN COUNT(e.charge_attempt_id)>0 THEN SUM(e.charge_amount_nanos::numeric)::text ELSE NULL END, \
                               'request_count', COUNT(*), \
                               'charged_requests', COUNT(e.charge_attempt_id), \
                               'unit_charged_requests', COUNT(e.unit_attempt_id), \
                               'unresolved_requests', COUNT(*) FILTER (WHERE e.dispatched_at IS NOT NULL AND e.execution <> 'confirmed_not_executed' AND e.has_tariff AND e.charge_attempt_id IS NULL AND e.unit_attempt_id IS NULL AND NOT e.is_failed_zero_cost), \
                               'owner_funded_requests', COUNT(*) FILTER (WHERE e.dispatched_at IS NOT NULL AND e.execution <> 'confirmed_not_executed' AND e.charge_attempt_id IS NULL AND e.unit_attempt_id IS NULL AND e.is_owner_funded), \
                               'unpriced_requests', COUNT(*) FILTER (WHERE e.dispatched_at IS NOT NULL AND e.execution <> 'confirmed_not_executed' AND NOT e.has_tariff AND NOT e.is_owner_funded AND e.charge_attempt_id IS NULL AND e.unit_attempt_id IS NULL), \
                               'not_charged_requests', COUNT(*) FILTER (WHERE e.charge_attempt_id IS NULL AND e.unit_attempt_id IS NULL AND (e.dispatched_at IS NULL OR e.execution='confirmed_not_executed' OR e.is_failed_zero_cost)) \
                           ) AS item \
                    FROM enriched e \
                    GROUP BY e.model_alias, e.charge_currency \
                ) s \
            ), \
            charges_by_key_agg AS ( \
                SELECT COALESCE(jsonb_agg(item ORDER BY ord_currency NULLS LAST, ord_amount DESC NULLS LAST, api_key_id, key_name), '[]'::jsonb) AS items \
                FROM ( \
                    SELECT e.charge_currency AS ord_currency, \
                           SUM(e.charge_amount_nanos::numeric) AS ord_amount, \
                           e.api_key_id, \
                           e.key_name, \
                           jsonb_build_object( \
                               'api_key_id', e.api_key_id, \
                               'key_name', e.key_name, \
                               'currency', e.charge_currency, \
                               'amount_nanos', CASE WHEN COUNT(e.charge_attempt_id)>0 THEN SUM(e.charge_amount_nanos::numeric)::text ELSE NULL END, \
                               'request_count', COUNT(*), \
                               'charged_requests', COUNT(e.charge_attempt_id), \
                               'unit_charged_requests', COUNT(e.unit_attempt_id), \
                               'unresolved_requests', COUNT(*) FILTER (WHERE e.dispatched_at IS NOT NULL AND e.execution <> 'confirmed_not_executed' AND e.has_tariff AND e.charge_attempt_id IS NULL AND e.unit_attempt_id IS NULL AND NOT e.is_failed_zero_cost), \
                               'owner_funded_requests', COUNT(*) FILTER (WHERE e.dispatched_at IS NOT NULL AND e.execution <> 'confirmed_not_executed' AND e.charge_attempt_id IS NULL AND e.unit_attempt_id IS NULL AND e.is_owner_funded), \
                               'unpriced_requests', COUNT(*) FILTER (WHERE e.dispatched_at IS NOT NULL AND e.execution <> 'confirmed_not_executed' AND NOT e.has_tariff AND NOT e.is_owner_funded AND e.charge_attempt_id IS NULL AND e.unit_attempt_id IS NULL), \
                               'not_charged_requests', COUNT(*) FILTER (WHERE e.charge_attempt_id IS NULL AND e.unit_attempt_id IS NULL AND (e.dispatched_at IS NULL OR e.execution='confirmed_not_executed' OR e.is_failed_zero_cost)) \
                           ) AS item \
                    FROM enriched e \
                    GROUP BY e.api_key_id, e.key_name, e.charge_currency \
                ) s \
            ), \
            unit_charges_by_model_agg AS ( \
                SELECT COALESCE(jsonb_agg(item ORDER BY unit_definition_revision DESC, ord_net DESC, model_alias), '[]'::jsonb) AS items \
                FROM ( \
                    SELECT e.unit_definition_revision, \
                           SUM(e.unit_net_atoms::numeric) AS ord_net, \
                           e.model_alias, \
                           jsonb_build_object( \
                               'model_alias', e.model_alias, \
                               'definition_revision', e.unit_definition_revision::text, \
                               'name', e.unit_name, \
                               'display_precision', e.unit_display_precision, \
                               'atoms_per_unit', '1000000000', \
                               'charged_atoms', COALESCE(SUM(e.unit_charged_atoms::numeric), 0)::text, \
                               'restored_atoms', COALESCE(SUM(e.unit_restored_atoms::numeric), 0)::text, \
                               'net_atoms', COALESCE(SUM(e.unit_net_atoms::numeric), 0)::text, \
                               'charged_requests', COUNT(*)::bigint \
                           ) AS item \
                    FROM enriched e \
                    WHERE e.unit_attempt_id IS NOT NULL \
                    GROUP BY e.model_alias, e.unit_definition_revision, e.unit_name, e.unit_display_precision \
                ) s \
            ), \
            unit_charges_by_key_agg AS ( \
                SELECT COALESCE(jsonb_agg(item ORDER BY unit_definition_revision DESC, ord_net DESC, api_key_id, key_name), '[]'::jsonb) AS items \
                FROM ( \
                    SELECT e.unit_definition_revision, \
                           SUM(e.unit_net_atoms::numeric) AS ord_net, \
                           e.api_key_id, \
                           e.key_name, \
                           jsonb_build_object( \
                               'api_key_id', e.api_key_id, \
                               'key_name', e.key_name, \
                               'definition_revision', e.unit_definition_revision::text, \
                               'name', e.unit_name, \
                               'display_precision', e.unit_display_precision, \
                               'atoms_per_unit', '1000000000', \
                               'charged_atoms', COALESCE(SUM(e.unit_charged_atoms::numeric), 0)::text, \
                               'restored_atoms', COALESCE(SUM(e.unit_restored_atoms::numeric), 0)::text, \
                               'net_atoms', COALESCE(SUM(e.unit_net_atoms::numeric), 0)::text, \
                               'charged_requests', COUNT(*)::bigint \
                           ) AS item \
                    FROM enriched e \
                    WHERE e.unit_attempt_id IS NOT NULL \
                    GROUP BY e.api_key_id, e.key_name, e.unit_definition_revision, e.unit_name, e.unit_display_precision \
                ) s \
            ), \
            usage_by_model_agg AS ( \
                SELECT COALESCE(jsonb_agg(item ORDER BY ord_tokens DESC, model_alias), '[]'::jsonb) AS items \
                FROM ( \
                    SELECT COALESCE(SUM(e.prompt_tokens::numeric + e.completion_tokens::numeric) FILTER (WHERE e.usage_confidence='provider_reported'), 0) AS ord_tokens, \
                           e.model_alias, \
                           jsonb_build_object( \
                               'model_alias', e.model_alias, \
                               'request_count', COUNT(*)::bigint, \
                               'usage_count', COUNT(*) FILTER (WHERE e.usage_confidence='provider_reported')::bigint, \
                               'prompt_tokens', COALESCE(SUM(e.prompt_tokens::numeric) FILTER (WHERE e.usage_confidence='provider_reported'), 0)::text, \
                               'completion_tokens', COALESCE(SUM(e.completion_tokens::numeric) FILTER (WHERE e.usage_confidence='provider_reported'), 0)::text, \
                               'unknown_usage_count', COUNT(*) FILTER (WHERE e.usage_confidence <> 'provider_reported')::bigint \
                           ) AS item \
                    FROM enriched e \
                    GROUP BY e.model_alias \
                ) s \
            ), \
            usage_by_key_agg AS ( \
                SELECT COALESCE(jsonb_agg(item ORDER BY ord_tokens DESC, key_name NULLS LAST, api_key_id NULLS LAST), '[]'::jsonb) AS items \
                FROM ( \
                    SELECT COALESCE(SUM(e.prompt_tokens::numeric + e.completion_tokens::numeric) FILTER (WHERE e.usage_confidence='provider_reported'), 0) AS ord_tokens, \
                           e.api_key_id, \
                           e.key_name, \
                           jsonb_build_object( \
                               'api_key_id', e.api_key_id, \
                               'key_name', e.key_name, \
                               'request_count', COUNT(*)::bigint, \
                               'usage_count', COUNT(*) FILTER (WHERE e.usage_confidence='provider_reported')::bigint, \
                               'prompt_tokens', COALESCE(SUM(e.prompt_tokens::numeric) FILTER (WHERE e.usage_confidence='provider_reported'), 0)::text, \
                               'completion_tokens', COALESCE(SUM(e.completion_tokens::numeric) FILTER (WHERE e.usage_confidence='provider_reported'), 0)::text, \
                               'unknown_usage_count', COUNT(*) FILTER (WHERE e.usage_confidence <> 'provider_reported')::bigint \
                           ) AS item \
                    FROM enriched e \
                    GROUP BY e.api_key_id, e.key_name \
                    ORDER BY ord_tokens DESC, e.key_name NULLS LAST, e.api_key_id NULLS LAST \
                    LIMIT 10 \
                ) s \
            ), \
            histogram_ts AS ( \
                SELECT floor(extract(epoch FROM f.created_at)*1000)::numeric AS ts FROM filtered f \
            ), \
            histogram_bounds AS ( \
                SELECT COALESCE(",
        );
        query
            .push_bind(filter.from_ms)
            .push("::numeric, MIN(ts)) AS start, COALESCE(")
            .push_bind(filter.to_ms)
            .push(
                "::numeric, MAX(ts)+1) AS finish, COUNT(*) AS total FROM histogram_ts \
            ), \
            histogram_sized AS ( \
                SELECT start, finish, total, GREATEST(1, CEIL((finish-start)/24)) AS width FROM histogram_bounds \
            ), \
            histogram_grouped AS ( \
                SELECT LEAST(23, GREATEST(0, FLOOR((h.ts-s.start)/s.width))) AS bucket, COUNT(*) AS requests \
                FROM histogram_ts h CROSS JOIN histogram_sized s \
                GROUP BY bucket \
            ), \
            histogram_agg AS ( \
                SELECT COALESCE(jsonb_agg(item ORDER BY bucket), '[]'::jsonb) AS items \
                FROM ( \
                    SELECT b.bucket, \
                           jsonb_build_object( \
                               'start_ms', (s.start+b.bucket*s.width)::bigint, \
                               'end_ms', LEAST(s.finish, s.start+(b.bucket+1)*s.width)::bigint, \
                               'request_count', COALESCE(g.requests, 0) \
                           ) AS item \
                    FROM histogram_sized s \
                    CROSS JOIN generate_series(0, 23) b(bucket) \
                    LEFT JOIN histogram_grouped g ON g.bucket=b.bucket \
                    WHERE s.start IS NOT NULL AND s.total > 0 AND s.start+b.bucket*s.width < s.finish \
                ) s \
            ), \
            delivery_agg AS ( \
                SELECT COALESCE(jsonb_agg(item ORDER BY http_status NULLS LAST), '[]'::jsonb) AS items \
                FROM ( \
                    SELECT e.timing_http_status AS http_status, \
                           jsonb_build_object( \
                               'http_status', e.timing_http_status, \
                               'request_count', COUNT(*)::bigint \
                           ) AS item \
                    FROM enriched e \
                    GROUP BY e.timing_http_status \
                ) s \
            ) \
            SELECT \
                counts_row.*, \
                customer_charges_agg.items AS customer_charges, \
                customer_unit_charges_agg.items AS customer_unit_charges, \
                charges_by_model_agg.items AS charges_by_model, \
                charges_by_key_agg.items AS charges_by_key, \
                unit_charges_by_model_agg.items AS unit_charges_by_model, \
                unit_charges_by_key_agg.items AS unit_charges_by_key, \
                usage_by_model_agg.items AS usage_by_model, \
                usage_by_key_agg.items AS usage_by_key, \
                histogram_agg.items AS request_histogram, \
                delivery_agg.items AS delivery_statuses \
            FROM counts_row \
            CROSS JOIN customer_charges_agg \
            CROSS JOIN customer_unit_charges_agg \
            CROSS JOIN charges_by_model_agg \
            CROSS JOIN charges_by_key_agg \
            CROSS JOIN unit_charges_by_model_agg \
            CROSS JOIN unit_charges_by_key_agg \
            CROSS JOIN usage_by_model_agg \
            CROSS JOIN usage_by_key_agg \
            CROSS JOIN histogram_agg \
            CROSS JOIN delivery_agg",
            );
        let row: GatewayActivitySummaryRow =
            query.build_query_as().fetch_one(&mut *snapshot).await?;
        Ok(GatewayActivitySummary {
            request_count: row.request_count,
            usage_count: row.usage_count,
            prompt_tokens: row.prompt_tokens,
            completion_tokens: row.completion_tokens,
            timing_count: row.timing_count,
            average_duration_ms: row.average_duration_ms,
            unresolved_customer_charge_count: row.unresolved_customer_charge_count,
            unpriced_request_count: row.unpriced_request_count,
            owner_funded_request_count: row.owner_funded_request_count,
            customer_charges: row.customer_charges.0,
            customer_unit_charges: row.customer_unit_charges.0,
            charges_by_model: row.charges_by_model.0,
            charges_by_key: row.charges_by_key.0,
            unit_charges_by_model: row.unit_charges_by_model.0,
            unit_charges_by_key: row.unit_charges_by_key.0,
            usage_by_model: row.usage_by_model.0,
            usage_by_key: row.usage_by_key.0,
            request_histogram: row.request_histogram.0,
            latency_percentiles: row.latency_percentiles,
            delivery_statuses: row.delivery_statuses.0,
            token_categories: row.token_categories,
        })
    }

    /// Persist completion first so settlement failure never loses usage evidence.
    /// Unknown usage and attempts without a trusted price reservation stay open.
    pub async fn complete_and_settle(
        &self,
        scope: TenantScope,
        id: Uuid,
        usage: Option<(u64, u64)>,
    ) -> Result<(), StoreError> {
        self.complete_and_settle_with_provider_model(scope, id, usage, None)
            .await
    }

    pub async fn complete_and_settle_with_provider_model(
        &self,
        scope: TenantScope,
        id: Uuid,
        usage: Option<(u64, u64)>,
        provider_model: Option<&str>,
    ) -> Result<(), StoreError> {
        self.complete_with_provider_model(scope, id, usage, provider_model)
            .await?;
        let accrual = self.accrue_gateway_ledgers(&[id]).await;
        let cost = async {
            if usage.is_some() {
                let reserved: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM cost_reservations WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3 AND state='held')")
                    .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_one(&self.pool).await?;
                if reserved {
                    self.settle_cost(scope, id).await?;
                }
            }
            Ok(())
        }.await;
        accrual.and(cost)
    }

    /// Persist a bounded set of provider completions first, then settle all
    /// held reservations in one workspace transaction. Keeping these phases
    /// separate means a settlement failure never discards usage evidence.
    pub async fn complete_and_settle_gateway_batch(
        &self,
        scope: TenantScope,
        completions: Vec<GatewayCompletion>,
    ) -> Result<(), StoreError> {
        const MAX_BATCH_SIZE: usize = 64;
        if completions.is_empty() || completions.len() > MAX_BATCH_SIZE {
            return Err(StoreError::InvalidGatewayAdmissionBatch);
        }
        let mut settlement_ids = Vec::with_capacity(completions.len());
        for completion in &completions {
            if completion.scope.organization_id != scope.organization_id
                || completion.scope.project_id != scope.project_id
            {
                return Err(StoreError::InvalidGatewayAdmissionBatch);
            }
            if completion.usage.is_some() {
                settlement_ids.push(completion.attempt_id);
            }
        }

        self.complete_gateway_batch(completions.clone()).await?;
        let ids: Vec<Uuid> = completions.iter().map(|c| c.attempt_id).collect();
        let accrual = self.accrue_gateway_ledgers(&ids).await;
        let cost = if settlement_ids.is_empty() {
            Ok(())
        } else {
            self.settle_gateway_batch(scope, &settlement_ids).await
        };
        accrual.and(cost)
    }

    /// Persist completion evidence and its independent customer and Provider
    /// ledger entries. This also applies when no Niu-side budget is configured.
    pub async fn complete_and_accrue_gateway_batch(
        &self,
        completions: Vec<GatewayCompletion>,
    ) -> Result<(), StoreError> {
        const MAX_BATCH_SIZE: usize = 64;
        if completions.is_empty() || completions.len() > MAX_BATCH_SIZE {
            return Err(StoreError::InvalidGatewayAdmissionBatch);
        }
        self.complete_gateway_batch(completions.clone()).await?;
        let ids: Vec<Uuid> = completions.iter().map(|c| c.attempt_id).collect();
        self.accrue_gateway_ledgers(&ids).await
    }

    /// Each ledger owns its evidence and idempotency rules. A missing Provider
    /// quantity must not suppress an independently resolvable customer charge,
    /// nor prevent another completed attempt in the batch from being accrued.
    /// Preserve the first error so callers still schedule recovery.
    async fn accrue_gateway_ledgers(&self, attempts: &[Uuid]) -> Result<(), StoreError> {
        if attempts.is_empty() {
            return Ok(());
        }
        let bindings: Vec<(Uuid, bool, bool)> = sqlx::query_as(
            "SELECT u.id, \
                    EXISTS(SELECT 1 FROM provider_attempt_offers p WHERE p.attempt_id = u.id) \
                        OR EXISTS(SELECT 1 FROM supplier_media_attempt_pricing m WHERE m.attempt_id = u.id) AS has_provider, \
                    EXISTS(SELECT 1 FROM customer_attempt_tariffs t WHERE t.attempt_id = u.id) \
                        OR EXISTS(SELECT 1 FROM customer_attempt_balance_accounts b WHERE b.attempt_id = u.id) \
                        OR EXISTS(SELECT 1 FROM customer_unit_attempt_tariffs b WHERE b.attempt_id = u.id) AS has_customer \
             FROM unnest($1::uuid[]) WITH ORDINALITY AS u(id, ord) \
             ORDER BY u.ord",
        )
        .bind(attempts)
        .fetch_all(&self.pool)
        .await?;

        let mut first_error = None;
        for (attempt, has_provider, has_customer) in bindings {
            let outcome = match (has_provider, has_customer) {
                (false, false) => Ok(()),
                (true, false) => self.accrue_provider_earning(attempt).await,
                (false, true) => self.accrue_customer_charge(attempt).await,
                (true, true) => {
                    let (supplier, customer) = tokio::join!(
                        self.accrue_provider_earning(attempt),
                        self.accrue_customer_charge(attempt),
                    );
                    supplier.and(customer)
                }
            };
            if let Err(error) = outcome {
                first_error.get_or_insert(error);
            }
        }
        first_error.map_or(Ok(()), Err)
    }

    async fn settle_gateway_batch(
        &self,
        scope: TenantScope,
        attempt_ids: &[Uuid],
    ) -> Result<(), StoreError> {
        const MAX_BATCH_SIZE: usize = 64;
        if attempt_ids.is_empty() || attempt_ids.len() > MAX_BATCH_SIZE {
            return Err(StoreError::InvalidGatewayAdmissionBatch);
        }

        let mut tx = self.begin_bounded_recording().await?;
        let locked_attempts: Vec<Uuid> = sqlx::query_scalar("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=ANY($3) AND execution='confirmed_completed' AND usage_confidence='provider_reported' ORDER BY id FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt_ids)
            .fetch_all(&mut *tx).await?;
        if locked_attempts.len() != attempt_ids.len() {
            return Err(StoreError::Conflict);
        }

        let candidates: Vec<GatewaySettlementCandidate> = sqlx::query_as("SELECT a.id AS attempt_id, r.price_revision_id, r.reserved_nanos, r.prompt_bound, r.completion_bound, p.currency, p.api_prompt_rate, p.api_completion_rate, p.cash_prompt_rate, p.cash_completion_rate, a.prompt_tokens, a.completion_tokens FROM attempts a JOIN cost_reservations r ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.attempt_id=a.id AND r.state='held' JOIN price_revisions p ON p.organization_id=r.organization_id AND p.project_id=r.project_id AND p.id=r.price_revision_id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=ANY($3) AND a.execution='confirmed_completed' AND a.usage_confidence='provider_reported' ORDER BY a.id FOR UPDATE OF r")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt_ids)
            .fetch_all(&mut *tx).await?;
        if candidates.is_empty() {
            crate::commit_tx(tx).await?;
            return Ok(());
        }

        let currency = candidates[0].currency.clone();
        let mut reserved_total = 0_i64;
        let mut cash_total = 0_i64;
        let mut entries = Vec::with_capacity(candidates.len());
        for candidate in candidates {
            if candidate.currency != currency {
                return Err(StoreError::Conflict);
            }
            let api = TokenRates {
                prompt: candidate.api_prompt_rate,
                completion: candidate.api_completion_rate,
            }
            .charge(candidate.prompt_tokens, candidate.completion_tokens)?;
            let cash = TokenRates {
                prompt: candidate.cash_prompt_rate,
                completion: candidate.cash_completion_rate,
            }
            .charge(candidate.prompt_tokens, candidate.completion_tokens)?;
            reserved_total = reserved_total
                .checked_add(candidate.reserved_nanos)
                .ok_or(StoreError::AggregateOverflow)?;
            cash_total = cash_total
                .checked_add(cash)
                .ok_or(StoreError::AggregateOverflow)?;
            entries.push(GatewaySettlementEntry {
                attempt_id: candidate.attempt_id,
                price_revision_id: candidate.price_revision_id,
                currency: candidate.currency,
                api_equivalent_nanos: api,
                cash_nanos: cash,
                prompt_tokens: candidate.prompt_tokens,
                completion_tokens: candidate.completion_tokens,
                bound_exceeded: candidate.prompt_tokens > candidate.prompt_bound
                    || candidate.completion_tokens > candidate.completion_bound,
            });
        }

        let budget_updated = sqlx::query("UPDATE project_budgets SET reserved_nanos=reserved_nanos-$3, spent_nanos=spent_nanos+$4 WHERE organization_id=$1 AND project_id=$2 AND currency=$5")
            .bind(scope.organization_id).bind(scope.project_id).bind(reserved_total).bind(cash_total).bind(&currency)
            .execute(&mut *tx).await?.rows_affected();
        if budget_updated != 1 {
            return Err(StoreError::Conflict);
        }

        let settled_ids = entries
            .iter()
            .map(|entry| entry.attempt_id)
            .collect::<Vec<_>>();
        let mut insert = QueryBuilder::<Postgres>::new(
            "INSERT INTO cost_entries (attempt_id, organization_id, project_id, price_revision_id, currency, api_equivalent_nanos, cash_nanos, usage_prompt_tokens, usage_completion_tokens, bound_exceeded) ",
        );
        insert.push_values(&entries, |mut row, entry| {
            row.push_bind(entry.attempt_id)
                .push_bind(scope.organization_id)
                .push_bind(scope.project_id)
                .push_bind(entry.price_revision_id)
                .push_bind(&entry.currency)
                .push_bind(entry.api_equivalent_nanos)
                .push_bind(entry.cash_nanos)
                .push_bind(entry.prompt_tokens)
                .push_bind(entry.completion_tokens)
                .push_bind(entry.bound_exceeded);
        });
        insert.build().execute(&mut *tx).await?;

        let reservations_updated = sqlx::query("UPDATE cost_reservations SET state='settled' WHERE organization_id=$1 AND project_id=$2 AND attempt_id=ANY($3) AND state='held'")
            .bind(scope.organization_id).bind(scope.project_id).bind(&settled_ids)
            .execute(&mut *tx).await?.rows_affected();
        let attempts_updated = sqlx::query("UPDATE attempts SET settlement='settled' WHERE organization_id=$1 AND project_id=$2 AND id=ANY($3) AND execution='confirmed_completed' AND usage_confidence='provider_reported'")
            .bind(scope.organization_id).bind(scope.project_id).bind(&settled_ids)
            .execute(&mut *tx).await?.rows_affected();
        if reservations_updated != settled_ids.len() as u64
            || attempts_updated != settled_ids.len() as u64
        {
            return Err(StoreError::Conflict);
        }
        crate::commit_tx(tx).await?;
        Ok(())
    }

    /// Installation worker only. Advance a UUID cursor even past failed rows so
    /// a malformed record cannot starve other projects. Restart after each sweep.
    pub async fn recover_settlements(
        &self,
        after: Option<Uuid>,
    ) -> Result<(Option<Uuid>, usize), StoreError> {
        Ok(self
            .recover_financial_stage(
                crate::financial_recovery::FinancialStage::UpstreamCost,
                Some(after),
            )
            .await?
            .unwrap_or((after, 0)))
    }

    /// Bounded immutable ledger traversal in ascending attempt UUID order.
    /// This is a live view, not a snapshot across multiple requests.
    pub async fn cost_entries(
        &self,
        scope: TenantScope,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<CostEntry>, StoreError> {
        if !(1..=101).contains(&limit) {
            return Err(StoreError::InvalidPrice);
        }
        Ok(sqlx::query_as("SELECT attempt_id, price_revision_id, currency, api_equivalent_nanos, cash_nanos, usage_prompt_tokens, usage_completion_tokens, bound_exceeded FROM cost_entries WHERE organization_id=$1 AND project_id=$2 AND ($3::uuid IS NULL OR attempt_id > $3) ORDER BY attempt_id LIMIT $4")
            .bind(scope.organization_id).bind(scope.project_id).bind(after).bind(limit)
            .fetch_all(&self.pool).await?)
    }

    pub async fn publish_price(
        &self,
        scope: TenantScope,
        input: PriceInput<'_>,
    ) -> Result<Uuid, StoreError> {
        if !currency_valid(input.currency)
            || input.resource_id.is_empty()
            || input.offer_revision.is_empty()
        {
            return Err(StoreError::InvalidPrice);
        }
        input.api_equivalent.charge(0, 0)?;
        input.cash.charge(0, 0)?;
        let mut tx = self.begin_tx().await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR UPDATE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let existing: Option<Uuid> = sqlx::query_scalar("SELECT id FROM price_revisions WHERE organization_id=$1 AND project_id=$2 AND resource_id=$3 AND offer_revision=$4 AND currency=$5 AND api_prompt_rate=$6 AND api_completion_rate=$7 AND cash_prompt_rate=$8 AND cash_completion_rate=$9 LIMIT 1")
            .bind(scope.organization_id).bind(scope.project_id).bind(input.resource_id).bind(input.offer_revision).bind(input.currency)
            .bind(input.api_equivalent.prompt).bind(input.api_equivalent.completion).bind(input.cash.prompt).bind(input.cash.completion)
            .fetch_optional(&mut *tx).await?;
        if let Some(id) = existing {
            crate::commit_tx(tx).await?;
            return Ok(id);
        }
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO price_revisions (id, organization_id, project_id, resource_id, offer_revision, currency, api_prompt_rate, api_completion_rate, cash_prompt_rate, cash_completion_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(input.resource_id).bind(input.offer_revision).bind(input.currency)
            .bind(input.api_equivalent.prompt).bind(input.api_equivalent.completion).bind(input.cash.prompt).bind(input.cash.completion).execute(&mut *tx).await?;
        crate::commit_tx(tx).await?;
        Ok(id)
    }

    /// Enables a lifetime cash budget. Serializes with admission via the project
    /// row. Previously admitted work is not retroactively reserved.
    pub async fn create_budget(
        &self,
        scope: TenantScope,
        currency: &str,
        limit_nanos: i64,
    ) -> Result<(), StoreError> {
        self.create_budget_recorded(scope, currency, limit_nanos, None)
            .await
    }

    pub async fn create_budget_with_actor(
        &self,
        scope: TenantScope,
        currency: &str,
        limit_nanos: i64,
        actor: crate::OperatorAuditActor,
    ) -> Result<(), StoreError> {
        self.create_budget_recorded(scope, currency, limit_nanos, Some(actor))
            .await
    }

    async fn create_budget_recorded(
        &self,
        scope: TenantScope,
        currency: &str,
        limit_nanos: i64,
        actor: Option<crate::OperatorAuditActor>,
    ) -> Result<(), StoreError> {
        if !currency_valid(currency) || limit_nanos < 0 {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.begin_tx().await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id = $1 AND id = $2 FOR UPDATE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let inserted = sqlx::query("INSERT INTO project_budgets (organization_id, project_id, currency, limit_nanos) VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id, project_id) DO NOTHING")
            .bind(scope.organization_id).bind(scope.project_id).bind(currency).bind(limit_nanos).execute(&mut *tx).await?.rows_affected();
        if inserted != 1 {
            return Err(StoreError::Conflict);
        }
        Self::record_procurement_configuration_in_tx(&mut tx, scope, None, actor).await?;
        crate::commit_tx(tx).await?;
        Ok(())
    }

    /// Bounds must come from trusted admission policy, including all possible
    /// billable tokens. This API cannot prove an adapter's provider-side bounds.
    pub async fn reserve_cost(
        &self,
        scope: TenantScope,
        attempt_id: Uuid,
        price_id: Uuid,
        prompt_bound: i64,
        completion_bound: i64,
    ) -> Result<(), StoreError> {
        if prompt_bound < 0 || completion_bound < 0 {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.begin_tx().await?;
        let attempt = sqlx::query("SELECT execution, resource_id, offer_revision FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt_id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if let Some(existing) = sqlx::query("SELECT price_revision_id, prompt_bound, completion_bound, state FROM cost_reservations WHERE attempt_id=$1")
            .bind(attempt_id).fetch_optional(&mut *tx).await? {
            if existing.get::<Uuid,_>("price_revision_id") == price_id && existing.get::<i64,_>("prompt_bound") == prompt_bound
                && existing.get::<i64,_>("completion_bound") == completion_bound && existing.get::<String,_>("state") == "held" {
                crate::commit_tx(tx).await?;
                return Ok(());
            }
            return Err(StoreError::Conflict);
        }
        if attempt.get::<String, _>("execution") != "not_sent" {
            return Err(StoreError::Conflict);
        }
        let price = sqlx::query("SELECT currency, cash_prompt_rate, cash_completion_rate FROM price_revisions WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND resource_id=$4 AND offer_revision=$5")
            .bind(scope.organization_id).bind(scope.project_id).bind(price_id).bind(attempt.get::<String,_>("resource_id")).bind(attempt.get::<String,_>("offer_revision"))
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let amount = TokenRates {
            prompt: price.get("cash_prompt_rate"),
            completion: price.get("cash_completion_rate"),
        }
        .charge(prompt_bound, completion_bound)?;
        let changed = sqlx::query("UPDATE project_budgets SET reserved_nanos = reserved_nanos + $4 WHERE organization_id=$1 AND project_id=$2 AND currency=$3 AND limit_nanos::numeric - spent_nanos::numeric - reserved_nanos::numeric >= $4")
            .bind(scope.organization_id).bind(scope.project_id).bind(price.get::<String,_>("currency")).bind(amount).execute(&mut *tx).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::ProcurementUnavailable);
        }
        sqlx::query("INSERT INTO cost_reservations (attempt_id, organization_id, project_id, price_revision_id, reserved_nanos, prompt_bound, completion_bound) VALUES ($1,$2,$3,$4,$5,$6,$7)")
            .bind(attempt_id).bind(scope.organization_id).bind(scope.project_id).bind(price_id).bind(amount).bind(prompt_bound).bind(completion_bound).execute(&mut *tx).await?;
        crate::commit_tx(tx).await?;
        Ok(())
    }

    /// Reserve the configured worst-case cost and commit dispatch intent in
    /// one transaction. A provider call can begin only after both transitions
    /// are durable, while avoiding a separate transaction for each one.
    pub async fn reserve_and_dispatch_gateway(
        &self,
        principal: &Principal,
        attempt_id: Uuid,
        reservation: &GatewayReservation,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        let dispatched = match Self::reserve_and_dispatch_gateway_in_tx(
            &mut tx,
            principal,
            attempt_id,
            reservation,
        )
        .await
        {
            Ok(dispatched) => dispatched,
            Err(
                err @ (StoreError::KeyRequestRateDisabled | StoreError::KeyRequestRateExceeded),
            ) => {
                let _ = crate::commit_tx(tx).await;
                return Err(err);
            }
            Err(err) => return Err(err),
        };
        crate::commit_tx(tx).await?;
        if dispatched {
            Ok(())
        } else {
            // The denial and any unsent hold release have committed.
            Err(StoreError::GuardrailAdmissionConflict)
        }
    }

    pub(crate) async fn reserve_and_dispatch_gateway_in_tx(
        tx: &mut sqlx::Transaction<'_, Postgres>,
        principal: &Principal,
        attempt_id: Uuid,
        reservation: &GatewayReservation,
    ) -> Result<bool, StoreError> {
        let scope = principal.scope();
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR SHARE")
            .bind(scope.organization_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query(
            "SELECT pg_advisory_xact_lock(hashtextextended('niu-guardrails:' || $1::text || ':' || $2::text, 0))",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .execute(&mut **tx)
        .await?;
        // Attribute the attempt to the calling key (when valid in this scope)
        // before reserving customer balance so key spending limits are enforced
        // even without guardrail or retry-policy bindings.
        sqlx::query(
            "UPDATE attempts a SET api_key_id = k.id \
             FROM api_keys k \
             WHERE a.organization_id = $1 AND a.project_id = $2 AND a.id = $3 \
               AND a.execution = 'not_sent' AND a.api_key_id IS NULL \
               AND k.organization_id = $1 AND k.project_id = $2 AND k.id = $4",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(attempt_id)
        .bind(principal.key_id())
        .execute(&mut **tx)
        .await?;
        // Account-enabled organizations use customer retail rates, independently
        // of the procurement budget. Hold and dispatch commit atomically.
        let prepaid: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM customer_balance_accounts WHERE organization_id=$1)",
        )
        .bind(scope.organization_id)
        .fetch_one(&mut **tx)
        .await?;
        let unit =
            Self::reserve_customer_unit_text_in_tx(tx, scope, attempt_id, reservation).await?;
        if prepaid && !unit {
            let rates: Option<(i64, i64, i64, i64, serde_json::Value)> = sqlx::query_as("SELECT GREATEST(r.prompt_rate,COALESCE(r.cached_prompt_rate,r.prompt_rate),COALESCE(r.cache_write_prompt_rate,r.prompt_rate)),GREATEST(r.completion_rate,COALESCE(r.reasoning_completion_rate,r.completion_rate)),r.minimum_charge_nanos,r.request_fee_nanos,r.context_tiers FROM customer_attempt_tariffs b JOIN customer_tariff_revisions r ON r.id=b.revision_id JOIN customer_attempt_balance_accounts a ON a.attempt_id=b.attempt_id AND a.currency=r.currency WHERE b.attempt_id=$1 AND a.organization_id=$2 AND a.project_id=$3")
                .bind(attempt_id).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut **tx).await?;
            let (prompt, completion, minimum, request_fee, tiers_json) =
                rates.ok_or(StoreError::InvalidPrice)?;
            let tiers: Vec<crate::ContextPriceTier> =
                serde_json::from_value(tiers_json).map_err(|_| StoreError::InvalidPrice)?;
            let maximum = crate::pricing::customer_charge_with_fixed(
                crate::context_token_reservation(
                    TokenRates { prompt, completion }
                        .charge(reservation.prompt_bound, reservation.completion_bound)?,
                    &tiers,
                    reservation.prompt_bound,
                    reservation.completion_bound,
                )?,
                request_fee,
                minimum,
            )?;
            crate::billing::reserve_customer_balance_in_tx(tx, scope, attempt_id, maximum).await?;
        }
        let outcome: i64 = sqlx::query_scalar(
            "SELECT niu_reserve_and_dispatch_gateway_audited($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(principal.key_id())
        .bind(attempt_id)
        .bind(reservation.price_revision_id)
        .bind(&reservation.resource_id)
        .bind(&reservation.offer_revision)
        .bind(reservation.prompt_bound)
        .bind(reservation.completion_bound)
        .fetch_one(&mut **tx)
        .await
        .map_err(map_gateway_admission_error)?;
        if outcome != 1 {
            // The denial and the release of its unsent hold commit together.
            sqlx::query(
                "UPDATE attempts SET api_key_id = NULL \
                 WHERE organization_id = $1 AND project_id = $2 AND id = $3 AND execution = 'not_sent'",
            )
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(attempt_id)
            .execute(&mut **tx)
            .await?;
            Self::release_customer_unit_nonexecuted_in_tx(tx, scope, attempt_id).await?;
            sqlx::query("UPDATE customer_balance_reservations SET released_at=now() WHERE attempt_id=$1 AND released_at IS NULL")
                .bind(attempt_id).execute(&mut **tx).await?;
        }
        match outcome {
            1 => Ok(true),
            -1 => Ok(false),
            -2 => Err(StoreError::KeyRequestRateDisabled),
            -3 => Err(StoreError::KeyRequestRateExceeded),
            _ => Err(StoreError::Conflict),
        }
    }

    pub async fn budget(&self, scope: TenantScope) -> Result<Option<BudgetSnapshot>, StoreError> {
        Ok(sqlx::query_as("SELECT currency, limit_nanos, reserved_nanos, spent_nanos FROM project_budgets WHERE organization_id=$1 AND project_id=$2")
            .bind(scope.organization_id).bind(scope.project_id).fetch_optional(&self.pool).await?)
    }

    /// Settle from stored provider usage, never caller-supplied money. The same
    /// attempt always returns its original entry. Unknown usage retains its hold.
    pub async fn settle_cost(&self, scope: TenantScope, id: Uuid) -> Result<CostEntry, StoreError> {
        let mut tx = self.begin_tx().await?;
        let result = Self::settle_cost_in_tx(&mut tx, scope, id).await?;
        crate::commit_tx(tx).await?;
        Ok(result)
    }

    pub(crate) async fn settle_cost_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<CostEntry, StoreError> {
        let attempt = sqlx::query("SELECT execution, usage_confidence, prompt_tokens, completion_tokens FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        if let Some(entry) = sqlx::query_as::<_,CostEntry>("SELECT attempt_id, price_revision_id, currency, api_equivalent_nanos, cash_nanos, usage_prompt_tokens, usage_completion_tokens, bound_exceeded FROM cost_entries WHERE attempt_id=$1")
            .bind(id).fetch_optional(&mut **tx).await? {
            return Ok(entry);
        }
        if attempt.get::<String, _>("execution") != "confirmed_completed"
            || attempt.get::<String, _>("usage_confidence") != "provider_reported"
        {
            return Err(StoreError::Unresolved);
        }
        let reservation = sqlx::query("SELECT r.price_revision_id, r.reserved_nanos, r.prompt_bound, r.completion_bound, p.currency, p.api_prompt_rate, p.api_completion_rate, p.cash_prompt_rate, p.cash_completion_rate FROM cost_reservations r JOIN price_revisions p ON p.id=r.price_revision_id WHERE r.attempt_id=$1 AND r.state='held'")
            .bind(id).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        let prompt: i64 = attempt.get("prompt_tokens");
        let completion: i64 = attempt.get("completion_tokens");
        let api = TokenRates {
            prompt: reservation.get("api_prompt_rate"),
            completion: reservation.get("api_completion_rate"),
        }
        .charge(prompt, completion)?;
        let cash = TokenRates {
            prompt: reservation.get("cash_prompt_rate"),
            completion: reservation.get("cash_completion_rate"),
        }
        .charge(prompt, completion)?;
        let exceeded = prompt > reservation.get::<i64, _>("prompt_bound")
            || completion > reservation.get::<i64, _>("completion_bound");
        let currency: String = reservation.get("currency");
        // Record real liability even if a provider exceeds the bound. Future
        // admission stops when spent+reserved exhausts the configured limit.
        let updated = sqlx::query("UPDATE project_budgets SET reserved_nanos=reserved_nanos-$3, spent_nanos=spent_nanos+$4 WHERE organization_id=$1 AND project_id=$2 AND currency=$5")
            .bind(scope.organization_id).bind(scope.project_id).bind(reservation.get::<i64,_>("reserved_nanos")).bind(cash).bind(&currency).execute(&mut **tx).await?;
        if updated.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        let entry = sqlx::query_as::<_,CostEntry>("INSERT INTO cost_entries (attempt_id, organization_id, project_id, price_revision_id, currency, api_equivalent_nanos, cash_nanos, usage_prompt_tokens, usage_completion_tokens, bound_exceeded) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING attempt_id, price_revision_id, currency, api_equivalent_nanos, cash_nanos, usage_prompt_tokens, usage_completion_tokens, bound_exceeded")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(reservation.get::<Uuid,_>("price_revision_id"))
            .bind(&currency).bind(api).bind(cash).bind(prompt).bind(completion).bind(exceeded).fetch_one(&mut **tx).await?;
        sqlx::query("UPDATE cost_reservations SET state='settled' WHERE attempt_id=$1")
            .bind(id)
            .execute(&mut **tx)
            .await?;
        sqlx::query("UPDATE attempts SET settlement='settled' WHERE id=$1")
            .bind(id)
            .execute(&mut **tx)
            .await?;
        Ok(entry)
    }

    /// Compatibility entry point: uncertain requests still cannot release a hold.
    pub async fn release_unsent_cost(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<(), StoreError> {
        self.release_nonexecuted_cost(scope, id).await
    }

    /// Release only persisted nonexecution, never timeout or elapsed wall time.
    pub async fn release_nonexecuted_cost(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_tx().await?;
        Self::release_nonexecuted_cost_in_tx(&mut tx, scope, id).await?;
        crate::commit_tx(tx).await?;
        Ok(())
    }

    pub(crate) async fn release_nonexecuted_cost_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<(), StoreError> {
        let row = sqlx::query("SELECT execution FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        if !matches!(
            row.get::<String, _>("execution").as_str(),
            "not_sent" | "confirmed_not_executed"
        ) {
            return Err(StoreError::Unresolved);
        }
        let reservation = sqlx::query(
            "SELECT r.state, r.reserved_nanos, p.currency \
             FROM cost_reservations r \
             JOIN price_revisions p ON p.id=r.price_revision_id \
             WHERE r.attempt_id=$1",
        )
        .bind(id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        let state: String = reservation.get("state");
        if state == "released" {
            return Ok(());
        }
        if state != "held" {
            return Err(StoreError::Conflict);
        }
        let updated = sqlx::query("UPDATE project_budgets SET reserved_nanos=reserved_nanos-$3 WHERE organization_id=$1 AND project_id=$2 AND currency=$4")
            .bind(scope.organization_id).bind(scope.project_id).bind(reservation.get::<i64,_>("reserved_nanos")).bind(reservation.get::<&str,_>("currency")).execute(&mut **tx).await?;
        if updated.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query("UPDATE cost_reservations SET state='released' WHERE attempt_id=$1")
            .bind(id)
            .execute(&mut **tx)
            .await?;
        Ok(())
    }
}
