# Niu 0.3 local worktree integration

Dated source reconciliation, 2026-11-01; release tracking: `niu-2pu`.

The release branch includes the product-quality, Collector publication and
Collector registry-verification branch histories. Their old dashboard locations
were reconciled into `apps/dashboard/app`; removed Console and personal-ingestion
routes were not restored. Collector documentation now states that its legacy
telemetry contract is unavailable on Niu 0.3. The current model-management plugins
have separate native packages and shared authorization contracts.

The remaining demo-role worktree draft is preserved as commit `6aff13675`.
Its role-selection requirement is superseded by the backend-enforced account-role
implementation (`dd0b6a018`) and menu-choice integration (`fe4e3bffd`):

- `AccountMenu` shows available User/Admin roles and waits for confirmed server
  state before dismissing the choice.
- Dashboard context carries the available/active role and async role switch;
  effective authority is server-defined rather than a browser-only demo flag.
- Navigation and cached authority follow the effective session after a role
  change, preserving customer workspace scope.
- The draft's unconditional demo-email administrator grant is intentionally not
  restored. Explicit administrator eligibility and audited session activation
  remain distinct from authentication and demo presentation.

The draft history is retained through an ancestry merge; its stale frontend files
are not resurrected. This is an explicit supersession, not a claim that the old
implementation was copied unchanged. Other existing clean brand/UX worktree
commits were already ancestors of the integrated source. No worktree is deleted
or pruned by this reconciliation. Private development/runtime changes are kept
and validated in the enterprise repository, never copied into the public tree.
