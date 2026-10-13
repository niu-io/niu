# Durable Video submission intents

Actor-owned, workspace-scoped intents preserve a text-video request before the
explicit submission action. Browser storage is not the source of truth. These
management APIs require the signed-in actor's workspace permission; they do not
use a workspace API key as a management session.

All paths below are relative to
`/admin/v1/organizations/{organization}/projects/{project}/video-intents`.
The legacy `project` path segment means workspace.

| Method | Suffix | Behavior |
| --- | --- | --- |
| GET | none | Page the current actor's intent index with `before` and `limit` (1–100, default 25) |
| PUT | `/{intent}` | Save a fresh client-generated UUID and immutable validated request; identical retries return the existing record |
| GET | `/{intent}` | Restore retained content and read its original submission/job state without polling or dispatch |
| POST | `/{intent}/submit` | Explicitly submit or replay the original identity using the expected revision |
| DELETE | `/{intent}` | Clear retained request content using the expected revision; retain an identity tombstone |

The executable handler annotations generate the request/response schemas in
[`contracts/generated/handler-operations.json`](../../contracts/generated/handler-operations.json).
The root OpenAPI contract references those operations.

## Save and submit

A save body contains `key_id` and `request`, for example:

```json
{
  "key_id": "<selected-workspace-key-id>",
  "request": {
    "model": "configured-video-alias",
    "content": [{"type": "text", "text": "A blue circle on a white background"}],
    "duration": 1,
    "resolution": "480p",
    "ratio": "16:9"
  }
}
```

Controls and values must match the selected model's actual schema; the example
is not a universal capability declaration. Configured defaults are materialized
in the saved request. Reads return that validated document with the customer
model alias, never an upstream credential or private model mapping. The request
is limited to 60 KiB encoded JSON; the entire HTTP save envelope is limited to
64 KiB. Only text input is supported. Media references and callbacks are rejected
before creating an intent or dispatch attempt.

Saving requires write permission and a currently authorized selected key. It
validates the configured model, policy and funding mode but creates no inference
attempt, upstream call, reservation or charge. The original key and normalized
request are immutable. Changed content or key association under the same intent
UUID returns 409, including after content deletion. A distinct explicit creation
must use a new UUID.

`POST /{intent}/submit` accepts `{"expected_revision":1}`. It uses only saved
content; callers cannot replace it in the submit body. Before a new dispatch,
current admission is revalidated and a changed owner-funded/customer funding
mode conflicts. Existing price and spending rules still apply; a saved intent is
not a price quote, reserved capacity or permission to bypass current policy.

An internal server-generated submission identity is persisted separately from
request content and never returned as a legacy `Idempotency-Key` header. Clients
must use this submit route for a saved intent. Concurrent/restarted submissions
resolve through the existing durable at-most-once media preparation mechanism.
A 202 response can represent unresolved submission and is not proof of success,
reported usage or a customer charge.

## Restoration and isolation

Each operator is a separate actor, even when another operator or installation
administrator can access the same workspace. Installation credentials share one
installation actor. Read and write workspace permissions apply independently.

The index exposes only IDs, revisions, retention state and expiry. Full historical
reads require current workspace Read permission and the original actor-owned
intent, independently of inference key expiry, revocation or model grants. They
return `original_key_id` and an available rotation-lineage `key_id`, falling back
to the original key ID when no valid successor exists; these IDs are context,
never an action grant or a key secret. Retention and actor isolation still apply.
An unrelated key cannot replace the billing source. Submission, estimation and
upstream checks continue to require current model grants, source policy and an
active key in the original rotation lineage.

A full read returns `submission_state` and a nullable `job`:

- `saved`: no original media preparation exists yet. GET does not start it.
- `not_dispatched`: original preparation exists but has no recorded dispatch.
  It may still be running or have been interrupted. Replay does not grant another
  caller permission to start generation from that preparation.
- `dispatched`: dispatch intent was recorded. The job may still be unresolved;
  its saved status remains distinct from result availability and billing.

Restoration does not poll the provider, reserve funds or infer that an unknown
submission is safe to retry with a new identity. Continue reading the original
intent/job. Changed input requires an explicit new intent, not automatic recovery.

## Retention and deletion

Request content is retained for 30 days from initial creation, without sliding
extension. Expired content is unreadable immediately; bounded background cleanup
clears it from live storage. Explicit deletion clears the document and increments
its revision. Replaying the same successful deletion returns the same revision.
The identity, request digest, original key association and tombstone remain to
prevent resurrection and retain linkage to an already prepared job. Deployment
backups have their own retention policy.

Deletion is not cancellation: it does not stop a submission already accepted
concurrently, erase a job/result, release uncertain liability or refund charges.
After deletion or expiry, submit returns a conflict. Index metadata remains
available to the owning actor. These rules do not establish image/reference-input
recovery parity.

## Qualification boundary

The endpoint implementation and generated contract are separate from complete
frontend acceptance. Browser response interruption, reload and cache-free
restoration must still be exercised by the frontend workstream. Customer-funded
media settlement and 30-day wall-clock expiry require their own evidence.


### Current native observations

On 2026-10-10 an isolated native gateway and PostgreSQL database exercised all
five operations with current HTTP inputs. Concurrent identical saves retained one
intent and no attempts or ledger entries. Another actor in the same workspace
could not read it, and a foreign workspace was denied. Changed content or an
unrelated active key under the same identity conflicted. Deletion replay retained
the same tombstone; images were rejected. Revocation denied full reads while
actor-owned deletion remained possible. Key rotation and gateway restart preserved
the normalized document and original key lineage.

One real personal OpenRouter video was then submitted concurrently; one caller
read the accepted HTTP headers and discarded the response body. Restoring the
intent and replaying after restart returned the original job. Independent SQL
showed one dispatch attempt and one submission transport span, and no customer
charge. The job reached `succeeded`; its authorized downloaded result passed
independent full video decoding. This is HTTP-level interruption evidence, not
browser verification or a new commercial Supplier qualification.

A separate current-input run changed model defaults after saving an omitted
control. The retained document kept the original explicit value; re-saving the
changed normalized request conflicted. A temporary failure trigger in that
isolated database interrupted the actual dispatch write. After removing the
trigger and restarting, both GET and explicit submission replay retained the
same `not_dispatched` preparation, without a new attempt, transport span or
balance entry. No synthetic upstream response was used. The original development
database, saved credentials and encryption identity were not replaced.

## JavaScript integration

`@niu-io/sdk` exposes `saveVideoIntent`, `getVideoIntent`, `listVideoIntents`,
`submitVideoIntent`, and `deleteVideoIntent` on `NiuAdminClient`, with exported
request, record, index, and deletion types. See the
[SDK usage example](../../sdks/javascript/README.md#durable-video-submission-intents).
The current native backend was exercised through the built SDK for save, list,
restore, idempotent content deletion, and rejection of a deleted submission.
Independent database inspection confirmed no submission preparation in that
management-only run. This does not qualify browser recovery or customer-funded
video settlement.

### SDK pagination and restoration beyond one hundred records

On 2026-10-11, a fresh native Gateway and database received 105 distinct
current-input saves through the built JavaScript SDK. After reading the first
100 index entries, the client saved another intent and deleted the oldest
original intent. Continuing from the first page's cursor returned the remaining
five original identities exactly once, including the deletion tombstone, without
including the newly inserted record. An unknown cursor and submission of the
deleted intent returned conflicts. A second actor's index remained empty.

After rotating the selected key and restarting the Gateway, a fresh traversal
returned all 106 identities. Full reads restored every retained request exactly,
preserved the original key identity, selected its current rotation successor and
returned the deleted request as null. Independent reopening of PostgreSQL matched
all saved documents to the actual SDK inputs, the single revision-2 tombstone and
the revoked verification key lineage. There were no dispatch attempts, media
jobs, customer charges, balance entries or reservations.

This verifies backend/SDK pagination and persistence for the exercised concurrent
changes. Separate pages are not one database snapshot. It does not establish
browser restoration, video generation, customer-funded media settlement or
30-day expiry behavior. Existing development data was unchanged.

## Concurrent status reads

Restoration reads the dispatch marker and job observations in one database
statement snapshot. The public job-state endpoint uses the same read and status
reduction; conflicting terminal observations still require reconciliation.
This prevents combining an earlier undispatched marker with a later queued,
running, or completed job. The enclosing intent content and authorization checks
are separate reads; this is not a transaction-wide snapshot of every field.

A current-input personal video submission was sampled through 150 concurrent
restore requests, then recovered after response loss and process restart. The
same single upstream submission reached success and its downloaded video fully
decoded. Independent database inspection found one submission and no customer
charges. A separate native database dispatch interruption retained one prepared,
undispatched attempt across restart and explicit replay, with no transport or
ledger entry. These runs cover the exercised states, not every possible
interleaving or customer-funded video settlement.


## Bounded saved-submission identity read — 2026-10-12

The shared saved-submission identity lookup now uses the existing bounded
read-only transaction initializer in clean `73d0c46`. It has transaction-local
250 ms lock and 2 s statement limits, and ends before job-state restoration or
any network work. Unavailable identity storage returns a safe error; it must not
be treated as an absent submission or permission to dispatch again. The original
request-digest comparison and conflict behavior are preserved. This does not
bound every preparation, dispatch, authorization or job-state read.

Current-input verification used stopped copies of one actual completed personal
video and its original workspace-scoped creation identity. The original saved
request digest was independently matched before replay. No new video was generated.
The exercised HTTP surface was compatible `POST /v1/video/jobs` with its original
`Idempotency-Key`; this is not browser or intent-submit acceptance.

Clean `7fa886b` was observed blocked in the saved-identity SELECT during an
exclusive native PostgreSQL table lock. The replay stayed pending through
1,607.23 ms, then returned HTTP 202 with the same completed job after release.
Clean `73d0c46` returned sanitized HTTP 503 in 264.14 ms while the lock remained
held. No empty-success body or database object name was returned; PostgreSQL
recorded lock-timeout cancellation. After lock release and restart, identical
replay again returned the original succeeded job. Changed input returned 409,
and revoked-key replay returned 401.

Independent reopening verified the original request/key digest binding, unchanged
full-row fingerprints of creation identities, attempts and jobs, and exactly one
original submission transport record. Replays produced no new transport or
financial entry. The result was subsequently fetched through current authorized
HTTP: 90,729 bytes of MP4 matched the original retained file hash. Independent
FFprobe inspection and full FFmpeg decoding checked measurable video content.
That result retrieval has its own transport observation; it is not another
submission. Billing remained owner-funded. Customer charges, Supplier earnings,
funding receipts and outstanding customer/procurement holds were absent.

This qualifies the stated saved-identity contention/replay and existing-result
recovery path. It does not establish new-generation concurrency, customer-paid
media, intent-submit/browser restoration, natural expiry, every lost-response
interleaving or a complete request deadline. Static clippy and annotation checks
completed separately; fixture outcomes are not evidence. Native replacement
followed a fresh isolated backup restore/comparison, retaining the original
configuration, encrypted identity and durable business record counts.
