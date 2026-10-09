use image::{DynamicImage, ImageFormat};
use niu_media::image_input::{DecodeError, DecodeLimits, decode};
use std::io::Cursor;

fn limits() -> DecodeLimits {
    DecodeLimits {
        maximum_encoded_bytes: 4096,
        maximum_width: 32,
        maximum_height: 32,
        maximum_decoded_bytes: 4096,
    }
}
fn encoded(format: ImageFormat, width: u32, height: u32) -> Vec<u8> {
    let mut result = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(width, height)
        .write_to(&mut result, format)
        .unwrap();
    result.into_inner()
}
fn error(bytes: &[u8], mime: &str, limits: DecodeLimits) -> DecodeError {
    decode(bytes, mime, limits).err().expect("must reject")
}

#[test]
fn decodes_supported_formats_without_guessing_the_mime() {
    for (format, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::Jpeg, "image/jpeg"),
        (ImageFormat::WebP, "image/webp"),
    ] {
        let bytes = encoded(format, 8, 4);
        let image = decode(&bytes, mime, limits()).unwrap();
        assert_eq!((image.width(), image.height()), (8, 4));
        assert!(!image.pixels().as_bytes().is_empty());
        let wrong = if mime == "image/png" {
            "image/jpeg"
        } else {
            "image/png"
        };
        assert_eq!(error(&bytes, wrong, limits()), DecodeError::InvalidImage);
    }
}

#[test]
fn limits_encoded_size_dimensions_and_decoded_buffer() {
    let bytes = encoded(ImageFormat::Png, 8, 4);
    let mut cap = limits();
    cap.maximum_encoded_bytes = bytes.len() - 1;
    assert_eq!(error(&bytes, "image/png", cap), DecodeError::TooLarge);
    cap = limits();
    cap.maximum_width = 7;
    assert_eq!(error(&bytes, "image/png", cap), DecodeError::TooLarge);
    cap = limits();
    cap.maximum_height = 3;
    assert_eq!(error(&bytes, "image/png", cap), DecodeError::TooLarge);
    cap = limits();
    cap.maximum_decoded_bytes = 95; // 8 × 4 × RGB needs 96 bytes.
    assert_eq!(error(&bytes, "image/png", cap), DecodeError::TooLarge);
}

#[test]
fn headers_do_not_establish_decodability_and_errors_exclude_contents() {
    let bytes = encoded(ImageFormat::Png, 8, 4);
    assert_eq!(
        error(&bytes[..33], "image/png", limits()),
        DecodeError::InvalidImage
    );
    for bytes in [b"private-image-data".as_slice(), b""] {
        let failure = error(bytes, "image/png", limits());
        assert_eq!(failure, DecodeError::InvalidImage);
        assert!(!format!("{failure:?}").contains("private-image-data"));
    }
    assert_eq!(
        error(b"<svg/>", "image/svg+xml", limits()),
        DecodeError::UnsupportedType
    );
    assert_eq!(
        error(&bytes, "image/png; charset=utf-8", limits()),
        DecodeError::UnsupportedType
    );
}

#[test]
fn invalid_or_excessive_configuration_cannot_disable_limits() {
    let bytes = encoded(ImageFormat::Png, 1, 1);
    for cap in [
        DecodeLimits {
            maximum_encoded_bytes: 0,
            ..limits()
        },
        DecodeLimits {
            maximum_encoded_bytes: usize::MAX,
            ..limits()
        },
        DecodeLimits {
            maximum_width: 0,
            ..limits()
        },
        DecodeLimits {
            maximum_height: u32::MAX,
            ..limits()
        },
        DecodeLimits {
            maximum_decoded_bytes: 0,
            ..limits()
        },
        DecodeLimits {
            maximum_decoded_bytes: u64::MAX,
            ..limits()
        },
    ] {
        assert_eq!(error(&bytes, "image/png", cap), DecodeError::InvalidLimits);
    }
}

#[test]
fn animated_containers_cannot_pass_as_an_inspected_first_frame() {
    let png = encoded(ImageFormat::Png, 8, 4);
    // A complete acTL chunk before the static image data: rejected independently
    // of whether the remaining animation is valid.
    let mut animated = png[..33].to_vec();
    animated.extend_from_slice(&[0, 0, 0, 8]);
    animated.extend_from_slice(b"acTL");
    animated.extend_from_slice(&[0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    animated.extend_from_slice(&png[33..]);
    assert_eq!(
        error(&animated, "image/png", limits()),
        DecodeError::AnimationUnsupported
    );

    let webp = encoded(ImageFormat::WebP, 8, 4);
    let mut animated = webp[..12].to_vec();
    animated.extend_from_slice(b"VP8X");
    animated.extend_from_slice(&10u32.to_le_bytes());
    animated.push(2); // Animation flag.
    animated.extend_from_slice(&[0; 9]);
    animated.extend_from_slice(b"ANIM");
    animated.extend_from_slice(&6u32.to_le_bytes());
    animated.extend_from_slice(&[0; 6]);
    animated.extend_from_slice(&webp[12..]);
    let length = (animated.len() - 8) as u32;
    animated[4..8].copy_from_slice(&length.to_le_bytes());
    assert_eq!(
        error(&animated, "image/webp", limits()),
        DecodeError::AnimationUnsupported
    );
}

#[test]
fn rejects_trailing_and_truncated_container_data() {
    for (format, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::WebP, "image/webp"),
    ] {
        let bytes = encoded(format, 8, 4);
        let mut trailing = bytes.clone();
        trailing.extend_from_slice(b"private-trailing-data");
        assert_eq!(error(&trailing, mime, limits()), DecodeError::InvalidImage);
        assert_eq!(
            error(&bytes[..bytes.len() - 1], mime, limits()),
            DecodeError::InvalidImage
        );
    }
}

#[tokio::test]
async fn remote_image_rejects_unsafe_destinations_and_releases_capacity() {
    use niu_media::image_input::{DecodeService, RemoteImageError};
    use niu_media::result::ResultError;
    let service = DecodeService::new(limits(), 1).unwrap();
    for endpoint in [
        "http://fixture.example/image.png",
        "https://127.0.0.1/image.png",
        "https://user:private@fixture.example/image.png",
        "https://localhost/image.png",
    ] {
        assert_eq!(
            service
                .fetch(endpoint, std::time::Duration::from_secs(1))
                .await
                .err(),
            Some(RemoteImageError::Transport(ResultError::EndpointRejected))
        );
    }
    let bytes = encoded(ImageFormat::Png, 8, 4);
    let retained = service.decode(&bytes, "image/png").await.unwrap();
    assert_eq!(
        service
            .fetch(
                "https://fixture.example/image.png",
                std::time::Duration::from_secs(1)
            )
            .await
            .err(),
        Some(RemoteImageError::Decode(DecodeError::Busy))
    );
    drop(retained);
    assert!(service.decode(&bytes, "image/png").await.is_ok());
}

#[test]
fn inline_reference_is_bound_to_the_decoded_bytes_not_a_mutable_source() {
    use base64::Engine;
    for (format, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::Jpeg, "image/jpeg"),
        (ImageFormat::WebP, "image/webp"),
    ] {
        let mut source = encoded(format, 8, 4);
        let original = source.clone();
        let decoded = decode(&source, mime, limits()).unwrap();
        source.fill(0);
        assert_eq!(decoded.encoded_bytes(), original);
        let reference = decoded.inline_reference(4096).unwrap();
        let (prefix, body) = reference.split_once(',').unwrap();
        assert_eq!(prefix, format!("data:{mime};base64"));
        let forwarded = base64::engine::general_purpose::STANDARD
            .decode(body)
            .unwrap();
        assert_eq!(forwarded, original);
        let roundtrip = decode(&forwarded, mime, limits()).unwrap();
        assert_eq!(roundtrip.pixels().as_bytes(), decoded.pixels().as_bytes());
    }
}

#[test]
fn jpeg_decoder_cannot_accept_a_reference_outside_the_request_format_boundary() {
    let bytes = encoded(ImageFormat::Jpeg, 2, 2);
    assert!(decode(&bytes, "image/jpeg", limits()).is_ok());
    assert_eq!(
        error(&bytes[..bytes.len() - 2], "image/jpeg", limits()),
        DecodeError::InvalidImage
    );
    let mut trailing = bytes.clone();
    trailing.extend_from_slice(b"private-trailing-data");
    assert_eq!(
        error(&trailing, "image/jpeg", limits()),
        DecodeError::InvalidImage
    );
}

#[test]
fn inline_reference_checks_exact_encoded_length_before_allocating() {
    let bytes = encoded(ImageFormat::Png, 2, 2);
    let image = decode(&bytes, "image/png", limits()).unwrap();
    let reference = image.inline_reference(4096).unwrap();
    assert_eq!(image.inline_reference(reference.len()).unwrap(), reference);
    assert_eq!(
        image.inline_reference(reference.len() - 1).err(),
        Some(DecodeError::TooLarge)
    );
    assert_eq!(image.inline_reference(0).err(), Some(DecodeError::TooLarge));
}

#[test]
fn concatenated_jpegs_are_not_inspected_as_one_image() {
    let bytes = encoded(ImageFormat::Jpeg, 2, 2);
    let mut concatenated = bytes.clone();
    concatenated.extend_from_slice(&bytes);
    assert_eq!(
        error(&concatenated, "image/jpeg", limits()),
        DecodeError::InvalidImage
    );
    let mut extra = bytes.clone();
    extra.extend_from_slice(&[0, 1, 2, 0xff, 0xd9]);
    assert_eq!(
        error(&extra, "image/jpeg", limits()),
        DecodeError::InvalidImage
    );
    assert!(decode(&bytes, "image/jpeg", limits()).is_ok());
}

#[tokio::test]
async fn inline_admission_retains_shared_capacity_and_exact_bytes() {
    use base64::Engine;
    use niu_media::image_input::DecodeService;
    let service = DecodeService::new(limits(), 1).unwrap();
    for (format, mime) in [
        (ImageFormat::Png, "image/png"),
        (ImageFormat::Jpeg, "image/jpeg"),
        (ImageFormat::WebP, "image/webp"),
    ] {
        let bytes = encoded(format, 2, 2);
        let reference = format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&bytes)
        );
        let image = service.decode_inline(&reference).await.unwrap();
        assert_eq!(image.encoded_bytes(), bytes);
        assert_eq!(image.inline_reference(4096).unwrap(), reference);
        assert_eq!(
            service.decode(&bytes, mime).await.err(),
            Some(DecodeError::Busy)
        );
        assert_eq!(
            service.decode_inline(&reference).await.err(),
            Some(DecodeError::Busy)
        );
        drop(image);
        assert!(service.decode_inline(&reference).await.is_ok());
    }
}

#[tokio::test]
async fn inline_admission_rejects_oversize_encoding_mime_and_corrupt_pixels() {
    use base64::Engine;
    use niu_media::image_input::DecodeService;
    let service = DecodeService::new(limits(), 1).unwrap();
    for reference in [
        "data:image/png;base64,",
        "data:image/png;base64,%%%",
        "data:image/png;base64,cHJpdmF0ZQ==",
    ] {
        assert_eq!(
            service.decode_inline(reference).await.err(),
            Some(DecodeError::InvalidImage)
        );
    }
    for reference in [
        "https://example.test/image.png",
        "data:image/svg+xml;base64,AA==",
        "data:image/png;charset=utf-8;base64,AA==",
    ] {
        assert_eq!(
            service.decode_inline(reference).await.err(),
            Some(if reference.contains(',') {
                DecodeError::UnsupportedType
            } else {
                DecodeError::InvalidImage
            })
        );
    }
    let oversized = format!("data:image/png;base64,{}", "A".repeat(6000));
    assert_eq!(
        service.decode_inline(&oversized).await.err(),
        Some(DecodeError::TooLarge)
    );
    let bytes = encoded(ImageFormat::Png, 2, 2);
    let reference = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    );
    let exact = DecodeService::new(
        DecodeLimits {
            maximum_encoded_bytes: bytes.len(),
            ..limits()
        },
        1,
    )
    .unwrap();
    assert!(exact.decode_inline(&reference).await.is_ok());
    let short = DecodeService::new(
        DecodeLimits {
            maximum_encoded_bytes: bytes.len() - 1,
            ..limits()
        },
        1,
    )
    .unwrap();
    assert_eq!(
        short.decode_inline(&reference).await.err(),
        Some(DecodeError::TooLarge)
    );
    // Invalid calls must release capacity for the next valid image.
    assert!(service.decode_inline(&reference).await.is_ok());
}
