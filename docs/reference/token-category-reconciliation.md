# Supplemental token-category reconciliation

The existing installation-only request usage reconciliation endpoint can now
supplement missing cache-read or reasoning quantities when the request already
has provider-reported aggregate input/output totals. The request must be confirmed
completed and have no posted customer charge. Existing unknown-aggregate recovery
remains available under its original eligibility rules.

The lookup uses the saved generation reference, original enabled credential
revision and exact dispatched upstream model. It never accepts client-supplied
quantities, generation identifiers or costs, and never resubmits inference.
Managed canonical OpenRouter Chat (buffered and streaming) and Messages responses
retain the server's `X-Generation-Id` header before consuming the response body.
The shared save has a 250 ms deadline. A failed save logs a bounded diagnostic
without converting already dispatched work into a new inference attempt. Static
routes and noncanonical endpoints do not acquire reconciliation references.
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

Conflicting numeric metadata and simultaneous complementary category updates
still require their own current-input verification. The later Chat checkpoint
below covers customer settlement after a missing-category persistence fault;
existing generic merge invariants and static checks are not its evidence.

The existing unknown-aggregate path was also rerun using an actual dated-model
GPT-4.1-mini Messages response. After an in-flight tariff change, supplemental
metadata enabled exactly one charge under the original tariff. Eight concurrent
replays, key revocation and restart retained one receipt, one charge/debit and
no open hold. Independent reopening recomputed the amount from the saved actual
response and pinned rates, and confirmed preserved encrypted credential identity.
This verifies the existing aggregate-recovery path after this change; it does
not fill the category-only customer settlement evidence gap above.

## Bounded recording under contention

The recording transaction uses a 250 ms lock timeout and a two-second statement
timeout. These settings are transaction-local and do not change the connection's
subsequent work. They bound database lock/statement waits, not the entire HTTP
request: the preceding metadata lookup has its own deadline, and pool acquisition
has its existing timeout. Failure rolls back the receipt and category update
and returns a sanitized storage error. Retrying reconciliation never resubmits
inference.

A fresh actual Messages completion retained known totals and missing reasoning.
An independent PostgreSQL session held that attempt's row lock while the API
queried its original upstream metadata. The API returned 503 in approximately
0.93 seconds; PostgreSQL independently logged the lock timeout. While the lock
remained held, reads confirmed no receipt and still-unknown reasoning. The HTTP
error exposed neither SQL nor private routing/credential fields.

After releasing the lock, eight concurrent reconciliation calls all returned
the same receipt. Restart preserved it. Independent reopening matched the saved
Messages response, separately fetched terminal generation metadata, original
category record, unchanged completion timestamp and final merged quantities.
Exactly one attempt and one receipt remained, with no customer financial entries.
This verifies bounded recording failure and concurrent retry for an actual
personal request; it does not qualify a missing-category customer debit or
throughput capacity.

An earlier concurrency run reached the generation endpoint before metadata was
available and received 502 for all lookups. The successful contention run waited
for independently observed terminal metadata before racing record writes. No
inference retry or relaxation of evidence checks was added.

## Protocol admission boundary

Personal native Messages category supplementation must not be interpreted as
support for category-priced native dispatch. A fresh HTTP request on 2026-10-11
configured a nonzero customer reasoning rate and explicit internal verification
credit, then attempted native Messages. Admission returned 422 because the
selected protocol cannot supply that required pricing category. Independent
reopening found zero attempts, charges, balance entries, reservations and
reconciliation receipts. No upstream execution was initiated by this refusal.

Consequently this path cannot qualify category-only customer debit recovery.
That remaining case requires an admitted, supported pricing/protocol combination
with actual missing usage evidence; do not weaken admission or manufacture missing
categories merely to obtain a settlement result. This adds no new protocol support.

## Chat reasoning recovery after a persistence fault

Actual buffered and completed-stream Chat requests used
`openai/o4-mini-2025-04-16`, explicit internal customer rates and approved credit.
Each original response contained nonzero reasoning usage and the requested fresh
marker. An isolated database trigger omitted only the persisted reasoning field;
it did not alter the upstream request, response or reported quantities. This
checks a persistence failure, not a claim that this provider omitted its usage.

The original response and known aggregate totals were retained, no customer
charge was posted, and the reservation survived restart after the fault was
removed. A later tariff edit preceded the existing reconciliation API's real
metadata lookup. The canonical metadata matched the exact dispatched model,
reference, aggregate totals and nonzero reasoning subset. Financial recovery
then posted one debit under the original tariff. Repeated reconciliation and
another restart retained one receipt and debit, with no remaining hold.

Independent processes reopened each stopped database and reconciled the saved
JSON or raw terminal SSE, receipt, original missing-category record, restored
quantity, pinned rate, exact charge/debit and revoked key. No merchant funding
receipt or commercial Supplier qualification was created.

The initial diagnostic run exposed missing Chat reference capture. It also used
the undated model alias, while metadata identified a dated model. That request
remained unresolved; no historical reference was inferred from a customer body,
and strict model matching was not relaxed. The completed verification runs sent
the explicit dated model and captured the server header through the fixed path.
Other protocols, interrupted Chat streams and a provider that never reports the
missing quantity remain outside this checkpoint.
