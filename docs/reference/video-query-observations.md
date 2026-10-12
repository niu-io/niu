# Saved video query observations

Implemented and exercised on clean backend/SDK `0f6319b`, reviewed 2026-10-12.
These are immutable query receipts, independent of customer settlement. Fixture
outcomes provide no evidence.

## Interfaces

- `GET /v1/video/jobs/{id}/observations` uses a workspace API key.
- `GET /admin/v1/organizations/{organization}/projects/{workspace}/keys/{key}/video/jobs/{job}/observations`
  uses workspace read permission and the selected key, without exposing its secret.
- SDK: `client.video.jobs.observations(reference, query)` and
  `admin.getDashboardVideoObservations(scope, keyReference, jobReference, query)`.

`query` accepts optional `limit` (1–100, default 50) and `after`, an opaque
64-character receipt reference. Results contain `data` and `next_cursor`, which
is null at the end. Missing cursors within the authorized job return 409;
malformed inputs return 400. Unknown/out-of-scope jobs return 404. Unauthorized
or revoked credentials are rejected. Every successful read returns no-store.

Receipts are ordered by descending saved observation time and receipt reference.
The cursor lookup and page share a bounded read-only snapshot with 250 ms lock
and 2 s statement limits. Authorization and the whole-request deadline are
separate. Pages are a live view, not a frozen report. A storage failure returns
503 rather than successful empty history.

| Field | Meaning |
| --- | --- |
| `cursor` | Internal continuation reference; never display as a product label |
| `observed_at_ms` | Niu persistence observation time, in Unix milliseconds |
| `status` | Saved query observation; not an inference about current upstream state |
| `meter` | Protocol's declared unit; its presence does not establish measured usage |
| `quantity` | `missing`, `invalid`, or `reported` with a canonical decimal-string value |
| `provider_times` | Missing/invalid or reported epoch-second strings; separate from measured transport spans |

Empty data means no saved query receipt in the selected range. A saved receipt
with missing quantity is explicit missing evidence; it must not be rendered as
zero. Reported quantity is an observation, not a customer charge or immutable
settled usage. Keep the billing and timing APIs for those separate meanings.

The projection contains no upstream job/model identity, result URL, credential,
raw error, cost, procurement rate or configuration revision. Reading does not
poll upstream, submit work, reserve funds or change financial records.

## Actual current-input checkpoint

An isolated stopped copy retained a real generated video with two query receipts:
queued and succeeded, both with missing quantity and provider timestamps. An
actual no-expiration key read the complete receipts and two one-row pages. An
ordinary viewer read the same records through the dashboard bridge. Both freshly
compiled SDK methods made real HTTP reads matching the complete response.

Past-tail and uppercase cursors returned the appropriate empty ending page;
unknown cursors, invalid sizes, malformed syntax, unknown jobs and foreign scope
were refused. An exclusive native receipt-table lock held each API/dashboard read;
the calls returned sanitized 503 in 270.99 and 261.60 ms while the lock remained
held. Release and restart restored identical results. Temporary keys and viewer
access were revoked; subsequent calls returned 401.

Independent PostgreSQL reopening matched every field, receipt ordering, both
pages and SDK results to the original immutable receipts. Full-row fingerprints
for attempts, jobs, submission identities, query evidence, transport timings,
charges, ledger, funding and Supplier earnings were unchanged. One original
submission remains; no new generation, financial entry or transport query was
created by these reads. Native refresh followed a fresh isolated backup restore
and retained original configuration, encrypted identities and durable counts.

This verifies the exercised saved missing-quantity receipt path, two-record
pagination, scoped reads, lock recovery, SDK methods and restart. It does not
qualify nonempty reported/invalid quantity paths, every concurrent permission
change, larger history/performance, browser presentation or paid-media settlement.
Static compilation, lint, formatting and contract extraction were checked
separately and are not substitutes for this current-input evidence.

## OpenRouter quantity boundary

A separate current authenticated GET for the original real video returned 200.
Its usage fields were cost and BYOK status; it supplied no duration, output-second
or billable-quantity field. Its generation metadata also returned 200 but native
prompt/completion token and media counts were null. The retained Niu receipt's
quantity remains missing. No cost amount, private identity or raw response is
published here.

The current [OpenRouter poll contract](https://openrouter.ai/docs/api/api-reference/video-generation/poll-video-generation-status)
and [video guide](https://openrouter.ai/docs/guides/overview/multimodal/video-generation)
describe usage cost separately from the generation controls. This does not
establish an actual reported quantity for Niu's seconds tariff. Requested duration,
file-probe duration and upstream expense must not be substituted as reported
billable units. Customer-funded OpenRouter video remains unavailable under this
channel contract; personal owner-funded operation and saved-result access remain
separately exercised. This channel-specific boundary does not require activating
every external payment integration to qualify implemented backend capabilities.
