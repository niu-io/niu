//! Customer video prices, qualified maximum and prepaid reservation in one tx.
use crate::{
    CustomerMediaRateCard, MediaLiabilityBound, MediaLiabilityIdentity, RetailSchedule,
    RetailSelection, SelectedCustomerMediaRate, Store, StoreError, TenantScope, VendorRoute,
};
use niu_metered_cost::{Dimensions, PricingContext, PricingSnapshot};
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

struct Prepared {
    rate: SelectedCustomerMediaRate,
    selection: Option<RetailSelection>,
    qualification: Option<Uuid>,
}
async fn clock(tx: &mut Transaction<'_, Postgres>) -> Result<i64, StoreError> {
    Ok(
        sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp()))::bigint")
            .fetch_one(&mut **tx)
            .await?,
    )
}
fn schema(route: &VendorRoute) -> Result<&str, StoreError> {
    route
        .model
        .capabilities
        .get("video_schema")
        .and_then(|s| s.get("revision"))
        .and_then(Value::as_str)
        .ok_or(StoreError::Conflict)
}
fn same_terms(left: &PricingSnapshot, right: &PricingSnapshot) -> Result<bool, StoreError> {
    let mut left: Value =
        serde_json::from_str(&left.encode().map_err(|_| StoreError::InvalidPrice)?)
            .map_err(|_| StoreError::InvalidPrice)?;
    let mut right: Value =
        serde_json::from_str(&right.encode().map_err(|_| StoreError::InvalidPrice)?)
            .map_err(|_| StoreError::InvalidPrice)?;
    let _ = left
        .as_object_mut()
        .ok_or(StoreError::InvalidPrice)?
        .remove("selected_at");
    let _ = right
        .as_object_mut()
        .ok_or(StoreError::InvalidPrice)?
        .remove("selected_at");
    Ok(left == right)
}
async fn lock_route(
    tx: &mut Transaction<'_, Postgres>,
    route: &VendorRoute,
    dimensions: &Dimensions,
    meter: &str,
) -> Result<MediaLiabilityIdentity, StoreError> {
    if route.personal_organization_id.is_some() || route.model.alias != dimensions.model {
        return Err(StoreError::Conflict);
    }
    let(supplier,offer):(Uuid,Uuid)=sqlx::query_as("SELECT o.provider_id,o.id FROM provider_offers o JOIN provider_offer_revisions r ON r.id=o.current_revision WHERE o.vendor_id=$1 AND o.model_alias=$2 AND r.rate_kind='media' AND o.active")
        .bind(route.vendor.id).bind(&dimensions.model).fetch_optional(&mut **tx).await?.ok_or(StoreError::AccountUnavailable)?;
    sqlx::query("SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR SHARE")
        .bind(supplier)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(StoreError::Conflict)?;
    let revision:Uuid=sqlx::query_scalar("SELECT current_revision FROM provider_offers WHERE provider_id=$1 AND id=$2 AND active AND vendor_id=$3 AND model_alias=$4 FOR SHARE")
        .bind(supplier).bind(offer).bind(route.vendor.id).bind(&dimensions.model).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
    let current:bool=sqlx::query_scalar("SELECT niu_offer_qualification_current($1,$2,$3) AND niu_media_offer_binding_current($1,$2,$3)")
        .bind(supplier).bind(offer).bind(revision).fetch_one(&mut **tx).await?;
    if !current {
        return Err(StoreError::AccountUnavailable);
    }
    sqlx::query("SELECT v.id FROM vendors v JOIN vendor_models m ON m.vendor_id=v.id WHERE v.id=$1 AND m.alias=$2 AND v.enabled AND m.enabled AND v.revision=$3 AND m.revision=$4 AND m.capabilities->'video_schema'->>'revision'=$5 AND m.capabilities->'video_schema'->>'channel'=$6 AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id) FOR SHARE OF v,m")
        .bind(route.vendor.id).bind(&dimensions.model).bind(route.vendor.revision).bind(route.model.revision)
        .bind(schema(route)?).bind(&dimensions.channel).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
    Ok(MediaLiabilityIdentity {
        supplier_id: supplier,
        offer_id: offer,
        offer_revision: revision,
        vendor_id: route.vendor.id,
        vendor_revision: route.vendor.revision.to_string(),
        model_alias: dimensions.model.clone(),
        model_revision: route.model.revision.to_string(),
        schema_revision: schema(route)?.into(),
        dimensions: dimensions.clone(),
        meter: meter.into(),
    })
}
async fn legacy_rate(
    tx: &mut Transaction<'_, Postgres>,
    scope: TenantScope,
    route: &VendorRoute,
    dimensions: &Dimensions,
    at: i64,
) -> Result<Option<SelectedCustomerMediaRate>, StoreError> {
    let rows:Vec<Value>=sqlx::query_scalar("SELECT c.document FROM customer_media_rate_cards c WHERE c.organization_id=$1 AND c.model_alias=$2 AND c.channel=$3 AND c.resolution=$4 AND c.reference_video=$5 AND c.effective_from<=$6 AND (c.effective_until IS NULL OR c.effective_until>$6) AND NOT EXISTS(SELECT 1 FROM customer_media_rate_retirements r WHERE r.organization_id=c.organization_id AND r.revision=c.revision AND r.effective_until<=$6) ORDER BY c.revision LIMIT 2 FOR SHARE OF c")
        .bind(scope.organization_id).bind(&dimensions.model).bind(&dimensions.channel).bind(&dimensions.resolution).bind(dimensions.reference_video).bind(at)
        .fetch_all(&mut **tx).await?;
    if rows.len() > 1 {
        return Err(StoreError::InvalidPrice);
    }
    let Some(document) = rows.into_iter().next() else {
        return Ok(None);
    };
    let card: CustomerMediaRateCard =
        serde_json::from_value(document).map_err(|_| StoreError::InvalidPrice)?;
    card.validate(scope.organization_id)?;
    if card.vendor_id != route.vendor.id
        || card.vendor_revision != route.vendor.revision
        || card.model_revision != route.model.revision
        || card.schema_revision != schema(route)?
        || card.tariff.dimensions != *dimensions
        || card.tariff.meter != "video_tokens"
    {
        return Err(StoreError::Conflict);
    }
    let customer = scope.organization_id.to_string();
    let pricing = niu_metered_cost::pin_pricing(
        std::slice::from_ref(&card.tariff),
        &card.discounts,
        &PricingContext {
            dimensions,
            offer: &card.offer_revision,
            customer: &customer,
            at,
        },
    )
    .map_err(|_| StoreError::InvalidPrice)?;
    Ok(Some(SelectedCustomerMediaRate {
        retail_price_id: None,
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
async fn platform_rate(
    tx: &mut Transaction<'_, Postgres>,
    scope: TenantScope,
    head: Uuid,
    identity: &MediaLiabilityIdentity,
    at: Option<i64>,
) -> Result<Prepared, StoreError> {
    let selected = Store::select_retail_price_at_in_tx(tx, head, scope.organization_id, at).await?;
    let RetailSchedule::Media(ref media) = selected.schedule else {
        return Err(StoreError::InvalidPrice);
    };
    if media.dimensions != identity.dimensions || media.meter != identity.meter {
        return Err(StoreError::Conflict);
    }
    let qualified = Store::select_media_liability_qualification_at_in_tx(tx, identity, at)
        .await?
        .ok_or(StoreError::AccountUnavailable)?;
    // Obtain one time after both sets of locks even in advisory selection.
    let (at, selected, qualified) = if let Some(at) = at {
        (at, selected, qualified)
    } else {
        let at = clock(tx).await?;
        let selected =
            Store::select_retail_price_at_in_tx(tx, head, scope.organization_id, Some(at)).await?;
        let qualified =
            Store::select_media_liability_qualification_at_in_tx(tx, identity, Some(at))
                .await?
                .ok_or(StoreError::AccountUnavailable)?;
        (at, selected, qualified)
    };
    let RetailSchedule::Media(ref media) = selected.schedule else {
        return Err(StoreError::InvalidPrice);
    };
    let revision = selected
        .promotion_revision
        .unwrap_or(selected.baseline_revision)
        .to_string();
    let tariff = media.to_tariff(&revision, &selected.currency, 0, None)?;
    let customer = scope.organization_id.to_string();
    let offer = identity.offer_revision.to_string();
    let pricing = niu_metered_cost::pin_pricing(
        std::slice::from_ref(&tariff),
        &[],
        &PricingContext {
            dimensions: &identity.dimensions,
            offer: &offer,
            customer: &customer,
            at,
        },
    )
    .map_err(|_| StoreError::InvalidPrice)?;
    let rate = SelectedCustomerMediaRate {
        retail_price_id: Some(head),
        revision,
        vendor_id: identity.vendor_id,
        vendor_revision: identity
            .vendor_revision
            .parse()
            .map_err(|_| StoreError::InvalidPrice)?,
        model_revision: identity
            .model_revision
            .parse()
            .map_err(|_| StoreError::InvalidPrice)?,
        schema_revision: identity.schema_revision.clone(),
        pricing,
        liability: MediaLiabilityBound {
            meter: identity.meter.clone(),
            maximum_quantity: qualified.maximum_quantity,
            qualification_revision: qualified.revision.to_string(),
        },
    };
    Ok(Prepared {
        rate,
        selection: Some(selected),
        qualification: Some(qualified.revision),
    })
}

impl Store {
    /// Video currently supports the video_tokens customer meter. This preview
    /// reserves nothing and is not the admission snapshot or supply guarantee.
    pub async fn preview_customer_video_rate(
        &self,
        scope: TenantScope,
        route: &VendorRoute,
        dimensions: &Dimensions,
        legacy_at: i64,
    ) -> Result<Option<SelectedCustomerMediaRate>, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR SHARE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let head =
            Self::enrolled_retail_media_price_in_tx(&mut tx, scope, dimensions, "video_tokens")
                .await?;
        let Some(head) = head else {
            tx.commit().await?;
            return self
                .select_customer_media_rate(scope.organization_id, dimensions, legacy_at)
                .await;
        };
        Self::select_retail_price_in_tx(&mut tx, head, scope.organization_id).await?;
        let identity = lock_route(&mut tx, route, dimensions, "video_tokens").await?;
        let prepared = platform_rate(&mut tx, scope, head, &identity, None).await?;
        tx.commit().await?;
        Ok(Some(prepared.rate))
    }

    /// One owned transaction pins exact customer/Provider prices, qualified
    /// liability and reservation. Unknown commit never authorizes another egress.
    pub async fn bind_and_reserve_customer_video_rate(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        route: &VendorRoute,
        preview: &SelectedCustomerMediaRate,
    ) -> Result<i64, StoreError> {
        let dimensions = &preview.pricing.tariff().dimensions;
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query("SELECT id FROM organizations WHERE id=$1 FOR SHARE")
            .bind(scope.organization_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query("SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR SHARE")
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let existing:Option<Value>=sqlx::query_scalar("SELECT snapshot FROM customer_media_attempt_pricing WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&mut *tx).await?;
        if let Some(saved) = existing {
            let snapshot = PricingSnapshot::decode(&saved.to_string())
                .map_err(|_| StoreError::InvalidPrice)?;
            if snapshot.tariff().dimensions != *dimensions
                || snapshot.customer() != scope.organization_id.to_string()
            {
                return Err(StoreError::Conflict);
            }
            sqlx::query("SELECT id FROM customer_balance_accounts WHERE organization_id=$1 AND currency=$2 FOR NO KEY UPDATE")
                .bind(scope.organization_id).bind(&snapshot.tariff().currency).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
            sqlx::query("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND execution='not_sent' FOR UPDATE")
                .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
            let amount:Option<i64>=sqlx::query_scalar("SELECT b.maximum_nanos FROM customer_media_liability_bounds b JOIN customer_media_attempt_pricing p ON p.attempt_id=b.attempt_id JOIN customer_attempt_balance_accounts a ON a.attempt_id=b.attempt_id JOIN customer_balance_reservations r ON r.attempt_id=b.attempt_id WHERE b.attempt_id=$1 AND b.organization_id=$2 AND b.project_id=$3 AND p.snapshot=$4 AND a.currency=$5 AND r.released_at IS NULL AND r.amount_nanos=b.maximum_nanos AND EXISTS(SELECT 1 FROM supplier_media_attempt_pricing s WHERE s.attempt_id=b.attempt_id) AND EXISTS(SELECT 1 FROM media_recovery_routes rr WHERE rr.attempt_id=b.attempt_id AND rr.vendor_id=$6 AND rr.vendor_revision=$7 AND rr.model_revision=$8 AND rr.schema_revision=$9)")
                .bind(attempt).bind(scope.organization_id).bind(scope.project_id).bind(saved).bind(&snapshot.tariff().currency)
                .bind(route.vendor.id).bind(route.vendor.revision).bind(route.model.revision).bind(schema(route)?)
                .fetch_optional(&mut *tx).await?;
            let amount = amount.ok_or(StoreError::Conflict)?;
            tx.commit().await?;
            return Ok(amount);
        }
        let head =
            Self::enrolled_retail_media_price_in_tx(&mut tx, scope, dimensions, "video_tokens")
                .await?;
        if head != preview.retail_price_id {
            return Err(StoreError::Conflict);
        }
        if let Some(head) = head {
            Self::select_retail_price_in_tx(&mut tx, head, scope.organization_id).await?;
        }
        let identity = lock_route(&mut tx, route, dimensions, "video_tokens").await?;
        if preview.pricing.offer() != identity.offer_revision.to_string() {
            return Err(StoreError::Conflict);
        }
        // Stabilize any existing Supplier card against retirement before account
        // locks; its independent purchase price is selected by the same DB time.
        let initial_at = clock(&mut tx).await?;
        sqlx::query("SELECT revision FROM supplier_media_rate_cards WHERE provider_id=$1 AND offer_revision=$2 AND model_alias=$3 AND channel=$4 AND resolution=$5 AND reference_video=$6 AND (effective_until IS NULL OR effective_until>$7) AND NOT EXISTS(SELECT 1 FROM supplier_media_rate_retirements r WHERE r.provider_id=supplier_media_rate_cards.provider_id AND r.revision=supplier_media_rate_cards.revision AND r.effective_until<=$7) FOR SHARE")
            .bind(identity.supplier_id).bind(identity.offer_revision).bind(&dimensions.model).bind(&dimensions.channel)
            .bind(&dimensions.resolution).bind(dimensions.reference_video).bind(initial_at).fetch_all(&mut *tx).await?;
        let initial = if let Some(head) = head {
            platform_rate(&mut tx, scope, head, &identity, None).await?
        } else {
            Prepared {
                rate: legacy_rate(&mut tx, scope, route, dimensions, initial_at)
                    .await?
                    .ok_or(StoreError::AccountUnavailable)?,
                selection: None,
                qualification: None,
            }
        };
        sqlx::query("SELECT id FROM customer_balance_accounts WHERE organization_id=$1 AND currency=$2 FOR NO KEY UPDATE")
            .bind(scope.organization_id).bind(&initial.rate.pricing.tariff().currency)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        sqlx::query("SELECT id FROM attempts WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND execution='not_sent' FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(attempt).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        let at = clock(&mut tx).await?;
        let prepared = if let Some(head) = head {
            platform_rate(&mut tx, scope, head, &identity, Some(at)).await?
        } else {
            let rate = legacy_rate(&mut tx, scope, route, dimensions, at)
                .await?
                .ok_or(StoreError::AccountUnavailable)?;
            if !same_terms(&rate.pricing, &preview.pricing)? {
                return Err(StoreError::Conflict);
            }
            Prepared {
                rate,
                selection: None,
                qualification: None,
            }
        };
        if prepared.rate.pricing.tariff().currency != initial.rate.pricing.tariff().currency {
            return Err(StoreError::Conflict);
        }
        Self::require_customer_media_offer_in_tx(
            &mut tx,
            scope,
            attempt,
            prepared.rate.pricing.offer(),
            route.vendor.id,
        )
        .await?;
        Self::bind_supplier_media_rate_in_tx(
            &mut tx,
            scope,
            attempt,
            dimensions,
            "video_tokens",
            at,
        )
        .await?;
        Self::bind_customer_media_pricing_in_tx(&mut tx, scope, attempt, &prepared.rate.pricing)
            .await?;
        let amount = Self::reserve_customer_media_balance_in_tx(
            &mut tx,
            scope,
            attempt,
            &prepared.rate.liability,
        )
        .await?;
        if let Some(selected) = prepared.selection {
            sqlx::query("INSERT INTO retail_media_attempt_prices(organization_id,project_id,attempt_id,price_id,baseline_revision,promotion_revision,qualification_revision,selected_at,selection) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)")
                .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(selected.price_id)
                .bind(selected.baseline_revision).bind(selected.promotion_revision).bind(prepared.qualification.ok_or(StoreError::Conflict)?)
                .bind(at).bind(json!(selected)).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(amount)
    }
}
