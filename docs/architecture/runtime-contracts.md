# Runtime contracts

Status: proposed. These contracts guide implementation and are not claims about a shipped runtime.

## Authorization and policy

Each scope may grant access to several models, but organization, project, API key, and request scopes narrow one another by intersection. An empty allowed set denies all access. Inherited policy and explicit empty policy are distinct states. The request cannot widen an inherited restriction.

Required policy decisions use `allow`, `deny`, or `indeterminate`. Timeouts, evaluation failures, missing inputs, and unsupported policy revisions are indeterminate and block dispatch. Optional enrichment cannot override a required denial.

A decision binds the tenant, request, attempt, protocol, content digest, provider offer, policy revision, stage, and expiry. Content transformation creates a new digest and requires another capability, output-limit, and budget check.

## Content checks and streaming

Each protocol and adapter combination declares which text, candidate, tool-argument, visible reasoning, multimodal, control, and terminal events a policy checks. An unrecognized content event cannot bypass a required check merely because it contains no extracted text.

Windowed output checking withholds the current window until it passes. Content already released cannot be recalled, and bounded overlap cannot promise arbitrary full-response context. Complete-response checking buffers the whole bounded result and increases latency and memory. Exceeding its limit fails explicitly; it cannot silently fall back to windowed checking.

A required policy failure blocks new output and cancels upstream work when possible. Already incurred provider cost remains subject to the accounting rules.

## Configuration and revocation

File-based and API changes use the same schema validation and compilation path. Publish an immutable complete snapshot only if the source generation has not changed during compilation. Failed compilation leaves the previous snapshot active.

Each request uses one pinned snapshot. A live database check handles key, permission, and offer revocation at admission. Revocation and admission serialize through the same authoritative state. Once revocation commits, new admissions must reject. Already admitted work may remain in flight and cannot be recalled reliably.

## Retry and resource limits

A retry requires a replayable bounded request body, a classified failure that permits retry, uncommitted client response, current authorization and policy approval, a new valid budget reservation where necessary, and remaining deadline and retry capacity. SDK-level hidden retries are disabled.

Bound request bytes, response bytes, event size, tool payload, queue length, per-request buffered data, and aggregate instance memory. Apply deadlines to queueing, policy evaluation, database admission, provider connect, first response, idle stream, and total duration. Cancellation closes provider work and waits only within the shutdown bound.

## Durable state and recovery

Track execution certainty, client delivery, and financial settlement as separate dimensions. Record intent before provider dispatch, while preserving that a database commit cannot be atomic with a remote network call. If provider execution is uncertain after a crash, do not infer that retry or refund is safe.

Commit durable business changes and outbox events together. Consumers deduplicate event IDs. Local locks can protect in-process work but do not replace durable idempotency or recovery.
