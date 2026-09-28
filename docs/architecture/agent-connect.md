# Niu Agent Connect

Status: local prototype, verified on test fixtures and a local development
gateway. The connectors are unpublished and are not release-qualified. This
document records what has been exercised and where evidence is still missing.

Niu Agent Connect is the user-facing integration surface for coding agents. It
uses a shared installer and connector contract, with a small, independently
versioned connector for each supported agent and version. A connector can
support one or both modes below. Niu must not imply that every agent supports
both.

## Modes

### Route through Niu

The connector configures the agent's documented custom endpoint/provider
settings. Model requests pass through Niu and produce gateway-owned request and
attempt records automatically.

- Authenticate to Niu with an API credential scoped to the selected workspace
  and project. If the agent's normal auth header must remain the provider's
  subscription credential, use `X-Niu-API-Key` as the separate gateway
  credential header. The gateway consumes and removes this header before
  forwarding the request. Standard Niu clients may continue to use
  `Authorization: Bearer`.
- Keep the provider's subscription login and payer only for agent/provider
  combinations where the vendor documents this route and eligibility is
  established. Technical reachability alone is not qualification.
- Preserve the client protocol, required headers, streaming, retry signals, and
  model capabilities. The connector declares any unsupported behavior before
  the user enables routing.
- Never extract, copy, or store the provider's OAuth/session credential. Never
  send the workspace key to the provider.
- Do not silently change a failed route into API-key billing or log-only mode.

### Collect agent activity

The connector does not change the provider, authentication, or network route.
It receives activity from a documented vendor export/API, OpenTelemetry
destination, agent hook, or a local file the user explicitly selects. Delivery
is asynchronous and must not hold up the agent run.

- External events retain source, agent/version, event time, workspace/project,
  available session/request/task IDs, usage/cost authority, consent, and known
  coverage gaps.
- Use idempotency keys and source event IDs to deduplicate; preserve source
  corrections and delivery gaps rather than presenting an incomplete stream as
  complete.
- Agent-reported usage, vendor estimates, subscription quota, allocated fixed
  fees, settled cash, and Niu gateway charges remain separate accounting
  facts. Unknown values stay unknown.
- Do not join an external event to a Niu request by timing or model name alone.
  Merge only through a stable verified correlation key; otherwise show the
  records as separate evidence.
- Prompt/response content, repository data, tool arguments/results, and
  credentials are excluded by default. Each content category requires separate
  opt-in and a retention/deletion policy. Local transcript access is explicit,
  scoped, and revocable.

## Connector contract

Every connector publishes a versioned manifest containing:

- agent identifier and tested client versions;
- supported mode or modes and vendor documentation for each;
- configuration changes and required permissions;
- source event types and fields, including content sensitivity;
- usage/cost authority and how incomplete, duplicated, delayed, or corrected
  events behave;
- known blind spots, eligibility status, protocol limitations, and the date of
  the latest end-to-end verification;
- verification, pause, uninstall, and configuration-restore behavior.

The common `niu-agent` package owns manifest discovery, workspace/project
selection, key setup, safe config diffs, local delivery/retry for collection
mode, and event-envelope validation. Agent-specific modules own only the
smallest integration needed for that agent. They must not vendor an upstream
agent repository or assume undocumented APIs.

## Tenant and credential boundary

The workspace and project selected in the console determine the scope. A
connector must never accept tenant IDs from an event payload as authority.
Routing uses the selected project's inference key. Collection uses a
separately scoped event-ingest credential with only the required write
permission. The console can revoke either credential and show the linked agent
connection. No installation-admin credential is written to an agent's config.

Keys are not printed in logs, committed settings, command history, issue
trackers, or telemetry. Persistent local secrets use the operating system's
credential store when available; config files contain a reference or
environment-variable name. Before applying edits, the installer shows an exact
diff and identifies files it will change. Uninstall restores only settings the
connector itself changed and preserves later user edits.

## Setup experience

From the selected workspace, the user chooses an agent and sees only modes
verified for the detected version. Each mode explains:

1. what changes in the agent;
2. which credential pays for inference;
3. which request, usage, and task fields Niu will receive;
4. whether prompt or tool content is collected;
5. missing coverage and cost limitations.

The setup flow previews changes, applies them only after the user chooses a
mode, sends or observes a non-sensitive verification event, and reports the
source and workspace in which it appears. Users can pause, change modes
explicitly, rotate keys, and uninstall the connector.

## Evidence and release gates

The gateway remains the default source for requests made through Niu. The
platform flow is provider/model setup, project-scoped key, client request
through Niu, and automatically visible gateway activity. Neither connector
mode replaces that flow.

The current prototype has two locally exercised paths:

- Aider 0.86.2 routed an OpenAI-compatible request through Niu to a local mock
  provider. This validates the request path only; it does not verify a paid
  external provider or subscription eligibility.
- Claude Code 2.1.211 exported opt-in OpenTelemetry events to Niu while its
  existing login remained in place. The console groups those partial event
  records by task and displays agent-reported token and cost estimates. Prompt
  content is not collected. These events do not verify a task outcome.

The task adapter remains incomplete. It still needs reliable task/attempt
linkage, tool-call and retry coverage, validation evidence, and human or
deterministic acceptance outcomes. Until those exist, collection records are
partial telemetry and cannot qualify matched-task benchmark economics.
Gateway records remain authoritative for Niu-routed usage and charges;
external usage or cost stays attributed to its source, and unmeasured costs
remain unknown.

Before releasing Agent Connect, verify at least one documented route-mode
integration and one documented collection-mode integration end to end. Record
the exact agent version, selected mode, tenant scope, provider billing/auth
state, events
observed, data omitted, and known gaps. Compare model economics only for matched
tasks with the same snapshot, tools, permissions, and validator or human
acceptance evidence. Include fixed subscription allocation, quota limits,
paid overflow, tool/evaluator work, failures, and latency; unknown costs stay
unknown. Do not convert an API-equivalent price into a subscription saving
claim.
