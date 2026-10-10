# Context-tier pricing

Status: implementation design; no tiered tariff is exposed yet. Category prices
are implemented separately. This design extends their immutable schedules and
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
