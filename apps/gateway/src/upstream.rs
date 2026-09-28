use std::{net::IpAddr, time::Duration};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum EndpointError {
    InvalidUrl,
    ResolutionFailed,
    PrivateAddress,
    ClientConfiguration,
}

/// Build a provider client pinned to the address checked by Niu. Redirects are
/// disabled so a public endpoint cannot forward credentials to a private host.
pub(crate) async fn client_for_endpoint(
    endpoint: &str,
    timeout: Duration,
) -> Result<reqwest::Client, EndpointError> {
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

    let addresses = if let Some(address) = literal {
        vec![std::net::SocketAddr::new(address, port)]
    } else {
        tokio::time::timeout(
            timeout.min(Duration::from_secs(3)),
            tokio::net::lookup_host((normalized_host, port)),
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
        if local_target {
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
        // The destination check and pinned resolution must apply to the socket
        // Niu opens. An environment proxy could resolve the provider host on a
        // different machine and bypass that boundary.
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none());
    if literal.is_none() {
        builder = builder.resolve_to_addrs(normalized_host, &addresses);
    }
    builder
        .build()
        .map_err(|_| EndpointError::ClientConfiguration)
}

pub(crate) fn is_public_address(address: IpAddr) -> bool {
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
    use std::net::IpAddr;

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
}
