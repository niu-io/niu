//! Administrator noncash gifts; never merchant receipts or immediate revenue.
use super::{ApiError, AppState, HeaderMap, Json, Path, State, Uuid, Value};
use niu_storage::{
    CustomerBalanceGrantPolicy, CustomerBalanceGrantPublication, OperatorAuditActor,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GrantInput {
    amount_nanos: String,
    reason: String,
    idempotency_key: Uuid,
    #[serde(default)]
    application_policy: CustomerBalanceGrantPolicy,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/accounts/{currency}/grants",
///   "method": "post",
///   "operation": {
///     "operationId": "grantCustomerBalance",
///     "summary": "Issue administrator noncash customer credit",
///     "description": "Explicit platform administration required. Atomically records a positive gift and its immutable noncash memorandum, reason and authenticated actor. Issuance is not a payment receipt or revenue. application_policy defaults to future_only for compatibility. Explicit unpaid_credit_first applies the new gift against exact known unpaid credit charges as sales allowance, reducing revenue and receivable without repricing the charge or changing Supplier payable. Remaining gift funds future consumption. Unknown debt provenance rejects the complete publication. Refunds restore the corresponding gift before credit or cash, without evidence of an external cash transfer. Credit policy is unchanged. Exact retries using the same company-scoped idempotency key, currency, amount, reason and application policy return the original grant; differing reuse conflicts. Historical financial entries are never reclassified. No automatic retry.",
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
///         "name": "currency",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         }
///       }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "amount_nanos",
///               "reason",
///               "idempotency_key"
///             ],
///             "properties": {
///               "application_policy": {
///                 "type": "string",
///                 "enum": ["future_only", "unpaid_credit_first"],
///                 "default": "future_only"
///               },
///               "amount_nanos": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]{0,18}$",
///                 "description": "Positive exact currency nanounits, maximum 9223372036854775807."
///               },
///               "reason": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 500,
///                 "description": "Trimmed justification without control characters."
///               },
///               "idempotency_key": {
///                 "type": "string",
///                 "format": "uuid"
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Gift issued, or identical previously committed gift returned",
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
///                   "required": [
///                     "id",
///                     "application_policy",
///                     "applied_to_credit_nanos",
///                     "retained_for_future_consumption_nanos"
///                   ],
///                   "properties": {
///                     "application_policy": { "type": "string", "enum": ["future_only", "unpaid_credit_first"] },
///                     "applied_to_credit_nanos": { "type": "string", "pattern": "^[0-9]+$" },
///                     "retained_for_future_consumption_nanos": {
///                       "type": "string", "pattern": "^[0-9]+$",
///                       "description": "Original grant amount retained for future consumption at issuance, not current spendable balance."
///                     },
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid exact amount, currency or reason"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required"
///       },
///       "422": {
///         "description": "Malformed request body or unsupported application policy"
///       },
///       "409": {
///         "description": "Unknown company, conflicting idempotency intent or uncovered debt sources for unpaid_credit_first"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, currency)): Path<(Uuid, String)>,
    Json(input): Json<GrantInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = state.authorize_platform_headers(&headers).await?;
    let actor = match auth {
        crate::state::AdminAuthorization::Installation => OperatorAuditActor::Installation,
        crate::state::AdminAuthorization::Operator(operator) => {
            OperatorAuditActor::Operator(operator.id)
        }
    };
    let amount = super::exact_nonnegative_integer(&input.amount_nanos)?;
    if amount == 0 || input.amount_nanos.starts_with('0') {
        return Err(ApiError::invalid_request(
            "Use a positive exact amount without leading zeroes",
        ));
    }
    let id = state
        .store
        .publish_customer_balance_grant_with_policy(
            organization,
            CustomerBalanceGrantPublication {
                currency: &currency,
                amount_nanos: amount,
                reason: &input.reason,
                idempotency_key: input.idempotency_key,
            },
            actor,
            input.application_policy,
        )
        .await
        .map_err(ApiError::from_store)?;
    let result = state
        .store
        .customer_balance_grant_result(organization, id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(serde_json::json!({"data": result})))
}
