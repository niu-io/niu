use std::sync::atomic::Ordering;

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header::CACHE_CONTROL},
    middleware::{self, Next},
    response::Response,
    routing::{any, get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{error::ApiError, state::AppState};

use super::inference::{chat, embeddings, responses};

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
        .route("/admin/v1/organizations/{organization}/projects/{project}/video-intents", get(super::inference::video_intents::list))
        .route("/admin/v1/organizations/{organization}/projects/{project}/video-intents/{intent}", get(super::inference::video_intents::get).put(super::inference::video_intents::save).delete(super::inference::video_intents::delete).layer(DefaultBodyLimit::max(64 * 1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/video-intents/{intent}/submit", post(super::inference::video_intents::submit))
        .route("/v1/media/image-ingestions", get(super::image_ingestions::list))
        .route("/v1/media/image-ingestions/{id}/readiness/{read_id}", get(super::image_readiness::status).post(super::image_readiness::refresh))
        .route("/v1/media/image-sources", axum::routing::post(super::image_source_uploads::prepare).layer(DefaultBodyLimit::max(12*1024*1024+1024)))
        .route("/v1/media/image-sources/{id}", axum::routing::delete(super::image_source_uploads::erase))
        .route("/v1/media/image-ingestions/{id}/dispatch", axum::routing::post(super::image_ingestions::dispatch))
        .route("/v1/media/image-ingestions/{id}", get(super::image_ingestions::read).put(super::image_ingestions::prepare).delete(super::image_ingestions::revoke))
        .route("/v1/media/sources/{token}", get(super::image_sources::read).head(super::image_sources::reject_head))
        .route("/admin/v1/organizations/{organization}/projects/{project}/asset-group-intents", get(crate::admin::asset_requests::list))
        .route("/admin/v1/organizations/{organization}/projects/{project}/asset-group-intents/{intent}/request", get(crate::admin::asset_requests::get).delete(crate::admin::asset_requests::delete))
        .route("/auth/callback", get(crate::codex::callback))
        .route("/payments/zhifux/notify", axum::routing::post(crate::payments::notify).layer(DefaultBodyLimit::max(8192)))
        .route("/payments/epay/notify", get(crate::payments::epay_notify_get).post(crate::payments::epay_notify_post).layer(DefaultBodyLimit::max(8192)))
        .route("/payments/stripe/notify", axum::routing::post(crate::payments::stripe_notify).layer(DefaultBodyLimit::max(262144)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/codex-connections", get(crate::codex::list))
        .route("/admin/v1/organizations/{organization}/projects/{project}/codex-connections/sign-in", axum::routing::post(crate::codex::start))
        .route("/admin/v1/organizations/{organization}/projects/{project}/codex-connections/{id}", axum::routing::patch(crate::codex::set_enabled))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/detectors", get(crate::admin::guardrails::workspace_detectors))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors", get(crate::admin::guardrails::workspace_image_detectors))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/image-detectors/{detector}/preview", axum::routing::post(crate::admin::guardrails::image_detector_preview).layer(DefaultBodyLimit::max(2 * 1024 * 1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/detector-decisions", get(crate::admin::guardrails::detector_decisions))
        .route("/admin/v1/guardrails/detectors/{detector}", get(crate::admin::guardrails::detector_description))
        .route("/admin/v1/guardrails/detectors/{detector}/preview", axum::routing::post(crate::admin::guardrails::detector_preview))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/output-preview", axum::routing::post(crate::admin::guardrails::output_preview))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/revisions/{revision}", get(crate::admin::guardrails::read_revision))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/history", get(crate::admin::guardrails::history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail/history", get(crate::admin::guardrails::key_history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/guardrail", get(crate::admin::guardrails::read_key_assignment).put(crate::admin::guardrails::assign_key))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails", get(crate::admin::guardrails::read).put(crate::admin::guardrails::activate))
        .route("/admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}/guardrails", get(crate::admin::guardrails::dispatch_decision))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/denials", get(crate::admin::guardrails::preparation_denials))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/dispatch-denials", get(crate::admin::guardrails::dispatch_denials))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/input-preview", axum::routing::post(crate::admin::guardrails::input_preview))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/preview", axum::routing::post(crate::admin::guardrails::preview))
        .route("/admin/v1/organizations/{organization}/projects/{project}/guardrails/rollback", axum::routing::post(crate::admin::guardrails::rollback))
        .route("/admin/v1/organizations/{organization}/projects/{project}/chat-draft", get(crate::admin::chat_sessions::draft).put(crate::admin::chat_sessions::save_draft).layer(DefaultBodyLimit::max(24 * 1024 * 1024)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/chat-sessions", get(crate::admin::chat_sessions::list))
        .route("/admin/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}/archive", axum::routing::put(crate::admin::chat_sessions::archive).layer(DefaultBodyLimit::max(1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}/export", get(crate::admin::chat_sessions::export))
        .route("/admin/v1/organizations/{organization}/projects/{project}/chat-sessions/{id}", axum::routing::put(crate::admin::chat_sessions::save).delete(crate::admin::chat_sessions::delete).layer(DefaultBodyLimit::max(24 * 1024 * 1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/models", get(super::inference::dashboard_video::models))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/estimate", axum::routing::post(super::inference::dashboard_video::estimate).layer(DefaultBodyLimit::max(16 * 1024 * 1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs", get(super::inference::dashboard_video::history).post(super::inference::dashboard_video::create).layer(DefaultBodyLimit::max(16 * 1024 * 1024)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}", get(super::inference::dashboard_video::status))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/results/{kind}", get(super::inference::dashboard_video::result))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/results", get(super::inference::dashboard_video::results_status).delete(super::inference::dashboard_video::delete_results))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/billing", get(super::inference::dashboard_video::billing))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/timings", get(super::inference::dashboard_video::timings))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}/refresh", axum::routing::post(super::inference::dashboard_video::refresh))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/chat/completions", axum::routing::post(super::inference::dashboard_chat))
        .route("/admin/v1/organizations/{organization}/billing/transactions", get(crate::billing::balance_transactions))
        .route("/admin/v1/organizations/{organization}/billing/topups/{order}/reconcile", axum::routing::post(crate::payments::reconcile))
        .route("/admin/v1/organizations/{organization}/billing/topups", get(crate::payments::topup_history).post(crate::payments::create_topup))
        .route("/admin/v1/organizations/{organization}/billing/payment-methods", get(crate::payments::payment_methods))
        .route("/admin/v1/organizations/{organization}/billing/topups/{order}", get(crate::payments::topup_status))
        .route("/admin/v1/organizations/{organization}/billing/entries/{entry}/reversal", axum::routing::post(crate::billing::balance_reversal))
        .route("/admin/v1/organizations/{organization}/billing/accounts/{currency}/warning-threshold", axum::routing::put(crate::billing::balance_warning))
        .route("/admin/v1/organizations/{organization}/billing/accounts/{currency}/policy", axum::routing::put(crate::billing::balance_policy))
        .route("/admin/v1/organizations/{organization}/billing/balance", get(crate::billing::account_balance))
        .route("/admin/v1/organizations/{organization}/billing/charge-reconciliation", get(crate::billing::charge_reconciliation))
        .route("/admin/v1/organizations/{organization}/billing/media-rates/{revision}/retire", axum::routing::post(crate::billing::retire_media_rate).layer(axum::extract::DefaultBodyLimit::max(1024)))
        .route("/admin/v1/providers/{provider}/media-rates/{revision}/retire", axum::routing::post(crate::providers::retire_media_rate).layer(axum::extract::DefaultBodyLimit::max(1024)))
        .route("/admin/v1/providers/{provider}/media-offer-models", get(crate::providers::media_offer_models))
        .route("/admin/v1/providers/{provider}/media-offers", axum::routing::post(crate::providers::publish_media_offer).layer(axum::extract::DefaultBodyLimit::max(4096)))
        .route("/admin/v1/providers/{provider}/media-rate-models", get(crate::providers::media_rate_models))
        .route("/admin/v1/providers/{provider}/media-rates/replace", axum::routing::post(crate::providers::replace_media_rate).layer(axum::extract::DefaultBodyLimit::max(128 * 1024)))
        .route("/admin/v1/providers/{provider}/media-rates", get(crate::providers::media_rates).post(crate::providers::media_rate).layer(axum::extract::DefaultBodyLimit::max(128 * 1024)))
        .route("/admin/v1/organizations/{organization}/billing/media-rate-models", get(crate::billing::media_rate_models))
        .route("/admin/v1/organizations/{organization}/billing/media-rates/replace", axum::routing::post(crate::billing::replace_media_rate).layer(axum::extract::DefaultBodyLimit::max(128 * 1024)))
        .route("/admin/v1/organizations/{organization}/billing/media-rates", get(crate::billing::media_rates).post(crate::billing::media_rate).layer(axum::extract::DefaultBodyLimit::max(128 * 1024)))
        .route("/admin/v1/organizations/{organization}/billing/funding/settled", axum::routing::post(crate::billing::settled_funding))
        .route("/admin/v1/pricing/targets", get(crate::billing::platform_pricing::targets))
        .route("/admin/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs", get(crate::billing::platform_pricing::tariffs))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing", get(crate::billing::overview))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing/tariffs/{model}/history", get(crate::billing::tariff_history))
        .route("/admin/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs/{model}/history", get(crate::billing::platform_tariff_history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing/tariffs", axum::routing::post(crate::billing::tariff))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing/invoices", get(crate::billing::invoice_history::list).post(crate::billing::issue))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}", get(crate::billing::lines))
        .route("/admin/v1/organizations/{organization}/projects/{project}/billing/invoices/{invoice}/payment", axum::routing::post(crate::billing::payment))
        .route("/admin/v1/provider-memberships", get(crate::providers::memberships))
        .route("/v1/branding", get(crate::branding::public))
        .route("/admin/v1/platform/branding", get(crate::branding::read).put(crate::branding::save).layer(DefaultBodyLimit::max(450000)))
        .route("/admin/v1/platform/payments/integrations", get(crate::payments::integrations))
        .route("/admin/v1/platform/payments/epay", get(crate::payments::read_configuration_api).put(crate::payments::save_configuration_api).layer(DefaultBodyLimit::max(16384)))
        .route("/admin/v1/platform/configuration", get(crate::providers::platform_configuration))
        .route("/admin/v1/providers/{provider}", get(crate::providers::profile).patch(crate::providers::rename).delete(crate::providers::delete).layer(DefaultBodyLimit::max(16384)))
        .route("/admin/v1/providers", get(crate::providers::list).post(crate::providers::create))
        .route("/admin/v1/providers/{provider}/members", get(crate::providers::members))
        .route("/admin/v1/providers/{provider}/members/{operator}", axum::routing::put(crate::providers::set_member))
        .route("/admin/v1/providers/{provider}/qualification", axum::routing::put(crate::providers::qualify_business))
        .route("/admin/v1/providers/{provider}/qualification/revoke", axum::routing::post(crate::providers::revoke_business_qualification))
        .route("/admin/v1/providers/{provider}/offers", axum::routing::post(crate::providers::publish_offer))
        .route("/admin/v1/providers/{provider}/earnings", get(crate::providers::earning_history))
        .route("/admin/v1/providers/{provider}/settlements", get(crate::providers::settlement_history).post(crate::providers::record_settlement))
        .route("/admin/v1/providers/{provider}/administration", get(crate::providers::administration_dashboard))
        .route("/admin/v1/providers/{provider}/dashboard", get(crate::providers::dashboard))
        .route("/admin/v1/providers/{provider}/offers/{offer}", axum::routing::patch(crate::providers::set_offer))
        .route("/admin/v1/providers/{provider}/offers/{offer}/revisions", get(crate::providers::offer_history))
        .route("/admin/v1/providers/{provider}/offers/{offer}/revisions/{revision}", get(crate::providers::offer_revision))
        .route("/admin/v1/providers/{provider}/offers/{offer}/qualification", axum::routing::put(crate::providers::qualify_offer))
        .route("/admin/v1/providers/{provider}/offers/{offer}/qualification/revoke", axum::routing::post(crate::providers::revoke_offer_qualification))
        .route("/admin/v1/session", get(crate::admin::current_session).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/profile", get(crate::admin::profile::profile).put(crate::admin::profile::update_profile).layer(DefaultBodyLimit::max(180000)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/preferences", get(crate::admin::preferences::preferences).put(crate::admin::preferences::update_preferences).layer(DefaultBodyLimit::max(1024)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/password", axum::routing::put(crate::admin::passwords::change_password).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/config", get(crate::admin::passwords::configuration).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/browser/login", axum::routing::post(crate::admin::passwords::browser_login).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/browser/logout", axum::routing::post(crate::admin::passwords::browser_logout).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/logout", axum::routing::post(crate::admin::passwords::logout).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/auth/login", axum::routing::post(crate::admin::passwords::login).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route("/admin/v1/operators/{operator}/password", axum::routing::put(crate::admin::passwords::set_password).layer(DefaultBodyLimit::max(4096)).layer(middleware::from_fn(password_response_headers)))
        .route(
            "/admin/v1/setup/default-workspace",
            axum::routing::post(crate::admin::default_workspace),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/collector-keys",
            get(crate::admin::collector_keys).post(crate::admin::issue_collector_key),
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
            "/admin/v1/workspaces",
            get(crate::admin::workspaces).post(crate::admin::create_workspace),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}",
            axum::routing::patch(crate::admin::rename_workspace).delete(crate::admin::delete_workspace),
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
            axum::routing::delete(crate::admin::revoke_key).patch(crate::admin::update_key_metadata),
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
        .route("/v1/video/models", get(super::inference::video_models::models))
        .route("/v1/video/estimate", axum::routing::post(super::inference::video::estimate).layer(DefaultBodyLimit::max(16 * 1024 * 1024)))
        .route("/v1/video/jobs", get(super::inference::video::history).post(super::inference::video::create).layer(DefaultBodyLimit::max(16 * 1024 * 1024)))
        .route("/v1/video/jobs/{id}/timings", get(super::inference::video::timings))
        .route("/v1/video/jobs/{id}/billing", get(super::inference::video::billing))
        .route("/v1/video/jobs/{id}/refresh", axum::routing::post(super::inference::video::refresh))
        .route("/v1/video/jobs/{id}/results/{kind}", get(super::inference::video_results::retrieve))
        .route("/v1/video/jobs/{id}/results", get(super::inference::video_results::availability).delete(super::inference::video_results::delete))
        .route("/v1/video/jobs/{id}", get(super::inference::video::status))
        .route("/v1/chat/completions", axum::routing::post(chat))
        .route("/v1/responses", axum::routing::post(responses))
        .route("/v1/embeddings", axum::routing::post(embeddings))
        .route("/admin/v1/models", get(admin_models))
        .route("/admin/v1/vendors/{vendor}/cooldown", get(crate::admin::vendor_cooldown::read))
        .route("/admin/v1/vendors/{vendor}/request-rate-limit", get(crate::admin::vendor_request_rate::read).put(crate::admin::vendor_request_rate::write))
        .route("/admin/v1/vendors/{vendor}/request-rate-limit/history", get(crate::admin::vendor_request_rate::history))
        .route("/admin/v1/vendors", get(crate::vendors::list).post(crate::vendors::create))
        .route("/admin/v1/model-route-pools", axum::routing::get(crate::vendors::route_pools::get).put(crate::vendors::route_pools::put))
        .route("/admin/v1/model-route-pools/index", axum::routing::get(crate::vendors::route_pools::index))
        .route("/admin/v1/model-route-pools/history", axum::routing::get(crate::vendors::route_pools::history))
        .route("/admin/v1/vendors/{id}", axum::routing::put(crate::vendors::update))
        .route("/admin/v1/vendors/{id}/supplier", get(crate::vendors::supplier).put(crate::vendors::associate_supplier))
        .route("/admin/v1/vendors/{id}/asset-management", get(crate::vendors::asset_management_configuration).put(crate::vendors::configure_asset_management).delete(crate::vendors::revoke_asset_management).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/authorizations", get(crate::vendors::asset_authorizations::list).post(crate::vendors::asset_authorizations::create).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/authorizations/{authorization}", axum::routing::delete(crate::vendors::asset_authorizations::revoke))
        .route("/admin/v1/vendors/{id}/asset-management/lookups/{lookup}", get(crate::vendors::asset_lookups::get_result).delete(crate::vendors::asset_lookups::delete_result))
        .route("/admin/v1/vendors/{id}/asset-management/lookups", get(crate::vendors::asset_lookups::history).post(crate::vendors::asset_lookups::lookup).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/listings", get(crate::vendors::asset_listings::history).post(crate::vendors::asset_listings::list).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/listings/{listing}", get(crate::vendors::asset_listings::get_result).delete(crate::vendors::asset_listings::delete_result))
        .route("/admin/v1/vendors/{id}/asset-management/group-reads/{read}", get(crate::vendors::asset_reads::get_result).delete(crate::vendors::asset_reads::delete_result))
        .route("/admin/v1/vendors/{id}/asset-management/group-reads", get(crate::vendors::asset_reads::history).post(crate::vendors::asset_reads::read).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/group-updates/{update}", axum::routing::delete(crate::vendors::asset_updates::delete_patch))
        .route("/admin/v1/vendors/{id}/asset-management/group-updates/{update}/reconcile", axum::routing::post(crate::vendors::asset_updates::reconcile).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/group-updates/{update}/dispatch", axum::routing::post(crate::vendors::asset_updates::dispatch).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}/dispatch", axum::routing::post(crate::vendors::asset_deletions::dispatch).layer(DefaultBodyLimit::max(4096)))
        .route("/admin/v1/vendors/{id}/asset-management/group-deletion-consents", axum::routing::post(crate::vendors::asset_deletions::prepare).layer(DefaultBodyLimit::max(4096)))
        .route("/admin/v1/vendors/{id}/asset-management/group-deletion-consents/{consent}", get(crate::vendors::asset_deletions::read).delete(crate::vendors::asset_deletions::revoke))
        .route("/admin/v1/vendors/{id}/asset-management/group-updates", get(crate::vendors::asset_updates::history).post(crate::vendors::asset_updates::prepare).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/asset-management/groups", axum::routing::post(crate::vendors::asset_groups::create).layer(DefaultBodyLimit::max(16 * 1024)))
        .route("/admin/v1/vendors/{id}/personal-owner", axum::routing::put(crate::vendors::assign_personal_owner))
        .route("/admin/v1/vendors/{id}/models", get(crate::vendors::list_models).post(crate::vendors::upsert_model))
        .route("/admin/v1/vendors/{id}/catalog", get(crate::vendors::catalog).post(crate::vendors::refresh_catalog))
        .route("/admin/v1/vendors/{id}/check", axum::routing::post(crate::vendors::check_model))
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
            "/admin/v1/organizations/{organization}/projects/{project}/spending-limit",
            get(crate::admin::workspace_spending::list),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}",
            get(crate::admin::workspace_spending::read).put(crate::admin::workspace_spending::write),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}/history",
            get(crate::admin::workspace_spending::history),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/costs",
            get(crate::admin::costs),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}/payloads",
            get(crate::admin::request_payloads::get).delete(crate::admin::request_payloads::delete),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}",
            get(crate::admin::gateway_request),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/requests",
            get(crate::admin::gateway_activity),
        )
        .route(
            "/admin/v1/organizations/{organization}/projects/{project}/requests/export",
            get(crate::admin::request_exports::csv),
        )
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit", get(crate::admin::key_spending::list))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit/{currency}", axum::routing::put(crate::admin::key_spending::write).layer(DefaultBodyLimit::max(4096)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit/{currency}/history", get(crate::admin::key_spending::history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy", get(crate::admin::key_ip::read).put(crate::admin::key_ip::write).layer(DefaultBodyLimit::max(8192)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/ip-policy/history", get(crate::admin::key_ip::history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/request-rate-limit", get(crate::admin::key_request_rate::read).put(crate::admin::key_request_rate::write).layer(DefaultBodyLimit::max(8192)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/request-rate-limit/history", get(crate::admin::key_request_rate::history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-usage-window", get(crate::admin::key_request_rate::usage))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit", get(crate::admin::key_concurrency::read).put(crate::admin::key_concurrency::write).layer(DefaultBodyLimit::max(8192)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/concurrency-limit/history", get(crate::admin::key_concurrency::history))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit", get(crate::admin::key_token_rate::read).put(crate::admin::key_token_rate::write).layer(DefaultBodyLimit::max(8192)))
        .route("/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/token-rate-limit/history", get(crate::admin::key_token_rate::history))
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
        || path == "/enterprise/api/v1"
        || path.starts_with("/enterprise/api/v1/")
        || path == "/v1"
        || path.starts_with("/v1/");
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
///     "description": "Requires a current workspace API key and filters aliases by its model grants and organization access. customer_pricing is the current workspace selling tariff or null; personal credential routes omit customer prices. Token rates use currency nanounits per million tokens. request_fee_nanos and minimum_charge_nanos use currency nanounits per known completed request. Amounts and revisions are exact strings. Listing a model or tariff does not qualify generation or guarantee admission, balance or upstream availability. No Supplier procurement rates, upstream credentials, endpoints or private model mappings are exposed.",
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
///         "revision",
///         "currency",
///         "unit",
///         "prompt_rate",
///         "completion_rate",
///         "cached_prompt_rate",
///         "minimum_charge_nanos",
///         "request_fee_nanos"
///       ],
///       "properties": {
///         "revision": {
///           "type": "string",
///           "format": "uuid"
///         },
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
    let principal = state.authorize_api_headers(&headers).await?;
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
        .map(|model| json!({"id": model, "object": "model", "owned_by": "niu", "customer_pricing": prices.get(model)}))
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
                "catalog": model.catalog.customer_metadata(),
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
