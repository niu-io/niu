# Exact-content media inspection contract

The first-stage facility shares one inspection transport between legacy image
version 2 and typed audio/video version 3. It was integrated at
`84792c7a6d6929c7810e836b0a50dcfeb8582e1d` and exposed at
`45395e7e01917e0691acc9c6b2f303128390bf6b`. This identifies implemented source;
it does not establish a configured detector's positive behavior or a complete
material-to-task workflow.

## Compatibility and adapter payloads

The existing `ImageInspectionContract`, `ApprovedImage`, version-2 fields and
error meanings remain compatible. Image responses still reject unknown fields
and require the exact version, detector revision and content SHA-256. The public
image API continues to construct its original image data URI before using the
shared transport.

| Protocol | Request fields | Required response echo |
| --- | --- | --- |
| ImageV2 | `schema_version: 2`, `detector_revision`, `content_sha256`, `image` | Version 2, exact revision and SHA, plus `verdict`. |
| MediaV3 | `schema_version: 3`, `detector_revision`, `kind`, `content_type`, `byte_length`, `content_sha256`, `media: { encoding: "base64", data }` | Version 3, exact revision, kind, MIME, byte length and SHA, plus `verdict`. |

Media kinds are `audio` and `video`. The encoded `data` contains the entire
original file, including embedded tracks; a thumbnail, selected frame or changed
content cannot stand in for those bytes. The response has only the listed typed
fields and rejects unknown fields. `verdict` accepts `clear` or `matched`.
Matched, malformed, mismatched or unavailable responses never produce approval.

This is Niu's versioned detector adapter contract. It neither claims that an
existing external service implements it nor creates consent to disclose content.
In particular, MediaV3's Base64 bytes are an inspection-service payload; they do
not establish Ark support for Base64 video inputs.

## Bounds and opaque ownership

`PreparedMedia::new(kind, content_type, bytes, permit)` validates complete native
facts and retains the caller-reserved semaphore permit. Audio/video input and the
configured encoded-byte ceiling are bounded at 8 MiB. Playback-unknown audio
cannot obtain a duration-qualified preparation from encoded duration alone.
Images retain their existing separate contract and decode limits.

The shared core performs one POST with checked/pinned DNS, disabled environment
proxies, redirects and transport retries. A positive caller deadline of at most
30 seconds covers client acquisition, send and response reading. Response bytes
are limited to 4,096, including chunked responses. Credentials, configuration
revisions and limits are validated before transport. A timeout does not prove
that a detector stopped processing remotely.

`PreparedMedia` is input, not a verdict. Building its request cannot construct an
approval. Only a genuine exact MediaV3 Clear response returned by `inspect` can
construct opaque `ApprovedMedia`. It retains the original bytes, native facts,
kind, MIME, SHA, detector revision and capacity permit until dropped. Neither
input nor approval implements Debug/Serialize, so raw bytes cannot enter logs
through ordinary diagnostic formatting.

Current access, explicit recipient consent, configured detector fingerprints,
required-detector coverage and durable authorization must still be established
by callers. Declared processing guarantees are not verified service coverage.
No configured service or credentials must fail closed rather than create a local
Clear verdict.

## Actual native preparation checkpoint

A standalone native probe compiled from the implementation consumed the original
real retained MP4 and its original decoded WAV. A separate verifier reopened
those same files, invoked the retained probe again and decoded the private
constructed requests. The decoded Base64 exactly matched each original file;
kind, MIME, length and SHA were independently compared. Original media were also
fully decoded independently. Capacity remained held while prepared input was
retained and was released on drop.

The original real Xing/Info MP3 returned `UnsupportedFacts`. The additional
non-Xing MP3, whose encoded timing is known but playback timing is not, returned
`IncompleteFacts`. Both refused preparation and released capacity. These original
refusals were not replaced with easier inputs or invented timing.

No network request, detector verdict or approval was created. This verifies
bounded request preparation and byte binding only. A real configured detector's
transport positive and failure behavior remain unverified. Runtime/configuration,
policy and SQL receipt integration, Provider handoff and atomic audio/video task
binding are later stages; they are not completed by this checkpoint. Media facts
and inspection results are never billable usage meters.
