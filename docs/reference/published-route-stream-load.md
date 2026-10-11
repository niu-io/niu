# Published-route streaming workload

Date: 2026-10-11. Pinned backend: `e655a37`.

A fresh isolated native PostgreSQL/Gateway installation exercised the original
`openai/gpt-4.1-mini` streaming path with actual personal OpenRouter access.
Eight workspace keys each completed 15 structured Chat streams. The client
scheduled 120 requests at two requests per second, using sixteen workers; the
Gateway admission pool was configured for eight connections. Explicit internal
customer tariffs and approved credit exercised accounting without claiming
commercial Supplier qualification or external funding.

| Observation | Result |
| --- | --- |
| Actual completed streams | 120 |
| Workload duration | 60.75 seconds |
| Completion throughput over the workload | 1.975 requests/second |
| Maximum start delay relative to schedule | 10.11 ms |
| Client first-content time p50 | 1,161.20 ms |
| Client first-content time nearest-rank p95 | 1,626.47 ms |
| Client full round-trip p50 | 1,342.13 ms |
| Client full round-trip nearest-rank p95 | 1,902.23 ms |
| Maximum client full round-trip | 3,904.84 ms |
| Maximum sampled Gateway RSS | 33,328 KiB |
| Maximum sampled macOS `ps` CPU percentage | 4.2% |
| Resource samples | 118 |
| Reconciled internal customer charges | 2,004,137 USD nanounits |

First-content time starts immediately before HTTP dispatch and ends at the first
nonempty content delta. It excludes role-only events and includes Gateway and
upstream time. Full round-trip ends after reading the entire stream. Gateway
resource samples used macOS `ps` approximately every 500 ms. Its CPU percentage
is a process statistic, not an interval CPU profile; sampled maxima can miss
short peaks. No PostgreSQL or upstream resource metric was sampled.

All streams returned HTTP 200, their unique requested structured marker, a final
usage observation and `[DONE]`. Every original SSE artifact was retained privately.
Gateway restart preserved all attempts, and temporary keys were revoked.
An independent process rehashed and parsed each artifact, then reopened the
stopped database: all attempts were completed and attributed to the correct key
and a single published routing generation. Reported usage matched each attempt;
integer tariff arithmetic matched every charge and its sole debit by amount,
currency and customer scope. No customer reservation remained open and no funding
receipt existed. The original runtime, database and encrypted identity were
preserved.

This qualifies the observed structured streaming workload and its accounting.
It does not establish maximum capacity, Gateway-only latency, overloaded behavior,
client-disconnect settlement, video performance or complete release readiness.
The absence of a 502 in this run does not resolve every possible upstream failure;
saved failures elsewhere remain independently diagnosable. Compare with the
[buffered workload](mixed-key-sustained-text.md) without inferring a regression or
improvement from different rates and external upstream timings.

## Workspace reporting after streaming completion

A separate stopped-database copy of the 120-stream run was opened with the same
pinned Gateway for customer reporting. An ordinary workspace viewer traversed
all request pages without duplicates or omissions. Full-range summaries matched
the complete reported token counts and exact customer-charge total; all eight
key filters returned their own 15 attempts. CSV contained all 120 rows with the
same usage and charges and remained byte-identical after Gateway restart.

Checked customer response/export fields contained no procurement or credential
categories. The viewer's procurement-cost read returned 403, and revoking its
session changed subsequent request-list access to 401. Independent reopening
matched the original stream-run usage and charges to every saved customer API
row and CSV entry, confirmed exact full-range totals and unchanged financial
counts, and checked the revoked reporting session. No inference, funding or new
customer charge was introduced by these reads.

This verifies backend reporting for the observed completed-stream history. It
does not establish browser presentation, failed/interrupted-stream reporting,
all possible concurrent pagination changes or unrestricted history capacity.
