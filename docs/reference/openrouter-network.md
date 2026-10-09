# OpenRouter network routing and rejection diagnostics

A successful connection or model catalog check does not qualify inference.
Verify an actual request for the selected model, including streaming completion
and reported usage when relevant.

The gateway ignores environment HTTP(S) proxy settings and uses DNS-pinned,
public-address connections with redirects disabled. On a development machine
using Clash Verge, route `openrouter.ai` through the intended proxy group and
enable TUN if direct traffic exits through a region unavailable to the model.
Ensure the hostname resolves to real public addresses; fake-IP DNS addresses
are rejected by the gateway. Do not weaken destination validation or enable
arbitrary environment proxies to work around a network routing problem.

OpenAI-compatible Chat returns an upstream non-success HTTP status with an
`upstream_error` envelope. A recognized regional model refusal receives a fixed,
actionable message. Upstream response bodies, metadata and arbitrary error
messages are not forwarded or logged. Error classification reads at most 16 KiB
with a two-second deadline. Transport or malformed-success failures retain 502.
These failures do not authorize fallback to another model or billing source.

Personal OpenRouter credentials remain owner-funded test access. They do not
qualify a commercial Supplier offer or authorize a prepaid customer charge.
