//! Immutable external advertised-price evidence, independent of all billing ledgers.
use crate::{Store, StoreError};
use serde_json::Value;
use uuid::Uuid;
impl Store {
    pub async fn save_provider_price_evidence(
        &self,
        provider: Uuid,
        adapter: &str,
        expected_integration_revision: i64,
        evidence: Value,
    ) -> Result<Value, StoreError> {
        if !evidence.is_object() || evidence.to_string().len() > 2 * 1024 * 1024 {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL FOR SHARE",
        )
        .bind(provider)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::Conflict)?;
        let current:Option<(String,i64)>=sqlx::query_as("SELECT integration_type,revision FROM provider_integration_settings WHERE provider_id=$1")
            .bind(provider).fetch_optional(&mut *tx).await?;
        if current.as_ref().is_none_or(|(kind, revision)| {
            kind != adapter || *revision != expected_integration_revision
        }) {
            return Err(StoreError::Conflict);
        }
        let saved:Value=sqlx::query_scalar("INSERT INTO provider_price_evidence(provider_id,adapter,integration_revision,evidence) VALUES($1,$2,$3,$4) RETURNING jsonb_build_object('revision',revision::text,'adapter',adapter,'integration_revision',integration_revision,'evidence',evidence,'captured_at_ms',(extract(epoch FROM captured_at)*1000)::bigint)")
            .bind(provider).bind(adapter).bind(expected_integration_revision).bind(evidence).fetch_one(&mut *tx).await?;
        tx.commit().await?;
        Ok(saved)
    }
    pub async fn provider_price_evidence(
        &self,
        provider: Uuid,
        revision: i64,
    ) -> Result<Option<Value>, StoreError> {
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('revision',revision::text,'adapter',adapter,'integration_revision',integration_revision,'evidence',evidence,'captured_at_ms',(extract(epoch FROM captured_at)*1000)::bigint) FROM provider_price_evidence WHERE provider_id=$1 AND revision=$2")
            .bind(provider).bind(revision).fetch_optional(&self.pool).await?)
    }
    pub async fn provider_price_history(
        &self,
        provider: Uuid,
        after: Option<i64>,
        limit: i64,
    ) -> Result<Vec<Value>, StoreError> {
        if !(1..=50).contains(&limit) || after.is_some_and(|v| v < 1) {
            return Err(StoreError::InvalidPrice);
        }
        Ok(sqlx::query_scalar("SELECT jsonb_build_object('revision',revision::text,'adapter',adapter,'status',evidence->>'status','source',evidence->>'source','captured_at_ms',(extract(epoch FROM captured_at)*1000)::bigint) FROM provider_price_evidence WHERE provider_id=$1 AND ($2::bigint IS NULL OR revision<$2) ORDER BY revision DESC LIMIT $3")
            .bind(provider).bind(after).bind(limit).fetch_all(&self.pool).await?)
    }
}
