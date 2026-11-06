---
title: "Workspace resource events for agents"
---


Availability: 0.3.0 development candidate; publication remains held. Discover the connected tools and deployment contracts before using these operations. Event notifications convey resource evidence, not authority to spend money, run evaluations or change model policy.

## Observe without a public receiver

Use `inspect_key` to discover grants. `events:read` permits `list_workspace_events`, subscription inspection, configuration history and delivery diagnostics. Read the event stream with `after: "0"` initially, then retain `next_after` as a decimal string. Follow `has_more`; do not convert cursors to floating-point numbers. A future cursor returns a conflict. Events are immutable and no pruning window is currently enabled.

Read events directly while working; do not ask a person to relay dashboard notifications. This pull path needs no public webhook or signing credential. It does not wake an inactive coding agent. Use each event's resource slug/revision to retrieve current state and compare it with a retained baseline before proposing an authorized change.

## Configure a signed push destination

Only configure a receiver authorized to receive this workspace's resource events. Subscription mutation and test delivery require `events:write`, in addition to the resource's current delegation. Supported events include `pool.changed`, committed atomically with a workspace pool revision; `evaluation.recorded`, committed atomically with a new immutable evaluation run; and `incident.opened` / `incident.resolved` for an incident observed in this workspace. Incident evidence is recorded with the request failure; a durable bridge publishes each workspace event asynchronously and in order. A workspace first affected later receives its own open event. Existing historical incidents are not silently backfilled. An identical run replay emits no new event. Evaluation events add `resource.run` to the evaluation slug and definition revision; fetch the receipt under `evaluations:read`. Notifications contain resource identity/revision and time, without prompts, model outputs, API credentials or Provider economics.

1. Use `list_event_subscriptions` and `get_event_subscription` to inspect saved configuration and revision. At most 32 subscriptions are retained per workspace, including disabled ones. Enabled configuration is not verified delivery.
2. Prepare `configuration` with a readable `slug`, meaningful `name`, public HTTPS `endpoint`, one or more unique `event_types` (`pool.changed`, `evaluation.recorded`, `incident.opened`, `incident.resolved`), `enabled` and expected `revision`. Zero creates; updates require the current revision. URLs cannot contain credentials, query or fragment; only port 443 is allowed. Delivery validates and pins public addresses, disables proxies, redirects and implicit HTTP retries.
3. Call `set_event_subscription`. Creation and explicit `rotate_secret: true` return a signing credential once at the REST/SDK boundary. MCP prepares private local storage before mutation, saves the secret there and returns only `signing_secret_file`. Configure your receiver from that file using an authorized local/backend process. Do not print the file, paste it into conversation, place it in browser code or commit it.
4. Read back configuration and verify the saved revision. If the mutation response or private save is uncertain, inspect the current revision. A secret cannot be recovered through reads. Repair the local prerequisite and explicitly rotate rather than blindly replaying the original mutation. A destination change requires rotation and configuration of the new receiver with the new secret.
5. Call `test_event_subscription` with the current revision. It appends a distinct `subscription.test` event targeted only to this subscription and returns `delivery: "queued"`. Repeating the call creates another test; the receipt is not acknowledgement.
6. Use `get_event_deliveries` to inspect the result. A 2xx response confirms receiver acknowledgement; it does not prove processing, host wake or task acceptance. No model call is needed for this verification.

The subscription binds to its original authorizing key. Expiry, revocation or loss of the approving operator's authority prevents new attempts. `authorization_active` reports that boundary. Renew authority explicitly and update the saved configuration under the current grant when needed; do not repeatedly test an inactive delegation. A request already transmitted cannot be recalled.

The bundled private signing-file adapter enforces POSIX ownership/modes. Windows requires an ACL-capable host adapter; secret-issuing MCP operations fail before mutation there. This limitation does not authorize returning the secret in conversation.

## Verify and deduplicate at the receiver

Read the exact request body bytes before parsing or transforming JSON. `x-niu-signature` has the form `t=<epoch seconds>,v1=<lowercase hex digest>`. Compute HMAC-SHA256 with the UTF-8 issued signing secret over `timestamp + "." + body bytes`. Compare safely, require a bounded timestamp skew appropriate to your deployment and reject invalid signatures. Do not log credentials or signature-bearing request headers.

Use the stable event `id` for durable deduplication. The timestamp/signature can change on a retry. `x-niu-event-id` identifies the event; `x-niu-delivery-id` identifies its delivery record. A lease recovery retains event/delivery identity but replaces the internal lease token. Configure the receiver to accept the current secret before treating the subscription as verified.

## Failures, reconciliation and revocation

Automatic delivery permits at most eight attempts, with bounded exponential delays and a 30-second lease. Transient failures are retried; invalid destinations or signing prerequisites stop delivery. `sending` is persisted attempt state, not proof of a currently active request: inspect lease expiry. Missing HTTP status is unknown. An abandoned final lease becomes an exhausted failure without inventing acknowledgement.

Use delivery `sequence` to retrieve the corresponding event through `list_workspace_events`, then retrieve current resource state. Failed/exhausted delivery allows later events to proceed; the resource history and event log remain available for reconciliation. No arbitrary response body or upstream error text is retained. The delivery endpoint currently returns the latest 100 records, not a complete paginated archive.

Set `enabled: false` using the current expected revision to stop future delivery. Read back the disabled state. History remains immutable. Destination/secret/enable transitions begin after the current event-stream head; they do not replay prior history. Metadata-only updates preserve the processed cursor. Configuration updates cancel old-revision pending work, but cancellation cannot establish whether an already in-flight request reached the old receiver.

Niu platform events, coding-agent host hooks and server-side observer plugins are different mechanisms. These operations do not install a host hook or guarantee background agent execution. Budget and model-price events are not established by these event types; discover their actual contracts before subscribing.

## Verification boundary

The checkpoint includes PostgreSQL state/lease/rotation tests, local signed-wire tests and an HTTP management-to-receiver fixture covering independent signature verification, a 503 retry with stable identity, acknowledgement, reconciliation, scope denial, rotation and disabling. Local transport injection is test-only; production rejects private destinations. No external receiver, paid inference or inactive-host wake has been qualified. Final packaged host and human review workflows remain separate acceptance work.

Subscription filters apply to resource events. Targeted `subscription.test` delivery remains available regardless of the selected resource types. Changing filters does not backfill events before the current cursor. A notification is not permission to fetch its referenced evaluation results; that read requires the current `evaluations:read` grant.

## Incident event reconciliation

`incident.opened` and `incident.resolved` identify one incident through a random workspace-local `resource.slug`; `resource.kind` is `incident` and its revision is `1` or `2` for that lifecycle, not a connection or model configuration revision. Use `get_workspace_incident` with that reference under `events:read` to read the model, whether the connection is owner-funded, current incident status and recovery time. A delayed open can arrive after recovery; always read current state. Foreign or unknown references are unavailable. The event contains no Provider identity, endpoint, request content, credential or procurement amount. A resolved incident proves only the recorded successful request under the then-current connection and model mapping; it does not certify continuous or provider-wide health.

`get_workspace_incident` also returns `notification` for the current lifecycle event (`opened` while active, `resolved` after recovery). `state` is `not_configured` when this exact workspace has no enabled incident receiver, `authority_inactive` when a receiver exists but its authorizing delegation is no longer current, `queued` before publication or acknowledgement, `sending` during a leased attempt, `delivered` after a receiver's 2xx acknowledgement, `failed` after a bounded terminal failure, or `partial` when enabled receivers disagree. Counts describe enabled receivers and current-revision deliveries; a 2xx acknowledgement is not processing. `not_configured` means Niu retained the incident and event evidence but sent no external message, so never report it as delivered. Platform incident reads additionally summarize affected workspaces as `delivered`, `incomplete`, `failed`, `sending`, `queued` or `no_recipients`; inspect counts before assuming every affected owner was notified.
