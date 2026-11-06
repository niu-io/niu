//! Sanitized operational evidence. Caller authorization remains mandatory.
use crate::workspace_events::EVENT_AUTHORITY;
use crate::{Store, StoreError, TenantScope};
use serde_json::{Map, Value, json};
use uuid::Uuid;

/// One row per incident/workspace bridge. The notification object is derived
/// from the current lifecycle event, enabled incident subscriptions, current
/// delegation and durable delivery rows. A missing receiver is never reported
/// as a sent notification.
const INCIDENT_NOTIFICATION_SQL: &str = "\
SELECT jsonb_build_object(
    'incident_id',b.incident_id,
    'state',CASE
        WHEN receivers.configured=0 THEN 'not_configured'
        WHEN receivers.authorized=0 THEN 'authority_inactive'
        WHEN lifecycle.sequence IS NULL THEN 'queued'
        WHEN delivery.sending>0 THEN 'sending'
        WHEN delivery.pending>0 THEN 'queued'
        WHEN delivery.delivered>0 AND delivery.failed+delivery.cancelled>0 THEN 'partial'
        WHEN delivery.delivered>0 THEN 'delivered'
        WHEN delivery.failed+delivery.cancelled>0 THEN 'failed'
        ELSE 'queued' END,
    'event',lifecycle.event,
    'subscribers',receivers.configured,
    'authorized',receivers.authorized,
    'delivered',delivery.delivered,
    'failed',delivery.failed,
    'cancelled',delivery.cancelled,
    'queued',delivery.pending,
    'sending',delivery.sending,
    'last_attempt_at',delivery.last_attempt_at)
FROM incident_workspace_events b
JOIN connection_incidents i ON i.id=b.incident_id
CROSS JOIN LATERAL (
    SELECT CASE WHEN i.resolved_at IS NULL THEN 'opened' ELSE 'resolved' END AS event,
        CASE WHEN i.resolved_at IS NULL THEN b.opened_sequence ELSE b.resolved_sequence END AS sequence,
        CASE WHEN i.resolved_at IS NULL THEN 'incident.opened' ELSE 'incident.resolved' END AS event_type
) lifecycle
CROSS JOIN LATERAL (
    SELECT count(*) AS configured,
        count(*) FILTER (WHERE {AUTHORITY}) AS authorized
    FROM workspace_event_subscriptions s
    WHERE s.organization_id=b.organization_id AND s.project_id=b.project_id
        AND s.configuration->>'enabled'='true'
        AND (s.configuration->'event_types') ? lifecycle.event_type
) receivers
CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE d.state='delivered') AS delivered,
        count(*) FILTER (WHERE d.state='failed') AS failed,
        count(*) FILTER (WHERE d.state='cancelled') AS cancelled,
        count(*) FILTER (WHERE d.state='pending') AS pending,
        count(*) FILTER (WHERE d.state='sending') AS sending,
        max(d.updated_at) AS last_attempt_at
    FROM workspace_event_deliveries d
    JOIN workspace_event_subscriptions s ON s.id=d.subscription_id
    WHERE s.organization_id=b.organization_id AND s.project_id=b.project_id
        AND s.revision=d.subscription_revision
        AND d.event_sequence=lifecycle.sequence
        AND s.configuration->>'enabled'='true'
        AND (s.configuration->'event_types') ? lifecycle.event_type
) delivery
";

fn integer(notification: &Value, key: &str) -> i64 {
    notification[key].as_i64().unwrap_or(0)
}

fn state(notification: &Value) -> &str {
    notification["state"].as_str().unwrap_or("queued")
}

/// Aggregate states for a workspace-facing summary. The summary never turns a
/// missing receiver or a failed delivery into an acknowledgement.
fn workspace_summary(rows: &[Value]) -> Value {
    let mut summary = Map::new();
    let mut configured = 0_i64;
    let mut authorized = 0_i64;
    let mut delivered = 0_i64;
    let mut failed = 0_i64;
    let mut cancelled = 0_i64;
    let mut queued = 0_i64;
    let mut sending = 0_i64;
    let mut not_configured = 0_i64;
    let mut authority_inactive = 0_i64;
    for row in rows {
        configured += integer(row, "subscribers");
        authorized += integer(row, "authorized");
        delivered += integer(row, "delivered");
        failed += integer(row, "failed");
        cancelled += integer(row, "cancelled");
        queued += integer(row, "queued");
        sending += integer(row, "sending");
        match state(row) {
            "not_configured" => not_configured += 1,
            "authority_inactive" => authority_inactive += 1,
            _ => {}
        }
    }
    let overall = if rows.is_empty() {
        "none"
    } else if not_configured == rows.len() as i64 {
        "not_configured"
    } else if not_configured + authority_inactive == rows.len() as i64 {
        "authority_inactive"
    } else if rows
        .iter()
        .any(|row| matches!(state(row), "failed" | "partial"))
    {
        "failed"
    } else if rows.iter().any(|row| state(row) == "sending") {
        "sending"
    } else if rows.iter().any(|row| state(row) == "queued") {
        "queued"
    } else if rows.iter().all(|row| state(row) == "delivered") {
        "delivered"
    } else {
        "queued"
    };
    summary.insert("state".into(), json!(overall));
    summary.insert("incidents".into(), json!(rows.len()));
    summary.insert("subscribers".into(), json!(configured));
    summary.insert("authorized".into(), json!(authorized));
    summary.insert("delivered".into(), json!(delivered));
    summary.insert("failed".into(), json!(failed));
    summary.insert("cancelled".into(), json!(cancelled));
    summary.insert("queued".into(), json!(queued));
    summary.insert("sending".into(), json!(sending));
    summary.insert("not_configured".into(), json!(not_configured));
    summary.insert("authority_inactive".into(), json!(authority_inactive));
    Value::Object(summary)
}

fn platform_summary(rows: &[Value]) -> Value {
    let mut summary = Map::new();
    let mut delivered = 0_i64;
    let mut failed = 0_i64;
    let mut cancelled = 0_i64;
    let mut queued = 0_i64;
    let mut sending = 0_i64;
    let mut not_configured = 0_i64;
    let mut authority_inactive = 0_i64;
    for row in rows {
        delivered += integer(row, "delivered");
        failed += integer(row, "failed");
        cancelled += integer(row, "cancelled");
        queued += integer(row, "queued");
        sending += integer(row, "sending");
        match state(row) {
            "not_configured" => not_configured += 1,
            "authority_inactive" => authority_inactive += 1,
            _ => {}
        }
    }
    let overall = if rows.is_empty() {
        "no_recipients"
    } else if rows.iter().all(|row| state(row) == "delivered") {
        "delivered"
    } else if not_configured > 0 || authority_inactive > 0 {
        "incomplete"
    } else if rows
        .iter()
        .any(|row| matches!(state(row), "failed" | "partial"))
    {
        "failed"
    } else if rows.iter().any(|row| state(row) == "sending") {
        "sending"
    } else {
        "queued"
    };
    summary.insert("state".into(), json!(overall));
    summary.insert("workspaces".into(), json!(rows.len()));
    summary.insert("delivered".into(), json!(delivered));
    summary.insert("failed".into(), json!(failed));
    summary.insert("cancelled".into(), json!(cancelled));
    summary.insert("queued".into(), json!(queued));
    summary.insert("sending".into(), json!(sending));
    summary.insert("not_configured".into(), json!(not_configured));
    summary.insert("authority_inactive".into(), json!(authority_inactive));
    Value::Object(summary)
}

impl Store {
    /// Only incidents with a recorded observation in this exact workspace.
    /// No connection, other tenant, request content or commercial fields leave storage.
    pub async fn workspace_active_incidents(
        &self,
        scope: TenantScope,
    ) -> Result<Value, StoreError> {
        let models: Vec<(String, bool)> = sqlx::query_as(
            "SELECT DISTINCT i.model_alias, EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=i.vendor_id AND p.organization_id=a.organization_id) AS owner_funded FROM connection_incidents i \
             JOIN connection_incident_observations o ON o.incident_id=i.id \
             JOIN attempts a ON a.id=o.attempt_id \
             WHERE i.resolved_at IS NULL AND a.organization_id=$1 AND a.project_id=$2 \
             ORDER BY i.model_alias, owner_funded LIMIT 51",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .fetch_all(&self.pool)
        .await?;
        let more = models.len() > 50;
        let notifications = self.workspace_incident_notifications(scope).await?;
        Ok(
            json!({"data": models.into_iter().take(50).map(|(model,owner_funded)| json!({"model":model,"owner_funded":owner_funded})).collect::<Vec<_>>(), "more":more, "notifications":notifications}),
        )
    }

    /// Workspace-facing notification state for currently active incidents.
    /// This is exact-workspace projection data, not a platform incident list.
    pub async fn workspace_incident_notifications(
        &self,
        scope: TenantScope,
    ) -> Result<Value, StoreError> {
        let sql = format!(
            "{INCIDENT_NOTIFICATION_SQL} WHERE b.organization_id=$1 AND b.project_id=$2 AND i.resolved_at IS NULL ORDER BY b.created_at,b.incident_id"
        )
        .replace("{AUTHORITY}", EVENT_AUTHORITY);
        let rows: Vec<Value> = sqlx::query_scalar(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .fetch_all(&self.pool)
            .await?;
        Ok(workspace_summary(&rows))
    }

    /// Exact-workspace notification state for one incident reference. A missing
    /// workspace bridge is indistinguishable from a foreign reference.
    pub async fn workspace_incident_notification(
        &self,
        scope: TenantScope,
        reference: &str,
    ) -> Result<Option<Value>, StoreError> {
        let sql = format!(
            "{INCIDENT_NOTIFICATION_SQL} WHERE b.organization_id=$1 AND b.project_id=$2 AND b.reference=$3 ORDER BY b.created_at,b.incident_id"
        )
        .replace("{AUTHORITY}", EVENT_AUTHORITY);
        let mut notification: Option<Value> = sqlx::query_scalar(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(reference)
            .fetch_optional(&self.pool)
            .await?;
        if let Some(object) = notification.as_mut().and_then(Value::as_object_mut) {
            object.remove("incident_id");
        }
        Ok(notification)
    }

    /// Platform-only callers resolve an incident reference without publishing the
    /// connection UUID in a browser URL or exposing credential material.
    pub async fn incident_connection(&self, incident: i64) -> Result<Option<Uuid>, StoreError> {
        Ok(
            sqlx::query_scalar("SELECT vendor_id FROM connection_incidents WHERE id=$1")
                .bind(incident)
                .fetch_optional(&self.pool)
                .await?,
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
            "SELECT jsonb_build_object('incident_id',i.id,'reference',i.reference,'model',i.model_alias,'cause',i.cause,'connection_name',v.name, 'provider',CASE WHEN p.id IS NULL OR p.slug IS NULL THEN NULL ELSE jsonb_build_object('name',p.name,'slug',p.slug) END,\
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
            rows.last()
                .and_then(|row| row["reference"].as_str())
                .map(str::to_owned)
        } else {
            None
        };
        let incident_ids: Vec<i64> = rows
            .iter()
            .filter_map(|row| row["incident_id"].as_i64())
            .collect();
        for row in &mut rows {
            if let Some(object) = row.as_object_mut() {
                object.remove("incident_id");
            }
        }
        // Grouping needs the platform incident id, but returned rows must not
        // contain it. The id is removed from each notification before merging.
        let mut grouped: std::collections::HashMap<i64, Vec<Value>> =
            std::collections::HashMap::new();
        if !incident_ids.is_empty() {
            let sql = format!(
                "{INCIDENT_NOTIFICATION_SQL} WHERE b.incident_id = ANY($1) ORDER BY b.incident_id,b.organization_id,b.project_id"
            )
            .replace("{AUTHORITY}", EVENT_AUTHORITY);
            let grouped_rows: Vec<Value> = sqlx::query_scalar(&sql)
                .bind(&incident_ids)
                .fetch_all(&self.pool)
                .await?;
            for mut notification in grouped_rows {
                let Some(id) = notification["incident_id"].as_i64() else {
                    continue;
                };
                if let Some(object) = notification.as_object_mut() {
                    object.remove("incident_id");
                }
                grouped.entry(id).or_default().push(notification);
            }
        }
        for row in &mut rows {
            let Some(reference) = row["reference"].as_str() else {
                continue;
            };
            let Some(id) = reference
                .strip_prefix("incident-")
                .and_then(|value| value.parse::<i64>().ok())
            else {
                continue;
            };
            let summary = platform_summary(grouped.get(&id).map(Vec::as_slice).unwrap_or(&[]));
            row["notifications"] = summary;
        }
        Ok(
            json!({"data":rows,"next_before":next,"coverage":{"request_observed":true,"proactive_probe":"not_configured"}}),
        )
    }
}
