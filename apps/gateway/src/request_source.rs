//! Socket-derived request identity. Forwarding headers are trusted only from configured peers.
use crate::{error::ApiError, state::AppState};
use axum::{
    body::Body,
    extract::{ConnectInfo, State},
    http::Request,
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::net::{IpAddr, SocketAddr};
tokio::task_local! { static CLIENT_IP: Option<IpAddr>; }
pub(crate) fn current_ip() -> Option<IpAddr> {
    CLIENT_IP.try_with(|ip| *ip).ok().flatten()
}
fn normalized(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(ip) => ip
            .to_ipv4_mapped()
            .map(IpAddr::V4)
            .unwrap_or(IpAddr::V6(ip)),
        ip => ip,
    }
}
pub(crate) fn trusted_proxies() -> Result<Vec<ipnet::IpNet>, Box<dyn std::error::Error>> {
    let value = std::env::var("NIU_TRUSTED_PROXY_CIDRS").unwrap_or_default();
    if value.trim().is_empty() {
        return Ok(Vec::new());
    }
    let networks = value
        .split(',')
        .map(|s| s.trim().parse::<ipnet::IpNet>().map(|n| n.trunc()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Invalid NIU_TRUSTED_PROXY_CIDRS")?;
    if networks.len() > 64 {
        return Err("At most 64 trusted proxy networks are supported".into());
    }
    Ok(networks)
}
fn source(request: &Request<Body>, trusted: &[ipnet::IpNet]) -> Result<Option<IpAddr>, ApiError> {
    let Some(ConnectInfo(peer)) = request.extensions().get::<ConnectInfo<SocketAddr>>() else {
        return Ok(None);
    };
    let peer = normalized(peer.ip());
    if !trusted.iter().any(|net| net.contains(&peer)) {
        return Ok(Some(peer));
    }
    let values = request
        .headers()
        .get_all("x-forwarded-for")
        .iter()
        .collect::<Vec<_>>();
    if values.is_empty() {
        return Ok(None);
    }
    if values.len() != 1 {
        return Err(ApiError::invalid_request(
            "Invalid forwarded client address",
        ));
    }
    let raw = values[0]
        .to_str()
        .map_err(|_| ApiError::invalid_request("Invalid forwarded client address"))?;
    if raw.len() > 4096 {
        return Err(ApiError::invalid_request(
            "Forwarded client chain is too large",
        ));
    }
    let hops = raw
        .split(',')
        .map(|s| s.trim().parse::<IpAddr>().map(normalized))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| ApiError::invalid_request("Invalid forwarded client address"))?;
    if hops.is_empty() || hops.len() > 32 {
        return Err(ApiError::invalid_request("Invalid forwarded client chain"));
    }
    for ip in hops.iter().rev() {
        if !trusted.iter().any(|net| net.contains(ip)) {
            return Ok(Some(*ip));
        }
    }
    Ok(hops.first().copied())
}
pub(crate) async fn capture(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    match source(&request, &state.trusted_proxies) {
        Ok(ip) => CLIENT_IP.scope(ip, next.run(request)).await,
        Err(e) => e.into_response(),
    }
}
