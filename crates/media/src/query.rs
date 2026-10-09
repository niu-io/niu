//! Direct query-envelope decoding; adapters must separately qualify this shape.
use crate::{public_https, valid_name};
use serde_json::Value;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum QueryError {
    InvalidConfiguration,
    TooLarge,
    InvalidResponse,
    IdentityMismatch,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum QueryStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Unknown,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReportedQuantity {
    Missing,
    Invalid,
    Reported(u64),
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProviderTimes {
    Missing,
    Invalid,
    Reported { created_at: u64, updated_at: u64 },
}

/// Configuration is not evidence that a channel accepts the official envelope
/// or that its completion count has any particular billing unit.
pub struct DirectQueryProtocol {
    pub revision: String,
    pub meter: String,
    pub maximum_body_bytes: usize,
    pub maximum_url_bytes: usize,
}

/// Private upstream results intentionally have neither Debug nor Serialize.
pub struct QueryObservation {
    pub status: QueryStatus,
    pub quantity: ReportedQuantity,
    pub times: ProviderTimes,
    pub has_provider_error: bool,
    pub(crate) upstream_job: String,
    pub(crate) upstream_model: String,
    pub(crate) video_url: Option<String>,
    pub(crate) last_frame_url: Option<String>,
    pub(crate) protocol_revision: String,
    pub(crate) meter: String,
}
impl QueryObservation {
    /// Content-free durable evidence. Excludes private URLs, upstream identity,
    /// raw errors and response payloads. Provider times are not measured spans.
    pub fn metadata(&self) -> Value {
        let status = match self.status {
            QueryStatus::Queued => "queued",
            QueryStatus::Running => "running",
            QueryStatus::Succeeded => "succeeded",
            QueryStatus::Failed => "failed",
            QueryStatus::Unknown => "unknown",
        };
        let quantity = match self.quantity {
            ReportedQuantity::Missing => serde_json::json!({"state":"missing"}),
            ReportedQuantity::Invalid => serde_json::json!({"state":"invalid"}),
            ReportedQuantity::Reported(value) => {
                serde_json::json!({"state":"reported","value":value.to_string()})
            }
        };
        let times = match self.times {
            ProviderTimes::Missing => serde_json::json!({"state":"missing"}),
            ProviderTimes::Invalid => serde_json::json!({"state":"invalid"}),
            ProviderTimes::Reported {
                created_at,
                updated_at,
            } => {
                serde_json::json!({"state":"reported","created_at":created_at.to_string(),"updated_at":updated_at.to_string()})
            }
        };
        serde_json::json!({"version":1,"source":"query","protocol_revision":self.protocol_revision,"meter":self.meter,"status":status,"quantity":quantity,"provider_times":times})
    }

    pub fn upstream_job(&self) -> &str {
        &self.upstream_job
    }
    pub fn upstream_model(&self) -> &str {
        &self.upstream_model
    }
    pub fn video_url(&self) -> Option<&str> {
        self.video_url.as_deref()
    }
    pub fn last_frame_url(&self) -> Option<&str> {
        self.last_frame_url.as_deref()
    }
    pub fn protocol_revision(&self) -> &str {
        &self.protocol_revision
    }
    pub fn meter(&self) -> &str {
        &self.meter
    }
}

fn identity(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && value.trim() == value
        && !value.chars().any(char::is_control)
}
fn result_url(value: Option<&Value>, limit: usize) -> Result<Option<String>, QueryError> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) if s.is_empty() => Ok(None),
        Some(Value::String(s)) if public_https(s, limit) => Ok(Some(s.clone())),
        _ => Err(QueryError::InvalidResponse),
    }
}
impl DirectQueryProtocol {
    pub fn validate_configuration(
        &self,
        expected_job: &str,
        expected_model: &str,
    ) -> Result<(), QueryError> {
        if !valid_name(&self.revision)
            || !valid_name(&self.meter)
            || !identity(expected_job)
            || !identity(expected_model)
            || self.maximum_body_bytes == 0
            || self.maximum_body_bytes > 1024 * 1024
            || self.maximum_url_bytes == 0
            || self.maximum_url_bytes > 16384
        {
            return Err(QueryError::InvalidConfiguration);
        }
        Ok(())
    }

    pub fn decode(
        &self,
        body: &[u8],
        expected_job: &str,
        expected_model: &str,
    ) -> Result<QueryObservation, QueryError> {
        self.validate_configuration(expected_job, expected_model)?;
        if body.len() > self.maximum_body_bytes {
            return Err(QueryError::TooLarge);
        }
        let value: Value = serde_json::from_slice(body).map_err(|_| QueryError::InvalidResponse)?;
        let object = value.as_object().ok_or(QueryError::InvalidResponse)?;
        if object.get("id").and_then(Value::as_str) != Some(expected_job)
            || object.get("model").and_then(Value::as_str) != Some(expected_model)
        {
            return Err(QueryError::IdentityMismatch);
        }
        let status = match object
            .get("status")
            .and_then(Value::as_str)
            .ok_or(QueryError::InvalidResponse)?
        {
            "queued" => QueryStatus::Queued,
            "running" => QueryStatus::Running,
            "succeeded" => QueryStatus::Succeeded,
            "failed" => QueryStatus::Failed,
            // Cancellation is unqualified: never infer nonexecution or refund.
            _ => QueryStatus::Unknown,
        };
        let has_provider_error = match object.get("error") {
            None | Some(Value::Null) => false,
            Some(Value::Object(_)) => true,
            _ => return Err(QueryError::InvalidResponse),
        };
        if status == QueryStatus::Succeeded && has_provider_error {
            return Err(QueryError::InvalidResponse);
        }
        let quantity = if status != QueryStatus::Succeeded {
            ReportedQuantity::Missing
        } else {
            match object.get("usage") {
                None | Some(Value::Null) => ReportedQuantity::Missing,
                Some(Value::Object(usage)) => match usage.get("completion_tokens") {
                    None | Some(Value::Null) => ReportedQuantity::Missing,
                    Some(v) => v
                        .as_u64()
                        .map(ReportedQuantity::Reported)
                        .unwrap_or(ReportedQuantity::Invalid),
                },
                _ => ReportedQuantity::Invalid,
            }
        };
        let times = match (object.get("created_at"), object.get("updated_at")) {
            (None | Some(Value::Null), None | Some(Value::Null)) => ProviderTimes::Missing,
            (Some(created), Some(updated)) => match (created.as_u64(), updated.as_u64()) {
                (Some(created_at), Some(updated_at)) if updated_at >= created_at => {
                    ProviderTimes::Reported {
                        created_at,
                        updated_at,
                    }
                }
                _ => ProviderTimes::Invalid,
            },
            _ => ProviderTimes::Invalid,
        };
        let (video_url, last_frame_url) = match object.get("content") {
            None | Some(Value::Null) => (None, None),
            Some(Value::Object(content)) => (
                result_url(content.get("video_url"), self.maximum_url_bytes)?,
                result_url(content.get("last_frame_url"), self.maximum_url_bytes)?,
            ),
            _ => return Err(QueryError::InvalidResponse),
        };
        Ok(QueryObservation {
            upstream_job: expected_job.into(),
            upstream_model: expected_model.into(),
            status,
            quantity,
            times,
            has_provider_error,
            video_url: if status == QueryStatus::Succeeded {
                video_url
            } else {
                None
            },
            last_frame_url: if status == QueryStatus::Succeeded {
                last_frame_url
            } else {
                None
            },
            protocol_revision: self.revision.clone(),
            meter: self.meter.clone(),
        })
    }
}
