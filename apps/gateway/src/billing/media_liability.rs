//! Explicit route liability evidence; independent from retail and procurement prices.
use super::{ApiError, AppState, HeaderMap, Json, Path, Query, State, Uuid, Value};
use niu_storage::{MediaLiabilityPublication, MediaLiabilityRevocation, OperatorAuditActor};
use serde::Deserialize;
use serde_json::json;

async fn actor(state: &AppState, headers: &HeaderMap) -> Result<OperatorAuditActor, ApiError> {
    Ok(match state.authorize_platform_headers(headers).await? {
        crate::state::AdminAuthorization::Installation => OperatorAuditActor::Installation,
        crate::state::AdminAuthorization::Operator(member) => {
            OperatorAuditActor::Operator(member.id)
        }
    })
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Page {
    after: Option<Uuid>,
    limit: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/admin/v1/providers/{supplier}/offers/{offer}/media-liability-bounds",
///   "method": "post",
///   "operation": {
///     "operationId": "publishMediaLiabilityQualification",
///     "summary": "Publish an evidenced route media liability bound",
///     "description": "Explicit platform administration only. Ordinary customer and Provider memberships do not grant access. Liability qualifications are finite, immutable maximum billed quantities tied to exact currently approved Provider offer, credential/model/schema revisions, dimensions and meter; they contain no purchase or selling price and must be supported by explicit evidence. Video output estimates are not liability evidence. Publication alone does not authorize dispatch. UUIDs are API references, never display labels. Exact epoch times and versions are decimal integer strings. Identical idempotent retries preserve the original result; changed intent or stale versions conflict. Revocation affects future admission, never rewrites already pinned jobs. Reads use no-store.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "supplier",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "offer",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Committed qualification change or paginated immutable history",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "properties": {
///                     "qualification_id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "revision": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "version": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$"
///                     }
///                   },
///                   "required": [
///                     "qualification_id",
///                     "revision",
///                     "version"
///                   ]
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid identity, exact quantity, finite interval, evidence or pagination"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required"
///       },
///       "409": {
///         "description": "Stale version, conflicting idempotency/interval or unavailable current qualified offer"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "properties": {
///               "identity": {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "properties": {
///                   "supplier_id": {
///                     "type": "string",
///                     "format": "uuid"
///                   },
///                   "offer_id": {
///                     "type": "string",
///                     "format": "uuid"
///                   },
///                   "offer_revision": {
///                     "type": "string",
///                     "format": "uuid"
///                   },
///                   "vendor_id": {
///                     "type": "string",
///                     "format": "uuid"
///                   },
///                   "vendor_revision": {
///                     "type": "string",
///                     "pattern": "^[0-9]+$"
///                   },
///                   "model_alias": {
///                     "type": "string"
///                   },
///                   "model_revision": {
///                     "type": "string",
///                     "pattern": "^[0-9]+$"
///                   },
///                   "schema_revision": {
///                     "type": "string"
///                   },
///                   "dimensions": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "properties": {
///                       "model": {
///                         "type": "string"
///                       },
///                       "channel": {
///                         "type": "string"
///                       },
///                       "resolution": {
///                         "type": "string"
///                       },
///                       "reference_video": {
///                         "type": "boolean"
///                       }
///                     },
///                     "required": [
///                       "model",
///                       "channel",
///                       "resolution",
///                       "reference_video"
///                     ]
///                   },
///                   "meter": {
///                     "type": "string"
///                   }
///                 },
///                 "required": [
///                   "supplier_id",
///                   "offer_id",
///                   "offer_revision",
///                   "vendor_id",
///                   "vendor_revision",
///                   "model_alias",
///                   "model_revision",
///                   "schema_revision",
///                   "dimensions",
///                   "meter"
///                 ]
///               },
///               "maximum_quantity": {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "properties": {
///                   "numerator": {
///                     "type": "string",
///                     "pattern": "^[0-9]+$"
///                   },
///                   "denominator": {
///                     "type": "string",
///                     "pattern": "^[0-9]+$"
///                   }
///                 },
///                 "required": [
///                   "numerator",
///                   "denominator"
///                 ]
///               },
///               "evidence_revision": {
///                 "type": "string"
///               },
///               "evidence_sha256": {
///                 "type": "string",
///                 "pattern": "^[0-9a-f]{64}$"
///               },
///               "effective_from": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$"
///               },
///               "effective_until": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$"
///               },
///               "expected_version": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$"
///               },
///               "idempotency_key": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "reason": {
///                 "type": "string"
///               }
///             },
///             "required": [
///               "identity",
///               "maximum_quantity",
///               "evidence_revision",
///               "evidence_sha256",
///               "effective_from",
///               "effective_until",
///               "expected_version",
///               "idempotency_key",
///               "reason"
///             ]
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn publish(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((supplier, offer)): Path<(Uuid, Uuid)>,
    Json(input): Json<MediaLiabilityPublication>,
) -> Result<Json<Value>, ApiError> {
    let actor = actor(&state, &headers).await?;
    if input.identity.supplier_id != supplier || input.identity.offer_id != offer {
        return Err(ApiError::invalid_request(
            "Route identity must match the requested Supplier offer",
        ));
    }
    let result = state
        .store
        .publish_media_liability_qualification(&input, actor)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":result})))
}

/// ```openapi
/// {
///   "path": "/admin/v1/providers/{supplier}/offers/{offer}/media-liability-bounds",
///   "method": "get",
///   "operation": {
///     "operationId": "listMediaLiabilityQualifications",
///     "summary": "List immutable route media liability qualifications",
///     "description": "Explicit platform administration only. Ordinary customer and Provider memberships do not grant access. Liability qualifications are finite, immutable maximum billed quantities tied to exact currently approved Provider offer, credential/model/schema revisions, dimensions and meter; they contain no purchase or selling price and must be supported by explicit evidence. Video output estimates are not liability evidence. Publication alone does not authorize dispatch. UUIDs are API references, never display labels. Exact epoch times and versions are decimal integer strings. Identical idempotent retries preserve the original result; changed intent or stale versions conflict. Revocation affects future admission, never rewrites already pinned jobs. Reads use no-store.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "supplier",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "offer",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
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
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Committed qualification change or paginated immutable history",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "properties": {
///                       "qualification_id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "revision": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "version": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "current_version": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "identity": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "properties": {
///                           "supplier_id": {
///                             "type": "string",
///                             "format": "uuid"
///                           },
///                           "offer_id": {
///                             "type": "string",
///                             "format": "uuid"
///                           },
///                           "offer_revision": {
///                             "type": "string",
///                             "format": "uuid"
///                           },
///                           "vendor_id": {
///                             "type": "string",
///                             "format": "uuid"
///                           },
///                           "vendor_revision": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "model_alias": {
///                             "type": "string"
///                           },
///                           "model_revision": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "schema_revision": {
///                             "type": "string"
///                           },
///                           "dimensions": {
///                             "type": "object",
///                             "additionalProperties": false,
///                             "properties": {
///                               "model": {
///                                 "type": "string"
///                               },
///                               "channel": {
///                                 "type": "string"
///                               },
///                               "resolution": {
///                                 "type": "string"
///                               },
///                               "reference_video": {
///                                 "type": "boolean"
///                               }
///                             },
///                             "required": [
///                               "model",
///                               "channel",
///                               "resolution",
///                               "reference_video"
///                             ]
///                           },
///                           "meter": {
///                             "type": "string"
///                           }
///                         },
///                         "required": [
///                           "supplier_id",
///                           "offer_id",
///                           "offer_revision",
///                           "vendor_id",
///                           "vendor_revision",
///                           "model_alias",
///                           "model_revision",
///                           "schema_revision",
///                           "dimensions",
///                           "meter"
///                         ]
///                       },
///                       "maximum_quantity": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "properties": {
///                           "numerator": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "denominator": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           }
///                         },
///                         "required": [
///                           "numerator",
///                           "denominator"
///                         ]
///                       },
///                       "evidence_revision": {
///                         "type": "string"
///                       },
///                       "evidence_sha256": {
///                         "type": "string"
///                       },
///                       "effective_from": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "effective_until": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "revocation_effective_until": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "reason": {
///                         "type": "string"
///                       },
///                       "actor_kind": {
///                         "type": "string",
///                         "enum": [
///                           "installation",
///                           "operator"
///                         ]
///                       },
///                       "actor_operator_id": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "revocation_revision": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid"
///                       },
///                       "revocation_reason": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "revocation_actor_kind": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "enum": [
///                           "installation",
///                           "operator",
///                           null
///                         ]
///                       },
///                       "revocation_actor_operator_id": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid"
///                       },
///                       "revocation_created_at": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "date-time"
///                       }
///                     },
///                     "required": [
///                       "qualification_id",
///                       "revision",
///                       "version",
///                       "current_version",
///                       "identity",
///                       "maximum_quantity",
///                       "evidence_revision",
///                       "evidence_sha256",
///                       "effective_from",
///                       "effective_until",
///                       "revocation_effective_until",
///                       "reason",
///                       "actor_kind",
///                       "actor_operator_id",
///                       "created_at",
///                       "revocation_revision",
///                       "revocation_reason",
///                       "revocation_actor_kind",
///                       "revocation_actor_operator_id",
///                       "revocation_created_at"
///                     ]
///                   }
///                 },
///                 "next_after": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "uuid"
///                 }
///               },
///               "required": [
///                 "data",
///                 "next_after"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid identity, exact quantity, finite interval, evidence or pagination"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required"
///       },
///       "409": {
///         "description": "Stale version, conflicting idempotency/interval or unavailable current qualified offer"
///       }
///     }
///   }
/// }
/// ```
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((supplier, offer)): Path<(Uuid, Uuid)>,
    Query(page): Query<Page>,
) -> Result<impl axum::response::IntoResponse, ApiError> {
    actor(&state, &headers).await?;
    let result = state
        .store
        .list_media_liability_qualifications(supplier, offer, page.after, page.limit.unwrap_or(50))
        .await
        .map_err(ApiError::from_store)?;
    Ok(([("cache-control", "no-store")], Json(result)))
}

/// ```openapi
/// {
///   "path": "/admin/v1/providers/{supplier}/offers/{offer}/media-liability-bounds/{revision}/retire",
///   "method": "post",
///   "operation": {
///     "operationId": "retireMediaLiabilityQualification",
///     "summary": "Retire a route media liability bound",
///     "description": "Explicit platform administration only. Ordinary customer and Provider memberships do not grant access. Liability qualifications are finite, immutable maximum billed quantities tied to exact currently approved Provider offer, credential/model/schema revisions, dimensions and meter; they contain no purchase or selling price and must be supported by explicit evidence. Video output estimates are not liability evidence. Publication alone does not authorize dispatch. UUIDs are API references, never display labels. Exact epoch times and versions are decimal integer strings. Identical idempotent retries preserve the original result; changed intent or stale versions conflict. Revocation affects future admission, never rewrites already pinned jobs. Reads use no-store.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "supplier",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "offer",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "revision",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Committed qualification change or paginated immutable history",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "properties": {
///                     "qualification_id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "revision": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "version": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$"
///                     }
///                   },
///                   "required": [
///                     "qualification_id",
///                     "revision",
///                     "version"
///                   ]
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid identity, exact quantity, finite interval, evidence or pagination"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required"
///       },
///       "409": {
///         "description": "Stale version, conflicting idempotency/interval or unavailable current qualified offer"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "properties": {
///               "effective_until": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$"
///               },
///               "expected_version": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$"
///               },
///               "idempotency_key": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "reason": {
///                 "type": "string"
///               }
///             },
///             "required": [
///               "effective_until",
///               "expected_version",
///               "idempotency_key",
///               "reason"
///             ]
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn retire(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((supplier, offer, revision)): Path<(Uuid, Uuid, Uuid)>,
    Json(input): Json<MediaLiabilityRevocation>,
) -> Result<Json<Value>, ApiError> {
    let actor = actor(&state, &headers).await?;
    let result = state
        .store
        .revoke_media_liability_qualification(supplier, offer, revision, &input, actor)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":result})))
}
