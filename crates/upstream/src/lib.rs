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
const DNS_RETRY_DELAY: Duration = Duration::from_secs(1);
const MAX_CACHED_CLIENTS: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndpointError {
    InvalidUrl,
    ResolutionFailed,
    PrivateAddress,
    ClientConfiguration,
}

#[derive(Clone, Eq, Hash, PartialEq)]
struct ClientKey {
    scheme: String,
    host: String,
    port: u16,
    timeout_nanos: u128,
}

struct Endpoint {
    key: ClientKey,
    host: String,
    port: u16,
    literal: Option<IpAddr>,
    local_target: bool,
}

struct CachedClient {
    client: reqwest::Client,
    expires_at: Option<Instant>,
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

    async fn client_for_endpoint(
        &self,
        endpoint: &str,
        timeout: Duration,
    ) -> Result<reqwest::Client, EndpointError> {
        let endpoint = parse_endpoint(endpoint, timeout)?;
        let entry = self.entry(endpoint.key.clone());
        if let Some(client) = cached_client(&entry) {
            return Ok(client);
        }

        // Serialize refreshes for this authority only. Other providers continue
        // using their established connection pools while DNS is checked.
        let _refresh = entry.refresh.lock().await;
        if let Some(client) = cached_client(&entry) {
            return Ok(client);
        }
        if let Some(error) = refresh_error(&entry) {
            return Err(error);
        }

        let client = match build_client_for_endpoint(&endpoint, timeout).await {
            Ok(client) => client,
            Err(error) => {
                *entry
                    .refresh_failed
                    .write()
                    .unwrap_or_else(std::sync::PoisonError::into_inner) =
                    Some((Instant::now() + DNS_RETRY_DELAY, error));
                return Err(error);
            }
        };
        let expires_at = endpoint
            .literal
            .is_none()
            .then(|| Instant::now() + DNS_CACHE_TTL);
        *entry
            .refresh_failed
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
        *entry
            .cached
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(CachedClient {
            client: client.clone(),
            expires_at,
        });
        Ok(client)
    }
}

fn refresh_error(entry: &ClientEntry) -> Option<EndpointError> {
    entry
        .refresh_failed
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .as_ref()
        .filter(|(retry_at, _)| *retry_at > Instant::now())
        .map(|(_, error)| *error)
}

fn cached_client(entry: &ClientEntry) -> Option<reqwest::Client> {
    entry
        .cached
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .as_ref()
        .filter(|cached| {
            cached
                .expires_at
                .is_none_or(|expiry| expiry > Instant::now())
        })
        .map(|cached| cached.client.clone())
}

/// Reuse a bounded pool of provider clients while pinning every DNS refresh to
/// the addresses checked by Niu. Redirects remain disabled so credentials
/// cannot be forwarded from a public endpoint to a private host.
pub async fn client_for_endpoint(
    endpoint: &str,
    timeout: Duration,
) -> Result<reqwest::Client, EndpointError> {
    static POOL: OnceLock<ClientPool> = OnceLock::new();
    POOL.get_or_init(ClientPool::default)
        .client_for_endpoint(endpoint, timeout)
        .await
}

fn parse_endpoint(endpoint: &str, timeout: Duration) -> Result<Endpoint, EndpointError> {
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
    let local_target = host.eq_ignore_ascii_case("localhost")
        || literal.is_some_and(|address| address.is_loopback());
    if url.scheme() != "https" && !(url.scheme() == "http" && local_target) {
        return Err(EndpointError::InvalidUrl);
    }

    Ok(Endpoint {
        key: ClientKey {
            scheme: url.scheme().to_owned(),
            host: normalized_host.to_ascii_lowercase(),
            port,
            timeout_nanos: timeout.as_nanos(),
        },
        host: normalized_host.to_owned(),
        port,
        literal,
        local_target,
    })
}

async fn build_client_for_endpoint(
    endpoint: &Endpoint,
    timeout: Duration,
) -> Result<reqwest::Client, EndpointError> {
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
            timeout.min(Duration::from_secs(3)),
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

    let mut builder = reqwest::Client::builder()
        .connect_timeout(timeout.min(Duration::from_secs(3)))
        .timeout(timeout)
        // A recorded dispatch must not silently become multiple HTTP requests.
        // Retry/failover belongs to the caller's durable attempt lifecycle,
        // including for protocol-level nacks that reqwest retries by default.
        .retry(reqwest::retry::never())
        // The destination check and pinned resolution must apply to the socket
        // Niu opens. An environment proxy could resolve the provider host on a
        // different machine and bypass that boundary.
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none());
    if literal.is_none() {
        builder = builder.resolve_to_addrs(host, &addresses);
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
}
