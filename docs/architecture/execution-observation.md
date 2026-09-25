# Execution observation contract v1

Status: initial typed contract and validation fixture; ingestion and investigation UI are not implemented yet.

`niu_execution::observation::ExecutionRecord` is a metadata-only interchange record for one observed task. Schema version 1 is explicit. An ingestion service must obtain tenant scope from authentication, validate the record before persistence, and namespace record/span/charge identifiers by tenant and source. A payload cannot assign its own tenant. Matching source/record IDs with identical contents are a replay; conflicting contents must be rejected rather than silently merged. Persistence must enforce these rules; the current type alone does not implement ingestion.

Spans distinguish tasks, agents, steps, model/tool invocations, attempts, validation, human intervention and checkpoints. All graph links point from parent or prerequisite to child or dependent. Containment, delegation, dependency, retry and resume are distinct. Shared work can have multiple incoming links. Consumers must not turn multiple paths to a span into multiple executions or charges. Validation bounds record size, rejects duplicate identities, dangling edges, negative/reversed intervals and cycles, and uses iterative traversal to avoid recursive-stack exhaustion.

Coverage is complete, partial or unknown as reported by the collector; it is not proof of comprehensive observation. Missing timestamps remain absent. Task wall-clock latency comes from the task's observed interval, not the sum of parallel span durations. Cross-source clock uncertainty still needs a future clock/provenance extension; this version must not claim precise cross-clock comparisons.

Requested and reported model identities are separate. A missing reported model must remain unknown. Outcome evidence identifies its authority: an agent claim, deterministic validator or human acceptance. An accepted agent claim is not equivalent to an accepted task. Conflicting evidence remains visible; the benchmark acceptance policy must resolve it explicitly.

Charge references point to canonical scoped accounting records. The helper returns unique references, not a monetary total. Missing references, unresolved references and absent tool/resource costs cannot become zero. No duplicate ledger is introduced by this record. Invoice fees and allocated shares require distinct attribution rules before aggregation.

The strict schema has no prompt, source-code, tool-output or credential fields and rejects unknown fields. Collectors must still avoid putting sensitive content into identifiers. Raw replay artifacts require separate opt-in storage and retention controls. Importing or viewing a record cannot execute work, reset quotas, change subscriptions or invoke an optimizer.

The synthetic `contracts/fixtures/parallel-task.v1.json` covers parallel agents, tool work, retry/resume links, human intervention, unknown actual model identity and a completion claim contradicted by validation. Shared charge references are counted once, and the task lasts 100 ms despite overlapping work. This is contract evidence only, not a connected collector, rendered timeline or complete benchmark.
