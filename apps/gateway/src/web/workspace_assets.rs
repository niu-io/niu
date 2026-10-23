//! Durable member-owned workspace material, separate from Provider assets,
//! content-inspection approval and inference authorization.
use crate::web::workspace_path::WorkspacePath as Path;
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    body::{Body, to_bytes},
    extract::{
        Query, Request, State,
        rejection::{JsonRejection, QueryRejection},
    },
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use niu_storage::{
    AdminPermission, AssetLibraryCreate, AssetLibraryKind, AssetLibraryLimits, TenantScope,
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::LazyLock;
use tokio::sync::Semaphore;
use uuid::Uuid;

static UPLOADS: LazyLock<Semaphore> = LazyLock::new(|| Semaphore::new(4));
static DOWNLOADS: LazyLock<Semaphore> = LazyLock::new(|| Semaphore::new(4));

async fn authorize(
    state: &AppState,
    headers: &HeaderMap,
    scope: TenantScope,
    permission: AdminPermission,
) -> Result<String, ApiError> {
    let principal = state.authorize_admin_headers(headers, permission).await?;
    if !principal.permits_project(scope) {
        return Err(ApiError::forbidden());
    }
    if state
        .store
        .workspaces(Some(scope.organization_id), Some(scope.project_id))
        .await
        .map_err(ApiError::from_store)?
        .is_empty()
    {
        return Err(ApiError::not_found());
    }
    Ok(match principal {
        AdminAuthorization::Installation => "installation".to_owned(),
        AdminAuthorization::Operator(operator) => format!("operator:{}", operator.id),
    })
}
fn scope(organization_id: Uuid, project_id: Uuid) -> TenantScope {
    TenantScope {
        organization_id,
        project_id,
    }
}
fn name(value: &str) -> Result<&str, ApiError> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 200 || trimmed.chars().any(char::is_control) {
        return Err(ApiError::invalid_request(
            "Use a nonblank asset name of at most 200 UTF-8 bytes without control characters",
        ));
    }
    Ok(trimmed)
}
fn revision(value: &str) -> Result<i64, ApiError> {
    let parsed = value
        .parse::<i64>()
        .map_err(|_| ApiError::invalid_request("Invalid asset revision"))?;
    if parsed <= 0 || parsed.to_string() != value {
        return Err(ApiError::invalid_request("Invalid asset revision"));
    }
    Ok(parsed)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ListQuery {
    kind: Option<AssetLibraryKind>,
    after: Option<Uuid>,
    limit: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/assets",
///   "method": "get",
///   "operation": {
///     "operationId": "listWorkspaceAssets",
///     "summary": "List saved workspace materials",
///     "description": "Member Read permission required. Scope is the selected workspace, not the creating actor. Lists active objects with metadata only, ordered by creation time then identity. limit defaults to 50 and must be 1–100. after must be an active asset in the same workspace and kind filter or conflicts. Follow next_cursor; separate pages are not a frozen snapshot. No ciphertext, actor identifier, Provider URI, procurement or dispatch approval is returned.",
///     "x-niu-implementation": "implemented",
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
///       },
///       {
///         "name": "kind",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "enum": [
///             "image",
///             "video",
///             "audio"
///           ]
///         }
///       },
///       {
///         "name": "after",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 50
///         }
///       }
///     ],
///     "responses": {
///       "400": {
///         "description": "Malformed query/body, unsupported type, invalid media bytes, name, page size or revision."
///       },
///       "401": {
///         "description": "Missing/invalid member administrator authentication; inference keys do not manage materials."
///       },
///       "403": {
///         "description": "Authenticated principal lacks workspace scope or required Read/Write permission."
///       },
///       "404": {
///         "description": "Workspace or scoped active asset not found."
///       },
///       "409": {
///         "description": "Stale revision, unavailable cursor or serialized workspace quota exceeded."
///       },
///       "503": {
///         "description": "Bounded processing capacity, encryption or storage unavailable; no successful write is confirmed."
///       },
///       "200": {
///         "description": "Scoped asset metadata; no private ciphertext or actor identifier.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_cursor"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "id",
///                       "name",
///                       "media_kind",
///                       "content_type",
///                       "content_sha256",
///                       "byte_length",
///                       "revision",
///                       "created_at_ms",
///                       "updated_at_ms"
///                     ],
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "format": "uuid",
///                         "description": "Internal routing reference; never display as a user label."
///                       },
///                       "name": {
///                         "type": "string",
///                         "minLength": 1,
///                         "maxLength": 200,
///                         "description": "Trimmed display name, at most 200 UTF-8 bytes, without control characters."
///                       },
///                       "media_kind": {
///                         "type": "string",
///                         "enum": [
///                           "image",
///                           "video",
///                           "audio"
///                         ]
///                       },
///                       "content_type": {
///                         "type": "string",
///                         "enum": [
///                           "image/png",
///                           "image/jpeg",
///                           "image/webp",
///                           "video/mp4",
///                           "video/webm",
///                           "audio/wav",
///                           "audio/mpeg",
///                           "audio/ogg"
///                         ]
///                       },
///                       "content_sha256": {
///                         "type": "string",
///                         "pattern": "^[0-9a-f]{64}$",
///                         "description": "SHA-256 of the immutable original bytes."
///                       },
///                       "byte_length": {
///                         "type": "integer",
///                         "minimum": 1,
///                         "maximum": 8388608
///                       },
///                       "revision": {
///                         "type": "string",
///                         "pattern": "^[1-9][0-9]*$",
///                         "description": "Canonical positive signed-64-bit integer; use for rename/delete concurrency checks."
///                       },
///                       "created_at_ms": {
///                         "type": "integer",
///                         "format": "int64"
///                       },
///                       "updated_at_ms": {
///                         "type": "integer",
///                         "format": "int64"
///                       },
///                       "source": {
///                         "type": [
///                           "object",
///                           "null"
///                         ],
///                         "description": "Authorized original generation context. Null when absent or not visible to this actor; sharing a retained copy does not grant source access.",
///                         "additionalProperties": false,
///                         "required": [
///                           "reference",
///                           "kind",
///                           "output",
///                           "model",
///                           "created_at"
///                         ],
///                         "properties": {
///                           "reference": {
///                             "type": "string",
///                             "pattern": "^run-[1-9][0-9]{0,18}$"
///                           },
///                           "kind": {
///                             "const": "video"
///                           },
///                           "output": {
///                             "enum": [
///                               "video",
///                               "last_frame"
///                             ]
///                           },
///                           "model": {
///                             "type": "string"
///                           },
///                           "created_at": {
///                             "type": "string",
///                             "format": "date-time"
///                           }
///                         }
///                       }
///                     }
///                   }
///                 },
///                 "next_cursor": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "uuid"
///                 }
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(crate) async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, project)): Path<(Uuid, Uuid)>,
    input: Result<Query<ListQuery>, QueryRejection>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = scope(organization, project);
    let actor = authorize(&state, &headers, scope, AdminPermission::Read).await?;
    let Query(query) =
        input.map_err(|_| ApiError::invalid_request("Invalid asset list filters"))?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request(
            "Asset page limit must be between 1 and 100",
        ));
    }
    let page = state
        .store
        .list_workspace_assets(scope, query.kind, query.after, limit)
        .await
        .map_err(ApiError::from_store)?;
    let sources = state
        .store
        .workspace_asset_sources(
            scope,
            &actor,
            &page.data.iter().map(|asset| asset.id).collect::<Vec<_>>(),
        )
        .await
        .map_err(ApiError::from_store)?;
    let data = page
        .data
        .into_iter()
        .map(|asset| {
            let source = sources.get(&asset.id).cloned().unwrap_or(Value::Null);
            let mut value = json!(asset);
            value["source"] = source;
            value
        })
        .collect::<Vec<_>>();
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":data,"next_cursor":page.next_cursor})),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct UploadQuery {
    name: String,
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/assets",
///   "method": "post",
///   "operation": {
///     "operationId": "uploadWorkspaceAsset",
///     "summary": "Save a workspace material",
///     "description": "Member Write permission required. Raw binary body with exact supported Content-Type and required name query; no multipart or base64 envelope. Authentication and a bounded upload slot precede body collection. Original bytes are immutable, encrypted with workspace/asset identity binding, limited to 8 MiB each and 256 MiB/256 active objects per workspace. Images undergo bounded pixel decoding; audio/video undergo local frame/container structural validation. This is not content-inspection approval, Provider upload, licensing evidence or inference authorization. Repeated uploads create distinct objects; uncertain clients should reconcile the library before repeating.",
///     "x-niu-implementation": "implemented",
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
///       },
///       {
///         "name": "name",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         },
///         "description": "Trimmed nonblank name; at most 200 UTF-8 bytes after trimming; no control characters."
///       }
///     ],
///     "responses": {
///       "400": {
///         "description": "Malformed query/body, unsupported type, invalid media bytes, name, page size or revision."
///       },
///       "401": {
///         "description": "Missing/invalid member administrator authentication; inference keys do not manage materials."
///       },
///       "403": {
///         "description": "Authenticated principal lacks workspace scope or required Read/Write permission."
///       },
///       "404": {
///         "description": "Workspace or scoped active asset not found."
///       },
///       "409": {
///         "description": "Stale revision, unavailable cursor or serialized workspace quota exceeded."
///       },
///       "503": {
///         "description": "Bounded processing capacity, encryption or storage unavailable; no successful write is confirmed."
///       },
///       "201": {
///         "description": "Scoped asset metadata; no private ciphertext or actor identifier.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "id",
///                     "name",
///                     "media_kind",
///                     "content_type",
///                     "content_sha256",
///                     "byte_length",
///                     "revision",
///                     "created_at_ms",
///                     "updated_at_ms"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid",
///                       "description": "Internal routing reference; never display as a user label."
///                     },
///                     "name": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 200,
///                       "description": "Trimmed display name, at most 200 UTF-8 bytes, without control characters."
///                     },
///                     "media_kind": {
///                       "type": "string",
///                       "enum": [
///                         "image",
///                         "video",
///                         "audio"
///                       ]
///                     },
///                     "content_type": {
///                       "type": "string",
///                       "enum": [
///                         "image/png",
///                         "image/jpeg",
///                         "image/webp",
///                         "video/mp4",
///                         "video/webm",
///                         "audio/wav",
///                         "audio/mpeg",
///                         "audio/ogg"
///                       ]
///                     },
///                     "content_sha256": {
///                       "type": "string",
///                       "pattern": "^[0-9a-f]{64}$",
///                       "description": "SHA-256 of the immutable original bytes."
///                     },
///                     "byte_length": {
///                       "type": "integer",
///                       "minimum": 1,
///                       "maximum": 8388608
///                     },
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$",
///                       "description": "Canonical positive signed-64-bit integer; use for rename/delete concurrency checks."
///                     },
///                     "created_at_ms": {
///                       "type": "integer",
///                       "format": "int64"
///                     },
///                     "updated_at_ms": {
///                       "type": "integer",
///                       "format": "int64"
///                     },
///                     "source": {
///                       "type": [
///                         "object",
///                         "null"
///                       ],
///                       "description": "Authorized original generation context. Null when absent or not visible to this actor; sharing a retained copy does not grant source access.",
///                       "additionalProperties": false,
///                       "required": [
///                         "reference",
///                         "kind",
///                         "output",
///                         "model",
///                         "created_at"
///                       ],
///                       "properties": {
///                         "reference": {
///                           "type": "string",
///                           "pattern": "^run-[1-9][0-9]{0,18}$"
///                         },
///                         "kind": {
///                           "const": "video"
///                         },
///                         "output": {
///                           "enum": [
///                             "video",
///                             "last_frame"
///                           ]
///                         },
///                         "model": {
///                           "type": "string"
///                         },
///                         "created_at": {
///                           "type": "string",
///                           "format": "date-time"
///                         }
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "413": {
///         "description": "Raw body exceeds 8 MiB."
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "image/png": {
///           "schema": {
///             "type": "string",
///             "format": "binary",
///             "minLength": 1,
///             "maxLength": 8388608
///           }
///         },
///         "image/jpeg": {
///           "schema": {
///             "type": "string",
///             "format": "binary",
///             "minLength": 1,
///             "maxLength": 8388608
///           }
///         },
///         "image/webp": {
///           "schema": {
///             "type": "string",
///             "format": "binary",
///             "minLength": 1,
///             "maxLength": 8388608
///           }
///         },
///         "video/mp4": {
///           "schema": {
///             "type": "string",
///             "format": "binary",
///             "minLength": 1,
///             "maxLength": 8388608
///           }
///         },
///         "video/webm": {
///           "schema": {
///             "type": "string",
///             "format": "binary",
///             "minLength": 1,
///             "maxLength": 8388608
///           }
///         },
///         "audio/wav": {
///           "schema": {
///             "type": "string",
///             "format": "binary",
///             "minLength": 1,
///             "maxLength": 8388608
///           }
///         },
///         "audio/mpeg": {
///           "schema": {
///             "type": "string",
///             "format": "binary",
///             "minLength": 1,
///             "maxLength": 8388608
///           }
///         },
///         "audio/ogg": {
///           "schema": {
///             "type": "string",
///             "format": "binary",
///             "minLength": 1,
///             "maxLength": 8388608
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(crate) async fn upload(
    State(state): State<AppState>,
    Path((organization, project)): Path<(Uuid, Uuid)>,
    input: Result<Query<UploadQuery>, QueryRejection>,
    request: Request,
) -> Result<(StatusCode, [(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = scope(organization, project);
    let actor = authorize(&state, request.headers(), scope, AdminPermission::Write).await?;
    let Query(query) = input.map_err(|_| ApiError::invalid_request("Provide an asset name"))?;
    let name = name(&query.name)?;
    let content_type = request
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| ApiError::invalid_request("Provide a supported asset Content-Type"))?
        .to_owned();
    let kind = AssetLibraryKind::for_content_type(&content_type)
        .ok_or_else(|| ApiError::invalid_request("Unsupported workspace asset type"))?;
    if UPLOADS.available_permits() == 0 {
        return Err(ApiError::asset_management_busy());
    }
    // Authentication and capacity check precede body materialization. Never buffer an
    // unbounded multipart/base64 envelope or hold an upload slot across slow client reads.
    let bytes = to_bytes(
        request.into_body(),
        niu_media::workspace_asset_validation::MAX_ASSET_BYTES,
    )
    .await
    .map_err(|_| ApiError::request_too_large())?;
    let _permit = UPLOADS
        .try_acquire()
        .map_err(|_| ApiError::asset_management_busy())?;
    niu_media::workspace_asset_validation::validate(&content_type, &bytes)
        .await
        .map_err(|e| match e {
            niu_media::workspace_asset_validation::AssetValidationError::Capacity => {
                ApiError::asset_management_busy()
            }
            _ => ApiError::invalid_request("Invalid or unsupported asset media bytes"),
        })?;
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?;
    let id = Uuid::new_v4();
    let expected_aad = niu_storage::workspace_asset_content_aad(scope, id);
    // Encryption failure is a server availability error, not invalid input.
    // Pre-sealing also avoids holding the quota transaction during encryption.
    let seal = || {
        cipher
            .seal_bytes_with_aad(&expected_aad, &bytes)
            .map_err(|_| ApiError::unavailable())
    };
    let ciphertext = if tokio::runtime::Handle::try_current()
        .is_ok_and(|h| h.runtime_flavor() == tokio::runtime::RuntimeFlavor::MultiThread)
    {
        tokio::task::block_in_place(seal)?
    } else {
        seal()?
    };
    let asset = state
        .store
        .create_workspace_asset(
            scope,
            AssetLibraryCreate {
                id,
                name,
                kind,
                content_type: &content_type,
                bytes: &bytes,
                actor: &actor,
            },
            AssetLibraryLimits::default(),
            |aad, content| {
                if aad != expected_aad.as_slice() || content != bytes.as_ref() {
                    return Err(niu_storage::StoreError::InvalidObservation);
                }
                Ok(ciphertext)
            },
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        [("cache-control", "no-store")],
        Json(json!({"data":asset})),
    ))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/assets/{asset}",
///   "method": "get",
///   "operation": {
///     "operationId": "getWorkspaceAsset",
///     "summary": "Read workspace material metadata",
///     "description": "Member Read permission required. Returns one active scoped asset without ciphertext or internal actor information. Unknown, deleted or foreign-workspace asset is 404.",
///     "x-niu-implementation": "implemented",
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
///       },
///       {
///         "name": "asset",
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
///         "description": "Malformed query/body, unsupported type, invalid media bytes, name, page size or revision."
///       },
///       "401": {
///         "description": "Missing/invalid member administrator authentication; inference keys do not manage materials."
///       },
///       "403": {
///         "description": "Authenticated principal lacks workspace scope or required Read/Write permission."
///       },
///       "404": {
///         "description": "Workspace or scoped active asset not found."
///       },
///       "409": {
///         "description": "Stale revision, unavailable cursor or serialized workspace quota exceeded."
///       },
///       "503": {
///         "description": "Bounded processing capacity, encryption or storage unavailable; no successful write is confirmed."
///       },
///       "200": {
///         "description": "Scoped asset metadata; no private ciphertext or actor identifier.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "id",
///                     "name",
///                     "media_kind",
///                     "content_type",
///                     "content_sha256",
///                     "byte_length",
///                     "revision",
///                     "created_at_ms",
///                     "updated_at_ms"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid",
///                       "description": "Internal routing reference; never display as a user label."
///                     },
///                     "name": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 200,
///                       "description": "Trimmed display name, at most 200 UTF-8 bytes, without control characters."
///                     },
///                     "media_kind": {
///                       "type": "string",
///                       "enum": [
///                         "image",
///                         "video",
///                         "audio"
///                       ]
///                     },
///                     "content_type": {
///                       "type": "string",
///                       "enum": [
///                         "image/png",
///                         "image/jpeg",
///                         "image/webp",
///                         "video/mp4",
///                         "video/webm",
///                         "audio/wav",
///                         "audio/mpeg",
///                         "audio/ogg"
///                       ]
///                     },
///                     "content_sha256": {
///                       "type": "string",
///                       "pattern": "^[0-9a-f]{64}$",
///                       "description": "SHA-256 of the immutable original bytes."
///                     },
///                     "byte_length": {
///                       "type": "integer",
///                       "minimum": 1,
///                       "maximum": 8388608
///                     },
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$",
///                       "description": "Canonical positive signed-64-bit integer; use for rename/delete concurrency checks."
///                     },
///                     "created_at_ms": {
///                       "type": "integer",
///                       "format": "int64"
///                     },
///                     "updated_at_ms": {
///                       "type": "integer",
///                       "format": "int64"
///                     },
///                     "source": {
///                       "type": [
///                         "object",
///                         "null"
///                       ],
///                       "description": "Authorized original generation context. Null when absent or not visible to this actor; sharing a retained copy does not grant source access.",
///                       "additionalProperties": false,
///                       "required": [
///                         "reference",
///                         "kind",
///                         "output",
///                         "model",
///                         "created_at"
///                       ],
///                       "properties": {
///                         "reference": {
///                           "type": "string",
///                           "pattern": "^run-[1-9][0-9]{0,18}$"
///                         },
///                         "kind": {
///                           "const": "video"
///                         },
///                         "output": {
///                           "enum": [
///                             "video",
///                             "last_frame"
///                           ]
///                         },
///                         "model": {
///                           "type": "string"
///                         },
///                         "created_at": {
///                           "type": "string",
///                           "format": "date-time"
///                         }
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(crate) async fn get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, project, asset)): Path<(Uuid, Uuid, Uuid)>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = scope(organization, project);
    let actor = authorize(&state, &headers, scope, AdminPermission::Read).await?;
    let data = state
        .store
        .workspace_asset(scope, asset)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let source = state
        .store
        .workspace_asset_sources(scope, &actor, &[asset])
        .await
        .map_err(ApiError::from_store)?
        .remove(&asset)
        .unwrap_or(Value::Null);
    let mut data = json!(data);
    data["source"] = source;
    Ok(([("cache-control", "no-store")], Json(json!({"data":data}))))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RenameInput {
    name: String,
    expected_revision: String,
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/assets/{asset}",
///   "method": "patch",
///   "operation": {
///     "operationId": "renameWorkspaceAsset",
///     "summary": "Rename a saved workspace material",
///     "description": "Member Write permission required. Requires the exact current revision as a canonical positive decimal string. Renaming changes display metadata and increments revision, never bytes, content hash or Provider authorization. Stale revision returns 409. A missing scoped asset is 404; a concurrent deletion may conflict.",
///     "x-niu-implementation": "implemented",
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
///       },
///       {
///         "name": "asset",
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
///         "description": "Malformed query/body, unsupported type, invalid media bytes, name, page size or revision."
///       },
///       "401": {
///         "description": "Missing/invalid member administrator authentication; inference keys do not manage materials."
///       },
///       "403": {
///         "description": "Authenticated principal lacks workspace scope or required Read/Write permission."
///       },
///       "404": {
///         "description": "Workspace or scoped active asset not found."
///       },
///       "409": {
///         "description": "Stale revision, unavailable cursor or serialized workspace quota exceeded."
///       },
///       "503": {
///         "description": "Bounded processing capacity, encryption or storage unavailable; no successful write is confirmed."
///       },
///       "200": {
///         "description": "Scoped asset metadata; no private ciphertext or actor identifier.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "id",
///                     "name",
///                     "media_kind",
///                     "content_type",
///                     "content_sha256",
///                     "byte_length",
///                     "revision",
///                     "created_at_ms",
///                     "updated_at_ms"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid",
///                       "description": "Internal routing reference; never display as a user label."
///                     },
///                     "name": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 200,
///                       "description": "Trimmed display name, at most 200 UTF-8 bytes, without control characters."
///                     },
///                     "media_kind": {
///                       "type": "string",
///                       "enum": [
///                         "image",
///                         "video",
///                         "audio"
///                       ]
///                     },
///                     "content_type": {
///                       "type": "string",
///                       "enum": [
///                         "image/png",
///                         "image/jpeg",
///                         "image/webp",
///                         "video/mp4",
///                         "video/webm",
///                         "audio/wav",
///                         "audio/mpeg",
///                         "audio/ogg"
///                       ]
///                     },
///                     "content_sha256": {
///                       "type": "string",
///                       "pattern": "^[0-9a-f]{64}$",
///                       "description": "SHA-256 of the immutable original bytes."
///                     },
///                     "byte_length": {
///                       "type": "integer",
///                       "minimum": 1,
///                       "maximum": 8388608
///                     },
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$",
///                       "description": "Canonical positive signed-64-bit integer; use for rename/delete concurrency checks."
///                     },
///                     "created_at_ms": {
///                       "type": "integer",
///                       "format": "int64"
///                     },
///                     "updated_at_ms": {
///                       "type": "integer",
///                       "format": "int64"
///                     },
///                     "source": {
///                       "type": [
///                         "object",
///                         "null"
///                       ],
///                       "description": "Authorized original generation context. Null when absent or not visible to this actor; sharing a retained copy does not grant source access.",
///                       "additionalProperties": false,
///                       "required": [
///                         "reference",
///                         "kind",
///                         "output",
///                         "model",
///                         "created_at"
///                       ],
///                       "properties": {
///                         "reference": {
///                           "type": "string",
///                           "pattern": "^run-[1-9][0-9]{0,18}$"
///                         },
///                         "kind": {
///                           "const": "video"
///                         },
///                         "output": {
///                           "enum": [
///                             "video",
///                             "last_frame"
///                           ]
///                         },
///                         "model": {
///                           "type": "string"
///                         },
///                         "created_at": {
///                           "type": "string",
///                           "format": "date-time"
///                         }
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "name",
///               "expected_revision"
///             ],
///             "properties": {
///               "name": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 200,
///                 "description": "Trimmed display name, at most 200 UTF-8 bytes, without control characters."
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]*$",
///                 "description": "Canonical positive signed-64-bit integer; use for rename/delete concurrency checks."
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(crate) async fn rename(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, project, asset)): Path<(Uuid, Uuid, Uuid)>,
    input: Result<Json<RenameInput>, JsonRejection>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    let scope = scope(organization, project);
    let actor = authorize(&state, &headers, scope, AdminPermission::Write).await?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Provide asset name and expected revision"))?;
    let name = name(&input.name)?;
    let revision = revision(&input.expected_revision)?;
    let data = state
        .store
        .rename_workspace_asset(scope, asset, name, revision, &actor)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let source = state
        .store
        .workspace_asset_sources(scope, &actor, &[asset])
        .await
        .map_err(ApiError::from_store)?
        .remove(&asset)
        .unwrap_or(Value::Null);
    let mut data = json!(data);
    data["source"] = source;
    Ok(([("cache-control", "no-store")], Json(json!({"data":data}))))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct DeleteQuery {
    expected_revision: Option<String>,
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/assets/{asset}",
///   "method": "delete",
///   "operation": {
///     "operationId": "deleteWorkspaceAsset",
///     "summary": "Delete a saved workspace material",
///     "description": "Member Write permission required. Optional expected_revision protects against deleting a newly renamed active object. Deletion marks metadata inactive, erases ciphertext and releases quota atomically. Repeat deletion of the same scoped deleted asset is idempotent 204. Unknown or foreign asset is 404. No upstream asset or existing inference job is deleted.",
///     "x-niu-implementation": "implemented",
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
///       },
///       {
///         "name": "asset",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "expected_revision",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "description": "Optional canonical positive i64 revision of the active asset."
///       }
///     ],
///     "responses": {
///       "400": {
///         "description": "Malformed query/body, unsupported type, invalid media bytes, name, page size or revision."
///       },
///       "401": {
///         "description": "Missing/invalid member administrator authentication; inference keys do not manage materials."
///       },
///       "403": {
///         "description": "Authenticated principal lacks workspace scope or required Read/Write permission."
///       },
///       "404": {
///         "description": "Workspace or scoped active asset not found."
///       },
///       "409": {
///         "description": "Stale revision, unavailable cursor or serialized workspace quota exceeded."
///       },
///       "503": {
///         "description": "Bounded processing capacity, encryption or storage unavailable; no successful write is confirmed."
///       },
///       "204": {
///         "description": "Scoped deletion committed or already deleted; no response body."
///       }
///     }
///   }
/// }
/// ```
pub(crate) async fn delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, project, asset)): Path<(Uuid, Uuid, Uuid)>,
    input: Result<Query<DeleteQuery>, QueryRejection>,
) -> Result<StatusCode, ApiError> {
    let scope = scope(organization, project);
    let actor = authorize(&state, &headers, scope, AdminPermission::Write).await?;
    let Query(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid asset deletion revision"))?;
    let expected = input
        .expected_revision
        .as_deref()
        .map(revision)
        .transpose()?;
    if !state
        .store
        .delete_workspace_asset(scope, asset, expected, &actor)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    Ok(StatusCode::NO_CONTENT)
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/assets/{asset}/content",
///   "method": "get",
///   "operation": {
///     "operationId": "downloadWorkspaceAsset",
///     "summary": "Download saved workspace material bytes",
///     "description": "Member Read permission required. Authenticates encrypted identity binding and checks byte length and SHA-256 before returning the original bytes. Safe fixed attachment filename, exact supported Content-Type, Cache-Control:no-store and X-Content-Type-Options:nosniff. Unknown/deleted/foreign asset is 404; decryption/integrity failure is a safe unavailable response. Does not make content approved for Provider processing.",
///     "x-niu-implementation": "implemented",
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
///       },
///       {
///         "name": "asset",
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
///         "description": "Malformed query/body, unsupported type, invalid media bytes, name, page size or revision."
///       },
///       "401": {
///         "description": "Missing/invalid member administrator authentication; inference keys do not manage materials."
///       },
///       "403": {
///         "description": "Authenticated principal lacks workspace scope or required Read/Write permission."
///       },
///       "404": {
///         "description": "Workspace or scoped active asset not found."
///       },
///       "409": {
///         "description": "Stale revision, unavailable cursor or serialized workspace quota exceeded."
///       },
///       "503": {
///         "description": "Bounded processing capacity, encryption or storage unavailable; no successful write is confirmed."
///       },
///       "200": {
///         "description": "Exact retained bytes with no-store/nosniff and safe attachment disposition.",
///         "content": {
///           "image/png": {
///             "schema": {
///               "type": "string",
///               "format": "binary",
///               "maxLength": 8388608
///             }
///           },
///           "image/jpeg": {
///             "schema": {
///               "type": "string",
///               "format": "binary",
///               "maxLength": 8388608
///             }
///           },
///           "image/webp": {
///             "schema": {
///               "type": "string",
///               "format": "binary",
///               "maxLength": 8388608
///             }
///           },
///           "video/mp4": {
///             "schema": {
///               "type": "string",
///               "format": "binary",
///               "maxLength": 8388608
///             }
///           },
///           "video/webm": {
///             "schema": {
///               "type": "string",
///               "format": "binary",
///               "maxLength": 8388608
///             }
///           },
///           "audio/wav": {
///             "schema": {
///               "type": "string",
///               "format": "binary",
///               "maxLength": 8388608
///             }
///           },
///           "audio/mpeg": {
///             "schema": {
///               "type": "string",
///               "format": "binary",
///               "maxLength": 8388608
///             }
///           },
///           "audio/ogg": {
///             "schema": {
///               "type": "string",
///               "format": "binary",
///               "maxLength": 8388608
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(crate) async fn content(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, project, asset)): Path<(Uuid, Uuid, Uuid)>,
) -> Result<Response, ApiError> {
    let scope = scope(organization, project);
    authorize(&state, &headers, scope, AdminPermission::Read).await?;
    let _permit = DOWNLOADS
        .try_acquire()
        .map_err(|_| ApiError::asset_management_busy())?;
    let retained = state
        .store
        .workspace_asset_content(scope, asset)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?;
    let bytes = tokio::task::block_in_place(|| -> Result<Vec<u8>, ApiError> {
        let bytes = cipher
            .open_bytes_with_aad(&retained.aad, &retained.ciphertext)
            .map_err(|_| ApiError::unavailable())?;
        if bytes.len() > niu_media::workspace_asset_validation::MAX_ASSET_BYTES
            || i64::try_from(bytes.len()).ok() != Some(retained.asset.byte_length)
            || format!("{:x}", Sha256::digest(&bytes)) != retained.asset.content_sha256
        {
            return Err(ApiError::unavailable());
        }
        Ok(bytes)
    })?;
    let filename = match retained.asset.content_type.as_str() {
        "image/png" => "attachment; filename=workspace-image.png",
        "image/jpeg" => "attachment; filename=workspace-image.jpg",
        "image/webp" => "attachment; filename=workspace-image.webp",
        "video/mp4" => "attachment; filename=workspace-video.mp4",
        "video/webm" => "attachment; filename=workspace-video.webm",
        "audio/wav" => "attachment; filename=workspace-audio.wav",
        "audio/mpeg" => "attachment; filename=workspace-audio.mp3",
        "audio/ogg" => "attachment; filename=workspace-audio.ogg",
        _ => return Err(ApiError::unavailable()),
    };
    Ok((
        [
            (header::CONTENT_TYPE, retained.asset.content_type),
            (header::CACHE_CONTROL, "no-store".into()),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff".into()),
            (header::CONTENT_DISPOSITION, filename.into()),
        ],
        Body::from(bytes),
    )
        .into_response())
}
