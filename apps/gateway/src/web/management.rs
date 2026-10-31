//! Shared delegated workspace management boundary.
use crate::{error::ApiError, state::AppState};
use axum::http::HeaderMap;
use niu_storage::Principal;

pub(super) async fn authorize(
    state: &AppState,
    headers: &HeaderMap,
    capability: &str,
) -> Result<Principal, ApiError> {
    let principal = state
        .authorize_api_headers_with_permission(headers, niu_storage::AdminPermission::Read)
        .await?;
    if !state
        .store
        .agent_key_has_capability(principal.scope(), principal.key_id(), capability)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::forbidden());
    }
    Ok(principal)
}
