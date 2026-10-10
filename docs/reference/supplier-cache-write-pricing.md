# Supplier cache-write prices

Supplier text offers accept optional `cache_write_prompt_rate`, an integer string
of currency nanounits per million tokens, bounded at 1,000,000,000,000,000.
It is independent of customer selling rates and route procurement budgets.

Accrual uses explicitly reported cache-write quantities as a disjoint subset of
aggregate input. Ordinary input, cache reads and cache writes are split before
combining output categories and rounding upward once. Missing required category
usage remains unresolved. This reuses the common exact token-pricing function;
it does not derive Supplier rates from customer charges.

Migration 0247 adds nullable immutable revision rates and separately billed
quantities on Supplier earnings. An existing separate write rate requires an
explicit value or null on replacement; omission conflicts. A new revision pauses
the offer under the existing qualification rules. Null restores flat pricing for
the write category. Historical revisions retain their rates and quantities.

Offer directory/history, consumption, JavaScript SDK, and OpenAPI carry the new
Supplier fields. Customer responses remain governed by their separate tariff and
serialization paths. The rate does not distinguish cache TTLs.

Nonempty Supplier earning, settlement, and recovery verification remains open.
A personally funded upstream credential is not evidence of commercial supply
rights, an agreed purchase price, qualification, or payment.


## Current-input management verification

A JavaScript SDK request published an actual draft quote with separate ordinary,
cache-read and cache-write rates. HTTP reads returned the exact values. Invalid
rates, omission of an existing write rate, viewer writes, foreign Supplier reads,
and revoked membership access were rejected. Gateway restart preserved the quote;
explicit null created a new revision while the original retained its write rate.
Independent reopening verified both immutable revisions and the absence of
attempts, qualification records, or earnings. The served documentation contract
matched the generated Supplier fields. Compilation and Clippy also completed.
This management evidence does not qualify nonempty financial settlement.
