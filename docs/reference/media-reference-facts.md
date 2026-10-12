# Native media reference facts

The `niu_media::media_reference_facts` module extracts bounded native facts from
complete MP4, WAV and supported MP3 files without an external shell, transcoding
or a network request. It is a format/timing facility, not content inspection,
Provider qualification or permission to submit a saved material to a task.

`inspect_reference_facts(content_type, bytes)` returns `MediaReferenceFacts` or
`MediaReferenceFactsError::{InvalidMedia, Unsupported, Incomplete}`. Inputs are
limited to 8 MiB. Existing library format validators are reused before facts
extraction. Unknown, missing and unsupported facts are never replaced with
estimates based on file size.

## Typed interface

| Type | Meaning |
| --- | --- |
| `MediaRatio` | Exact reduced unsigned numerator/denominator; construction is private and the denominator is always positive. Read through `numerator()` and `denominator()`. Serialize large integers as strings at API boundaries. |
| `MediaReferenceFacts` | Container, byte length, effective duration, `DurationBasis`, optional declared container duration, optional video facts and all supported audio tracks. |
| `VideoReferenceFacts` | Declared AVC/HEVC codec, dimensions, frame count, constant or variable frame-rate facts, encoded duration, effective presentation duration and optional declared edit duration. |
| `AudioReferenceFacts` | Declared PCM, float, AAC or MP3 codec, sample rate, channels, encoded duration and optional presentation duration. |
| `DurationBasis` | Distinguishes a supported presentation timeline from encoded sample duration. These quantities are not interchangeable. |
| `FrameRate` | Either an exact constant ratio or exact minimum/maximum presentation cadence; no average is substituted for variable cadence. |

Codec facts are parsed declarations, not proof that every encoded frame decodes
safely or that content is permitted. MP4 parsing checks complete sample tables,
local sample ranges within media data, timebases, supported edits and track
identity. It rejects fragmented movies, unsupported track types, multiple video
tracks, external media references, unsupported rotations and ambiguous timing.
The finite track bound is eight. WAV timing uses complete aligned sample data and
the validated sample rate. MP3 timing parses complete Layer III frames; mixed
stream parameters and unsupported gapless metadata are refused.

## Actual current-input verification

The implementation originated at `78b1abc3` and was integrated at `93ad1b709407860bfb5a0d52ba84488f23168b55` with
module exposure at `834e7d81a73a70379b839818e087290ca732e0e1`. These are implementation identities, not evidence of
Gateway task integration. A retained standalone native probe was compiled from
the leaf; its source and executable hashes and original input hashes were saved
privately. A separate verifier reopened the real retained files, invoked that
probe again, compared exact FFprobe packet/native timebases and independently
fully decoded the media. No fixture outcome or new upstream generation was used.

| Actual input | Native result and independent comparison |
| --- | --- |
| Original real generated MP4 | AVC, 848 × 480, 25 frames, constant 24 fps; effective video/overall duration `25/24` seconds matches independent packet presentation bounds. Its AAC track is 48 kHz stereo, with one-second presentation duration. |
| Original decoded WAV | PCM, 44.1 kHz stereo, exactly `44217/44100` seconds (`4913/4900` reduced), matching FFprobe native sample count/timebase. |
| Original real MP3 with Xing/Info metadata | `Unsupported`; no gapless playback duration was invented. |
| Additional locally derived MP3 without Xing metadata | Exact encoded packet duration `256/245` seconds; presentation duration remains unknown. FFprobe's estimated format duration was 1.044875 seconds and was not treated as exact equality. |
| Locally derived variable-rate MP4 without frame reordering | Nine frames, exact cadence range 8–24 fps, `25/24` seconds; independent packet presentation times matched. |
| Locally derived reordered variable-rate MP4 | `Incomplete`: the media-header duration was 14,336 ticks while the complete decoding-time table summed to 12,800 ticks. No reconciliation was inferred. |
| Locally derived MP4 with two audio tracks | Both supported AAC tracks were enumerated and compared independently; neither was silently omitted. |

The original MP4 declares `521/500` seconds in its movie/edit timeline, while the
covered presentation packets end at `25/24` seconds. The millisecond declaration
rounds beyond the effective packet duration. Both quantities are retained;
the discrepancy is not rounded away or described as a matching playback value.
Local derivations remain separate inputs and do not replace the original MP3 or
reordered-video refusals with easier examples.

## Provider and task boundaries

The [official Ark create-task contract](https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh)
documents audio URL/Base64 inputs and video URL or Provider asset-ID inputs.
It does not establish `data:video` support. Transport must honor the selected
model/channel contract rather than extend it from a generic data-URI parser.

Encoded MP3 duration cannot substitute for the playback duration required by
an Ark reference limit. Model-specific duration, codec, count, role and combined
input constraints remain separate policy validation. None of these timing facts
is a reported billing meter: requested duration, file duration and Provider
expense must never be converted into billable usage.

This module is not yet connected to saved audio/video task resolution. Audio/video
inspection contracts and receipts, Provider-upload authorization or controlled
fetch capabilities, and atomic task bindings remain separate implementation
work. Existing library CRUD and existing image bindings do not fulfill those
requirements. This checkpoint does not establish a complete Seedance workflow.
