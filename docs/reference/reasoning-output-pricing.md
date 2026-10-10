# Customer reasoning-output pricing

Customer text tariffs accept an optional `reasoning_completion_rate`, expressed
as an exact decimal string of currency nanounits per million tokens. Reasoning
is a subset of aggregate completion tokens, not an additional output count.
Supplier purchase rates remain independent; this customer tariff does not
introduce a separate Supplier reasoning rate.

For a configured reasoning rate, token charging uses:

```text
(prompt_tokens * prompt_rate
 + (completion_tokens - reasoning_tokens) * completion_rate
 + reasoning_tokens * reasoning_completion_rate) / 1,000,000
```

When cached-input pricing is also configured, split the input total using its
reported cached subset before evaluating this expression. Round the combined
numerator upward once, then apply the request fee and minimum charge. Never
charge reasoning tokens twice.

A null reasoning rate selects flat output pricing. Omission is accepted for a
new flat tariff, but replacing an existing explicit reasoning rate requires an
explicit value or null, alongside the expected revision. Already bound requests
retain their immutable tariff revision. A configured category with an unknown
quantity remains unresolved rather than receiving an invented zero quantity.
Admission reserves output at the higher of the ordinary and reasoning rates.

Migration 0243 adds the optional revision rate and separately billed quantity.
Historical flat charges retain null category quantities. Customer model prices,
tariff history, invoice lines, handler-generated OpenAPI, and the JavaScript SDK
carry the category fields.

## Current-input verification

An isolated PostgreSQL instance and the native Gateway processed three actual
OpenRouter `openai/o4-mini` requests using a personally funded credential. The
latest responses reported 256, 192, and 128 reasoning tokens. Internal verification
prices were explicitly configured; these are not commercial Supplier offers,
external payment receipts, or discount claims.

After shutdown, an independent process reopened the database and recomputed
charges from the saved response bodies, checking their hashes, pinned tariff
revisions, debit entries, invoice total, refund balance, and released holds.
The total charge was 11,019,753 currency nanounits. The run also exercised
zero-credit rejection, a key spending cap, an idempotent refund, and Gateway
restart without duplicate charges. A replacement that omitted the configured
reasoning rate returned HTTP 409 without creating a revision; explicit null
created a flat revision without changing existing charges.

This evidence covers non-streaming customer reasoning pricing with request fees
and minimum charges. Concurrent admission still requires current-input verification. Combined
cache/reasoning pricing is verified below. Missing-category retention is verified below;
recovering a subsequently supplied category remains unverified. The served
documentation OpenAPI matches the generated contract, and its reference HTML
contains the new rate field; visual browser acceptance is not claimed. Supplier reasoning rates,
cache-write pricing, and long-context tiers remain separate unfinished work.


## Missing reasoning quantity

A separate actual OpenRouter Claude Haiku 4.5 call through `/v1/messages`
returned the requested marker and known aggregate input/output quantities, but
no reasoning subset. With an explicit customer reasoning rate, the attempt
remained confirmed completed with provider-reported aggregate usage, while no
customer charge or debit was created. Its reservation remained open across a
Gateway restart. An independent process reopened the stopped database, checked
the saved response hash and aggregate quantities, and verified the pinned rate,
missing reasoning category, absent financial entries, and retained reservation.
This does not establish automatic resolution when missing usage later arrives.

The existing native development database also applied migration 0243 after a
private backup. Archive inventory was checked, not restoration. Refreshing the
Gateway preserved configuration hashes, encrypted credential identities and
revisions, and organization, workspace, media-job, and financial-entry counts.


## Combined cached input and reasoning output

Three further actual `openai/o4-mini` requests repeated a long reference prefix.
Reported cached input quantities were 0, 5,120, and 5,120 tokens; reasoning output
quantities were 128, 128, and 192 tokens. Both category rates were configured
simultaneously, with a request fee and a higher minimum on the final revision.

An independent process reopened the stopped PostgreSQL database, verified saved
response hashes, and calculated ordinary input, cached input, ordinary output,
and reasoning output as non-overlapping quantities. One upward rounding followed
by the fee/minimum yielded a total of 12,543,703 currency nanounits, matching
charges, debits, and invoice total. Stored category quantities and pinned rates,
refund-adjusted balance, and released holds also matched. These remain explicit
internal verification rates using a personally funded upstream credential.
