//! FastRouter's finite Bearer-authenticated Action transport. Domain APIs own
//! workspace scope, durable operation identity and result interpretation. This
//! module creates no approvals, generation, face session, persistence or retries.
use reqwest::{
    StatusCode,
    header::{AUTHORIZATION, HeaderValue},
};
use serde::{
    Deserialize, Deserializer,
    de::{MapAccess, SeqAccess, Visitor},
};
use serde_json::{Map, Value};
use std::{fmt, time::Duration};
use url::Url;

const VERSION: &str = "2024-01-01";
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FastRouterAction {
    CreateAssetGroup,
    ListAssetGroups,
    GetAssetGroup,
    UpdateAssetGroup,
    DeleteAssetGroup,
    CreateAsset,
    ListAssets,
    GetAsset,
    UpdateAsset,
    DeleteAsset,
    CreateVisualValidateSession,
    GetVisualValidateResult,
}
impl FastRouterAction {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::CreateAssetGroup => "CreateAssetGroup",
            Self::ListAssetGroups => "ListAssetGroups",
            Self::GetAssetGroup => "GetAssetGroup",
            Self::UpdateAssetGroup => "UpdateAssetGroup",
            Self::DeleteAssetGroup => "DeleteAssetGroup",
            Self::CreateAsset => "CreateAsset",
            Self::ListAssets => "ListAssets",
            Self::GetAsset => "GetAsset",
            Self::UpdateAsset => "UpdateAsset",
            Self::DeleteAsset => "DeleteAsset",
            Self::CreateVisualValidateSession => "CreateVisualValidateSession",
            Self::GetVisualValidateResult => "GetVisualValidateResult",
        }
    }
    /// Face-result resolution can create a group at the remote service; keep its
    /// uncertainty conservative rather than treating it as ordinary asset lookup.
    pub fn is_read_only(self) -> bool {
        matches!(
            self,
            Self::ListAssetGroups | Self::GetAssetGroup | Self::ListAssets | Self::GetAsset
        )
    }
}
#[derive(Clone, Copy)]
pub struct FastRouterActionLimits {
    pub http_timeout: Duration,
    pub connect_timeout: Duration,
    pub dns_timeout: Duration,
    pub maximum_request_bytes: usize,
    pub maximum_response_bytes: usize,
}
impl FastRouterActionLimits {
    fn validate(self) -> Result<niu_upstream::EndpointTimeouts, FastRouterActionError> {
        if self.http_timeout > Duration::from_secs(60)
            || !(1..=1024 * 1024).contains(&self.maximum_request_bytes)
            || !(1..=2 * 1024 * 1024).contains(&self.maximum_response_bytes)
        {
            return Err(FastRouterActionError::InvalidConfiguration);
        }
        niu_upstream::EndpointTimeouts::new(
            self.http_timeout,
            self.connect_timeout,
            self.dns_timeout,
        )
        .map_err(|_| FastRouterActionError::InvalidConfiguration)
    }
}
/// Only bounded correlation information. No upstream message, exception, body,
/// endpoint, credential, checkout or verification-session token is retained here.
#[derive(Debug)]
pub struct FastRouterActionFailure {
    pub timed_out: bool,
    pub http_status: Option<u16>,
    pub request_id: Option<String>,
    pub error_code: Option<String>,
    pub may_have_executed: bool,
}
#[derive(Debug)]
pub enum FastRouterActionError {
    InvalidConfiguration,
    InvalidRequest,
    /// URL/DNS/client construction failed before send. No HTTP dispatch occurred.
    EndpointUnavailable,
    Transport(FastRouterActionFailure),
    ResponseTooLarge(FastRouterActionFailure),
    InvalidResponse(FastRouterActionFailure),
    UpstreamRejected(FastRouterActionFailure),
}
/// Contains private domain results (including possible verification tokens).
/// Deliberately no Debug or Serialize; handlers must project their own NIU API.
pub struct FastRouterActionResponse {
    action: FastRouterAction,
    http_status: u16,
    request_id: Option<String>,
    result: Value,
}
impl FastRouterActionResponse {
    /// Actual successful transport status, not proof of domain acknowledgement.
    pub fn http_status(&self) -> u16 {
        self.http_status
    }
    pub fn action(&self) -> FastRouterAction {
        self.action
    }
    pub fn request_id(&self) -> Option<&str> {
        self.request_id.as_deref()
    }
    pub fn result(&self) -> &Value {
        &self.result
    }
    pub fn into_result(self) -> Value {
        self.result
    }
}
/// Private configured credential; never use workspace/customer credentials as a
/// substitute. Unlike direct Ark, this adapter requires no SigV4 access pair.
#[derive(Clone)]
pub struct FastRouterActionClient {
    endpoint: Url,
    model: String,
    authorization: HeaderValue,
}
impl FastRouterActionClient {
    pub fn new(base: &str, api_key: &str, model: &str) -> Result<Self, FastRouterActionError> {
        let mut endpoint =
            Url::parse(base).map_err(|_| FastRouterActionError::InvalidConfiguration)?;
        if endpoint.scheme() != "https"
            || endpoint.host_str().is_none()
            || !endpoint.username().is_empty()
            || endpoint.password().is_some()
            || endpoint.query().is_some()
            || endpoint.fragment().is_some()
            || !matches!(endpoint.path(), "" | "/" | "/doubao" | "/doubao/")
            || model.is_empty()
            || model.len() > 256
            || model.trim() != model
            || model.chars().any(char::is_control)
            || api_key.is_empty()
            || api_key.len() > 8192
            || api_key.trim() != api_key
        {
            return Err(FastRouterActionError::InvalidConfiguration);
        }
        endpoint.set_path("/doubao");
        let mut authorization = HeaderValue::from_str(&format!("Bearer {api_key}"))
            .map_err(|_| FastRouterActionError::InvalidConfiguration)?;
        authorization.set_sensitive(true);
        Ok(Self {
            endpoint,
            model: model.to_owned(),
            authorization,
        })
    }
    /// Exactly one POST. Bounded DNS/client setup occurs before HTTP dispatch;
    /// a failure after send never authorizes a hidden mutation replay.
    pub async fn execute(
        &self,
        action: FastRouterAction,
        input: &Value,
        limits: FastRouterActionLimits,
    ) -> Result<FastRouterActionResponse, FastRouterActionError> {
        let timeouts = limits.validate()?;
        if !input.is_object() {
            return Err(FastRouterActionError::InvalidRequest);
        }
        let body = serde_json::to_vec(input).map_err(|_| FastRouterActionError::InvalidRequest)?;
        if body.len() > limits.maximum_request_bytes {
            return Err(FastRouterActionError::InvalidRequest);
        }
        let mut endpoint = self.endpoint.clone();
        endpoint
            .query_pairs_mut()
            .append_pair("Action", action.as_str())
            .append_pair("Version", VERSION)
            .append_pair("model", &self.model);
        let deadline = tokio::time::Instant::now() + limits.http_timeout;
        let client = tokio::time::timeout_at(
            deadline,
            // Authorize the configured origin without operation query fields.
            // The Action URL above is derived from that same immutable origin;
            // shared endpoint validation intentionally rejects caller queries.
            niu_upstream::client_for_endpoint_with_timeouts(self.endpoint.as_str(), timeouts),
        )
        .await
        .map_err(|_| FastRouterActionError::EndpointUnavailable)?
        .map_err(|_| FastRouterActionError::EndpointUnavailable)?;
        let mut observed_status = None;
        let work = async {
            let mut response = client
                .post(endpoint)
                .header(AUTHORIZATION, self.authorization.clone())
                .header("content-type", "application/json")
                .header("accept", "application/json")
                .body(body)
                .send()
                .await
                .map_err(|error| {
                    let mut detail = failure(action, None, None, None);
                    detail.timed_out = error.is_timeout();
                    FastRouterActionError::Transport(detail)
                })?;
            let status = response.status();
            observed_status = Some(status.as_u16());
            let content_length = response.content_length();
            if content_length.is_some_and(|n| n > limits.maximum_response_bytes as u64) {
                return Err(FastRouterActionError::ResponseTooLarge(failure(
                    action,
                    observed_status,
                    None,
                    None,
                )));
            }
            let mut bytes = Vec::with_capacity(
                content_length
                    .unwrap_or(0)
                    .min(limits.maximum_response_bytes as u64) as usize,
            );
            while let Some(chunk) = response.chunk().await.map_err(|error| {
                let mut detail = failure(action, observed_status, None, None);
                detail.timed_out = error.is_timeout();
                FastRouterActionError::Transport(detail)
            })? {
                if chunk.len() > limits.maximum_response_bytes.saturating_sub(bytes.len()) {
                    return Err(FastRouterActionError::ResponseTooLarge(failure(
                        action,
                        observed_status,
                        None,
                        None,
                    )));
                }
                bytes.extend_from_slice(&chunk);
            }
            // Never expose an upstream echo of this private Bearer credential in
            // even a nominal correlation field or successful domain result.
            let secret = self
                .authorization
                .to_str()
                .ok()
                .and_then(|value| value.strip_prefix("Bearer "))
                .ok_or(FastRouterActionError::InvalidConfiguration)?;
            if bytes
                .windows(secret.len())
                .any(|part| part == secret.as_bytes())
            {
                return Err(FastRouterActionError::InvalidResponse(failure(
                    action,
                    observed_status,
                    None,
                    None,
                )));
            }
            parse_response(action, status, &bytes, secret)
        };
        tokio::time::timeout_at(deadline, work).await.map_err(|_| {
            let mut detail = failure(action, observed_status, None, None);
            detail.timed_out = true;
            FastRouterActionError::Transport(detail)
        })?
    }
}
fn correlation(value: Option<String>) -> Option<String> {
    value.filter(|v| {
        !v.is_empty()
            && v.len() <= 256
            && v.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-.:".contains(&b))
    })
}
fn failure(
    _action: FastRouterAction,
    status: Option<u16>,
    request_id: Option<String>,
    code: Option<String>,
) -> FastRouterActionFailure {
    FastRouterActionFailure {
        timed_out: false,
        http_status: status,
        request_id: correlation(request_id),
        error_code: correlation(code),
        may_have_executed: true,
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Envelope {
    response_metadata: Metadata,
    #[serde(default)]
    result: Option<Value>,
    #[serde(default)]
    error: Option<Value>,
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Metadata {
    action: String,
    version: String,
    #[serde(default)]
    request_id: Option<String>,
    #[serde(default)]
    error: Option<ErrorCode>,
}
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ErrorCode {
    #[serde(default)]
    code: Option<String>,
}
const MAX_JSON_DEPTH: usize = 64;

fn parse_response(
    action: FastRouterAction,
    status: StatusCode,
    body: &[u8],
    secret: &str,
) -> Result<FastRouterActionResponse, FastRouterActionError> {
    let unique = serde_json::from_slice::<UniqueValue>(body).map(|v| v.0);
    let has_escapes = body.contains(&b'\\');
    let unique = unique.and_then(|value| {
        if has_escapes && contains_secret(&value, secret, 0) {
            return Err(<serde_json::Error as serde::de::Error>::custom(
                "private credential echo",
            ));
        }
        Ok(value)
    });
    let envelope = unique.and_then(serde_json::from_value::<Envelope>);
    let envelope = match envelope {
        Ok(value) => value,
        Err(_) => {
            return Err(if status.is_success() {
                FastRouterActionError::InvalidResponse(failure(
                    action,
                    Some(status.as_u16()),
                    None,
                    None,
                ))
            } else {
                FastRouterActionError::UpstreamRejected(failure(
                    action,
                    Some(status.as_u16()),
                    None,
                    None,
                ))
            });
        }
    };
    let metadata = envelope.response_metadata;
    if metadata.action != action.as_str() || metadata.version != VERSION {
        return Err(FastRouterActionError::InvalidResponse(failure(
            action,
            Some(status.as_u16()),
            None,
            None,
        )));
    }
    if !status.is_success() || metadata.error.is_some() || envelope.error.is_some() {
        return Err(FastRouterActionError::UpstreamRejected(failure(
            action,
            Some(status.as_u16()),
            metadata.request_id,
            metadata.error.and_then(|e| e.code),
        )));
    }
    let result = envelope.result.filter(Value::is_object).ok_or_else(|| {
        FastRouterActionError::InvalidResponse(failure(
            action,
            Some(status.as_u16()),
            metadata.request_id.clone(),
            None,
        ))
    })?;
    // No Service/Region fields or ID prefixes are fabricated. In particular,
    // HTTP 200 alone says nothing about asset Active or face verification.
    Ok(FastRouterActionResponse {
        action,
        http_status: status.as_u16(),
        request_id: correlation(metadata.request_id),
        result,
    })
}
// Check decoded strings too: JSON Unicode escapes must not bypass the private
// credential-echo guard. Neither values nor property names may disclose it.
fn contains_secret(value: &Value, secret: &str, depth: usize) -> bool {
    if depth > MAX_JSON_DEPTH {
        return true;
    }
    match value {
        Value::String(text) => text.contains(secret),
        Value::Array(items) => items
            .iter()
            .any(|item| contains_secret(item, secret, depth + 1)),
        Value::Object(items) => items
            .iter()
            .any(|(key, value)| key.contains(secret) || contains_secret(value, secret, depth + 1)),
        _ => false,
    }
}

/// Reject duplicate keys at every depth before typed identity/error decoding.
struct UniqueValue(Value);

struct UniqueValueSeed {
    depth: usize,
}

impl<'de> serde::de::DeserializeSeed<'de> for UniqueValueSeed {
    type Value = Value;

    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<Self::Value, D::Error> {
        if self.depth > MAX_JSON_DEPTH {
            return Err(serde::de::Error::custom("JSON nesting depth exceeded"));
        }
        struct UniqueVisitor {
            depth: usize,
        }
        impl<'de> Visitor<'de> for UniqueVisitor {
            type Value = Value;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("unique-key JSON")
            }
            fn visit_bool<E: serde::de::Error>(self, v: bool) -> Result<Self::Value, E> {
                Ok(Value::Bool(v))
            }
            fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<Self::Value, E> {
                Ok(Value::from(v))
            }
            fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<Self::Value, E> {
                Ok(Value::from(v))
            }
            fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<Self::Value, E> {
                serde_json::Number::from_f64(v)
                    .map(Value::Number)
                    .ok_or_else(|| E::custom("invalid number"))
            }
            fn visit_str<E: serde::de::Error>(self, v: &str) -> Result<Self::Value, E> {
                Ok(Value::String(v.to_owned()))
            }
            fn visit_string<E: serde::de::Error>(self, v: String) -> Result<Self::Value, E> {
                Ok(Value::String(v))
            }
            fn visit_none<E: serde::de::Error>(self) -> Result<Self::Value, E> {
                Ok(Value::Null)
            }
            fn visit_unit<E: serde::de::Error>(self) -> Result<Self::Value, E> {
                Ok(Value::Null)
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut input: A) -> Result<Self::Value, A::Error> {
                let mut v = Vec::new();
                while let Some(item) = input.next_element_seed(UniqueValueSeed {
                    depth: self.depth + 1,
                })? {
                    v.push(item);
                }
                Ok(Value::Array(v))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut input: A) -> Result<Self::Value, A::Error> {
                let mut v = Map::new();
                while let Some((key, value)) = input.next_entry_seed(
                    std::marker::PhantomData::<String>,
                    UniqueValueSeed {
                        depth: self.depth + 1,
                    },
                )? {
                    if v.insert(key, value).is_some() {
                        return Err(serde::de::Error::custom("duplicate JSON field"));
                    }
                }
                Ok(Value::Object(v))
            }
        }
        deserializer.deserialize_any(UniqueVisitor { depth: self.depth })
    }
}

impl<'de> Deserialize<'de> for UniqueValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        serde::de::DeserializeSeed::deserialize(UniqueValueSeed { depth: 0 }, deserializer)
            .map(UniqueValue)
    }
}
