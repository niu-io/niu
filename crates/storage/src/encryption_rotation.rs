//! Internal offline envelope replacement. The caller authenticates both envelopes
//! and their identical plaintext; this layer enforces exact storage identity.
use crate::{MediaResultKind, Store, StoreError};
use serde_json::{Value, json};
use uuid::Uuid;

/// Internal capability for one authenticated key transition. Never serialize or
/// log these verification values. Constructed only after durable identity checks.
pub struct EncryptionRotation {
    operation: Uuid,
    source_key_check: [u8; 32],
    target_key_check: [u8; 32],
}

#[derive(sqlx::FromRow)]
struct StoredRotationBinding {
    id: Uuid,
    source_key_check: Option<Vec<u8>>,
    target_key_check: Option<Vec<u8>>,
}

/// Session lock held by an offline command. Dropping closes the connection so
/// the lock cannot leak into the pool. It does not fence running Gateway writers.
pub struct EncryptionRotationLease {
    _connection: sqlx::pool::PoolConnection<sqlx::Postgres>,
}

impl EncryptionRotationLease {
    /// A lost session must stop the command instead of silently losing ownership.
    pub async fn ensure_connected(&mut self) -> Result<(), StoreError> {
        sqlx::query("SELECT 1")
            .execute(&mut *self._connection)
            .await?;
        Ok(())
    }
}

/// Closed inventory: request text never selects a relation or column.
pub enum EncryptionRewrapTarget {
    Vendor(Uuid),
    AssetManagement {
        vendor: Uuid,
        revision: i64,
    },
    CodexConnection(Uuid),
    PaymentConfiguration,
    MediaResult {
        attempt: Uuid,
        kind: MediaResultKind,
    },
    AssetListing(Uuid),
    AssetLookup(Uuid),
    AssetRead(Uuid),
    AssetPatch(Uuid),
    InspectedImage(Uuid),
    WorkspaceAsset(Uuid),
}

impl EncryptionRewrapTarget {
    fn binding(&self) -> (&'static str, &'static str, &'static str, Value) {
        match self {
            Self::WorkspaceAsset(id) => (
                "workspace_asset_library_content",
                "ciphertext",
                "asset_id=($1->>'id')::uuid",
                json!({"id":id}),
            ),
            Self::Vendor(id) => (
                "vendors",
                "credential_ciphertext",
                "id=($1->>'id')::uuid",
                json!({"id":id}),
            ),
            Self::AssetManagement { vendor, revision } => (
                "vendor_asset_management_credentials",
                "credential_ciphertext",
                "vendor_id=($1->>'id')::uuid AND revision=($1->>'revision')::bigint",
                json!({"id":vendor,"revision":revision}),
            ),
            Self::CodexConnection(id) => (
                "codex_connections",
                "credential_ciphertext",
                "account_id=($1->>'id')::uuid",
                json!({"id":id}),
            ),
            Self::PaymentConfiguration => (
                "payment_gateway_configuration",
                "ciphertext",
                "gateway=$1->>'gateway'",
                json!({"gateway":"epay"}),
            ),
            Self::MediaResult { attempt, kind } => (
                "media_result_references",
                "ciphertext",
                "attempt_id=($1->>'id')::uuid AND kind=$1->>'kind'",
                json!({"id":attempt,"kind":kind.as_str()}),
            ),
            Self::AssetListing(id) => (
                "asset_listing_results",
                "ciphertext",
                "listing_id=($1->>'id')::uuid",
                json!({"id":id}),
            ),
            Self::AssetLookup(id) => (
                "asset_lookup_results",
                "ciphertext",
                "lookup_id=($1->>'id')::uuid",
                json!({"id":id}),
            ),
            Self::AssetRead(id) => (
                "asset_group_read_results",
                "ciphertext",
                "read_id=($1->>'id')::uuid",
                json!({"id":id}),
            ),
            Self::AssetPatch(id) => (
                "asset_group_update_patches",
                "ciphertext",
                "update_id=($1->>'id')::uuid",
                json!({"id":id}),
            ),
            Self::InspectedImage(id) => (
                "inspected_image_source_content",
                "ciphertext",
                "source_id=($1->>'id')::uuid",
                json!({"id":id}),
            ),
        }
    }
}

impl Store {
    /// Existing-schema maintenance connection: no migrations or bootstrap. Two
    /// connections permit one command lease plus bounded storage transactions.
    pub async fn connect_encryption_maintenance(url: &str) -> Result<Self, StoreError> {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(2)
            .connect(url)
            .await?;
        let store = Self {
            pool,
            route_compiler: None,
        };
        store.require_current_inspection_schema().await?;
        Ok(store)
    }

    pub async fn claim_encryption_rotation(&self) -> Result<EncryptionRotationLease, StoreError> {
        let mut connection = self.pool.acquire().await?;
        connection.close_on_drop();
        let claimed: bool = sqlx::query_scalar(
            "SELECT pg_try_advisory_lock(hashtextextended('niu:encryption-rotation-command',0))",
        )
        .fetch_one(&mut *connection)
        .await?;
        if !claimed {
            return Err(StoreError::Conflict);
        }
        Ok(EncryptionRotationLease {
            _connection: connection,
        })
    }

    /// Caller must finish a complete destination-only inventory and semantic
    /// validation under exclusive offline ownership before clearing maintenance.
    pub async fn complete_encryption_rotation(
        &self,
        rotation: &EncryptionRotation,
    ) -> Result<(), StoreError> {
        let updated = sqlx::query(
            "UPDATE encryption_rotation_operations SET completed_at=clock_timestamp() WHERE id=$1 AND completed_at IS NULL AND source_key_check=$2 AND target_key_check=$3",
        ).bind(rotation.operation).bind(rotation.source_key_check.as_slice()).bind(rotation.target_key_check.as_slice())
        .execute(&self.pool).await?;
        if updated.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    /// Discover an interrupted operation before deriving its keyed verification
    /// values. This identifier alone does not authorize any envelope write.
    pub async fn unfinished_encryption_rotation(&self) -> Result<Option<Uuid>, StoreError> {
        Ok(sqlx::query_scalar(
            "SELECT id FROM encryption_rotation_operations WHERE completed_at IS NULL",
        )
        .fetch_optional(&self.pool)
        .await?)
    }

    /// Create or resume exactly one key transition. Checks must be independently
    /// derived from the source/target secrets and this operation identity by the
    /// trusted caller, never copied from database values. No key material enters
    /// storage. An unbound legacy operation, wrong key check, different operation
    /// or completed identity conflicts without changing maintenance history.
    pub async fn begin_encryption_rotation(
        &self,
        operation: Uuid,
        source_key_check: [u8; 32],
        target_key_check: [u8; 32],
    ) -> Result<EncryptionRotation, StoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SET LOCAL lock_timeout='2s'")
            .execute(&mut *tx)
            .await?;
        sqlx::query("SET LOCAL statement_timeout='5s'")
            .execute(&mut *tx)
            .await?;
        let claimed: bool = sqlx::query_scalar(
            "SELECT pg_try_advisory_xact_lock(hashtextextended('niu:encryption-rotation',0))",
        )
        .fetch_one(&mut *tx)
        .await?;
        if !claimed {
            return Err(StoreError::Conflict);
        }
        let active: Option<StoredRotationBinding> = sqlx::query_as(
            "SELECT id,source_key_check,target_key_check FROM encryption_rotation_operations WHERE completed_at IS NULL FOR UPDATE",
        ).fetch_optional(&mut *tx).await?;
        match active {
            Some(StoredRotationBinding {
                id,
                source_key_check: source,
                target_key_check: target,
            }) if id == operation
                && source.as_deref() == Some(source_key_check.as_slice())
                && target.as_deref() == Some(target_key_check.as_slice()) => {}
            Some(_) => return Err(StoreError::Conflict),
            None => {
                let inserted = sqlx::query(
                    "INSERT INTO encryption_rotation_operations(id,source_key_check,target_key_check) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
                ).bind(operation).bind(source_key_check.as_slice()).bind(target_key_check.as_slice())
                .execute(&mut *tx).await?;
                if inserted.rows_affected() != 1 {
                    return Err(StoreError::Conflict);
                }
            }
        }
        tx.commit().await?;
        Ok(EncryptionRotation {
            operation,
            source_key_check,
            target_key_check,
        })
    }

    /// Atomically authorize and replace one exact retained envelope. Never revives
    /// erased content or updates business metadata. A changed/missing row or a
    /// completed operation conflicts. No decryption or key material enters SQL.
    ///
    /// This is not a public API or a complete rotation command. Callers must stop
    /// all writers, validate transition ownership, and authenticate both envelopes
    /// with the original associated data before invoking this method.
    pub async fn replace_encrypted_envelope(
        &self,
        rotation: &EncryptionRotation,
        target: EncryptionRewrapTarget,
        expected: &[u8],
        replacement: &[u8],
    ) -> Result<(), StoreError> {
        if expected == replacement
            || !(30..=8_388_736).contains(&replacement.len())
            || replacement.first() != Some(&1)
        {
            return Err(StoreError::InvalidObservation);
        }
        let (table, column, predicate, identity) = target.binding();
        let mut tx = self.pool.begin().await?;
        // JSONB timestamp/bytea rendering contributes to the record digest.
        // Pin both conventions instead of depending on session defaults.
        sqlx::query(
            "SELECT set_config('TimeZone','UTC',true),set_config('bytea_output','hex',true)",
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query("SET LOCAL lock_timeout='2s'")
            .execute(&mut *tx)
            .await?;
        sqlx::query("SET LOCAL statement_timeout='5s'")
            .execute(&mut *tx)
            .await?;
        let active: Option<Uuid> = sqlx::query_scalar(
            "SELECT id FROM encryption_rotation_operations WHERE id=$1 AND completed_at IS NULL AND source_key_check=$2 AND target_key_check=$3 FOR UPDATE",
        ).bind(rotation.operation).bind(rotation.source_key_check.as_slice()).bind(rotation.target_key_check.as_slice()).fetch_optional(&mut *tx).await?;
        if active.is_none() {
            return Err(StoreError::Conflict);
        }
        // Closed enum fragments only. The row lock keeps authorization and update
        // on the same representation, including non-ciphertext metadata.
        let query = format!("SELECT {column}=$2 FROM {table} WHERE {predicate} FOR UPDATE");
        let matches: Option<Option<bool>> = sqlx::query_scalar(&query)
            .bind(&identity)
            .bind(expected)
            .fetch_optional(&mut *tx)
            .await?;
        if matches != Some(Some(true)) {
            return Err(StoreError::Conflict);
        }
        let query = format!(
            "INSERT INTO encryption_rewrap_authorizations(operation_id,table_name,old_record_sha256,new_record_sha256) \
             SELECT $4,'{table}',sha256(convert_to(to_jsonb(t)::text,'UTF8')),\
             sha256(convert_to(jsonb_set(to_jsonb(t),ARRAY['{column}'],to_jsonb($3::bytea))::text,'UTF8')) \
             FROM {table} t WHERE {predicate} AND {column}=$2"
        );
        let authorized = sqlx::query(&query)
            .bind(&identity)
            .bind(expected)
            .bind(replacement)
            .bind(rotation.operation)
            .execute(&mut *tx)
            .await?;
        if authorized.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        let query = format!("UPDATE {table} SET {column}=$3 WHERE {predicate} AND {column}=$2");
        let updated = sqlx::query(&query)
            .bind(&identity)
            .bind(expected)
            .bind(replacement)
            .execute(&mut *tx)
            .await?;
        if updated.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }
}
