# Niu capability entry for coding agents

Niu supplies model information, request evidence and authorized management capabilities. You own the user's task, model choices and quality/cost tradeoffs. Ask for task acceptance criteria and a bounded test budget before paid evaluation. Do not promise an optimal model or guaranteed savings.

## Start

Start with the [installation contract](https://niu.io/docs/install.md): check deployment/package availability, install the supported host integration, complete browser authorization and verify access. Then read [MCP](https://niu.io/docs/guides/mcp/) for exact tools and resources. [Build with Niu](https://niu.io/docs/guides/personal-assistant/) supplies the optional human walkthrough and runnable example. Configure credentials securely; never ask the user to paste secrets into conversation or commit them.

The shared integration is a local stdio MCP server authenticated with a workspace API key. The 0.3.0 development candidate targets Claude Code, Codex and DeepSeek Harness native packages and browser approval; consult [installation availability](https://niu.io/docs/install.md) before installing. The candidate also provides scoped resource-event operations; consult their current qualification limits before configuring a receiver. Installing MCP does not prove a working connection; inspect the key and discover authorized models before inference.

## Discover by task

| Need | Authoritative reference | Current access boundary |
| --- | --- | --- |
| Inspect grants and available models | [MCP](https://niu.io/docs/guides/mcp/) | Workspace-key scope; public catalog does not establish access |
| Record task judgments and compare matched samples | [Evaluation workflow](https://niu.io/docs/evaluations.md) | 0.3.0 candidate; explicit evaluations:read/write grants, separately approved paid budget; unknown charges remain unknown |
| Configure, preview or inspect a workspace model pool | [Agent pool workflow](https://niu.io/docs/pools.md) | 0.3.0 candidate tools require explicit pools:read/write grants; platform supply management remains separate |
| Manage permissions and limits | [Security](https://niu.io/docs/security/overview/) | Respect current role/credential grants; key inspection is not budget-write permission |
| Observe changes and configure signed notifications | [Resource event workflow](https://niu.io/docs/events.md) | 0.3.0 candidate; explicit events:read/write grants and authorized public receiver for push; no inactive-host wake guarantee |
| Diagnose a request | [Request evidence](https://niu.io/docs/concepts/execution-observation/) | Use available request references; retrieve evidence directly |
| Understand charges and performance | [Performance and cost](https://niu.io/docs/concepts/performance-and-cost/) | Customer charges only; missing usage or price is not zero |
| Use REST operations | [OpenAPI](https://niu.io/docs/openapi/public.json) | Operation presence does not grant authority or imply MCP availability |
| Use TypeScript clients | [SDK reference](https://niu.io/docs/api/sdk/) | Follow exact client types and operation authorization |
| Run supported media tasks | [Video](https://niu.io/docs/reference/video/) | Check model, billing, result-access and unsupported callback limits |
| Inspect release qualification | [Release matrix](https://niu.io/docs/releases/first-release/) | Configuration and source declarations do not prove live conformance |

## Operate and recover

Read the relevant operation contract before a mutation or paid call. Preserve configured models and other host connections. Distinguish proposal, preview, persisted configuration and successful live execution. Read back changed state and handle revision conflicts. Never blindly retry a request that may already have incurred a charge.

When authority or configuration is missing, identify the specific prerequisite and relevant Niu review page. Let the person approve or configure it there, then retrieve the resulting state yourself. Do not make the person carry raw JSON, model lists or diagnostics back to you. The account-connection contract supplies a bounded browser-approval/exchange channel. Other resource, budget and external receiver decisions do not inherit that channel or establish a general-purpose approval/resume API.

Keep Niu platform events, coding-agent host hooks and server-side plugin observers distinct. Do not advertise or configure an undocumented event subscription. Do not reroute the coding agent's own inference or collect external agent telemetry as a side effect of connecting to management.
