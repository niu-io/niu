# Workspace incident events — 2026-11-04

Tracking: `niu-ya50.1`. The parent remains open.

## Boundary and design

The existing workspace event stream and subscription dispatcher already have signing, delivery leases, retry bounds and a current-delegation check. Incident observations and recovery did not publish to that stream. This increment reuses it rather than adding a second delivery system.

An observation transaction records one durable bridge row per affected incident and exact organization/workspace. Each row gets a random workspace-local incident reference. A bounded publisher advances that row into the existing immutable workspace stream: `incident.opened` first, then `incident.resolved` after the existing current-configuration recovery resolver commits. Publication and bridge advancement share a transaction; competing publishers lock and skip the same row. A workspace first affected later gets its own opening. An old incident is not backfilled merely by upgrading. A delayed opening can arrive after recovery, so consumers must read current state rather than infer it from arrival time.

Events contain the workspace-local reference and lifecycle revision, not a connection, Provider identity, request content, credential, procurement price or another workspace identity. `GET /v1/incidents/{reference}` and `get_workspace_incident` require a current `events:read` grant and reconcile the model, owner-funded flag and current state within the key's scope. The new path is outside `/v1/events/{slug}` so existing subscription names and history paths remain available. A resolution is evidence for one later completed request under the then-current connection and mapping; it is not continuous or Provider-wide health.

The publisher runs without a signing cipher so pull-only event consumers can work. Publication and existing webhook delivery run independently within the background cycle: a publication error does not skip other event delivery. Existing public HTTPS destination validation, address pinning, redirects, signing, leases, retry and delegation code were not relaxed. No existing subscription is automatically enabled or backfilled.

## Current-input observations

A rebuilt gateway, separate disposable PostgreSQL database and controlled loopback model upstream were used. No outbound subscription was enabled. A real browser approved workspace-scoped `events:read` and `events:write` with model invocation disabled; a separate read-only key was approved in another workspace. Four subscription event types were saved in a disabled subscription. Actual subscription requests rejected loopback HTTP, loopback HTTPS, localhost HTTPS and a non-443 HTTPS port with 400.

Three real 503 responses created an incident and one opening event. Further failures in that workspace did not create another opening. A later failed request from a second workspace produced its own opening and a different random reference. That workspace's key received 404 for the first workspace's reference. Anonymous access returned 401, an inference-only key received 403, and an unknown valid reference returned 404. The actual MCP `get_workspace_incident` call returned the scoped state.

After a gateway restart, a real 200 response under the current configuration produced one recovery event for each affected workspace, ordered after its opening. Independent PostgreSQL readback found two bridge rows, two distinct references, two opening events and two recovery events. The personal requests retained five uncertain executions and one confirmed completion with no customer charge or platform cost records. A separate run held the stream table lock while a new real incident committed, stopped the gateway with its opening still pending, then restarted it: the pending opening appeared once and prior events did not duplicate. A two-gateway run also produced one opening for the new incident.

An independently authorized reader saw the disabled subscription's authorization change from active to inactive after its issuing key was revoked; the revoked key then received 401 and the reader retained access. No delivery was attempted. The subscription UI showed both new event labels; the changed list and detail were inspected at desktop and 390 CSS pixels, and the narrow list was adjusted to keep event text readable. These checks apply the workspace scope and current-authority rules, [WCAG 2.2 reflow](https://www.w3.org/TR/WCAG22/#reflow), and the project's shared-control rules; they are not a complete accessibility review.

A fresh isolated database with no currency configured returned `currency_required` for payment readiness. An authenticated workspace owner could read the empty incident summary (200); a separately approved management-only `events:read` key could read the empty event log (200) and received 404 for an absent incident reference, while anonymous access received 401. These actual requests verify the no-currency gate for the empty and missing-resource cases; they do not verify an existing incident detail in an unfunded workspace. The existing `/v1/events/incidents/history` route also reached the subscription-history handler rather than colliding with the new incident route.

## Evidence limits

No actual public webhook, signed wire acknowledgement, retry, lease-recovery delivery, recipient processing, or in-flight revocation was exercised. A disabled subscription and the authorization readback do not establish delivery behavior. URL checks above cover the listed syntactic destinations; they do not independently establish every DNS/address-pinning branch. The public-only sender was not modified to allow loopback. The production or hosted candidate, release artifacts, proactive detection without an eligible request, full fallback behavior and broader recovery races remain unverified.

## Controlled-transport coverage added — 2026-11-05

The gateway test module now contains an incident-specific scenario using the existing `cfg(test)` loopback transport. It specifies signed request verification, a failed response and retry, stable event and delivery identities, expired-lease recovery with stale-worker fencing, cross-workspace read denial and revocation between claim and send. Closing and reopening a separate database pool and reconstructing the storage/worker handle models restart at that boundary; it is not an operating-system process restart. The production sender still requires public HTTPS, resolves and pins public addresses, and does not use this test transport.

The isolated PostgreSQL fixture command was executed. Under the active repository instruction, its outcome is disregarded and is not evidence of behavior. The existing actual-run observations above remain the evidence for publication and process restart; no real public delivery, signed receiver acknowledgement, retry or delivery after a lease failure has been verified. Authorization is checked before sending. Once a request has been dispatched, later revocation cannot recall it.

## Incident notification state — 2026-11-06

Tracking: `niu-ya50.1`; the parent remains open. This increment adds a truthful, inspectable notification projection over the existing incident bridge, workspace event stream and delivery table. It does not add a second delivery system, a public receiver or a scheduler.

`GET /v1/incidents/{reference}` now includes `notification` for the current lifecycle event (`opened` while active, `resolved` after recovery): `state`, `event`, enabled incident subscribers, currently authorized subscribers, delivered/failed/cancelled/pending/sending counts and the last attempt time. `not_configured` means this exact workspace has no enabled subscription selecting that event; `authority_inactive` means a receiver exists but its authorizing delegation is no longer current; `queued` means publication or acknowledgement is still pending; `failed` is a terminal delivery outcome and `partial` means enabled receivers disagree. `GET /api/v1/workspaces/{workspace}/incidents` adds the same aggregate for currently active incidents, and the platform incident list adds per-incident workspace counts plus `coverage: {"request_observed": true, "proactive_probe": "not_configured"}`. The Admin incidents page shows the summary and an explicit statement that detection depends on observed requests; the workspace notice states when no external receiver is configured instead of implying a message was sent.

The projection is derived, not optimistic: a subscription with no published event, no delivery row or an expired lease is not reported as delivered. A 2xx receiver response remains acknowledgement only. Authorization expiry and revocation remove delivery authority without reclassifying the incident or releasing financial reservations. No migration, delivery credential, URL validation rule or retry bound changed. The platform response does not expose internal incident numbers.

Deterministic disposable-PostgreSQL coverage, run on 2026-11-06 with one fresh cluster per test:

```sh
for test in notification_state_moves_from_not_configured_to_queued_and_delivered \
  terminal_delivery_failure_is_never_reported_as_delivered \
  expired_lease_is_sending_and_can_be_recovered_after_expiry \
  subscription_expiry_removes_delivery_authority_without_reclassifying_evidence \
  foreign_workspace_cannot_read_notification_state_and_platform_sees_incomplete \
  resolved_incident_reports_resolution_notification_state \
  concurrent_claims_create_one_notification_attempt; do
  python3 scripts/test-postgres.py "$test" --package niu-storage --test incident_notifications
done
```

Each invocation reported `1 passed; 0 failed`. The scenarios assert not-configured/queued/delivered transitions, terminal failure never shown as delivered, `sending` plus lease-expiry recovery, expired-key authority loss, foreign-workspace non-disclosure and platform incomplete coverage, resolved-event selection and one winning claim under concurrency. The existing gateway scenario `incident_events_outbox_restarts_retries_fences_and_checks_authority` was rerun with assertions for `queued` before delivery and `delivered` after the signed fixture receiver acknowledged it; it passed. The platform authorization scenario now asserts the empty page includes truthful coverage. Dashboard incident tests (four) pass, including the absent-receiver notice and the incomplete platform summary; dashboard typecheck, lint, i18n, build and SDK/MCP typechecks pass; `pnpm check:api` and the generated documentation check pass; `cargo check -p niu-gateway` passes.

Evidence limits: the fixture receiver is the existing `cfg(test)` loopback transport, not a public-HTTPS receiver. No external webhook, DNS validation branch, signed public acknowledgement, retry against a real destination, recipient processing or in-flight revocation was exercised. No browser was run for this increment because no controlled running gateway/dashboard stack or credentials were available; the rendered ordinary-owner, platform and narrow layouts remain unverified. Proactive upstream probing is not implemented and is explicitly reported as `not_configured`; an idle connection is not monitored until a request fails. Generic 5xx/transport candidate fallback is also not implemented: those attempts remain `may_have_executed`, so retrying them would be uncertain resubmission. Existing fallback remains the qualified OpenRouter authentication-rejection chain. No paid call, financial mutation or external notification was made.
