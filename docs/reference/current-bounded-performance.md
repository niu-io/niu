# Current bounded mixed-workload performance

This S12-3 checkpoint follows the finite backend business acceptance. It measures genuine inference and saved-data reads on one native Gateway with PostgreSQL; no fixture upstream or generated load data substitutes for business behavior. The run is deliberately small and does not establish saturation, production capacity or performance relative to New API.

## Environment and bounds

Gateway `8bfdef10003eebe9402401247aa52cd69d3a398f`, binary SHA-256 `6f5290d182c9bf51de1f2bb8d469067351c9f9771150235adc2917b1d39c6900`, and compiled SDK `ce97f3b0116570dfd2a487b802d2d2de18efbf39` ran against a stopped-database copy migrated to schema 293. The local host is arm64, macOS 27.2, with 10 logical CPUs and 24 GiB RAM. PostgreSQL and Gateway shared this host. Provider round trips used the existing network path.

The copy retained twelve genuine prior inference charges, a saved invoice, existing approved internal verification credit, the frozen customer tariff and the genuine personally funded OpenRouter credential/model mapping. No new cash receipt, Supplier qualification, model capability, price or tariff was created. Payment/video polling were disabled. Original services, database, configuration and encryption identity were untouched.

The hard budget was 24 generation POST attempts, each with at most 16 output tokens and no retry. Each caller additionally read the saved Logs, invoice history and company balance. Reads used real retained records; 72 mixed-workload reads returned 200. Two temporary keys exercised concurrency limits of eight and two. No unknown result could be force-settled to permit recovery.

## Measured stages

Timing uses the actual client's monotonic clock. Stage throughput includes inference, three reads per caller and the actual upstream round trips. Latencies are milliseconds. Percentiles use nearest rank: with four successful requests, p95 is the maximum sample, not a robust tail estimate.

| Stage | Caller concurrency | Generation attempts / successes / 429 | Successful generations/s | Generation p50 / p95 | Read p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Increasing load 1 | 1 | 4 / 4 / 0 | 0.690 | 1363.4 / 1644.3 | 3.6 / 17.3 |
| Increasing load 2 | 2 | 4 / 4 / 0 | 1.406 | 1287.6 / 1570.0 | 2.9 / 22.9 |
| Increasing load 4 | 4 | 4 / 4 / 0 | 2.622 | 1298.0 / 1475.8 | 3.7 / 14.8 |
| Key limit two, eight callers | 8 | 8 / 2 / 6 | 0.794 | 1410.4 / 2458.4 | 4.2 / 21.3 |
| Recovery, same limited key | 2 | 4 / 4 / 0 | 0.905 | 1405.2 / 3018.1 | 3.7 / 18.9 |

The overloaded key refused six callers before a new attempt; the maximum observed refusal latency was 75.4 ms. Its active count returned to zero, and the same key subsequently completed four requests without removing its limit. This is actual denial and recovery, not a simulated overload response.

Thirty-seven resource samples at approximately 500 ms intervals recorded Gateway RSS up to **47,024 KiB (45.9 MiB)**. The maximum macOS `ps`-reported CPU percentage was 3.6%; sampled cumulative process CPU time increased by 0.19 seconds. That reported percentage is not an instantaneous CPU measurement. Observed PostgreSQL client connections peaked at eleven, with no sampled lock waiter. Sampling is finite and may miss brief peaks; these values are not resource ceilings.

## Independent accounting and final-state verification

A separate reader reopened the final stopped database and a fresh stopped-source copy. It found exactly eighteen new admitted generations and one attempt per new operation, with no retry or alternate dispatch. All eighteen retained confirmed completion and Provider-reported usage. Captured request limits, response quantities, native charges and frozen tariff revisions agree.

Independent exact arithmetic, including configured category rates, upward rounding, fee and minimum, yields **161,371 customer-charge nanounits**. There are eighteen matching charges and eighteen exact negative charge ledger entries. There is no new uncertain execution, open customer hold, funding receipt or unexplained debit. The six denied requests produce no new attempt.

Original financial, credential and model rows remain preserved. The existing procurement budget's spent counter legitimately changes by exactly the eighteen recorded final procurement costs; its internal amounts are not exposed here. This is explicitly excluded from an assertion that every existing financial row stayed byte-identical.

After Gateway restart, scoped Logs and customer CSV match all thirty native attempts and their customer charges. Customer projections contain no Supplier expense, procurement-rate or margin fields. Captured responses are complete and untruncated. Saved response and executable digests were independently checked. Both temporary keys were revoked, and copied Gateway/PostgreSQL processes were stopped.

## Acceptance boundary

The actual run qualifies the bounded 1/2/4-concurrency mixed workload, key-limit denial/recovery, observed resources and exact final accounting. It reports no newly demonstrated implementation defect. It does not establish long-duration soak behavior, machine or database saturation, multimodal throughput, a deployment SLA, Niu-only latency, or a controlled comparison with another gateway. Broader capacity work must retain its own explicit workload, budget and independent accounting evidence rather than extrapolating from these samples.
