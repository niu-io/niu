//! Scoped saved query receipts; observation is independent of customer settlement.
use crate::{Principal, Store, StoreError};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

fn decimal(value: &Value) -> Result<String, StoreError> {
    let text = value.as_str().ok_or(StoreError::InvalidUsage)?;
    let number: u64 = text.parse().map_err(|_| StoreError::InvalidUsage)?;
    if number.to_string() != text {
        return Err(StoreError::InvalidUsage);
    }
    Ok(text.to_owned())
}

fn quantity(value: &Value) -> Result<Value, StoreError> {
    match value["state"].as_str() {
        Some("missing" | "invalid") => Ok(json!({"state":value["state"]})),
        Some("reported") => Ok(json!({"state":"reported","value":decimal(&value["value"])?})),
        _ => Err(StoreError::InvalidUsage),
    }
}

fn times(value: &Value) -> Result<Value, StoreError> {
    match value["state"].as_str() {
        Some("missing" | "invalid") => Ok(json!({"state":value["state"]})),
        Some("reported") => Ok(
            json!({"state":"reported","created_at":decimal(&value["created_at"])?,"updated_at":decimal(&value["updated_at"])?}),
        ),
        _ => Err(StoreError::InvalidUsage),
    }
}

impl Store {
    pub async fn media_query_observations_for_key(
        &self,
        principal: &Principal,
        attempt: Uuid,
        after: Option<&str>,
        limit: u16,
    ) -> Result<Option<Value>, StoreError> {
        if !(1..=100).contains(&limit)
            || after.is_some_and(|s| s.len() != 64 || !s.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Err(StoreError::Conflict);
        }
        if self
            .media_job_state_for_key(principal, attempt)
            .await?
            .is_none()
        {
            return Ok(None);
        }
        let scope = principal.scope();
        let mut snapshot = self.begin_bounded_read_snapshot().await?;
        let cursor: Option<(String, String)> = if let Some(after) = after {
            Some(sqlx::query_as("SELECT observed_at::text,encode(receipt_sha256,'hex') FROM media_query_evidence WHERE organization_id=$1 AND project_id=$2 AND attempt_id=$3 AND encode(receipt_sha256,'hex')=lower($4)")
                .bind(scope.organization_id).bind(scope.project_id).bind(attempt).bind(after)
                .fetch_optional(&mut *snapshot).await?.ok_or(StoreError::Conflict)?)
        } else {
            None
        };
        let mut query = sqlx::QueryBuilder::<sqlx::Postgres>::new(
            "SELECT encode(receipt_sha256,'hex') AS cursor,floor(extract(epoch FROM observed_at)*1000)::bigint AS observed_at_ms,metadata->>'meter' AS meter,metadata->>'status' AS status,metadata->'quantity' AS quantity,metadata->'provider_times' AS provider_times FROM media_query_evidence WHERE organization_id=",
        );
        query
            .push_bind(scope.organization_id)
            .push(" AND project_id=")
            .push_bind(scope.project_id)
            .push(" AND attempt_id=")
            .push_bind(attempt);
        if let Some((observed, receipt)) = cursor {
            query
                .push(" AND (observed_at,receipt_sha256)<(")
                .push_bind(observed)
                .push("::timestamptz,decode(")
                .push_bind(receipt)
                .push(",'hex'))");
        }
        query
            .push(" ORDER BY observed_at DESC,receipt_sha256 DESC LIMIT ")
            .push_bind(i64::from(limit) + 1);
        let rows = query.build().fetch_all(&mut *snapshot).await?;
        snapshot.commit().await?;
        let more = rows.len() > usize::from(limit);
        let mut data = Vec::new();
        for row in rows.into_iter().take(usize::from(limit)) {
            let status: String = row.try_get("status")?;
            if !matches!(
                status.as_str(),
                "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired" | "unknown"
            ) {
                return Err(StoreError::InvalidUsage);
            }
            data.push(json!({"cursor":row.try_get::<String,_>("cursor")?,"observed_at_ms":row.try_get::<i64,_>("observed_at_ms")?,"meter":row.try_get::<String,_>("meter")?,"status":status,"quantity":quantity(&row.try_get::<Value,_>("quantity")?)?,"provider_times":times(&row.try_get::<Value,_>("provider_times")?)?}));
        }
        let next = if more {
            data.last().map(|r| r["cursor"].clone())
        } else {
            None
        };
        Ok(Some(json!({"data":data,"next_cursor":next})))
    }
}
