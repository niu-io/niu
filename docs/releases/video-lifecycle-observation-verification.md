# Video lifecycle observation checkpoint

Reviewed 2026-10-07. Timing API/storage/SDK subset only; V16 and overall release gates remain open.

Public and signed-in dashboard timing reads now include the durable submission-intent timestamp, first-observed status timestamps and an explicit conflicting-terminal flag. They use the existing workspace/model-scoped job authorization. The projection contains no upstream references, result URLs, credentials or procurement values and performs no upstream request or accounting mutation.

The source is `gateway_observation`. Polling latency separates a first observation from an actual Supplier transition. Queue/run durations are not invented from these timestamps. Repeated observations retain their first timestamp; missing statuses stay absent, and success/failure contradictions remain visible. Existing bounded transport spans retain their separate semantics.

Fresh evidence:

- Twelve PostgreSQL media-job tests passed. The new lifecycle scenario checks missing observations, duplicate preservation, store reconstruction, terminal contradictions, denied model access and exclusion of internal/upstream job references.
- All 142 SDK tests passed; the timing client preserves lifecycle provenance and observations through the existing read-only GET.
- Storage Clippy passed with warnings denied; OpenAPI resolves 161 local references; public-boundary and scoped whitespace checks passed.

No schema migration or UI change was required for this increment. The rendered lifecycle waterfall, qualified Supplier-reported timings, full Logs/Usage/Billing traversal and live video-channel acceptance remain pending. Existing observation timestamps are not rewritten or retroactively made more precise.


## Rendered observed waterfall

The Video result Status tab now shows observed time before running and between
running and a terminal observation, with observed completion elapsed time. It
states that polling delay is included. Missing transitions do not get invented
bars; contradictory terminal statuses and out-of-order running/completion
observations suppress the breakdown. Existing transport spans remain separate.

All 46 affected Video/Chat tests passed, including the saved-job integration,
missing observations, conflicts and out-of-order evidence. Dashboard type checking
passed. The production lifecycle component was reviewed at 1280-pixel desktop
and 390-pixel narrow widths in an isolated fixture, including terminal conflicts;
the narrow content width matched the viewport without overflow. The supplied
request-timeline reference and existing Niu timing surfaces informed the bars.
Temporary review files were removed; no synthetic production job was created.
The actual signed-in Video route continues to show the honest no-route state.

This completes the rendered observation subset only. Exact Supplier queue/run
timing, live generation and full Logs/Usage/Billing diagnosis remain open.
