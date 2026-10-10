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
    ResponseStreamCancelled,
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
            Self::ResponseStreamCancelled => "response_stream_cancelled",
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
    /// Immediate HTTP 401 qualifies only with the canonical OpenRouter text
    /// policy pinned at admission. An adapter label is insufficient. Other
    /// providers/statuses and asynchronous media retain execution uncertainty.
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
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM attempts WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND dispatched_at IS NOT NULL FOR UPDATE")
            .bind(attempt).bind(scope.organization_id).bind(scope.project_id)
            .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
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
        .execute(&mut *tx)
        .await?;
        if result.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        let confirmed = if failure.kind == UpstreamHttpError
            && failure.upstream_http_status == Some(401)
        {
            sqlx::query("UPDATE attempts a SET execution='confirmed_not_executed',completed_at=COALESCE(completed_at,clock_timestamp()) WHERE a.id=$1 AND a.organization_id=$2 AND a.project_id=$3 AND a.dispatch_provider='openrouter' AND a.execution='may_have_executed' AND a.usage_confidence='unknown' AND EXISTS(SELECT 1 FROM managed_attempt_routes r WHERE r.attempt_id=a.id AND r.nonexecution_policy='openrouter-text-auth-rejection-v1') AND NOT EXISTS(SELECT 1 FROM media_recovery_routes m WHERE m.attempt_id=a.id)")
                .bind(attempt).bind(scope.organization_id).bind(scope.project_id)
                .execute(&mut *tx).await?.rows_affected()==1
        } else {
            false
        };
        if confirmed {
            // Commit the new safe-failure observation and cooldown together.
            // Replayed classifications and uncertain attempts never reach this branch.
            sqlx::query("SELECT niu_record_vendor_safe_failure($1)")
                .bind(attempt)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        if confirmed {
            // Independent transactions keep customer and procurement recovery
            // from starving each other. Durable nonexecution also lets the
            // background worker finish releases after a crash or storage fault.
            let customer: Result<(), StoreError> = async {
                let held: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM customer_balance_reservations WHERE attempt_id=$1 AND released_at IS NULL)")
                    .bind(attempt).fetch_one(&self.pool).await?;
                if held {
                    self.release_nonexecuted_customer_balance(scope, attempt).await?;
                }
                Ok(())
            }.await;
            let procurement: Result<(), StoreError> = async {
                let held: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM cost_reservations WHERE attempt_id=$1 AND state='held')")
                    .bind(attempt).fetch_one(&self.pool).await?;
                if held {
                    self.release_nonexecuted_cost(scope, attempt).await?;
                }
                Ok(())
            }.await;
            customer.and(procurement)?;
        }
        Ok(())
    }
}
