//! Durable private video timelines: saved-state operations never submit inference.
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{
        Path, Query, State,
        rejection::{JsonRejection, QueryRejection},
    },
    http::HeaderMap,
};
use niu_storage::{AdminPermission, TenantScope};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;
fn scope(o: Uuid, p: Uuid) -> TenantScope {
    TenantScope {
        organization_id: o,
        project_id: p,
    }
}
async fn owner(
    s: &AppState,
    h: &HeaderMap,
    scope: TenantScope,
    permission: AdminPermission,
) -> Result<String, ApiError> {
    let a = s.authorize_admin_headers(h, permission).await?;
    if !a.permits_project(scope) {
        return Err(ApiError::forbidden());
    }
    Ok(match a {
        AdminAuthorization::Installation => "installation".into(),
        AdminAuthorization::Operator(o) => format!("operator:{}", o.id),
    })
}
async fn loaded(
    s: &AppState,
    scope: TenantScope,
    owner: &str,
    id: Uuid,
) -> Result<Json<Value>, ApiError> {
    Ok(Json(
        json!({"data":s.store.generations_session(scope,owner,id).await.map_err(ApiError::from_store)?.ok_or_else(ApiError::not_found)?}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct Create {
    expected_revision: String,
    title: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct Update {
    expected_revision: String,
    title: String,
    archived: bool,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, tag = "kind", rename_all = "snake_case")]
pub(in crate::web) enum Instruction {
    Video { prompt: String },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct Append {
    expected_revision: String,
    instruction: Instruction,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct Attach {
    expected_revision: String,
    task_id: Uuid,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct BindIntent {
    expected_revision: String,
    intent_id: Uuid,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct Revision {
    expected_revision: String,
}
#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Category {
    #[default]
    Video,
    Chat,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct View {
    #[serde(default)]
    category: Category,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct Page {
    #[serde(default)]
    category: Category,
    before: Option<Uuid>,
    limit: Option<i64>,
    #[serde(default)]
    archived: bool,
}
fn revision(v: &str) -> Result<i64, ApiError> {
    v.parse()
        .ok()
        .filter(|n: &i64| *n > 0 && n.to_string() == v)
        .ok_or_else(|| {
            ApiError::invalid_request("expected_revision must be a positive decimal string")
        })
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}",
///   "method": "put",
///   "operation": {
///     "operationId": "generationsSessionCreate",
///     "summary": "Create a private video generations session",
///     "description": "Actor-private within one workspace: installation credentials share the installation actor; each operator has an isolated owner. Current workspace Read is required for reads and Write for mutations; API-key inference credentials alone do not authorize these administrator routes. Saved-state reads and all writes never dispatch, refresh or replay inference. New writes use video category only; legacy Chat writes remain unchanged, while category=chat reads use a compatible projection. Revisions and sequences are decimal strings. Instructions follow existing Chat/intents JSON storage (not application-encrypted at rest); content expires after 30 days and is hidden immediately, then cleared by retention maintenance. Task identity and history remain. Archive does not cancel tasks or remove outputs/billing. Client chooses stable UUID; expected_revision must be zero. Identical initial retry returns same session; changed title or an already advanced session conflicts.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "session",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Create a private video generations session",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/GenerationsVideoSession"
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid request or cursor"
///       },
///       "401": {
///         "description": "Invalid administrator session or unauthorized historical task"
///       },
///       "403": {
///         "description": "Current workspace permission denied"
///       },
///       "404": {
///         "description": "Actor-owned session is absent"
///       },
///       "409": {
///         "description": "Stale revision, changed idempotent identity, archive or task association conflict"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "properties": {
///               "expected_revision": {
///                 "type": "string",
///                 "const": "0"
///               },
///               "title": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 800
///               }
///             },
///             "required": [
///               "expected_revision",
///               "title"
///             ]
///           }
///         }
///       }
///     }
///   },
///   "schemas": {
///     "GenerationsVideoInstruction": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "kind": {
///           "type": "string",
///           "const": "video"
///         },
///         "prompt": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 61440
///         }
///       },
///       "required": [
///         "kind",
///         "prompt"
///       ]
///     },
///     "GenerationsVideoTaskReference": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "kind": {
///           "type": "string",
///           "const": "video"
///         },
///         "model": {
///           "type": "string"
///         },
///         "status": {
///           "type": "string",
///           "enum": [
///             "submission_unknown",
///             "queued",
///             "running",
///             "succeeded",
///             "failed",
///             "unknown",
///             "reconciliation_required"
///           ]
///         },
///         "artifacts": {
///           "type": "array",
///           "items": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "task_id",
///               "kind",
///               "availability"
///             ],
///             "properties": {
///               "task_id": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "kind": {
///                 "type": "string",
///                 "enum": [
///                   "video",
///                   "last_frame"
///                 ]
///               },
///               "availability": {
///                 "type": "string",
///                 "enum": [
///                   "available",
///                   "expired",
///                   "deleted",
///                   "unavailable"
///                 ]
///               }
///             }
///           }
///         }
///       },
///       "required": [
///         "id",
///         "kind",
///         "model",
///         "status",
///         "artifacts"
///       ]
///     },
///     "GenerationsVideoTurn": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "sequence": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "created_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "content_state": {
///           "type": "string",
///           "enum": [
///             "retained",
///             "deleted",
///             "expired"
///           ]
///         },
///         "instruction": {
///           "oneOf": [
///             {
///               "$ref": "#/components/schemas/GenerationsVideoInstruction"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "content_expires_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "task_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         },
///         "task": {
///           "oneOf": [
///             {
///               "$ref": "#/components/schemas/GenerationsVideoTaskReference"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "intent": {
///           "oneOf": [
///             {
///               "$ref": "#/components/schemas/GenerationsVideoIntentReference"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         }
///       },
///       "required": [
///         "id",
///         "sequence",
///         "created_at",
///         "content_state",
///         "instruction",
///         "content_expires_at",
///         "task_id",
///         "task",
///         "intent"
///       ]
///     },
///     "GenerationsVideoSessionSummary": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "workspace_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "category": {
///           "type": "string",
///           "const": "video"
///         },
///         "title": {
///           "type": "string"
///         },
///         "revision": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "archived": {
///           "type": "boolean"
///         },
///         "created_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "updated_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "owner": {
///           "type": "string",
///           "description": "Internal authenticated actor reference; never a product display label."
///         }
///       },
///       "required": [
///         "id",
///         "workspace_id",
///         "category",
///         "title",
///         "revision",
///         "archived",
///         "created_at",
///         "updated_at",
///         "owner"
///       ]
///     },
///     "GenerationsVideoSession": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "workspace_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "category": {
///           "type": "string",
///           "const": "video"
///         },
///         "title": {
///           "type": "string"
///         },
///         "revision": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "archived": {
///           "type": "boolean"
///         },
///         "created_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "updated_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "turns": {
///           "type": "array",
///           "maxItems": 100,
///           "items": {
///             "$ref": "#/components/schemas/GenerationsVideoTurn"
///           }
///         },
///         "owner": {
///           "type": "string",
///           "description": "Internal authenticated actor reference; never a product display label."
///         }
///       },
///       "required": [
///         "id",
///         "workspace_id",
///         "category",
///         "title",
///         "revision",
///         "archived",
///         "created_at",
///         "updated_at",
///         "turns",
///         "owner"
///       ]
///     },
///     "GenerationsChatInstruction": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "kind": {
///           "type": "string",
///           "const": "chat"
///         },
///         "prompt": {
///           "type": "string"
///         },
///         "attachments": {
///           "type": "array",
///           "items": {
///             "type": "object",
///             "additionalProperties": false,
///             "properties": {
///               "name": {
///                 "type": "string"
///               },
///               "type": {
///                 "type": "string"
///               },
///               "content": {
///                 "type": "string"
///               }
///             },
///             "required": [
///               "name",
///               "type",
///               "content"
///             ]
///           }
///         }
///       },
///       "required": [
///         "kind",
///         "prompt"
///       ]
///     },
///     "GenerationsChatTaskReference": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "kind": {
///           "type": "string",
///           "const": "chat"
///         },
///         "model": {
///           "type": "string"
///         },
///         "execution": {
///           "type": "string",
///           "enum": [
///             "not_sent",
///             "may_have_executed",
///             "confirmed_completed",
///             "confirmed_not_executed"
///           ]
///         }
///       },
///       "required": [
///         "id",
///         "kind",
///         "model",
///         "execution"
///       ]
///     },
///     "GenerationsChatBranch": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "model": {
///           "type": "string"
///         },
///         "content": {
///           "type": "string"
///         },
///         "elapsedMs": {
///           "type": "number"
///         },
///         "phase": {
///           "type": "string",
///           "enum": [
///             "connecting",
///             "streaming",
///             "complete",
///             "failed",
///             "cancelled"
///           ],
///           "description": "Saved client comparison phase, never authoritative task state or upstream cancellation."
///         },
///         "promptTokens": {
///           "type": [
///             "number",
///             "null"
///           ]
///         },
///         "completionTokens": {
///           "type": [
///             "number",
///             "null"
///           ]
///         },
///         "totalTokens": {
///           "type": [
///             "number",
///             "null"
///           ]
///         },
///         "error": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "customerChargeNanos": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "customerChargeCurrency": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "customerChargeStatus": {
///           "type": "string",
///           "enum": [
///             "charged",
///             "owner_funded",
///             "pending",
///             "unpriced",
///             "not_charged",
///             "unknown"
///           ]
///         },
///         "task": {
///           "oneOf": [
///             {
///               "$ref": "#/components/schemas/GenerationsChatTaskReference"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         }
///       },
///       "required": [
///         "task"
///       ]
///     },
///     "GenerationsChatTurn": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "id": {
///           "type": "string",
///           "pattern": "^chat-turn:[0-9a-f]{64}$",
///           "description": "Read-only derived reference from scoped session identity, sequence and retained instruction digest. Changing legacy instruction/order changes the reference; comparison output updates do not."
///         },
///         "kind": {
///           "type": "string",
///           "const": "chat"
///         },
///         "sequence": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "created_at": {
///           "type": "null"
///         },
///         "content_state": {
///           "type": "string",
///           "enum": [
///             "retained",
///             "missing"
///           ]
///         },
///         "instruction": {
///           "oneOf": [
///             {
///               "$ref": "#/components/schemas/GenerationsChatInstruction"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "content_expires_at": {
///           "type": "null"
///         },
///         "branches": {
///           "type": "array",
///           "items": {
///             "$ref": "#/components/schemas/GenerationsChatBranch"
///           }
///         }
///       },
///       "required": [
///         "id",
///         "kind",
///         "sequence",
///         "created_at",
///         "content_state",
///         "instruction",
///         "content_expires_at",
///         "branches"
///       ]
///     },
///     "GenerationsChatSessionSummary": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "workspace_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "category": {
///           "type": "string",
///           "const": "chat"
///         },
///         "title": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "revision": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "archived": {
///           "type": "boolean"
///         },
///         "created_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "updated_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "owner": {
///           "type": "string",
///           "description": "Internal authenticated actor reference; never a product display label."
///         }
///       },
///       "required": [
///         "id",
///         "workspace_id",
///         "category",
///         "title",
///         "revision",
///         "archived",
///         "created_at",
///         "updated_at",
///         "owner"
///       ]
///     },
///     "GenerationsChatSession": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "workspace_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "category": {
///           "type": "string",
///           "const": "chat"
///         },
///         "title": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "revision": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "archived": {
///           "type": "boolean"
///         },
///         "created_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "updated_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "owner": {
///           "type": "string",
///           "description": "Internal authenticated actor reference; never a product display label."
///         },
///         "turns": {
///           "type": "array",
///           "items": {
///             "$ref": "#/components/schemas/GenerationsChatTurn"
///           }
///         }
///       },
///       "required": [
///         "id",
///         "workspace_id",
///         "category",
///         "title",
///         "revision",
///         "archived",
///         "created_at",
///         "updated_at",
///         "owner",
///         "turns"
///       ]
///     },
///     "GenerationsVideoIntentReference": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "id",
///         "revision",
///         "model",
///         "content_state",
///         "submission_state",
///         "task_id"
///       ],
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "revision": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "model": {
///           "type": "string"
///         },
///         "content_state": {
///           "enum": [
///             "retained",
///             "deleted",
///             "expired"
///           ]
///         },
///         "submission_state": {
///           "enum": [
///             "saved",
///             "not_dispatched",
///             "dispatched"
///           ]
///         },
///         "task_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         }
///       },
///       "description": "Canonical retained model/controls/material draft is restored through the existing getVideoIntent contract; this safe reference contains no raw request. The turn instruction is the separately saved user instruction/review note, not asserted to be the historical submitted prompt."
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn create(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path((o, p, id)): Path<(Uuid, Uuid, Uuid)>,
    input: Result<Json<Create>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid Generations session input"))?;
    let sc = scope(o, p);
    let own = owner(&s, &headers, sc, AdminPermission::Write).await?;
    if input.expected_revision != "0" {
        return Err(ApiError::invalid_request(
            "Creation requires expected_revision zero",
        ));
    }
    s.store
        .create_generations_session(sc, &own, id, &input.title)
        .await
        .map_err(ApiError::from_store)?;
    loaded(&s, sc, &own, id).await
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}",
///   "method": "get",
///   "operation": {
///     "operationId": "generationsSessionGet",
///     "summary": "Read a private saved generations timeline",
///     "description": "Actor-private within one workspace: installation credentials share the installation actor; each operator has an isolated owner. Current workspace Read is required for reads and Write for mutations; API-key inference credentials alone do not authorize these administrator routes. Saved-state reads and all writes never dispatch, refresh or replay inference. Read categories are video (default) and chat; legacy Chat write APIs remain unchanged. Revisions and sequences are decimal strings. Video instructions follow existing Chat/intents JSON storage (not application-encrypted at rest); Video content expires after 30 days and is hidden immediately, then cleared by retention maintenance. Task identity and history remain. Archive does not cancel tasks or remove outputs/billing.  Set category=chat for a read-only bridge over the existing actor-private Chat record. The same route defaults to video; IDs are scoped independently by category. Chat metadata uses database clocks and current guarded-write revision. Missing Chat title is null, never replaced by an internal ID. Chat turns preserve comparison branches, not one running conversation task. Per-turn creation/expiry clocks are unknown and null; missing retained prompt yields missing state and null instruction. Turn references are read-only scoped identity/sequence/instruction digests and cannot be used with Video writes. Branch phase/output are exact saved conversation content; actual execution references require a current workspace attempt and matching model. Customer charges are hydrated from the existing ledger projection; no saved procurement fields are returned. Chat retention and writes stay under the legacy Chat contract; Video 30-day instruction retention does not apply to this bridge.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "session",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "category",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "enum": [
///             "video",
///             "chat"
///           ],
///           "default": "video"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Read a private saved video timeline",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "oneOf": [
///                     {
///                       "$ref": "#/components/schemas/GenerationsVideoSession"
///                     },
///                     {
///                       "$ref": "#/components/schemas/GenerationsChatSession"
///                     }
///                   ]
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid request or cursor"
///       },
///       "401": {
///         "description": "Invalid administrator session or unauthorized historical task"
///       },
///       "403": {
///         "description": "Current workspace permission denied"
///       },
///       "404": {
///         "description": "Actor-owned session is absent"
///       },
///       "409": {
///         "description": "Stale revision, changed idempotent identity, archive or task association conflict"
///       },
///       "413": {
///         "description": "Saved Chat payload exceeds the bounded 32 MiB materialization budget."
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn get(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path((o, p, id)): Path<(Uuid, Uuid, Uuid)>,
    query: Result<Query<View>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let Query(view) =
        query.map_err(|_| ApiError::invalid_request("Invalid Generations session query"))?;
    let sc = scope(o, p);
    let own = owner(&s, &headers, sc, AdminPermission::Read).await?;
    match view.category {
        Category::Video => loaded(&s, sc, &own, id).await,
        Category::Chat => Ok(Json(
            json!({"data":s.store.generations_chat_session(sc,&own,id).await.map_err(ApiError::from_store)?.ok_or_else(ApiError::not_found)?}),
        )),
    }
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/generations-sessions",
///   "method": "get",
///   "operation": {
///     "operationId": "generationsSessionList",
///     "summary": "List private generations sessions",
///     "description": "Actor-private within one workspace: installation credentials share the installation actor; each operator has an isolated owner. Current workspace Read is required for reads and Write for mutations; API-key inference credentials alone do not authorize these administrator routes. Saved-state reads and all writes never dispatch, refresh or replay inference. Read categories are video (default) and chat; legacy Chat write APIs remain unchanged. Revisions and sequences are decimal strings. Video instructions follow existing Chat/intents JSON storage (not application-encrypted at rest); Video content expires after 30 days and is hidden immediately, then cleared by retention maintenance. Task identity and history remain. Archive does not cancel tasks or remove outputs/billing. Stable descending creation time then UUID pagination; before refers to an actor-visible record independently of its current archive state; archiving a prior page cursor does not invalidate traversal. Invalid cursor returns 400, never an empty page. Limit 1..100; next_before is null when exhausted. Set category=chat for a read-only bridge over the existing actor-private Chat record. The same route defaults to video; IDs are scoped independently by category. Chat metadata uses database clocks and current guarded-write revision. Missing Chat title is null, never replaced by an internal ID. Chat turns preserve comparison branches, not one running conversation task. Per-turn creation/expiry clocks are unknown and null; missing retained prompt yields missing state and null instruction. Turn references are read-only scoped identity/sequence/instruction digests and cannot be used with Video writes. Branch phase/output are exact saved conversation content; actual execution references require a current workspace attempt and matching model. Customer charges are hydrated from the existing ledger projection; no saved procurement fields are returned. Chat retention and writes stay under the legacy Chat contract; Video 30-day instruction retention does not apply to this bridge.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "before",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 20
///         }
///       },
///       {
///         "name": "archived",
///         "in": "query",
///         "schema": {
///           "type": "boolean",
///           "default": false
///         }
///       },
///       {
///         "name": "category",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "enum": [
///             "video",
///             "chat"
///           ],
///           "default": "video"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "List private video generations sessions",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "oneOf": [
///                       {
///                         "$ref": "#/components/schemas/GenerationsVideoSessionSummary"
///                       },
///                       {
///                         "$ref": "#/components/schemas/GenerationsChatSessionSummary"
///                       }
///                     ]
///                   }
///                 },
///                 "has_more": {
///                   "type": "boolean"
///                 },
///                 "next_before": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "uuid"
///                 }
///               },
///               "required": [
///                 "data",
///                 "has_more",
///                 "next_before"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid request or cursor"
///       },
///       "401": {
///         "description": "Invalid administrator session or unauthorized historical task"
///       },
///       "403": {
///         "description": "Current workspace permission denied"
///       },
///       "404": {
///         "description": "Actor-owned session is absent"
///       },
///       "409": {
///         "description": "Stale revision, changed idempotent identity, archive or task association conflict"
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn list(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path((o, p)): Path<(Uuid, Uuid)>,
    query: Result<Query<Page>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let Query(q) =
        query.map_err(|_| ApiError::invalid_request("Invalid Generations session query"))?;
    let sc = scope(o, p);
    let own = owner(&s, &headers, sc, AdminPermission::Read).await?;
    let limit = q.limit.unwrap_or(20);
    let mut data = match q.category {
        Category::Video => {
            s.store
                .generations_session_page(sc, &own, q.before, limit, q.archived)
                .await
        }
        Category::Chat => {
            s.store
                .generations_chat_session_page(sc, &own, q.before, limit, q.archived)
                .await
        }
    }
    .map_err(ApiError::from_store)?;
    let more = data.len() > limit as usize;
    if more {
        data.pop();
    }
    let next = if more {
        data.last().and_then(|x| x.get("id")).cloned()
    } else {
        None
    };
    Ok(Json(
        json!({"data":data,"has_more":more,"next_before":next}),
    ))
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}",
///   "method": "patch",
///   "operation": {
///     "operationId": "generationsSessionUpdate",
///     "summary": "Rename or archive a private video session",
///     "description": "Actor-private within one workspace: installation credentials share the installation actor; each operator has an isolated owner. Current workspace Read is required for reads and Write for mutations; API-key inference credentials alone do not authorize these administrator routes. Saved-state reads and all writes never dispatch, refresh or replay inference. New writes use video category only; legacy Chat writes remain unchanged, while category=chat reads use a compatible projection. Revisions and sequences are decimal strings. Instructions follow existing Chat/intents JSON storage (not application-encrypted at rest); content expires after 30 days and is hidden immediately, then cleared by retention maintenance. Task identity and history remain. Archive does not cancel tasks or remove outputs/billing.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "session",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Rename or archive a private video session",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/GenerationsVideoSession"
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid request or cursor"
///       },
///       "401": {
///         "description": "Invalid administrator session or unauthorized historical task"
///       },
///       "403": {
///         "description": "Current workspace permission denied"
///       },
///       "404": {
///         "description": "Actor-owned session is absent"
///       },
///       "409": {
///         "description": "Stale revision, changed idempotent identity, archive or task association conflict"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "properties": {
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]*$"
///               },
///               "title": {
///                 "type": "string"
///               },
///               "archived": {
///                 "type": "boolean"
///               }
///             },
///             "required": [
///               "expected_revision",
///               "title",
///               "archived"
///             ]
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn update(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path((o, p, id)): Path<(Uuid, Uuid, Uuid)>,
    input: Result<Json<Update>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid Generations session input"))?;
    let sc = scope(o, p);
    let own = owner(&s, &headers, sc, AdminPermission::Write).await?;
    s.store
        .update_generations_session(
            sc,
            &own,
            id,
            revision(&input.expected_revision)?,
            &input.title,
            input.archived,
        )
        .await
        .map_err(ApiError::from_store)?;
    loaded(&s, sc, &own, id).await
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}/turns/{turn}",
///   "method": "put",
///   "operation": {
///     "operationId": "generationsSessionAppend",
///     "summary": "Append one retained video instruction",
///     "description": "Actor-private within one workspace: installation credentials share the installation actor; each operator has an isolated owner. Current workspace Read is required for reads and Write for mutations; API-key inference credentials alone do not authorize these administrator routes. Saved-state reads and all writes never dispatch, refresh or replay inference. New writes use video category only; legacy Chat writes remain unchanged, while category=chat reads use a compatible projection. Revisions and sequences are decimal strings. Instructions follow existing Chat/intents JSON storage (not application-encrypted at rest); content expires after 30 days and is hidden immediately, then cleared by retention maintenance. Task identity and history remain. Archive does not cancel tasks or remove outputs/billing. At most 100 turns per session and 60 KiB prompt. Changed instruction creates a new client-generated turn UUID. Identical UUID/instruction retry is idempotent even after a lost response or content expiry; a changed instruction conflicts. No client execution state, output URL or arbitrary input object is accepted.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "session",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "turn",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Append one retained video instruction",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/GenerationsVideoSession"
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid request or cursor"
///       },
///       "401": {
///         "description": "Invalid administrator session or unauthorized historical task"
///       },
///       "403": {
///         "description": "Current workspace permission denied"
///       },
///       "404": {
///         "description": "Actor-owned session is absent"
///       },
///       "409": {
///         "description": "Stale revision, changed idempotent identity, archive or task association conflict"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "properties": {
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]*$"
///               },
///               "instruction": {
///                 "$ref": "#/components/schemas/GenerationsVideoInstruction"
///               }
///             },
///             "required": [
///               "expected_revision",
///               "instruction"
///             ]
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn append(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path((o, p, id, turn)): Path<(Uuid, Uuid, Uuid, Uuid)>,
    input: Result<Json<Append>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid Generations session input"))?;
    let sc = scope(o, p);
    let own = owner(&s, &headers, sc, AdminPermission::Write).await?;
    let Instruction::Video { ref prompt } = input.instruction;
    if prompt.trim().is_empty() || prompt.len() > 60 * 1024 {
        return Err(ApiError::invalid_request(
            "Instruction requires nonempty video prompt up to 60 KiB",
        ));
    }
    let instruction = serde_json::to_value(input.instruction)
        .map_err(|_| ApiError::invalid_request("Invalid instruction"))?;
    s.store
        .append_generations_turn(
            sc,
            &own,
            id,
            turn,
            revision(&input.expected_revision)?,
            &instruction,
        )
        .await
        .map_err(ApiError::from_store)?;
    loaded(&s, sc, &own, id).await
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}/turns/{turn}/task",
///   "method": "put",
///   "operation": {
///     "operationId": "generationsSessionAttach",
///     "summary": "Attach an existing authorized video task",
///     "description": "Actor-private within one workspace: installation credentials share the installation actor; each operator has an isolated owner. Current workspace Read is required for reads and Write for mutations; API-key inference credentials alone do not authorize these administrator routes. Saved-state reads and all writes never dispatch, refresh or replay inference. New writes use video category only; legacy Chat writes remain unchanged, while category=chat reads use a compatible projection. Revisions and sequences are decimal strings. Instructions follow existing Chat/intents JSON storage (not application-encrypted at rest); content expires after 30 days and is hidden immediately, then cleared by retention maintenance. Task identity and history remain. Archive does not cancel tasks or remove outputs/billing. API-created dispatched video tasks with an original recovery route in the same workspace may be attached by a current workspace writer without an active key secret. An original actor-owned submission intent belonging to another actor is forbidden. One task belongs to one turn and one turn has one task. Existing association retries are idempotent; a different association conflicts. Current revision is required for fresh association. Revoked keys gain no dispatch or refresh authority.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "session",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "turn",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Attach an existing authorized video task",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/GenerationsVideoSession"
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid request or cursor"
///       },
///       "401": {
///         "description": "Invalid administrator session or unauthorized historical task"
///       },
///       "403": {
///         "description": "Current workspace permission denied"
///       },
///       "404": {
///         "description": "Actor-owned session is absent"
///       },
///       "409": {
///         "description": "Stale revision, changed idempotent identity, archive or task association conflict"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "properties": {
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]*$"
///               },
///               "task_id": {
///                 "type": "string",
///                 "format": "uuid"
///               }
///             },
///             "required": [
///               "expected_revision",
///               "task_id"
///             ]
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn attach(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path((o, p, id, turn)): Path<(Uuid, Uuid, Uuid, Uuid)>,
    input: Result<Json<Attach>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid Generations session input"))?;
    let sc = scope(o, p);
    let own = owner(&s, &headers, sc, AdminPermission::Write).await?;
    s.store
        .attach_generations_task(
            sc,
            &own,
            id,
            turn,
            revision(&input.expected_revision)?,
            input.task_id,
        )
        .await
        .map_err(ApiError::from_store)?;
    loaded(&s, sc, &own, id).await
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}/turns/{turn}",
///   "method": "delete",
///   "operation": {
///     "operationId": "generationsSessionDeleteInstruction",
///     "summary": "Delete retained instruction content",
///     "description": "Actor-private within one workspace: installation credentials share the installation actor; each operator has an isolated owner. Current workspace Read is required for reads and Write for mutations; API-key inference credentials alone do not authorize these administrator routes. Saved-state reads and all writes never dispatch, refresh or replay inference. New writes use video category only; legacy Chat writes remain unchanged, while category=chat reads use a compatible projection. Revisions and sequences are decimal strings. Instructions follow existing Chat/intents JSON storage (not application-encrypted at rest); content expires after 30 days and is hidden immediately, then cleared by retention maintenance. Task identity and history remain. Archive does not cancel tasks or remove outputs/billing. Expected session revision is required; deletes only instruction content, retaining turn identity and immutable task association.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "session",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "turn",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Delete retained instruction content",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/GenerationsVideoSession"
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid request or cursor"
///       },
///       "401": {
///         "description": "Invalid administrator session or unauthorized historical task"
///       },
///       "403": {
///         "description": "Current workspace permission denied"
///       },
///       "404": {
///         "description": "Actor-owned session is absent"
///       },
///       "409": {
///         "description": "Stale revision, changed idempotent identity, archive or task association conflict"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "properties": {
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]*$"
///               }
///             },
///             "required": [
///               "expected_revision"
///             ]
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn delete_instruction(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path((o, p, id, turn)): Path<(Uuid, Uuid, Uuid, Uuid)>,
    input: Result<Json<Revision>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid Generations session input"))?;
    let sc = scope(o, p);
    let own = owner(&s, &headers, sc, AdminPermission::Write).await?;
    s.store
        .delete_generations_instruction(sc, &own, id, turn, revision(&input.expected_revision)?)
        .await
        .map_err(ApiError::from_store)?;
    loaded(&s, sc, &own, id).await
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}/turns/{turn}/intent",
///   "method": "put",
///   "operation": {
///     "operationId": "generationsSessionBindIntent",
///     "summary": "Bind a saved Video intent to a private turn",
///     "description": "Current workspace Write and actor-owned video session/turn/intent required. This only binds saved restoration identity and never dispatches, refreshes or automatically submits inference. One turn and one intent form an immutable association within the same owner/workspace. A fresh association requires expected session revision, an unarchived session and retained turn/intent content. Identical binding retries are side-effect-free even after revision advances, archive, deletion or expiry; changed binding conflicts. If the turn already references a task, it must equal the actual attempt from the original intent submission identity. Session reads resolve any saved original attempt directly from that identity after a lost submission/association response without another inference call. Pending/not-dispatched/unknown outcomes are never assumed free or safe to resend. Safe intent projection includes id, revision, model, content state and submission state, not raw request, key secret or private upstream references. Turn content deletion/expiry clears the bound retained intent copy under turn-to-intent locking while preserving submission tombstones, task evidence, billing and diagnostics. Intent and turn keep their original 30-day retention deadlines; neither is extended. Legacy Video intent APIs remain compatible and explicit submission continues through their submit endpoint. The bound intent is canonical for the actual restored Video draft/request, including model, controls and material inputs. The separately saved turn instruction may be a review note and is not represented as proof of the dispatched prompt; reads never substitute it for missing retained intent content.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "session",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "turn",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Attach an existing authorized video task",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/GenerationsVideoSession"
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid request or cursor"
///       },
///       "401": {
///         "description": "Invalid administrator session or unauthorized historical task"
///       },
///       "403": {
///         "description": "Current workspace permission denied"
///       },
///       "404": {
///         "description": "Actor-owned session is absent"
///       },
///       "409": {
///         "description": "Stale revision, changed idempotent identity, archive or task association conflict"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "properties": {
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]*$"
///               },
///               "intent_id": {
///                 "type": "string",
///                 "format": "uuid"
///               }
///             },
///             "required": [
///               "expected_revision",
///               "intent_id"
///             ]
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn bind_intent(
    State(s): State<AppState>,
    headers: HeaderMap,
    Path((o, p, id, turn)): Path<(Uuid, Uuid, Uuid, Uuid)>,
    Json(input): Json<BindIntent>,
) -> Result<Json<Value>, ApiError> {
    let sc = scope(o, p);
    let own = owner(&s, &headers, sc, AdminPermission::Write).await?;
    s.store
        .bind_generations_intent(
            sc,
            &own,
            id,
            turn,
            revision(&input.expected_revision)?,
            input.intent_id,
        )
        .await
        .map_err(ApiError::from_store)?;
    loaded(&s, sc, &own, id).await
}
