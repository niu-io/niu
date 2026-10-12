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
References use `{kind, url, role?}` rather than Provider-specific nested blocks.
The existing `video.jobs.create` method remains available for compatibility.
Use `video.jobs.retrieve`, `refresh`, `wait` and `results.retrieve` for Niu tasks.
`wait` starts from saved state and only refreshes queued/running
jobs. Its default interval is five seconds and deadline ten minutes; callers can
provide an AbortSignal. Unknown submission and reconciliation states return for
explicit handling. Waiting never submits or retries a generation; cancelling a
wait does not cancel the upstream task.

The [asset](https://fastrouter-docs.wecitytech.com/docs/video/assets) and
[identity verification](https://fastrouter-docs.wecitytech.com/docs/video/face-verification)
operations use a separate Bearer Action transport. The internal adapter implements
the finite documented operations, model routing and bounded response handling.
It does not expose an arbitrary Action endpoint as the Niu SDK contract. Stable
workspace-scoped group, asset and verification APIs remain unfinished; no human
verification or asset readiness is inferred from an HTTP success or ID prefix.

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
acceptance remains delegated. Actual generation, SDK polling, downloadable result,
reported media settlement, asset operations and identity-verification integration
are not yet qualified by these observations. Model-list access and stored keys
alone do not establish business acceptance.
