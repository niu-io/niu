//! Built-in open-source reference plugin (`hello-echo`) demonstrating supervised HTTP routes
//! and Ed25519 JWS request context verification via `niu-plugin-sdk`.

use std::sync::Arc;

use axum::{
    Json, Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use niu_plugin_api::{PLUGIN_API_VERSION, PluginDescriptor, PluginFacet};
use niu_plugin_sdk::{JwsVerifier, PluginRuntimeState, PluginServiceBuilder};
use serde_json::{Value, json};

pub const PLUGIN_ID: &str = "hello-echo";

pub fn descriptor() -> PluginDescriptor {
    PluginDescriptor {
        plugin_id: PLUGIN_ID.into(),
        version: env!("CARGO_PKG_VERSION").into(),
        api_version: PLUGIN_API_VERSION.into(),
        facets: vec![PluginFacet::Routes],
    }
}

pub fn build_service(verifier: Option<Arc<JwsVerifier>>) -> PluginServiceBuilder {
    let verifier_for_echo = verifier.clone();
    let routes = Router::<PluginRuntimeState>::new()
        .route(
            "/api/plugins/v1/hello-echo/ping",
            get(|| async {
                Json(json!({
                    "plugin_id": PLUGIN_ID,
                    "status": "pong",
                }))
            }),
        )
        .route(
            "/api/plugins/v1/hello-echo/echo",
            post(move |request: Request<Body>| {
                let verifier = verifier_for_echo.clone();
                async move { handle_echo(request, verifier).await }
            }),
        );
    PluginServiceBuilder::new(PLUGIN_ID).merge_routes(routes)
}

async fn handle_echo(request: Request<Body>, verifier: Option<Arc<JwsVerifier>>) -> Response {
    let (parts, body) = request.into_parts();
    let Ok(bytes) = to_bytes(body, 65_536).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    let path_and_query = parts
        .uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or_else(|| parts.uri.path());

    let verified_context = if let Some(verifier) = verifier {
        match verifier.verify(&parts.headers, &parts.method, path_and_query, &bytes) {
            Ok(ctx) => Some(ctx),
            Err(err) => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({ "error": err.to_string() })),
                )
                    .into_response();
            }
        }
    } else {
        None
    };

    let payload: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (
        StatusCode::OK,
        Json(json!({
            "plugin_id": PLUGIN_ID,
            "echo": payload,
            "context": verified_context,
        })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn descriptor_is_valid() {
        assert!(descriptor().validate().is_ok());
    }
}
