//! Installation-only company onboarding with durable retry identity.
use crate::{Store, StoreError};
use sha2::{Digest, Sha256};
use uuid::Uuid;

impl Store {
    /// Commit the optional receipt, company and zero-funded account together.
    /// Installation credentials share a namespace distinct from workspace creation.
    /// A replay returns its original identity, including a deleted identity; the
    /// caller must read current metadata and return not-found rather than recreate.
    pub async fn create_prepaid_organization_with_key(
        &self,
        name: &str,
        currency: &str,
        key_sha256: Option<&[u8]>,
    ) -> Result<Uuid, StoreError> {
        let request = serde_json::to_vec(&serde_json::json!({"name":name,"currency":currency}))
            .map_err(|_| StoreError::Conflict)?;
        let request_sha256 = Sha256::digest(request).to_vec();
        if key_sha256.is_some_and(|key| key.len() != 32) {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.begin_bounded_recording().await?;
        if let Some(key) = key_sha256 {
            sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-company-create:'||encode($1::bytea,'hex'),0))")
                .bind(key).execute(&mut *tx).await?;
            let saved: Option<(Vec<u8>, Uuid)> = sqlx::query_as(
                "SELECT request_sha256,organization_id FROM company_creation_receipts WHERE key_sha256=$1",
            ).bind(key).fetch_optional(&mut *tx).await?;
            if let Some((request, organization)) = saved {
                if request != request_sha256 {
                    return Err(StoreError::Conflict);
                }
                tx.commit().await?;
                return Ok(organization);
            }
        }
        let organization = Self::create_prepaid_organization_in_tx(&mut tx, name, currency).await?;
        if let Some(key) = key_sha256 {
            sqlx::query("INSERT INTO company_creation_receipts(key_sha256,request_sha256,organization_id) VALUES($1,$2,$3)")
                .bind(key).bind(request_sha256).bind(organization).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(organization)
    }
}
