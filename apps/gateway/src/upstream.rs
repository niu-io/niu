pub(crate) use niu_upstream::{EndpointError, client_for_endpoint, is_public_address};

/// Per-caller budgets remain below the existing HTTP request deadline.
/// Resolution precedes HTTP; these settings do not establish a total SLA.
pub(crate) async fn configured_client_for_endpoint(
    state: &crate::state::AppState,
    endpoint: &str,
    timeout: std::time::Duration,
) -> Result<reqwest::Client, EndpointError> {
    let server = &state.config.server;
    let limits = niu_upstream::EndpointTimeouts::new(
        timeout,
        std::time::Duration::from_secs(server.provider_connect_timeout_seconds).min(timeout),
        std::time::Duration::from_secs(server.provider_dns_timeout_seconds).min(timeout),
    )?;
    niu_upstream::client_for_endpoint_with_timeouts(endpoint, limits).await
}
