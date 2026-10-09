//! Original classic EPay protocol implementation; no upstream source is imported.
//! Protocol reference: https://github.com/Calcium-Ion/go-epay/tree/v0.0.4/epay
//! This module verifies evidence; it never credits funds or treats returns as paid.
use md5::{Digest, Md5};
use std::collections::BTreeMap;
use subtle::ConstantTimeEq;
use url::Url;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum Error {
    #[error("Invalid EPay configuration")]
    Configuration,
    #[error("Invalid EPay parameters")]
    Parameters,
    #[error("EPay evidence does not match the saved order")]
    Evidence,
}
// No Debug/Serialize implementation: merchant credentials are private.
pub struct Merchant {
    pid: String,
    secret: String,
}
pub struct ExpectedOrder<'a> {
    pub number: &'a str,
    pub payment_method: &'a str,
    pub amount_nanos: i64,
}
pub struct VerifiedPayment {
    platform_reference: String,
}
impl VerifiedPayment {
    pub fn platform_reference(&self) -> &str {
        &self.platform_reference
    }
}
fn identifier(value: &str) -> bool {
    (1..=128).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
}
fn valid_form_encoding(encoded: &[u8]) -> bool {
    let mut remaining = encoded;
    while let Some((&byte, tail)) = remaining.split_first() {
        if byte == b'%' {
            if tail.len() < 2 || !tail[..2].iter().all(u8::is_ascii_hexdigit) {
                return false;
            }
            remaining = &tail[2..];
        } else {
            remaining = tail;
        }
    }
    true
}
fn https(value: &str) -> Result<Url, Error> {
    let url = Url::parse(value).map_err(|_| Error::Configuration)?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err(Error::Configuration);
    }
    Ok(url)
}
impl Merchant {
    pub fn new(pid: String, secret: String) -> Result<Self, Error> {
        if !(1..=32).contains(&pid.len())
            || !pid.bytes().all(|byte| byte.is_ascii_digit())
            || !(16..=512).contains(&secret.len())
            || secret.trim() != secret
            || secret.chars().any(char::is_control)
        {
            return Err(Error::Configuration);
        }
        Ok(Self { pid, secret })
    }
    fn signature(&self, parameters: &BTreeMap<String, String>) -> String {
        let mut digest = Md5::new();
        let mut first = true;
        for (key, value) in parameters {
            if key == "sign" || key == "sign_type" || value.is_empty() {
                continue;
            }
            if !first {
                digest.update(b"&");
            }
            first = false;
            digest.update(key.as_bytes());
            digest.update(b"=");
            digest.update(value.as_bytes());
        }
        digest.update(self.secret.as_bytes());
        format!("{:x}", digest.finalize())
    }
    pub fn checkout(
        &self,
        endpoint: &str,
        notify: &str,
        return_url: &str,
        expected: &ExpectedOrder<'_>,
    ) -> Result<String, Error> {
        let mut endpoint = https(endpoint)?;
        if endpoint.query().is_some() {
            return Err(Error::Configuration);
        }
        https(notify)?;
        https(return_url)?;
        if !identifier(expected.number) || !identifier(expected.payment_method) {
            return Err(Error::Parameters);
        }
        let amount =
            crate::zhifux::cny_decimal(expected.amount_nanos).map_err(|_| Error::Parameters)?;
        let mut parameters = BTreeMap::from([
            ("pid".into(), self.pid.clone()),
            ("out_trade_no".into(), expected.number.into()),
            ("type".into(), expected.payment_method.into()),
            ("money".into(), amount),
            ("name".into(), "Niu account top-up".into()),
            ("notify_url".into(), notify.into()),
            ("return_url".into(), return_url.into()),
            ("device".into(), "pc".into()),
        ]);
        parameters.insert("sign".into(), self.signature(&parameters));
        parameters.insert("sign_type".into(), "MD5".into());
        endpoint.set_path(&format!(
            "{}/submit.php",
            endpoint.path().trim_end_matches('/')
        ));
        endpoint.query_pairs_mut().extend_pairs(parameters);
        Ok(endpoint.into())
    }
    /// Pass raw form/query bytes. Duplicate fields are rejected before verification.
    pub fn verify_paid(
        &self,
        encoded: &[u8],
        expected: &ExpectedOrder<'_>,
    ) -> Result<VerifiedPayment, Error> {
        if encoded.is_empty() || encoded.len() > 8192 || !valid_form_encoding(encoded) {
            return Err(Error::Parameters);
        }
        let mut parameters = BTreeMap::new();
        let allowed = [
            "pid",
            "trade_no",
            "out_trade_no",
            "type",
            "name",
            "money",
            "trade_status",
            "sign",
            "sign_type",
        ];
        for (key, value) in url::form_urlencoded::parse(encoded) {
            if !allowed.contains(&key.as_ref())
                || value.len() > 1024
                || value.contains(['&', '=', '\u{fffd}'])
                || value.chars().any(char::is_control)
                || parameters
                    .insert(key.into_owned(), value.into_owned())
                    .is_some()
            {
                return Err(Error::Parameters);
            }
        }
        let field = |name: &str| {
            parameters
                .get(name)
                .map(String::as_str)
                .ok_or(Error::Evidence)
        };
        let sign = field("sign")?;
        if field("sign_type")? != "MD5"
            || sign.len() != 32
            || !sign
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            || !bool::from(
                sign.as_bytes()
                    .ct_eq(self.signature(&parameters).as_bytes()),
            )
        {
            return Err(Error::Evidence);
        }
        let platform = field("trade_no")?;
        if field("pid")? != self.pid
            || field("out_trade_no")? != expected.number
            || field("type")? != expected.payment_method
            || field("trade_status")? != "TRADE_SUCCESS"
            || !identifier(platform)
            || crate::zhifux::cny_nanos(field("money")?).map_err(|_| Error::Evidence)?
                != expected.amount_nanos
        {
            return Err(Error::Evidence);
        }
        Ok(VerifiedPayment {
            platform_reference: platform.into(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn merchant() -> Merchant {
        Merchant::new("1234".into(), "fixture-key-0123456789".into()).unwrap()
    }
    fn expected() -> ExpectedOrder<'static> {
        ExpectedOrder {
            number: "niuorder123",
            payment_method: "alipay",
            amount_nanos: 1_230_000_000,
        }
    }
    fn callback(merchant: &Merchant) -> BTreeMap<String, String> {
        let mut fields = BTreeMap::from([
            ("pid".into(), "1234".into()),
            ("trade_no".into(), "provider123".into()),
            ("out_trade_no".into(), "niuorder123".into()),
            ("type".into(), "alipay".into()),
            ("money".into(), "1.23".into()),
            ("trade_status".into(), "TRADE_SUCCESS".into()),
        ]);
        fields.insert("sign".into(), merchant.signature(&fields));
        fields.insert("sign_type".into(), "MD5".into());
        fields
    }
    fn encoded(fields: &BTreeMap<String, String>) -> String {
        url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs(fields)
            .finish()
    }
    #[test]
    fn callback_is_bound_to_saved_order_and_exact_amount() {
        let merchant = merchant();
        let fields = callback(&merchant);
        let body = encoded(&fields);
        assert_eq!(
            fields["sign"], "9b2baa7fb9b5c900d6bb3c8151008231",
            "independent classic protocol vector"
        );
        assert_eq!(
            merchant
                .verify_paid(body.as_bytes(), &expected())
                .unwrap()
                .platform_reference(),
            "provider123"
        );
        for name in [
            "pid",
            "money",
            "out_trade_no",
            "type",
            "trade_status",
            "sign_type",
            "sign",
        ] {
            let mut changed = fields.clone();
            changed.insert(name.into(), "changed".into());
            assert!(
                merchant
                    .verify_paid(encoded(&changed).as_bytes(), &expected())
                    .is_err()
            );
        }
        for (field, value) in [
            ("pid", "9999"),
            ("money", "1.24"),
            ("out_trade_no", "otherorder"),
            ("type", "wxpay"),
            ("trade_status", "WAIT_BUYER_PAY"),
        ] {
            let mut changed = fields.clone();
            changed.insert(field.into(), value.into());
            changed.insert("sign".into(), merchant.signature(&changed));
            assert!(
                merchant
                    .verify_paid(encoded(&changed).as_bytes(), &expected())
                    .is_err(),
                "signed evidence must match the saved intent"
            );
        }
        let wrong = ExpectedOrder {
            amount_nanos: 1_240_000_000,
            ..expected()
        };
        assert!(merchant.verify_paid(body.as_bytes(), &wrong).is_err());
        assert!(
            merchant
                .verify_paid(format!("{body}&pid=1234").as_bytes(), &expected())
                .is_err()
        );
        assert!(Merchant::new("1234".into(), String::new()).is_err());
    }
    #[test]
    fn callback_rejects_malformed_raw_escapes_even_with_a_matching_signature() {
        let merchant = merchant();
        for name in ["bad%", "bad%0", "bad%GG"] {
            let mut fields = callback(&merchant);
            fields.insert("name".into(), name.into());
            fields.insert("sign".into(), merchant.signature(&fields));
            let canonical = encoded(&fields);
            assert!(
                merchant
                    .verify_paid(canonical.as_bytes(), &expected())
                    .is_ok()
            );
            let malformed = canonical.replace("%25", "%");
            assert!(matches!(
                merchant.verify_paid(malformed.as_bytes(), &expected()),
                Err(Error::Parameters)
            ));
        }
    }
    #[test]
    fn checkout_uses_fixed_https_endpoint_and_preserves_amount() {
        let merchant = merchant();
        let checkout = merchant
            .checkout(
                "https://merchant.example/pay",
                "https://niu.example/payments/epay/notify",
                "https://niu.example/settings/billing",
                &expected(),
            )
            .unwrap();
        let url = Url::parse(&checkout).unwrap();
        assert_eq!(url.path(), "/pay/submit.php");
        let fields: BTreeMap<_, _> = url
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        assert_eq!(fields["money"], "1.23");
        assert_eq!(fields["sign"], merchant.signature(&fields));
        assert!(!checkout.contains("fixture-key"));
        assert!(
            merchant
                .checkout(
                    "http://merchant.example",
                    "https://niu.example/notify",
                    "https://niu.example/return",
                    &expected()
                )
                .is_err()
        );
    }
}
