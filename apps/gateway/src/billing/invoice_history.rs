//! Full customer statement navigation with existing billing authorization.
use super::{
    ApiError, AppState, HeaderMap, Json, Path, Query, State, TenantScope, Uuid, Value, authorize,
};

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/billing/invoices",
///   "method": "get",
///   "operation": {
///     "operationId": "listCustomerInvoices",
///     "summary": "Page complete workspace customer invoice history",
///     "description": "Requires administrative read permission for this workspace. Returns customer billing only, with exact amount strings. Records are ordered by creation time then id descending. Posted customer balance debits, including approved-credit debits, settle the invoice; they are not a new unpaid invoice debt. Refunds do not reopen the original invoice obligation. Reads do not create payment receipts, move funds or disclose Supplier purchase prices. A cursor missing from this workspace or filter scope returns 409. Newer inserts do not shift later pages; separate reads are not a frozen snapshot. Cache-Control is no-store. Existing invoice issuance and line reads are unchanged.",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
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
///         "name": "before",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Prior next_cursor. Keep filters fixed across pages."
///       },
///       {
///         "name": "currency",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         },
///         "description": "One currency; no conversion."
///       },
///       {
///         "name": "from_ms",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 0,
///           "maximum": 253402300799999
///         },
///         "description": "Inclusive invoice creation time, Unix milliseconds; not the billed usage interval."
///       },
///       {
///         "name": "to_ms",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 0,
///           "maximum": 253402300799999
///         },
///         "description": "Exclusive invoice creation time; must follow from_ms."
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 50
///         },
///         "description": "Maximum page size."
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Customer invoice page; null next_cursor marks the end.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_cursor"
///               ],
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "id",
///                       "from_ms",
///                       "to_ms",
///                       "currency",
///                       "amount_nanos",
///                       "created_at",
///                       "status",
///                       "payment_reference"
///                     ],
///                     "additionalProperties": false,
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "from_ms": {
///                         "type": "integer",
///                         "format": "int64"
///                       },
///                       "to_ms": {
///                         "type": "integer",
///                         "format": "int64"
///                       },
///                       "currency": {
///                         "type": "string"
///                       },
///                       "amount_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "status": {
///                         "type": "string",
///                         "enum": [
///                           "issued",
///                           "paid"
///                         ]
///                       },
///                       "payment_reference": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
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
///       },
///       "400": {
///         "description": "Invalid query."
///       },
///       "401": {
///         "description": "Invalid administrative credential."
///       },
///       "404": {
///         "description": "Workspace absent or inaccessible."
///       },
///       "409": {
///         "description": "Cursor outside workspace or filters."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    Query(query): Query<niu_storage::LedgerHistoryQuery>,
) -> Result<Json<Value>, ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    authorize(&state, &headers, scope, false).await?;
    state
        .store
        .customer_invoice_history(scope, &query)
        .await
        .map_err(ApiError::from_store)?
        .map(Json)
        .ok_or_else(ApiError::not_found)
}
