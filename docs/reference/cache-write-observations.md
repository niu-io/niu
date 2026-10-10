# Cache-write observations

Migration 0245 adds nullable `cache_write_input_tokens` to immutable request token
categories. Native Messages completion records retain explicitly reported cache
creation counts alongside cache reads. Historical values remain null; OpenAI
Chat and Responses do not infer a cache-write count from unrelated fields.

Both completion-batch persistence and scoped category writes enforce nonnegative
quantities and prevent cache reads plus writes from exceeding aggregate input.
Identical replays preserve the observation; conflicting category values cannot
replace it. This adds storage, not a cache-write tariff or public log field.

An actual native Messages run through OpenRouter reported explicit cache creation
zeroes on two visible Claude Haiku responses. Independent reopening matched those
zeroes and cache reads to the saved responses. Three completed calls, including
an output-blocked request, retained exact aggregate-token charges and debits.
A separate actual response reported null cache creation: aggregate usage remained
unknown, no charge was invented, and its reservation survived Gateway restart.

The run does not qualify nonzero cache creation, explicit cache controls,
cache-write pricing, or category-specific recovery. Those remain unfinished.
The original runtime and database were unchanged by this isolated verification.


## Explicit cache controls and nonzero observations

Native Messages text blocks now accept `cache_control` with type `ephemeral`
and optional `5m` or `1h` TTL. Other metadata keys, types, and TTLs are rejected.
The protocol shape follows the [Claude prompt caching documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).
Content inspection validates and temporarily removes cache metadata, inspects or
redacts every text block, then restores the metadata on the transformed request.

An actual OpenRouter Claude Haiku request with a unique long prefix and a 5-minute
cache marker reported 5,295 cache creation tokens. After Gateway restart, the
repeated request reported 5,295 cache read tokens and zero cache creation tokens.
The stored request showed redacted text and the unchanged cache marker; invalid
cache metadata was rejected before any attempt existed. Independent reopening
verified saved response hashes, exact category quantities, aggregate-token charges,
matching debits, and released reservations. Served documentation matched the new
OpenAPI contract. A separate request with a one-hour TTL is recorded below. These observations do not
implement a separate cache-write price or claim a commercial Supplier offer.


## One-hour metadata request and native refresh

A fresh actual request using `ttl: "1h"` reported 5,297 cache creation tokens;
a repeated request after Gateway restart reported 5,297 cache read tokens.
Independent reopening verified the response hashes, category quantities, exact
aggregate charges/debits, and released holds. Redaction preserved the one-hour
metadata in the retained request. This checks acceptance and immediate reuse of
the requested TTL; it does not measure retention over an elapsed hour or verify
the upstream's separate TTL-specific charges.

The existing native runtime applied migration 0245 after a private backup with
archive inventory inspection. Configuration hashes, encrypted credential identities
and revisions, and organization, workspace, media-job, and financial-entry counts
were preserved. Backup restoration was not exercised.
