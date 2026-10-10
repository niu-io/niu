# Video job API

Status: owner-funded direct-channel text submission, persisted-state reads and opt-in polling are implemented. Customer media-rate publication is available to platform administrators. Prepaid text-input submission, explicit refresh and opt-in automatic recovery are implemented for configured qualified offers. Scoped result retrieval and deletion are implemented. Configured, consented inline image-plus-prompt submission has local API coverage. Complete reference-input workflows and live video qualification remain pending.

### Personal OpenRouter video

The `openrouter-video-v1` channel supports personal owner-funded text requests
on an `openrouter` credential. Configure a private model mapping with a video
schema based on the actual upstream model capabilities. Supported controls are
`duration`, `resolution`, `ratio` and `seed`; the adapter converts text content
to `prompt` and `ratio` to `aspect_ratio`. Unsupported controls and reference
inputs fail before dispatch. Customer-funded OpenRouter video remains disabled
because its reported billable quantity has not been qualified.

Use `OutputSecondsV1` for the optional output estimate. This estimator can omit
the frame-rate control; `effective_output.frames_per_second` is then `null`.
Clients must omit the FPS label when it is absent. Pixel estimation still
requires a positive frame rate. Estimates never substitute for reported usage.

Submission, scoped history/status, explicit refresh, opt-in `NIU_VIDEO_POLLING`
recovery, billing explanation and encrypted result references use the existing
video APIs. Result download authenticates the pinned OpenRouter content endpoint
and never forwards that credential across redirects. Actual upstream responses
without a reported quantity retain unknown usage and no customer charge.

See the [backend lifecycle checkpoint](../releases/openrouter-video-gateway-verification-2026-10-09.md)
for the exercised model and restart/result evidence. The rendered frontend and
additional model/input combinations remain unverified.

## Customer capability discovery

`GET /v1/video/models` (`client.video.models.list()`) returns configured video controls for the current workspace key. The signed-in dashboard uses `GET /admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/models`, exposed as `admin.listDashboardVideoModels(scope, keyId)`, with read permission and an active selected key. Key secrets are not required by the dashboard session path.

Each model contains its customer alias, owner-funded/customer mode, text limits, allowed controls/defaults, required/exclusive controls and mapped output dimensions. The implemented direct-channel video-token subset and personal OpenRouter seconds-estimate subset are returned. Unmapped resolution/ratio choices, unsupported meters/channels and callback controls are omitted. Current key/model grants, workspace/key Guardrails and Supplier availability apply; personal models remain limited to their owner organization. No upstream mapping, credentials, revisions or purchase rates are exposed.

With configured required image detectors and current processing consent,
`input_types` can also contain `image_url`. Its limits intersect the model schema
and every required decoder: maximum image count, inline reference bytes, dimensions
and decoded bytes. Only inline PNG/JPEG/WebP are advertised; `https` is false.
Roles and `role_required` follow the schema. `requires_text` is true because this
path requires a prompt. `requires_image` identifies policies that deny text-only
submission. Discovery does not reserve capacity or disclose images; submission
rechecks consent and reserves the complete image set before inspection. Remote,
image-only and audio/video references remain unavailable in this path.

Discovery makes no upstream request, creates no job and reserves no funds. It is not a quote or a promise of admission: customer selling tariffs, current configuration, policy and funds are checked by estimates and again by submission. Consumers must honor the output resolution/ratio pairs rather than assuming every combination of choice values is valid. Live-channel qualification and the rendered Video workflow remain open.


## Configure model constraints

In Admin → Suppliers, open a Supplier → API keys & routes → Model routes → Add/Edit mapping → Configure video. General, Inputs, Controls, Output and Rules separate the exact channel, request limits, supported input roles/transports, generation ranges/choices/defaults and incompatible combinations. Limits are entered from the applicable contract, not supplied as universal presets. Apply configuration changes the mapping draft; Save mapping persists it through `POST /admin/v1/vendors/{id}/models` with the current `expected_revision`. Cancel discards the editor draft; removal takes effect only after the mapping is saved.

The saved `capabilities.video_schema` follows the versioned `VideoSchema` management contract. Alias and upstream model bindings are taken from the enclosing mapping; internal schema revisions are not displayed. Changed constraints or bindings get a new revision; applying unchanged constraints retains it. Existing backend validation rejects invalid versions, bounds, defaults, transports and mismatched bindings. Model/capability changes invalidate affected Supplier offer reviews, while existing jobs retain their original pinned terms. Purchase rates, customer selling rates and bounded liability remain separate configuration.

A model-list connectivity check does not qualify video generation. Declaring image/video/audio inputs or callback capability does not implement media inspection, enable those dispatch paths or qualify a channel. Current dispatch supports text and the configured, consented inline image-plus-prompt subset described below. Remote image URLs, image-only requests, audio/video references and verification workflows remain unavailable; schema declarations alone cannot enable them.

### Effective output and estimator configuration

The optional `video_schema.output` management contract maps each qualified
resolution/aspect-ratio pair to positive pixel width and height. It declares
`estimator` (`SeedancePixelsV1` or `OutputSecondsV1`) and a reviewed
`estimator_revision`. Resolution, ratio and duration controls must have explicit defaults or be
required. Pixel estimation also requires a positive frame-rate control; seconds
estimation may omit it. Configured duration/frame rate must be positive.
Duplicate pairs, unadvertised choices, missing default mappings and invalid
specifications are rejected. Requests with an unmapped combination fail before
dispatch. Pricing configuration choices omit resolutions without a mapping.

The validation engine resolves effective dimensions, duration and FPS with the
schema and estimator revisions. Seedance's configured pixel estimator includes
reference duration once; the seconds estimator measures output duration and
rejects nonzero reference duration instead of inventing a conversion. Estimates
remain distinct from reported usage and independently reviewed maximum liability.
The current `ark-direct-v1` generation adapter accepts video-token metering only;
a configured seconds estimator does not enable seconds-based generation.

`VideoOutputSchema` is exported by the JavaScript SDK for configuration typing.
Existing schemas without `output` retain their previous validation behavior.
The request-constraint editor preserves an existing output document when editing
other limits. Output-aware text-input jobs now retain an immutable pre-dispatch
snapshot of effective controls, pixel dimensions, duration/FPS, schema/estimator
revisions and explicitly estimated quantity. Configuration changes do not reprice
or recompute that evidence. The snapshot contains no prompt or procurement price.
Output-aware routes cannot dispatch without their snapshot; legacy jobs have no
invented estimate. The mapping editor exposes these settings in Video configuration → Output.
Customer estimate and historical explanation APIs are available for the qualified
text-input subset; their rendered workflows and qualification of additional
reported meters remain pending.

## Configure a media offer

In Supplier pricing administration, open Models & pricing → Media rates → Set up media offer. Select a named model/API-key binding with a saved video schema. Saving creates an inactive offer revision and clears its previous review; review supply rights and the exact model/channel contract before activation and purchase-rate publication. Updating a model's offer preselects its named configuration. Text rates remain in the Text rates tab.

Platform-administrator readers obtain draft choices from `GET /admin/v1/providers/{provider}/media-offer-models` with `limit` (1–100, default 50) and alias cursor `after`. Choices contain exact revision strings and internal binding references, not credentials, endpoints, upstream model names or prices. Unlike qualified purchase-rate choices, draft choices need no active offer; personal credentials and foreign ownership are excluded. One credential may supply several models, and a Supplier may own several credentials with independent model subsets. Pagination advances across invalid schemas: an empty `data` array can still have `has_more: true`. Continue with `next_after` until `has_more` is false, rather than stopping on an empty array.

Platform-administrator writers publish with `POST /admin/v1/providers/{provider}/media-offers` using a client-generated UUID `revision`, `model_alias`, `vendor_id`, exact positive `vendor_revision`/`model_revision`, `schema_revision` and current `expected_revision` (null for a new offer). The body is limited to 4 KiB. These are binding references, not user-facing labels. Publication checks current configuration and explicit Supplier ownership. A media revision has `rate_kind: "media"` with null currency/input/output text prices; separate purchase and customer selling cards provide its media prices. Existing text publication and historical text prices retain their contracts.

The client retains the identical document for an explicit retry after an uncertain response. Exact receipt replay returns that revision without replacing any newer offer or reactivating it. Changed documents, another Supplier's receipt and stale new publications conflict. Model/schema/credential changes invalidate media qualification and require a new bound offer revision; re-reviewing the stale binding cannot restore eligibility. Rebinding is restricted to credentials owned by the same Supplier. Saved jobs retain original route and accounting snapshots.

Shared text, embedding and Responses APIs reject media-only offers before upstream dispatch. The database additionally prevents their dispatch without pinned media purchase/selling pricing, bounded liability and a recovery route, covering changes after initial resolution. Supported video dispatch supplies these prerequisites; neither an offer nor a schema declaration qualifies a live channel.

## Read durable state

`GET /v1/video/jobs/{id}` accepts a Niu workspace API key using bearer authentication. The reference identifies a Niu attempt, not the upstream job. The key must be current, belong to the same workspace and permit the original public model. Missing or inaccessible jobs return 404; invalid, expired or revoked credentials return 401.

The response contains `id`, `object: "video.job"`, `model` and `status`. Status is `submission_unknown`, `queued`, `running`, `succeeded`, `failed`, `unknown` or `reconciliation_required`. `submission_unknown` means dispatch intent exists but no upstream reference has been saved; it does not authorize a replacement submission. `reconciliation_required` reflects conflicting terminal observations.

This endpoint reads saved evidence without making an upstream request or performing billing. It does not return upstream IDs, credentials, private result URLs, procurement prices or raw Provider errors. A succeeded status does not establish reported billable usage, an available download or a settled customer charge. State can be stale until qualified recovery refreshes it. The complete create/query/result workflow is not available through this endpoint alone.

## JavaScript client

Use `client.video.jobs.retrieve(reference, { signal })` with the Niu reference returned by a qualified workflow. It makes one authenticated GET, accepts an AbortSignal, and preserves unknown/reconciliation status. The SDK supports creation, explicit refresh and timing reads; it does not automatically poll or resubmit. The bounded result and deletion APIs below are implemented; dashboard preview and live result-channel qualification remain pending.

## Publish customer selling rates

`POST /admin/v1/organizations/{organization}/billing/media-rates` requires platform-administrator write access, through installation credentials or an explicitly granted signed-in member. The grant does not expand that member’s customer workspace access. The JavaScript equivalent is `admin.publishCustomerMediaRate(organizationId, card, { signal })`. Ordinary customer members, including company owners/admins, and inference keys cannot publish rates or liability limits.

The typed card contains a selling revision, exact credential/model/schema revisions, offer revision, dimension-selected tariff, discount rules, maximum quantity and an independently qualified liability reference. See `CustomerMediaRateCard` in the billing OpenAPI contract and JavaScript SDK for the complete fields. Rational quantities use reduced canonical decimal strings. Monetary units and effective Unix-second periods are exact integers; the JavaScript SDK rejects unsafe numeric values. The request is bounded to 128 KiB.

Publication appends immutable customer configuration. Identical current-route replay is idempotent; altered content under the same revision conflicts. Personal credentials and stale route revisions are rejected. Overlapping effective schedules fail selection rather than choosing a price silently. Procurement rates never belong in this API. Publishing a card does not qualify a commercial offer or prove its configured liability bound. Dispatch independently requires current offer qualification, exact route revisions and a funded reservation.

## Create a text-input job

`POST /v1/video/jobs` accepts `model`, ordered text `content` blocks and controls allowed by the configured video schema. The initial adapter requires channel `ark-direct-v1`; the configured API base is followed by `/contents/generations/tasks`. This configuration is not evidence of live model entitlement or Provider qualification. Owner-funded personal routes remain separate from customer-funded routes. A customer-funded route requires an effective selling card, a current qualified Supplier offer, the exact configured route/schema and a supported `video_tokens` meter. Billing resolution comes from validated effective controls, including schema defaults; a missing resolution or selling schedule rejects submission. Configured inline PNG/JPEG/WebP image-plus-prompt references additionally require current image-processing consent and a matching required detector configuration. Remote image URLs, image-only requests, audio/video references and callbacks remain unavailable.

Authorization, model/schema validation, Guardrail access, original-route binding and durable dispatch intent precede the single upstream POST. Local text input rules run before credential retrieval, reservation and dispatch. Blocking prevents upstream submission; redaction preserves controls and is revalidated against the pinned schema. The durable inspection result binds the policy revisions checked at dispatch. External text input detectors and output inspection remain unsupported for video and fail closed. Inline image inspection is separately supported through consented image detectors, immutable exact-content receipts and the final dispatch recheck. Inspection failure prevents attempt creation and reservation; it does not become an unchecked text-only dispatch. Successful receipt binding returns 202 with status `unknown`; the job has not yet been polled. Timeout, HTTP error, malformed response or failed receipt persistence returns the same Niu reference with `submission_unknown`. Durable dispatch intent supports recovery even if an uncertainty marker cannot be saved. No automatic create retry or paid fallback occurs. Personal routes incur no Niu customer charge. Customer-funded routes reserve the qualified maximum quantity before dispatch; an uncertain submission retains that reservation. Saved verified success and agreed reported usage settle the pinned customer price once and release the unused reservation, through explicit refresh or automatic recovery. A pre-dispatch failure can release its hold only when storage confirms nonexecution. The legacy workspace procurement budget (`/budget`) rejects video estimates and submissions before attempt preparation or customer reservation; the locked dispatch check also rejects one created after preflight. This is distinct from customer workspace and API key spending limits. Customer-funded video uses the shared customer reservation transaction: after company-capacity admission, it checks both workspace and key commitments against the selected maximum customer charge before inserting the hold. Existing media commitments include known unsettled overruns. These are implemented checks, not a claim that the complete customer-funded video flow has been verified with actual upstream quantity evidence.

For text-only submissions, supply `Idempotency-Key` (one to 128 visible ASCII
characters), or call `client.video.jobs.create(request, { signal,
idempotencyKey })`. Dashboard callers use
`admin.createDashboardVideoJob(scope, keyId, request, { signal, idempotencyKey })`.
Persist the key before sending. It is scoped to the workspace
and shared by inference-key and dashboard-key creation endpoints. Repeating it
with the same JSON document returns HTTP 202 and the original job reference,
with its current saved status. JSON object field order is ignored; array order,
explicit defaults and numeric representations remain part of the document.
Changed input under the same key returns HTTP 409. Invalid or repeated headers
return HTTP 400. Reference-image submissions with this header return HTTP 501.

The key digest, request digest and original attempt commit atomically before
route binding, reservation and dispatch. Only the original creator can proceed
to submission. Concurrent callers and callers after restart never inherit that
right. A crash or failure during preparation can leave the reference at
`submission_unknown`; replay preserves this uncertainty and does not rerun the
preparation or generation. Status reads can retrieve the admitted reference,
including before dispatch. This is at-most-once submission, not a promise that a
job was generated or that every interrupted preparation will finish.

Keys do not expire into permission to submit again. No raw prompt or key is saved
in the idempotency table. Current credentials, workspace scope and model grants
still apply to replay. A replacement key in the same workspace with the model
grant can recover the same identity. Requests without `Idempotency-Key` remain
non-idempotent. A client abort or lost HTTP response is not upstream cancellation;
never retry an uncertain unkeyed creation. Do not switch to a new identity to
recover an uncertain keyed submission.

## Explicit refresh

`POST /v1/video/jobs/{id}/refresh`, or `client.video.jobs.refresh(reference, { signal })`, makes one bounded upstream GET for the original `ark-direct-v1` job. Personal ownership or the original customer pricing binding authorizes this recovery context; routes cannot switch accounting modes. Successful customer-funded observations reconcile reported usage against the pinned selling tariff and authoritative company ledger. Missing/conflicting usage or insufficient settlement capacity remains unresolved and retains liability. It rechecks current workspace/model grants and model/Provider policy, and rejects changed or disabled route/credential revisions. The upstream job reference is encoded as one URL path segment.

A missing reference returns reconciliation required; it never creates another generation. Verified direct-envelope status/usage is applied through the durable observation path. The response retains the customer-safe status shape, without private result URLs. A failed refresh leaves the saved job intact. The opt-in worker supplies the initial scheduling/backoff path; output retrieval/retention and concrete live channel qualification remain pending; this endpoint does not promise notification delivery or automatic progress.

## Measured transport intervals

`GET /v1/video/jobs/{id}/timings`, or `client.video.jobs.timings(reference)`, returns the latest 100 saved submission/query spans chronologically, with `has_more` when older spans exist. Each span contains phase, Unix start milliseconds, monotonic elapsed milliseconds and received/unavailable transport outcome. These measure network resolution/request/response work, excluding subsequent database reconciliation. They do not measure Provider queue/run duration, imply cancellation/refund or establish completion. Missing timing evidence stays absent. The dashboard Video screen visualizes these recorded transport spans. Result/asset handling and complete Provider lifecycle timing remain pending.

## Opt-in query recovery

Recovery pins the protocol at submission alongside the original upstream model,
job identity and output snapshot. Editing the current model constraints does not
reinterpret or strand an existing task. Query scheduling uses the saved protocol.
The model must still be enabled and attached to its original credential; current
access and Guardrails still apply. A changed credential configuration revision,
disabled credential or ownership mismatch continues to block upstream access.

Migration `0203` adds immutable protocol records. Existing jobs are backfilled
only when their original credential/model/schema revisions still match the
available configuration. Missing historical evidence is not guessed; those jobs
remain blocked for reconciliation. New video dispatch requires a saved protocol.
See the [mapping-change checkpoint](../releases/video-mapping-recovery-2026-10-09.md).

Set `NIU_VIDEO_POLLING=true` to enable direct-channel recovery for bound personal and prepaid jobs. It discovers existing bound jobs from durable dispatch records, including a crash before enqueue. Per-job 90-second leases coordinate replicas; expired leases permit another query, never generation. Normal progress waits ten seconds between polls, and failures back off up to five minutes. A worker processes one job at a time and skips missed ticks.

Original key validity, model access, policy and pinned route are rechecked for each query. Revoked/expired keys stop upstream queries. Saved successful customer usage can still reconcile the original financial obligation locally without egress; revocation does not forgive an already committed charge. Failed/conflicting jobs stop polling while retaining unresolved financial evidence. Successful prepaid jobs stop only after a posted debit or a zero charge with its reservation released; missing usage and unposted liability remain eligible for recovery. Jobs without upstream references remain reconciliation work and are never submitted again. Polling is off by default; enabling it does not qualify live channels, notification delivery, complete charge/refund rules or production recovery. Discovery also includes completed customer jobs with unposted liability. A ledger write failure retries from saved success/usage/pricing, without another upstream query or generation submission.


## Durable job history

`GET /v1/video/jobs?limit=25&before=<next_before>` reads saved dispatched jobs
from the current workspace, filtered by the key's current model grants. It
includes uncertain submissions even when no upstream job reference was received.
It does not poll, regenerate, reserve funds or settle charges.

The JavaScript client exposes `client.video.jobs.list({ limit, before }, options)`.
Pages contain at most 100 jobs, ordered newest first with a stable tie-breaker.
Use `next_before` while `has_more` is true; an inaccessible or unknown cursor is
rejected. Creation times are exact decimal Unix-millisecond strings. API job
references and cursors are bindings; product screens should display model names
and dates rather than internal identifiers. History omits prompts, upstream job
references, credentials, result URLs and Supplier prices. Reloading a browser does
not remove this backend history.

## Estimate before submission

`POST /v1/video/estimate` accepts the same configured text-input shape as job
creation. The JavaScript SDK exposes `client.video.estimate(request, options)`.
Current workspace/model access, route qualification, capability, tariff and
supported Guardrail checks apply. An output-aware schema is required; legacy
schemas without an estimator return unsupported rather than an invented amount.

The response includes `effective_output`, explicitly estimated quantity and
customer amount, independently reviewed `maximum_charge_nanos`, and the customer
tariff selection time. Amounts use exact decimal nanounit strings. Owner-funded
amounts and tariff selection time remain null. No job, reservation, debit, query
or upstream generation is created. This is a nonbinding estimate: it does not
promise admission, reserve capacity or guarantee the tariff at a later time.
Submission rechecks configuration, authorization and available funds.

## Saved customer billing

`GET /v1/video/jobs/{id}/billing` uses current workspace/model access and reads saved accounting only. It does not poll the Provider or trigger a debit. The JavaScript client exposes `client.video.jobs.billing(id)`.

Customer jobs return the pinned customer price, currency, exact reported quantity when agreed, active reservation and posted charge. Amounts use decimal strings in billionths of the declared currency. States distinguish `reserved`, `awaiting_usage`, `awaiting_settlement`, `settled` and `reconciliation_required`. A successful generation with missing usage is not a settled charge. Failed/conflicting observations or a liability-bound breach require reconciliation; an already posted charge remains visible if later evidence conflicts.

Output-aware jobs also return `effective_output` and `estimate`. The former records
submission-time pixel dimensions, duration/FPS and schema/estimator revisions.
The latter reports the explicitly estimated quantity and the amount calculated
with the original customer tariff and discounts. `estimate.amount_nanos` is an
exact decimal string; it is neither the reserved maximum nor `charge_nanos`.
Legacy jobs return null for both fields. Owner-funded estimates may contain a
quantity, but their currency and amount remain null. Unpriceable estimates also
retain null amounts rather than borrowing Supplier costs or claiming zero.

Owner-funded personal jobs return `owner_funded` with null customer amounts and price. This does not claim that upstream usage was free. Internal identifiers, Supplier costs, credentials and private result URLs are excluded. This endpoint is a billing foundation; complete customer Logs/Usage/Billing integration remains required.


## Replacing a customer selling schedule

Published cards remain immutable. Use `POST /admin/v1/organizations/{organization}/billing/media-rates/replace` with `{ "previous_revision": "<original revision>", "rate": <new selling card> }` to publish the replacement and retire the original at its effective start in one transaction. Platform-administrator write permission is required. Missing or overlapping eligibility fails closed rather than choosing an arbitrary price; historical jobs retain their original customer tariff.

Retirement appends an immutable record. Its cutoff must fall within the original interval; using the start boundary withdraws eligibility for the entire interval. The cutoff is exclusive for original-card selection: at that second, new jobs can select the replacement. Exact retirement replay is accepted, while a different cutoff conflicts. Existing job pricing snapshots and their final settlement are unchanged. Retiring a card does not cancel jobs, release holds or refund prior charges. The SDK method is `admin.retireCustomerMediaRate(organizationId, revision, effectiveUntil)`.


## Independent Supplier media accounting

Commercial direct-channel dispatch requires both an eligible customer selling card and an independently published Supplier purchase card. Installation write access publishes purchase terms at `POST /admin/v1/providers/{provider}/media-rates`; the SDK exposes `admin.publishSupplierMediaRate(supplierId, card)`. The card identifies the current qualified offer, credential/model/schema revisions, media dimensions, meter, currency, exact unit price and applicable discounts. No customer charge or margin belongs in this configuration. Missing, ambiguous, stale or differently metered purchase cards deny dispatch before egress. Owner-funded personal routes remain outside this commercial accounting path.

Before dispatch, Niu pins the selected purchase snapshot independently from the customer snapshot. Confirmed success and agreed Provider-reported usage accrue exactly one Supplier earning. Missing/conflicting usage stays unresolved. A failed or insufficient customer payment does not erase the Supplier obligation; no customer price is used to calculate it. Video earnings use their media meter/quantity and null text-token categories. Known zero reported usage is distinct from missing usage.

The existing confirmed external-payment settlement ledger can settle media earnings with exact replay and Supplier/currency isolation. Recording a settlement does not transfer funds. Supplier dashboards group their own media consumption and agreed purchase prices separately from text tokens; customer job billing, Logs and Usage never receive procurement snapshots, earnings or margins. Recovery uses original saved terms and usage even after credential revocation; it never resubmits generation to recover an earning.

This path has local fixture qualification only. Live commercial agreements and rates, complete purchase-rate lifecycle/admin UI, qualified failure/refund rules and full release acceptance remain pending.


## Supplier purchase schedule history and replacement

`GET /admin/v1/providers/{provider}/media-rates` returns saved purchase schedules to installation readers or that Supplier's active members. It excludes customer prices, margins and credentials. Use `limit` (1–100, default 50), `next_after` and `has_more` to traverse history; monetary amounts, route revisions and effective times are exact strings. Old publication times that were not recorded remain null.

Installation writers replace an open-ended purchase card by publishing a new revision starting at the desired cutoff and retiring the old revision with `POST /admin/v1/providers/{provider}/media-rates/{revision}/retire`, body `{ "effective_until": <Unix seconds> }`. Schedule both before the cutoff to avoid unavailable/ambiguous pricing. The cutoff ends original-card eligibility without changing its saved terms, prior job snapshots, earnings or settlements. Exact replay is accepted; changing the cutoff conflicts. Retirement does not cancel generation or refund charges.

SDK methods are `admin.listSupplierMediaRates(supplierId, { after, limit })` and `admin.retireSupplierMediaRate(supplierId, revision, cutoffUnixSeconds)`. Supplier membership permits reading its own agreed rates, not publishing or retiring procurement configuration. Installation administration can use `GET /admin/v1/providers/{provider}/media-rate-models` or `admin.listSupplierMediaRateModels` for paginated named choices and exact current bindings. Choices exclude personal credentials, disabled routes and invalid media schemas; they do not establish supported dispatch protocols or commercial entitlement.

`POST /admin/v1/providers/{provider}/media-rates/replace` accepts `{ previous_revision, rate }`; `admin.replaceSupplierMediaRate(supplierId, previousRevision, rate)` sends the same contract. One transaction publishes immutable replacement terms and retires the original at the replacement's start. Dimensions and meter must match; stale bindings and conflicting cutoffs roll back both changes. Prior job snapshots and earnings remain unchanged. The dashboard provides publication, replacement, history and retirement dialogs using these scoped APIs. An uncertain save retains the same document for an explicit retry; it does not automatically repeat the mutation. Customer selling-rate administration, complete Supplier capability workflows and live commercial qualification remain pending.

## Saved results and deletion

`GET /v1/video/jobs/{id}/results/video` retrieves a saved video;
`.../results/last_frame` retrieves an optional last frame. Both require a current
workspace key, access to the original model and a compatible current Guardrail
policy. Retrieval rechecks key grants, policy, job state, deletion and local
expiry after downloading. Conflicting terminal states cannot release results.

Signed Supplier URLs are encrypted with the installation encryption key and
bound to the organization, workspace, job and result kind. They are captured by
successful query recovery, including the recovery worker, and retained for **24
hours from the first saved reference**. Refreshing a URL does not extend that
window. Supplier links may expire earlier; no renewal or indefinite availability
is promised. Expired references are unreadable immediately; the five-second
maintenance loop clears ciphertext, subject to worker availability. Database
backups follow the deployment's separate backup retention policy.

Niu returns the media body, never a signed URL or redirect. HTTPS/public DNS
checks, pinned resolution, no redirects/proxies, MIME/signature checks and an
overall 60-second deadline bound retrieval. MP4/WebM downloads are limited to
64 MiB, PNG/JPEG frames to 10 MiB, with four concurrent network retrievals per
process. Responses use an attachment filename, `nosniff` and private `no-store`
headers. Range requests are not supported. Container signatures are not media
content inspection; policies requiring unsupported inspection deny delivery.
No Supplier credential is sent to the media host.

Missing, deleted, locally expired or inaccessible references return 404. Unsafe,
expired or otherwise unavailable upstream content returns a generic 502 without
its URL/body. Invalid kinds return 400; retrieval capacity or decryption
unavailability returns 503. Optional last-frame absence is not a job failure.

`DELETE /v1/video/jobs/{id}/results` requires current workspace/model access and
permanently removes local encrypted references. Content-free deletion markers
prevent later refresh from restoring them, even if the job was unfinished when
deleted. It preserves status and accounting, and does not delete media held by
a Supplier or copies already downloaded.

Use `await client.video.jobs.results.retrieve(job.id, 'video', { signal })` for
an authenticated `Response` whose body can be streamed by the caller. Use
`await client.video.jobs.results.delete(job.id)` for local deletion. Neither
operation retries automatically. Dashboard preview/download and qualified live
TLS/CDN media retrieval remain acceptance work.



### Verify a current saved video

Run `scripts/verify-video-result.py` against a job from an actual generation.
The command reads saved state and billing, downloads the authorized result, and
uses installed `ffprobe` and `ffmpeg` to inspect and fully decode its first video
track. It does not submit or refresh a job or change keys or financial records.
Supply an existing scoped workspace key through `NIU_API_KEY`, not a command-line
argument. Keep the private output directory outside the checkout; it must not
already exist.

```sh
python3 scripts/verify-video-result.py \
  --base-url http://localhost:2567 \
  --job "$VIDEO_JOB_ID" \
  --output-dir "${TMPDIR:-/tmp}/niu-video-result-check"
```

The command saves the exact downloaded bytes and an independent media report,
checks `no-store` and `nosniff`, refuses credential-bearing redirects, and bounds
the download to 64 MiB. A succeeded job alone is not acceptance: download and
full decode must complete. The report does not establish customer settlement,
future upstream availability, or the full video workflow.

A current run on 2026-10-10 used a saved personal OpenRouter job after the native
backend update. It retrieved 105,708 bytes of MP4, independently identified an
848×480 H.264 video track and a duration of 1.041667 seconds, and decoded the full
first video track. Separate current HTTP reads denied a different workspace with
404 and the revoked temporary key with 401. Independent database counts showed
no additional submission, customer balance entry or Supplier earning for the job.
Original saved jobs/results were not deleted. This checkpoint covers retrieval
of that existing artifact, not a new generation or customer-priced media charge.

### Result availability and dashboard access

`GET /v1/video/jobs/{id}/results`, exposed as
`client.video.jobs.results.status(reference, options)`, reports `video` and
`last_frame` as `available`, `missing` or `unavailable`. It performs no media
request and reveals no Supplier URL. Availability is local evidence, not a
promise that an upstream link is still accessible. Current key/model access
and compatible Guardrails apply.

Signed-in members use the scoped dashboard job path under
`/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/video/jobs/{job}`.
Its `/results` GET and DELETE and `/results/{kind}` GET share the public
operation authorization. Read access permits retrieval; deletion requires write
access. The dashboard uses the selected workspace key without exposing its secret.

The Video result panel loads media only on explicit request, offers a download
of the received body, and revokes temporary browser preview URLs on replacement,
scope change, deletion or unmount. Missing optional frames are hidden; expired or
deleted results remain unavailable after reload. Writers confirm local deletion
in a dialog. Status and accounting are preserved. The configured optional
last-frame generation control is separate from result availability.

Migration 0136 hardens the existing result-retention schema without changing
migration 0135: existing references keep their ciphertext, overly long lifetimes
are shortened to exactly 24 hours, and deletion tombstones cannot be removed.
Positive live TLS/CDN retrieval, required media inspection and full packaged
lifecycle qualification remain open.


### Observed lifecycle timing

The timing response also includes `lifecycle`, with the durable submission-intent
Unix milliseconds, first-observed status timestamps and a terminal-conflict flag.
Its source is `gateway_observation`: polling discovers a transition after it
happens, so these are not exact Supplier queue or generation boundaries. Duplicate
status polls preserve the first timestamp across restart. Missing observations
remain absent; succeeded/failed contradictions are retained explicitly. This
read performs no upstream request, settlement or generation.

Clients must not infer exact queue/run durations from these observations or treat
an observed failure as a refund. The Video Status tab renders these observed intervals, suppressing missing, conflicting or out-of-order breakdowns. Supplier-reported lifecycle timing remains separate acceptance work.


### Customer charge discovery

Posted video charges appear in the existing workspace Logs, request exports and
customer-charge summaries, using their pinned customer amount and currency.
Recorded liability without an exact customer debit remains pending; qualified
zero charges require released reservations. Supplier costs are excluded. Media
usage is not converted into text input/output tokens for these reports.


### Historical settlement quantity

Billing returns `settled_usage` only for a posted customer charge. Its measured
and billable quantities, meter and Reported provenance come from the immutable
charge receipt, checked against the original pricing snapshot and exact amount.
Current `usage` describes current observations; later conflicts may make it
unknown without erasing the quantity behind an existing debit. Reconciliation
warnings remain explicit. Neither unposted liability nor owner-funded jobs have
an invented settlement quantity. Receipt revision IDs and Supplier costs are
excluded from this response.


The Video Billing tab displays the immutable settled quantity when present.
Charge calculation expands the saved customer rate/denominator, billable quantity,
minimum, applied discount multipliers and rounding. It never displays Supplier
purchase prices or internal revision identifiers. Pending, owner-funded and zero
customer amounts remain distinct; later reconciliation warnings stay visible.


Workspace request activity includes `request_kind: video` when a durable video
recovery route is pinned. This covers uncertain submissions before an upstream
job receipt exists. A model name, media price or catalog capability alone does
not establish the request kind. Other activity retains `inference`. Consumers
of older servers should tolerate an absent discriminator. The field reveals no
Supplier route, credential or upstream job identifier.


### Inline image validation prerequisite

The configured validator checks bounded Base64 bytes against allowed image MIME
and supported PNG/JPEG/WebP container headers. PNG requires a nonzero IHDR size;
WebP's declared container length must match. Random bytes, mismatched declarations
and unsupported formats are rejected. These checks neither decode/inspect an
image nor qualify remote media or reference dispatch. Required inspection and
channel-specific dimensions/roles remain prerequisites; the implemented gateway
still dispatches the qualified text-input subset only.


### Bounded image decoding prerequisite

The media library separately decodes declared PNG/JPEG/WebP input with explicit
encoded-byte, width, height and decoded-buffer limits. It does not guess a format
from an unrelated MIME declaration. Limits must be positive and remain within
application ceilings (16 MiB encoded, 16,384 pixels per dimension and 256 MiB
decoded); these ceilings are not model entitlements or recommended channel limits.
Malformed/truncated input and unsupported formats produce content-free errors.
Decoded pixels are private and have no automatic debug or serialization output.

A shared `DecodeService` admits one to four operations without queuing or copying
input when full, then runs decoding on blocking workers. Capacity remains held
while a worker runs or its decoded pixels are retained; cancelling its async
caller cannot release a running worker slot. Service clones share capacity.
Gateway admission must share one instance rather than create a pool per request.
Neither decoder entry point is wired into generation admission yet. The image library's [allocation limit is best effort](https://docs.rs/image/0.25.10/image/struct.Limits.html);
Niu checks decoded output size before allocating that buffer, but does not claim a
hard process-memory or CPU-time limit. APNG and animated WebP are explicitly rejected until all-frame inspection is
implemented. PNG/WebP chunk traversal also rejects truncated or trailing container
data; it does not scan compressed pixels for animation markers. Required content
inspection, safe remote retrieval and channel-specific limits remain open.
Reference generation remains unavailable until these prerequisites are integrated
and qualified; decoding alone is not content approval.


### Remote reference-image transport prerequisite

`DecodeService::fetch` shares the existing bounded media transport and holds the
same admission slot across download, decode and retained pixel consumption. It
accepts PNG/JPEG/WebP declarations, then applies static-container and full image
decoding checks. Public HTTPS destination validation, public DNS address checks
and connection pinning, no redirects/proxies/credentials, identity encoding,
bounded chunks and a bounded network timeout remain the existing transport rules.
Errors exclude URLs, response bodies and decoder messages.

Callers must authorize the request and establish processing consent before this
operation. It is not yet connected to generation admission, does not inspect image
content and has no hard decoder CPU deadline. Positive live TLS/CDN image retrieval
and channel-specific input qualification remain pending.


### Inspected content binding prerequisite

Decoded images retain immutable encoded bytes with their pixels and declared MIME.
A later approved, qualified inline-input request can obtain a Base64 reference
from exactly those bytes instead of forwarding a remote URL that can change after
inspection. Inline creation requires an explicit maximum encoded-reference size
and checks exact Base64 expansion plus MIME prefix before allocating the string. This private holder has no automatic debug/serialization output and
retains decoder capacity until dropped. The retained encoded copy is bounded by
the configured encoded-byte limit, separately from pixel-buffer limits.

Producing an inline reference is not approval or dispatch authorization. The
caller must bind the inspection decision, recheck current policy/account access,
and validate the resulting request body size, image roles and channel's inline
support. Channels accepting only URLs need a qualified immutable upload/asset
mechanism; a previous inspection cannot approve a later arbitrary URL fetch.

JPEG container traversal also requires one complete image with no bytes after its
first ending marker. Concatenated JPEGs cannot be retained as a single inspected
image; segment lengths and entropy marker escaping are checked before decoding.

Media-offer publication accepts positive signed 64-bit configuration revisions
as either legacy JSON integers or canonical decimal strings. SDK callers should
forward the exact strings returned by model choices; converting large revisions
to JavaScript numbers can lose precision. Zero, signs, leading zeroes, fractions
and values above `9223372036854775807` are rejected. This applies to media-offer
publication; other write contracts retain their documented revision types.

## Ordinary asset-group foundation

The media crate validates ordinary AIGC creation requests with a 64-character
name and optional 300-character description. It always emits `GroupType: AIGC`
and requires an explicit upstream `ProjectName`; it does not silently substitute
a Niu workspace or the default upstream project. Unicode limits count characters,
not UTF-8 bytes. This is request validation only, with no asset management route.

The official [virtual asset library guide](https://docs.volcengine.com/docs/ark/private-virtual-avatar-library-guide-preview?lang=zh)
requires Access Key authentication and matching asset/inference projects. Existing
bearer video credentials do not establish management access. The official
[asset-group deletion contract](https://docs.volcengine.com/docs/ark/delete-asset-group-api?lang=zh)
specifies irreversible cascading deletion; it must receive a separate destructive
confirmation and scoped authorization before implementation. Real-person groups
require the separate verification lifecycle.

Encrypted account binding, durable group/asset identities,
CRUD routes, readiness, deletion, audit pricing and live channel qualification
remain unimplemented. This foundation does not qualify V08–V12 or V21.

The three focused request-validation tests pass, including Unicode boundaries
and missing project rejection. Media all-target Clippy passes with warnings
denied. No external asset operation was dispatched during this checkpoint.

## Asset-management signing foundation

The media crate now signs only validated ordinary `CreateAssetGroup` requests
for the fixed Beijing Ark endpoint, service, region and API version. It signs
the exact serialized JSON bytes with deterministic field ordering and includes
the content hash, host, date and authorization headers. Authorization headers
are marked sensitive; signer/request types omit `Debug` to avoid accidental
credential or asset-description logging. Credential storage, freshness and
rotation remain the future runtime's responsibility.

A synthetic fixed-time vector was independently generated by the pinned
[official Volcengine signer](https://github.com/volcengine/volcengine-python-sdk/blob/629d09880eff23a283a2af1dd98b65294776e614/volcenginesdkcore/signv4.py).
The implementation is original; no upstream source module was imported. This
signer itself implements no network transport, retry, asset route or entitlement.
Encrypted account binding and the full lifecycle remain required before use.


All 53 local media tests pass after the signing addition, with one external
HTTPS retrieval test explicitly ignored. Media all-target Clippy and changed-file
public-boundary/whitespace checks pass. Six of the tests cover group validation
and signing. The fixed fixture uses synthetic credentials and sends no request;
it does not qualify a live account, authorization, freshness or asset lifecycle.

## One-shot ordinary group transport

The media transport signs and sends a single ordinary group create to the fixed
Ark endpoint through Niu's DNS-pinned, no-proxy, no-redirect upstream client. One
deadline covers endpoint preparation and response reading; timeout is bounded to
60 seconds and the response limit to 1 MiB. No automatic replay occurs. After
dispatch, HTTP failure, timeout, oversized content, malformed data or conflicting
response metadata is uncertain, not proof that no group was created. Upstream
messages and descriptions do not enter the safe error enum.

The receipt decoder requires the expected action/version/service/region and a
bounded group identity. Typed decoding rejects duplicate scope, error and identity fields,
and contradictory top-level errors, rather than accepting the last JSON value. Signing rejects impossible calendar dates and times in
addition to malformed timestamp syntax; timestamp freshness remains the runtime's
responsibility. This transport is not wired to a customer route. Its caller must
first commit durable intent and authorize the original Supplier account and
upstream project. Query recovery, encrypted Access Key storage, receipts,
auditing and the remaining group/asset lifecycle are still required.

The rendered [CreateAssetGroup contract](https://docs.volcengine.com/docs/ark/create-asset-group-api?lang=zh)
was inspected directly. Before first creation, the upstream account must sign its
authorization letter in the upstream console. Niu has not accepted such an
agreement or performed a live create during this checkpoint. Account entitlement
and current management-operation pricing must be qualified before activation;
no zero-cost claim is made.


Nine focused group/signing/transport tests and media all-target Clippy pass.
The HTTP fixture uses the shared upstream client and verifies one request per
attempt across success, HTTP failure, malformed/oversized responses, timeout and
redirect. No redirect target is reached. Changed-file public-boundary and
whitespace checks pass. These are local protocol/transport checks, not a live
management or full V08 acceptance pass.


The duplicate-field follow-up passes all ten focused group/signing/transport
tests. Fixtures cover conflicting actions, an error overwritten by null,
duplicate group identities and a contradictory top-level error. Each remains an
uncertain outcome with no upstream content in the error value. This changes no
live asset, authorization or billing state.

## Versioned management-credential storage

Migration 0150 and installation-internal Store methods preserve opaque encrypted
management records separately from inference bearer credentials. Each append
locks the Supplier credential configuration, checks its expected management
revision, and saves an immutable revision with the upstream project. Exact
revision reads never fall back to newer credentials. The record type has neither
`Debug` nor `Serialize`; no customer endpoint exposes it. This does not activate
asset operations or establish Supplier ownership/entitlement.

Two fresh disposable PostgreSQL tests pass. They cover reopening the Store,
retaining the original project/ciphertext after rotation, missing/foreign
revision reads, preserving the inference credential, database rejection of
updates/deletes, concurrent setup with exactly one accepted revision, stale
revision conflicts and invalid inputs. Storage all-target Clippy and changed-file
public-boundary/whitespace checks pass.

The fixture ciphertext is synthetic: these tests prove storage and transaction
behavior, not management-record encryption. The configuration API below adds domain-separated encryption and installation
actor attribution. Local revocation and active-database ciphertext erasure are
covered below; backup retention and the operational lifecycle remain open. Immutable
credential history is not a claim of indefinite lawful retention. Durable asset
create intents, uncertainty recovery and customer group/asset APIs remain open.

## Installation credential configuration API

`GET /admin/v1/vendors/{id}/asset-management` returns current management metadata
or null before setup. `PUT` accepts `expected_revision` (zero for setup),
`upstream_project`, `access_key` and `secret_key`, with a 16 KiB request bound.
Only installation administrators with management permission may use either
operation. Direct Beijing Ark account configuration is required. Responses omit
all keys and ciphertext and explicitly return `dispatch_available: false`.

Encryption uses the deployment credential cipher with a separate management
AEAD domain bound to the vendor, exact management revision and upstream project.
The save transaction rejects a changed vendor revision as well as a stale
management revision. Immutable records attribute successful API saves to the
installation administrator and retain their creation timestamp; internal prior
records remain explicitly unattributed. Invalid JSON errors use a generic safe
message instead of echoing sensitive input. Saving does not contact Ark, accept
upstream terms, check entitlement, change a bearer key or enable a model.

A fresh PostgreSQL routed API test passes for installation setup/rotation/reload,
customer-owner and inference-key denial, secret-free responses, decryption under
the exact binding, rejection of cross-domain/account/revision/project decrypts,
stale write conflict, safe invalid-body/413 errors and rejection after changing
the account to a non-Ark origin. Two fresh storage tests additionally confirm a
changed vendor revision cannot be used to append management credentials. The
matching OpenAPI parses
with unique keys. The JavaScript SDK adds cancellable metadata/setup helpers,
validates identifiers and safe revisions, and does not retry a conflicting write;
The setup checkpoint passed 147 SDK tests. Live account qualification,
operational recovery and a rendered administration workflow remain open.


Gateway and storage all-target Clippy pass with warnings denied for this
configuration checkpoint. Changed-file public-boundary and whitespace checks
pass. This qualifies the tested backend/SDK setup subset, not an Admin UI,
complete credential-retention lifecycle or F03/F09 release gate.

## Local credential revocation and erasure

Installation administrators can `DELETE /admin/v1/vendors/{id}/asset-management`
with the current positive `expected_revision`. Revocation blocks exact reads of
all management revisions through that head. `erase_history: true` additionally
requires `confirm_erase: true` and clears their ciphertext in the active database.
Separate immutable revocation and erasure events retain metadata and timestamps.
Repeated erasure returns zero changed revisions. Stale requests conflict before
affecting a newer rotation; a subsequent append creates a usable higher revision.
Inference bearer credentials are unaffected.

This is local read revocation and active-database erasure. It does not revoke
upstream Access Keys, erase backups, or cancel credentials already loaded by an
in-flight operation. Runtime credential loading, backup retention, asset create
intents, recovery and live activation remain open.

Fresh disposable PostgreSQL verification passes two routed API tests and three
storage tests, including denied customer access, mandatory erasure confirmation,
revocation without erasure, repeat calls, immutable audit events, rotation after
revocation and stale-write rejection. All 148 JavaScript SDK tests pass. These
Gateway and storage all-target Clippy pass with warnings denied; OpenAPI
unique-key parsing, changed-file public-boundary checks and whitespace checks
also pass. These checks qualify this backend/SDK subset only, not the full
F03/F09 release gates.

### Typed management-record decoding

The credential cipher decodes an exact account/revision/project binding directly
into the non-debuggable management signer. The record schema rejects unknown
fields, duplicate credential fields and invalid key values with generic errors.
Setup performs this round trip before saving encrypted material. A fresh focused
Rust test passes for valid decoding, conflicting bindings, inference-domain
ciphertext, duplicate/extra fields and invalid values. This is a decoding
checkpoint, not runtime dispatch: the execution path must still recheck durable
revocation and authorization before egress.

## Durable ordinary group creation intents

Internal workspace-scoped Store methods now save the validated AIGC request,
exact management revision and upstream project before dispatch. A workspace
idempotency key reuses only identical saved input; changed input conflicts.
A transaction under the account lock permits one claim and rechecks ciphertext
availability and durable revocation. Database triggers forbid request mutation,
deletion and returning a claimed or uncertain intent to the prepared state.

The credential handoff now includes a read-only validated ordinary request.
Saved bodies are reconstructed and compared in full against the pinned upstream
project before credentials are returned. Unknown controls, alternate group
types and mismatched projects fail with a transaction rollback; the intent
remains prepared. [Handoff verification](../releases/asset-management-handoff-verification.md)
covers five unit and eleven PostgreSQL tests. It does not enable runtime dispatch.

Dispatching survives a crash as reconciliation work. Marking uncertainty never
allows another claim. A verified upstream receipt can complete a dispatching or
uncertain intent locally after credential revocation. Scoped recovery reads
retain the original binding and result without reading key material.

These methods do not yet expose customer APIs or dispatch an upstream creation.
Caller authorization, live rights/entitlement, receipt verification, operational
reconciliation and deployment backup retention still require integration. The saved
request contains names/descriptions and must remain internal; this checkpoint
does not qualify the complete asset lifecycle or its retention policy.

Fresh disposable PostgreSQL verification passes all four asset-management
storage tests. The intent fixture proves exact replay after reopening, changed
input conflicts, concurrent single claim, no uncertainty requeue, immutable
request/state enforcement, revocation before claim, post-revocation local
completion and scoped recovery reads. Storage all-target Clippy, changed-file
public-boundary checks and whitespace checks pass. This evidence qualifies the
internal persistence subset only.

### Account configuration pinning

New creation intents also snapshot the Supplier account configuration revision
under the same account lock. Claims reject any intervening account update; an
idempotent preparation cannot silently replace the original revision. The
revision is immutable even during valid state transitions. Existing intents
without a trustworthy historical revision receive zero and remain readable for
reconciliation but cannot be claimed for upstream dispatch. This does not by
itself qualify an endpoint, prove entitlement or implement the runtime sender.

All five asset-management PostgreSQL tests pass in a fresh disposable cluster,
including account changes between preparation and claim, conflicting replay and
database rejection of revision rewriting. Storage all-target Clippy passes with
warnings denied. A fresh upgrade fixture applies migrations through 0155, saves prepared,
dispatching, uncertain and succeeded intents, then upgrades to the current
schema. It preserves request/result data, credential/project binding and
creation timestamps; every legacy intent remains ineligible for claim, and
revision rewriting is rejected. All six asset-management storage tests and
storage all-target Clippy pass.

### Bounded reconciliation discovery

Internal recovery discovery lists only dispatching or uncertain intents within
a specified workspace. It omits request contents and key material, limits pages
to 1–100 records and uses an exclusive UUID cursor with a caller-selected minimum
age of 0–30 days. Prepared and successful intents are excluded. A new scan must
start without a cursor to revisit unresolved records or newly eligible rows.
Discovery and local receipt completion remain possible after key revocation or
erasure. They never grant permission to repeat an upstream create. The runtime
reconciler and independently verified receipt retrieval remain unimplemented.

All seven asset-management storage tests pass in a fresh disposable PostgreSQL
cluster. The discovery fixture covers exclusive cursor pagination, age filters,
prepared/successful exclusions, recovery after ciphertext erasure, workspace
isolation, invalid bounds and removal after local completion without requeue.
Storage all-target Clippy, public-boundary and whitespace checks pass.

### Creation-request retention

Workspace members can discover saved local creation requests with
`GET /admin/v1/organizations/{organization}/projects/{project}/asset-group-intents`.
The reader-authorized endpoint defaults to 30 entries, accepts `limit` from 1 to
100 and a UUID `after` cursor, and returns `next_cursor` only when another page
exists. Each entry contains a routing-only `id`, a retained request `name` (or
null after expiry/deletion), `status`, `created_at` and `request_content_status`.
The SDK exposes `listAssetGroupRequests`. This is local request discovery, not
upstream asset discovery or evidence of asset readiness. Account bindings,
management keys, request fingerprints and procurement data are excluded. Do not
display routing references as names. Rendered discovery controls remain open.
Migration 0162 adds an index on workspace scope and the routing cursor for all
intent states; the reconciliation-only partial index remains separate.

Saved ordinary-group request bodies expire after 24 hours. Reads hide expired
content immediately; the gateway's existing maintenance loop erases at most
500 expired bodies per pass. An asset cleanup error is reported for retry but
does not skip the separate expired Logs payload cleanup in that pass. This does
not impose a timeout on a stalled database call. Intent identifiers, original account/project and
credential bindings, state, result and a SHA-256 request fingerprint remain for
reconciliation and conflicting-replay detection. Repeating identical preparation
does not recreate erased content or restart the expiry window. Prepared intents
with expired content cannot be claimed. Database triggers prohibit early erasure,
expiry extension and restoring erased content.

This is active-database request retention. Backups and the deployment's wider
data-retention obligations remain separate. The fingerprint is internal metadata,
not anonymization or permission to expose request information to customers.

All eight asset-management PostgreSQL tests pass in a fresh disposable cluster.
The retention fixture verifies immediate read hiding before cleanup, stored-body
erasure, repeat cleanup, unchanged recovery metadata, identical replay without
content restoration, changed-input conflict and local completion after erasure.
Storage all-target Clippy, public-boundary and whitespace checks pass. This does
not qualify backups, the full gateway maintenance workflow or live asset APIs.

### Atomic request-and-credential handoff

The internal `claim_asset_group_create_credentials` operation returns the saved
request and exact encrypted management revision only to the winning dispatcher.
It checks request expiry, pinned account configuration and revocation under the
account lock, loads the original project/key revision in the same transaction,
and commits the one-shot dispatch state before returning. Rotation never
substitutes a newer key. The handoff has neither `Debug` nor `Serialize`; it is
not a customer response. Revocation after a completed handoff cannot cancel key
material already held by an in-flight operation.

The handoff still requires an authorized caller, binding-aware decryption and
qualified one-shot transport integration. It does not enable asset dispatch or
establish upstream rights/entitlement.

All nine asset-management PostgreSQL tests pass in a fresh disposable cluster.
The handoff fixture verifies exactly one concurrent recipient, original request,
project and ciphertext after rotation, and no handoff after revocation/erasure.
Storage all-target Clippy, public-boundary and whitespace checks pass.

### Explicit creation-request content deletion

The internal workspace-scoped deletion method locks the saved intent, records an
immutable deletion event and clears request content in one transaction. Repeated
deletions keep one event. It cannot delete content in another workspace. An
identical preparation returns the saved intent without restoring erased content,
and a prepared intent without its body cannot be claimed. A dispatched intent
can still transition to uncertainty or complete from a verified receipt.

This erases active-database request content, not upstream assets, backups, key
material or reconciliation metadata. The workspace API below enforces caller authorization; rendered deletion
controls remain to be integrated.

All ten asset-management storage tests pass in a fresh disposable PostgreSQL
cluster. The deletion fixture covers foreign-workspace denial, repeat deletion,
immutable events, replay without restoration, blocked prepared claims and local
reconciliation after dispatched-request erasure. Storage all-target Clippy,
public-boundary and whitespace checks pass. This is internal persistence evidence,
not a qualified customer deletion workflow or complete F09 gate.

### Workspace request-content deletion API

`DELETE /admin/v1/organizations/{organization}/projects/{project}/asset-group-intents/{intent}/request`
requires workspace write permission through the shared authorization boundary.
Despite the legacy admin/project route names, ordinary authorized members can
use this customer-scoped operation. Inference keys are not member sessions.
The operation returns an empty 204 for an absent, already erased or newly erased
intent within the authorized workspace; it never returns request contents,
credential revisions or procurement data. Unauthorized workspace access is
rejected before any write.

The SDK `deleteAssetGroupRequest(scope, intentId, options)` validates UUIDs,
forwards cancellation and makes one bodyless DELETE attempt. Customer discovery
of intents, rendered deletion controls and the full ordinary-asset workflow
remain open. This does not erase upstream assets or backup copies.

A fresh routed PostgreSQL API test passes for invalid sessions, inference-key
rejection, read-only denial, foreign-workspace denial and repeated authorized
deletion. Denied calls leave the saved request unchanged; successful responses
are empty and retain one deletion event. All 149 SDK tests, gateway all-target
Clippy, OpenAPI unique-key parsing, public-boundary and whitespace checks pass.
This qualifies the API/SDK deletion subset, not customer intent discovery,
rendered controls or the complete F09 release gate.

### Customer-safe request detail API

GET on the workspace request-content route requires workspace read permission
and returns a fixed projection: creation time, saved status, content retention
status and retained name/description. Deleted or expired content is null; absent
intents return null. Responses use `Cache-Control: no-store`. Account identifiers,
upstream project, credential/configuration revisions, fingerprints and procurement
data are excluded by backend serialization. The SDK `getAssetGroupRequest`
validates identifiers and supports cancellation.

This enables reading known saved intents, not creating or listing customer assets.
The complete discovery, creation and rendered asset-management workflow remains
open. Retained names/descriptions are user content, not anonymized telemetry.

Fresh verification passes the routed read/delete API fixture, all ten
asset-management storage tests and all 150 SDK tests. The routed fixture checks
read-only member access, inference-key rejection, omission of private management
fields and deleted-content hiding. The storage fixture checks expired-content
hiding before cleanup. Gateway/storage all-target Clippy, OpenAPI unique-key
parsing, public-boundary and whitespace checks pass. These results qualify the
known-intent read/delete subset only; the complete asset workflow remains open.


### Saved-result retrieval errors

Both workspace-key and dashboard-session result downloads return safe JSON errors
when media cannot be delivered. `error.type` distinguishes
`media_result_unavailable`, `media_result_destination_rejected`,
`media_result_too_large`, `media_result_invalid` and
`media_result_transport_error` (HTTP 502), `media_result_timeout` (HTTP 504), and
`media_result_busy` or `media_result_configuration_error` (HTTP 503). Missing,
locally expired or deleted references remain HTTP 404; authorization failures
retain their existing statuses. Signed URLs, upstream response bodies and
credentials are never included.

An unavailable Supplier link is not proof of local deletion or permanent expiry;
it does not change saved job status, historical billing or the retained reference.
No error automatically retries inference or renews a result URL. Capacity errors
mean the download limit is occupied, rather than a missing Supplier credential.

### Administrator-reviewed ordinary asset authorization

Platform administrators can record reviewed qualification with
`POST /admin/v1/vendors/{id}/asset-management/authorizations`. This requires an
existing workspace in the specified organization, the exact direct Beijing Ark
configuration revision and an unrevoked asset credential revision. Supply
`organization_id`, `project_id`, `vendor_revision`, `credential_revision`,
`valid_for_seconds` (1–7,776,000), and four nonzero SHA-256 hex references:
`rights_sha256`, `protocol_sha256`, `data_handling_sha256` and
`free_operation_sha256`. Keep the underlying reviewed documents outside the
public repository. Digests identify evidence; they do not verify commercial
rights, data consent or free operation automatically.

The optional `operation` is `CreateAssetGroup` (the backward-compatible default)
or `GetAssetGroup`, `ListAssets`, `GetAsset` or `UpdateAssetGroup`. Each requires
independently reviewed evidence;
none grants another operation. Listing qualification does not authorize account-wide
discovery or transfer another workspace’s original group/account binding.
Liveness, asset ingestion and generation cannot be selected. A successful response
has a routing identifier, the selected `operation` and `dispatch_available: false`.
This control does not contact Ark or activate dispatch. Metadata updates have
a separately validated internal transport, but durable mutation dispatch and
uncertain-result reconciliation remain unimplemented. The targeted group-read
runtime and bounded retained-page listing API are described below. Individual
`GetAsset` lookup has an internal validated transport and a separate qualification
operation, original-page storage claims, immutable completion records and scoped
operational history. The platform lookup and retained-result APIs are described below; customer
lifecycle controls remain unimplemented.

`GET` on the same path lists bounded administrative metadata (default 30,
maximum 100). `after` accepts the preceding page's `next_cursor`. Records remain
visible after expiry and revocation for review; a listed record is not proof that
its current account binding is authorized. Account or credential rotation does
not transfer qualification. Customer request projections omit these evidence
references and account bindings.

`DELETE /admin/v1/vendors/{id}/asset-management/authorizations/{authorization}`
appends an immutable local revocation attributed to the authenticated
administrator. Repeated, missing and mismatched-account identifiers return 204;
a mismatched route cannot revoke another account's record. Authorization records
and revocations cannot be edited or deleted. All routes require platform
administration through the existing authenticated session or administration
credentials and return `Cache-Control: no-store`.

The JavaScript administration SDK exposes `createAssetOperationAuthorization`,
`listAssetOperationAuthorizations` and `revokeAssetOperationAuthorization`, with
scope, digest, revision and duration validation and no implicit retry. The one-shot storage handoff now requires exact, unexpired qualification under
the account lock and saves an immutable authorization receipt atomically with the
claim. Revocation uses the same lock. Runtime transport integration, live rights
and cost qualification, asset CRUD and readiness remain required before exposing
the asset workflow.

### Platform ordinary creation runtime

`POST /admin/v1/vendors/{id}/asset-management/groups` accepts
`organization_id`, `project_id`, `idempotency_key`, `vendor_revision`,
`credential_revision`, `name` and optional `description`. It requires platform
administration and the exact ordinary operation qualification described above.
The SDK method is `createOrdinaryAssetGroup`. No endpoint, signing date, group type
or retry control can be supplied.

The API saves the request before its authorized claim and returns 202 with its
saved request identifier and status. The identifier is for routing, not display.
Accepted sends continue independently of the HTTP response, with bounded capacity
and deadlines. Use `getAssetGroupRequest` or the scoped request list to inspect
saved status. Identical already-claimed requests return saved status even when dispatch
capacity is full or original keys have been erased; they never create another
upstream group. The match uses the original account/workspace binding and full
body fingerprint, without restoring erased content. Do not change an idempotency key to retry an
uncertain operation. Inspect and reconcile the original upstream outcome first.

The fixed transport verifies its response before accepting an upstream group
identity. Preflight failure, rejected destination, unknown upstream outcome or
outer deadline conservatively leave the claim uncertain. Measured transport
duration and safe failure categories are preserved in immutable internal audit
records. An outcome persistence failure leaves dispatching saved for recovery,
never automatic replay. Neither management auditing nor request inspection debits
inference billing. Live rights and free operation must still be qualified.

This administration path does not enable the complete customer asset workflow;
its existing `dispatch_available` metadata remains false. Customer model/account
routing, asset readiness/CRUD, customer UI and reconciliation controls remain
required. There is no liveness or real-person group creation through this route.

### Targeted ordinary asset-group reads

Platform administrators can send
`POST /admin/v1/vendors/{id}/asset-management/group-reads` with `organization_id`,
`project_id`, a successful saved creation's `intent_id`, and a fresh `read_id`.
Niu loads the original group/account/project/credential binding; clients cannot
supply an upstream group identifier or substitute another account. A separate
current `GetAssetGroup` qualification is required. Creation grants do not suffice.

The claim is saved before the fixed signed upstream read. Four reads can run
concurrently; excess requests fail before claiming. The transport has a 30-second
deadline and 1 MiB response limit, with a 35-second outer task deadline. Work
continues after caller disconnection and participates in graceful drain. The
first safe outcome and measured duration are durable and cannot be overwritten.
Reusing `read_id` conflicts without replay. Reads do not debit balances or change
asset readiness, group identity or creation state.

On success, the response contains `read_id`, `name`, nullable `description`,
`created_at` and `updated_at`, with `Cache-Control: no-store`. Platform access and
current operation qualification are rechecked before delivery. Upstream group and
project identifiers, credentials, signed URLs and raw failures are not returned.
Successful descriptive results are encrypted and retained for 24 hours from
completion. Recover them without another upstream request using
`GET /admin/v1/vendors/{id}/asset-management/group-reads/{read}` with
`organization_id` and `project_id` query parameters. Current platform access, the
original read grant and account/credential revisions must still be valid. Missing,
pending, failed, expired, deleted or revoked results return 404. The SDK exposes
`getOrdinaryAssetGroupRead`.

`DELETE` at the same scoped URL erases content and records a permanent deletion
marker, including during an in-flight read. Completion cannot restore deleted
content. Audit records remain; this does not delete the upstream group. Deletion
requires platform access but remains available after operation-grant revocation.
The SDK exposes `deleteOrdinaryAssetGroupRead`. Expiry blocks reads immediately;
the existing retention worker erases expired ciphertext in bounded batches.
Backups retain their own operational retention policy.
Outcome auditing does not establish live account entitlement or zero-cost terms.
The SDK exposes `readOrdinaryAssetGroup` with cancellation and no automatic retry.

### Ordinary group-read history

`GET /admin/v1/vendors/{id}/asset-management/group-reads` accepts required
`organization_id` and `project_id`, optional `limit` (1–100, default 30), and
`after` from the previous page's `next_cursor`. It requires platform administration
and returns no-store audit metadata in newest-claim-first order: `read_id`,
`status`, `started_at`, nullable `completed_at`, nullable `duration_ms` and nullable
safe `reason`. The SDK exposes `listOrdinaryAssetGroupReads` with cancellation.

`unresolved` means there is no durable outcome. It does not establish that work
is still running or permit a replay. `succeeded` and `failed` identify saved
transport outcomes, not asset readiness. Durations measure gateway execution;
claim/outcome times are local observations, not Supplier queue/run measurements.
Names, descriptions, upstream account/group identifiers and ciphertext are
excluded. Audit remains after content erasure or grant revocation. History reads
do not call the Supplier, renew result access or change billing.

### Platform ordinary asset listing

`POST /admin/v1/vendors/{id}/asset-management/listings` accepts
`organization_id`, `project_id`, `intent_id`, one-shot `listing_id`, and
`maximum_items` (1–100), and optional `previous_listing_id`. Without a parent it lists the first page of the successfully saved
ordinary group's assets using its original account/project and a separate live
`ListAssets` qualification. It accepts no upstream group, URL, endpoint or cursor.
Creation and group-read grants do not authorize listing.

Four listings can execute concurrently without queuing; excess requests return
503 before claiming their identities. Transport is bounded to 1 MiB and 30 seconds,
with a 35-second outer transport deadline. Claimed work continues after caller
disconnection; retrying its identity never replays the upstream call. Validated
private snapshots are encrypted separately from group-read results, bound to the
workspace and listing identity, and retained for at most 24 hours in the active
database. Outcome and snapshot commit together before content is returned.

The response contains `listing_id`, `items` and `has_more`. Each item contains
name, media type, observed status and creation/update/optional last-inference
timestamps. Empty names remain empty. Upstream identities, signed URLs, cursors,
moderation payloads and raw errors are withheld. An Active observation is not
permission or proof of suitability to reuse that asset for generation.
To continue, submit a fresh `listing_id` with the retained parent as
`previous_listing_id`, the same intent and unchanged `maximum_items`. Niu decrypts
the parent and uses its validated cursor through the exact original grant. Each
parent permits one child, and a chain permits at most 100 pages. Terminal, already
continued, mismatched or exhausted chains return 409; unavailable parent content
returns 404. Raw cursors are never accepted. `has_more: true` means this page is
incomplete, not that all assets have been discovered.

`GET /admin/v1/vendors/{id}/asset-management/listings/{listing}` recovers the
retained page without another upstream call. Supply `organization_id` and
`project_id` as query parameters. Exact original qualification/account/credential
bindings must remain current; missing, pending, failed, expired, deleted and
revoked content returns 404. POST/GET content responses are no-store.

`DELETE` at that scoped path erases local content and records a tombstone that
also blocks in-flight content storage. Each page retains its own content; deleting
a parent prevents new continuation from that parent but does not erase an already
saved child. Deletion remains available after operation-grant revocation, is
idempotent and preserves audit and upstream assets. These endpoints
require platform administration; they are not customer asset management.
The SDK provides `listOrdinaryAssets`, `getOrdinaryAssetListing` and
`deleteOrdinaryAssetListing`, with cancellation forwarding and no implicit retry.
No live Supplier listing or complete asset lifecycle is qualified yet.

### Platform asset-listing audit history

`GET /admin/v1/vendors/{id}/asset-management/listings` lists durable operational
audit metadata. Supply `organization_id` and `project_id`, with optional `limit`
(1–100, default 30) and `after` from `next_cursor`. Records are newest-first with
stable claim-time/identity pagination. Unknown or out-of-scope cursors return an
empty page. The SDK method is `listOrdinaryAssetListings`.

Each record contains its listing/parent routing references, page number, status,
claim/completion time, measured gateway duration, safe failure category and
observed item count/next-page availability. A missing outcome is `unresolved`:
completion time, duration, count and next-page availability remain null. It does
not mean work is still running or permit replay. These intervals do not establish
Supplier queue/run times. A recorded `has_more` does not renew continuation rights
or establish complete inventory.

History remains after content expiry/deletion or grant revocation and requires
current platform administration. No asset names, upstream identities, signed URLs,
cursors, raw errors, credentials or prices are returned. It makes no upstream
request, releases no credential, changes no billing and uses `Cache-Control:
no-store`. Route references are API contracts, not product display labels.


## Individual ordinary-asset lookup

`POST /admin/v1/vendors/{id}/asset-management/lookups` is platform-administrator
only. Supply `organization_id`, `project_id`, `listing_id`, a fresh `lookup_id`
and a zero-based `item_index` from the retained page (0–99). Do not supply an
upstream asset identity, URL, endpoint or credentials. The original encrypted
page must remain available under its original ListAssets grant, with an additional
current GetAsset grant for the same workspace/account/credential revisions.

Admission decrypts and validates the exact workspace/listing snapshot and claims
the lookup once before egress. Four lookups may execute concurrently; overload
returns 503 without consuming the lookup identity. Claimed work continues after
caller disconnect. The fixed signed transport has a 1 MiB/30-second limit and a
35-second outer deadline, without proxy, redirects or retries. Never blindly
repeat a claimed lookup: absence of completion is unresolved, not replay rights.

A successful response has `data.lookup_id`, `status: succeeded` and
`asset_status: Active | Processing | Failed`. Success describes the lookup
transport, not the asset's processing outcome. It does not grant readiness or
reuse permission. The POST returns no descriptive content; a separately encrypted snapshot is
retained for 24 hours and recovered through the saved-result API. Safe failure categories and measured duration enter immutable audit records;
no billing mutation occurs.

`GET` on the same path accepts `organization_id`, `project_id`, optional `after`
and `limit` (1–100, default 30). It returns bounded newest-first operational
history and `next_cursor`; it never calls upstream. History survives original
content erasure and grant revocation. Missing completion fields remain null.
Both operations return `Cache-Control: no-store`; ordinary workspace roles and
inference keys cannot access them. Internal routing references are not UI labels.

SDK methods are `lookupOrdinaryAsset` and `listOrdinaryAssetLookups`. Neither
retries automatically. Customer controls, reusable references and live
qualification remain separate unfinished requirements.

`GET /admin/v1/vendors/{id}/asset-management/lookups/{lookup}` accepts the original
`organization_id` and `project_id`. It requires platform administration, the exact
original listing and lookup grants, account/credential revisions and current
credentials. It decrypts only the workspace/lookup context and validates the
single retained item before returning `data.lookup_id` and `data.asset`: name,
status, media type, creation/update times and optional last-inference time.
Upstream identities, URLs, credentials and raw errors are omitted. Expired,
erased, revoked or out-of-scope results return 404. Recovery never calls upstream.

`DELETE` on that path erases only retained lookup content. It remains available
to platform administrators after grant revocation and is idempotent. A deletion
tombstone prevents an in-flight completion from restoring content; immutable
operational history survives. Lookup and source-listing retention are independent:
erase each content domain when both copies should be removed. Recovery uses
`Cache-Control: no-store`. The SDK provides `getOrdinaryAssetLookupResult` and
`deleteOrdinaryAssetLookupResult`, with scoped IDs and cancellation forwarding.

### Prepared ordinary-group metadata edits

`POST /admin/v1/vendors/{id}/asset-management/group-updates` is platform-admin
only. Supply `organization_id`, `project_id`, the saved group `intent_id`, a
new `update_id`, and at least one of `name` or `description`. The gateway derives
the original upstream group/project from storage; clients cannot supply them.
A current distinct UpdateAssetGroup grant is required. The patch is encrypted
for 24 hours and bound to its workspace/update identity. Repeating the same
identity and patch is idempotent; a changed patch conflicts. Omitted fields
remain unchanged; an explicit empty description is retained as an intended clear.
The response reports `prepared: true` and `dispatch_available: false`. This
endpoint does not send a mutation or charge inference. Use the explicit read-back endpoint below to reconcile acknowledged writes.

Prepared updates can be explicitly submitted once using
`POST /admin/v1/vendors/{id}/asset-management/group-updates/{update}/dispatch`
with `organization_id` and `project_id`. This is a separate platform-admin
action; preparation itself never dispatches. Current original update permission
and retained authenticated content are required. A durable claim and group hold
precede credential release. The response reports `acknowledged` or `uncertain`,
both with `reconciliation_required: true`. Neither permits replay or another
edit of that group. An uncertain result does not prove the mutation was not
applied. Caller disconnect leaves the tracked worker running; process loss
leaves an unresolved claim. There are four execution slots, a 30-second transport
deadline and a 35-second outer deadline. No automatic retry occurs. This route
does not establish live channel qualification.

`POST /admin/v1/vendors/{id}/asset-management/group-updates/{update}/reconcile`
accepts `organization_id`, `project_id` and a `read_id`. It requires an
acknowledged held update, retained patch and separate current GetAssetGroup
permission for the original account. A retained successful read bound to this
update and identity is reused after interruption without another upstream call.
Otherwise the gateway claims a fresh read and persists its encrypted metadata.
It authenticates both saved snapshots before comparing
the requested fields. A match records reconciliation and releases the hold
atomically; mismatch preserves it. Success returns `status: "reconciled"` and
`reconciliation_required: false`. Uncertain and already reconciled updates do
not send a read. This does not replay the mutation, prove live channel
qualification or qualify packaged process recovery.

`GET /admin/v1/vendors/{id}/asset-management/group-updates` accepts required
`organization_id` and `project_id`, optional `after` and `limit` (1–100, default
30). It returns safe update status, timing, patch retention and reconciliation
state, plus `next_cursor`. It excludes patch metadata, upstream identities,
credentials and commercial amounts. `DELETE` on the same base plus `/{update}`
with the scoped query erases the retained patch idempotently. Both routes require
platform administration and use no-store responses. Erasure preserves audit and
holds, does not cancel an already claimed write, and never restores replay rights.

## Owner-funded video and procurement budgets

An authorized personal video route belongs to its recorded company and is paid
by the upstream credential owner. A workspace's legacy platform procurement
budget does not prevent personal video estimates, saved intents or submission.
Personal calls do not create customer or procurement reservations and charges.
Current key/model permissions, Guardrails and dispatch-time ownership/revision
checks still apply. Shared video routes remain unsupported under a legacy
procurement budget; customer-funded media qualification is a separate boundary.

A current-input native run first reproduced HTTP 501 on personal video intent
save when a one-nanounit procurement budget existed, with no attempt created.
After the admission correction, a fresh isolated run retained that budget and
completed an owner-funded estimate, saved intent and real OpenRouter video.
Concurrent intent writes, actor isolation, changed-input rejection, deleted-intent
rejection, revoked-key rejection and rotated-key restoration were exercised.
Losing a submit response, concurrent replay and replay after gateway restart all
resolved to one saved job and one upstream submission.

The job reached `succeeded`; its downloaded 88,738-byte result was independently
inspected and fully decoded by the media verifier. SQL and API reads confirmed
unchanged procurement budget counters, no procurement costs/holds and no customer
charges or balance entries. Deleting the intent prevented another submission.
Temporary keys were revoked and isolated processes stopped; original development
data and encrypted identity were preserved. This verifies the exercised personal
video lifecycle, not customer-funded video settlement or all provider models.

### Key controls with a saved procurement budget

Three fresh native current-input runs against `b5fc71f` independently configured
an owner-funded video route and a one-nanounit workspace procurement budget. A
zero request-rate policy returned 429 `key_request_rate_exceeded`; a zero
concurrency policy returned 429 `key_concurrency_exceeded`; a finite token-rate
policy returned 422 `key_token_bound_required`, since this video channel does not
provide the required token admission bound. Each outcome was checked before and
after gateway restart. Revoking the corresponding key then returned 401.

Independent SQL confirmed zero dispatched attempts, no media transport records,
and no customer charges, balance entries, customer holds, procurement costs or
procurement holds in each run. Procurement budget responses were unchanged.
Prepared attempts may remain as safe diagnostic evidence. The original encrypted
identity was unchanged and isolated processes were stopped. These observations
verify that excluding personal video from platform procurement does not bypass
the exercised key controls; they do not establish finite-token video support,
nonzero-limit contention or customer-funded settlement.
