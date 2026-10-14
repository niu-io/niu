//! Immutable, content-free evidence for a checked pre-dispatch rejection.
//! Only the durable prepared-attempt RPM-zero path is covered initially.
use crate::{Store, StoreError, TenantScope};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GatewayAdmissionDenialKind {
    KeyRequestRateDisabled,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GatewayAdmissionDenial {
    pub kind: GatewayAdmissionDenialKind,
    pub http_status: u16,
    pub requested_key_name: String,
    pub key_name_source: String,
    pub recorded_at: String,
}

pub(crate) struct CapturedAdmissionKey {
    pub name: String,
    pub revision: i64,
}

impl Store {
    /// Record only an actual known rejection after the dispatch transaction rolled
    /// back. This does not bind billing authority or authorize another dispatch.
    pub(crate) async fn record_key_request_rate_denial(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        key: Uuid,
        captured: &CapturedAdmissionKey,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        let eligible: Option<bool> = sqlx::query_scalar(
            "SELECT dispatched_at IS NULL AND execution='not_sent' FROM attempts \
             WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(attempt)
        .fetch_optional(&mut *tx)
        .await?;
        if eligible != Some(true) {
            return Err(StoreError::Conflict);
        }
        let inserted = sqlx::query(
            "INSERT INTO gateway_admission_denials \
             (attempt_id,organization_id,project_id,requested_key_id,requested_key_name,requested_key_revision,kind,http_status) \
             VALUES($1,$2,$3,$4,$5,$6,'key_request_rate_disabled',429) ON CONFLICT(attempt_id) DO NOTHING",
        )
        .bind(attempt).bind(scope.organization_id).bind(scope.project_id)
        .bind(key).bind(&captured.name).bind(captured.revision)
        .execute(&mut *tx).await?.rows_affected();
        if inserted == 0 {
            let exact: bool = sqlx::query_scalar(
                "SELECT organization_id=$2 AND project_id=$3 AND requested_key_id=$4 \
                 AND requested_key_name=$5 AND requested_key_revision=$6 \
                 AND kind='key_request_rate_disabled' AND http_status=429 \
                 FROM gateway_admission_denials WHERE attempt_id=$1",
            )
            .bind(attempt)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(key)
            .bind(&captured.name)
            .bind(captured.revision)
            .fetch_one(&mut *tx)
            .await?;
            if !exact {
                return Err(StoreError::Conflict);
            }
        }
        tx.commit().await?;
        Ok(())
    }
}
