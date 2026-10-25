# Provider integration identity and discovery

Issue #97 is tracked by Bead `niu-2xp.2`. Integration identity describes the
upstream service platform; it is separate from an inference API format, a
credential, commercial qualification and customer pricing.

## Configuration contract

Supported identities are `openrouter`, `newapi`, `litellm` and `custom`. A Provider
can save a default. Each connection can override it, including an explicit Custom
selection, or clear its override to inherit. An existing record without either
selection resolves to Custom with source `unspecified`; Niu does not infer a
platform from a business name, logo or credential. Changing the selection does
not silently modify the saved adapter or endpoint.

`GET` and `PUT /api/v1/providers/{provider}/integration` manage the default.
`GET` and `PUT /api/v1/vendors/{id}/integration` manage a connection override.
Both require platform configuration authority. Responses include the saved
selection, effective identity, source and local revision. Writes require that
revision, starting at zero before the first save. Clearing an override retains
its revision to prevent a stale editor from resurrecting an old selection.

The JavaScript administration client exposes `getProviderIntegration`,
`setProviderIntegration`, `getConnectionIntegration` and
`setConnectionIntegration`. A default change affects inheriting connections;
explicit overrides remain unchanged. The source and effective identity must be
shown together in the configuration UI. Provider Settings owns the default;
API-key details own the connection override. Each save has independent conflict
and uncertain-result recovery.

## Discovery and review requirements

Discovery uses the saved credential and existing bounded, redirect-rejecting
catalog transport. Endpoint suggestions are editable, explicit configuration
choices. Selecting an integration must not make network requests or import models
without a user action. Unknown endpoints and unsupported versions retain manual
configuration.

Returned model inventory and credential authorization are distinct evidence.
For example, OpenRouter documents separate
[public model inventory](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)
and [credential-specific model filtering](https://openrouter.ai/docs/api/api-reference/models/list-models-filtered-by-user-provider-preferences-privacy-settings-and-guardrails).
For explicitly selected OpenRouter integrations, discovery should request
`GET /models/user?output_modalities=all` using the saved credential, after a
successful [current-key identity read](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key)
at `GET /key`. An actual invalid-bearer request returned public inventory from
`/models/user`; therefore that endpoint alone does not prove credential identity.
The identity response is bounded to 64 KiB and discarded after validating its
shape. Its key label, account identifiers, budgets and usage never enter the
catalog response. Unsupported identity endpoints retain explicit manual setup. The endpoint
defaults to text-output models, so omitting the modality parameter would silently
exclude other supported inventory. A successful filtered listing establishes
only the result of that credential-scoped read; it does not establish successful
inference, sufficient balance, agreed rates or selling eligibility. A denied or
unsupported filtered endpoint must not silently fall back to a public listing
and retain a credential-qualified label. A public listing must not be presented
as proof that a credential may dispatch every model. A discovery error or denied
management operation must remain visible rather than become an empty successful
catalog.

[LiteLLM model management](https://docs.litellm.ai/docs/proxy/model_management)
and [New API token usage](https://doc.newapi.pro/api/token-usage/) describe different
operational and credential scopes. Ordinary inference credentials must never be
assumed to authorize management APIs. Capability reporting must distinguish what
the selected integration supports, what the configured instance exposes and what
the supplied credential actually permitted during the latest read.

Imports require a review of selected model identities, metadata and changes to
existing mappings. Reuse the existing revision-checked model publication path.
Discovery does not enable unverified inference capabilities merely because a
model advertises text output. Public catalog prices are descriptive upstream
information; agreed purchase rates and customer selling prices remain separate
explicit publications. Discovery must not change either price schedule.

## Verification boundary

Current-input acceptance verified durable configuration, inheritance, overrides,
stale-write rejection, platform authorization and restart persistence against an
actual isolated gateway and database. The browser subsequently verified separate
configuration saves, conflict recovery and a reviewed single-model import from
live OpenRouter discovery. Evidence and limits are recorded in
`docs/ux/issue-repair-verification-2026-10-25.md`. Other integration instances,
manual recovery after discovery failure and hosted acceptance remain unverified;
the narrower successful runs do not qualify those behaviors.
