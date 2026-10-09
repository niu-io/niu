//! Bounded Zhifux server transport. Configuration must come from trusted administration.
//! Credentials and provider response bodies never enter returned errors.
use crate::zhifux::{ExpectedOrder, Merchant, QueriedOrder};
use serde::Deserialize;
use std::{net::IpAddr, time::Duration};
use url::Url;

const MAX_BODY: usize = 64 * 1024;
const TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum Error {
    #[error("Invalid payment transport configuration")]
    Configuration,
    #[error("Payment service request failed; reconcile the saved order before retrying")]
    Transport,
    #[error("Payment service returned an invalid response")]
    Response,
    #[error("Payment service rejected the request (code {code}); payment status is unverified")]
    Rejected { code: u16 },
    #[error("Payment is not confirmed paid")]
    NotPaid,
    #[error(transparent)]
    Protocol(#[from] crate::zhifux::Error),
}

/// Not Debug: client configuration and signed request URLs are private.
pub struct Client {
    base: Url,
    merchant: Merchant,
    http: reqwest::Client,
    checkout_origins: Vec<String>,
}
#[derive(Debug, PartialEq, Eq)]
pub struct CreatedOrder {
    pub platform_reference: String,
    pub checkout_url: String,
}
/// Authenticated recovery evidence, never derived from a browser return URL.
#[derive(Debug, PartialEq, Eq)]
pub struct RecoveredPayment {
    pub platform_reference: String,
    pub amount_nanos: i64,
}
/// Authenticated lifecycle evidence matching the saved order intent. Pending
/// and closed states confer no funding authority.
#[derive(Debug, PartialEq, Eq)]
pub enum VerifiedOrder {
    Pending { platform_reference: String },
    Closed { platform_reference: String },
    Paid(RecoveredPayment),
}
#[derive(Deserialize)]
struct Envelope {
    success: bool,
    code: u16,
    data: Option<serde_json::Value>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Creation {
    id: String,
    pay_url: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Query {
    order_id: String,
    order_no: String,
    merchant_num: String,
    amount: String,
    trade_money: Option<String>,
    pay_type: String,
    order_state: Option<String>,
}
fn secure_url(value: &str) -> Result<Url, Error> {
    let url = Url::parse(value).map_err(|_| Error::Configuration)?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(Error::Configuration);
    }
    Ok(url)
}
fn checkout_origins(values: &[String]) -> Result<Vec<String>, Error> {
    if values.is_empty() || values.len() > 16 {
        return Err(Error::Configuration);
    }
    values
        .iter()
        .map(|value| {
            let url = secure_url(value)?;
            if url.path() != "/" {
                return Err(Error::Configuration);
            }
            Ok(url.origin().ascii_serialization())
        })
        .collect()
}
// Same conservative global-unicast policy as Niu's gateway upstream transport.
fn public_address(address: IpAddr) -> bool {
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
                    || a == 100 && (64..=127).contains(&b)
                    || a == 192 && b == 0 && (c == 0 || c == 2)
                    || a == 192 && b == 88 && c == 99
                    || a == 198 && (b == 18 || b == 19)
                    || a == 198 && b == 51 && c == 100
                    || a == 203 && b == 0 && c == 113
                    || a >= 240)
        }
        IpAddr::V6(address) => {
            let s = address.segments();
            s[0] & 0xe000 == 0x2000
                && !(s[0] == 0x2001 && (s[1] == 0x0db8 || s[1] <= 0x01ff))
                && s[0] != 0x2002
        }
    }
}
impl Client {
    /// DNS addresses are checked and pinned for this instance; rebuild after endpoint changes.
    pub async fn new(base: &str, merchant: Merchant, origins: &[String]) -> Result<Self, Error> {
        let base = secure_url(base)?;
        let origins = checkout_origins(origins)?;
        let host = base.host_str().ok_or(Error::Configuration)?;
        let port = base.port_or_known_default().ok_or(Error::Configuration)?;
        let addresses: Vec<_> =
            tokio::time::timeout(TIMEOUT, tokio::net::lookup_host((host, port)))
                .await
                .map_err(|_| Error::Transport)?
                .map_err(|_| Error::Transport)?
                .take(33)
                .collect();
        if addresses.is_empty()
            || addresses.len() > 32
            || addresses.iter().any(|a| !public_address(a.ip()))
        {
            return Err(Error::Configuration);
        }
        let http = Self::builder()
            .resolve_to_addrs(host, &addresses)
            .build()
            .map_err(|_| Error::Configuration)?;
        Ok(Self {
            base,
            merchant,
            http,
            checkout_origins: origins,
        })
    }
    fn builder() -> reqwest::ClientBuilder {
        reqwest::Client::builder()
            .no_proxy()
            .retry(reqwest::retry::never())
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(TIMEOUT)
    }
    async fn request<T: serde::de::DeserializeOwned>(
        &self,
        endpoint: &str,
        parameters: String,
    ) -> Result<T, Error> {
        let mut url = self.base.clone();
        url.set_path(&format!(
            "{}/{}",
            url.path().trim_end_matches('/'),
            endpoint
        ));
        url.set_query(Some(&parameters));
        let mut response = self
            .http
            .post(url)
            .header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded",
            )
            .send()
            .await
            .map_err(|_| Error::Transport)?;
        if !response.status().is_success() {
            return Err(Error::Transport);
        }
        if response
            .content_length()
            .is_some_and(|n| n > MAX_BODY as u64)
        {
            return Err(Error::Response);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| Error::Transport)? {
            if chunk.len() > MAX_BODY - body.len() {
                return Err(Error::Response);
            }
            body.extend_from_slice(&chunk);
        }
        let envelope: Envelope = serde_json::from_slice(&body).map_err(|_| Error::Response)?;
        if !envelope.success || envelope.code != 200 {
            return Err(Error::Rejected {
                code: envelope.code,
            });
        }
        serde_json::from_value(envelope.data.ok_or(Error::Response)?).map_err(|_| Error::Response)
    }
    pub async fn create_order(
        &self,
        order: &str,
        nanos: i64,
        pay_type: &str,
        notify: &str,
    ) -> Result<CreatedOrder, Error> {
        let parameters = self
            .merchant
            .start_parameters(order, nanos, pay_type, notify)?;
        let result: Creation = self.request("startOrder", parameters).await?;
        if result.id.is_empty()
            || result.id.len() > 128
            || !result.id.bytes().all(|b| b.is_ascii_alphanumeric())
            || result.pay_url.len() > 2048
        {
            return Err(Error::Response);
        }
        let checkout = Url::parse(&result.pay_url).map_err(|_| Error::Response)?;
        if checkout.scheme() != "https"
            || !checkout.username().is_empty()
            || checkout.password().is_some()
            || checkout.fragment().is_some()
            || !self
                .checkout_origins
                .contains(&checkout.origin().ascii_serialization())
        {
            return Err(Error::Response);
        }
        Ok(CreatedOrder {
            platform_reference: result.id,
            checkout_url: result.pay_url,
        })
    }
    /// Fetch independent paid evidence. A pending or closed order never authorizes funding.
    pub async fn verify_paid_order(&self, expected: &ExpectedOrder<'_>) -> Result<i64, Error> {
        let recovered = self
            .recover_paid_order(expected.number, expected.amount_nanos, expected.pay_type)
            .await?;
        if expected.platform_number.is_empty()
            || recovered.platform_reference != expected.platform_number
        {
            return Err(crate::zhifux::Error::Evidence.into());
        }
        Ok(recovered.amount_nanos)
    }

    /// Recover identity after an uncertain creation response. Only independent,
    /// authenticated query evidence matching saved intent may establish identity.
    /// Callers must durably bind this identity before atomic settlement.
    pub async fn recover_paid_order(
        &self,
        number: &str,
        amount_nanos: i64,
        pay_type: &str,
    ) -> Result<RecoveredPayment, Error> {
        match self.query_order(number, amount_nanos, pay_type).await? {
            VerifiedOrder::Paid(payment) => Ok(payment),
            VerifiedOrder::Pending { .. } | VerifiedOrder::Closed { .. } => Err(Error::NotPaid),
        }
    }

    /// Query lifecycle without inferring closure from errors or missing fields.
    /// The authenticated response must match every saved intent field.
    pub async fn query_order(
        &self,
        number: &str,
        amount_nanos: i64,
        pay_type: &str,
    ) -> Result<VerifiedOrder, Error> {
        let result: Query = self
            .request("queryOutOrder", self.merchant.query_parameters(number)?)
            .await?;
        if result.order_id.is_empty()
            || result.order_id.len() > 128
            || !result.order_id.bytes().all(|b| b.is_ascii_alphanumeric())
        {
            return Err(Error::Response);
        }
        let expected = ExpectedOrder {
            number,
            platform_number: &result.order_id,
            amount_nanos,
            pay_type,
        };
        let queried = QueriedOrder {
            merchant: &result.merchant_num,
            order: &result.order_no,
            platform_number: &result.order_id,
            state: result.order_state.as_deref().ok_or(Error::Response)?,
            amount: &result.amount,
            actual_amount: result.trade_money.as_deref().unwrap_or(""),
            pay_type: &result.pay_type,
        };
        self.merchant.verify_query_identity(&expected, &queried)?;
        match queried.state {
            "2" => Ok(VerifiedOrder::Pending {
                platform_reference: result.order_id,
            }),
            "7" => Ok(VerifiedOrder::Closed {
                platform_reference: result.order_id,
            }),
            "4" => {
                let verified = self.merchant.verify_paid_query(&expected, &queried)?;
                Ok(VerifiedOrder::Paid(RecoveredPayment {
                    platform_reference: result.order_id,
                    amount_nanos: verified,
                }))
            }
            _ => Err(Error::Response),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, response::IntoResponse, routing::any};
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    async fn fixture(
        status: u16,
        body: String,
    ) -> (Client, Arc<AtomicUsize>, tokio::task::JoinHandle<()>) {
        let calls = Arc::new(AtomicUsize::new(0));
        let counted = calls.clone();
        let app = Router::new().route(
            "/{endpoint}",
            any(move || {
                let body = body.clone();
                let counted = counted.clone();
                async move {
                    counted.fetch_add(1, Ordering::SeqCst);
                    let mut response =
                        (axum::http::StatusCode::from_u16(status).unwrap(), body).into_response();
                    if status == 302 {
                        response.headers_mut().insert(
                            axum::http::header::LOCATION,
                            axum::http::HeaderValue::from_static("/redirected"),
                        );
                    }
                    response
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let handle = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = Client {
            base: Url::parse(&format!("http://{address}/")).unwrap(),
            merchant: Merchant::new("12345".into(), "fixture-secret".into()).unwrap(),
            http: Client::builder().build().unwrap(),
            checkout_origins: vec!["https://checkout.example".into()],
        };
        (client, calls, handle)
    }
    fn expected() -> ExpectedOrder<'static> {
        ExpectedOrder {
            number: "NiuOrder01",
            platform_number: "platform01",
            amount_nanos: 10_000_000_000,
            pay_type: "wxpaynative",
        }
    }
    #[tokio::test]
    async fn creation_accepts_only_configured_secure_checkout() {
        for (url, accepted) in [
            ("https://checkout.example/pay?order=platform01", true),
            ("http://checkout.example/pay", false),
            ("https://foreign.example/pay", false),
            ("https://user@checkout.example/pay", false),
        ] {
            let body=serde_json::json!({"success":true,"code":200,"data":{"id":"platform01","payUrl":url}}).to_string();
            let (client, calls, handle) = fixture(200, body).await;
            assert_eq!(
                client
                    .create_order(
                        "NiuOrder01",
                        10_000_000_000,
                        "wxpaynative",
                        "https://niu.example/notify"
                    )
                    .await
                    .is_ok(),
                accepted
            );
            assert_eq!(calls.load(Ordering::SeqCst), 1);
            handle.abort();
        }
    }
    #[tokio::test]
    async fn queries_require_complete_matching_paid_evidence() {
        for (state, actual, accepted) in [
            ("4", Some("10.00"), true),
            ("2", Some("10.00"), false),
            ("7", Some("10.00"), false),
            ("4", Some("9.99"), false),
            ("4", None, false),
        ] {
            let body=serde_json::json!({"success":true,"code":200,"data":{"merchantNum":"12345","orderNo":"NiuOrder01","orderId":"platform01","amount":"10.00","tradeMoney":actual,"payType":"wxpaynative","orderState":state}}).to_string();
            let (client, _, handle) = fixture(200, body).await;
            assert_eq!(
                client.verify_paid_order(&expected()).await.is_ok(),
                accepted
            );
            handle.abort();
        }
    }
    #[tokio::test]
    async fn lifecycle_states_require_matching_authenticated_intent() {
        for state in ["2", "7"] {
            let valid = serde_json::json!({"merchantNum":"12345","orderNo":"NiuOrder01","orderId":"platform01","amount":"10.00","payType":"wxpaynative","orderState":state});
            let (client, _, handle) = fixture(
                200,
                serde_json::json!({"success":true,"code":200,"data":valid}).to_string(),
            )
            .await;
            let observed = client
                .query_order("NiuOrder01", 10_000_000_000, "wxpaynative")
                .await
                .unwrap();
            let expected = if state == "2" {
                VerifiedOrder::Pending {
                    platform_reference: "platform01".into(),
                }
            } else {
                VerifiedOrder::Closed {
                    platform_reference: "platform01".into(),
                }
            };
            assert_eq!(observed, expected);
            handle.abort();
            for (field, value) in [
                ("merchantNum", "foreignMerchant"),
                ("orderNo", "foreignOrder"),
                ("orderId", "invalid-reference"),
                ("amount", "9.99"),
                ("payType", "foreignMethod"),
                ("orderState", "unknown"),
            ] {
                let mut changed = valid.clone();
                changed[field] = serde_json::json!(value);
                let (client, _, handle) = fixture(
                    200,
                    serde_json::json!({"success":true,"code":200,"data":changed}).to_string(),
                )
                .await;
                assert!(
                    client
                        .query_order("NiuOrder01", 10_000_000_000, "wxpaynative")
                        .await
                        .is_err(),
                    "changed {field} in {state}"
                );
                handle.abort();
            }
            let mut missing = valid.clone();
            missing.as_object_mut().unwrap().remove("orderState");
            let (client, _, handle) = fixture(
                200,
                serde_json::json!({"success":true,"code":200,"data":missing}).to_string(),
            )
            .await;
            assert!(
                client
                    .query_order("NiuOrder01", 10_000_000_000, "wxpaynative")
                    .await
                    .is_err()
            );
            handle.abort();
        }
    }

    #[tokio::test]
    async fn uncertain_creation_recovers_only_matching_authenticated_paid_identity() {
        let valid = serde_json::json!({"merchantNum":"12345","orderNo":"NiuOrder01","orderId":"recoveredPlatform","amount":"10.00","tradeMoney":"10.00","payType":"wxpaynative","orderState":"4"});
        let (client, _, handle) = fixture(
            200,
            serde_json::json!({"success":true,"code":200,"data":valid}).to_string(),
        )
        .await;
        assert_eq!(
            client
                .recover_paid_order("NiuOrder01", 10_000_000_000, "wxpaynative")
                .await
                .unwrap(),
            RecoveredPayment {
                platform_reference: "recoveredPlatform".into(),
                amount_nanos: 10_000_000_000
            }
        );
        // Recovery does not allow an already bound order to change identity.
        assert!(client.verify_paid_order(&expected()).await.is_err());
        handle.abort();
        for (field, changed) in [
            ("merchantNum", "otherMerchant"),
            ("orderNo", "otherOrder"),
            ("orderId", ""),
            ("orderId", "invalid-reference"),
            ("amount", "11.00"),
            ("tradeMoney", "9.99"),
            ("payType", "otherMethod"),
            ("orderState", "2"),
        ] {
            let mut data = valid.clone();
            data[field] = serde_json::json!(changed);
            let (client, _, handle) = fixture(
                200,
                serde_json::json!({"success":true,"code":200,"data":data}).to_string(),
            )
            .await;
            assert!(
                client
                    .recover_paid_order("NiuOrder01", 10_000_000_000, "wxpaynative")
                    .await
                    .is_err(),
                "changed {field}"
            );
            handle.abort();
        }
    }

    #[tokio::test]
    async fn failures_are_bounded_sanitized_and_never_retried() {
        for (status, body) in [
            (302, "fixture-secret".into()),
            (500, "fixture-secret".into()),
            (200, "x".repeat(MAX_BODY + 1)),
            (200, "not-json fixture-secret".into()),
        ] {
            let (client, calls, handle) = fixture(status, body).await;
            let error = client.verify_paid_order(&expected()).await.unwrap_err();
            assert!(!error.to_string().contains("fixture-secret"));
            assert!(!format!("{error:?}").contains("sign="));
            assert_eq!(calls.load(Ordering::SeqCst), 1);
            handle.abort();
        }
    }
    #[tokio::test]
    async fn production_configuration_rejects_private_and_insecure_endpoints() {
        for base in [
            "http://127.0.0.1/",
            "https://127.0.0.1/",
            "https://[::1]/",
            "https://user@example.com/",
            "https://example.com/?sign=secret",
        ] {
            let merchant = Merchant::new("12345".into(), "fixture-secret".into()).unwrap();
            assert!(
                Client::new(base, merchant, &["https://checkout.example".into()])
                    .await
                    .is_err()
            );
        }
    }
    #[tokio::test]
    async fn slow_and_chunked_oversized_bodies_cannot_escape_request_bounds() {
        for slow in [false, true] {
            let app = Router::new().route(
                "/queryOutOrder",
                any(move || async move {
                    let stream = futures_util::stream::once(async move {
                        if slow {
                            tokio::time::sleep(TIMEOUT + Duration::from_secs(1)).await;
                        }
                        Ok::<_, std::convert::Infallible>(vec![b'x'; MAX_BODY + 1])
                    });
                    axum::response::Response::new(axum::body::Body::from_stream(stream))
                }),
            );
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let handle = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
            let client = Client {
                base: Url::parse(&format!("http://{address}/")).unwrap(),
                merchant: Merchant::new("12345".into(), "fixture-secret".into()).unwrap(),
                http: Client::builder().build().unwrap(),
                checkout_origins: vec!["https://checkout.example".into()],
            };
            let started = std::time::Instant::now();
            assert_eq!(
                client.verify_paid_order(&expected()).await.unwrap_err(),
                if slow {
                    Error::Transport
                } else {
                    Error::Response
                }
            );
            assert!(started.elapsed() < TIMEOUT + Duration::from_secs(1));
            handle.abort();
        }
    }
}
