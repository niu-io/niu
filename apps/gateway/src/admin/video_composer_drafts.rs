//! Partial composition only. Saving never estimates, inspects or dispatches.
use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Path, State, TenantScope, Uuid, Value,
    json,
};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::BTreeMap;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ProviderReference {
    id: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct WorkspaceReference {
    asset_id: String,
    consent_to_process: bool,
}
/// The existing VideoIntent Niu-reference grammar, with no resolved Provider URI.
#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
enum Reference {
    ProviderAsset {
        provider_asset: ProviderReference,
        #[serde(
            default,
            deserialize_with = "non_null_role",
            skip_serializing_if = "Option::is_none"
        )]
        role: Option<String>,
    },
    WorkspaceAsset {
        workspace_asset: WorkspaceReference,
        #[serde(
            default,
            deserialize_with = "non_null_role",
            skip_serializing_if = "Option::is_none"
        )]
        role: Option<String>,
    },
}
#[derive(Deserialize, Serialize)]
#[serde(untagged)]
enum Scalar {
    Text(String),
    Number(i64),
    Boolean(bool),
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Payload {
    key_id: Option<String>,
    session_id: Option<String>,
    model: Option<String>,
    prompt: String,
    controls: BTreeMap<String, Scalar>,
    references: Vec<Reference>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DraftInput {
    expected_revision: i64,
    payload: Option<Payload>,
}
fn non_null_role<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<String>, D::Error> {
    String::deserialize(deserializer).map(Some)
}
fn invalid() -> ApiError {
    ApiError::invalid_request("Invalid Video composer draft")
}
fn valid_id(value: &str) -> bool {
    Uuid::parse_str(value).is_ok_and(|id| !id.is_nil() && id.to_string() == value)
}
fn valid_role(role: &Option<String>) -> bool {
    role.as_ref().is_none_or(|value| {
        !value.is_empty()
            && value.len() <= 256
            && value.trim() == value
            && !value.chars().any(char::is_control)
    })
}
fn validate(payload: &Payload) -> Result<(), ApiError> {
    if payload.prompt.chars().count() > 12000
        || payload.key_id.as_ref().is_some_and(|id| !valid_id(id))
        || payload.session_id.as_ref().is_some_and(|id| !valid_id(id))
        || payload.model.as_ref().is_some_and(|model| {
            model.is_empty()
                || model.len() > 512
                || model.trim() != model
                || model.chars().any(char::is_control)
        })
        || payload.controls.len() > 9
        || payload.references.len() > 32
    {
        return Err(invalid());
    }
    for (name, value) in &payload.controls {
        // Same scalar controls accepted by niu_media::VideoSchema. Partial strings
        // preserve unfinished integer edits; current model ranges are submit work.
        let valid = match (name.as_str(), value) {
            ("duration" | "seed" | "frames_per_second", Scalar::Number(value)) => {
                (-9_007_199_254_740_991..=9_007_199_254_740_991).contains(value)
            }
            (
                "duration"
                | "seed"
                | "frames_per_second"
                | "resolution"
                | "ratio"
                | "omni_reference_task_type",
                Scalar::Text(value),
            ) => value.len() <= 256 && !value.chars().any(char::is_control),
            ("watermark" | "camera_fixed" | "return_last_frame", Scalar::Boolean(_)) => true,
            _ => false,
        };
        if !valid {
            return Err(invalid());
        }
    }
    for reference in &payload.references {
        let valid = match reference {
            Reference::ProviderAsset {
                provider_asset,
                role,
            } => valid_id(&provider_asset.id) && valid_role(role),
            Reference::WorkspaceAsset {
                workspace_asset,
                role,
            } => {
                valid_id(&workspace_asset.asset_id)
                    && workspace_asset.consent_to_process
                    && valid_role(role)
            }
        };
        if !valid {
            return Err(invalid());
        }
    }
    if serde_json::to_vec(payload).map_err(|_| invalid())?.len() > 60 * 1024 {
        return Err(invalid());
    }
    Ok(())
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/video-draft",
///   "method": "get",
///   "operation": {
///     "operationId": "getVideoComposerDraft",
///     "x-niu-implementation": "implemented",
///     "summary": "Read a mutable personal Video composer",
///     "description": "One mutable actor-private Video composer per workspace. Operators are isolated; installation credentials share the installation actor. Read requires workspace Read permission. Absent state returns null payload and revision zero. Retention is 30 days after the last confirmed edit; expired content is hidden immediately and background maintenance erases it. Reads expose the expiry tombstone revision before maintenance. Saved key/model/reference identities are context only, including unavailable historical resources; they confer no current access or readiness. No inference, Supplier calls, reservation, media reads or inspection occur.",
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
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Actor-private composer state.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/VideoComposerDraftResponse"
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Missing or invalid administration/member authentication."
///       },
///       "403": {
///         "description": "Insufficient workspace permission or scope."
///       },
///       "500": {
///         "description": "Internal storage failure."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     }
///   },
///   "schemas": {
///     "VideoComposerDraftPayload": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "prompt",
///         "controls",
///         "references"
///       ],
///       "properties": {
///         "keyId": {
///           "oneOf": [
///             {
///               "type": "string",
///               "format": "uuid",
///               "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "sessionId": {
///           "oneOf": [
///             {
///               "type": "string",
///               "format": "uuid",
///               "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "model": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "minLength": 1,
///           "maxLength": 512
///         },
///         "prompt": {
///           "type": "string",
///           "maxLength": 12000
///         },
///         "controls": {
///           "type": "object",
///           "additionalProperties": false,
///           "required": [],
///           "properties": {
///             "duration": {
///               "oneOf": [
///                 {
///                   "type": "integer",
///                   "minimum": -9007199254740991,
///                   "maximum": 9007199254740991
///                 },
///                 {
///                   "type": "string",
///                   "maxLength": 256
///                 }
///               ]
///             },
///             "seed": {
///               "oneOf": [
///                 {
///                   "type": "integer",
///                   "minimum": -9007199254740991,
///                   "maximum": 9007199254740991
///                 },
///                 {
///                   "type": "string",
///                   "maxLength": 256
///                 }
///               ]
///             },
///             "frames_per_second": {
///               "oneOf": [
///                 {
///                   "type": "integer",
///                   "minimum": -9007199254740991,
///                   "maximum": 9007199254740991
///                 },
///                 {
///                   "type": "string",
///                   "maxLength": 256
///                 }
///               ]
///             },
///             "resolution": {
///               "type": "string",
///               "maxLength": 256
///             },
///             "ratio": {
///               "type": "string",
///               "maxLength": 256
///             },
///             "omni_reference_task_type": {
///               "type": "string",
///               "maxLength": 256
///             },
///             "watermark": {
///               "type": "boolean"
///             },
///             "camera_fixed": {
///               "type": "boolean"
///             },
///             "return_last_frame": {
///               "type": "boolean"
///             }
///           }
///         },
///         "references": {
///           "type": "array",
///           "maxItems": 32,
///           "items": {
///             "oneOf": [
///               {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "required": [
///                   "type",
///                   "provider_asset"
///                 ],
///                 "properties": {
///                   "type": {
///                     "const": "provider_asset"
///                   },
///                   "provider_asset": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "id"
///                     ],
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "format": "uuid",
///                         "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
///                       }
///                     }
///                   },
///                   "role": {
///                     "type": "string",
///                     "minLength": 1,
///                     "maxLength": 256,
///                     "description": "Optional nonempty role matching the existing VideoIntent reference grammar; explicit null is rejected."
///                   }
///                 }
///               },
///               {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "required": [
///                   "type",
///                   "workspace_asset"
///                 ],
///                 "properties": {
///                   "type": {
///                     "const": "workspace_asset"
///                   },
///                   "workspace_asset": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "asset_id",
///                       "consent_to_process"
///                     ],
///                     "properties": {
///                       "asset_id": {
///                         "type": "string",
///                         "format": "uuid",
///                         "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
///                       },
///                       "consent_to_process": {
///                         "const": true
///                       }
///                     }
///                   },
///                   "role": {
///                     "type": "string",
///                     "minLength": 1,
///                     "maxLength": 256,
///                     "description": "Optional nonempty role matching the existing VideoIntent reference grammar; explicit null is rejected."
///                   }
///                 }
///               }
///             ]
///           }
///         }
///       }
///     },
///     "VideoComposerDraftState": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "payload",
///         "revision",
///         "expires_at_ms",
///         "content_state"
///       ],
///       "properties": {
///         "payload": {
///           "oneOf": [
///             {
///               "$ref": "#/components/schemas/VideoComposerDraftPayload"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "revision": {
///           "type": "integer",
///           "minimum": 0,
///           "maximum": 9007199254740991
///         },
///         "expires_at_ms": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "content_state": {
///           "type": "string",
///           "enum": [
///             "empty",
///             "retained",
///             "expired"
///           ]
///         }
///       }
///     },
///     "VideoComposerDraftResponse": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "data"
///       ],
///       "properties": {
///         "data": {
///           "$ref": "#/components/schemas/VideoComposerDraftState"
///         }
///       }
///     },
///     "VideoComposerDraftUpdate": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "expected_revision"
///       ],
///       "properties": {
///         "expected_revision": {
///           "type": "integer",
///           "minimum": 0,
///           "maximum": 9007199254740989
///         },
///         "payload": {
///           "oneOf": [
///             {
///               "$ref": "#/components/schemas/VideoComposerDraftPayload"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         }
///       }
///     }
///   }
/// }
/// ```
/// GET /admin/v1/organizations/{organization}/projects/{project}/video-draft.
/// Actor-private read; expired payload is immediately unavailable. Saved key and
/// reference IDs are context, never current authorization or media readiness.
pub async fn draft(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = super::chat_sessions::owner(&state, &headers, scope, AdminPermission::Read).await?;
    let data = state
        .store
        .video_composer_draft(scope, &owner)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/video-draft",
///   "method": "put",
///   "operation": {
///     "operationId": "saveVideoComposerDraft",
///     "x-niu-implementation": "implemented",
///     "summary": "Save or clear a mutable personal Video composer",
///     "description": "One mutable actor-private Video composer per workspace. Operators are isolated; installation credentials share the installation actor. Read requires workspace Read permission. Absent state returns null payload and revision zero. Retention is 30 days after the last confirmed edit; expired content is hidden immediately and background maintenance erases it. Reads expose the expiry tombstone revision before maintenance. Saved key/model/reference identities are context only, including unavailable historical resources; they confer no current access or readiness. No inference, Supplier calls, reservation, media reads or inspection occur. Write requires workspace Write permission and allowed browser Origin. Typed bounded partial composition may omit model/key/session and required model controls. Only the nine existing non-URL VideoSchema scalar control names are accepted; integer edits may remain strings. References use exact provider_asset/workspace_asset shapes, canonical nonnil Niu IDs and explicit workspace processing consent. No raw URL, inline media, short-lived ingestion, credential or billing fields are accepted. Key/reference metadata must belong to the workspace; session context must belong to the actor. Saving does not require an active historical key or grant action access. Full current schema, key/model eligibility, reference binding, consent and inspection remain explicit estimate/submission requirements. Null or omitted payload clears content while retaining the CAS revision. Stale revisions, including revisions predating expiry or clear, return 409. Workspace deletion refuses retained drafts; cleared/expired tombstones alone do not prevent empty-workspace deletion.",
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
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Actor-private composer state.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/VideoComposerDraftResponse"
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Missing or invalid administration/member authentication."
///       },
///       "403": {
///         "description": "Insufficient permission, cross-workspace key/reference, unavailable actor session, or missing/disallowed browser Origin."
///       },
///       "500": {
///         "description": "Internal storage failure."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       },
///       "400": {
///         "description": "Malformed or unknown fields, invalid bounds, control type, reference role, consent or canonical ID."
///       },
///       "409": {
///         "description": "Invalid or stale revision; no overwrite."
///       },
///       "413": {
///         "description": "Body exceeds 64 KiB."
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/VideoComposerDraftUpdate"
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
/// PUT at the same path. Read/Write workspace permissions and actor isolation
/// match Chat drafts. Null clears content with revision CAS; stale writes return
/// 409. Confirmed edits retain partial composition for 30 days, not indefinitely.
/// No raw URLs/inline media/ingestion IDs, credentials or billing fields accepted.
/// Scoped reference metadata is checked locally; full key/model admission,
/// consent and fresh media inspection still apply at explicit estimate/submit.
pub async fn save_draft(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    input: Result<Json<DraftInput>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner =
        super::chat_sessions::owner(&state, &headers, scope, AdminPermission::Write).await?;
    if let Some(runtime) = state.password_auth.as_ref() {
        let browser = !headers.contains_key("authorization")
            || headers
                .get("authorization")
                .and_then(|value| value.to_str().ok())
                == Some("Bearer niu-browser-member-session");
        if browser {
            runtime.require_origin(&headers)?;
        } else {
            runtime.check_origin(&headers)?;
        }
    }
    let Json(input) = input.map_err(|_| invalid())?;
    let payload = if let Some(payload) = input.payload {
        validate(&payload)?;
        Some(serde_json::to_value(payload).map_err(|_| invalid())?)
    } else {
        None
    };
    let data = state
        .store
        .save_video_composer_draft(scope, &owner, payload.as_ref(), input.expected_revision)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}
