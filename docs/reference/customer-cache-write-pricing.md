# Customer cache-write pricing

Customer tariffs accept optional `cache_write_prompt_rate`, an exact integer
string of currency nanounits per million tokens. It prices explicitly reported
cache creation as a subset of aggregate input. Ordinary input, cache reads,
and cache writes must not overlap. The combined token numerator is rounded
upward once before applying the existing request fee and minimum.

For configured categories, subtract their reported quantities from aggregate
input before applying the ordinary input rate. A category without a separate
rate stays within flat input pricing. Missing usage under a configured rate
remains unresolved; it is never replaced with zero or Supplier cost.

Admission uses the largest configured ordinary/read/write input rate against the
input bound. The zero-price dispatch exemption also requires an absent or zero
cache-write rate. Immutable revisions and expected-revision conflicts apply.
Replacing an existing separate write rate requires an explicit value or null;
omission conflicts. Null restores flat pricing for that category. Existing
attempts and invoice lines retain their pinned rates.

Migration 0246 adds nullable rate and separately billed quantity columns.
Platform tariff lists, model prices, history, invoice lines, SDK, and generated
OpenAPI expose the new customer fields. Supplier cache-write prices are separate
unfinished work. No TTL-specific price distinction is introduced by this field.

## Verification boundary

Compilation, SDK, contract consistency, and documentation build have been checked.
Actual native Messages requests reported 5,294 cache creation tokens on the first
request and 5,294 cache read tokens after Gateway restart. Ordinary input, reads,
and writes had distinct internal verification rates. Exact category charges and
debits matched independent arithmetic; holds were released. Input redaction and
cache metadata preservation also remained effective.

The platform tariff listing exposed the configured rate. Omitting an existing
write rate returned a conflict. Explicitly clearing it created a new revision;
an invoice generated afterward retained the earlier rate, category quantity, and
exact total for both requests. An independent process reopened the stopped
PostgreSQL database and checked saved response hashes, category quantities,
pinned rates, invoice total, and ledger debits.

Combined write/reasoning schedules still require current-input verification.
Write-rate-only concurrent admission is verified below. Missing-category retention is verified
below; later correction/recovery remains unverified. These are
personal upstream calls with internal prices, not commercial Supplier evidence.


## Missing write quantity and native upgrade

An actual OpenRouter GPT-4.1-mini Chat response reported known prompt and output
totals without a cache-write quantity. With an explicit write price, no customer
charge or debit was created. The reservation survived Gateway restart. Independent
reopening matched the saved response hash and aggregate quantities, pinned write
rate, absent write category, missing charge/debit, and retained hold.

The initial verification request used text blocks that the selected Chat path
rejected with HTTP 400. The completed run used its supported string content; the
rejected input is not evidence of a missing-usage completion.

The existing native runtime applied migration 0246 after a private backup and
archive inventory check. Configuration hashes, encrypted credential identities
and revisions, and organization, workspace, media-job and financial-entry counts
were unchanged. Backup restoration was not performed. Implementation CI run
38084967023 succeeded; this is separate from the actual accounting evidence.


## Two-Gateway write-only admission

Two native Gateway processes shared an isolated database. Ordinary input/output
rates, fee, and minimum were zero, while the cache-write rate was 1,000,000
nanounits per million tokens. Internal credit equaled the 32,768-token input
bound. Two simultaneous actual Messages requests with a unique cached prefix
produced one HTTP 200 and one HTTP 402. The rejected response arrived while the
accepted request still held its reservation.

The accepted response reported nonzero cache creation. Independent reopening
matched its saved response hash and a charge equal to the reported cache-write
quantity, with one attempt, one debit, and no remaining hold. After restart,
remaining credit could not cover another full input-bound reservation, so another
request was refused before dispatch. This checks that a write-only tariff does
not enter the free-request exemption; it is not sustained performance evidence.
