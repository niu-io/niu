use std::sync::atomic::Ordering;

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header::CACHE_CONTROL},
    middleware::{self, Next},
    response::Response,
    routing::{any, get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{error::ApiError, state::AppState};

use super::inference::{chat, embeddings, generate_content, messages, responses};

async fn password_response_headers(request: axum::http::Request<Body>, next: Next) -> Response {
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if response.status() == StatusCode::TOO_MANY_REQUESTS {
        response
            .headers_mut()
            .insert("retry-after", HeaderValue::from_static("60"));
    }
    response
}

pub(crate) fn router(state: AppState) -> Router {
    let enterprise_enabled = state.enterprise.is_some();
    let app = Router::new()
        .route("/admin/v1/organizations/{organization}/projects/{project}/assets", get(super::workspace_assets::list).post(super::workspace_assets::upload).layer(DefaultBodyLimit::max(8 * 1024 * 1024)))
        .route("/api/v1/organizations/{organization}/projects/{project}/assets", get(super::workspace_assets::list).post(super::workspace_assets::upload).layer(DefaultBodyLimit::max(8 * 1024 * 1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/assets/{asset}", get(super::workspace_assets::get).patch(super::workspace_assets::rename).delete(super::workspace_assets::delete).layer(DefaultBodyLimit::max(1024)))
        .route("/api/v1/organizations/{organization}/projects/{project}/assets/{asset}", get(super::workspace_assets::get).patch(super::workspace_assets::rename).delete(super::workspace_assets::delete).layer(DefaultBodyLimit::max(1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/assets/{asset}/content", get(super::workspace_assets::content))
        .route("/api/v1/organizations/{organization}/projects/{project}/assets/{asset}/content", get(super::workspace_assets::content))
        .route("/admin/v1/organizations/{organization}/projects/{project}/video-intents", get(super::inference::video_intents::list))
        .route("/api/v1/organizations/{organization}/projects/{project}/video-intents", get(super::inference::video_intents::list))
        .route("/admin/v1/organizations/{organization}/projects/{project}/video-intents/{intent}", get(super::inference::video_intents::get).put(super::inference::video_intents::save).delete(super::inference::video_intents::delete).layer(DefaultBodyLimit::max(64 * 1024)))
        .route("/api/v1/organizations/{organization}/projects/{project}/video-intents/{intent}", get(super::inference::video_intents::get).put(super::inference::video_intents::save).delete(super::inference::video_intents::delete).layer(DefaultBodyLimit::max(64 * 1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/video-intents/{intent}/submit", post(super::inference::video_intents::submit))
        .route("/api/v1/organizations/{organization}/projects/{project}/video-intents/{intent}/submit", post(super::inference::video_intents::submit))
        .route("/v1/media/image-ingestions", get(super::image_ingestions::list))
        .route("/v1/media/image-ingestions/{id}/readiness/{read_id}", get(super::image_readiness::status).post(super::image_readiness::refresh))
        .route("/v1/media/image-sources", axum::routing::post(super::image_source_uploads::prepare).layer(DefaultBodyLimit::max(12*1024*1024+1024)))
        .route("/v1/media/image-sources/{id}", axum::routing::delete(super::image_source_uploads::erase))
        .route("/v1/media/image-ingestions/{id}/dispatch", axum::routing::post(super::image_ingestions::dispatch))
        .route("/v1/media/image-ingestions/{id}", get(super::image_ingestions::read).put(super::image_ingestions::prepare).delete(super::image_ingestions::revoke))
        .route("/v1/media/sources/{token}", get(super::image_sources::read).head(super::image_sources::reject_head))
        .route("/admin/v1/organizations/{organization}/projects/{project}/asset-group-intents", get(crate::admin::asset_requests::list))
        .route("/api/v1/organizations/{organization}/projects/{project}/asset-group-intents", get(crate::admin::asset_requests::list))
        .route("/admin/v1/organizations/{organization}/projects/{project}/asset-group-intents/{intent}/request", get(crate::admin::asset_requests::get).delete(crate::admin::asset_requests::delete))
        .route("/api/v1/organizations/{organization}/projects/{project}/asset-group-intents/{intent}/request", get(crate::admin::asset_requests::get).delete(crate::admin::asset_requests::delete))
        .route("/auth/callback", get(crate::codex::callback))
        .route("/payments/zhifux/notify", axum::routing::post(crate::payments::notify).layer(DefaultBodyLimit::max(8192)))
        .route("/payments/epay/notify", get(crate::payments::epay_notify_get).post(crate::payments::epay_notify_post).layer(DefaultBodyLimit::max(8192)))
        .route("/payments/stripe/notify", axum::routing::post(crate::payments::stripe_notify).layer(DefaultBodyLimit::max(262144)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/codex-connections", get(crate::codex::list))
        .route("/api/v1/organizations/{organization}/projects/{project}/codex-connections", get(crate::codex::list))
        .route("/admin/v1/organizations/{organization}/projects/{project}/codex-connections/sign-in", axum::routing::post(crate::codex::start))
        .route("/api/v1/organizations/{organization}/projects/{project}/codex-connections/sign-in", axum::routing::post(crate::codex::start))
        .route("/admin/v1/organizations/{organization}/projects/{project}/codex-connections/{id}", axum::routing::patch(crate::codex::set_enabled))
        .route("/api/v1/organizations/{organization}/projects/{project}/codex-connections/{id}", axum::routing::patch(crate::codex::set_enabled))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/detectors", get(crate::admin::guardrails::workspace_detectors))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails/detectors", get(crate::admin::guardrails::workspace_detectors))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/media-detectors", get(crate::admin::media_detectors::list))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails/media-detectors", get(crate::admin::media_detectors::list))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors", get(crate::admin::guardrails::workspace_image_detectors))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors", get(crate::admin::guardrails::workspace_image_detectors))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors/{detector}/preview", axum::routing::post(crate::admin::guardrails::image_detector_preview).layer(DefaultBodyLimit::max(2 * 1024 * 1024)))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors/{detector}/preview", axum::routing::post(crate::admin::guardrails::image_detector_preview).layer(DefaultBodyLimit::max(2 * 1024 * 1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/detector-decisions", get(crate::admin::guardrails::detector_decisions))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails/detector-decisions", get(crate::admin::guardrails::detector_decisions))
        .route("/admin/v1/guardrails/detectors/{detector}", get(crate::admin::guardrails::detector_description))
        .route("/api/v1/guardrails/detectors/{detector}", get(crate::admin::guardrails::detector_description))
        .route("/admin/v1/guardrails/detectors/{detector}/preview", axum::routing::post(crate::admin::guardrails::detector_preview))
        .route("/api/v1/guardrails/detectors/{detector}/preview", axum::routing::post(crate::admin::guardrails::detector_preview))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/output-preview", axum::routing::post(crate::admin::guardrails::output_preview))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails/output-preview", axum::routing::post(crate::admin::guardrails::output_preview))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/revisions/{revision}", get(crate::admin::guardrails::read_revision))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails/revisions/{revision}", get(crate::admin::guardrails::read_revision))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/history", get(crate::admin::guardrails::history))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails/history", get(crate::admin::guardrails::history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail/history", get(crate::admin::guardrails::key_history))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail/history", get(crate::admin::guardrails::key_history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail", get(crate::admin::guardrails::read_key_assignment).put(crate::admin::guardrails::assign_key))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail", get(crate::admin::guardrails::read_key_assignment).put(crate::admin::guardrails::assign_key))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails", get(crate::admin::guardrails::read).put(crate::admin::guardrails::activate))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails", get(crate::admin::guardrails::read).put(crate::admin::guardrails::activate))
        .route("/admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}/guardrails", get(crate::admin::guardrails::dispatch_decision))
        .route("/api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/guardrails", get(crate::admin::guardrails::dispatch_decision))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/denials", get(crate::admin::guardrails::preparation_denials))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails/denials", get(crate::admin::guardrails::preparation_denials))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/dispatch-denials", get(crate::admin::guardrails::dispatch_denials))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails/dispatch-denials", get(crate::admin::guardrails::dispatch_denials))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/input-preview", axum::routing::post(crate::admin::guardrails::input_preview))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails/input-preview", axum::routing::post(crate::admin::guardrails::input_preview))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/preview", axum::routing::post(crate::admin::guardrails::preview))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails/preview", axum::routing::post(crate::admin::guardrails::preview))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/rollback", axum::routing::post(crate::admin::guardrails::rollback))
        .route("/api/v1/organizations/{organization}/projects/{project}/guardrails/rollback", axum::routing::post(crate::admin::guardrails::rollback))
        .route("/admin/v1/organizations/{organization}/projects/{project}/video-draft", get(crate::admin::video_composer_drafts::draft).put(crate::admin::video_composer_drafts::save_draft).layer(DefaultBodyLimit::max(64 * 1024)).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/organizations/{organization}/projects/{project}/video-draft", get(crate::admin::video_composer_drafts::draft).put(crate::admin::video_composer_drafts::save_draft).layer(DefaultBodyLimit::max(64 * 1024)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/chat-draft", get(crate::admin::chat_sessions::draft).put(crate::admin::chat_sessions::save_draft).layer(DefaultBodyLimit::max(24 * 1024 * 1024)).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/organizations/{organization}/projects/{project}/chat-draft", get(crate::admin::chat_sessions::draft).put(crate::admin::chat_sessions::save_draft).layer(DefaultBodyLimit::max(24 * 1024 * 1024)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/chat-sessions", get(crate::admin::chat_sessions::list))
        .route("/api/v1/organizations/{organization}/projects/{project}/chat-sessions", get(crate::admin::chat_sessions::list))
        .route("/admin/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}/archive", axum::routing::put(crate::admin::chat_sessions::archive).layer(DefaultBodyLimit::max(1024)))
        .route("/api/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}/archive", axum::routing::put(crate::admin::chat_sessions::archive).layer(DefaultBodyLimit::max(1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}/export", get(crate::admin::chat_sessions::export))
        .route("/api/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}/export", get(crate::admin::chat_sessions::export))
        .route("/admin/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}", get(crate::admin::chat_sessions::get).put(crate::admin::chat_sessions::save).delete(crate::admin::chat_sessions::delete).layer(DefaultBodyLimit::max(24 * 1024 * 1024)))
        .route("/api/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}", get(crate::admin::chat_sessions::get).put(crate::admin::chat_sessions::save).delete(crate::admin::chat_sessions::delete).layer(DefaultBodyLimit::max(24 * 1024 * 1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/refresh", axum::routing::post(super::inference::generations_task_actions::refresh).layer(DefaultBodyLimit::max(1024)))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/refresh", axum::routing::post(super::inference::generations_task_actions::refresh).layer(DefaultBodyLimit::max(1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/results/{kind}/refresh", axum::routing::post(super::inference::generations_task_actions::fresh_result).layer(DefaultBodyLimit::max(1024)))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/results/{kind}/refresh", axum::routing::post(super::inference::generations_task_actions::fresh_result).layer(DefaultBodyLimit::max(1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}/capture", get(super::inference::generations_artifact_captures::retrieve).post(super::inference::generations_artifact_captures::capture).layer(DefaultBodyLimit::max(1024)))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}/capture", get(super::inference::generations_artifact_captures::retrieve).post(super::inference::generations_artifact_captures::capture).layer(DefaultBodyLimit::max(1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations/tasks", get(super::inference::generations_inventory::tasks))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations/tasks", get(super::inference::generations_inventory::tasks))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}", get(super::inference::generations_inventory::task))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}", get(super::inference::generations_inventory::task))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/diagnostics", get(super::inference::generations_task_diagnostics::retrieve))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations/tasks/{task}/diagnostics", get(super::inference::generations_task_diagnostics::retrieve))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations/artifacts", get(super::inference::generations_inventory::artifacts))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations/artifacts", get(super::inference::generations_inventory::artifacts))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}", get(super::inference::generations_inventory::artifact))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}", get(super::inference::generations_inventory::artifact))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}/content", get(super::inference::generations_inventory::content))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}/content", get(super::inference::generations_inventory::content))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations-sessions", get(super::inference::generations_sessions::list).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations-sessions", get(super::inference::generations_sessions::list).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}", get(super::inference::generations_sessions::get).put(super::inference::generations_sessions::create).patch(super::inference::generations_sessions::update).layer(DefaultBodyLimit::max(65536)).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}", get(super::inference::generations_sessions::get).put(super::inference::generations_sessions::create).patch(super::inference::generations_sessions::update).layer(DefaultBodyLimit::max(65536)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}/turns/{turn}", axum::routing::put(super::inference::generations_sessions::append).delete(super::inference::generations_sessions::delete_instruction).layer(DefaultBodyLimit::max(65536)).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}/turns/{turn}", axum::routing::put(super::inference::generations_sessions::append).delete(super::inference::generations_sessions::delete_instruction).layer(DefaultBodyLimit::max(65536)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}/turns/{turn}/task", axum::routing::put(super::inference::generations_sessions::attach).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}/turns/{turn}/task", axum::routing::put(super::inference::generations_sessions::attach).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}/turns/{turn}/intent", axum::routing::put(super::inference::generations_sessions::bind_intent).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/organizations/{organization}/projects/{project}/generations-sessions/{session}/turns/{turn}/intent", axum::routing::put(super::inference::generations_sessions::bind_intent).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/organizations/{organization}/billing/transactions", get(crate::billing::balance_transactions))
        .route("/api/v1/organizations/{organization}/billing/transactions", get(crate::billing::balance_transactions))
        .route("/admin/v1/organizations/{organization}/billing/topups/{order}/reconcile", axum::routing::post(crate::payments::reconcile))
        .route("/api/v1/organizations/{organization}/billing/topups/{order}/reconcile", axum::routing::post(crate::payments::reconcile))
        .route("/admin/v1/organizations/{organization}/billing/topups", get(crate::payments::topup_history).post(crate::payments::create_topup))
        .route("/api/v1/organizations/{organization}/billing/topups", get(crate::payments::topup_history).post(crate::payments::create_topup))
        .route("/admin/v1/organizations/{organization}/billing/payment-methods", get(crate::payments::payment_methods))
        .route("/api/v1/organizations/{organization}/billing/payment-methods", get(crate::payments::payment_methods))
        .route("/admin/v1/organizations/{organization}/billing/topups/{order}", get(crate::payments::topup_status))
        .route("/api/v1/organizations/{organization}/billing/topups/{order}", get(crate::payments::topup_status))
        .route("/admin/v1/organizations/{organization}/billing/entries/{entry}/reversal", axum::routing::post(crate::billing::balance_reversal))
        .route("/api/v1/organizations/{organization}/billing/entries/{entry}/reversal", axum::routing::post(crate::billing::balance_reversal))
        .route("/admin/v1/organizations/{organization}/billing/accounts/{currency}/warning-threshold", axum::routing::put(crate::billing::balance_warning))
        .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/warning-threshold", axum::routing::put(crate::billing::balance_warning))
        .route("/admin/v1/organizations/{organization}/billing/accounts/{currency}/policy/history", get(crate::billing::balance_policy_history::history))
        .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/policy/history", get(crate::billing::balance_policy_history::history))
        .route("/admin/v1/organizations/{organization}/billing/accounts/{currency}/policy", axum::routing::put(crate::billing::balance_policy))
        .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/policy", axum::routing::put(crate::billing::balance_policy))
        .route("/admin/v1/organizations/{organization}/billing/accounts/{currency}/grants", axum::routing::post(crate::billing::noncash_grants::issue).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/grants", axum::routing::post(crate::billing::noncash_grants::issue).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/admin/v1/organizations/{organization}/billing/balance", get(crate::billing::account_balance))
        .route("/api/v1/organizations/{organization}/billing/balance", get(crate::billing::account_balance))
        .route("/admin/v1/organizations/{organization}/billing/charge-reconciliation", get(crate::billing::charge_reconciliation))
        .route("/api/v1/organizations/{organization}/billing/charge-reconciliation", get(crate::billing::charge_reconciliation))
        .route("/admin/v1/organizations/{organization}/billing/reservations", get(crate::billing::reservations::list))
        .route("/api/v1/organizations/{organization}/billing/reservations", get(crate::billing::reservations::list))
        .route("/admin/v1/organizations/{organization}/billing/media-rates/{revision}/retire", axum::routing::post(crate::billing::retire_media_rate).layer(axum::extract::DefaultBodyLimit::max(1024)))
        .route("/api/v1/organizations/{organization}/billing/media-rates/{revision}/retire", axum::routing::post(crate::billing::retire_media_rate).layer(axum::extract::DefaultBodyLimit::max(1024)))
        .route("/admin/v1/providers/{provider}/media-rates/{revision}/retire", axum::routing::post(crate::providers::retire_media_rate).layer(axum::extract::DefaultBodyLimit::max(1024)))
        .route("/api/v1/providers/{provider}/media-rates/{revision}/retire", axum::routing::post(crate::providers::retire_media_rate).layer(axum::extract::DefaultBodyLimit::max(1024)))
        .route("/admin/v1/providers/{provider}/media-offer-models", get(crate::providers::media_offer_models))
        .route("/api/v1/providers/{provider}/media-offer-models", get(crate::providers::media_offer_models))
        .route("/admin/v1/providers/{provider}/media-offers", axum::routing::post(crate::providers::publish_media_offer).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/api/v1/providers/{provider}/media-offers", axum::routing::post(crate::providers::publish_media_offer).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/admin/v1/providers/{provider}/media-rate-models", get(crate::providers::media_rate_models))
        .route("/api/v1/providers/{provider}/media-rate-models", get(crate::providers::media_rate_models))
        .route("/admin/v1/providers/{provider}/media-rates/replace", axum::routing::post(crate::providers::replace_media_rate).layer(axum::extract::DefaultBodyLimit::max(128 * 1024)))
        .route("/api/v1/providers/{provider}/media-rates/replace", axum::routing::post(crate::providers::replace_media_rate).layer(axum::extract::DefaultBodyLimit::max(128 * 1024)))
        .route("/admin/v1/providers/{provider}/media-rates", get(crate::providers::media_rates).post(crate::providers::media_rate).layer(axum::extract::DefaultBodyLimit::max(128 * 1024)))
        .route("/api/v1/providers/{provider}/media-rates", get(crate::providers::media_rates).post(crate::providers::media_rate).layer(axum::extract::DefaultBodyLimit::max(128 * 1024)))
        .route("/admin/v1/organizations/{organization}/billing/media-rate-models", get(crate::billing::media_rate_models))
        .route("/api/v1/organizations/{organization}/billing/media-rate-models", get(crate::billing::media_rate_models))
        .route("/admin/v1/organizations/{organization}/billing/media-rates/replace", axum::routing::post(crate::billing::replace_media_rate).layer(axum::extract::DefaultBodyLimit::max(128 * 1024)))
        .route("/api/v1/organizations/{organization}/billing/media-rates/replace", axum::routing::post(crate::billing::replace_media_rate).layer(axum::extract::DefaultBodyLimit::max(128 * 1024)))
        .route("/admin/v1/organizations/{organization}/billing/media-rates", get(crate::billing::media_rates).post(crate::billing::media_rate).layer(axum::extract::DefaultBodyLimit::max(128 * 1024)))
        .route("/api/v1/organizations/{organization}/billing/media-rates", get(crate::billing::media_rates).post(crate::billing::media_rate).layer(axum::extract::DefaultBodyLimit::max(128 * 1024)))
        .route("/admin/v1/organizations/{organization}/billing/funding/settled", axum::routing::post(crate::billing::settled_funding))
        .route("/api/v1/organizations/{organization}/billing/funding/settled", axum::routing::post(crate::billing::settled_funding))
        .route("/admin/v1/pricing/models", get(crate::billing::platform_pricing::models))
        .route("/api/v1/pricing/models", get(crate::billing::platform_pricing::models))
        .route("/admin/v1/commercial-position", get(crate::billing::commercial_position::read))
        .route("/api/v1/commercial-position", get(crate::billing::commercial_position::read))
        .route("/admin/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepare", axum::routing::post(crate::billing::noncash_grants::prepare).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepare", axum::routing::post(crate::billing::noncash_grants::prepare).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/admin/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepared", get(crate::billing::noncash_grants::prepared))
        .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepared", get(crate::billing::noncash_grants::prepared))
        .route("/admin/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepared/{key}", get(crate::billing::noncash_grants::prepared_by_key))
        .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepared/{key}", get(crate::billing::noncash_grants::prepared_by_key))
        .route("/admin/v1/platform/customer-accounts", get(crate::billing::platform_accounts::list))
        .route("/api/v1/platform/customer-accounts", get(crate::billing::platform_accounts::list))
        .route("/admin/v1/financial-summary", get(crate::billing::financial_summary::read))
        .route("/api/v1/financial-summary", get(crate::billing::financial_summary::read))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing/media-retail-price-enrollment", get(crate::billing::media_retail_enrollment::read).post(crate::billing::media_retail_enrollment::publish).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/api/v1/organizations/{organization}/projects/{project}/billing/media-retail-price-enrollment", get(crate::billing::media_retail_enrollment::read).post(crate::billing::media_retail_enrollment::publish).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/admin/v1/providers/{supplier}/offers/{offer}/media-liability-bounds", get(crate::billing::media_liability::list).post(crate::billing::media_liability::publish).layer(axum::extract::DefaultBodyLimit::max(16384)))
        .route("/api/v1/providers/{supplier}/offers/{offer}/media-liability-bounds", get(crate::billing::media_liability::list).post(crate::billing::media_liability::publish).layer(axum::extract::DefaultBodyLimit::max(16384)))
        .route("/admin/v1/providers/{supplier}/offers/{offer}/media-liability-bounds/{revision}/retire", axum::routing::post(crate::billing::media_liability::retire).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/api/v1/providers/{supplier}/offers/{offer}/media-liability-bounds/{revision}/retire", axum::routing::post(crate::billing::media_liability::retire).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing/retail-price-enrollment", get(crate::billing::retail_pricing::enrollment).post(crate::billing::retail_pricing::enroll_text).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/api/v1/organizations/{organization}/projects/{project}/billing/retail-price-enrollment", get(crate::billing::retail_pricing::enrollment).post(crate::billing::retail_pricing::enroll_text).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/admin/v1/pricing/customers", get(crate::billing::retail_pricing::customers))
        .route("/api/v1/pricing/customers", get(crate::billing::retail_pricing::customers))
        .route("/admin/v1/pricing/standard-prices/models", get(crate::billing::retail_pricing::registered_models))
        .route("/api/v1/pricing/standard-prices/models", get(crate::billing::retail_pricing::registered_models))
        .route("/admin/v1/pricing/standard-prices", get(crate::billing::retail_pricing::list).post(crate::billing::retail_pricing::publish_standard).layer(axum::extract::DefaultBodyLimit::max(65536)))
        .route("/api/v1/pricing/standard-prices", get(crate::billing::retail_pricing::list).post(crate::billing::retail_pricing::publish_standard).layer(axum::extract::DefaultBodyLimit::max(65536)))
        .route("/admin/v1/pricing/standard-prices/{price}/promotions", get(crate::billing::retail_pricing::promotions).post(crate::billing::retail_pricing::publish_promotion).layer(axum::extract::DefaultBodyLimit::max(65536)))
        .route("/api/v1/pricing/standard-prices/{price}/promotions", get(crate::billing::retail_pricing::promotions).post(crate::billing::retail_pricing::publish_promotion).layer(axum::extract::DefaultBodyLimit::max(65536)))
        .route("/admin/v1/pricing/standard-prices/{price}/promotions/{promotion}/retire", axum::routing::post(crate::billing::retail_pricing::retire_promotion).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/api/v1/pricing/standard-prices/{price}/promotions/{promotion}/retire", axum::routing::post(crate::billing::retail_pricing::retire_promotion).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/admin/v1/pricing/standard-prices/{price}/history", get(crate::billing::retail_pricing::history))
        .route("/api/v1/pricing/standard-prices/{price}/history", get(crate::billing::retail_pricing::history))
        .route("/admin/v1/pricing/standard-prices/{price}/preview", get(crate::billing::retail_pricing::preview))
        .route("/api/v1/pricing/standard-prices/{price}/preview", get(crate::billing::retail_pricing::preview))
        .route("/admin/v1/pricing/targets", get(crate::billing::platform_pricing::targets))
        .route("/api/v1/pricing/targets", get(crate::billing::platform_pricing::targets))
        .route("/admin/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs", get(crate::billing::platform_pricing::tariffs))
        .route("/api/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs", get(crate::billing::platform_pricing::tariffs))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing", get(crate::billing::overview))
        .route("/api/v1/organizations/{organization}/projects/{project}/billing", get(crate::billing::overview))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing/tariffs/{model}/history", get(crate::billing::tariff_history))
        .route("/api/v1/organizations/{organization}/projects/{project}/billing/tariffs/{model}/history", get(crate::billing::tariff_history))
        .route("/admin/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs/{model}/history", get(crate::billing::platform_tariff_history))
        .route("/api/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs/{model}/history", get(crate::billing::platform_tariff_history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing/tariffs", axum::routing::post(crate::billing::tariff))
        .route("/api/v1/organizations/{organization}/projects/{project}/billing/tariffs", axum::routing::post(crate::billing::tariff))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing/invoices", get(crate::billing::invoice_history::list).post(crate::billing::issue))
        .route("/api/v1/organizations/{organization}/projects/{project}/billing/invoices", get(crate::billing::invoice_history::list).post(crate::billing::issue))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}", get(crate::billing::lines))
        .route("/api/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}", get(crate::billing::lines))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}/payment", axum::routing::post(crate::billing::payment))
        .route("/api/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}/payment", axum::routing::post(crate::billing::payment))
        .route("/admin/v1/provider-memberships", get(crate::providers::memberships))
        .route("/api/v1/provider-memberships", get(crate::providers::memberships))
        .route("/v1/branding", get(crate::branding::public))
        .route("/admin/v1/platform/branding", get(crate::branding::read).put(crate::branding::save).layer(DefaultBodyLimit::max(450000)))
        .route("/api/v1/platform/branding", get(crate::branding::read).put(crate::branding::save).layer(DefaultBodyLimit::max(450000)))
        .route("/admin/v1/platform/payments/integrations", get(crate::payments::integrations))
        .route("/api/v1/platform/payments/integrations", get(crate::payments::integrations))
        .route("/admin/v1/platform/payments/epay", get(crate::payments::read_configuration_api).put(crate::payments::save_configuration_api).layer(DefaultBodyLimit::max(16384)))
        .route("/api/v1/platform/payments/epay", get(crate::payments::read_configuration_api).put(crate::payments::save_configuration_api).layer(DefaultBodyLimit::max(16384)))
        .route("/admin/v1/platform/financial-recovery", get(crate::financial_recovery::diagnostics))
        .route("/api/v1/platform/financial-recovery", get(crate::financial_recovery::diagnostics))
        .route("/admin/v1/platform/configuration", get(crate::providers::platform_configuration))
        .route("/api/v1/platform/configuration", get(crate::providers::platform_configuration))
        .route(
            "/admin/v1/providers/{provider}/configuration-usage",
            get(crate::supplier_configuration_usage::read),
        )
        .route(
            "/api/v1/providers/{provider}/configuration-usage",
            get(crate::supplier_configuration_usage::read),
        )
        .route("/admin/v1/providers/{provider}", get(crate::providers::profile).patch(crate::providers::rename).delete(crate::providers::delete).layer(DefaultBodyLimit::max(16384)))
        .route("/api/v1/providers/{provider}", get(crate::providers::profile).patch(crate::providers::rename).delete(crate::providers::delete).layer(DefaultBodyLimit::max(16384)))
        .route("/admin/v1/providers", get(crate::providers::list).post(crate::providers::create))
        .route("/api/v1/providers", get(crate::providers::list).post(crate::providers::create))
        .route("/admin/v1/providers/{provider}/members", get(crate::providers::members))
        .route("/api/v1/providers/{provider}/members", get(crate::providers::members))
        .route("/admin/v1/providers/{provider}/members/{operator}", axum::routing::put(crate::providers::set_member))
        .route("/api/v1/providers/{provider}/members/{operator}", axum::routing::put(crate::providers::set_member))
        .route("/admin/v1/providers/{provider}/qualification", axum::routing::put(crate::providers::qualify_business))
        .route("/api/v1/providers/{provider}/qualification", axum::routing::put(crate::providers::qualify_business))
        .route("/admin/v1/providers/{provider}/qualification/revoke", axum::routing::post(crate::providers::revoke_business_qualification))
        .route("/api/v1/providers/{provider}/qualification/revoke", axum::routing::post(crate::providers::revoke_business_qualification))
        .route("/admin/v1/providers/{provider}/offers", get(crate::providers::offers).post(crate::providers::publish_offer))
        .route("/api/v1/providers/{provider}/offers", get(crate::providers::offers).post(crate::providers::publish_offer))
        .route("/admin/v1/providers/{provider}/earnings", get(crate::providers::earning_history))
        .route("/api/v1/providers/{provider}/earnings", get(crate::providers::earning_history))
        .route("/admin/v1/providers/{provider}/settlements", get(crate::providers::settlement_history).post(crate::providers::record_settlement))
        .route("/api/v1/providers/{provider}/settlements", get(crate::providers::settlement_history).post(crate::providers::record_settlement))
        .route("/admin/v1/providers/{provider}/administration", get(crate::providers::administration_dashboard))
        .route("/api/v1/providers/{provider}/administration", get(crate::providers::administration_dashboard))
        .route("/admin/v1/providers/{provider}/dashboard", get(crate::providers::dashboard))
        .route("/api/v1/providers/{provider}/dashboard", get(crate::providers::dashboard))
        .route("/admin/v1/providers/{provider}/offers/{offer}", axum::routing::patch(crate::providers::set_offer))
        .route("/api/v1/providers/{provider}/offers/{offer}", axum::routing::patch(crate::providers::set_offer))
        .route("/admin/v1/providers/{provider}/offers/{offer}/revisions", get(crate::providers::offer_history))
        .route("/api/v1/providers/{provider}/offers/{offer}/revisions", get(crate::providers::offer_history))
        .route("/admin/v1/providers/{provider}/offers/{offer}/revisions/{revision}", get(crate::providers::offer_revision))
        .route("/api/v1/providers/{provider}/offers/{offer}/revisions/{revision}", get(crate::providers::offer_revision))
        .route("/admin/v1/providers/{provider}/offers/{offer}/qualification", axum::routing::put(crate::providers::qualify_offer))
        .route("/api/v1/providers/{provider}/offers/{offer}/qualification", axum::routing::put(crate::providers::qualify_offer))
        .route("/admin/v1/providers/{provider}/offers/{offer}/qualification/revoke", axum::routing::post(crate::providers::revoke_offer_qualification))
        .route("/api/v1/providers/{provider}/offers/{offer}/qualification/revoke", axum::routing::post(crate::providers::revoke_offer_qualification))
        .route("/admin/v1/session", get(crate::admin::current_session).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/profile", get(crate::admin::profile::profile).put(crate::admin::profile::update_profile).layer(DefaultBodyLimit::max(180000)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/preferences", get(crate::admin::preferences::preferences).put(crate::admin::preferences::update_preferences).layer(DefaultBodyLimit::max(1024)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/password", axum::routing::put(crate::admin::passwords::change_password).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/config", get(crate::admin::passwords::configuration).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/browser/login", axum::routing::post(crate::admin::passwords::browser_login).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/browser/token", axum::routing::post(crate::admin::browser_tokens::exchange).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/browser/logout", axum::routing::post(crate::admin::passwords::browser_logout).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/logout", axum::routing::post(crate::admin::passwords::logout).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/login", axum::routing::post(crate::admin::passwords::login).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/session", get(crate::admin::current_session).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/auth/profile", get(crate::admin::profile::profile).put(crate::admin::profile::update_profile).layer(DefaultBodyLimit::max(180000)).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/auth/preferences", get(crate::admin::preferences::preferences).put(crate::admin::preferences::update_preferences).layer(DefaultBodyLimit::max(1024)).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/auth/password", axum::routing::put(crate::admin::passwords::change_password).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/auth/config", get(crate::admin::passwords::configuration).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/auth/browser/login", axum::routing::post(crate::admin::passwords::browser_login).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/auth/browser/token", axum::routing::post(crate::admin::browser_tokens::exchange).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/auth/browser/logout", axum::routing::post(crate::admin::passwords::browser_logout).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/auth/logout", axum::routing::post(crate::admin::passwords::logout).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/auth/login", axum::routing::post(crate::admin::passwords::login).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/operators/{operator}/password", axum::routing::put(crate::admin::passwords::set_password).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/api/v1/operators/{operator}/password", axum::routing::put(crate::admin::passwords::set_password).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route(
            "/admin/v1/setup/default-workspace",
            axum::routing::post(crate::admin::default_workspace),
        )
        .route(
            "/api/v1/setup/default-workspace",
            axum::routing::post(crate::admin::default_workspace),
        )
        .merge(super::static_site::router())
        .route("/healthz", get(health))
        .route("/readyz", get(ready))
        .route("/enterprise/readyz", get(enterprise_ready))
        .route("/plugins/readyz", get(enterprise_ready))
        .route(
            "/admin/v1/organizations",
            get(crate::admin::organizations).post(crate::admin::organization),
        )
        .route(
            "/api/v1/organizations",
            get(crate::admin::organizations).post(crate::admin::organization),
        )
        .route(
            "/admin/v1/workspaces/by-route/{route_slug}",
            get(crate::admin::workspace_route),
        )
        .route("/admin/v1/workspaces/{workspace}", axum::routing::patch(crate::admin::workspace_aliases::rename).delete(crate::admin::workspace_aliases::delete))
        .route(
            "/admin/v1/workspaces",
            get(crate::admin::workspaces).post(crate::admin::create_workspace),
        )
        .route(
            "/api/v1/workspaces/by-route/{route_slug}",
            get(crate::admin::workspace_route),
        )
        .route("/api/v1/workspaces/{workspace}", axum::routing::patch(crate::admin::workspace_aliases::rename).delete(crate::admin::workspace_aliases::delete))
        .route(
            "/api/v1/workspaces",
            get(crate::admin::workspaces).post(crate::admin::create_workspace),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys",
            get(crate::admin::workspace_aliases::list_keys)
                .post(crate::admin::workspace_aliases::create_key)
                .layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}",
            get(crate::admin::workspace_aliases::get_key)
                .patch(crate::admin::workspace_aliases::update_key)
                .delete(crate::admin::workspace_aliases::revoke_key)
                .layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/rotate",
            axum::routing::post(crate::admin::workspace_aliases::rotate_key)
                .layer(DefaultBodyLimit::max(4096)),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}",
            axum::routing::patch(crate::admin::rename_workspace).delete(crate::admin::delete_workspace),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}",
            axum::routing::patch(crate::admin::rename_workspace).delete(crate::admin::delete_workspace),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects",
            get(crate::admin::projects).post(crate::admin::project),
        )
        .route(
            "/api/v1/organizations/{organization}/projects",
            get(crate::admin::projects).post(crate::admin::project),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/keys",
            get(crate::admin::keys).post(crate::admin::issue_key),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/keys",
            get(crate::admin::keys).post(crate::admin::issue_key),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}",
            axum::routing::delete(crate::admin::revoke_key).patch(crate::admin::update_key_metadata),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/keys/{key}",
            axum::routing::delete(crate::admin::revoke_key).patch(crate::admin::update_key_metadata),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/rotate",
            axum::routing::post(crate::admin::rotate_key),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/keys/{key}/rotate",
            axum::routing::post(crate::admin::rotate_key),
        )
        .route(
            "/admin/v1/platform/audit-events",
            get(crate::admin::platform_audit::events),
        )
        .route(
            "/api/v1/platform/audit-events",
            get(crate::admin::platform_audit::events),
        )
        .route(
            "/admin/v1/operators",
            get(crate::admin::operators).post(crate::admin::create_operator),
        )
        .route(
            "/api/v1/operators",
            get(crate::admin::operators).post(crate::admin::create_operator),
        )
        .route(
            "/admin/v1/operators/{operator}",
            axum::routing::delete(crate::admin::revoke_operator)
                .patch(super::operator_roles::update_operator_role)
                .layer(DefaultBodyLimit::max(4096)),
        )
        .route(
            "/api/v1/operators/{operator}",
            axum::routing::delete(crate::admin::revoke_operator)
                .patch(super::operator_roles::update_operator_role)
                .layer(DefaultBodyLimit::max(4096)),
        )
        .route(
            "/admin/v1/operators/{operator}/sessions",
            get(crate::admin::operator_sessions).post(crate::admin::create_operator_session),
        )
        .route(
            "/api/v1/operators/{operator}/sessions",
            get(crate::admin::operator_sessions).post(crate::admin::create_operator_session),
        )
        .route(
            "/admin/v1/operators/{operator}/events",
            get(crate::admin::operator_events),
        )
        .route(
            "/api/v1/operators/{operator}/events",
            get(crate::admin::operator_events),
        )
        .route(
            "/admin/v1/operators/{operator}/sessions/{session}",
            axum::routing::delete(crate::admin::revoke_operator_session),
        )
        .route(
            "/api/v1/operators/{operator}/sessions/{session}",
            axum::routing::delete(crate::admin::revoke_operator_session),
        )
        .route("/catalog/v1/models", get(catalog_models))
        .route("/v1/models", get(public_models))
        .route("/v1/key", get(inspect_key))
        .route("/v1/generations/{id}", get(get_generation))
        .route("/admin/v1/organizations/{organization}/projects/{project}/media/asset-operations", get(super::provider_assets::list_historical_operations).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/api/v1/organizations/{organization}/projects/{project}/media/asset-operations", get(super::provider_assets::list_historical_operations).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/media/asset-operations/{id}", get(super::provider_assets::get_historical_operation).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/api/v1/organizations/{organization}/projects/{project}/media/asset-operations/{id}", get(super::provider_assets::get_historical_operation).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/media/asset-operations/by-idempotency/{id}", get(super::provider_assets::get_historical_operation_by_idempotency).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/api/v1/organizations/{organization}/projects/{project}/media/asset-operations/by-idempotency/{id}", get(super::provider_assets::get_historical_operation_by_idempotency).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/media/asset-operations/{id}/cancel", post(super::provider_assets::cancel_historical_operation).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/api/v1/organizations/{organization}/projects/{project}/media/asset-operations/{id}/cancel", post(super::provider_assets::cancel_historical_operation).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/capabilities", get(super::provider_capabilities::discover))
        .route("/v1/media/verification-sessions", get(super::provider_verification::list).post(super::provider_verification::create).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/verification-sessions/{id}", get(super::provider_verification::get).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/verification-sessions/{id}/refresh", post(super::provider_verification::refresh).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/verification-sessions/{id}/link", get(super::provider_verification::link).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/asset-groups", get(super::provider_assets::list_groups).post(super::provider_assets::create_group).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/asset-groups/{id}", get(super::provider_assets::get_group).patch(super::provider_assets::update_group).delete(super::provider_assets::delete_group).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/asset-groups/{id}/refresh", post(super::provider_assets::refresh_group).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/assets", get(super::provider_assets::list_assets).post(super::provider_assets::create_asset).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/assets/{id}", get(super::provider_assets::get_asset).patch(super::provider_assets::rename_asset).delete(super::provider_assets::delete_asset).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/assets/{id}/refresh", post(super::provider_assets::refresh_asset).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/asset-operations", get(super::provider_assets::list_operations).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/asset-operations/prepare", post(super::provider_assets::prepare_operation).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/asset-operations/{id}/dispatch", post(super::provider_assets::dispatch_operation).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/asset-operations/{id}/cancel", post(super::provider_assets::cancel_operation).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/asset-operations/by-idempotency/{id}", get(super::provider_assets::get_operation_by_idempotency).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/media/asset-operations/{id}", get(super::provider_assets::get_operation).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/v1/video/models", get(super::inference::video_models::models))
        .route("/v1/video/estimate", axum::routing::post(super::inference::video::estimate).layer(DefaultBodyLimit::max(16 * 1024 * 1024)))
        .route("/v1/video/jobs", get(super::inference::video::history).post(super::inference::video::create).layer(DefaultBodyLimit::max(16 * 1024 * 1024)))
        .route("/v1/video/jobs/{id}/timings", get(super::inference::video::timings))
        .route("/v1/video/jobs/{id}/billing", get(super::inference::video::billing))
        .route("/v1/video/jobs/{id}/observations", get(super::inference::video_observations::observations))
        .route("/v1/video/jobs/{id}/refresh", axum::routing::post(super::inference::video::refresh))
        .route("/v1/video/jobs/{id}/results/{kind}/refresh", post(super::inference::video_results::retrieve_fresh))
        .route("/v1/video/jobs/{id}/results/{kind}", get(super::inference::video_results::retrieve))
        .route("/v1/video/jobs/{id}/results", get(super::inference::video_results::availability).delete(super::inference::video_results::delete))
        .route("/v1/video/jobs/{id}", get(super::inference::video::status))
        .route("/v1beta/models/{model_action}", post(generate_content).layer(DefaultBodyLimit::max(1_048_576)))
        .route("/v1/messages", post(messages).layer(DefaultBodyLimit::max(1_048_576)))
        .route("/v1/chat/completions", axum::routing::post(chat))
        .route("/v1/responses", axum::routing::post(responses))
        .route("/v1/embeddings", axum::routing::post(embeddings))
        .route("/admin/v1/models", get(admin_models))
        .route("/api/v1/models", get(admin_models))
        .route("/admin/v1/vendors/{vendor}/cooldown", get(crate::admin::vendor_cooldown::read))
        .route("/api/v1/vendors/{vendor}/cooldown", get(crate::admin::vendor_cooldown::read))
        .route("/admin/v1/vendors/{vendor}/request-rate-limit", get(crate::admin::vendor_request_rate::read).put(crate::admin::vendor_request_rate::write))
        .route("/api/v1/vendors/{vendor}/request-rate-limit", get(crate::admin::vendor_request_rate::read).put(crate::admin::vendor_request_rate::write))
        .route("/admin/v1/vendors/{vendor}/request-rate-limit/history", get(crate::admin::vendor_request_rate::history))
        .route("/api/v1/vendors/{vendor}/request-rate-limit/history", get(crate::admin::vendor_request_rate::history))
        .route("/admin/v1/vendors", get(crate::vendors::list).post(crate::vendors::create))
        .route("/api/v1/vendors", get(crate::vendors::list).post(crate::vendors::create))
        .route("/admin/v1/model-route-pools", axum::routing::get(crate::vendors::route_pools::get).put(crate::vendors::route_pools::put))
        .route("/api/v1/model-route-pools", axum::routing::get(crate::vendors::route_pools::get).put(crate::vendors::route_pools::put))
        .route("/admin/v1/model-route-pools/index", axum::routing::get(crate::vendors::route_pools::index))
        .route("/api/v1/model-route-pools/index", axum::routing::get(crate::vendors::route_pools::index))
        .route("/admin/v1/model-route-pools/history", axum::routing::get(crate::vendors::route_pools::history))
        .route("/api/v1/model-route-pools/history", axum::routing::get(crate::vendors::route_pools::history))
        .route("/admin/v1/routing-registry", get(crate::vendors::publication::status))
        .route("/api/v1/routing-registry", get(crate::vendors::publication::status))
        .route("/admin/v1/vendors/{id}", axum::routing::put(crate::vendors::update))
        .route("/api/v1/vendors/{id}", axum::routing::put(crate::vendors::update))
        .route("/admin/v1/vendors/{id}/supplier", get(crate::vendors::supplier).put(crate::vendors::associate_supplier))
        .route("/api/v1/vendors/{id}/supplier", get(crate::vendors::supplier).put(crate::vendors::associate_supplier))
        .route("/admin/v1/vendors/{id}/asset-management", get(crate::vendors::asset_management_configuration).put(crate::vendors::configure_asset_management).delete(crate::vendors::revoke_asset_management).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/api/v1/vendors/{id}/asset-management", get(crate::vendors::asset_management_configuration).put(crate::vendors::configure_asset_management).delete(crate::vendors::revoke_asset_management).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/authorizations", get(crate::vendors::asset_authorizations::list).post(crate::vendors::asset_authorizations::create).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/api/v1/vendors/{id}/asset-management/authorizations", get(crate::vendors::asset_authorizations::list).post(crate::vendors::asset_authorizations::create).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/authorizations/{authorization}", axum::routing::delete(crate::vendors::asset_authorizations::revoke))
        .route("/api/v1/vendors/{id}/asset-management/authorizations/{authorization}", axum::routing::delete(crate::vendors::asset_authorizations::revoke))
        .route("/admin/v1/vendors/{id}/asset-management/lookups/{lookup}", get(crate::vendors::asset_lookups::get_result).delete(crate::vendors::asset_lookups::delete_result))
        .route("/api/v1/vendors/{id}/asset-management/lookups/{lookup}", get(crate::vendors::asset_lookups::get_result).delete(crate::vendors::asset_lookups::delete_result))
        .route("/admin/v1/vendors/{id}/asset-management/lookups", get(crate::vendors::asset_lookups::history).post(crate::vendors::asset_lookups::lookup).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/api/v1/vendors/{id}/asset-management/lookups", get(crate::vendors::asset_lookups::history).post(crate::vendors::asset_lookups::lookup).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/listings", get(crate::vendors::asset_listings::history).post(crate::vendors::asset_listings::list).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/api/v1/vendors/{id}/asset-management/listings", get(crate::vendors::asset_listings::history).post(crate::vendors::asset_listings::list).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/listings/{listing}", get(crate::vendors::asset_listings::get_result).delete(crate::vendors::asset_listings::delete_result))
        .route("/api/v1/vendors/{id}/asset-management/listings/{listing}", get(crate::vendors::asset_listings::get_result).delete(crate::vendors::asset_listings::delete_result))
        .route("/admin/v1/vendors/{id}/asset-management/group-reads/{read}", get(crate::vendors::asset_reads::get_result).delete(crate::vendors::asset_reads::delete_result))
        .route("/api/v1/vendors/{id}/asset-management/group-reads/{read}", get(crate::vendors::asset_reads::get_result).delete(crate::vendors::asset_reads::delete_result))
        .route("/admin/v1/vendors/{id}/asset-management/group-reads", get(crate::vendors::asset_reads::history).post(crate::vendors::asset_reads::read).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/api/v1/vendors/{id}/asset-management/group-reads", get(crate::vendors::asset_reads::history).post(crate::vendors::asset_reads::read).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/group-updates/{update}", axum::routing::delete(crate::vendors::asset_updates::delete_patch))
        .route("/api/v1/vendors/{id}/asset-management/group-updates/{update}", axum::routing::delete(crate::vendors::asset_updates::delete_patch))
        .route("/admin/v1/vendors/{id}/asset-management/group-updates/{update}/reconcile", axum::routing::post(crate::vendors::asset_updates::reconcile).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/api/v1/vendors/{id}/asset-management/group-updates/{update}/reconcile", axum::routing::post(crate::vendors::asset_updates::reconcile).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/group-updates/{update}/dispatch", axum::routing::post(crate::vendors::asset_updates::dispatch).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/api/v1/vendors/{id}/asset-management/group-updates/{update}/dispatch", axum::routing::post(crate::vendors::asset_updates::dispatch).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}/dispatch", axum::routing::post(crate::vendors::asset_deletions::dispatch).layer(DefaultBodyLimit::max(4096)))
        .route("/api/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}/dispatch", axum::routing::post(crate::vendors::asset_deletions::dispatch).layer(DefaultBodyLimit::max(4096)))
        .route("/admin/v1/vendors/{id}/asset-management/group-deletion-consents", axum::routing::post(crate::vendors::asset_deletions::prepare).layer(DefaultBodyLimit::max(4096)))
        .route("/api/v1/vendors/{id}/asset-management/group-deletion-consents", axum::routing::post(crate::vendors::asset_deletions::prepare).layer(DefaultBodyLimit::max(4096)))
        .route("/admin/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}", get(crate::vendors::asset_deletions::read).delete(crate::vendors::asset_deletions::revoke))
        .route("/api/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}", get(crate::vendors::asset_deletions::read).delete(crate::vendors::asset_deletions::revoke))
        .route("/admin/v1/vendors/{id}/asset-management/group-updates", get(crate::vendors::asset_updates::history).post(crate::vendors::asset_updates::prepare).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/api/v1/vendors/{id}/asset-management/group-updates", get(crate::vendors::asset_updates::history).post(crate::vendors::asset_updates::prepare).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/groups", axum::routing::post(crate::vendors::asset_groups::create).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/api/v1/vendors/{id}/asset-management/groups", axum::routing::post(crate::vendors::asset_groups::create).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/personal-owner", axum::routing::put(crate::vendors::assign_personal_owner))
        .route("/api/v1/vendors/{id}/personal-owner", axum::routing::put(crate::vendors::assign_personal_owner))
        .route("/admin/v1/vendors/{id}/models", get(crate::vendors::list_models).post(crate::vendors::upsert_model))
        .route("/api/v1/vendors/{id}/models", get(crate::vendors::list_models).post(crate::vendors::upsert_model))
        .route("/admin/v1/vendors/{id}/catalog", get(crate::vendors::catalog).post(crate::vendors::refresh_catalog))
        .route("/api/v1/vendors/{id}/catalog", get(crate::vendors::catalog).post(crate::vendors::refresh_catalog))
        .route("/admin/v1/vendors/{id}/check", axum::routing::post(crate::vendors::check_model))
        .route("/api/v1/vendors/{id}/check", axum::routing::post(crate::vendors::check_model))
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/accounts",
            get(crate::admin::accounts).post(crate::admin::create_account),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/accounts",
            get(crate::admin::accounts).post(crate::admin::create_account),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/budget",
            get(crate::admin::budget).post(crate::admin::create_budget),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/budget",
            get(crate::admin::budget).post(crate::admin::create_budget),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/spending-limit",
            get(crate::admin::workspace_spending::list),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/spending-limit",
            get(crate::admin::workspace_spending::list),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}",
            get(crate::admin::workspace_spending::read).put(crate::admin::workspace_spending::write),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}",
            get(crate::admin::workspace_spending::read).put(crate::admin::workspace_spending::write),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}/history",
            get(crate::admin::workspace_spending::history),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}/history",
            get(crate::admin::workspace_spending::history),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/costs",
            get(crate::admin::costs),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/costs",
            get(crate::admin::costs),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}/usage-reconciliation",
            get(crate::billing::usage_reconciliation::get).post(crate::billing::usage_reconciliation::reconcile),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/usage-reconciliation",
            get(crate::billing::usage_reconciliation::get).post(crate::billing::usage_reconciliation::reconcile),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}/payloads",
            get(crate::admin::request_payloads::get).delete(crate::admin::request_payloads::delete),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/requests/{attempt}/payloads",
            get(crate::admin::request_payloads::get).delete(crate::admin::request_payloads::delete),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}",
            get(crate::admin::gateway_request),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/requests/{attempt}",
            get(crate::admin::gateway_request),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/requests",
            get(crate::admin::gateway_activity),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/requests",
            get(crate::admin::gateway_activity),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/requests/export",
            get(crate::admin::request_exports::csv),
        )
        .route(
            "/api/v1/organizations/{organization}/projects/{project}/requests/export",
            get(crate::admin::request_exports::csv),
        )
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit", get(crate::admin::key_spending::list))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit", get(crate::admin::key_spending::list))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit/{currency}", axum::routing::put(crate::admin::key_spending::write).layer(DefaultBodyLimit::max(4096)))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit/{currency}", axum::routing::put(crate::admin::key_spending::write).layer(DefaultBodyLimit::max(4096)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit/{currency}/history", get(crate::admin::key_spending::history))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit/{currency}/history", get(crate::admin::key_spending::history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy", get(crate::admin::key_ip::read).put(crate::admin::key_ip::write).layer(DefaultBodyLimit::max(8192)))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy", get(crate::admin::key_ip::read).put(crate::admin::key_ip::write).layer(DefaultBodyLimit::max(8192)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy/history", get(crate::admin::key_ip::history))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy/history", get(crate::admin::key_ip::history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/request-rate-limit", get(crate::admin::key_request_rate::read).put(crate::admin::key_request_rate::write).layer(DefaultBodyLimit::max(8192)))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/request-rate-limit", get(crate::admin::key_request_rate::read).put(crate::admin::key_request_rate::write).layer(DefaultBodyLimit::max(8192)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/request-rate-limit/history", get(crate::admin::key_request_rate::history))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/request-rate-limit/history", get(crate::admin::key_request_rate::history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-usage-window", get(crate::admin::key_request_rate::usage))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/token-usage-window", get(crate::admin::key_request_rate::usage))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit", get(crate::admin::key_concurrency::read).put(crate::admin::key_concurrency::write).layer(DefaultBodyLimit::max(8192)))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit", get(crate::admin::key_concurrency::read).put(crate::admin::key_concurrency::write).layer(DefaultBodyLimit::max(8192)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit/history", get(crate::admin::key_concurrency::history))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit/history", get(crate::admin::key_concurrency::history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit", get(crate::admin::key_token_rate::read).put(crate::admin::key_token_rate::write).layer(DefaultBodyLimit::max(8192)))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit", get(crate::admin::key_token_rate::read).put(crate::admin::key_token_rate::write).layer(DefaultBodyLimit::max(8192)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit/history", get(crate::admin::key_token_rate::history))
        .route("/api/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit/history", get(crate::admin::key_token_rate::history))
        .route("/admin/v1/metrics", get(admin_metrics))
        .route("/api/v1/metrics", get(admin_metrics))
        .route("/v1", any(api_not_found))
        .route("/v1/{*path}", any(api_not_found))
        .route("/v1beta", any(api_not_found))
        .route("/v1beta/{*path}", any(api_not_found))
        .route("/catalog/v1", any(api_not_found))
        .route("/catalog/v1/{*path}", any(api_not_found))
        .route("/admin/v1/platform/plugins/outbox/deliver", axum::routing::post(crate::enterprise::deliver_outbox))
        .route("/api/v1/platform/plugins/outbox/deliver", axum::routing::post(crate::enterprise::deliver_outbox))
        .route("/api/v1", any(api_not_found))
        .route("/api/v1/{*path}", any(api_not_found))
        .route("/admin/v1", any(api_not_found))
        .route("/admin/v1/{*path}", any(api_not_found))
        .layer(DefaultBodyLimit::max(1_048_576));
    let app = if enterprise_enabled {
        app.route("/enterprise/api/v1", any(crate::enterprise::handle))
            .route("/enterprise/api/v1/{*path}", any(crate::enterprise::handle))
            .route("/api/plugins/v1", any(crate::enterprise::handle))
            .route("/api/plugins/v1/{*path}", any(crate::enterprise::handle))
    } else {
        app
    };
    app.layer(middleware::from_fn_with_state(
        state.clone(),
        crate::request_timings::collect,
    ))
    .layer(middleware::from_fn_with_state(
        state.clone(),
        crate::request_payloads::capture,
    ))
    .layer(middleware::from_fn(private_api_cache_control))
    .layer(middleware::from_fn_with_state(
        state.clone(),
        crate::request_source::capture,
    ))
    .with_state(state)
}

async fn private_api_cache_control(request: axum::http::Request<Body>, next: Next) -> Response {
    let path = request.uri().path();
    let private = path == "/admin/v1"
        || path == "/auth/callback"
        || path.starts_with("/admin/v1/")
        || path == "/api/v1"
        || path.starts_with("/api/v1/")
        || path == "/enterprise/api/v1"
        || path.starts_with("/enterprise/api/v1/")
        || path == "/api/plugins/v1"
        || path.starts_with("/api/plugins/v1/")
        || path == "/v1"
        || path.starts_with("/v1/")
        || path == "/v1beta"
        || path.starts_with("/v1beta/");
    let mut response = next.run(request).await;
    if private {
        response
            .headers_mut()
            .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
        response
            .headers_mut()
            .insert("referrer-policy", HeaderValue::from_static("no-referrer"));
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

/// ```openapi
/// {
///   "path": "/v1/models",
///   "method": "get",
///   "operation": {
///     "operationId": "listModels",
///     "summary": "List key-accessible model aliases and workspace customer prices",
///     "description": "Requires a current workspace API key and filters aliases by its model grants and organization access. customer_pricing is the current workspace selling tariff or null; personal credential routes omit customer prices. Token rates use currency nanounits per million tokens. request_fee_nanos and minimum_charge_nanos use currency nanounits per known completed request. Amounts are exact strings. Listing a model or tariff does not qualify generation or guarantee admission, balance or upstream availability. No Provider procurement rates, internal revision identifiers, upstream credentials, endpoints or private model mappings are exposed. Enrolled text models resolve the own-customer promotion, then global promotion, then standard price at server time; this is advisory until admission pins a concrete revision. No other-customer rules are exposed.",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Current key-visible aliases and customer-only prices.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "object",
///                 "data"
///               ],
///               "properties": {
///                 "object": {
///                   "type": "string",
///                   "const": "list"
///                 },
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "id",
///                       "object",
///                       "owned_by",
///                       "customer_pricing"
///                     ],
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "description": "Public model alias."
///                       },
///                       "object": {
///                         "type": "string",
///                         "const": "model"
///                       },
///                       "owned_by": {
///                         "type": "string",
///                         "const": "niu"
///                       },
///                       "customer_pricing": {
///                         "anyOf": [
///                           {
///                             "$ref": "#/components/schemas/WorkspaceCustomerModelPrice"
///                           },
///                           {
///                             "type": "null"
///                           }
///                         ]
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Missing, revoked, expired or invalid key."
///       },
///       "403": {
///         "description": "Current credential access policy denies the request."
///       },
///       "503": {
///         "description": "Storage or route configuration unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "WorkspaceCustomerModelPrice": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "currency",
///         "unit",
///         "prompt_rate",
///         "completion_rate",
///         "cached_prompt_rate",
///         "minimum_charge_nanos",
///         "request_fee_nanos",
///         "reasoning_completion_rate",
///         "cache_write_prompt_rate",
///         "context_tiers"
///       ],
///       "properties": {
///         "currency": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         },
///         "unit": {
///           "type": "string",
///           "const": "nanounits_per_million_tokens",
///           "description": "Unit for token rate fields only. Minimum and request fee are currency nanounits per known completed request."
///         },
///         "prompt_rate": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "completion_rate": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "minimum_charge_nanos": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "request_fee_nanos": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "cached_prompt_rate": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "reasoning_completion_rate": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$",
///           "description": "Reported reasoning output is a subset of total completion tokens. A configured rate prices that subset separately; missing quantity remains unresolved."
///         },
///         "cache_write_prompt_rate": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$",
///           "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured rate prices it separately; missing quantity remains unresolved."
///         },
///         "context_tiers": {
///           "type": "array",
///           "maxItems": 32,
///           "items": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "minimum_input_tokens",
///               "prompt_rate",
///               "completion_rate"
///             ],
///             "properties": {
///               "minimum_input_tokens": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$",
///                 "description": "Positive inclusive aggregate input threshold, at most 9223372036854775807."
///               },
///               "prompt_rate": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$",
///                 "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///               },
///               "completion_rate": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$",
///                 "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///               },
///               "cached_prompt_rate": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^[0-9]+$",
///                 "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///               },
///               "cache_write_prompt_rate": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^[0-9]+$",
///                 "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///               },
///               "reasoning_completion_rate": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^[0-9]+$",
///                 "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///               }
///             }
///           },
///           "description": "Complete whole-request schedules; highest inclusive input threshold wins. Null category rates do not inherit the base schedule. Empty array clears tiers; omitting existing tiers conflicts."
///         },
///         "pricing_source": {
///           "type": "string",
///           "enum": [
///             "workspace",
///             "platform"
///           ]
///         },
///         "promotion_scope": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "enum": [
///             "global",
///             "customer",
///             null
///           ]
///         },
///         "selected_at": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "price_version": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         }
///       }
///     }
///   }
/// }
/// ```
async fn public_models(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = state
        .authorize_api_headers_with_permission(&headers, niu_storage::AdminPermission::Read)
        .await?;
    let mut models =
        crate::vendors::scoped_models(&state, principal.scope().organization_id).await?;
    models.extend(crate::codex::private_models(&state, principal.scope()).await?);
    let mut prices = state
        .store
        .customer_model_prices(principal.scope())
        .await
        .map_err(ApiError::from_store)?;
    for route in state
        .store
        .personal_vendor_routes(principal.scope().organization_id)
        .await
        .map_err(ApiError::from_store)?
    {
        prices.remove(&route.model.alias);
    }
    let data: Vec<_> = models
        .keys()
        .filter(|model| principal.allows_model(model))
        .map(|model| {
            let customer_pricing = prices.get(model).and_then(|price| {
                let mut value = serde_json::to_value(price).ok()?;
                if let Some(obj) = value.as_object_mut() {
                    obj.remove("revision");
                    obj.remove("discount_baseline_revision");
                    obj.remove("price_id");
                    obj.remove("standard_revision");
                    obj.remove("promotion_revision");
                }
                Some(value)
            });
            json!({"id": model, "object": "model", "owned_by": "niu", "customer_pricing": customer_pricing})
        })
        .collect();
    Ok(Json(json!({"object": "list", "data": data})))
}

/// ```openapi
/// {
///   "path": "/v1/key",
///   "method": "get",
///   "operation": {
///     "operationId": "getCurrentKey",
///     "summary": "Inspect the current workspace API key",
///     "description": "Returns customer-safe metadata, model grants, expiration, spending limits and remaining allowance, request/token/concurrency rate limits, 60-second usage window, and IP allowlist for the authenticated API key (or the workspace key selected via X-Niu-Key-Id with a console session). Never returns the secret token or internal platform UUIDs.",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Current API key metadata, limits, and usage.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": ["data"],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "required": [
///                     "label",
///                     "allowed_models",
///                     "expires_at",
///                     "spending_limits",
///                     "request_rate_limit",
///                     "token_rate_limit",
///                     "concurrency_limit",
///                     "usage_window",
///                     "ip_policy"
///                   ],
///                   "properties": {
///                     "label": { "type": "string" },
///                     "allowed_models": {
///                       "type": "array",
///                       "items": { "type": "string" }
///                     },
///                     "expires_at": {
///                       "type": ["integer", "null"],
///                       "format": "int64"
///                     },
///                     "spending_limits": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "required": [
///                           "currency",
///                           "enabled",
///                           "max_amount_nanos",
///                           "settled_amount_nanos",
///                           "reserved_amount_nanos",
///                           "remaining_allowance_nanos"
///                         ],
///                         "properties": {
///                           "currency": { "type": "string" },
///                           "enabled": { "type": "boolean" },
///                           "max_amount_nanos": { "type": ["string", "null"] },
///                           "settled_amount_nanos": { "type": "string" },
///                           "reserved_amount_nanos": { "type": "string" },
///                           "remaining_allowance_nanos": { "type": ["string", "null"] }
///                         }
///                       }
///                     },
///                     "request_rate_limit": {
///                       "type": "object",
///                       "required": [
///                         "enabled",
///                         "requests_per_minute",
///                         "window_seconds",
///                         "observed_requests_in_window",
///                         "remaining_requests_in_window"
///                       ],
///                       "properties": {
///                         "enabled": { "type": "boolean" },
///                         "requests_per_minute": { "type": ["integer", "null"] },
///                         "window_seconds": { "type": "integer" },
///                         "observed_requests_in_window": { "type": "integer" },
///                         "remaining_requests_in_window": { "type": ["integer", "null"] }
///                       }
///                     },
///                     "token_rate_limit": {
///                       "type": "object",
///                       "required": [
///                         "enabled",
///                         "tokens_per_minute",
///                         "window_seconds",
///                         "observed_tokens_in_window",
///                         "remaining_tokens_in_window"
///                       ],
///                       "properties": {
///                         "enabled": { "type": "boolean" },
///                         "tokens_per_minute": { "type": ["string", "null"] },
///                         "window_seconds": { "type": "integer" },
///                         "observed_tokens_in_window": { "type": "string" },
///                         "remaining_tokens_in_window": { "type": ["string", "null"] }
///                       }
///                     },
///                     "concurrency_limit": {
///                       "type": "object",
///                       "required": [
///                         "enabled",
///                         "max_concurrent_requests",
///                         "in_flight_requests",
///                         "remaining_concurrent_requests"
///                       ],
///                       "properties": {
///                         "enabled": { "type": "boolean" },
///                         "max_concurrent_requests": { "type": ["integer", "null"] },
///                         "in_flight_requests": { "type": "integer" },
///                         "remaining_concurrent_requests": { "type": ["integer", "null"] }
///                       }
///                     },
///                     "usage_window": {
///                       "type": "object",
///                       "required": [
///                         "window_seconds",
///                         "request_count",
///                         "known_usage_requests",
///                         "unknown_usage_requests",
///                         "prompt_tokens",
///                         "completion_tokens",
///                         "total_tokens"
///                       ],
///                       "properties": {
///                         "window_seconds": { "type": "integer" },
///                         "request_count": { "type": "integer" },
///                         "known_usage_requests": { "type": "integer" },
///                         "unknown_usage_requests": { "type": "integer" },
///                         "prompt_tokens": { "type": "string" },
///                         "completion_tokens": { "type": "string" },
///                         "total_tokens": { "type": "string" }
///                       }
///                     },
///                     "ip_policy": {
///                       "type": "object",
///                       "required": ["enabled", "allowed_cidrs"],
///                       "properties": {
///                         "enabled": { "type": "boolean" },
///                         "allowed_cidrs": {
///                           "type": "array",
///                           "items": { "type": "string" }
///                         }
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Missing, revoked, expired or invalid key."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
async fn inspect_key(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = state
        .authorize_api_headers_with_permission(&headers, niu_storage::AdminPermission::Read)
        .await?;
    let data = state
        .store
        .key_introspection(&principal)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({ "data": data })))
}

/// ```openapi
/// {
///   "path": "/v1/generations/{id}",
///   "method": "get",
///   "operation": {
///     "operationId": "getGeneration",
///     "summary": "Get generation usage, latency, and customer charge by ID",
///     "description": "Returns token breakdown, latency/timing observations, execution status, and customer-facing charge for a generation attempt in the authenticated key's workspace. Never exposes Provider purchase costs, platform margins, or internal correlation UUIDs.",
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
///         "description": "Generation telemetry and customer charge.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": ["data"],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "required": [
///                     "id",
///                     "model",
///                     "request_kind",
///                     "created_at",
///                     "execution",
///                     "usage_confidence",
///                     "usage",
///                     "customer_charge"
///                   ],
///                   "properties": {
///                     "id": { "type": "string", "format": "uuid" },
///                     "model": { "type": "string" },
///                     "provider_model": { "type": ["string", "null"] },
///                     "request_kind": { "type": "string", "enum": ["inference", "video"] },
///                     "created_at": { "type": "string", "format": "date-time" },
///                     "dispatched_at": { "type": ["string", "null"], "format": "date-time" },
///                     "completed_at": { "type": ["string", "null"], "format": "date-time" },
///                     "duration_ms": { "type": ["integer", "null"] },
///                     "execution": { "type": "string" },
///                     "usage_confidence": { "type": "string" },
///                     "usage": {
///                       "type": "object",
///                       "required": [
///                         "prompt_tokens",
///                         "completion_tokens",
///                         "cached_input_tokens",
///                         "cache_write_input_tokens",
///                         "reasoning_output_tokens"
///                       ],
///                       "properties": {
///                         "prompt_tokens": { "type": ["string", "null"] },
///                         "completion_tokens": { "type": ["string", "null"] },
///                         "cached_input_tokens": { "type": ["string", "null"] },
///                         "cache_write_input_tokens": { "type": ["string", "null"] },
///                         "reasoning_output_tokens": { "type": ["string", "null"] }
///                       }
///                     },
///                     "customer_charge": {
///                       "type": "object",
///                       "required": ["status", "currency", "amount_nanos"],
///                       "properties": {
///                         "status": { "type": "string" },
///                         "currency": { "type": ["string", "null"] },
///                         "amount_nanos": { "type": ["string", "null"] }
///                       }
///                     },
///                     "timing": { "type": ["object", "null"] },
///                     "finish_reasons": { "type": ["array", "null"] },
///                     "failure": { "type": ["object", "null"] },
///                     "output_guardrail_outcome": { "type": ["string", "null"] }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Missing, revoked, expired or invalid key."
///       },
///       "404": {
///         "description": "Generation not found in workspace."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
async fn get_generation(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = state
        .authorize_api_headers_with_permission(&headers, niu_storage::AdminPermission::Read)
        .await?;
    let entry = state
        .store
        .gateway_request(principal.scope(), id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let raw = serde_json::to_value(&entry)
        .map_err(|_| ApiError::invalid_request("Generation serialization failed"))?;
    Ok(Json(json!({
        "data": {
            "id": entry.attempt_id,
            "model": entry.model,
            "provider_model": entry.provider_model,
            "request_kind": raw.get("request_kind").cloned().unwrap_or(Value::Null),
            "created_at": entry.created_at,
            "dispatched_at": entry.dispatched_at,
            "completed_at": entry.completed_at,
            "duration_ms": entry.duration_ms,
            "execution": raw.get("execution").cloned().unwrap_or(Value::Null),
            "usage_confidence": raw.get("usage_confidence").cloned().unwrap_or(Value::Null),
            "usage": {
                "prompt_tokens": raw.get("prompt_tokens").cloned().unwrap_or(Value::Null),
                "completion_tokens": raw.get("completion_tokens").cloned().unwrap_or(Value::Null),
                "cached_input_tokens": raw.get("cached_input_tokens").cloned().unwrap_or(Value::Null),
                "cache_write_input_tokens": raw.get("cache_write_input_tokens").cloned().unwrap_or(Value::Null),
                "reasoning_output_tokens": raw.get("reasoning_output_tokens").cloned().unwrap_or(Value::Null),
            },
            "customer_charge": {
                "status": raw.get("customer_charge_status").cloned().unwrap_or(Value::Null),
                "currency": raw.get("customer_charge_currency").cloned().unwrap_or(Value::Null),
                "amount_nanos": raw.get("customer_charge_nanos").cloned().unwrap_or(Value::Null),
            },
            "timing": raw.get("timing").cloned().unwrap_or(Value::Null),
            "finish_reasons": raw.get("finish_reasons").cloned().unwrap_or(Value::Null),
            "failure": raw.get("failure").cloned().unwrap_or(Value::Null),
            "output_guardrail_outcome": raw.get("output_guardrail_outcome").cloned().unwrap_or(Value::Null),
        }
    })))
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
                "catalog": model.catalog.customer_metadata(),
                "capabilities": {
                    "chat_completions": model.protocol().supports_chat_completions(),
                    "streaming": model.protocol().supports_streaming(),
                    "embeddings": model.supports_embeddings,
                    "messages": model.supports_messages,
                    "messages_streaming": model.supports_messages_streaming,
                    "generate_content": model.supports_generate_content,
                    "responses": model.supports_responses
                }
            })
        })
        .collect();
    Ok(Json(json!({"object": "list", "data": data})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AdminModelScope {
    organization_id: Option<uuid::Uuid>,
    project_id: Option<uuid::Uuid>,
}

async fn admin_models(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(scope): Query<AdminModelScope>,
) -> Result<Json<Value>, ApiError> {
    let authorization = state
        .authorize_admin_headers(&headers, niu_storage::AdminPermission::Read)
        .await?;
    let organization_id = scope.organization_id.or(match authorization {
        crate::state::AdminAuthorization::Installation => None,
        crate::state::AdminAuthorization::Operator(operator) => {
            Some(operator.scope.organization_id)
        }
    });
    let models = if let Some(organization_id) = organization_id {
        if !authorization.permits_organization(organization_id) {
            return Err(ApiError::not_found());
        }
        crate::vendors::scoped_models(&state, organization_id).await?
    } else {
        crate::vendors::effective_models(&state).await?
    };
    let mut prices = std::collections::BTreeMap::new();
    if let Some(project_id) = scope.project_id {
        let organization_id = organization_id.ok_or_else(ApiError::not_found)?;
        let workspace_scope = niu_storage::TenantScope {
            organization_id,
            project_id,
        };
        if !authorization.permits_project(workspace_scope)
            || state
                .store
                .workspaces(Some(organization_id), Some(project_id))
                .await
                .map_err(ApiError::from_store)?
                .is_empty()
        {
            return Err(ApiError::not_found());
        }
        prices = state
            .store
            .customer_model_prices(workspace_scope)
            .await
            .map_err(ApiError::from_store)?;
        // Personal credentials do not incur a Niu customer tariff.
        for route in state
            .store
            .personal_vendor_routes(organization_id)
            .await
            .map_err(ApiError::from_store)?
        {
            prices.remove(&route.model.alias);
        }
    }
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
                "supports_messages": model.supports_messages,
                "supports_messages_streaming": model.supports_messages_streaming,
                "supports_messages_tools": model.supports_messages_tools,
                "supports_messages_streaming_tools": model.supports_messages_streaming_tools,
                "supports_generate_content": model.supports_generate_content,
                "supports_responses": model.supports_responses
            });
            if authorization.is_installation() {
                json!({
                "id": name,
                "provider": model.provider,
                "upstream_model": model.upstream_model,
                "public_catalog": model.public_catalog,
                    "catalog": model.catalog.customer_metadata(),
                    "customer_pricing": prices.get(name),
                    "supports_embeddings": model.supports_embeddings,
                    "supports_embedding_dimensions": model.supports_embedding_dimensions,
                    "supports_embedding_base64": model.supports_embedding_base64,
                    "supports_tool_calls": model.supports_tool_calls,
                    "supports_streaming_tool_calls": model.supports_streaming_tool_calls,
                    "supports_structured_output": model.supports_structured_output,
                    "supports_messages": model.supports_messages,
                "supports_messages_streaming": model.supports_messages_streaming,
                "supports_messages_tools": model.supports_messages_tools,
                "supports_messages_streaming_tools": model.supports_messages_streaming_tools,
                "supports_generate_content": model.supports_generate_content,
                    "supports_responses": model.supports_responses
                })
            } else {
                json!({
                    "id": name,
                    "public_catalog": model.public_catalog,
                    "catalog": model.catalog.customer_metadata(),
                    "customer_pricing": prices.get(name),
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
        .authorize_admin_headers(&headers, niu_storage::AdminPermission::Read)
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
