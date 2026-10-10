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
positive Chat control. The other preparation reasons, external detectors, video
and post-dispatch enforcement require separate evidence. Original development
data and encrypted identity were preserved; isolated processes stopped. Fixture
outcomes were not used as evidence.
