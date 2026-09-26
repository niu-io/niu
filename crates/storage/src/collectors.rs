use crate::{IssuedKey, QuotaInput, Store, StoreError, TenantScope};
use sha2::{Digest, Sha256};
use uuid::Uuid;

impl Store {
    /// Quota ingestion only; collector secrets cannot authenticate as API keys.
    pub async fn issue_collector_key(
        &self,
        scope: TenantScope,
        name: &str,
        ttl_seconds: i64,
    ) -> Result<IssuedKey, StoreError> {
        self.issue_collector_key_for(scope, name, ttl_seconds, "quota").await
    }

    pub async fn issue_collector_key_for(&self, scope: TenantScope, name: &str, ttl_seconds: i64, purpose: &str) -> Result<IssuedKey, StoreError> {
        if !matches!(purpose, "quota" | "execution") { return Err(StoreError::InvalidKey); }
        if name.trim().is_empty() || name.len() > 200 || !(1..=31_536_000).contains(&ttl_seconds) {
            return Err(StoreError::InvalidKey);
        }
        let id = Uuid::new_v4();
        let token = format!(
            "niu_collector_{}{}",
            Uuid::new_v4().simple(),
            Uuid::new_v4().simple()
        );
        let hash = Sha256::digest(token.as_bytes()).to_vec();
        sqlx::query("INSERT INTO collector_keys(id,organization_id,project_id,name,token_hash,expires_at,purpose) VALUES($1,$2,$3,$4,$5,clock_timestamp()+$6*interval '1 second',$7)")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(name).bind(hash).bind(ttl_seconds as f64).bind(purpose).execute(&self.pool).await?;
        Ok(IssuedKey { id, token })
    }

    pub async fn revoke_collector_key(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<(), StoreError> {
        let changed = sqlx::query("UPDATE collector_keys SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE organization_id=$1 AND project_id=$2 AND id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).execute(&self.pool).await?.rows_affected();
        if changed != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }

    /// Serialize revocation with ingestion. Once revocation returns, no later
    /// ingestion can commit under this credential. No privilege-bearing cache.
    pub async fn observe_quota_as_collector(
        &self,
        token: &str,
        scope: TenantScope,
        account: Uuid,
        input: &QuotaInput,
    ) -> Result<Uuid, StoreError> {
        if token.len() != 78 || !token.starts_with("niu_collector_") {
            return Err(StoreError::Unauthorized);
        }
        let hash = Sha256::digest(token.as_bytes()).to_vec();
        let mut tx = self.pool.begin().await?;
        let key: Option<Uuid> = sqlx::query_scalar("SELECT id FROM collector_keys WHERE purpose='quota' AND token_hash=$1 AND organization_id=$2 AND project_id=$3 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE")
            .bind(hash).bind(scope.organization_id).bind(scope.project_id).fetch_optional(&mut *tx).await?;
        if key.is_none() {
            return Err(StoreError::Unauthorized);
        }
        let id = crate::accounts::persist_quota(&mut tx, scope, account, input).await?;
        tx.commit().await?;
        Ok(id)
    }
}
