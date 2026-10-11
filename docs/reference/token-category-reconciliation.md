# Supplemental token-category reconciliation

The existing installation-only request usage reconciliation endpoint can now
supplement missing cache-read or reasoning quantities when the request already
has provider-reported aggregate input/output totals. The request must be confirmed
completed and have no posted customer charge. Existing unknown-aggregate recovery
remains available under its original eligibility rules.

The lookup uses the saved generation reference, original enabled credential
revision and exact dispatched upstream model. It never accepts client-supplied
quantities, generation identifiers or costs, and never resubmits inference.
Managed canonical OpenRouter Chat, Responses (buffered and streaming), and Messages responses
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

The aggregate and cached-input conflict runs below cover two numeric mismatch
boundaries. Other known-category conflicts and impossible concurrent input partitions
remain unverified. The complementary-observation run below covers a valid
cached-input/reasoning merge at the production storage SQL boundary. The later Chat checkpoint
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

## Responses reasoning recovery after a persistence fault

The same server-header capture now applies before either buffered or streaming
Responses bodies are consumed. An actual pre-fix Responses request completed
with nonzero reasoning usage but had no durable generation reference, so it
could not enter the existing supplemental lookup. No reference was backfilled
from a client-supplied ID.

New buffered and streamed requests to `openai/o4-mini-2025-04-16` exercised the
fixed path with an isolated omission of the persisted reasoning category. The
upstream responses were unchanged. After removing the persistence fault and
restarting, each known-total request still held its reservation with no charge.
A tariff edit preceded a real metadata lookup; the supplied nonzero reasoning
quantity matched the original response and produced exactly one original-rate
debit. Repeated reconciliation and restart preserved the same immutable receipt.

Independent reopening matched the raw JSON or terminal `response.completed` SSE,
response hash, original missing-category snapshot, restored quantities, pinned
tariff, charge and debit. Each isolated run retained one attempt/reference/receipt
and one charge, with the temporary key revoked and no unresolved reservation or
merchant funding. The private generation header was not forwarded to the client.
These are internal-credit recovery checks, not interrupted-stream qualification,
commercial Supplier settlement or evidence for an unreported upstream quantity.


## Aggregate mismatch retains unresolved liability

A current-input buffered Chat completion on pinned backend `e655a37` returned
known aggregate counts, nonzero reasoning and a fresh output marker. The isolated
missing-category persistence fault retained the original raw response and held
customer settlement. After removing that fault, an explicit isolated database
mutation incremented the saved input total by one. No upstream response or
reported usage was changed.

Reconciliation fetched real generation metadata and returned 409 because its
input total conflicted with the saved total. There was no reconciliation receipt,
customer charge or balance entry; reasoning remained missing and the customer
reservation stayed open. Gateway restart preserved the rejection and absence of
financial entries. Restoring the isolated input total to the original response's
count allowed the same lookup to supplement reasoning and settle once under the
original tariff despite a newer tariff revision.

Independent inspection checked the saved rejection artifacts and unchanged raw
response hash, then reopened the stopped database to reconcile the actual upstream
receipt, original missing-category snapshot, final categories, exact charge/debit,
revoked key and released hold. This verifies the observed aggregate mismatch and
subsequent recovery, not every conflicting category or concurrent merge case.
The original installation and retained databases were not altered.


## Known cached-input conflict

A separate real buffered Chat completion repeated the missing-reasoning persistence
fault with an already known cached-input count. An isolated mutation increased
that saved cached-input count by one, within the known aggregate input total.
The original response and upstream generation metadata were unchanged.

Reconciliation returned 409 before and after Gateway restart. No receipt, charge
or balance entry was created, reasoning stayed missing and the reservation stayed
open. Restoring the original cached-input count allowed the same genuine metadata
lookup to supplement reasoning. Replay and restart preserved one exact debit under
the original tariff, despite the intervening price edit.

Independent verification rehashed and parsed the original response, checked the
saved conflict responses, and reopened the stopped database. Final aggregate and
reasoning counts, upstream receipt and original missing-category snapshot matched;
one completed attempt, one receipt, one charge/debit and no remaining customer
hold existed. Temporary keys were revoked. This verifies one existing cached-input
value conflict, not every category disagreement or complementary-update race.


## Complementary production storage observations

A fresh actual Chat response on `e655a37` reported cached-input and nonzero
reasoning quantities. An isolated persistence fault omitted those two categories
without modifying the upstream request or retained response. Once the fault was
removed, two concurrent database sessions executed the production
`save_request_token_categories.sql`, one with the response's cached-input quantity
and the other with its reasoning quantity. No unreported quantity was supplied.

Both categories persisted together. The running financial recovery worker posted
one exact charge under the pinned customer tariff and released the reservation.
Gateway restart retained the merged categories and single debit. An independent
process rehashed and parsed the raw response, matched the production SQL hash,
and reopened the stopped database: aggregate/category quantities matched the
response, one completed attempt and one original-rate charge/debit existed,
the temporary key was revoked and the omission trigger and open hold were absent.
No funding or reconciliation receipt was created by these storage observations.

This exercises the actual inference-to-recovery flow with concurrent production
storage SQL. It does not exercise two category-observation HTTP handlers, establish
every possible lock interleaving, or qualify an impossible cache-read/cache-write
partition. Those distinctions must remain explicit when assessing API coverage.

## Current diagnostic-version successful recovery (2026-10-12)

Committed gateway `3235c493f263579a32dc0c4afea469a48d7c0239`, verified against
its retained binary digest, repeated the unknown-aggregate recovery path in a
fresh native PostgreSQL database through schema 278. An actual Messages request
to explicit model `openai/gpt-4.1-mini-2025-04-14` returned the requested marker.
Its incomplete native usage retained unknown aggregate state and one reservation.
No missing quantities were fabricated.

Actual captured-reference reconciliation obtained matching non-cancelled terminal
metadata and restored 14 input and 6 output tokens. A customer tariff published
after dispatch increased both rates tenfold; settlement still used the original
bound tariff, producing exactly **7,655 USD nanounits** of customer charge and one
matching debit in the original account. Eight concurrent POST replays returned the
same receipt. Revocation and restart preserved it and released the reservation.
No inference retry, funding receipt or external payment was involved.

Independent reopening matched the saved actual response, original unknown state,
final quantities, pinned original rate, exact debit, preserved completion timestamp
and encrypted credential fingerprint. Exactly one attempt, generation reference,
`openrouter-native-generation-v2` receipt, charge and balance entry remained. The
receipt retained `stop` and `upstream_cancelled=false`. An initial verifier used an
incorrect source-version literal; it was corrected against the implementation and
receipt, then rerun on the same stopped database without repeating inference.

This validates successful recovery alongside the new identity-mismatch diagnosis,
not successful recovery of cancelled evidence, every model alias, customer-paid
media or received merchant funding. The owner's personal OpenRouter credential and
approved internal credit do not establish commercial Supplier rights. No fixture
outcome is evidence; original development data and encrypted identity were unchanged.

## Invoice integration for the recovered request

A separate native run on the same pinned `3235c49` binary copied the stopped
database from that actual successful recovery. Issuing a closed dispatch-period
invoice included exactly the recovered attempt at **7,655 USD nanounits**, with
the original tariff rather than the later tenfold price. An ordinary workspace
reader could read the statement lines and history. History showed `paid` because
the original account's internal-credit debit had settled the obligation; no
external invoice-payment record or merchant funding was created.

The reader's issuance request returned 403. Idempotent administration replay
returned the same invoice. Gateway restart preserved byte-identical reader detail
and history responses; revocation changed the reader's detail request to 401.
No new inference, customer charge or balance entry was needed.

Independent reopening parsed the original native response, recomputed the charge,
and matched the saved invoice artifacts to one immutable invoice, one entry, the
original bound tariff, one reconciliation receipt and one exact debit in the
original account. The newer published tariff was distinct. The temporary reader
was revoked, and no open hold, funding receipt or external invoice payment existed.
This qualifies recovered text usage through invoice integration and the stated
reader permissions, not customer-funded media or external payment collection.
No fixture outcome supports it; original development data and encryption were
unchanged.

## Settled statement overview and duplicate-payment refusal

A further actual HTTP run on pinned `3235c49` copied the stopped invoice
database above. Workspace Billing reported charged and paid amounts of exactly
**7,655 USD nanounits**, zero due and one paid invoice. An ordinary scoped viewer
and installation administrator received identical overview data. Recording a new
payment reference against this already-settled invoice returned 409. Account
fingerprints, attempt/charge/debit counts, external payment records and open
reservations were unchanged. Gateway restart preserved the byte-identical viewer
response; revoking the viewer changed its next request to 401.

An independent verifier reopened PostgreSQL, recomputed the charge from the
original native response and bound prices, and checked the saved overview, invoice
entry, original-account debit and account fingerprint. One attempt, charge, debit
and reconciliation receipt remained, with no external payment, funding receipt or
open reservation. The verification script initially read the documented `data`
wrapper incorrectly; correcting that client parsing and repeating the reporting
run did not require another inference request.

This verifies the recovered prepaid text statement's backend overview and safe
duplicate-payment refusal. Unsettled invoices, other currencies/workspaces, media
settlement and frontend Billing presentation need their own evidence. No fixture
outcome is evidence. Original development data and encrypted identity were unchanged.

## Alias inventory and cancellation boundary — 2026-10-12

A fresh authenticated request to the saved OpenRouter model-list endpoint returned
HTTP 200. Its `openai/gpt-4.1-mini` entry reported canonical slug
`openai/gpt-4.1-mini-2025-04-14`; the explicit dated identifier was not a separate
entry in this response. The raw current response is retained privately. This is
an inventory observation, not successful inference, a commercial supply claim or
proof that a current alias binding applied to an earlier dispatch.

The previously captured metadata for the actual tool-stream disconnect reported
that same dated model, `cancelled=true` and a null finish reason. The existing
identity-mismatch diagnosis therefore must not be fixed by merely treating the
alias and dated identifier as interchangeable: even resolved identity would not
meet the current non-cancelled terminal-evidence requirement. No receipt, completed
execution, charge or reservation release was manufactured from this observation.

A future alias-resolution implementation must retain trusted identity evidence
with the original dispatch/configuration revision, rather than consulting today's
mutable catalog to reinterpret historical requests. It must separately preserve
the cancellation/terminal checks and the original tariff. Such resolution is not
implemented or qualified by this inventory read. The earlier actual dated-model
recovery remains its own explicitly bounded successful checkpoint; it does not
qualify automatic alias resolution or cancelled-usage settlement. No fixture
outcome is evidence, and original data/configuration/encryption were unchanged.

## Shared recording initializer checkpoint

Implementation `0eef425` replaces duplicated reconciliation transaction setup
with the existing bounded recording initializer. The 250 ms lock and 2 s
statement limits are unchanged; this is not a newly discovered timeout defect.

A fresh actual dated-model Messages completion naturally lacked complete
aggregate usage. Canonical upstream metadata subsequently supported recovery.
After a tariff change, reconciliation used the original request tariff and
recorded exactly one customer charge and debit. Concurrent replay, key revocation
and process restart retained the same receipt and released reservation. An
independent reopening of PostgreSQL checked the original native response,
immutable unknown completion, recovered quantities, receipt, exact debit and
encrypted credential. This does not qualify cancelled-request settlement,
commercial supply or automatic alias resolution. No fixture outcome was used.
