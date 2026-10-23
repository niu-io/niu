//! Explicit developer-only merchant transport; never enabled by Stripe test mode alone.
#[cfg(all(feature = "mock-payments", debug_assertions))]
use super::StripeCheckout;
use super::StripeRuntime;

pub(super) fn from_env(_platform_currency: Option<&str>) -> Result<StripeRuntime, &'static str> {
    #[cfg(all(feature = "mock-payments", debug_assertions))]
    {
        use std::env;
        if env::var("NIU_ENVIRONMENT").as_deref() != Ok("test") {
            return Err("Mock payments require NIU_ENVIRONMENT=test and an isolated test database");
        }
        if env::var_os("NIU_STRIPE_MERCHANT").is_some()
        {
            return Err("Mock payments cannot be combined with merchant configuration");
        }
        let base = env::var("NIU_MOCK_PAYMENT_URL").map_err(|_| "Invalid mock payment URL")?;
        let key = env::var("NIU_MOCK_PAYMENT_KEY").map_err(|_| "Missing mock payment key")?;
        let secret =
            env::var("NIU_MOCK_PAYMENT_SECRET").map_err(|_| "Missing mock notification secret")?;
        if !key.starts_with("sk_test_")
            || key.len() < 32
            || !secret.starts_with("whsec_")
            || secret.len() < 32
        {
            return Err(
                "Mock payment credentials must be test-only secrets of at least 32 characters",
            );
        }
        let currency = _platform_currency.unwrap_or("USD").to_ascii_lowercase();
        if !matches!(currency.as_str(), "usd" | "cny") {
            return Err("Mock payment currency must be USD or CNY");
        }
        let client = niu_payments::stripe_transport::Client::fixture(key, false, &base)
            .map_err(|_| "Mock payment URL must be a loopback HTTP origin")?;
        Ok(StripeRuntime {
            merchant: "NiuMockPayments".into(),
            endpoint_secret: secret,
            live_mode: false,
            checkout: Some(StripeCheckout {
                client,
                currency,
                methods: vec!["card".into()],
                // Protocol-required URLs are never followed by the mock; its return destination
                // is separately constrained to the configured loopback application origin.
                success_url: "https://mock.invalid/success".into(),
                cancel_url: "https://mock.invalid/cancel".into(),
            }),
        })
    }
    #[cfg(not(all(feature = "mock-payments", debug_assertions)))]
    Err("Mock payments are disabled: requires a debug build with --features mock-payments")
}

pub(super) fn available() -> bool {
    cfg!(all(feature = "mock-payments", debug_assertions))
        && std::env::var("NIU_ENVIRONMENT").as_deref() == Ok("test")
        && std::env::var_os("NIU_MOCK_PAYMENT_URL").is_some()
}

async fn control(enabled: Option<bool>) -> Result<serde_json::Value, crate::error::ApiError> {
    use crate::error::ApiError;
    if !available() { return Ok(serde_json::json!({"available":false,"enabled":false})); }
    let base = std::env::var("NIU_MOCK_PAYMENT_URL").map_err(|_| ApiError::invalid_request("Mock transport unavailable"))?;
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(3)).build().map_err(|_| ApiError::upstream_message("Mock service unavailable"))?;
    let request = if let Some(enabled) = enabled {
        client.post(format!("{}/control", base.trim_end_matches('/')))
            .basic_auth(std::env::var("NIU_MOCK_PAYMENT_KEY").unwrap_or_default(), Some(""))
            .json(&serde_json::json!({"enabled":enabled}))
    } else { client.get(format!("{}/healthz", base.trim_end_matches('/'))) };
    let response = request.send().await.map_err(|_| ApiError::upstream_message("Mock service unavailable"))?;
    if !response.status().is_success() && !(enabled.is_none() && response.status() == reqwest::StatusCode::SERVICE_UNAVAILABLE) {
        return Err(ApiError::upstream_message("Mock service rejected configuration"));
    }
    let data: serde_json::Value = response.json().await.map_err(|_| ApiError::upstream_message("Invalid mock service response"))?;
    if data["test"] != true || !data["enabled"].is_boolean() { return Err(ApiError::upstream_message("Invalid mock service response")); }
    Ok(serde_json::json!({"available":true,"enabled":data["enabled"],"readiness":data["readiness"]}))
}

pub(super) async fn enabled() -> bool {
    control(None).await.is_ok_and(|data| data["enabled"] == true)
}

pub(super) async fn ready() -> bool {
    control(None).await.is_ok_and(|data| data["enabled"] == true && data["readiness"] == "ready")
}

pub(crate) async fn environment() -> Result<axum::Json<serde_json::Value>, crate::error::ApiError> {
    let data = control(None).await?;
    Ok(axum::Json(serde_json::json!({"data":{"mock_payments":data["enabled"] == true}})))
}

pub(crate) async fn read(
    axum::extract::State(state): axum::extract::State<crate::state::AppState>,
    headers: axum::http::HeaderMap,
) -> Result<axum::Json<serde_json::Value>, crate::error::ApiError> {
    state.authorize_platform_headers(&headers).await?;
    Ok(axum::Json(serde_json::json!({"data":control(None).await?})))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Selection { enabled: bool }

pub(crate) async fn save(
    axum::extract::State(state): axum::extract::State<crate::state::AppState>,
    headers: axum::http::HeaderMap,
    axum::Json(input): axum::Json<Selection>,
) -> Result<axum::Json<serde_json::Value>, crate::error::ApiError> {
    state.authorize_platform_headers(&headers).await?;
    if !available() { return Err(crate::error::ApiError::invalid_request("Mock payments are only available in local development")); }
    let _guard = state.payment_configuration_guard.write().await;
    if input.enabled && (state.payments.is_some() || super::configuration::runtime(&state).await?.is_some()) {
        return Err(crate::error::ApiError::invalid_request("Disable other payment gateways before enabling mock payments"));
    }
    Ok(axum::Json(serde_json::json!({"data":control(Some(input.enabled)).await?})))
}
