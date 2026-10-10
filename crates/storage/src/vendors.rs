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
    /// Internal ownership from the same statement snapshot as this route.
    pub personal_organization_id: Option<Uuid>,
}

/// Server-only catalog inputs from a single database snapshot. Like VendorRoute,
/// this must not implement Serialize or Debug: routes contain encrypted secrets.
pub struct VendorCatalogInputs {
    pub routes: Vec<VendorRoute>,
    pub unavailable: std::collections::BTreeSet<String>,
    pub pools: Vec<crate::ModelRoutePool>,
    pub cooling_down: std::collections::BTreeSet<Uuid>,
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
    personal_organization_id: Option<Uuid>,
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
            personal_organization_id: self.personal_organization_id,
        }
    }
}

impl Store {
    /// Assign an installation-managed personal credential to one account.
    /// This does not activate routes, qualify commercial offers or grant credit.
    pub async fn assign_personal_vendor_owner(
        &self,
        vendor: Uuid,
        organization: Uuid,
        expected_revision: i64,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let revision: i64 =
            sqlx::query_scalar("SELECT revision FROM vendors WHERE id=$1 FOR UPDATE")
                .bind(vendor)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(StoreError::Conflict)?;
        let existing: Option<Uuid> = sqlx::query_scalar(
            "SELECT organization_id FROM personal_vendor_ownership WHERE vendor_id=$1",
        )
        .bind(vendor)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(existing) = existing {
            if existing != organization {
                return Err(StoreError::Conflict);
            }
            tx.commit().await?;
            return Ok(());
        }
        if revision != expected_revision {
            return Err(StoreError::Conflict);
        }
        // Model publication takes a shared vendor lock before checking ownership.
        // Our exclusive lock makes price removal and ownership assignment atomic
        // with respect to concurrent model configuration changes.
        let priced: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM vendor_models WHERE vendor_id=$1 AND pricing IS NOT NULL)",
        )
        .bind(vendor)
        .fetch_one(&mut *tx)
        .await?;
        if priced {
            return Err(StoreError::Conflict);
        }
        sqlx::query(
            "INSERT INTO personal_vendor_ownership(vendor_id,organization_id) VALUES($1,$2)",
        )
        .bind(vendor)
        .bind(organization)
        .execute(&mut *tx)
        .await
        .map_err(map_vendor_write_error)?;
        sqlx::query("UPDATE vendors SET revision=revision+1,updated_at=now() WHERE id=$1")
            .bind(vendor)
            .execute(&mut *tx)
            .await?;
        insert_audit(
            &mut tx,
            vendor,
            None,
            "personal_owner_assigned",
            revision + 1,
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Routing metadata only; never returns encrypted or plaintext credentials.
    pub async fn personal_vendor_organization(
        &self,
        vendor: Uuid,
    ) -> Result<Option<Uuid>, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT organization_id FROM personal_vendor_ownership WHERE vendor_id=$1",
        )
        .bind(vendor)
        .fetch_optional(&self.pool)
        .await?)
    }

    /// Compatibility list without pagination: never silently omit saved configurations.
    pub async fn vendors(&self) -> Result<Vec<VendorView>, StoreError> {
        let query = format!("SELECT {VENDOR_COLUMNS} FROM vendors ORDER BY name,id");
        Ok(sqlx::query_as::<_, VendorView>(&query)
            .fetch_all(&self.pool)
            .await?)
    }

    /// Read all matching credential configurations without returning encrypted keys.
    /// This compatibility contract has no continuation cursor.
    pub async fn vendors_with_supplier(
        &self,
        supplier: Option<Uuid>,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT jsonb_build_object('id',v.id,'name',v.name,'adapter',v.adapter,             'api_base',v.api_base,'enabled',v.enabled,'revision',v.revision,             'has_credential',v.credential_ciphertext IS NOT NULL, 'owner_funded',EXISTS (SELECT 1 FROM personal_vendor_ownership po WHERE po.vendor_id=v.id),             'supplier',CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'name',p.name) END)              FROM vendors v LEFT JOIN vendor_supplier_ownership o ON o.vendor_id=v.id              LEFT JOIN provider_businesses p ON p.id=o.provider_id              WHERE ($1::uuid IS NULL OR p.id=$1) ORDER BY p.name NULLS LAST,v.name,v.id"
        ).bind(supplier).fetch_all(&self.pool).await?)
    }

    pub async fn supplier_vendors(&self, supplier: Uuid) -> Result<Vec<VendorView>, StoreError> {
        let query = format!(
            "SELECT {VENDOR_COLUMNS} FROM vendors WHERE id IN (SELECT vendor_id FROM vendor_supplier_ownership WHERE provider_id=$1) ORDER BY name,id"
        );
        Ok(sqlx::query_as::<_, VendorView>(&query)
            .bind(supplier)
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

    /// Page retained inference credentials for internal startup validation.
    /// Never return these ciphertexts in API responses or logs.
    pub async fn vendor_credential_page(
        &self,
        after: Option<Uuid>,
    ) -> Result<Vec<(Uuid, Vec<u8>)>, StoreError> {
        // Startup validation must include disabled and model-less Suppliers.
        // Keep ciphertext bounded and internal; never expose it through APIs.
        Ok(sqlx::query_as(
            "SELECT id,credential_ciphertext FROM vendors
             WHERE credential_ciphertext IS NOT NULL AND ($1::uuid IS NULL OR id>$1)
             ORDER BY id LIMIT 100",
        )
        .bind(after)
        .fetch_all(&self.pool)
        .await?)
    }

    /// Return a vendor's encrypted credential for a server-side provider call.
    /// The ciphertext must never be returned by an API response or logged.
    pub async fn vendor_credential_ciphertext(
        &self,
        id: Uuid,
    ) -> Result<Option<Vec<u8>>, StoreError> {
        let row: Option<(Option<Vec<u8>>,)> =
            sqlx::query_as("SELECT credential_ciphertext FROM vendors WHERE id=$1")
                .bind(id)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.and_then(|(ciphertext,)| ciphertext))
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

    pub async fn vendor_supplier(&self, vendor: Uuid) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('id',p.id,'name',p.name) FROM vendor_supplier_ownership o JOIN provider_businesses p ON p.id=o.provider_id WHERE o.vendor_id=$1")
            .bind(vendor).fetch_optional(&self.pool).await?)
    }

    pub async fn associate_vendor_supplier(
        &self,
        vendor: Uuid,
        supplier: Uuid,
        expected_revision: i64,
    ) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let revision: i64 =
            sqlx::query_scalar("SELECT revision FROM vendors WHERE id=$1 FOR UPDATE")
                .bind(vendor)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(StoreError::Conflict)?;
        let existing: Option<Uuid> = sqlx::query_scalar(
            "SELECT provider_id FROM vendor_supplier_ownership WHERE vendor_id=$1",
        )
        .bind(vendor)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(existing) = existing {
            if existing != supplier {
                return Err(StoreError::Conflict);
            }
            tx.commit().await?;
            return Ok(());
        }
        if revision != expected_revision {
            return Err(StoreError::Conflict);
        }
        let conflicting_offer: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM provider_offers WHERE vendor_id=$1 AND provider_id<>$2)",
        )
        .bind(vendor)
        .bind(supplier)
        .fetch_one(&mut *tx)
        .await?;
        if conflicting_offer {
            return Err(StoreError::Conflict);
        }

        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL)",
        )
        .bind(supplier)
        .fetch_one(&mut *tx)
        .await?;
        if !exists {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO vendor_supplier_ownership(vendor_id,provider_id) VALUES($1,$2)")
            .bind(vendor)
            .bind(supplier)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE vendors SET revision=revision+1,updated_at=now() WHERE id=$1")
            .bind(vendor)
            .execute(&mut *tx)
            .await?;
        insert_audit(&mut tx, vendor, None, "supplier_associated", revision + 1).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn create_vendor(&self, input: VendorInput) -> Result<VendorView, StoreError> {
        self.create_vendor_with_supplier(input, false).await
    }

    /// Opt-in business creation shares the configuration transaction: a failed
    /// configuration write cannot leave an orphan Supplier or ownership record.
    pub async fn create_vendor_with_supplier(
        &self,
        input: VendorInput,
        create_supplier: bool,
    ) -> Result<VendorView, StoreError> {
        self.create_vendor_for_supplier(input, create_supplier, None)
            .await
    }

    /// Create a credential configuration and its business ownership atomically.
    pub async fn create_vendor_for_supplier(
        &self,
        input: VendorInput,
        create_supplier: bool,
        existing_supplier: Option<Uuid>,
    ) -> Result<VendorView, StoreError> {
        validate_vendor(&input)?;
        if create_supplier && existing_supplier.is_some() {
            return Err(StoreError::InvalidVendor);
        }
        let mut transaction = self.pool.begin().await?;
        if let Some(id) = existing_supplier {
            let exists: Option<Uuid> =
                sqlx::query_scalar("SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR KEY SHARE")
                    .bind(id)
                    .fetch_optional(&mut *transaction)
                    .await?;
            if exists.is_none() {
                return Err(StoreError::Conflict);
            }
        }
        let supplier = if create_supplier {
            let id = Uuid::new_v4();
            sqlx::query("INSERT INTO provider_businesses(id,name) VALUES($1,$2)")
                .bind(id)
                .bind(input.name.trim())
                .execute(&mut *transaction)
                .await?;
            sqlx::query("INSERT INTO provider_audit_events(provider_id,action,resource_id) VALUES($1,'provider_created',$1)")
                .bind(id).execute(&mut *transaction).await?;
            Some(id)
        } else {
            existing_supplier
        };
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
        if let Some(supplier) = supplier {
            sqlx::query(
                "INSERT INTO vendor_supplier_ownership(vendor_id,provider_id) VALUES($1,$2)",
            )
            .bind(vendor.id)
            .bind(supplier)
            .execute(&mut *transaction)
            .await?;
            insert_audit(
                &mut transaction,
                vendor.id,
                None,
                "supplier_associated",
                vendor.revision,
            )
            .await?;
        }
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

    /// Compatibility list: return every mapping; this contract has no continuation cursor.
    pub async fn vendor_models(&self, id: Uuid) -> Result<Vec<VendorModelView>, StoreError> {
        let query =
            format!("SELECT {MODEL_COLUMNS} FROM vendor_models WHERE vendor_id=$1 ORDER BY alias");
        Ok(sqlx::query_as::<_, VendorModelView>(&query)
            .bind(id)
            .fetch_all(&self.pool)
            .await?)
    }

    /// Management read: availability uses the same eligibility checks as dispatch.
    /// Keep this read-only field out of model configuration writes.
    /// Return all mappings: a silent row cap makes saved configuration inaccessible.
    pub async fn vendor_models_with_availability(
        &self,
        id: Uuid,
    ) -> Result<Vec<Value>, StoreError> {
        Ok(sqlx::query_scalar::<_, Value>(
            "SELECT jsonb_build_object(
                'alias',m.alias,'vendor_id',m.vendor_id,'upstream_model',m.upstream_model,
                'public_catalog',m.public_catalog,'enabled',m.enabled,
                'owner_funded',EXISTS (SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id=v.id),
                'capabilities',m.capabilities,'pricing',m.pricing,'revision',m.revision,
                'available',m.enabled AND v.enabled AND v.credential_ciphertext IS NOT NULL
                    AND (EXISTS (SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id=v.id)
                         OR niu_supplier_model_route_available(m.alias)))
             FROM vendor_models m JOIN vendors v ON v.id=m.vendor_id
             WHERE m.vendor_id=$1 ORDER BY m.alias",
        )
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
        // Serialize the ownership check with personal-owner assignment, including
        // initial model creation. Conflicting configuration must fail at save.
        sqlx::query("SELECT id FROM vendors WHERE id=$1 FOR SHARE")
            .bind(vendor_id)
            .fetch_optional(&mut *transaction)
            .await?
            .ok_or(StoreError::Conflict)?;
        if input.pricing.is_some() {
            let personal: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM personal_vendor_ownership WHERE vendor_id=$1)",
            )
            .bind(vendor_id)
            .fetch_one(&mut *transaction)
            .await?;
            if personal {
                return Err(StoreError::InvalidVendor);
            }
        }
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

    /// Read the bounded pool's eligible mappings in one database statement.
    /// This is resolution evidence, not a replacement for dispatch-time locks.
    pub async fn eligible_pool_routes(
        &self,
        pool: &crate::ModelRoutePool,
    ) -> Result<Vec<VendorRoute>, StoreError> {
        if pool.candidates.len() > 64 {
            return Err(StoreError::InvalidVendor);
        }
        let aliases: Vec<&str> = pool
            .candidates
            .iter()
            .filter(|candidate| candidate.enabled)
            .map(|candidate| candidate.alias.as_str())
            .collect();
        if aliases.is_empty() {
            return Ok(Vec::new());
        }
        let query=route_query("WHERE m.alias=ANY($1) AND m.enabled AND v.enabled
            AND NOT EXISTS(SELECT 1 FROM vendor_cooldowns c WHERE c.vendor_id=v.id AND c.cooldown_until>statement_timestamp())
            AND NOT (m.capabilities ? 'video_schema')
            AND (($2::uuid IS NOT NULL AND EXISTS (
                SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id=v.id AND o.organization_id=$2))
                OR ($2::uuid IS NULL AND m.pricing IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id=v.id)
                    AND niu_supplier_model_route_available(m.alias)))");
        Ok(sqlx::query_as::<_, VendorRouteRow>(&query)
            .bind(aliases)
            .bind(pool.organization_id)
            .fetch_all(&self.pool)
            .await?
            .into_iter()
            .map(VendorRouteRow::into_route)
            .collect())
    }

    /// Read an enabled personal route only for its immutable owning account.
    /// Ownership and both enabled flags are checked in the same database query;
    /// callers must still pin these revisions at admission before dispatch.
    pub async fn personal_vendor_route(
        &self,
        organization_id: Uuid,
        alias: &str,
    ) -> Result<Option<VendorRoute>, StoreError> {
        let query = route_query(
            "WHERE m.alias=$1 AND m.enabled AND v.enabled AND EXISTS \
             (SELECT 1 FROM personal_vendor_ownership o \
              WHERE o.vendor_id=v.id AND o.organization_id=$2)",
        );
        Ok(sqlx::query_as::<_, VendorRouteRow>(&query)
            .bind(alias)
            .bind(organization_id)
            .fetch_optional(&self.pool)
            .await?
            .map(VendorRouteRow::into_route))
    }

    pub async fn personal_vendor_routes(
        &self,
        organization_id: Uuid,
    ) -> Result<Vec<VendorRoute>, StoreError> {
        let query = route_query(
            "WHERE m.enabled AND v.enabled AND EXISTS \
             (SELECT 1 FROM personal_vendor_ownership o \
              WHERE o.vendor_id=v.id AND o.organization_id=$1)",
        );
        Ok(sqlx::query_as::<_, VendorRouteRow>(&query)
            .bind(organization_id)
            .fetch_all(&self.pool)
            .await?
            .into_iter()
            .map(VendorRouteRow::into_route)
            .collect())
    }

    /// Pin personal credential and model revisions on an undispatched attempt.
    /// This records ownership evidence; it does not itself authorize dispatch.
    pub async fn bind_personal_attempt_route(
        &self,
        scope: crate::TenantScope,
        attempt_id: Uuid,
        route: &VendorRoute,
    ) -> Result<(), StoreError> {
        Self::bind_personal_attempt_route_with(&self.pool, scope, attempt_id, route).await
    }

    pub(crate) async fn bind_personal_attempt_route_with<'e>(
        executor: impl sqlx::Executor<'e, Database = sqlx::Postgres>,
        scope: crate::TenantScope,
        attempt_id: Uuid,
        route: &VendorRoute,
    ) -> Result<(), StoreError> {
        let changed = sqlx::query(
            "INSERT INTO personal_attempt_routes \
             (attempt_id,vendor_id,vendor_revision,model_revision) \
             SELECT id,$4,$5,$6 FROM attempts \
             WHERE id=$1 AND organization_id=$2 AND project_id=$3",
        )
        .bind(attempt_id)
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(route.vendor.id)
        .bind(route.vendor.revision)
        .bind(route.model.revision)
        .execute(executor)
        .await
        .map_err(map_vendor_write_error)?
        .rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
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

    /// Read the shared catalog inputs from one MVCC snapshot. Disabled rows
    /// remain present to shadow static aliases. The transaction ends before
    /// compilation or network work; dispatch still checks live eligibility.
    ///
    /// Includes personal ownership, pool definitions and cooldown eligibility.
    /// This is a per-read snapshot, not a published registry generation.
    pub async fn vendor_catalog_inputs(&self) -> Result<VendorCatalogInputs, StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            .execute(&mut *tx)
            .await?;
        let routes = sqlx::query_as::<_, VendorRouteRow>(&route_query(""))
            .fetch_all(&mut *tx)
            .await?
            .into_iter()
            .map(VendorRouteRow::into_route)
            .collect();
        let unavailable: Vec<String> = sqlx::query_scalar(
            "SELECT model_alias FROM provider_offers WHERE NOT niu_supplier_model_route_available(model_alias)",
        )
        .fetch_all(&mut *tx)
        .await?;
        let cooling_down: Vec<Uuid> = sqlx::query_scalar(
            "SELECT vendor_id FROM vendor_cooldowns WHERE cooldown_until>transaction_timestamp()",
        )
        .fetch_all(&mut *tx)
        .await?;
        let mut pools = Vec::new();
        let mut after: Option<String> = None;
        loop {
            let page: Vec<Value> = sqlx::query_scalar(
                "SELECT to_jsonb(p) FROM model_route_pools p WHERE ($1::text IS NULL OR alias>$1) ORDER BY alias LIMIT 100",
            )
            .bind(after.as_deref())
            .fetch_all(&mut *tx)
            .await?;
            let done = page.len() < 100;
            for value in page {
                let pool: crate::ModelRoutePool =
                    serde_json::from_value(value).map_err(|_| StoreError::Conflict)?;
                after = Some(pool.alias.clone());
                pools.push(pool);
            }
            if done {
                break;
            }
        }
        tx.commit().await?;
        Ok(VendorCatalogInputs {
            routes,
            unavailable: unavailable.into_iter().collect(),
            pools,
            cooling_down: cooling_down.into_iter().collect(),
        })
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
         (v.credential_ciphertext IS NOT NULL) AS has_credential,v.credential_ciphertext, \
         personal_owner.organization_id AS personal_organization_id \
         FROM vendor_models m JOIN vendors v ON v.id=m.vendor_id \
         LEFT JOIN personal_vendor_ownership personal_owner ON personal_owner.vendor_id=v.id \
         {filter} ORDER BY m.alias"
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
    if let Some(value) = input.capabilities.get("video_schema") {
        let schema: niu_media::VideoSchema =
            serde_json::from_value(value.clone()).map_err(|_| StoreError::InvalidVendor)?;
        schema.validate().map_err(|_| StoreError::InvalidVendor)?;
        if schema.model_alias != input.alias || schema.upstream_model != input.upstream_model {
            return Err(StoreError::InvalidVendor);
        }
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
            .is_some_and(|code| matches!(code.as_ref(), "23503" | "23505" | "P0008"))
    }) {
        StoreError::Conflict
    } else {
        StoreError::Database(error)
    }
}

impl Store {
    /// Update only descriptive catalog metadata for existing mappings, preserving billing and routing.
    pub async fn refresh_vendor_catalog(
        &self,
        vendor_id: Uuid,
        entries: Vec<(String, Value)>,
    ) -> Result<u64, StoreError> {
        let mut tx = self.pool.begin().await?;
        let mut updated = 0;
        for (upstream, metadata) in entries {
            if !metadata.is_object() || json_size(&metadata) > MAX_JSON_BYTES {
                return Err(StoreError::InvalidVendor);
            }
            updated += sqlx::query("UPDATE vendor_models SET capabilities=jsonb_set(capabilities, '{catalog}', $3), revision=revision+1 WHERE vendor_id=$1 AND upstream_model=$2 AND capabilities->'catalog' IS DISTINCT FROM $3")
                .bind(vendor_id).bind(upstream).bind(metadata).execute(&mut *tx).await?.rows_affected();
        }
        tx.commit().await?;
        Ok(updated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn personal_attempt_binding_pins_owner_and_revisions(pool: sqlx::PgPool) {
        let store = Store::from_pool(pool.clone());
        let scope = store.default_prepaid_workspace().await.unwrap();
        let vendor = Uuid::new_v4();
        sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'personal binding fixture','openai','https://example.com/v1',$2)")
            .bind(vendor).bind(vec![1u8;48]).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES('personal-bind',$1,'upstream',$2)")
            .bind(vendor).bind(serde_json::json!({})).execute(&pool).await.unwrap();
        let revision: i64 = sqlx::query_scalar("SELECT revision FROM vendors WHERE id=$1")
            .bind(vendor)
            .fetch_one(&pool)
            .await
            .unwrap();
        store
            .assign_personal_vendor_owner(vendor, scope.organization_id, revision)
            .await
            .unwrap();
        let route = store
            .personal_vendor_route(scope.organization_id, "personal-bind")
            .await
            .unwrap()
            .unwrap();
        let (_, attempt) = store
            .prepare_gateway_attempt(scope, "personal-bind", None, "fixture")
            .await
            .unwrap();
        store
            .bind_personal_attempt_route(scope, attempt, &route)
            .await
            .unwrap();
        assert!(
            store
                .bind_personal_attempt_route(scope, attempt, &route)
                .await
                .is_err()
        );
        assert!(
            sqlx::query("DELETE FROM personal_attempt_routes WHERE attempt_id=$1")
                .bind(attempt)
                .execute(&pool)
                .await
                .is_err()
        );
        // Deliberately unknown commercial references prove the personal guard
        // rejects before foreign-key validation, without fabricating funding.
        for statement in [
            "INSERT INTO customer_attempt_tariffs(attempt_id,revision_id) VALUES($1,$2)",
            "INSERT INTO provider_attempt_offers(attempt_id,provider_id,offer_id,revision_id) VALUES($1,$2,$2,$2)",
            "INSERT INTO customer_attempt_balance_accounts(attempt_id,organization_id,project_id,account_id,currency) SELECT id,organization_id,project_id,$2,'USD' FROM attempts WHERE id=$1",
        ] {
            let error = sqlx::query(statement)
                .bind(attempt)
                .bind(Uuid::new_v4())
                .execute(&pool)
                .await
                .unwrap_err();
            assert_eq!(
                error.as_database_error().unwrap().code().as_deref(),
                Some("P0008")
            );
        }
        let (_, stale) = store
            .prepare_gateway_attempt(scope, "personal-bind", None, "fixture")
            .await
            .unwrap();
        sqlx::query("UPDATE vendors SET revision=revision+1 WHERE id=$1")
            .bind(vendor)
            .execute(&pool)
            .await
            .unwrap();
        assert!(
            store
                .bind_personal_attempt_route(scope, stale, &route)
                .await
                .is_err()
        );
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM personal_attempt_routes")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
        let execution: String = sqlx::query_scalar("SELECT execution FROM attempts WHERE id=$1")
            .bind(attempt)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(execution, "not_sent");
        let key = store
            .issue_key(scope, "Personal dispatch", &["personal-bind".into()], 3600)
            .await
            .unwrap();
        let principal = store.authenticate(&key.token).await.unwrap();
        let snapshot = store
            .guardrail_snapshot(scope, key.id)
            .await
            .unwrap()
            .unwrap();
        store
            .bind_inspected_guardrails(scope, attempt, key.id, &snapshot)
            .await
            .unwrap();
        store
            .set_attempt_dispatch_provider(scope, attempt, "openai")
            .await
            .unwrap();
        // The existing binding predates the rotation above and cannot dispatch.
        assert!(matches!(
            store.mark_dispatched(&principal, attempt).await,
            Err(StoreError::Conflict)
        ));
        let current = store
            .personal_vendor_route(scope.organization_id, "personal-bind")
            .await
            .unwrap()
            .unwrap();
        let (_, ready) = store
            .prepare_gateway_attempt(scope, "personal-bind", None, "fixture")
            .await
            .unwrap();
        store
            .bind_personal_attempt_route(scope, ready, &current)
            .await
            .unwrap();
        store
            .set_attempt_dispatch_provider(scope, ready, "openai")
            .await
            .unwrap();
        // Personal dispatch must carry the policy inspection evidence.
        assert!(matches!(
            store.mark_dispatched(&principal, ready).await,
            Err(StoreError::Conflict)
        ));
        store
            .bind_inspected_guardrails(scope, ready, key.id, &snapshot)
            .await
            .unwrap();
        store.mark_dispatched(&principal, ready).await.unwrap();
        assert!(store.mark_dispatched(&principal, ready).await.is_err());
        let reservations: i64 =
            sqlx::query_scalar("SELECT count(*) FROM customer_balance_reservations")
                .fetch_one(&pool)
                .await
                .unwrap();
        let entries: i64 = sqlx::query_scalar("SELECT count(*) FROM customer_balance_entries")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!((reservations, entries), (0, 0));
        let (_, disabled) = store
            .prepare_gateway_attempt(scope, "personal-bind", None, "fixture")
            .await
            .unwrap();
        store
            .bind_personal_attempt_route(scope, disabled, &current)
            .await
            .unwrap();
        store
            .bind_inspected_guardrails(scope, disabled, key.id, &snapshot)
            .await
            .unwrap();
        store
            .set_attempt_dispatch_provider(scope, disabled, "openai")
            .await
            .unwrap();
        sqlx::query("UPDATE vendor_models SET enabled=false WHERE alias='personal-bind'")
            .execute(&pool)
            .await
            .unwrap();
        assert!(matches!(
            store.mark_dispatched(&principal, disabled).await,
            Err(StoreError::Conflict)
        ));
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn personal_route_reads_require_owner_and_enabled_configuration(pool: sqlx::PgPool) {
        let store = Store::from_pool(pool.clone());
        let owner = store
            .create_prepaid_organization("Owner", "USD")
            .await
            .unwrap();
        let foreign = store
            .create_prepaid_organization("Foreign", "USD")
            .await
            .unwrap();
        let vendor = Uuid::new_v4();
        sqlx::query("INSERT INTO vendors(id,name,adapter,api_base,credential_ciphertext) VALUES($1,'personal read fixture','openai','https://example.com/v1',$2)")
            .bind(vendor).bind(vec![1u8;48]).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO vendor_models(alias,vendor_id,upstream_model,capabilities) VALUES('personal-read',$1,'upstream',$2)")
            .bind(vendor).bind(serde_json::json!({})).execute(&pool).await.unwrap();
        assert!(
            store
                .personal_vendor_route(owner, "personal-read")
                .await
                .unwrap()
                .is_none()
        );
        let revision: i64 = sqlx::query_scalar("SELECT revision FROM vendors WHERE id=$1")
            .bind(vendor)
            .fetch_one(&pool)
            .await
            .unwrap();
        store
            .assign_personal_vendor_owner(vendor, owner, revision)
            .await
            .unwrap();
        let reopened = Store::from_pool(pool.clone());
        let listed = store.vendors_with_supplier(None).await.unwrap();
        assert_eq!(
            listed
                .iter()
                .find(|value| value["id"] == vendor.to_string())
                .unwrap()["owner_funded"],
            true
        );
        assert_eq!(
            reopened
                .vendor_models_with_availability(vendor)
                .await
                .unwrap()[0]["available"],
            true
        );
        assert_eq!(
            reopened
                .vendor_models_with_availability(vendor)
                .await
                .unwrap()[0]["owner_funded"],
            true
        );
        let route = reopened
            .personal_vendor_route(owner, "personal-read")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(route.vendor.id, vendor);
        assert_eq!(route.model.upstream_model, "upstream");
        assert!(
            reopened
                .personal_vendor_route(foreign, "personal-read")
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            reopened
                .personal_vendor_route(owner, "missing")
                .await
                .unwrap()
                .is_none()
        );
        sqlx::query("UPDATE vendor_models SET enabled=false WHERE alias='personal-read'")
            .execute(&pool)
            .await
            .unwrap();
        assert!(
            reopened
                .personal_vendor_route(owner, "personal-read")
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(
            reopened
                .vendor_models_with_availability(vendor)
                .await
                .unwrap()[0]["available"],
            false
        );
        sqlx::query("UPDATE vendor_models SET enabled=true WHERE alias='personal-read'")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("UPDATE vendors SET enabled=false WHERE id=$1")
            .bind(vendor)
            .execute(&pool)
            .await
            .unwrap();
        assert!(
            reopened
                .personal_vendor_route(owner, "personal-read")
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(
            reopened
                .vendor_models_with_availability(vendor)
                .await
                .unwrap()[0]["available"],
            false
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn personal_owner_is_durable_immutable_and_never_grants_funds(pool: sqlx::PgPool) {
        let store = Store::from_pool(pool.clone());
        let owner = store
            .create_prepaid_organization("Personal owner", "USD")
            .await
            .unwrap();
        let other = store
            .create_prepaid_organization("Other owner", "USD")
            .await
            .unwrap();
        let vendor = store
            .create_vendor(VendorInput {
                id: Uuid::new_v4(),
                name: "Owned key".into(),
                adapter: "openrouter".into(),
                api_base: "https://openrouter.ai/api/v1".into(),
                enabled: true,
                credential_ciphertext: vec![1; 32],
            })
            .await
            .unwrap();
        assert!(
            store
                .assign_personal_vendor_owner(vendor.id, owner, vendor.revision + 1)
                .await
                .is_err()
        );
        assert_eq!(
            store.personal_vendor_organization(vendor.id).await.unwrap(),
            None
        );
        store
            .assign_personal_vendor_owner(vendor.id, owner, vendor.revision)
            .await
            .unwrap();
        store
            .assign_personal_vendor_owner(vendor.id, owner, vendor.revision)
            .await
            .unwrap();
        let reopened = Store::from_pool(pool.clone());
        assert_eq!(
            reopened
                .personal_vendor_organization(vendor.id)
                .await
                .unwrap(),
            Some(owner)
        );
        assert!(
            reopened
                .assign_personal_vendor_owner(vendor.id, other, vendor.revision + 1)
                .await
                .is_err()
        );
        assert!(
            sqlx::query(
                "UPDATE personal_vendor_ownership SET organization_id=$2 WHERE vendor_id=$1"
            )
            .bind(vendor.id)
            .bind(other)
            .execute(&pool)
            .await
            .is_err()
        );
        assert!(
            sqlx::query("DELETE FROM personal_vendor_ownership WHERE vendor_id=$1")
                .bind(vendor.id)
                .execute(&pool)
                .await
                .is_err()
        );
        let audit:i64=sqlx::query_scalar("SELECT count(*) FROM vendor_audit_events WHERE vendor_id=$1 AND action='personal_owner_assigned'").bind(vendor.id).fetch_one(&pool).await.unwrap();
        assert_eq!(audit, 1);
        let funds: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM customer_balance_entries WHERE organization_id=$1",
        )
        .bind(owner)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(funds, 0);
        let concurrent = store
            .create_vendor(VendorInput {
                id: Uuid::new_v4(),
                name: "Concurrent owner".into(),
                adapter: "openrouter".into(),
                api_base: "https://openrouter.ai/api/v1".into(),
                enabled: true,
                credential_ciphertext: vec![1; 32],
            })
            .await
            .unwrap();
        let (first, second) = tokio::join!(
            store.assign_personal_vendor_owner(concurrent.id, owner, concurrent.revision),
            reopened.assign_personal_vendor_owner(concurrent.id, other, concurrent.revision),
        );
        assert_ne!(first.is_ok(), second.is_ok());
        let assigned = store
            .personal_vendor_organization(concurrent.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(assigned, if first.is_ok() { owner } else { other });
        assert_eq!(
            store.vendor(concurrent.id).await.unwrap().unwrap().revision,
            concurrent.revision + 1
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "requires PostgreSQL"]
    async fn personal_credentials_and_commercial_offer_reviews_are_exclusive(pool: sqlx::PgPool) {
        let store = Store::from_pool(pool.clone());
        let owner = store
            .create_prepaid_organization("Personal owner", "USD")
            .await
            .unwrap();
        let supplier = store
            .create_provider_business("Commercial fixture")
            .await
            .unwrap();
        let digest = "a".repeat(64);
        let expiry = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64
            + 60000;
        store
            .qualify_provider_business(
                supplier,
                &crate::ProviderQualificationInput {
                    supply_rights_sha256: digest.clone(),
                    supply_capability_sha256: digest.clone(),
                    data_handling_sha256: digest.clone(),
                    valid_until_ms: expiry,
                },
            )
            .await
            .unwrap();
        for personal in [true, false] {
            let vendor = store
                .create_vendor(VendorInput {
                    id: Uuid::new_v4(),
                    name: if personal {
                        "Personal fixture"
                    } else {
                        "Commercial fixture"
                    }
                    .into(),
                    adapter: "openrouter".into(),
                    api_base: "https://openrouter.ai/api/v1".into(),
                    enabled: true,
                    credential_ciphertext: vec![1; 32],
                })
                .await
                .unwrap();
            let alias = if personal {
                "personal-fixture"
            } else {
                "commercial-fixture"
            };
            store
                .upsert_vendor_model(
                    vendor.id,
                    VendorModelInput {
                        alias: alias.into(),
                        upstream_model: "fixture".into(),
                        public_catalog: false,
                        enabled: true,
                        capabilities: serde_json::json!({}),
                        pricing: None,
                        expected_revision: None,
                    },
                )
                .await
                .unwrap();
            let revision = store
                .publish_provider_offer(
                    supplier,
                    &crate::ProviderOfferInput {
                        model_alias: alias.into(),
                        currency: "USD".into(),
                        prompt_rate: "1".into(),
                        completion_rate: "1".into(),
                        expected_revision: None,
                    },
                )
                .await
                .unwrap();
            let offer: Uuid =
                sqlx::query_scalar("SELECT id FROM provider_offers WHERE model_alias=$1")
                    .bind(alias)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            let review = crate::ProviderOfferQualificationInput {
                rate_revision: revision,
                model_identity_sha256: digest.clone(),
                protocol_matrix_sha256: digest.clone(),
                protocol_matrix_version: "fixture-v1".into(),
                data_handling_sha256: digest.clone(),
                availability_sha256: digest.clone(),
                agreed_rates_sha256: digest.clone(),
                valid_until_ms: expiry,
            };
            let current_revision = store.vendor(vendor.id).await.unwrap().unwrap().revision;
            if personal {
                store
                    .assign_personal_vendor_owner(vendor.id, owner, current_revision)
                    .await
                    .unwrap();
                assert!(
                    store
                        .qualify_provider_offer(supplier, offer, &review)
                        .await
                        .is_err()
                );
                assert!(
                    sqlx::query("UPDATE provider_offers SET active=TRUE WHERE id=$1")
                        .bind(offer)
                        .execute(&pool)
                        .await
                        .is_err()
                );
            } else {
                store
                    .qualify_provider_offer(supplier, offer, &review)
                    .await
                    .unwrap();
                assert!(
                    store
                        .assign_personal_vendor_owner(vendor.id, owner, current_revision)
                        .await
                        .is_err()
                );
                assert_eq!(
                    store.personal_vendor_organization(vendor.id).await.unwrap(),
                    None
                );
            }
        }
    }

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
