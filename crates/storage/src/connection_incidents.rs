//! Sanitized operational evidence. Caller authorization remains mandatory.
use crate::{Store, StoreError, TenantScope};
use serde_json::{Value, json};
use uuid::Uuid;

impl Store {
    /// Only incidents with a recorded observation in this exact workspace.
    /// No connection, other tenant, request content or commercial fields leave storage.
    pub async fn workspace_active_incidents(
        &self,
        scope: TenantScope,
    ) -> Result<Value, StoreError> {
        let models: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT i.model_alias FROM connection_incidents i \
             JOIN connection_incident_observations o ON o.incident_id=i.id \
             JOIN attempts a ON a.id=o.attempt_id \
             WHERE i.resolved_at IS NULL AND a.organization_id=$1 AND a.project_id=$2 \
             ORDER BY i.model_alias LIMIT 51",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .fetch_all(&self.pool)
        .await?;
        let more = models.len() > 50;
        Ok(
            json!({"data": models.into_iter().take(50).map(|model| json!({"model":model})).collect::<Vec<_>>(), "more":more}),
        )
    }

    pub async fn connection_incidents(
        &self,
        vendor: Uuid,
        before: Option<i64>,
    ) -> Result<Value, StoreError> {
        self.platform_connection_incidents(Some(vendor), None, before)
            .await
    }

    pub async fn platform_connection_incidents(
        &self,
        vendor: Option<Uuid>,
        status: Option<&str>,
        before: Option<i64>,
    ) -> Result<Value, StoreError> {
        let mut rows: Vec<Value> = sqlx::query_scalar(
            "SELECT jsonb_build_object('reference',i.reference,'model',i.model_alias,'cause',i.cause,'connection_name',v.name, 'provider',CASE WHEN p.id IS NULL OR p.slug IS NULL THEN NULL ELSE jsonb_build_object('name',p.name,'slug',p.slug) END,\
             'status',CASE WHEN i.resolved_at IS NULL THEN 'active' ELSE 'resolved' END,\
             'first_observed_at',first_observed_at,'last_observed_at',last_observed_at,\
             'observations',observations::text,'recovered_at',resolved_at) \
             FROM connection_incidents i JOIN vendors v ON v.id=i.vendor_id LEFT JOIN vendor_supplier_ownership o ON o.vendor_id=v.id LEFT JOIN provider_businesses p ON p.id=o.provider_id AND p.deleted_at IS NULL WHERE ($1::uuid IS NULL OR i.vendor_id=$1) AND ($2::bigint IS NULL OR i.id<$2) AND ($3::text IS NULL OR ($3='active' AND i.resolved_at IS NULL) OR ($3='resolved' AND i.resolved_at IS NOT NULL)) \
             ORDER BY i.id DESC LIMIT 51",
        )
        .bind(vendor)
        .bind(before)
        .bind(status)
        .fetch_all(&self.pool)
        .await?;
        let has_more = rows.len() > 50;
        rows.truncate(50);
        let next = if has_more {
            rows.last().and_then(|row| row["reference"].as_str())
        } else {
            None
        };
        Ok(json!({"data":rows,"next_before":next}))
    }
}
