//! Platform retail publication. Configuration writes do not grant sellable supply.
use crate::{OperatorAuditActor, RetailSchedule, Store, StoreError};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RetailStandardPublication {
    pub model_alias: String,
    pub currency: String,
    pub schedule: RetailSchedule,
    pub expected_version: String,
    pub idempotency_key: Uuid,
    pub reason: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RetailPromotionPublication {
    pub baseline_revision: Uuid,
    #[serde(deserialize_with = "required_optional_uuid")]
    pub customer_organization_id: Option<Uuid>,
    pub schedule: RetailSchedule,
    pub effective_from: String,
    pub effective_until: String,
    pub expected_version: String,
    pub idempotency_key: Uuid,
    pub reason: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RetailPromotionRetirement {
    pub effective_until: String,
    pub expected_version: String,
    pub idempotency_key: Uuid,
    pub reason: String,
}
pub(crate) fn required_optional_uuid<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Uuid>, D::Error> {
    Option::<Uuid>::deserialize(deserializer)
}
fn integer(value: &str, maximum: i64) -> Result<i64, StoreError> {
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err(StoreError::InvalidPrice);
    }
    value
        .parse::<i64>()
        .ok()
        .filter(|v| *v <= maximum)
        .ok_or(StoreError::InvalidPrice)
}
fn reason(value: &str) -> Result<(), StoreError> {
    if value.is_empty()
        || value != value.trim()
        || value.chars().count() > 500
        || value.chars().any(char::is_control)
    {
        return Err(StoreError::InvalidPrice);
    }
    Ok(())
}
async fn lock_key(tx: &mut Transaction<'_, Postgres>, key: Uuid) -> Result<(), StoreError> {
    // Global key serialization precedes identity locks. It avoids surfacing a
    // unique-key database error when two different heads reuse the same key.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,311))")
        .bind(key.to_string())
        .execute(&mut **tx)
        .await?;
    Ok(())
}
async fn retry(
    tx: &mut Transaction<'_, Postgres>,
    key: Uuid,
    intent: &Value,
) -> Result<Option<Value>, StoreError> {
    let prior: Option<(Uuid,Uuid,i64,Value)> = sqlx::query_as("SELECT id,head_id,version,intent FROM platform_retail_price_changes WHERE idempotency_key=$1")
        .bind(key).fetch_optional(&mut **tx).await?;
    match prior {
        Some((revision, head, version, saved)) if saved == *intent => Ok(Some(
            json!({"price_id":head,"revision":revision,"version":version.to_string()}),
        )),
        Some(_) => Err(StoreError::Conflict),
        None => Ok(None),
    }
}
struct Change<'a> {
    action: &'a str,
    key: Uuid,
    intent: Value,
    reason: &'a str,
    actor: OperatorAuditActor,
}
async fn change(
    tx: &mut Transaction<'_, Postgres>,
    head: Uuid,
    version: i64,
    record: Change<'_>,
) -> Result<Uuid, StoreError> {
    let Change {
        action,
        key,
        intent,
        reason,
        actor,
    } = record;
    let id = Uuid::new_v4();
    let (kind, operator) = actor.kind_and_id();
    sqlx::query("INSERT INTO platform_retail_price_changes(id,head_id,version,action,idempotency_key,intent,reason,actor_kind,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)")
        .bind(id).bind(head).bind(version).bind(action).bind(key).bind(intent).bind(reason).bind(kind).bind(operator).execute(&mut **tx).await?;
    Ok(id)
}
async fn lock_version(
    tx: &mut Transaction<'_, Postgres>,
    head: Uuid,
    expected: i64,
) -> Result<i64, StoreError> {
    let current: Option<i64> = sqlx::query_scalar(
        "SELECT version FROM platform_retail_price_heads WHERE id=$1 FOR NO KEY UPDATE",
    )
    .bind(head)
    .fetch_optional(&mut **tx)
    .await?;
    if current != Some(expected) {
        return Err(StoreError::Conflict);
    }
    expected.checked_add(1).ok_or(StoreError::Conflict)
}
impl Store {
    /// Platform-only company names for promotions; no financial account join.
    pub async fn retail_customer_targets(
        &self,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Value, StoreError> {
        let mut snapshot = self.begin_bounded_read_snapshot().await?;
        let (companies, next) =
            Self::platform_company_page_in_tx(&mut snapshot, after, limit).await?;
        snapshot.commit().await?;
        let data: Vec<Value> = companies
            .into_iter()
            .map(|company| json!({"organization_id":company.id,"organization_name":company.name,"created_at":company.created_at}))
            .collect();
        Ok(json!({"data":data,"next_after":next}))
    }
    /// Registered standard-price identities, including disabled configuration.
    /// This metadata read never establishes qualification or dispatch readiness.
    pub async fn registered_retail_models(
        &self,
        after: Option<&str>,
        limit: i64,
    ) -> Result<Value, StoreError> {
        if !(1..=100).contains(&limit) || after.is_some_and(|v| v.is_empty() || v.len() > 200) {
            return Err(StoreError::InvalidPrice);
        }
        let value: Value = sqlx::query_scalar(include_str!("registered_retail_models.sql"))
            .bind(after)
            .bind(limit)
            .fetch_one(&self.pool)
            .await?;
        if value["cursor_valid"] != true {
            return Err(StoreError::Conflict);
        }
        Ok(json!({"data":value["data"], "next_after":value["next_after"]}))
    }
    /// Caller must independently authenticate platform administration. New
    /// standards take effect at commit; finite promotion terms remain intact.
    pub async fn publish_retail_standard(
        &self,
        mut input: RetailStandardPublication,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        input.schedule.canonicalize()?;
        input.schedule.validate_identity(
            &input.model_alias,
            input.schedule.kind(),
            input.schedule.dimensions(),
        )?;
        if input.currency.len() != 3 || !input.currency.bytes().all(|b| b.is_ascii_uppercase()) {
            return Err(StoreError::InvalidPrice);
        }
        reason(&input.reason)?;
        let expected = integer(&input.expected_version, i64::MAX - 1)?;
        input.expected_version = expected.to_string();
        let intent = json!({"action":"standard_published","input":input});
        let mut tx = self.begin_bounded_recording().await?;
        lock_key(&mut tx, input.idempotency_key).await?;
        if let Some(result) = retry(&mut tx, input.idempotency_key, &intent).await? {
            return Ok(result);
        }
        let registered:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM vendor_models m WHERE m.alias=$1 AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=m.vendor_id) UNION ALL SELECT 1 FROM model_route_pools WHERE alias=$1)")
            .bind(&input.model_alias).fetch_one(&mut *tx).await?;
        if !registered {
            return Err(StoreError::Conflict);
        }
        let dimensions = input
            .schedule
            .dimensions()
            .map(|v| serde_json::to_value(v).map_err(|_| StoreError::InvalidPrice))
            .transpose()?
            .unwrap_or(json!({}));
        let meter = input.schedule.meter().unwrap_or("");
        sqlx::query("INSERT INTO platform_retail_price_heads(id,model_alias,currency,rate_kind,dimensions,meter) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(model_alias,currency,rate_kind,dimensions,meter) DO NOTHING")
            .bind(Uuid::new_v4()).bind(&input.model_alias).bind(&input.currency).bind(input.schedule.kind()).bind(&dimensions).bind(meter).execute(&mut *tx).await?;
        let head:Uuid=sqlx::query_scalar("SELECT id FROM platform_retail_price_heads WHERE model_alias=$1 AND currency=$2 AND rate_kind=$3 AND dimensions=$4 AND meter=$5")
            .bind(&input.model_alias).bind(&input.currency).bind(input.schedule.kind()).bind(dimensions).bind(meter).fetch_one(&mut *tx).await?;
        let next = lock_version(&mut tx, head, expected).await?;
        let revision = change(
            &mut tx,
            head,
            next,
            Change {
                action: "standard_published",
                key: input.idempotency_key,
                intent,
                reason: &input.reason,
                actor,
            },
        )
        .await?;
        sqlx::query(
            "INSERT INTO platform_retail_standard_revisions(id,head_id,schedule) VALUES($1,$2,$3)",
        )
        .bind(revision)
        .bind(head)
        .bind(json!(input.schedule))
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE platform_retail_price_heads SET version=$2,current_revision=$3 WHERE id=$1",
        )
        .bind(head)
        .bind(next)
        .bind(revision)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(json!({"price_id":head,"revision":revision,"version":next.to_string()}))
    }

    /// One finite explicit resulting-price rule. Customer scope wins over global
    /// at admission; this write never multiplies rules or rewrites snapshots.
    pub async fn publish_retail_promotion(
        &self,
        head: Uuid,
        mut input: RetailPromotionPublication,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        input.schedule.canonicalize()?;
        reason(&input.reason)?;
        let from = integer(&input.effective_from, 253402300799)?;
        let until = integer(&input.effective_until, 253402300799)?;
        let expected = integer(&input.expected_version, i64::MAX - 1)?;
        if until <= from {
            return Err(StoreError::InvalidPrice);
        }
        input.effective_from = from.to_string();
        input.effective_until = until.to_string();
        input.expected_version = expected.to_string();
        let intent = json!({"action":"promotion_published","price_id":head,"input":input});
        let mut tx = self.begin_bounded_recording().await?;
        lock_key(&mut tx, input.idempotency_key).await?;
        if let Some(result) = retry(&mut tx, input.idempotency_key, &intent).await? {
            return Ok(result);
        }
        let next = lock_version(&mut tx, head, expected).await?;
        let original: Option<Value> = sqlx::query_scalar(
            "SELECT schedule FROM platform_retail_standard_revisions WHERE id=$1 AND head_id=$2",
        )
        .bind(input.baseline_revision)
        .bind(head)
        .fetch_optional(&mut *tx)
        .await?;
        let original: RetailSchedule =
            serde_json::from_value(original.ok_or(StoreError::Conflict)?)
                .map_err(|_| StoreError::InvalidPrice)?;
        input.schedule.validate_discount_from(&original)?;
        if let Some(customer) = input.customer_organization_id {
            let exists: bool =
                sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM organizations WHERE id=$1)")
                    .bind(customer)
                    .fetch_one(&mut *tx)
                    .await?;
            if !exists {
                return Err(StoreError::Conflict);
            }
        }
        let overlaps:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM platform_retail_promotions p LEFT JOIN platform_retail_promotion_retirements r ON r.promotion_id=p.id WHERE p.head_id=$1 AND p.customer_organization_id IS NOT DISTINCT FROM $2 AND p.effective_from<LEAST(p.effective_until,COALESCE(r.effective_until,p.effective_until)) AND $3<LEAST(p.effective_until,COALESCE(r.effective_until,p.effective_until)) AND p.effective_from<$4)")
            .bind(head).bind(input.customer_organization_id).bind(from).bind(until).fetch_one(&mut *tx).await?;
        if overlaps {
            return Err(StoreError::Conflict);
        }
        let revision = change(
            &mut tx,
            head,
            next,
            Change {
                action: "promotion_published",
                key: input.idempotency_key,
                intent,
                reason: &input.reason,
                actor,
            },
        )
        .await?;
        sqlx::query("INSERT INTO platform_retail_promotions(id,head_id,baseline_revision,customer_organization_id,effective_from,effective_until,schedule) VALUES($1,$2,$3,$4,$5,$6,$7)")
            .bind(revision).bind(head).bind(input.baseline_revision).bind(input.customer_organization_id).bind(from).bind(until).bind(json!(input.schedule)).execute(&mut *tx).await?;
        sqlx::query("UPDATE platform_retail_price_heads SET version=$2 WHERE id=$1")
            .bind(head)
            .bind(next)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(json!({"price_id":head,"revision":revision,"version":next.to_string()}))
    }

    pub async fn retire_retail_promotion(
        &self,
        head: Uuid,
        promotion: Uuid,
        mut input: RetailPromotionRetirement,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        reason(&input.reason)?;
        let until = integer(&input.effective_until, 253402300799)?;
        let expected = integer(&input.expected_version, i64::MAX - 1)?;
        input.effective_until = until.to_string();
        input.expected_version = expected.to_string();
        let intent = json!({"action":"promotion_retired","price_id":head,"promotion_id":promotion,"input":input});
        let mut tx = self.begin_bounded_recording().await?;
        lock_key(&mut tx, input.idempotency_key).await?;
        if let Some(result) = retry(&mut tx, input.idempotency_key, &intent).await? {
            return Ok(result);
        }
        let next = lock_version(&mut tx, head, expected).await?;
        let allowed:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM platform_retail_promotions p WHERE id=$1 AND head_id=$2 AND effective_until>=$3 AND NOT EXISTS(SELECT 1 FROM platform_retail_promotion_retirements WHERE promotion_id=p.id))")
            .bind(promotion).bind(head).bind(until).fetch_one(&mut *tx).await?;
        if !allowed {
            return Err(StoreError::Conflict);
        }
        let revision = change(
            &mut tx,
            head,
            next,
            Change {
                action: "promotion_retired",
                key: input.idempotency_key,
                intent,
                reason: &input.reason,
                actor,
            },
        )
        .await?;
        sqlx::query("INSERT INTO platform_retail_promotion_retirements(id,head_id,promotion_id,effective_until) VALUES($1,$2,$3,$4)")
            .bind(revision).bind(head).bind(promotion).bind(until).execute(&mut *tx).await?;
        sqlx::query("UPDATE platform_retail_price_heads SET version=$2 WHERE id=$1")
            .bind(head)
            .bind(next)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(json!({"price_id":head,"revision":revision,"version":next.to_string()}))
    }
}
