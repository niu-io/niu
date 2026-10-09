//! Installation-internal credential revisions. Authorization/encryption are caller obligations.
use crate::{Store, StoreError};
use uuid::Uuid;

/// Contains encrypted credentials; deliberately neither Debug nor Serialize.
#[derive(sqlx::FromRow)]
pub struct AssetManagementCredentialRevision {
    pub vendor_id: Uuid,
    pub revision: i64,
    pub upstream_project: String,
    pub credential_ciphertext: Vec<u8>,
}

impl Store {
    /// Append under the vendor lock. `expected_revision` is zero for first setup.
    /// This does not enable asset operations, qualify rights or prove zero cost.
    pub async fn save_asset_management_credential(
        &self,
        vendor: Uuid,
        expected_revision: i64,
        upstream_project: &str,
        credential_ciphertext: &[u8],
    ) -> Result<i64, StoreError> {
        self.save_asset_management_locked(
            vendor,
            None,
            expected_revision,
            upstream_project,
            credential_ciphertext,
        )
        .await
    }

    /// Also reject a changed account configuration between validation and save.
    pub async fn save_asset_management_credential_bound(
        &self,
        vendor: Uuid,
        expected_vendor_revision: i64,
        expected_revision: i64,
        upstream_project: &str,
        credential_ciphertext: &[u8],
    ) -> Result<i64, StoreError> {
        self.save_asset_management_locked(
            vendor,
            Some(expected_vendor_revision),
            expected_revision,
            upstream_project,
            credential_ciphertext,
        )
        .await
    }

    async fn save_asset_management_locked(
        &self,
        vendor: Uuid,
        expected_vendor_revision: Option<i64>,
        expected_revision: i64,
        upstream_project: &str,
        credential_ciphertext: &[u8],
    ) -> Result<i64, StoreError> {
        if expected_revision < 0
            || upstream_project.is_empty()
            || upstream_project.trim() != upstream_project
            || upstream_project.chars().count() > 1024
            || upstream_project.chars().any(char::is_control)
            || !(30..=65536).contains(&credential_ciphertext.len())
            || credential_ciphertext.first() != Some(&1)
        {
            return Err(StoreError::InvalidVendor);
        }
        let mut tx = self.pool.begin().await?;
        let vendor_revision: i64 =
            sqlx::query_scalar("SELECT revision FROM vendors WHERE id=$1 FOR UPDATE")
                .bind(vendor)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(StoreError::Conflict)?;
        if expected_vendor_revision.is_some_and(|expected| expected != vendor_revision) {
            return Err(StoreError::Conflict);
        }
        let current: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(revision),0) FROM vendor_asset_management_credentials WHERE vendor_id=$1")
            .bind(vendor).fetch_one(&mut *tx).await?;
        if current != expected_revision {
            return Err(StoreError::Conflict);
        }
        let revision = current
            .checked_add(1)
            .ok_or(StoreError::AggregateOverflow)?;
        sqlx::query("INSERT INTO vendor_asset_management_credentials(vendor_id,revision,upstream_project,credential_ciphertext,actor_kind) VALUES($1,$2,$3,$4,$5)")
            .bind(vendor).bind(revision).bind(upstream_project).bind(credential_ciphertext)
            .bind(if expected_vendor_revision.is_some() { "installation" } else { "unknown" })
            .execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(revision)
    }

    /// Installation configuration metadata only; never returns ciphertext.
    pub async fn asset_management_configuration(
        &self,
        vendor: Uuid,
    ) -> Result<Option<(i64, String, bool)>, StoreError> {
        Ok(sqlx::query_as("SELECT c.revision,c.upstream_project,(c.credential_ciphertext IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=c.vendor_id AND r.through_revision>=c.revision)) FROM vendor_asset_management_credentials c WHERE c.vendor_id=$1 ORDER BY c.revision DESC LIMIT 1")
            .bind(vendor).fetch_optional(&self.pool).await?)
    }

    /// Internal-only exact revision read. No fallback to a newer credential.
    pub async fn asset_management_credential_revision(
        &self,
        vendor: Uuid,
        revision: i64,
    ) -> Result<Option<AssetManagementCredentialRevision>, StoreError> {
        if revision <= 0 {
            return Err(StoreError::InvalidVendor);
        }
        Ok(sqlx::query_as("SELECT c.vendor_id,c.revision,c.upstream_project,c.credential_ciphertext FROM vendor_asset_management_credentials c WHERE c.vendor_id=$1 AND c.revision=$2 AND c.credential_ciphertext IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendor_asset_management_revocations r WHERE r.vendor_id=c.vendor_id AND r.through_revision>=c.revision)")
            .bind(vendor).bind(revision).fetch_optional(&self.pool).await?)
    }

    /// Installation-only revocation. Erasure removes ciphertext, not immutable
    /// metadata. Caller authorization is required; no inference key is affected.
    pub async fn revoke_asset_management_credentials(
        &self,
        vendor: Uuid,
        expected_revision: i64,
        erase_history: bool,
    ) -> Result<u64, StoreError> {
        if expected_revision <= 0 {
            return Err(StoreError::InvalidVendor);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM vendors WHERE id=$1 FOR UPDATE")
            .bind(vendor)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let current: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(revision),0) FROM vendor_asset_management_credentials WHERE vendor_id=$1")
            .bind(vendor).fetch_one(&mut *tx).await?;
        if current != expected_revision {
            return Err(StoreError::Conflict);
        }
        sqlx::query("INSERT INTO vendor_asset_management_revocations(vendor_id,through_revision,actor_kind) VALUES($1,$2,'installation') ON CONFLICT (vendor_id,through_revision) DO NOTHING")
            .bind(vendor).bind(current).execute(&mut *tx).await?;
        let erased = if erase_history {
            sqlx::query("INSERT INTO vendor_asset_management_erasures(vendor_id,through_revision,actor_kind) VALUES($1,$2,'installation') ON CONFLICT (vendor_id,through_revision) DO NOTHING")
                .bind(vendor).bind(current).execute(&mut *tx).await?;
            sqlx::query("UPDATE vendor_asset_management_credentials SET credential_ciphertext=NULL WHERE vendor_id=$1 AND revision<=$2 AND credential_ciphertext IS NOT NULL")
                .bind(vendor).bind(current).execute(&mut *tx).await?.rows_affected()
        } else {
            0
        };
        tx.commit().await?;
        Ok(erased)
    }
}
