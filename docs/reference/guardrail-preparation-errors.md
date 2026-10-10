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
Post-dispatch output failures and upstream errors are outside this change.

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
