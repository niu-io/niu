//! Bounded raster-only deployment assets, re-encoded before persistence.
use crate::StoreError;
use base64::{Engine, engine::general_purpose::STANDARD};
use image::ImageFormat;
use std::io::Cursor;

pub(super) fn validate_reference(
    value: Option<&str>,
    maximum_bytes: usize,
) -> Result<(), StoreError> {
    let Some(value) = value else {
        return Ok(());
    };
    let encoded = value
        .strip_prefix("data:image/png;base64,")
        .ok_or(StoreError::InvalidObservation)?;
    if encoded.len() > maximum_bytes.div_ceil(3) * 4
        || encoded.is_empty()
        || !encoded
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'+' | b'/' | b'='))
    {
        return Err(StoreError::InvalidObservation);
    }
    Ok(())
}

pub(super) fn normalize(
    value: Option<String>,
    favicon: bool,
) -> Result<Option<String>, StoreError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let maximum_bytes = if favicon { 32768 } else { 262144 };
    validate_reference(Some(&value), maximum_bytes)?;
    let bytes = STANDARD
        .decode(&value[22..])
        .map_err(|_| StoreError::InvalidObservation)?;
    if bytes.len() > maximum_bytes {
        return Err(StoreError::InvalidObservation);
    }
    // The shared media decoder also rejects animated PNGs and trailing bytes.
    let decoded = niu_media::image_input::decode(
        &bytes,
        "image/png",
        niu_media::image_input::DecodeLimits {
            maximum_encoded_bytes: maximum_bytes,
            maximum_width: if favicon { 256 } else { 1024 },
            maximum_height: if favicon { 256 } else { 512 },
            maximum_decoded_bytes: 4 * 1024 * 1024,
        },
    )
    .map_err(|_| StoreError::InvalidObservation)?;
    if favicon && decoded.width() != decoded.height() {
        return Err(StoreError::InvalidObservation);
    }
    // Re-encode pixels, stripping metadata and any incidental container content.
    let mut output = Cursor::new(Vec::new());
    decoded
        .pixels()
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|_| StoreError::InvalidObservation)?;
    if output.get_ref().len() > maximum_bytes {
        return Err(StoreError::InvalidObservation);
    }
    Ok(Some(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(output.into_inner())
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn png(width: u32, height: u32) -> String {
        let mut output = Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(width, height)
            .write_to(&mut output, ImageFormat::Png)
            .unwrap();
        format!(
            "data:image/png;base64,{}",
            STANDARD.encode(output.into_inner())
        )
    }
    #[test]
    fn branding_images_are_bounded_raster_only_and_normalized() {
        let good = png(32, 32);
        assert!(normalize(Some(good), true).unwrap().is_some());
        assert!(normalize(None, false).unwrap().is_none());
        for value in [
            "https://example.org/logo.png",
            "data:image/svg+xml;base64,PHN2Zz4=",
            "data:image/png;base64,AAAA",
            "data:image/png;base64,💥",
        ] {
            assert!(normalize(Some(value.into()), false).is_err());
        }
        assert!(normalize(Some(png(257, 1)), true).is_err());
        assert!(normalize(Some(png(32, 16)), true).is_err());
        assert!(normalize(Some(png(1025, 1)), false).is_err());
        let normalized = normalize(Some(png(64, 32)), false).unwrap();
        assert_eq!(normalize(normalized.clone(), false).unwrap(), normalized);
    }
}
