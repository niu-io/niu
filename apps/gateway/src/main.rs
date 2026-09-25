mod admin;
mod config;
mod error;
mod state;
mod streaming;
mod usage;
mod web;

use std::{env, net::SocketAddr};

use state::AppState;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
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
    let bind = env::var("NIU_BIND").unwrap_or_else(|_| "0.0.0.0:2555".to_owned());
    let address: SocketAddr = bind.parse()?;
    let listener = TcpListener::bind(address).await?;
    let recovery_store = state.store.clone();
    let recovery = tokio::spawn(async move {
        let mut cursor = None;
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
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
    let app = web::router(state).layer(TraceLayer::new_for_http());

    tracing::info!(address = %address, "Niu gateway listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    recovery.abort();
    Ok(())
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
