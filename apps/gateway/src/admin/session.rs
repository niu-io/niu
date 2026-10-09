use axum::{Json, extract::State, http::HeaderMap};
use niu_storage::AdminPermission;
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
    let provider_memberships = match authorization {
        AdminAuthorization::Installation => vec![],
        AdminAuthorization::Operator(principal) => state
            .store
            .provider_memberships(principal.id)
            .await
            .map_err(ApiError::from_store)?,
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
    Ok(Json(json!({"data": {
        "kind": kind,
        "provider_memberships": provider_memberships,
        "profile": profile,
        "operator": operator,
        "permissions": {
            "read": true,
            "write": role.is_none_or(|role| role.permits(AdminPermission::Write)),
            "manage_operators": role.is_none_or(|role| role.permits(AdminPermission::ManageOperators)),
            "platform_admin": authorization.can_manage_platform(),
        },
    }})))
}
