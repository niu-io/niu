# Key-controlled tool streaming

Reviewed 2026-10-12 on clean committed implementation `a9de7c8`.
This is current-input integration evidence, not complete release qualification.
Fixture outcomes provide no evidence.

## Actual workflow

A fresh isolated native PostgreSQL database migrated through 0279. Management
configured the saved personal OpenRouter credential, a private Chat alias,
explicit internal customer tariffs and approved credit. An initial unfunded
request returned 402 without an attempt. No paid top-up, funding receipt,
commercial Supplier agreement or discount was manufactured.

Two separate keys each received the following policies before dispatch:

| Policy | Configured value |
| --- | --- |
| Rolling request limit | 2 requests per 60 seconds |
| Concurrent unresolved requests | 1 |
| Estimated rolling token budget | 20,000 |
| Allowed source | Loopback IPv4 network |
| Customer spending ceiling | 5,000,000 USD nanounits |

Each key then completed an actual two-turn streaming tool workflow. One omitted
`response_format` and forced the named `multiply` function; the other explicitly
used text format and required a tool. Both disabled parallel tool calls.
The first response supplied valid arguments for 23 times 47 and finished with
`tool_calls`. The client calculated 1,081 and submitted it with the actual tool
reference. The second request selected `tool_choice: none`; its free-text final
answer contained the result and fresh marker and finished with `stop`.
All four streams completed with terminal usage and `[DONE]`.

## Limits, rotation and recovery

The usage-window API reported two known requests per lineage, matching the two
actual upstream calls. The client-side calculation did not create an additional
request or charge. Unresolved concurrency returned to zero after completion.

| Output mode | Known prompt / completion tokens | Exact customer charge and debit |
| --- | --- | --- |
| Omitted format | 219 / 30 | 56,667 USD nanounits |
| Explicit text | 223 / 34 | 61,112 USD nanounits |

Rotating each secret preserved its lineage, absolute expiry and policies. The
old secret returned 401. A third streamed request through the replacement returned
429 `key_request_rate_exceeded`, including after Gateway restart while the
rolling window remained active. Management then removed RPM restriction and
lowered the spending ceiling to exactly the already posted charge. New requests
returned 402 `key_spending_limit_exceeded`, including after another restart.
Those refusals created no extra attempt or debit. Replacements were revoked;
subsequent authenticated reads returned 401.

Independent PostgreSQL reopening reconstructed all four saved streams, parsed
tool arguments, checked the linked tool-result requests and final marker/text,
and recalculated every original-rate charge and matching debit. It verified four
completed attempts, four charges/debits totaling 117,779 USD nanounits, two
rotation lineages, four revoked secrets and unchanged absolute expiries. Native
policy histories establish all five initial policies before the first dispatch;
final native limits match the recorded RPM removal and exact spending ceilings.
Saved usage-window subtotals match the actual token counts. No request failure,
open customer/procurement hold or funding receipt remained.

## Verification boundary

This qualifies the exercised combination of text-mode tool streaming, key
policies, accurate charges, rotation and restart. It does not demonstrate TPM or
concurrency exhaustion in this run, every simultaneous admission race, a window
expiry transition, commercial supply, prepaid merchant funding, broader providers,
customer report presentation or sustained throughput. The gateway validates tool
call structure and selection; clients remain responsible for safe execution and
parameter semantics. Original installation data and encrypted identity were
preserved; private credentials and raw response artifacts remain outside Git.
