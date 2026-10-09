# Video result transport checkpoint

`niu-media::result::fetch_result` provides bounded retrieval for a private Supplier result URL. It is a transport foundation, not a public preview/download endpoint.

The transport requires HTTPS, rejects embedded credentials, fragments, local domains and literal addresses, and uses the shared upstream client to verify resolved destinations and pin DNS resolution to the connection. It disables redirects and environment proxies, sends no Supplier credential or cookie, requests identity encoding and performs no application retry. Caller-configured byte limits and an overall deadline bound reads. Signed URLs and upstream response bodies are excluded from its error type; returned content has no Debug or Serialize implementation.

Only MP4/WebM video and PNG/JPEG last-frame formats are accepted. MIME and leading file signatures must agree; encoded bodies, active documents and mismatched formats are rejected. Signature checks do not establish decoding validity, content inspection or policy coverage. HTTP 403/404/410 report unavailable media without exposing the upstream body or promising that a URL can be renewed.

Fresh verification: all 23 media tests passed; Clippy passed for all media targets with warnings denied. Three new tests exercise public URL/configuration rejection, redirect/expiry/type failures, chunked size limits, successful bounded reads and image/video separation. Response-reader fixtures use local HTTP only inside tests; the public transport retains its HTTPS/public-destination restriction.

V07/V15 remain open. Result references still need encrypted durable storage, current workspace/key/model authorization, declared retention/deletion, endpoint concurrency limits, inspection where required, safe HTTP delivery headers and rendered preview/download/expiry checks. No raw signed URL is returned to customers, and result retrieval is not advertised as available. Qualified live TLS/CDN retrieval remains separate acceptance work.

The subsequent [saved-result checkpoint](video-result-storage-verification.md) adds encrypted persistence, retention/deletion and current-access API/SDK retrieval. Its remaining dashboard and live acceptance work does not close V07/V15.

## Public HTTPS qualification attempt — 2026-10-07

An opt-in integration test exercises the production `fetch_result` path against the external [WPT media fixture](https://wpt.live/media/2x2-green.mp4). The fixture remains external; the repository does not redistribute it. Run it explicitly with:

```sh
CARGO_INCREMENTAL=0 cargo test -p niu-media --test live_result_tls -- --ignored
```

The test requires a successful bounded MP4 read, rejection under a 16-byte limit, and rejection when the same video is requested as a last frame. It uses no Supplier credential or customer content, and retains certificate validation, public-destination checks, pinned DNS, disabled environment proxies and disabled redirects.

The explicit run failed with `EndpointRejected` before an HTTP request. Native DNS resolved the fixture hostname to `198.18.2.12`, a non-public benchmark address rejected by the production destination policy. A separate environment-mediated HTTP check is not evidence for this transport. No DNS override, proxy allowance or destination-policy exception was introduced. Positive production HTTPS retrieval remains unqualified and requires an environment with public-address DNS and direct TLS reachability.

The subsequent default `cargo test -p niu-media` run passed **47 tests**, with this one network qualification test **ignored**. Those passing tests cover local transport, request, media inspection and output boundaries; they do not establish positive public HTTPS retrieval or close V07/V15.


## Result failure diagnostics — 2026-10-08

The gateway now preserves safe result-retrieval categories rather than reporting
all failures as an undifferentiated upstream error. Timeouts return HTTP 504;
Supplier link unavailability, destination rejection, size limits, invalid media
and transport failures return distinct `media_result_*` types under HTTP 502.
Download saturation returns HTTP 503 `media_result_busy` without claiming that a
Supplier credential is missing. No signed URL, response body or credential is
included. These errors do not erase references, change historical charges,
renew URLs or trigger generation retries. Both public and session-based result
routes share the mapping; OpenAPI and reference documentation describe it.

The current host and disposable container both resolve the public WPT fixture
to reserved benchmark addresses. A container TLS handshake alone does not
qualify production retrieval: the destination policy rejects those DNS results.
No public-address override, proxy or exception was added. Positive public HTTPS
retrieval and the complete rendered result journey remain open.


Verification passed: the Rust HTTP error-mapping test, the PostgreSQL-backed
`video_job_reads_require_current_scoped_model_access` fixture, and all four
JavaScript result tests after rebuilding the SDK. The routed fixture checks the
safe destination-rejection type and DNS guidance, absence of URL/signature
content, model/workspace denial and the existing retention/deletion/access cases.
SDK tests preserve the new categories/statuses and prove a single retrieval
request without automatic retries. OpenAPI parsing, changed-file public-boundary
and whitespace checks passed. Gateway binary Clippy passed with warnings denied. No UI behavior changed in this increment; existing
clients may continue showing their generic retrieval message.

## Media and direct TLS recheck — 2026-10-08

The current `cargo test -p niu-media` run passed 60 tests, with the one public
HTTPS test ignored. The explicit opt-in HTTPS run then failed with
`EndpointRejected`. A fresh native resolver check returned `198.18.1.42` for
`wpt.live`, within the reserved benchmark range rejected by production policy.
No address override or policy exception was applied. Positive public TLS
retrieval remains unqualified; this environment failure does not establish a
Supplier failure. Remote reference ingestion also remains disconnected from
video admission despite its existing library fetch/decode primitive.
