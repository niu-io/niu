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
        let workspace = parameters[0].1.parse::<Uuid>().map_err(|_| {
            ApiError::invalid_request("Invalid workspace identifier").into_response()
        })?;
        let (_, scope) = crate::admin::workspace_aliases::authorize_workspace(
            state,
            &parts.headers,
            workspace,
            AdminPermission::Read,
        )
        .await
        .map_err(IntoResponse::into_response)?;
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
