//! Platform-only qualification controls; never activates upstream dispatch.
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{AdminPermission, AssetOperationQualification, OperatorAuditActor, TenantScope};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

pub(super) async fn platform_actor(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<OperatorAuditActor, ApiError> {
    let auth = state
        .authorize_admin_headers(headers, AdminPermission::ManageOperators)
        .await?;
    if !auth.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    Ok(match auth {
        AdminAuthorization::Installation => OperatorAuditActor::Installation,
        AdminAuthorization::Operator(operator) => OperatorAuditActor::Operator(operator.id),
    })
}
#[derive(Clone, Copy, Default, Deserialize, serde::Serialize)]
enum QualifiedOperation {
    #[default]
    CreateAssetGroup,
    GetAssetGroup,
    ListAssets,
    GetAsset,
    UpdateAssetGroup,
    DeleteAssetGroup,
    CreateAsset,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QualificationInput {
    #[serde(default)]
    operation: QualifiedOperation,
    organization_id: Uuid,
    project_id: Uuid,
    vendor_revision: i64,
    credential_revision: i64,
    rights_sha256: String,
    protocol_sha256: String,
    data_handling_sha256: String,
    free_operation_sha256: String,
    valid_for_seconds: i32,
}
fn evidence_hash(value: &str) -> Result<[u8; 32], ApiError> {
    if value.len() != 64 || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(ApiError::invalid_request(
            "Evidence references must be SHA-256 hex digests",
        ));
    }
    let mut hash = [0; 32];
    for (i, byte) in hash.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[i * 2..i * 2 + 2], 16)
            .map_err(|_| ApiError::invalid_request("Invalid evidence reference"))?;
    }
    if hash == [0; 32] {
        return Err(ApiError::invalid_request(
            "Evidence references cannot be empty",
        ));
    }
    Ok(hash)
}
pub async fn create(
    State(state): State<AppState>,
    Path(vendor): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<QualificationInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let actor = platform_actor(&state, &headers).await?;
    if input.vendor_revision < 1
        || input.credential_revision < 1
        || !(1..=7_776_000).contains(&input.valid_for_seconds)
    {
        return Err(ApiError::invalid_request(
            "Positive account revisions and validity from 1 second to 90 days are required",
        ));
    }
    let qualification = AssetOperationQualification {
        vendor_id: vendor,
        vendor_revision: input.vendor_revision,
        credential_revision: input.credential_revision,
        rights_sha256: evidence_hash(&input.rights_sha256)?,
        protocol_sha256: evidence_hash(&input.protocol_sha256)?,
        data_handling_sha256: evidence_hash(&input.data_handling_sha256)?,
        free_operation_sha256: evidence_hash(&input.free_operation_sha256)?,
        valid_for_seconds: input.valid_for_seconds,
    };
    // Check workspace ownership before insertion, including mismatched org/workspace IDs.
    if !state
        .store
        .projects(input.organization_id)
        .await
        .map_err(ApiError::from_store)?
        .iter()
        .any(|p| p.id == input.project_id)
    {
        return Err(ApiError::not_found());
    }
    let scope = TenantScope {
        organization_id: input.organization_id,
        project_id: input.project_id,
    };
    let id = match input.operation {
        QualifiedOperation::CreateAssetGroup => {
            state
                .store
                .qualify_asset_group_creation(scope, qualification, actor)
                .await
        }
        QualifiedOperation::GetAssetGroup => {
            state
                .store
                .qualify_asset_group_read(scope, qualification, actor)
                .await
        }
        QualifiedOperation::ListAssets => {
            state
                .store
                .qualify_asset_listing(scope, qualification, actor)
                .await
        }
        QualifiedOperation::GetAsset => {
            state
                .store
                .qualify_asset_lookup(scope, qualification, actor)
                .await
        }
        QualifiedOperation::CreateAsset => {
            state
                .store
                .qualify_asset_creation(scope, qualification, actor)
                .await
        }
        QualifiedOperation::DeleteAssetGroup => {
            state
                .store
                .qualify_asset_group_deletion(scope, qualification, actor)
                .await
        }
        QualifiedOperation::UpdateAssetGroup => {
            state
                .store
                .qualify_asset_group_update(scope, qualification, actor)
                .await
        }
    }
    .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"data":{"id":id,"operation":input.operation,"dispatch_available":false}})),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ListQuery {
    after: Option<Uuid>,
    limit: Option<i64>,
}
pub async fn list(
    State(state): State<AppState>,
    Path(vendor): Path<Uuid>,
    Query(query): Query<ListQuery>,
    headers: HeaderMap,
) -> Result<impl axum::response::IntoResponse, ApiError> {
    platform_actor(&state, &headers).await?;
    let limit = query.limit.unwrap_or(30);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request("limit must be between 1 and 100"));
    }
    let mut data = state
        .store
        .asset_operation_authorizations(vendor, query.after, limit + 1)
        .await
        .map_err(ApiError::from_store)?;
    let more = data.len() > limit as usize;
    data.truncate(limit as usize);
    let next = more
        .then(|| data.last().and_then(|v| v.get("id")).cloned())
        .flatten();
    Ok((
        [(axum::http::header::CACHE_CONTROL, "no-store")],
        Json(json!({"data":data,"next_cursor":next})),
    ))
}
pub async fn revoke(
    State(state): State<AppState>,
    Path((vendor, authorization)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let actor = platform_actor(&state, &headers).await?;
    state
        .store
        .revoke_asset_operation_authorization_for_vendor(vendor, authorization, actor)
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}
