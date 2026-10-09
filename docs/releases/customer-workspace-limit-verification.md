# Customer workspace spending-limit checkpoint

Reviewed 2026-10-07. Partial F05/F09 and M05–M08 implementation; the rendered lifetime-limit form is locally verified; complete workflow qualification remains open.

## Implemented boundary

Customer workspace limits use only posted customer charges, their linked refunds and active customer balance reservations. Procurement budgets and Supplier rates are separate. Limits are per workspace and account currency, without an assumed currency conversion or monthly reset.

The shared balance-reservation path serializes admission and limit changes on the customer account. A database trigger also checks alternate reservation insertion paths. Already-posted debits replace their hold in committed spending rather than counting twice. Settlement of an existing obligation remains authoritative; the limit governs new admission and does not erase liability.

Storage configuration requires an expected revision. Limits cannot be lowered below committed spending; their workspace/account/currency cannot be reassigned. Confirmed nonexecution releases held capacity; uncertainty retains it. A limit is independent of the company's balance and approved credit. Insufficient workspace capacity returns a distinct `workspace_spending_limit_exceeded` error.

Limit revisions now have append-only history and bounded, scoped revision pagination. Upgrades preserve only the known current revision as a migration baseline with an unknown timestamp; they do not invent earlier changes. New successful changes record their actual time. Failed configuration changes do not create history. Authenticated management now records member or installation attribution atomically; member names are snapshotted and internal member IDs remain private. Older/unattributed records remain unknown.

The workspace Spending tab now shows available account currencies and allows scoped owners or installation administration to set a lifetime limit. Readers see committed spending without configuration actions. Zero is supported; lower-than-committed amounts are rejected, conflicting writes require a reload and backend failures do not expose their raw diagnostic body.

## Local verification

| Scope | Recorded acceptance evidence |
| --- | --- |
| Shared reservations | The concurrent fixture admits five of sixteen 10-unit reservations under a 50-unit limit despite 1,000 units of funding. It covers optimistic changes, lower-limit rejection, SQL bypass denial, confirmed-unsent release, fresh-Store reads and independent workspace holds. The latest storage run passed 12 media-job and 16 media-pricing tests. |
| Video gateway | Five video tests passed. Prepaid API/dashboard fixtures reject a 20-unit reservation under a 19-unit limit with no egress or saved hold; raising the limit allows settlement and uncertain-liability recovery. |
| Text gateway | The fresh prepaid fixture passed for buffered Chat Completions and native Responses. Both reject the qualified 30-unit bound despite ample company funding without egress, new charges or held capacity. Raising the limit admits each protocol; Responses returns the upstream output, adds exactly the expected four-unit customer charge and leaves no active reservation. Committed spending matches posted customer ledger charges. Streaming, embeddings, other protocol paths and mixed real text/video concurrency remain unqualified. |
| History and upgrade | The storage fixture verifies unknown baseline dates, subsequent timestamps, revision pagination, stale-update rollback, workspace/currency isolation and immutable history. This is database upgrade evidence, not packaged restore. |
| Management and attribution | One fresh PostgreSQL API test passed owner/admin/viewer permissions, inference-key rejection, foreign-workspace denial, exact input validation, stale revisions and customer-only history. The scoped currency collection returns exactly currency, nullable limit/revision and this workspace’s committed amount; it excludes company funds. Unconfigured and configured collection responses were verified for scoped members. Saved member names survive renaming; internal member IDs are excluded and older attribution remains unknown. |
| Customer dashboard | The running product was inspected at desktop and 390px against the previously inspected OpenRouter inline workspace-budget pattern. A separate verification workspace saved zero, revised it to USD 20.000000001 and retained the exact value after reload. The default workspace policy was not changed. Cancel and edit states were inspected. TypeScript and 21 focused billing tests passed; tests cover read-only actions, malformed amounts, lower-than-committed rejection and conflict reload without write retry. No production inference or packaged restore is implied. |
| JavaScript client | All 143 tests passed, including exact integer strings, request methods/scope, cancellation and zero-network validation failures. See the [management API reference](../reference/workspace-spending-limits.md). |

Gateway/storage Clippy with warnings denied, public-boundary and scoped whitespace checks passed. Rendered revision history and complete live/packaged qualification remain open; no release gate is closed by these fixtures.

## Remaining acceptance

- Rendered revision history/diagnosis and complete real workflow role/isolation checks. Scoped management API and JavaScript client have local evidence.
- Packaged migration/restart/restore, production member workflows and complete real text/video qualification.
- Separate qualification of any future period/reset policy; the implemented lifetime mechanism does not imply recurring limits.
- Keep legacy procurement budgets fail-closed for video. This customer mechanism does not implement media inspection or qualify a live Supplier.
