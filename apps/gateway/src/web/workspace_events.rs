//! Delegated workspace subscription configuration and customer-safe event evidence.
use super::management::authorize;
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State, rejection::JsonRejection},
    http::HeaderMap,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use niu_storage::{EventSubscription, Principal};
use ring::rand::SecureRandom;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

fn slug(value: &str) -> Result<(), ApiError> {
    if !niu_storage::is_valid_pool_slug(value) || matches!(value, "log" | "deliveries" | "test") {
        return Err(ApiError::invalid_request(
            "Use a readable subscription slug",
        ));
    }
    Ok(())
}
async fn record(
    state: &AppState,
    principal: &Principal,
    name: &str,
) -> Result<niu_storage::EventSubscriptionRecord, ApiError> {
    slug(name)?;
    state
        .store
        .event_subscription(principal.scope(), name)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Update {
    configuration: EventSubscription,
    #[serde(default)]
    rotate_secret: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EventPage {
    after: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct History {
    before: Option<i64>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Test {
    revision: i64,
}

/// ```openapi
/// {
///   "path": "/v1/events",
///   "method": "get",
///   "operation": {
///     "operationId": "listEventSubscriptions",
///     "summary": "List workspace event subscriptions",
///     "description": "Requires a current workspace API key with explicitly delegated events:read. Responses are no-store. At most 32 retained subscriptions per workspace, including disabled records. A saved enabled state is not live qualification. No secrets are included.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "parameters": [],
///     "responses": {
///       "200": {
///         "description": "Scoped result",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/EventSubscription"
///                   }
///                 },
///                 "limit": {
///                   "type": "integer",
///                   "const": 32
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Required current delegation is absent"
///       },
///       "404": {
///         "description": "Scoped subscription not found"
///       },
///       "409": {
///         "description": "Revision, quota or cursor conflict"
///       },
///       "503": {
///         "description": "Required encryption or storage unavailable"
///       }
///     }
///   },
///   "schemas": {
///     "EventSubscription": {
///       "type": "object",
///       "properties": {
///         "slug": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         },
///         "name": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         },
///         "endpoint": {
///           "type": "string",
///           "format": "uri",
///           "maxLength": 2048,
///           "description": "Public HTTPS URL, port 443 only, no username/password/query/fragment. Public-address validation and pinning apply at delivery."
///         },
///         "event_types": {
///           "type": "array",
///           "minItems": 1,
///           "maxItems": 4,
///           "items": {
///             "type": "string",
///             "enum": [
///               "pool.changed",
///               "evaluation.recorded",
///               "incident.opened",
///               "incident.resolved"
///             ]
///           },
///           "uniqueItems": true
///         },
///         "enabled": {
///           "type": "boolean"
///         },
///         "revision": {
///           "type": "integer",
///           "minimum": 0,
///           "maximum": 9007199254740990
///         }
///       },
///       "required": [
///         "slug",
///         "name",
///         "endpoint",
///         "event_types",
///         "enabled",
///         "revision"
///       ],
///       "additionalProperties": false
///     },
///     "WorkspaceEvent": {
///       "type": "object",
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "sequence": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "type": {
///           "type": "string",
///           "enum": [
///             "pool.changed",
///             "evaluation.recorded",
///             "incident.opened",
///             "incident.resolved",
///             "subscription.test"
///           ]
///         },
///         "schema_version": {
///           "type": "integer",
///           "const": 1
///         },
///         "occurred_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "resource": {
///           "type": "object",
///           "properties": {
///             "kind": {
///               "type": "string",
///               "enum": [
///                 "pool",
///                 "evaluation",
///                 "incident",
///                 "subscription"
///               ]
///             },
///             "slug": {
///               "type": "string"
///             },
///             "revision": {
///               "type": "integer"
///             },
///             "run": {
///               "type": "string",
///               "description": "Immutable run slug, present for evaluation.recorded. Retrieve under evaluations:read."
///             }
///           }
///         }
///       }
///     },
///     "EventDelivery": {
///       "type": "object",
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "subscription_revision": {
///           "type": "integer"
///         },
///         "sequence": {
///           "type": "string"
///         },
///         "state": {
///           "type": "string",
///           "enum": [
///             "pending",
///             "sending",
///             "delivered",
///             "failed",
///             "cancelled"
///           ]
///         },
///         "attempts": {
///           "type": "integer",
///           "minimum": 0,
///           "maximum": 8
///         },
///         "response_status": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "description": "Latest attempt HTTP outcome; null is unknown. A 2xx acknowledges receipt, not processing or task success."
///         },
///         "failure_kind": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "enum": [
///             "transport",
///             "destination",
///             "signature",
///             "http",
///             "authority",
///             "superseded",
///             "exhausted",
///             null
///           ]
///         },
///         "updated_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "lease_expires_at": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "date-time"
///         },
///         "lease_expired": {
///           "type": "boolean"
///         },
///         "next_attempt_at": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "date-time"
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "events:read").await?;
    let rows = state
        .store
        .event_subscriptions(principal.scope())
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":rows,"limit":32})))
}
/// ```openapi
/// {
///   "path": "/v1/events/{slug}",
///   "method": "get",
///   "operation": {
///     "operationId": "getEventSubscription",
///     "summary": "Read an event subscription",
///     "description": "Requires a current workspace API key with explicitly delegated events:read. Responses are no-store. Returns processed event cursor and whether the original authorizing delegation remains current. Enabled configuration alone is not active delivery or receiver acknowledgement. No secret is returned.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped result",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/EventSubscription"
///                 },
///                 "processed_cursor": {
///                   "type": "string"
///                 },
///                 "authorization_active": {
///                   "type": "boolean"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Required current delegation is absent"
///       },
///       "404": {
///         "description": "Scoped subscription not found"
///       },
///       "409": {
///         "description": "Revision, quota or cursor conflict"
///       },
///       "503": {
///         "description": "Required encryption or storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "events:read").await?;
    let record = record(&state, &principal, &name).await?;
    let active = state
        .store
        .event_subscription_authorized(principal.scope(), &name)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":record.configuration,"processed_cursor":record.cursor.to_string(),"authorization_active":active}),
    ))
}
/// ```openapi
/// {
///   "path": "/v1/events/{slug}",
///   "method": "put",
///   "operation": {
///     "operationId": "setEventSubscription",
///     "summary": "Create or update an event subscription",
///     "description": "Requires a current workspace API key with explicitly delegated events:write. Responses are no-store. revision zero creates; otherwise the current expected revision is required. Creation and rotate_secret return one randomly generated signing secret, encrypted at rest and bound to workspace/subscription. Destination changes require rotation. Destination/secret/enable transitions start after the current stream head; metadata edits preserve the processed cursor. Update enabled=false to revoke future deliveries while retaining history; in-flight requests cannot be recalled. Maximum 32 retained subscriptions. Requires configured encryption. No inference or immediate delivery occurs. On conflict read/reconcile; never automatically replay an uncertain secret-issuing mutation.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped result",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/EventSubscription"
///                 },
///                 "signing_secret": {
///                   "type": "string",
///                   "writeOnly": false,
///                   "description": "Returned once on create or explicit rotation. Store privately; never included in ordinary reads/history. If response is lost, read back revision and explicitly rotate again; do not blindly replay."
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Required current delegation is absent"
///       },
///       "404": {
///         "description": "Scoped subscription not found"
///       },
///       "409": {
///         "description": "Revision, quota or cursor conflict"
///       },
///       "503": {
///         "description": "Required encryption or storage unavailable"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "properties": {
///               "configuration": {
///                 "$ref": "#/components/schemas/EventSubscription"
///               },
///               "rotate_secret": {
///                 "type": "boolean",
///                 "default": false
///               }
///             },
///             "required": [
///               "configuration"
///             ],
///             "additionalProperties": false
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn put(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    input: Result<Json<Update>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "events:write").await?;
    slug(&name)?;
    let Json(input) = input.map_err(|_| {
        ApiError::invalid_request("Provide subscription configuration and optional rotate_secret")
    })?;
    if input.configuration.slug != name {
        return Err(ApiError::invalid_request(
            "Subscription slug must match its URL",
        ));
    }
    input.configuration.validate().map_err(|_|ApiError::invalid_request("Use a named subscription, supported event types and a public HTTPS destination without credentials, query or fragment"))?;
    let previous = state
        .store
        .event_subscription(principal.scope(), &name)
        .await
        .map_err(ApiError::from_store)?;
    if previous
        .as_ref()
        .is_some_and(|old| old.configuration.endpoint != input.configuration.endpoint)
        && !input.rotate_secret
    {
        return Err(ApiError::invalid_request(
            "Changing destination requires rotate_secret=true; configure the new receiver with the newly issued secret",
        ));
    }
    let id = previous.as_ref().map_or_else(Uuid::new_v4, |row| row.id);
    let issue = previous.is_none() || input.rotate_secret;
    let secret = if issue {
        let mut bytes = [0u8; 32];
        ring::rand::SystemRandom::new()
            .fill(&mut bytes)
            .map_err(|_| ApiError::unavailable())?;
        Some(format!("niu_whsec_{}", URL_SAFE_NO_PAD.encode(bytes)))
    } else {
        None
    };
    let ciphertext = secret
        .as_ref()
        .map(|secret| {
            state
                .vendor_cipher
                .as_ref()
                .ok_or_else(ApiError::unavailable)?
                .seal_event_subscription(principal.scope(), id, secret)
                .map_err(|_| ApiError::unavailable())
        })
        .transpose()?;
    let saved = state
        .store
        .set_event_subscription(&principal, id, &input.configuration, ciphertext.as_deref())
        .await
        .map_err(ApiError::from_store)?;
    let mut result = json!({"data":saved});
    if let Some(secret) = secret {
        result["signing_secret"] = json!(secret);
    }
    Ok(Json(result))
}
/// ```openapi
/// {
///   "path": "/v1/events/log",
///   "method": "get",
///   "operation": {
///     "operationId": "listWorkspaceEvents",
///     "summary": "Read workspace resource events",
///     "description": "Requires a current workspace API key with explicitly delegated events:read. Responses are no-store. Returns at most 100 events ascending with decimal sequence cursors. An absent cursor starts at zero. Continue using next_after; future/out-of-range cursors return 409. Events are immutable and no pruning window is enabled. Stable event identity supports deduplication; replay through this read does not dispatch a webhook. Contains resource identity/revision and time, no model prompts or commercial procurement data.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "after",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped result",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/WorkspaceEvent"
///                   }
///                 },
///                 "has_more": {
///                   "type": "boolean"
///                 },
///                 "next_after": {
///                   "type": "string"
///                 },
///                 "retention": {
///                   "type": "string",
///                   "const": "no_pruning"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Required current delegation is absent"
///       },
///       "404": {
///         "description": "Scoped subscription not found"
///       },
///       "409": {
///         "description": "Revision, quota or cursor conflict"
///       },
///       "503": {
///         "description": "Required encryption or storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn log(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<EventPage>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "events:read").await?;
    let after = match query.after.as_deref() {
        None => 0,
        Some(value) if !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()) => {
            value
                .parse::<i64>()
                .map_err(|_| ApiError::invalid_request("Use the returned decimal event cursor"))?
        }
        _ => {
            return Err(ApiError::invalid_request(
                "Use the returned decimal event cursor",
            ));
        }
    };
    let head = state
        .store
        .workspace_event_head(principal.scope())
        .await
        .map_err(ApiError::from_store)?;
    if after > head {
        return Err(ApiError::from_store(niu_storage::StoreError::Conflict));
    }
    let mut rows = state
        .store
        .workspace_events(principal.scope(), after)
        .await
        .map_err(ApiError::from_store)?;
    let has_more = rows.len() > 100;
    rows.truncate(100);
    let next = rows
        .last()
        .and_then(|row| row["sequence"].as_str())
        .map_or_else(|| after.to_string(), str::to_owned);
    Ok(Json(
        json!({"data":rows,"has_more":has_more,"next_after":next,"retention":"no_pruning"}),
    ))
}
/// ```openapi
/// {
///   "path": "/v1/events/{slug}/history",
///   "method": "get",
///   "operation": {
///     "operationId": "getEventSubscriptionHistory",
///     "summary": "Read subscription configuration history",
///     "description": "Requires a current workspace API key with explicitly delegated events:read. Responses are no-store. Immutable configuration snapshots, newest revision first, at most 100. Follow next_before when present. No signing credentials or ciphertext are included.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "before",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "minimum": 1
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped result",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/EventSubscription"
///                   }
///                 },
///                 "next_before": {
///                   "type": [
///                     "integer",
///                     "null"
///                   ]
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Required current delegation is absent"
///       },
///       "404": {
///         "description": "Scoped subscription not found"
///       },
///       "409": {
///         "description": "Revision, quota or cursor conflict"
///       },
///       "503": {
///         "description": "Required encryption or storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Query(query): Query<History>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "events:read").await?;
    record(&state, &principal, &name).await?;
    let rows = state
        .store
        .event_subscription_history(principal.scope(), &name, query.before)
        .await
        .map_err(ApiError::from_store)?;
    let next = (rows.len() == 100).then(|| rows.last().unwrap()["revision"].clone());
    Ok(Json(json!({"data":rows,"next_before":next})))
}
/// ```openapi
/// {
///   "path": "/v1/events/{slug}/deliveries",
///   "method": "get",
///   "operation": {
///     "operationId": "getEventDeliveries",
///     "summary": "Inspect the latest 100 subscription deliveries",
///     "description": "Requires a current workspace API key with explicitly delegated events:read. Responses are no-store. Persisted latest attempt state, bounded retry count, HTTP outcome, lease expiry and next scheduled retry. A sending row with expired lease is not evidence of a currently active network call. Lost acknowledgements stay unknown. Only 2xx is delivery acknowledgement; no host wake, receiver processing or task success is established. Response bodies and arbitrary upstream errors are not retained. Reconcile via sequence in the event log.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped result",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/EventDelivery"
///                   }
///                 },
///                 "limit": {
///                   "type": "integer",
///                   "const": 100
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Required current delegation is absent"
///       },
///       "404": {
///         "description": "Scoped subscription not found"
///       },
///       "409": {
///         "description": "Revision, quota or cursor conflict"
///       },
///       "503": {
///         "description": "Required encryption or storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn deliveries(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "events:read").await?;
    record(&state, &principal, &name).await?;
    let rows = state
        .store
        .event_deliveries(principal.scope(), &name)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":rows,"limit":100})))
}
/// ```openapi
/// {
///   "path": "/v1/events/{slug}/test",
///   "method": "post",
///   "operation": {
///     "operationId": "testEventSubscription",
///     "summary": "Queue a signed subscription test",
///     "description": "Requires a current workspace API key with explicitly delegated events:write. Responses are no-store. Requires the current expected revision, enabled subscription and current original delegation. Appends a subscription.test event targeted only to this subscription and queues asynchronous delivery. The receipt is not a receiver acknowledgement; inspect deliveries afterward. The signed event is observable in the workspace event log. No inference occurs. Repeating this request creates another distinct test; do not replay an uncertain response blindly.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped result",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "sequence": {
///                       "type": "string"
///                     },
///                     "type": {
///                       "type": "string",
///                       "const": "subscription.test"
///                     },
///                     "subscription_revision": {
///                       "type": "integer"
///                     },
///                     "delivery": {
///                       "type": "string",
///                       "const": "queued"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Required current delegation is absent"
///       },
///       "404": {
///         "description": "Scoped subscription not found"
///       },
///       "409": {
///         "description": "Revision, quota or cursor conflict"
///       },
///       "503": {
///         "description": "Required encryption or storage unavailable"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "properties": {
///               "revision": {
///                 "type": "integer",
///                 "minimum": 1
///               }
///             },
///             "required": [
///               "revision"
///             ],
///             "additionalProperties": false
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn test(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    input: Result<Json<Test>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "events:write").await?;
    record(&state, &principal, &name).await?;
    let Json(input) = input
        .map_err(|_| ApiError::invalid_request("Provide the current subscription revision"))?;
    if !state
        .store
        .event_subscription_authorized(principal.scope(), &name)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::forbidden());
    }
    let receipt = state
        .store
        .test_event_subscription(&principal, &name, input.revision)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":receipt})))
}

/// ```openapi
/// {"path":"/v1/incidents/{reference}","method":"get","operation":{"operationId":"getWorkspaceIncidentEvent","summary":"Reconcile an incident event in the current workspace","description":"Requires a current workspace key with events:read. The opaque reference is unique to the affected workspace. Returns that workspace's model, whether its connection is owner-funded, current incident state and recovery time. No upstream connection, credentials, request content, procurement data or other workspace identity. Historical references remain readable after recovery. A missing or foreign reference returns 404. The event signals a specific incident, not current health of all models or Provider supply. No inference or notification is sent. Cache-Control no-store.","security":[{"bearerAuth":[]}],"parameters":[{"name":"reference","in":"path","required":true,"schema":{"type":"string","pattern":"^incident-[0-9a-f]{32}$"}}],"responses":{"200":{"description":"Workspace-scoped incident","content":{"application/json":{"schema":{"type":"object","required":["data"],"properties":{"data":{"type":"object","required":["reference","model","owner_funded","status","recovered_at"],"properties":{"reference":{"type":"string"},"model":{"type":"string"},"owner_funded":{"type":"boolean"},"status":{"type":"string","enum":["active","resolved"]},"recovered_at":{"type":["string","null"],"format":"date-time"}}}}}}}},"400":{"description":"Invalid reference"},"401":{"description":"Authentication required"},"403":{"description":"events:read required"},"404":{"description":"Incident unavailable"},"503":{"description":"Evidence unavailable"}},"x-niu-implementation":"implemented"}}
/// ```
pub async fn incident(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(reference): Path<String>,
) -> Result<axum::response::Response, ApiError> {
    use axum::response::IntoResponse;
    let principal = authorize(&state, &headers, "events:read").await?;
    if reference.len() != 41
        || !reference.starts_with("incident-")
        || !reference[9..]
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(ApiError::invalid_request(
            "Use the workspace incident event reference",
        ));
    }
    let data = state
        .store
        .workspace_incident_event_detail(principal.scope(), &reference)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let mut response = Json(json!({"data":data})).into_response();
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    );
    Ok(response)
}
