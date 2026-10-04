# Codex session traces verification

Verified on October 4, 2026. This milestone covers metadata-only native Codex collection, durable session assembly, and trace investigation. Subscription valuation, reasoning-token accounting, and full first-release qualification remain separate acceptance work.

Native model completions and tool events share a hashed session correlation key with plugin lifecycle hooks. Source conversation and call identifiers are hashed locally. Prompts, outputs, tool arguments, and arbitrary attributes are discarded. When native collection is enabled, tool hooks do not emit duplicate tool observations.

The backend keeps immutable event receipts and assembles owner-scoped session projections under a connection lock. Identical retries are idempotent; conflicting reuse cannot rewrite evidence. Sessions exceeding the span or payload limit continue in numbered parts. Deleting a projection deletes its associated receipts. Historical uncorrelated fragments remain available through an explicit toggle and do not inflate default session reports; superseded fragments do not double-count merged sessions.

Native event timestamps take precedence over an unset OTLP timestamp. Completion-only model events retain an unknown start and duration. The session duration is an observed activity window, and does not imply successful task completion.

The inspector was compared with the signed-in AgentOps trace view and the [Langfuse demo](https://langfuse.com/docs/demo). It uses compact typed steps, a shared time axis, completion markers, zoom around the selected event, and a separate details surface. Browser verification covered 1280 × 800 and 390 × 844 viewports, Timeline/Tree selection, zoom/reset, retained-event filtering, and horizontal overflow. The usage footer no longer overlaps the step list.

Validation:

- Collector: 21 passing tests, including installed Codex native export and plugin hooks across ordinary sessions.
- Storage: 3 passing session-projection unit tests and 4 passing PostgreSQL integration/schema tests, including concurrent ingestion, retry conflicts, continuation parts, owner isolation, deletion, and legacy-fragment reporting.
- Console: type checking and 7 passing Agent Observability tests, including completion-only selection and zoom without invented timing.
- JavaScript SDK: type checking with the optional session correlation field.
- Current-machine receiver: healthy after upgrading the local package; pending filtered telemetry flushed successfully.

Collector 0.1.1 is installed locally. Its npm publication remains subject to npm's separate two-factor authentication; local installation does not establish registry availability.
