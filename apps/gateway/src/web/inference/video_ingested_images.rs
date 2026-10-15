//! Strict Niu references and private Ark substitutions for ingested images.
//! Preserve the original Niu request for logs; neither placeholders nor resolved
//! Provider URIs may become customer-facing payloads or persistent grant claims.
use crate::{error::ApiError, state::AppState};
use niu_storage::{
    GuardrailSnapshot, IngestedImageReference, IngestedImageReferenceResolution,
    IngestedImageReferenceUnavailable, IngestedImageReuse, IngestedImageRoute, Principal,
    VendorRoute,
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReferenceInput {
    ingestion_id: Uuid,
    readiness_id: Uuid,
    consent_to_reuse: bool,
}

struct PreparedImage {
    position: usize,
    input: IngestedImageReuse,
}
/// Internal admission copy, not a saved request or a trusted Provider result.
pub(super) struct PreparedIngestedImages {
    body: Value,
    images: Vec<PreparedImage>,
}
impl PreparedIngestedImages {
    pub(super) fn admission_body(&self) -> &Value {
        &self.body
    }
    pub(super) fn has_references(&self) -> bool {
        !self.images.is_empty()
    }
    pub(super) fn trusted_placeholders(&self) -> Vec<(usize, &str)> {
        self.images
            .iter()
            .map(|image| {
                (
                    image.position,
                    self.body["content"][image.position]["image_url"]["url"]
                        .as_str()
                        .unwrap_or_default(),
                )
            })
            .collect()
    }
}
/// Only storage can construct the private reference after current checks.
pub(super) struct ResolvedIngestedImage {
    pub(super) position: usize,
    pub(super) input: IngestedImageReuse,
    pub(super) reference: IngestedImageReference,
}
pub(super) struct ResolvedIngestedImages {
    pub(super) request: niu_media::ValidatedVideoRequest,
    pub(super) images: Vec<ResolvedIngestedImage>,
}

fn placeholder(position: usize) -> String {
    format!("asset://asset-pending-{position}")
}
fn invalid() -> ApiError {
    ApiError::invalid_request("Invalid ingested image reference")
}

/// Parse every Niu reference before any resolution or admission. Unknown fields,
/// missing/false consent, null role and arbitrary client asset URIs never become
/// a trusted replacement. Ordinary blocks are unchanged for normal validation.
pub(super) fn prepare(body: &Value) -> Result<PreparedIngestedImages, ApiError> {
    let mut prepared = body.clone();
    let items = prepared
        .get_mut("content")
        .and_then(Value::as_array_mut)
        .ok_or_else(invalid)?;
    let mut images = Vec::new();
    for (position, item) in items.iter_mut().enumerate() {
        if item.get("type").and_then(Value::as_str) != Some("ingested_image") {
            continue;
        }
        let fields = item.as_object().ok_or_else(invalid)?;
        if fields
            .keys()
            .any(|name| !matches!(name.as_str(), "type" | "ingested_image" | "role"))
        {
            return Err(invalid());
        }
        let role = match fields.get("role") {
            None => None,
            Some(Value::String(value)) if !value.is_empty() => Some(value.clone()),
            _ => return Err(invalid()),
        };
        let input: ReferenceInput =
            serde_json::from_value(fields.get("ingested_image").ok_or_else(invalid)?.clone())
                .map_err(|_| invalid())?;
        if !input.consent_to_reuse {
            return Err(invalid());
        }
        *item = json!({"type":"image_url","image_url":{"url":placeholder(position)}});
        if let Some(role) = role {
            item["role"] = json!(role);
        }
        images.push(PreparedImage {
            position,
            input: IngestedImageReuse {
                ingestion_id: input.ingestion_id,
                readiness_id: input.readiness_id,
                consent_to_reuse: true,
            },
        });
    }
    if !images.is_empty()
        && body["content"]
            .as_array()
            .is_some_and(|items| items.iter().any(|item| item["type"] == "image_url"))
    {
        return Err(ApiError::unsupported_message(
            "Combining inline images with ingested image references is not supported",
        ));
    }
    Ok(PreparedIngestedImages {
        body: prepared,
        images,
    })
}

/// Resolve only a selected direct Ark route, then validate exact private URIs
/// through the media library's trusted-reference entry point. No upload, polling
/// or external content inspection is initiated by this helper.
pub(super) async fn resolve(
    state: &AppState,
    principal: &Principal,
    snapshot: &GuardrailSnapshot,
    route: &VendorRoute,
    schema: &niu_media::VideoSchema,
    prepared: &PreparedIngestedImages,
) -> Result<ResolvedIngestedImages, ApiError> {
    if prepared.has_references() && schema.channel != "ark-direct-v1" {
        return Err(ApiError::unsupported_message(
            "This video channel does not support ingested image references",
        ));
    }
    if schema.model_alias != route.model.alias
        || schema.upstream_model != route.model.upstream_model
    {
        return Err(ApiError::unsupported_message(
            "The video schema does not match the selected model",
        ));
    }
    let selected = IngestedImageRoute {
        vendor_id: route.vendor.id,
        vendor_revision: route.vendor.revision,
        model_alias: &route.model.alias,
        model_revision: route.model.revision,
        channel: &schema.channel,
    };
    let detectors: Vec<_> = state
        .image_detectors
        .iter()
        .map(|(name, runtime)| (name.as_str(), runtime))
        .collect();
    let mut body = prepared.body.clone();
    let mut images = Vec::with_capacity(prepared.images.len());
    let reuse_inputs: Vec<IngestedImageReuse> = prepared
        .images
        .iter()
        .map(|image| IngestedImageReuse {
            ingestion_id: image.input.ingestion_id,
            readiness_id: image.input.readiness_id,
            consent_to_reuse: image.input.consent_to_reuse,
        })
        .collect();
    let resolutions = state
        .store
        .resolve_ingested_image_references(principal, snapshot, &reuse_inputs, &selected, &detectors)
        .await
        .map_err(ApiError::from_store)?;
    for (image, resolution) in prepared.images.iter().zip(resolutions) {
        let reference = match resolution {
            IngestedImageReferenceResolution::Available(reference) => reference,
            IngestedImageReferenceResolution::Unavailable(
                IngestedImageReferenceUnavailable::ConsentRequired,
            ) => return Err(invalid()),
            IngestedImageReferenceResolution::Unavailable(
                IngestedImageReferenceUnavailable::UnsupportedChannel,
            ) => {
                return Err(ApiError::unsupported_message(
                    "This video channel does not support ingested image references",
                ));
            }
            IngestedImageReferenceResolution::Unavailable(
                IngestedImageReferenceUnavailable::BindingUnavailable,
            ) => return Err(ApiError::not_found()),
        };
        body["content"][image.position]["image_url"]["url"] = json!(reference.private_uri());
        images.push(ResolvedIngestedImage {
            position: image.position,
            input: IngestedImageReuse {
                ingestion_id: image.input.ingestion_id,
                readiness_id: image.input.readiness_id,
                consent_to_reuse: true,
            },
            reference,
        });
    }
    let trusted: Vec<_> = images
        .iter()
        .map(|image| (image.position, image.reference.private_uri()))
        .collect();
    let bytes = serde_json::to_vec(&body).map_err(|_| invalid())?;
    let request = schema
        .validate_request_with_ingested_images(&bytes, &trusted)
        .map_err(|_| {
            ApiError::invalid_request("The request does not match this model's video schema")
        })?;
    Ok(ResolvedIngestedImages { request, images })
}
