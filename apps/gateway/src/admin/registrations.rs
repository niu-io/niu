//! Limited Preview public registration submission and platform administrator
//! approval workflow. No unauthenticated email enumeration is permitted.
use super::{
    audit_actor,
    passwords::{runtime, worker_error},
};
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State, rejection::JsonRejection},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{
    RegistrationMode, RegistrationStatus, RegistrationSubmissionInput,
    validate_registration_submission_fields,
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SubmitRegistrationInput {
    name: String,
    email: String,
    password: String,
    #[serde(default)]
    organization_name: Option<String>,
    #[serde(default)]
    workspace_name: Option<String>,
    #[serde(default)]
    note: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SavePolicyInput {
    mode: String,
    expected_revision: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QueueQuery {
    status: Option<String>,
    cursor: Option<Uuid>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApproveRegistrationInput {
    expected_revision: String,
    #[serde(default)]
    organization_name: Option<String>,
    #[serde(default)]
    workspace_name: Option<String>,
    #[serde(default)]
    note: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RejectRegistrationInput {
    expected_revision: String,
    #[serde(default)]
    note: Option<String>,
}

fn parse_expected_revision(raw: &str) -> Result<i64, ApiError> {
    raw.parse::<i64>()
        .ok()
        .filter(|value| *value >= 1 && value.to_string() == raw)
        .ok_or_else(|| ApiError::invalid_request("Provide the current registration revision"))
}

/// Submit a Limited Preview account registration request.
///
/// ```openapi
/// {
///   "path": "/api/v1/auth/registrations",
///   "method": "post",
///   "schemas": {
///     "RegistrationPolicySnapshot": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": ["mode", "revision", "updated_at", "password_login_configured"],
///       "properties": {
///         "mode": {
///           "type": "string",
///           "enum": ["disabled", "approval_required"],
///           "description": "disabled (invite/admin setup only) or approval_required (Limited Preview)."
///         },
///         "revision": { "type": "string", "pattern": "^[1-9][0-9]*$" },
///         "updated_at": { "type": "string" },
///         "password_login_configured": { "type": "boolean" }
///       }
///     },
///     "RegistrationCounts": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": ["pending", "approved", "rejected"],
///       "properties": {
///         "pending": { "type": "integer", "minimum": 0 },
///         "approved": { "type": "integer", "minimum": 0 },
///         "rejected": { "type": "integer", "minimum": 0 }
///       }
///     },
///     "RegistrationRequestRecord": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "id",
///         "email",
///         "applicant_name",
///         "organization_name",
///         "workspace_name",
///         "note",
///         "status",
///         "revision",
///         "created_at",
///         "reviewed_at",
///         "reviewed_by_kind",
///         "reviewed_by_label",
///         "decision_note",
///         "approved_organization_slug",
///         "approved_workspace_slug"
///       ],
///       "properties": {
///         "id": { "type": "string", "format": "uuid", "description": "Internal API routing reference. Never display internal UUIDs in product UI." },
///         "email": { "type": "string" },
///         "applicant_name": { "type": "string" },
///         "organization_name": { "type": "string" },
///         "workspace_name": { "type": "string" },
///         "note": { "type": ["string", "null"] },
///         "status": { "type": "string", "enum": ["pending", "approved", "rejected"] },
///         "revision": { "type": "string", "pattern": "^[1-9][0-9]*$" },
///         "created_at": { "type": "string", "format": "date-time" },
///         "reviewed_at": { "type": ["string", "null"], "format": "date-time" },
///         "reviewed_by_kind": { "type": ["string", "null"], "enum": ["installation", "operator", null] },
///         "reviewed_by_label": { "type": ["string", "null"] },
///         "decision_note": { "type": ["string", "null"] },
///         "approved_organization_slug": { "type": ["string", "null"] },
///         "approved_workspace_slug": { "type": ["string", "null"] }
///       }
///     },
///     "RegistrationQueuePage": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": ["data", "next_cursor", "counts", "policy"],
///       "properties": {
///         "data": {
///           "type": "array",
///           "items": { "$ref": "#/components/schemas/RegistrationRequestRecord" }
///         },
///         "next_cursor": { "type": ["string", "null"], "format": "uuid" },
///         "counts": { "$ref": "#/components/schemas/RegistrationCounts" },
///         "policy": {
///           "type": "object",
///           "additionalProperties": false,
///           "required": ["mode", "revision", "updated_at"],
///           "properties": {
///             "mode": { "type": "string", "enum": ["disabled", "approval_required"] },
///             "revision": { "type": "string", "pattern": "^[1-9][0-9]*$" },
///             "updated_at": { "type": "string" }
///           }
///         }
///       }
///     }
///   },
///   "operation": {
///     "operationId": "submitLimitedPreviewRegistration",
///     "summary": "Request a Limited Preview account pending administrator approval",
///     "description": "Public capability gated by NIU_AUTH_PUBLIC_ORIGIN and the configured registration policy. Requires the configured HTTPS Origin header. Passwords are validated (minimum 15 characters, maximum 1024 UTF-8 bytes) and Argon2id-hashed at submission time; no plaintext password is stored. No email provider is required: once approved by an administrator, the applicant signs in immediately with the submitted email and password. Existing accounts and duplicate pending emails return the same 202 response without overwriting credentials. Responses use Cache-Control no-store.",
///     "security": [],
///     "x-niu-implementation": "implemented",
///     "parameters": [
///       { "in": "header", "name": "Origin", "required": true, "schema": { "type": "string" } }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": ["name", "email", "password"],
///             "properties": {
///               "name": { "type": "string", "minLength": 1, "maxLength": 120 },
///               "email": { "type": "string", "maxLength": 254 },
///               "password": { "type": "string", "minLength": 15, "maxLength": 1024, "writeOnly": true },
///               "organization_name": { "type": "string", "maxLength": 120 },
///               "workspace_name": { "type": "string", "maxLength": 120 },
///               "note": { "type": "string", "maxLength": 500 }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "202": {
///         "description": "Registration accepted for Limited Preview administrator review.",
///         "headers": { "Cache-Control": { "schema": { "type": "string", "const": "no-store" } } },
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": ["status"],
///               "properties": { "status": { "type": "string", "const": "pending_approval" } }
///             }
///           }
///         }
///       },
///       "400": { "description": "Invalid registration fields or password policy failure." },
///       "403": { "description": "Registration is disabled on this deployment or Origin rejected." },
///       "429": {
///         "description": "Registration submission rate limit or worker capacity reached.",
///         "headers": { "Retry-After": { "schema": { "type": "string", "const": "60" } } }
///       },
///       "501": { "description": "Password authentication is not configured on this deployment." },
///       "503": { "description": "Durable storage or credential processing is unavailable." }
///     }
///   }
/// }
/// ```
pub async fn submit(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<SubmitRegistrationInput>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let auth_runtime = runtime(&state)?;
    auth_runtime.require_origin(&headers)?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid registration request"))?;
    let policy = state
        .store
        .registration_policy()
        .await
        .map_err(ApiError::from_store)?;
    if policy.mode != RegistrationMode::ApprovalRequired {
        return Err(ApiError::registration_disabled());
    }
    if input.password.len() > 1024 || input.password.chars().count() < 15 {
        return Err(worker_error(niu_storage::PasswordWorkError::Credential(
            niu_storage::passwords::PasswordError::InvalidPassword,
        )));
    }
    let fields = validate_registration_submission_fields(
        &input.email,
        &input.name,
        input.organization_name.as_deref(),
        input.workspace_name.as_deref(),
        input.note.as_deref(),
    )
    .map_err(ApiError::from_store)?;

    let client_ip = crate::request_source::current_ip().map(|ip| ip.to_string());
    if !state
        .store
        .admit_registration_submission(&fields.email, client_ip.as_deref())
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::registration_rate_limited());
    }

    let password_hash = auth_runtime.hash_password_bounded(input.password).await?;
    let _outcome = state
        .store
        .submit_registration_request(RegistrationSubmissionInput {
            email: &fields.email,
            applicant_name: &fields.applicant_name,
            organization_name: Some(&fields.organization_name),
            workspace_name: Some(&fields.workspace_name),
            password_hash: &password_hash,
            note: fields.note.as_deref(),
        })
        .await
        .map_err(ApiError::from_store)?;

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({ "status": "pending_approval" })),
    ))
}

/// Read installation registration policy.
///
/// ```openapi
/// {
///   "path": "/api/v1/platform/registration",
///   "method": "get",
///   "operation": {
///     "operationId": "getPlatformRegistrationPolicy",
///     "summary": "Read Limited Preview registration policy",
///     "description": "Platform administration required. Returns the saved registration policy revision and whether password sign-in is active.",
///     "security": [{ "bearerAuth": [] }],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Current registration policy.",
///         "headers": { "Cache-Control": { "schema": { "type": "string", "const": "no-store" } } },
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": ["data"],
///               "properties": { "data": { "$ref": "#/components/schemas/RegistrationPolicySnapshot" } }
///             }
///           }
///         }
///       },
///       "401": { "description": "Authentication required." },
///       "403": { "description": "Platform administration required." }
///     }
///   }
/// }
/// ```
pub async fn read_policy(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let policy = state
        .store
        .registration_policy()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({
        "data": {
            "mode": policy.mode,
            "revision": policy.revision,
            "updated_at": policy.updated_at,
            "password_login_configured": state.password_auth.is_some(),
        }
    })))
}

/// Update installation registration policy.
///
/// ```openapi
/// {
///   "path": "/api/v1/platform/registration",
///   "method": "put",
///   "operation": {
///     "operationId": "savePlatformRegistrationPolicy",
///     "summary": "Update Limited Preview registration policy",
///     "description": "Platform administration required. Switches public registration between approval_required (Limited Preview) and disabled using optimistic expected_revision.",
///     "security": [{ "bearerAuth": [] }],
///     "x-niu-implementation": "implemented",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": ["mode", "expected_revision"],
///             "properties": {
///               "mode": { "type": "string", "enum": ["disabled", "approval_required"] },
///               "expected_revision": { "type": "string", "pattern": "^[1-9][0-9]*$" }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Updated registration policy.",
///         "headers": { "Cache-Control": { "schema": { "type": "string", "const": "no-store" } } },
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": ["data"],
///               "properties": { "data": { "$ref": "#/components/schemas/RegistrationPolicySnapshot" } }
///             }
///           }
///         }
///       },
///       "400": { "description": "Invalid policy mode or revision." },
///       "401": { "description": "Authentication required." },
///       "403": { "description": "Platform administration required." },
///       "409": { "description": "Policy changed concurrently; refresh revision and retry." }
///     }
///   }
/// }
/// ```
pub async fn save_policy(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<SavePolicyInput>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid registration policy"))?;
    let expected = parse_expected_revision(&input.expected_revision)?;
    let mode = RegistrationMode::parse(&input.mode)
        .ok_or_else(|| ApiError::invalid_request("Choose disabled or approval_required"))?;
    let updated = state
        .store
        .save_registration_policy(expected, mode, audit_actor(auth))
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({
        "data": {
            "mode": updated.mode,
            "revision": updated.revision,
            "updated_at": updated.updated_at,
            "password_login_configured": state.password_auth.is_some(),
        }
    })))
}

/// List Limited Preview account registration requests.
///
/// ```openapi
/// {
///   "path": "/api/v1/platform/registrations",
///   "method": "get",
///   "operation": {
///     "operationId": "listPlatformRegistrations",
///     "summary": "List Limited Preview registration requests",
///     "description": "Platform administration required. Returns submitted registration requests, counts by status, and the current policy. Password hashes are never returned.",
///     "security": [{ "bearerAuth": [] }],
///     "x-niu-implementation": "implemented",
///     "parameters": [
///       {
///         "name": "status",
///         "in": "query",
///         "schema": { "type": "string", "enum": ["pending", "approved", "rejected"] }
///       },
///       { "name": "cursor", "in": "query", "schema": { "type": "string", "format": "uuid" } },
///       { "name": "limit", "in": "query", "schema": { "type": "integer", "minimum": 1, "maximum": 100, "default": 50 } }
///     ],
///     "responses": {
///       "200": {
///         "description": "Registration requests page and summary counts.",
///         "headers": { "Cache-Control": { "schema": { "type": "string", "const": "no-store" } } },
///         "content": {
///           "application/json": { "schema": { "$ref": "#/components/schemas/RegistrationQueuePage" } }
///         }
///       },
///       "400": { "description": "Invalid status filter, cursor, or limit." },
///       "401": { "description": "Authentication required." },
///       "403": { "description": "Platform administration required." }
///     }
///   }
/// }
/// ```
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<QueueQuery>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let status = match query
        .status
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(raw) => Some(RegistrationStatus::parse(raw).ok_or_else(|| {
            ApiError::invalid_request("Choose pending, approved, or rejected status")
        })?),
        None => None,
    };
    let page = state
        .store
        .list_registration_requests(status, query.cursor, query.limit.unwrap_or(50))
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!(page)))
}

/// Approve a pending Limited Preview registration and provision the account atomically.
///
/// ```openapi
/// {
///   "path": "/api/v1/platform/registrations/{registration}/approve",
///   "method": "post",
///   "operation": {
///     "operationId": "approvePlatformRegistration",
///     "summary": "Approve a Limited Preview registration",
///     "description": "Platform administration required. Atomically creates the customer organization (and balance account in configured platform currency when present), initial workspace with human-readable slug, organization-wide owner operator, and password credentials from the applicant's submitted Argon2id hash.",
///     "security": [{ "bearerAuth": [] }],
///     "x-niu-implementation": "implemented",
///     "parameters": [
///       { "name": "registration", "in": "path", "required": true, "schema": { "type": "string", "format": "uuid" } }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": ["expected_revision"],
///             "properties": {
///               "expected_revision": { "type": "string", "pattern": "^[1-9][0-9]*$" },
///               "organization_name": { "type": "string", "maxLength": 120 },
///               "workspace_name": { "type": "string", "maxLength": 120 },
///               "note": { "type": "string", "maxLength": 500 }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Registration approved and workspace owner provisioned.",
///         "headers": { "Cache-Control": { "schema": { "type": "string", "const": "no-store" } } },
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": ["data"],
///               "properties": { "data": { "$ref": "#/components/schemas/RegistrationRequestRecord" } }
///             }
///           }
///         }
///       },
///       "400": { "description": "Invalid approval payload or name override." },
///       "401": { "description": "Authentication required." },
///       "403": { "description": "Platform administration required." },
///       "409": { "description": "Request already reviewed, stale revision, or email already bound to an active account." }
///     }
///   }
/// }
/// ```
pub async fn approve(
    State(state): State<AppState>,
    Path(registration): Path<Uuid>,
    headers: HeaderMap,
    input: Result<Json<ApproveRegistrationInput>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid registration approval payload"))?;
    let expected = parse_expected_revision(&input.expected_revision)?;
    let approved = state
        .store
        .approve_registration_request(
            registration,
            expected,
            input.organization_name.as_deref(),
            input.workspace_name.as_deref(),
            input.note.as_deref(),
            audit_actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({ "data": approved })))
}

/// Reject a pending Limited Preview registration.
///
/// ```openapi
/// {
///   "path": "/api/v1/platform/registrations/{registration}/reject",
///   "method": "post",
///   "operation": {
///     "operationId": "rejectPlatformRegistration",
///     "summary": "Reject a Limited Preview registration",
///     "description": "Platform administration required. Marks the pending request rejected and clears its stored password hash without creating an account.",
///     "security": [{ "bearerAuth": [] }],
///     "x-niu-implementation": "implemented",
///     "parameters": [
///       { "name": "registration", "in": "path", "required": true, "schema": { "type": "string", "format": "uuid" } }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": ["expected_revision"],
///             "properties": {
///               "expected_revision": { "type": "string", "pattern": "^[1-9][0-9]*$" },
///               "note": { "type": "string", "maxLength": 500 }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Registration rejected.",
///         "headers": { "Cache-Control": { "schema": { "type": "string", "const": "no-store" } } },
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": ["data"],
///               "properties": { "data": { "$ref": "#/components/schemas/RegistrationRequestRecord" } }
///             }
///           }
///         }
///       },
///       "400": { "description": "Invalid rejection payload." },
///       "401": { "description": "Authentication required." },
///       "403": { "description": "Platform administration required." },
///       "409": { "description": "Request already reviewed or stale revision." }
///     }
///   }
/// }
/// ```
pub async fn reject(
    State(state): State<AppState>,
    Path(registration): Path<Uuid>,
    headers: HeaderMap,
    input: Result<Json<RejectRegistrationInput>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid registration rejection payload"))?;
    let expected = parse_expected_revision(&input.expected_revision)?;
    let rejected = state
        .store
        .reject_registration_request(
            registration,
            expected,
            input.note.as_deref(),
            audit_actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({ "data": rejected })))
}
