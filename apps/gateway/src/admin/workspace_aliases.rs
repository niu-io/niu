//! Workspace-ID compatibility aliases; legacy organization/workspace routes remain supported.
use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Name, Path, State, StatusCode, Uuid,
    Value,
};
use crate::state::AdminAuthorization;

/// Authenticate before resolving a workspace and restrict the lookup to member scope.
async fn organization_for_workspace(
    state: &AppState,
    headers: &HeaderMap,
    workspace: Uuid,
    permission: AdminPermission,
) -> Result<Uuid, ApiError> {
    let authorization = super::authorize(state, headers, permission).await?;
    let organization = match authorization {
        AdminAuthorization::Installation => None,
        AdminAuthorization::Operator(member) => {
            if member.scope.project_id.is_some_and(|id| id != workspace) {
                return Err(ApiError::not_found());
            }
            // Preserve the legacy deletion refusal even when the member's scoped
            // workspace no longer exists. No workspace lookup precedes this check.
            if permission == AdminPermission::ManageOperators && member.scope.project_id.is_some() {
                return Err(ApiError::forbidden());
            }
            Some(member.scope.organization_id)
        }
    };
    state
        .store
        .workspace_page(organization, Some(workspace), None, 1)
        .await
        .map_err(ApiError::from_store)?
        .into_iter()
        .next()
        .map(|workspace| workspace.organization_id)
        .ok_or_else(ApiError::not_found)
}

/// ```openapi
/// {
///   "path": "/admin/v1/workspaces/{workspace}",
///   "method": "patch",
///   "operation": {
///     "operationId": "renameWorkspaceById",
///     "summary": "Rename a workspace by identity",
///     "description": "Compatibility alias for the existing organization/workspace endpoint, which remains supported. Authorization is checked before resolving the stored workspace organization; member scope filters the lookup and foreign or missing workspaces return 404. The existing handler rechecks authorization before mutation. Requires scoped workspace write access. Trims the saved name; no optimistic revision is accepted. Response matches the legacy rename endpoint. Unknown body properties retain legacy parser behavior.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "400": {
///         "description": "Invalid identifier or name."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Required management permission is missing."
///       },
///       "404": {
///         "description": "Workspace missing or outside authorized scope."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       },
///       "200": {
///         "description": "Saved workspace identity and trimmed name.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "id",
///                 "name"
///               ],
///               "properties": {
///                 "id": {
///                   "type": "string",
///                   "format": "uuid"
///                 },
///                 "name": {
///                   "type": "string"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "422": {
///         "description": "Invalid JSON body shape."
///       },
///       "415": {
///         "description": "JSON content type required."
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "required": [
///               "name"
///             ],
///             "properties": {
///               "name": {
///                 "type": "string",
///                 "description": "Must contain non-whitespace text and be at most 200 UTF-8 bytes before trimming."
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn rename(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(workspace): Path<Uuid>,
    input: Json<Name>,
) -> Result<Json<Value>, ApiError> {
    let organization =
        organization_for_workspace(&state, &headers, workspace, AdminPermission::Write).await?;
    super::rename_workspace(
        State(state),
        headers,
        Path((organization, workspace)),
        input,
    )
    .await
}

/// ```openapi
/// {
///   "path": "/admin/v1/workspaces/{workspace}",
///   "method": "delete",
///   "operation": {
///     "operationId": "deleteWorkspaceById",
///     "summary": "Delete an empty workspace by identity",
///     "description": "Compatibility alias for the existing organization/workspace endpoint, which remains supported. Authorization is checked before resolving the stored workspace organization; member scope filters the lookup and foreign or missing workspaces return 404. The existing handler rechecks authorization before mutation. Requires installation authority or company-level owner/member-management permission. Workspace-scoped owners are refused with 403 before lookup for their own scope; another workspace remains concealed with 404. Dependent business records prevent deletion with 409; no business history cascade is requested. Response is the same empty 204 as the legacy endpoint.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "400": {
///         "description": "Invalid identifier."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Required management permission is missing."
///       },
///       "404": {
///         "description": "Workspace missing or outside authorized scope."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       },
///       "204": {
///         "description": "Workspace deleted; empty response body."
///       },
///       "409": {
///         "description": "Workspace retains dependent business records."
///       }
///     }
///   }
/// }
/// ```
pub async fn delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(workspace): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let organization = organization_for_workspace(
        &state,
        &headers,
        workspace,
        AdminPermission::ManageOperators,
    )
    .await?;
    super::delete_workspace(State(state), headers, Path((organization, workspace))).await
}
