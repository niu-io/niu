use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Path, State, TenantScope, Uuid, Value,
    authorize, json,
};
use crate::state::AdminAuthorization;

fn safe_nonnegative_integer(value: &Value) -> bool {
    value.as_u64().is_some_and(|n| n <= 9_007_199_254_740_991)
}

fn valid_results(payload: &Value) -> bool {
    payload
        .get("results")
        .and_then(Value::as_array)
        .is_some_and(|results| {
            let mut models = std::collections::HashSet::new();
            results.len() <= 4
                && results.iter().all(|result| {
                    result
                        .get("model")
                        .and_then(Value::as_str)
                        .is_some_and(|model| {
                            !model.trim().is_empty() && model.len() <= 512 && models.insert(model)
                        })
                        && result
                            .get("content")
                            .and_then(Value::as_str)
                            .is_some_and(|content| content.len() <= 512 * 1024)
                        && result.get("error").is_none_or(|v| {
                            v.is_null() || v.as_str().is_some_and(|s| s.len() <= 8192)
                        })
                        && result.get("attemptId").is_none_or(|v| {
                            v.is_null() || v.as_str().is_some_and(|s| s.len() <= 128)
                        })
                        && result
                            .get("elapsedMs")
                            .is_some_and(safe_nonnegative_integer)
                        && ["promptTokens", "completionTokens", "totalTokens"]
                            .iter()
                            .all(|key| {
                                result
                                    .get(*key)
                                    .is_none_or(|v| v.is_null() || safe_nonnegative_integer(v))
                            })
                        && result
                            .get("phase")
                            .and_then(Value::as_str)
                            .is_some_and(|phase| {
                                ["connecting", "streaming", "complete", "failed", "cancelled"]
                                    .contains(&phase)
                            })
                })
        })
}

fn sanitize_results(results: &mut Value) {
    for result in results.as_array_mut().unwrap() {
        result.as_object_mut().unwrap().retain(|key, _| {
            [
                "model",
                "content",
                "elapsedMs",
                "phase",
                "promptTokens",
                "completionTokens",
                "totalTokens",
                "attemptId",
                "error",
            ]
            .contains(&key.as_str())
        });
    }
}

fn sanitize_attachments(payload: &mut Value) -> Result<(), ApiError> {
    if let Some(attachments) = payload.get_mut("attachments") {
        let attachments = attachments
            .as_array_mut()
            .ok_or_else(|| ApiError::invalid_request("Invalid chat attachments"))?;
        if attachments.len() > 4 {
            return Err(ApiError::invalid_request("Invalid chat attachments"));
        }
        for attachment in attachments {
            let attachment = attachment
                .as_object_mut()
                .ok_or_else(|| ApiError::invalid_request("Invalid chat attachment"))?;
            attachment.retain(|key, _| ["name", "type", "content"].contains(&key.as_str()));
            let Some(name) = attachment.get("name").and_then(Value::as_str) else {
                return Err(ApiError::invalid_request("Invalid chat attachment"));
            };
            let Some(kind) = attachment.get("type").and_then(Value::as_str) else {
                return Err(ApiError::invalid_request("Invalid chat attachment"));
            };
            let Some(content) = attachment.get("content").and_then(Value::as_str) else {
                return Err(ApiError::invalid_request("Invalid chat attachment"));
            };
            if name.is_empty()
                || name.len() > 1024
                || !["image", "text"].contains(&kind)
                || content.len() > 6 * 1024 * 1024
            {
                return Err(ApiError::invalid_request("Invalid chat attachment"));
            }
        }
    }
    Ok(())
}

pub(super) async fn owner(
    state: &AppState,
    headers: &HeaderMap,
    scope: TenantScope,
    permission: AdminPermission,
) -> Result<String, ApiError> {
    let authorization = authorize(state, headers, permission).await?;
    if !authorization.permits_project(scope) {
        return Err(ApiError::forbidden());
    }
    Ok(match authorization {
        AdminAuthorization::Operator(operator) => format!("operator:{}", operator.id),
        // Installation credentials represent one installation administrator.
        AdminAuthorization::Installation => "installation".to_owned(),
    })
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DraftSettings {
    system_prompt: String,
    max_tokens: u64,
    temperature: f64,
    log_payloads: bool,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct DraftAttachment {
    name: String,
    #[serde(rename = "type")]
    kind: String,
    content: String,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DraftPayload {
    session_id: Option<Uuid>,
    prompt: String,
    models: Vec<String>,
    attachments: Vec<DraftAttachment>,
    settings: DraftSettings,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DraftInput {
    expected_revision: i64,
    payload: Option<DraftPayload>,
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/chat-draft",
///   "method": "get",
///   "operation": {
///     "operationId": "getChatDraft",
///     "x-niu-implementation": "implemented",
///     "summary": "Read the persistent personal Chat draft",
///     "description": "The draft is isolated by authenticated personal owner and workspace. Operators have distinct drafts; installation credentials share the installation owner. Read authorization and workspace scope are required. An absent draft returns null payload and revision zero.",
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
///         "description": "Saved personal draft state.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ChatDraftResponse"
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Missing or invalid administration/member authentication."
///       },
///       "403": {
///         "description": "Insufficient permission or workspace scope."
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
///     "ChatDraftSettings": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "systemPrompt",
///         "maxTokens",
///         "temperature",
///         "logPayloads"
///       ],
///       "properties": {
///         "systemPrompt": {
///           "type": "string",
///           "maxLength": 12000
///         },
///         "maxTokens": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 9007199254740991
///         },
///         "temperature": {
///           "type": "number",
///           "minimum": 0,
///           "maximum": 2
///         },
///         "logPayloads": {
///           "type": "boolean"
///         }
///       }
///     },
///     "ChatDraftAttachment": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "name",
///         "type",
///         "content"
///       ],
///       "properties": {
///         "name": {
///           "type": "string",
///           "minLength": 1,
///           "description": "At most 1024 UTF-8 bytes."
///         },
///         "type": {
///           "type": "string",
///           "enum": [
///             "image",
///             "text"
///           ]
///         },
///         "content": {
///           "type": "string",
///           "description": "At most 6291456 UTF-8 bytes; stored text, not a server-fetched URL."
///         }
///       }
///     },
///     "ChatDraftPayload": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "prompt",
///         "models",
///         "attachments",
///         "settings"
///       ],
///       "properties": {
///         "sessionId": {
///           "oneOf": [
///             {
///               "type": "string",
///               "format": "uuid",
///               "description": "Optional saved conversation belonging to this owner and workspace."
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "prompt": {
///           "type": "string",
///           "maxLength": 12000
///         },
///         "models": {
///           "type": "array",
///           "maxItems": 4,
///           "uniqueItems": true,
///           "items": {
///             "type": "string",
///             "minLength": 1,
///             "description": "Nonblank and at most 512 UTF-8 bytes; saving a draft does not invoke or grant access to this model."
///           }
///         },
///         "attachments": {
///           "type": "array",
///           "maxItems": 4,
///           "items": {
///             "$ref": "#/components/schemas/ChatDraftAttachment"
///           }
///         },
///         "settings": {
///           "$ref": "#/components/schemas/ChatDraftSettings"
///         }
///       }
///     },
///     "ChatDraftState": {
///       "type": "object",
///       "required": [
///         "payload",
///         "revision"
///       ],
///       "properties": {
///         "payload": {
///           "oneOf": [
///             {
///               "$ref": "#/components/schemas/ChatDraftPayload"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "revision": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 0,
///           "description": "Zero before the first saved draft; integer revision, not a string."
///         }
///       }
///     },
///     "ChatDraftResponse": {
///       "type": "object",
///       "required": [
///         "data"
///       ],
///       "properties": {
///         "data": {
///           "$ref": "#/components/schemas/ChatDraftState"
///         }
///       }
///     },
///     "ChatDraftUpdate": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "expected_revision"
///       ],
///       "properties": {
///         "expected_revision": {
///           "type": "integer",
///           "format": "int64",
///           "description": "Exact last observed integer revision. Negative or stale values return 409; use zero for initial creation."
///         },
///         "payload": {
///           "oneOf": [
///             {
///               "$ref": "#/components/schemas/ChatDraftPayload"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         }
///       },
///       "description": "An omitted or null payload clears the draft while retaining its revision."
///     }
///   }
/// }
/// ```
pub async fn draft(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Read).await?;
    let (payload, revision) = state
        .store
        .chat_draft(scope, &owner)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"payload":payload,"revision":revision}}),
    ))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/chat-draft",
///   "method": "put",
///   "operation": {
///     "operationId": "saveChatDraft",
///     "x-niu-implementation": "implemented",
///     "summary": "Save or clear the personal Chat draft with an expected revision",
///     "description": "Write authorization and workspace scope are required. Browser-member requests require an allowed Origin when password authentication is configured; other requests also undergo Origin validation. Strict typed JSON rejects unknown fields. A referenced conversation must belong to the same owner and workspace. Saving does not call a model. The 24 MiB route body bound applies. Compare-and-swap prevents stale tabs from overwriting a newer draft; clearing retains and advances the revision.",
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
///         "description": "Saved personal draft state.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ChatDraftResponse"
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Missing or invalid administration/member authentication."
///       },
///       "403": {
///         "description": "Insufficient permission or workspace scope. Missing or disallowed browser Origin also refuses the write."
///       },
///       "500": {
///         "description": "Internal storage failure."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       },
///       "400": {
///         "description": "Malformed or unknown JSON fields, invalid payload limits, or unavailable owner-scoped conversation."
///       },
///       "409": {
///         "description": "Negative, stale or unavailable expected revision; no draft overwrite."
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/ChatDraftUpdate"
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
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
    let owner = owner(&state, &headers, scope, AdminPermission::Write).await?;
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
    let Json(input) = input.map_err(|_| ApiError::invalid_request("Invalid chat draft update"))?;
    let payload = if let Some(payload) = input.payload {
        let settings = &payload.settings;
        let mut models = std::collections::HashSet::new();
        if payload.prompt.chars().count() > 12000
            || settings.system_prompt.chars().count() > 12000
            || settings.max_tokens == 0
            || settings.max_tokens > 9_007_199_254_740_991
            || !settings.temperature.is_finite()
            || !(0.0..=2.0).contains(&settings.temperature)
            || payload.models.len() > 4
            || payload
                .models
                .iter()
                .any(|model| model.trim().is_empty() || model.len() > 512 || !models.insert(model))
            || payload.attachments.len() > 4
            || payload.attachments.iter().any(|file| {
                file.name.is_empty()
                    || file.name.len() > 1024
                    || !["image", "text"].contains(&file.kind.as_str())
                    || file.content.len() > 6 * 1024 * 1024
            })
        {
            return Err(ApiError::invalid_request("Invalid chat draft"));
        }
        if let Some(id) = payload.session_id
            && !state
                .store
                .chat_session_exists(scope, &owner, id)
                .await
                .map_err(ApiError::from_store)?
        {
            return Err(ApiError::invalid_request(
                "The draft conversation is unavailable",
            ));
        }
        Some(
            serde_json::to_value(payload)
                .map_err(|_| ApiError::invalid_request("Invalid chat draft"))?,
        )
    } else {
        None
    };
    let revision = state
        .store
        .save_chat_draft(scope, &owner, payload.as_ref(), input.expected_revision)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"payload":payload,"revision":revision}}),
    ))
}

#[derive(serde::Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct HistoryQuery {
    #[serde(default)]
    archived: bool,
    limit: Option<u16>,
    after: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArchiveInput {
    archived: bool,
}

pub async fn archive(
    State(state): State<AppState>,
    Path((organization_id, project_id, id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<ArchiveInput>,
) -> Result<axum::http::StatusCode, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Write).await?;
    if !state
        .store
        .set_chat_session_archived(scope, &owner, id, input.archived)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    Ok(axum::http::StatusCode::NO_CONTENT)
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/chat-sessions",
///   "method": "get",
///   "operation": {
///     "operationId": "listChatSessions",
///     "x-niu-implementation": "implemented",
///     "summary": "List personal saved Chat history or one continuation page",
///     "description": "Without limit or after, retain the latest-100 compatibility response. Either paging parameter selects a bounded page, default 50, ordered by updated time and ID descending within the authenticated owner, workspace and archive state. Session payload and customer-charge hydration share a read-only snapshot with 250 ms lock and 2 s statement limits. A changed, deleted, foreign-owner or different-archive cursor returns 409; pages are live views, not a frozen cross-request snapshot. Before loading saved bodies, paging also limits the sum of saved JSON text bytes to 32 MiB and may return fewer rows than limit; follow next_cursor. Customer-charge hydration can increase wire size. Legacy latest-100 calls over that saved-payload budget return 413 rather than truncated success.",
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
///         "name": "archived",
///         "in": "query",
///         "schema": {
///           "type": "boolean",
///           "default": false
///         }
///       },
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
///         "name": "after",
///         "in": "query",
///         "description": "Opaque next_cursor from the previous page; do not interpret or display it.",
///         "schema": {
///           "type": "string",
///           "pattern": "^[0-9a-fA-F-]{36}:[0-9a-fA-F]{64}$"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Compatibility data array or paged data array with nullable next_cursor.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object"
///                   }
///                 },
///                 "next_cursor": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed cursor or invalid page size."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Workspace read access required."
///       },
///       "409": {
///         "description": "Cursor no longer matches an accessible session in this archive."
///       },
///       "503": {
///         "description": "Storage unavailable or read wait exceeded; no empty-success fallback."
///       },
///       "413": {
///         "description": "Saved Chat history exceeds one-response capacity; use paging or individual conversation export."
///       }
///     }
///   }
/// }
/// ```
pub async fn list(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    axum::extract::Query(query): axum::extract::Query<HistoryQuery>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Read).await?;
    if query.limit.is_some() || query.after.is_some() {
        if query.limit.is_some_and(|limit| !(1..=100).contains(&limit))
            || query.after.as_deref().is_some_and(|cursor| {
                cursor.split_once(':').is_none_or(|(id, revision)| {
                    Uuid::parse_str(id).is_err()
                        || revision.len() != 64
                        || !revision.bytes().all(|b| b.is_ascii_hexdigit())
                })
            })
        {
            return Err(ApiError::invalid_request(
                "Invalid Chat history cursor or page size",
            ));
        }
        return state
            .store
            .chat_session_page(
                scope,
                &owner,
                query.archived,
                query.after.as_deref(),
                query.limit.unwrap_or(50),
            )
            .await
            .map(Json)
            .map_err(ApiError::from_store);
    }
    let data = state
        .store
        .chat_sessions_by_archive(scope, &owner, query.archived)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}",
///   "method": "get",
///   "operation": {
///     "operationId": "getChatSession",
///     "x-niu-implementation": "implemented",
///     "summary": "Read one complete owned saved Chat conversation",
///     "description": "Requires workspace read permission and the authenticated personal owner. Returns the full saved conversation and archive state without scanning history pages, including sessions beyond the recent-100 list. Selection and authoritative customer-charge hydration share a bounded read-only snapshot (250 ms lock and 2 s statement limits); preceding authorization and pool acquisition are separate. Saved browser accounting is ignored. Saved JSON above 32 MiB returns 413; no content is truncated. Archived sessions remain directly readable.",
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
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Complete owned conversation and separate archive state.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "archived",
///                 "revision",
///                 "guardedWrites"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object"
///                 },
///                 "archived": {
///                   "type": "boolean"
///                 },
///                 "revision": {
///                   "type": "string",
///                   "pattern": "^[1-9][0-9]*$",
///                   "description": "Opaque positive decimal write revision. Pass as expectedRevision for guarded saves."
///                 },
///                 "guardedWrites": {
///                   "type": "boolean",
///                   "description": "True after guarded content save. Version-free saves are then rejected; this mode cannot be disabled by a content save."
///                 }
///               }
///             }
///           }
///         },
///         "headers": {
///           "Cache-Control": {
///             "description": "Complete personal conversation responses must not be cached.",
///             "schema": {
///               "type": "string",
///               "const": "no-store"
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Workspace read permission required."
///       },
///       "404": {
///         "description": "No conversation for this personal owner and workspace."
///       },
///       "413": {
///         "description": "Saved JSON exceeds one-response capacity; use individual content export."
///       },
///       "503": {
///         "description": "Durable storage unavailable or read wait exceeded."
///       }
///     }
///   }
/// }
/// ```
pub async fn get(
    State(state): State<AppState>,
    Path((organization_id, project_id, id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<axum::response::Response, ApiError> {
    use axum::response::IntoResponse;
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Read).await?;
    let value = state
        .store
        .chat_session_detail(scope, &owner, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(([("cache-control", "no-store")], Json(value)).into_response())
}

pub async fn delete(
    State(state): State<AppState>,
    Path((organization_id, project_id, id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<axum::http::StatusCode, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Write).await?;
    state
        .store
        .delete_chat_session(scope, &owner, id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

/// Conversation content only: no routing IDs, saved accounting or diagnostic errors.
fn conversation_export(mut payload: Value) -> Value {
    fn turn(value: &mut Value) {
        if let Some(object) = value.as_object_mut() {
            object.retain(|key, _| ["prompt", "results", "attachments"].contains(&key.as_str()));
        }
        if let Some(results) = value.get_mut("results").and_then(Value::as_array_mut) {
            for result in results {
                if let Some(object) = result.as_object_mut() {
                    object.retain(|key, _| ["model", "content", "phase"].contains(&key.as_str()));
                }
            }
        }
        if let Some(attachments) = value.get_mut("attachments").and_then(Value::as_array_mut) {
            for attachment in attachments {
                if let Some(object) = attachment.as_object_mut() {
                    object.retain(|key, _| ["name", "type", "content"].contains(&key.as_str()));
                }
            }
        }
    }
    let title = payload.get("title").filter(|v| v.is_string()).cloned();
    let created_at = payload
        .get("createdAt")
        .filter(|v| safe_nonnegative_integer(v))
        .cloned();
    let mut turns = match payload
        .as_object_mut()
        .and_then(|obj| obj.remove("turns"))
    {
        Some(Value::Array(turns)) if !turns.is_empty() => turns,
        Some(other) => {
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("turns".into(), other);
            }
            vec![payload]
        }
        None => vec![payload],
    };
    for value in &mut turns {
        turn(value);
    }
    let mut output = json!({"format":"niu-chat", "version":1, "turns":turns});
    if let Some(title) = title {
        output["title"] = title;
    }
    if let Some(created_at) = created_at {
        output["createdAt"] = created_at;
    }
    output
}

pub async fn export(
    State(state): State<AppState>,
    Path((organization_id, project_id, id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Read).await?;
    let payload = state
        .store
        .chat_session(scope, &owner, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(conversation_export(payload)))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}",
///   "method": "put",
///   "operation": {
///     "operationId": "saveChatSession",
///     "summary": "Save an owned Chat session in a workspace",
///     "description": "Requires workspace write access. Stores conversation content separately from accounting. Only supported top-level and nested fields are retained. Client-supplied accounting fields are discarded. Numeric timestamps, durations and token counts must be nonnegative JavaScript-safe integers; token counts may be null. Settings and attachment shapes are validated. This endpoint does not establish authoritative request charges or detect secrets embedded in conversation text. Omit expectedRevision for a compatibility write only while the owned record has not enabled guarded writes. Explicit null creates only if no owned row exists; a canonical positive decimal revision updates only that exact owned version. Stale, missing or duplicate-create guarded writes return 409 without replacing content. Revisions are global sequence values, not timestamps, and are never reused by API delete/recreate. Guarded success includes a decimal revision; direct GET provides it. A successful guarded creation/update permanently enables guarded writes on that owned row. Compatibility saves thereafter return 409; there is no content-write downgrade. A content-free guard identity survives deletion, so legacy autosaves cannot resurrect a protected reference; explicit null guarded creation may recreate it. Untouched legacy rows retain compatibility behavior until guarded save.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "required": [
///               "prompt",
///               "results",
///               "createdAt"
///             ],
///             "properties": {
///               "prompt": {
///                 "type": "string"
///               },
///               "title": {
///                 "type": "string"
///               },
///               "createdAt": {
///                 "type": "integer",
///                 "minimum": 0,
///                 "maximum": 9007199254740991
///               },
///               "turns": {
///                 "type": "array",
///                 "maxItems": 100,
///                 "description": "Ordered conversation turns. Each retains its prompt and up to four model responses, validated with the same result fields as the current turn. Unknown turn/result fields are stripped. Optional for legacy single-turn sessions.",
///                 "items": {
///                   "type": "object",
///                   "required": [
///                     "prompt",
///                     "results"
///                   ],
///                   "properties": {
///                     "prompt": {
///                       "type": "string"
///                     },
///                     "results": {
///                       "type": "array",
///                       "maxItems": 4,
///                       "items": {
///                         "type": "object"
///                       }
///                     },
///                     "attachments": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "required": [
///                           "name",
///                           "type",
///                           "content"
///                         ],
///                         "properties": {
///                           "name": {
///                             "type": "string"
///                           },
///                           "type": {
///                             "type": "string"
///                           },
///                           "content": {
///                             "type": "string"
///                           }
///                         }
///                       }
///                     }
///                   }
///                 }
///               },
///               "results": {
///                 "type": "array",
///                 "maxItems": 4,
///                 "items": {
///                   "type": "object",
///                   "required": [
///                     "model",
///                     "content",
///                     "elapsedMs",
///                     "phase"
///                   ],
///                   "properties": {
///                     "model": {
///                       "type": "string"
///                     },
///                     "content": {
///                       "type": "string"
///                     },
///                     "elapsedMs": {
///                       "type": "integer",
///                       "minimum": 0,
///                       "maximum": 9007199254740991
///                     },
///                     "phase": {
///                       "type": "string",
///                       "enum": [
///                         "connecting",
///                         "streaming",
///                         "complete",
///                         "failed",
///                         "cancelled"
///                       ]
///                     },
///                     "promptTokens": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "minimum": 0,
///                       "maximum": 9007199254740991
///                     },
///                     "completionTokens": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "minimum": 0,
///                       "maximum": 9007199254740991
///                     },
///                     "totalTokens": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "minimum": 0,
///                       "maximum": 9007199254740991
///                     }
///                   }
///                 }
///               },
///               "settings": {
///                 "type": "object",
///                 "properties": {
///                   "systemPrompt": {
///                     "type": "string"
///                   },
///                   "maxTokens": {
///                     "type": "integer",
///                     "minimum": 1
///                   },
///                   "temperature": {
///                     "type": "number",
///                     "minimum": 0,
///                     "maximum": 2
///                   },
///                   "logPayloads": {
///                     "type": "boolean"
///                   }
///                 }
///               },
///               "attachments": {
///                 "type": "array",
///                 "items": {
///                   "type": "object",
///                   "required": [
///                     "name",
///                     "type",
///                     "content"
///                   ],
///                   "properties": {
///                     "name": {
///                       "type": "string"
///                     },
///                     "type": {
///                       "type": "string"
///                     },
///                     "content": {
///                       "type": "string"
///                     }
///                   }
///                 }
///               },
///               "expectedRevision": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^[1-9][0-9]*$",
///                 "description": "Omitted: compatibility write. Null: create-only. Positive decimal string: exact current revision from GET."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Compatibility saved flag, or confirmed guarded saved flag, revision and guardedWrites=true.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "saved"
///               ],
///               "properties": {
///                 "saved": {
///                   "const": true
///                 },
///                 "revision": {
///                   "type": "string",
///                   "pattern": "^[1-9][0-9]*$"
///                 },
///                 "guardedWrites": {
///                   "const": true,
///                   "description": "Present with revision only for confirmed guarded saves; older compatibility servers do not confirm this mode."
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid content or expected revision."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Workspace write access required."
///       },
///       "413": {
///         "description": "Request exceeds the 24 MiB transport limit."
///       },
///       "409": {
///         "description": "Guarded creation/update does not match current owned state."
///       },
///       "503": {
///         "description": "Storage unavailable or bounded write wait exceeded."
///       }
///     },
///     "x-niu-implementation": "implemented",
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
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ]
///   }
/// }
/// ```
pub async fn save(
    State(state): State<AppState>,
    Path((organization_id, project_id, id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    Json(mut payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let owner = owner(&state, &headers, scope, AdminPermission::Write).await?;
    let guarded = payload.get("expectedRevision").is_some();
    let condition = match payload.get("expectedRevision") {
        None => niu_storage::ChatWriteCondition::Any,
        Some(Value::Null) => niu_storage::ChatWriteCondition::Missing,
        Some(Value::String(value)) => {
            let revision: i64 = value
                .parse()
                .ok()
                .filter(|r: &i64| *r > 0 && r.to_string() == *value)
                .ok_or_else(|| ApiError::invalid_request("Invalid Chat write revision"))?;
            niu_storage::ChatWriteCondition::Revision(revision)
        }
        _ => return Err(ApiError::invalid_request("Invalid Chat write revision")),
    };
    if !payload.is_object()
        || !payload
            .get("prompt")
            .and_then(Value::as_str)
            .is_some_and(|s| s.chars().count() <= 12000)
        || payload
            .get("title")
            .is_some_and(|v| !v.is_null() && !v.as_str().is_some_and(|s| s.chars().count() <= 512))
        || !valid_results(&payload)
        || !payload
            .get("createdAt")
            .is_some_and(safe_nonnegative_integer)
    {
        return Err(ApiError::invalid_request("Invalid chat session"));
    }
    // Only conversation fields are stored. Credentials must never be persisted.
    let permitted = [
        "id",
        "title",
        "prompt",
        "results",
        "createdAt",
        "attachments",
        "settings",
        "turns",
    ];
    payload
        .as_object_mut()
        .unwrap()
        .retain(|key, _| permitted.contains(&key.as_str()));
    sanitize_results(&mut payload["results"]);
    if let Some(turns) = payload.get_mut("turns") {
        let turns = turns
            .as_array_mut()
            .ok_or_else(|| ApiError::invalid_request("Invalid chat turns"))?;
        if turns.len() > 100
            || turns.iter().any(|turn| {
                !turn.is_object()
                    || !turn
                        .get("prompt")
                        .and_then(Value::as_str)
                        .is_some_and(|s| s.chars().count() <= 12000)
                    || !valid_results(turn)
            })
        {
            return Err(ApiError::invalid_request("Invalid chat turns"));
        }
        for turn in turns {
            turn.as_object_mut()
                .unwrap()
                .retain(|key, _| ["prompt", "results", "attachments"].contains(&key.as_str()));
            sanitize_results(&mut turn["results"]);
            sanitize_attachments(turn)?;
        }
    }
    if let Some(settings) = payload.get_mut("settings") {
        let settings = settings
            .as_object_mut()
            .ok_or_else(|| ApiError::invalid_request("Invalid chat settings"))?;
        settings.retain(|key, _| {
            ["systemPrompt", "maxTokens", "temperature", "logPayloads"].contains(&key.as_str())
        });
        if settings
            .get("systemPrompt")
            .is_some_and(|v| !v.as_str().is_some_and(|s| s.chars().count() <= 12000))
            || settings.get("maxTokens").is_some_and(|v| {
                !v.as_u64()
                    .is_some_and(|n| (1..=9_007_199_254_740_991).contains(&n))
            })
            || settings.get("temperature").is_some_and(|v| {
                !v.as_f64()
                    .is_some_and(|n| n.is_finite() && (0.0..=2.0).contains(&n))
            })
            || settings.get("logPayloads").is_some_and(|v| !v.is_boolean())
        {
            return Err(ApiError::invalid_request("Invalid chat settings"));
        }
    }
    sanitize_attachments(&mut payload)?;
    payload["id"] = json!(id);
    let revision = state
        .store
        .save_chat_session_guarded(scope, &owner, id, &payload, condition)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(if guarded {
        json!({"saved":true,"revision":revision.to_string(),"guardedWrites":true})
    } else {
        json!({"saved":true})
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversation_export_excludes_legacy_metadata_and_preserves_branches() {
        let metadata = json!({"model":"fast","content":"Saved response","phase":"complete","attemptId":"private-id","cashNanos":"private-cost","customerChargeNanos":"private-cost","error":"private-error","apiKey":"private-key"});
        for turns in [
            None,
            Some(json!([])),
            Some(json!([
                {"prompt":"First","results":[metadata.clone()],"attachments":[{"name":"note.txt","type":"text","content":"Saved context","token":"private-key"}],"id":"private-id"},
                {"prompt":"Second","results":[metadata.clone(),{"model":"other","content":"Other branch","phase":"cancelled"}]}
            ])),
        ] {
            let mut saved = json!({"id":"private-id","owner":"private-owner","title":"Conversation","createdAt":1,"prompt":"Legacy prompt","results":[metadata.clone()],"settings":{"token":"private-key"}});
            if let Some(turns) = turns {
                saved["turns"] = turns;
            }
            let exported = conversation_export(saved);
            assert_eq!(exported["title"], "Conversation");
            assert_eq!(exported["version"], 1);
            assert!(!exported.to_string().contains("private-"));
            let turns = exported["turns"].as_array().unwrap();
            assert_eq!(turns[0]["results"][0]["content"], "Saved response");
            if turns.len() == 2 {
                assert_eq!(turns[1]["results"][1]["model"], "other");
                assert_eq!(turns[0]["attachments"][0]["content"], "Saved context");
            } else {
                assert_eq!(turns[0]["prompt"], "Legacy prompt");
            }
        }
    }

    #[test]
    fn attachment_and_result_bounds_reject_oversized_or_invalid_items() {
        let mut too_many = json!({
            "attachments": (0..5).map(|i| json!({"name": format!("f{i}.txt"), "type": "text", "content": "ok"})).collect::<Vec<_>>()
        });
        assert!(sanitize_attachments(&mut too_many).is_err());

        let mut bad_kind = json!({
            "attachments": [{"name": "f.bin", "type": "binary", "content": "ok"}]
        });
        assert!(sanitize_attachments(&mut bad_kind).is_err());

        let mut valid = json!({
            "attachments": [{"name": "f.txt", "type": "text", "content": "ok", "extra": "dropped"}]
        });
        assert!(sanitize_attachments(&mut valid).is_ok());
        assert!(valid["attachments"][0].get("extra").is_none());

        let long_model = "m".repeat(513);
        assert!(!valid_results(&json!({
            "results": [{"model": long_model, "content": "ok", "elapsedMs": 1, "phase": "complete"}]
        })));
    }
}
