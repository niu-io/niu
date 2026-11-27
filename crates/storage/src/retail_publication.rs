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
    #[serde(default)]
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
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CustomerPricingItemInput {
    pub price_id: Uuid,
    #[serde(default)]
    pub schedule: Option<RetailSchedule>,
    #[serde(default)]
    pub valid_seconds: Option<i64>,
    #[serde(default)]
    pub reason: Option<String>,
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
        crate::commit_tx(snapshot).await?;
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
        let data: Vec<Value> = value["data"].as_array().ok_or(StoreError::InvalidPrice)?
            .iter().map(|row| {
                let media = serde_json::from_value::<niu_media::VideoSchema>(row["media_schema"].clone()).ok()
                    .filter(|schema| schema.validate().is_ok() && row["model_alias"] == schema.model_alias && row["upstream_model"] == schema.upstream_model)
                    .and_then(|schema| schema.output.as_ref().map(|output| {
                        let resolutions: std::collections::BTreeSet<_> = output.specifications.iter().map(|spec| spec.resolution.clone()).collect();
                        json!({"channel":schema.channel,"resolutions":resolutions,"reference_video":schema.inputs.contains_key("video_url"),"meter":output.estimator.meter()})
                    }));
                // Return decision-relevant choices, never raw schemas or upstream identities.
                let text = row["text_candidates"].as_array().is_some_and(|candidates| candidates.iter().any(|candidate| {
                    if candidate["video"] == true { return false; }
                    if let Some(outputs) = candidate["outputs"].as_array().filter(|outputs| !outputs.is_empty()) {
                        return outputs.iter().any(|output| output == "text");
                    }
                    ![&row["model_alias"], &candidate["alias"], &candidate["upstream"]].into_iter()
                        .filter_map(Value::as_str).any(niu_media::has_non_chat_modality_token)
                }));
                json!({"model_alias":row["model_alias"],"media":media,"text":text})
            }).collect();
        Ok(json!({"data":data, "next_after":value["next_after"]}))
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
        if !input.reason.is_empty() {
            reason(&input.reason)?;
        }
        let expected = integer(&input.expected_version, i64::MAX - 1)?;
        input.expected_version = expected.to_string();
        let intent = json!({"action":"standard_published","input":input});
        let mut tx = self.begin_bounded_recording().await?;
        lock_key(&mut tx, input.idempotency_key).await?;
        if let Some(result) = retry(&mut tx, input.idempotency_key, &intent).await? {
            crate::commit_tx(tx).await?;
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
        crate::commit_tx(tx).await?;
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
            crate::commit_tx(tx).await?;
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
        crate::commit_tx(tx).await?;
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
            crate::commit_tx(tx).await?;
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
        crate::commit_tx(tx).await?;
        Ok(json!({"price_id":head,"revision":revision,"version":next.to_string()}))
    }

    /// Single-snapshot read of all platform standard prices paired with one customer's
    /// active/scheduled customer-scoped discount (eliminating per-model N+1 lookups).
    pub async fn platform_customer_pricing(
        &self,
        customer: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        let mut snapshot = self.begin_bounded_read_snapshot().await?;
        let org_name: Option<String> =
            sqlx::query_scalar("SELECT name FROM organizations WHERE id=$1")
                .bind(customer)
                .fetch_optional(&mut *snapshot)
                .await?;
        let Some(organization_name) = org_name else {
            crate::commit_tx(snapshot).await?;
            return Ok(None);
        };
        let as_of: i64 =
            sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp()))::bigint")
                .fetch_one(&mut *snapshot)
                .await?;
        let items: Vec<Value> = sqlx::query_scalar(
            "SELECT jsonb_build_object(
                'price_id', h.id,
                'model_alias', h.model_alias,
                'currency', h.currency,
                'version', h.version::text,
                'revision', s.id,
                'published_at', sc.created_at,
                'standard_schedule', s.schedule,
                'active_promotion', promo.doc
            )
            FROM platform_retail_price_heads h
            JOIN platform_retail_standard_revisions s ON s.id = h.current_revision
            JOIN platform_retail_price_changes sc ON sc.id = s.id
            LEFT JOIN LATERAL (
                SELECT jsonb_build_object(
                    'revision', p.id,
                    'version', pc.version::text,
                    'created_at', pc.created_at,
                    'reason', pc.reason,
                    'baseline_revision', p.baseline_revision,
                    'schedule', p.schedule,
                    'effective_from', p.effective_from::text,
                    'effective_until', p.effective_until::text,
                    'eligibility_until', LEAST(p.effective_until, COALESCE(r.effective_until, p.effective_until))::text,
                    'state', CASE WHEN $2 < p.effective_from THEN 'scheduled' ELSE 'within_period' END
                ) AS doc
                FROM platform_retail_promotions p
                JOIN platform_retail_price_changes pc ON pc.id = p.id
                LEFT JOIN platform_retail_promotion_retirements r ON r.promotion_id = p.id
                WHERE p.head_id = h.id
                  AND p.customer_organization_id = $1
                  AND r.promotion_id IS NULL
                  AND p.effective_from < p.effective_until
                  AND $2 < p.effective_until
                ORDER BY (CASE WHEN $2 >= p.effective_from THEN 0 ELSE 1 END), pc.version DESC
                LIMIT 1
            ) promo ON TRUE
            WHERE h.current_revision IS NOT NULL
            ORDER BY h.model_alias ASC, h.currency ASC, h.rate_kind ASC, h.id ASC",
        )
        .bind(customer)
        .bind(as_of)
        .fetch_all(&mut *snapshot)
        .await?;
        crate::commit_tx(snapshot).await?;
        Ok(Some(json!({
            "organization_id": customer,
            "organization_name": organization_name,
            "as_of": as_of.to_string(),
            "items": items,
        })))
    }

    /// Atomically set or reset customer-specific discounts for one or more standard prices
    /// in a single transaction. Existing active/scheduled customer rules on each targeted
    /// model are cleanly retired before publishing the replacement rule.
    pub async fn set_platform_customer_pricing(
        &self,
        customer: Uuid,
        mut items: Vec<CustomerPricingItemInput>,
        actor: OperatorAuditActor,
    ) -> Result<Option<Value>, StoreError> {
        if items.is_empty() || items.len() > 200 {
            return Err(StoreError::InvalidPrice);
        }
        items.sort_by_key(|item| item.price_id);
        for pair in items.windows(2) {
            if pair[0].price_id == pair[1].price_id {
                return Err(StoreError::InvalidPrice);
            }
        }
        let mut tx = self.begin_bounded_recording().await?;
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM organizations WHERE id=$1)")
                .bind(customer)
                .fetch_one(&mut *tx)
                .await?;
        if !exists {
            crate::commit_tx(tx).await?;
            return Ok(None);
        }
        let now: i64 =
            sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp()))::bigint")
                .fetch_one(&mut *tx)
                .await?;

        let mut updated = Vec::with_capacity(items.len());
        for item in items {
            let head_row: Option<(i64, Option<Uuid>)> = sqlx::query_as(
                "SELECT version, current_revision FROM platform_retail_price_heads WHERE id=$1 FOR NO KEY UPDATE",
            )
            .bind(item.price_id)
            .fetch_optional(&mut *tx)
            .await?;
            let Some((mut version, Some(current_revision))) = head_row else {
                crate::commit_tx(tx).await?;
                return Ok(None);
            };
            let standard_value: Value = sqlx::query_scalar(
                "SELECT schedule FROM platform_retail_standard_revisions WHERE id=$1",
            )
            .bind(current_revision)
            .fetch_one(&mut *tx)
            .await?;
            let standard: RetailSchedule =
                serde_json::from_value(standard_value).map_err(|_| StoreError::InvalidPrice)?;

            let is_reset = item.schedule.is_none();
            let replacement_schedule: Option<RetailSchedule> =
                if let Some(mut explicit) = item.schedule {
                    explicit.canonicalize()?;
                    explicit.validate_discount_from(&standard)?;
                    Some(explicit)
                } else {
                    None
                };

            let valid_seconds = item.valid_seconds.unwrap_or(5 * 365 * 86400);
            if !(60..=3_153_600_000).contains(&valid_seconds) {
                return Err(StoreError::InvalidPrice);
            }
            let until = now
                .checked_add(valid_seconds)
                .filter(|v| *v <= 253_402_300_799)
                .ok_or(StoreError::InvalidPrice)?;

            let default_reason = if is_reset {
                "Reset to platform standard price".to_owned()
            } else {
                "Custom customer price".to_owned()
            };
            let note = item
                .reason
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or(&default_reason)
                .to_owned();
            reason(&note)?;

            let active_promos: Vec<(Uuid, i64)> = sqlx::query_as(
                "SELECT p.id, p.effective_until
                 FROM platform_retail_promotions p
                 LEFT JOIN platform_retail_promotion_retirements r ON r.promotion_id = p.id
                 WHERE p.head_id = $1
                   AND p.customer_organization_id = $2
                   AND r.promotion_id IS NULL
                   AND p.effective_until >= $3
                 ORDER BY p.id ASC",
            )
            .bind(item.price_id)
            .bind(customer)
            .bind(now)
            .fetch_all(&mut *tx)
            .await?;

            for (promo_id, promo_until) in active_promos {
                let cutoff = now.min(promo_until);
                version = version.checked_add(1).ok_or(StoreError::Conflict)?;
                let retire_reason = if is_reset {
                    note.clone()
                } else {
                    let prefix = format!("Replaced: {note}");
                    if prefix.chars().count() <= 500 {
                        prefix
                    } else {
                        note.clone()
                    }
                };
                let key = Uuid::new_v4();
                let intent = json!({
                    "action": "promotion_retired",
                    "price_id": item.price_id,
                    "promotion_id": promo_id,
                    "input": {
                        "effective_until": cutoff.to_string(),
                        "expected_version": (version - 1).to_string(),
                        "idempotency_key": key,
                        "reason": retire_reason,
                    }
                });
                let rev = change(
                    &mut tx,
                    item.price_id,
                    version,
                    Change {
                        action: "promotion_retired",
                        key,
                        intent,
                        reason: &retire_reason,
                        actor,
                    },
                )
                .await?;
                sqlx::query(
                    "INSERT INTO platform_retail_promotion_retirements(id,head_id,promotion_id,effective_until) VALUES($1,$2,$3,$4)",
                )
                .bind(rev)
                .bind(item.price_id)
                .bind(promo_id)
                .bind(cutoff)
                .execute(&mut *tx)
                .await?;
                sqlx::query("UPDATE platform_retail_price_heads SET version=$2 WHERE id=$1")
                    .bind(item.price_id)
                    .bind(version)
                    .execute(&mut *tx)
                    .await?;
            }

            let mut active_revision: Option<Uuid> = None;
            if let Some(schedule) = replacement_schedule {
                version = version.checked_add(1).ok_or(StoreError::Conflict)?;
                let key = Uuid::new_v4();
                let intent = json!({
                    "action": "promotion_published",
                    "price_id": item.price_id,
                    "input": {
                        "baseline_revision": current_revision,
                        "customer_organization_id": customer,
                        "schedule": schedule,
                        "effective_from": now.to_string(),
                        "effective_until": until.to_string(),
                        "expected_version": (version - 1).to_string(),
                        "idempotency_key": key,
                        "reason": note,
                    }
                });
                let rev = change(
                    &mut tx,
                    item.price_id,
                    version,
                    Change {
                        action: "promotion_published",
                        key,
                        intent,
                        reason: &note,
                        actor,
                    },
                )
                .await?;
                sqlx::query(
                    "INSERT INTO platform_retail_promotions(id,head_id,baseline_revision,customer_organization_id,effective_from,effective_until,schedule) VALUES($1,$2,$3,$4,$5,$6,$7)",
                )
                .bind(rev)
                .bind(item.price_id)
                .bind(current_revision)
                .bind(customer)
                .bind(now)
                .bind(until)
                .bind(json!(schedule))
                .execute(&mut *tx)
                .await?;
                sqlx::query("UPDATE platform_retail_price_heads SET version=$2 WHERE id=$1")
                    .bind(item.price_id)
                    .bind(version)
                    .execute(&mut *tx)
                    .await?;
                active_revision = Some(rev);
            }
            updated.push(json!({
                "price_id": item.price_id,
                "version": version.to_string(),
                "active_revision": active_revision,
            }));
        }

        crate::commit_tx(tx).await?;
        Ok(Some(json!({
            "organization_id": customer,
            "updated": updated,
        })))
    }

    /// Reset one model's customer-specific discount back to platform standard pricing.
    pub async fn reset_platform_customer_model_pricing(
        &self,
        customer: Uuid,
        price_id: Uuid,
        actor: OperatorAuditActor,
    ) -> Result<Option<Value>, StoreError> {
        self.set_platform_customer_pricing(
            customer,
            vec![CustomerPricingItemInput {
                price_id,
                schedule: None,
                valid_seconds: None,
                reason: Some("Reset to platform standard price".to_owned()),
            }],
            actor,
        )
        .await
    }
}
