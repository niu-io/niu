//! Provider integration identity, independent of inference format and prices.
//! Callers must enforce platform configuration authorization.
use crate::{Store, StoreError};
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize, sqlx::FromRow)]
pub struct ProviderIntegration {
    /// Saved selection. None means no default or inheritance for a connection.
    pub integration_type: Option<String>,
    pub effective_type: String,
    /// connection, provider, or unspecified; never inferred from a credential.
    pub source: String,
    pub revision: i64,
}

enum Scope {
    Provider,
    Connection,
}

impl Store {
    pub async fn provider_integration(
        &self,
        id: Uuid,
    ) -> Result<Option<ProviderIntegration>, StoreError> {
        Ok(sqlx::query_as(
            "SELECT s.integration_type, COALESCE(s.integration_type,'custom') AS effective_type,
             CASE WHEN s.integration_type IS NULL THEN 'unspecified' ELSE 'provider' END AS source,
             COALESCE(s.revision,0) AS revision FROM provider_businesses p
             LEFT JOIN provider_integration_settings s ON s.provider_id=p.id WHERE p.id=$1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?)
    }

    pub async fn vendor_integration(
        &self,
        id: Uuid,
    ) -> Result<Option<ProviderIntegration>, StoreError> {
        Ok(sqlx::query_as(
            "SELECT s.integration_type, COALESCE(s.integration_type,p.integration_type,'custom') AS effective_type,
             CASE WHEN s.integration_type IS NOT NULL THEN 'connection'
                  WHEN p.integration_type IS NOT NULL THEN 'provider' ELSE 'unspecified' END AS source,
             COALESCE(s.revision,0) AS revision FROM vendors v
             LEFT JOIN vendor_integration_settings s ON s.vendor_id=v.id
             LEFT JOIN vendor_supplier_ownership o ON o.vendor_id=v.id
             LEFT JOIN provider_integration_settings p ON p.provider_id=o.provider_id WHERE v.id=$1",
        ).bind(id).fetch_optional(&self.pool).await?)
    }

    pub async fn set_provider_integration(
        &self,
        id: Uuid,
        kind: &str,
        expected_revision: i64,
    ) -> Result<(), StoreError> {
        self.set_integration(Scope::Provider, id, Some(kind), expected_revision)
            .await
    }

    pub async fn set_vendor_integration(
        &self,
        id: Uuid,
        kind: Option<&str>,
        expected_revision: i64,
    ) -> Result<(), StoreError> {
        self.set_integration(Scope::Connection, id, kind, expected_revision)
            .await
    }

    async fn set_integration(
        &self,
        scope: Scope,
        id: Uuid,
        kind: Option<&str>,
        expected_revision: i64,
    ) -> Result<(), StoreError> {
        if expected_revision < 0
            || kind.is_some_and(|value| {
                !matches!(value, "openrouter" | "newapi" | "litellm" | "custom")
            })
        {
            return Err(StoreError::Conflict);
        }
        // SQL identifiers are selected only from this internal enum.
        let (resource, table, column) = match scope {
            Scope::Provider => (
                "provider_businesses",
                "provider_integration_settings",
                "provider_id",
            ),
            Scope::Connection => ("vendors", "vendor_integration_settings", "vendor_id"),
        };
        let mut tx = self.begin_bounded_recording().await?;
        sqlx::query_scalar::<_, Uuid>(&format!("SELECT id FROM {resource} WHERE id=$1 FOR UPDATE"))
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        let revision: i64 =
            sqlx::query_scalar(&format!("SELECT revision FROM {table} WHERE {column}=$1"))
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?
                .unwrap_or(0);
        if revision != expected_revision {
            return Err(StoreError::Conflict);
        }
        let next = revision.checked_add(1).ok_or(StoreError::Conflict)?;
        sqlx::query(&format!("INSERT INTO {table}({column},integration_type,revision) VALUES($1,$2,$3)
            ON CONFLICT ({column}) DO UPDATE SET integration_type=EXCLUDED.integration_type,revision=EXCLUDED.revision"))
            .bind(id).bind(kind).bind(next).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
}
