//! Immutable, content-free evidence for a checked pre-dispatch rejection.
//! Covers definitive request-rate denials for durable prepared attempts.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GatewayAdmissionDenialKind {
    KeyRequestRateDisabled,
    KeyRequestRateExceeded,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GatewayAdmissionDenial {
    pub kind: GatewayAdmissionDenialKind,
    pub http_status: u16,
    pub requested_key_name: String,
    pub key_name_source: String,
    pub recorded_at: String,
}

