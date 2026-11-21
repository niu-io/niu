//! Resolve workspace-only routes without trusting a caller-supplied organization.
use axum::{
    extract::{FromRequestParts, MatchedPath, Path, Query},
    http::{Method, request::Parts},
    response::{IntoResponse, Response},
};
use niu_storage::AdminPermission;
use serde::de::DeserializeOwned;
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

/// Legacy routes retain Axum's path parsing. Workspace routes resolve the
/// organization after authentication, then reuse the original handler and its
/// permission, personal-owner, revision and idempotency checks.
pub(crate) struct WorkspacePath<T>(pub T);

impl<T: DeserializeOwned + Send> FromRequestParts<AppState> for WorkspacePath<T> {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let Path(parameters) = Path::<Vec<(String, String)>>::from_request_parts(parts, state)
            .await
            .map_err(IntoResponse::into_response)?;
        if parameters.first().map(|(name, _)| name.as_str()) != Some("workspace") {
            return Path::<T>::from_request_parts(parts, state)
                .await
                .map(|Path(value)| Self(value))
                .map_err(IntoResponse::into_response);
        }
        let raw_workspace = parameters[0].1.trim();
        let scope = if let Ok(workspace) = raw_workspace.parse::<Uuid>() {
            let (_, scope) = crate::admin::workspace_aliases::authorize_workspace(
                state,
                &parts.headers,
                workspace,
                AdminPermission::Read,
            )
            .await
            .map_err(IntoResponse::into_response)?;
            scope
        } else {
            let authorization = state
                .authorize_admin_headers(&parts.headers, AdminPermission::Read)
                .await
                .map_err(IntoResponse::into_response)?;
            if raw_workspace.is_empty()
                || raw_workspace.chars().count() > 81
                || !raw_workspace
                    .chars()
                    .all(|c| (c.is_alphanumeric() && !c.is_uppercase()) || c == '-')
            {
                return Err(
                    ApiError::invalid_request("Invalid workspace identifier").into_response()
                );
            }
            let route = match authorization {
                crate::state::AdminAuthorization::Installation => state
                    .store
                    .workspace_route(raw_workspace, None, None)
                    .await
                    .map_err(|e| ApiError::from_store(e).into_response())?,
                crate::state::AdminAuthorization::Operator(operator) => state
                    .store
                    .workspace_route_for_member(operator, raw_workspace)
                    .await
                    .map_err(|e| ApiError::from_store(e).into_response())?,
            }
            .ok_or_else(|| ApiError::not_found().into_response())?;
            niu_storage::TenantScope {
                organization_id: route.organization_id,
                project_id: route.id,
            }
        };
        if parts.extensions.get::<MatchedPath>().is_some_and(|path| {
            path.as_str()
                .starts_with("/api/v1/workspaces/{workspace}/sessions")
        }) {
            #[derive(serde::Deserialize)]
            struct Category {
                category: String,
            }
            let Query(category) = Query::<Category>::from_request_parts(parts, state)
                .await
                .map_err(|_| {
                    ApiError::invalid_request("An explicit session category is required")
                        .into_response()
                })?;
            if !matches!(category.category.as_str(), "video" | "chat")
                || (parts.method != Method::GET
                    && parts.method != Method::HEAD
                    && category.category != "video")
            {
                return Err(ApiError::invalid_request(
                    "Session reads require category=video or chat; mutations require category=video",
                )
                .into_response());
            }
        }
        let values: Vec<String> = [
            scope.organization_id.to_string(),
            scope.project_id.to_string(),
        ]
        .into_iter()
        .chain(parameters.into_iter().skip(1).map(|(_, value)| value))
        .collect();
        serde_json::from_value(serde_json::json!(values))
            .map(Self)
            .map_err(|_| ApiError::invalid_request("Invalid resource identifier").into_response())
    }
}
