use std::{
    collections::HashMap,
    net::IpAddr,
    sync::{
        Arc, OnceLock, RwLock,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};

use tokio::sync::Mutex;

const DNS_CACHE_TTL: Duration = Duration::from_secs(30);
const DNS_STALE_GRACE: Duration = Duration::from_secs(30);
const DNS_RETRY_DELAY: Duration = Duration::from_secs(1);
const MAX_CACHED_CLIENTS: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndpointError {
    InvalidUrl,
    InvalidTimeout,
    ResolutionFailed,
    PrivateAddress,
    ClientConfiguration,
}

/// Validated independent endpoint budgets. Resolution occurs before HTTP send;
/// `overall` bounds the HTTP request, not the combined factory-and-send duration.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EndpointTimeouts {
    overall: Duration,
    connect: Duration,
    resolution: Duration,
}
impl EndpointTimeouts {
    pub fn new(
        overall: Duration,
        connect: Duration,
        resolution: Duration,
    ) -> Result<Self, EndpointError> {
        if overall.is_zero()
            || connect.is_zero()
            || resolution.is_zero()
            || connect > overall
            || resolution > overall
        {
            return Err(EndpointError::InvalidTimeout);
        }
        Ok(Self {
            overall,
            connect,
            resolution,
        })
    }
    pub const fn overall(self) -> Duration {
        self.overall
    }
    pub const fn connect(self) -> Duration {
        self.connect
    }
    pub const fn resolution(self) -> Duration {
        self.resolution
    }
    fn legacy(overall: Duration) -> Result<Self, EndpointError> {
        let component = overall.min(Duration::from_secs(3));
        Self::new(overall, component, component)
    }
}

#[derive(Clone, Eq, Hash, PartialEq)]
struct ClientKey {
    scheme: String,
    host: String,
    port: u16,
    timeout_nanos: u128,
    connect_timeout_nanos: u128,
}

struct Endpoint {
    key: ClientKey,
    host: String,
    port: u16,
    literal: Option<IpAddr>,
    local_target: bool,
}

#[derive(Clone)]
struct CachedClient {
    client: reqwest::Client,
    addresses: Vec<IpAddr>,
    expires_at: Option<Instant>,
    stale_until: Option<Instant>,
}

struct ClientEntry {
    cached: RwLock<Option<CachedClient>>,
    refresh_failed: RwLock<Option<(Instant, EndpointError)>>,
    refresh: Mutex<()>,
    last_used: AtomicU64,
}

#[derive(Default)]
struct ClientPool {
    entries: RwLock<HashMap<ClientKey, Arc<ClientEntry>>>,
    clock: AtomicU64,
}

impl ClientPool {
    fn entry(&self, key: ClientKey) -> Arc<ClientEntry> {
        let used = self.clock.fetch_add(1, Ordering::Relaxed);
        if let Some(entry) = self
            .entries
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(&key)
            .cloned()
        {
            entry.last_used.store(used, Ordering::Relaxed);
            return entry;
        }

        let mut entries = self
            .entries
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(entry) = entries.get(&key).cloned() {
            entry.last_used.store(used, Ordering::Relaxed);
            return entry;
        }
        if entries.len() >= MAX_CACHED_CLIENTS
            && let Some(oldest) = entries
                .iter()
                .min_by_key(|(_, entry)| entry.last_used.load(Ordering::Relaxed))
                .map(|(key, _)| key.clone())
        {
            entries.remove(&oldest);
        }
        let entry = Arc::new(ClientEntry {
            cached: RwLock::new(None),
            refresh_failed: RwLock::new(None),
            refresh: Mutex::new(()),
            last_used: AtomicU64::new(used),
        });
        entries.insert(key, entry.clone());
        entry
    }

    #[cfg(test)]
    async fn client_for_endpoint(
        &self,
        endpoint: &str,
        timeout: Duration,
    ) -> Result<reqwest::Client, EndpointError> {
        self.client_for_endpoint_with_timeouts(endpoint, EndpointTimeouts::legacy(timeout)?)
            .await
    }

    async fn client_for_endpoint_with_timeouts(
        &self,
        endpoint: &str,
        timeouts: EndpointTimeouts,
    ) -> Result<reqwest::Client, EndpointError> {
        self.client_for_endpoint_with_policy(endpoint, timeouts, loopback_targets_allowed())
            .await
    }

    async fn client_for_endpoint_with_policy(
        &self,
        endpoint: &str,
        timeouts: EndpointTimeouts,
        allow_loopback: bool,
    ) -> Result<reqwest::Client, EndpointError> {
        let endpoint = parse_endpoint_with_policy(endpoint, timeouts, allow_loopback)?;
        let entry = self.entry(endpoint.key.clone());
        let now = Instant::now();
        if let Some(client) = cached_client(&entry, now) {
            return Ok(client);
        }

        // If a warm client is within its stale-while-revalidate window and another
        // task is already refreshing DNS for this authority, continue serving the
        // existing connection pool rather than stalling in-flight requests.
        let _refresh = if let Some(stale) = stale_cached_client(&entry, now) {
            match entry.refresh.try_lock() {
                Ok(guard) => guard,
                Err(_) => return Ok(stale),
            }
        } else {
            entry.refresh.lock().await
        };

        let now = Instant::now();
        if let Some(client) = cached_client(&entry, now) {
            return Ok(client);
        }
        if let Some(error) = refresh_error(&entry, now) {
            return Err(error);
        }

        let addresses = match resolve_endpoint_addresses(&endpoint, timeouts).await {
            Ok(addresses) => addresses,
            Err(error) => {
                if error == EndpointError::PrivateAddress {
                    *entry
                        .cached
                        .write()
                        .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
                }
                *entry
                    .refresh_failed
                    .write()
                    .unwrap_or_else(std::sync::PoisonError::into_inner) =
                    Some((Instant::now() + DNS_RETRY_DELAY, error));
                return Err(error);
            }
        };

        let mut normalized_ips: Vec<IpAddr> =
            addresses.iter().map(std::net::SocketAddr::ip).collect();
        normalized_ips.sort_unstable();
        normalized_ips.dedup();

        let existing_client = entry
            .cached
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .as_ref()
            .filter(|cached| cached.addresses == normalized_ips)
            .map(|cached| cached.client.clone());

        let client = match existing_client {
            Some(client) => client,
            None => match build_client_with_addresses(&endpoint, timeouts, &addresses) {
                Ok(client) => client,
                Err(error) => {
                    *entry
                        .refresh_failed
                        .write()
                        .unwrap_or_else(std::sync::PoisonError::into_inner) =
                        Some((Instant::now() + DNS_RETRY_DELAY, error));
                    return Err(error);
                }
            },
        };

        let refreshed_at = Instant::now();
        let (expires_at, stale_until) = if endpoint.literal.is_none() {
            (
                Some(refreshed_at + DNS_CACHE_TTL),
                Some(refreshed_at + DNS_CACHE_TTL + DNS_STALE_GRACE),
            )
        } else {
            (None, None)
        };
        *entry
            .refresh_failed
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
        *entry
            .cached
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(CachedClient {
            client: client.clone(),
            addresses: normalized_ips,
            expires_at,
            stale_until,
        });
        Ok(client)
    }
}

fn refresh_error(entry: &ClientEntry, now: Instant) -> Option<EndpointError> {
    entry
        .refresh_failed
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .as_ref()
        .filter(|(retry_at, _)| *retry_at > now)
        .map(|(_, error)| *error)
}

fn cached_client(entry: &ClientEntry, now: Instant) -> Option<reqwest::Client> {
    entry
        .cached
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .as_ref()
        .filter(|cached| cached.expires_at.is_none_or(|expiry| expiry > now))
        .map(|cached| cached.client.clone())
}

fn stale_cached_client(entry: &ClientEntry, now: Instant) -> Option<reqwest::Client> {
    entry
        .cached
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .as_ref()
        .filter(|cached| cached.stale_until.is_some_and(|grace| grace > now))
        .map(|cached| cached.client.clone())
}

/// Returns whether loopback upstream targets (`localhost`, `127.0.0.0/8`, `::1`)
/// are permitted by current process policy. Enabled by default for local dev/test
/// fixtures unless `NIU_DISALLOW_LOOPBACK_UPSTREAM` is truthy or
/// `NIU_ALLOW_LOOPBACK_UPSTREAM` is explicitly disabled (`0` / `false`).
pub fn loopback_targets_allowed() -> bool {
    if let Ok(val) = std::env::var("NIU_DISALLOW_LOOPBACK_UPSTREAM") {
        let trimmed = val.trim();
        if trimmed == "1" || trimmed.eq_ignore_ascii_case("true") {
            return false;
        }
    }
    if let Ok(val) = std::env::var("NIU_ALLOW_LOOPBACK_UPSTREAM") {
        let trimmed = val.trim();
        if trimmed == "0" || trimmed.eq_ignore_ascii_case("false") {
            return false;
        }
    }
    true
}

/// Validate syntactic and policy constraints on an endpoint URL under the
/// current loopback policy.
pub fn validate_endpoint_url(endpoint: &str) -> Result<(), EndpointError> {
    let timeouts = EndpointTimeouts::legacy(Duration::from_secs(1))?;
    parse_endpoint_with_policy(endpoint, timeouts, loopback_targets_allowed()).map(|_| ())
}

/// Strictly validate that an endpoint URL uses `https` and targets a public
/// authority, unconditionally rejecting `localhost`, loopback literals, and
/// private/link-local/unspecified IP literals.
pub fn validate_public_endpoint_url(endpoint: &str) -> Result<(), EndpointError> {
    let timeouts = EndpointTimeouts::legacy(Duration::from_secs(1))?;
    parse_endpoint_with_policy(endpoint, timeouts, false).map(|_| ())
}

/// Reuse a bounded pool of provider clients while pinning every DNS refresh to
/// the addresses checked by Niu. Redirects remain disabled so credentials
/// cannot be forwarded from a public endpoint to a private host.
pub async fn client_for_endpoint(
    endpoint: &str,
    timeout: Duration,
) -> Result<reqwest::Client, EndpointError> {
    client_for_endpoint_with_timeouts(endpoint, EndpointTimeouts::legacy(timeout)?).await
}

/// Configure resolution and connection budgets without changing transport
/// authorization, redirect handling, retry policy or legacy defaults.
pub async fn client_for_endpoint_with_timeouts(
    endpoint: &str,
    timeouts: EndpointTimeouts,
) -> Result<reqwest::Client, EndpointError> {
    static POOL: OnceLock<ClientPool> = OnceLock::new();
    POOL.get_or_init(ClientPool::default)
        .client_for_endpoint_with_timeouts(endpoint, timeouts)
        .await
}

/// Build or reuse a pooled provider client while unconditionally forbidding
/// loopback (`localhost`, `127.0.0.1`, `::1`) and non-HTTPS targets.
pub async fn client_for_public_endpoint(
    endpoint: &str,
    timeout: Duration,
) -> Result<reqwest::Client, EndpointError> {
    client_for_public_endpoint_with_timeouts(endpoint, EndpointTimeouts::legacy(timeout)?).await
}

/// Build or reuse a pooled provider client with explicit timeouts while
/// unconditionally forbidding loopback and non-HTTPS targets.
pub async fn client_for_public_endpoint_with_timeouts(
    endpoint: &str,
    timeouts: EndpointTimeouts,
) -> Result<reqwest::Client, EndpointError> {
    static POOL: OnceLock<ClientPool> = OnceLock::new();
    POOL.get_or_init(ClientPool::default)
        .client_for_endpoint_with_policy(endpoint, timeouts, false)
        .await
}

#[cfg(test)]
fn parse_endpoint(endpoint: &str, timeouts: EndpointTimeouts) -> Result<Endpoint, EndpointError> {
    parse_endpoint_with_policy(endpoint, timeouts, loopback_targets_allowed())
}

fn parse_endpoint_with_policy(
    endpoint: &str,
    timeouts: EndpointTimeouts,
    allow_loopback: bool,
) -> Result<Endpoint, EndpointError> {
    let url = url::Url::parse(endpoint).map_err(|_| EndpointError::InvalidUrl)?;
    let host = url
        .host_str()
        .filter(|host| !host.is_empty())
        .ok_or(EndpointError::InvalidUrl)?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(EndpointError::InvalidUrl);
    }
    let port = url
        .port_or_known_default()
        .ok_or(EndpointError::InvalidUrl)?;
    let normalized_host = host.trim_matches(['[', ']']);
    let literal = normalized_host.parse::<IpAddr>().ok();
    let lower_host = normalized_host.trim_end_matches('.').to_ascii_lowercase();
    if lower_host.ends_with(".localhost")
        || lower_host.ends_with(".local")
        || lower_host.ends_with(".internal")
    {
        return Err(EndpointError::PrivateAddress);
    }
    let local_target =
        lower_host == "localhost" || literal.is_some_and(|address| address.is_loopback());
    if local_target && !allow_loopback {
        return Err(EndpointError::PrivateAddress);
    }
    if url.scheme() != "https" && !(url.scheme() == "http" && local_target && allow_loopback) {
        return Err(EndpointError::InvalidUrl);
    }
    if let Some(ip) = literal
        && !local_target
        && !is_public_address(ip)
    {
        return Err(EndpointError::PrivateAddress);
    }

    Ok(Endpoint {
        key: ClientKey {
            scheme: url.scheme().to_owned(),
            host: normalized_host.to_ascii_lowercase(),
            port,
            timeout_nanos: timeouts.overall.as_nanos(),
            connect_timeout_nanos: timeouts.connect.as_nanos(),
        },
        host: normalized_host.to_owned(),
        port,
        literal,
        local_target,
    })
}

async fn resolve_endpoint_addresses(
    endpoint: &Endpoint,
    timeouts: EndpointTimeouts,
) -> Result<Vec<std::net::SocketAddr>, EndpointError> {
    let Endpoint {
        host,
        port,
        literal,
        local_target,
        ..
    } = endpoint;
    let addresses = if let Some(address) = literal {
        vec![std::net::SocketAddr::new(*address, *port)]
    } else {
        tokio::time::timeout(
            timeouts.resolution,
            tokio::net::lookup_host((host.as_str(), *port)),
        )
        .await
        .map_err(|_| EndpointError::ResolutionFailed)?
        .map_err(|_| EndpointError::ResolutionFailed)?
        .collect::<Vec<_>>()
    };
    if addresses.is_empty() {
        return Err(EndpointError::ResolutionFailed);
    }
    let destinations_allowed = addresses.iter().all(|address| {
        if *local_target {
            address.ip().is_loopback()
        } else {
            is_public_address(address.ip())
        }
    });
    if !destinations_allowed {
        return Err(EndpointError::PrivateAddress);
    }
    Ok(addresses)
}

fn build_client_with_addresses(
    endpoint: &Endpoint,
    timeouts: EndpointTimeouts,
    addresses: &[std::net::SocketAddr],
) -> Result<reqwest::Client, EndpointError> {
    let mut builder = reqwest::Client::builder()
        .connect_timeout(timeouts.connect)
        .timeout(timeouts.overall)
        // A recorded dispatch must not silently become multiple HTTP requests.
        // Retry/failover belongs to the caller's durable attempt lifecycle,
        // including for protocol-level nacks that reqwest retries by default.
        .retry(reqwest::retry::never())
        // The destination check and pinned resolution must apply to the socket
        // Niu opens. An environment proxy could resolve the provider host on a
        // different machine and bypass that boundary.
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none());
    if endpoint.literal.is_none() {
        builder = builder.resolve_to_addrs(&endpoint.host, addresses);
    }
    builder
        .build()
        .map_err(|_| EndpointError::ClientConfiguration)
}

pub fn is_public_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => {
            let [a, b, c, _] = address.octets();
            !address.is_private()
                && !address.is_loopback()
                && !address.is_link_local()
                && !address.is_broadcast()
                && !address.is_unspecified()
                && !address.is_multicast()
                && !(a == 0
                    || (a == 100 && (64..=127).contains(&b))
                    || (a == 192 && b == 0 && c == 0)
                    || (a == 192 && b == 0 && c == 2)
                    || (a == 192 && b == 88 && c == 99)
                    || (a == 198 && (b == 18 || b == 19))
                    || (a == 198 && b == 51 && c == 100)
                    || (a == 203 && b == 0 && c == 113)
                    || a >= 240)
        }
        IpAddr::V6(address) => {
            let segments = address.segments();
            // Accept only global-unicast space, excluding special-purpose,
            // transition and documentation blocks that can tunnel private IPs.
            segments[0] & 0xe000 == 0x2000
                && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
                && !(segments[0] == 0x2001 && segments[1] <= 0x01ff)
                && segments[0] != 0x2002
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        extract::{ConnectInfo, State},
        routing::get,
    };
    use std::{
        collections::HashSet,
        net::{IpAddr, SocketAddr},
    };

    async fn capture_peer(
        State(peers): State<Arc<Mutex<HashSet<u16>>>>,
        ConnectInfo(peer): ConnectInfo<SocketAddr>,
    ) -> &'static str {
        peers.lock().await.insert(peer.port());
        "ok"
    }

    #[test]
    fn endpoint_destinations_allow_public_addresses_and_loopback_only_for_local_use() {
        for address in ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"] {
            assert!(
                is_public_address(address.parse().unwrap()),
                "rejected {address}"
            );
        }
        for address in [
            "0.0.0.0",
            "10.0.0.1",
            "100.64.0.1",
            "127.0.0.1",
            "169.254.169.254",
            "172.16.0.1",
            "192.0.2.1",
            "192.168.1.1",
            "198.18.0.1",
            "198.51.100.1",
            "203.0.113.1",
            "224.0.0.1",
            "240.0.0.1",
            "::",
            "::1",
            "::ffff:127.0.0.1",
            "2001:db8::1",
            "2002::1",
            "fd00::1",
            "fe80::1",
        ] {
            assert!(
                !is_public_address(address.parse().unwrap()),
                "accepted {address}"
            );
        }
        assert!(IpAddr::V4(std::net::Ipv4Addr::LOCALHOST).is_loopback());
    }

    #[tokio::test]
    async fn private_literal_endpoints_are_rejected_before_connecting() {
        for endpoint in [
            "https://10.0.0.1/v1",
            "https://192.168.1.20/v1",
            "https://169.254.169.254/latest/meta-data",
            "https://[fd00::1]/v1",
            "http://example.com/v1",
        ] {
            assert_eq!(
                client_for_endpoint(endpoint, Duration::from_secs(2))
                    .await
                    .unwrap_err(),
                if endpoint.starts_with("http://") {
                    EndpointError::InvalidUrl
                } else {
                    EndpointError::PrivateAddress
                },
                "endpoint {endpoint}"
            );
        }
        assert!(
            client_for_endpoint("http://127.0.0.1:1/v1", Duration::from_secs(2))
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn cached_provider_client_reuses_connections_across_route_paths() {
        let peers = Arc::new(Mutex::new(HashSet::new()));
        let app = axum::Router::new()
            .route("/", get(capture_peer))
            .with_state(peers.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
            .unwrap();
        });

        let pool = ClientPool::default();
        for route in ["/v1/chat/completions", "/v1/responses"] {
            let endpoint = format!("http://{address}{route}");
            let client = pool
                .client_for_endpoint(&endpoint, Duration::from_secs(2))
                .await
                .unwrap();
            for _ in 0..4 {
                let body = client
                    .get(format!("http://{address}/"))
                    .send()
                    .await
                    .unwrap()
                    .error_for_status()
                    .unwrap()
                    .bytes()
                    .await
                    .unwrap();
                assert_eq!(body, "ok");
            }
        }

        assert_eq!(peers.lock().await.len(), 1);
        server.abort();
    }

    #[tokio::test]
    async fn cached_provider_client_reuses_connections_across_resolution_budgets() {
        let peers = Arc::new(Mutex::new(HashSet::new()));
        let app = axum::Router::new()
            .route("/", get(capture_peer))
            .with_state(peers.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
            .unwrap();
        });

        let pool = ClientPool::default();
        let endpoint = format!("http://{address}/v1/chat/completions");
        for resolution_ms in [2999_u64, 2750, 2100, 1450] {
            let timeouts = EndpointTimeouts::new(
                Duration::from_secs(30),
                Duration::from_secs(3),
                Duration::from_millis(resolution_ms),
            )
            .unwrap();
            let client = pool
                .client_for_endpoint_with_timeouts(&endpoint, timeouts)
                .await
                .unwrap();
            let body = client
                .get(format!("http://{address}/"))
                .send()
                .await
                .unwrap()
                .error_for_status()
                .unwrap()
                .bytes()
                .await
                .unwrap();
            assert_eq!(body, "ok");
        }

        assert_eq!(peers.lock().await.len(), 1);
        server.abort();
    }

    #[tokio::test]
    async fn dns_refresh_retains_connection_pool_when_addresses_unchanged_and_serves_stale() {
        let peers = Arc::new(Mutex::new(HashSet::new()));
        let app = axum::Router::new()
            .route("/", get(capture_peer))
            .with_state(peers.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
            .unwrap();
        });

        let pool = ClientPool::default();
        let endpoint = format!("http://localhost:{port}/v1/chat/completions");
        let timeouts = EndpointTimeouts::legacy(Duration::from_secs(2)).unwrap();

        let client1 = pool
            .client_for_endpoint_with_timeouts(&endpoint, timeouts)
            .await
            .unwrap();
        let body = client1
            .get(format!("http://127.0.0.1:{port}/"))
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        assert_eq!(body, "ok");

        // Force soft TTL expiry while keeping stale_until valid.
        let parsed = parse_endpoint(&endpoint, timeouts).unwrap();
        let entry = pool.entry(parsed.key);
        {
            let mut cached = entry.cached.write().unwrap();
            let item = cached.as_mut().unwrap();
            item.expires_at = Some(Instant::now() - Duration::from_secs(1));
            item.stale_until = Some(Instant::now() + Duration::from_secs(10));
            // Force addresses to match 127.0.0.1 so we can also test connection reuse on localhost/127.0.0.1
        }

        // Simulate an in-flight refresh holding entry.refresh; concurrent caller gets stale warm client immediately.
        {
            let _refresh_guard = entry.refresh.lock().await;
            let stale_client = pool
                .client_for_endpoint_with_timeouts(&endpoint, timeouts)
                .await
                .unwrap();
            let body = stale_client
                .get(format!("http://127.0.0.1:{port}/"))
                .send()
                .await
                .unwrap()
                .bytes()
                .await
                .unwrap();
            assert_eq!(body, "ok");
        }

        // Now let the refresh run to completion and verify the same underlying connection is kept.
        let client2 = pool
            .client_for_endpoint_with_timeouts(&endpoint, timeouts)
            .await
            .unwrap();
        let body = client2
            .get(format!("http://127.0.0.1:{port}/"))
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        assert_eq!(body, "ok");

        assert_eq!(peers.lock().await.len(), 1);
        server.abort();
    }

    #[tokio::test]
    async fn public_endpoint_validation_rejects_loopback_and_local_domains_even_when_cached() {
        for blocked in [
            "http://127.0.0.1:8080/v1",
            "https://127.0.0.1:8443/v1",
            "http://localhost:8080/v1",
            "https://localhost/v1",
            "https://[::1]/v1",
            "https://0.0.0.0/v1",
            "https://169.254.169.254/latest/meta-data",
            "https://service.localhost/v1",
            "https://service.local/v1",
            "https://service.internal/v1",
        ] {
            assert_eq!(
                validate_public_endpoint_url(blocked),
                Err(EndpointError::PrivateAddress),
                "expected PrivateAddress for {blocked}"
            );
            assert_eq!(
                client_for_public_endpoint(blocked, Duration::from_secs(2))
                    .await
                    .unwrap_err(),
                EndpointError::PrivateAddress,
                "expected PrivateAddress client rejection for {blocked}"
            );
        }
        assert_eq!(
            validate_public_endpoint_url("http://api.openai.com/v1"),
            Err(EndpointError::InvalidUrl)
        );
        assert!(validate_public_endpoint_url("https://api.openai.com/v1").is_ok());
    }
}
