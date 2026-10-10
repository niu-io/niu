//! Provider earnings are an independent liability ledger, never derived from customer cost.
use crate::{Store, StoreError, TenantScope, TokenRates};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::Row;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Serialize, sqlx::FromRow)]
pub struct ProviderMembership {
    pub id: Uuid,
    pub name: String,
    pub role: String,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct SupplierProfile {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub website_url: String,
    pub logo_url: String,
    pub revision: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SupplierProfileUpdate {
    pub name: String,
    pub description: Option<String>,
    pub website_url: Option<String>,
    pub logo_url: Option<String>,
    pub expected_revision: Option<i64>,
}

fn valid_profile_url(value: &str) -> bool {
    value.is_empty()
        || (value.len() <= 2048
            && !value.chars().any(char::is_control)
            && url::Url::parse(value).is_ok_and(|url| {
                matches!(url.scheme(), "http" | "https")
                    && url.host_str().is_some()
                    && url.username().is_empty()
                    && url.password().is_none()
            }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderOfferInput {
    pub model_alias: String,
    pub currency: String,
    // Decimal integer strings avoid losing nanounits in browser JSON numbers.
    pub prompt_rate: String,
    pub completion_rate: String,
    pub expected_revision: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderQualificationInput {
    pub supply_rights_sha256: String,
    pub supply_capability_sha256: String,
    pub data_handling_sha256: String,
    pub valid_until_ms: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderOfferQualificationInput {
    pub rate_revision: Uuid,
    pub model_identity_sha256: String,
    pub protocol_matrix_sha256: String,
    pub protocol_matrix_version: String,
    pub data_handling_sha256: String,
    pub availability_sha256: String,
    pub agreed_rates_sha256: String,
    pub valid_until_ms: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderQualificationRevocationInput {
    pub reason_sha256: String,
}

fn valid_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.len() <= max && !value.chars().any(char::is_control)
}

fn valid_evidence_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn valid_expiry(value: i64) -> bool {
    let Ok(now) = SystemTime::now().duration_since(UNIX_EPOCH) else {
        return false;
    };
    let Ok(now_ms) = i64::try_from(now.as_millis()) else {
        return false;
    };
    value > now_ms && value <= 253_402_300_799_999
}

fn map_qualification_write_error(error: sqlx::Error) -> StoreError {
    if error
        .as_database_error()
        .and_then(|database_error| database_error.code())
        .is_some_and(|code| code == "P0008")
    {
        return StoreError::Conflict;
    }
    if error
        .as_database_error()
        .and_then(|database_error| database_error.code())
        .is_some_and(|code| code == "P0007")
    {
        StoreError::AccountUnavailable
    } else {
        StoreError::Database(error)
    }
}

impl Store {
    /// Explicit offers require an enabled matching route and current qualification before exposure.
    /// Legacy routes without a Supplier offer retain their existing behavior.
    pub async fn unavailable_supplier_models(&self) -> Result<Vec<String>, StoreError> {
        Ok(sqlx::query_scalar("SELECT model_alias FROM provider_offers WHERE NOT niu_supplier_model_route_available(model_alias)")
            .fetch_all(&self.pool).await?)
    }
    pub async fn supplier_model_available(&self, alias: &str) -> Result<bool, StoreError> {
        Ok(
            sqlx::query_scalar("SELECT niu_supplier_model_route_available($1)")
                .bind(alias)
                .fetch_one(&self.pool)
                .await?,
        )
    }
    pub async fn provider_businesses(&self) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('id',p.id,'name',p.name,'api_keys',(SELECT COUNT(*) FROM vendor_supplier_ownership o WHERE o.provider_id=p.id),'models',(SELECT COUNT(*) FROM vendor_models vm JOIN vendor_supplier_ownership o ON o.vendor_id=vm.vendor_id WHERE o.provider_id=p.id),'members',(SELECT COUNT(*) FROM provider_memberships m WHERE m.provider_id=p.id AND m.active),'qualification_status',CASE WHEN niu_supplier_qualification_current(p.id) THEN 'qualified' ELSE 'unqualified' END) FROM provider_businesses p WHERE p.deleted_at IS NULL ORDER BY p.name,p.id").fetch_all(&self.pool).await?)
    }

    pub async fn qualify_provider_business(
        &self,
        provider: Uuid,
        input: &ProviderQualificationInput,
    ) -> Result<(), StoreError> {
        if !valid_evidence_digest(&input.supply_rights_sha256)
            || !valid_evidence_digest(&input.supply_capability_sha256)
            || !valid_evidence_digest(&input.data_handling_sha256)
            || !valid_expiry(input.valid_until_ms)
        {
            return Err(StoreError::InvalidVendor);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        )
        .bind(provider)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        let review = Uuid::new_v4();
        sqlx::query("INSERT INTO provider_qualification_reviews(id,provider_id,supply_rights_sha256,supply_capability_sha256,data_handling_sha256,valid_until) VALUES($1,$2,$3,$4,$5,to_timestamp($6::double precision/1000.0))")
            .bind(review)
            .bind(provider)
            .bind(&input.supply_rights_sha256)
            .bind(&input.supply_capability_sha256)
            .bind(&input.data_handling_sha256)
            .bind(input.valid_until_ms)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE provider_businesses SET current_qualification_review=$2 WHERE id=$1")
            .bind(provider)
            .bind(review)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'supplier_qualification_reviewed',$2)")
            .bind(provider)
            .bind(review)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn qualify_provider_offer(
        &self,
        provider: Uuid,
        offer: Uuid,
        input: &ProviderOfferQualificationInput,
    ) -> Result<(), StoreError> {
        if !valid_evidence_digest(&input.model_identity_sha256)
            || !valid_evidence_digest(&input.protocol_matrix_sha256)
            || !valid_evidence_digest(&input.data_handling_sha256)
            || !valid_evidence_digest(&input.availability_sha256)
            || !valid_evidence_digest(&input.agreed_rates_sha256)
            || !valid_text(&input.protocol_matrix_version, 100)
            || !valid_expiry(input.valid_until_ms)
        {
            return Err(StoreError::InvalidVendor);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        )
        .bind(provider)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        let current_revision: Option<Uuid> = sqlx::query_scalar(
            "SELECT current_revision FROM provider_offers WHERE provider_id=$1 AND id=$2 FOR UPDATE",
        )
        .bind(provider)
        .bind(offer)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        if current_revision != Some(input.rate_revision)
            || !sqlx::query_scalar::<_, bool>("SELECT niu_media_offer_binding_current($1,$2,$3)")
                .bind(provider)
                .bind(offer)
                .bind(input.rate_revision)
                .fetch_one(&mut *tx)
                .await?
            || !sqlx::query_scalar::<_, bool>("SELECT niu_supplier_qualification_current($1)")
                .bind(provider)
                .fetch_one(&mut *tx)
                .await?
        {
            return Err(StoreError::Conflict);
        }
        let review = Uuid::new_v4();
        sqlx::query("INSERT INTO provider_offer_qualification_reviews(id,provider_id,offer_id,rate_revision,model_identity_sha256,protocol_matrix_sha256,protocol_matrix_version,data_handling_sha256,availability_sha256,agreed_rates_sha256,valid_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_timestamp($11::double precision/1000.0))")
            .bind(review)
            .bind(provider)
            .bind(offer)
            .bind(input.rate_revision)
            .bind(&input.model_identity_sha256)
            .bind(&input.protocol_matrix_sha256)
            .bind(input.protocol_matrix_version.trim())
            .bind(&input.data_handling_sha256)
            .bind(&input.availability_sha256)
            .bind(&input.agreed_rates_sha256)
            .bind(input.valid_until_ms)
            .execute(&mut *tx)
            .await.map_err(map_qualification_write_error)?;
        sqlx::query("UPDATE provider_offers SET current_qualification_review=$3 WHERE provider_id=$1 AND id=$2 AND current_revision=$4")
            .bind(provider)
            .bind(offer)
            .bind(review)
            .bind(input.rate_revision)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'offer_qualification_reviewed',$2)")
            .bind(provider)
            .bind(review)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn revoke_provider_qualification(
        &self,
        provider: Uuid,
        reason_sha256: &str,
    ) -> Result<(), StoreError> {
        if !valid_evidence_digest(reason_sha256) {
            return Err(StoreError::InvalidVendor);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        )
        .bind(provider)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        let review = sqlx::query_scalar::<_, Option<Uuid>>(
            "SELECT current_qualification_review FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        )
        .bind(provider)
        .fetch_optional(&mut *tx)
        .await?
        .flatten()
        .ok_or(StoreError::Conflict)?;
        if sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM provider_qualification_revocations WHERE supplier_review_id=$1)",
        )
        .bind(review)
        .fetch_one(&mut *tx)
        .await?
        {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO provider_qualification_revocations(id,provider_id,supplier_review_id,reason_sha256) VALUES($1,$2,$3,$4)")
            .bind(Uuid::new_v4())
            .bind(provider)
            .bind(review)
            .bind(reason_sha256)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE provider_businesses SET current_qualification_review=NULL WHERE id=$1")
            .bind(provider)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE provider_offers SET active=FALSE,current_qualification_review=NULL WHERE provider_id=$1")
            .bind(provider)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'supplier_qualification_revoked',$2)")
            .bind(provider)
            .bind(review)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn revoke_provider_offer_qualification(
        &self,
        provider: Uuid,
        offer: Uuid,
        reason_sha256: &str,
    ) -> Result<(), StoreError> {
        if !valid_evidence_digest(reason_sha256) {
            return Err(StoreError::InvalidVendor);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        )
        .bind(provider)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        let review = sqlx::query_scalar::<_, Option<Uuid>>(
            "SELECT current_qualification_review FROM provider_offers WHERE provider_id=$1 AND id=$2 FOR UPDATE",
        )
        .bind(provider)
        .bind(offer)
        .fetch_optional(&mut *tx)
        .await?
        .flatten()
        .ok_or(StoreError::Conflict)?;
        if sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM provider_qualification_revocations WHERE offer_review_id=$1)",
        )
        .bind(review)
        .fetch_one(&mut *tx)
        .await?
        {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO provider_qualification_revocations(id,provider_id,offer_id,offer_review_id,reason_sha256) VALUES($1,$2,$3,$4,$5)")
            .bind(Uuid::new_v4())
            .bind(provider)
            .bind(offer)
            .bind(review)
            .bind(reason_sha256)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE provider_offers SET active=FALSE,current_qualification_review=NULL WHERE provider_id=$1 AND id=$2")
            .bind(provider)
            .bind(offer)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'offer_qualification_revoked',$2)")
            .bind(provider)
            .bind(review)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn provider_memberships(
        &self,
        operator: Uuid,
    ) -> Result<Vec<ProviderMembership>, StoreError> {
        Ok(sqlx::query_as("SELECT p.id,p.name,m.role FROM provider_businesses p JOIN provider_memberships m ON m.provider_id=p.id JOIN admin_operators a ON a.id=m.operator_id WHERE m.operator_id=$1 AND m.active AND a.revoked_at IS NULL AND p.deleted_at IS NULL ORDER BY p.name,p.id")
            .bind(operator).fetch_all(&self.pool).await?)
    }

    pub async fn provider_member(
        &self,
        provider: Uuid,
        operator: Uuid,
        write: bool,
    ) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM provider_memberships m JOIN admin_operators a ON a.id=m.operator_id WHERE m.provider_id=$1 AND m.operator_id=$2 AND m.active AND a.revoked_at IS NULL AND (NOT $3 OR m.role='manager'))")
            .bind(provider).bind(operator).bind(write).fetch_one(&self.pool).await?)
    }

    pub async fn create_provider_business(&self, name: &str) -> Result<Uuid, StoreError> {
        if !valid_text(name, 100) {
            return Err(StoreError::InvalidAccount);
        }
        let id = Uuid::new_v4();
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO provider_businesses(id,name) VALUES($1,$2)")
            .bind(id)
            .bind(name.trim())
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'provider_created',$1)").bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(id)
    }

    pub async fn supplier_profile(
        &self,
        provider: Uuid,
    ) -> Result<Option<SupplierProfile>, StoreError> {
        Ok(sqlx::query_as("SELECT id,name,description,website_url,logo_url,profile_revision AS revision FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL")
            .bind(provider).fetch_optional(&self.pool).await?)
    }

    pub async fn update_supplier_profile(
        &self,
        provider: Uuid,
        input: &SupplierProfileUpdate,
    ) -> Result<SupplierProfile, StoreError> {
        let description = input.description.as_deref().map(str::trim);
        let website = input.website_url.as_deref().map(str::trim);
        let logo = input.logo_url.as_deref().map(str::trim);
        if !valid_text(&input.name, 100)
            || description.is_some_and(|v| {
                v.chars().count() > 2000
                    || v.chars()
                        .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
            })
            || website.is_some_and(|v| !valid_profile_url(v))
            || logo.is_some_and(|v| !valid_profile_url(v))
            || input.expected_revision.is_some_and(|v| v < 1)
        {
            return Err(StoreError::InvalidAccount);
        }
        let mut tx = self.pool.begin().await?;
        let profile = sqlx::query_as("UPDATE provider_businesses SET name=$2,description=COALESCE($3,description),website_url=COALESCE($4,website_url),logo_url=COALESCE($5,logo_url),profile_revision=profile_revision+1 WHERE id=$1 AND deleted_at IS NULL AND ($6::bigint IS NULL OR profile_revision=$6) RETURNING id,name,description,website_url,logo_url,profile_revision AS revision")
            .bind(provider).bind(input.name.trim()).bind(description).bind(website).bind(logo).bind(input.expected_revision)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'supplier_profile_updated',$1)").bind(provider).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(profile)
    }

    /// Retain audit history; only an unconfigured Supplier can leave the directory.
    pub async fn delete_provider_business(&self, provider: Uuid) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        )
        .bind(provider)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        let dependent: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM vendor_supplier_ownership WHERE provider_id=$1) OR EXISTS(SELECT 1 FROM provider_offers WHERE provider_id=$1) OR EXISTS(SELECT 1 FROM provider_memberships WHERE provider_id=$1)").bind(provider).fetch_one(&mut *tx).await?;
        if dependent {
            return Err(StoreError::Conflict);
        }
        sqlx::query("UPDATE provider_businesses SET deleted_at=now() WHERE id=$1")
            .bind(provider)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'supplier_deleted',$1)").bind(provider).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn payment_gateway_configuration(
        &self,
    ) -> Result<Option<(i64, Vec<u8>)>, StoreError> {
        Ok(sqlx::query_as(
            "SELECT revision,ciphertext FROM payment_gateway_configuration WHERE gateway='epay'",
        )
        .fetch_optional(&self.pool)
        .await?)
    }
    pub async fn save_payment_gateway_configuration(
        &self,
        expected_revision: i64,
        ciphertext: &[u8],
        actor: Option<Uuid>,
    ) -> Result<i64, StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(716553)")
            .execute(&mut *tx)
            .await?;
        let current: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM payment_gateway_configuration WHERE gateway='epay' FOR UPDATE",
        )
        .fetch_optional(&mut *tx)
        .await?;
        if current.unwrap_or(0) != expected_revision {
            return Err(StoreError::Conflict);
        }
        let pending: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_topup_orders o WHERE aggregator='epay' AND NOT EXISTS(SELECT 1 FROM customer_topup_settlements s WHERE s.order_id=o.id) AND NOT EXISTS(SELECT 1 FROM customer_topup_closures c WHERE c.order_id=o.id))").fetch_one(&mut *tx).await?;
        if pending {
            return Err(StoreError::Unresolved);
        }
        let revision = expected_revision
            .checked_add(1)
            .ok_or(StoreError::Conflict)?;
        sqlx::query("INSERT INTO payment_gateway_configuration(gateway,revision,ciphertext) VALUES('epay',$1,$2) ON CONFLICT(gateway) DO UPDATE SET revision=EXCLUDED.revision,ciphertext=EXCLUDED.ciphertext,updated_at=now()").bind(revision).bind(ciphertext).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO payment_gateway_configuration_events(gateway,revision,actor_operator_id) VALUES('epay',$1,$2)").bind(revision).bind(actor).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(revision)
    }

    pub async fn provider_members(&self, provider: Uuid) -> Result<Vec<Value>, StoreError> {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL)",
        )
        .bind(provider)
        .fetch_one(&self.pool)
        .await?;
        if !exists {
            return Err(StoreError::Conflict);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('operator_id',a.id,'name',a.name,'role',m.role,'active',m.active AND a.revoked_at IS NULL,'revoked',a.revoked_at IS NOT NULL) FROM provider_memberships m JOIN admin_operators a ON a.id=m.operator_id WHERE m.provider_id=$1 ORDER BY a.name,a.id")
            .bind(provider).fetch_all(&self.pool).await?)
    }

    pub async fn set_provider_member(
        &self,
        provider: Uuid,
        operator: Uuid,
        role: &str,
        active: bool,
    ) -> Result<(), StoreError> {
        if !matches!(role, "manager" | "viewer") {
            return Err(StoreError::InvalidOperator);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        )
        .bind(provider)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        sqlx::query("SELECT id FROM admin_operators WHERE id=$1 AND revoked_at IS NULL FOR SHARE")
            .bind(operator)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query("INSERT INTO provider_memberships(provider_id,operator_id,role,active) VALUES($1,$2,$3,$4) ON CONFLICT(provider_id,operator_id) DO UPDATE SET role=EXCLUDED.role,active=EXCLUDED.active")
            .bind(provider).bind(operator).bind(role).bind(active).execute(&mut *tx).await?;
        sqlx::query(
            "INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,$2,$3)",
        )
        .bind(provider)
        .bind(format!(
            "membership_{}_{}",
            role,
            if active { "granted" } else { "revoked" }
        ))
        .bind(operator)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn publish_provider_offer(
        &self,
        provider: Uuid,
        input: &ProviderOfferInput,
    ) -> Result<Uuid, StoreError> {
        self.publish_provider_offer_with_cache(provider, input, None)
            .await
    }

    /// Cached prices require explicit retention or removal on subsequent revisions.
    pub async fn publish_provider_offer_with_cache(
        &self,
        provider: Uuid,
        input: &ProviderOfferInput,
        cached_prompt_rate: Option<Option<&str>>,
    ) -> Result<Uuid, StoreError> {
        self.publish_provider_offer_with_categories(provider, input, cached_prompt_rate, None)
            .await
    }

    /// Category rates require explicit retention or removal on later revisions.
    pub async fn publish_provider_offer_with_categories(
        &self,
        provider: Uuid,
        input: &ProviderOfferInput,
        cached_prompt_rate: Option<Option<&str>>,
        reasoning_completion_rate: Option<Option<&str>>,
    ) -> Result<Uuid, StoreError> {
        self.publish_provider_offer_with_cache_write(
            provider,
            input,
            cached_prompt_rate,
            reasoning_completion_rate,
            None,
        )
        .await
    }

    pub async fn publish_provider_offer_with_cache_write(
        &self,
        provider: Uuid,
        input: &ProviderOfferInput,
        cached_prompt_rate: Option<Option<&str>>,
        reasoning_completion_rate: Option<Option<&str>>,
        cache_write_prompt_rate: Option<Option<&str>>,
    ) -> Result<Uuid, StoreError> {
        let written = cache_write_prompt_rate
            .flatten()
            .map(crate::pricing::parse_token_rate)
            .transpose()?;
        let reasoning = reasoning_completion_rate
            .flatten()
            .map(crate::pricing::parse_token_rate)
            .transpose()?;
        let cached = cached_prompt_rate
            .flatten()
            .map(crate::pricing::parse_token_rate)
            .transpose()?;
        let prompt = crate::pricing::parse_token_rate(&input.prompt_rate)?;
        let completion = crate::pricing::parse_token_rate(&input.completion_rate)?;
        if input.currency.len() != 3 || !input.currency.bytes().all(|b| b.is_ascii_uppercase()) {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        )
        .bind(provider)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        let vendor: Uuid =
            sqlx::query_scalar("SELECT vendor_id FROM vendor_models WHERE alias=$1 FOR SHARE")
                .bind(&input.model_alias)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(StoreError::Conflict)?;
        // Serialize offer publication against configuration ownership changes.
        sqlx::query("SELECT id FROM vendors WHERE id=$1 FOR SHARE")
            .bind(vendor)
            .fetch_one(&mut *tx)
            .await?;
        let configured_owner: Option<Uuid> = sqlx::query_scalar(
            "SELECT provider_id FROM vendor_supplier_ownership WHERE vendor_id=$1",
        )
        .bind(vendor)
        .fetch_optional(&mut *tx)
        .await?;
        if configured_owner.is_some_and(|owner| owner != provider) {
            return Err(StoreError::Conflict);
        }
        #[derive(sqlx::FromRow)]
        struct CurrentOffer {
            id: Uuid,
            provider_id: Uuid,
            current_revision: Uuid,
            vendor_id: Uuid,
            cached_prompt_rate: Option<i64>,
            reasoning_completion_rate: Option<i64>,
            cache_write_prompt_rate: Option<i64>,
        }
        let existing: Option<CurrentOffer> = sqlx::query_as("SELECT o.id,o.provider_id,o.current_revision,o.vendor_id,r.cached_prompt_rate,r.reasoning_completion_rate,r.cache_write_prompt_rate FROM provider_offers o JOIN provider_offer_revisions r ON r.id=o.current_revision WHERE o.model_alias=$1 FOR UPDATE OF o").bind(&input.model_alias).fetch_optional(&mut *tx).await?;
        let offer = match existing {
            Some(CurrentOffer {
                id,
                provider_id: owner,
                current_revision: revision,
                vendor_id: bound_vendor,
                cached_prompt_rate: prior_cached,
                reasoning_completion_rate: prior_reasoning,
                cache_write_prompt_rate: prior_written,
            }) => {
                if (prior_written.is_some() && cache_write_prompt_rate.is_none())
                    || (prior_reasoning.is_some() && reasoning_completion_rate.is_none())
                    || (prior_cached.is_some() && cached_prompt_rate.is_none())
                    || owner != provider
                    || input.expected_revision != Some(revision)
                    || bound_vendor != vendor
                {
                    return Err(StoreError::Conflict);
                }
                id
            }
            None => {
                if input.expected_revision.is_some() {
                    return Err(StoreError::Conflict);
                }
                let id = Uuid::new_v4();
                sqlx::query("INSERT INTO provider_offers(id,provider_id,model_alias,vendor_id,active) VALUES($1,$2,$3,$4,FALSE)").bind(id).bind(provider).bind(&input.model_alias).bind(vendor).execute(&mut *tx).await?;
                id
            }
        };
        let revision = Uuid::new_v4();
        sqlx::query("INSERT INTO provider_offer_revisions(id,offer_id,currency,prompt_rate,completion_rate,cached_prompt_rate,reasoning_completion_rate,cache_write_prompt_rate) VALUES($1,$2,$3,$4,$5,$6,$7,$8)").bind(revision).bind(offer).bind(&input.currency).bind(prompt).bind(completion).bind(cached).bind(reasoning).bind(written).execute(&mut *tx).await?;
        sqlx::query("UPDATE provider_offers SET current_revision=$2,active=FALSE,current_qualification_review=NULL WHERE id=$1")
            .bind(offer)
            .bind(revision)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'offer_priced',$2)").bind(provider).bind(revision).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(revision)
    }

    pub async fn set_provider_offer_active(
        &self,
        provider: Uuid,
        offer: Uuid,
        operator: Uuid,
        active: bool,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT provider_id FROM provider_memberships WHERE provider_id=$1 AND operator_id=$2 AND active AND role='manager' FOR SHARE").bind(provider).bind(operator).fetch_optional(&mut *tx).await?.ok_or(StoreError::Unauthorized)?;
        if active
            && !sqlx::query_scalar::<_, bool>(
                "SELECT niu_offer_qualification_current(provider_id,id,current_revision) FROM provider_offers WHERE provider_id=$1 AND id=$2 FOR SHARE",
            )
            .bind(provider)
            .bind(offer)
            .fetch_optional(&mut *tx)
            .await?
            .unwrap_or(false)
        {
            return Err(StoreError::AccountUnavailable);
        }
        let changed =
            sqlx::query("UPDATE provider_offers SET active=$3 WHERE provider_id=$1 AND id=$2")
                .bind(provider)
                .bind(offer)
                .bind(active)
                .execute(&mut *tx)
                .await
                .map_err(map_qualification_write_error)?
                .rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO provider_audit_events(provider_id,actor_operator_id,action,resource_id) VALUES($1,$2,$3,$4)").bind(provider).bind(operator).bind(if active {"offer_resumed"} else {"offer_paused"}).bind(offer).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Read an immutable agreed rate by its full Supplier/offer/revision identity.
    pub async fn provider_offer_revision(
        &self,
        provider: Uuid,
        offer: Uuid,
        revision: Uuid,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT jsonb_build_object(
                'revision',r.id,'model_alias',o.model_alias,'rate_kind',r.rate_kind,
                'currency',r.currency,'prompt_rate',r.prompt_rate::text,
                'completion_rate',r.completion_rate::text,
                'cached_prompt_rate',r.cached_prompt_rate::text,'reasoning_completion_rate',r.reasoning_completion_rate::text,'cache_write_prompt_rate',r.cache_write_prompt_rate::text,'created_at',r.created_at)
             FROM provider_offer_revisions r
             JOIN provider_offers o ON o.id=r.offer_id
             WHERE o.provider_id=$1 AND o.id=$2 AND r.id=$3",
        )
        .bind(provider)
        .bind(offer)
        .bind(revision)
        .fetch_optional(&self.pool)
        .await?)
    }

    /// Snapshot the agreed rate before dispatch. Route changes cannot assign another vendor's work.
    pub async fn bind_provider_offer(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        alias: &str,
        upstream: &str,
        endpoint: Option<&str>,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        Self::bind_provider_offer_in_tx(&mut tx, scope, attempt, alias, upstream, endpoint).await?;
        tx.commit().await?;
        Ok(())
    }

    pub(crate) async fn bind_provider_offer_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        attempt: Uuid,
        alias: &str,
        upstream: &str,
        endpoint: Option<&str>,
    ) -> Result<(), StoreError> {
        let offer=sqlx::query("SELECT o.id,o.provider_id,o.current_revision,o.active,o.vendor_id,m.vendor_id AS route_vendor,m.upstream_model,v.api_base,m.enabled AS model_enabled,v.enabled AS vendor_enabled,niu_offer_qualification_current(o.provider_id,o.id,o.current_revision) AS qualified FROM provider_offers o JOIN vendor_models m ON m.alias=o.model_alias JOIN vendors v ON v.id=m.vendor_id WHERE o.model_alias=$1 FOR SHARE OF o,m,v")
            .bind(alias).fetch_optional(&mut **tx).await?;
        if let Some(row) = offer {
            if !row.get::<bool, _>("model_enabled")
                || !row.get::<bool, _>("vendor_enabled")
                || !row.get::<bool, _>("active")
                || !row.get::<bool, _>("qualified")
                || row.get::<Uuid, _>("vendor_id") != row.get::<Uuid, _>("route_vendor")
                || row.get::<String, _>("upstream_model") != upstream
                || endpoint != Some(row.get::<String, _>("api_base").as_str())
            {
                return Err(StoreError::AccountUnavailable);
            }
            sqlx::query("SELECT id FROM attempts WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND execution='not_sent' FOR UPDATE").bind(attempt).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
            sqlx::query("INSERT INTO provider_attempt_offers(attempt_id,provider_id,offer_id,revision_id) VALUES($1,$2,$3,$4)").bind(attempt).bind(row.get::<Uuid,_>("provider_id")).bind(row.get::<Uuid,_>("id")).bind(row.get::<Uuid,_>("current_revision")).execute(&mut **tx).await?;
        }
        Ok(())
    }

    /// Idempotent accrual only from confirmed execution and complete trusted usage.
    pub async fn accrue_provider_earning(&self, attempt: Uuid) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        Self::accrue_provider_earning_in_tx(&mut tx, attempt).await?;
        tx.commit().await?;
        Ok(())
    }

    pub(crate) async fn accrue_provider_earning_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        attempt: Uuid,
    ) -> Result<(), StoreError> {
        let media: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM supplier_media_attempt_pricing WHERE attempt_id=$1)",
        )
        .bind(attempt)
        .fetch_one(&mut **tx)
        .await?;
        if media {
            return Self::accrue_supplier_media_earning_in_tx(tx, attempt).await;
        }
        let row=sqlx::query("SELECT b.provider_id,b.revision_id,r.currency,r.prompt_rate,r.completion_rate,r.cached_prompt_rate,r.reasoning_completion_rate,r.cache_write_prompt_rate,a.prompt_tokens,a.completion_tokens,d.cached_input_tokens,d.reasoning_output_tokens,d.cache_write_input_tokens FROM provider_attempt_offers b JOIN attempts a ON a.id=b.attempt_id LEFT JOIN request_token_categories d ON d.attempt_id=a.id JOIN provider_offer_revisions r ON r.id=b.revision_id WHERE a.id=$1 AND r.rate_kind='text' AND a.execution='confirmed_completed' AND a.usage_confidence='provider_reported'")
            .bind(attempt).fetch_optional(&mut **tx).await?;
        if let Some(row) = row {
            let prompt: i64 = row.get("prompt_tokens");
            let completion: i64 = row.get("completion_tokens");
            let rates = TokenRates {
                prompt: row.get("prompt_rate"),
                completion: row.get("completion_rate"),
            };
            let cached = match row.get::<Option<i64>, _>("cached_prompt_rate") {
                Some(rate) => Some((
                    row.get::<Option<i64>, _>("cached_input_tokens")
                        .ok_or(StoreError::Unresolved)?,
                    rate,
                )),
                None => None,
            };
            let reasoning = match row.get::<Option<i64>, _>("reasoning_completion_rate") {
                Some(rate) => Some((
                    row.get::<Option<i64>, _>("reasoning_output_tokens")
                        .ok_or(StoreError::Unresolved)?,
                    rate,
                )),
                None => None,
            };
            let written = match row.get::<Option<i64>, _>("cache_write_prompt_rate") {
                Some(rate) => Some((
                    row.get::<Option<i64>, _>("cache_write_input_tokens")
                        .ok_or(StoreError::Unresolved)?,
                    rate,
                )),
                None => None,
            };
            let amount =
                rates.charge_with_cache_write(prompt, completion, cached, written, reasoning)?;
            let written_tokens = written.map(|(quantity, _)| quantity);
            let cached_tokens = cached.map(|(quantity, _)| quantity);
            let reasoning_tokens = reasoning.map(|(quantity, _)| quantity);
            sqlx::query("INSERT INTO provider_earnings(attempt_id,provider_id,revision_id,currency,amount_nanos,prompt_tokens,completion_tokens,cached_prompt_tokens,reasoning_completion_tokens,cache_write_prompt_tokens) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(attempt_id) DO NOTHING")
                .bind(attempt).bind(row.get::<Uuid,_>("provider_id")).bind(row.get::<Uuid,_>("revision_id")).bind(row.get::<String,_>("currency")).bind(amount).bind(prompt).bind(completion).bind(cached_tokens).bind(reasoning_tokens).bind(written_tokens).execute(&mut **tx).await?;
        }
        Ok(())
    }

    pub async fn recover_provider_earnings(
        &self,
        after: Option<Uuid>,
    ) -> Result<(Option<Uuid>, usize), StoreError> {
        Ok(self
            .recover_financial_stage(
                crate::financial_recovery::FinancialStage::SupplierEarning,
                Some(after),
            )
            .await?
            .unwrap_or((after, 0)))
    }

    /// Record payment of explicit earned entries, serialized per supplier and replay-safe.
    pub async fn record_provider_settlement(
        &self,
        provider: Uuid,
        key: Uuid,
        reference: &str,
        attempts: &[Uuid],
    ) -> Result<Uuid, StoreError> {
        if !valid_text(reference, 200) || attempts.is_empty() || attempts.len() > 1000 {
            return Err(StoreError::InvalidPrice);
        }
        let mut sorted = attempts.to_vec();
        sorted.sort();
        sorted.dedup();
        if sorted.len() != attempts.len() {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        )
        .bind(provider)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        if let Some((id,prior))=sqlx::query_as::<_,(Uuid,String)>("SELECT id,payment_reference FROM provider_settlements WHERE provider_id=$1 AND idempotency_key=$2").bind(provider).bind(key).fetch_optional(&mut *tx).await? {
            let entries:Vec<Uuid>=sqlx::query_scalar("SELECT attempt_id FROM provider_settlement_entries WHERE settlement_id=$1 ORDER BY attempt_id").bind(id).fetch_all(&mut *tx).await?;
            if prior!=reference || entries!=sorted {return Err(StoreError::Conflict);}
            return Ok(id);
        }
        let rows=sqlx::query("SELECT e.attempt_id,e.currency,e.amount_nanos FROM provider_earnings e WHERE e.provider_id=$1 AND e.attempt_id=ANY($2) AND NOT EXISTS(SELECT 1 FROM provider_settlement_entries s WHERE s.attempt_id=e.attempt_id)").bind(provider).bind(&sorted).fetch_all(&mut *tx).await?;
        if rows.len() != sorted.len() {
            return Err(StoreError::Conflict);
        }
        let currency: String = rows[0].get("currency");
        let mut amount = 0i64;
        for row in &rows {
            if row.get::<String, _>("currency") != currency {
                return Err(StoreError::InvalidPrice);
            }
            amount = amount
                .checked_add(row.get("amount_nanos"))
                .ok_or(StoreError::AggregateOverflow)?;
        }
        if amount == 0 {
            return Err(StoreError::InvalidPrice);
        }
        let duplicate:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM provider_settlements WHERE provider_id=$1 AND payment_reference=$2)").bind(provider).bind(reference).fetch_one(&mut *tx).await?;
        if duplicate {
            return Err(StoreError::Conflict);
        }
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO provider_settlements(id,provider_id,currency,amount_nanos,payment_reference,idempotency_key) VALUES($1,$2,$3,$4,$5,$6)").bind(id).bind(provider).bind(currency).bind(amount).bind(reference).bind(key).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO provider_settlement_entries(provider_id,settlement_id,attempt_id) SELECT $1,$2,unnest($3::uuid[])").bind(provider).bind(id).bind(sorted).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'external_payment_recorded',$2)").bind(provider).bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(id)
    }

    pub async fn provider_dashboard(&self, provider: Uuid, days: i32) -> Result<Value, StoreError> {
        if ![7, 30, 90].contains(&days) {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            .execute(&mut *tx)
            .await?;
        let name: String = sqlx::query_scalar(
            "SELECT name FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL",
        )
        .bind(provider)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        let balances:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('currency',e.currency,'earned_nanos',SUM(e.amount_nanos)::text,'unpaid_nanos',SUM(CASE WHEN s.attempt_id IS NULL THEN e.amount_nanos ELSE 0 END)::text,'paid_nanos',SUM(CASE WHEN s.attempt_id IS NOT NULL THEN e.amount_nanos ELSE 0 END)::text,'period_nanos',COALESCE(SUM(e.amount_nanos) FILTER(WHERE e.created_at>=now()-make_interval(days=>$2)),0)::text) FROM provider_earnings e LEFT JOIN provider_settlement_entries s ON s.attempt_id=e.attempt_id WHERE e.provider_id=$1 GROUP BY e.currency ORDER BY e.currency").bind(provider).bind(days).fetch_all(&mut *tx).await?;
        let traffic:Value=sqlx::query_scalar("SELECT jsonb_build_object('requests',COUNT(*)::text,'completed',COUNT(*) FILTER(WHERE a.execution='confirmed_completed')::text,'unresolved',COUNT(*) FILTER(WHERE e.attempt_id IS NULL)::text,'prompt_tokens',COALESCE(SUM(a.prompt_tokens),0)::text,'completion_tokens',COALESCE(SUM(a.completion_tokens),0)::text) FROM provider_attempt_offers b JOIN attempts a ON a.id=b.attempt_id LEFT JOIN provider_earnings e ON e.attempt_id=a.id WHERE b.provider_id=$1 AND a.dispatched_at>=now()-make_interval(days=>$2)").bind(provider).bind(days).fetch_one(&mut *tx).await?;
        let daily:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('day',to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD'),'currency',currency,'amount_nanos',SUM(amount_nanos)::text) FROM provider_earnings e WHERE provider_id=$1 AND created_at>=now()-make_interval(days=>$2) GROUP BY currency, to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD') ORDER BY to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD')")
            .bind(provider).bind(days).fetch_all(&mut *tx).await?;
        let offer_page =
            crate::provider_offer_history::read_offer_page(&mut tx, provider, None, 1000)
                .await?
                .ok_or(StoreError::Conflict)?;
        let offers = &offer_page["data"];
        let offers_has_more = !offer_page["next_after"].is_null();
        let earnings:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',e.attempt_id,'model_alias',o.model_alias,'currency',e.currency,'amount_nanos',e.amount_nanos::text,'prompt_tokens',e.prompt_tokens::text,'completion_tokens',e.completion_tokens::text,'billing_meter',e.billing_meter,'meter_quantity',e.meter_quantity,'created_at',e.created_at,'status',CASE WHEN s.attempt_id IS NULL THEN 'accrued' ELSE 'paid' END) FROM provider_earnings e JOIN provider_attempt_offers b ON b.attempt_id=e.attempt_id JOIN provider_offers o ON o.id=b.offer_id LEFT JOIN provider_settlement_entries s ON s.attempt_id=e.attempt_id WHERE e.provider_id=$1 AND e.created_at>=now()-make_interval(days=>$2) ORDER BY e.created_at DESC,e.attempt_id LIMIT 100").bind(provider).bind(days).fetch_all(&mut *tx).await?;
        let settlements:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',id,'currency',currency,'amount_nanos',amount_nanos::text,'payment_reference',payment_reference,'created_at',created_at) FROM provider_settlements WHERE provider_id=$1 ORDER BY created_at DESC,id LIMIT 100").bind(provider).fetch_all(&mut *tx).await?;
        let consumption:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('model_alias',o.model_alias,'revision',r.id,'currency',e.currency,'prompt_rate',r.prompt_rate::text,'completion_rate',r.completion_rate::text,'cached_prompt_rate',r.cached_prompt_rate::text,'reasoning_completion_rate',r.reasoning_completion_rate::text,'cache_write_prompt_rate',r.cache_write_prompt_rate::text,'requests',COUNT(*)::text,'prompt_tokens',SUM(e.prompt_tokens)::text,'completion_tokens',SUM(e.completion_tokens)::text,'cached_prompt_tokens',SUM(e.cached_prompt_tokens)::text,'reasoning_completion_tokens',SUM(e.reasoning_completion_tokens)::text,'cache_write_prompt_tokens',SUM(e.cache_write_prompt_tokens)::text,'amount_nanos',SUM(e.amount_nanos)::text,'unpaid_nanos',SUM(CASE WHEN s.attempt_id IS NULL THEN e.amount_nanos ELSE 0 END)::text) FROM provider_earnings e JOIN provider_attempt_offers b ON b.attempt_id=e.attempt_id JOIN provider_offers o ON o.id=b.offer_id JOIN provider_offer_revisions r ON r.id=e.revision_id LEFT JOIN provider_settlement_entries s ON s.attempt_id=e.attempt_id WHERE e.provider_id=$1 AND e.billing_meter='text_tokens' AND e.created_at>=now()-make_interval(days=>$2) GROUP BY o.model_alias,r.id,r.prompt_rate,r.completion_rate,e.currency ORDER BY o.model_alias,r.id").bind(provider).bind(days).fetch_all(&mut *tx).await?;
        let media_consumption:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('model_alias',o.model_alias,'meter',e.billing_meter,'currency',e.currency,'rate_revision',p.rate_revision,'resolution',p.snapshot->'tariff'->'dimensions'->>'resolution','reference_video',p.snapshot->'tariff'->'dimensions'->'reference_video','amount_units',p.snapshot->'tariff'->>'amount_units','decimal_places',p.snapshot->'tariff'->'decimal_places','per_quantity',p.snapshot->'tariff'->'per_quantity','requests',COUNT(*)::text,'quantity',SUM((e.meter_quantity->>'numerator')::numeric)::text,'amount_nanos',SUM(e.amount_nanos)::text,'unpaid_nanos',SUM(CASE WHEN s.attempt_id IS NULL THEN e.amount_nanos ELSE 0 END)::text) FROM provider_earnings e JOIN supplier_media_attempt_pricing p ON p.attempt_id=e.attempt_id JOIN provider_attempt_offers b ON b.attempt_id=e.attempt_id JOIN provider_offers o ON o.id=b.offer_id LEFT JOIN provider_settlement_entries s ON s.attempt_id=e.attempt_id WHERE e.provider_id=$1 AND e.billing_meter<>'text_tokens' AND e.created_at>=now()-make_interval(days=>$2) GROUP BY o.model_alias,e.billing_meter,e.currency,p.rate_revision,p.snapshot ORDER BY o.model_alias,p.rate_revision").bind(provider).bind(days).fetch_all(&mut *tx).await?;
        tx.commit().await?;
        Ok(
            json!({"id":provider,"name":name,"days":days,"balances":balances,"traffic":traffic,"daily":daily,"offers":offers,"offers_has_more":offers_has_more,"earnings":earnings,"consumption":consumption,"media_consumption":media_consumption,"settlements":settlements}),
        )
    }
}
