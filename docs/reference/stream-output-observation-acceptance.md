# Stream output observation acceptance

This extends [buffered output streaming acceptance](buffered-output-streaming-acceptance.md) with actual nonblocking output observation and parent/child policy composition. It does not close the complete [Guardrails acceptance matrix](guardrails-acceptance-matrix.md) or S04-3.

The actual Gateway binary is `45395e7e01917e0691acc9c6b2f303128390bf6b`. Its retained SHA is independently checked. Reopening the stopped final PostgreSQL copy confirms migration 287 and successful migration flags. An isolated copy uses the saved personal self-funded OpenRouter route, existing approved internal credit and frozen customer tariffs. No cash receipt, commercial Supplier qualification or external detector is created. Original database, configuration and encryption identity remain unchanged.

## Four actual streaming requests

Exactly four actual generations request upstream streaming with maximum output 32 tokens. None is retried, and none opts out of default content capture.

| Actual request | Policy and delivered behavior | Reported input / output tokens | Customer charge, nanounits |
| --- | --- | --- | ---: |
| Chat observation | `observe_only` block rule matches; original marker remains delivered | 19 / 11 | 13,210 |
| Responses observation | `observe_only` redact rule matches; original marker remains delivered | 17 / 9 | 10,988 |
| Chat parent/child composition | Workspace observation matches original output; key-required rule delivers `[REDACTED]` | 18 / 10 | 12,099 |
| Chat under controlled observation-write lock | Original marker and successful terminal stream remain delivered; observation write fails | 19 / 11 | 13,210 |

The total new customer charge is **49,507 nanounits**. All four requests return initial HTTP 200 and complete their actual stream. Native execution is `confirmed_completed`, usage confidence is `provider_reported`, and no customer reservation remains open.

The first two requests each save `matched` / `pattern_match` observation without an enforcement decision. Their original generated marker remains in delivered output; an observation rule's configured block or redact action does not transform delivery. Chat `[DONE]` and Responses terminal usage agree with independently read native quantities.

The third request saves an observation of the original marker and a separate required `redacted` decision. Its delivered content contains `[REDACTED]` and excludes the marker. Independent native bindings verify the workspace policy revision, key policy revision and key assignment revision; accounting records exactly one charge and debit, not separate charges for observation and enforcement.

## Controlled observation persistence failure

Before the fourth request, an independent PostgreSQL session acquires a real `ACCESS EXCLUSIVE` lock on `output_guardrail_observations`. The policy is already saved before locking. The normal bounded recording transaction uses its 250 ms lock timeout; no role or global database timeout configuration is altered.

Saved native SQL activity contains five actual snapshots of the observation INSERT waiting on a lock. PostgreSQL logs report cancellation due to lock timeout, and Gateway logs associate the observation-save failure with this request. The lock is rolled back after complete delivery. Subsequent metadata reads occur after its release.

Independent final reads find **zero observation rows for this request**, including after restart. This is a failed observation record, not successful observation evidence. The actual SSE still delivers its original marker, terminal completion and usage. Its single customer charge, exact debit and released reservation remain valid. This is controlled database persistence-fault evidence, not a genuine upstream failure or proof that every failure mode behaves identically.

## Independent artifacts and limits

The independent reader reopens source and final stopped databases and directly reads final execution, confidence, quantities, charge/debit amounts and cardinality, unreleased reservations, observation/enforcement records and policy bindings. Each request has exactly one charge and one matching negative customer ledger entry. Recomputing from the frozen tariff gives the recorded amounts.

Default captured request JSON equals submitted input. Captured SSE response bytes equal final delivered bytes exactly; captures are complete and untruncated and read identically after Gateway restart. User-provided markers remain in input capture. Pure observation also retains them in delivered response capture; the required-redaction response excludes its marker. Payloads are bounded plain JSON/text, not ciphertext. Safe diagnostics exclude generated markers and procurement fields, and independently decrypted Provider credentials appear in no customer responses, captures or diagnostics.

All original financial rows and complete funding-receipt, Provider configuration and model fingerprints remain unchanged. Three existing credential ciphertexts decrypt under the preserved identity. Source/final role configuration agrees. The temporary verification key is revoked, the controlled lock is released, and copied Gateway/PostgreSQL processes are stopped.

Observation collection and inspection use separate bounded resource pools from required output enforcement. Four observation collection permits and four observation inspection permits limit optional work; lack of collection capacity records indeterminate rather than blocking inference. Side collection retains at most 1 MiB of text and 2 MiB of incoming events, discarding retained content on collection failure. Observations run asynchronously and do not create a second completion or charge. These code limits and resource separation are not saturation or performance qualification.

Actual cancellation, collection/inspection saturation, overflow, tool-output inspection and external-detector success remain unverified by this run. The exercised plain-text Chat/Responses paths and their exact policy composition are the supported evidence scope; frontend UI and other S04-3 paths require separate verification.
