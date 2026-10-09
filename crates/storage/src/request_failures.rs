use crate::{Store, StoreError, TenantScope};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Gateway classifications only: no upstream messages, URLs or response bodies.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequestFailureKind {
    UpstreamHttpError,
    UpstreamRegionUnavailable,
    UpstreamTimeout,
    UpstreamConnectionError,
    UpstreamTransportError,
    UpstreamInvalidResponse,
}

impl RequestFailureKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::UpstreamHttpError => "upstream_http_error",
            Self::UpstreamRegionUnavailable => "upstream_region_unavailable",
            Self::UpstreamTimeout => "upstream_timeout",
            Self::UpstreamConnectionError => "upstream_connection_error",
            Self::UpstreamTransportError => "upstream_transport_error",
            Self::UpstreamInvalidResponse => "upstream_invalid_response",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RequestFailure {
    pub kind: RequestFailureKind,
    pub upstream_http_status: Option<u16>,
}

impl Store {
    /// First immutable observation for this scoped, dispatched attempt. Identical
    /// retries are idempotent; conflicting classifications cannot overwrite it.
    /// Accounting and execution uncertainty are deliberately left unchanged.
    pub async fn save_request_failure(
        &self,
        scope: TenantScope,
        attempt: Uuid,
        failure: RequestFailure,
    ) -> Result<(), StoreError> {
        use RequestFailureKind::*;
        let valid = match failure.kind {
            UpstreamRegionUnavailable => failure.upstream_http_status == Some(403),
            UpstreamHttpError => failure.upstream_http_status.is_some_and(|status| {
                (100..=599).contains(&status) && !(200..=299).contains(&status)
            }),
            _ => failure.upstream_http_status.is_none(),
        };
        if !valid {
            return Err(StoreError::InvalidObservation);
        }
        let result = sqlx::query(
            "INSERT INTO request_failures (attempt_id,kind,upstream_http_status) \
             SELECT a.id,$4,$5 FROM attempts a \
             WHERE a.id=$1 AND a.organization_id=$2 AND a.project_id=$3 \
             AND a.dispatched_at IS NOT NULL \
             ON CONFLICT (attempt_id) DO UPDATE SET attempt_id=EXCLUDED.attempt_id \
             WHERE request_failures.kind=EXCLUDED.kind \
             AND request_failures.upstream_http_status IS NOT DISTINCT FROM EXCLUDED.upstream_http_status",
        )
        .bind(attempt)
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(failure.kind.as_str())
        .bind(failure.upstream_http_status.map(|status| status as i16))
        .execute(&self.pool)
        .await?;
        if result.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
}
