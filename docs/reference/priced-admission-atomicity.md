# Priced admission transaction boundary

Status: implemented, with limited current-input verification on 2026-10-10.
Successful commercial billing and recovery concurrency remain unverified.

The gateway publishes a missing price revision through its existing cache, then
calls one storage admission operation. That operation creates the operation and
attempt, binds the selected managed route, token bound, inspected guardrails,
dispatch provider, customer tariff and Supplier offer, and reserves funds and
records dispatch intent in one PostgreSQL transaction. The existing individual
storage APIs reuse the same transaction-capable helpers. Customer charges,
Supplier earnings and upstream cost remain separate ledgers.

A durable Guardrails rejection still commits its audit and releases an unsent
customer reservation in that transaction. Other admission errors roll back the
new attempt and its bindings together. The gateway does not issue a separate
release after a failed commit acknowledgement: the transaction might already
have committed dispatch intent. No retry or fallback submission was added.
Personal routes remain on their separate owner-funded path and reject commercial
pricing. Historical partial attempts are not rewritten by this change.

## Actual API and database observations

A new company with a zero USD balance, a workspace, key, customer tariff and a
priced mapping was configured through the current management API. The mapping
used an unconfigured credential, not the saved personal credential. No funds,
credit or commercial qualification were fabricated, and no inference was sent.

Before the change, an actual completion request returned 402 but left one
operation and one `not_sent` attempt. After rebuilding and restarting, the same
workflow returned 402 with zero operations, attempts, balance entries or
reservations for that new scope.

For a second request against the new runtime, an independent PostgreSQL
transaction held a workspace row lock. The request reached the tariff binding
inside its admission transaction and waited. The exact blocked database backend
was terminated before releasing the lock. The HTTP request returned 503;
independent database reads found zero partial operations or attempts. The lock
was released and temporary keys revoked and mappings disabled. This demonstrates
rollback on a pre-commit database connection loss, not lost commit acknowledgement.

A real owner-funded OpenRouter Chat stream also completed after the refactor.
Reported token totals and categories matched saved evidence, the original
credential identity remained unchanged, and no customer balance entry was added.

A subsequent actual policy race exercised the denial commit separately. A new
zero-balance company used explicitly zero customer and route rates and a zero
procurement budget, with an unconfigured credential. After the request read its
initial policy, a workspace row lock paused it at tariff binding. The management
API activated a deny-all model policy before the lock was released. The request
returned 409. Independent PostgreSQL reads found one durable `not_sent` attempt,
null dispatch time and an `access_denied` audit, with no procurement reservation
or customer balance entry. This verifies denial auditing after a concurrent
policy change; zero rates are not evidence of commercial charging or supply.
Temporary keys were revoked and mappings disabled.

All-target Clippy, release compilation, formatting and public-tree boundary
checks completed. No fixture outcome is evidence for this checkpoint. Successful
priced dispatch, prepaid debit and release, lost acknowledgement after commit,
and concurrent financial recovery still require independent current-input verification. This does not
qualify the complete billing workflow or performance.
