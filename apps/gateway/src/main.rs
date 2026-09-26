mod admin;
mod config;
mod enterprise;
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
    let address = bind_address(
        env::var("NIU_BIND").ok().as_deref(),
        env::var("PORT").ok().as_deref(),
    )?;
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
