# Current tier and request-fee acceptance

Two actual personal OpenRouter Chat requests exercised the retained executable at
`f6967dadae7effff19227a4e56c586a07fc7eaea`. Its executable SHA-256 was checked.
A stopped native PostgreSQL copy migrated from schema 284 to 286; the original
installation and financial records were not changed. The existing approved
internal verification credit and frozen base prices were reused. The scoped
schedule added a 64-input-token tier and a 12,345-nanounit request fee. Both
requests limited output to 32 tokens. This is internal accounting verification,
not a Supplier agreement, discount, received payment or resale qualification.

## Successful below-tier request

The actual response reported 16 input tokens and 7 output tokens, with zero
reported cached input and cache write. The canonical read-only Provider generation
record returned HTTP 200 and confirmed `native_tokens_prompt=16` and
`native_tokens_completion=7`. Its normalized `tokens_prompt=6` and
`tokens_completion=3` describe a different quantity; they were not substituted
for the native billable quantities.

The original base input rate of 123,456,789 and output rate of 987,654,321
nanounits per million tokens produced an 8,889-nanounit token charge after upward
rounding. Adding the 12,345-nanounit fee produced exactly 21,234 nanounits.
Independent native charge and debit records and the customer CSV matched that
amount. No context tier was selected because actual input was below 64 tokens.
An attempted usage supplement returned HTTP 409 for this already-known completed
usage; the refusal does not indicate a charging defect.

## Second request and uncertainty

The second request attempted the above-tier input once and returned a customer
HTTP 502. The retained Gateway diagnostic recorded both timeout and connection
failure. The send operation failed after approximately 3,152 milliseconds before
an upstream HTTP response or generation reference was obtained. Native failure
classification was `upstream_timeout`, with no upstream HTTP status. The client
currently caps connection establishment at the lesser of the overall request
budget and three seconds, disables environment proxies and pins checked DNS
addresses.

This was a connection timeout, not an observed upstream HTTP 502 or malformed
successful response. The preceding success used the same protocol, model and
credential. These observations do not establish a request-compatibility defect.
They also do not prove that the second generation did not execute.

Its durable execution state remained `may_have_executed`, with zero customer
charge, zero charge debit and one unreleased 581,234-nanounit reservation. The
original tariff revision stayed pinned to that attempt. Restoring the current
schedule did not release its uncertain liability. No completion, missing token
category or billable zero was invented.

## Verified bounds and remaining work

The original scoped tariff was restored through its revisioned API and both
created keys were revoked. Independent reopening compared original financial
records, credentials and model configuration, excluding only the two actual new
attempts and their associated records; those original records were unchanged.
Raw responses, canonical generation metadata, CSV and native-state verification
are retained privately. Both database copies were stopped at completion.

The two-generation budget is exhausted; no generation retry occurred. This run
qualifies the current below-tier additive fee and the actual connect-timeout
uncertainty handling. A successful above-tier charge, simultaneous nonzero token
categories and the complete S05-2 matrix remain unverified by this run.
