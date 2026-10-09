//! Image decoding prerequisite, separate from content inspection and dispatch.
//! Callers must provide bounded concurrency and run this synchronous work off
//! async executor threads. Decoder allocation limits are best effort; these
//! checks do not establish a hard process-memory or CPU-time guarantee.
use base64::Engine;
use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader, Limits};
use std::io::Cursor;
use std::sync::Arc;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

/// Application ceilings, not advertised model or Supplier limits.
#[derive(Clone, Copy)]
pub struct DecodeLimits {
    pub maximum_encoded_bytes: usize,
    pub maximum_width: u32,
    pub maximum_height: u32,
    pub maximum_decoded_bytes: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DecodeError {
    InvalidLimits,
    UnsupportedType,
    TooLarge,
    InvalidImage,
    Busy,
    WorkerFailed,
    AnimationUnsupported,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RemoteImageError {
    Decode(DecodeError),
    Transport(crate::result::ResultError),
}

/// Deliberately has no Debug/Serialize implementation: image data is private.
pub struct DecodedImage {
    pixels: DynamicImage,
    encoded: Vec<u8>,
    content_type: &'static str,
    // Retained pixels consume capacity until their consumer drops them.
    _permit: Option<OwnedSemaphorePermit>,
}
impl DecodedImage {
    pub fn width(&self) -> u32 {
        self.pixels.width()
    }
    pub fn height(&self) -> u32 {
        self.pixels.height()
    }
    pub fn pixels(&self) -> &DynamicImage {
        &self.pixels
    }
    /// Exact bytes associated with these decoded pixels. No mutable access.
    pub fn encoded_bytes(&self) -> &[u8] {
        &self.encoded
    }
    /// For a qualified inline-input contract after inspection approval. Never
    /// forward a mutable remote URL as a substitute for the inspected bytes.
    /// Callers must revalidate body limits, roles and current authorization.
    pub fn inline_reference(&self, maximum_bytes: usize) -> Result<String, DecodeError> {
        let encoded_length = self
            .encoded
            .len()
            .checked_add(2)
            .map(|value| value / 3)
            .and_then(|value| value.checked_mul(4))
            .and_then(|value| value.checked_add(self.content_type.len() + 13))
            .ok_or(DecodeError::TooLarge)?;
        if maximum_bytes == 0 || encoded_length > maximum_bytes {
            return Err(DecodeError::TooLarge);
        }
        Ok(format!(
            "data:{};base64,{}",
            self.content_type,
            base64::engine::general_purpose::STANDARD.encode(&self.encoded)
        ))
    }
}

/// Share one service across requests. No queued submissions or input copies are
/// created when capacity is exhausted. Cancellation does not stop a blocking
/// decoder; its permit remains held until the worker/result is dropped.
#[derive(Clone)]
pub struct DecodeService {
    limits: DecodeLimits,
    slots: Arc<Semaphore>,
}
impl DecodeService {
    /// Caller authorization and URL-processing consent must precede retrieval.
    /// Holds shared capacity across network retrieval, decoding and pixel use.
    pub async fn fetch(
        &self,
        endpoint: &str,
        timeout: std::time::Duration,
    ) -> Result<DecodedImage, RemoteImageError> {
        let permit = self
            .slots
            .clone()
            .try_acquire_owned()
            .map_err(|_| RemoteImageError::Decode(DecodeError::Busy))?;
        let media = crate::result::fetch_result(
            endpoint,
            crate::result::ResultKind::ReferenceImage,
            self.limits.maximum_encoded_bytes,
            timeout,
        )
        .await
        .map_err(RemoteImageError::Transport)?;
        let limits = self.limits;
        Self::run(permit, move || {
            decode(&media.bytes, media.content_type, limits)
        })
        .await
        .map_err(RemoteImageError::Decode)
    }

    pub fn new(limits: DecodeLimits, concurrency: usize) -> Result<Self, DecodeError> {
        validate_limits(limits)?;
        if !(1..=4).contains(&concurrency) {
            return Err(DecodeError::InvalidLimits);
        }
        Ok(Self {
            limits,
            slots: Arc::new(Semaphore::new(concurrency)),
        })
    }

    /// Admit only canonical Base64 PNG/JPEG/WebP data URIs. Capacity is acquired
    /// before copying or decoding the payload and remains held by the image.
    /// Successful decoding is not content-inspection approval.
    pub async fn decode_inline(&self, reference: &str) -> Result<DecodedImage, DecodeError> {
        let permit = self.reserve_inline(1)?.pop().ok_or(DecodeError::Busy)?;
        self.decode_inline_reserved(reference, permit).await
    }

    /// Reserve the whole request before any image is copied or disclosed.
    /// Partial acquisitions are dropped on failure; callers cannot queue an
    /// unbounded number of retained decoded images.
    pub(crate) fn reserve_inline(
        &self,
        count: usize,
    ) -> Result<Vec<OwnedSemaphorePermit>, DecodeError> {
        if !(1..=4).contains(&count) {
            return Err(DecodeError::Busy);
        }
        (0..count)
            .map(|_| {
                self.slots
                    .clone()
                    .try_acquire_owned()
                    .map_err(|_| DecodeError::Busy)
            })
            .collect()
    }

    pub(crate) async fn decode_inline_reserved(
        &self,
        reference: &str,
        permit: OwnedSemaphorePermit,
    ) -> Result<DecodedImage, DecodeError> {
        let maximum_base64 = self.limits.maximum_encoded_bytes.div_ceil(3) * 4;
        if reference.len() > maximum_base64 + 23 {
            return Err(DecodeError::TooLarge);
        }
        let (header, payload) = reference.split_once(',').ok_or(DecodeError::InvalidImage)?;
        let mime = match header {
            "data:image/png;base64" => "image/png",
            "data:image/jpeg;base64" => "image/jpeg",
            "data:image/webp;base64" => "image/webp",
            _ => return Err(DecodeError::UnsupportedType),
        };
        if payload.is_empty() {
            return Err(DecodeError::InvalidImage);
        }
        if payload.len() > maximum_base64 {
            return Err(DecodeError::TooLarge);
        }
        let payload = payload.to_owned();
        let limits = self.limits;
        Self::run(permit, move || {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(payload)
                .map_err(|_| DecodeError::InvalidImage)?;
            decode(&bytes, mime, limits)
        })
        .await
    }

    pub async fn decode(&self, bytes: &[u8], mime: &str) -> Result<DecodedImage, DecodeError> {
        preflight(bytes, mime, self.limits)?;
        let permit = self
            .slots
            .clone()
            .try_acquire_owned()
            .map_err(|_| DecodeError::Busy)?;
        let bytes = bytes.to_vec();
        let mime = mime.to_owned();
        let limits = self.limits;
        Self::run(permit, move || decode(&bytes, &mime, limits)).await
    }

    async fn run(
        permit: OwnedSemaphorePermit,
        work: impl FnOnce() -> Result<DecodedImage, DecodeError> + Send + 'static,
    ) -> Result<DecodedImage, DecodeError> {
        tokio::task::spawn_blocking(move || {
            let mut image = work()?;
            image._permit = Some(permit);
            Ok(image)
        })
        .await
        .map_err(|_| DecodeError::WorkerFailed)?
    }
}

fn validate_limits(limits: DecodeLimits) -> Result<(), DecodeError> {
    if !(1..=16 * 1024 * 1024).contains(&limits.maximum_encoded_bytes)
        || !(1..=16_384).contains(&limits.maximum_width)
        || !(1..=16_384).contains(&limits.maximum_height)
        || !(1..=256 * 1024 * 1024).contains(&limits.maximum_decoded_bytes)
    {
        return Err(DecodeError::InvalidLimits);
    }
    Ok(())
}

fn preflight(bytes: &[u8], mime: &str, limits: DecodeLimits) -> Result<ImageFormat, DecodeError> {
    validate_limits(limits)?;
    let format = match mime {
        "image/png" => ImageFormat::Png,
        "image/jpeg" => ImageFormat::Jpeg,
        "image/webp" => ImageFormat::WebP,
        _ => return Err(DecodeError::UnsupportedType),
    };
    if bytes.len() > limits.maximum_encoded_bytes {
        return Err(DecodeError::TooLarge);
    }
    if bytes.is_empty() {
        return Err(DecodeError::InvalidImage);
    }
    Ok(format)
}

pub fn decode(bytes: &[u8], mime: &str, limits: DecodeLimits) -> Result<DecodedImage, DecodeError> {
    let format = preflight(bytes, mime, limits)?;
    // Keep retained inline references within the same format boundary enforced
    // by request validation, even when a codec tolerates incomplete containers.
    if !crate::inline_image_format(mime, bytes) {
        return Err(DecodeError::InvalidImage);
    }
    static_container(bytes, format)?;
    let mut decoder_limits = Limits::default();
    decoder_limits.max_image_width = Some(limits.maximum_width);
    decoder_limits.max_image_height = Some(limits.maximum_height);
    decoder_limits.max_alloc = Some(limits.maximum_decoded_bytes);
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(decoder_limits);
    let decoder = reader.into_decoder().map_err(safe_error)?;
    let (width, height) = decoder.dimensions();
    if width == 0 || height == 0 {
        return Err(DecodeError::InvalidImage);
    }
    // Check output size explicitly before DynamicImage allocates its buffer.
    if width > limits.maximum_width
        || height > limits.maximum_height
        || decoder.total_bytes() > limits.maximum_decoded_bytes
    {
        return Err(DecodeError::TooLarge);
    }
    let pixels = DynamicImage::from_decoder(decoder).map_err(safe_error)?;
    Ok(DecodedImage {
        pixels,
        encoded: bytes.to_vec(),
        content_type: match format {
            ImageFormat::Png => "image/png",
            ImageFormat::Jpeg => "image/jpeg",
            ImageFormat::WebP => "image/webp",
            _ => return Err(DecodeError::UnsupportedType),
        },
        _permit: None,
    })
}

// Walk container chunks, never search compressed pixel bytes for markers.
// Until every frame can be inspected, animation is unavailable. Reject trailing
// or truncated container data rather than validating only its first image.
fn static_container(bytes: &[u8], format: ImageFormat) -> Result<(), DecodeError> {
    let (mut offset, png) = match format {
        ImageFormat::Png if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => (8usize, true),
        ImageFormat::WebP
            if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" =>
        {
            let length = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
            if length.checked_add(8) != Some(bytes.len()) {
                return Err(DecodeError::InvalidImage);
            }
            (12usize, false)
        }
        ImageFormat::Jpeg => return single_jpeg(bytes),
        _ => return Err(DecodeError::InvalidImage),
    };
    while offset < bytes.len() {
        let header = bytes
            .get(offset..offset + 8)
            .ok_or(DecodeError::InvalidImage)?;
        let (kind, length) = if png {
            (
                &header[4..8],
                u32::from_be_bytes(header[..4].try_into().unwrap()) as usize,
            )
        } else {
            (
                &header[..4],
                u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize,
            )
        };
        let padding = if png { 4 } else { length % 2 };
        let end = offset
            .checked_add(8)
            .and_then(|v| v.checked_add(length))
            .and_then(|v| v.checked_add(padding))
            .ok_or(DecodeError::InvalidImage)?;
        if end > bytes.len() {
            return Err(DecodeError::InvalidImage);
        }
        if (png && matches!(kind, b"acTL" | b"fcTL" | b"fdAT"))
            || (!png
                && (matches!(kind, b"ANIM" | b"ANMF")
                    || (kind == b"VP8X" && length > 0 && bytes[offset + 8] & 2 != 0)))
        {
            return Err(DecodeError::AnimationUnsupported);
        }
        if png && kind == b"IEND" {
            return if length == 0 && end == bytes.len() {
                Ok(())
            } else {
                Err(DecodeError::InvalidImage)
            };
        }
        offset = end;
    }
    if png {
        Err(DecodeError::InvalidImage)
    } else {
        Ok(())
    }
}

fn single_jpeg(bytes: &[u8]) -> Result<(), DecodeError> {
    if !bytes.starts_with(&[0xff, 0xd8]) {
        return Err(DecodeError::InvalidImage);
    }
    let mut offset = 2;
    let mut entropy = false;
    while offset < bytes.len() {
        if entropy {
            while offset < bytes.len() && bytes[offset] != 0xff {
                offset += 1;
            }
        }
        if bytes.get(offset) != Some(&0xff) {
            return Err(DecodeError::InvalidImage);
        }
        while bytes.get(offset) == Some(&0xff) {
            offset += 1;
        }
        let marker = *bytes.get(offset).ok_or(DecodeError::InvalidImage)?;
        offset += 1;
        if entropy && (marker == 0 || (0xd0..=0xd7).contains(&marker)) {
            continue;
        }
        if marker == 0xd9 {
            return if offset == bytes.len() {
                Ok(())
            } else {
                Err(DecodeError::InvalidImage)
            };
        }
        if marker == 0 || marker == 0xd8 || (0xd0..=0xd7).contains(&marker) {
            return Err(DecodeError::InvalidImage);
        }
        entropy = false;
        if marker == 1 {
            continue;
        } // Standalone TEM marker.
        let length_bytes = bytes
            .get(offset..offset + 2)
            .ok_or(DecodeError::InvalidImage)?;
        let length = usize::from(u16::from_be_bytes(length_bytes.try_into().unwrap()));
        if length < 2 {
            return Err(DecodeError::InvalidImage);
        }
        offset = offset
            .checked_add(length)
            .filter(|end| *end <= bytes.len())
            .ok_or(DecodeError::InvalidImage)?;
        if marker == 0xda {
            entropy = true;
        }
    }
    Err(DecodeError::InvalidImage)
}

fn safe_error(error: image::ImageError) -> DecodeError {
    match error {
        image::ImageError::Limits(_) => DecodeError::TooLarge,
        _ => DecodeError::InvalidImage,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn service() -> DecodeService {
        DecodeService::new(
            DecodeLimits {
                maximum_encoded_bytes: 4096,
                maximum_width: 32,
                maximum_height: 32,
                maximum_decoded_bytes: 4096,
            },
            1,
        )
        .unwrap()
    }
    fn png() -> Vec<u8> {
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::new_rgb8(2, 2)
            .write_to(&mut bytes, ImageFormat::Png)
            .unwrap();
        bytes.into_inner()
    }

    #[tokio::test(flavor = "current_thread")]
    async fn retained_pixels_hold_capacity_across_service_clones() {
        let service = service();
        let bytes = png();
        let image = service.decode(&bytes, "image/png").await.unwrap();
        assert_eq!(
            service.clone().decode(&bytes, "image/png").await.err(),
            Some(DecodeError::Busy)
        );
        drop(image);
        assert!(service.decode(&bytes, "image/png").await.is_ok());
        assert_eq!(
            service.decode(b"broken", "image/png").await.err(),
            Some(DecodeError::InvalidImage)
        );
        assert!(service.decode(&bytes, "image/png").await.is_ok());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn worker_panic_returns_safe_failure_and_releases_capacity() {
        let service = service();
        let permit = service.slots.clone().try_acquire_owned().unwrap();
        let failure = DecodeService::run(permit, || panic!("synthetic worker failure"))
            .await
            .err();
        assert_eq!(failure, Some(DecodeError::WorkerFailed));
        assert_eq!(service.slots.available_permits(), 1);
        assert!(service.decode(&png(), "image/png").await.is_ok());
    }

    #[test]
    fn admission_configuration_cannot_create_an_unbounded_pool() {
        let limits = service().limits;
        for concurrency in [0, 5, usize::MAX] {
            assert!(matches!(
                DecodeService::new(limits, concurrency),
                Err(DecodeError::InvalidLimits)
            ));
        }
        let invalid = DecodeLimits {
            maximum_decoded_bytes: 0,
            ..limits
        };
        assert!(matches!(
            DecodeService::new(invalid, 1),
            Err(DecodeError::InvalidLimits)
        ));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn cancelled_caller_cannot_release_a_running_worker_slot() {
        let service = service();
        let permit = service.slots.clone().try_acquire_owned().unwrap();
        let (started, receiving) = tokio::sync::oneshot::channel();
        let (release, waiting) = std::sync::mpsc::channel();
        let (done, finished) = tokio::sync::oneshot::channel();
        let limits = service.limits;
        let worker = tokio::spawn(DecodeService::run(permit, move || {
            started.send(()).unwrap();
            waiting
                .recv_timeout(std::time::Duration::from_secs(5))
                .unwrap();
            let result = decode(&png(), "image/png", limits);
            let _ = done.send(());
            result
        }));
        receiving.await.unwrap(); // The blocking worker started; executor remains responsive.
        worker.abort();
        assert!(matches!(worker.await, Err(error) if error.is_cancelled()));
        assert_eq!(
            service.decode(&png(), "image/png").await.err(),
            Some(DecodeError::Busy)
        );
        release.send(()).unwrap();
        finished.await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                if service.slots.available_permits() == 1 {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(service.decode(&png(), "image/png").await.is_ok());
    }
}
