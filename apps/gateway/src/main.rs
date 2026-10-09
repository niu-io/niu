mod admin;
mod admission;
mod billing;
mod branding;
mod catalog_metadata;
mod codex;
mod config;
mod customer_response;
mod enterprise;
mod error;
mod guardrails;
mod payments;
mod providers;
mod request_payloads;
mod request_timings;
mod state;
mod streaming;
mod upstream;
mod usage;
mod vendors;
mod video_recovery;
mod web;

use std::{env, net::SocketAddr};

use state::AppState;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;

fn trace_path(path: &str) -> &str {
    if path.starts_with("/v1/media/sources/") {
        "/v1/media/sources/[redacted]"
    } else {
        path
    }
}

use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .compact()
        .init();

    let state = AppState::load_from_env().await?;
    let address = bind_address(
        env::var("NIU_BIND").ok().as_deref(),
        env::var("PORT").ok().as_deref(),
    )?;
    if state.development_member_enabled() && !address.ip().is_loopback() {
        return Err("NIU_DEV_USERNAME and NIU_DEV_PASSWORD require a loopback bind".into());
    }
    let listener = TcpListener::bind(address).await?;
    let gateway_writes = state.gateway_writes.clone();
    let recovery_store = state.store.clone();
    let recovery = tokio::spawn(async move {
        let mut cursor = None;
        let mut provider_cursor = None;
        let mut customer_cursor = None;
        let mut balance_release_cursor = None;
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            if recovery_store
                .purge_expired_request_payloads()
                .await
                .is_err()
            {
                tracing::warn!("Expired request payload cleanup requires retry");
            }
            if recovery_store
                .purge_expired_media_result_references()
                .await
                .is_err()
            {
                tracing::warn!("Expired media result cleanup requires retry");
            }
            if recovery_store
                .purge_expired_inspected_image_sources()
                .await
                .is_err()
            {
                tracing::warn!("Expired inspected image source cleanup requires retry");
            }
            if recovery_store
                .recover_interrupted_asset_image_ingestions()
                .await
                .is_err()
            {
                tracing::warn!("Interrupted image ingestion recovery requires retry");
            }
            if recovery_store
                .recover_interrupted_ingested_image_reads()
                .await
                .is_err()
            {
                tracing::warn!("Interrupted image readiness recovery requires retry");
            }
            match recovery_store
                .recover_customer_balance_releases(balance_release_cursor)
                .await
            {
                Ok((next, failures)) => {
                    balance_release_cursor = next;
                    if failures > 0 {
                        tracing::warn!(
                            failures,
                            "customer balance release recovery requires retry"
                        );
                    }
                }
                Err(_) => tracing::warn!("customer balance release recovery storage unavailable"),
            }
            match recovery_store
                .recover_customer_charges(customer_cursor)
                .await
            {
                Ok((next, failures)) => {
                    customer_cursor = next;
                    if failures > 0 {
                        tracing::warn!(failures, "customer billing recovery requires retry");
                    }
                }
                Err(_) => tracing::warn!("customer billing recovery storage unavailable"),
            }
            match recovery_store
                .recover_provider_earnings(provider_cursor)
                .await
            {
                Ok((next, failures)) => {
                    provider_cursor = next;
                    if failures > 0 {
                        tracing::warn!(failures, "provider earnings recovery requires retry");
                    }
                }
                Err(_) => tracing::warn!("provider earnings recovery storage unavailable"),
            }
            match recovery_store.recover_settlements(cursor).await {
                Ok((next, failures)) => {
                    cursor = next;
                    if failures > 0 {
                        tracing::warn!(failures, "cost settlement recovery requires retry");
                    }
                }
                Err(_) => tracing::warn!("cost settlement recovery storage unavailable"),
            }
        }
    });
    let payment_recovery = state.payments.clone().map(|payments| {
        let payment_state = state.clone();
        tokio::spawn(async move {
            let mut cursor = None;
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                interval.tick().await;
                match payments.recover_next(&payment_state, cursor).await {
                    Ok(next) => cursor = next,
                    Err(_) => tracing::warn!("Payment recovery storage requires retry"),
                }
            }
        })
    });
    let video_recovery = video_recovery::spawn(&state)?;
    // OAuth callbacks contain authorization codes: trace paths, never queries.
    let app = web::router(state).layer(TraceLayer::new_for_http().make_span_with(
        |request: &axum::http::Request<axum::body::Body>| {
            tracing::debug_span!("http_request", method = %request.method(), path = %trace_path(request.uri().path()))
        },
    ));

    tracing::info!(address = %address, "Niu gateway listening");
    // Finalize routes once instead of repeating with_state for every connection.
    axum::serve(listener, app.into_make_service())
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    gateway_writes.shutdown().await;
    recovery.abort();
    if let Some(video_recovery) = video_recovery {
        video_recovery.abort();
    }
    if let Some(payment_recovery) = payment_recovery {
        payment_recovery.abort();
    }
    Ok(())
}

fn bind_address(
    niu_bind: Option<&str>,
    port: Option<&str>,
) -> Result<SocketAddr, std::net::AddrParseError> {
    let bind = niu_bind
        .map(str::to_owned)
        .unwrap_or_else(|| format!("0.0.0.0:{}", port.unwrap_or("2555")));
    bind.parse()
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut signal) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            signal.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

#[cfg(test)]
mod tests {
    use super::bind_address;
    use std::net::SocketAddr;

    #[test]
    fn bind_address_uses_local_default_without_render_port() {
        assert_eq!(
            bind_address(None, None).unwrap(),
            "0.0.0.0:2555".parse::<SocketAddr>().unwrap()
        );
    }

    #[test]
    fn bind_address_uses_render_port_when_present() {
        assert_eq!(
            bind_address(None, Some("10000")).unwrap(),
            "0.0.0.0:10000".parse::<SocketAddr>().unwrap()
        );
    }

    #[test]
    fn explicit_niu_bind_takes_precedence_over_render_port() {
        assert_eq!(
            bind_address(Some("127.0.0.1:2556"), Some("10000")).unwrap(),
            "127.0.0.1:2556".parse::<SocketAddr>().unwrap()
        );
    }
}

#[test]
fn source_capabilities_are_redacted_from_request_traces() {
    assert_eq!(
        trace_path("/v1/media/sources/secret"),
        "/v1/media/sources/[redacted]"
    );
    assert_eq!(trace_path("/v1/models"), "/v1/models");
}
