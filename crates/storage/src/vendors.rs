use crate::{Store, StoreError};
use serde::Serialize;
use serde_json::Value;
use sqlx::{FromRow, Postgres, Transaction};
use std::net::IpAddr;
use url::Url;
use uuid::Uuid;

const VENDOR_COLUMNS: &str = "id,name,adapter,api_base,enabled,revision,(credential_ciphertext IS NOT NULL) AS has_credential";
const MODEL_COLUMNS: &str =
    "alias,vendor_id,upstream_model,public_catalog,enabled,capabilities,pricing,revision";
const MAX_JSON_BYTES: usize = 16 * 1024;

pub struct VendorInput {
    pub id: Uuid,
    pub name: String,
    pub adapter: String,
    pub api_base: String,
    pub enabled: bool,
    pub credential_ciphertext: Vec<u8>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct VendorView {
    pub id: Uuid,
    pub name: String,
    pub adapter: String,
    pub api_base: String,
    pub enabled: bool,
    pub revision: i64,
    pub has_credential: bool,
}

pub struct VendorUpdate {
    pub name: String,
    pub api_base: String,
    pub enabled: bool,
    pub credential_ciphertext: Option<Vec<u8>>,
    pub expected_revision: i64,
}

pub struct VendorModelInput {
    pub alias: String,
    pub upstream_model: String,
    pub public_catalog: bool,
    pub enabled: bool,
    pub capabilities: Value,
    pub pricing: Option<Value>,
    pub expected_revision: Option<i64>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct VendorModelView {
    pub alias: String,
    pub vendor_id: Uuid,
    pub upstream_model: String,
    pub public_catalog: bool,
    pub enabled: bool,
    pub capabilities: Value,
    pub pricing: Option<Value>,
    pub revision: i64,
}

/// Internal route resolution result. It deliberately has neither `Serialize`
/// nor `Debug`, because it carries encrypted vendor credentials.
pub struct VendorRoute {
    pub model: VendorModelView,
    pub vendor: VendorView,
    pub credential_ciphertext: Vec<u8>,
}

#[derive(FromRow)]
struct VendorRouteRow {
    alias: String,
    model_vendor_id: Uuid,
    upstream_model: String,
    public_catalog: bool,
    model_enabled: bool,
    capabilities: Value,
    pricing: Option<Value>,
    model_revision: i64,
    vendor_id: Uuid,
    vendor_name: String,
    adapter: String,
    api_base: String,
    vendor_enabled: bool,
    vendor_revision: i64,
    has_credential: bool,
    credential_ciphertext: Vec<u8>,
}

impl VendorRouteRow {
    fn into_route(self) -> VendorRoute {
        VendorRoute {
            model: VendorModelView {
                alias: self.alias,
                vendor_id: self.model_vendor_id,
                upstream_model: self.upstream_model,
                public_catalog: self.public_catalog,
                enabled: self.model_enabled,
                capabilities: self.capabilities,
                pricing: self.pricing,
                revision: self.model_revision,
            },
            vendor: VendorView {
                id: self.vendor_id,
                name: self.vendor_name,
                adapter: self.adapter,
                api_base: self.api_base,
                enabled: self.vendor_enabled,
                revision: self.vendor_revision,
                has_credential: self.has_credential,
            },
            credential_ciphertext: self.credential_ciphertext,
        }
    }
}

impl Store {
    pub async fn vendors(&self) -> Result<Vec<VendorView>, StoreError> {
        let query = format!("SELECT {VENDOR_COLUMNS} FROM vendors ORDER BY name,id LIMIT 1000");
        Ok(sqlx::query_as::<_, VendorView>(&query)
            .fetch_all(&self.pool)
            .await?)
    }

    pub async fn vendor(&self, id: Uuid) -> Result<Option<VendorView>, StoreError> {
        let query = format!("SELECT {VENDOR_COLUMNS} FROM vendors WHERE id=$1");
        Ok(sqlx::query_as::<_, VendorView>(&query)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?)
    }

    pub async fn vendor_by_name(&self, name: &str) -> Result<Option<VendorView>, StoreError> {
        let bootstrap_query =
            format!("SELECT {VENDOR_COLUMNS} FROM vendors WHERE bootstrap_name=$1");
        if let Some(vendor) = sqlx::query_as::<_, VendorView>(&bootstrap_query)
            .bind(name)
            .fetch_optional(&self.pool)
            .await?
        {
            return Ok(Some(vendor));
        }
        let query = format!("SELECT {VENDOR_COLUMNS} FROM vendors WHERE name=$1");
        Ok(sqlx::query_as::<_, VendorView>(&query)
            .bind(name)
            .fetch_optional(&self.pool)
            .await?)
    }

    pub async fn create_vendor(&self, input: VendorInput) -> Result<VendorView, StoreError> {
        validate_vendor(&input)?;
        let mut transaction = self.pool.begin().await?;
        let query = format!(
            "INSERT INTO vendors(id,name,adapter,api_base,enabled,credential_ciphertext) \
             VALUES($1,$2,$3,$4,$5,$6) RETURNING {VENDOR_COLUMNS}"
        );
        let vendor = sqlx::query_as::<_, VendorView>(&query)
            .bind(input.id)
            .bind(&input.name)
            .bind(&input.adapter)
            .bind(&input.api_base)
            .bind(input.enabled)
            .bind(&input.credential_ciphertext)
            .fetch_one(&mut *transaction)
            .await
            .map_err(map_vendor_write_error)?;
        insert_audit(
            &mut transaction,
            vendor.id,
            None,
            "vendor_created",
            vendor.revision,
        )
        .await?;
        transaction.commit().await?;
        Ok(vendor)
    }

    pub async fn update_vendor(
        &self,
        id: Uuid,
        update: VendorUpdate,
    ) -> Result<VendorView, StoreError> {
        validate_vendor_update(&update)?;
        let mut transaction = self.pool.begin().await?;
        let query = format!(
            "UPDATE vendors SET name=$1,api_base=$2,enabled=$3, \
             credential_ciphertext=COALESCE($4,credential_ciphertext), \
             revision=revision+1,updated_at=now() \
             WHERE id=$5 AND revision=$6 RETURNING {VENDOR_COLUMNS}"
        );
        let vendor = sqlx::query_as::<_, VendorView>(&query)
            .bind(&update.name)
            .bind(&update.api_base)
            .bind(update.enabled)
            .bind(update.credential_ciphertext.as_deref())
            .bind(id)
            .bind(update.expected_revision)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(map_vendor_write_error)?
            .ok_or(StoreError::Conflict)?;
        insert_audit(
            &mut transaction,
            vendor.id,
            None,
            "vendor_updated",
            vendor.revision,
        )
        .await?;
        transaction.commit().await?;
        Ok(vendor)
    }

    pub async fn vendor_models(&self, id: Uuid) -> Result<Vec<VendorModelView>, StoreError> {
        let query = format!(
            "SELECT {MODEL_COLUMNS} FROM vendor_models WHERE vendor_id=$1 ORDER BY alias LIMIT 1000"
        );
        Ok(sqlx::query_as::<_, VendorModelView>(&query)
            .bind(id)
            .fetch_all(&self.pool)
            .await?)
    }

    pub async fn upsert_vendor_model(
        &self,
        vendor_id: Uuid,
        input: VendorModelInput,
    ) -> Result<VendorModelView, StoreError> {
        validate_model(&input)?;
        let mut transaction = self.pool.begin().await?;
        let (model, action) = match input.expected_revision {
            None => {
                let query = format!(
                    "INSERT INTO vendor_models(alias,vendor_id,upstream_model,public_catalog,enabled,capabilities,pricing) \
                     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING {MODEL_COLUMNS}"
                );
                let model = sqlx::query_as::<_, VendorModelView>(&query)
                    .bind(&input.alias)
                    .bind(vendor_id)
                    .bind(&input.upstream_model)
                    .bind(input.public_catalog)
                    .bind(input.enabled)
                    .bind(&input.capabilities)
                    .bind(&input.pricing)
                    .fetch_one(&mut *transaction)
                    .await
                    .map_err(map_vendor_write_error)?;
                (model, "vendor_model_created")
            }
            Some(expected_revision) => {
                let query = format!(
                    "UPDATE vendor_models SET upstream_model=$1,public_catalog=$2,enabled=$3, \
                     capabilities=$4,pricing=$5,revision=revision+1,updated_at=now() \
                     WHERE alias=$6 AND vendor_id=$7 AND revision=$8 RETURNING {MODEL_COLUMNS}"
                );
                let model = sqlx::query_as::<_, VendorModelView>(&query)
                    .bind(&input.upstream_model)
                    .bind(input.public_catalog)
                    .bind(input.enabled)
                    .bind(&input.capabilities)
                    .bind(&input.pricing)
                    .bind(&input.alias)
                    .bind(vendor_id)
                    .bind(expected_revision)
                    .fetch_optional(&mut *transaction)
                    .await
                    .map_err(map_vendor_write_error)?
                    .ok_or(StoreError::Conflict)?;
                (model, "vendor_model_updated")
            }
        };
        insert_audit(
            &mut transaction,
            vendor_id,
            Some(&model.alias),
            action,
            model.revision,
        )
        .await?;
        transaction.commit().await?;
        Ok(model)
    }

    /// Resolve stored database routes whether enabled or disabled. Callers must
    /// inspect both enabled flags before dispatch; retaining disabled records
    /// prevents an older static alias from silently becoming active again.
    pub async fn vendor_route(&self, alias: &str) -> Result<Option<VendorRoute>, StoreError> {
        let query = route_query("WHERE m.alias=$1");
        Ok(sqlx::query_as::<_, VendorRouteRow>(&query)
            .bind(alias)
            .fetch_optional(&self.pool)
            .await?
            .map(VendorRouteRow::into_route))
    }

    /// Return disabled routes too so the caller can shadow same-named static
    /// entries and make disabled database configuration fail closed.
    pub async fn all_vendor_routes(&self) -> Result<Vec<VendorRoute>, StoreError> {
        let query = route_query("");
        Ok(sqlx::query_as::<_, VendorRouteRow>(&query)
            .fetch_all(&self.pool)
            .await?
            .into_iter()
            .map(VendorRouteRow::into_route)
            .collect())
    }

    /// Import the initial shared vendor once. Its immutable bootstrap name
    /// survives administrative renames, so restarts never recreate or reset
    /// administrator-owned records or refill missing model aliases.
    pub async fn seed_vendor(
        &self,
        input: VendorInput,
        models: Vec<VendorModelInput>,
    ) -> Result<(), StoreError> {
        validate_vendor(&input)?;
        for model in &models {
            validate_model(model)?;
            if model.expected_revision.is_some() {
                return Err(StoreError::InvalidVendor);
            }
        }

        let mut transaction = self.pool.begin().await?;
        let query = format!(
            "INSERT INTO vendors(id,name,bootstrap_name,adapter,api_base,enabled,credential_ciphertext) \
             VALUES($1,$2,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING \
             RETURNING {VENDOR_COLUMNS}"
        );
        let vendor = sqlx::query_as::<_, VendorView>(&query)
            .bind(input.id)
            .bind(&input.name)
            .bind(&input.adapter)
            .bind(&input.api_base)
            .bind(input.enabled)
            .bind(&input.credential_ciphertext)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(map_vendor_write_error)?;

        let Some(vendor) = vendor else {
            let already_seeded: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM vendors WHERE name=$1 OR bootstrap_name=$1)",
            )
            .bind(&input.name)
            .fetch_one(&mut *transaction)
            .await?;
            if !already_seeded {
                return Err(StoreError::Conflict);
            }
            transaction.commit().await?;
            return Ok(());
        };
        insert_audit(
            &mut transaction,
            vendor.id,
            None,
            "vendor_seeded",
            vendor.revision,
        )
        .await?;

        let insert_model = format!(
            "INSERT INTO vendor_models(alias,vendor_id,upstream_model,public_catalog,enabled,capabilities,pricing) \
             VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING {MODEL_COLUMNS}"
        );
        for input in models {
            let model = sqlx::query_as::<_, VendorModelView>(&insert_model)
                .bind(&input.alias)
                .bind(vendor.id)
                .bind(&input.upstream_model)
                .bind(input.public_catalog)
                .bind(input.enabled)
                .bind(&input.capabilities)
                .bind(&input.pricing)
                .fetch_one(&mut *transaction)
                .await
                .map_err(map_vendor_write_error)?;
            insert_audit(
                &mut transaction,
                vendor.id,
                Some(&model.alias),
                "vendor_model_seeded",
                model.revision,
            )
            .await?;
        }

        transaction.commit().await?;
        Ok(())
    }
}

async fn insert_audit(
    transaction: &mut Transaction<'_, Postgres>,
    vendor_id: Uuid,
    alias: Option<&str>,
    action: &str,
    revision: i64,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO vendor_audit_events(vendor_id,model_alias,action,revision,actor_kind) \
         VALUES($1,$2,$3,$4,'installation')",
    )
    .bind(vendor_id)
    .bind(alias)
    .bind(action)
    .bind(revision)
    .execute(&mut **transaction)
    .await
    .map_err(map_vendor_write_error)?;
    Ok(())
}

fn route_query(filter: &str) -> String {
    format!(
        "SELECT m.alias,m.vendor_id AS model_vendor_id,m.upstream_model, \
         m.public_catalog,m.enabled AS model_enabled,m.capabilities,m.pricing, \
         m.revision AS model_revision,v.id AS vendor_id,v.name AS vendor_name, \
         v.adapter,v.api_base,v.enabled AS vendor_enabled,v.revision AS vendor_revision, \
         (v.credential_ciphertext IS NOT NULL) AS has_credential,v.credential_ciphertext \
         FROM vendor_models m JOIN vendors v ON v.id=m.vendor_id {filter} ORDER BY m.alias"
    )
}

fn validate_vendor(input: &VendorInput) -> Result<(), StoreError> {
    validate_vendor_fields(&input.name, &input.adapter, &input.api_base)?;
    if !(30..=16_384).contains(&input.credential_ciphertext.len()) {
        return Err(StoreError::InvalidVendor);
    }
    Ok(())
}

fn validate_vendor_update(update: &VendorUpdate) -> Result<(), StoreError> {
    validate_text(&update.name, 100)?;
    validate_api_base(&update.api_base)?;
    if update.expected_revision < 1
        || update
            .credential_ciphertext
            .as_ref()
            .is_some_and(|value| !(30..=16_384).contains(&value.len()))
    {
        return Err(StoreError::InvalidVendor);
    }
    Ok(())
}

fn validate_vendor_fields(name: &str, adapter: &str, api_base: &str) -> Result<(), StoreError> {
    validate_text(name, 100)?;
    if !matches!(adapter, "openrouter" | "openai") {
        return Err(StoreError::InvalidVendor);
    }
    validate_api_base(api_base)
}

fn validate_api_base(value: &str) -> Result<(), StoreError> {
    validate_text(value, 2048)?;
    let Ok(url) = Url::parse(value) else {
        return Err(StoreError::InvalidVendor);
    };
    let host = url.host_str().unwrap_or_default();
    let local_http = url.scheme() == "http" && is_loopback_host(host);
    if (url.scheme() != "https" && !local_http)
        || host.is_empty()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(StoreError::InvalidVendor);
    }
    Ok(())
}

fn is_loopback_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost")
        || host
            .trim_matches(['[', ']'])
            .parse::<IpAddr>()
            .is_ok_and(|address| address.is_loopback())
}

fn validate_model(input: &VendorModelInput) -> Result<(), StoreError> {
    validate_text(&input.alias, 200)?;
    validate_text(&input.upstream_model, 200)?;
    if !input.capabilities.is_object()
        || json_size(&input.capabilities) > MAX_JSON_BYTES
        || input
            .pricing
            .as_ref()
            .is_some_and(|value| !value.is_object() || json_size(value) > MAX_JSON_BYTES)
        || input.expected_revision.is_some_and(|revision| revision < 1)
    {
        return Err(StoreError::InvalidVendor);
    }
    Ok(())
}

fn validate_text(value: &str, max_chars: usize) -> Result<(), StoreError> {
    if value.trim().is_empty()
        || value.trim() != value
        || value.chars().count() > max_chars
        || value.chars().any(char::is_control)
    {
        return Err(StoreError::InvalidVendor);
    }
    Ok(())
}

fn json_size(value: &Value) -> usize {
    value.to_string().len()
}

fn map_vendor_write_error(error: sqlx::Error) -> StoreError {
    if error.as_database_error().is_some_and(|database_error| {
        database_error
            .code()
            .is_some_and(|code| matches!(code.as_ref(), "23503" | "23505"))
    }) {
        StoreError::Conflict
    } else {
        StoreError::Database(error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_base_accepts_https_and_loopback_http_only() {
        for value in [
            "https://openrouter.ai/api/v1",
            "http://localhost:4010/v1",
            "http://127.0.0.1:4010/v1",
            "http://[::1]:4010/v1",
        ] {
            assert!(validate_api_base(value).is_ok(), "rejected {value}");
        }

        for value in [
            "http://api.example.test/v1",
            "http://192.0.2.1/v1",
            "ftp://localhost/file",
            "https://user:secret@example.test/v1",
            "https://example.test/v1?token=secret",
            "https://example.test/v1#fragment",
        ] {
            assert!(validate_api_base(value).is_err(), "accepted {value}");
        }
    }

    #[test]
    fn credential_ciphertext_matches_crypto_envelope_bounds() {
        assert!(
            validate_vendor(&VendorInput {
                id: Uuid::nil(),
                name: "OpenRouter".to_owned(),
                adapter: "openrouter".to_owned(),
                api_base: "https://openrouter.ai/api/v1".to_owned(),
                enabled: true,
                credential_ciphertext: vec![0; 30],
            })
            .is_ok()
        );
        assert!(
            validate_vendor(&VendorInput {
                id: Uuid::nil(),
                name: "OpenRouter".to_owned(),
                adapter: "openrouter".to_owned(),
                api_base: "https://openrouter.ai/api/v1".to_owned(),
                enabled: true,
                credential_ciphertext: vec![0; 29],
            })
            .is_err()
        );
    }
}
