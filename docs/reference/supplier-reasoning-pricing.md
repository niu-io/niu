# Supplier reasoning-output prices

Supplier text offers accept `reasoning_completion_rate` as an optional exact
integer string of currency nanounits per million reasoning output tokens, up to
1,000,000,000,000,000. This is an agreed purchase rate, independent of the customer
selling tariff and route procurement budget schedule.

Reasoning is a subset of aggregate completion tokens. Accrual subtracts it from
ordinary output before applying the separate rate, combines any configured cached
input category, and rounds the combined numerator upward once. Missing required
category quantities remain unresolved. No zero quantity is invented.

Migration 0244 adds a nullable rate on immutable offer revisions and a nullable
separately billed quantity on earned liabilities. Flat historical revisions and
earnings remain null. Publishing a new revision requires an explicit reasoning
rate or null when the previous revision priced reasoning separately; omission
conflicts. Explicit null restores flat output pricing. Any price revision pauses
the offer and requires renewed qualification under the existing rules.

Offer directory/history and Supplier consumption expose the agreed category rate;
consumption includes the separately priced reasoning quantity. Existing Supplier
membership and platform authorization remain in force. These procurement fields
must not be substituted for customer prices or charges.

## Verification boundary

Compilation, SDK build, and generated contract consistency have been checked.
Actual management HTTP requests verified publication, invalid-rate rejection,
omitted-field conflict, Supplier viewer read/write boundaries, foreign-scope
denial, restart persistence, explicit null clearing, and membership revocation.
An independent database reopen checked both immutable revisions, their exact
rates, and the absence of fabricated qualification, attempts, or earnings.
Nonempty earned liabilities, settlement, and recovery remain unverified. A personally
funded upstream credential is not evidence of commercial supply rights, an agreed
purchase price, a qualified offer, or a completed Supplier payment.
