# Workspace retention explanation — 2026-11-18

Tracking: `niu-5il0`; related hosted creation verification: `niu-vn14`.

## Observed behavior and diagnosis

On hosted core `2a4dfb858fba5c94e8d3c466bf0e300ff5108313`, a newly created
workspace with a zero customer spending limit could not be deleted even though
it had no requests or keys. The interface did not explain that limit changes
count as retained records and displayed the backend rejection in English in the
Chinese interface.

The rejection itself preserves the documented immutable actor-history contract.
The creation form writes customer spending-limit configuration, which records
`customer_workspace_limit_history`. Its immutable trigger prohibits deletion;
foreign keys retain the related workspace. This is not merely an unused legacy
`project_budgets` row. The initial proposal to delete this configuration was
rejected after inspecting that contract. No storage protection, migration or
historical record was changed.

## Correction and actual verification

The creation form and both spending-limit editors now explain before saving that
limit history prevents workspace deletion even without requests. The deletion
section names this restriction, and the existing protected-deletion error is
translated into Chinese with explicit assurance that no data was deleted.

The actual candidate dashboard was run against staging APIs using the retained
workspace from the hosted creation run. A real deletion attempt was rejected.
Independent spending-limit history reads immediately before and after returned
identical data: revision 1, configuration source, zero limit. The Chinese error
named retained records including spending-limit history. Cancel remained usable.

Inspected the real deletion failure at 390×844, limit-edit dialog at 1440×900,
and create-workspace view at 390×844. The explanations wrap inside their existing
containers; cancellation and submit controls remain reachable. The narrow
creation view contains one Settings dialog and has a document width of 390 px,
without horizontal overflow. The existing visual hierarchy and components were
preserved; this is a copy correction, not a new layout. The credit-unit editor
uses the same explanation, but its rendered configuration was not exercised in
this monetary staging workspace.

The applicable UX criterion is explaining constraints before an irreversible
configuration consequence and giving an understandable failure reason, supported
by [NN/g error prevention and recovery heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).
The data-retention authority is Niu's existing
[backend capability contract](../product/backend-capability-checklist.md), not a
new restriction introduced by this repair.

Dashboard type/lint checks completed. Fixture outcomes are not evidence. No
limit was changed and no new workspace was created during this copy verification.
The original zero-limit verification workspace remains intentionally retained
with its immutable audit record. The temporary loopback session was removed and
local servers stopped. Hosted acceptance of this new copy remains pending.

## Merged hosted acceptance

On deployed core `3f949559156ff2499a900e6890b3e29ed6ed4dde`, the retained
zero-limit workspace was revisited through its actual settings page. The deletion
section and monetary limit editor both displayed the Chinese audit-retention
explanation before any save or deletion attempt. Cancelling the limit editor
restored focus to Edit USD spending limit and did not change configuration.

An actual browser deletion attempt returned HTTP 409. Its dialog displayed the
localized retained-record explanation and stated that no data was deleted.
Independent history reads before and after were byte-identical, and the workspace
remained available. Cancellation restored focus to Delete workspace. No audit
history or storage protection was bypassed.

The real create-workspace dialog also displayed the advance explanation before
saving a limit. Its 390-pixel layout contained exactly one dialog and had a
390-pixel document width. The desktop limit editor and narrow deletion-error
state were visually inspected: explanations wrapped within their containers and
both primary and cancellation actions remained reachable. The create view was
cancelled without creating another workspace. These current hosted observations
complete the scoped copy and protected-deletion acceptance for `niu-5il0`.
