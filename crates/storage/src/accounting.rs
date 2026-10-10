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
    pub reasoning_output_tokens: Option<String>,
    pub finish_reasons: Option<sqlx::types::Json<Vec<crate::RequestChoiceFinish>>>,
    pub failure: Option<sqlx::types::Json<crate::RequestFailure>>,
    pub customer_charge_currency: Option<String>,
    pub customer_charge_nanos: Option<String>,
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
/// payloads, Supplier prices or procurement accounting.
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
    pub total_ms: Option<i64>,
    pub timing_complete: Option<bool>,
    pub cached_input_tokens: Option<String>,
    pub reasoning_output_tokens: Option<String>,
    pub finish_reasons: Option<sqlx::types::Json<Vec<crate::RequestChoiceFinish>>>,
    pub failure: Option<sqlx::types::Json<crate::RequestFailure>>,
}

/// Fixed price revision and worst-case token bounds for a priced gateway dispatch.
pub struct GatewayReservation {
    pub price_revision_id: Uuid,
    pub resource_id: String,
    pub offer_revision: String,
    pub prompt_bound: i64,
    pub completion_bound: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct GatewayActivitySummaryCounts {
    request_count: i64,
    usage_count: i64,
    prompt_tokens: String,
    completion_tokens: String,
    timing_count: i64,
    average_duration_ms: Option<i64>,
    unresolved_customer_charge_count: i64,
    unpriced_request_count: i64,
    owner_funded_request_count: i64,
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

#[derive(Debug, sqlx::FromRow, serde::Serialize)]
pub struct GatewayActivityCostSummary {
    pub currency: String,
    pub amount_nanos: String,
    pub charged_requests: i64,
}

#[derive(Debug, sqlx::FromRow, serde::Serialize)]
pub struct GatewayActivityModelSummary {
    pub model_alias: String,
    pub request_count: i64,
    pub usage_count: i64,
    pub prompt_tokens: String,
    pub completion_tokens: String,
    pub unknown_usage_count: i64,
}

#[derive(Debug, sqlx::FromRow, serde::Serialize)]
pub struct GatewayActivityKeySummary {
    pub api_key_id: Option<Uuid>,
    pub key_name: Option<String>,
    pub request_count: i64,
    pub usage_count: i64,
    pub prompt_tokens: String,
    pub completion_tokens: String,
    pub unknown_usage_count: i64,
}

#[derive(Debug, sqlx::FromRow, serde::Serialize)]
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
    pub charges_by_model: Vec<serde_json::Value>,
    pub charges_by_key: Vec<serde_json::Value>,
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
        query.push(" AND a.api_key_id = ").push_bind(api_key_id);
    }
    if let Some(execution) = filter.execution.as_deref() {
        if execution == "output_withheld" {
            query.push(" AND EXISTS (SELECT 1 FROM output_guardrail_decisions decision WHERE decision.organization_id=a.organization_id AND decision.project_id=a.project_id AND decision.attempt_id=a.id AND decision.outcome IN ('blocked','indeterminate'))");
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
    let code = error
        .as_database_error()
        .and_then(|database_error| database_error.code())
        .map(|code| code.into_owned());
    match code.as_deref() {
        Some("P0024") => StoreError::ManagedRouteChanged,
        Some("P0020") => StoreError::KeyRequestRateExceeded,
        Some("P0021") => StoreError::KeyConcurrencyExceeded,
        Some("P0022") => StoreError::KeyTokenRateExceeded,
        Some("P0023") => StoreError::KeyTokenBoundRequired,
        Some("P0005") => StoreError::Unauthorized,
        Some("P0006" | "P0010" | "P0011") => StoreError::Conflict,
        Some("P0007") => StoreError::AccountUnavailable,
        Some("P0008") => StoreError::BudgetExceeded,
        Some("P0009") => StoreError::InvalidPrice,
        _ => StoreError::Database(error),
    }
}

impl Store {
    /// One statement provides a consistent view of the filtered range. Fetch
    /// one extra row so the caller can reject, rather than silently truncate,
    /// an export exceeding the declared 10,000-row bound.
    pub async fn gateway_activity_export(
        &self,
        scope: TenantScope,
        filter: &GatewayActivityFilter,
    ) -> Result<Vec<GatewayActivityExportEntry>, StoreError> {
        let mut query = QueryBuilder::new(
            "SELECT to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at, \
             o.model_alias AS model, k.name AS key_name, t.http_status, a.execution, a.usage_confidence, \
             a.prompt_tokens::text AS prompt_tokens, a.completion_tokens::text AS completion_tokens, \
             CASE WHEN c.attempt_id IS NOT NULL THEN 'charged' \
               WHEN a.dispatched_at IS NULL OR a.execution='confirmed_not_executed' THEN 'not_charged' \
               WHEN EXISTS (SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=a.id) THEN 'owner_funded' \
               WHEN EXISTS (SELECT 1 FROM customer_activity_priced_attempts tariff WHERE tariff.attempt_id=a.id) THEN 'pending' \
               ELSE 'unpriced' END AS customer_charge_status, \
             c.currency AS customer_charge_currency, c.amount_nanos::text AS customer_charge_nanos, \
             t.total_ms, t.complete AS timing_complete, \
             (SELECT cached_input_tokens::text FROM request_token_categories WHERE attempt_id=a.id) AS cached_input_tokens, \
             (SELECT reasoning_output_tokens::text FROM request_token_categories WHERE attempt_id=a.id) AS reasoning_output_tokens, \
             (SELECT choices FROM request_finish_reasons WHERE attempt_id=a.id) AS finish_reasons, \
             (SELECT jsonb_build_object('kind',f.kind,'upstream_http_status',f.upstream_http_status) FROM request_failures f WHERE f.attempt_id=a.id) AS failure \
             FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id \
             LEFT JOIN api_keys k ON k.organization_id=a.organization_id AND k.project_id=a.project_id AND k.id=a.api_key_id \
             LEFT JOIN request_timings t ON t.attempt_id=a.id \
             LEFT JOIN customer_activity_charges c ON c.organization_id=a.organization_id AND c.project_id=a.project_id AND c.attempt_id=a.id",
        );
        push_activity_scope_and_filters(&mut query, scope, filter);
        push_activity_order(&mut query, filter.sort);
        query.push(" LIMIT 10001");
        Ok(query.build_query_as().fetch_all(&self.pool).await?)
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

    async fn gateway_activity_selection(
        &self,
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
            "SELECT a.id AS attempt_id, a.operation_id, (SELECT jsonb_build_object('ordinal',r.ordinal,'predecessor_attempt_id',r.predecessor_id,'maximum_attempts',p.maximum_attempts,'policy_revision',p.policy_revision) FROM gateway_retry_attempts r JOIN gateway_retry_policies p ON p.operation_id=r.operation_id WHERE r.attempt_id=a.id) AS retry, a.api_key_id, k.name AS key_name, o.task_id, task.evidence AS task_evidence, CASE WHEN EXISTS(SELECT 1 FROM media_recovery_routes media WHERE media.organization_id=a.organization_id AND media.project_id=a.project_id AND media.attempt_id=a.id) THEN 'video' ELSE 'inference' END AS request_kind, o.model_alias AS model, a.provider_model, \
             to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at, \
             CASE WHEN a.dispatched_at IS NULL THEN NULL ELSE to_char(a.dispatched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') END AS dispatched_at, \
             CASE WHEN a.completed_at IS NULL THEN NULL ELSE to_char(a.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') END AS completed_at, \
             CASE WHEN a.dispatched_at IS NULL OR a.completed_at IS NULL THEN NULL ELSE GREATEST(0, round(extract(epoch FROM (a.completed_at - a.dispatched_at)) * 1000))::bigint END AS duration_ms, \
             (SELECT jsonb_build_object('dispatch_ms',t.dispatch_ms,'headers_ms',t.headers_ms,'first_output_ms',t.first_output_ms,'total_ms',t.total_ms,'complete',t.complete,'http_status',t.http_status) FROM request_timings t WHERE t.attempt_id=a.id) AS timing, \
             a.execution, a.usage_confidence, a.prompt_tokens::text AS prompt_tokens, a.completion_tokens::text AS completion_tokens, \
             (SELECT cached_input_tokens::text FROM request_token_categories WHERE attempt_id=a.id) AS cached_input_tokens, \
             (SELECT reasoning_output_tokens::text FROM request_token_categories WHERE attempt_id=a.id) AS reasoning_output_tokens, \
             (SELECT choices FROM request_finish_reasons WHERE attempt_id=a.id) AS finish_reasons, \
             (SELECT jsonb_build_object('kind',f.kind,'upstream_http_status',f.upstream_http_status) FROM request_failures f WHERE f.attempt_id=a.id) AS failure, \
             (SELECT decision.outcome FROM output_guardrail_decisions decision WHERE decision.organization_id=a.organization_id AND decision.project_id=a.project_id AND decision.attempt_id=a.id) AS output_guardrail_outcome, \
             customer_charge.currency AS customer_charge_currency, customer_charge.amount_nanos::text AS customer_charge_nanos, \
             CASE WHEN customer_charge.attempt_id IS NOT NULL THEN 'charged' \
               WHEN a.dispatched_at IS NULL OR a.execution='confirmed_not_executed' THEN 'not_charged' \
               WHEN EXISTS (SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=a.id) THEN 'owner_funded' \
               WHEN EXISTS (SELECT 1 FROM customer_activity_priced_attempts tariff WHERE tariff.attempt_id=a.id) THEN 'pending' \
               ELSE 'unpriced' END AS customer_charge_status \
             FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id \
             LEFT JOIN api_keys k ON k.organization_id=a.organization_id AND k.project_id=a.project_id AND k.id=a.api_key_id \
             LEFT JOIN request_timings t ON t.attempt_id=a.id \
             LEFT JOIN customer_activity_charges customer_charge ON customer_charge.organization_id=a.organization_id AND customer_charge.project_id=a.project_id AND customer_charge.attempt_id=a.id \
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
        Ok(query.build_query_as().fetch_all(&self.pool).await?)
    }

    /// Exact totals for the current workspace and filter set. Pagination never
    /// changes these values; all sums stay in integer/string form for safety.
    pub async fn gateway_activity_summary(
        &self,
        scope: TenantScope,
        filter: &GatewayActivityFilter,
    ) -> Result<GatewayActivitySummary, StoreError> {
        let mut snapshot = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .execute(&mut *snapshot)
            .await?;
        let mut counts = QueryBuilder::new(
            "SELECT COUNT(*)::bigint AS request_count, \
             COUNT(*) FILTER (WHERE a.usage_confidence='provider_reported')::bigint AS usage_count, \
             COALESCE(SUM(a.prompt_tokens::numeric) FILTER (WHERE a.usage_confidence='provider_reported'), 0)::text AS prompt_tokens, \
             COALESCE(SUM(a.completion_tokens::numeric) FILTER (WHERE a.usage_confidence='provider_reported'), 0)::text AS completion_tokens, \
             COUNT(*) FILTER (WHERE t.complete)::bigint AS timing_count, \
             ROUND(AVG(t.total_ms::numeric) FILTER (WHERE t.complete))::bigint AS average_duration_ms, \
             COUNT(*) FILTER (WHERE a.dispatched_at IS NOT NULL AND a.execution <> 'confirmed_not_executed' AND tariff.attempt_id IS NOT NULL AND c.attempt_id IS NULL)::bigint AS unresolved_customer_charge_count, \
             COUNT(*) FILTER (WHERE a.dispatched_at IS NOT NULL AND a.execution <> 'confirmed_not_executed' AND c.attempt_id IS NULL AND EXISTS (SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=a.id))::bigint AS owner_funded_request_count, \
             COUNT(*) FILTER (WHERE a.dispatched_at IS NOT NULL AND a.execution <> 'confirmed_not_executed' AND tariff.attempt_id IS NULL AND NOT EXISTS (SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=a.id))::bigint AS unpriced_request_count \
             FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id \
             LEFT JOIN request_timings t ON t.attempt_id=a.id \
             LEFT JOIN customer_activity_priced_attempts tariff ON tariff.attempt_id=a.id \
             LEFT JOIN customer_activity_charges c ON c.organization_id=a.organization_id AND c.project_id=a.project_id AND c.attempt_id=a.id",
        );
        push_activity_scope_and_filters(&mut counts, scope, filter);
        let counts: GatewayActivitySummaryCounts =
            counts.build_query_as().fetch_one(&mut *snapshot).await?;

        let mut costs = QueryBuilder::new(
            "SELECT c.currency, COALESCE(SUM(c.amount_nanos::numeric), 0)::text AS amount_nanos, \
             COUNT(*)::bigint AS charged_requests \
             FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id \
             JOIN customer_activity_charges c ON c.organization_id=a.organization_id AND c.project_id=a.project_id AND c.attempt_id=a.id",
        );
        push_activity_scope_and_filters(&mut costs, scope, filter);
        costs.push(" GROUP BY c.currency ORDER BY c.currency");
        let customer_charges = costs.build_query_as().fetch_all(&mut *snapshot).await?;

        // Only customer ledger amounts enter these summaries. Missing settlement is
        // represented by null amounts and explicit coverage, never supplier expense.
        let mut charge_breakdowns = Vec::new();
        for (identity, group) in [
            ("'model_alias',o.model_alias", "o.model_alias"),
            (
                "'api_key_id',a.api_key_id,'key_name',k.name",
                "a.api_key_id,k.name",
            ),
        ] {
            let mut breakdown = QueryBuilder::new(format!(
                "SELECT jsonb_build_object({identity},'currency',c.currency, \
                 'amount_nanos',CASE WHEN COUNT(c.attempt_id)>0 THEN SUM(c.amount_nanos::numeric)::text ELSE NULL END, \
                 'request_count',COUNT(*),'charged_requests',COUNT(c.attempt_id), \
                 'unresolved_requests',COUNT(*) FILTER (WHERE a.dispatched_at IS NOT NULL AND a.execution <> 'confirmed_not_executed' AND tariff.attempt_id IS NOT NULL AND c.attempt_id IS NULL), \
                 'owner_funded_requests',COUNT(*) FILTER (WHERE a.dispatched_at IS NOT NULL AND a.execution <> 'confirmed_not_executed' AND c.attempt_id IS NULL AND EXISTS (SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=a.id)), \
                 'unpriced_requests',COUNT(*) FILTER (WHERE a.dispatched_at IS NOT NULL AND a.execution <> 'confirmed_not_executed' AND tariff.attempt_id IS NULL AND NOT EXISTS (SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=a.id) AND c.attempt_id IS NULL), \
                 'not_charged_requests',COUNT(*) FILTER (WHERE c.attempt_id IS NULL AND (a.dispatched_at IS NULL OR a.execution='confirmed_not_executed'))) \
                 FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id \
                 LEFT JOIN api_keys k ON k.organization_id=a.organization_id AND k.project_id=a.project_id AND k.id=a.api_key_id \
                 LEFT JOIN customer_activity_priced_attempts tariff ON tariff.attempt_id=a.id \
                 LEFT JOIN customer_activity_charges c ON c.organization_id=a.organization_id AND c.project_id=a.project_id AND c.attempt_id=a.id"
            ));
            push_activity_scope_and_filters(&mut breakdown, scope, filter);
            // Currency is kept separate, including the unknown (unsettled) group.
            breakdown.push(format!(" GROUP BY {group},c.currency ORDER BY c.currency NULLS LAST,SUM(c.amount_nanos::numeric) DESC NULLS LAST,{group}"));
            charge_breakdowns.push(
                breakdown
                    .build_query_scalar()
                    .fetch_all(&mut *snapshot)
                    .await?,
            );
        }
        let charges_by_key = charge_breakdowns.pop().unwrap();
        let charges_by_model = charge_breakdowns.pop().unwrap();

        let mut usage = QueryBuilder::new(
            "SELECT o.model_alias AS model_alias, COUNT(*)::bigint AS request_count, \
             COUNT(*) FILTER (WHERE a.usage_confidence='provider_reported')::bigint AS usage_count, \
             COALESCE(SUM(a.prompt_tokens::numeric) FILTER (WHERE a.usage_confidence='provider_reported'), 0)::text AS prompt_tokens, \
             COALESCE(SUM(a.completion_tokens::numeric) FILTER (WHERE a.usage_confidence='provider_reported'), 0)::text AS completion_tokens, \
             COUNT(*) FILTER (WHERE a.usage_confidence <> 'provider_reported')::bigint AS unknown_usage_count \
             FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id",
        );
        push_activity_scope_and_filters(&mut usage, scope, filter);
        usage.push(" GROUP BY o.model_alias ORDER BY COALESCE(SUM(a.prompt_tokens::numeric + a.completion_tokens::numeric) FILTER (WHERE a.usage_confidence='provider_reported'), 0) DESC, o.model_alias");
        let usage_by_model = usage.build_query_as().fetch_all(&mut *snapshot).await?;

        let mut keys = QueryBuilder::new(
            "SELECT a.api_key_id AS api_key_id, k.name AS key_name, COUNT(*)::bigint AS request_count, \
             COUNT(*) FILTER (WHERE a.usage_confidence='provider_reported')::bigint AS usage_count, \
             COALESCE(SUM(a.prompt_tokens::numeric) FILTER (WHERE a.usage_confidence='provider_reported'), 0)::text AS prompt_tokens, \
             COALESCE(SUM(a.completion_tokens::numeric) FILTER (WHERE a.usage_confidence='provider_reported'), 0)::text AS completion_tokens, \
             COUNT(*) FILTER (WHERE a.usage_confidence <> 'provider_reported')::bigint AS unknown_usage_count \
             FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id \
             LEFT JOIN api_keys k ON k.organization_id=a.organization_id AND k.project_id=a.project_id AND k.id=a.api_key_id",
        );
        push_activity_scope_and_filters(&mut keys, scope, filter);
        keys.push(" GROUP BY a.api_key_id, k.name ORDER BY COALESCE(SUM(a.prompt_tokens::numeric + a.completion_tokens::numeric) FILTER (WHERE a.usage_confidence='provider_reported'), 0) DESC, k.name NULLS LAST, a.api_key_id NULLS LAST LIMIT 10");
        let usage_by_key = keys.build_query_as().fetch_all(&mut *snapshot).await?;

        let mut histogram = QueryBuilder::new(
            "WITH filtered AS (SELECT floor(extract(epoch FROM a.created_at)*1000)::numeric AS ts FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id",
        );
        push_activity_scope_and_filters(&mut histogram, scope, filter);
        histogram.push("), bounds AS (SELECT COALESCE(").push_bind(filter.from_ms)
            .push("::numeric, MIN(ts)) AS start, COALESCE(").push_bind(filter.to_ms)
            .push("::numeric, MAX(ts)+1) AS finish FROM filtered), sized AS (SELECT start,finish,GREATEST(1,CEIL((finish-start)/24)) AS width FROM bounds), grouped AS (SELECT LEAST(23,GREATEST(0,FLOOR((f.ts-s.start)/s.width))) AS bucket,COUNT(*) AS requests FROM filtered f CROSS JOIN sized s GROUP BY bucket) SELECT jsonb_build_object('start_ms',(s.start+b.bucket*s.width)::bigint,'end_ms',LEAST(s.finish,s.start+(b.bucket+1)*s.width)::bigint,'request_count',COALESCE(g.requests,0)) FROM sized s CROSS JOIN generate_series(0,23) b(bucket) LEFT JOIN grouped g ON g.bucket=b.bucket WHERE s.start IS NOT NULL AND EXISTS(SELECT 1 FROM filtered) AND s.start+b.bucket*s.width<s.finish ORDER BY b.bucket");
        let request_histogram = histogram
            .build_query_scalar()
            .fetch_all(&mut *snapshot)
            .await?;

        let mut latency = QueryBuilder::new(
            "SELECT jsonb_build_object('boundary','gateway_body_ms','sample_count',COUNT(*),'p50_ms',percentile_disc(0.50) WITHIN GROUP (ORDER BY t.total_ms),'p95_ms',percentile_disc(0.95) WITHIN GROUP (ORDER BY t.total_ms),'p99_ms',percentile_disc(0.99) WITHIN GROUP (ORDER BY t.total_ms)) FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id JOIN request_timings t ON t.attempt_id=a.id",
        );
        push_activity_scope_and_filters(&mut latency, scope, filter);
        latency.push(" AND t.complete=TRUE");
        let latency_percentiles = latency
            .build_query_scalar()
            .fetch_one(&mut *snapshot)
            .await?;
        let mut delivery = QueryBuilder::new(
            "SELECT t.http_status, COUNT(*)::bigint AS request_count FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id LEFT JOIN request_timings t ON t.attempt_id=a.id",
        );
        push_activity_scope_and_filters(&mut delivery, scope, filter);
        delivery.push(" GROUP BY t.http_status ORDER BY t.http_status NULLS LAST");
        let delivery_statuses = delivery.build_query_as().fetch_all(&mut *snapshot).await?;
        let mut categories = QueryBuilder::new(
            "SELECT jsonb_build_object( \
             'cached_input_tokens',SUM(details.cached_input_tokens::numeric)::text, \
             'cached_input_requests',COUNT(details.cached_input_tokens), \
             'cached_input_unknown_requests',COUNT(*)-COUNT(details.cached_input_tokens), \
             'reasoning_output_tokens',SUM(details.reasoning_output_tokens::numeric)::text, \
             'reasoning_output_requests',COUNT(details.reasoning_output_tokens), \
             'reasoning_output_unknown_requests',COUNT(*)-COUNT(details.reasoning_output_tokens)) \
             FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id \
             LEFT JOIN request_token_categories details ON details.attempt_id=a.id",
        );
        push_activity_scope_and_filters(&mut categories, scope, filter);
        let token_categories = categories
            .build_query_scalar()
            .fetch_one(&mut *snapshot)
            .await?;
        snapshot.commit().await?;
        Ok(GatewayActivitySummary {
            request_count: counts.request_count,
            usage_count: counts.usage_count,
            prompt_tokens: counts.prompt_tokens,
            completion_tokens: counts.completion_tokens,
            timing_count: counts.timing_count,
            average_duration_ms: counts.average_duration_ms,
            unresolved_customer_charge_count: counts.unresolved_customer_charge_count,
            unpriced_request_count: counts.unpriced_request_count,
            owner_funded_request_count: counts.owner_funded_request_count,
            customer_charges,
            charges_by_model,
            charges_by_key,
            usage_by_model,
            usage_by_key,
            request_histogram,
            latency_percentiles,
            delivery_statuses,
            token_categories,
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

    /// Persist completion evidence and its independent customer and Supplier
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

    /// Each ledger owns its evidence and idempotency rules. A missing Supplier
    /// quantity must not suppress an independently resolvable customer charge,
    /// nor prevent another completed attempt in the batch from being accrued.
    /// Preserve the first error so callers still schedule recovery.
    async fn accrue_gateway_ledgers(&self, attempts: &[Uuid]) -> Result<(), StoreError> {
        let mut first_error = None;
        for &attempt in attempts {
            let supplier = self.accrue_provider_earning(attempt).await;
            let customer = self.accrue_customer_charge(attempt).await;
            if let Err(error) = supplier.and(customer) {
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

        let mut tx = self.pool.begin().await?;
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
            tx.commit().await?;
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
        tx.commit().await?;
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
        let mut tx = self.pool.begin().await?;
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
            tx.commit().await?;
            return Ok(id);
        }
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO price_revisions (id, organization_id, project_id, resource_id, offer_revision, currency, api_prompt_rate, api_completion_rate, cash_prompt_rate, cash_completion_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(input.resource_id).bind(input.offer_revision).bind(input.currency)
            .bind(input.api_equivalent.prompt).bind(input.api_equivalent.completion).bind(input.cash.prompt).bind(input.cash.completion).execute(&mut *tx).await?;
        tx.commit().await?;
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
        if !currency_valid(currency) || limit_nanos < 0 {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
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
        tx.commit().await?;
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
        let mut tx = self.pool.begin().await?;
        let attempt = sqlx::query("SELECT execution, resource_id, offer_revision FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt_id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if let Some(existing) = sqlx::query("SELECT price_revision_id, prompt_bound, completion_bound, state FROM cost_reservations WHERE attempt_id=$1")
            .bind(attempt_id).fetch_optional(&mut *tx).await? {
            if existing.get::<Uuid,_>("price_revision_id") == price_id && existing.get::<i64,_>("prompt_bound") == prompt_bound
                && existing.get::<i64,_>("completion_bound") == completion_bound && existing.get::<String,_>("state") == "held" {
                tx.commit().await?;
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
            return Err(StoreError::BudgetExceeded);
        }
        sqlx::query("INSERT INTO cost_reservations (attempt_id, organization_id, project_id, price_revision_id, reserved_nanos, prompt_bound, completion_bound) VALUES ($1,$2,$3,$4,$5,$6,$7)")
            .bind(attempt_id).bind(scope.organization_id).bind(scope.project_id).bind(price_id).bind(amount).bind(prompt_bound).bind(completion_bound).execute(&mut *tx).await?;
        tx.commit().await?;
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
        let mut tx = self.pool.begin().await?;
        let dispatched =
            Self::reserve_and_dispatch_gateway_in_tx(&mut tx, principal, attempt_id, reservation)
                .await?;
        tx.commit().await?;
        if dispatched {
            Ok(())
        } else {
            Err(StoreError::Conflict)
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
        // Account-enabled organizations use customer retail rates, independently
        // of the procurement budget. Hold and dispatch commit atomically.
        let prepaid: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM customer_balance_accounts WHERE organization_id=$1)",
        )
        .bind(scope.organization_id)
        .fetch_one(&mut **tx)
        .await?;
        if prepaid {
            let rates: Option<(i64, i64, i64, i64)> = sqlx::query_as("SELECT GREATEST(r.prompt_rate,COALESCE(r.cached_prompt_rate,r.prompt_rate)),r.completion_rate,r.minimum_charge_nanos,r.request_fee_nanos FROM customer_attempt_tariffs b JOIN customer_tariff_revisions r ON r.id=b.revision_id JOIN customer_attempt_balance_accounts a ON a.attempt_id=b.attempt_id AND a.currency=r.currency WHERE b.attempt_id=$1 AND a.organization_id=$2 AND a.project_id=$3")
                .bind(attempt_id).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut **tx).await?;
            let (prompt, completion, minimum, request_fee) =
                rates.ok_or(StoreError::InvalidPrice)?;
            let maximum = crate::pricing::customer_charge_with_fixed(
                TokenRates { prompt, completion }
                    .charge(reservation.prompt_bound, reservation.completion_bound)?,
                request_fee,
                minimum,
            )?;
            if maximum > 0 {
                crate::billing::reserve_customer_balance_in_tx(tx, scope, attempt_id, maximum)
                    .await?;
            }
        }
        let dispatched: bool = sqlx::query_scalar(
            "SELECT niu_reserve_and_dispatch_gateway_audited($1,$2,$3,$4,$5,$6,$7,$8,$9)",
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
        if !dispatched {
            // The denial and the release of its unsent hold commit together.
            sqlx::query("UPDATE customer_balance_reservations SET released_at=now() WHERE attempt_id=$1 AND released_at IS NULL")
                .bind(attempt_id).execute(&mut **tx).await?;
        }
        Ok(dispatched)
    }

    pub async fn budget(&self, scope: TenantScope) -> Result<Option<BudgetSnapshot>, StoreError> {
        Ok(sqlx::query_as("SELECT currency, limit_nanos, reserved_nanos, spent_nanos FROM project_budgets WHERE organization_id=$1 AND project_id=$2")
            .bind(scope.organization_id).bind(scope.project_id).fetch_optional(&self.pool).await?)
    }

    /// Settle from stored provider usage, never caller-supplied money. The same
    /// attempt always returns its original entry. Unknown usage retains its hold.
    pub async fn settle_cost(&self, scope: TenantScope, id: Uuid) -> Result<CostEntry, StoreError> {
        let mut tx = self.pool.begin().await?;
        let result = Self::settle_cost_in_tx(&mut tx, scope, id).await?;
        tx.commit().await?;
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
        // Record real liability even if a provider exceeds the bound. Future
        // admission stops when spent+reserved exhausts the configured limit.
        sqlx::query("UPDATE project_budgets SET reserved_nanos=reserved_nanos-$3, spent_nanos=spent_nanos+$4 WHERE organization_id=$1 AND project_id=$2")
            .bind(scope.organization_id).bind(scope.project_id).bind(reservation.get::<i64,_>("reserved_nanos")).bind(cash).execute(&mut **tx).await?;
        let entry = sqlx::query_as::<_,CostEntry>("INSERT INTO cost_entries (attempt_id, organization_id, project_id, price_revision_id, currency, api_equivalent_nanos, cash_nanos, usage_prompt_tokens, usage_completion_tokens, bound_exceeded) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING attempt_id, price_revision_id, currency, api_equivalent_nanos, cash_nanos, usage_prompt_tokens, usage_completion_tokens, bound_exceeded")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(reservation.get::<Uuid,_>("price_revision_id"))
            .bind(reservation.get::<String,_>("currency")).bind(api).bind(cash).bind(prompt).bind(completion).bind(exceeded).fetch_one(&mut **tx).await?;
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
        let mut tx = self.pool.begin().await?;
        Self::release_nonexecuted_cost_in_tx(&mut tx, scope, id).await?;
        tx.commit().await?;
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
        let reservation =
            sqlx::query("SELECT state, reserved_nanos FROM cost_reservations WHERE attempt_id=$1")
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
        sqlx::query("UPDATE project_budgets SET reserved_nanos=reserved_nanos-$3 WHERE organization_id=$1 AND project_id=$2")
            .bind(scope.organization_id).bind(scope.project_id).bind(reservation.get::<i64,_>("reserved_nanos")).execute(&mut **tx).await?;
        sqlx::query("UPDATE cost_reservations SET state='released' WHERE attempt_id=$1")
            .bind(id)
            .execute(&mut **tx)
            .await?;
        Ok(())
    }
}
