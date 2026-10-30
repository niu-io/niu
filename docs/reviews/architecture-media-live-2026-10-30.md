# Real video result acceptance — 2026-10-30

This follow-up supplies the missing current-input evidence for `niu-32s.3`.
The [initial review](architecture-media-2026-10-30.md) found that all available
historical Provider files had expired. The user subsequently authorized one
inexpensive new video generation. No fixture outcome supplies evidence here.

## Execution and provenance

The current native Gateway ran against the isolated database copy used by the
architecture review. Source was `282dd68` with the documented working-tree
repairs and behavior-preserving formatting/type-alias cleanup. Executable
SHA-256:
`002c60527bf689b19ae5f97e94240fa5f813f391b1d481a273af6f4bc5924942`.
No product code was changed during this follow-up. The original database and
production deployment were not modified.

The actual [OpenRouter video catalog](https://openrouter.ai/collections/video-models/)
and model endpoint were inspected before submission. The existing personal route
mapped to `x-ai/grok-imagine-video-1.5-lite`, with one second, 480p and 16:9.
Niu's discovery and estimate APIs confirmed that finite configuration. The prompt
described a blue ceramic cube on a neutral tabletop, with no people or text.

Exactly one `POST /v1/video/jobs` returned 202 and a durable receipt. A normal
refresh returned 200 with `succeeded`. The independently fetched exact Provider
job receipt reported completion and a charge; the private cost record remains
outside the public repository. No retry or second generation was submitted.
Every concurrency and cancellation operation reused this single result.

Independent PostgreSQL inspection confirmed one attempt for the temporary key,
one dispatched attempt, one bound media job, one output snapshot, one successful
job observation and one submission receipt. The copied database's media-job
count increased from five to six. The route remained `owner_funded`; no customer
charge, reservation or ledger entry was fabricated from the upstream cost.

## Independent artifact inspection

The normal authenticated result endpoint returned a 213,782-byte MP4.
Its SHA-256 was
`277e5f4b0047843e1d6814258bc9e3e2277b23ff141d5ba24e18bdb79e211fcf`.
Independent `ffprobe` inspection found H.264 at 848×480, 25 frames and
1.041667 seconds, with AAC audio and an MJPEG thumbnail stream. Full `ffmpeg`
decoding completed, and a separately extracted frame showed the requested blue
cube. All 22 saved complete response artifacts, including the baseline, matched
the original bytes and digest. Partial and rejected responses were not counted
as complete videos.

## Real overload and cancellation

All requests below traversed the authenticated Gateway, current authorization,
actual Provider download, memory reservation and ordinary HTTP response path.
No simulated Provider, loopback media route, database lock, test hook or schema
mutation was used to create these observations.

| Current-input operation | HTTP observation | Independent persisted result transports |
| --- | --- | --- |
| Eight simultaneous result GETs with no held response | Four 200 videos; four local 503 `media_result_busy` responses | Increased by four, from 1 to 5 |
| HTTP/2 result response with an acknowledged stream window of one byte | 200 headers and exactly one DATA byte; no END_STREAM; no WINDOW_UPDATE sent | One real result receipt added |
| Eight simultaneous GETs while that HTTP/2 frame remained flow-controlled | Three 200 videos; five local 503 capacity refusals | Increased by three, from 16 to 19 |
| `RST_STREAM(CANCEL)` on the held stream, retaining the HTTP/2 connection, followed by eight GETs | Four 200 videos; four local 503 capacity refusals | Increased by four, from 19 to 23 |
| Final complete GET after cancellation | 200, original byte count and digest; full decode succeeded | Increased to 24 |

Each new video download reserves 64 MiB before the Provider GET. The completed
small result then retains only its allocated capacity. Holding that capacity
leaves insufficient room for four further full 64 MiB reservations. The observed
change from four admitted downloads to three, then back to four after stream
cancellation, checks that the response data retains its memory ownership and
that cancellation restores admission capacity. Local capacity refusals had no
corresponding Provider-result transport receipt. The absence of those receipts
is corroborated by the source admission order, which returns before the GET.

An earlier HTTP/1 slow-reader operation did not establish a held buffer:
macOS enlarged its receive buffer beyond the file size. It was excluded from
the cancellation proof. The acknowledged HTTP/2 one-byte window established the
required condition independently of OS receive-buffer tuning.

## Final state and limits

Final independent database inspection found one new job/attempt, one submission
receipt and 24 result receipts. The temporary verification key was revoked
through the API with 204; a subsequent result request returned 401 without adding
another result receipt. Private credentials, task references, Provider URLs,
cost records and original video artifacts remain outside the public tree.

This evidence satisfies the finite media allocation, delivery, overload and
cancellation acceptance scope for the repaired path. It does not establish a
whole-process RSS ceiling, sustained production throughput, every maximum-size
file, every protocol failure, customer-priced video billing, or a complete
product release. Source reservation limits and a successful real workflow must
not be presented as those broader guarantees.
