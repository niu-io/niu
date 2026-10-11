# Guardrail preparation errors

A recorded Guardrail preparation refusal now returns HTTP 403 with
`error.type: "guardrail_denied"`. Its safe message states that configured
Guardrails rejected the request before model dispatch. It does not disclose the
matched input, rule, detector configuration or upstream details. Authorized
preparation diagnostics retain their existing detailed reason and policy binding.

This applies to the existing recorded model/Provider policy, unsupported-policy,
input-inspection, incompatible-output and detector preparation refusals. It does
not redefine every 403: source restrictions, administrative authorization and
other permission checks retain their separate behavior. Clients should inspect
the error type rather than infer Guardrails from the HTTP status or message.
Upstream errors retain their separate behavior. Post-dispatch output withholding
has its own error described below.

No dispatch, pricing, reservation, retry or cooldown policy changes. If recording
the preparation denial fails, the storage error still propagates rather than
claiming a successfully retained diagnostic.

## Current-input verification — 2026-10-11

A fresh isolated native gateway saved an input-block policy through the normal
management API, using a fresh unique marker. Actual Chat, Responses and embeddings
requests containing that marker reproduced the old `permission_denied` response.
With the updated binary, all three returned `guardrail_denied`, without exposing
the marker. An ordinary unauthorized administration request still returned
`permission_denied`. Restart retained the new denial behavior.

An allowed Chat control made a real personal OpenRouter completion and returned
its requested fresh marker and reported usage. Independent reopening found four
persisted input-block denials and only the allowed request's single attempt. Its
charge/debit matched the independently calculated pinned tariff amount; the
customer hold was released and no credential cooldown was created. Internal
credit/rates were verification inputs, not external funding or commercial supply.

This checks local input-block refusal for the three exercised protocols and a
positive Chat control. External detectors, video and post-dispatch enforcement
require separate evidence. Original development
data and encrypted identity were preserved; isolated processes stopped. Fixture
outcomes were not used as evidence.

### Access and output-compatibility refusals

A separate fresh native run activated three successive policies through the
management API: deny all models, deny all Providers, and buffered output
inspection with a fresh unique block pattern. Actual Chat and Responses requests
requested streaming; embeddings used its normal input shape. Each of the three
protocols returned HTTP 403 `guardrail_denied` under each policy, without exposing
the pattern or internal denial reason. After gateway restart, streaming Chat
remained refused under the saved output policy.

Independent reopening of PostgreSQL found three `model_denied`, three
`provider_denied` and four `output_incompatible` records, all bound to a workspace
policy revision. There were no attempts, customer charges, balance entries,
balance reservations, credential cooldowns or Supplier earnings. These requests
exercise pre-dispatch refusal against the configured route; no upstream response
was supplied or synthesized. This does not verify supported output inspection,
external detector decisions, unsupported stored-policy recovery or video.

### Scoped diagnostic access

A further fresh native run created ten preparation refusals and two workspaces.
A workspace-scoped viewer read all ten own-workspace records from
`GET /admin/v1/organizations/{organization}/projects/{project}/guardrails/denials`.
The response used `Cache-Control: no-store`, declared
`latest_100_preparation_denials` coverage, retained the detailed reasons and did
not contain the submitted unique input marker. The viewer received HTTP 403 for
the other workspace's policy and denial history, and for policy mutation. An
inference API key received HTTP 401 on the diagnostic endpoint. Installation
access confirmed the other workspace had no denials.

After restart, the viewer could still read the original ten records; revoking
the viewer credential changed that read to HTTP 401. Independent database
reopening confirmed the ten revision-bound reasons and no attempts, charges,
balance entries, reservations, cooldowns or Supplier earnings. This establishes
the exercised workspace-viewer boundary, not every organization role or
pagination beyond the endpoint's explicitly limited latest-100 coverage.

## Post-dispatch output withholding

Buffered output enforcement returns HTTP 403 with
`error.type: "guardrail_output_withheld"` when inspection blocks the response,
cannot safely inspect it, or cannot durably record the output decision. The safe
message states that output was withheld after model dispatch and generation
charges may apply. It does not imply a permission error, free generation or a
pre-dispatch refusal. Clients should not automatically retry this paid operation.

The existing completion accounting still records actual reported usage even
when delivery is blocked. Authorized request Guardrail diagnostics distinguish
recorded block and indeterminate outcomes. A failure to save that diagnostic
does not claim that a decision was persisted. No output content or matched rule
is included in the public error.

Current-input verification activated a buffered block rule through management
HTTP, then made an actual non-streaming personal OpenRouter Chat request in a
fresh isolated native environment. The old binary returned the misleading
`permission_denied`; the updated binary returned `guardrail_output_withheld`.
Neither response included the requested fresh marker. Each run persisted an
output `blocked` / `pattern_denial` decision and confirmed-completed attempt.
Restart retained the authorized diagnostic. Independent database reopening
verified positive stored usage, the exact independently calculated tariff charge
and debit, released reservations, and no preparation denial or cooldown.
Internal credit and verification tariffs do not represent merchant funding or
commercial supply. This covers a Chat pattern block, not Responses output,
redaction, indeterminate inspection or diagnostic-storage failure.

### Responses envelope compatibility

The Responses output inspector accepts absent or null `prompt_cache_options`
and `reasoning.context`. A current personal OpenRouter response included both
fields as null; previously, that otherwise textual envelope was withheld with
an `indeterminate` / `unsupported_content` diagnostic. Non-null values remain
unsupported, as do unknown fields. This compatibility adjustment does not grant
inspection coverage for opaque cache configuration or reasoning context.

After the adjustment, a fresh native run made an actual personal OpenRouter
Responses generation under a buffered block rule. It returned
`guardrail_output_withheld` and persisted `blocked` / `pattern_denial`, which
remained readable after restart. Activating a nonmatching output rule then
allowed a second actual Responses generation to deliver the requested unique
marker. Independently reopened PostgreSQL retained both completed attempts,
their blocked/allowed decisions, exact tariff charges and corresponding total
debits, with released reservations and no preparation refusals or cooldowns.
The delivered response's reported usage matched its persisted attempt. The
withheld response's charge was independently calculated from persisted usage;
its raw content was not exposed. Non-null extensions and other unsupported
envelopes were not live-qualified by these two calls.

### Delivered and retained redaction

A separate fresh native run activated a buffered output-redaction rule for a
new unique marker and made actual personal OpenRouter Chat and Responses calls
requesting that text. Both returned HTTP 200 with `[REDACTED]`; the original
marker was absent from the entire delivered response and the scoped Guardrail
diagnostic. Both diagnostics recorded `redacted` / `inspected_text` and remained
readable after restart.

Independent database reopening matched each response's reported usage to its
completed attempt, independently calculated each pinned-tariff charge, and
reconciled the two debits with released reservations. Both saved response bodies
were complete, untruncated and contained redaction instead of the original
marker. Output redaction does not redact the separately retained request input;
that input remains subject to the existing capture and retention controls.
No preparation refusal or cooldown was created. These two textual calls do not
qualify streaming redaction, arbitrary metadata, tool output or external detectors.

### Observe-only output matches

A fresh native run activated an `observe_only` output policy with a block-action
pattern for a unique marker. Actual Chat and Responses calls both delivered
that marker unchanged with HTTP 200. Their scoped diagnostics recorded an output
observation of `matched` / `pattern_match`, without including the marker itself;
the observations remained readable after restart. The rule's block action does
not turn observation mode into enforcement.

Independent reopening found two completed attempts whose stored usage matched
the actual response usage, individually correct tariff charges and matching
total debits, released reservations, and two observations. There were no output
enforcement decisions, preparation refusals or cooldowns. Saved response bodies
also contained the unmodified delivered marker. Observation therefore does not
provide redaction or content-withholding guarantees. This checks successful
observation persistence for two non-streaming textual calls; observation-storage
failure, streaming and other envelope types remain separately unverified.

## Policy conflict at unpriced dispatch admission

A legacy unpriced request can finish inspection just before an administrator
activates another workspace policy. Dispatch rechecks the saved inspection
binding against the current policy. A rejected admission now returns HTTP 409
with `guardrail_admission_conflict`, rather than misreporting healthy storage as
unavailable. Native Messages keeps its protocol error envelope and exposes this
reason through `x-niu-error-code`. A client can submit a new request for inspection
under the current policy; the rejected request is not sent upstream.

Storage emits this distinct conflict only after rollback and successful durable
rejection auditing. The queue can isolate records after this known rollback;
unknown database failures still do not authorize replay. This change does not
broaden retries for generic conflicts or bypass inspection. An initial batch
refusal and individual admission refusals can each retain an audit record; they
must not be interpreted as additional upstream attempts.

### Current-input checkpoint — 2026-10-11

An isolated legacy organization without a prepaid account exercised the unpriced
path. A database lock paused an actual HTTP request at inspection-binding insert;
management HTTP activated a new policy, then the lock was released. The previous
binary returned 503 `storage_error` despite retaining a `policy_changed` rejection
and dispatching no attempt. With the change, separate Chat and Messages runs
returned the explicit 409. Restart retained the audit records. A fresh Chat
request in each run then completed against the personal upstream under the new
policy, returning its unique requested marker.

Independent reopening matched the sole attempt in each database to its actual
response usage and credential binding, and confirmed the revision-one policy
rejection records and absence of customer charges, debits or reservations. No
existing installation data was removed. This verifies a workspace-policy race
for the two exercised unpriced protocols; it does not establish a mixed-record
batch, key-policy race, paid dispatch behavior or commercial settlement.

A follow-up actual Chat run kept workspace revision one unchanged while assigning
that policy to the request's API key after inspection. The paused request returned
409 `guardrail_admission_conflict`; independent reopening confirmed the rejection
bound to workspace revision one, key policy one and assignment revision one. Only
the subsequent freshly inspected request completed upstream, with its saved usage
matching the sole attempt and no customer financial records. This adds key-policy
assignment evidence for unpriced Chat; removal, rotation and mixed-record batches
remain separate cases.

The committed `933ce9c` binary was rebuilt and installed in the existing native
development runtime. Readiness returned 200, with configuration/encryption-file
hashes, vendor ciphertext/revisions and checked organization, workspace, media-job
and financial-entry counts unchanged. Its GitHub CI completed successfully;
fixture outcomes are not business-verification evidence.

## Paid dispatch policy conflicts

Priced admission now returns the same `409 guardrail_admission_conflict` after
committing an audited Guardrail refusal and releasing the unsent customer hold.
Previously it returned the generic `conflict_error`. Only the audited denial
branch gets this classification; unknown storage/commit failures keep their
existing behavior. Unlike unpriced batch rollback, paid refusal retains its
prepared `not_sent` attempt and immutable rejection record. It creates no charge
and does not authorize automatic upstream replay.

Actual current-input Chat and Messages requests were paused at inspection-binding
insertion while the management API activated a new workspace policy. Each
returned the explicit 409; Messages preserved its native error envelope and used
`x-niu-error-code` for the Niu classification. Restart retained one unsent denial
with no open hold. A freshly inspected Chat request in each run then completed
against personal OpenRouter access under approved internal credit. Independent
reopening matched its raw response usage, pinned tariff, exact single customer
charge and debit, with released holds and revoked temporary keys. Neither run
created merchant funding. These checks cover the exercised workspace-policy race,
not paid key-assignment races, every protocol or full Guardrails acceptance.
