# Supplier credential cap across two Gateways

Current-input checkpoint on clean runtime `d6304757`, reviewed 2026-10-12.
Fixture outcomes provide no evidence. This is actual shared-database admission
contention, not production capacity or distinct external account qualification.

A stopped copy of the [credential control workflow](supplier-credential-rate-controls.md)
retained two real model calls and 39,631 customer nanounits. Its preceding
rolling windows had naturally elapsed; copied admission timestamps were not
changed. Two Gateway processes shared native PostgreSQL, each configured with
two admission connections and the same saved credential policies.

A newly issued no-expiration workspace key sent two simultaneous strict-JSON
requests, one to each Gateway, using the same model bound to configuration A
and its one-request rolling cap. Exactly one returned **200** with the requested
fresh marker, and the other returned **429 upstream_request_rate_exceeded**.
The rejected request did not add an upstream dispatch or customer charge.

Configuration B, also capped at one, subsequently completed its own real
generation through the second Gateway. Its independent local window was not
exhausted by A's contention. Both saved configurations still used the owner's
same personal OpenRouter secret under one Supplier grouping; this does not
create two independent upstream accounts or prove a commercial agreement.

The two new successful responses charged exactly **34,693 nanounits**. Retained
and new charges/debits totaled **74,324 nanounits**. Both processes were stopped;
a replacement preserved the four charges and total. Revoking the new key
denied subsequent access. Original installation data/configuration/encrypted
identity were untouched. Raw responses and credentials remain outside Git.

## Independent final-artifact verification

A separate process reopened the stopped database. It checked original/new
response digests and reported usage, native attempt completion and actual
credential binding, independently calculated each charge, matching ledger debits,
unchanged policies/revisions and one retained admission for each configuration.
The contender artifacts identify different Gateway targets and one 200/one 429.
There were four dispatched attempts and four charges in the combined history,
no funding receipt and no open customer/procurement hold. Key revocation was
confirmed natively.

This qualifies the exercised simultaneous same-credential admission and sibling
configuration isolation across two current Gateways. It does not establish
saturation, long-running failures/disconnects, every protocol/media dispatch,
rolling-window boundary races, distinct account limits, commercial supply or
production SLOs. Customer prices here are explicit internal verification rates.
