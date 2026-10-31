---
name: niu
description: Use Niu to discover and compare models, inspect request performance and customer charges, and manage model resources within the connected account's actual authority.
---

Use Niu directly rather than asking the person to relay model lists or diagnostics. If the connection is missing or expired, follow the bundled `niu-connect` skill first.

Read [capability entry](references/capabilities.md) to locate the relevant tools and contracts. Inspect current grants and available models before choosing an operation. Declared catalog capability, configured access and verified model behavior are different evidence.

You own task completion and quality/cost tradeoffs. Niu supplies information and controls. For paid comparisons, establish task samples, acceptance criteria and an approved test budget. Preserve uncertain charges; do not blindly retry a possibly charged request.

Only use management operations exposed by the connected tool set and actual grants. A workspace inference credential does not confer pool administration or event-subscription access. When authority is missing, identify the concrete review action in Niu and read back the result afterward. Never retrieve confidential procurement rates or platform margins for customer decisions.

When workspace pool tools are available, use `list_pools`/`get_pool` to retain a baseline, `preview_pool` before an authorized `set_pool`, and read back the saved revision. Configuration preview is not live qualification. Inspect `get_pool_selections` and linked generation diagnostics before changing policy; HTTP success is not task acceptance. On conflict, read and reconcile. Restore prior values using the current expected revision, preserving immutable history. See the shared [pool workflow](references/pools.md) for authority and evidence limits.

For task-specific evaluation, follow the [evaluation workflow](references/evaluations.md). Agree a bounded paid budget, fingerprint effective inputs, pin the task/rubric revision, and bind inference explicitly. Discover existing attempts after an uncertain response before considering another paid call. Record attributed evaluator versions and all outcomes; compare verified matched samples, preserving unknown customer charges, retry costs and shared-operation warnings. Niu does not supply a universal quality scorer or guarantee optimal value.

For resource events, start with direct `list_workspace_events` under events:read; a public receiver is optional. Push requires an authorized destination and events:write. Follow the [event workflow](references/events.md): persist signing credentials privately, queue a targeted test, inspect acknowledgement, deduplicate stable event identity and reconcile failures. A queued notification does not establish delivery, host wake or task success. Never print or commit the signing-secret file returned by MCP.
