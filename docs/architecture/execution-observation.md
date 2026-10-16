# Historical execution observation contract v1

Status: archived interchange contract and retained storage history. The current Gateway does not expose external execution-record import, read, delete, cohort or paired-benchmark APIs. The dashboard does not provide these task-investigation workflows. External orchestration products own task execution and acceptance; Niu observes requests it handled. See [product focus](../product/product-focus.md).

Retiring the public workflow does not delete historical rows, referenced attempts or ledger entries. Do not deploy the removed analyzer or an unscoped replacement. Library types retained under `niu_execution::observation` describe compatibility data, not an available customer ingestion service.

## Historical record semantics

`ExecutionRecord` is a metadata-only record for one observed task. Schema version 1 distinguishes containment, delegation, dependency, retry and resume. Its graph model includes tasks, agents, steps, model/tool invocations, attempts, validation, human intervention and checkpoints. Multiple paths to shared work must not become multiple executions or charges.

A legacy ingestion boundary had to derive tenant scope from authentication, validate the bounded graph and namespace record identities by tenant and source. Identical source/record content represented a replay; conflicting content could not be silently merged. These historical semantics do not authorize new import requests against the current Gateway.

A record's declared source coverage is an assertion, not proof of comprehensive observation. Missing timestamps and model identities remain unknown. Agent completion claims, deterministic validation and human acceptance have different authority. None establishes a task outcome merely by being present in an imported record.

The strict interchange shape excludes prompts, source code, tool output and credentials. Identifiers can still contain sensitive content; retaining the schema does not grant permission to publish historical records.

## Historical charge references

Imported charge references asserted a relationship to canonical scoped attempts. Matching a reference to a ledger entry did not prove that an attempt belonged to that external task. Missing references, unpriced work, tool charges, subscriptions and allocations prevented a complete task-cost claim. Currencies remained separate, and unresolved references could not become zero or disclose another tenant's records.

Historical metadata is not a second ledger and cannot create or settle customer charges. Current accounting and request diagnostics must come from Niu's canonical saved requests and financial APIs. There is no current administrator task-cohort endpoint or supported import CLI; the archived format is not an integration recommendation.
