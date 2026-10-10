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
