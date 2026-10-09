//! Bounded transport to Stripe's fixed API origin. No accounting writes.
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, thiserror::Error)]
#[error("Stripe checkout request failed; reconcile the saved order before retrying")]
pub struct Error;

// Never Debug/Serialize: retains merchant API credentials.
pub struct Client {
    http: reqwest::Client,
    api_key: String,
    live_mode: bool,
    api_base: String,
}
pub struct CreatedCheckout {
    pub session_id: String,
    pub checkout_url: String,
}
/// Server-retrieved lifecycle evidence; never inferred from a browser return.
pub enum RetrievedCheckout {
    Pending { checkout_url: Option<String> },
    Paid { amount_nanos: i64 },
    Expired,
}
impl Client {
    /// Explicit fixture-only transport. Never enable this feature for distribution.
    #[cfg(feature = "test-fixtures")]
    pub fn fixture(api_key: String, live_mode: bool, base: &str) -> Result<Self, Error> {
        let url = url::Url::parse(base).map_err(|_| Error)?;
        let host: std::net::IpAddr = url.host_str().ok_or(Error)?.parse().map_err(|_| Error)?;
        if url.scheme() != "http"
            || !host.is_loopback()
            || url.path() != "/"
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(Error);
        }
        let mut client = Self::new(api_key, live_mode)?;
        client.api_base = base.trim_end_matches('/').into();
        Ok(client)
    }
    pub async fn retrieve_checkout(
        &self,
        expected: &crate::stripe::ExpectedCheckout<'_>,
    ) -> Result<RetrievedCheckout, Error> {
        let prefix = if self.live_mode {
            "cs_live_"
        } else {
            "cs_test_"
        };
        if expected.live_mode != self.live_mode
            || !expected.session_id.starts_with(prefix)
            || expected.session_id.len() <= prefix.len()
            || expected.session_id.len() > 255
            || !expected
                .session_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_')
            || !matches!(expected.currency, "usd" | "cny")
            || expected.amount_nanos <= 0
            || expected.amount_nanos % 10_000_000 != 0
        {
            return Err(Error);
        }
        self.retrieve_at(
            &format!(
                "{}/v1/checkout/sessions/{}",
                self.api_base, expected.session_id
            ),
            expected,
        )
        .await
    }
    async fn retrieve_at(
        &self,
        endpoint: &str,
        expected: &crate::stripe::ExpectedCheckout<'_>,
    ) -> Result<RetrievedCheckout, Error> {
        tokio::time::timeout(Duration::from_secs(5), async {
            let mut response = self
                .http
                .get(endpoint)
                .basic_auth(&self.api_key, Some(""))
                .send()
                .await
                .map_err(|_| Error)?;
            if !response.status().is_success() {
                return Err(Error);
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(|_| Error)? {
                if bytes.len().saturating_add(chunk.len()) > 65536 {
                    return Err(Error);
                }
                bytes.extend_from_slice(&chunk);
            }
            #[derive(Deserialize)]
            struct Session {
                id: String,
                object: String,
                client_reference_id: String,
                currency: String,
                amount_total: i64,
                livemode: bool,
                mode: String,
                status: String,
                payment_status: String,
                url: Option<String>,
            }
            let session: Session = serde_json::from_slice(&bytes).map_err(|_| Error)?;
            if session.id != expected.session_id
                || session.object != "checkout.session"
                || session.client_reference_id != expected.order_reference
                || session.currency != expected.currency
                || session.amount_total.checked_mul(10_000_000) != Some(expected.amount_nanos)
                || session.livemode != expected.live_mode
                || expected.live_mode != self.live_mode
                || session.mode != "payment"
            {
                return Err(Error);
            }
            match (session.status.as_str(), session.payment_status.as_str()) {
                ("complete", "paid") => Ok(RetrievedCheckout::Paid {
                    amount_nanos: expected.amount_nanos,
                }),
                ("expired", "unpaid") => Ok(RetrievedCheckout::Expired),
                ("open" | "complete", "unpaid") => {
                    if let Some(value) = &session.url {
                        let url = url::Url::parse(value).map_err(|_| Error)?;
                        if value.len() > 8192
                            || url.scheme() != "https"
                            || url.host_str() != Some("checkout.stripe.com")
                            || url.port().is_some()
                            || !url.username().is_empty()
                            || url.password().is_some()
                        {
                            return Err(Error);
                        }
                    }
                    Ok(RetrievedCheckout::Pending {
                        checkout_url: session.url,
                    })
                }
                _ => Err(Error),
            }
        })
        .await
        .map_err(|_| Error)?
    }
    pub fn new(api_key: String, live_mode: bool) -> Result<Self, Error> {
        let prefix = if live_mode { "sk_live_" } else { "sk_test_" };
        if !api_key.starts_with(prefix)
            || api_key.len() <= prefix.len()
            || api_key.len() > 512
            || !api_key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_')
        {
            return Err(Error);
        }
        let http = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|_| Error)?;
        Ok(Self {
            http,
            api_key,
            live_mode,
            api_base: "https://api.stripe.com".into(),
        })
    }
    /// The caller must commit its durable creation claim before invoking this.
    pub async fn create_checkout(
        &self,
        reference: &str,
        currency: &str,
        amount_nanos: i64,
        method: &str,
        success_url: &str,
        cancel_url: &str,
    ) -> Result<CreatedCheckout, Error> {
        let parameters = crate::stripe::checkout_parameters(
            reference,
            currency,
            amount_nanos,
            method,
            success_url,
            cancel_url,
        )
        .map_err(|_| Error)?;
        self.create_at(
            &format!("{}/v1/checkout/sessions", self.api_base),
            reference,
            currency,
            amount_nanos,
            &parameters,
        )
        .await
    }
    async fn create_at(
        &self,
        endpoint: &str,
        reference: &str,
        currency: &str,
        amount_nanos: i64,
        parameters: &[(String, String)],
    ) -> Result<CreatedCheckout, Error> {
        tokio::time::timeout(Duration::from_secs(5), async {
            let mut response = self
                .http
                .post(endpoint)
                .basic_auth(&self.api_key, Some(""))
                .header("Idempotency-Key", format!("niu-topup-{reference}"))
                .form(parameters)
                .send()
                .await
                .map_err(|_| Error)?;
            if !response.status().is_success() {
                return Err(Error);
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(|_| Error)? {
                if bytes.len().saturating_add(chunk.len()) > 65536 {
                    return Err(Error);
                }
                bytes.extend_from_slice(&chunk);
            }
            #[derive(Deserialize)]
            struct Session {
                id: String,
                object: String,
                url: String,
                client_reference_id: String,
                currency: String,
                amount_total: i64,
                livemode: bool,
                mode: String,
                status: String,
                payment_status: String,
            }
            let session: Session = serde_json::from_slice(&bytes).map_err(|_| Error)?;
            let prefix = if self.live_mode {
                "cs_live_"
            } else {
                "cs_test_"
            };
            let checkout = url::Url::parse(&session.url).map_err(|_| Error)?;
            if !session.id.starts_with(prefix)
                || session.id.len() > 255
                || session.id.len() <= prefix.len()
                || !session
                    .id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_')
                || session.object != "checkout.session"
                || session.client_reference_id != reference
                || session.currency != currency
                || session.amount_total.checked_mul(10_000_000) != Some(amount_nanos)
                || session.livemode != self.live_mode
                || session.mode != "payment"
                || session.status != "open"
                || session.payment_status != "unpaid"
                || session.url.len() > 8192
                || checkout.scheme() != "https"
                || checkout.host_str() != Some("checkout.stripe.com")
                || checkout.port().is_some()
                || !checkout.username().is_empty()
                || checkout.password().is_some()
            {
                return Err(Error);
            }
            Ok(CreatedCheckout {
                session_id: session.id,
                checkout_url: session.url,
            })
        })
        .await
        .map_err(|_| Error)?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Json, Router, extract::State, http::HeaderMap, routing::post};
    use serde_json::json;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    #[tokio::test]
    async fn retrieved_lifecycle_requires_matching_saved_intent() {
        let app = Router::new().route("/{state}", axum::routing::get(|axum::extract::Path(state): axum::extract::Path<String>, headers: HeaderMap| async move {
            assert!(headers.get("authorization").is_some());
            let mut value = json!({"id":"cs_test_fixture", "object":"checkout.session", "client_reference_id":"fixture-order", "currency":"usd", "amount_total":200, "livemode":false,"mode":"payment", "status":"complete", "payment_status":"paid", "url":null});
            match state.as_str() {
                "pending" => { value["status"] = json!("open"); value["payment_status"] = json!("unpaid"); value["url"] = json!("https://checkout.stripe.com/c/pay/cs_test_fixture#saved"); },
                "expired" => { value["status"] = json!("expired"); value["payment_status"] = json!("unpaid"); },
                "foreign" => value["client_reference_id"] = json!("foreign-order"),
                "partial" => value["amount_total"] = json!(199),
                "wrong-mode" => value["livemode"] = json!(true),
                _ => {}
            }
            Json(value)
        }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let client = Client::new("sk_test_fixture_only".into(), false).unwrap();
        let expected = crate::stripe::ExpectedCheckout {
            session_id: "cs_test_fixture",
            order_reference: "fixture-order",
            currency: "usd",
            amount_nanos: 2_000_000_000,
            live_mode: false,
        };
        assert!(matches!(
            client
                .retrieve_at(&format!("http://{address}/paid"), &expected)
                .await
                .unwrap(),
            RetrievedCheckout::Paid {
                amount_nanos: 2_000_000_000
            }
        ));
        assert!(matches!(
            client
                .retrieve_at(&format!("http://{address}/pending"), &expected)
                .await
                .unwrap(),
            RetrievedCheckout::Pending {
                checkout_url: Some(_)
            }
        ));
        assert!(matches!(
            client
                .retrieve_at(&format!("http://{address}/expired"), &expected)
                .await
                .unwrap(),
            RetrievedCheckout::Expired
        ));
        for invalid in ["foreign", "partial", "wrong-mode"] {
            assert!(
                client
                    .retrieve_at(&format!("http://{address}/{invalid}"), &expected)
                    .await
                    .is_err()
            );
        }
        server.abort();
    }
    #[tokio::test]
    async fn checkout_transport_binds_intent_and_never_retries() {
        let calls = Arc::new(AtomicUsize::new(0));
        let app = Router::new().route("/checkout", post(|State(calls): State<Arc<AtomicUsize>>, headers: HeaderMap, body: String| async move {
            calls.fetch_add(1, Ordering::SeqCst);
            assert_eq!(headers["idempotency-key"], "niu-topup-00112233445566778899aabbccddeeff");
            assert!(headers.get("authorization").is_some());
            assert!(body.contains("unit_amount%5D=200"));
            Json(json!({"id":"cs_test_fixture", "object":"checkout.session", "url":"https://checkout.stripe.com/c/pay/cs_test_fixture#checkout", "client_reference_id":"00112233445566778899aabbccddeeff", "currency":"usd", "amount_total":200, "livemode":false,"mode":"payment","status":"open","payment_status":"unpaid"}))
        })).with_state(calls.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let client = Client::new("sk_test_fixture_only".into(), false).unwrap();
        let reference = "00112233445566778899aabbccddeeff";
        let parameters = crate::stripe::checkout_parameters(
            reference,
            "usd",
            2_000_000_000,
            "card",
            "https://niu.example",
            "https://niu.example",
        )
        .unwrap();
        let endpoint = format!("http://{address}/checkout");
        let created = client
            .create_at(&endpoint, reference, "usd", 2_000_000_000, &parameters)
            .await
            .unwrap();
        assert_eq!(created.session_id, "cs_test_fixture");
        assert!(
            client
                .create_at(&endpoint, reference, "usd", 1_000_000_000, &parameters)
                .await
                .is_err()
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert!(
            client
                .create_at(
                    &format!("http://{address}/missing"),
                    reference,
                    "usd",
                    2_000_000_000,
                    &parameters
                )
                .await
                .is_err()
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        server.abort();
    }
    #[test]
    fn credentials_require_explicit_matching_mode() {
        assert!(Client::new("sk_test_fixture".into(), true).is_err());
        assert!(Client::new("sk_live_fixture".into(), false).is_err());
        assert!(Client::new("sk_test_bad\nvalue".into(), false).is_err());
    }
}
