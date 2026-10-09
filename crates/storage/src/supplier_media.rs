//! Confidential agreed purchase terms. Never serialize these in customer APIs.
use crate::{Store, StoreError, TenantScope};
use niu_metered_cost::{
    Dimensions, Discount, PricingContext, PricingSnapshot, Provenance, Quantity, Tariff, Usage,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SupplierMediaRateCard {
    pub revision: String,
    pub offer_revision: Uuid,
    pub vendor_revision: i64,
    pub model_revision: i64,
    pub schema_revision: String,
    pub tariff: Tariff,
    pub discounts: Vec<Discount>,
}
impl SupplierMediaRateCard {
    fn pricing(&self, supplier: Uuid, at: i64) -> Result<PricingSnapshot, StoreError> {
        niu_metered_cost::pin_pricing(
            std::slice::from_ref(&self.tariff),
            &self.discounts,
            &PricingContext {
                dimensions: &self.tariff.dimensions,
                offer: &self.offer_revision.to_string(),
                customer: &supplier.to_string(),
                at,
            },
        )
        .map_err(|_| StoreError::InvalidPrice)
    }
    fn validate(&self, supplier: Uuid) -> Result<(), StoreError> {
        for value in [&self.revision, &self.schema_revision] {
            if value.is_empty()
                || value.len() > 256
                || value.trim() != value
                || value.chars().any(char::is_control)
            {
                return Err(StoreError::InvalidPrice);
            }
        }
        if self.vendor_revision < 1
            || self.model_revision < 1
            || self.tariff.decimal_places > 9
            || self.tariff.meter == "text_tokens"
            || self.tariff.meter.len() > 100
        {
            return Err(StoreError::InvalidPrice);
        }
        self.tariff
            .validate()
            .map_err(|_| StoreError::InvalidPrice)?;
        for discount in &self.discounts {
            discount.validate().map_err(|_| StoreError::InvalidPrice)?;
        }
        self.pricing(supplier, self.tariff.effective_from)?;
        Ok(())
    }
}
impl Store {
    /// Installation configuration choices; never expose credentials or infer prices.
    pub async fn supplier_media_rate_models(
        &self,
        supplier: Uuid,
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
        let mut rows = sqlx::query("SELECT o.model_alias,o.current_revision,v.name,v.revision AS vendor_revision,m.revision AS model_revision,m.upstream_model,m.capabilities->'video_schema' AS schema FROM provider_offers o JOIN vendors v ON v.id=o.vendor_id JOIN vendor_models m ON m.alias=o.model_alias AND m.vendor_id=v.id WHERE o.provider_id=$1 AND o.active AND v.enabled AND m.enabled AND niu_offer_qualification_current(o.provider_id,o.id,o.current_revision) AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id) AND jsonb_typeof(m.capabilities->'video_schema')='object' AND ($2::text IS NULL OR o.model_alias>$2) ORDER BY o.model_alias LIMIT $3")
            .bind(supplier).bind(after).bind(limit + 1).fetch_all(&self.pool).await?;
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

    pub async fn register_supplier_media_rate(
        &self,
        supplier: Uuid,
        card: &SupplierMediaRateCard,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        publish_rate(&mut tx, supplier, card).await?;
        tx.commit().await?;
        Ok(())
    }
    /// Publish and retire in one commit, never leaving a partially saved transition.
    pub async fn replace_supplier_media_rate(
        &self,
        supplier: Uuid,
        previous: &str,
        card: &SupplierMediaRateCard,
    ) -> Result<(), StoreError> {
        if previous == card.revision {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        let original: Option<serde_json::Value> = sqlx::query_scalar(
            "SELECT document FROM supplier_media_rate_cards WHERE provider_id=$1 AND revision=$2 FOR UPDATE",
        ).bind(supplier).bind(previous).fetch_optional(&mut *tx).await?;
        let original: SupplierMediaRateCard =
            serde_json::from_value(original.ok_or(StoreError::Conflict)?)
                .map_err(|_| StoreError::InvalidPrice)?;
        if original.tariff.dimensions != card.tariff.dimensions
            || original.tariff.meter != card.tariff.meter
        {
            return Err(StoreError::InvalidPrice);
        }
        publish_rate(&mut tx, supplier, card).await?;
        retire_rate(&mut tx, supplier, previous, card.tariff.effective_from).await?;
        tx.commit().await?;
        Ok(())
    }

    /// End eligibility without rewriting agreed terms or historical obligations.
    pub async fn retire_supplier_media_rate(
        &self,
        supplier: Uuid,
        revision: &str,
        cutoff: i64,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        retire_rate(&mut tx, supplier, revision, cutoff).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Caller authorizes installation or this Supplier's active membership.
    /// Monetary amounts and version/time integers are exact strings on reads.
    pub async fn supplier_media_rates(
        &self,
        supplier: Uuid,
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
        let mut rows:Vec<serde_json::Value>=sqlx::query_scalar("SELECT jsonb_build_object('card',c.document||jsonb_build_object('vendor_revision',c.document->>'vendor_revision','model_revision',c.document->>'model_revision','discounts',(SELECT COALESCE(jsonb_agg(rule.value||jsonb_build_object('effective_from',rule.value->>'effective_from','effective_until',rule.value->>'effective_until') ORDER BY rule.ordinality),'[]'::jsonb) FROM jsonb_array_elements(c.document->'discounts') WITH ORDINALITY AS rule(value,ordinality)),'tariff',c.document->'tariff'||jsonb_build_object('amount_units',c.document->'tariff'->>'amount_units','effective_from',c.document->'tariff'->>'effective_from','effective_until',c.document->'tariff'->>'effective_until')),'retirement_effective_until',r.effective_until::text,'created_at',c.created_at) FROM supplier_media_rate_cards c LEFT JOIN supplier_media_rate_retirements r ON r.provider_id=c.provider_id AND r.revision=c.revision WHERE c.provider_id=$1 AND ($2::text IS NULL OR c.revision>$2) ORDER BY c.revision LIMIT $3")
            .bind(supplier).bind(after).bind(limit+1).fetch_all(&self.pool).await?;
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

    /// Select and bind the original Supplier's qualified purchase price before paid dispatch.
    pub async fn bind_supplier_media_rate(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        dimensions: &Dimensions,
        meter: &str,
        at: i64,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let bound:Option<(Uuid,Uuid)>=sqlx::query_as("SELECT b.provider_id,b.revision_id FROM attempts a JOIN provider_attempt_offers b ON b.attempt_id=a.id WHERE a.id=$1 AND a.organization_id=$2 AND a.project_id=$3 AND a.resource_id=$4 AND a.execution='not_sent' FOR UPDATE OF a")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(&dimensions.model).fetch_optional(&mut *tx).await?;
        let (supplier, offer) = bound.ok_or(StoreError::Conflict)?;
        let rows:Vec<serde_json::Value>=sqlx::query_scalar("SELECT c.document FROM supplier_media_rate_cards c WHERE c.provider_id=$1 AND c.offer_revision=$2 AND c.model_alias=$3 AND c.channel=$4 AND c.resolution=$5 AND c.reference_video=$6 AND c.effective_from<=$7 AND (c.effective_until IS NULL OR c.effective_until>$7) AND NOT EXISTS(SELECT 1 FROM supplier_media_rate_retirements r WHERE r.provider_id=c.provider_id AND r.revision=c.revision AND r.effective_until<=$7) ORDER BY c.revision LIMIT 2")
            .bind(supplier).bind(offer).bind(&dimensions.model).bind(&dimensions.channel).bind(&dimensions.resolution).bind(dimensions.reference_video).bind(at).fetch_all(&mut *tx).await?;
        if rows.len() != 1 {
            return Err(StoreError::InvalidPrice);
        }
        let card: SupplierMediaRateCard =
            serde_json::from_value(rows.into_iter().next().ok_or(StoreError::InvalidPrice)?)
                .map_err(|_| StoreError::InvalidPrice)?;
        card.validate(supplier)?;
        if card.tariff.meter != meter {
            return Err(StoreError::InvalidPrice);
        }
        let current:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM provider_offers o JOIN vendors v ON v.id=o.vendor_id JOIN vendor_models m ON m.alias=o.model_alias AND m.vendor_id=v.id WHERE o.provider_id=$1 AND o.current_revision=$2 AND o.model_alias=$3 AND o.active AND v.enabled AND m.enabled AND v.revision=$4 AND m.revision=$5 AND m.capabilities->'video_schema'->>'revision'=$6 AND m.capabilities->'video_schema'->>'channel'=$7 AND niu_offer_qualification_current(o.provider_id,o.id,o.current_revision) AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id))")
            .bind(supplier).bind(offer).bind(&dimensions.model).bind(card.vendor_revision).bind(card.model_revision).bind(&card.schema_revision).bind(&dimensions.channel).fetch_one(&mut *tx).await?;
        if !current {
            return Err(StoreError::Conflict);
        }
        let snapshot = serde_json::from_str::<serde_json::Value>(
            &card
                .pricing(supplier, at)?
                .encode()
                .map_err(|_| StoreError::InvalidPrice)?,
        )
        .map_err(|_| StoreError::InvalidPrice)?;
        sqlx::query("INSERT INTO supplier_media_attempt_pricing(attempt_id,provider_id,rate_revision,snapshot) VALUES($1,$2,$3,$4) ON CONFLICT(attempt_id) DO NOTHING")
            .bind(attempt).bind(supplier).bind(&card.revision).bind(&snapshot).execute(&mut *tx).await?;
        let prior: serde_json::Value = sqlx::query_scalar(
            "SELECT snapshot FROM supplier_media_attempt_pricing WHERE attempt_id=$1",
        )
        .bind(attempt)
        .fetch_one(&mut *tx)
        .await?;
        if prior != snapshot {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }
    /// Independent Supplier liability; customer funding and charges are not consulted.
    pub async fn accrue_supplier_media_earning(&self, attempt: Uuid) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let row=sqlx::query("SELECT p.provider_id,p.snapshot,b.revision_id,a.execution FROM supplier_media_attempt_pricing p JOIN attempts a ON a.id=p.attempt_id JOIN provider_attempt_offers b ON b.attempt_id=a.id AND b.provider_id=p.provider_id WHERE a.id=$1 FOR UPDATE OF a")
            .bind(attempt).fetch_optional(&mut *tx).await?;
        let Some(row) = row else {
            return Ok(());
        };
        let prior: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM provider_earnings WHERE attempt_id=$1)",
        )
        .bind(attempt)
        .fetch_one(&mut *tx)
        .await?;
        if prior {
            tx.commit().await?;
            return Ok(());
        }
        let success:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM media_job_observations WHERE attempt_id=$1 AND status='succeeded') AND NOT EXISTS(SELECT 1 FROM media_job_observations WHERE attempt_id=$1 AND status='failed')").bind(attempt).fetch_one(&mut *tx).await?;
        if row.get::<String, _>("execution") != "confirmed_completed" || !success {
            return Err(StoreError::Unresolved);
        }
        let observations:Vec<(String,String)>=sqlx::query_as("SELECT DISTINCT metadata->>'meter',metadata->'quantity'->>'value' FROM media_query_evidence WHERE attempt_id=$1 AND metadata->'quantity'->>'state'='reported' LIMIT 2")
            .bind(attempt).fetch_all(&mut *tx).await?;
        if observations.len() != 1 {
            return Err(StoreError::Unresolved);
        }
        let (meter, value) = observations
            .into_iter()
            .next()
            .ok_or(StoreError::Unresolved)?;
        let quantity = Quantity::integer(
            value
                .parse::<u128>()
                .map_err(|_| StoreError::InvalidUsage)?,
        );
        let snapshot: serde_json::Value = row.get("snapshot");
        let pricing =
            PricingSnapshot::decode(&snapshot.to_string()).map_err(|_| StoreError::InvalidPrice)?;
        let receipt = pricing
            .calculate(&Usage::Known {
                meter: meter.clone(),
                quantity,
                provenance: Provenance::Reported,
            })
            .map_err(|_| StoreError::InvalidPrice)?;
        let nanos = crate::media_pricing::receipt_nanos(&receipt)?;
        sqlx::query("INSERT INTO provider_earnings(attempt_id,provider_id,revision_id,currency,amount_nanos,prompt_tokens,completion_tokens,billing_meter,meter_quantity,media_explanation) VALUES($1,$2,$3,$4,$5,NULL,NULL,$6,$7,$8)")
            .bind(attempt).bind(row.get::<Uuid,_>("provider_id")).bind(row.get::<Uuid,_>("revision_id")).bind(&receipt.currency).bind(nanos).bind(&meter).bind(serde_json::to_value(quantity).map_err(|_| StoreError::InvalidUsage)?).bind(serde_json::to_value(&receipt).map_err(|_| StoreError::InvalidPrice)?).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
}

async fn publish_rate(
    connection: &mut sqlx::PgConnection,
    supplier: Uuid,
    card: &SupplierMediaRateCard,
) -> Result<(), StoreError> {
    card.validate(supplier)?;
    let document = serde_json::to_value(card).map_err(|_| StoreError::InvalidPrice)?;
    if document.to_string().len() > 128 * 1024 {
        return Err(StoreError::InvalidPrice);
    }
    let current:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM provider_offers o JOIN vendors v ON v.id=o.vendor_id JOIN vendor_models m ON m.alias=o.model_alias AND m.vendor_id=v.id WHERE o.provider_id=$1 AND o.current_revision=$2 AND o.model_alias=$3 AND o.active AND v.enabled AND m.enabled AND v.revision=$4 AND m.revision=$5 AND m.capabilities->'video_schema'->>'revision'=$6 AND m.capabilities->'video_schema'->>'channel'=$7 AND niu_offer_qualification_current(o.provider_id,o.id,o.current_revision) AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id))")
            .bind(supplier).bind(card.offer_revision).bind(&card.tariff.dimensions.model).bind(card.vendor_revision).bind(card.model_revision).bind(&card.schema_revision).bind(&card.tariff.dimensions.channel).fetch_one(&mut *connection).await?;
    if !current {
        return Err(StoreError::Conflict);
    }
    sqlx::query("INSERT INTO supplier_media_rate_cards(provider_id,revision,offer_revision,model_alias,channel,resolution,reference_video,effective_from,effective_until,document) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(provider_id,revision) DO NOTHING")
            .bind(supplier).bind(&card.revision).bind(card.offer_revision).bind(&card.tariff.dimensions.model).bind(&card.tariff.dimensions.channel).bind(&card.tariff.dimensions.resolution).bind(card.tariff.dimensions.reference_video).bind(card.tariff.effective_from).bind(card.tariff.effective_until).bind(&document).execute(&mut *connection).await?;
    let prior: serde_json::Value = sqlx::query_scalar(
        "SELECT document FROM supplier_media_rate_cards WHERE provider_id=$1 AND revision=$2",
    )
    .bind(supplier)
    .bind(&card.revision)
    .fetch_one(&mut *connection)
    .await?;
    if prior != document {
        return Err(StoreError::Conflict);
    }
    Ok(())
}

async fn retire_rate(
    connection: &mut sqlx::PgConnection,
    supplier: Uuid,
    revision: &str,
    cutoff: i64,
) -> Result<(), StoreError> {
    if revision.is_empty()
        || revision.len() > 256
        || revision.trim() != revision
        || revision.chars().any(char::is_control)
    {
        return Err(StoreError::InvalidPrice);
    }
    let bounds:Option<(i64,Option<i64>,Uuid)>=sqlx::query_as("SELECT effective_from,effective_until,offer_revision FROM supplier_media_rate_cards WHERE provider_id=$1 AND revision=$2 FOR UPDATE")
            .bind(supplier).bind(revision).fetch_optional(&mut *connection).await?;
    let (start, end, offer) = bounds.ok_or(StoreError::Conflict)?;
    if cutoff < start || end.is_some_and(|end| cutoff > end) {
        return Err(StoreError::InvalidPrice);
    }
    let changed=sqlx::query("INSERT INTO supplier_media_rate_retirements(provider_id,revision,effective_until) VALUES($1,$2,$3) ON CONFLICT(provider_id,revision) DO NOTHING")
            .bind(supplier).bind(revision).bind(cutoff).execute(&mut *connection).await?.rows_affected();
    let saved:i64=sqlx::query_scalar("SELECT effective_until FROM supplier_media_rate_retirements WHERE provider_id=$1 AND revision=$2")
            .bind(supplier).bind(revision).fetch_one(&mut *connection).await?;
    if saved != cutoff {
        return Err(StoreError::Conflict);
    }
    if changed == 1 {
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'media_rate_retired',$2)").bind(supplier).bind(offer).execute(&mut *connection).await?;
    }
    Ok(())
}
