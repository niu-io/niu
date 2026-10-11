# OpenRouter network routing and rejection diagnostics

A successful connection or model catalog check does not qualify inference.
Verify an actual request for the selected model, including streaming completion
and reported usage when relevant.

The gateway ignores environment HTTP(S) proxy settings and uses DNS-pinned,
public-address connections with redirects disabled. On a development machine
using Clash Verge, route `openrouter.ai` through the intended proxy group and
enable TUN if direct traffic exits through a region unavailable to the model.
Verify the actual matched rule and selected egress: an automatic group can choose
an unavailable region even while TUN is running. With DNS-pinned clients, the
TUN connection may have an IP destination without a domain mapping. TLS domain
sniffing can restore domain-rule matching without overriding the destination;
see the [Mihomo domain-sniffing configuration](https://wiki.metacubex.one/config/sniff/).
Confirm the real selected model completes after any network configuration change.
Ensure the hostname resolves to real public addresses; fake-IP DNS addresses
are rejected by the gateway. Do not weaken destination validation or enable
arbitrary environment proxies to work around a network routing problem.

OpenAI-compatible Chat returns an upstream non-success HTTP status with an
`upstream_error` envelope. A recognized regional model refusal receives a fixed,
actionable message. Upstream response bodies, metadata and arbitrary error
messages are not forwarded or logged. Error classification reads at most 16 KiB
with a two-second deadline. Transport or malformed-success failures retain 502.
These failures do not authorize fallback to another model or billing source.

## Historical failure attribution

The [actual Supplier/workspace checkpoint](../releases/supplier-workspace-backend-verification-2026-10-09.md#independent-records-and-network-diagnosis)
observed a regional refusal while TUN was enabled, then checked the matched rule,
TLS hostname and selected egress after correction. That evidence identifies the
observed regional refusal; it does not establish the cause of every earlier 502.

A 2026-10-12 read of existing personal-route diagnostics found retained
`upstream_invalid_response` observations without an upstream HTTP status. This
class does not establish an upstream 502, regional refusal, authentication failure
or specific request incompatibility. Available retained direct, proxied and
Gateway stream artifacts had data events and DONE; they are completed-stream
evidence, not the missing original failure response. Keep the original cause
unverified rather than infer it from those successful artifacts.

The [current structured-stream workload](published-route-stream-load.md#current-two-connection-checkpoint--2026-10-12)
independently checks actual response bytes, terminal usage, exact accounting and
restart. It demonstrates the exercised current request shape works. It neither
reproduces nor explains the historical failure. For a new failure, retain the
safe failure kind and any actually observed upstream HTTP status separately from
Gateway status and execution/settlement state; never invent upstream status or
usage from a Gateway error. Do not store a credential-bearing response body to
fill a diagnostic gap.

Personal OpenRouter credentials remain owner-funded test access. They do not
qualify a commercial Supplier offer or authorize a prepaid customer charge.
