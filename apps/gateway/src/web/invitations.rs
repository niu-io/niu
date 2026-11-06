use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{AdminPermission, OperatorAuditActor, OperatorRole, OperatorScope};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};

const DEFAULT_INVITATION_SECONDS: i64 = 7 * 86_400;

async fn authorize(
    state: &AppState,
    headers: &HeaderMap,
    permission: AdminPermission,
) -> Result<AdminAuthorization, ApiError> {
    state.authorize_admin_headers(headers, permission).await
}

fn audit_actor(authorization: AdminAuthorization) -> OperatorAuditActor {
    match authorization {
        AdminAuthorization::Installation => OperatorAuditActor::Installation,
        AdminAuthorization::Operator(operator) => OperatorAuditActor::Operator(operator.id),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateInvitationInput {
    email: String,
    name: Option<String>,
    role: OperatorRole,
    project_id: Option<Uuid>,
    expires_in_seconds: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/invitations",
///   "method": "post",
///   "operation": {
///     "operationId": "createMemberInvitation",
///     "summary": "Create a one-time member invitation",
///     "description": "Current organization Owner or installation administrator only. Creates a short-lived, purpose-bound invitation for one email, role and workspace/organization scope. The response returns the redemption token exactly once and stores only its SHA-256 digest. A new invitation for the same organization, workspace and email replaces any earlier pending invitation, invalidating its link. This installation has no configured email provider: delivery is `not_configured`, no email is sent, and the owner receives a copyable one-time link. The invitation cannot grant broader rights than the caller may assign, and an email that already has active access in the organization is rejected. No reusable access token or session is created. Responses are not cached.",
///     "tags": ["Administration"],
///     "security": [{"bearerAuth": []}],
///     "x-niu-implementation": "implemented",
///     "parameters": [{"name": "organization", "in": "path", "required": true, "schema": {"type": "string", "format": "uuid"}}],
///     "requestBody": {"required": true, "content": {"application/json": {"schema": {"$ref": "#/components/schemas/MemberInvitationCreate"}}}},
///     "responses": {
///       "201": {"description": "Invitation created; the redemption token is returned once.", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/CreatedMemberInvitation"}}}},
///       "400": {"description": "Invalid email, role, scope or expiry."},
///       "403": {"description": "Member management requires organization Owner authority."},
///       "404": {"description": "Organization or workspace is outside the caller's scope."},
///       "409": {"description": "The email already belongs to an active member of this organization."},
///       "413": {"description": "Body exceeds the bounded request size."},
///       "503": {"description": "Storage unavailable."}
///     }
///   },
///   "schemas": {
///     "MemberInvitationCreate": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": ["email", "role"],
///       "properties": {
///         "email": {"type": "string", "maxLength": 254, "description": "Intended recipient email. Acceptance requires the signed-in account email to match."},
///         "name": {"type": ["string", "null"], "maxLength": 200, "description": "Optional member display name; defaults to the recipient account name."},
///         "role": {"type": "string", "enum": ["owner", "admin", "viewer"]},
///         "project_id": {"type": ["string", "null"], "format": "uuid", "description": "Workspace scope; null grants organization-wide access and requires organization-wide authority."},
///         "expires_in_seconds": {"type": "integer", "minimum": 3600, "maximum": 2592000, "default": 604800}
///       }
///     },
///     "MemberInvitation": {
///       "type": "object",
///       "required": ["id", "organization_id", "organization_name", "organization_slug", "project_id", "project_name", "project_slug", "role", "recipient_email", "recipient_name", "status", "delivery", "created_at", "expires_at", "accepted_at", "revoked_at", "invited_by"],
///       "properties": {
///         "id": {"type": "string", "format": "uuid"},
///         "organization_id": {"type": "string", "format": "uuid"},
///         "organization_name": {"type": "string"},
///         "organization_slug": {"type": "string"},
///         "project_id": {"type": ["string", "null"], "format": "uuid"},
///         "project_name": {"type": ["string", "null"]},
///         "project_slug": {"type": ["string", "null"]},
///         "role": {"type": "string", "enum": ["owner", "admin", "viewer"]},
///         "recipient_email": {"type": "string"},
///         "recipient_name": {"type": ["string", "null"]},
///         "status": {"type": "string", "enum": ["pending", "expired", "canceled", "accepted"]},
///         "delivery": {"type": "string", "enum": ["not_configured"], "description": "No email provider is configured; the one-time link is the supported delivery."},
///         "created_at": {"type": "string", "format": "date-time"},
///         "expires_at": {"type": "string", "format": "date-time"},
///         "accepted_at": {"type": ["string", "null"], "format": "date-time"},
///         "revoked_at": {"type": ["string", "null"], "format": "date-time"},
///         "invited_by": {"type": ["string", "null"], "description": "Inviting member name; null for installation administration."}
///       }
///     },
///     "CreatedMemberInvitation": {
///       "type": "object",
///       "required": ["invitation", "token", "accept_path", "delivery"],
///       "properties": {
///         "invitation": {"$ref": "#/components/schemas/MemberInvitation"},
///         "token": {"type": "string", "description": "Returned once; only the digest is stored."},
///         "accept_path": {"type": "string", "description": "Relative dashboard path for the one-time link."},
///         "delivery": {"type": "object", "required": ["state", "email_sent"], "properties": {"state": {"type": "string", "enum": ["not_configured"]}, "email_sent": {"type": "boolean", "const": false}}}
///       }
///     }
///   }
/// }
/// ```
/// Create a one-time member invitation. The owner receives the invitation
/// secret exactly once; only its digest is stored and no email is sent.
pub async fn create_invitation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization_id): Path<Uuid>,
    Json(input): Json<CreateInvitationInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    if organization_id.is_nil() {
        return Err(ApiError::invalid_request("Invalid organization reference"));
    }
    let authorization = authorize(&state, &headers, AdminPermission::ManageOperators).await?;
    let scope = OperatorScope {
        organization_id,
        project_id: input.project_id,
    };
    if !authorization.permits_operator_scope(scope) {
        return Err(ApiError::not_found());
    }
    let created = state
        .store
        .create_member_invitation(
            scope,
            &input.email,
            input.name.as_deref(),
            input.role,
            input
                .expires_in_seconds
                .unwrap_or(DEFAULT_INVITATION_SECONDS),
            audit_actor(authorization),
        )
        .await
        .map_err(ApiError::from_store)?;
    let accept_path = format!("/invite/{}", created.token);
    Ok((
        StatusCode::CREATED,
        Json(json!({
            "invitation": created.invitation,
            "token": created.token,
            "accept_path": accept_path,
            "delivery": {"state": "not_configured", "email_sent": false},
        })),
    ))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/invitations",
///   "method": "get",
///   "operation": {
///     "operationId": "listMemberInvitations",
///     "summary": "List scoped member invitations",
///     "description": "Current organization Owner or installation administrator only. Returns at most 100 recent invitations visible in the caller's scope: project-scoped Owners see only their workspace's invitations, while organization-wide authority sees organization-wide and workspace invitations. Redemption secrets and token digests are never returned. Status is derived from acceptance, cancellation and current expiry.",
///     "tags": ["Administration"],
///     "security": [{"bearerAuth": []}],
///     "x-niu-implementation": "implemented",
///     "parameters": [{"name": "organization", "in": "path", "required": true, "schema": {"type": "string", "format": "uuid"}}],
///     "responses": {
///       "200": {"description": "Scoped invitation metadata without secrets.", "content": {"application/json": {"schema": {"type": "object", "required": ["data"], "properties": {"data": {"type": "array", "items": {"$ref": "#/components/schemas/MemberInvitation"}}}}}}},
///       "403": {"description": "Member management requires organization Owner authority."},
///       "404": {"description": "Organization is outside the caller's scope."},
///       "503": {"description": "Storage unavailable."}
///     }
///   }
/// }
/// ```
/// Owner-only, scope-filtered invitation directory. Secrets and token digests
/// are never returned.
pub async fn list_invitations(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization_id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    if organization_id.is_nil() {
        return Err(ApiError::invalid_request("Invalid organization reference"));
    }
    let authorization = authorize(&state, &headers, AdminPermission::ManageOperators).await?;
    if !authorization.permits_organization(organization_id) {
        return Err(ApiError::not_found());
    }
    let scope = match authorization {
        AdminAuthorization::Installation => OperatorScope {
            organization_id,
            project_id: None,
        },
        AdminAuthorization::Operator(principal) => principal.scope,
    };
    let invitations = state
        .store
        .member_invitations(scope)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": invitations})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InvitationTokenInput {
    token: String,
}

/// ```openapi
/// {
///   "path": "/api/v1/invitations/preview",
///   "method": "post",
///   "operation": {
///     "operationId": "previewMemberInvitation",
///     "summary": "Preview a signed-in recipient's invitation",
///     "description": "Authenticated member session required; installation credentials are rejected. Resolves one invitation secret supplied in the request body so it does not appear in a request path. Returns the inviting organization, workspace, role, intended email, expiry, lifecycle status and whether the current account email matches. The invitation token is never returned. Acceptance still requires an exact email match and a pending unexpired invitation.",
///     "tags": ["Administration"],
///     "security": [{"bearerAuth": []}],
///     "x-niu-implementation": "implemented",
///     "requestBody": {"required": true, "content": {"application/json": {"schema": {"$ref": "#/components/schemas/MemberInvitationToken"}}}},
///     "responses": {
///       "200": {"description": "Invitation metadata and the caller's binding state.", "content": {"application/json": {"schema": {"type": "object", "required": ["data"], "properties": {"data": {"$ref": "#/components/schemas/MemberInvitationPreview"}}}}}},
///       "400": {"description": "Missing or malformed invitation token."},
///       "403": {"description": "Member session required."},
///       "404": {"description": "Invitation is invalid, expired, canceled or already used."},
///       "413": {"description": "Body exceeds the bounded request size."},
///       "503": {"description": "Storage unavailable."}
///     }
///   },
///   "schemas": {
///     "MemberInvitationToken": {"type": "object", "additionalProperties": false, "required": ["token"], "properties": {"token": {"type": "string", "minLength": 20, "maxLength": 512, "description": "One-time invitation secret."}}},
///     "MemberInvitationPreview": {
///       "allOf": [
///         {"$ref": "#/components/schemas/MemberInvitation"},
///         {"type": "object", "required": ["caller_email", "email_matches", "already_accepted_by_caller"], "properties": {"caller_email": {"type": ["string", "null"]}, "email_matches": {"type": "boolean"}, "already_accepted_by_caller": {"type": "boolean"}}}
///       ]
///     }
///   }
/// }
/// ```
/// Read invitation details after sign-in. The invitation secret is sent in the
/// body so it never appears in a request path or access log.
pub async fn preview_invitation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<InvitationTokenInput>,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize(&state, &headers, AdminPermission::Read).await?;
    let AdminAuthorization::Operator(principal) = authorization else {
        return Err(ApiError::forbidden());
    };
    let preview = state
        .store
        .preview_member_invitation(principal, &input.token)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": preview})))
}

/// ```openapi
/// {
///   "path": "/api/v1/session/invitations",
///   "method": "post",
///   "operation": {
///     "operationId": "acceptMemberInvitation",
///     "summary": "Accept a one-time member invitation",
///     "description": "Authenticated member session required; installation credentials are rejected. Atomically revalidates invitation state, expiry, version, email binding, inviter authority and target scope, then creates the exact invited member role/scope for the caller's account identity and switches the current session to it. No reusable operator access token is issued. The redemption secret is consumed exactly once. Replay by the same account identity returns the completed membership with replayed true; another identity is denied. Existing operator sessions and roles are not broadened. Returns the refreshed session plus accepted invitation metadata. Responses are not cached.",
///     "tags": ["Administration"],
///     "security": [{"bearerAuth": []}],
///     "x-niu-implementation": "implemented",
///     "requestBody": {"required": true, "content": {"application/json": {"schema": {"$ref": "#/components/schemas/MemberInvitationToken"}}}},
///     "responses": {
///       "200": {"description": "Invitation accepted or reconciled; the refreshed session is scoped to the invited role and workspace.", "content": {"application/json": {"schema": {"type": "object", "required": ["data", "invitation", "replayed"], "properties": {"data": {"type": "object", "description": "Refreshed session identity."}, "invitation": {"$ref": "#/components/schemas/MemberInvitation"}, "replayed": {"type": "boolean"}}}}}},
///       "400": {"description": "Malformed invitation token."},
///       "403": {"description": "Signed-in account email does not match the invitation, or the inviter no longer has authority."},
///       "404": {"description": "Invitation is invalid, expired, canceled or already used by another identity."},
///       "409": {"description": "The account already belongs to the organization; change the existing member instead."},
///       "413": {"description": "Body exceeds the bounded request size."},
///       "503": {"description": "Storage unavailable."}
///     }
///   }
/// }
/// ```
/// Accept a one-time invitation as the signed-in account. The account email
/// must match the invitation; acceptance creates only the invited role/scope
/// and returns the refreshed session. No reusable operator token is issued.
pub async fn accept_invitation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<InvitationTokenInput>,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize(&state, &headers, AdminPermission::Read).await?;
    let AdminAuthorization::Operator(principal) = authorization else {
        return Err(ApiError::forbidden());
    };
    let accepted = state
        .store
        .accept_member_invitation(principal, &input.token)
        .await
        .map_err(ApiError::from_store)?;
    let Json(session) = crate::admin::session::current_session(State(state), headers).await?;
    let mut response = session;
    response["invitation"] = json!(accepted.invitation);
    response["replayed"] = json!(accepted.replayed);
    Ok(Json(response))
}

/// ```openapi
/// {
///   "path": "/api/v1/invitations/{invitation}",
///   "method": "delete",
///   "operation": {
///     "operationId": "cancelMemberInvitation",
///     "summary": "Cancel a pending member invitation",
///     "description": "Current organization Owner or installation administrator with authority over the invitation's exact scope. Cancellation prevents further redemption and records an immutable lifecycle event. Repeated cancellation is idempotent. Accepted invitations cannot be canceled here because the resulting member must be managed in the member list. Foreign and organization-wide invitations outside a project-scoped caller's authority are concealed with 404.",
///     "tags": ["Administration"],
///     "security": [{"bearerAuth": []}],
///     "x-niu-implementation": "implemented",
///     "parameters": [{"name": "invitation", "in": "path", "required": true, "schema": {"type": "string", "format": "uuid"}}],
///     "responses": {
///       "204": {"description": "Invitation is canceled or was already canceled."},
///       "400": {"description": "Invalid invitation reference."},
///       "403": {"description": "Member management requires organization Owner authority."},
///       "404": {"description": "Invitation is outside the caller's scope."},
///       "409": {"description": "Invitation was already accepted; manage the member instead."},
///       "503": {"description": "Storage unavailable."}
///     }
///   }
/// }
/// ```
/// Cancel a pending invitation. Accepted invitations are managed as member
/// access instead; repeated cancellation is idempotent.
pub async fn cancel_invitation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(invitation_id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    if invitation_id.is_nil() {
        return Err(ApiError::invalid_request("Invalid invitation reference"));
    }
    let authorization = authorize(&state, &headers, AdminPermission::ManageOperators).await?;
    let scope = state
        .store
        .member_invitation_scope(invitation_id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if !authorization.permits_operator_scope(scope) {
        return Err(ApiError::not_found());
    }
    state
        .store
        .cancel_member_invitation(invitation_id, audit_actor(authorization))
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}
