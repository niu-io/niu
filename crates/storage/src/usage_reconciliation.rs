//! Supplemental provider evidence; settlement remains owned by financial recovery.
use crate::{RequestTokenCategories, Store, StoreError, TenantScope};
use serde_json::Value;
use sqlx::Row;
use uuid::Uuid;

// Intentionally neither Debug nor Serialize: this context contains private routing evidence.
pub struct OpenRouterReconciliationContext {
    pub vendor_id: Uuid,
    pub credential_ciphertext: Vec<u8>,
    pub generation_id: String,
    pub upstream_model: String,
}

/// Validated native quantities only. Normalized counts and upstream costs are ignored.
pub struct OpenRouterUsageObservation {
    prompt: i64,
    completion: i64,
    cached: Option<i64>,
    reasoning: Option<i64>,
    model: String,
    finish_reason: String,
}

impl OpenRouterUsageObservation {
    pub fn from_generation(
        body: &Value,
        context: &OpenRouterReconciliationContext,
    ) -> Result<Self, StoreError> {
        let data = &body["data"];
        if data["id"].as_str() != Some(context.generation_id.as_str())
            || data["model"].as_str() != Some(context.upstream_model.as_str())
        {
            return Err(StoreError::Conflict);
        }
        if data["cancelled"].as_bool() != Some(false)
            || !matches!(
                data["finish_reason"].as_str(),
                Some("stop" | "length" | "tool_calls")
            )
        {
            return Err(StoreError::UnconfirmedGeneration);
        }
        let prompt = data["native_tokens_prompt"]
            .as_i64()
            .filter(|n| *n >= 0)
            .ok_or(StoreError::InvalidUsage)?;
        let completion = data["native_tokens_completion"]
            .as_i64()
            .filter(|n| *n >= 0)
            .ok_or(StoreError::InvalidUsage)?;
        let subset = |key: &str, total: i64| -> Result<Option<i64>, StoreError> {
            if data[key].is_null() {
                return Ok(None);
            }
            data[key]
                .as_i64()
                .filter(|n| (0..=total).contains(n))
                .map(Some)
                .ok_or(StoreError::InvalidUsage)
        };
        Ok(Self {
            prompt,
            completion,
            cached: subset("native_tokens_cached", prompt)?,
            reasoning: subset("native_tokens_reasoning", completion)?,
            model: context.upstream_model.clone(),
            finish_reason: data["finish_reason"]
                .as_str()
                .ok_or(StoreError::Conflict)?
                .to_owned(),
        })
    }
}

const CONTEXT: &str = "SELECT v.id, v.credential_ciphertext, g.generation_id, COALESCE(g.upstream_model,m.upstream_model) AS upstream_model, a.prompt_tokens, a.completion_tokens, \
 c.cached_input_tokens, c.reasoning_output_tokens \
 FROM attempts a JOIN managed_attempt_routes r ON r.attempt_id=a.id \
 JOIN openrouter_generation_references g ON g.attempt_id=a.id \
 JOIN vendors v ON v.id=r.vendor_id LEFT JOIN vendor_models m ON m.alias=r.model_alias \
 LEFT JOIN request_token_categories c ON c.attempt_id=a.id \
 WHERE a.id=$1 AND a.organization_id=$2 AND a.project_id=$3 \
 AND ((a.execution IN ('confirmed_completed','may_have_executed') AND a.usage_confidence='unknown' \
 AND a.prompt_tokens IS NULL AND a.completion_tokens IS NULL AND c.attempt_id IS NULL) \
 OR (a.execution='confirmed_completed' AND a.usage_confidence='provider_reported' \
 AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL \
 AND (c.cached_input_tokens IS NULL OR c.reasoning_output_tokens IS NULL) \
 AND NOT EXISTS(SELECT 1 FROM customer_charges paid WHERE paid.attempt_id=a.id))) \
 AND v.adapter='openrouter' AND trim(trailing '/' FROM v.api_base)='https://openrouter.ai/api/v1' \
 AND v.enabled AND v.revision=r.vendor_revision \
 AND (g.upstream_model IS NOT NULL OR (m.enabled AND m.vendor_id=v.id AND m.revision=r.model_revision)) \
 AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id=v.id AND o.organization_id<>a.organization_id)";

impl Store {
    /// No upstream reference, credential, Supplier price or raw response leaves this projection.
    pub async fn openrouter_usage_receipt(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT jsonb_build_object('status','recorded','prompt_tokens',r.prompt_tokens::text, \
             'completion_tokens',r.completion_tokens::text,'cached_input_tokens',r.cached_input_tokens::text, \
             'reasoning_output_tokens',r.reasoning_output_tokens::text,'cache_write_input_tokens',NULL, \
             'recorded_at',r.recorded_at,'source_version',r.source_version, \
             'original_execution',r.original_state->>'execution','upstream_finish_reason',r.upstream_finish_reason, \
             'upstream_cancelled',r.upstream_cancelled) \
             FROM openrouter_usage_reconciliations r JOIN attempts a ON a.id=r.attempt_id \
             WHERE a.id=$1 AND a.organization_id=$2 AND a.project_id=$3")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id)
            .fetch_optional(&self.pool).await?)
    }

    pub async fn openrouter_reconciliation_context(
        &self,
        scope: TenantScope,
        attempt: Uuid,
    ) -> Result<OpenRouterReconciliationContext, StoreError> {
        let row = sqlx::query(CONTEXT)
            .bind(attempt)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(StoreError::Conflict)?;
        Ok(OpenRouterReconciliationContext {
            vendor_id: row.try_get("id")?,
            credential_ciphertext: row.try_get("credential_ciphertext")?,
            generation_id: row.try_get("generation_id")?,
            upstream_model: row.try_get("upstream_model")?,
        })
    }

    /// Atomically retain original uncertain execution/usage and apply terminal provider evidence.
    /// Call only with a response fetched using the supplied private context. This never
    /// dispatches inference, releases a reservation or directly writes a charge.
    pub async fn record_openrouter_usage(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        context: &OpenRouterReconciliationContext,
        usage: &OpenRouterUsageObservation,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        // Match dispatch lock order; recheck versions after the network operation.
        sqlx::query("SELECT id FROM vendors WHERE id=$1 FOR SHARE")
            .bind(context.vendor_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("SELECT m.alias FROM vendor_models m JOIN managed_attempt_routes r ON r.model_alias=m.alias WHERE r.attempt_id=$1 FOR SHARE OF m")
            .bind(attempt).execute(&mut *tx).await?;
        let locked: Option<Uuid> = sqlx::query_scalar("SELECT id FROM attempts WHERE id=$1 AND organization_id=$2 AND project_id=$3 FOR UPDATE")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?;
        if locked.is_none() {
            return Err(StoreError::Conflict);
        }
        if let Some(row) = sqlx::query("SELECT prompt_tokens,completion_tokens,cached_input_tokens,reasoning_output_tokens,provider_model,upstream_finish_reason FROM openrouter_usage_reconciliations WHERE attempt_id=$1")
            .bind(attempt).fetch_optional(&mut *tx).await? {
            if row.try_get::<i64,_>("prompt_tokens")? != usage.prompt
                || row.try_get::<i64,_>("completion_tokens")? != usage.completion
                || row.try_get::<Option<i64>,_>("cached_input_tokens")? != usage.cached
                || row.try_get::<Option<i64>,_>("reasoning_output_tokens")? != usage.reasoning
                || row.try_get::<String,_>("provider_model")? != usage.model
                || row.try_get::<Option<String>,_>("upstream_finish_reason")?.is_some_and(|reason| reason != usage.finish_reason) {
                return Err(StoreError::Conflict);
            }
            tx.commit().await?;
            return Ok(());
        }
        let row = sqlx::query(CONTEXT)
            .bind(attempt)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        if row.try_get::<Uuid, _>("id")? != context.vendor_id
            || row.try_get::<String, _>("generation_id")? != context.generation_id
            || row.try_get::<String, _>("upstream_model")? != usage.model
            || row.try_get::<Vec<u8>, _>("credential_ciphertext")? != context.credential_ciphertext
        {
            return Err(StoreError::Conflict);
        }
        // Supplemental metadata must agree with every quantity already known.
        // Do not consume the one immutable receipt unless it adds evidence.
        let original_prompt: Option<i64> = row.try_get("prompt_tokens")?;
        let original_completion: Option<i64> = row.try_get("completion_tokens")?;
        let original_cached: Option<i64> = row.try_get("cached_input_tokens")?;
        let original_reasoning: Option<i64> = row.try_get("reasoning_output_tokens")?;
        if original_prompt.is_some_and(|value| value != usage.prompt)
            || original_completion.is_some_and(|value| value != usage.completion)
            || original_cached
                .zip(usage.cached)
                .is_some_and(|(a, b)| a != b)
            || original_reasoning
                .zip(usage.reasoning)
                .is_some_and(|(a, b)| a != b)
            || (original_prompt.is_some()
                && !(original_cached.is_none() && usage.cached.is_some()
                    || original_reasoning.is_none() && usage.reasoning.is_some()))
        {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO openrouter_usage_reconciliations(attempt_id,prompt_tokens,completion_tokens,cached_input_tokens,reasoning_output_tokens,provider_model,original_state,source_version,upstream_finish_reason,upstream_cancelled) \
            SELECT id,$2,$3,$4,$5,$6,jsonb_build_object('execution',execution,'usage_confidence',usage_confidence, \
            'prompt_tokens',prompt_tokens,'completion_tokens',completion_tokens,'provider_model',provider_model,'completed_at',completed_at,'settlement',settlement, \
            'token_categories',(SELECT to_jsonb(c)-'attempt_id' FROM request_token_categories c WHERE c.attempt_id=attempts.id)),'openrouter-native-generation-v2',$7,FALSE FROM attempts WHERE id=$1")
            .bind(attempt).bind(usage.prompt).bind(usage.completion).bind(usage.cached).bind(usage.reasoning).bind(&usage.model).bind(&usage.finish_reason).execute(&mut *tx).await?;
        sqlx::query("UPDATE attempts SET execution='confirmed_completed',usage_confidence='provider_reported',prompt_tokens=$2,completion_tokens=$3,completed_at=COALESCE(completed_at,statement_timestamp()) WHERE id=$1")
            .bind(attempt).bind(usage.prompt).bind(usage.completion).execute(&mut *tx).await?;
        if usage.cached.is_some() || usage.reasoning.is_some() {
            Self::save_request_token_categories_in_tx(
                &mut tx,
                scope,
                attempt,
                RequestTokenCategories {
                    cached_input_tokens: usage.cached,
                    reasoning_output_tokens: usage.reasoning,
                    cache_write_input_tokens: None,
                },
            )
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }
}
