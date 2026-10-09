use niu_media::{ValidationError, VideoSchema, output::OutputEstimator};
use niu_metered_cost::{Provenance, Quantity, Usage};
use serde_json::json;
fn schema() -> VideoSchema {
    serde_json::from_value(json!({"version":1,"revision":"output-schema-1","model_alias":"video-model","upstream_model":"upstream-model","channel":"qualified-fixture","maximum_body_bytes":4096,"maximum_content_items":1,"inputs":{"text":{"maximum_items":1,"maximum_bytes":1024,"https":false,"data_mime_types":[],"roles":[],"role_required":false}},"controls":{"resolution":{"kind":"choice","values":["720p","1080p"],"default":"720p"},"ratio":{"kind":"choice","values":["16:9","9:16"],"default":"16:9"},"duration":{"kind":"integer","minimum":1,"maximum":10,"default":5},"frames_per_second":{"kind":"integer","minimum":24,"maximum":60,"default":24}},"required_controls":[],"exclusive_controls":[],"callbacks_qualified":false,"output":{"specifications":[{"resolution":"720p","ratio":"16:9","width":1280,"height":720},{"resolution":"720p","ratio":"9:16","width":720,"height":1280}],"estimator":"SeedancePixelsV1","estimator_revision":"reviewed-formula-1"}})).unwrap()
}
fn request(extra: serde_json::Value) -> Vec<u8> {
    let mut value = json!({"model":"video-model","content":[{"type":"text","text":"A landscape"}]});
    value
        .as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());
    serde_json::to_vec(&value).unwrap()
}
#[test]
fn defaults_resolve_exact_effective_dimensions_and_estimate_without_claiming_actuals() {
    let configured = schema();
    configured.validate().unwrap();
    let validated = configured.validate_request(&request(json!({}))).unwrap();
    let output = validated.effective_output().unwrap();
    assert_eq!(
        (output.specification.width, output.specification.height),
        (1280, 720)
    );
    assert_eq!(output.duration_seconds, 5);
    assert_eq!(output.frames_per_second, Some(24));
    assert_eq!(output.schema_revision, "output-schema-1");
    assert_eq!(output.estimator_revision, "reviewed-formula-1");
    assert_eq!(
        output.estimate(Quantity::integer(0)).unwrap(),
        Usage::Known {
            meter: "video_tokens".into(),
            quantity: Quantity::integer(108000),
            provenance: Provenance::Estimate
        }
    );
    assert_eq!(
        output.estimate(Quantity::integer(2)).unwrap(),
        Usage::Known {
            meter: "video_tokens".into(),
            quantity: Quantity::integer(151200),
            provenance: Provenance::Estimate
        }
    );
    let restored: niu_media::output::EffectiveVideoOutput =
        serde_json::from_value(serde_json::to_value(output).unwrap()).unwrap();
    assert_eq!(restored, *output);
}
#[test]
fn explicit_controls_resolve_orientation_and_unmapped_combinations_fail() {
    let configured = schema();
    let validated = configured
        .validate_request(&request(
            json!({"ratio":"9:16","duration":10,"frames_per_second":60}),
        ))
        .unwrap();
    let output = validated.effective_output().unwrap();
    assert_eq!(
        (output.specification.width, output.specification.height),
        (720, 1280)
    );
    assert_eq!(output.duration_seconds, 10);
    assert_eq!(output.frames_per_second, Some(60));
    assert!(matches!(
        configured.validate_request(&request(json!({"resolution":"1080p"}))),
        Err(ValidationError::InvalidControl)
    ));
}
#[test]
fn duplicate_zero_or_unadvertised_mappings_and_unknown_estimator_are_rejected() {
    let mut configured = schema();
    let first = configured.output.as_ref().unwrap().specifications[0].clone();
    configured
        .output
        .as_mut()
        .unwrap()
        .specifications
        .push(first);
    assert_eq!(configured.validate(), Err(ValidationError::InvalidSchema));
    let mut configured = schema();
    configured.output.as_mut().unwrap().specifications[0].width = 0;
    assert_eq!(configured.validate(), Err(ValidationError::InvalidSchema));
    let mut configured = schema();
    configured.output.as_mut().unwrap().specifications[0].ratio = "4:3".into();
    assert_eq!(configured.validate(), Err(ValidationError::InvalidSchema));
    let mut value = serde_json::to_value(schema()).unwrap();
    value["output"]["estimator"] = json!("invented");
    assert!(serde_json::from_value::<VideoSchema>(value).is_err());
}
#[test]
fn seconds_meter_is_explicit_and_never_converts_reference_usage_silently() {
    let mut configured = schema();
    configured.output.as_mut().unwrap().estimator = OutputEstimator::OutputSecondsV1;
    let validated = configured.validate_request(&request(json!({}))).unwrap();
    let output = validated.effective_output().unwrap();
    assert_eq!(output.estimator.meter(), "seconds");
    assert_eq!(
        output.estimate(Quantity::integer(0)).unwrap(),
        Usage::Known {
            meter: "seconds".into(),
            quantity: Quantity::integer(5),
            provenance: Provenance::Estimate
        }
    );
    assert!(output.estimate(Quantity::integer(1)).is_err());
}
#[test]
fn output_schema_requires_positive_effective_controls_and_preserves_legacy_shape() {
    let mut value = serde_json::to_value(schema()).unwrap();
    value["controls"]["duration"]["minimum"] = json!(0);
    assert_eq!(
        serde_json::from_value::<VideoSchema>(value)
            .unwrap()
            .validate(),
        Err(ValidationError::InvalidSchema)
    );
    let mut value = serde_json::to_value(schema()).unwrap();
    value["controls"]["ratio"]
        .as_object_mut()
        .unwrap()
        .remove("default");
    assert_eq!(
        serde_json::from_value::<VideoSchema>(value)
            .unwrap()
            .validate(),
        Err(ValidationError::InvalidSchema)
    );
    let mut value = serde_json::to_value(schema()).unwrap();
    value.as_object_mut().unwrap().remove("output");
    let legacy: VideoSchema = serde_json::from_value(value).unwrap();
    legacy.validate().unwrap();
    assert!(
        legacy
            .validate_request(&request(json!({})))
            .unwrap()
            .effective_output()
            .is_none()
    );
    assert!(
        serde_json::to_value(legacy)
            .unwrap()
            .get("output")
            .is_none()
    );
}

#[test]
fn missing_default_mapping_and_invalid_restored_outputs_cannot_produce_estimates() {
    let mut configured = schema();
    configured.output.as_mut().unwrap().specifications.remove(0);
    assert_eq!(configured.validate(), Err(ValidationError::InvalidSchema));
    let configured = schema();
    let validated = configured.validate_request(&request(json!({}))).unwrap();
    let mut restored = validated.effective_output().unwrap().clone();
    restored.duration_seconds = 0;
    assert!(restored.estimate(Quantity::integer(0)).is_err());
}
