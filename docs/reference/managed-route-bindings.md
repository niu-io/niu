# Managed route bindings at dispatch

Generic Chat, Responses and embedding requests now carry managed credential and
model revisions from database resolution into durable attempt admission.
Migration 0212 adds `managed_attempt_routes`: attempt, credential and model
identities plus their selected revisions. No plaintext or encrypted credentials
are copied into this table. The binding is immutable.

At the transition from `not_sent` to `may_have_executed`, a database trigger locks
the selected credential and model, then checks their enabled state, revisions,
adapter, model identity and personal ownership boundary. A mismatch rejects
admission with HTTP 409 and error type `route_configuration_changed`. The safe
message states that this request was not sent upstream, without exposing the
credential identity, endpoint or mapping. Other admission conflicts keep their
existing error types; clients must not interpret every 409 as this guarantee.
Existing personal-route and financial eligibility checks
remain in place. Changes after committed dispatch do not retroactively invalidate
the recorded attempt or authorize generation resubmission.

Personal and priced paths persist the binding before dispatch. The unpriced
batch path inserts it within admission's transaction using a deferred attempt
foreign key. A specific route-conflict database error establishes rollback;
the writer can then isolate individual records without replaying an ambiguous
commit. Route conflicts never trigger a new upstream call automatically.

Static configuration and historical attempts without a binding retain their
existing behavior. This migration does not fabricate historical route evidence.
Specialized Codex and video paths keep their existing binding mechanisms; this
change does not qualify every adapter's admission behavior or introduce a
multi-candidate route pool.

## Current-input verification — 2026-10-10

A private backup preceded the additive migration on the existing native
PostgreSQL database. Database contents and encryption identity were preserved.
The updated optimized gateway used a new temporary, owner-funded model mapping
on the existing personal upstream credential, leaving the original mapping alone.

An actual Chat request was paused before dispatch with the existing workspace
advisory lock. After PostgreSQL showed its stored route binding and prepared
attempt, the management API updated the temporary model to revision two. Releasing
the lock allowed admission to continue: the stale request returned HTTP 409.
Independent database inspection found model revision one, `not_sent` execution
and no dispatch timestamp for that request.

A fresh request through revision two returned HTTP 200 with nonempty generated
content. Its durable binding matched model revision two and the current
credential revision. Independent database inspection confirmed completed
execution and prompt/completion counts equal to the actual HTTP response.
The temporary key was revoked and temporary mapping disabled afterward.

Release compilation, formatting, Clippy and storage/gateway test-target
compilation completed. No fixture outcome is used. The actual run covers a
model-revision race on a personal Chat route. External key revocation/rotation,
commercial paid admission, unpriced mixed-record batch isolation, Responses and
embedding races, and sustained concurrent configuration changes remain
unverified. These boundaries must not be inferred from the shared code alone.

The same current-input race was subsequently run on the binary with the explicit
error contract. The stale request returned `route_configuration_changed`, the
message confirmed no upstream submission, and neither the credential identifier
nor temporary model alias appeared in the error. Independent database inspection
again found an undispatched old-version attempt and a completed fresh-version
request with matching usage. Batch-path error propagation is implemented but was
not exercised by this personal-route run.

## Credential configuration revision race

A separate actual run created an independent temporary credential configuration,
assigned it to the personal account and bound a temporary model mapping. It used
the existing private test secret without modifying the original configuration.
While a Chat request waited before dispatch, the management API saved that same
secret again in the temporary configuration. Its encrypted ciphertext changed
and its credential revision advanced from two to three; model revision stayed one.

The pending request returned HTTP 409 `route_configuration_changed`. Independent
PostgreSQL inspection confirmed its bound credential revision two and `not_sent`
execution without a dispatch timestamp. A subsequent real upstream request
completed using revision three, with recorded token counts equal to its response.
Final inspection found two bindings and exactly one dispatched attempt for the
temporary mapping. The temporary key was revoked; the configuration and mapping
were disabled. Before/after reads of the original currently mapped credential
confirmed the same revision and ciphertext digest.

This verifies a credential-configuration update racing with admission, including
new encryption of the same secret. It does not establish external key rotation,
revocation of an upstream key, switching between different upstream accounts or
commercial supply eligibility. Private secrets, ciphertext and identifiers remain
outside the repository. No fixture result is used.

## Shared route selection read — 2026-10-11

Shared text resolution now reads the stored model and encrypted credential,
immutable personal ownership, Supplier availability and media-offer kind in one
PostgreSQL statement. It no longer compares separate registry reads for these
conditions. Disabled or personal mappings remain present in the selection result
and are rejected before credential decryption; they cannot become an absent row
that permits static fallback. Dispatch-time revision and live eligibility checks
remain mandatory. This is not a published immutable routing generation; atomic
publication, generation attribution and failed-publication recovery remain open.

A fresh actual internal-credit run through two Gateways completed three model
requests while five competing requests were refused by the shared key RPM cap.
Disabling the selected mapping then returned 404 before and after restart.
Independent reopening matched saved response quantities to three exact customer
charge/debit pairs and the same three RPM admissions, confirmed the disabled
mapping at revision two, and found no outstanding customer reservations or
funding entries. This checks the exercised shared text and disabled-mapping
paths; it does not establish every offer kind or concurrent publication behavior.

## Priced model-revision race — 2026-10-11

A fresh isolated native run held the workspace admission lock until PostgreSQL
reported the actual incoming request blocked on that lock. The model mapping
was then updated through the management API before releasing admission. The
stale priced request returned 409 `route_configuration_changed`. Its entire
admission transaction rolled back: no attempt, customer hold or financial entry
remained. This differs from the retained not-sent record in the earlier personal
path; neither path dispatched the stale route upstream.

A new request completed against the updated mapping and survived restart.
Independent reopening matched its saved response hash, requested marker and
reported usage to the sole attempt, model revision two, exact customer charge
and matching debit. No outstanding customer hold, Supplier offer or commercial
qualification was created. Internal verification credit was used, not a merchant
funding receipt. This extends the shared-selection refactor's evidence to a paid
configuration race; it does not qualify atomic generation publication or all
protocol/configuration races.

## Credential disablement during a real stream

A current-input Chat request through a managed OpenRouter mapping began returning
text. Before changing configuration, a database read observed the attempt as
`may_have_executed` with unknown usage. An administrator then disabled that
credential. The original stream completed with its fresh requested marker,
terminal provider-reported usage and one exact customer charge/debit under its
pinned route revision. A subsequent request returned HTTP 404 despite a same-name
static TOML route. Restart preserved the refusal and did not add another attempt.

Independent inspection of the saved SSE artifact and reopened database matched
reported token counts to the completed original attempt, its earlier managed
credential revision, the exact debit and released customer/procurement holds.
The current credential remained disabled at its newer revision. This used personal
upstream access and approved internal credit, without merchant funding or a
commercial Supplier offer.

This verifies the existing disablement and dispatched-work boundary. It does not
implement a published immutable generation combining database and static routes,
failed-publication rollback or concurrent publication ordering. Those snapshot
requirements remain separate from per-attempt revision binding.
