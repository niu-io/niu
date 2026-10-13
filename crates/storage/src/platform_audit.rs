//! A metadata-only read projection over existing durable operation journals.
//! Authorization remains a caller obligation; this projection is platform-only.
use crate::{Store, StoreError};
use serde::Serialize;
use sqlx::FromRow;

#[derive(Debug, Serialize, FromRow)]
pub struct PlatformAuditEvent {
    /// Source-qualified internal event reference; never a product display label.
    pub id: String,
    pub source: String,
    pub category: String,
    pub action: String,
    pub actor_kind: String,
    pub actor_label: String,
    pub target_label: String,
    pub revision: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct PlatformAuditPage {
    pub data: Vec<PlatformAuditEvent>,
    pub next_cursor: Option<String>,
}

impl Store {
    /// List saved platform operations, newest first, with a source-qualified cursor.
    /// Actor labels reflect recorded metadata, not inferred historical identity.
    pub async fn platform_audit_events(
        &self,
        category: Option<&str>,
        cursor: Option<&str>,
        limit: i64,
    ) -> Result<PlatformAuditPage, StoreError> {
        if !(1..=100).contains(&limit)
            || category.is_some_and(|v| {
                !matches!(
                    v,
                    "authentication" | "configuration" | "access" | "supplier"
                )
            })
            || cursor.is_some_and(|v| v.len() > 100 || !v.contains(':'))
        {
            return Err(StoreError::InvalidPlatformAuditQuery);
        }
        let (cursor_time, cursor_source, cursor_id) = if let Some(cursor) = cursor {
            let (source, id) = cursor
                .split_once(':')
                .ok_or(StoreError::InvalidPlatformAuditQuery)?;
            let (table, column, cast) = match source {
                "operator" => ("operator_audit_events", "id", "uuid"),
                "vendor" => ("vendor_audit_events", "id", "bigint"),
                "supplier" => ("provider_audit_events", "id", "bigint"),
                "branding" => ("branding_configuration_events", "revision", "bigint"),
                "payment_gateway" => ("payment_gateway_configuration_events", "id", "bigint"),
                "platform_access" => ("platform_admin_events", "id", "uuid"),
                _ => return Err(StoreError::InvalidPlatformAuditQuery),
            };
            if (cast == "uuid"
                && uuid::Uuid::parse_str(id)
                    .ok()
                    .is_none_or(|v| v.to_string() != id))
                || (cast == "bigint"
                    && id
                        .parse::<i64>()
                        .ok()
                        .is_none_or(|v| v <= 0 || v.to_string() != id))
            {
                return Err(StoreError::InvalidPlatformAuditQuery);
            }
            let query =
                format!("SELECT created_at::text FROM {table} WHERE {column}=$1::text::{cast}");
            let timestamp: Option<String> = sqlx::query_scalar(&query)
                .bind(id)
                .fetch_optional(&self.pool)
                .await?;
            let timestamp = timestamp.ok_or(StoreError::InvalidPlatformAuditQuery)?;
            let cursor_category = if source == "operator" {
                let action: String = sqlx::query_scalar(
                    "SELECT action FROM operator_audit_events WHERE id=$1::text::uuid",
                )
                .bind(id)
                .fetch_one(&self.pool)
                .await?;
                if action.starts_with("session_") || action.starts_with("password_") {
                    "authentication"
                } else {
                    "access"
                }
            } else {
                match source {
                    "vendor" | "branding" | "payment_gateway" => "configuration",
                    "supplier" => "supplier",
                    _ => "access",
                }
            };
            if category.is_some_and(|c| c != cursor_category) {
                return Err(StoreError::InvalidPlatformAuditQuery);
            }
            (Some(timestamp), Some(source), Some(id))
        } else {
            (None, None, None)
        };
        let projection = include_str!("platform_audit.sql");
        let query = format!("{projection}
            SELECT source || ':' || event_id AS id, source, category, action,
                actor_kind, actor_label, target_label, revision::text AS revision,
                to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at
            FROM events ORDER BY created_at DESC, source DESC, event_id DESC LIMIT $5");
        let mut data: Vec<PlatformAuditEvent> = sqlx::query_as(&query)
            .bind(category)
            .bind(cursor_time)
            .bind(cursor_source)
            .bind(cursor_id)
            .bind(limit + 1)
            .fetch_all(&self.pool)
            .await?;
        let has_more = data.len() > limit as usize;
        if has_more {
            data.pop();
        }
        let next_cursor = if has_more {
            data.last().map(|e| e.id.clone())
        } else {
            None
        };
        Ok(PlatformAuditPage { data, next_cursor })
    }
}
