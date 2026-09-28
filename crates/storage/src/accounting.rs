use crate::{PriceInput, Store, StoreError, TenantScope, TokenRates};
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
    pub api_key_id: Option<Uuid>,
    pub key_name: Option<String>,
    pub task_id: Option<String>,
    pub task_evidence: Option<serde_json::Value>,
    pub model: String,
    pub provider_model: Option<String>,
    pub created_at: String,
    pub dispatched_at: Option<String>,
    pub completed_at: Option<String>,
    pub duration_ms: Option<i64>,
    pub execution: String,
    pub usage_confidence: String,
    pub prompt_tokens: Option<String>,
    pub completion_tokens: Option<String>,
    pub currency: Option<String>,
    pub cash_nanos: Option<String>,
    pub api_equivalent_nanos: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct GatewayActivityFilter {
    pub from_ms: Option<i64>,
    pub to_ms: Option<i64>,
    pub model_alias: Option<String>,
    pub api_key_id: Option<Uuid>,
    pub execution: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct GatewayActivitySummaryCounts {
    request_count: i64,
    usage_count: i64,
    prompt_tokens: String,
    completion_tokens: String,
    timing_count: i64,
    average_duration_ms: Option<i64>,
    unknown_cost_count: i64,
}

#[derive(Debug, sqlx::FromRow, serde::Serialize)]
pub struct GatewayActivityCostSummary {
    pub currency: String,
    pub cash_nanos: String,
    pub api_equivalent_nanos: String,
    pub settled_requests: i64,
}

#[derive(Debug, serde::Serialize)]
pub struct GatewayActivitySummary {
    pub request_count: i64,
    pub usage_count: i64,
    pub prompt_tokens: String,
    pub completion_tokens: String,
    pub timing_count: i64,
    pub average_duration_ms: Option<i64>,
    pub unknown_cost_count: i64,
    pub settled_costs: Vec<GatewayActivityCostSummary>,
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
        query.push(" AND a.execution = ").push_bind(execution);
    }
}

fn currency_valid(currency: &str) -> bool {
    currency.len() == 3 && currency.bytes().all(|b| b.is_ascii_uppercase())
}

impl Store {
    /// Recent model requests recorded by the gateway itself, optionally grouped
    /// later by their caller-supplied task identifier.
    pub async fn gateway_activity(
        &self,
        scope: TenantScope,
        after: Option<Uuid>,
        limit: i64,
        filter: &GatewayActivityFilter,
    ) -> Result<Vec<GatewayActivityEntry>, StoreError> {
        if !(1..=101).contains(&limit) {
            return Err(StoreError::InvalidPrice);
        }
        let mut query = QueryBuilder::new(
            "SELECT a.id AS attempt_id, a.operation_id, a.api_key_id, k.name AS key_name, o.task_id, task.evidence AS task_evidence, o.model_alias AS model, a.provider_model, \
             to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at, \
             CASE WHEN a.dispatched_at IS NULL THEN NULL ELSE to_char(a.dispatched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') END AS dispatched_at, \
             CASE WHEN a.completed_at IS NULL THEN NULL ELSE to_char(a.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') END AS completed_at, \
             CASE WHEN a.dispatched_at IS NULL OR a.completed_at IS NULL THEN NULL ELSE GREATEST(0, round(extract(epoch FROM (a.completed_at - a.dispatched_at)) * 1000))::bigint END AS duration_ms, \
             a.execution, a.usage_confidence, a.prompt_tokens::text AS prompt_tokens, a.completion_tokens::text AS completion_tokens, \
             c.currency, c.cash_nanos::text AS cash_nanos, c.api_equivalent_nanos::text AS api_equivalent_nanos \
             FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id \
             LEFT JOIN api_keys k ON k.organization_id=a.organization_id AND k.project_id=a.project_id AND k.id=a.api_key_id \
             LEFT JOIN cost_entries c ON c.organization_id=a.organization_id AND c.project_id=a.project_id AND c.attempt_id=a.id \
             LEFT JOIN LATERAL (SELECT jsonb_build_object( \
               'execution_id', e.id, 'source', e.source, 'record_id', e.record_id, 'coverage', e.payload->>'coverage', \
               'outcomes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('authority', outcome->>'authority', 'result', outcome->>'result')), '[]'::jsonb) FROM jsonb_array_elements(e.payload->'outcomes') AS items(outcome)) \
             ) AS evidence FROM execution_imports e WHERE e.organization_id=o.organization_id AND e.project_id=o.project_id AND e.task_id=o.task_id ORDER BY e.imported_at DESC, e.id DESC LIMIT 1) task ON true",
        );
        push_activity_scope_and_filters(&mut query, scope, filter);
        if let Some(after) = after {
            query
                .push(" AND EXISTS (SELECT 1 FROM attempts cursor WHERE cursor.organization_id=a.organization_id AND cursor.project_id=a.project_id AND cursor.id = ")
                .push_bind(after)
                .push(" AND (a.created_at, a.id) < (cursor.created_at, cursor.id))");
        }
        query
            .push(" ORDER BY a.created_at DESC, a.id DESC LIMIT ")
            .push_bind(limit);
        Ok(query.build_query_as().fetch_all(&self.pool).await?)
    }

    /// Exact totals for the current workspace and filter set. Pagination never
    /// changes these values; all sums stay in integer/string form for safety.
    pub async fn gateway_activity_summary(
        &self,
        scope: TenantScope,
        filter: &GatewayActivityFilter,
    ) -> Result<GatewayActivitySummary, StoreError> {
        let mut counts = QueryBuilder::new(
            "SELECT COUNT(*)::bigint AS request_count, \
             COUNT(*) FILTER (WHERE a.usage_confidence='provider_reported')::bigint AS usage_count, \
             COALESCE(SUM(a.prompt_tokens::numeric) FILTER (WHERE a.usage_confidence='provider_reported'), 0)::text AS prompt_tokens, \
             COALESCE(SUM(a.completion_tokens::numeric) FILTER (WHERE a.usage_confidence='provider_reported'), 0)::text AS completion_tokens, \
             COUNT(*) FILTER (WHERE a.dispatched_at IS NOT NULL AND a.completed_at IS NOT NULL)::bigint AS timing_count, \
             ROUND(AVG(GREATEST(0, round(extract(epoch FROM (a.completed_at - a.dispatched_at)) * 1000))::numeric) FILTER (WHERE a.dispatched_at IS NOT NULL AND a.completed_at IS NOT NULL))::bigint AS average_duration_ms, \
             COUNT(*) FILTER (WHERE c.attempt_id IS NULL)::bigint AS unknown_cost_count \
             FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id \
             LEFT JOIN cost_entries c ON c.organization_id=a.organization_id AND c.project_id=a.project_id AND c.attempt_id=a.id",
        );
        push_activity_scope_and_filters(&mut counts, scope, filter);
        let counts: GatewayActivitySummaryCounts =
            counts.build_query_as().fetch_one(&self.pool).await?;

        let mut costs = QueryBuilder::new(
            "SELECT c.currency, COALESCE(SUM(c.cash_nanos::numeric), 0)::text AS cash_nanos, \
             COALESCE(SUM(c.api_equivalent_nanos::numeric), 0)::text AS api_equivalent_nanos, \
             COUNT(*)::bigint AS settled_requests \
             FROM attempts a JOIN operations o ON o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.id=a.operation_id \
             JOIN cost_entries c ON c.organization_id=a.organization_id AND c.project_id=a.project_id AND c.attempt_id=a.id",
        );
        push_activity_scope_and_filters(&mut costs, scope, filter);
        costs.push(" GROUP BY c.currency ORDER BY c.currency");
        let settled_costs = costs.build_query_as().fetch_all(&self.pool).await?;

        Ok(GatewayActivitySummary {
            request_count: counts.request_count,
            usage_count: counts.usage_count,
            prompt_tokens: counts.prompt_tokens,
            completion_tokens: counts.completion_tokens,
            timing_count: counts.timing_count,
            average_duration_ms: counts.average_duration_ms,
            unknown_cost_count: counts.unknown_cost_count,
            settled_costs,
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
        if usage.is_some() {
            let reserved: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM cost_reservations WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3 AND state='held')")
                .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_one(&self.pool).await?;
            if reserved {
                self.settle_cost(scope, id).await?;
            }
        }
        Ok(())
    }

    /// Installation worker only. Advance a UUID cursor even past failed rows so
    /// a malformed record cannot starve other projects. Restart after each sweep.
    pub async fn recover_settlements(
        &self,
        after: Option<Uuid>,
    ) -> Result<(Option<Uuid>, usize), StoreError> {
        let rows = sqlx::query("SELECT a.id, a.organization_id, a.project_id FROM attempts a JOIN cost_reservations r ON r.attempt_id=a.id WHERE a.execution='confirmed_completed' AND a.usage_confidence='provider_reported' AND r.state='held' AND ($1::uuid IS NULL OR a.id > $1) ORDER BY a.id LIMIT 100")
            .bind(after).fetch_all(&self.pool).await?;
        let next = if rows.len() == 100 {
            rows.last().map(|r| r.get::<Uuid, _>("id"))
        } else {
            None
        };
        let mut failures = 0;
        for row in rows {
            let scope = TenantScope {
                organization_id: row.get("organization_id"),
                project_id: row.get("project_id"),
            };
            if self.settle_cost(scope, row.get("id")).await.is_err() {
                failures += 1;
            }
        }
        Ok((next, failures))
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

    pub async fn budget(&self, scope: TenantScope) -> Result<Option<BudgetSnapshot>, StoreError> {
        Ok(sqlx::query_as("SELECT currency, limit_nanos, reserved_nanos, spent_nanos FROM project_budgets WHERE organization_id=$1 AND project_id=$2")
            .bind(scope.organization_id).bind(scope.project_id).fetch_optional(&self.pool).await?)
    }

    /// Settle from stored provider usage, never caller-supplied money. The same
    /// attempt always returns its original entry. Unknown usage retains its hold.
    pub async fn settle_cost(&self, scope: TenantScope, id: Uuid) -> Result<CostEntry, StoreError> {
        let mut tx = self.pool.begin().await?;
        let attempt = sqlx::query("SELECT execution, usage_confidence, prompt_tokens, completion_tokens FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if let Some(entry) = sqlx::query_as::<_,CostEntry>("SELECT attempt_id, price_revision_id, currency, api_equivalent_nanos, cash_nanos, usage_prompt_tokens, usage_completion_tokens, bound_exceeded FROM cost_entries WHERE attempt_id=$1")
            .bind(id).fetch_optional(&mut *tx).await? {
            tx.commit().await?;
            return Ok(entry);
        }
        if attempt.get::<String, _>("execution") != "confirmed_completed"
            || attempt.get::<String, _>("usage_confidence") != "provider_reported"
        {
            return Err(StoreError::Unresolved);
        }
        let reservation = sqlx::query("SELECT r.price_revision_id, r.reserved_nanos, r.prompt_bound, r.completion_bound, p.currency, p.api_prompt_rate, p.api_completion_rate, p.cash_prompt_rate, p.cash_completion_rate FROM cost_reservations r JOIN price_revisions p ON p.id=r.price_revision_id WHERE r.attempt_id=$1 AND r.state='held'")
            .bind(id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
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
            .bind(scope.organization_id).bind(scope.project_id).bind(reservation.get::<i64,_>("reserved_nanos")).bind(cash).execute(&mut *tx).await?;
        let entry = sqlx::query_as::<_,CostEntry>("INSERT INTO cost_entries (attempt_id, organization_id, project_id, price_revision_id, currency, api_equivalent_nanos, cash_nanos, usage_prompt_tokens, usage_completion_tokens, bound_exceeded) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING attempt_id, price_revision_id, currency, api_equivalent_nanos, cash_nanos, usage_prompt_tokens, usage_completion_tokens, bound_exceeded")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(reservation.get::<Uuid,_>("price_revision_id"))
            .bind(reservation.get::<String,_>("currency")).bind(api).bind(cash).bind(prompt).bind(completion).bind(exceeded).fetch_one(&mut *tx).await?;
        sqlx::query("UPDATE cost_reservations SET state='settled' WHERE attempt_id=$1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE attempts SET settlement='settled' WHERE id=$1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(entry)
    }

    /// A hold can be released only when the persisted dispatch transition never
    /// occurred. Timeouts, elapsed wall time and process loss are not proof.
    pub async fn release_unsent_cost(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query("SELECT execution FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        if row.get::<String, _>("execution") != "not_sent" {
            return Err(StoreError::Unresolved);
        }
        let reservation =
            sqlx::query("SELECT state, reserved_nanos FROM cost_reservations WHERE attempt_id=$1")
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(StoreError::Conflict)?;
        let state: String = reservation.get("state");
        if state == "released" {
            tx.commit().await?;
            return Ok(());
        }
        if state != "held" {
            return Err(StoreError::Conflict);
        }
        sqlx::query("UPDATE project_budgets SET reserved_nanos=reserved_nanos-$3 WHERE organization_id=$1 AND project_id=$2")
            .bind(scope.organization_id).bind(scope.project_id).bind(reservation.get::<i64,_>("reserved_nanos")).execute(&mut *tx).await?;
        sqlx::query("UPDATE cost_reservations SET state='released' WHERE attempt_id=$1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }
}
