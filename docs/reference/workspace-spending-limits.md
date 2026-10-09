# Customer workspace spending limits

These lifetime limits govern customer retail charges and held liability in one account currency. They do not fund the company account, grant credit, change Supplier prices or replace procurement budgets. No monthly reset or currency conversion is implied.

Management uses authenticated member sessions, not inference API keys. Scoped readers can inspect limits and history; only scoped owners or installation administration can change them. The existing API contract uses `projects` for workspaces.

| Method | Route under `/admin/v1/organizations/{organization}/projects/{workspace}` | Result |
| --- | --- | --- |
| GET | `/spending-limit` | Account currencies with this workspace’s committed amount, nullable limit and nullable revision; excludes company funds and other workspaces. |
| GET | `/spending-limit/{currency}` | Current limit, revision and committed customer amount, or `data: null` when unconfigured. |
| PUT | `/spending-limit/{currency}` | Create or revise the limit using exact `limit_nanos` and `expected_revision` strings. |
| GET | `/spending-limit/{currency}/history` | Scoped revision history; optional `before_revision` and `limit` (1–100). |

For an account in CNY, this sets a ¥20 limit when no limit exists:

```json
{"limit_nanos":"20000000000","expected_revision":"0"}
```

Use the returned revision for the next change. Stale revisions conflict without automatic retry. Negative, fractional, exponent, whitespace and out-of-range amounts are rejected. A limit cannot be lowered below committed spending.

Committed spending includes posted customer charges minus their linked refunds, plus active reservations that have not already been replaced by a posted charge. Requests reserve qualified maximum liability rather than a displayed estimate. Insufficient workspace capacity returns HTTP 402 with `workspace_spending_limit_exceeded`; insufficient company funds remain a separate error. Confirmed nonexecution releases held capacity. Uncertainty does not establish a refund or release.

History returns exact amount/revision strings and `recorded_at`. An upgraded `migration_baseline` has an unknown timestamp and records only the known revision. New `configuration` revisions have their actual time. `next_before_revision` is an exclusive cursor; a final full page may lead to an empty next page. New authenticated management changes include `actor_kind` and a saved `actor_name`. Member display names are preserved at the time of change; installation administration is labelled separately. Older or unattributed changes remain `unknown` with no invented name. Internal member IDs are excluded from responses.

The JavaScript client's `listWorkspaceSpendingLimits`, `getWorkspaceSpendingLimit`, `setWorkspaceSpendingLimit` and `listWorkspaceSpendingLimitHistory` preserve exact integer strings and support cancellation. The workspace Billing → Spending tab provides owner/installation configuration, exact amounts including zero, committed spending, conflict reload and read-only member access. It does not expose company balances. Rendered revision history and complete packaged qualification remain pending.
