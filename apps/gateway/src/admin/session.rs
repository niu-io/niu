use axum::{Json, extract::State, http::HeaderMap};
use niu_storage::AdminPermission;
use serde_json::{Value, json};

use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};

/// Reauthenticate each request so the console never treats cached role hints as authority.
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
    Ok(Json(json!({"data": {
        "kind": kind,
        "operator": operator,
        "permissions": {
            "read": true,
            "write": role.is_none_or(|role| role.permits(AdminPermission::Write)),
            "manage_operators": role.is_none_or(|role| role.permits(AdminPermission::ManageOperators)),
        },
    }})))
}
