# Backend capability acceptance checklist

This checklist splits broad feature names into observable behavior. An API field,
page, model listing, successful build or fixture outcome does not establish an
integrated capability. Track implementation and current-input verification
separately. The broader [delivery audit](../releases/backend-delivery-audit-2026-10-09.md)
links existing evidence and the pinned New API reference.

## API-key controls

| Capability | Implementation status | Required acceptance behavior |
| --- | --- | --- |
| Workspace ownership and model allowlist | Implemented; scoped actual calls recorded | A key cannot use another workspace's private route or an ungranted model; dispatch rechecks current permissions |
| Expiration and revocation | Implemented; actual rejection recorded | Expired/revoked keys cannot dispatch; historical records remain available through authorized management |
| Rotation | Implemented; actual calls recorded | Old secret stops working, replacement retains intended grants, unrelated keys remain usable |
| Independent currency spending cap | Implemented; paid admission/settlement verification open | Key-level committed charges plus outstanding customer-price reservations cannot admit work beyond the cap; company/workspace limits also apply |
| Cap lifecycle and history | Implemented; actual configuration/concurrency verified | Exact integer amounts, explicit unlimited state, optimistic revisions, owner authorization, immutable actor history; lowering cannot invalidate liabilities |
| Cap during rotation | Implemented; actual shared-policy/history verified | Specify whether the replacement shares the original budget identity; rotating a secret must not silently reset or bypass its spending allowance |
| IP allowlist | Implemented; actual direct/proxy, rotation and saved-video access verified | Validate addresses/CIDRs; use a defined trusted-proxy policy; reject disallowed origins before upstream dispatch |
| Key request rate limit (RPM) | Implemented; actual two-instance admission and video rejection verified | Rolling 60-second dispatch count shared across rotations and gateways; reject before upstream calls |
| Key token rate limit (TPM) | Not implemented | Define token reservation, unknown usage and window semantics; never treat RPM as token enforcement |
| Key concurrent-request limit | Implemented; actual two-instance admission, completion, disconnect, rotation and restart verified | Enforce across supported sync/stream/async lifecycles; release reliably on cancellation, error and recovery |
| Key usage attribution | Implemented; partial actual evidence | Calls, provider usage and customer charges agree across key/detail/export views; unknown usage remains unknown |

Supplier-account concurrency limits, login throttles and the global video-download
semaphore are different controls. They do not satisfy per-key inference limits.
Workspace spending limits do not satisfy per-key spending limits.

## Financial hierarchy

Company balance/approved credit, workspace caps and key caps are distinct layers.
A paid request must satisfy all applicable layers using customer selling prices.
Personal upstream-key use stays separate from customer funds; its treatment must
be explicit in every cap API and report. Reservations, final charges, refunds and
releases must retain one historical key/budget attribution through rotation and
recovery. Settled liabilities are recorded accurately even when actual reported
usage exceeds the pre-dispatch bound; an overrun must not become hidden free work.

## Required workflow checks

For each control, cover authorized configuration, unauthorized writes, stale
revisions, normal dispatch, concurrent dispatch, streaming disconnect, uncertain
upstream completion, retry/idempotency, service restart and independent durable
record verification where applicable. Check text and video explicitly. State
unsupported cases instead of inheriting confidence from a different path.

This checklist is an implementation backlog, not a claim of New API parity.
External merchant activation remains a deployment concern; internal accounting
and authorization still need their own implementation and evidence.

See [key spending implementation and current-input evidence](../reference/api-key-spending-limits.md) for the exact supported boundary and remaining financial checks.

See [key IP policies](../reference/api-key-ip-policies.md) for source-address trust rules and verification boundaries.

See [key request rate limits](../reference/api-key-request-rate-limits.md) for dispatch-count semantics and remaining verification.

See [key concurrency limits](../reference/api-key-concurrency-limits.md) for unresolved-work occupancy and remaining verification.
