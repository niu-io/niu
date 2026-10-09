//! Original implementation of the documented Zhifux payment protocol.
//! https://docs.zhifux.com/read/zhifufm/startorder
//! https://docs.zhifux.com/read/zhifufm/notify
//! https://docs.zhifux.com/read/zhifufm/querybyoutno
use md5::{Digest, Md5};
use subtle::ConstantTimeEq;
use url::Url;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum Error {
    #[error("Invalid payment configuration")]
    Configuration,
    #[error("Invalid exact CNY payment amount")]
    Amount,
    #[error("Payment evidence does not match the saved order")]
    Evidence,
}

/// Configuration is intentionally not Debug or serializable: it contains a secret.
pub struct Merchant {
    number: String,
    secret: String,
}

/// Load this from durable storage; never construct it from callback fields.
pub struct ExpectedOrder<'a> {
    pub number: &'a str,
    pub platform_number: &'a str,
    pub amount_nanos: i64,
    pub pay_type: &'a str,
}

pub struct Callback<'a> {
    pub merchant: &'a str,
    pub order: &'a str,
    pub state: &'a str,
    pub amount: &'a str,
    pub signature: &'a str,
}

/// A successful response obtained by authenticated HTTPS queryOutOrder transport.
/// Callback platform IDs and actualPayAmount are unsigned and cannot replace this.
pub struct QueriedOrder<'a> {
    pub merchant: &'a str,
    pub order: &'a str,
    pub platform_number: &'a str,
    pub state: &'a str,
    pub amount: &'a str,
    pub actual_amount: &'a str,
    pub pay_type: &'a str,
}

fn identifier(value: &str, maximum: usize) -> bool {
    !value.is_empty() && value.len() <= maximum && value.bytes().all(|b| b.is_ascii_alphanumeric())
}

fn digest(parts: &[&str]) -> String {
    let mut hash = Md5::new();
    for part in parts {
        hash.update(part.as_bytes());
    }
    format!("{:x}", hash.finalize())
}

/// Exact positive CNY amount, with at most two decimal places. No float conversion.
pub fn cny_nanos(value: &str) -> Result<i64, Error> {
    if value.len() > 20 {
        return Err(Error::Amount);
    }
    let (whole, fraction) = value.split_once('.').unwrap_or((value, ""));
    if whole.is_empty()
        || !whole.bytes().all(|b| b.is_ascii_digit())
        || fraction.len() > 2
        || !fraction.bytes().all(|b| b.is_ascii_digit())
        || value.ends_with('.')
    {
        return Err(Error::Amount);
    }
    let whole = whole.parse::<i64>().map_err(|_| Error::Amount)?;
    let cents = if fraction.is_empty() {
        0
    } else {
        fraction.parse::<i64>().map_err(|_| Error::Amount)?
            * if fraction.len() == 1 { 10 } else { 1 }
    };
    let nanos = whole
        .checked_mul(1_000_000_000)
        .and_then(|v| v.checked_add(cents * 10_000_000))
        .ok_or(Error::Amount)?;
    if nanos <= 0 {
        return Err(Error::Amount);
    }
    Ok(nanos)
}

pub fn cny_decimal(nanos: i64) -> Result<String, Error> {
    if nanos <= 0 || nanos % 10_000_000 != 0 {
        return Err(Error::Amount);
    }
    Ok(format!(
        "{}.{:02}",
        nanos / 1_000_000_000,
        (nanos % 1_000_000_000) / 10_000_000
    ))
}

impl Merchant {
    pub fn new(number: String, secret: String) -> Result<Self, Error> {
        if !identifier(&number, 64)
            || secret.is_empty()
            || secret.len() > 1024
            || secret.chars().any(char::is_control)
        {
            return Err(Error::Configuration);
        }
        Ok(Self { number, secret })
    }

    /// URL-encoded POST query parameters. Never log this string: it includes a signature.
    pub fn start_parameters(
        &self,
        order: &str,
        nanos: i64,
        pay_type: &str,
        notify: &str,
    ) -> Result<String, Error> {
        let notify_url = Url::parse(notify).map_err(|_| Error::Configuration)?;
        if !identifier(order, 32)
            || pay_type.is_empty()
            || pay_type.len() > 64
            || !pay_type
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-'))
            || notify.len() > 200
            || notify_url.scheme() != "https"
            || notify_url.host_str().is_none()
            || !notify_url.username().is_empty()
            || notify_url.password().is_some()
            || notify_url.query().is_some()
            || notify_url.fragment().is_some()
        {
            return Err(Error::Configuration);
        }
        let amount = cny_decimal(nanos)?;
        let signature = digest(&[&self.number, order, &amount, notify, &self.secret]);
        Ok(url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs([
                ("merchantNum", self.number.as_str()),
                ("orderNo", order),
                ("amount", &amount),
                ("notifyUrl", notify),
                ("payType", pay_type),
                ("sign", &signature),
                ("returnType", "json"),
                ("apiMode", "post_form"),
            ])
            .finish())
    }

    pub fn query_parameters(&self, order: &str) -> Result<String, Error> {
        if !identifier(order, 32) {
            return Err(Error::Configuration);
        }
        let signature = digest(&[&self.number, order, &self.secret]);
        Ok(url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs([
                ("merchantNum", self.number.as_str()),
                ("orderNo", order),
                ("sign", &signature),
            ])
            .finish())
    }

    /// Verifies signed fields against the saved order. Does not authorize funding.
    pub fn verify_callback(
        &self,
        expected: &ExpectedOrder<'_>,
        callback: &Callback<'_>,
    ) -> Result<(), Error> {
        if callback.merchant != self.number
            || callback.order != expected.number
            || callback.state != "1"
            || cny_nanos(callback.amount)? != expected.amount_nanos
            || callback.signature.len() != 32
            || !callback.signature.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err(Error::Evidence);
        }
        let signature = digest(&[
            callback.state,
            &self.number,
            callback.order,
            callback.amount,
            &self.secret,
        ]);
        if signature
            .as_bytes()
            .ct_eq(callback.signature.as_bytes())
            .unwrap_u8()
            != 1
        {
            return Err(Error::Evidence);
        }
        Ok(())
    }

    /// Validate independent server-query evidence before the atomic ledger transaction.
    /// Floating/partial amounts require reconciliation; never credit the requested amount.
    pub fn verify_paid_query(
        &self,
        expected: &ExpectedOrder<'_>,
        query: &QueriedOrder<'_>,
    ) -> Result<i64, Error> {
        self.verify_query_identity(expected, query)?;
        if query.state != "4" || cny_nanos(query.actual_amount)? != expected.amount_nanos {
            return Err(Error::Evidence);
        }
        Ok(expected.amount_nanos)
    }

    pub(crate) fn verify_query_identity(
        &self,
        expected: &ExpectedOrder<'_>,
        query: &QueriedOrder<'_>,
    ) -> Result<(), Error> {
        if expected.platform_number.is_empty()
            || query.merchant != self.number
            || query.order != expected.number
            || query.platform_number != expected.platform_number
            || query.pay_type != expected.pay_type
            || cny_nanos(query.amount)? != expected.amount_nanos
        {
            return Err(Error::Evidence);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn merchant() -> Merchant {
        Merchant::new("12345".into(), "fixture-secret".into()).unwrap()
    }
    fn expected() -> ExpectedOrder<'static> {
        ExpectedOrder {
            number: "NiuOrder01",
            platform_number: "platform01",
            amount_nanos: 10_000_000_000,
            pay_type: "wxpaynative",
        }
    }
    #[test]
    fn exact_amounts_never_round_or_accept_invalid_units() {
        assert_eq!(cny_nanos("9007199.25"), Ok(9_007_199_250_000_000));
        assert_eq!(cny_decimal(10_010_000_000), Ok("10.01".into()));
        for value in [
            "0",
            "-1",
            "1.001",
            "1e2",
            " 1",
            "1.",
            "9223372037",
            "NaN",
            ".1",
        ] {
            assert_eq!(cny_nanos(value), Err(Error::Amount));
        }
        assert_eq!(cny_decimal(1), Err(Error::Amount));
    }
    #[test]
    fn callback_requires_signed_success_and_exact_saved_identity() {
        let mut callback = Callback {
            merchant: "12345",
            order: "NiuOrder01",
            state: "1",
            amount: "10.00",
            signature: "8e4bb6c685d8cad57e9d91e1b5adc09f",
        };
        assert_eq!(merchant().verify_callback(&expected(), &callback), Ok(()));
        callback.state = "4";
        assert!(merchant().verify_callback(&expected(), &callback).is_err());
        callback.state = "1";
        callback.amount = "11.00";
        assert!(merchant().verify_callback(&expected(), &callback).is_err());
        callback.amount = "10.00";
        callback.order = "OtherOrder";
        assert!(merchant().verify_callback(&expected(), &callback).is_err());
        callback.order = "NiuOrder01";
        callback.signature = "00000000000000000000000000000000";
        assert!(merchant().verify_callback(&expected(), &callback).is_err());
    }
    #[test]
    fn independently_queried_payment_must_match_all_saved_fields() {
        let mut query = QueriedOrder {
            merchant: "12345",
            order: "NiuOrder01",
            platform_number: "platform01",
            state: "4",
            amount: "10",
            actual_amount: "10.00",
            pay_type: "wxpaynative",
        };
        assert_eq!(
            merchant().verify_paid_query(&expected(), &query),
            Ok(10_000_000_000)
        );
        query.actual_amount = "9.99";
        assert!(merchant().verify_paid_query(&expected(), &query).is_err());
        query.actual_amount = "10";
        query.platform_number = "forged";
        assert!(merchant().verify_paid_query(&expected(), &query).is_err());
        query.platform_number = "platform01";
        query.state = "2";
        assert!(merchant().verify_paid_query(&expected(), &query).is_err());
        query.state = "4";
        query.pay_type = "alipaysign";
        assert!(merchant().verify_paid_query(&expected(), &query).is_err());
    }
    #[test]
    fn start_and_query_parameters_use_documented_signatures_without_exposing_secret() {
        let parameters = merchant()
            .start_parameters(
                "NiuOrder01",
                10_000_000_000,
                "wxpaynative",
                "https://niu.example/payments/notify",
            )
            .unwrap();
        let pairs: std::collections::HashMap<_, _> =
            url::form_urlencoded::parse(parameters.as_bytes())
                .into_owned()
                .collect();
        assert_eq!(pairs["amount"], "10.00");
        assert_eq!(pairs["apiMode"], "post_form");
        assert_eq!(pairs["sign"], "aa705aeb107d6d6f054d298999e60354");
        assert!(!parameters.contains("fixture-secret"));
        for notify in [
            "http://niu.example/notify",
            "https://niu.example/notify?x=1",
            "https://user@niu.example/notify",
        ] {
            assert!(
                merchant()
                    .start_parameters("NiuOrder01", 10_000_000_000, "wxpaynative", notify)
                    .is_err()
            );
        }
        let query = merchant().query_parameters("NiuOrder01").unwrap();
        assert!(!query.contains("fixture-secret"));
        let query_pairs: std::collections::HashMap<_, _> =
            url::form_urlencoded::parse(query.as_bytes())
                .into_owned()
                .collect();
        assert_eq!(query_pairs["sign"], "74104ff28b1bcf891d56822c476abd59");
    }
}
