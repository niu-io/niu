//! Bounded facts from complete encoded files, independent of model policy.
//! Codec names are container declarations, not decoded-content safety proofs.
//! Ratios retain exact integer timebases; API boundaries must serialize large
//! integers safely. MP3 encoded duration does not establish trimmed playback.
use crate::workspace_asset_validation::{MAX_ASSET_BYTES, mp4, mpeg, wav};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MediaReferenceFactsError {
    InvalidMedia,
    Unsupported,
    Incomplete,
}
type Result<T> = std::result::Result<T, MediaReferenceFactsError>;
use MediaReferenceFactsError::{Incomplete, InvalidMedia, Unsupported};
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MediaRatio {
    numerator: u64,
    denominator: u64,
}
impl MediaRatio {
    pub const fn numerator(self) -> u64 {
        self.numerator
    }
    pub const fn denominator(self) -> u64 {
        self.denominator
    }
    fn new(numerator: u64, denominator: u64) -> Result<Self> {
        if denominator == 0 {
            return Err(InvalidMedia);
        }
        let mut a = numerator;
        let mut b = denominator;
        while b != 0 {
            (a, b) = (b, a % b);
        }
        let divisor = a.max(1);
        Ok(Self {
            numerator: numerator / divisor,
            denominator: denominator / divisor,
        })
    }
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MediaContainer {
    Mp4,
    Wav,
    Mp3,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DurationBasis {
    PresentationTimeline,
    EncodedSamples,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VideoCodec {
    Avc,
    Hevc,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AudioCodec {
    Pcm,
    Float,
    Aac,
    Mp3,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FrameRate {
    Constant(MediaRatio),
    Variable {
        minimum: MediaRatio,
        maximum: MediaRatio,
    },
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VideoReferenceFacts {
    pub codec: VideoCodec,
    pub width: u32,
    pub height: u32,
    pub frame_count: u64,
    pub frame_rate: FrameRate,
    pub encoded_duration: MediaRatio,
    pub presentation_duration: MediaRatio,
    pub declared_presentation_duration: Option<MediaRatio>,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AudioReferenceFacts {
    pub codec: AudioCodec,
    pub sample_rate: u32,
    pub channels: u16,
    pub encoded_duration: MediaRatio,
    pub presentation_duration: Option<MediaRatio>,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MediaReferenceFacts {
    pub container: MediaContainer,
    pub byte_length: u64,
    /// Effective supported timeline; check duration_basis before applying limits.
    pub duration: MediaRatio,
    pub duration_basis: DurationBasis,
    /// Exact container declaration, which may round beyond effective duration.
    pub declared_duration: Option<MediaRatio>,
    pub video: Option<VideoReferenceFacts>,
    pub audio: Vec<AudioReferenceFacts>,
}
/// No allocation or iteration proportional to untrusted declared counts without
/// checking the encoded bounds first. Unknown formats never produce facts.
pub fn inspect_reference_facts(content_type: &str, bytes: &[u8]) -> Result<MediaReferenceFacts> {
    if bytes.is_empty() || bytes.len() > MAX_ASSET_BYTES {
        return Err(InvalidMedia);
    }
    match content_type {
        "audio/wav" => wave(bytes),
        "audio/mpeg" => mp3_facts(bytes),
        "video/mp4" => mp4_facts(bytes),
        _ => Err(Unsupported),
    }
}
fn be32(b: &[u8], o: usize) -> Result<u32> {
    Ok(u32::from_be_bytes(
        b.get(o..o + 4)
            .ok_or(Incomplete)?
            .try_into()
            .map_err(|_| Incomplete)?,
    ))
}
fn be64(b: &[u8], o: usize) -> Result<u64> {
    Ok(u64::from_be_bytes(
        b.get(o..o + 8)
            .ok_or(Incomplete)?
            .try_into()
            .map_err(|_| Incomplete)?,
    ))
}
fn le16(b: &[u8], o: usize) -> Result<u16> {
    Ok(u16::from_le_bytes(
        b.get(o..o + 2)
            .ok_or(Incomplete)?
            .try_into()
            .map_err(|_| Incomplete)?,
    ))
}
fn le32(b: &[u8], o: usize) -> Result<u32> {
    Ok(u32::from_le_bytes(
        b.get(o..o + 4)
            .ok_or(Incomplete)?
            .try_into()
            .map_err(|_| Incomplete)?,
    ))
}
fn wave(b: &[u8]) -> Result<MediaReferenceFacts> {
    if !wav(b) {
        return Err(InvalidMedia);
    }
    let mut o = 12;
    let mut fmt = None;
    let mut samples = None;
    while o < b.len() {
        let n = le32(b, o + 4)? as usize;
        let data = b.get(o + 8..o + 8 + n).ok_or(Incomplete)?;
        match &b[o..o + 4] {
            b"fmt " => {
                fmt = Some((
                    le16(data, 0)?,
                    le16(data, 2)?,
                    le32(data, 4)?,
                    le16(data, 12)?,
                ));
            }
            b"data" => samples = Some(n as u64),
            _ => {}
        }
        o = o.checked_add(8 + n + n % 2).ok_or(InvalidMedia)?;
    }
    let (encoding, channels, rate, block) = fmt.ok_or(Incomplete)?;
    let duration = MediaRatio::new(
        samples.ok_or(Incomplete)? / u64::from(block),
        u64::from(rate),
    )?;
    Ok(MediaReferenceFacts {
        container: MediaContainer::Wav,
        byte_length: b.len() as u64,
        duration,
        duration_basis: DurationBasis::EncodedSamples,
        declared_duration: None,
        video: None,
        audio: vec![AudioReferenceFacts {
            codec: if encoding == 1 {
                AudioCodec::Pcm
            } else {
                AudioCodec::Float
            },
            sample_rate: rate,
            channels,
            encoded_duration: duration,
            presentation_duration: Some(duration),
        }],
    })
}
fn mp3_facts(b: &[u8]) -> Result<MediaReferenceFacts> {
    if !mpeg(b) {
        return Err(InvalidMedia);
    }
    let mut o = 0;
    if b.starts_with(b"ID3") {
        o = 10
            + b[6..10]
                .iter()
                .fold(0usize, |v, x| (v << 7) | usize::from(*x))
            + if b[3] == 4 && b[5] & 16 != 0 { 10 } else { 0 };
    }
    let mut frames = 0u64;
    let mut samples = 0u64;
    let mut format = None;
    while o < b.len() {
        if b.len() - o == 128 && &b[o..o + 3] == b"TAG" {
            break;
        }
        let h = b.get(o..o + 4).ok_or(Incomplete)?;
        let version = (h[1] >> 3) & 3;
        let frequency = [44100u32, 48000, 32000][usize::from((h[2] >> 2) & 3)]
            / if version == 3 {
                1
            } else if version == 2 {
                2
            } else {
                4
            };
        let channels = if h[3] >> 6 == 3 { 1 } else { 2 };
        let sample_count = if version == 3 { 1152 } else { 576 };
        if format.is_some_and(|f| f != (frequency, channels, sample_count)) {
            return Err(Unsupported);
        }
        format = Some((frequency, channels, sample_count));
        let rates = if version == 3 {
            [
                0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
            ]
        } else {
            [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
        };
        let n = (if version == 3 { 144 } else { 72 }) * rates[usize::from(h[2] >> 4)] * 1000
            / frequency as usize
            + usize::from((h[2] >> 1) & 1);
        // Xing/Info and VBRI information frames are not inferred as playable
        // samples; exact gapless trimming requires an independently supported
        // encoder contract. Refuse rather than mix their count with playback.
        let side = if version == 3 {
            if channels == 1 { 17 } else { 32 }
        } else if channels == 1 {
            9
        } else {
            17
        };
        let tag = o + 4 + if h[1] & 1 == 0 { 2 } else { 0 } + side;
        if frames == 0
            && (b
                .get(tag..tag + 4)
                .is_some_and(|x| x == b"Xing" || x == b"Info")
                || b.get(o + 36..o + 40) == Some(b"VBRI"))
        {
            return Err(Unsupported);
        }
        samples = samples.checked_add(sample_count).ok_or(InvalidMedia)?;
        frames += 1;
        o = o.checked_add(n).ok_or(InvalidMedia)?;
    }
    let (rate, channels, _) = format.ok_or(Incomplete)?;
    let duration = MediaRatio::new(samples, u64::from(rate))?;
    Ok(MediaReferenceFacts {
        container: MediaContainer::Mp3,
        byte_length: b.len() as u64,
        duration,
        duration_basis: DurationBasis::EncodedSamples,
        declared_duration: None,
        video: None,
        audio: vec![AudioReferenceFacts {
            codec: AudioCodec::Mp3,
            sample_rate: rate,
            channels,
            encoded_duration: duration,
            presentation_duration: None,
        }],
    })
}

#[derive(Clone, Copy)]
struct BoxRef<'a> {
    kind: &'a [u8],
    body: &'a [u8],
    start: usize,
}
fn box_list(b: &[u8], absolute: usize) -> Result<Vec<BoxRef<'_>>> {
    let mut o = 0;
    let mut result = Vec::new();
    while o < b.len() {
        if result.len() >= 65536 {
            return Err(Unsupported);
        }
        let n = be32(b, o)?;
        let (size, header) = if n == 1 {
            (
                usize::try_from(be64(b, o + 8)?).map_err(|_| InvalidMedia)?,
                16,
            )
        } else if n == 0 {
            (b.len() - o, 8)
        } else {
            (n as usize, 8)
        };
        if size < header {
            return Err(InvalidMedia);
        }
        let end = o.checked_add(size).ok_or(InvalidMedia)?;
        result.push(BoxRef {
            kind: b.get(o + 4..o + 8).ok_or(Incomplete)?,
            body: b.get(o + header..end).ok_or(Incomplete)?,
            start: absolute.checked_add(o + header).ok_or(InvalidMedia)?,
        });
        o = end;
    }
    Ok(result)
}
fn one<'a>(boxes: &[BoxRef<'a>], kind: &[u8]) -> Result<BoxRef<'a>> {
    let mut matching = boxes.iter().filter(|b| b.kind == kind);
    let value = *matching.next().ok_or(Incomplete)?;
    if matching.next().is_some() {
        return Err(Unsupported);
    }
    Ok(value)
}
fn optional<'a>(boxes: &[BoxRef<'a>], kind: &[u8]) -> Result<Option<BoxRef<'a>>> {
    let count = boxes.iter().filter(|b| b.kind == kind).count();
    if count > 1 {
        return Err(Unsupported);
    }
    Ok(boxes.iter().find(|b| b.kind == kind).copied())
}
fn children(b: BoxRef<'_>) -> Result<Vec<BoxRef<'_>>> {
    box_list(b.body, b.start)
}
fn time_header(b: &[u8]) -> Result<(u64, u64)> {
    let (scale, duration) = match b.first() {
        Some(0) => (u64::from(be32(b, 12)?), u64::from(be32(b, 16)?)),
        Some(1) => (u64::from(be32(b, 20)?), be64(b, 24)?),
        _ => return Err(Unsupported),
    };
    if scale == 0 || duration == 0 || duration == u64::MAX || duration == u64::from(u32::MAX) {
        return Err(Incomplete);
    }
    Ok((scale, duration))
}
fn table(b: &[u8], width: usize) -> Result<&[u8]> {
    if b.get(..4) != Some(&[0, 0, 0, 0]) {
        return Err(Unsupported);
    }
    let n = be32(b, 4)? as usize;
    if n == 0 || n > 200000 {
        return Err(Incomplete);
    }
    if n.checked_mul(width).and_then(|v| v.checked_add(8)) != Some(b.len()) {
        return Err(InvalidMedia);
    }
    Ok(&b[8..])
}
fn sample_sizes(b: &[u8]) -> Result<Vec<u32>> {
    if b.get(..4) != Some(&[0, 0, 0, 0]) {
        return Err(Unsupported);
    }
    let fixed = be32(b, 4)?;
    let n = be32(b, 8)? as usize;
    if n == 0 || n > 200000 {
        return Err(Incomplete);
    }
    if fixed > 0 {
        if b.len() != 12 {
            return Err(InvalidMedia);
        }
        return Ok(vec![fixed; n]);
    }
    if n.checked_mul(4).and_then(|v| v.checked_add(12)) != Some(b.len()) {
        return Err(InvalidMedia);
    }
    let mut sizes = Vec::with_capacity(n);
    for entry in b[12..].as_chunks::<4>().0 {
        let size = be32(entry, 0)?;
        if size == 0 {
            return Err(Incomplete);
        }
        sizes.push(size);
    }
    Ok(sizes)
}
fn samples_in_file(
    stbl: &[BoxRef<'_>],
    mdat: &[(usize, usize)],
    all_ranges: &mut Vec<(usize, usize)>,
) -> Result<usize> {
    let sizes = sample_sizes(one(stbl, b"stsz")?.body)?;
    let stsc = table(one(stbl, b"stsc")?.body, 12)?;
    let stco = optional(stbl, b"stco")?;
    let co64 = optional(stbl, b"co64")?;
    let (offsets, width) = match (stco, co64) {
        (Some(b), None) => (table(b.body, 4)?, 4),
        (None, Some(b)) => (table(b.body, 8)?, 8),
        _ => return Err(Incomplete),
    };
    let mut mappings = Vec::new();
    let mut previous = 0;
    for entry in stsc.as_chunks::<12>().0 {
        let first = be32(entry, 0)?;
        let count = be32(entry, 4)?;
        if first <= previous || count == 0 || be32(entry, 8)? != 1 {
            return Err(Unsupported);
        }
        mappings.push((first as usize, count as usize));
        previous = first;
    }
    if mappings.first().map(|v| v.0) != Some(1)
        || mappings.last().is_some_and(|v| v.0 > offsets.len() / width)
    {
        return Err(InvalidMedia);
    }
    let mut index = 0;
    let mut mapping = 0;
    for (i, entry) in offsets.chunks_exact(width).enumerate() {
        while mapping + 1 < mappings.len() && mappings[mapping + 1].0 <= i + 1 {
            mapping += 1;
        }
        let mut o = usize::try_from(if width == 4 {
            u64::from(be32(entry, 0)?)
        } else {
            be64(entry, 0)?
        })
        .map_err(|_| InvalidMedia)?;
        for _ in 0..mappings[mapping].1 {
            let size = *sizes.get(index).ok_or(InvalidMedia)? as usize;
            let end = o.checked_add(size).ok_or(InvalidMedia)?;
            if !mdat.iter().any(|(start, stop)| o >= *start && end <= *stop) {
                return Err(InvalidMedia);
            }
            all_ranges.push((o, end));
            o = end;
            index += 1;
        }
    }
    if index != sizes.len() {
        return Err(Incomplete);
    }
    Ok(index)
}
fn sample_times(
    stbl: &[BoxRef<'_>],
    scale: u64,
    duration: u64,
    count: usize,
) -> Result<(Vec<i64>, u64)> {
    let entries = table(one(stbl, b"stts")?.body, 8)?;
    let mut times = Vec::with_capacity(count);
    let mut elapsed = 0u64;
    for entry in entries.as_chunks::<8>().0 {
        let n = be32(entry, 0)? as usize;
        let delta = u64::from(be32(entry, 4)?);
        if n == 0 || delta == 0 || times.len().checked_add(n).is_none_or(|x| x > count) {
            return Err(InvalidMedia);
        }
        for _ in 0..n {
            times.push((i64::try_from(elapsed).map_err(|_| Unsupported)?, delta));
            elapsed = elapsed.checked_add(delta).ok_or(InvalidMedia)?;
        }
    }
    if times.len() != count || elapsed != duration || scale == 0 {
        return Err(Incomplete);
    }
    if let Some(ctts) = optional(stbl, b"ctts")? {
        let version = *ctts.body.first().ok_or(Incomplete)?;
        if version > 1 || ctts.body.get(1..4) != Some(&[0, 0, 0]) {
            return Err(Unsupported);
        }
        let entries = be32(ctts.body, 4)? as usize;
        if entries.checked_mul(8).and_then(|x| x.checked_add(8)) != Some(ctts.body.len()) {
            return Err(InvalidMedia);
        }
        let mut position = 0usize;
        for entry in ctts.body[8..].as_chunks::<8>().0 {
            let n = be32(entry, 0)? as usize;
            let raw = be32(entry, 4)?;
            let offset = if version == 1 {
                i64::from(raw as i32)
            } else {
                i64::from(raw)
            };
            let stop = position.checked_add(n).ok_or(InvalidMedia)?;
            if n == 0 || stop > times.len() {
                return Err(InvalidMedia);
            }
            for t in &mut times[position..stop] {
                t.0 = t.0.checked_add(offset).ok_or(InvalidMedia)?;
                if t.0 < 0 {
                    return Err(Unsupported);
                }
            }
            position = stop;
        }
        if position != times.len() {
            return Err(Incomplete);
        }
    }
    times.sort_unstable_by_key(|value| value.0);
    if times.windows(2).any(|pair| pair[0].0 >= pair[1].0) {
        return Err(Unsupported);
    }
    let last_delta = times.last().ok_or(Incomplete)?.1;
    Ok((times.into_iter().map(|value| value.0).collect(), last_delta))
}
fn frame_rate(times: &[i64], scale: u64, last_delta: u64) -> Result<FrameRate> {
    let mut minimum = last_delta;
    let mut maximum = last_delta;
    for pair in times.windows(2) {
        let delta = u64::try_from(pair[1] - pair[0]).map_err(|_| InvalidMedia)?;
        minimum = minimum.min(delta);
        maximum = maximum.max(delta);
    }
    if minimum == maximum {
        Ok(FrameRate::Constant(MediaRatio::new(scale, minimum)?))
    } else {
        Ok(FrameRate::Variable {
            minimum: MediaRatio::new(scale, maximum)?,
            maximum: MediaRatio::new(scale, minimum)?,
        })
    }
}
fn presentation(
    track: &[BoxRef<'_>],
    movie_scale: u64,
    scale: u64,
    duration: u64,
    times: &[i64],
    last_delta: u64,
    video: bool,
) -> Result<(MediaRatio, Option<MediaRatio>)> {
    let Some(edts) = optional(track, b"edts")? else {
        if times.first() != Some(&0) {
            return Err(Unsupported);
        }
        return Ok((MediaRatio::new(duration, scale)?, None));
    };
    let edit = one(&children(edts)?, b"elst")?;
    let b = edit.body;
    let version = *b.first().ok_or(Incomplete)?;
    if be32(b, 4)? != 1 || version > 1 {
        return Err(Unsupported);
    }
    let (segment, offset, rate) = if version == 0 {
        if b.len() != 20 {
            return Err(InvalidMedia);
        }
        (u64::from(be32(b, 8)?), i64::from(be32(b, 12)? as i32), 16)
    } else {
        if b.len() != 28 {
            return Err(InvalidMedia);
        }
        (be64(b, 8)?, be64(b, 16)? as i64, 24)
    };
    if segment == 0 || offset < 0 || b.get(rate..rate + 4) != Some(&[0, 1, 0, 0]) {
        return Err(Unsupported);
    }
    let first = *times.first().ok_or(Incomplete)? as u64;
    let end = (*times.last().ok_or(Incomplete)? as u64)
        .checked_add(last_delta)
        .ok_or(InvalidMedia)?;
    let start = offset as u64;
    // Edits must select existing encoded time. A movie-time tick may round the
    // declared end upwards; retain that exact declaration instead of hiding it.
    if start < first || start >= end {
        return Err(Unsupported);
    }
    let available = end - start;
    if u128::from(segment) * u128::from(scale)
        > u128::from(available) * u128::from(movie_scale) + u128::from(scale)
    {
        return Err(InvalidMedia);
    }
    let encoded = MediaRatio::new(available, scale)?;
    let declared = MediaRatio::new(segment, movie_scale)?;
    let shorter =
        u128::from(segment) * u128::from(scale) < u128::from(available) * u128::from(movie_scale);
    // Trimming video changes frame count/cadence and requires a separate
    // supported edit contract. Audio edit lists may trim encoder padding.
    if video && (start != first || shorter) {
        return Err(Unsupported);
    }
    Ok((if shorter { declared } else { encoded }, Some(declared)))
}
fn mp4_facts(b: &[u8]) -> Result<MediaReferenceFacts> {
    if !mp4(b) {
        return Err(InvalidMedia);
    }
    let top = box_list(b, 0)?;
    if top.iter().any(|x| x.kind == b"moof") {
        return Err(Unsupported);
    }
    let mdat: Vec<_> = top
        .iter()
        .filter(|x| x.kind == b"mdat")
        .map(|x| (x.start, x.start + x.body.len()))
        .collect();
    let movie = children(one(&top, b"moov")?)?;
    if movie.iter().any(|x| x.kind == b"mvex") {
        return Err(Unsupported);
    }
    let (movie_scale, movie_duration) = time_header(one(&movie, b"mvhd")?.body)?;
    let declared_duration = MediaRatio::new(movie_duration, movie_scale)?;
    let tracks: Vec<_> = movie
        .iter()
        .filter(|x| x.kind == b"trak")
        .copied()
        .collect();
    if tracks.is_empty() || tracks.len() > 8 {
        return Err(Unsupported);
    }
    let mut video = None;
    let mut audio = Vec::new();
    let mut all_ranges = Vec::new();
    let mut longest = None;
    for t in tracks {
        let track = children(t)?;
        let track_header = one(&track, b"tkhd")?.body;
        if be32(track_header, 0)? & 3 != 3 {
            return Err(Unsupported);
        }
        let media = children(one(&track, b"mdia")?)?;
        let (scale, length) = time_header(one(&media, b"mdhd")?.body)?;
        let hdlr = one(&media, b"hdlr")?;
        let kind = hdlr.body.get(8..12).ok_or(Incomplete)?;
        if kind != b"vide" && kind != b"soun" {
            return Err(Unsupported);
        }
        let minf = children(one(&media, b"minf")?)?;
        let dinf = children(one(&minf, b"dinf")?)?;
        let dref = one(&dinf, b"dref")?;
        if dref.body.get(..8) != Some(&[0, 0, 0, 0, 0, 0, 0, 1]) {
            return Err(Unsupported);
        }
        let refs = box_list(dref.body.get(8..).ok_or(Incomplete)?, dref.start + 8)?;
        if refs.len() != 1 || refs[0].kind != b"url " || refs[0].body != [0, 0, 0, 1] {
            return Err(Unsupported);
        }
        let stbl = children(one(&minf, b"stbl")?)?;
        let stsd = one(&stbl, b"stsd")?;
        if stsd.body.get(..4) != Some(&[0, 0, 0, 0]) || be32(stsd.body, 4)? != 1 {
            return Err(Unsupported);
        }
        let descriptions = box_list(stsd.body.get(8..).ok_or(Incomplete)?, stsd.start + 8)?;
        if descriptions.len() != 1 {
            return Err(Unsupported);
        }
        let entry = descriptions[0];
        if entry.body.get(..8) != Some(&[0, 0, 0, 0, 0, 0, 0, 1]) {
            return Err(Unsupported);
        }
        let count = samples_in_file(&stbl, &mdat, &mut all_ranges)?;
        let (times, last_delta) = sample_times(&stbl, scale, length, count)?;
        let (presented, declared_presented) = presentation(
            &track,
            movie_scale,
            scale,
            length,
            &times,
            last_delta,
            kind == b"vide",
        )?;
        if longest.is_none_or(|old: MediaRatio| {
            u128::from(presented.numerator) * u128::from(old.denominator)
                > u128::from(old.numerator) * u128::from(presented.denominator)
        }) {
            longest = Some(presented);
        }
        if kind == b"vide" {
            if video.is_some() {
                return Err(Unsupported);
            }
            let codec = match entry.kind {
                b"avc1" | b"avc3" => VideoCodec::Avc,
                b"hvc1" | b"hev1" => VideoCodec::Hevc,
                _ => return Err(Unsupported),
            };
            let width = u32::from(u16::from_be_bytes(
                entry
                    .body
                    .get(24..26)
                    .ok_or(Incomplete)?
                    .try_into()
                    .map_err(|_| Incomplete)?,
            ));
            let height = u32::from(u16::from_be_bytes(
                entry
                    .body
                    .get(26..28)
                    .ok_or(Incomplete)?
                    .try_into()
                    .map_err(|_| Incomplete)?,
            ));
            if width == 0 || height == 0 {
                return Err(Incomplete);
            }
            let config = box_list(entry.body.get(78..).ok_or(Incomplete)?, entry.start + 78)?;
            let codec_config = one(
                &config,
                if codec == VideoCodec::Avc {
                    b"avcC"
                } else {
                    b"hvcC"
                },
            )?;
            if codec_config.body.first() != Some(&1)
                || codec_config.body.len() < if codec == VideoCodec::Avc { 7 } else { 23 }
            {
                return Err(Incomplete);
            }
            let tkhd = one(&track, b"tkhd")?.body;
            let version = *tkhd.first().ok_or(Incomplete)?;
            let matrix = match version {
                0 => 40,
                1 => 52,
                _ => return Err(Unsupported),
            };
            let expected = [0x10000u32, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
            for (i, value) in expected.iter().enumerate() {
                if be32(tkhd, matrix + i * 4)? != *value {
                    return Err(Unsupported);
                }
            }
            if be32(tkhd, matrix + 36)? != width.checked_mul(65536).ok_or(InvalidMedia)?
                || be32(tkhd, matrix + 40)? != height.checked_mul(65536).ok_or(InvalidMedia)?
            {
                return Err(Unsupported);
            }
            video = Some(VideoReferenceFacts {
                codec,
                width,
                height,
                frame_count: count as u64,
                frame_rate: frame_rate(&times, scale, last_delta)?,
                encoded_duration: MediaRatio::new(length, scale)?,
                presentation_duration: presented,
                declared_presentation_duration: declared_presented,
            });
        } else {
            if entry.body.get(8..10) != Some(&[0, 0]) {
                return Err(Unsupported);
            }
            let codec = match entry.kind {
                b"mp4a" => {
                    let configs =
                        box_list(entry.body.get(28..).ok_or(Incomplete)?, entry.start + 28)?;
                    let esds = one(&configs, b"esds")?;
                    let asc = aac_descriptor(esds.body)?;
                    let declared_rate = be32(entry.body, 24)?;
                    let declared_channels = u16::from_be_bytes(
                        entry
                            .body
                            .get(16..18)
                            .ok_or(Incomplete)?
                            .try_into()
                            .map_err(|_| Incomplete)?,
                    );
                    if asc != (declared_rate >> 16, declared_channels) {
                        return Err(Unsupported);
                    }
                    AudioCodec::Aac
                }
                b".mp3" | b"mp3 " => AudioCodec::Mp3,
                _ => return Err(Unsupported),
            };
            let channels = u16::from_be_bytes(
                entry
                    .body
                    .get(16..18)
                    .ok_or(Incomplete)?
                    .try_into()
                    .map_err(|_| Incomplete)?,
            );
            let rate = be32(entry.body, 24)?;
            if !(1..=8).contains(&channels) || rate & 65535 != 0 || rate >> 16 == 0 {
                return Err(Incomplete);
            }
            audio.push(AudioReferenceFacts {
                codec,
                sample_rate: rate >> 16,
                channels,
                encoded_duration: MediaRatio::new(length, scale)?,
                presentation_duration: Some(presented),
            });
        }
    }
    let duration = longest.ok_or(Incomplete)?;
    let actual = u128::from(duration.numerator) * u128::from(movie_scale);
    let declared = u128::from(movie_duration) * u128::from(duration.denominator);
    if video.is_none() || declared < actual || declared - actual > u128::from(duration.denominator)
    {
        return Err(Incomplete);
    }
    all_ranges.sort_unstable();
    if all_ranges.windows(2).any(|w| w[0].1 > w[1].0) {
        return Err(InvalidMedia);
    }
    Ok(MediaReferenceFacts {
        container: MediaContainer::Mp4,
        byte_length: b.len() as u64,
        duration,
        duration_basis: DurationBasis::PresentationTimeline,
        declared_duration: Some(declared_duration),
        video,
        audio,
    })
}
fn descriptor(b: &[u8]) -> Result<(u8, &[u8], &[u8])> {
    let tag = *b.first().ok_or(Incomplete)?;
    let mut length = 0usize;
    let mut header = 1;
    loop {
        let byte = *b.get(header).ok_or(Incomplete)?;
        header += 1;
        length = length
            .checked_mul(128)
            .and_then(|v| v.checked_add(usize::from(byte & 127)))
            .ok_or(InvalidMedia)?;
        if byte & 128 == 0 {
            break;
        }
        if header == 5 {
            return Err(InvalidMedia);
        }
    }
    let end = header.checked_add(length).ok_or(InvalidMedia)?;
    Ok((
        tag,
        b.get(header..end).ok_or(Incomplete)?,
        b.get(end..).ok_or(Incomplete)?,
    ))
}
fn aac_descriptor(b: &[u8]) -> Result<(u32, u16)> {
    if b.get(..4) != Some(&[0, 0, 0, 0]) {
        return Err(Unsupported);
    }
    let (tag, es, rest) = descriptor(b.get(4..).ok_or(Incomplete)?)?;
    if tag != 3 || !rest.is_empty() || es.len() < 3 {
        return Err(Unsupported);
    }
    // Only the ordinary unlinked ES descriptor is supported. Optional URLs or
    // dependency stream identities cannot silently supply external media.
    if es[2] & 0xe0 != 0 {
        return Err(Unsupported);
    }
    let (tag, decoder, _) = descriptor(&es[3..])?;
    if tag != 4 || decoder.len() < 13 {
        return Err(Incomplete);
    }
    let (config, asc, _) = descriptor(&decoder[13..])?;
    if decoder[0] != 0x40 || config != 5 || asc.len() < 2 || asc[0] >> 3 != 2 {
        return Err(Unsupported);
    }
    let index = usize::from(((asc[0] & 7) << 1) | (asc[1] >> 7));
    let channels = u16::from((asc[1] >> 3) & 15);
    let rates = [
        96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
    ];
    if !(1..=7).contains(&channels) {
        return Err(Unsupported);
    }
    let channels = if channels == 7 { 8 } else { channels };
    Ok((*rates.get(index).ok_or(Unsupported)?, channels))
}
