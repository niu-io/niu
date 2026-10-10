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
