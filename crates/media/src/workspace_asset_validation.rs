//! Bounded local file validation for durable workspace assets.
//! Parses image pixels or container/frame structure. This is not malware/content
//! inspection, upstream acceptance, licensing evidence or dispatch authorization.
use std::sync::LazyLock;

pub const MAX_ASSET_BYTES: usize = 8 * 1024 * 1024;

#[derive(Clone, Copy, Eq, PartialEq)]
pub enum AssetMediaKind {
    Image,
    Video,
    Audio,
}

#[derive(Clone, Copy, Eq, PartialEq)]
pub enum AssetValidationError {
    UnsupportedType,
    InvalidMedia,
    Capacity,
}

pub fn media_kind(content_type: &str) -> Option<AssetMediaKind> {
    match content_type {
        "image/png" | "image/jpeg" | "image/webp" => Some(AssetMediaKind::Image),
        "video/mp4" | "video/webm" => Some(AssetMediaKind::Video),
        "audio/wav" | "audio/mpeg" | "audio/ogg" => Some(AssetMediaKind::Audio),
        _ => None,
    }
}

static IMAGES: LazyLock<
    Result<crate::image_input::DecodeService, crate::image_input::DecodeError>,
> = LazyLock::new(|| {
    crate::image_input::DecodeService::new(
        crate::image_input::DecodeLimits {
            maximum_encoded_bytes: MAX_ASSET_BYTES,
            maximum_width: 8192,
            maximum_height: 8192,
            maximum_decoded_bytes: 64 * 1024 * 1024,
        },
        4,
    )
});

/// Callers must bound body collection and retained concurrent uploads before
/// calling. Non-image parsing runs off the async executor and copies at most 8 MiB.
pub async fn validate(
    content_type: &str,
    bytes: &[u8],
) -> Result<AssetMediaKind, AssetValidationError> {
    let kind = media_kind(content_type).ok_or(AssetValidationError::UnsupportedType)?;
    if bytes.is_empty() || bytes.len() > MAX_ASSET_BYTES {
        return Err(AssetValidationError::InvalidMedia);
    }
    if kind == AssetMediaKind::Image {
        let decoder = IMAGES
            .as_ref()
            .map_err(|_| AssetValidationError::Capacity)?;
        decoder
            .decode(bytes, content_type)
            .await
            .map_err(|e| match e {
                crate::image_input::DecodeError::Busy
                | crate::image_input::DecodeError::WorkerFailed => AssetValidationError::Capacity,
                _ => AssetValidationError::InvalidMedia,
            })?;
    } else {
        let body = bytes.to_vec();
        let content_type = content_type.to_owned();
        let valid = tokio::task::spawn_blocking(move || match content_type.as_str() {
            "video/mp4" => mp4(&body),
            "video/webm" => webm(&body),
            "audio/wav" => wav(&body),
            "audio/mpeg" => mpeg(&body),
            "audio/ogg" => ogg(&body),
            _ => false,
        })
        .await
        .map_err(|_| AssetValidationError::Capacity)?;
        if !valid {
            return Err(AssetValidationError::InvalidMedia);
        }
    }
    Ok(kind)
}

pub(crate) fn wav(bytes: &[u8]) -> bool {
    if bytes.len() < 44 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return false;
    }
    let declared = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
    if declared.checked_add(8) != Some(bytes.len()) {
        return false;
    }
    let mut offset = 12;
    let mut align = None;
    let mut data_bytes = None;
    while offset < bytes.len() {
        let Some(header) = bytes.get(offset..offset + 8) else {
            return false;
        };
        let length = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;
        let Some(end) = offset.checked_add(8).and_then(|n| n.checked_add(length)) else {
            return false;
        };
        let Some(chunk) = bytes.get(offset + 8..end) else {
            return false;
        };
        match &header[..4] {
            b"fmt " => {
                if align.is_some() || chunk.len() < 16 {
                    return false;
                }
                let format = u16::from_le_bytes(chunk[..2].try_into().unwrap());
                let channels = u16::from_le_bytes(chunk[2..4].try_into().unwrap());
                let rate = u32::from_le_bytes(chunk[4..8].try_into().unwrap());
                let byte_rate = u32::from_le_bytes(chunk[8..12].try_into().unwrap());
                let block = u16::from_le_bytes(chunk[12..14].try_into().unwrap());
                let bits = u16::from_le_bytes(chunk[14..16].try_into().unwrap());
                if !(1..=8).contains(&channels)
                    || rate == 0
                    || rate > 384000
                    || !((format == 1 && matches!(bits, 8 | 16 | 24 | 32))
                        || (format == 3 && matches!(bits, 32 | 64)))
                    || u32::from(block) != u32::from(channels) * u32::from(bits) / 8
                    || rate.checked_mul(u32::from(block)) != Some(byte_rate)
                {
                    return false;
                }
                align = Some(usize::from(block));
            }
            b"data" => {
                if data_bytes.is_some() || length == 0 {
                    return false;
                }
                data_bytes = Some(length);
            }
            _ => {}
        }
        offset = match end.checked_add(length % 2) {
            Some(n) if n <= bytes.len() => n,
            _ => return false,
        };
    }
    matches!((align, data_bytes), (Some(block), Some(size)) if size.is_multiple_of(block))
}

pub(crate) fn mpeg(bytes: &[u8]) -> bool {
    let mut offset = 0;
    if bytes.starts_with(b"ID3") {
        if bytes.len() < 10
            || !matches!(bytes[3], 3 | 4)
            || bytes[6..10].iter().any(|v| v & 0x80 != 0)
        {
            return false;
        }
        let size = bytes[6..10]
            .iter()
            .fold(0usize, |n, v| (n << 7) | usize::from(*v));
        offset = 10
            + size
            + if bytes[3] == 4 && bytes[5] & 0x10 != 0 {
                10
            } else {
                0
            };
    }
    let mut frames = 0;
    while offset < bytes.len() {
        if bytes.len() - offset == 128 && &bytes[offset..offset + 3] == b"TAG" {
            break;
        }
        let Some(h) = bytes.get(offset..offset + 4) else {
            return false;
        };
        if h[0] != 255 || h[1] & 0xe0 != 0xe0 || h[1] & 6 != 2 {
            return false;
        }
        let version = (h[1] >> 3) & 3;
        let bitrate = usize::from(h[2] >> 4);
        let sample = usize::from((h[2] >> 2) & 3);
        if version == 1 || bitrate == 0 || bitrate == 15 || sample == 3 {
            return false;
        }
        let rates = if version == 3 {
            [
                0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
            ]
        } else {
            [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
        };
        let frequency = [44100, 48000, 32000][sample]
            / if version == 3 {
                1
            } else if version == 2 {
                2
            } else {
                4
            };
        let size = (if version == 3 { 144 } else { 72 }) * rates[bitrate] * 1000 / frequency
            + usize::from((h[2] >> 1) & 1);
        if size < 4 || bytes.get(offset..offset + size).is_none() {
            return false;
        }
        offset += size;
        frames += 1;
    }
    frames >= 2
}

fn ogg(bytes: &[u8]) -> bool {
    let mut offset = 0;
    let mut serial = None;
    let mut sequence = 0;
    let mut first = true;
    let mut packets = 0;
    let mut packet = Vec::new();
    let mut eos = false;
    while offset < bytes.len() {
        let Some(h) = bytes.get(offset..offset + 27) else {
            return false;
        };
        if &h[..4] != b"OggS" || h[4] != 0 || h[5] & !7 != 0 || eos {
            return false;
        }
        let current_serial = u32::from_le_bytes(h[14..18].try_into().unwrap());
        let seq = u32::from_le_bytes(h[18..22].try_into().unwrap());
        if first {
            if h[5] & 2 == 0 || h[5] & 1 != 0 || seq != 0 {
                return false;
            }
            serial = Some(current_serial);
        } else if Some(current_serial) != serial || seq != sequence {
            return false;
        }
        if (h[5] & 1 != 0) == packet.is_empty() {
            return false;
        }
        let Some(lacing) = bytes.get(offset + 27..offset + 27 + usize::from(h[26])) else {
            return false;
        };
        let length: usize = lacing.iter().map(|v| usize::from(*v)).sum();
        let end = offset + 27 + lacing.len() + length;
        let Some(page) = bytes.get(offset..end) else {
            return false;
        };
        let expected = u32::from_le_bytes(h[22..26].try_into().unwrap());
        let mut crc = 0u32;
        for (i, byte) in page.iter().enumerate() {
            crc ^= u32::from(if (22..26).contains(&i) { 0 } else { *byte }) << 24;
            for _ in 0..8 {
                crc = if crc & 0x80000000 != 0 {
                    (crc << 1) ^ 0x04c11db7
                } else {
                    crc << 1
                };
            }
        }
        if crc != expected {
            return false;
        }
        let mut pos = offset + 27 + lacing.len();
        for size in lacing {
            packet.extend_from_slice(&bytes[pos..pos + usize::from(*size)]);
            pos += usize::from(*size);
            if *size < 255 {
                if packets == 0 {
                    let opus = packet.len() >= 19
                        && packet.starts_with(b"OpusHead")
                        && packet[8] == 1
                        && (1..=8).contains(&packet[9]);
                    let vorbis = packet.len() >= 30
                        && packet.starts_with(b"\x01vorbis")
                        && packet[11] > 0
                        && packet[29] & 1 == 1;
                    if !opus && !vorbis {
                        return false;
                    }
                }
                if packet.is_empty() {
                    return false;
                }
                packets += 1;
                packet.clear();
            }
        }
        eos = h[5] & 4 != 0;
        first = false;
        sequence = match seq.checked_add(1) {
            Some(n) => n,
            None => return false,
        };
        offset = end;
    }
    eos && packet.is_empty() && packets >= 3
}

#[derive(Default)]
struct Movie {
    brand: bool,
    video: bool,
    data: bool,
    boxes: usize,
}
pub(crate) fn mp4(bytes: &[u8]) -> bool {
    let mut movie = Movie::default();
    boxes(bytes, 0, &mut movie) && movie.brand && movie.video && movie.data
}
fn boxes(bytes: &[u8], depth: usize, movie: &mut Movie) -> bool {
    if depth > 8 {
        return false;
    }
    let mut offset = 0;
    while offset < bytes.len() {
        let Some(h) = bytes.get(offset..offset + 8) else {
            return false;
        };
        movie.boxes += 1;
        if movie.boxes > 65536 {
            return false;
        }
        let short = u32::from_be_bytes(h[..4].try_into().unwrap());
        let (length, header) = if short == 1 {
            let Some(large) = bytes.get(offset + 8..offset + 16) else {
                return false;
            };
            let Ok(length) = usize::try_from(u64::from_be_bytes(large.try_into().unwrap())) else {
                return false;
            };
            (length, 16)
        } else if short == 0 {
            (bytes.len() - offset, 8)
        } else {
            (short as usize, 8)
        };
        if length < header {
            return false;
        }
        let Some(end) = offset.checked_add(length) else {
            return false;
        };
        let Some(body) = bytes.get(offset + header..end) else {
            return false;
        };
        match &h[4..8] {
            b"ftyp" if depth == 0 => {
                if body.len() < 8 || !body.len().is_multiple_of(4) {
                    return false;
                }
                movie.brand |= body.as_chunks::<4>().0.iter().enumerate().any(|(i, b)| {
                    i != 1
                        && matches!(
                            b,
                            b"isom"
                                | b"iso2"
                                | b"iso3"
                                | b"iso4"
                                | b"iso5"
                                | b"iso6"
                                | b"mp41"
                                | b"mp42"
                                | b"avc1"
                                | b"M4V "
                                | b"dash"
                                | b"qt  "
                        )
                });
            }
            b"moov" | b"trak" | b"mdia" | b"minf" | b"stbl" => {
                if !boxes(body, depth + 1, movie) {
                    return false;
                }
            }
            b"hdlr" if depth >= 3 => {
                if body.len() < 24 {
                    return false;
                }
                movie.video |= &body[8..12] == b"vide";
            }
            b"mdat" if depth == 0 => movie.data |= !body.is_empty(),
            _ => {}
        }
        offset = end;
    }
    true
}

fn vint(bytes: &[u8], id: bool) -> Option<(u64, usize, bool)> {
    let first = *bytes.first()?;
    let width = first.leading_zeros() as usize + 1;
    if width > if id { 4 } else { 8 } || bytes.len() < width {
        return None;
    }
    let mask = 0x80u8 >> (width - 1);
    let mut value = u64::from(if id { first } else { first & (mask - 1) });
    for byte in &bytes[1..width] {
        value = (value << 8) | u64::from(*byte);
    }
    let unknown = !id && value == (1u64 << (7 * width)) - 1;
    Some((value, width, unknown))
}
fn elements(bytes: &[u8]) -> Option<Vec<(u64, &[u8])>> {
    let mut out = Vec::new();
    let mut offset = 0;
    while offset < bytes.len() {
        if out.len() > 65536 {
            return None;
        }
        let (id, iw, _) = vint(&bytes[offset..], true)?;
        let (length, sw, unknown) = vint(bytes.get(offset + iw..)?, false)?;
        let start = offset + iw + sw;
        let end = if unknown {
            if !matches!(id, 0x18538067 | 0x1f43b675) {
                return None;
            }
            bytes.len()
        } else {
            start.checked_add(usize::try_from(length).ok()?)?
        };
        out.push((id, bytes.get(start..end)?));
        offset = end;
    }
    Some(out)
}
fn unsigned(bytes: &[u8]) -> Option<u64> {
    if bytes.is_empty() || bytes.len() > 8 {
        return None;
    }
    Some(bytes.iter().fold(0u64, |n, v| (n << 8) | u64::from(*v)))
}
// A valid EBML container alone does not make a valid Block. Parse every laced
// frame boundary, not just the track VINT and a nonempty byte suffix.
fn block_track(block: &[u8], simple: bool) -> Option<u64> {
    let (track, width, unknown) = vint(block, false)?;
    if unknown || track == 0 || block.len() <= width + 3 {
        return None;
    }
    let flags = block[width + 2];
    if flags & !(if simple { 0x8f } else { 0x0e }) != 0 {
        return None;
    }
    let data = &block[width + 3..];
    match flags & 6 {
        0 => {}
        4 => {
            let frames = usize::from(*data.first()?) + 1;
            let size = data.len().checked_sub(1)?;
            if size == 0 || !size.is_multiple_of(frames) {
                return None;
            }
        }
        mode => {
            let frames = usize::from(*data.first()?) + 1;
            let mut offset = 1usize;
            let mut total = 0usize;
            let mut previous = 0i64;
            for frame in 0..frames - 1 {
                let size = if mode == 2 {
                    let mut size = 0usize;
                    loop {
                        let byte = *data.get(offset)?;
                        offset += 1;
                        size = size.checked_add(usize::from(byte))?;
                        if byte != 255 {
                            break;
                        }
                    }
                    size
                } else {
                    let (value, length, unknown) = vint(data.get(offset..)?, false)?;
                    if unknown {
                        return None;
                    }
                    offset += length;
                    let value = i64::try_from(value).ok()?;
                    let size = if frame == 0 {
                        value
                    } else {
                        previous.checked_add(value - ((1i64 << (7 * length - 1)) - 1))?
                    };
                    if size <= 0 {
                        return None;
                    }
                    previous = size;
                    usize::try_from(size).ok()?
                };
                if size == 0 {
                    return None;
                }
                total = total.checked_add(size)?;
            }
            if total >= data.len().checked_sub(offset)? {
                return None;
            }
        }
    }
    Some(track)
}
fn webm(bytes: &[u8]) -> bool {
    let Some(top) = elements(bytes) else {
        return false;
    };
    let Some((_, header)) = top.first().filter(|(id, _)| *id == 0x1a45dfa3) else {
        return false;
    };
    let Some(header) = elements(header) else {
        return false;
    };
    if !header.iter().any(|(id, b)| *id == 0x4282 && *b == b"webm") {
        return false;
    }
    let Some((_, segment)) = top.iter().find(|(id, _)| *id == 0x18538067) else {
        return false;
    };
    let Some(segment) = elements(segment) else {
        return false;
    };
    let mut videos = std::collections::BTreeSet::new();
    for (_, tracks) in segment.iter().filter(|(id, _)| *id == 0x1654ae6b) {
        let Some(tracks) = elements(tracks) else {
            return false;
        };
        for (_, entry) in tracks.iter().filter(|(id, _)| *id == 0xae) {
            let Some(fields) = elements(entry) else {
                return false;
            };
            let number = fields
                .iter()
                .find(|(id, _)| *id == 0xd7)
                .and_then(|(_, b)| unsigned(b));
            let kind = fields
                .iter()
                .find(|(id, _)| *id == 0x83)
                .and_then(|(_, b)| unsigned(b));
            let codec = fields.iter().find(|(id, _)| *id == 0x86).map(|(_, b)| *b);
            if kind == Some(1)
                && matches!(codec, Some(b"V_VP8" | b"V_VP9" | b"V_AV1"))
                && let Some(n) = number.filter(|n| *n > 0)
            {
                videos.insert(n);
            }
        }
    }
    if videos.is_empty() {
        return false;
    }
    let mut found_video = false;
    for (_, cluster) in segment.iter().filter(|(id, _)| *id == 0x1f43b675) {
        let Some(fields) = elements(cluster) else {
            return false;
        };
        for (id, body) in fields {
            let blocks = if id == 0xa3 {
                vec![(id, body)]
            } else if id == 0xa0 {
                let Some(group) = elements(body) else {
                    return false;
                };
                group
            } else {
                continue;
            };
            for (id, block) in blocks {
                if !matches!(id, 0xa3 | 0xa1) {
                    continue;
                }
                let Some(track) = block_track(block, id == 0xa3) else {
                    return false;
                };
                if videos.contains(&track) {
                    found_video = true;
                }
            }
        }
    }
    found_video
}
