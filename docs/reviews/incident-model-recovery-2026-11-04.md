# Obsolete model success can falsely resolve a connection incident

Independent review, 2026-11-04. Tracking: `niu-ya50.1.1`. Reviewed product source: handoff commit `3d86c303e59542ae56e2a28d410400e0cdbc2a95`. The subsequent rotation-review documentation commit did not change this product implementation. This is operational-state evidence, not a new billing or execution-classification claim.

## User outcome

An operator needs an active failure to remain visible until successful evidence verifies the configuration users will actually call. A model's display alias can remain unchanged while its upstream target changes. A successful request to the former target does not verify the replacement target.

The current recovery function checks the connection revision but not the effective model-mapping revision. It can therefore move an incident into resolved history even though no request has verified the current mapping. This weakens the platform's management value by removing an alert without sufficient recovery evidence.

## Reproduction and diagnosis

`niu_resolve_connection_incidents` in migration0413 joins `vendors` on the observed connection revision and requires successful timing, confirmed execution and dispatch after the incident's latest observation. It reads `managed_attempt_routes.model_alias` but does not compare `model_revision` with the current `vendor_models` row. Observations similarly retain the connection revision without establishing the effective model mapping for recovery.

The existing `account_restriction_is_durable_without_claiming_nonexecution` storage test was extended in an isolated checkout:

1. Record an account-restriction incident through the real storage method.
2. Prepare and mark a later recovery candidate dispatched, bound to the existing connection/model revisions.
3. Change the same alias to a replacement upstream model using `Store::upsert_vendor_model` and its expected revision. Assert the model revision increased.
4. Complete the earlier request with successful timing and confirmed execution.
5. Assert the incident still has no recovery attempt, because the successful request used the obsolete mapping.

The disposable-PostgreSQL execution failed step5: the incident had acquired a recovery attempt. Migration and ordinary storage methods were used; upstream transport was simulated without contacting a Provider or spending money. The tested sequence preserves the existing protection against a request dispatched before the incident itself, so it isolates the missing model-revision boundary.

Reproduction command:

```sh
python3 scripts/test-postgres.py \
  account_restriction_is_durable_without_claiming_nonexecution \
  --package niu-storage --test provider_incident_evidence
```

The added mapping change belongs immediately before the recovery request's timing is recorded. The terminal result should remain unresolved until an eligible request under the current mapping completes. The unmodified existing test covers only an unchanged model mapping and cannot prove this branch.

## Countermeasure and verification

Bind positive recovery to the current effective connection and model configuration, not just a stable alias. Preserve historical observations and require new successful evidence when the mapping changed. A configuration edit, a successful obsolete request or manual disable must not become evidence that the currently callable configuration is healthy.

Verify unchanged-configuration recovery still works, old-mapping success cannot resolve, and a subsequent success under the new mapping can resolve. Exercise both timing/execution evidence orders, changed connection revisions, a repeated failure racing recovery and model disable/remap behavior. Preserve failure deduplication and conservative incident scope. The change must not release financial reservations, certify sellable inventory, infer nonexecution or expose private request content.

This controlled failure does not establish the behavior of an uninspected deployed revision. Implementation and browser/API recovery acceptance remain receiving-developer work; the parent incident feature also retains its broader unfinished notification and ownership requirements.

## Verification follow-up — 2026-11-06

The recovery boundary is now covered by deterministic disposable-PostgreSQL tests: stale in-flight success after connection-revision, target-remap and disable changes, both evidence arrival orders, an uncommitted concurrent mapping change, newer failure evidence and a newer incident. The current code binds recovery to the enabled connection and model revisions, requires complete successful timing and confirmed execution after the latest observation, and serializes resolution against mapping writes. See `docs/reviews/upstream-incident-journey-2026-11-04.md` for the command, assertions and remaining limits. This remains source/fixture evidence; no hosted or real-Provider acceptance is claimed.
