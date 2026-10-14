//! Explicit workspace text enrollment and admission-time concrete retail prices.
//! Existing operation prices win before current configuration is consulted.
use crate::{
    OperatorAuditActor, RetailSchedule, Store, StoreError, TenantScope, TextRetailSchedule,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RetailTextEnrollmentPublication {
    pub model_alias: String,
    /// None explicitly restores legacy workspace tariff selection for future operations.
    #[serde(deserialize_with = "crate::retail_publication::required_optional_uuid")]
    pub price_id: Option<Uuid>,
    pub expected_version: String,
    pub idempotency_key: Uuid,
    pub reason: String,
}

impl Store {
    /// Own workspace configuration only; no other-customer promotion history.
    pub async fn retail_text_enrollment(
        &self,
        scope: TenantScope,
        model: &str,
    ) -> Result<Value, StoreError> {
        if model.is_empty()
            || model.len() > 200
            || model != model.trim()
            || model.chars().any(char::is_control)
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR SHARE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let mut configuration:Value=sqlx::query_scalar("SELECT jsonb_build_object('model_alias',$3::text,'price_id',e.price_id,'version',COALESCE(e.version,0)::text,'pricing_source',CASE WHEN e.price_id IS NULL THEN 'workspace' ELSE 'platform' END) FROM projects p LEFT JOIN retail_text_enrollments e ON e.organization_id=p.organization_id AND e.project_id=p.id AND e.model_alias=$3 WHERE p.organization_id=$1 AND p.id=$2")
            .bind(scope.organization_id).bind(scope.project_id).bind(model).fetch_one(&mut *tx).await?;
        let selected = if let Some(head) = configuration["price_id"].as_str() {
            let head = Uuid::parse_str(head).map_err(|_| StoreError::Conflict)?;
            Some(Self::select_retail_price_in_tx(&mut tx, head, scope.organization_id).await?)
        } else {
            None
        };
        configuration["effective_price"] = json!(selected);
        tx.commit().await?;
        Ok(configuration)
    }

    /// Platform financial administration must be authorized by the caller.
    /// Enrollment selects a published price identity, not Provider readiness.
    pub async fn publish_retail_text_enrollment(
        &self,
        scope: TenantScope,
        input: &RetailTextEnrollmentPublication,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        if input.model_alias.is_empty()
            || input.model_alias.len() > 200
            || input.model_alias != input.model_alias.trim()
            || input.model_alias.chars().any(char::is_control)
            || input.reason.is_empty()
            || input.reason != input.reason.trim()
            || input.reason.chars().count() > 500
            || input.reason.chars().any(char::is_control)
            || input.expected_version.is_empty()
            || !input.expected_version.bytes().all(|b| b.is_ascii_digit())
        {
            return Err(StoreError::InvalidPrice);
        }
        let expected = input
            .expected_version
            .parse::<i64>()
            .map_err(|_| StoreError::InvalidPrice)?;
        let next = expected.checked_add(1).ok_or(StoreError::InvalidPrice)?;
        let intent = json!({"model_alias":input.model_alias,"price_id":input.price_id,
            "expected_version":expected.to_string(),"reason":input.reason});
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR UPDATE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let prior: Option<(Uuid, i64, Value)> = sqlx::query_as(
            "SELECT id,version,intent FROM retail_text_enrollment_changes \
             WHERE organization_id=$1 AND project_id=$2 AND idempotency_key=$3",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(input.idempotency_key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((id, version, saved)) = prior {
            return if saved == intent {
                Ok(json!({"revision":id,"version":version.to_string(),
                    "model_alias":input.model_alias,"price_id":input.price_id}))
            } else {
                Err(StoreError::Conflict)
            };
        }
        if let Some(head) = input.price_id {
            // Identity is immutable. Do not acquire an exclusive price lock
            // while holding the workspace lock; publications never fan out here.
            let valid:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM platform_retail_price_heads h JOIN customer_balance_accounts account ON account.currency=h.currency AND account.organization_id=$3 WHERE h.id=$1 AND h.model_alias=$2 AND h.rate_kind='text' AND h.current_revision IS NOT NULL)")
                .bind(head).bind(&input.model_alias).bind(scope.organization_id).fetch_one(&mut *tx).await?;
            if !valid {
                return Err(StoreError::Conflict);
            }
        }
        sqlx::query("INSERT INTO retail_text_enrollments(organization_id,project_id,model_alias) VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
            .bind(scope.organization_id).bind(scope.project_id).bind(&input.model_alias).execute(&mut *tx).await?;
        let version:i64=sqlx::query_scalar("SELECT version FROM retail_text_enrollments WHERE organization_id=$1 AND project_id=$2 AND model_alias=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(&input.model_alias).fetch_one(&mut *tx).await?;
        if version != expected {
            return Err(StoreError::Conflict);
        }
        let id = Uuid::new_v4();
        let (kind, operator) = actor.kind_and_id();
        sqlx::query("INSERT INTO retail_text_enrollment_changes(id,organization_id,project_id,model_alias,price_id,version,idempotency_key,intent,reason,actor_kind,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(&input.model_alias)
            .bind(input.price_id).bind(next).bind(input.idempotency_key).bind(intent).bind(&input.reason)
            .bind(kind).bind(operator).execute(&mut *tx).await?;
        sqlx::query("UPDATE retail_text_enrollments SET price_id=$4,version=$5 WHERE organization_id=$1 AND project_id=$2 AND model_alias=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(&input.model_alias)
            .bind(input.price_id).bind(next).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(
            json!({"revision":id,"version":next.to_string(),"model_alias":input.model_alias,"price_id":input.price_id}),
        )
    }

    /// Called after the existing workspace SHARE lock, before legacy selection.
    /// True supplies the attempt tariff; caller must still bind its balance
    /// account and reserve against these exact rates in the same transaction.
    pub(crate) async fn bind_platform_retail_text_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        scope: TenantScope,
        attempt: Uuid,
        alias: &str,
    ) -> Result<bool, StoreError> {
        let operation:Uuid=sqlx::query_scalar("SELECT o.id FROM operations o JOIN attempts a ON a.operation_id=o.id WHERE a.id=$1 AND a.organization_id=$2 AND a.project_id=$3 AND a.resource_id=$4 AND a.execution='not_sent' AND o.organization_id=a.organization_id AND o.project_id=a.project_id AND o.model_alias=$4 FOR UPDATE OF o")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(alias)
            .fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        let pinned: Option<Uuid> = sqlx::query_scalar(
            "SELECT revision_id FROM customer_operation_tariffs WHERE operation_id=$1",
        )
        .bind(operation)
        .fetch_optional(&mut **tx)
        .await?;
        if let Some(revision) = pinned {
            let valid:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_tariff_revisions r JOIN customer_tariffs t ON t.id=r.tariff_id WHERE r.id=$1 AND t.organization_id=$2 AND t.project_id=$3 AND t.model_alias=$4)")
                .bind(revision).bind(scope.organization_id).bind(scope.project_id).bind(alias)
                .fetch_one(&mut **tx).await?;
            if !valid {
                return Err(StoreError::Conflict);
            }
            bind_revision(tx, attempt, revision).await?;
            return Ok(true);
        }
        let head:Option<Uuid>=sqlx::query_scalar("SELECT price_id FROM retail_text_enrollments WHERE organization_id=$1 AND project_id=$2 AND model_alias=$3 AND price_id IS NOT NULL")
            .bind(scope.organization_id).bind(scope.project_id).bind(alias)
            .fetch_optional(&mut **tx).await?;
        let Some(head) = head else {
            return Ok(false);
        };
        let selected = Self::select_retail_price_in_tx(tx, head, scope.organization_id).await?;
        if selected.model_alias != alias {
            return Err(StoreError::Conflict);
        }
        let RetailSchedule::Text(ref result) = selected.schedule else {
            return Err(StoreError::InvalidPrice);
        };
        // A scoped tariff hosts immutable materializations but its legacy
        // current revision remains unchanged, including an initially null head.
        sqlx::query("INSERT INTO customer_tariffs(id,organization_id,project_id,model_alias) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,project_id,model_alias) DO NOTHING")
            .bind(Uuid::new_v4()).bind(scope.organization_id).bind(scope.project_id).bind(alias)
            .execute(&mut **tx).await?;
        let tariff:Uuid=sqlx::query_scalar("SELECT id FROM customer_tariffs WHERE organization_id=$1 AND project_id=$2 AND model_alias=$3 FOR NO KEY UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(alias).fetch_one(&mut **tx).await?;
        let baseline_document: Value = sqlx::query_scalar(
            "SELECT schedule FROM platform_retail_standard_revisions WHERE head_id=$1 AND id=$2",
        )
        .bind(head)
        .bind(selected.baseline_revision)
        .fetch_one(&mut **tx)
        .await?;
        let baseline: RetailSchedule =
            serde_json::from_value(baseline_document).map_err(|_| StoreError::InvalidPrice)?;
        let RetailSchedule::Text(baseline) = baseline else {
            return Err(StoreError::InvalidPrice);
        };
        let baseline_revision = materialize(
            tx,
            Materialization {
                tariff,
                head,
                standard: selected.baseline_revision,
                promotion: None,
                currency: &selected.currency,
                schedule: &baseline,
                baseline: None,
            },
        )
        .await?;
        let revision = if let Some(promotion) = selected.promotion_revision {
            result.validate_discount_from(&baseline)?;
            materialize(
                tx,
                Materialization {
                    tariff,
                    head,
                    standard: selected.baseline_revision,
                    promotion: Some(promotion),
                    currency: &selected.currency,
                    schedule: result,
                    baseline: Some(baseline_revision),
                },
            )
            .await?
        } else {
            baseline_revision
        };
        bind_revision(tx, attempt, revision).await?;
        let selected_at = selected
            .selected_at
            .parse::<i64>()
            .map_err(|_| StoreError::InvalidPrice)?;
        sqlx::query("INSERT INTO retail_text_operation_prices(operation_id,organization_id,project_id,revision_id,selected_at,promotion_scope) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(operation).bind(scope.organization_id).bind(scope.project_id).bind(revision)
            .bind(selected_at).bind(selected.promotion_scope).execute(&mut **tx).await?;
        Ok(true)
    }
}

async fn bind_revision(
    tx: &mut Transaction<'_, Postgres>,
    attempt: Uuid,
    revision: Uuid,
) -> Result<(), StoreError> {
    sqlx::query("INSERT INTO customer_attempt_tariffs(attempt_id,revision_id) VALUES($1,$2) ON CONFLICT(attempt_id) DO NOTHING")
        .bind(attempt).bind(revision).execute(&mut **tx).await?;
    let saved: Uuid =
        sqlx::query_scalar("SELECT revision_id FROM customer_attempt_tariffs WHERE attempt_id=$1")
            .bind(attempt)
            .fetch_one(&mut **tx)
            .await?;
    if saved != revision {
        return Err(StoreError::Conflict);
    }
    Ok(())
}

struct Materialization<'a> {
    tariff: Uuid,
    head: Uuid,
    standard: Uuid,
    promotion: Option<Uuid>,
    currency: &'a str,
    schedule: &'a TextRetailSchedule,
    baseline: Option<Uuid>,
}

async fn materialize(
    tx: &mut Transaction<'_, Postgres>,
    record: Materialization<'_>,
) -> Result<Uuid, StoreError> {
    let Materialization {
        tariff,
        head,
        standard,
        promotion,
        currency,
        schedule,
        baseline,
    } = record;
    let prior:Option<Uuid>=sqlx::query_scalar("SELECT revision_id FROM retail_text_materializations WHERE tariff_id=$1 AND standard_revision=$2 AND promotion_revision IS NOT DISTINCT FROM $3")
        .bind(tariff).bind(standard).bind(promotion).fetch_optional(&mut **tx).await?;
    if let Some(id) = prior {
        return Ok(id);
    }
    let rates = schedule.normalized_rates()?;
    let mut canonical = schedule.clone();
    canonical.canonicalize()?;
    let tiers =
        serde_json::to_value(canonical.context_tiers).map_err(|_| StoreError::InvalidPrice)?;
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO customer_tariff_revisions(id,tariff_id,currency,prompt_rate,completion_rate,cached_prompt_rate,minimum_charge_nanos,request_fee_nanos,reasoning_completion_rate,cache_write_prompt_rate,context_tiers,discount_baseline_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)")
        .bind(id).bind(tariff).bind(currency).bind(rates.ordinary.prompt).bind(rates.ordinary.completion)
        .bind(rates.cached_prompt).bind(rates.minimum_charge_nanos).bind(rates.request_fee_nanos)
        .bind(rates.reasoning_completion).bind(rates.cache_write_prompt).bind(tiers).bind(baseline)
        .execute(&mut **tx).await?;
    sqlx::query("INSERT INTO retail_text_materializations(revision_id,tariff_id,price_id,standard_revision,promotion_revision) VALUES($1,$2,$3,$4,$5)")
        .bind(id).bind(tariff).bind(head).bind(standard).bind(promotion).execute(&mut **tx).await?;
    Ok(id)
}
