use crate::{Store, StoreError};
use uuid::Uuid;

/// Measured stages for one gateway attempt. Missing stages remain unknown.
#[derive(Debug, Clone)]
pub struct RequestTimingRecord {
    pub attempt: Uuid,
    pub dispatch_ms: Option<i64>,
    pub headers_ms: Option<i64>,
    pub first_output_ms: Option<i64>,
    pub total_ms: i64,
    pub complete: bool,
    pub http_status: Option<i32>,
}

impl Store {
    pub async fn save_request_timing(&self, timing: RequestTimingRecord) -> Result<(), StoreError> {
        if timing.total_ms < 0
            || timing
                .dispatch_ms
                .is_some_and(|value| value < 0 || value > timing.total_ms)
            || timing.headers_ms.is_some_and(|value| {
                value < 0
                    || value > timing.total_ms
                    || timing.dispatch_ms.is_some_and(|dispatch| dispatch > value)
            })
            || timing.first_output_ms.is_some_and(|value| {
                value > timing.total_ms || timing.headers_ms.is_none_or(|headers| value < headers)
            })
            || timing
                .http_status
                .is_some_and(|value| !(100..=599).contains(&value))
        {
            return Err(StoreError::InvalidObservation);
        }
        sqlx::query("INSERT INTO request_timings(attempt_id,dispatch_ms,headers_ms,first_output_ms,total_ms,complete,http_status) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING")
            .bind(timing.attempt).bind(timing.dispatch_ms).bind(timing.headers_ms).bind(timing.first_output_ms).bind(timing.total_ms).bind(timing.complete).bind(timing.http_status).execute(&self.pool).await?;
        Ok(())
    }
}
