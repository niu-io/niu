# Dashboard Video access checkpoint

Reviewed 2026-10-07. This is a local authorization/API/SDK checkpoint, not a live video or rendered customer workflow qualification.

The signed-in dashboard can select an active workspace API key for video estimates, submission, saved history/status/billing/timings and explicit query refresh. It shares Chat's central session authorization and resolves the key's current model grants without returning or requiring its secret. Saved reads and estimates require read permission; submission and refresh require write permission. Public inference routes remain unchanged. Refresh queries the original job and never resubmits generation.

Five PostgreSQL gateway video fixtures passed. The prepaid scenario runs separately through the public API-key path and the ordinary Owner session bridge: successful estimates, insufficient-balance rejection before egress, bounded reservation, immutable output and pricing, restart recovery, exactly-once settlement, key replacement and uncertain submission all retain their assertions. Viewer estimates return the same customer estimate without dispatch or reservation. Dashboard billing matches the customer-safe public projection. Workspace Viewer reads, denied Viewer submission/refresh, foreign-workspace denial, changed model grants, revoked selected keys and key-secret absence are also checked. The dashboard Chat authorization regression also passed after extracting the shared authorization helper.

JavaScript admin client methods preserve tenant/key/job references, bounded history pagination, cancellation signals and explicit request methods without implicit retries. SDK tests verify these properties and invalid-reference rejection. OpenAPI includes the seven matching operations.

Still open: successful dashboard-session estimate/submission on a qualified live channel, customer capability discovery, rendered Video controls/results, media safety, live and packaged recovery acceptance. No release gate is closed.

Gateway Clippy passed for all targets with warnings denied. The new fixture uses an isolated PostgreSQL database and local upstream transport; no live Supplier generation or customer funding occurred.
