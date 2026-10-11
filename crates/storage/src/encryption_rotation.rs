//! Internal offline envelope replacement. The caller authenticates both envelopes
//! and their identical plaintext; this layer enforces exact storage identity.
use crate::{MediaResultKind, Store, StoreError};
use serde_json::{Value, json};
use uuid::Uuid;

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
}

impl EncryptionRewrapTarget {
    fn binding(&self) -> (&'static str, &'static str, &'static str, Value) {
        match self {
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
    /// Atomically authorize and replace one exact retained envelope. Never revives
    /// erased content or updates business metadata. A changed/missing row or a
    /// completed operation conflicts. No decryption or key material enters SQL.
    ///
    /// This is not a public API or a complete rotation command. Callers must stop
    /// all writers, validate transition ownership, and authenticate both envelopes
    /// with the original associated data before invoking this method.
    pub async fn replace_encrypted_envelope(
        &self,
        operation: Uuid,
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
        sqlx::query("SET LOCAL lock_timeout='2s'")
            .execute(&mut *tx)
            .await?;
        sqlx::query("SET LOCAL statement_timeout='5s'")
            .execute(&mut *tx)
            .await?;
        let active: Option<Uuid> = sqlx::query_scalar(
            "SELECT id FROM encryption_rotation_operations WHERE id=$1 AND completed_at IS NULL FOR UPDATE",
        ).bind(operation).fetch_optional(&mut *tx).await?;
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
            .bind(operation)
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
