# FastRouter video integration

FastRouter uses the existing direct Ark video protocol at
`https://fastrouter.wecitytech.com/doubao/api/v3`. Configure its API key as a
Supplier credential with adapter `ark`; keep model mappings, customer prices and
commercial qualification separate. Do not infer a discount or commercial supply
agreement from a working test key.

The [creation](https://fastrouter-docs.wecitytech.com/docs/video/create-task),
[query](https://fastrouter-docs.wecitytech.com/docs/video/query-task) and
[model](https://fastrouter-docs.wecitytech.com/docs/video/models-and-params)
contracts use asynchronous Seedance tasks. Niu retains its own job identity,
authorization, saved status, recovery and result access. Provider identifiers and
raw error envelopes are adapter details. Supported parameters belong to the
selected model configuration, not a universal Seedance preset.

Ordinary reference URLs follow the configured video schema. They do not require
a locally configured detector unless an explicit customer policy requires
inspection. Mandatory policies still fail closed where inspection is unavailable.
Niu does not fetch or inspect arbitrary reference URLs on this path. OpenRouter's
video channel remains text-only.

Use `client.video.generate` with Niu's `prompt`, `references`, `durationSeconds`
and `aspectRatio` parameters; the SDK performs protocol conversion internally.
References use `{kind, url, role?}` for ordinary URLs or `{assetId, role?}` for a saved Niu Provider asset. The backend resolves asset kind and private transport reference; callers cannot supply an upstream asset URI. The model must declare support for that reference kind. Saved assets require Active status and an acknowledged creation in the same workspace and upstream account. Current authorization and route identity are checked again atomically before dispatch.
The existing `video.jobs.create` method remains available for compatibility.
Use `video.jobs.retrieve`, `refresh`, `wait` and `results.retrieve` for Niu tasks.
`wait` starts from saved state. An initial `unknown` gets one explicit refresh
to resolve a persisted upstream receipt; if it remains unknown, waiting returns.
Queued/running jobs then refresh at the configured interval. Its default interval
is five seconds and deadline ten minutes; callers can provide an AbortSignal.
`submission_unknown` and reconciliation states return without a refresh for
explicit handling. Waiting never submits or retries a generation; cancelling a
wait does not cancel the upstream task.

The [asset](https://fastrouter-docs.wecitytech.com/docs/video/assets) and
[identity verification](https://fastrouter-docs.wecitytech.com/docs/video/face-verification)
operations use a separate Bearer Action transport. The internal adapter implements
the finite documented operations, model routing and bounded response handling.
It does not expose an arbitrary Action endpoint as the Niu SDK contract. Workspace-scoped APIs are exposed through `client.media.groups`, `assets`,
`operations` and `verification`. Mutations retain a durable operation and accept a
canonical UUID idempotency key; replay does not resend the mutation. Verification
links are explicit authenticated reads. No human verification or asset readiness
is inferred from HTTP success or an ID prefix. Provider asset generation cannot
currently be mixed with ingestion or workspace-library reference inputs.

## Actual evidence and unfinished scope

The provided FastRouter credential returned HTTP 200 for actual model discovery
with four documented Seedance models. Supplier credential persistence was checked
through real native HTTP against migration 290, restart and independently reopened
records. The exact stored credential decrypts under the preserved encryption
identity; existing credential and financial records are retained. Four draft
bindings are saved without prices or commercial qualification. Disabled draft
mappings are not advertised as working generation routes.

Committed Gateway/contracts, SDK and protocol adapter have static compilation
checks. The documentation artifact serves eighteen content routes and thirty-one
local page/resource requests, including the specification. Rendered browser
acceptance remains delegated. One [actual documented generation](fastrouter-documented-video-acceptance.md)
retained an upstream receipt and produced an independently decoded video through
an official exact-task query/download. A subsequent zero-generation run also verifies Niu Gateway polling, terminal
persistence, result retrieval and restart for that saved task. Reported quantity
is retained without inventing an output tariff. Actual [group creation](provider-asset-group-acceptance.md) and
[video asset creation, Active refresh and restart](provider-video-asset-acceptance.md)
have separate scoped evidence. Local verification authorization and persistence
checks are recorded in [verification acceptance](provider-verification-local-acceptance.md).
Customer media settlement, generation from Niu asset IDs, completed human
verification, additional asset operations and other model versions remain
unverified. Model-list access and stored keys alone do not establish business acceptance.

## Seedance model availability and lower-cost default

The Video model list exposes every enabled, valid video mapping authorized by the selected workspace key. It is not restricted to Seedance 2.5. Current FastRouter model discovery returned Seedance 2.0, 2.0 Fast, 2.0 Mini and 2.5. Disabled mappings and key grants can legitimately reduce the selectable list.

[Additional model mapping payloads](fastrouter-seedance-model-mappings.json) are portable configuration examples for the existing Supplier model management API. Apply each to the intended FastRouter credential using `admin.upsertSupplierModel`; include the current `expected_revision` when updating an existing mapping. Keep the already qualified 2.5 mapping unchanged. Workspace keys must independently authorize the selected aliases. No credentials, workspace references or prices are bundled. These examples use the bounded text-only 5-second/480p profile; they do not advertise unqualified image inputs, native material tools, other parameter combinations or successful generation of every discovered model. Mini has actual generation evidence below; 2.0/Fast discovery is not generation acceptance.

A new Video composer prefers the available `fastrouter/seedance-2.0-mini` mapping over list order. Existing selections and restored drafts remain unchanged. This is the requested Mini preference, not a universal price comparison: the model list has no comparable customer quotes, and unknown prices are never treated as zero or derived from confidential Supplier costs.

## Actual Mini intent and result qualification

One explicitly authorized `doubao-seedance-2-0-mini-260615` text-video submission requested 5 seconds at 480p. FastRouter returned the same original task with `succeeded`, an observed model identity of `doubao-seedance-2.0-mini`, and reported completion usage. Niu accepts this exact dated-to-reported identity mapping only on the official FastRouter query endpoint, while retaining exact task identity checks. Arbitrary model-family or prefix matches remain rejected.

The Video intent was saved and bound to a session before submission. No explicit task attachment was sent. Session retrieval and session-filtered task inventory resolved the original submitted task, canonical submit replay returned it without redispatch, and Gateway restart preserved the intent and session projections. Independent SQL found one intent binding, one upstream submission and zero explicit task attachments. Another actor could not read the private intent/session. Result delivery returned nonempty MP4 bytes with an independently matched hash and complete decode (about five seconds). This owner-funded personal test does not establish commercial Supplier pricing or an exact upstream monetary charge.
