//! Original implementation of Stripe's raw-body webhook signature protocol.
//! Authentication is not settlement: callers must bind saved orders and deduplicate events.
use hmac::{Hmac, Mac};
use sha2::Sha256;

/// Build one exact-value prepaid Checkout item from trusted saved intent.
/// Return destinations are server configuration, never browser input.
pub fn checkout_parameters(
    order_reference: &str,
    currency: &str,
    amount_nanos: i64,
    payment_method: &str,
    success_url: &str,
    cancel_url: &str,
) -> Result<Vec<(String, String)>, AuthenticationError> {
    if order_reference.len() != 32
        || !order_reference.bytes().all(|b| b.is_ascii_hexdigit())
        || !matches!(currency, "usd" | "cny")
        || amount_nanos <= 0
        || amount_nanos % 10_000_000 != 0
        || !matches!(payment_method, "card" | "alipay" | "wechat_pay")
    {
        return Err(AuthenticationError);
    }
    for destination in [success_url, cancel_url] {
        let parsed = url::Url::parse(destination).map_err(|_| AuthenticationError)?;
        if parsed.scheme() != "https"
            || parsed.host_str().is_none()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.fragment().is_some()
            || destination.len() > 2048
        {
            return Err(AuthenticationError);
        }
    }
    Ok([
        ("mode", "payment".into()),
        ("client_reference_id", order_reference.into()),
        ("line_items[0][price_data][currency]", currency.into()),
        (
            "line_items[0][price_data][unit_amount]",
            (amount_nanos / 10_000_000).to_string(),
        ),
        (
            "line_items[0][price_data][product_data][name]",
            "Niu account top-up".into(),
        ),
        ("line_items[0][quantity]", "1".into()),
        ("payment_method_types[0]", payment_method.into()),
        ("success_url", success_url.into()),
        ("cancel_url", cancel_url.into()),
    ]
    .into_iter()
    .map(|(key, value)| (key.into(), value))
    .collect())
}

/// Trusted intent loaded from the company-owned saved order, never browser input.
pub struct ExpectedCheckout<'a> {
    pub session_id: &'a str,
    pub order_reference: &'a str,
    pub currency: &'a str,
    pub amount_nanos: i64,
    pub live_mode: bool,
}

/// Authenticated evidence only; durable replay protection and settlement are separate.
/// No customer details or raw event are retained by this type.
pub struct PaidCheckout {
    event_id: String,
    session_id: String,
    amount_nanos: i64,
}
impl PaidCheckout {
    pub fn event_id(&self) -> &str {
        &self.event_id
    }
    pub fn session_id(&self) -> &str {
        &self.session_id
    }
    pub fn amount_nanos(&self) -> i64 {
        self.amount_nanos
    }
}

/// Verify a signed, completed one-time Checkout payment against saved intent.
/// Only USD/CNY two-decimal top-ups are supported; no implicit FX is performed.
pub fn verify_paid_checkout(
    body: &[u8],
    header: &str,
    endpoint_secret: &str,
    now_seconds: u64,
    expected: &ExpectedCheckout<'_>,
) -> Result<PaidCheckout, AuthenticationError> {
    verify_webhook(body, header, endpoint_secret, now_seconds)?;
    #[derive(serde::Deserialize)]
    struct Event {
        id: String,
        object: String,
        #[serde(rename = "type")]
        kind: String,
        livemode: bool,
        account: Option<String>,
        data: Data,
    }
    #[derive(serde::Deserialize)]
    struct Data {
        object: Session,
    }
    #[derive(serde::Deserialize)]
    struct Session {
        id: String,
        object: String,
        client_reference_id: String,
        amount_total: i64,
        currency: String,
        livemode: bool,
        mode: String,
        status: String,
        payment_status: String,
    }
    let event: Event = serde_json::from_slice(body).map_err(|_| AuthenticationError)?;
    let session = event.data.object;
    let amount = session
        .amount_total
        .checked_mul(10_000_000)
        .ok_or(AuthenticationError)?;
    if !matches!(expected.currency, "usd" | "cny")
        || expected.amount_nanos <= 0
        || expected.amount_nanos % 10_000_000 != 0
        || !expected.session_id.starts_with("cs_")
        || expected.order_reference.is_empty()
        || event.id.len() > 255
        || !event.id.starts_with("evt_")
        || event.object != "event"
        || event.account.is_some()
        || !matches!(
            event.kind.as_str(),
            "checkout.session.completed" | "checkout.session.async_payment_succeeded"
        )
        || event.livemode != expected.live_mode
        || session.livemode != expected.live_mode
        || session.id != expected.session_id
        || session.object != "checkout.session"
        || session.client_reference_id != expected.order_reference
        || session.currency != expected.currency
        || amount != expected.amount_nanos
        || session.mode != "payment"
        || session.status != "complete"
        || session.payment_status != "paid"
    {
        return Err(AuthenticationError);
    }
    Ok(PaidCheckout {
        event_id: event.id,
        session_id: session.id,
        amount_nanos: amount,
    })
}

#[derive(Debug, thiserror::Error)]
#[error("Stripe webhook authentication failed")]
pub struct AuthenticationError;

/// Authenticate exact received bytes with a five-minute clock window.
/// No parsing, logging, network access or accounting mutation occurs here.
pub fn verify_webhook(
    body: &[u8],
    header: &str,
    endpoint_secret: &str,
    now_seconds: u64,
) -> Result<(), AuthenticationError> {
    if body.is_empty()
        || body.len() > 262_144
        || header.len() > 4096
        || !endpoint_secret.starts_with("whsec_")
        || endpoint_secret.len() <= 6
        || endpoint_secret.len() > 512
    {
        return Err(AuthenticationError);
    }
    let mut timestamp = None;
    let mut signatures = Vec::new();
    for field in header.split(',') {
        let (name, value) = field.split_once('=').ok_or(AuthenticationError)?;
        match name {
            "t" => {
                if timestamp.is_some()
                    || value.is_empty()
                    || !value.bytes().all(|b| b.is_ascii_digit())
                {
                    return Err(AuthenticationError);
                }
                timestamp = Some(value.parse::<u64>().map_err(|_| AuthenticationError)?);
            }
            "v1" => {
                if signatures.len() >= 16
                    || value.len() != 64
                    || !value.bytes().all(|b| b.is_ascii_hexdigit())
                {
                    return Err(AuthenticationError);
                }
                let mut signature = [0u8; 32];
                for (index, byte) in signature.iter_mut().enumerate() {
                    *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16)
                        .map_err(|_| AuthenticationError)?;
                }
                signatures.push(signature);
            }
            _ => {}
        }
    }
    let timestamp = timestamp.ok_or(AuthenticationError)?;
    if now_seconds.abs_diff(timestamp) > 300 || signatures.is_empty() {
        return Err(AuthenticationError);
    }
    let mut mac = Hmac::<Sha256>::new_from_slice(endpoint_secret.as_bytes())
        .map_err(|_| AuthenticationError)?;
    mac.update(timestamp.to_string().as_bytes());
    mac.update(b".");
    mac.update(body);
    let mut matched = false;
    for signature in signatures {
        matched |= mac.clone().verify_slice(&signature).is_ok();
    }
    if matched {
        Ok(())
    } else {
        Err(AuthenticationError)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn checkout_uses_exact_minor_units_and_trusted_returns() {
        let reference = "00112233445566778899aabbccddeeff";
        let parameters = checkout_parameters(
            reference,
            "cny",
            12_340_000_000,
            "alipay",
            "https://niu.example/settings/billing",
            "https://niu.example/settings/billing",
        )
        .unwrap();
        assert!(parameters.contains(&(
            "line_items[0][price_data][unit_amount]".into(),
            "1234".into()
        )));
        assert!(parameters.contains(&("client_reference_id".into(), reference.into())));
        for amount in [0, -1, 12_340_000_001] {
            assert!(
                checkout_parameters(
                    reference,
                    "cny",
                    amount,
                    "card",
                    "https://niu.example",
                    "https://niu.example"
                )
                .is_err()
            );
        }
        for destination in [
            "http://niu.example",
            "https://user:secret@niu.example",
            "https://niu.example/#fragment",
        ] {
            assert!(
                checkout_parameters(
                    reference,
                    "usd",
                    1_000_000_000,
                    "card",
                    destination,
                    "https://niu.example"
                )
                .is_err()
            );
        }
        assert!(
            checkout_parameters(
                reference,
                "jpy",
                1_000_000_000,
                "card",
                "https://niu.example",
                "https://niu.example"
            )
            .is_err()
        );
    }
    #[test]
    fn paid_session_requires_exact_saved_intent() {
        let expected = ExpectedCheckout {
            session_id: "cs_test_fixture",
            order_reference: "fixture-order",
            currency: "cny",
            amount_nanos: 12_340_000_000,
            live_mode: false,
        };
        let fixture = serde_json::json!({"id":"evt_fixture", "object":"event", "type":"checkout.session.completed", "livemode":false, "data":{"object":{
            "id":"cs_test_fixture", "object":"checkout.session", "client_reference_id":"fixture-order", "amount_total":1234, "currency":"cny", "livemode":false,
            "mode":"payment", "status":"complete", "payment_status":"paid"
        }}});
        let verify = |value: &serde_json::Value| {
            let body = serde_json::to_vec(value).unwrap();
            let mut mac = Hmac::<Sha256>::new_from_slice(b"whsec_fixture_only").unwrap();
            mac.update(b"1700000000.");
            mac.update(&body);
            let hex: String = mac
                .finalize()
                .into_bytes()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect();
            verify_paid_checkout(
                &body,
                &format!("t=1700000000,v1={hex}"),
                "whsec_fixture_only",
                1700000000,
                &expected,
            )
        };
        let paid = verify(&fixture).unwrap();
        assert_eq!(paid.amount_nanos(), expected.amount_nanos);
        assert_eq!(paid.event_id(), "evt_fixture");
        for (field, value) in [
            ("amount_total", serde_json::json!(1233)),
            ("currency", serde_json::json!("usd")),
            ("livemode", serde_json::json!(true)),
            ("payment_status", serde_json::json!("unpaid")),
            ("status", serde_json::json!("open")),
            ("mode", serde_json::json!("subscription")),
            ("client_reference_id", serde_json::json!("foreign-order")),
            ("id", serde_json::json!("cs_foreign")),
            ("amount_total", serde_json::json!(i64::MAX)),
        ] {
            let mut changed = fixture.clone();
            changed["data"]["object"][field] = value;
            assert!(verify(&changed).is_err());
        }
        let mut connected = fixture.clone();
        connected["account"] = serde_json::json!("acct_foreign");
        assert!(verify(&connected).is_err());
        let mut async_paid = fixture.clone();
        async_paid["type"] = serde_json::json!("checkout.session.async_payment_succeeded");
        assert!(verify(&async_paid).is_ok());
    }
    const BODY: &[u8] = br#"{"id":"evt_fixture"}"#;
    // Independently calculated with Python's hmac/hashlib, not the verifier.
    const SIGNATURE: &str = "211ca07e3ac48dddf19f9b579ce9e2886ffb073a83c38aa24e60604dfc826646";
    fn header() -> String {
        format!("t=1700000000,v1={SIGNATURE}")
    }
    #[test]
    fn verifies_raw_bytes_and_rotated_signatures() {
        assert!(verify_webhook(BODY, &header(), "whsec_fixture_only", 1700000300).is_ok());
        let rotated = format!(
            "t=1700000000,v1={},v1={SIGNATURE},v0=ignored",
            "0".repeat(64)
        );
        assert!(verify_webhook(BODY, &rotated, "whsec_fixture_only", 1700000000).is_ok());
        assert!(
            verify_webhook(
                b"{\"id\": \"evt_fixture\"}",
                &header(),
                "whsec_fixture_only",
                1700000000
            )
            .is_err()
        );
        assert!(verify_webhook(BODY, &header(), "whsec_wrong_fixture", 1700000000).is_err());
    }
    #[test]
    fn rejects_stale_future_ambiguous_and_unbounded_inputs() {
        for now in [1699999699, 1700000301] {
            assert!(verify_webhook(BODY, &header(), "whsec_fixture_only", now).is_err());
        }
        for header in [
            "t=1700000000",
            "t=1700000000,v1=zz",
            "t=1700000000,t=1700000000,v1=00",
            "t=-1,v1=00",
        ] {
            assert!(verify_webhook(BODY, header, "whsec_fixture_only", 1700000000).is_err());
        }
        assert!(
            verify_webhook(
                &vec![0; 262145],
                &header(),
                "whsec_fixture_only",
                1700000000
            )
            .is_err()
        );
    }
}
