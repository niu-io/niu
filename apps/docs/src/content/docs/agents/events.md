---
title: "Workspace Resource Events"
---


Use workspace resource events to observe configuration updates, evaluation receipts, and workspace model incidents directly via an authenticated pull stream (`events:read`), or optionally subscribe a signed HTTPS receiver (`events:write`).

Event notifications convey workspace resource evidence only. They never grant spending authority, model invocation access, or management write scope, and do not guarantee that a sleeping or offline host wakes.

---

## Operations & Interface Parity

| Capability | HTTP Endpoint (`{ORIGIN}/v1/...`) | MCP Tool (`@niu-io/mcp`) | JS SDK (`NiuClient`) | Required Scope |
| --- | --- | --- | --- | --- |
| Read immutable pull event stream | `GET /v1/events/log?after=0` | `list_workspace_events` | `listWorkspaceEvents(after?)` | `events:read` |
| Reconcile workspace incident reference | `GET /v1/incidents/{reference}` | `get_workspace_incident` | `getWorkspaceIncidentEvent(ref)` | `events:read` |
| List event subscriptions (max 32) | `GET /v1/events` | `list_event_subscriptions` | `listEventSubscriptions()` | `events:read` |
| Read subscription & cursor | `GET /v1/events/{slug}` | `get_event_subscription` | `getEventSubscription(slug)` | `events:read` |
| Create/update push subscription | `PUT /v1/events/{slug}` (`{ configuration, rotate_secret? }`) | `set_event_subscription` | `setEventSubscription(config, rotateSecret?)` | `events:write` |
| Read immutable config history | `GET /v1/events/{slug}/history` (`?before=<rev>`) | `get_event_subscription_history` | `getEventSubscriptionHistory(slug, before?)` | `events:read` |
| Inspect latest 100 deliveries | `GET /v1/events/{slug}/deliveries` | `get_event_deliveries` | `getEventDeliveries(slug)` | `events:read` |
| Queue targeted test delivery | `POST /v1/events/{slug}/test` (`{ revision }`) | `test_event_subscription` | `testEventSubscription(slug, revision)` | `events:write` |

All responses are `Cache-Control: no-store`. Platform audit logs remain administration-only; workspace events never expose prompts, completions, API keys, Provider identities, or procurement costs.

---

## Supported Event Types

| Event type | Emitted when | Payload reference |
| --- | --- | --- |
| `pool.changed` | Committed atomically with a workspace routing policy revision (`pool/<slug>`) | `resource.kind: "pool"`, `slug`, `revision` |
| `evaluation.recorded` | Committed atomically with a new immutable evaluation run receipt (replays emit nothing) | `resource.kind: "evaluation"`, `slug`, `revision`, `run` |
| `incident.opened` | Asynchronous workspace bridge observes an incident impacting this workspace | `resource.kind: "incident"`, `slug: "incident-<32hex>"`, `revision: 1` |
| `incident.resolved` | Asynchronous workspace bridge records recovery for a previously observed workspace incident | `resource.kind: "incident"`, `slug: "incident-<32hex>"`, `revision: 2` |

`subscription.test` events are queued only for the targeted subscription via `POST /v1/events/{slug}/test`, regardless of its `event_types` filter.

---

## Pull Stream First (`events:read`, No Webhook Required)

When a coding agent is already running, read workspace events directly instead of asking a human to copy dashboard notices:

1. Confirm `events:read` is in `inspect_key.management_capabilities`.
2. Call `GET /v1/events/log?after=0` (`list_workspace_events` with `after: "0"`).
3. Persist and advance `next_after` strictly as a **decimal string** (int64 cursors exceed IEEE-754 safe integer precision; never convert to float).
4. Continue paginating while `has_more` is `true`. Querying a cursor beyond the head returns a conflict (`409`). Events are immutable and no pruning window is enabled.
5. For `incident.opened` or `incident.resolved`, call `GET /v1/incidents/{reference}` (`get_workspace_incident`, matching `^incident-[0-9a-f]{32}$`) to check `model`, `owner_funded`, current `status` (`"active" | "resolved"`), `recovered_at`, and delivery status. A delayed `incident.opened` can arrive after recovery, so always read current state. Resolved status shows a subsequent successful call under that configuration — not permanent upstream health.

---

## Signed Push Subscriptions (`events:write`)

Configure push notifications only when the user explicitly authorizes an HTTPS receiver (`events:write`). At most `32` subscriptions (including disabled ones) exist per workspace.

### Configuration schema

```json
{
  "configuration": {
    "slug": "ops-webhook",
    "name": "Workspace Operations Receiver",
    "endpoint": "https://events.example.com/niu/webhook",
    "event_types": ["pool.changed", "evaluation.recorded", "incident.opened", "incident.resolved"],
    "enabled": true,
    "revision": 0
  },
  "rotate_secret": false
}
```

- `slug`: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 80 chars (`index|history|preview|audit|new|log|deliveries|test` reserved).
- `name`: `1..200` chars.
- `endpoint`: public HTTPS URI, port `443` only, max 2048 chars, with **no** username/password, query string, or fragment. Delivery validates and pins resolved public IPs (rejecting private/loopback ranges) and disables proxies, redirects, and implicit HTTP retries.
- `event_types`: `1..4` unique items from `["pool.changed", "evaluation.recorded", "incident.opened", "incident.resolved"]`.
- `revision`: `0` creates; updates require the current saved integer revision.
- Destination URL changes require `rotate_secret: true` (a new secret is issued for the new receiver).

### One-time signing secret handling (`niu_whsec_...`)

- Creation (`revision: 0`) and explicit `rotate_secret: true` issue a single-view HMAC secret matching `^niu_whsec_[A-Za-z0-9_-]{43}$`.
- **REST / JS SDK**: returns `signing_secret` once in the response body. Store it in the receiver's private secret manager; reads never expose it again.
- **MCP (`set_event_subscription`)**: prepares private local file storage **before** sending the mutation, writes the secret cleanly on POSIX hosts, and returns **only `signing_secret_file`**. On hosts lacking secure private file/ACL storage, MCP aborts pre-mutation rather than leaking the secret into model context. Never print, commit, or paste `signing_secret_file` into chat.
- If a response or local save is uncertain, call `get_event_subscription` to inspect the saved `revision`, repair local storage if needed, and explicitly rotate (`rotate_secret: true`) instead of blindly replaying `revision: 0`.

### Receiver signature verification & deduplication

1. Read the **exact raw request body bytes** before JSON parsing.
2. Parse header `x-niu-signature` of format `t=<epoch_seconds>,v1=<lowercase_hex_hmac_sha256>`.
3. Compute HMAC-SHA256 using UTF-8 `signing_secret` over UTF-8 `<epoch_seconds> + "."` concatenated with the raw body bytes.
4. Use constant-time digest comparison and enforce a tight timestamp skew window (e.g. 5 minutes).
5. Deduplicate durably on `x-niu-event-id` (and JSON `id`): retries preserve event/delivery IDs while generating a fresh `t=` timestamp and signature. `x-niu-delivery-id` identifies the per-subscription delivery record.

### Delivery lifecycle, delegation & disabling

- Automatic delivery runs up to `8` attempts with bounded exponential backoff and a `30s` sending lease. `sending` with an expired lease is not live wire evidence.
- Inspect results via `POST /v1/events/{slug}/test` (`{ "revision": <current> }`) followed by `GET /v1/events/{slug}/deliveries` (latest 100 attempts). A `2xx` HTTP status confirms receiver socket receipt only — never receiver processing or task completion. Missing status remains unknown; exhausted leases terminate as failed without blocking subsequent events. Reconcile missed sequences via `list_workspace_events`.
- Subscriptions bind to their original authorizing key (`authorization_active` in `get_event_subscription`): key expiry, revocation, or loss of operator workspace authority halts further push attempts until updated under a valid current grant.
- To pause or stop delivery, update with `"enabled": false` and the current `revision`, then verify via `get_event_subscription`. In-flight HTTP requests cannot be recalled; history remains immutable.

Platform resource events are distinct from coding-agent **host hooks** and **server-side Niu plugins** (see `/docs/agents.md`). Creating an event subscription does not install host hooks.

Related contracts: [Install](/docs/install.md) · [Capabilities](/docs/agents.md) · [Model inference](/docs/inference.md) · [Workspace routing](/docs/routing.md) · [Evaluations](/docs/evaluations.md) · [OpenAPI](/docs/openapi/public.json)
