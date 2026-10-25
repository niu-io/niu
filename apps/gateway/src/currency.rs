use crate::{error::ApiError, state::AppState};
use axum::{Json, extract::State, http::HeaderMap};
use serde::Deserialize;
use serde_json::{Value, json};
/// ```openapi
/// {"path":"/v1/currency","method":"get","operation":{"operationId":"getPlatformCurrency","summary":"Read the configured platform currency","x-niu-implementation":"implemented","description":"Returns the durable installation currency, or null until platform setup is completed. No credentials or financial balances are exposed.","security":[],"responses":{"200":{"description":"data.currency is an ISO currency code, or null before setup."}}}}
/// ```
pub async fn read(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let (currency, billing_mode, unit) = state
        .store
        .platform_billing_summary()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({
        "data": {
            "currency": currency,
            "billing_mode": billing_mode,
            "unit": unit,
        }
    })))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CurrencyInput {
    currency: String,
}
/// ```openapi
/// {"path":"/api/v1/platform/currency","method":"put","operation":{"operationId":"configurePlatformCurrency","summary":"Configure the installation currency once","x-niu-implementation":"implemented","security":[{"bearerAuth":[]}],"description":"Platform administration required. Repeating the same currency is safe; changing a configured currency returns 409. Historical records are not converted.","requestBody":{"required":true,"content":{"application/json":{"schema":{"type":"object","required":["currency"],"additionalProperties":false,"properties":{"currency":{"type":"string","pattern":"^[A-Z]{3}$"}}}}}},"responses":{"200":{"description":"Configured currency."},"409":{"description":"Currency already configured with a different value."}}}}
/// ```
pub async fn save(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CurrencyInput>,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    state
        .store
        .configure_platform_currency(&input.currency)
        .await
        .map_err(ApiError::from_store)?;
    read(State(state)).await
}
