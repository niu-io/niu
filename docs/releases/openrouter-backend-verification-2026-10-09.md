# OpenRouter backend checkpoint — 2026-10-09

Scope: current-input backend requests with an owner-funded OpenRouter credential,
workspace API keys and PostgreSQL. No fixture-test result is used as evidence.
Frontend, commercial supply, prepaid payment qualification, video and performance
qualification remain open. This checkpoint does not qualify a complete release gate.

## Network diagnosis

Direct upstream calls to `openai/gpt-4.1-mini`, both streaming and nonstreaming,
returned HTTP 403 with a regional availability refusal. The same model streamed
successfully through a local Clash proxy. After enabling Clash TUN with the
OpenRouter domain routed to the proxy group, a direct streaming call returned
HTTP 200 and `[DONE]`. A catalog connection check alone had not diagnosed this.
The gateway continues to use its existing direct DNS-pinned, no-proxy client;
no product proxy exception or weaker destination validation was introduced.

## Actual gateway and database verification

Using the public administration APIs, a credential was saved encrypted, assigned
to its personal owner, and mapped to a private model alias. A workspace key with
an explicit model grant then made four actual requests: two nonstreaming and two
streaming. All four returned HTTP 200; streams ended with `[DONE]`.
Independent PostgreSQL reads and the workspace request API showed four
`confirmed_completed` attempts, `provider_reported` usage, 12 input and 2 output
tokens per request, complete HTTP 200 timings and `stop` finish reasons. Observed
request duration was approximately 0.9–1.4 seconds; this is a functional sample,
not a performance benchmark.

A separately granted invalid upstream model made one actual streaming request.
OpenRouter returned HTTP 400; Niu returned a fixed `upstream_error` envelope with
HTTP 400, and persisted timings retained that status. The arbitrary upstream
message and model error text were not forwarded. Execution remains
`may_have_executed`, with unknown usage: HTTP rejection alone does not authorize
inventing usage or declaring an uncertain request free.

All five attempts retained immutable personal-route bindings. Independent
queries found no customer tariff bindings, customer balance-account bindings or
commercial Supplier-offer bindings. The customer request API reported
`owner_funded` and no customer charge. The invalid-model test key was revoked. After a gateway restart with the final
binary, all five workspace request records were read again and compared equal
to their pre-restart values.

## Change and limits

OpenAI-compatible Chat now preserves non-success upstream HTTP status for both
streaming and nonstreaming requests. Error bodies are read with a 16 KiB bound
and a two-second deadline; only a known regional refusal maps to a fixed regional
message. Arbitrary upstream messages, metadata and credentials remain excluded.
Stream connection failures report safe timeout/connect flags in server logs.
Transport and malformed-success failures remain 502.

The live invalid-model check qualifies the generic rejection path. The subsequent [Supplier/workspace checkpoint](supplier-workspace-backend-verification-2026-10-09.md)
also captured a live regional HTTP 403 through the modified gateway and diagnosed
its TUN egress. Rate-limit behavior, commercial settlement and broader protocol
qualification remain unverified.
Build, formatting and scoped Clippy checks provide tooling validation only.
See [network guidance](../reference/openrouter-network.md).
