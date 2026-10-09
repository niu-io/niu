//! Configured video validation and bounded query transport; no entitlement.
pub mod asset_create;
pub mod asset_group;
pub mod asset_group_delete;
pub mod asset_group_update;
pub mod asset_list;
pub mod asset_lookup;
pub mod asset_read;
pub mod asset_signing;
pub mod asset_transport;
pub mod image_detector;
pub mod image_input;
pub mod image_inspection;
pub mod output;
pub mod query;
pub mod result;
pub mod submission;
pub mod transport;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use url::Url;

const CONTROLS: &[&str] = &[
    "duration",
    "resolution",
    "ratio",
    "seed",
    "watermark",
    "camera_fixed",
    "return_last_frame",
    "frames_per_second",
    "callback_url",
];
const INPUTS: &[&str] = &["text", "image_url", "video_url", "audio_url"];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ValidationError {
    InvalidSchema,
    BodyTooLarge,
    InvalidJson,
    ModelMismatch,
    UnsupportedParameter,
    InvalidControl,
    InvalidContent,
    IncompatibleControls,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Control {
    Integer {
        minimum: i64,
        maximum: i64,
        default: Option<i64>,
    },
    Choice {
        values: Vec<String>,
        default: Option<String>,
    },
    Boolean {
        default: Option<bool>,
    },
    HttpsUrl {
        maximum_bytes: usize,
    },
}

impl Control {
    fn default_value(&self) -> Option<Value> {
        match self {
            Self::Integer { default, .. } => default.map(Value::from),
            Self::Choice { default, .. } => default.clone().map(Value::from),
            Self::Boolean { default, .. } => default.map(Value::from),
            Self::HttpsUrl { .. } => None,
        }
    }
    fn accepts(&self, value: &Value) -> bool {
        match self {
            Self::Integer {
                minimum, maximum, ..
            } => value
                .as_i64()
                .is_some_and(|v| v >= *minimum && v <= *maximum),
            Self::Choice { values, .. } => value
                .as_str()
                .is_some_and(|v| values.iter().any(|item| item == v)),
            Self::Boolean { .. } => value.is_boolean(),
            Self::HttpsUrl { maximum_bytes } => value
                .as_str()
                .is_some_and(|v| public_https(v, *maximum_bytes)),
        }
    }
    fn valid(&self) -> bool {
        let valid = match self {
            Self::Integer {
                minimum, maximum, ..
            } => minimum <= maximum,
            Self::Choice { values, .. } => {
                !values.is_empty()
                    && values.len() <= 64
                    && values
                        .iter()
                        .enumerate()
                        .all(|(i, v)| valid_name(v) && !values[..i].contains(v))
            }
            Self::Boolean { .. } => true,
            Self::HttpsUrl { maximum_bytes } => (1..=8192).contains(maximum_bytes),
        };
        valid
            && self
                .default_value()
                .is_none_or(|value| self.accepts(&value))
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InputRule {
    pub maximum_items: usize,
    pub maximum_bytes: usize,
    pub https: bool,
    pub data_mime_types: Vec<String>,
    pub roles: Vec<String>,
    pub role_required: bool,
}

/// Every range/default is configuration for an exact model/channel, not a
/// universal Provider promise. Changing this schema requires new qualification.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VideoSchema {
    pub version: u8,
    pub revision: String,
    pub model_alias: String,
    pub upstream_model: String,
    pub channel: String,
    pub maximum_body_bytes: usize,
    pub maximum_content_items: usize,
    pub inputs: BTreeMap<String, InputRule>,
    pub controls: BTreeMap<String, Control>,
    pub required_controls: Vec<String>,
    pub exclusive_controls: Vec<[String; 2]>,
    pub callbacks_qualified: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<output::OutputSchema>,
}

fn valid_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.trim() == value
        && !value.chars().any(char::is_control)
}

/// Syntactic URL guard only. DNS, redirect and network policy remain a transport
/// obligation; the result transport applies those checks before downloading.
fn public_https(value: &str, maximum_bytes: usize) -> bool {
    if value.len() > maximum_bytes || value.trim() != value || value.chars().any(char::is_control) {
        return false;
    }
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return false;
    }
    match url.host() {
        Some(url::Host::Domain(host)) => {
            let host = host.trim_end_matches('.');
            host.contains('.')
                && host != "localhost"
                && !host.ends_with(".localhost")
                && !host.ends_with(".local")
        }
        // Literal addresses are unavailable until the transport qualifies them.
        _ => false,
    }
}

impl VideoSchema {
    pub fn validate(&self) -> Result<(), ValidationError> {
        if self.version != 1
            || [
                &self.revision,
                &self.model_alias,
                &self.upstream_model,
                &self.channel,
            ]
            .iter()
            .any(|v| !valid_name(v))
            || !(1..=16_777_216).contains(&self.maximum_body_bytes)
            || !(1..=32).contains(&self.maximum_content_items)
            || self.inputs.is_empty()
            || self.inputs.len() > 4
            || self.controls.len() > CONTROLS.len()
            || self.required_controls.len() > CONTROLS.len()
            || self.exclusive_controls.len() > 32
        {
            return Err(ValidationError::InvalidSchema);
        }
        for (kind, rule) in &self.inputs {
            if !INPUTS.contains(&kind.as_str())
                || rule.maximum_items == 0
                || rule.maximum_items > self.maximum_content_items
                || rule.maximum_bytes == 0
                || rule.maximum_bytes > self.maximum_body_bytes
                || rule.roles.len() > 16
                || rule
                    .roles
                    .iter()
                    .enumerate()
                    .any(|(i, v)| !valid_name(v) || rule.roles[..i].contains(v))
                || (rule.role_required && rule.roles.is_empty())
                || rule.data_mime_types.len() > 16
                || rule.data_mime_types.iter().enumerate().any(|(i, v)| {
                    !valid_name(v) || !v.contains('/') || rule.data_mime_types[..i].contains(v)
                })
                || (kind != "text" && !rule.https && rule.data_mime_types.is_empty())
            {
                return Err(ValidationError::InvalidSchema);
            }
        }
        for (name, rule) in &self.controls {
            let correct_type = matches!(
                (name.as_str(), rule),
                (
                    "duration" | "seed" | "frames_per_second",
                    Control::Integer { .. }
                ) | ("resolution" | "ratio", Control::Choice { .. })
                    | (
                        "watermark" | "camera_fixed" | "return_last_frame",
                        Control::Boolean { .. }
                    )
                    | ("callback_url", Control::HttpsUrl { .. })
            );
            if !CONTROLS.contains(&name.as_str())
                || !rule.valid()
                || !correct_type
                || (name == "callback_url"
                    && (!self.callbacks_qualified || !matches!(rule, Control::HttpsUrl { .. })))
                || (name != "callback_url" && matches!(rule, Control::HttpsUrl { .. }))
            {
                return Err(ValidationError::InvalidSchema);
            }
        }
        if self.required_controls.iter().enumerate().any(|(i, name)| {
            !self.controls.contains_key(name) || self.required_controls[..i].contains(name)
        }) || self.exclusive_controls.iter().any(|pair| {
            pair[0] == pair[1]
                || pair.iter().any(|name| !self.controls.contains_key(name))
                || pair.iter().all(|name| {
                    self.controls
                        .get(name)
                        .is_some_and(|rule| rule.default_value().is_some())
                })
        }) {
            return Err(ValidationError::InvalidSchema);
        }
        if let Some(output) = &self.output {
            output.validate(self)?;
        }
        Ok(())
    }

    pub fn validate_request(&self, bytes: &[u8]) -> Result<ValidatedVideoRequest, ValidationError> {
        self.validate()?;
        if bytes.len() > self.maximum_body_bytes {
            return Err(ValidationError::BodyTooLarge);
        }
        let value: Value =
            serde_json::from_slice(bytes).map_err(|_| ValidationError::InvalidJson)?;
        let Value::Object(mut body) = value else {
            return Err(ValidationError::InvalidJson);
        };
        if body.get("model").and_then(Value::as_str) != Some(self.model_alias.as_str()) {
            return Err(ValidationError::ModelMismatch);
        }
        if body
            .keys()
            .any(|key| key != "model" && key != "content" && !self.controls.contains_key(key))
        {
            return Err(ValidationError::UnsupportedParameter);
        }
        let content = body
            .get("content")
            .and_then(Value::as_array)
            .ok_or(ValidationError::InvalidContent)?;
        if content.is_empty() || content.len() > self.maximum_content_items {
            return Err(ValidationError::InvalidContent);
        }
        let mut counts = BTreeMap::<&str, usize>::new();
        for item in content {
            let item = item.as_object().ok_or(ValidationError::InvalidContent)?;
            let kind = item
                .get("type")
                .and_then(Value::as_str)
                .ok_or(ValidationError::InvalidContent)?;
            let rule = self
                .inputs
                .get(kind)
                .ok_or(ValidationError::InvalidContent)?;
            let count = counts.entry(kind).or_default();
            *count += 1;
            if *count > rule.maximum_items
                || item.keys().any(|key| {
                    key != "type"
                        && key != "role"
                        && key != if kind == "text" { "text" } else { kind }
                })
            {
                return Err(ValidationError::InvalidContent);
            }
            match item.get("role") {
                None if !rule.role_required => (),
                Some(Value::String(role)) if rule.roles.contains(role) => (),
                _ => return Err(ValidationError::InvalidContent),
            }
            if kind == "text" {
                let text = item
                    .get("text")
                    .and_then(Value::as_str)
                    .ok_or(ValidationError::InvalidContent)?;
                if text.trim().is_empty() || text.len() > rule.maximum_bytes {
                    return Err(ValidationError::InvalidContent);
                }
            } else {
                let reference = item
                    .get(kind)
                    .and_then(Value::as_object)
                    .ok_or(ValidationError::InvalidContent)?;
                if reference.len() != 1 {
                    return Err(ValidationError::InvalidContent);
                }
                let url = reference
                    .get("url")
                    .and_then(Value::as_str)
                    .ok_or(ValidationError::InvalidContent)?;
                if !(rule.https && public_https(url, rule.maximum_bytes))
                    && !valid_data_url(url, rule, kind)
                {
                    return Err(ValidationError::InvalidContent);
                }
            }
        }
        let mut effective = Map::new();
        for (name, rule) in &self.controls {
            let value = body.get(name).cloned().or_else(|| rule.default_value());
            if let Some(value) = value {
                if !rule.accepts(&value) {
                    return Err(ValidationError::InvalidControl);
                }
                effective.insert(name.clone(), value.clone());
                body.insert(name.clone(), value);
            }
        }
        if self
            .required_controls
            .iter()
            .any(|name| !effective.contains_key(name))
        {
            return Err(ValidationError::InvalidControl);
        }
        if self
            .exclusive_controls
            .iter()
            .any(|pair| pair.iter().all(|name| effective.contains_key(name)))
        {
            return Err(ValidationError::IncompatibleControls);
        }
        body.insert("model".into(), self.upstream_model.clone().into());
        if serde_json::to_vec(&body)
            .map_err(|_| ValidationError::InvalidJson)?
            .len()
            > self.maximum_body_bytes
        {
            return Err(ValidationError::BodyTooLarge);
        }
        let effective_output = self
            .output
            .as_ref()
            .map(|output| output.resolve(&effective, &self.revision))
            .transpose()?;
        Ok(ValidatedVideoRequest {
            body: Value::Object(body),
            model_alias: self.model_alias.clone(),
            effective_controls: effective,
            effective_output,
            schema_revision: self.revision.clone(),
        })
    }
}

fn valid_data_url(value: &str, rule: &InputRule, kind: &str) -> bool {
    if value.len() > rule.maximum_bytes.saturating_mul(4) / 3 + 1024 {
        return false;
    }
    let Some((header, encoded)) = value.split_once(',') else {
        return false;
    };
    let Some(mime) = header
        .strip_prefix("data:")
        .and_then(|v| v.strip_suffix(";base64"))
    else {
        return false;
    };
    if !rule.data_mime_types.iter().any(|v| v == mime) {
        return false;
    }
    base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .is_ok_and(|bytes| {
            !bytes.is_empty()
                && bytes.len() <= rule.maximum_bytes
                && (kind != "image_url" || inline_image_format(mime, &bytes))
        })
}

// Container header checks are not image decoding, content inspection or a
// qualification of remote media. Unknown inline image formats fail closed.
pub(crate) fn inline_image_format(mime: &str, bytes: &[u8]) -> bool {
    match mime {
        "image/png" => {
            bytes.len() >= 33
                && bytes.starts_with(b"\x89PNG\r\n\x1a\n")
                && bytes[8..12] == 13u32.to_be_bytes()
                && &bytes[12..16] == b"IHDR"
                && bytes[16..20] != [0; 4]
                && bytes[20..24] != [0; 4]
        }
        "image/jpeg" => {
            bytes.len() >= 4
                && bytes.starts_with(&[0xff, 0xd8, 0xff])
                && bytes.ends_with(&[0xff, 0xd9])
        }
        "image/webp" => {
            bytes.len() >= 20
                && bytes.starts_with(b"RIFF")
                && &bytes[8..12] == b"WEBP"
                && matches!(&bytes[12..16], b"VP8 " | b"VP8L" | b"VP8X")
                && u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize == bytes.len() - 8
        }
        _ => false,
    }
}

/// Contains user content; deliberately has no Debug implementation.
pub struct ValidatedVideoRequest {
    body: Value,
    model_alias: String,
    effective_controls: Map<String, Value>,
    effective_output: Option<output::EffectiveVideoOutput>,
    schema_revision: String,
}

impl ValidatedVideoRequest {
    pub fn model_alias(&self) -> &str {
        &self.model_alias
    }
    pub fn body(&self) -> &Value {
        &self.body
    }
    pub fn effective_controls(&self) -> &Map<String, Value> {
        &self.effective_controls
    }
    pub fn effective_output(&self) -> Option<&output::EffectiveVideoOutput> {
        self.effective_output.as_ref()
    }
    pub fn schema_revision(&self) -> &str {
        &self.schema_revision
    }
    pub fn into_body(self) -> Value {
        self.body
    }
}
