use niu_media::*;
use serde_json::{Value, json};
use std::collections::BTreeMap;

fn schema() -> VideoSchema {
    let text = InputRule {
        maximum_items: 4,
        maximum_bytes: 256,
        https: false,
        data_mime_types: vec![],
        roles: vec![],
        role_required: false,
    };
    let image = InputRule {
        maximum_items: 1,
        maximum_bytes: 256,
        https: true,
        data_mime_types: vec!["image/png".into()],
        roles: vec![],
        role_required: false,
    };
    VideoSchema {
        output: None,
        version: 1,
        revision: "fixture-v1".into(),
        model_alias: "fixture-video".into(),
        upstream_model: "fixture-upstream".into(),
        channel: "fixture-channel".into(),
        maximum_body_bytes: 4096,
        maximum_content_items: 5,
        inputs: BTreeMap::from([("text".into(), text), ("image_url".into(), image)]),
        controls: BTreeMap::from([
            (
                "duration".into(),
                Control::Integer {
                    minimum: 1,
                    maximum: 10,
                    default: Some(5),
                },
            ),
            (
                "resolution".into(),
                Control::Choice {
                    values: vec!["720p".into()],
                    default: Some("720p".into()),
                },
            ),
            (
                "watermark".into(),
                Control::Boolean {
                    default: Some(false),
                },
            ),
        ]),
        required_controls: vec!["duration".into(), "resolution".into()],
        exclusive_controls: vec![],
        callbacks_qualified: false,
    }
}
fn request() -> Value {
    json!({"model":"fixture-video","content":[{"type":"text","text":"第一行 🌱\nsecond line"}]})
}
fn check(schema: &VideoSchema, value: &Value) -> Result<ValidatedVideoRequest, ValidationError> {
    schema.validate_request(&serde_json::to_vec(value).unwrap())
}

#[test]
fn qualified_mapping_defaults_unicode_and_content_order_are_preserved() {
    let schema = schema();
    let mut input = request();
    input["content"]
        .as_array_mut()
        .unwrap()
        .push(json!({"type":"text","text":"third"}));
    input["duration"] = 8.into();
    let output = check(&schema, &input).unwrap();
    assert_eq!(output.body()["model"], "fixture-upstream");
    assert_eq!(output.body()["content"], input["content"]);
    assert_eq!(output.body()["duration"], 8);
    assert_eq!(output.body()["watermark"], false);
    assert_eq!(output.effective_controls()["resolution"], "720p");
    assert_eq!(output.schema_revision(), "fixture-v1");
    let restored: VideoSchema =
        serde_json::from_value(serde_json::to_value(schema).unwrap()).unwrap();
    assert_eq!(check(&restored, &input).unwrap().body(), output.body());
}

#[test]
fn unsupported_fields_and_incompatible_control_types_are_rejected() {
    for (key, value) in [
        ("frames", json!(100)),
        ("callback_url", json!("https://example.test/callback")),
        ("api_key", json!("fixture")),
        ("frames_per_second", json!(24)),
    ] {
        let mut input = request();
        input[key] = value;
        assert!(matches!(
            check(&schema(), &input),
            Err(ValidationError::UnsupportedParameter)
        ));
    }
    for (key, value) in [
        ("duration", json!(0)),
        ("duration", json!(11)),
        ("duration", json!(5.5)),
        ("duration", json!("5")),
        ("resolution", json!("1080p")),
        ("watermark", json!(1)),
        ("watermark", Value::Null),
    ] {
        let mut input = request();
        input[key] = value;
        assert!(matches!(
            check(&schema(), &input),
            Err(ValidationError::InvalidControl)
        ));
    }
    let mut input = request();
    input["model"] = "other-model".into();
    assert!(matches!(
        check(&schema(), &input),
        Err(ValidationError::ModelMismatch)
    ));
}

#[test]
fn media_urls_roles_encoding_and_counts_follow_exact_schema() {
    for url in [
        "https://example.test/image.png",
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aot8AAAAASUVORK5CYII=",
    ] {
        let mut input = request();
        input["content"]
            .as_array_mut()
            .unwrap()
            .push(json!({"type":"image_url","image_url":{"url":url}}));
        assert!(check(&schema(), &input).is_ok());
    }
    for url in [
        "http://example.test/image.png",
        "https://127.0.0.1/a",
        "https://[::1]/a",
        "https://localhost/a",
        "https://localhost./a",
        "https://example.local./a",
        " https://example.test/a",
        "https://example.local/a",
        "https://user:password@example.test/a",
        "file:///etc/passwd",
        "data:image/jpeg;base64,AQID",
        "data:image/png;base64,AQID",
        "data:image/png;base64,PGh0bWw+cHJpdmF0ZTwvaHRtbD4=",
        "data:image/png;base64,iVBORw0KGgo=",
        "data:image/png;base64,!!!",
        "data:image/png;base64,",
    ] {
        let mut input = request();
        input["content"] = json!([{"type":"image_url","image_url":{"url":url}}]);
        assert!(matches!(
            check(&schema(), &input),
            Err(ValidationError::InvalidContent)
        ));
    }
    let mut input = request();
    input["content"] = json!([{"type":"image_url","image_url":{"url":"https://example.test/a"},"role":"first_frame"}]);
    assert!(check(&schema(), &input).is_err());
    let mut configured = schema();
    configured.inputs.get_mut("image_url").unwrap().roles = vec!["first_frame".into()];
    configured
        .inputs
        .get_mut("image_url")
        .unwrap()
        .role_required = true;
    assert!(check(&configured, &input).is_ok());
    input["content"][0].as_object_mut().unwrap().remove("role");
    assert!(check(&configured, &input).is_err());
    input["content"] = json!([{"type":"video_url","video_url":{"url":"https://example.test/a"}}]);
    assert!(check(&schema(), &input).is_err());
}

#[test]
fn invalid_schemas_cannot_silently_enable_options_or_defaults() {
    for case in 0..8 {
        let mut s = schema();
        match case {
            0 => s.version = 2,
            1 => s.maximum_body_bytes = 0,
            2 => {
                s.controls
                    .insert("seed".into(), Control::Boolean { default: None });
            }
            3 => {
                s.controls.insert(
                    "duration".into(),
                    Control::Integer {
                        minimum: 1,
                        maximum: 2,
                        default: Some(5),
                    },
                );
            }
            4 => s.required_controls.push("missing".into()),
            5 => s
                .exclusive_controls
                .push(["duration".into(), "resolution".into()]),
            6 => {
                s.controls.insert(
                    "callback_url".into(),
                    Control::HttpsUrl { maximum_bytes: 256 },
                );
            }
            _ => s.inputs.get_mut("text").unwrap().maximum_items = 0,
        }
        assert_eq!(s.validate(), Err(ValidationError::InvalidSchema));
    }
    let mut value = serde_json::to_value(schema()).unwrap();
    value["unknown"] = true.into();
    assert!(serde_json::from_value::<VideoSchema>(value).is_err());
}

#[test]
fn malformed_empty_oversized_and_extra_content_fields_fail() {
    for content in [
        json!([]),
        json!([{"type":"text","text":" "}]),
        json!([{"type":"text","text":"x".repeat(257)}]),
        json!([{"type":"text","text":"a","extra":true}]),
        json!([{"type":"image_url","image_url":{"url":"https://example.test/a","secret":"fixture"}}]),
    ] {
        let mut input = request();
        input["content"] = content;
        assert!(check(&schema(), &input).is_err());
    }
    let mut input = request();
    input["content"] = json!(vec![json!({"type":"text","text":"a"}); 5]);
    assert!(check(&schema(), &input).is_err());
    assert!(matches!(
        schema().validate_request(&[b' '; 4097]),
        Err(ValidationError::BodyTooLarge)
    ));
    assert!(matches!(
        schema().validate_request(b"{"),
        Err(ValidationError::InvalidJson)
    ));
}

#[test]
fn required_and_exclusive_controls_apply_to_effective_values() {
    let mut s = schema();
    s.controls.insert(
        "seed".into(),
        Control::Integer {
            minimum: -1,
            maximum: 99,
            default: None,
        },
    );
    s.required_controls.push("seed".into());
    assert!(check(&s, &request()).is_err());
    let mut input = request();
    input["seed"] = 42.into();
    assert!(check(&s, &input).is_ok());
    s.controls
        .insert("camera_fixed".into(), Control::Boolean { default: None });
    s.exclusive_controls
        .push(["seed".into(), "camera_fixed".into()]);
    input["camera_fixed"] = false.into();
    assert!(matches!(
        check(&s, &input),
        Err(ValidationError::IncompatibleControls)
    ));
}

#[test]
fn callback_requires_declared_qualification_and_valid_destination() {
    let mut s = schema();
    s.controls.insert(
        "callback_url".into(),
        Control::HttpsUrl { maximum_bytes: 256 },
    );
    assert_eq!(s.validate(), Err(ValidationError::InvalidSchema));
    s.callbacks_qualified = true;
    let mut input = request();
    input["callback_url"] = "https://example.test/callback".into();
    assert!(check(&s, &input).is_ok());
    input["callback_url"] = "http://example.test/callback".into();
    assert!(matches!(
        check(&s, &input),
        Err(ValidationError::InvalidControl)
    ));
    // This flag is configuration, not evidence of an authenticated live callback.
}

#[test]
fn inline_images_reject_mislabeled_formats_zero_dimensions_and_unsupported_types() {
    use base64::Engine;
    let mut configured = schema();
    configured
        .inputs
        .get_mut("image_url")
        .unwrap()
        .data_mime_types = vec![
        "image/png".into(),
        "image/jpeg".into(),
        "image/webp".into(),
        "image/svg+xml".into(),
    ];
    let png = base64::engine::general_purpose::STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aot8AAAAASUVORK5CYII=").unwrap();
    let mut zero_width = png.clone();
    zero_width[16..20].copy_from_slice(&[0; 4]);
    let mut bad_webp = b"RIFF\x00\x00\x00\x00WEBPVP8Xpayload".to_vec();
    bad_webp[4..8].copy_from_slice(&1u32.to_le_bytes());
    for (mime, bytes) in [
        ("image/jpeg", png),
        ("image/png", zero_width),
        ("image/webp", bad_webp),
        (
            "image/svg+xml",
            b"<svg xmlns='http://www.w3.org/2000/svg'/>".to_vec(),
        ),
    ] {
        let url = format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        );
        let mut input = request();
        input["content"] = json!([{"type":"image_url","image_url":{"url":url}}]);
        assert!(matches!(
            check(&configured, &input),
            Err(ValidationError::InvalidContent)
        ));
    }
}

#[test]
fn immutable_decoded_references_follow_request_mime_role_and_size_contracts() {
    use image::{DynamicImage, ImageFormat};
    use niu_media::image_input::{DecodeLimits, decode};
    use std::io::Cursor;
    let mut schema = schema();
    let rule = schema.inputs.get_mut("image_url").unwrap();
    rule.maximum_bytes = 2048;
    rule.data_mime_types = vec!["image/png".into(), "image/jpeg".into(), "image/webp".into()];
    rule.roles = vec!["first_frame".into()];
    rule.role_required = true;
    for (format, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::Jpeg, "image/jpeg"),
        (ImageFormat::WebP, "image/webp"),
    ] {
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::new_rgb8(2, 2)
            .write_to(&mut bytes, format)
            .unwrap();
        let image = decode(
            bytes.get_ref(),
            mime,
            DecodeLimits {
                maximum_encoded_bytes: 2048,
                maximum_width: 2,
                maximum_height: 2,
                maximum_decoded_bytes: 1024,
            },
        )
        .unwrap();
        let reference = image.inline_reference(4096).unwrap();
        let mut body = json!({"model":"fixture-video","content":[
            {"type":"text","text":"Keep this order"},
            {"type":"image_url","role":"first_frame","image_url":{"url":reference}}
        ]});
        let request = schema
            .validate_request(&serde_json::to_vec(&body).unwrap())
            .unwrap();
        assert_eq!(request.body()["content"], body["content"]);
        assert_eq!(request.body()["model"], "fixture-upstream");
        body["content"][1]["role"] = json!("unqualified_role");
        assert!(
            schema
                .validate_request(&serde_json::to_vec(&body).unwrap())
                .is_err()
        );
        body["content"][1]["role"] = json!("first_frame");
        let mut small = schema.clone();
        small.inputs.get_mut("image_url").unwrap().maximum_bytes = 1;
        assert!(
            small
                .validate_request(&serde_json::to_vec(&body).unwrap())
                .is_err()
        );
        let mut unsupported = schema.clone();
        unsupported
            .inputs
            .get_mut("image_url")
            .unwrap()
            .data_mime_types = vec!["image/svg+xml".into()];
        assert!(
            unsupported
                .validate_request(&serde_json::to_vec(&body).unwrap())
                .is_err()
        );
    }
}
