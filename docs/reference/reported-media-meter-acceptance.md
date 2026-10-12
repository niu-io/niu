# Reported media meter and settlement acceptance

This S08-3 checkpoint distinguishes actual reported usage from pricing, liability and posted customer settlement. Positive priced-media settlement and competing priced-media liability remain unverified. The finite backend-capability completion boundary below separates implemented mechanisms from actual integrated execution.

## Actual current-input read and recovery

A stopped copy of the genuine completed FastRouter Seedance 2.5 task was opened with native `8bfdef10003eebe9402401247aa52cd69d3a398f`, SHA-256 `6f5290d182c9bf51de1f2bb8d469067351c9f9771150235adc2917b1d39c6900`, schema 293. The public compiled JavaScript SDK was `ce97f3b0116570dfd2a487b802d2d2de18efbf39`. Both payment and video polling were explicitly disabled. Only local saved-job GET operations occurred: no Provider query, generation, result download, asset mutation, pricing change or original-database write.

The SDK's `video.jobs.retrieve`, `video.jobs.observations` and `video.jobs.billing` returned the genuine saved success, explicit reported meter `video_tokens` with quantity `257277`, and owner-funded billing respectively. The reported quantity is represented as a decimal string. Billing retained null usage, price and customer charge because this attempt has no configured customer tariff or output estimator. It did not convert a reported token count into a billable amount. Restart preserved the same observation and billing projections. The temporary key was revoked and the copied Gateway and PostgreSQL were stopped.

A separate verification reopened source and final PostgreSQL databases. It directly compared the canonical query evidence containing the reported quantity, all task/status/result records, pricing/usage/liability/output snapshots, customer charges/debits/reservations/funding, Supplier earnings and original Provider/model/ownership records. All fingerprints matched. For the exercised attempt, customer pricing, priced usage, liability bound, effective output snapshot, customer charge and customer reservation were absent. The final key was revoked. These are current native-state checks, not assertions copied from the producer's summary.

The original [generation and result checkpoint](fastrouter-documented-video-acceptance.md) separately records the genuine upstream generation and decoded artifact. Its reported completion tokens establish a supported reported meter; the file's duration, frame dimensions and codec do not establish a tariff, billable seconds, price or contractual liability.

## Implemented mechanism and its evidence boundary

| Capability | Source mechanism | Actual acceptance here |
| --- | --- | --- |
| Reported video tokens | Direct query decoder accepts explicit successful `usage.completion_tokens`; canonical query metadata stores the meter and quantity. | Genuine nonzero saved quantity is returned by current SDK observations and retained across restart. |
| Missing or invalid quantity | Explicit missing/invalid query states; no inference from file duration or output dimensions. | Earlier linked unpriced query records retain their own scopes; no new missing-quantity generation was performed here. |
| Estimates | Configured `SeedancePixelsV1` or `OutputSecondsV1` creates an explicitly labelled estimate. | Source capability only in this checkpoint; no estimator was added to the genuine task. An estimate is not a contractual maximum. |
| Customer liability | Immutable attempt tariff plus an explicitly qualified maximum quantity; account/attempt locking and a durable balance reservation. | Implemented source path; no nonempty qualified priced-media admission or cross-Gateway contention proved here. |
| Exact customer settlement | Requires successful completion, one distinct agreed reported meter/quantity, original immutable pricing, exact rational calculation and matching currency. Charge/debit posting and hold release share a transaction. | Implemented source path; no customer media receipt or debit was fabricated. Positive exact media settlement remains unverified. |
| Unknown or conflicting settlement | Missing/conflicting/unpriceable usage remains unresolved; insufficient funds commit the immutable liability while retaining its hold. Replays do not reprice an existing debit. | Implemented source paths; priced unknown/overrun/funding recovery and duplicate races remain unverified here. |

The source review covered `crates/media/src/query.rs`, `crates/media/src/output.rs`, and `crates/storage/src/media_jobs.rs` / `media_pricing.rs`. It found no demonstrated defect requiring a source change in this bounded read. Source inspection establishes implemented contracts, not executed settlement correctness. Fixture outcomes provide no evidence.

## Finite remaining acceptance

The remaining priced-media checks are: admission against a genuine authorized immutable customer tariff and contractual liability bound; exact settlement from the same task's trustworthy reported meter; duplicate/restart cardinality and hold release; insufficient-funding or conflicting-quantity recovery; and competing admissions sharing the same account capacity. These require genuine eligible pricing and task evidence, not fabricated commercial qualification, appended prices on an already owner-funded task, or a replacement funding receipt.

[Media invoice integration](media-invoice-integration.md#atomic-query-usage-persistence) explicitly retains its unverified positive priced-usage branches. This record does not substitute owner-funded success for those branches or require external merchant activation to implement the system's interfaces. Additional media meters need their own explicit adapter-reported quantity contract; duration-based extrapolation is not a substitute.

## Finite implemented-or-verified capability boundary

The fixed S08-3 criterion is:

> Implement or verify supported reported media meters, bounded liability and exact settlement; missing quantity remains explicit and never inferred from file duration.

Source review finds these Niu-side facilities implemented: immutable attempt
pricing, explicitly qualified maximum liability, account/attempt locking and
reservation, successful reported-meter validation, exact rational calculation,
matching currency, transactional charge/debit/hold release, and settlement replay
against the existing posted-charge predicate. Missing/conflicting quantities stay
unresolved; insufficient funding preserves immutable liability and its hold.
The financial recovery worker calls the same settlement transaction independently
of optional video polling. These are inspected implementation findings, not
positive integrated settlement or contention outcomes.

The genuine current-input evidence above separately verifies nonzero reported
`video_tokens=257277`, durable query evidence, current SDK observations and
restart, alongside explicit owner-funded/null-price/null-charge state. It does
not retrofit a tariff or contractual maximum onto the existing task, infer a
quantity from its file, or manufacture commercial rights or a funding receipt.

Under the criterion's **implement or verify** wording, the finite backend
capability consists of those implemented liability/settlement/recovery contracts
and the separately observed supported meter and safe unknown-price behavior.
No missing implementation is demonstrated by this audit. Positive priced-media
settlement, insufficient-funding recovery, duplicate races and competing priced
admissions remain **unverified**; implementation review is not relabeled as their
correctness proof. External merchant or Supplier activation is not an additional
backend-readiness gate. The release checkpoint owns S08-3 status.

S05-3 retains a stricter integrated-evidence gap. Its genuine twelve-charge
customer invoice, historical customer serialization and Supplier authorization/
refusal slices are recorded in
[the customer/Supplier checkpoint](customer-invoice-supplier-capability-acceptance.md).
Supplier accrual and settlement source mechanisms are audited, but nonempty
Supplier earning/settlement and positive customer-media invoice behavior remain
unverified. Empty history and refused settlement selections do not prove those
positive paths. This gap is not a requirement to execute a bank transfer, qualify
a fictional Supplier or test every mathematical combination. S05-3 remains
separately tracked; no source, records, external calls or fixture evidence are
added by this documentation boundary.
