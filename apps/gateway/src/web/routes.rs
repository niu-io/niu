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

use tower_http::compression::{CompressionLayer, predicate::NotForContentType};

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

#[derive(Clone, Debug)]
pub(crate) struct RequestId(#[allow(dead_code)] pub String);

pub(crate) fn resolve_or_generate_request_id(headers: &HeaderMap) -> String {
    let mut values = headers.get_all("x-request-id").iter();
    if let Some(first) = values.next()
        && values.next().is_none()
        && let Ok(raw) = first.to_str()
    {
        let trimmed = raw.trim();
        if !trimmed.is_empty()
            && trimmed.len() <= 128
            && trimmed
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b':'))
        {
            return trimmed.to_owned();
        }
    }
    uuid::Uuid::new_v4().to_string()
}

async fn request_id_correlation(mut request: axum::http::Request<Body>, next: Next) -> Response {
    let id = resolve_or_generate_request_id(request.headers());
    if let Ok(header_value) = HeaderValue::from_str(&id) {
        request
            .headers_mut()
            .insert("x-request-id", header_value.clone());
        request.extensions_mut().insert(RequestId(id));
        let mut response = next.run(request).await;
        response.headers_mut().insert("x-request-id", header_value);
        response
    } else {
        next.run(request).await
    }
}

fn workspace_and_generation_routes(app: Router<AppState>) -> Router<AppState> {
    app.route(
        "/api/v1/workspaces/{workspace}/assets",
        get(super::workspace_assets::list)
            .post(super::workspace_assets::upload)
            .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/assets/{asset}",
        get(super::workspace_assets::get)
            .patch(super::workspace_assets::rename)
            .delete(super::workspace_assets::delete)
            .layer(DefaultBodyLimit::max(1024)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/assets/{asset}/content",
        get(super::workspace_assets::content),
    )
    .route(
        "/api/v1/workspaces/{workspace}/video/intents",
        get(super::inference::video_intents::list),
    )
    .route(
        "/api/v1/workspaces/{workspace}/video/intents/{intent}",
        get(super::inference::video_intents::get)
            .put(super::inference::video_intents::save)
            .delete(super::inference::video_intents::delete)
            .layer(DefaultBodyLimit::max(64 * 1024)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/video/intents/{intent}/submit",
        post(super::inference::video_intents::submit),
    )
    .route(
        "/api/v1/workspaces/{workspace}/asset-group-intents",
        get(crate::admin::asset_requests::list),
    )
    .route(
        "/api/v1/workspaces/{workspace}/asset-group-intents/{intent}/request",
        get(crate::admin::asset_requests::get).delete(crate::admin::asset_requests::delete),
    )
    .route(
        "/api/v1/workspaces/{workspace}/video/draft",
        get(crate::admin::video_composer_drafts::draft)
            .put(crate::admin::video_composer_drafts::save_draft)
            .layer(DefaultBodyLimit::max(64 * 1024))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/chats/draft",
        get(crate::admin::chat_sessions::draft)
            .put(crate::admin::chat_sessions::save_draft)
            .layer(DefaultBodyLimit::max(24 * 1024 * 1024))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/chats",
        get(crate::admin::chat_sessions::list),
    )
    .route(
        "/api/v1/workspaces/{workspace}/chats/{id}/archive",
        axum::routing::put(crate::admin::chat_sessions::archive).layer(DefaultBodyLimit::max(1024)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/chats/{id}/export",
        get(crate::admin::chat_sessions::export),
    )
    .route(
        "/api/v1/workspaces/{workspace}/chats/{id}",
        get(crate::admin::chat_sessions::get)
            .put(crate::admin::chat_sessions::save)
            .delete(crate::admin::chat_sessions::delete)
            .layer(DefaultBodyLimit::max(24 * 1024 * 1024)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/tasks/{task}/refresh",
        axum::routing::post(super::inference::generations_task_actions::refresh)
            .layer(DefaultBodyLimit::max(1024)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/tasks/{task}/results/{kind}/refresh",
        axum::routing::post(super::inference::generations_task_actions::fresh_result)
            .layer(DefaultBodyLimit::max(1024)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/artifacts/{task}/{kind}/capture",
        get(super::inference::generations_artifact_captures::retrieve)
            .post(super::inference::generations_artifact_captures::capture)
            .layer(DefaultBodyLimit::max(1024)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/tasks",
        get(super::inference::generations_inventory::tasks),
    )
    .route(
        "/api/v1/workspaces/{workspace}/tasks/{task}",
        get(super::inference::generations_inventory::task),
    )
    .route(
        "/api/v1/workspaces/{workspace}/tasks/{task}/diagnostics",
        get(super::inference::generations_task_diagnostics::retrieve),
    )
    .route(
        "/api/v1/workspaces/{workspace}/artifacts",
        get(super::inference::generations_inventory::artifacts),
    )
    .route(
        "/api/v1/workspaces/{workspace}/artifacts/{task}/{kind}",
        get(super::inference::generations_inventory::artifact),
    )
    .route(
        "/api/v1/workspaces/{workspace}/artifacts/{task}/{kind}/content",
        get(super::inference::generations_inventory::content),
    )
    .route(
        "/api/v1/workspaces/{workspace}/sessions",
        get(super::inference::generations_sessions::list)
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/sessions/{session}",
        get(super::inference::generations_sessions::get)
            .put(super::inference::generations_sessions::create)
            .patch(super::inference::generations_sessions::update)
            .layer(DefaultBodyLimit::max(65536))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/sessions/{session}/turns/{turn}",
        axum::routing::put(super::inference::generations_sessions::append)
            .delete(super::inference::generations_sessions::delete_instruction)
            .layer(DefaultBodyLimit::max(65536))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/sessions/{session}/turns/{turn}/task",
        axum::routing::put(super::inference::generations_sessions::attach)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/sessions/{session}/turns/{turn}/intent",
        axum::routing::put(super::inference::generations_sessions::bind_intent)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
}

fn guardrail_and_codex_routes(app: Router<AppState>) -> Router<AppState> {
    app.route("/auth/callback", get(crate::codex::callback))
        .route(
            "/api/v1/workspaces/{workspace}/codex-connections",
            get(crate::codex::list),
        )
        .route(
            "/api/v1/workspaces/{workspace}/codex-connections/sign-in",
            axum::routing::post(crate::codex::start),
        )
        .route(
            "/api/v1/workspaces/{workspace}/codex-connections/{id}",
            axum::routing::patch(crate::codex::set_enabled),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails/detectors",
            get(crate::admin::guardrails::workspace_detectors),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails/media-detectors",
            get(crate::admin::media_detectors::list),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails/image-detectors",
            get(crate::admin::guardrails::workspace_image_detectors),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails/image-detectors/{detector}/preview",
            axum::routing::post(crate::admin::guardrails::image_detector_preview)
                .layer(DefaultBodyLimit::max(2 * 1024 * 1024)),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails/detector-decisions",
            get(crate::admin::guardrails::detector_decisions),
        )
        .route(
            "/api/v1/guardrails/detectors/{detector}",
            get(crate::admin::guardrails::detector_description),
        )
        .route(
            "/api/v1/guardrails/detectors/{detector}/preview",
            axum::routing::post(crate::admin::guardrails::detector_preview),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails/output-preview",
            axum::routing::post(crate::admin::guardrails::output_preview),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails/revisions/{revision}",
            get(crate::admin::guardrails::read_revision),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails/history",
            get(crate::admin::guardrails::history),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/guardrail/history",
            get(crate::admin::guardrails::key_history),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/guardrail",
            get(crate::admin::guardrails::read_key_assignment)
                .put(crate::admin::guardrails::assign_key),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails",
            get(crate::admin::guardrails::read).put(crate::admin::guardrails::activate),
        )
        .route(
            "/api/v1/workspaces/{workspace}/requests/{attempt}/guardrails",
            get(crate::admin::guardrails::dispatch_decision),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails/denials",
            get(crate::admin::guardrails::preparation_denials),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails/dispatch-denials",
            get(crate::admin::guardrails::dispatch_denials),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails/input-preview",
            axum::routing::post(crate::admin::guardrails::input_preview),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails/preview",
            axum::routing::post(crate::admin::guardrails::preview),
        )
        .route(
            "/api/v1/workspaces/{workspace}/guardrails/rollback",
            axum::routing::post(crate::admin::guardrails::rollback),
        )
}

fn billing_and_pricing_routes(app: Router<AppState>) -> Router<AppState> {
    app.route(
        "/api/plugins/v1/mock-payments/{*path}",
        axum::routing::get(crate::payments::mock_runtime::checkout_proxy)
            .post(crate::payments::mock_runtime::checkout_proxy)
            .layer(DefaultBodyLimit::max(16384)),
    )
    .route(
        "/payments/zhifux/notify",
        axum::routing::post(crate::payments::notify).layer(DefaultBodyLimit::max(8192)),
    )
    .route(
        "/payments/epay/notify",
        get(crate::payments::epay_notify_get)
            .post(crate::payments::epay_notify_post)
            .layer(DefaultBodyLimit::max(8192)),
    )
    .route(
        "/payments/stripe/notify",
        axum::routing::post(crate::payments::stripe_notify).layer(DefaultBodyLimit::max(262144)),
    )
    .route("/api/v1/organizations/{organization}/billing/transactions",
        get(crate::billing::balance_transactions),
    )
    .route("/api/v1/organizations/{organization}/billing/topups/{order}/reconcile",
        axum::routing::post(crate::payments::reconcile),
    )
    .route("/api/v1/organizations/{organization}/billing/topups",
        get(crate::payments::topup_history).post(crate::payments::create_topup),
    )
    .route("/api/v1/organizations/{organization}/billing/payment-methods",
        get(crate::payments::payment_methods),
    )
    .route("/api/v1/organizations/{organization}/billing/topups/{order}",
        get(crate::payments::topup_status),
    )
    .route("/api/v1/organizations/{organization}/billing/entries/{entry}/reversal",
        axum::routing::post(crate::billing::balance_reversal),
    )
    .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/warning-threshold",
        axum::routing::put(crate::billing::balance_warning),
    )
    .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/policy/history",
        get(crate::billing::balance_policy_history::history),
    )
    .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/policy",
        axum::routing::put(crate::billing::balance_policy),
    )
    .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/grants",
        axum::routing::post(crate::billing::noncash_grants::issue)
            .layer(axum::extract::DefaultBodyLimit::max(4096)),
    )
    .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/grants/issued",
        get(crate::billing::noncash_grants::issued),
    )
    .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/grants/{grant}",
        get(crate::billing::noncash_grants::issued_detail),
    )
    .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/grants/{grant}/correction",
        axum::routing::post(crate::billing::noncash_grants::correct_unused)
            .layer(axum::extract::DefaultBodyLimit::max(4096)),
    )
    .route("/api/v1/organizations/{organization}/billing/balance",
        get(crate::billing::account_balance),
    )
    .route("/api/v1/organizations/{organization}/billing/charge-reconciliation",
        get(crate::billing::charge_reconciliation),
    )
    .route("/api/v1/organizations/{organization}/billing/reservations",
        get(crate::billing::reservations::list),
    )
    .route("/api/v1/organizations/{organization}/billing/media-rates/{revision}/retire",
        axum::routing::post(crate::billing::retire_media_rate)
            .layer(axum::extract::DefaultBodyLimit::max(1024)),
    )
    .route("/api/v1/organizations/{organization}/billing/media-rate-models",
        get(crate::billing::media_rate_models),
    )
    .route("/api/v1/organizations/{organization}/billing/media-rates/replace",
        axum::routing::post(crate::billing::replace_media_rate)
            .layer(axum::extract::DefaultBodyLimit::max(128 * 1024)),
    )
    .route("/api/v1/organizations/{organization}/billing/media-rates",
        get(crate::billing::media_rates)
            .post(crate::billing::media_rate)
            .layer(axum::extract::DefaultBodyLimit::max(128 * 1024)),
    )
    .route("/api/v1/organizations/{organization}/billing/funding/settled",
        axum::routing::post(crate::billing::settled_funding),
    )
    .route("/api/v1/admin/pricing/models",
        get(crate::billing::platform_pricing::models),
    )
    .route("/api/v1/admin/finance/position",
        get(crate::billing::commercial_position::read),
    )
    .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepare",
        axum::routing::post(crate::billing::noncash_grants::prepare)
            .layer(axum::extract::DefaultBodyLimit::max(4096)),
    )
    .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepared",
        get(crate::billing::noncash_grants::prepared),
    )
    .route("/api/v1/organizations/{organization}/billing/accounts/{currency}/grants/prepared/{key}",
        get(crate::billing::noncash_grants::prepared_by_key),
    )
    .route("/api/v1/admin/customers",
        get(crate::billing::platform_accounts::list),
    )
    .route("/api/v1/admin/customers/{customer}",
        get(crate::billing::platform_accounts::get_customer),
    )
    .route("/api/v1/admin/customers/{customer}/pricing",
        get(crate::billing::platform_accounts::get_customer_pricing)
            .put(crate::billing::platform_accounts::set_customer_pricing)
            .layer(axum::extract::DefaultBodyLimit::max(131072)),
    )
    .route("/api/v1/admin/customers/{customer}/pricing/{price}",
        axum::routing::delete(crate::billing::platform_accounts::reset_customer_model_pricing),
    )
    .route("/api/v1/admin/finance/summary",
        get(crate::billing::financial_summary::read),
    )
    .route("/api/v1/workspaces/{workspace}/billing/media-retail-price-enrollment",
        get(crate::billing::media_retail_enrollment::read)
            .post(crate::billing::media_retail_enrollment::publish)
            .layer(axum::extract::DefaultBodyLimit::max(4096)),
    )
    .route("/api/v1/admin/providers/{supplier}/offers/{offer}/media-liability-bounds",
        get(crate::billing::media_liability::list)
            .post(crate::billing::media_liability::publish)
            .layer(axum::extract::DefaultBodyLimit::max(16384)),
    )
    .route("/api/v1/admin/providers/{supplier}/offers/{offer}/media-liability-bounds/{revision}/retire",
        axum::routing::post(crate::billing::media_liability::retire)
            .layer(axum::extract::DefaultBodyLimit::max(4096)),
    )
    .route("/api/v1/workspaces/{workspace}/billing/retail-price-enrollment",
        get(crate::billing::retail_pricing::enrollment)
            .post(crate::billing::retail_pricing::enroll_text)
            .layer(axum::extract::DefaultBodyLimit::max(4096)),
    )
    .route("/api/v1/admin/pricing/customers",
        get(crate::billing::retail_pricing::customers),
    )
    .route("/api/v1/admin/pricing/standard-prices/models",
        get(crate::billing::retail_pricing::registered_models),
    )
    .route("/api/v1/admin/pricing/standard-prices",
        get(crate::billing::retail_pricing::list)
            .post(crate::billing::retail_pricing::publish_standard)
            .layer(axum::extract::DefaultBodyLimit::max(65536)),
    )
    .route("/api/v1/admin/pricing/standard-prices/{price}/promotions",
        get(crate::billing::retail_pricing::promotions)
            .post(crate::billing::retail_pricing::publish_promotion)
            .layer(axum::extract::DefaultBodyLimit::max(65536)),
    )
    .route("/api/v1/admin/pricing/standard-prices/{price}/promotions/{promotion}/retire",
        axum::routing::post(crate::billing::retail_pricing::retire_promotion)
            .layer(axum::extract::DefaultBodyLimit::max(4096)),
    )
    .route("/api/v1/admin/pricing/standard-prices/{price}/history",
        get(crate::billing::retail_pricing::history),
    )
    .route("/api/v1/admin/pricing/standard-prices/{price}/preview",
        get(crate::billing::retail_pricing::preview),
    )
    .route("/api/v1/admin/pricing/targets",
        get(crate::billing::platform_pricing::targets),
    )
    .route("/api/v1/admin/pricing/organizations/{organization}/workspaces/{project}/tariffs",
        get(crate::billing::platform_pricing::tariffs),
    )
    .route(
        "/api/v1/workspaces/{workspace}/billing",
        get(crate::billing::overview),
    )
    .route("/api/v1/workspaces/{workspace}/billing/tariffs/{model}/history",
        get(crate::billing::tariff_history),
    )
    .route("/api/v1/admin/pricing/organizations/{organization}/workspaces/{project}/tariffs/{model}/history",
        get(crate::billing::platform_tariff_history),
    )
    .route("/api/v1/workspaces/{workspace}/billing/tariffs",
        axum::routing::post(crate::billing::tariff),
    )
    .route("/api/v1/workspaces/{workspace}/billing/invoices",
        get(crate::billing::invoice_history::list).post(crate::billing::issue),
    )
    .route("/api/v1/workspaces/{workspace}/billing/invoices/{invoice}",
        get(crate::billing::lines),
    )
    .route("/api/v1/workspaces/{workspace}/billing/invoices/{invoice}/payment",
        axum::routing::post(crate::billing::payment),
    )
}

fn provider_and_platform_routes(app: Router<AppState>) -> Router<AppState> {
    app.route(
        "/api/v1/admin/providers/{provider}/media-rates/{revision}/retire",
        axum::routing::post(crate::providers::retire_media_rate)
            .layer(axum::extract::DefaultBodyLimit::max(1024)),
    )
    .route(
        "/api/v1/admin/providers/{provider}/media-offer-models",
        get(crate::providers::media_offer_models),
    )
    .route(
        "/api/v1/admin/providers/{provider}/media-offers",
        axum::routing::post(crate::providers::publish_media_offer)
            .layer(axum::extract::DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/admin/providers/{provider}/media-rate-models",
        get(crate::providers::media_rate_models),
    )
    .route(
        "/api/v1/admin/providers/{provider}/media-rates/replace",
        axum::routing::post(crate::providers::replace_media_rate)
            .layer(axum::extract::DefaultBodyLimit::max(128 * 1024)),
    )
    .route(
        "/api/v1/admin/providers/{provider}/media-rates",
        get(crate::providers::media_rates)
            .post(crate::providers::media_rate)
            .layer(axum::extract::DefaultBodyLimit::max(128 * 1024)),
    )
    .route(
        "/api/v1/admin/providers/memberships",
        get(crate::providers::memberships),
    )
    .route("/api/v1/public/currency", get(crate::currency::read))
    .route(
        "/api/v1/admin/currency",
        get(crate::currency::read).put(crate::currency::save),
    )
    .route("/api/v1/public/branding", get(crate::branding::public))
    .route(
        "/api/v1/admin/branding",
        get(crate::branding::read)
            .put(crate::branding::save)
            .layer(DefaultBodyLimit::max(450000)),
    )
    .route(
        "/api/v1/admin/payments/bank",
        get(crate::payments::bank::read)
            .put(crate::payments::bank::save)
            .layer(DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/organizations/{organization}/billing/bank",
        get(crate::payments::bank::customer),
    )
    .route(
        "/api/v1/admin/payments/integrations",
        get(crate::payments::integrations),
    )
    .route(
        "/api/v1/payments/readiness",
        get(crate::payments::readiness::read),
    )
    .route(
        "/api/v1/admin/payments/stripe/verification",
        get(crate::payments::readiness::stripe_verification)
            .post(crate::payments::readiness::verify_stripe_account),
    )
    .route(
        "/api/v1/payments/environment",
        get(crate::payments::mock_runtime::environment),
    )
    .route(
        "/api/v1/admin/payments/mock",
        get(crate::payments::mock_runtime::read)
            .put(crate::payments::mock_runtime::save)
            .layer(DefaultBodyLimit::max(1024)),
    )
    .route(
        "/api/v1/admin/payments/epay",
        get(crate::payments::read_configuration_api)
            .put(crate::payments::save_configuration_api)
            .layer(DefaultBodyLimit::max(16384)),
    )
    .route(
        "/api/v1/admin/finance/recovery",
        get(crate::financial_recovery::diagnostics),
    )
    .route(
        "/api/v1/admin/configuration",
        get(crate::providers::platform_configuration),
    )
    .route("/api/v1/admin/units", get(crate::customer_units::read))
    .route(
        "/api/v1/admin/units/mode",
        get(crate::customer_units::mode_preview)
            .put(crate::customer_units::publish_mode)
            .layer(DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/admin/units/mode/previews",
        post(crate::customer_units::prepare_mode).layer(DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/admin/units/mode/previews/{preview}",
        get(crate::customer_units::read_mode_preview),
    )
    .route(
        "/api/v1/organizations/{organization}/billing/quotes",
        post(crate::customer_units::prepare_quote).layer(DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/organizations/{organization}/billing/units",
        get(crate::customer_units::balance),
    )
    .route(
        "/api/v1/organizations/{organization}/billing/units/grants",
        post(crate::customer_units::issue_grant).layer(DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/organizations/{organization}/billing/units/charges/{attempt}/refunds",
        post(crate::customer_units::refund_charge).layer(DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/organizations/{organization}/billing/units/purchases/{order}/reversals",
        get(crate::customer_units::preview_purchase_reversal)
            .post(crate::customer_units::reverse_purchase)
            .layer(DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/organizations/{organization}/billing/quotes/{quote}",
        get(crate::customer_units::read_quote),
    )
    .route(
        "/api/v1/admin/units/tariffs",
        get(crate::customer_units::read_text_tariff)
            .post(crate::customer_units::publish_text_tariff)
            .layer(DefaultBodyLimit::max(32768)),
    )
    .route(
        "/api/v1/admin/units/media/tariffs",
        get(crate::customer_units::list_media_tariffs)
            .post(crate::customer_units::publish_media_tariff)
            .layer(DefaultBodyLimit::max(16384)),
    )
    .route(
        "/api/v1/admin/units/definitions",
        post(crate::customer_units::publish_definition).layer(DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/admin/units/rules",
        post(crate::customer_units::publish_rule).layer(DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/admin/providers/{provider}/configuration-usage",
        get(crate::supplier_configuration_usage::read),
    )
    .route(
        "/api/v1/admin/providers/{provider}/integration",
        get(crate::provider_integrations::read_provider)
            .put(crate::provider_integrations::save_provider)
            .layer(DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/admin/providers/connections/{id}/integration",
        get(crate::provider_integrations::read_vendor)
            .put(crate::provider_integrations::save_vendor)
            .layer(DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/admin/providers/{provider}",
        get(crate::providers::profile)
            .patch(crate::providers::rename)
            .delete(crate::providers::delete)
            .layer(DefaultBodyLimit::max(16384)),
    )
    .route(
        "/api/v1/admin/providers/presets",
        get(crate::providers::presets),
    )
    .route(
        "/api/v1/admin/providers/{provider}/metadata",
        get(crate::providers::adapter_metadata),
    )
    .route(
        "/api/v1/admin/providers/{provider}/pricing",
        get(crate::providers::adapter_pricing).post(crate::providers::capture_adapter_pricing),
    )
    .route(
        "/api/v1/admin/providers/{provider}/pricing/history",
        get(crate::providers::price_history),
    )
    .route(
        "/api/v1/admin/providers/{provider}/pricing/{revision}",
        get(crate::providers::price_evidence),
    )
    .route(
        "/api/v1/admin/providers/{provider}/estimate",
        post(crate::providers::estimate_pricing).layer(DefaultBodyLimit::max(16384)),
    )
    .route(
        "/api/v1/admin/providers",
        get(crate::providers::list).post(crate::providers::create),
    )
    .route(
        "/api/v1/admin/providers/{provider}/members",
        get(crate::providers::members),
    )
    .route(
        "/api/v1/admin/providers/{provider}/members/{operator}",
        axum::routing::put(crate::providers::set_member),
    )
    .route(
        "/api/v1/admin/providers/{provider}/offers",
        get(crate::providers::offers).post(crate::providers::publish_offer),
    )
    .route(
        "/api/v1/admin/providers/{provider}/earnings",
        get(crate::providers::earning_history),
    )
    .route(
        "/api/v1/admin/providers/{provider}/settlements",
        get(crate::providers::settlement_history).post(crate::providers::record_settlement),
    )
    .route(
        "/api/v1/admin/providers/{provider}/settlements/preview",
        get(crate::providers::preview_settlement),
    )
    .route(
        "/api/v1/admin/providers/{provider}/administration",
        get(crate::providers::administration_dashboard),
    )
    .route(
        "/api/v1/admin/providers/{provider}/dashboard",
        get(crate::providers::dashboard),
    )
    .route(
        "/api/v1/admin/providers/{provider}/offers/{offer}",
        axum::routing::patch(crate::providers::set_offer),
    )
    .route(
        "/api/v1/admin/providers/{provider}/offers/{offer}/revisions",
        get(crate::providers::offer_history),
    )
    .route(
        "/api/v1/admin/providers/{provider}/offers/{offer}/revisions/{revision}",
        get(crate::providers::offer_revision),
    )
    .route(
        "/api/v1/admin/providers/{provider}/offers/{offer}/authorization",
        axum::routing::put(crate::providers::authorize_offer),
    )
    .route(
        "/api/v1/admin/providers/{provider}/offers/{offer}/authorization/{authorization}",
        axum::routing::delete(crate::providers::revoke_offer_authorization),
    )
}

fn auth_and_operator_routes(app: Router<AppState>) -> Router<AppState> {
    app.route(
        "/api/v1/admin/members/{operator}/role",
        get(crate::admin::member_administration)
            .put(crate::admin::set_member_administration)
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/session/role",
        axum::routing::put(crate::admin::update_session_role)
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/session/organization",
        axum::routing::put(crate::admin::switch_session_organization)
            .layer(DefaultBodyLimit::max(1024))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/session/memberships",
        axum::routing::post(crate::admin::claim_session_membership)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/session/invitations",
        axum::routing::post(super::invitations::accept_invitation)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/organizations/{organization}/invitations",
        get(super::invitations::list_invitations)
            .post(super::invitations::create_invitation)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/invitations/preview",
        axum::routing::post(super::invitations::preview_invitation)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/invitations/{invitation}",
        axum::routing::delete(super::invitations::cancel_invitation)
            .layer(DefaultBodyLimit::max(1024))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/session",
        get(crate::admin::current_session)
            .patch(crate::admin::patch_session)
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/auth/profile",
        get(crate::admin::profile::profile)
            .put(crate::admin::profile::update_profile)
            .layer(DefaultBodyLimit::max(180000))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/auth/preferences",
        get(crate::admin::preferences::preferences)
            .put(crate::admin::preferences::update_preferences)
            .layer(DefaultBodyLimit::max(1024))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/auth/password",
        axum::routing::put(crate::admin::passwords::change_password)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/public/config",
        get(crate::admin::passwords::public_config)
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/auth/config",
        get(crate::admin::passwords::configuration)
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/setup",
        axum::routing::post(crate::admin::passwords::complete_installation_setup)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/auth/browser/demo",
        axum::routing::post(crate::admin::passwords::browser_demo_login)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/auth/browser/login",
        axum::routing::post(crate::admin::passwords::browser_login)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/auth/browser/token",
        axum::routing::post(crate::admin::browser_tokens::exchange)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/auth/browser/logout",
        axum::routing::post(crate::admin::passwords::browser_logout)
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/auth/logout",
        axum::routing::post(crate::admin::passwords::logout)
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/auth/login",
        axum::routing::post(crate::admin::passwords::login)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/auth/registrations",
        axum::routing::post(crate::admin::registrations::submit)
            .layer(DefaultBodyLimit::max(8192))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/admin/registration",
        get(crate::admin::registrations::read_policy)
            .put(crate::admin::registrations::save_policy)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/admin/registrations",
        get(crate::admin::registrations::list)
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/admin/registrations/{registration}/approve",
        axum::routing::post(crate::admin::registrations::approve)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/admin/registrations/{registration}/reject",
        axum::routing::post(crate::admin::registrations::reject)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/members/{operator}/password",
        get(crate::admin::passwords::password_configuration)
            .put(crate::admin::passwords::set_password)
            .layer(DefaultBodyLimit::max(4096))
            .layer(middleware::from_fn(password_response_headers)),
    )
    .route(
        "/api/v1/setup/default-workspace",
        axum::routing::post(crate::admin::default_workspace),
    )
    .route(
        "/api/v1/organizations/{organization}",
        get(crate::admin::organization_route)
            .patch(crate::admin::rename_organization)
            .layer(DefaultBodyLimit::max(1024)),
    )
    .route(
        "/api/v1/organizations",
        get(crate::admin::organizations).post(crate::admin::organization),
    )
    .route(
        "/api/v1/workspaces/{workspace}",
        get(crate::admin::workspace_route)
            .patch(crate::admin::workspace_aliases::rename)
            .delete(crate::admin::workspace_aliases::delete),
    )
    .route("/api/v1/credits", get(admin_credits))
    .route(
        "/api/v1/workspaces",
        get(crate::admin::workspaces).post(crate::admin::create_workspace),
    )
    .route(
        "/api/v1/workspaces/{workspace}/incidents",
        get(crate::admin::connection_incidents::workspace_list),
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
        "/api/v1/workspaces/{workspace}/keys/requests/{request}",
        get(crate::admin::workspace_aliases::key_request_status),
    )
    .route(
        "/api/v1/workspaces/{workspace}/keys/{key}/rotate",
        axum::routing::post(crate::admin::workspace_aliases::rotate_key)
            .layer(DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/admin/audit",
        get(crate::admin::platform_audit::events),
    )
    .route(
        "/api/v1/members",
        get(crate::admin::operators).post(crate::admin::create_operator),
    )
    .route(
        "/api/v1/members/{operator}",
        axum::routing::delete(crate::admin::revoke_operator)
            .patch(super::operator_roles::update_operator_role)
            .layer(DefaultBodyLimit::max(4096)),
    )
    .route(
        "/api/v1/members/{operator}/sessions",
        get(crate::admin::operator_sessions).post(crate::admin::create_operator_session),
    )
    .route(
        "/api/v1/members/{operator}/events",
        get(crate::admin::operator_events),
    )
    .route(
        "/api/v1/members/{operator}/sessions/{session}",
        axum::routing::delete(crate::admin::revoke_operator_session),
    )
}

fn media_and_inference_routes(app: Router<AppState>) -> Router<AppState> {
    app.route(
        "/v1/media/image-ingestions",
        get(super::image_ingestions::list),
    )
    .route(
        "/v1/media/image-ingestions/{id}/readiness/{read_id}",
        get(super::image_readiness::status).post(super::image_readiness::refresh),
    )
    .route(
        "/v1/media/image-sources",
        axum::routing::post(super::image_source_uploads::prepare)
            .layer(DefaultBodyLimit::max(12 * 1024 * 1024 + 1024)),
    )
    .route(
        "/v1/media/image-sources/{id}",
        axum::routing::delete(super::image_source_uploads::erase),
    )
    .route(
        "/v1/media/image-ingestions/{id}/dispatch",
        axum::routing::post(super::image_ingestions::dispatch),
    )
    .route(
        "/v1/media/image-ingestions/{id}",
        get(super::image_ingestions::read)
            .put(super::image_ingestions::prepare)
            .delete(super::image_ingestions::revoke),
    )
    .route(
        "/v1/media/sources/{token}",
        get(super::image_sources::read).head(super::image_sources::reject_head),
    )
    .route("/catalog/v1/models", get(catalog_models))
    .route("/v1/models", get(public_models))
    .route("/v1/key", get(inspect_key))
    .route("/v1/credits", get(key_credits))
    .route("/v1/generations/{id}", get(get_generation))
    .route(
        "/api/v1/workspaces/{workspace}/media/asset-operation-models",
        get(super::provider_assets::historical_models),
    )
    .route(
        "/api/v1/workspaces/{workspace}/media/operations",
        get(super::provider_assets::list_historical_operations)
            .layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/media/operations/{id}",
        get(super::provider_assets::get_historical_operation)
            .layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/media/operations/by-idempotency/{id}",
        get(super::provider_assets::get_historical_operation_by_idempotency)
            .layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/api/v1/workspaces/{workspace}/media/operations/{id}/cancel",
        post(super::provider_assets::cancel_historical_operation)
            .layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/capabilities",
        get(super::provider_capabilities::discover),
    )
    .route(
        "/v1/media/verifications",
        get(super::provider_verification::list)
            .post(super::provider_verification::create)
            .layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/verifications/{id}",
        get(super::provider_verification::get).layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/verifications/{id}/refresh",
        post(super::provider_verification::refresh).layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/verifications/{id}/link",
        get(super::provider_verification::link).layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/groups",
        get(super::provider_assets::list_groups)
            .post(super::provider_assets::create_group)
            .layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/groups/{id}",
        get(super::provider_assets::get_group)
            .patch(super::provider_assets::update_group)
            .delete(super::provider_assets::delete_group)
            .layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/groups/{id}/refresh",
        post(super::provider_assets::refresh_group).layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/assets",
        get(super::provider_assets::list_assets)
            .post(super::provider_assets::create_asset)
            .layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/assets/{id}",
        get(super::provider_assets::get_asset)
            .patch(super::provider_assets::rename_asset)
            .delete(super::provider_assets::delete_asset)
            .layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/assets/{id}/refresh",
        post(super::provider_assets::refresh_asset).layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/operations",
        get(super::provider_assets::list_operations).layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/operations/prepare",
        post(super::provider_assets::prepare_operation).layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/operations/{id}/dispatch",
        post(super::provider_assets::dispatch_operation).layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/operations/{id}/cancel",
        post(super::provider_assets::cancel_operation).layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/operations/by-idempotency/{id}",
        get(super::provider_assets::get_operation_by_idempotency)
            .layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/media/operations/{id}",
        get(super::provider_assets::get_operation).layer(DefaultBodyLimit::max(16 * 1024)),
    )
    .route(
        "/v1/video/models",
        get(super::inference::video_models::models),
    )
    .route(
        "/v1/video/estimate",
        axum::routing::post(super::inference::video::estimate)
            .layer(DefaultBodyLimit::max(16 * 1024 * 1024)),
    )
    .route(
        "/v1/video/jobs",
        get(super::inference::video::history)
            .post(super::inference::video::create)
            .layer(DefaultBodyLimit::max(16 * 1024 * 1024)),
    )
    .route(
        "/v1/video/jobs/{id}/timings",
        get(super::inference::video::timings),
    )
    .route(
        "/v1/video/jobs/{id}/billing",
        get(super::inference::video::billing),
    )
    .route(
        "/v1/video/jobs/{id}/observations",
        get(super::inference::video_observations::observations),
    )
    .route(
        "/v1/video/jobs/{id}/refresh",
        axum::routing::post(super::inference::video::refresh),
    )
    .route(
        "/v1/video/jobs/{id}/results/{kind}/refresh",
        post(super::inference::video_results::retrieve_fresh),
    )
    .route(
        "/v1/video/jobs/{id}/results/{kind}",
        get(super::inference::video_results::retrieve),
    )
    .route(
        "/v1/video/jobs/{id}/results",
        get(super::inference::video_results::availability)
            .delete(super::inference::video_results::delete),
    )
    .route("/v1/video/jobs/{id}", get(super::inference::video::status))
    .route(
        "/v1beta/models/{model_action}",
        post(generate_content).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
    )
    .route(
        "/v1/messages",
        post(messages).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
    )
    .route("/v1/chat/completions", axum::routing::post(chat))
    .route(
        "/v1/responses",
        axum::routing::post(responses).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
    )
    .route("/v1/embeddings", axum::routing::post(embeddings))
    .route(
        "/v1/decisions",
        post(super::decisions::create).layer(DefaultBodyLimit::max(64 * 1024)),
    )
}

fn vendor_and_observability_routes(app: Router<AppState>) -> Router<AppState> {
    app.route("/api/v1/models", get(admin_models))
        .route(
            "/api/v1/admin/providers/connections/{vendor}/cooldown",
            get(crate::admin::vendor_cooldown::read),
        )
        .route(
            "/api/v1/admin/providers/connections/{vendor}/incidents",
            get(crate::admin::connection_incidents::list),
        )
        .route(
            "/api/v1/admin/incidents",
            get(crate::admin::connection_incidents::platform_list),
        )
        .route(
            "/api/v1/admin/incidents/{incident}/connection",
            get(crate::admin::connection_incidents::resolve_connection),
        )
        .route(
            "/api/v1/admin/providers/connections/{vendor}/request-rate-limit",
            get(crate::admin::vendor_request_rate::read)
                .put(crate::admin::vendor_request_rate::write),
        )
        .route(
            "/api/v1/admin/providers/connections/{vendor}/request-rate-limit/history",
            get(crate::admin::vendor_request_rate::history),
        )
        .route(
            "/api/v1/admin/providers/connections",
            get(crate::vendors::list).post(crate::vendors::create),
        )
        .route(
            "/api/v1/admin/routing",
            axum::routing::get(crate::vendors::route_pools::collection)
                .put(crate::vendors::route_pools::put),
        )
        .route(
            "/api/v1/admin/routing/index",
            axum::routing::get(crate::vendors::route_pools::index),
        )
        .route(
            "/api/v1/admin/routing/{reference}",
            axum::routing::get(crate::vendors::route_pools::member),
        )
        .route(
            "/api/v1/admin/routing/{reference}/history",
            axum::routing::get(crate::vendors::route_pools::member_history),
        )
        .route(
            "/api/v1/admin/routing/{reference}/preview",
            axum::routing::post(crate::vendors::route_pools::member_preview),
        )
        .route(
            "/api/v1/admin/routing/{reference}/audit",
            axum::routing::get(crate::vendors::route_pools::member_audit),
        )
        .route(
            "/api/v1/admin/routing/history",
            axum::routing::get(crate::vendors::route_pools::history),
        )
        .route(
            "/api/v1/admin/routing/registry",
            get(crate::vendors::publication::status),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}",
            axum::routing::put(crate::vendors::update),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/retire",
            axum::routing::post(crate::vendors::retire),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/supplier",
            get(crate::vendors::supplier).put(crate::vendors::associate_supplier),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management",
            get(crate::vendors::asset_management_configuration)
                .put(crate::vendors::configure_asset_management)
                .delete(crate::vendors::revoke_asset_management)
                .layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/authorizations",
            get(crate::vendors::asset_authorizations::list)
                .post(crate::vendors::asset_authorizations::create)
                .layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/authorizations/{authorization}",
            axum::routing::delete(crate::vendors::asset_authorizations::revoke),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/lookups/{lookup}",
            get(crate::vendors::asset_lookups::get_result)
                .delete(crate::vendors::asset_lookups::delete_result),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/lookups",
            get(crate::vendors::asset_lookups::history)
                .post(crate::vendors::asset_lookups::lookup)
                .layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/listings",
            get(crate::vendors::asset_listings::history)
                .post(crate::vendors::asset_listings::list)
                .layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/listings/{listing}",
            get(crate::vendors::asset_listings::get_result)
                .delete(crate::vendors::asset_listings::delete_result),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/group-reads/{read}",
            get(crate::vendors::asset_reads::get_result)
                .delete(crate::vendors::asset_reads::delete_result),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/group-reads",
            get(crate::vendors::asset_reads::history)
                .post(crate::vendors::asset_reads::read)
                .layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/group-updates/{update}",
            axum::routing::delete(crate::vendors::asset_updates::delete_patch),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/group-updates/{update}/reconcile",
            axum::routing::post(crate::vendors::asset_updates::reconcile)
                .layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/group-updates/{update}/dispatch",
            axum::routing::post(crate::vendors::asset_updates::dispatch)
                .layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/group-deletion-consents/{consent}/dispatch",
            axum::routing::post(crate::vendors::asset_deletions::dispatch)
                .layer(DefaultBodyLimit::max(4096)),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/group-deletion-consents",
            axum::routing::post(crate::vendors::asset_deletions::prepare)
                .layer(DefaultBodyLimit::max(4096)),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/group-deletion-consents/{consent}",
            get(crate::vendors::asset_deletions::read)
                .delete(crate::vendors::asset_deletions::revoke),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/group-updates",
            get(crate::vendors::asset_updates::history)
                .post(crate::vendors::asset_updates::prepare)
                .layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/asset-management/groups",
            axum::routing::post(crate::vendors::asset_groups::create)
                .layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/personal-owner",
            axum::routing::put(crate::vendors::assign_personal_owner),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/models",
            get(crate::vendors::list_models).post(crate::vendors::upsert_model),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/import",
            post(crate::vendors::import_models),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/catalog",
            get(crate::vendors::catalog).post(crate::vendors::refresh_catalog),
        )
        .route(
            "/api/v1/admin/providers/connections/{id}/check",
            axum::routing::post(crate::vendors::check_model),
        )
        .route(
            "/api/v1/workspaces/{workspace}/spending-limit",
            get(crate::admin::workspace_spending::list),
        )
        .route(
            "/api/v1/workspaces/{workspace}/spending-limit/{currency}",
            get(crate::admin::workspace_spending::read)
                .put(crate::admin::workspace_spending::write),
        )
        .route(
            "/api/v1/workspaces/{workspace}/spending-limit/{currency}/history",
            get(crate::admin::workspace_spending::history),
        )
        .route(
            "/api/v1/workspaces/{workspace}/units/limit",
            get(crate::customer_units::read_workspace_limit)
                .put(crate::customer_units::write_workspace_limit)
                .layer(DefaultBodyLimit::max(4096)),
        )
        .route(
            "/api/v1/workspaces/{workspace}/units/limit/history",
            get(crate::customer_units::workspace_limit_history),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/units/limit",
            get(crate::customer_units::read_key_limit)
                .put(crate::customer_units::write_key_limit)
                .layer(DefaultBodyLimit::max(4096)),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/units/limit/history",
            get(crate::customer_units::key_limit_history),
        )
        .route(
            "/api/v1/workspaces/{workspace}/requests/{attempt}/usage-reconciliation",
            get(crate::billing::usage_reconciliation::get)
                .post(crate::billing::usage_reconciliation::reconcile),
        )
        .route(
            "/api/v1/workspaces/{workspace}/requests/{attempt}/payloads",
            get(crate::admin::request_payloads::get).delete(crate::admin::request_payloads::delete),
        )
        .route(
            "/api/v1/workspaces/{workspace}/requests/{attempt}",
            get(crate::admin::gateway_request),
        )
        .route(
            "/api/v1/workspaces/{workspace}/requests",
            get(crate::admin::gateway_activity),
        )
        .route(
            "/api/v1/workspaces/{workspace}/requests/export",
            get(crate::admin::request_exports::csv),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/spending-limit",
            get(crate::admin::key_spending::list),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/spending-limit/{currency}",
            axum::routing::put(crate::admin::key_spending::write)
                .layer(DefaultBodyLimit::max(4096)),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/spending-limit/{currency}/history",
            get(crate::admin::key_spending::history),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/ip-policy",
            get(crate::admin::key_ip::read)
                .put(crate::admin::key_ip::write)
                .layer(DefaultBodyLimit::max(8192)),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/ip-policy/history",
            get(crate::admin::key_ip::history),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/request-rate-limit",
            get(crate::admin::key_request_rate::read)
                .put(crate::admin::key_request_rate::write)
                .layer(DefaultBodyLimit::max(8192)),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/request-rate-limit/history",
            get(crate::admin::key_request_rate::history),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/token-usage-window",
            get(crate::admin::key_request_rate::usage),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/concurrency-limit",
            get(crate::admin::key_concurrency::read)
                .put(crate::admin::key_concurrency::write)
                .layer(DefaultBodyLimit::max(8192)),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/concurrency-limit/history",
            get(crate::admin::key_concurrency::history),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/capacity",
            get(crate::admin::key_concurrency::capacity),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/token-rate-limit",
            get(crate::admin::key_token_rate::read)
                .put(crate::admin::key_token_rate::write)
                .layer(DefaultBodyLimit::max(8192)),
        )
        .route(
            "/api/v1/workspaces/{workspace}/keys/{key}/token-rate-limit/history",
            get(crate::admin::key_token_rate::history),
        )
        .route("/api/v1/admin/metrics", get(admin_metrics))
        .route(
            "/api/v1/admin/plugins/outbox/deliver",
            axum::routing::post(crate::enterprise::deliver_outbox),
        )
}

pub(crate) fn router(state: AppState) -> Router {
    let enterprise_enabled = state.enterprise.is_some();
    let app = Router::new();
    let app = workspace_and_generation_routes(app);
    let app = guardrail_and_codex_routes(app);
    let app = billing_and_pricing_routes(app);
    let app = provider_and_platform_routes(app);
    let app = auth_and_operator_routes(app);
    let app = app.merge(
        Router::new()
            .route(
                "/api/v1/workspaces/{workspace}/routing",
                get(super::workspace_review::pools),
            )
            .route(
                "/api/v1/workspaces/{workspace}/routing/{slug}",
                get(super::workspace_review::pool)
                    .put(super::workspace_review::put_pool)
                    .delete(super::workspace_review::delete_pool),
            )
            .route(
                "/api/v1/workspaces/{workspace}/routing/{slug}/history",
                get(super::workspace_review::pool_history),
            )
            .route(
                "/api/v1/workspaces/{workspace}/routing/{slug}/selections",
                get(super::workspace_review::pool_selections),
            )
            .route(
                "/api/v1/workspaces/{workspace}/events",
                get(super::workspace_review::subscriptions),
            )
            .route(
                "/api/v1/workspaces/{workspace}/events/{slug}",
                get(super::workspace_review::subscription),
            )
            .route(
                "/api/v1/workspaces/{workspace}/events/{slug}/deliveries",
                get(super::workspace_review::deliveries),
            )
            .route(
                "/api/v1/workspaces/{workspace}/evaluations",
                get(super::workspace_review::evaluations),
            )
            .route(
                "/api/v1/workspaces/{workspace}/evaluations/{slug}",
                get(super::workspace_review::evaluation)
                    .put(super::workspace_review::put_evaluation),
            )
            .route(
                "/api/v1/workspaces/{workspace}/evaluations/{slug}/runs",
                get(super::workspace_review::runs),
            )
            .route(
                "/api/v1/workspaces/{workspace}/evaluations/{slug}/runs/{run}",
                get(super::workspace_review::run),
            )
            .route(
                "/api/v1/workspaces/{workspace}/evaluations/{slug}/compare",
                get(super::workspace_review::compare),
            )
            .route("/v1/evaluations", get(super::workspace_evaluations::list))
            .route(
                "/v1/evaluations/fingerprint",
                post(super::workspace_evaluations::fingerprint),
            )
            .route(
                "/v1/evaluations/{slug}",
                get(super::workspace_evaluations::get).put(super::workspace_evaluations::put),
            )
            .route(
                "/v1/evaluations/{slug}/attempts",
                get(super::workspace_evaluations::attempts),
            )
            .route(
                "/v1/evaluations/{slug}/runs",
                get(super::workspace_evaluations::runs).post(super::workspace_evaluations::record),
            )
            .route(
                "/v1/evaluations/{slug}/runs/{run}",
                get(super::workspace_evaluations::run),
            )
            .route(
                "/v1/evaluations/{slug}/compare",
                get(super::workspace_evaluations::compare),
            )
            .route("/v1/events", get(super::workspace_events::list))
            .route("/v1/events/log", get(super::workspace_events::log))
            .route(
                "/v1/incidents/{reference}",
                get(super::workspace_events::incident),
            )
            .route(
                "/v1/events/{slug}",
                get(super::workspace_events::get).put(super::workspace_events::put),
            )
            .route(
                "/v1/events/{slug}/history",
                get(super::workspace_events::history),
            )
            .route(
                "/v1/events/{slug}/deliveries",
                get(super::workspace_events::deliveries),
            )
            .route(
                "/v1/events/{slug}/test",
                post(super::workspace_events::test),
            )
            .route("/v1/routing", get(super::workspace_pools::list))
            .route("/v1/routing/preview", post(super::workspace_pools::preview))
            .route(
                "/v1/routing/{slug}",
                get(super::workspace_pools::get)
                    .put(super::workspace_pools::put)
                    .delete(super::workspace_pools::remove),
            )
            .route(
                "/v1/routing/{slug}/selections",
                get(super::workspace_pools::selections),
            )
            .route(
                "/v1/routing/{slug}/history",
                get(super::workspace_pools::history),
            )
            .layer(DefaultBodyLimit::max(65536))
            .layer(middleware::from_fn(password_response_headers)),
    );

    let app = app.merge(
        Router::new()
            .route(
                "/api/v1/auth/agents",
                post(crate::admin::agent_authorizations::create),
            )
            .route(
                "/api/v1/auth/agents/token",
                post(crate::admin::agent_authorizations::exchange),
            )
            .route(
                "/api/v1/auth/agents/{code}",
                get(crate::admin::agent_authorizations::view)
                    .post(crate::admin::agent_authorizations::decide),
            )
            .layer(DefaultBodyLimit::max(16384))
            .layer(middleware::from_fn(password_response_headers)),
    );
    let app = app
        .merge(super::static_site::router())
        .route("/healthz", get(health))
        .route("/readyz", get(ready))
        .route("/openapi.json", get(openapi_json))
        .route("/openapi.yaml", get(openapi_yaml))
        .route("/enterprise/readyz", get(enterprise_ready))
        .route("/plugins/readyz", get(enterprise_ready));
    let app = media_and_inference_routes(app);
    let app = vendor_and_observability_routes(app)
        .route("/v1", any(api_not_found))
        .route("/v1/{*path}", any(api_not_found))
        .route("/v1beta", any(api_not_found))
        .route("/v1beta/{*path}", any(api_not_found))
        .route("/catalog/v1", any(api_not_found))
        .route("/catalog/v1/{*path}", any(api_not_found))
        .route("/api/v1", any(api_not_found))
        .route("/api/v1/{*path}", any(api_not_found));
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
        crate::payments::readiness::gate,
    ))
    .layer(DefaultBodyLimit::max(1_048_576))
    .layer(middleware::from_fn_with_state(
        state.clone(),
        crate::request_timings::collect,
    ))
    .layer(middleware::from_fn_with_state(
        state.clone(),
        crate::request_payloads::capture,
    ))
    .layer(middleware::from_fn_with_state(
        state.clone(),
        crate::request_body::limit,
    ))
    .layer(middleware::from_fn(private_api_cache_control))
    .layer(middleware::from_fn_with_state(
        state.clone(),
        crate::request_source::capture,
    ))
    .layer(middleware::from_fn(request_id_correlation))
    .layer(CompressionLayer::new().compress_when(NotForContentType::const_new("text/event-stream")))
    .with_state(state)
}

async fn private_api_cache_control(request: axum::http::Request<Body>, next: Next) -> Response {
    let path = request.uri().path();
    let private = path == "/auth/callback"
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

/// ```openapi
/// {
///   "path": "/openapi.json",
///   "method": "get",
///   "operation": {
///     "operationId": "getOpenApiJson",
///     "summary": "Download the public OpenAPI 3.1 JSON specification",
///     "description": "Public, bundled OpenAPI 3.1 JSON document covering Niu's model runtime, console, and customer management APIs with x-niu-authority metadata. Excludes confidential platform/provider procurement schemas.",
///     "security": [],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Bundled OpenAPI 3.1 JSON specification.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": ["openapi", "info", "paths"],
///               "properties": {
///                 "openapi": { "type": "string" },
///                 "info": { "type": "object" },
///                 "paths": { "type": "object" }
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
async fn openapi_json() -> ([(axum::http::HeaderName, &'static str); 2], &'static str) {
    (
        [
            (
                axum::http::header::CONTENT_TYPE,
                "application/json; charset=utf-8",
            ),
            (CACHE_CONTROL, "public, max-age=300"),
        ],
        include_str!("../../../../contracts/generated/public-openapi.json"),
    )
}

/// ```openapi
/// {
///   "path": "/openapi.yaml",
///   "method": "get",
///   "operation": {
///     "operationId": "getOpenApiYaml",
///     "summary": "Download the public OpenAPI 3.1 YAML specification",
///     "description": "Public, bundled OpenAPI 3.1 YAML document covering Niu's model runtime, console, and customer management APIs with x-niu-authority metadata. Excludes confidential platform/provider procurement schemas.",
///     "security": [],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Bundled OpenAPI 3.1 YAML specification.",
///         "content": {
///           "application/yaml": {
///             "schema": {
///               "type": "string"
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
async fn openapi_yaml() -> ([(axum::http::HeaderName, &'static str); 2], &'static str) {
    (
        [
            (
                axum::http::header::CONTENT_TYPE,
                "application/yaml; charset=utf-8",
            ),
            (CACHE_CONTROL, "public, max-age=300"),
        ],
        include_str!("../../../../contracts/generated/public-openapi.yaml"),
    )
}

async fn ready(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let check = tokio::time::timeout(std::time::Duration::from_secs(3), async {
        state
            .store
            .ready()
            .await
            .map_err(|_| ApiError::storage_unavailable())?;
        state
            .store
            .require_current_inspection_schema()
            .await
            .map_err(|_| ApiError::storage_unavailable())?;
        crate::vendors::publication::snapshot(&state)
            .await
            .map_err(|_| ApiError::storage_unavailable())?;
        crate::vendors::verify_encryption_readiness(&state.store, state.vendor_cipher.as_deref())
            .await
            .map_err(|_| ApiError::storage_unavailable())?;
        Ok::<(), ApiError>(())
    })
    .await
    .map_err(|_| ApiError::storage_unavailable())?;
    check?;
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
///     "description": "Requires a current workspace API key and filters aliases by its model grants and organization access. Tool capability flags reflect the configured route, not a guarantee of admission or live upstream availability. customer_pricing is the current workspace selling tariff or null; personal credential routes omit customer prices. Token rates use currency nanounits per million tokens. request_fee_nanos and minimum_charge_nanos use currency nanounits per known completed request. Amounts are exact strings. Listing a model or tariff does not qualify generation or guarantee admission, balance or upstream availability. No Provider procurement rates, internal revision identifiers, upstream credentials, endpoints or private model mappings are exposed. Enrolled text models resolve the own-customer promotion, then global promotion, then standard price at server time; this is advisory until admission pins a concrete revision. No other-customer rules are exposed.",
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
///                       },
///                       "customer_unit_pricing": {
///                         "type": [
///                           "object",
///                           "null"
///                         ]
///                       },
///                       "capabilities": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": ["tool_calls", "streaming_tool_calls"],
///                         "properties": {
///                           "tool_calls": {"type": "boolean"},
///                           "streaming_tool_calls": {"type": "boolean"}
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
struct CommercialReadinessContext<'a> {
    operating_mode: crate::state::OperatingMode,
    billing_mode: &'a str,
    text_prices: &'a std::collections::BTreeMap<String, Value>,
    media_priced_models: &'a std::collections::BTreeSet<String>,
    unit_prices: &'a std::collections::BTreeMap<String, Value>,
    provider_offer_models: &'a std::collections::BTreeSet<String>,
}

fn commercial_model_readiness(
    ctx: &CommercialReadinessContext<'_>,
    name: &str,
    model: &crate::config::ModelConfig,
    is_own_api_key: bool,
    is_video: bool,
    pool: Option<&niu_storage::ModelRoutePool>,
) -> (bool, Vec<&'static str>) {
    if ctx.operating_mode == crate::state::OperatingMode::Internal || is_own_api_key {
        return (true, Vec::new());
    }
    if let Some(pool) = pool {
        if pool.organization_id.is_some() {
            return (true, Vec::new());
        }
        let has_procurement_pricing = model.pricing.is_some()
            || pool.candidates.iter().any(|candidate| {
                candidate.enabled && ctx.provider_offer_models.contains(&candidate.alias)
            });
        let alias_has_price = |alias: &str| {
            if ctx.billing_mode == "credits" {
                ctx.unit_prices.contains_key(alias)
            } else {
                ctx.text_prices.contains_key(alias)
            }
        };
        let has_selling_price = match pool.billing_mode {
            niu_storage::RoutePoolBillingMode::PoolTariff => alias_has_price(&pool.alias),
            niu_storage::RoutePoolBillingMode::CandidateTariff => pool
                .candidates
                .iter()
                .any(|candidate| candidate.enabled && alias_has_price(&candidate.alias)),
        };
        let mut issues = Vec::new();
        if !has_procurement_pricing {
            issues.push("procurement_pricing_missing");
        }
        if !has_selling_price {
            issues.push("selling_price_missing");
        }
        return (issues.is_empty(), issues);
    }
    let has_procurement_pricing =
        is_video || model.pricing.is_some() || ctx.provider_offer_models.contains(name);
    let has_selling_price = if ctx.billing_mode == "credits" {
        ctx.unit_prices.contains_key(name)
    } else if is_video {
        ctx.media_priced_models.contains(name)
    } else {
        ctx.text_prices.contains_key(name)
    };
    let mut issues = Vec::new();
    if !has_procurement_pricing {
        issues.push("procurement_pricing_missing");
    }
    if !has_selling_price {
        issues.push("selling_price_missing");
    }
    (issues.is_empty(), issues)
}

async fn public_models(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = state
        .authorize_api_headers_with_permission(&headers, niu_storage::AdminPermission::Read)
        .await?;
    let mut catalog = crate::vendors::generation_catalog_with_pools(
        &state,
        Some(principal.scope().organization_id),
    )
    .await?;
    let codex_models = crate::codex::private_models(&state, principal.scope()).await?;
    catalog.models.extend(codex_models);
    let mut prices = state
        .store
        .customer_model_prices(principal.scope())
        .await
        .map_err(ApiError::from_store)?;
    let media_priced_models = state
        .store
        .workspace_media_priced_models(principal.scope())
        .await
        .map_err(ApiError::from_store)?;
    let (billing_mode, mut unit_prices) = state
        .store
        .customer_unit_model_prices()
        .await
        .map_err(ApiError::from_store)?;
    let provider_offer_models = state
        .store
        .active_text_provider_offer_aliases()
        .await
        .map_err(ApiError::from_store)?;
    let mut own_api_key_models = std::collections::BTreeSet::new();
    for route in state
        .store
        .accessible_vendor_routes(
            principal.scope().organization_id,
            state.operating_mode == crate::state::OperatingMode::Internal,
        )
        .await
        .map_err(ApiError::from_store)?
    {
        prices.remove(&route.model.alias);
        unit_prices.remove(&route.model.alias);
        own_api_key_models.insert(route.model.alias);
    }
    let data: Vec<_> = catalog
        .models
        .iter()
        .filter(|(name, _)| principal.allows_model(name))
        .filter_map(|(model, route)| {
            let is_video = catalog
                .routes
                .get(model)
                .is_some_and(|r| r.model.capabilities.get("video_schema").is_some());
            let is_own_api_key = own_api_key_models.contains(model)
                || model.starts_with("codex/")
                || catalog
                    .routes
                    .get(model)
                    .is_some_and(niu_storage::VendorCatalogRoute::is_internal_shared);
            let readiness_ctx = CommercialReadinessContext {
                operating_mode: state.operating_mode,
                billing_mode: &billing_mode,
                text_prices: &prices,
                media_priced_models: &media_priced_models,
                unit_prices: &unit_prices,
                provider_offer_models: &provider_offer_models,
            };
            let (callable, _) = commercial_model_readiness(
                &readiness_ctx,
                model,
                route,
                is_own_api_key,
                is_video,
                catalog.pools.get(model),
            );
            if !callable {
                return None;
            }
            let customer_pricing = if billing_mode == "credits" {
                None
            } else {
                prices.get(model).and_then(|price| {
                    let mut value = serde_json::to_value(price).ok()?;
                    if let Some(obj) = value.as_object_mut() {
                        obj.remove("revision");
                        obj.remove("discount_baseline_revision");
                        obj.remove("price_id");
                        obj.remove("standard_revision");
                        obj.remove("promotion_revision");
                    }
                    Some(value)
                })
            };
            let customer_unit_pricing = if billing_mode == "credits" {
                unit_prices.get(model).cloned()
            } else {
                None
            };
            Some(json!({
                "id": model,
                "object": "model",
                "owned_by": "niu",
                "callable": true,
                "capabilities": chat_tool_capabilities(route),
                "customer_pricing": customer_pricing,
                "customer_unit_pricing": customer_unit_pricing
            }))
        })
        .collect();
    Ok(Json(json!({"object": "list", "data": data})))
}

fn chat_tool_capabilities(model: &crate::config::ModelConfig) -> Value {
    let tools = model.protocol().is_openai_compatible()
        && model.protocol().supports_chat_completions()
        && model.supports_tool_calls;
    json!({
        "tool_calls": tools,
        "streaming_tool_calls": tools && model.protocol().supports_streaming() && model.supports_streaming_tool_calls
    })
}

/// ```openapi
/// {
///   "path": "/v1/key",
///   "method": "get",
///   "operation": {
///     "operationId": "getCurrentKey",
///     "summary": "Inspect the current workspace API key",
///     "description": "Returns the existing customer-safe key projection: object, label, allowed_models, expires_at_ms and last_used_at_ms (Unix milliseconds), revoked/expired flags, spending_limits (limit_nanos, committed_nanos, remaining_nanos), flat rate_limits, usage_window and allowed_cidrs. Does not rename fields or change the HTTP response. Workspace policies and live authorization still apply. Unknown usage remains explicit and model grants do not establish upstream availability. Authenticates an inference API key, or the workspace key selected via X-Niu-Key-Id with an authorized console session. Never returns the secret token, internal platform UUIDs or Provider procurement costs.",
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
///               "additionalProperties": false,
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "object",
///                     "label",
///                     "allowed_models",
///                     "expires_at_ms",
///                     "last_used_at_ms",
///                     "revoked",
///                     "expired",
///                     "spending_limits",
///                     "rate_limits",
///                     "usage_window",
///                     "allowed_cidrs",
///                     "management_capabilities",
///                     "invocation_allowed",
///                     "invocation_protocols"
///                   ],
///                   "properties": {
///                     "invocation_allowed": {
///                       "type": "boolean",
///                       "description": "Current credential invocation authority, independent of discovery and resource management."
///                     },
///                     "invocation_protocols": {
///                       "type": "array",
///                       "items": {
///                         "type": "string",
///                         "enum": [
///                           "chat",
///                           "responses",
///                           "messages",
///                           "content",
///                           "decisions",
///                           "embeddings",
///                           "video"
///                         ]
///                       },
///                       "description": "Exact approved model interfaces. An interface outside this list is denied even when invocation_allowed is true."
///                     },
///                     "object": {
///                       "type": "string",
///                       "const": "api_key"
///                     },
///                     "label": {
///                       "type": "string"
///                     },
///                     "allowed_models": {
///                       "type": "array",
///                       "items": {
///                         "type": "string"
///                       }
///                     },
///                     "expires_at_ms": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "format": "int64",
///                       "description": "Unix milliseconds, never seconds. Null means no automatic expiration; revocation and policies still apply."
///                     },
///                     "last_used_at_ms": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "format": "int64",
///                       "description": "Last dispatch time in Unix milliseconds, or null when no dispatch is recorded."
///                     },
///                     "revoked": {
///                       "type": "boolean"
///                     },
///                     "expired": {
///                       "type": "boolean"
///                     },
///                     "spending_limits": {
///                       "type": "array",
///                       "description": "Customer spending policies by currency. A null limit is unlimited; a null remaining value is not a zero allowance. Amounts are exact integer nanounit strings.",
///                       "items": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "currency",
///                           "limit_nanos",
///                           "committed_nanos",
///                           "remaining_nanos"
///                         ],
///                         "properties": {
///                           "currency": {
///                             "type": "string"
///                           },
///                           "limit_nanos": {
///                             "type": [
///                               "string",
///                               "null"
///                             ],
///                             "pattern": "^[0-9]+$"
///                           },
///                           "committed_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "remaining_nanos": {
///                             "type": [
///                               "string",
///                               "null"
///                             ],
///                             "pattern": "^[0-9]+$"
///                           }
///                         }
///                       }
///                     },
///                     "unit_spending_limit": {
///                       "type": [
///                         "object",
///                         "null"
///                       ]
///                     },
///                     "rate_limits": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "description": "Null policy limits mean unlimited; a known zero blocks requests under that policy.",
///                       "required": [
///                         "requests_per_minute",
///                         "tokens_per_minute",
///                         "max_concurrent_requests",
///                         "active_requests"
///                       ],
///                       "properties": {
///                         "requests_per_minute": {
///                           "type": [
///                             "integer",
///                             "null"
///                           ],
///                           "minimum": 0
///                         },
///                         "tokens_per_minute": {
///                           "type": [
///                             "integer",
///                             "null"
///                           ],
///                           "minimum": 0
///                         },
///                         "max_concurrent_requests": {
///                           "type": [
///                             "integer",
///                             "null"
///                           ],
///                           "minimum": 0
///                         },
///                         "active_requests": {
///                           "type": "integer",
///                           "minimum": 0
///                         }
///                       }
///                     },
///                     "usage_window": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "description": "Known token subtotals are not complete usage when unknown_usage_requests is positive.",
///                       "required": [
///                         "window_seconds",
///                         "window_end",
///                         "requests",
///                         "known_usage_requests",
///                         "unknown_usage_requests",
///                         "known_prompt_tokens",
///                         "known_completion_tokens"
///                       ],
///                       "properties": {
///                         "window_seconds": {
///                           "type": "integer",
///                           "const": 60
///                         },
///                         "window_end": {
///                           "type": "string",
///                           "format": "date-time"
///                         },
///                         "requests": {
///                           "type": "integer",
///                           "minimum": 0
///                         },
///                         "known_usage_requests": {
///                           "type": "integer",
///                           "minimum": 0
///                         },
///                         "unknown_usage_requests": {
///                           "type": "integer",
///                           "minimum": 0
///                         },
///                         "known_prompt_tokens": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         },
///                         "known_completion_tokens": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         }
///                       }
///                     },
///                     "allowed_cidrs": {
///                       "type": [
///                         "array",
///                         "null"
///                       ],
///                       "items": {
///                         "type": "string"
///                       },
///                       "description": "Current source-IP allowlist, or null for no allowlist restriction."
///                     },
///                     "management_capabilities": {
///                       "type": "array",
///                       "maxItems": 6,
///                       "uniqueItems": true,
///                       "items": {
///                         "type": "string",
///                         "enum": [
///                           "pools:read",
///                           "pools:write",
///                           "events:read",
///                           "events:write",
///                           "evaluations:read",
///                           "evaluations:write"
///                         ]
///                       },
///                       "description": "Additional workspace management rights, requiring explicit browser approval. Empty by default; no platform administration."
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
    let mut data = state
        .store
        .key_introspection(&principal)
        .await
        .map_err(ApiError::from_store)?;
    data["management_capabilities"] = json!(
        state
            .store
            .agent_key_capabilities(principal.scope(), principal.key_id())
            .await
            .map_err(ApiError::from_store)?
    );
    Ok(Json(json!({ "data": data })))
}

/// ```openapi
/// {
///   "path": "/v1/credits",
///   "method": "get",
///   "operation": {
///     "operationId": "getKeyCredits",
///     "summary": "Read customer-facing balance summary for the authenticated API key's organization",
///     "description": "Requires a current workspace API key. Returns customer-facing prepaid balance, reservations, and available balance per currency for the key's organization. Never exposes Provider purchase prices, upstream expenses, or platform margins.",
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
///         "description": "Customer balance accounts for the authenticated key's organization.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": ["data"],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": ["currency"],
///                     "properties": {
///                       "currency": { "type": "string" }
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
async fn key_credits(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = state
        .authorize_api_headers_with_permission(&headers, niu_storage::AdminPermission::Read)
        .await?;
    let summary = state
        .store
        .customer_balance_summary(principal.scope().organization_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({ "data": summary })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreditsQuery {
    organization_id: Option<uuid::Uuid>,
}

/// ```openapi
/// {
///   "path": "/api/v1/credits",
///   "method": "get",
///   "operation": {
///     "operationId": "getOrganizationCredits",
///     "summary": "Read customer-facing balance summary for the active or selected organization",
///     "description": "Requires an authorized member session or installation credential. Defaults to the caller's active organization; installation callers may pass organization_id. Returns customer-facing balance summaries only, never Provider purchase costs or platform margins.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "organization_id",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Optional organization UUID. Defaults to the active session organization."
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Customer balance summary for the resolved organization.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": ["data"],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": ["currency"],
///                     "properties": {
///                       "currency": { "type": "string" }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Installation caller omitted organization_id."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "404": {
///         "description": "Organization missing or outside authorized scope."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
async fn admin_credits(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CreditsQuery>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, niu_storage::AdminPermission::Read)
        .await?;
    let organization = match &auth {
        crate::state::AdminAuthorization::Installation => {
            query.organization_id.ok_or_else(|| {
                ApiError::invalid_request(
                    "organization_id is required for installation credentials",
                )
            })?
        }
        crate::state::AdminAuthorization::Operator(operator) => query
            .organization_id
            .unwrap_or(operator.scope.organization_id),
    };
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    let summary = state
        .store
        .customer_balance_summary(organization)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({ "data": summary })))
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
///                         "amount_nanos": { "type": ["string", "null"] },
///                         "unit": { "type": ["object", "null"] }
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
                "unit": raw.get("customer_unit_charge").cloned().unwrap_or(Value::Null),
            },
            "timing": raw.get("timing").cloned().unwrap_or(Value::Null),
            "finish_reasons": raw.get("finish_reasons").cloned().unwrap_or(Value::Null),
            "failure": raw.get("failure").cloned().unwrap_or(Value::Null),
            "output_guardrail_outcome": raw.get("output_guardrail_outcome").cloned().unwrap_or(Value::Null),
        }
    })))
}

fn sanitize_public_unit_price(mut value: Value) -> Value {
    if let Some(obj) = value.as_object_mut() {
        obj.remove("revision");
        obj.remove("definition_revision");
        if let Some(media) = obj.get_mut("media_tariffs").and_then(Value::as_array_mut) {
            for item in media {
                if let Some(entry) = item.as_object_mut() {
                    entry.remove("revision");
                    entry.remove("definition_revision");
                }
            }
        }
    }
    value
}

async fn catalog_models(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let catalog = crate::vendors::generation_catalog_with_pools(&state, None).await?;
    let prices = state
        .store
        .public_standard_text_prices()
        .await
        .map_err(ApiError::from_store)?;
    let media_priced_models = state
        .store
        .public_standard_media_priced_models()
        .await
        .map_err(ApiError::from_store)?;
    let (billing_mode, unit_prices) = state
        .store
        .customer_unit_model_prices()
        .await
        .map_err(ApiError::from_store)?;
    let provider_offer_models = state
        .store
        .active_text_provider_offer_aliases()
        .await
        .map_err(ApiError::from_store)?;
    let sanitized_unit_prices: std::collections::BTreeMap<String, Value> = unit_prices
        .into_iter()
        .map(|(alias, value)| (alias, sanitize_public_unit_price(value)))
        .collect();
    let data: Vec<_> = catalog
        .models
        .iter()
        .filter(|(_, model)| model.public_catalog)
        .filter_map(|(name, model)| {
            let internal_shared = catalog
                .routes
                .get(name)
                .is_some_and(niu_storage::VendorCatalogRoute::is_internal_shared);
            let video_configuration = catalog
                .routes
                .get(name)
                .filter(|route| route.model.capabilities.get("video_schema").is_some())
                .map(super::inference::video_models::configured_preview);
            let readiness_ctx = CommercialReadinessContext {
                operating_mode: state.operating_mode,
                billing_mode: &billing_mode,
                text_prices: &prices,
                media_priced_models: &media_priced_models,
                unit_prices: &sanitized_unit_prices,
                provider_offer_models: &provider_offer_models,
            };
            let (callable, _) = commercial_model_readiness(
                &readiness_ctx,
                name,
                model,
                internal_shared,
                video_configuration.is_some(),
                catalog.pools.get(name),
            );
            if !callable {
                return None;
            }
            let billing_source = if internal_shared {
                "own_api_key"
            } else {
                "niu_credits"
            };
            let customer_pricing = if !internal_shared && billing_mode != "credits" {
                prices.get(name).cloned()
            } else {
                None
            };
            let customer_unit_pricing = if !internal_shared && billing_mode == "credits" {
                sanitized_unit_prices.get(name).cloned()
            } else {
                None
            };
            let tools = chat_tool_capabilities(model);
            Some(json!({
                "id": name,
                "object": "model",
                "owned_by": "niu",
                "public_catalog": model.public_catalog,
                "callable": true,
                "catalog": model.catalog.customer_metadata(),
                "billing_mode": billing_mode,
                "billing_source": billing_source,
                "customer_pricing": customer_pricing,
                "customer_unit_pricing": customer_unit_pricing,
                "generation_capabilities": configured_generation_capabilities(model, video_configuration),
                "capabilities": {
                    "chat_completions": video_configuration.is_none() && model.protocol().supports_chat_completions(),
                    "streaming": model.protocol().supports_streaming(),
                    "tool_calls": tools["tool_calls"],
                    "streaming_tool_calls": tools["streaming_tool_calls"],
                    "embeddings": model.supports_embeddings,
                    "messages": model.supports_messages,
                    "messages_streaming": model.supports_messages_streaming,
                    "generate_content": model.supports_generate_content,
                    "generate_content_streaming": model.supports_generate_content_streaming,
                    "responses": model.supports_responses,
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
                    "supports_generate_content_streaming": model.supports_generate_content_streaming,
                    "supports_responses": model.supports_responses
                }
            }))
        })
        .collect();
    Ok(Json(json!({
        "object": "list",
        "billing_mode": billing_mode,
        "data": data
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AdminModelScope {
    organization_id: Option<uuid::Uuid>,
    project_id: Option<uuid::Uuid>,
    include_uncallable: Option<bool>,
}

/// Catalog descriptions cannot override the actual Video-only route boundary.
/// Unknown legacy text metadata stays unknown rather than an affirmative launch.
fn configured_generation_capabilities(
    model: &crate::config::ModelConfig,
    video: Option<bool>,
) -> Value {
    let chat = if video.is_some() || !model.protocol().supports_chat_completions() {
        Some(false)
    } else if model.catalog.output_modalities.is_empty() {
        None
    } else {
        Some(
            model
                .catalog
                .output_modalities
                .iter()
                .any(|output| output == "text"),
        )
    };
    json!({"chat":chat,"video":video.unwrap_or(false)})
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
    if organization_id.is_some_and(|id| !authorization.permits_organization(id)) {
        return Err(ApiError::not_found());
    }
    let catalog = crate::vendors::generation_catalog_with_pools(&state, organization_id).await?;
    let (billing_mode, mut unit_prices) = state
        .store
        .customer_unit_model_prices()
        .await
        .map_err(ApiError::from_store)?;
    let provider_offer_models = state
        .store
        .active_text_provider_offer_aliases()
        .await
        .map_err(ApiError::from_store)?;
    let mut prices = std::collections::BTreeMap::new();
    let mut readiness_text_prices = std::collections::BTreeMap::new();
    let media_priced_models;
    let mut personal_models = std::collections::BTreeSet::new();
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
        media_priced_models = state
            .store
            .workspace_media_priced_models(workspace_scope)
            .await
            .map_err(ApiError::from_store)?;
        // Personal credentials do not incur a Niu customer tariff.
        for route in state
            .store
            .accessible_vendor_routes(
                organization_id,
                state.operating_mode == crate::state::OperatingMode::Internal,
            )
            .await
            .map_err(ApiError::from_store)?
        {
            prices.remove(&route.model.alias);
            unit_prices.remove(&route.model.alias);
            personal_models.insert(route.model.alias);
        }
    } else {
        readiness_text_prices = state
            .store
            .public_standard_text_prices()
            .await
            .map_err(ApiError::from_store)?;
        media_priced_models = state
            .store
            .public_standard_media_priced_models()
            .await
            .map_err(ApiError::from_store)?;
        if let Some(organization_id) = organization_id {
            for route in state
                .store
                .accessible_vendor_routes(
                    organization_id,
                    state.operating_mode == crate::state::OperatingMode::Internal,
                )
                .await
                .map_err(ApiError::from_store)?
            {
                personal_models.insert(route.model.alias);
            }
        }
    }
    let effective_text_prices = if scope.project_id.is_some() {
        &prices
    } else {
        &readiness_text_prices
    };
    let include_uncallable = scope
        .include_uncallable
        .unwrap_or(authorization.is_installation() && scope.project_id.is_none());
    let data: Vec<_> = catalog
        .models
        .iter()
        .filter_map(|(name, model)| {
            // Funding ownership is independent of whether a selling price exists.
            // Only report it after the requested workspace has been authorized.
            let is_own_api_key = personal_models.contains(name)
                || name.starts_with("codex/")
                || catalog
                    .routes
                    .get(name)
                    .is_some_and(niu_storage::VendorCatalogRoute::is_internal_shared);
            let billing_source = scope.project_id.map(|_| {
                if personal_models.contains(name) {
                    "own_api_key"
                } else {
                    "niu_credits"
                }
            });
            let video_configuration = catalog
                .routes
                .get(name)
                .filter(|route| route.model.capabilities.get("video_schema").is_some())
                .map(super::inference::video_models::configured_preview);
            let readiness_ctx = CommercialReadinessContext {
                operating_mode: state.operating_mode,
                billing_mode: &billing_mode,
                text_prices: effective_text_prices,
                media_priced_models: &media_priced_models,
                unit_prices: &unit_prices,
                provider_offer_models: &provider_offer_models,
            };
            let (callable, readiness_issues) = commercial_model_readiness(
                &readiness_ctx,
                name,
                model,
                is_own_api_key,
                video_configuration.is_some(),
                catalog.pools.get(name),
            );
            if !callable && !include_uncallable {
                return None;
            }
            let generation_capabilities =
                configured_generation_capabilities(model, video_configuration);
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
                "supports_generate_content_streaming": model.supports_generate_content_streaming,
                "supports_responses": model.supports_responses
            });
            if authorization.is_installation() {
                Some(json!({
                    "id": name,
                    "provider": model.provider,
                    "upstream_model": model.upstream_model,
                    "public_catalog": model.public_catalog,
                    "callable": callable,
                    "readiness_issues": readiness_issues,
                    "catalog": model.catalog.customer_metadata(),
                    "customer_pricing": prices.get(name),
                    "customer_unit_pricing": unit_prices.get(name),
                    "billing_mode": billing_mode,
                    "billing_source": billing_source,
                    "generation_capabilities": generation_capabilities,
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
                    "supports_generate_content_streaming": model.supports_generate_content_streaming,
                    "supports_responses": model.supports_responses
                }))
            } else {
                Some(json!({
                    "id": name,
                    "public_catalog": model.public_catalog,
                    "callable": callable,
                    "readiness_issues": readiness_issues,
                    "catalog": model.catalog.customer_metadata(),
                    "customer_pricing": prices.get(name),
                    "customer_unit_pricing": unit_prices.get(name),
                    "billing_mode": billing_mode,
                    "billing_source": billing_source,
                    "generation_capabilities": generation_capabilities,
                    "capabilities": capabilities
                }))
            }
        })
        .collect();
    Ok(Json(json!({"data": data, "billing_mode": billing_mode})))
}

fn process_metrics_identity() -> &'static (String, u64) {
    static IDENTITY: std::sync::OnceLock<(String, u64)> = std::sync::OnceLock::new();
    IDENTITY.get_or_init(|| {
        let instance_id = std::env::var("NIU_INSTANCE_ID")
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let started_at_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| u64::try_from(duration.as_millis()).unwrap_or(u64::MAX))
            .unwrap_or(0);
        (instance_id, started_at_ms)
    })
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
    let (instance_id, started_at_ms) = process_metrics_identity();
    Ok(Json(json!({
        "instance_id": instance_id,
        "started_at_ms": started_at_ms,
        "requests_total": state.requests.load(Ordering::Relaxed),
        "requests_failed": state.failures.load(Ordering::Relaxed),
        "prompt_tokens": usage.prompt_tokens,
        "completion_tokens": usage.completion_tokens,
        "usage": usage
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edge_request_id_is_generated_or_preserved() {
        let empty = HeaderMap::new();
        let generated = resolve_or_generate_request_id(&empty);
        assert!(uuid::Uuid::parse_str(&generated).is_ok());

        let mut valid = HeaderMap::new();
        valid.insert("x-request-id", HeaderValue::from_static("req_edge_12345"));
        assert_eq!(resolve_or_generate_request_id(&valid), "req_edge_12345");

        let mut invalid = HeaderMap::new();
        invalid.insert("x-request-id", HeaderValue::from_static("bad space id"));
        let replaced = resolve_or_generate_request_id(&invalid);
        assert_ne!(replaced, "bad space id");
        assert!(uuid::Uuid::parse_str(&replaced).is_ok());
    }

    #[test]
    fn route_registration_and_alias_parity() {
        let source = include_str!("routes.rs");
        assert!(
            !source.contains(concat!(".dual_", "route(")),
            "retired dual_route must not reappear"
        );
        let mut expanded = std::collections::BTreeMap::<String, String>::new();
        let mut cursor = 0;
        while let Some(pos) = source[cursor..].find(".route(") {
            let open = cursor + pos + ".route(".len();
            let trimmed = source[open..].trim_start();
            if !trimmed.starts_with('"') {
                cursor = open;
                continue;
            }
            let quote_offset = source[open..].find('"').unwrap();
            let start = open + quote_offset + 1;
            let end_quote = source[start..].find('"').unwrap() + start;
            let path = &source[start..end_quote];
            assert!(
                !path.starts_with(concat!("/admin/", "v1")),
                "retired admin/v1 route found: {path}"
            );
            assert!(
                !path.contains(concat!("/pro", "jects")),
                "retired projects route found: {path}"
            );
            assert!(
                !path.starts_with(concat!("/api/v1/plat", "form/"))
                    && !path.starts_with(concat!("/api/v1/vend", "ors"))
                    && !path.starts_with(concat!("/api/v1/prov", "iders"))
                    && !path.starts_with(concat!("/api/v1/oper", "ators"))
                    && path != concat!("/v1/bran", "ding")
                    && path != concat!("/v1/curr", "ency"),
                "retired pre-v0.4 route found: {path}"
            );
            if path.starts_with("/enterprise") || path.starts_with("/api/plugins") {
                cursor = end_quote + 1;
                continue;
            }
            let call_start = end_quote + 1;
            let mut depth = 1usize;
            let mut idx = call_start;
            let bytes = source.as_bytes();
            while idx < bytes.len() && depth > 0 {
                match bytes[idx] {
                    b'(' => depth += 1,
                    b')' => depth -= 1,
                    _ => {}
                }
                idx += 1;
            }
            let body: String = source[call_start..idx - 1].split_whitespace().collect();
            assert!(
                expanded.insert(path.to_owned(), body).is_none(),
                "duplicate route {path}"
            );
            cursor = idx;
        }
        assert!(!expanded.is_empty());
    }

    #[tokio::test]
    async fn root_openapi_json_and_yaml_serve_public_contract() {
        let (json_headers, json_body) = openapi_json().await;
        assert_eq!(json_headers[0].1, "application/json; charset=utf-8");
        let parsed: Value = serde_json::from_str(json_body).expect("valid OpenAPI JSON");
        assert_eq!(parsed["openapi"], "3.1.0");
        assert!(parsed["paths"]["/v1/chat/completions"].is_object());
        assert!(parsed["paths"]["/v1/credits"].is_object());
        assert!(parsed["paths"]["/api/v1/admin/customers"].is_null());

        let (yaml_headers, yaml_body) = openapi_yaml().await;
        assert_eq!(yaml_headers[0].1, "application/yaml; charset=utf-8");
        assert!(yaml_body.contains("openapi: 3.1.0"));
        assert!(yaml_body.contains("/v1/chat/completions:"));
    }

    #[test]
    fn sanitize_public_unit_price_strips_internal_revisions() {
        let input = json!({
            "revision": "11111111-1111-1111-1111-111111111111",
            "definition_revision": "22222222-2222-2222-2222-222222222222",
            "unit_name": "Credits",
            "display_precision": 2,
            "atoms_per_unit": "1000000000",
            "prompt_rate": "100",
            "completion_rate": "200",
            "media_tariffs": [
                {
                    "revision": "33333333-3333-3333-3333-333333333333",
                    "definition_revision": "44444444-4444-4444-4444-444444444444",
                    "channel": "default",
                    "resolution": "720p",
                    "reference_video": false,
                    "meter": "second",
                    "price": { "amount_atoms": "500" }
                }
            ]
        });
        let sanitized = sanitize_public_unit_price(input);
        assert!(sanitized.get("revision").is_none());
        assert!(sanitized.get("definition_revision").is_none());
        assert_eq!(sanitized["unit_name"], "Credits");
        let media = sanitized["media_tariffs"][0].as_object().unwrap();
        assert!(!media.contains_key("revision"));
        assert!(!media.contains_key("definition_revision"));
        assert_eq!(media["channel"], "default");
    }
}
