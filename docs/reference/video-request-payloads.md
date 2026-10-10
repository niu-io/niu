# Video creation request content in Logs

Fresh video submissions use the existing request-payload retention and scoped
read/delete APIs. Capture defaults on; a single `x-niu-log-payloads: false` header
opts out. Invalid or repeated values return 400 before submission. This applies
to workspace-key creation, dashboard selected-key creation and saved-intent
submission. A fresh creation response includes `x-niu-attempt-id`.

The retained request is the customer video document after input inspection and
redaction, with credential fields removed. Saved-intent submission captures that
inspected document, not its revision-only submit envelope. The response is the
Niu creation response streamed to the client. Capture completeness describes that
HTTP body, not completion of video generation. A 202 `submission_unknown` response
remains uncertain even if its response body was completely captured.

This is not raw upstream transport capture. Provider credentials, upstream request
bodies, job references and private result URLs are not added to Logs. Subsequent
query responses and video files are not appended to the creation capture. Saved
intent content and creation payloads have independent retention and deletion.

Request capture is skipped above 1 MiB without reducing the video endpoint's
existing image-body limit. Response capture uses the existing bounded stream
collector. Storage expires at the original attempt creation time plus 24 hours,
not at the time of a later read or retry. Reads hide expired content immediately;
background maintenance erases it. Deletion leaves a tombstone, preventing late
capture writes from restoring erased content.

Identical submission replay returns the original job without attaching a new
capture. Thus replay cannot extend retention, recreate deleted content, turn an
opted-out original request into a retained one, or invent the original Provider
response. Existing jobs are not backfilled from saved intent content. Use the
existing scoped `.../requests/{attempt}/payloads` API and its authorization rules;
no new response shape or SDK method is required.

## Current-input verification — 2026-10-11

An isolated native Gateway and PostgreSQL run used actual OpenRouter video
requests. Deliberately invalid temporary credentials produced real upstream 401
responses and retained `submission_unknown`; the corresponding Logs capture
contained the inspected customer document and Niu 202 response, with no credential
or upstream error body. Saved-intent submission retained its video document rather
than the revision-only submit body.

Explicit opt-out left no capture. An invalid capture header returned 400 without
another attempt. Deleting a capture and replaying the original submission did not
restore it. Reading under a foreign workspace returned no payload. With the saved
personal credential on an isolated configuration, dashboard selected-key creation
was accepted by the actual upstream and bound a saved job. Its capture matched
the request and Niu creation response. Gateway restart preserved that capture,
the deletion tombstone and the opted-out absence.

Independent verification reopened the stopped database and compared saved JSON
with the HTTP artifacts. Both retained captures were complete and untruncated;
their expiry equaled original attempt creation plus 24 hours. Exactly four original
submission attempts remained, with no customer charge, balance entry or reservation.
Original development data and encrypted identity were unchanged.

This qualifies the exercised creation/uncertainty/retention paths. It does not
establish that the newly accepted video completed, retained raw upstream transport,
qualified paid media settlement, exercised populated image capture above its bound,
or verified the frontend rendering. No fixture outcome supports these findings.

### Inspected content, non-admin access and completed result

A further actual request activated a workspace input-redaction rule before a
video submission. Its capture retained the inspected text with `[REDACTED]` and
excluded the original marker; an independent SQL read checked the stored request,
not only the read API. The upstream returned an actual authentication rejection,
so the attempt remained uncertain and no customer charge was invented.

A workspace viewer could read the capture with `Cache-Control: no-store` but
could not delete it (403). A foreign-workspace viewer could neither read it (404)
nor delete it (403: its role lacks write permission). These refusals preserved the
capture. A scoped owner could delete it, and replay did not restore it. An initial
verifier incorrectly expected 404 for the foreign viewer's DELETE; the corrected
complete run respected the permission-first write check. No fixture result was
used to diagnose or qualify this behavior.

The previously accepted valid video was subsequently refreshed through the
current API and reached `succeeded`. After gateway restart, its result downloaded
through scoped Niu retrieval and passed independent full video decoding. Final
artifact inspection matched the file bytes and SHA-256 to the decoding report.
The original creation capture remained identical through refresh, completion and
result retrieval. PostgreSQL retained one submission for that video, the original
four attempts from the creation checkpoint, and no customer debit. No new video
was submitted by this recovery check.

This adds completed-result and non-admin payload-access evidence to the creation
checkpoint. Positive commercial media usage/settlement, image capture, raw
upstream transport retention and frontend rendering remain separate work.
