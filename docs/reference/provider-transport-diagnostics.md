# Provider transport diagnostics

Status: typed timeout configuration and persisted transport-stage diagnostics are implemented. Current-input [configuration](provider-timeout-configuration-acceptance.md) and [persisted failure](request-transport-phase-acceptance.md) acceptance records define the verified scopes; earlier connection-timeout evidence is recorded in [tier and fee acceptance](current-tier-fee-acceptance.md).

A customer HTTP 502 is not necessarily an upstream HTTP 502. Request failure records retain the existing `kind` and `upstream_http_status`, with optional `transport_phase`: `connection` for observed connection setup failure, or `request` for a timeout after connection setup. Connection does not distinguish DNS, TCP and TLS. Historical observations remain unknown; no phase is inferred from their duration. HTTP refusals, invalid responses and delivery cancellation do not receive invented transport phases.

Logs detail/list, CSV and the JavaScript SDK expose the same safe phase. No endpoint, credential, upstream body or underlying exception text is added. The first recorded failure remains immutable; identical observations are idempotent and conflicting phase information cannot overwrite it. A phase does not prove nonexecution or authorize refund, hold release or retry.

## Deployment budgets

Optional TOML settings retain three-second defaults:

```toml
[server]
request_timeout_seconds = 60
provider_connect_timeout_seconds = 3
provider_dns_timeout_seconds = 3
```

Each value must be between 1 and 3600 seconds. The connection and DNS values are clamped to the actual caller's HTTP budget. They apply to direct Chat/Responses/Embeddings/Messages/GenerateContent transport and Supplier connection/model-list checks. Media adapters retain their separately implemented budgets; these settings are not a universal network override.

DNS resolution precedes the HTTP request timeout, so these settings do not establish one total factory-plus-request deadline. Clients are cached by endpoint and all three budgets. Changing a budget cannot reuse a client configured with different limits. Validated typed values prevent zero or component budgets exceeding their HTTP budget.

Existing private/reserved destination checks, including the explicit loopback exception for local Providers, pinned resolved addresses, disabled environment proxies and disabled redirects remain enforced. No automatic generation retry is introduced. For transparent VPN/proxy use, resolve the Provider hostname to real public addresses; fake-IP DNS remains rejected. Configure deployment budgets explicitly when investigating reachability and inspect current measured failure stages.
