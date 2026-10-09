//! Customer-safe configured capabilities; discovery is not a price or admission guarantee.
use crate::{error::ApiError, state::AppState};
use axum::{Json, extract::State, http::HeaderMap};
use serde_json::{Value, json};

pub(in crate::web) async fn models(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    models_as(&state, &principal).await
}

pub(super) async fn models_as(
    state: &AppState,
    principal: &niu_storage::Principal,
) -> Result<Json<Value>, ApiError> {
    let scope = principal.scope();
    let snapshot = state
        .store
        .guardrail_snapshot(scope, principal.key_id())
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::forbidden)?;
    let mut data = Vec::new();
    for alias in crate::vendors::scoped_models(state, scope.organization_id)
        .await?
        .keys()
    {
        if !principal.allows_model(alias) {
            continue;
        }
        let personal = state
            .store
            .personal_vendor_route(scope.organization_id, alias)
            .await
            .map_err(ApiError::from_store)?;
        let owner_funded = personal.is_some();
        let route = if let Some(route) = personal {
            Some(route)
        } else {
            if !state
                .store
                .supplier_model_available(alias)
                .await
                .map_err(ApiError::from_store)?
            {
                continue;
            }
            state
                .store
                .vendor_route(alias)
                .await
                .map_err(ApiError::from_store)?
        };
        let Some(route) = route else {
            continue;
        };
        let text_permitted =
            super::video::policy_permits_video(&snapshot, alias, &route.vendor.adapter);
        let image_limits = super::video::policy_permits_video_with_images(
            &snapshot,
            alias,
            &route.vendor.adapter,
            true,
        )
        .then(|| super::video_images::discovery_limits(state, &snapshot, principal))
        .flatten();
        if !route.vendor.enabled
            || !route.model.enabled
            || (!text_permitted && image_limits.is_none())
        {
            continue;
        }
        if let Some(model) = projection_with_images(
            alias,
            &route.model.upstream_model,
            &route.model.capabilities,
            owner_funded,
            image_limits,
            text_permitted,
        ) {
            data.push(model);
        }
    }
    Ok(Json(json!({"object":"list","data":data})))
}

#[cfg(test)]
fn projection(
    alias: &str,
    upstream_model: &str,
    capabilities: &Value,
    owner_funded: bool,
) -> Option<Value> {
    projection_with_images(
        alias,
        upstream_model,
        capabilities,
        owner_funded,
        None,
        true,
    )
}

fn projection_with_images(
    alias: &str,
    upstream_model: &str,
    capabilities: &Value,
    owner_funded: bool,
    image_limits: Option<(usize, usize, u32, u32, u64)>,
    text_permitted: bool,
) -> Option<Value> {
    let schema: niu_media::VideoSchema =
        serde_json::from_value(capabilities.get("video_schema")?.clone()).ok()?;
    if schema.validate().is_err()
        || schema.model_alias != alias
        || schema.upstream_model != upstream_model
        || schema.channel != "ark-direct-v1"
        || schema.required_controls.iter().any(|v| v == "callback_url")
    {
        return None;
    }
    let text = schema.inputs.get("text")?;
    let output = schema.output.as_ref()?;
    if output.estimator.meter() != "video_tokens" {
        return None;
    }
    let mut controls = schema.controls.clone();
    controls.remove("callback_url");
    // A configured choice can exist without a qualified pixel mapping.
    for (name, resolution) in [("resolution", true), ("ratio", false)] {
        if let Some(niu_media::Control::Choice { values, .. }) = controls.get_mut(name) {
            values.retain(|value| {
                output.specifications.iter().any(|spec| {
                    value
                        == if resolution {
                            &spec.resolution
                        } else {
                            &spec.ratio
                        }
                })
            });
        }
    }
    let exclusive: Vec<Vec<String>> = schema
        .exclusive_controls
        .into_iter()
        .map(|group| {
            group
                .into_iter()
                .filter(|name| controls.contains_key(name))
                .collect::<Vec<_>>()
        })
        .filter(|group| group.len() > 1)
        .collect();
    let mut value = json!({
        "object":"video.model", "id":alias,
        "mode":if owner_funded {"owner_funded"} else {"customer"},
        "input_types":["text"],
        "text":{"maximum_items":text.maximum_items,"maximum_bytes":text.maximum_bytes},
        "maximum_body_bytes":schema.maximum_body_bytes,
        "maximum_content_items":schema.maximum_content_items,
        "controls":controls,"required_controls":schema.required_controls,
        "exclusive_controls":exclusive,
        "output":{"specifications":output.specifications,"meter":output.estimator.meter(),"estimator":output.estimator}
    });
    if let (Some(rule), Some((items, bytes, width, height, decoded))) =
        (schema.inputs.get("image_url"), image_limits)
    {
        let types: Vec<_> = rule
            .data_mime_types
            .iter()
            .filter(|mime| matches!(mime.as_str(), "image/png" | "image/jpeg" | "image/webp"))
            .collect();
        let count = rule
            .maximum_items
            .min(items)
            .min(schema.maximum_content_items.saturating_sub(1));
        if count > 0 && !types.is_empty() {
            value["input_types"] = json!(["text", "image_url"]);
            value["image_url"] = json!({"maximum_items":count,"maximum_bytes":rule.maximum_bytes.min(bytes),
                "https":false,"data_mime_types":types,"roles":rule.roles,"role_required":rule.role_required,
                "maximum_width":width,"maximum_height":height,"maximum_decoded_bytes":decoded,
                "requires_text":true});
            value["requires_image"] = json!(!text_permitted);
            return Some(value);
        }
    }
    text_permitted.then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn capabilities() -> Value {
        json!({"video_schema": {
            "version":1,"revision":"private-schema-revision","model_alias":"video","upstream_model":"private-upstream","channel":"ark-direct-v1",
            "maximum_body_bytes":4096,"maximum_content_items":2,
            "inputs":{"text":{"maximum_items":2,"maximum_bytes":1024,"https":false,"data_mime_types":[],"roles":[],"role_required":false},
                "image_url":{"maximum_items":1,"maximum_bytes":1024,"https":true,"data_mime_types":[],"roles":[],"role_required":false}},
            "controls":{"resolution":{"kind":"choice","values":["720p","1080p"],"default":"720p"},"ratio":{"kind":"choice","values":["16:9","1:1"],"default":"16:9"},
                "duration":{"kind":"integer","minimum":1,"maximum":10,"default":5},"frames_per_second":{"kind":"integer","minimum":24,"maximum":60,"default":24},
                "callback_url":{"kind":"https_url","maximum_bytes":1024}},
            "required_controls":[],"exclusive_controls":[],"callbacks_qualified":true,
            "output":{"specifications":[{"resolution":"720p","ratio":"16:9","width":1280,"height":720}],"estimator":"SeedancePixelsV1","estimator_revision":"private-estimator-revision"}
        }})
    }
    #[test]
    fn customer_projection_excludes_private_mapping_and_unimplemented_inputs() {
        let value = projection("video", "private-upstream", &capabilities(), false).unwrap();
        assert_eq!(value["input_types"], json!(["text"]));
        assert_eq!(value["controls"]["resolution"]["values"], json!(["720p"]));
        assert_eq!(value["controls"]["ratio"]["values"], json!(["16:9"]));
        assert!(value["controls"].get("callback_url").is_none());
        assert_eq!(value["text"]["maximum_items"], 2);
        assert_eq!(value["output"]["meter"], "video_tokens");
        for private in [
            "private-",
            "channel",
            "revision",
            "image_url",
            "amount_units",
        ] {
            assert!(!value.to_string().contains(private));
        }
    }
    #[test]
    fn inspected_image_projection_intersects_schema_and_decoder_limits() {
        let mut caps = capabilities();
        caps["video_schema"]["inputs"]["image_url"] = json!({"maximum_items":3,"maximum_bytes":2048,"https":true,
            "data_mime_types":["image/png","image/jpeg","image/webp","image/gif"],"roles":["first_frame","last_frame"],"role_required":true});
        caps["video_schema"]["maximum_content_items"] = json!(4);
        let value = projection_with_images(
            "video",
            "private-upstream",
            &caps,
            true,
            Some((2, 1024, 64, 32, 4096)),
            false,
        )
        .unwrap();
        assert_eq!(value["input_types"], json!(["text", "image_url"]));
        assert_eq!(value["image_url"]["maximum_items"], 2);
        assert_eq!(value["image_url"]["maximum_bytes"], 1024);
        assert_eq!(value["image_url"]["https"], false);
        assert_eq!(
            value["image_url"]["data_mime_types"],
            json!(["image/png", "image/jpeg", "image/webp"])
        );
        assert_eq!(
            value["image_url"]["roles"],
            json!(["first_frame", "last_frame"])
        );
        assert_eq!(value["image_url"]["role_required"], true);
        assert_eq!(value["image_url"]["requires_text"], true);
        assert_eq!(value["requires_image"], true);
        assert_eq!(value["image_url"]["maximum_width"], 64);
        assert_eq!(value["image_url"]["maximum_height"], 32);
        assert_eq!(value["image_url"]["maximum_decoded_bytes"], 4096);
        assert!(!value.to_string().contains("private-"));
        assert!(
            projection_with_images("video", "private-upstream", &caps, true, None, false).is_none()
        );
        caps["video_schema"]["inputs"]["image_url"]["data_mime_types"] = json!(["image/gif"]);
        assert!(
            projection_with_images(
                "video",
                "private-upstream",
                &caps,
                true,
                Some((2, 1024, 64, 32, 4096)),
                false
            )
            .is_none()
        );
    }

    #[test]
    fn discovery_omits_unimplemented_or_mismatched_contracts() {
        assert!(projection("other-alias", "private-upstream", &capabilities(), false).is_none());
        assert!(projection("video", "other-upstream", &capabilities(), false).is_none());
        for (field, value) in [
            ("channel", json!("unqualified-channel")),
            ("required_controls", json!(["callback_url"])),
        ] {
            let mut caps = capabilities();
            caps["video_schema"][field] = value;
            assert!(projection("video", "private-upstream", &caps, false).is_none());
        }
        let mut caps = capabilities();
        caps["video_schema"]["output"]["estimator"] = json!("OutputSecondsV1");
        assert!(projection("video", "private-upstream", &caps, false).is_none());
        caps["video_schema"]
            .as_object_mut()
            .unwrap()
            .remove("output");
        assert!(projection("video", "private-upstream", &caps, false).is_none());
        assert_eq!(
            projection("video", "private-upstream", &capabilities(), true).unwrap()["mode"],
            "owner_funded"
        );
    }
}
