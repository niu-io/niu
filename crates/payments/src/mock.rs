//! Compile-time test boundary. Distribution builds never accept mock checkout URLs.
pub fn checkout_url(url: &url::Url) -> bool {
    cfg!(all(feature = "mock-payments", debug_assertions))
        && url.scheme() == "http"
        && url.host_str().is_some_and(|host| {
            host.parse::<std::net::IpAddr>()
                .is_ok_and(|ip| ip.is_loopback())
        })
        && url.port().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url
            .path()
            .strip_prefix("/checkout/")
            .is_some_and(|token| token.len() == 48 && token.bytes().all(|b| b.is_ascii_hexdigit()))
}

#[cfg(test)]
mod tests {
    #[test]
    fn checkout_is_bounded_to_explicit_test_builds() {
        let token = "a".repeat(48);
        let valid = url::Url::parse(&format!("http://127.0.0.1:2570/checkout/{token}")).unwrap();
        assert_eq!(
            super::checkout_url(&valid),
            cfg!(all(feature = "mock-payments", debug_assertions))
        );
        for value in [
            format!("http://example.com:2570/checkout/{token}"),
            format!("http://127.0.0.1:2570/checkout/{token}?redirect=evil"),
            format!("http://user@127.0.0.1:2570/checkout/{token}"),
            "http://127.0.0.1:2570/checkout/short".into(),
        ] {
            assert!(!super::checkout_url(&url::Url::parse(&value).unwrap()));
        }
    }
}

#[cfg(all(test, feature = "test-fixtures"))]
mod transport_tests {
    #[test]
    fn rewrites_only_mock_capabilities_on_fixture_transport() {
        use crate::stripe_transport::Client;
        let key = "sk_test_mock_transport_key_123456789".to_owned();
        let stored = format!("https://checkout.stripe.com/c/pay/cs_test_mock_{}", "a".repeat(48));
        assert!(Client::new(key.clone(), false).unwrap().mock_checkout_url(&stored).is_none());
        let fixture = Client::fixture(key, false, "http://127.0.0.1:2570/").unwrap();
        assert_eq!(fixture.mock_checkout_url(&stored).is_some(), cfg!(all(feature = "mock-payments", debug_assertions)));
        assert!(fixture.mock_checkout_url("https://checkout.stripe.com/c/pay/cs_test_real").is_none());
        assert!(fixture.mock_checkout_url(&(stored + "?redirect=other")).is_none());
    }
}
