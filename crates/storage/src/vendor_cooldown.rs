//! Credential-local safe-failure cooldown, independent of dispatch rate limits.
use crate::{Store, StoreError};
use serde_json::Value;
use uuid::Uuid;

impl Store {
    /// Selection only. Pinned in-flight work and saved video recovery continue.
    pub async fn vendor_is_cooling_down(&self, vendor: Uuid) -> Result<bool, StoreError> {
        Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM vendor_cooldowns WHERE vendor_id=$1 AND cooldown_until>statement_timestamp())")
            .bind(vendor).fetch_one(&self.pool).await?)
    }

    /// Platform-only callers expose this state; it contains no credential material.
    pub async fn vendor_cooldown(&self, vendor: Uuid) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('policy_revision','openrouter-auth-cooldown-v1','failure_threshold',3,'window_seconds',60,'cooldown_seconds',60,'active',COALESCE(c.cooldown_until>statement_timestamp(),false),'cooldown_until',c.cooldown_until,'qualifying_failures',(SELECT count(*) FROM vendor_cooldown_failures f WHERE f.vendor_id=v.id AND f.recorded_at>statement_timestamp()-interval '60 seconds')) FROM vendors v LEFT JOIN vendor_cooldowns c ON c.vendor_id=v.id WHERE v.id=$1")
            .bind(vendor).fetch_optional(&self.pool).await?)
    }
}
