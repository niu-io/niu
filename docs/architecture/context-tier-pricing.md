# Context-tier pricing

Status: customer tier publication, admission, charging and invoice grouping are
implemented, with current-input boundaries below. Supplier tier publication and
accrual are implemented, with draft management evidence only. This design extends
their immutable schedules and
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
commercial context tiers. Customer export verification is recorded below.

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


### Customer reporting and timing repair

Populated tier-charge export verification exposed missing observed timings for
native Messages: the shared timing middleware did not include `/v1/messages`.
The route now uses the same monotonic collection and diagnostic persistence as
Chat, Responses and Embeddings. Missing historical timings are not backfilled.

Two new actual Claude Haiku requests observed 5,291 cache-write tokens followed
by 5,291 cache-read tokens. After the in-flight price publication and restart
checks above, a customer viewer read request details, the request list and CSV.
The customer amounts and quantities matched their stored charges. Installation
and viewer detail serialization matched; procurement/credential fields checked
by the verifier were absent, the procurement-cost endpoint denied the viewer,
and an operator from another organization received 404 for details and export.
CSV content remained byte-identical after another Gateway restart.

Independent reopening checked response hashes, immutable tier selection, exact
charges/debits, historical invoice rates and exported amounts. Persisted dispatch,
headers and total times were ordered and nonnegative, with HTTP 200 and complete
body timing; CSV durations matched those records. This verifies the observed
nonstreaming delivery path, not streaming TTFT, cancellation or native streaming.

### Cache-write reporting contract

Request list/detail responses now expose nullable `cache_write_input_tokens`.
The full-range summary adds its observed sum, observed request count and unknown
request count. CSV adds `Cache-write input tokens`, leaving unknown values empty.
These are provider-reported quantities, not Supplier prices or inferred charges.
The SDK and generated handler OpenAPI describe the same fields.

Current HTTP reads against retained actual cache-write/read requests matched their
independently reopened database records, including a nonzero write and an explicit
zero. The sum and observation counts covered both requests, and viewer/foreign-scope
checks continued to hold. A separate retained actual Chat response lacking the
category returned null, zero observations and one unknown; its CSV cell stayed
empty before and after restart. Independent reopening again confirmed no invented
charge and a retained unresolved reservation. These reporting checks reused actual
response artifacts; they did not send another upstream inference request.


## Supplier implementation and verification boundary

Supplier tier schedules use the same normalization, whole-request selection and
exact category arithmetic as customer tiers, but remain in separate immutable
procurement revisions. Publication requires explicit replacement of existing tiers;
empty arrays clear them and null is rejected. A new revision continues to pause
activation and invalidate the current qualification review. Legacy publication
entry points remain available but cannot silently erase an existing schedule.

Earning accrual selects from the attempt-pinned Supplier revision and records the
selected threshold with the immutable earning. Consumption groups by revision and
threshold and reads the selected rates, preserving nullable category semantics.
Settlement continues to consume existing earned entries; there is no new balance
or settlement engine. Supplier prices never substitute for customer charges.

An actual SDK/HTTP management run created a disabled, unqualified draft with a
threshold-1,000 schedule. Its Supplier viewer could read the schedule, could not
publish, and an operator without membership could not read it. Omitted existing
tiers returned 409, explicit null returned 422, duplicate/zero thresholds returned
400. Restart retained the schedule; explicit empty-array publication produced a
new revision while preserving the original. Revoking membership denied subsequent
reads. The empty consumption endpoint executed successfully. Independent reopening
confirmed both immutable schedules and no attempts, qualification reviews or
earnings. This does not verify nonempty earning selection, recovery, consumption
grouping or settlement. Those require actual qualified business-flow evidence;
no supply rights, commercial agreement or payment record was fabricated.

The native development runtime subsequently applied migration 249 after a private
database backup and archive-inventory check. Existing Supplier revisions retained
empty tier schedules. Readiness returned HTTP 200; original configuration hashes,
encrypted credential identities and durable organization, workspace, video-job
and financial-entry counts were unchanged. Backup restoration and nonempty
Supplier settlement were not exercised by this upgrade. The implementation
commit's GitHub contract workflow completed successfully; that is contract
consistency evidence, not business-flow acceptance.

### Supplier earning attribution contract

Platform-admin Supplier earning pages and Supplier-scoped dashboard previews now include `revision`, `offer_id`,
`context_minimum_input_tokens` and the stored ordinary/cache-read/cache-write/
reasoning quantities. The offer and revision references let an authorized client
retrieve the immutable original schedule; they are API references, not display
labels. A null selected threshold denotes base pricing. Null category quantities
must not be displayed as zero: a category may be unreported or not independently
priced in that earning. Customer reporting remains separate.

The SDK and generated earning-page schema expose these fields. Compilation and
contract checks cover their integration, while current-input management checks
exercise an empty administrator earning page and deny both Supplier members and
unrelated operators. Supplier dashboard authorization remains separate. Nonempty
Supplier earning serialization and financial reconciliation remain unverified;
no synthetic earning or commercial qualification was introduced for this change.

### Interrupted tier-only stream

An actual Chat stream used zero base rates and no minimum, with a threshold-1
schedule pricing input/output at 1,000,000/2,000,000 nanounits per million tokens.
Configured bounds of 2,048 input and 512 output required a 3,072-nanounit hold.
The key spending limit was set to that exact bound. The client closed after the
first actual content event, before terminal usage.

The attempt remained `may_have_executed` with unknown usage. No charge or debit
was invented; one balance reservation remained held, and the customer request
status stayed pending. Another dispatch was rejected by the key limit. Secret
rotation, Gateway restart over a recovery interval and later key revocation did
not erase the liability or permit another attempt. The original secret was
rejected after rotation.

Independent reopening authenticated the saved stream-prefix hash, verified actual
content without terminal usage, selected the pinned tier schedule, recomputed the
3,072-nanounit bound, and checked the unknown attempt, absent charges/debits and
retained reservation. This covers the observed first-content disconnect only;
it does not prove upstream cancellation, resolve missing usage, or verify a race
between client disconnect and terminal settlement.

### Client close after terminal usage

A separate actual Chat stream used the same tier-only schedule and conservative
bound. The client consumed through the terminal usage event, then closed without
reading `[DONE]`. The resulting attempt had provider-reported complete usage,
one exact tier-priced charge/debit and no open balance reservation. The customer
request reported charged status with matching token quantities. A subsequent
full-bound request remained denied because the consumed amount still counted
against the key spending limit.

Secret rotation, Gateway restart across recovery ticks and key revocation retained
that single settlement. Independent reopening checked the saved stream-prefix
hash and its one terminal usage object, recalculated the amount from the pinned
schedule, and matched the selected threshold, charge, debit and released hold.
This complements the first-content disconnect observation. It does not establish
all transport-buffering or simultaneous terminal/cancellation orderings, nor does
it assert that the server had not already written `[DONE]` before client closure.

### Messages metering compatibility at admission

The native Messages adapter cannot report a reasoning output subset. A bound
customer tariff or text Supplier offer with a separate reasoning rate in its base
schedule or any tier reachable within the configured input bound is now rejected
inside the priced-admission transaction, before dispatch or reservation commits.
An explicit zero rate still requires a known quantity; null means ordinary output
pricing. Unreachable tiers do not prevent otherwise compatible calls. The check
uses the immutable revisions bound to this attempt, including operation-pinned
prices, rather than a separate read of the current price. Messages returns HTTP
422, native `invalid_request_error`, and `x-niu-error-code:
unsupported_token_pricing`, without disclosing procurement rates.

A current-input run first reproduced the defect using a real nonstreaming
OpenRouter Messages response: completion succeeded, reasoning usage stayed
unknown, no customer charge was posted, and one reservation survived restart.
After the change, fresh isolated API runs rejected the base schedule and a
reachable tier with an explicit zero reasoning rate without creating attempts or
reservations, including a restart check. A tier above the configured input bound
permitted a real Messages response and produced the exact customer charge and
matching debit with no open reservation after restart. Independent verification
reopened the stopped database and reconciled the saved response against the
pinned tariff, charge and debit. These runs used personal upstream access and
explicit internal verification credit/rates, not a commercial Supplier agreement
or paid top-up.

Nonempty Supplier-offer rejection has not been exercised in this checkpoint. This prevents a known unsupported pricing
combination; it does not implement thinking support or qualify combined
cache-write and reasoning billing. Previously dispatched unresolved liabilities
are preserved, not automatically released or treated as zero usage.


A subsequent current-input concurrency run paused admission immediately after
binding its flat-output customer tariff, using a temporary transaction gate in an
isolated database. A simultaneous API tariff publication introducing a separate
reasoning rate was observed waiting on the workspace lock. After releasing the
gate, the actual Messages call completed and was charged under its original
immutable tariff; the new revision became current. Subsequent calls returned
HTTP 422 with `x-niu-error-code: unsupported_token_pricing`, both before and after
Gateway restart. The gate was removed. Independent verification reopened the
stopped database and checked the retained response hash, exact charge/debit,
original bound revision, new current reasoning rate, one total attempt, no
funding and no open reservation. This verifies the admission-first publication
ordering; it does not establish Supplier-offer concurrency or arbitrary protocol
metering support.
