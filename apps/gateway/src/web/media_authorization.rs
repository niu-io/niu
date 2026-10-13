//! Reuse workspace key authorization for dashboard media operations.
use crate::{error::ApiError, state::AppState};
use axum::{
    extract::{FromRequestParts, Path},
    http::{Method, request::Parts},
};
use niu_storage::{AdminPermission, Principal, TenantScope};
use std::collections::HashMap;
use uuid::Uuid;

pub(super) struct MediaPrincipal(pub Principal);
pub(super) struct MediaId(pub Uuid);
impl FromRequestParts<AppState> for MediaPrincipal {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let Path(params) = Path::<HashMap<String, String>>::from_request_parts(parts, state)
            .await
            .map_err(|_| ApiError::invalid_request("Invalid media path"))?;
        let principal = if params.contains_key("organization") {
            let id = |name: &str| {
                params
                    .get(name)
                    .and_then(|v| Uuid::parse_str(v).ok())
                    .ok_or_else(|| ApiError::invalid_request("Invalid workspace key path"))
            };
            state
                .authorize_dashboard_key(
                    &parts.headers,
                    TenantScope {
                        organization_id: id("organization")?,
                        project_id: id("project")?,
                    },
                    id("key")?,
                    if parts.method == Method::GET {
                        AdminPermission::Read
                    } else {
                        AdminPermission::Write
                    },
                )
                .await?
        } else {
            state.authorize_api_headers(&parts.headers).await?
        };
        Ok(Self(principal))
    }
}
impl FromRequestParts<AppState> for MediaId {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let Path(params) = Path::<HashMap<String, String>>::from_request_parts(parts, state)
            .await
            .map_err(|_| ApiError::invalid_request("Invalid media path"))?;
        params
            .get("id")
            .and_then(|v| Uuid::parse_str(v).ok())
            .map(Self)
            .ok_or_else(|| ApiError::invalid_request("Invalid media reference"))
    }
}
