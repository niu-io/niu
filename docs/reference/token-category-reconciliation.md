# Supplemental token-category reconciliation

The existing installation-only request usage reconciliation endpoint can now
supplement missing cache-read or reasoning quantities when the request already
has provider-reported aggregate input/output totals. The request must be confirmed
completed and have no posted customer charge. Existing unknown-aggregate recovery
remains available under its original eligibility rules.

The lookup uses the saved generation reference, original enabled credential
revision and exact dispatched upstream model. It never accepts client-supplied
quantities, generation identifiers or costs, and never resubmits inference.
Terminal, non-cancelled provider metadata must match both known aggregate totals
and every category reported by both observations. At least one previously missing
category must become known; otherwise the request returns 409 without consuming
the immutable receipt. Model aliases are not assumed equivalent.

One transaction preserves the original execution, aggregate usage and category
record in the receipt, then invokes the existing category merge operation. Known
values cannot change. The merged cache-read/cache-write partition cannot exceed
total input. Previously known cache-write quantities remain intact; the generation
lookup does not supply cache-write evidence. Missing values remain unknown.
The receipt describes this supplemental observation, not every merged category.
Financial recovery remains responsible for any resulting settlement under the
original pinned tariff. A recorded receipt does not guarantee a posted charge.

## Actual current-input verification — 2026-10-11

A personal OpenRouter Messages request to the explicit model identifier
`anthropic/claude-4.5-haiku-20251001` returned the fresh requested marker, known
aggregate usage, cache-read/write quantities and no reasoning quantity.
The reconciliation endpoint fetched the original generation metadata, matched
its totals and recorded the reported zero reasoning count. That zero came from
provider metadata; it was not inferred from the absence of extended thinking.
Repeated POST and a GET after Gateway restart returned the same receipt.

Independent inspection reopened the stopped PostgreSQL database and matched the
saved actual response to aggregate totals, preserved original categories and
merged categories. The completion timestamp was unchanged. Exactly one inference
attempt and one immutable receipt existed, with no customer charges, reservations
or balance entries. This checks personal usage supplementation, not recovery of
a customer-funded missing-category debit.

A separate actual call using `anthropic/claude-haiku-4.5` returned generation
metadata identifying the explicit dated model instead. Reconciliation returned
409. Independent reopening confirmed unchanged known totals, still-unknown
reasoning and no receipt or financial entry. An earlier inference attempt received
503 before the successful verification; it is not evidence of completed inference.

Conflicting numeric metadata, simultaneous complementary category updates and
customer-funded settlement after category-only supplementation still require
current-input verification. Existing generic category merge invariants and static
checks do not substitute for that evidence.

The existing unknown-aggregate path was also rerun using an actual dated-model
GPT-4.1-mini Messages response. After an in-flight tariff change, supplemental
metadata enabled exactly one charge under the original tariff. Eight concurrent
replays, key revocation and restart retained one receipt, one charge/debit and
no open hold. Independent reopening recomputed the amount from the saved actual
response and pinned rates, and confirmed preserved encrypted credential identity.
This verifies the existing aggregate-recovery path after this change; it does
not fill the category-only customer settlement evidence gap above.
