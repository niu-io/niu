use super::*;
use serde::Serialize;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Details {
    beneficiary: String,
    bank: String,
    account: String,
    currency: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Update {
    revision: String,
    details: Value,
}

pub async fn read(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .platform_bank_details()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}

pub async fn save(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<Update>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    let revision = input
        .revision
        .parse::<i64>()
        .map_err(|_| ApiError::invalid_request("Invalid bank details revision"))?;
    let details = if input.details.is_null() {
        None
    } else {
        let d: Details = serde_json::from_value(input.details)
            .map_err(|_| ApiError::invalid_request("Provide complete bank details"))?;
        if [&d.beneficiary, &d.bank, &d.account].into_iter().any(|s| {
            s.trim().is_empty() || s.trim() != s || s.len() > 200 || s.chars().any(char::is_control)
        }) || d.currency.len() != 3
            || !d.currency.bytes().all(|b| b.is_ascii_uppercase())
        {
            return Err(ApiError::invalid_request(
                "Provide complete bank details and a three-letter currency",
            ));
        }
        Some(json!(d))
    };
    let data = state
        .store
        .save_bank_details(revision, details)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}

pub async fn customer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(org): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.permits_billing_account(org) {
        return Err(ApiError::not_found());
    }
    let data = state
        .store
        .customer_bank_details(org)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}
