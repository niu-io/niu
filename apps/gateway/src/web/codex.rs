use std::time::Duration;

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, Uri, header},
};
use serde_json::{Value, json};

use crate::{error::ApiError, state::AppState};

const CODEX_BASE: &str = "https://chatgpt.com/backend-api/codex";
const MAX_CATALOG_BYTES: usize = 1024 * 1024;
const MAX_CATALOG_MODELS: usize = 2_000;

/// Return the ChatGPT Codex model catalog filtered to Codex routes available to
/// this Niu project key. The destination is fixed; the ChatGPT token is never
/// sent to an operator-configured provider URL.
pub(super) async fn models(
    State(state): State<AppState>,
    headers: HeaderMap,
    uri: Uri,
) -> Result<Json<Value>, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    let forwarded_headers = super::inference::codex_forward_headers(&headers)?;
    let routes = crate::vendors::effective_models(&state).await?;
    let upstream_aliases = routes
        .into_iter()
        .filter(|(alias, model)| {
            model.uses_codex_chatgpt_auth()
                && model.supports_responses
                && principal.allows_model(alias)
        })
        .fold(
            std::collections::HashMap::<String, Vec<String>>::new(),
            |mut aliases, (alias, model)| {
                aliases.entry(model.upstream_model).or_default().push(alias);
                aliases
            },
        );
    if upstream_aliases.is_empty() {
        return Ok(Json(json!({"models": []})));
    }

    let endpoint = format!("{CODEX_BASE}/models");
    let client = crate::upstream::client_for_endpoint(
        &endpoint,
        Duration::from_secs(state.config.server.request_timeout_seconds.clamp(1, 5)),
    )
    .await
    .map_err(|_| ApiError::unavailable())?;
    let mut url = url::Url::parse(&endpoint).map_err(|_| ApiError::unavailable())?;
    if let Some(query) = uri.query() {
        let parameters = url::form_urlencoded::parse(query.as_bytes()).collect::<Vec<_>>();
        if parameters.len() != 1
            || parameters[0].0 != "client_version"
            || parameters[0].1.is_empty()
            || parameters[0].1.len() > 64
            || !parameters[0]
                .1
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b".-_".contains(&byte))
        {
            return Err(ApiError::invalid_request(
                "Invalid Codex model catalog query",
            ));
        }
        url.query_pairs_mut()
            .append_pair("client_version", &parameters[0].1);
    }
    let mut upstream = client
        .get(url)
        .headers(forwarded_headers)
        .header(header::ACCEPT, "application/json")
        .timeout(Duration::from_secs(
            state.config.server.request_timeout_seconds.clamp(1, 5),
        ))
        .send()
        .await
        .map_err(|_| ApiError::upstream())?;
    if !upstream.status().is_success() {
        return Err(match upstream.status() {
            axum::http::StatusCode::UNAUTHORIZED => ApiError::upstream_authentication(),
            axum::http::StatusCode::FORBIDDEN => ApiError::upstream_forbidden(),
            axum::http::StatusCode::TOO_MANY_REQUESTS => ApiError::upstream_rate_limited(),
            _ => ApiError::upstream(),
        });
    }
    if upstream
        .content_length()
        .is_some_and(|length| length > MAX_CATALOG_BYTES as u64)
    {
        return Err(ApiError::upstream());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = upstream.chunk().await.map_err(|_| ApiError::upstream())? {
        if bytes.len().saturating_add(chunk.len()) > MAX_CATALOG_BYTES {
            return Err(ApiError::upstream());
        }
        bytes.extend_from_slice(&chunk);
    }
    let mut catalog: Value = serde_json::from_slice(&bytes).map_err(|_| ApiError::upstream())?;
    let models = catalog
        .get_mut("models")
        .and_then(Value::as_array_mut)
        .ok_or_else(ApiError::upstream)?;
    let mut filtered = Vec::new();
    for model in models.drain(..).take(MAX_CATALOG_MODELS) {
        let Some(slug) = model.get("slug").and_then(Value::as_str) else {
            continue;
        };
        let Some(aliases) = upstream_aliases.get(slug) else {
            continue;
        };
        for alias in aliases {
            let Some(mut model) = model.as_object().cloned() else {
                continue;
            };
            model.insert("slug".to_owned(), json!(alias));
            filtered.push(Value::Object(model));
            if filtered.len() == MAX_CATALOG_MODELS {
                break;
            }
        }
        if filtered.len() == MAX_CATALOG_MODELS {
            break;
        }
    }
    Ok(Json(json!({"models": filtered})))
}
