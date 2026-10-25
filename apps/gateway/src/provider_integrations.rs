//! Integration defaults and connection overrides. No inference or pricing mutation.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IntegrationInput {
    integration_type: Value,
    expected_revision: i64,
}

/// ```openapi
/// {
///   "path": "/api/v1/providers/{provider}/integration",
///   "method": "get",
///   "operation": {
///     "operationId": "getProviderIntegration",
///     "summary": "Read provider integration identity",
///     "description": "Platform administration required. Integration identity is independent of the inference adapter, endpoint, credential and prices. An unspecified default resolves to custom without claiming detection. A connection can override its Provider default; null restores inheritance. Writes require the current local revision (zero before the first save) and never overwrite a concurrent edit. This operation does not discover models, grant upstream management rights, publish rates or dispatch inference.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "provider",
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
///         "description": "Current integration selection and effective source",
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
///                     "integration_type",
///                     "effective_type",
///                     "source",
///                     "revision"
///                   ],
///                   "properties": {
///                     "integration_type": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "enum": [
///                         "openrouter",
///                         "newapi",
///                         "litellm",
///                         "custom",
///                         null
///                       ]
///                     },
///                     "effective_type": {
///                       "type": "string",
///                       "enum": [
///                         "openrouter",
///                         "newapi",
///                         "litellm",
///                         "custom"
///                       ]
///                     },
///                     "source": {
///                       "type": "string",
///                       "enum": [
///                         "connection",
///                         "provider",
///                         "unspecified"
///                       ]
///                     },
///                     "revision": {
///                       "type": "integer",
///                       "format": "int64",
///                       "minimum": 0
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid integration or revision"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "404": {
///         "description": "Resource not found"
///       },
///       "409": {
///         "description": "Configuration changed concurrently"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn read_provider(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    state
        .store
        .provider_integration(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let data = state
        .store
        .provider_integration(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/providers/{provider}/integration",
///   "method": "put",
///   "operation": {
///     "operationId": "setProviderIntegration",
///     "summary": "Set provider integration identity",
///     "description": "Platform administration required. Integration identity is independent of the inference adapter, endpoint, credential and prices. An unspecified default resolves to custom without claiming detection. A connection can override its Provider default; null restores inheritance. Writes require the current local revision (zero before the first save) and never overwrite a concurrent edit. This operation does not discover models, grant upstream management rights, publish rates or dispatch inference.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "provider",
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
///         "description": "Current integration selection and effective source",
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
///                     "integration_type",
///                     "effective_type",
///                     "source",
///                     "revision"
///                   ],
///                   "properties": {
///                     "integration_type": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "enum": [
///                         "openrouter",
///                         "newapi",
///                         "litellm",
///                         "custom",
///                         null
///                       ]
///                     },
///                     "effective_type": {
///                       "type": "string",
///                       "enum": [
///                         "openrouter",
///                         "newapi",
///                         "litellm",
///                         "custom"
///                       ]
///                     },
///                     "source": {
///                       "type": "string",
///                       "enum": [
///                         "connection",
///                         "provider",
///                         "unspecified"
///                       ]
///                     },
///                     "revision": {
///                       "type": "integer",
///                       "format": "int64",
///                       "minimum": 0
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid integration or revision"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "404": {
///         "description": "Resource not found"
///       },
///       "409": {
///         "description": "Configuration changed concurrently"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "integration_type",
///               "expected_revision"
///             ],
///             "properties": {
///               "integration_type": {
///                 "type": "string",
///                 "enum": [
///                   "openrouter",
///                   "newapi",
///                   "litellm",
///                   "custom"
///                 ]
///               },
///               "expected_revision": {
///                 "type": "integer",
///                 "format": "int64",
///                 "minimum": 0
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn save_provider(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<IntegrationInput>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    state
        .store
        .provider_integration(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let kind = input.integration_type.as_str();
    if input.expected_revision < 0
        || kind
            .is_some_and(|value| !matches!(value, "openrouter" | "newapi" | "litellm" | "custom"))
        || kind.is_none()
    {
        return Err(ApiError::invalid_request(
            "Choose a supported integration and current revision",
        ));
    }
    state
        .store
        .set_provider_integration(
            id,
            kind.ok_or_else(|| ApiError::invalid_request("Provider integration is required"))?,
            input.expected_revision,
        )
        .await
        .map_err(ApiError::from_store)?;
    let data = state
        .store
        .provider_integration(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/vendors/{id}/integration",
///   "method": "get",
///   "operation": {
///     "operationId": "getVendorIntegration",
///     "summary": "Read vendor integration identity",
///     "description": "Platform administration required. Integration identity is independent of the inference adapter, endpoint, credential and prices. An unspecified default resolves to custom without claiming detection. A connection can override its Provider default; null restores inheritance. Writes require the current local revision (zero before the first save) and never overwrite a concurrent edit. This operation does not discover models, grant upstream management rights, publish rates or dispatch inference.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "id",
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
///         "description": "Current integration selection and effective source",
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
///                     "integration_type",
///                     "effective_type",
///                     "source",
///                     "revision"
///                   ],
///                   "properties": {
///                     "integration_type": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "enum": [
///                         "openrouter",
///                         "newapi",
///                         "litellm",
///                         "custom",
///                         null
///                       ]
///                     },
///                     "effective_type": {
///                       "type": "string",
///                       "enum": [
///                         "openrouter",
///                         "newapi",
///                         "litellm",
///                         "custom"
///                       ]
///                     },
///                     "source": {
///                       "type": "string",
///                       "enum": [
///                         "connection",
///                         "provider",
///                         "unspecified"
///                       ]
///                     },
///                     "revision": {
///                       "type": "integer",
///                       "format": "int64",
///                       "minimum": 0
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid integration or revision"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "404": {
///         "description": "Resource not found"
///       },
///       "409": {
///         "description": "Configuration changed concurrently"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn read_vendor(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    state
        .store
        .vendor_integration(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let data = state
        .store
        .vendor_integration(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/vendors/{id}/integration",
///   "method": "put",
///   "operation": {
///     "operationId": "setVendorIntegration",
///     "summary": "Set vendor integration identity",
///     "description": "Platform administration required. Integration identity is independent of the inference adapter, endpoint, credential and prices. An unspecified default resolves to custom without claiming detection. A connection can override its Provider default; null restores inheritance. Writes require the current local revision (zero before the first save) and never overwrite a concurrent edit. This operation does not discover models, grant upstream management rights, publish rates or dispatch inference.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "id",
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
///         "description": "Current integration selection and effective source",
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
///                     "integration_type",
///                     "effective_type",
///                     "source",
///                     "revision"
///                   ],
///                   "properties": {
///                     "integration_type": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "enum": [
///                         "openrouter",
///                         "newapi",
///                         "litellm",
///                         "custom",
///                         null
///                       ]
///                     },
///                     "effective_type": {
///                       "type": "string",
///                       "enum": [
///                         "openrouter",
///                         "newapi",
///                         "litellm",
///                         "custom"
///                       ]
///                     },
///                     "source": {
///                       "type": "string",
///                       "enum": [
///                         "connection",
///                         "provider",
///                         "unspecified"
///                       ]
///                     },
///                     "revision": {
///                       "type": "integer",
///                       "format": "int64",
///                       "minimum": 0
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid integration or revision"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "404": {
///         "description": "Resource not found"
///       },
///       "409": {
///         "description": "Configuration changed concurrently"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "integration_type",
///               "expected_revision"
///             ],
///             "properties": {
///               "integration_type": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "enum": [
///                   "openrouter",
///                   "newapi",
///                   "litellm",
///                   "custom",
///                   null
///                 ]
///               },
///               "expected_revision": {
///                 "type": "integer",
///                 "format": "int64",
///                 "minimum": 0
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn save_vendor(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<IntegrationInput>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    state
        .store
        .vendor_integration(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let kind = input.integration_type.as_str();
    if input.expected_revision < 0
        || kind
            .is_some_and(|value| !matches!(value, "openrouter" | "newapi" | "litellm" | "custom"))
        || kind.is_none() && !input.integration_type.is_null()
    {
        return Err(ApiError::invalid_request(
            "Choose a supported integration and current revision",
        ));
    }
    state
        .store
        .set_vendor_integration(id, kind, input.expected_revision)
        .await
        .map_err(ApiError::from_store)?;
    let data = state
        .store
        .vendor_integration(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data": data})))
}
