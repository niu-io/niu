use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use niu_storage::AdminPermission;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};

/// Reauthenticate each request so the dashboard never treats cached role hints as authority.
pub async fn current_session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let authorization = super::authorize(&state, &headers, AdminPermission::Read).await?;
    let admin_mode_available = match authorization {
        AdminAuthorization::Installation => false,
        AdminAuthorization::Operator(principal) => state
            .store
            .browser_admin_mode_available(principal)
            .await
            .map_err(ApiError::from_store)?,
    };
    let (kind, operator, role) = match authorization {
        AdminAuthorization::Installation => ("installation", Value::Null, None),
        AdminAuthorization::Operator(principal) => (
            "operator",
            json!({
                "id": principal.id,
                "role": principal.role,
                "organization_id": principal.scope.organization_id,
                "project_id": principal.scope.project_id,
            }),
            Some(principal.role),
        ),
    };
    let profile = match authorization {
        AdminAuthorization::Installation => None,
        AdminAuthorization::Operator(principal) => Some(
            state
                .store
                .member_profile(principal.id)
                .await
                .map_err(ApiError::from_store)?,
        ),
    };
    let active_role = if authorization.can_manage_platform() {
        "admin"
    } else {
        "user"
    };
    let available_roles = if admin_mode_available {
        vec!["user", "admin"]
    } else {
        vec![active_role]
    };
    Ok(Json(json!({"data": {
        "kind": kind,
        "operating_mode": state.operating_mode,
        "provider_memberships": [],
        "roles": { "available": available_roles, "active": active_role, "switchable": admin_mode_available },
        "profile": profile,
        "admin_mode": { "available": admin_mode_available, "enabled": admin_mode_available && authorization.can_manage_platform() },
        "operator": operator,
        "permissions": {
            "read": true,
            "write": role.is_none_or(|role| role.permits(AdminPermission::Write)),
            "manage_operators": role.is_none_or(|role| role.permits(AdminPermission::ManageOperators)),
            "platform_admin": authorization.can_manage_platform(),
        },
    }})))
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionRole {
    User,
    Admin,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SessionRoleInput {
    role: SessionRole,
}

pub async fn update_session_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<SessionRoleInput>,
) -> Result<Json<Value>, ApiError> {
    update_admin_mode(
        State(state),
        headers,
        Json(AdminModeInput {
            enabled: matches!(input.role, SessionRole::Admin),
        }),
    )
    .await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdminModeInput {
    enabled: bool,
}

pub async fn update_admin_mode(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<AdminModeInput>,
) -> Result<Json<Value>, ApiError> {
    let authorization = super::authorize(&state, &headers, AdminPermission::Read).await?;
    let AdminAuthorization::Operator(principal) = authorization else {
        return Err(ApiError::forbidden());
    };
    if input.enabled
        && !state
            .store
            .browser_admin_mode_available(principal)
            .await
            .map_err(ApiError::from_store)?
    {
        return Err(ApiError::forbidden());
    }
    state
        .store
        .set_browser_admin_mode(principal, input.enabled)
        .await
        .map_err(ApiError::from_store)?;
    current_session(State(state), headers).await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdministrationInput {
    enabled: bool,
    expected_enabled: bool,
}

pub async fn member_administration(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(member): Path<uuid::Uuid>,
) -> Result<Json<Value>, ApiError> {
    if !super::authorize(&state, &headers, AdminPermission::Read)
        .await?
        .is_installation()
    {
        return Err(ApiError::forbidden());
    }
    let enabled = state
        .store
        .member_platform_administration(member)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":{"enabled":enabled}})))
}

pub async fn set_member_administration(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(member): Path<uuid::Uuid>,
    Json(input): Json<AdministrationInput>,
) -> Result<Json<Value>, ApiError> {
    if !super::authorize(&state, &headers, AdminPermission::Read)
        .await?
        .is_installation()
    {
        return Err(ApiError::forbidden());
    }
    state
        .store
        .set_member_platform_administration(member, input.enabled, input.expected_enabled)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"enabled":input.enabled}})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SessionOrganizationInput {
    #[serde(alias = "organization_id")]
    organization: String,
}

/// ```openapi
/// {
///   "path": "/api/v1/session/organization",
///   "method": "put",
///   "operation": {
///     "operationId": "switchSessionOrganization",
///     "summary": "Switch the active organization for the current member session",
///     "description": "Requires an authenticated member session. Accepts an organization UUID, durable slug, or retained slug alias already granted to this account identity. Updates the active operator membership bound to the session and returns the refreshed session identity.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "organization_id"
///             ],
///             "properties": {
///               "organization": {
///                 "type": "string",
///                 "description": "Organization UUID or slug."
///               },
///               "organization_id": {
///                 "type": "string",
///                 "description": "Organization UUID or slug."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Updated session identity scoped to the selected organization."
///       },
///       "400": {
///         "description": "Invalid organization reference or JSON body."
///       },
///       "401": {
///         "description": "Invalid, expired or revoked member session."
///       },
///       "403": {
///         "description": "Installation credentials cannot switch member organization scope."
///       },
///       "404": {
///         "description": "No active membership in the requested organization."
///       }
///     }
///   }
/// }
/// ```
pub async fn switch_session_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<SessionOrganizationInput>,
) -> Result<Json<Value>, ApiError> {
    let authorization = super::authorize(&state, &headers, AdminPermission::Read).await?;
    let AdminAuthorization::Operator(principal) = authorization else {
        return Err(ApiError::forbidden());
    };
    match state
        .store
        .switch_session_organization(principal, &input.organization)
        .await
    {
        Ok(_) => current_session(State(state), headers).await,
        Err(niu_storage::StoreError::Unauthorized) => {
            super::authorize(&state, &headers, AdminPermission::Read).await?;
            Err(ApiError::not_found())
        }
        Err(error) => Err(ApiError::from_store(error)),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SessionMembershipClaimInput {
    token: String,
}

/// ```openapi
/// {
///   "path": "/api/v1/session/memberships",
///   "method": "post",
///   "operation": {
///     "operationId": "claimSessionMembership",
///     "summary": "Link an issued operator access token to the current member account",
///     "description": "Requires an authenticated member session and a valid, unrevoked operator session token. Links the target operator membership to the caller's account identity with explicit token proof, switches the current session to that membership, and returns the updated session identity. Rejects tokens already linked to a different account identity with 409.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "token"
///             ],
///             "properties": {
///               "token": {
///                 "type": "string",
///                 "minLength": 1,
///                 "description": "Issued operator access token."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Membership linked and active session switched."
///       },
///       "400": {
///         "description": "Invalid or expired invite token."
///       },
///       "401": {
///         "description": "Invalid, expired or revoked member session."
///       },
///       "403": {
///         "description": "Installation credentials cannot claim member memberships."
///       },
///       "409": {
///         "description": "The operator membership is already linked to a different account identity."
///       }
///     }
///   }
/// }
/// ```
pub async fn claim_session_membership(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<SessionMembershipClaimInput>,
) -> Result<Json<Value>, ApiError> {
    let authorization = super::authorize(&state, &headers, AdminPermission::Read).await?;
    let AdminAuthorization::Operator(principal) = authorization else {
        return Err(ApiError::forbidden());
    };
    state
        .store
        .claim_organization_membership(principal, &input.token)
        .await
        .map_err(ApiError::from_store)?;
    current_session(State(state), headers).await
}
