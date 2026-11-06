//! Scoped browser-to-agent authorization. Browser login and explicit approval
//! are separate steps; no session cookie is ever returned to the agent.
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{AdminPermission, TenantScope};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Create {
    client_name: String,
    #[serde(default)]
    capabilities: Vec<String>,
    /// Self-reported task context shown during review. It is not authority.
    task: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Exchange {
    device_secret: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Decision {
    approve: bool,
    organization_id: Option<Uuid>,
    workspace_id: Option<Uuid>,
    #[serde(default)]
    allowed_models: Vec<String>,
    ttl_seconds: Option<i64>,
    /// Required for approval. An omitted value must never become a paid grant.
    invocation_allowed: Option<bool>,
    /// Exact approved model interfaces. Required when invocation is allowed.
    invocation_protocols: Option<Vec<String>>,
}

fn code(value: &str) -> Result<(), ApiError> {
    if value.len() != 12
        || !value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'A'..=b'F').contains(&b))
    {
        return Err(ApiError::invalid_request(
            "Use the authorization code supplied by your agent",
        ));
    }
    Ok(())
}

/// ```openapi
/// {
///   "path": "/api/v1/auth/agents",
///   "method": "post",
///   "operation": {
///     "operationId": "createAgentAuthorization",
///     "summary": "Start coding-agent browser authorization",
///     "description": "Anonymous client request, limited using the trusted request source. Creates a ten-minute authorization request. Device secret is returned only to the agent; only the separate user code belongs in the browser URL. Client name is self-reported, not an authenticated application identity. No grants or inference occur. Responses are no-store.",
///     "security": [],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "201": {
///         "description": "Request created",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "device_secret",
///                 "user_code",
///                 "verification_uri",
///                 "expires_in",
///                 "interval"
///               ],
///               "properties": {
///                 "device_secret": {
///                   "type": "string",
///                   "pattern": "^[0-9a-f]{64}$",
///                   "description": "Private polling capability; never put in a URL or log."
///                 },
///                 "user_code": {
///                   "type": "string",
///                   "pattern": "^[0-9A-F]{12}$"
///                 },
///                 "verification_uri": {
///                   "type": "string",
///                   "const": "/connect"
///                 },
///                 "expires_in": {
///                   "type": "integer",
///                   "const": 600
///                 },
///                 "interval": {
///                   "type": "integer",
///                   "const": 5
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Unsupported client or invalid body"
///       },
///       "429": {
///         "description": "Creation admission limit reached"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "client_name"
///             ],
///             "properties": {
///               "client_name": {
///                 "type": "string",
///                 "enum": [
///                   "Claude Code",
///                   "Codex",
///                   "DeepSeek Harness"
///                 ]
///               },
///               "capabilities": {
///                 "type": "array",
///                 "maxItems": 6,
///                 "uniqueItems": true,
///                 "items": {
///                   "type": "string",
///                   "enum": [
///                     "pools:read",
///                     "pools:write",
///                     "events:read",
///                     "events:write",
///                     "evaluations:read",
///                     "evaluations:write"
///                   ]
///                 },
///                 "description": "Additional workspace management rights, requiring explicit browser approval. Empty by default; no platform administration."
///               },
///               "task": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 200,
///                 "description": "Self-reported task context shown to the approver. It is not authority and is never used for backend permission checks."
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn create(
    State(state): State<AppState>,
    Json(input): Json<Create>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    // Separate namespace from password attempts. No proxy-supplied IP is trusted.
    let source = crate::request_source::current_ip().map_or("unknown".into(), |ip| ip.to_string());
    if !state
        .store
        .admit_member_password_login(&format!("agent-connect-{source}@niu.internal"))
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::sign_in_limited());
    }
    let task = input
        .task
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if task.is_some_and(|value| value.chars().count() > 200 || value.chars().any(char::is_control))
    {
        return Err(ApiError::invalid_request(
            "Describe the requested task in 200 characters or fewer without control characters",
        ));
    }
    let request = state
        .store
        .create_agent_authorization_with_task(&input.client_name, &input.capabilities, task)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        Json(
            json!({"device_secret":request.device_secret,"user_code":request.user_code,"verification_uri":"/connect","expires_in":600,"interval":5}),
        ),
    ))
}

/// ```openapi
/// {
///   "path": "/api/v1/auth/agents/{code}",
///   "method": "get",
///   "operation": {
///     "operationId": "getAgentAuthorization",
///     "summary": "Inspect an authorization request after login",
///     "description": "Requires a current user session. Returns bounded request metadata: client name, state, requested management capabilities and self-reported task context. It never returns the device secret or issued credential. Unknown and expired requests return 404; invalid session returns 401. Client label and task are self-reported, not authenticated authority. No-store.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Request metadata",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "client_name",
///                     "state",
///                     "capabilities",
///                     "task"
///                   ],
///                   "properties": {
///                     "client_name": {
///                       "type": "string"
///                     },
///                     "state": {
///                       "type": "string",
///                       "enum": [
///                         "pending",
///                         "approved",
///                         "denied",
///                         "consumed"
///                       ]
///                     },
///                     "task": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "maxLength": 200,
///                       "description": "Self-reported task context supplied by the client. Explain the request but never treat it as an authorization grant."
///                     },
///                     "capabilities": {
///                       "type": "array",
///                       "maxItems": 6,
///                       "uniqueItems": true,
///                       "items": {
///                         "type": "string",
///                         "enum": [
///                           "pools:read",
///                           "pools:write",
///                           "events:read",
///                           "events:write",
///                           "evaluations:read",
///                           "evaluations:write"
///                         ]
///                       },
///                       "description": "Additional workspace management rights, requiring explicit browser approval. Empty by default; no platform administration."
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Sign-in required"
///       },
///       "404": {
///         "description": "Request unavailable or expired"
///       }
///     },
///     "parameters": [
///       {
///         "name": "code",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[0-9A-F]{12}$"
///         }
///       }
///     ]
///   }
/// }
/// ```
pub async fn view(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_code): Path<String>,
) -> Result<Json<Value>, ApiError> {
    super::authorize(&state, &headers, AdminPermission::Read).await?;
    code(&user_code)?;
    Ok(Json(
        json!({"data":state.store.agent_authorization_view(&user_code).await.map_err(|error| match error { niu_storage::StoreError::Unauthorized => ApiError::not_found(), other => ApiError::from_store(other) })?}),
    ))
}

/// ```openapi
/// {
///   "path": "/api/v1/auth/agents/{code}",
///   "method": "post",
///   "operation": {
///     "operationId": "decideAgentAuthorization",
///     "summary": "Approve or decline an agent connection",
///     "description": "Requires an exact trusted same-origin Origin and a current Operator with write permission. Approval requires organization_id, workspace_id, allowed_models, ttl_seconds and an explicit invocation_allowed value, and checks write access to that workspace. Approved invocation also records the exact model interfaces; omitted interface scope never defaults to a paid grant. A decline may omit both scope fields; if supplied, both are checked. Installation credentials and inference keys cannot decide. Approval validates model aliases and stores explicit scope, fixed model names, financial boundary and finite credential lifetime; it does not return a credential. State transition is one-time, with expiry and active approver checks. Existing workspace billing constraints still apply. No-store.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "204": {
///         "description": "Decision persisted"
///       },
///       "400": {
///         "description": "Invalid code, grant or lifetime"
///       },
///       "401": {
///         "description": "Sign-in required"
///       },
///       "403": {
///         "description": "Origin or role refused"
///       },
///       "404": {
///         "description": "Workspace outside authorized scope"
///       },
///       "409": {
///         "description": "Request already decided or expired"
///       }
///     },
///     "parameters": [
///       {
///         "name": "code",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[0-9A-F]{12}$"
///         }
///       },
///       {
///         "name": "Origin",
///         "in": "header",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uri"
///         }
///       }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": ["approve"],
///             "oneOf": [
///               {"properties": {"approve": {"enum": [false]}}},
///               {"properties": {"approve": {"enum": [true]}}, "required": ["organization_id", "workspace_id", "allowed_models", "ttl_seconds", "invocation_allowed", "invocation_protocols"]}
///             ],
///             "properties": {
///               "approve": {
///                 "type": "boolean"
///               },
///               "organization_id": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "workspace_id": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "allowed_models": {
///                 "type": "array",
///                 "minItems": 1,
///                 "items": {
///                   "type": "string",
///                   "minLength": 1,
///                   "maxLength": 200
///                 }
///               },
///               "ttl_seconds": {
///                 "type": "integer",
///                 "minimum": 60,
///                 "maximum": 86400
///               },
///               "invocation_allowed": {
///                 "type": "boolean",
///                 "description": "Required on approval. Whether the issued credential may dispatch inference at all. False preserves separately granted discovery and management access. There is no omitted default; an absent value is rejected."
///               },
///               "invocation_protocols": {
///                 "type": "array",
///                 "minItems": 1,
///                 "maxItems": 6,
///                 "uniqueItems": true,
///                 "items": {
///                   "type": "string",
///                   "enum": [
///                     "chat",
///                     "responses",
///                     "messages",
///                     "content",
///                     "embeddings",
///                     "video"
///                   ]
///                 },
///                 "description": "Exact model interfaces approved for invocation. Required when invocation_allowed is true; when invocation is disabled, omission is treated as all interfaces for compatibility and has no paid effect."
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn decide(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_code): Path<String>,
    Json(input): Json<Decision>,
) -> Result<StatusCode, ApiError> {
    super::passwords::runtime(&state)?.require_origin(&headers)?;
    code(&user_code)?;
    let auth = match (input.organization_id, input.workspace_id) {
        (Some(organization), Some(workspace)) => {
            super::authorize_project(
                &state,
                &headers,
                AdminPermission::Write,
                organization,
                workspace,
            )
            .await?
        }
        (None, None) if !input.approve => {
            state
                .authorize_admin_headers(&headers, AdminPermission::Write)
                .await?
        }
        _ => {
            return Err(ApiError::invalid_request(
                "Select a workspace to authorize this connection",
            ));
        }
    };
    let AdminAuthorization::Operator(actor) = auth else {
        return Err(ApiError::forbidden());
    };
    if !input.approve {
        state
            .store
            .deny_agent_authorization(&user_code)
            .await
            .map_err(ApiError::from_store)?;
        return Ok(StatusCode::NO_CONTENT);
    }
    let organization = input
        .organization_id
        .ok_or_else(|| ApiError::invalid_request("Select a workspace"))?;
    let workspace = input
        .workspace_id
        .ok_or_else(|| ApiError::invalid_request("Select a workspace"))?;
    let ttl_seconds = input
        .ttl_seconds
        .ok_or_else(|| ApiError::invalid_request("Select a credential lifetime"))?;
    let scope = TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    let mut models = crate::vendors::scoped_models(&state, organization).await?;
    models.extend(crate::codex::private_models(&state, scope).await?);
    let wildcard = input.allowed_models.len() == 1 && input.allowed_models[0] == "*";
    if !wildcard
        && input
            .allowed_models
            .iter()
            .any(|model| !models.contains_key(model))
    {
        return Err(ApiError::invalid_request(
            "Every granted model must exist in this workspace",
        ));
    }
    let invocation_allowed = input.invocation_allowed.ok_or_else(|| {
        ApiError::invalid_request(
            "Choose whether this connection may make paid model calls before approving it",
        )
    })?;
    let invocation_protocols = match input.invocation_protocols {
        Some(protocols) => protocols,
        None if invocation_allowed => {
            return Err(ApiError::invalid_request(
                "Choose the model interfaces this connection may use before approving paid calls",
            ));
        }
        None => niu_storage::INVOCATION_PROTOCOLS
            .iter()
            .map(|value| (*value).to_owned())
            .collect(),
    };
    if !niu_storage::valid_invocation_protocols(&invocation_protocols) {
        return Err(ApiError::invalid_request(
            "Choose at least one supported model interface without duplicates",
        ));
    }
    state
        .store
        .approve_agent_authorization_with_scope(
            &user_code,
            scope,
            actor.id,
            &input.allowed_models,
            ttl_seconds,
            invocation_allowed,
            &invocation_protocols,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

/// ```openapi
/// {
///   "path": "/api/v1/auth/agents/token",
///   "method": "post",
///   "operation": {
///     "operationId": "exchangeAgentAuthorization",
///     "summary": "Exchange an approved agent request for scoped access",
///     "description": "Agent supplies the private device secret. Pending polls are durably limited to a five-second interval. Approved exchange atomically issues one finite workspace model API key with the exact approved model names, invocation switch and model interfaces, then consumes the request. Repeat, denied, expired or revoked-approver exchanges are refused. A lost successful response cannot retrieve the secret; review/revoke the issued key before a new authorization. No-store. This grants inference and request evidence access, not platform administration.",
///     "security": [],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Credential delivered once",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "token",
///                 "token_type"
///               ],
///               "properties": {
///                 "token": {
///                   "type": "string",
///                   "pattern": "^niu_[0-9a-f]{64}$"
///                 },
///                 "token_type": {
///                   "type": "string",
///                   "const": "Bearer"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "202": {
///         "description": "Approval pending",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "status",
///                 "interval"
///               ],
///               "properties": {
///                 "status": {
///                   "type": "string",
///                   "const": "authorization_pending"
///                 },
///                 "interval": {
///                   "type": "integer",
///                   "const": 5
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Unknown, denied, expired, consumed or revoked approval"
///       },
///       "429": {
///         "description": "Poll interval exceeded"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "device_secret"
///             ],
///             "properties": {
///               "device_secret": {
///                 "type": "string",
///                 "pattern": "^[0-9a-f]{64}$"
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn exchange(
    State(state): State<AppState>,
    Json(input): Json<Exchange>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    match state
        .store
        .exchange_agent_authorization(&input.device_secret)
        .await
        .map_err(ApiError::from_store)?
    {
        None => Ok((
            StatusCode::ACCEPTED,
            Json(json!({"status":"authorization_pending","interval":5})),
        )),
        Some(key) => Ok((
            StatusCode::OK,
            Json(json!({"token":key.token,"token_type":"Bearer"})),
        )),
    }
}
