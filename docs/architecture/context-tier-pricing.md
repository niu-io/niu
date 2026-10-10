# Context-tier pricing

Status: customer tier publication, admission, charging and invoice grouping are
implemented, with current-input boundaries below. Supplier tiers remain unimplemented. This design extends their immutable schedules and
existing admission/ledger transaction boundaries rather than creating another
billing engine.

## Meaning of a tier

The threshold measures provider-reported aggregate input tokens, including cache
reads and cache writes. A positive, inclusive threshold selects a complete token
rate schedule for the whole request, not a marginal band. The highest threshold
less than or equal to actual aggregate input wins. Below all thresholds, the
revision's existing base rates apply. Output volume does not select the tier.

Each tier has ordinary input/output rates and explicit nullable cache-read,
cache-write and reasoning rates. Null means flat pricing for that category;
there is no implicit inheritance of category rates from the base schedule.
Currency, request fee and minimum remain properties of the parent revision.
Thresholds are unique positive integer token counts; publication sorts them and
rejects duplicate thresholds, invalid rates and oversized schedules atomically.
Supplier and customer schedules remain separate commercial records.

## Pinning and admission

The current code pins the customer revision before dispatch through
`customer_attempt_tariffs`, using an operation-level pinned revision where one
exists. Keep that boundary. Attach immutable tier rows to the same revision so
concurrent price publication cannot change an admitted request's schedule.

Admission knows conservative input/output bounds, not authoritative input usage.
For each schedule reachable within the input bound, compute a conservative charge
using the largest configured input category rate and the largest output category
rate. Apply the existing fee/minimum to each result, then reserve the maximum.
Include the base schedule. Do not assume higher thresholds mean higher prices.
Do not select the final billable tier from request bytes or token estimates.

A nonzero rate in any reachable tier prevents the free-request exemption. All
balance, workspace and key limits must use the same reservation. Missing bounds
must reject priced dispatch. Provider usage that exceeds declared bounds must
remain visible in diagnostics; tier support must not silently truncate it.

## Settlement and recovery

Once authoritative usage exists, select the tier from the pinned revision and
reported aggregate input. Record the selected tier with the immutable charge or
Supplier earning in the same transaction as its financial entry. Base pricing is
represented explicitly, and old flat charges retain their historical meaning.
Missing quantities required by the selected schedule remain unresolved with the
existing liability handling; no category is invented or borrowed from Supplier
cost. Existing exact category arithmetic supplies the charge.

Replay and background recovery select from the same immutable revision. A later
price edit cannot modify the selected schedule or insert a second debit. Invoice
lines group by both revision and selected tier; otherwise requests using different
rates would be merged into a misleading line. History, SDK and OpenAPI must expose
thresholds and the pinned selection without leaking procurement data to customers.

## Required implementation evidence

Use actual requests with independently verified response artifacts and reopened
database records. Cover below/equal/above threshold, a downward-priced higher tier,
nonzero cached categories, unknown required usage, edits during an in-flight
request, historical invoice grouping, restart/replay, and concurrent admission
from two Gateways. Verify that customer exports contain only customer rates and
charges. A small internal verification threshold may exercise boundary selection;
it must not be presented as a commercial long-context threshold or load result.


## Current customer verification

Actual OpenRouter GPT-4.1-mini calls first calibrated a 29-input-token request.
A published schedule used inclusive thresholds 29 and 32, with lower prices at
the higher threshold. Subsequent actual inputs of 14, 29 and 75 tokens selected
the base schedule, threshold 29 and threshold 32 respectively. The final call
followed Gateway restart. After clearing current tiers with an empty array, the
invoice retained four separate revision/threshold lines and their exact rates.
Repeated invoice creation and another restart preserved the same lines.

An independent process reopened the stopped PostgreSQL database, verified saved
response hashes, selected schedules from pinned revisions, and recomputed all
four charges/debits and the invoice total. No hold remained. Duplicate or zero
thresholds returned HTTP 400; omitted existing schedules returned 409. Explicit
null returned JSON-schema HTTP 422, rather than clearing the schedule.

These thresholds and rates are internal verification configuration, not advertised
commercial context tiers. Customer exports still require tier-specific actual evidence.

### Cache categories and concurrent publication

A separate actual Claude Haiku 4.5 run through the personal OpenRouter connection
published a threshold-1,000 schedule through the JavaScript admin SDK. The first
request reported 5,296 cache-write tokens; after Gateway restart, the same prefix
reported 5,296 cache-read tokens. Input inspection redacted the private marker
while preserving validated cache-control metadata.

After observing the first attempt in `may_have_executed` while its HTTP call was
still pending, the verifier published a new revision with different cache rates.
The first charge retained the original revision and its selected write rate; the
second request used the new revision and read rate. This checks revision pinning,
not a claim about upstream cache pricing or commercial Supplier qualification.

Clearing the active tier schedule did not change either historical invoice line.
Another Gateway restart preserved those lines. An independent process reopened
the stopped PostgreSQL database, checked saved response hashes, selected the tier
from each immutable stored revision using actual aggregate input, and recomputed
the exact category charges and matching debits. Both invoice lines retained their
selected threshold and rates, and no balance reservation remained held.

The first verification attempt stopped because the verification script queried
an incorrectly named execution column. The corrected run and independent artifact
inspection supply the evidence above; the interrupted run is not product evidence.


### Shared balance and missing tier usage

Two native Gateway processes shared a fresh PostgreSQL database and an internal
credit limit of 32,768 nanounits. All base rates, fees and minimums were zero. A
reachable threshold-1,000 tier priced only cache writes at 1,000,000 nanounits per
million tokens, making the conservative input-bound reservation 32,768 nanounits.
Two simultaneous actual Claude Haiku requests returned one HTTP 200 and one 402.
The rejection was observed while the other HTTP call was pending and exactly one
balance reservation was held. Only one attempt, charge and debit existed after
completion. After restarting the Gateways, remaining credit was below the full
reservation bound and another request was rejected without another attempt.
An independent database reopen verified the zero base schedule, selected tier,
actual response hash, exact cache-write charge/debit and absence of open holds.
This is a two-request admission check, not a throughput or capacity result.

A separate actual GPT-4.1-mini Chat request selected a threshold-1 tier whose
cache-write rate was configured, while the base cache-write rate was null. The
upstream supplied aggregate input/output usage but no cache-write quantity.
The attempt completed with provider-reported aggregate usage; no customer charge
or debit was invented, and its balance reservation remained held across restart.
Independent reopening verified the saved response and immutable selected schedule,
missing category, absent financial entries and retained hold. Unknown category
usage therefore remains unresolved for this observed tier path.

### Native integration runtime

The native development Gateway was rebuilt and upgraded from migration 247 to
248 using its existing configuration, database connection and encryption identity.
A private database backup was created first; its archive inventory was checked,
but backup restoration was not exercised. After graceful process replacement,
readiness returned HTTP 200 and migration 248 was recorded successfully. Original
configuration hashes, encrypted credential revisions/ciphertexts and organization,
workspace, video-job and financial-entry counts remained unchanged.

The running docs server returned the current generated handler OpenAPI JSON
unchanged, and its reference HTML included the selected context-tier field. These
checks establish runtime/schema availability and served contract consistency;
they do not constitute browser visual acceptance or another production billing run.
