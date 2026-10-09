//! Internal customer schedules. Callers authorize configuration separately;
//! registration is not Supplier qualification or permission to dispatch.
use crate::{MediaLiabilityBound, Store, StoreError};
use niu_metered_cost::{Dimensions, Discount, PricingContext, PricingSnapshot, Quantity, Tariff};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CustomerMediaRateCard {
    pub revision: String,
    pub vendor_id: Uuid,
    pub vendor_revision: i64,
    pub model_revision: i64,
    pub schema_revision: String,
    pub offer_revision: String,
    pub tariff: Tariff,
    pub discounts: Vec<Discount>,
    pub maximum_quantity: Quantity,
    pub liability_qualification_revision: String,
}

pub struct SelectedCustomerMediaRate {
    pub revision: String,
    pub vendor_id: Uuid,
    pub vendor_revision: i64,
    pub model_revision: i64,
    pub schema_revision: String,
    pub pricing: PricingSnapshot,
    pub liability: MediaLiabilityBound,
}

fn valid_revision(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.trim() == value
        && !value.chars().any(char::is_control)
}

impl CustomerMediaRateCard {
    fn pricing(&self, organization: Uuid, at: i64) -> Result<PricingSnapshot, StoreError> {
        niu_metered_cost::pin_pricing(
            std::slice::from_ref(&self.tariff),
            &self.discounts,
            &PricingContext {
                dimensions: &self.tariff.dimensions,
                offer: &self.offer_revision,
                customer: &organization.to_string(),
                at,
            },
        )
        .map_err(|_| StoreError::InvalidPrice)
    }

    fn validate(&self, organization: Uuid) -> Result<(), StoreError> {
        if [
            &self.revision,
            &self.schema_revision,
            &self.offer_revision,
            &self.liability_qualification_revision,
        ]
        .into_iter()
        .any(|v| !valid_revision(v))
            || self.vendor_revision < 1
            || self.model_revision < 1
            || self.maximum_quantity.numerator() == 0
            || self.tariff.decimal_places > 9
        {
            return Err(StoreError::InvalidPrice);
        }
        self.tariff
            .validate()
            .map_err(|_| StoreError::InvalidPrice)?;
        self.pricing(organization, self.tariff.effective_from)?;
        // Validate every configured rule, including currently ineligible rules.
        for rule in &self.discounts {
            rule.validate().map_err(|_| StoreError::InvalidPrice)?;
        }
        Ok(())
    }
}

impl Store {
    /// Customer video dispatch requires a real qualified offer binding; legacy
    /// routes without an offer cannot acquire an inferred commercial identity.
    pub async fn require_customer_media_offer(
        &self,
        scope: crate::TenantScope,
        attempt: Uuid,
        revision: &str,
        vendor: Uuid,
    ) -> Result<(), StoreError> {
        let matched: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM attempts a JOIN provider_attempt_offers b ON b.attempt_id=a.id JOIN provider_offers o ON o.id=b.offer_id AND o.provider_id=b.provider_id WHERE a.id=$1 AND a.organization_id=$2 AND a.project_id=$3 AND a.execution='not_sent' AND b.revision_id::text=$4 AND o.vendor_id=$5 AND o.model_alias=a.resource_id AND o.active AND o.current_revision=b.revision_id AND niu_offer_qualification_current(b.provider_id,b.offer_id,b.revision_id))")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(revision).bind(vendor)
            .fetch_one(&self.pool).await?;
        if !matched {
            return Err(StoreError::AccountUnavailable);
        }
        Ok(())
    }
    /// Installation configuration choices from currently qualified commercial
    /// media routes. No credentials, purchase amounts or customer charges.
    pub async fn customer_media_rate_models(
        &self,
        after: Option<&str>,
        limit: i64,
    ) -> Result<serde_json::Value, StoreError> {
        if !(1..=100).contains(&limit)
            || after.is_some_and(|value| {
                value.is_empty()
                    || value.len() > 256
                    || value.trim() != value
                    || value.chars().any(char::is_control)
            })
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut rows = sqlx::query("SELECT o.model_alias,o.current_revision,v.id AS vendor_id,v.name,v.revision AS vendor_revision,m.revision AS model_revision,m.upstream_model,m.capabilities->'video_schema' AS schema FROM provider_offers o JOIN provider_offer_revisions r ON r.id=o.current_revision AND r.offer_id=o.id AND r.rate_kind='media' JOIN vendors v ON v.id=o.vendor_id JOIN vendor_models m ON m.alias=o.model_alias AND m.vendor_id=v.id WHERE o.active AND v.enabled AND m.enabled AND niu_offer_qualification_current(o.provider_id,o.id,o.current_revision) AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id) AND jsonb_typeof(m.capabilities->'video_schema')='object' AND ($1::text IS NULL OR o.model_alias>$1) ORDER BY o.model_alias LIMIT $2")
            .bind(after).bind(limit + 1).fetch_all(&self.pool).await?;
        let more = rows.len() > limit as usize;
        rows.truncate(limit as usize);
        let next = more
            .then(|| rows.last().map(|row| row.get::<String, _>("model_alias")))
            .flatten();
        let mut data = Vec::new();
        for row in rows {
            let Ok(schema) = serde_json::from_value::<niu_media::VideoSchema>(row.get("schema"))
            else {
                continue;
            };
            let alias: String = row.get("model_alias");
            if schema.validate().is_err()
                || schema.model_alias != alias
                || schema.upstream_model != row.get::<String, _>("upstream_model")
            {
                continue;
            }
            let resolutions = match schema.controls.get("resolution") {
                Some(niu_media::Control::Choice { values, .. }) => values
                    .iter()
                    .filter(|value| {
                        schema.output.as_ref().is_none_or(|output| {
                            output
                                .specifications
                                .iter()
                                .any(|spec| &spec.resolution == *value)
                        })
                    })
                    .cloned()
                    .collect(),
                _ => Vec::new(),
            };
            data.push(serde_json::json!({
                "model_alias": alias,
                "vendor_id": row.get::<Uuid, _>("vendor_id"),
                "api_key_name": row.get::<String, _>("name"),
                "offer_revision": row.get::<Uuid, _>("current_revision"),
                "vendor_revision": row.get::<i64, _>("vendor_revision").to_string(),
                "model_revision": row.get::<i64, _>("model_revision").to_string(),
                "schema_revision": schema.revision,
                "channel": schema.channel,
                "resolutions": resolutions,
                "reference_video": schema.inputs.contains_key("video_url")
            }));
        }
        Ok(serde_json::json!({"data":data,"has_more":more,"next_after":next}))
    }

    /// Append a selling schedule for one customer. Exact retries are idempotent;
    /// changing a published revision is rejected, including after restart.
    pub async fn register_customer_media_rate(
        &self,
        organization: Uuid,
        card: &CustomerMediaRateCard,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        publish_rate(&mut tx, organization, card).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Replace one dimensional schedule atomically. Historical cards and job
    /// snapshots remain immutable; competing replacements cannot create overlap.
    pub async fn replace_customer_media_rate(
        &self,
        organization: Uuid,
        revision: &str,
        card: &CustomerMediaRateCard,
    ) -> Result<(), StoreError> {
        if !valid_revision(revision) || revision == card.revision {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        let original: Option<serde_json::Value> = sqlx::query_scalar(
            "SELECT document FROM customer_media_rate_cards WHERE organization_id=$1 AND revision=$2 FOR UPDATE",
        ).bind(organization).bind(revision).fetch_optional(&mut *tx).await?;
        let original: CustomerMediaRateCard =
            serde_json::from_value(original.ok_or(StoreError::Conflict)?)
                .map_err(|_| StoreError::InvalidPrice)?;
        if original.tariff.dimensions != card.tariff.dimensions
            || original.tariff.meter != card.tariff.meter
        {
            return Err(StoreError::InvalidPrice);
        }
        let overlap: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_media_rate_cards c WHERE c.organization_id=$1 AND c.model_alias=$2 AND c.channel=$3 AND c.resolution=$4 AND c.reference_video=$5 AND c.revision<>$6 AND c.revision<>$7 AND ($8::bigint IS NULL OR c.effective_from<$8) AND (c.effective_until IS NULL OR c.effective_until>$9) AND NOT EXISTS(SELECT 1 FROM customer_media_rate_retirements r WHERE r.organization_id=c.organization_id AND r.revision=c.revision AND r.effective_until<=$9))")
            .bind(organization).bind(&card.tariff.dimensions.model)
            .bind(&card.tariff.dimensions.channel).bind(&card.tariff.dimensions.resolution)
            .bind(card.tariff.dimensions.reference_video).bind(revision).bind(&card.revision)
            .bind(card.tariff.effective_until).bind(card.tariff.effective_from)
            .fetch_one(&mut *tx).await?;
        if overlap {
            return Err(StoreError::Conflict);
        }
        publish_rate(&mut tx, organization, card).await?;
        retire_rate(&mut tx, organization, revision, card.tariff.effective_from).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Append an immutable eligibility cutoff. Exact retries are idempotent;
    /// a different cutoff cannot mutate prior scheduling or pinned job prices.
    pub async fn retire_customer_media_rate(
        &self,
        organization: Uuid,
        revision: &str,
        effective_until: i64,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        retire_rate(&mut tx, organization, revision, effective_until).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Installation-only administration history. Exact numeric strings preserve
    /// prices and timestamps; this query never reads Supplier purchase terms.
    pub async fn customer_media_rates(
        &self,
        organization: Uuid,
        after: Option<&str>,
        limit: i64,
    ) -> Result<serde_json::Value, StoreError> {
        if !(1..=100).contains(&limit)
            || after.is_some_and(|v| {
                v.is_empty() || v.len() > 256 || v.trim() != v || v.chars().any(char::is_control)
            })
        {
            return Err(StoreError::InvalidPrice);
        }
        let mut rows:Vec<serde_json::Value>=sqlx::query_scalar("SELECT jsonb_build_object('card',c.document||jsonb_build_object('vendor_revision',c.document->>'vendor_revision','model_revision',c.document->>'model_revision','discounts',(SELECT COALESCE(jsonb_agg(rule.value||jsonb_build_object('effective_from',rule.value->>'effective_from','effective_until',rule.value->>'effective_until') ORDER BY rule.ordinality),'[]'::jsonb) FROM jsonb_array_elements(c.document->'discounts') WITH ORDINALITY AS rule(value,ordinality)),'tariff',c.document->'tariff'||jsonb_build_object('amount_units',c.document->'tariff'->>'amount_units','effective_from',c.document->'tariff'->>'effective_from','effective_until',c.document->'tariff'->>'effective_until')),'retirement_effective_until',r.effective_until::text,'created_at',c.created_at) FROM customer_media_rate_cards c LEFT JOIN customer_media_rate_retirements r ON r.organization_id=c.organization_id AND r.revision=c.revision WHERE c.organization_id=$1 AND ($2::text IS NULL OR c.revision>$2) ORDER BY c.revision LIMIT $3")
            .bind(organization).bind(after).bind(limit+1).fetch_all(&self.pool).await?;
        let more = rows.len() > limit as usize;
        rows.truncate(limit as usize);
        let next = if more {
            rows.last()
                .and_then(|r| r["card"]["revision"].as_str())
                .map(str::to_owned)
        } else {
            None
        };
        Ok(serde_json::json!({"data":rows,"has_more":more,"next_after":next}))
    }

    /// Resolve exactly one effective selling schedule with its original current
    /// credential/model/schema. No procurement or stale-route fallback.
    pub async fn select_customer_media_rate(
        &self,
        organization: Uuid,
        dimensions: &Dimensions,
        at: i64,
    ) -> Result<Option<SelectedCustomerMediaRate>, StoreError> {
        let rows: Vec<serde_json::Value> = sqlx::query_scalar("SELECT c.document FROM customer_media_rate_cards c WHERE c.organization_id=$1 AND c.model_alias=$2 AND c.channel=$3 AND c.resolution=$4 AND c.reference_video=$5 AND c.effective_from<=$6 AND (c.effective_until IS NULL OR c.effective_until>$6) AND NOT EXISTS(SELECT 1 FROM customer_media_rate_retirements r WHERE r.organization_id=c.organization_id AND r.revision=c.revision AND r.effective_until<=$6) ORDER BY c.revision LIMIT 2")
            .bind(organization).bind(&dimensions.model).bind(&dimensions.channel)
            .bind(&dimensions.resolution).bind(dimensions.reference_video).bind(at)
            .fetch_all(&self.pool).await?;
        if rows.len() > 1 {
            return Err(StoreError::InvalidPrice);
        }
        let Some(document) = rows.into_iter().next() else {
            return Ok(None);
        };
        let card: CustomerMediaRateCard =
            serde_json::from_value(document).map_err(|_| StoreError::InvalidPrice)?;
        card.validate(organization)?;
        let current: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM vendors v JOIN vendor_models m ON m.vendor_id=v.id WHERE v.id=$1 AND m.alias=$2 AND v.enabled AND m.enabled AND v.revision=$3 AND m.revision=$4 AND m.capabilities->'video_schema'->>'revision'=$5 AND m.capabilities->'video_schema'->>'channel'=$6 AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id=v.id))")
            .bind(card.vendor_id).bind(&dimensions.model).bind(card.vendor_revision)
            .bind(card.model_revision).bind(&card.schema_revision).bind(&dimensions.channel)
            .fetch_one(&self.pool).await?;
        if !current {
            return Err(StoreError::Conflict);
        }
        let pricing = card.pricing(organization, at)?;
        Ok(Some(SelectedCustomerMediaRate {
            revision: card.revision,
            vendor_id: card.vendor_id,
            vendor_revision: card.vendor_revision,
            model_revision: card.model_revision,
            schema_revision: card.schema_revision,
            pricing,
            liability: MediaLiabilityBound {
                meter: card.tariff.meter,
                maximum_quantity: card.maximum_quantity,
                qualification_revision: card.liability_qualification_revision,
            },
        }))
    }
}

async fn publish_rate(
    connection: &mut sqlx::PgConnection,
    organization: Uuid,
    card: &CustomerMediaRateCard,
) -> Result<(), StoreError> {
    card.validate(organization)?;
    let document = serde_json::to_value(card).map_err(|_| StoreError::InvalidPrice)?;
    if document.to_string().len() > 128 * 1024 {
        return Err(StoreError::InvalidPrice);
    }
    let current: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM vendors v JOIN vendor_models m ON m.vendor_id=v.id WHERE v.id=$1 AND m.alias=$2 AND v.enabled AND m.enabled AND v.revision=$3 AND m.revision=$4 AND m.capabilities->'video_schema'->>'revision'=$5 AND m.capabilities->'video_schema'->>'channel'=$6 AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id=v.id))")
            .bind(card.vendor_id).bind(&card.tariff.dimensions.model).bind(card.vendor_revision)
            .bind(card.model_revision).bind(&card.schema_revision).bind(&card.tariff.dimensions.channel)
            .fetch_one(&mut *connection).await?;
    if !current {
        return Err(StoreError::Conflict);
    }
    sqlx::query("INSERT INTO customer_media_rate_cards(organization_id,revision,vendor_id,model_alias,channel,resolution,reference_video,effective_from,effective_until,document) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(organization_id,revision) DO NOTHING")
            .bind(organization).bind(&card.revision).bind(card.vendor_id)
            .bind(&card.tariff.dimensions.model).bind(&card.tariff.dimensions.channel)
            .bind(&card.tariff.dimensions.resolution).bind(card.tariff.dimensions.reference_video)
            .bind(card.tariff.effective_from).bind(card.tariff.effective_until).bind(&document)
            .execute(&mut *connection).await?;
    let previous: serde_json::Value = sqlx::query_scalar(
        "SELECT document FROM customer_media_rate_cards WHERE organization_id=$1 AND revision=$2",
    )
    .bind(organization)
    .bind(&card.revision)
    .fetch_one(&mut *connection)
    .await?;
    if previous != document {
        return Err(StoreError::Conflict);
    }
    Ok(())
}

async fn retire_rate(
    connection: &mut sqlx::PgConnection,
    organization: Uuid,
    revision: &str,
    effective_until: i64,
) -> Result<(), StoreError> {
    if !valid_revision(revision) {
        return Err(StoreError::InvalidPrice);
    }
    let bounds: Option<(i64, Option<i64>)> = sqlx::query_as(
            "SELECT effective_from,effective_until FROM customer_media_rate_cards WHERE organization_id=$1 AND revision=$2 FOR UPDATE",
        ).bind(organization).bind(revision).fetch_optional(&mut *connection).await?;
    let Some((starts, ends)) = bounds else {
        return Err(StoreError::Conflict);
    };
    if effective_until < starts || ends.is_some_and(|end| effective_until > end) {
        return Err(StoreError::InvalidPrice);
    }
    sqlx::query("INSERT INTO customer_media_rate_retirements(organization_id,revision,effective_until) VALUES($1,$2,$3) ON CONFLICT(organization_id,revision) DO NOTHING")
            .bind(organization).bind(revision).bind(effective_until).execute(&mut *connection).await?;
    let saved: i64 = sqlx::query_scalar("SELECT effective_until FROM customer_media_rate_retirements WHERE organization_id=$1 AND revision=$2")
            .bind(organization).bind(revision).fetch_one(&mut *connection).await?;
    if saved != effective_until {
        return Err(StoreError::Conflict);
    }
    Ok(())
}
