use crate::{CostEntry, Store, StoreError, TenantScope};
use niu_execution::observation::ExecutionRecord;
use uuid::Uuid;

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct ExecutionImportSummary {
    pub id: Uuid,
    pub source: String,
    pub record_id: String,
    pub task_id: String,
    pub coverage: String,
}

/// Ledger evidence only: these entries are not a complete task cost estimate.
#[derive(Debug)]
pub struct ExecutionCharges {
    pub entries: Vec<CostEntry>,
    pub unresolved: Vec<String>,
}

impl Store {
    /// Resolve explicit Niu attempt references only, with tenant isolation and
    /// canonical UUID deduplication. External IDs never implicitly match ours.
    pub async fn execution_charges(
        &self,
        scope: TenantScope,
        record: &ExecutionRecord,
    ) -> Result<ExecutionCharges, StoreError> {
        record
            .validate()
            .map_err(|_| StoreError::InvalidObservation)?;
        let refs = record.charge_references();
        let parse = |reference: &str| {
            reference
                .strip_prefix("niu:attempt:")
                .and_then(|id| Uuid::parse_str(id).ok())
        };
        let ids: Vec<Uuid> = refs
            .iter()
            .filter_map(|r| parse(r))
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();
        let entries: Vec<CostEntry> = sqlx::query_as("SELECT attempt_id, price_revision_id, currency, api_equivalent_nanos, cash_nanos, usage_prompt_tokens, usage_completion_tokens, bound_exceeded FROM cost_entries WHERE organization_id=$1 AND project_id=$2 AND attempt_id=ANY($3) ORDER BY attempt_id")
            .bind(scope.organization_id).bind(scope.project_id).bind(&ids)
            .fetch_all(&self.pool).await?;
        let resolved: std::collections::BTreeSet<_> =
            entries.iter().map(|e| e.attempt_id).collect();
        let unresolved = refs
            .into_iter()
            .filter(|r| parse(r).is_none_or(|id| !resolved.contains(&id)))
            .map(str::to_owned)
            .collect();
        Ok(ExecutionCharges {
            entries,
            unresolved,
        })
    }

    pub async fn execution_imports(
        &self,
        scope: TenantScope,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<ExecutionImportSummary>, StoreError> {
        if !(1..=101).contains(&limit) {
            return Err(StoreError::InvalidObservation);
        }
        Ok(sqlx::query_as("SELECT id, source, record_id, task_id, payload->>'coverage' AS coverage FROM execution_imports WHERE organization_id=$1 AND project_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4")
            .bind(scope.organization_id).bind(scope.project_id).bind(after).bind(limit).fetch_all(&self.pool).await?)
    }

    /// Authenticated callers supply tenant scope. Imported metadata cannot
    /// create attempts, execute work, or post financial entries.
    pub async fn import_execution(
        &self,
        scope: TenantScope,
        record: &ExecutionRecord,
    ) -> Result<Uuid, StoreError> {
        record
            .validate()
            .map_err(|_| StoreError::InvalidObservation)?;
        let payload = serde_json::to_string(record).map_err(|_| StoreError::InvalidObservation)?;
        if payload.len() > 1_048_576 {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.pool.begin().await?;
        let id = Uuid::new_v4();
        let inserted: Option<Uuid> = sqlx::query_scalar("INSERT INTO execution_imports (id, organization_id, project_id, source, record_id, task_id, schema_version, payload) VALUES ($1,$2,$3,$4,$5,$6,1,$7::jsonb) ON CONFLICT (organization_id, project_id, source, record_id) DO NOTHING RETURNING id")
            .bind(id).bind(scope.organization_id).bind(scope.project_id).bind(&record.source).bind(&record.record_id).bind(&record.task_id).bind(&payload)
            .fetch_optional(&mut *tx).await?;
        let id = match inserted {
            Some(id) => id,
            None => sqlx::query_scalar("SELECT id FROM execution_imports WHERE organization_id=$1 AND project_id=$2 AND source=$3 AND record_id=$4 AND payload=$5::jsonb")
                .bind(scope.organization_id).bind(scope.project_id).bind(&record.source).bind(&record.record_id).bind(&payload)
                .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?,
        };
        tx.commit().await?;
        Ok(id)
    }

    pub async fn execution_import(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<Option<ExecutionRecord>, StoreError> {
        let payload: Option<String> = sqlx::query_scalar("SELECT payload::text FROM execution_imports WHERE organization_id=$1 AND project_id=$2 AND id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&self.pool).await?;
        payload
            .map(|s| serde_json::from_str(&s).map_err(|_| StoreError::InvalidObservation))
            .transpose()
    }

    /// Remove an imported metadata record only; canonical inference and
    /// financial records are independently retained under their own policy.
    pub async fn delete_execution_import(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<bool, StoreError> {
        Ok(sqlx::query(
            "DELETE FROM execution_imports WHERE organization_id=$1 AND project_id=$2 AND id=$3",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected()
            == 1)
    }
}
