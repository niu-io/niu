//! Explicit route-global qualified quantity maxima; never estimates or prices.
use crate::{OperatorAuditActor, Store, StoreError};
use niu_metered_cost::{Dimensions, Quantity};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MediaLiabilityIdentity {
    pub supplier_id: Uuid,
    pub offer_id: Uuid,
    pub offer_revision: Uuid,
    pub vendor_id: Uuid,
    pub vendor_revision: String,
    pub model_alias: String,
    pub model_revision: String,
    pub schema_revision: String,
    pub dimensions: Dimensions,
    pub meter: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MediaLiabilityPublication {
    pub identity: MediaLiabilityIdentity,
    pub maximum_quantity: Quantity,
    pub evidence_revision: String,
    pub evidence_sha256: String,
    pub effective_from: String,
    pub effective_until: String,
    pub expected_version: String,
    pub idempotency_key: Uuid,
    pub reason: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MediaLiabilityRevocation {
    pub effective_until: String,
    pub expected_version: String,
    pub idempotency_key: Uuid,
    pub reason: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SelectedMediaLiabilityQualification {
    pub revision: Uuid,
    pub identity: MediaLiabilityIdentity,
    pub maximum_quantity: Quantity,
    pub evidence_revision: String,
    pub selected_at: String,
}

fn text(value: &str, maximum: usize) -> Result<(), StoreError> {
    if value.is_empty()
        || value != value.trim()
        || value.chars().count() > maximum
        || value.chars().any(char::is_control)
    {
        return Err(StoreError::InvalidPrice);
    }
    Ok(())
}
fn integer(value: &str, maximum: i64) -> Result<i64, StoreError> {
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err(StoreError::InvalidPrice);
    }
    value
        .parse::<i64>()
        .ok()
        .filter(|n| *n <= maximum)
        .ok_or(StoreError::InvalidPrice)
}
impl MediaLiabilityIdentity {
    fn canonicalize(&mut self) -> Result<(), StoreError> {
        text(&self.model_alias, 200)?;
        text(&self.schema_revision, 256)?;
        text(&self.meter, 256)?;
        text(&self.dimensions.channel, 256)?;
        text(&self.dimensions.resolution, 256)?;
        if self.dimensions.model != self.model_alias || self.meter == "text_tokens" {
            return Err(StoreError::InvalidPrice);
        }
        let vendor = integer(&self.vendor_revision, i64::MAX)?;
        let model = integer(&self.model_revision, i64::MAX)?;
        if vendor == 0 || model == 0 {
            return Err(StoreError::InvalidPrice);
        }
        self.vendor_revision = vendor.to_string();
        self.model_revision = model.to_string();
        Ok(())
    }
}
const CURRENT_IDENTITY: &str = "SELECT EXISTS(SELECT 1 FROM provider_offers o \
    JOIN provider_offer_revisions r ON r.id=o.current_revision AND r.offer_id=o.id \
    JOIN vendors v ON v.id=o.vendor_id JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=o.model_alias \
    WHERE o.provider_id=($1->>'supplier_id')::uuid AND o.id=($1->>'offer_id')::uuid \
    AND r.id=($1->>'offer_revision')::uuid AND r.rate_kind='media' AND o.active AND v.enabled AND m.enabled \
    AND v.id=($1->>'vendor_id')::uuid AND v.revision=($1->>'vendor_revision')::bigint \
    AND m.alias=$1->>'model_alias' AND m.revision=($1->>'model_revision')::bigint \
    AND m.capabilities->'video_schema'->>'revision'=$1->>'schema_revision' \
    AND m.capabilities->'video_schema'->>'channel'=$1->'dimensions'->>'channel' \
    AND niu_offer_qualification_current(o.provider_id,o.id,r.id) \
    AND niu_media_offer_binding_current(o.provider_id,o.id,r.id) \
    AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id))";
const LOCK_CURRENT_IDENTITY: &str = "SELECT o.id FROM provider_offers o JOIN provider_businesses b ON b.id=o.provider_id \
    JOIN provider_offer_revisions r ON r.id=o.current_revision AND r.offer_id=o.id \
    JOIN vendors v ON v.id=o.vendor_id JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=o.model_alias \
    WHERE o.provider_id=($1->>'supplier_id')::uuid AND o.id=($1->>'offer_id')::uuid \
    AND r.id=($1->>'offer_revision')::uuid AND r.rate_kind='media' AND o.active AND v.enabled AND m.enabled \
    AND v.id=($1->>'vendor_id')::uuid AND v.revision=($1->>'vendor_revision')::bigint \
    AND m.alias=$1->>'model_alias' AND m.revision=($1->>'model_revision')::bigint \
    AND m.capabilities->'video_schema'->>'revision'=$1->>'schema_revision' \
    AND m.capabilities->'video_schema'->>'channel'=$1->'dimensions'->>'channel' \
    AND niu_offer_qualification_current(o.provider_id,o.id,r.id) \
    AND niu_media_offer_binding_current(o.provider_id,o.id,r.id) \
    AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id) AND b.deleted_at IS NULL FOR SHARE OF v,m";

async fn lock_offer(
    tx: &mut Transaction<'_, Postgres>,
    identity: &MediaLiabilityIdentity,
) -> Result<(), StoreError> {
    // The caller already owns registry writer advisory716554. Domain order
    // matches existing Supplier qualification publication, never account locks.
    sqlx::query("SELECT id FROM provider_businesses WHERE id=$1 FOR UPDATE")
        .bind(identity.supplier_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(StoreError::Conflict)?;
    sqlx::query("SELECT id FROM provider_offers WHERE provider_id=$1 AND id=$2 FOR UPDATE")
        .bind(identity.supplier_id)
        .bind(identity.offer_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(StoreError::Conflict)?;
    Ok(())
}
async fn retry(
    tx: &mut Transaction<'_, Postgres>,
    key: Uuid,
    intent: &Value,
) -> Result<Option<Value>, StoreError> {
    let prior:Option<(Uuid,Uuid,i64,Value)>=sqlx::query_as("SELECT id,head_id,version,intent FROM media_liability_qualification_changes WHERE idempotency_key=$1")
        .bind(key).fetch_optional(&mut **tx).await?;
    match prior {
        Some((revision, head, version, saved)) if saved == *intent => Ok(Some(
            json!({"qualification_id":head,"revision":revision,"version":version.to_string()}),
        )),
        Some(_) => Err(StoreError::Conflict),
        None => Ok(None),
    }
}
struct Change<'a> {
    head: Uuid,
    version: i64,
    action: &'a str,
    key: Uuid,
    intent: Value,
    reason: &'a str,
    actor: OperatorAuditActor,
}
async fn change(
    tx: &mut Transaction<'_, Postgres>,
    record: Change<'_>,
) -> Result<Uuid, StoreError> {
    let id = Uuid::new_v4();
    let (kind, operator) = record.actor.kind_and_id();
    sqlx::query("INSERT INTO media_liability_qualification_changes(id,head_id,version,action,idempotency_key,intent,reason,actor_kind,actor_operator_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)")
        .bind(id).bind(record.head).bind(record.version).bind(record.action).bind(record.key)
        .bind(record.intent).bind(record.reason).bind(kind).bind(operator).execute(&mut **tx).await?;
    Ok(id)
}
async fn version(
    tx: &mut Transaction<'_, Postgres>,
    head: Uuid,
    expected: i64,
) -> Result<i64, StoreError> {
    let saved: i64 = sqlx::query_scalar(
        "SELECT version FROM media_liability_qualification_heads WHERE id=$1 FOR NO KEY UPDATE",
    )
    .bind(head)
    .fetch_one(&mut **tx)
    .await?;
    if saved != expected {
        return Err(StoreError::Conflict);
    }
    expected.checked_add(1).ok_or(StoreError::InvalidPrice)
}

impl Store {
    /// Platform administrators explicitly certify a maximum billed quantity.
    /// Caller authorizes financial/supply administration and authenticated actor.
    pub async fn publish_media_liability_qualification(
        &self,
        input: &MediaLiabilityPublication,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        let mut input = input.clone();
        input.identity.canonicalize()?;
        text(&input.reason, 500)?;
        text(&input.evidence_revision, 256)?;
        if input.maximum_quantity.numerator() == 0
            || input.evidence_sha256.len() != 64
            || !input
                .evidence_sha256
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(StoreError::InvalidPrice);
        }
        let from = integer(&input.effective_from, 253402300799)?;
        let until = integer(&input.effective_until, 253402300799)?;
        let expected = integer(&input.expected_version, i64::MAX)?;
        if until <= from {
            return Err(StoreError::InvalidPrice);
        }
        input.effective_from = from.to_string();
        input.effective_until = until.to_string();
        input.expected_version = expected.to_string();
        let identity =
            serde_json::to_value(&input.identity).map_err(|_| StoreError::InvalidPrice)?;
        let intent = json!({"action":"published","input":input});
        let mut tx = self.begin_route_write().await?;
        if let Some(saved) = retry(&mut tx, input.idempotency_key, &intent).await? {
            return Ok(saved);
        }
        lock_offer(&mut tx, &input.identity).await?;
        let current: bool = sqlx::query_scalar(CURRENT_IDENTITY)
            .bind(&identity)
            .fetch_one(&mut *tx)
            .await?;
        let now: i64 =
            sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp()))::bigint")
                .fetch_one(&mut *tx)
                .await?;
        if !current || until <= now {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO media_liability_qualification_heads(id,supplier_id,offer_id,offer_revision,identity) VALUES($1,$2,$3,$4,$5) ON CONFLICT(identity) DO NOTHING")
            .bind(Uuid::new_v4()).bind(input.identity.supplier_id).bind(input.identity.offer_id)
            .bind(input.identity.offer_revision).bind(&identity).execute(&mut *tx).await?;
        let head: Uuid = sqlx::query_scalar(
            "SELECT id FROM media_liability_qualification_heads WHERE identity=$1",
        )
        .bind(&identity)
        .fetch_one(&mut *tx)
        .await?;
        let next = version(&mut tx, head, expected).await?;
        let overlap:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM media_liability_qualifications q LEFT JOIN media_liability_qualification_revocations r ON r.qualification_id=q.id WHERE q.head_id=$1 AND q.effective_from<LEAST(q.effective_until,COALESCE(r.effective_until,q.effective_until)) AND $2<LEAST(q.effective_until,COALESCE(r.effective_until,q.effective_until)) AND q.effective_from<$3)")
            .bind(head).bind(from).bind(until).fetch_one(&mut *tx).await?;
        if overlap {
            return Err(StoreError::Conflict);
        }
        let id = change(
            &mut tx,
            Change {
                head,
                version: next,
                action: "published",
                key: input.idempotency_key,
                intent,
                reason: &input.reason,
                actor,
            },
        )
        .await?;
        let quantity =
            serde_json::to_value(input.maximum_quantity).map_err(|_| StoreError::InvalidPrice)?;
        sqlx::query("INSERT INTO media_liability_qualifications(id,head_id,maximum_quantity,evidence_revision,evidence_sha256,effective_from,effective_until) VALUES($1,$2,$3,$4,$5,$6,$7)")
            .bind(id).bind(head).bind(quantity).bind(&input.evidence_revision).bind(&input.evidence_sha256)
            .bind(from).bind(until).execute(&mut *tx).await?;
        sqlx::query("UPDATE media_liability_qualification_heads SET version=$2 WHERE id=$1")
            .bind(head)
            .bind(next)
            .execute(&mut *tx)
            .await?;
        self.commit_route_write(tx).await?;
        Ok(json!({"qualification_id":head,"revision":id,"version":next.to_string()}))
    }

    /// Shorten finite validity without touching historical attempt bindings.
    pub async fn revoke_media_liability_qualification(
        &self,
        supplier: Uuid,
        offer: Uuid,
        qualification: Uuid,
        input: &MediaLiabilityRevocation,
        actor: OperatorAuditActor,
    ) -> Result<Value, StoreError> {
        text(&input.reason, 500)?;
        let until = integer(&input.effective_until, 253402300799)?;
        let expected = integer(&input.expected_version, i64::MAX)?;
        let intent = json!({"action":"revoked","supplier":supplier,"offer":offer,"qualification":qualification,
            "effective_until":until.to_string(),"expected_version":expected.to_string(),"reason":input.reason});
        let mut tx = self.begin_route_write().await?;
        if let Some(saved) = retry(&mut tx, input.idempotency_key, &intent).await? {
            return Ok(saved);
        }
        let row:Option<(Uuid,Value,i64)>=sqlx::query_as("SELECT h.id,h.identity,q.effective_until FROM media_liability_qualification_heads h JOIN media_liability_qualifications q ON q.head_id=h.id WHERE q.id=$1 AND h.supplier_id=$2 AND h.offer_id=$3")
            .bind(qualification).bind(supplier).bind(offer).fetch_optional(&mut *tx).await?;
        let (head, identity, original_until) = row.ok_or(StoreError::Conflict)?;
        if until > original_until {
            return Err(StoreError::InvalidPrice);
        }
        let identity: MediaLiabilityIdentity =
            serde_json::from_value(identity).map_err(|_| StoreError::InvalidPrice)?;
        lock_offer(&mut tx, &identity).await?;
        let next = version(&mut tx, head, expected).await?;
        let revoked:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM media_liability_qualification_revocations WHERE qualification_id=$1)")
            .bind(qualification).fetch_one(&mut *tx).await?;
        if revoked {
            return Err(StoreError::Conflict);
        }
        let id = change(
            &mut tx,
            Change {
                head,
                version: next,
                action: "revoked",
                key: input.idempotency_key,
                intent,
                reason: &input.reason,
                actor,
            },
        )
        .await?;
        sqlx::query("INSERT INTO media_liability_qualification_revocations(id,head_id,qualification_id,effective_until) VALUES($1,$2,$3,$4)")
            .bind(id).bind(head).bind(qualification).bind(until).execute(&mut *tx).await?;
        sqlx::query("UPDATE media_liability_qualification_heads SET version=$2 WHERE id=$1")
            .bind(head)
            .bind(next)
            .execute(&mut *tx)
            .await?;
        self.commit_route_write(tx).await?;
        Ok(json!({"qualification_id":head,"revision":id,"version":next.to_string()}))
    }

    /// Configuration history for administrators; no rates, currency or activity.
    pub async fn list_media_liability_qualifications(
        &self,
        supplier: Uuid,
        offer: Uuid,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Value, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidPrice);
        }
        let(valid,mut rows):(bool,Vec<Value>)=sqlx::query_as("SELECT (EXISTS(SELECT 1 FROM provider_offers WHERE provider_id=$1 AND id=$2) AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM media_liability_qualifications q JOIN media_liability_qualification_heads h ON h.id=q.head_id WHERE q.id=$3 AND h.supplier_id=$1 AND h.offer_id=$2))),ARRAY(SELECT jsonb_build_object('qualification_id',h.id,'revision',q.id,'version',c.version::text,'current_version',h.version::text,'identity',h.identity,'maximum_quantity',q.maximum_quantity,'evidence_revision',q.evidence_revision,'evidence_sha256',q.evidence_sha256,'effective_from',q.effective_from::text,'effective_until',q.effective_until::text,'revocation_effective_until',r.effective_until::text,'revocation_revision',r.id,'revocation_reason',rc.reason,'revocation_actor_kind',rc.actor_kind,'revocation_actor_operator_id',rc.actor_operator_id,'revocation_created_at',rc.created_at,'reason',c.reason,'actor_kind',c.actor_kind,'actor_operator_id',c.actor_operator_id,'created_at',c.created_at) FROM media_liability_qualifications q JOIN media_liability_qualification_heads h ON h.id=q.head_id JOIN media_liability_qualification_changes c ON c.id=q.id LEFT JOIN media_liability_qualification_revocations r ON r.qualification_id=q.id LEFT JOIN media_liability_qualification_changes rc ON rc.id=r.id WHERE h.supplier_id=$1 AND h.offer_id=$2 AND ($3::uuid IS NULL OR q.id>$3) ORDER BY q.id LIMIT $4)")
            .bind(supplier).bind(offer).bind(after).bind(limit+1).fetch_one(&self.pool).await?;
        if !valid {
            return Err(StoreError::Conflict);
        }
        let more = rows.len() > limit as usize;
        rows.truncate(limit as usize);
        let next = if more {
            rows.last().and_then(|v| v.get("revision")).cloned()
        } else {
            None
        };
        Ok(json!({"data":rows,"next_after":next}))
    }

    /// Caller-owned admission transaction; no external calls. Acquire before
    /// account/attempt locks, never the registry writer advisory in admission.
    pub async fn select_media_liability_qualification_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        identity: &MediaLiabilityIdentity,
    ) -> Result<Option<SelectedMediaLiabilityQualification>, StoreError> {
        let mut identity = identity.clone();
        identity.canonicalize()?;
        let encoded = serde_json::to_value(&identity).map_err(|_| StoreError::InvalidPrice)?;
        // Stable current supply locks precede the liability identity lock,
        // matching Supplier/offer publication rather than creating head->route inversion.
        sqlx::query(
            "SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR SHARE",
        )
        .bind(identity.supplier_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        sqlx::query("SELECT id FROM provider_offers WHERE provider_id=$1 AND id=$2 FOR SHARE")
            .bind(identity.supplier_id)
            .bind(identity.offer_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query_scalar::<_, Uuid>(LOCK_CURRENT_IDENTITY)
            .bind(&encoded)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let head: Option<Uuid> = sqlx::query_scalar(
            "SELECT id FROM media_liability_qualification_heads WHERE identity=$1 FOR SHARE",
        )
        .bind(&encoded)
        .fetch_optional(&mut **tx)
        .await?;
        let Some(head) = head else {
            return Ok(None);
        };
        let at: i64 =
            sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp()))::bigint")
                .fetch_one(&mut **tx)
                .await?;
        let rows:Vec<(Uuid,Value,String)>=sqlx::query_as("SELECT q.id,q.maximum_quantity,q.evidence_revision FROM media_liability_qualifications q LEFT JOIN media_liability_qualification_revocations r ON r.qualification_id=q.id WHERE q.head_id=$1 AND q.effective_from<=$2 AND LEAST(q.effective_until,COALESCE(r.effective_until,q.effective_until))>$2 ORDER BY q.id LIMIT 2")
            .bind(head).bind(at).fetch_all(&mut **tx).await?;
        if rows.len() > 1 {
            return Err(StoreError::Conflict);
        }
        let Some((revision, maximum_quantity, evidence_revision)) = rows.into_iter().next() else {
            return Ok(None);
        };
        let maximum_quantity: Quantity =
            serde_json::from_value(maximum_quantity).map_err(|_| StoreError::InvalidPrice)?;
        Ok(Some(SelectedMediaLiabilityQualification {
            revision,
            identity,
            maximum_quantity,
            evidence_revision,
            selected_at: at.to_string(),
        }))
    }
}
