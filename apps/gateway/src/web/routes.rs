use std::sync::atomic::Ordering;

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, HeaderValue, StatusCode, header::CACHE_CONTROL},
    middleware::{self, Next},
    response::Response,
    routing::{any, get},
};
use serde_json::{Value, json};

use crate::{error::ApiError, state::AppState};

use super::inference::{bearer, chat, embeddings, responses};

pub(crate) fn router(state: AppState) -> Router {
    let enterprise_enabled = state.enterprise.is_some();
    let app = Router::new()
        .route("/admin/v1/session", get(crate::admin::current_session))
        .route(
            "/admin/v1/setup/default-workspace",
            axum::routing::post(crate::admin::default_workspace),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/collector-keys",
            axum::routing::post(crate::admin::issue_collector_key),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/collector-keys/{id}",
            axum::routing::delete(crate::admin::revoke_collector_key),
        )
        .merge(super::static_site::router())
        .route("/healthz", get(health))
        .route("/readyz", get(ready))
        .route("/enterprise/readyz", get(enterprise_ready))
        .route(
            "/admin/v1/organizations",
            get(crate::admin::organizations).post(crate::admin::organization),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects",
            get(crate::admin::projects).post(crate::admin::project),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/keys",
            get(crate::admin::keys).post(crate::admin::issue_key),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}",
            axum::routing::delete(crate::admin::revoke_key),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/rotate",
            axum::routing::post(crate::admin::rotate_key),
        )
        .route(
            "/admin/v1/operators",
            get(crate::admin::operators).post(crate::admin::create_operator),
        )
        .route(
            "/admin/v1/operators/{operator}",
            axum::routing::delete(crate::admin::revoke_operator),
        )
        .route(
            "/admin/v1/operators/{operator}/sessions",
            get(crate::admin::operator_sessions).post(crate::admin::create_operator_session),
        )
        .route(
            "/admin/v1/operators/{operator}/events",
            get(crate::admin::operator_events),
        )
        .route(
            "/admin/v1/operators/{operator}/sessions/{session}",
            axum::routing::delete(crate::admin::revoke_operator_session),
        )
        .route("/catalog/v1/models", get(catalog_models))
        .route("/v1/models", get(public_models))
        .route("/v1/chat/completions", axum::routing::post(chat))
        .route("/v1/responses", axum::routing::post(responses))
        .route("/v1/embeddings", axum::routing::post(embeddings))
        .route("/admin/v1/models", get(admin_models))
        .route("/admin/v1/vendors", get(crate::vendors::list).post(crate::vendors::create))
        .route("/admin/v1/vendors/{id}", axum::routing::put(crate::vendors::update))
        .route("/admin/v1/vendors/{id}/models", get(crate::vendors::list_models).post(crate::vendors::upsert_model))
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/accounts",
            get(crate::admin::accounts).post(crate::admin::create_account),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/quota",
            get(crate::admin::quota)
                .post(crate::admin::observe_quota)
                .delete(crate::admin::delete_quota_window),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/accounts/{account}/executions",
            get(crate::admin::account_executions),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/budget",
            get(crate::admin::budget).post(crate::admin::create_budget),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/costs",
            get(crate::admin::costs),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/requests",
            get(crate::admin::gateway_activity),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/execution-imports",
            get(crate::admin::execution_imports).post(crate::admin::import_execution),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/execution-imports/{execution}",
            get(crate::admin::execution_import).delete(crate::admin::delete_execution_import),
        )
        // The concise aliases are used by the console. The explicit
        // execution-imports paths remain available for API and SDK clients.
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/executions",
            get(crate::admin::execution_imports).post(crate::admin::import_execution),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/executions/cohort",
            get(crate::admin::execution_cohort),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/executions/{execution}",
            get(crate::admin::execution_import).delete(crate::admin::delete_execution_import),
        )
        .route("/admin/v1/metrics", get(admin_metrics))
        .route(
            "/admin/v1/benchmarks/compare",
            axum::routing::post(crate::admin::compare_benchmark),
        )
        .route("/v1", any(api_not_found))
        .route("/v1/{*path}", any(api_not_found))
        .route("/catalog/v1", any(api_not_found))
        .route("/catalog/v1/{*path}", any(api_not_found))
        .route("/admin/v1", any(api_not_found))
        .route("/admin/v1/{*path}", any(api_not_found))
        .layer(DefaultBodyLimit::max(1_048_576));
    let app = if enterprise_enabled {
        app.route("/enterprise/api/v1", any(crate::enterprise::handle))
            .route("/enterprise/api/v1/{*path}", any(crate::enterprise::handle))
    } else {
        app
    };
    app.layer(middleware::from_fn(private_api_cache_control))
        .with_state(state)
}

async fn private_api_cache_control(request: axum::http::Request<Body>, next: Next) -> Response {
    let path = request.uri().path();
    let private = path == "/admin/v1"
        || path.starts_with("/admin/v1/")
        || path == "/enterprise/api/v1"
        || path.starts_with("/enterprise/api/v1/")
        || path == "/v1"
        || path.starts_with("/v1/");
    let mut response = next.run(request).await;
    if private {
        response
            .headers_mut()
            .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    }
    response
}

async fn api_not_found() -> ApiError {
    ApiError::not_found()
}

async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "niu"
    }))
}

async fn ready(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    state.store.ready().await.map_err(ApiError::from_store)?;
    Ok(Json(json!({"status": "ok"})))
}

async fn enterprise_ready(
    State(state): State<AppState>,
) -> (
    StatusCode,
    [(axum::http::HeaderName, &'static str); 1],
    Json<Value>,
) {
    let no_store = [(CACHE_CONTROL, "no-store")];
    let Some(enterprise) = state.enterprise.as_deref() else {
        return (StatusCode::OK, no_store, Json(json!({"status":"disabled"})));
    };
    let ready = tokio::time::timeout(std::time::Duration::from_secs(3), async {
        let (core, modules) = tokio::join!(state.store.ready(), enterprise.ready());
        core.is_ok() && modules
    })
    .await
    .unwrap_or(false);
    if ready {
        (StatusCode::OK, no_store, Json(json!({"status":"ok"})))
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            no_store,
            Json(json!({"status":"unavailable"})),
        )
    }
}

async fn public_models(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = state.authorize_api(bearer(&headers)).await?;
    let models = crate::vendors::effective_models(&state).await?;
    let data: Vec<_> = models
        .keys()
        .filter(|model| principal.allows_model(model))
        .map(|model| json!({"id": model, "object": "model", "owned_by": "niu"}))
        .collect();
    Ok(Json(json!({"object": "list", "data": data})))
}

async fn catalog_models(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let models = crate::vendors::effective_models(&state).await?;
    let data: Vec<_> = models
        .iter()
        .filter(|(_, model)| model.public_catalog)
        .map(|(name, model)| {
            json!({
                "id": name,
                "object": "model",
                "owned_by": "niu",
                "capabilities": {
                    "chat_completions": true,
                    "streaming": model.protocol().supports_streaming(),
                    "embeddings": model.supports_embeddings,
                    "responses": model.supports_responses
                }
            })
        })
        .collect();
    Ok(Json(json!({"object": "list", "data": data})))
}

async fn admin_models(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let authorization = state
        .authorize_admin(bearer(&headers), niu_storage::AdminPermission::Read)
        .await?;
    let models = crate::vendors::effective_models(&state).await?;
    let data: Vec<_> = models
        .iter()
        .map(|(name, model)| {
            let capabilities = json!({
                "supports_embeddings": model.supports_embeddings,
                "supports_embedding_dimensions": model.supports_embedding_dimensions,
                "supports_embedding_base64": model.supports_embedding_base64,
                "supports_tool_calls": model.supports_tool_calls,
                "supports_streaming_tool_calls": model.supports_streaming_tool_calls,
                "supports_structured_output": model.supports_structured_output,
                "supports_responses": model.supports_responses
            });
            if authorization.is_installation() {
                json!({
                "id": name,
                "provider": model.provider,
                "upstream_model": model.upstream_model,
                "public_catalog": model.public_catalog,
                    "supports_embeddings": model.supports_embeddings,
                    "supports_embedding_dimensions": model.supports_embedding_dimensions,
                    "supports_embedding_base64": model.supports_embedding_base64,
                    "supports_tool_calls": model.supports_tool_calls,
                    "supports_streaming_tool_calls": model.supports_streaming_tool_calls,
                    "supports_structured_output": model.supports_structured_output,
                    "supports_responses": model.supports_responses
                })
            } else {
                json!({
                    "id": name,
                    "public_catalog": model.public_catalog,
                    "capabilities": capabilities
                })
            }
        })
        .collect();
    Ok(Json(json!({"data": data})))
}

async fn admin_metrics(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let authorization = state
        .authorize_admin(bearer(&headers), niu_storage::AdminPermission::Read)
        .await?;
    if !authorization.is_installation() {
        return Err(ApiError::forbidden());
    }
    let usage = state.usage.snapshot();
    Ok(Json(json!({
        "requests_total": state.requests.load(Ordering::Relaxed),
        "requests_failed": state.failures.load(Ordering::Relaxed),
        "prompt_tokens": usage.prompt_tokens,
        "completion_tokens": usage.completion_tokens,
        "usage": usage
    })))
}
