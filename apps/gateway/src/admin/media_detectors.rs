//! Workspace-safe configured media inspection discovery; never an approval.
use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Path, State, TenantScope, Uuid, Value,
    authorize, json,
};

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/guardrails/media-detectors",
///   "method": "get",
///   "operation": {
///     "operationId": "listWorkspaceMediaDetectors",
///     "summary": "List workspace-authorized media inspection configurations",
///     "description": "Returns only deployment-authorized audio/video configuration metadata for the requested workspace. Declared conditions and a fingerprint do not establish successful inspection or consent; policy activation and media task references remain unavailable. No service endpoint, credential, environment variable or foreign workspace configuration is exposed. This operation performs no external inspection.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Declared workspace media processing conditions",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "detector",
///                       "detector_revision",
///                       "configuration_fingerprint",
///                       "recipient",
///                       "region",
///                       "retention",
///                       "schema_version",
///                       "kind",
///                       "content_sent",
///                       "processing_guarantees",
///                       "timeout_ms",
///                       "maximum_encoded_bytes",
///                       "concurrency",
///                       "declared_unmetered",
///                       "policy_activation",
///                       "requires_supported_presentation_facts"
///                     ],
///                     "properties": {
///                       "detector": {
///                         "type": "string"
///                       },
///                       "detector_revision": {
///                         "type": "string"
///                       },
///                       "configuration_fingerprint": {
///                         "type": "string"
///                       },
///                       "recipient": {
///                         "type": "string"
///                       },
///                       "region": {
///                         "type": "string"
///                       },
///                       "retention": {
///                         "type": "string"
///                       },
///                       "schema_version": {
///                         "type": "integer",
///                         "enum": [
///                           3
///                         ]
///                       },
///                       "kind": {
///                         "type": "string",
///                         "enum": [
///                           "audio",
///                           "video"
///                         ]
///                       },
///                       "content_sent": {
///                         "type": "string",
///                         "enum": [
///                           "exact_encoded_media_with_embedded_tracks"
///                         ]
///                       },
///                       "processing_guarantees": {
///                         "type": "string",
///                         "enum": [
///                           "declared_unverified"
///                         ]
///                       },
///                       "timeout_ms": {
///                         "type": "integer",
///                         "minimum": 1,
///                         "maximum": 30000
///                       },
///                       "maximum_encoded_bytes": {
///                         "type": "integer",
///                         "minimum": 1,
///                         "maximum": 8388608
///                       },
///                       "concurrency": {
///                         "type": "integer",
///                         "minimum": 1,
///                         "maximum": 4
///                       },
///                       "declared_unmetered": {
///                         "type": "boolean"
///                       },
///                       "policy_activation": {
///                         "type": "boolean",
///                         "enum": [
///                           false
///                         ]
///                       },
///                       "requires_supported_presentation_facts": {
///                         "type": "boolean",
///                         "enum": [
///                           true
///                         ]
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Invalid management credential; inference keys cannot access this operation"
///       },
///       "403": {
///         "description": "Insufficient workspace permission"
///       },
///       "404": {
///         "description": "Workspace not found"
///       },
///       "503": {
///         "description": "Authorization or storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn list(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let authorization = authorize(&state, &headers, AdminPermission::Read).await?;
    if !authorization.permits_project(scope) {
        return Err(ApiError::forbidden());
    }
    if state
        .store
        .workspaces(Some(organization_id), Some(project_id))
        .await
        .map_err(ApiError::from_store)?
        .is_empty()
    {
        return Err(ApiError::not_found());
    }
    let mut data: Vec<Value> = state
        .media_detectors
        .iter()
        .filter(|(_, runtime)| runtime.authorized_workspace(&project_id.to_string()))
        .map(|(name, runtime)| {
            let mut description = runtime.description();
            description["detector"] = json!(name);
            description
        })
        .collect();
    data.sort_by(|a, b| a["detector"].as_str().cmp(&b["detector"].as_str()));
    Ok(([("cache-control", "no-store")], Json(json!({"data":data}))))
}
