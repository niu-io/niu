//! Provider-specific media protocol and asset-management adapters.
//!
//! Core media validation, inspection, and transport primitives in `niu_media`
//! remain provider-agnostic; provider-specific endpoints, signing, and action
//! envelopes live under `niu_media::providers::<provider>`.

pub mod fastrouter;
pub mod openrouter;
pub mod volcengine;
