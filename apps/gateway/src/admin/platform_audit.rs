//! Platform operation history, independent of customer request observability.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, header},
    response::{IntoResponse, Response},
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlatformAuditQuery {
    /// Page size from 1 through 100; defaults to 50.
    limit: Option<i64>,
    /// Opaque source-qualified cursor returned by the previous page.
    cursor: Option<String>,
    /// authentication, configuration, access, or supplier.
    category: Option<String>,
}

/// List platform operation history.
///
/// ```openapi
/// {
///   "path": "/api/v1/platform/audit-events",
///   "method": "get",
///   "operation": {
///     "operationId": "listPlatformAuditEvents",
///     "summary": "List platform operation audit logs",
///     "description": "Platform administrators only. Aggregates saved operator, Provider configuration, Provider, branding, payment gateway and platform-access journals. Metadata only: no credentials, configuration values, request content or procurement prices. password_login_succeeded records verified password login; session_created records session issuance and does not prove login. Historical actor attribution may be unknown, and displayed names are current names. No historical completeness or failed-login coverage is asserted. Source-qualified keyset pagination orders newest first, using source and event ID for ties. Changing category requires restarting without a cursor. Successful responses are not cached. Includes immutable standard-price/promotion changes, text/media workspace enrollment, noncash grants and route media-liability qualification. Publishes and exact idempotent retries share the same saved event; no history is fabricated. Freeform reasons, quantities, schedules, balances and monetary values are not returned. New commercial sources remain platform-only; a cursor from another category is rejected.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "parameters": [
///       {
///         "name": "limit",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 50
///         }
///       },
///       {
///         "name": "cursor",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "maxLength": 100
///         },
///         "description": "Opaque source-qualified next_cursor from the previous page; do not parse or display."
///       },
///       {
///         "name": "category",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "enum": [
///             "authentication",
///             "configuration",
///             "access",
///             "supplier"
///           ]
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved operation metadata and a nullable continuation cursor.",
///         "headers": {
///           "Cache-Control": {
///             "schema": {
///               "type": "string",
///               "const": "no-store"
///             }
///           }
///         },
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/PlatformAuditPage"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Unknown query field, invalid category, page size or cursor, or cursor from a different category."
///       },
///       "401": {
///         "description": "Missing or invalid administrator authentication."
///       },
///       "403": {
///         "description": "Authenticated caller lacks platform administrator access. Workspace and Provider roles do not grant access."
///       },
///       "503": {
///         "description": "Durable storage unavailable."
///       }
///     }
///   },
///   "schemas": {
///     "PlatformAuditEvent": {
///       "type": "object",
///       "required": [
///         "id",
///         "source",
///         "category",
///         "action",
///         "actor_kind",
///         "actor_label",
///         "target_label",
///         "created_at",
///         "revision",
///         "before_role",
///         "after_role"
///       ],
///       "properties": {
///         "id": {
///           "type": "string",
///           "description": "Internal source-qualified event reference. Never render as a display label."
///         },
///         "source": {
///           "type": "string",
///           "enum": [
///             "operator",
///             "vendor",
///             "supplier",
///             "branding",
///             "payment_gateway",
///             "platform_access",
///             "retail_price",
///             "retail_text_enrollment",
///             "retail_media_enrollment",
///             "balance_grant",
///             "gift_correction",
///             "credit_policy",
///             "grant_preparation",
///             "media_liability",
///             "procurement_configuration"
///           ]
///         },
///         "category": {
///           "type": "string",
///           "enum": [
///             "authentication",
///             "configuration",
///             "access",
///             "supplier"
///           ]
///         },
///         "action": {
///           "type": "string"
///         },
///         "actor_kind": {
///           "type": "string"
///         },
///         "actor_label": {
///           "type": "string",
///           "description": "Recorded name or recorded system role; Unknown actor when historical attribution is absent. Labels are current names, not historical name snapshots."
///         },
///         "target_label": {
///           "type": "string"
///         },
///         "created_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "revision": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[1-9][0-9]*$",
///           "description": "Decimal revision string, when present. No configuration values are included."
///         },
///         "before_role": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "enum": [
///             "owner",
///             "admin",
///             "viewer",
///             null
///           ],
///           "description": "Recorded role before a future role_changed event; null for historical events and other journal streams."
///         },
///         "after_role": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "enum": [
///             "owner",
///             "admin",
///             "viewer",
///             null
///           ],
///           "description": "Recorded role after the same mutation; never inferred from current user metadata."
///         }
///       }
///     },
///     "PlatformAuditPage": {
///       "type": "object",
///       "required": [
///         "data",
///         "next_cursor"
///       ],
///       "properties": {
///         "data": {
///           "type": "array",
///           "items": {
///             "$ref": "#/components/schemas/PlatformAuditEvent"
///           }
///         },
///         "next_cursor": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "description": "Opaque cursor, null on the final page."
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn events(
    State(state): State<AppState>,
    Query(query): Query<PlatformAuditQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let page = state
        .store
        .platform_audit_events(
            query.category.as_deref(),
            query.cursor.as_deref(),
            query.limit.unwrap_or(50),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(([(header::CACHE_CONTROL, "no-store")], Json(page)).into_response())
}
