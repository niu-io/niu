//! Explicit opt-in simulated merchant transport; never enabled by Stripe test mode alone.
#[cfg(feature = "mock-payments")]
use super::StripeCheckout;
use super::StripeRuntime;

pub(super) fn from_env(_platform_currency: Option<&str>) -> Result<StripeRuntime, &'static str> {
    #[cfg(feature = "mock-payments")]
    {
        use std::env;
        if env::var_os("NIU_STRIPE_MERCHANT").is_some() {
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
    #[cfg(not(feature = "mock-payments"))]
    Err("Mock payments are disabled: requires --features mock-payments")
}

pub(super) fn available() -> bool {
    cfg!(feature = "mock-payments") && std::env::var_os("NIU_MOCK_PAYMENT_URL").is_some()
}

const MOCK_HEALTH_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(2);

/// Public checkout is served by the host; merchant/control traffic stays on loopback.
pub(super) fn public_base() -> Result<Option<String>, &'static str> {
    let Ok(raw) = std::env::var("NIU_MOCK_PAYMENT_PUBLIC_URL") else {
        return Ok(None);
    };
    let url = url::Url::parse(&raw).map_err(|_| "Invalid mock public URL")?;
    let local = url.host_str().is_some_and(|host| {
        host.parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback())
    });
    if !(url.scheme() == "https" || (url.scheme() == "http" && local))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path().trim_end_matches('/') != "/api/plugins/v1/mock-payments"
    {
        return Err("Mock public URL must use HTTPS and /api/plugins/v1/mock-payments");
    }
    Ok(Some(raw.trim_end_matches('/').to_owned()))
}

/// Only checkout capabilities and their static UI are public, never merchant controls.
pub(crate) async fn checkout_proxy(
    axum::extract::Path(path): axum::extract::Path<String>,
    request: axum::extract::Request,
) -> axum::response::Response {
    use axum::{http::StatusCode, response::IntoResponse};
    if !available() {
        return StatusCode::NOT_FOUND.into_response();
    }
    let token_path = path
        .strip_prefix("checkout/")
        .or_else(|| path.strip_prefix("api/checkouts/"));
    let capability = token_path
        .is_some_and(|token| token.len() == 48 && token.bytes().all(|b| b.is_ascii_hexdigit()));
    let asset = path.strip_prefix("assets/").is_some_and(|name| {
        !name.is_empty()
            && name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
            && !name.contains("..")
    });
    let post = request.method() == axum::http::Method::POST;
    if (!capability && !asset) || (post && !path.starts_with("api/checkouts/")) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let Ok(Some(public)) = public_base() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let origin = url::Url::parse(&public)
        .expect("validated public URL")
        .origin()
        .ascii_serialization();
    if post
        && request
            .headers()
            .get("origin")
            .and_then(|v| v.to_str().ok())
            != Some(origin.as_str())
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Ok(base) = std::env::var("NIU_MOCK_PAYMENT_URL") else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(client) = shared_mock_client() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(body) = axum::body::to_bytes(request.into_body(), 16384).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    let mut upstream = client.request(
        if post {
            reqwest::Method::POST
        } else {
            reqwest::Method::GET
        },
        format!("{}/{path}", base.trim_end_matches('/')),
    );
    if post {
        upstream = upstream
            .header("Origin", base.trim_end_matches('/'))
            .header("Content-Type", "application/json")
            .body(body);
    }
    let Ok(response) = upstream.send().await else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    let status = response.status();
    let headers = response.headers().clone();
    let Ok(body) = response.bytes().await else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    let mut result = (status, body).into_response();
    for name in [
        "content-type",
        "cache-control",
        "content-security-policy",
        "referrer-policy",
        "x-content-type-options",
    ] {
        if let Some(value) = headers.get(name) {
            result
                .headers_mut()
                .insert(axum::http::HeaderName::from_static(name), value.clone());
        }
    }
    result
}

fn shared_mock_client() -> Result<&'static reqwest::Client, crate::error::ApiError> {
    static CLIENT: std::sync::OnceLock<Result<reqwest::Client, ()>> = std::sync::OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(std::time::Duration::from_secs(1))
                .timeout(std::time::Duration::from_secs(2))
                .build()
                .map_err(|_| ())
        })
        .as_ref()
        .map_err(|_| crate::error::ApiError::upstream_message("Mock service unavailable"))
}

fn mock_health_cache()
-> &'static tokio::sync::RwLock<Option<(String, std::time::Instant, serde_json::Value)>> {
    static CACHE: std::sync::OnceLock<
        tokio::sync::RwLock<Option<(String, std::time::Instant, serde_json::Value)>>,
    > = std::sync::OnceLock::new();
    CACHE.get_or_init(|| tokio::sync::RwLock::new(None))
}

async fn control_with_base(
    base: &str,
    key: &str,
    enabled: Option<bool>,
    use_cache: bool,
) -> Result<serde_json::Value, crate::error::ApiError> {
    use crate::error::ApiError;
    let normalized_base = base.trim_end_matches('/').to_owned();
    if enabled.is_none() && use_cache {
        let guard = mock_health_cache().read().await;
        if let Some((cached_base, cached_at, payload)) = &*guard
            && cached_base == &normalized_base
            && cached_at.elapsed() < MOCK_HEALTH_CACHE_TTL
        {
            return Ok(payload.clone());
        }
    }
    let client = shared_mock_client()?;
    let request = if let Some(enabled) = enabled {
        client
            .post(format!("{normalized_base}/control"))
            .basic_auth(key, Some(""))
            .json(&serde_json::json!({"enabled": enabled}))
    } else {
        client.get(format!("{normalized_base}/healthz"))
    };
    let response = request
        .send()
        .await
        .map_err(|_| ApiError::upstream_message("Mock service unavailable"))?;
    if !response.status().is_success()
        && !(enabled.is_none() && response.status() == reqwest::StatusCode::SERVICE_UNAVAILABLE)
    {
        return Err(ApiError::upstream_message(
            "Mock service rejected configuration",
        ));
    }
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|_| ApiError::upstream_message("Invalid mock service response"))?;
    if data["test"] != true || !data["enabled"].is_boolean() {
        return Err(ApiError::upstream_message("Invalid mock service response"));
    }
    let payload = serde_json::json!({
        "available": true,
        "enabled": data["enabled"],
        "readiness": data["readiness"],
    });
    *mock_health_cache().write().await =
        Some((normalized_base, std::time::Instant::now(), payload.clone()));
    Ok(payload)
}

async fn control(
    enabled: Option<bool>,
    use_cache: bool,
) -> Result<serde_json::Value, crate::error::ApiError> {
    use crate::error::ApiError;
    if !available() {
        return Ok(serde_json::json!({"available":false,"enabled":false}));
    }
    let base = std::env::var("NIU_MOCK_PAYMENT_URL")
        .map_err(|_| ApiError::invalid_request("Mock transport unavailable"))?;
    let key = std::env::var("NIU_MOCK_PAYMENT_KEY").unwrap_or_default();
    control_with_base(&base, &key, enabled, use_cache).await
}

pub(super) async fn enabled() -> bool {
    control(None, true)
        .await
        .is_ok_and(|data| data["enabled"] == true)
}

pub(super) async fn ready() -> bool {
    control(None, true)
        .await
        .is_ok_and(|data| data["enabled"] == true && data["readiness"] == "ready")
}

pub(crate) async fn environment() -> Result<axum::Json<serde_json::Value>, crate::error::ApiError> {
    let data = control(None, true).await?;
    Ok(axum::Json(
        serde_json::json!({"data":{"mock_payments":data["enabled"] == true}}),
    ))
}

pub(crate) async fn read(
    axum::extract::State(state): axum::extract::State<crate::state::AppState>,
    headers: axum::http::HeaderMap,
) -> Result<axum::Json<serde_json::Value>, crate::error::ApiError> {
    state.authorize_platform_headers(&headers).await?;
    Ok(axum::Json(
        serde_json::json!({"data":control(None, false).await?}),
    ))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Selection {
    enabled: bool,
}

pub(crate) async fn save(
    axum::extract::State(state): axum::extract::State<crate::state::AppState>,
    headers: axum::http::HeaderMap,
    axum::Json(input): axum::Json<Selection>,
) -> Result<axum::Json<serde_json::Value>, crate::error::ApiError> {
    state.authorize_platform_headers(&headers).await?;
    if !available() {
        return Err(crate::error::ApiError::invalid_request(
            "The mock payment plugin is not configured for this installation",
        ));
    }
    let _guard = state.payment_configuration_guard.write().await;
    if input.enabled
        && (state.payments.is_some() || super::configuration::runtime(&state).await?.is_some())
    {
        return Err(crate::error::ApiError::invalid_request(
            "Disable other payment gateways before enabling mock payments",
        ));
    }
    Ok(axum::Json(
        serde_json::json!({"data":control(Some(input.enabled), false).await?}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Json, Router,
        routing::{get, post},
    };
    use std::sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    };

    #[tokio::test]
    async fn cached_mock_readiness_avoids_per_request_health_probes_and_updates_on_control() {
        let health_calls = Arc::new(AtomicUsize::new(0));
        let enabled = Arc::new(AtomicBool::new(true));
        let health_calls_clone = health_calls.clone();
        let enabled_clone = enabled.clone();
        let enabled_control = enabled.clone();
        let app = Router::new()
            .route(
                "/healthz",
                get(move || {
                    let calls = health_calls_clone.clone();
                    let active = enabled_clone.load(Ordering::SeqCst);
                    async move {
                        calls.fetch_add(1, Ordering::SeqCst);
                        Json(serde_json::json!({
                            "test": true,
                            "enabled": active,
                            "readiness": if active { "ready" } else { "disabled" }
                        }))
                    }
                }),
            )
            .route(
                "/control",
                post(move |Json(body): Json<serde_json::Value>| {
                    let flag = body["enabled"].as_bool().unwrap_or(false);
                    enabled_control.store(flag, Ordering::SeqCst);
                    async move {
                        Json(serde_json::json!({
                            "test": true,
                            "enabled": flag,
                            "readiness": if flag { "ready" } else { "disabled" }
                        }))
                    }
                }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let first = control_with_base(&base, "sk_test_fixture", None, true)
            .await
            .unwrap();
        let second = control_with_base(&base, "sk_test_fixture", None, true)
            .await
            .unwrap();
        let third = control_with_base(&base, "sk_test_fixture", None, true)
            .await
            .unwrap();
        assert_eq!(first["readiness"], "ready");
        assert_eq!(second["readiness"], "ready");
        assert_eq!(third["readiness"], "ready");
        assert_eq!(
            health_calls.load(Ordering::SeqCst),
            1,
            "cached readiness must not hit /healthz per request"
        );

        let updated = control_with_base(&base, "sk_test_fixture", Some(false), false)
            .await
            .unwrap();
        assert_eq!(updated["enabled"], false);
        let after_disable = control_with_base(&base, "sk_test_fixture", None, true)
            .await
            .unwrap();
        assert_eq!(after_disable["enabled"], false);
        assert_eq!(
            health_calls.load(Ordering::SeqCst),
            1,
            "control update refreshes cache without extra /healthz poll"
        );

        server.abort();
    }
}
