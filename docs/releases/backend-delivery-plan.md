# Backend delivery plan

Baseline v1, 2026-10-12. This plan is now driven by the
[top-down project assessment](project-assessment.md) and the
[fixed subsystem status board](project-status.md). It supersedes the earlier
serial endpoint-audit-first plan. Product scope remains governed by
[product focus](../product/product-focus.md) and
[first release requirements](first-release.md).

## Current progress

- 14 subsystems have fixed ownership, dependencies, acceptance IDs and states.
- 12 backend/integration subsystems contain 36 acceptance checkpoints.
- 11 checkpoints carry bounded actual evidence at their recorded revisions;
  25 remain open. No whole backend subsystem is closed.
- Frontend/catalog/Help is delegated; packaging and legacy/extension work is
  separately assigned or deferred. These are not silently counted as complete.
- Progress is acceptance coverage, not coding percentage or full release readiness.

The machine source of truth is [project-status.json](project-status.json).
Run `python3 scripts/render-project-status.py --check` for board consistency,
not runtime acceptance. Change scope only through a versioned reason; do not grow
completion criteria silently or repeatedly replace the plan.

## Delivery sequence

| Milestone | State at baseline | Exit |
| --- | --- | --- |
| D0: top-down assessment and status baseline | Recorded by this delivery | Architecture, ownership, common facilities, gaps and stable acceptance IDs published |
| D1: contracts and common facility alignment | Open | Pending route decisions resolved; core handler/SDK/spec gaps classified or fixed; single shared-file/migration owner assigned |
| D2: parallel subsystem completion | Open | A/B/C lanes close their fixed checkpoint IDs with cohesive implementations and actual evidence |
| D3: integrated business acceptance | Open | Core supported journeys preserve authorization, persistence, exact accounting and safe customer reports across restart/failure |
| D4: performance and backend handoff | Open | Measured workload/overload/recovery limits, reconciled final artifacts and pushed integration baseline |

## Parallel ownership

- Lane A: identity/workspaces, Suppliers/catalog, keys/Guardrails, platform config.
- Lane B: inference/routing, pricing/ledger/reconciliation, payment integration.
- Lane C: request diagnostics, video/assets, durable Chat.
- Lane I: shared routes/contracts/SDK, migrations, integration and operations.
- Frontend owner: dashboard/catalog/rendered docs and actual browser acceptance.

Dependencies mean stable interfaces; existing modules can be developed in
parallel. Use isolated worktrees/databases and a sole publisher for shared files.
Publish reviewable increments to main for frontend pull. No workers are launched
merely by recording the plan.

## Completion and reporting

Each report states milestone, stable task IDs completed, their evidence and
commit, remaining blockers and next assigned task. Mark a subsystem done only
when every fixed item is done. Reopen only with contrary actual evidence.

Fixture outcomes have zero acceptance signal. Static CI/build/contracts do not
prove a business journey. Use current-input end-to-end runs and independently
inspect final saved responses, database state and media/export artifacts.
Reuse valid unchanged evidence; do not repeatedly purchase upstream calls for
unchanged paths. Missing quantities remain unknown.

External merchant activation, discounted supply agreements and advertising
claims have separate evidence. Supported adapter capability does not require all
merchants/providers to activate. Personal OpenRouter testing is not commercial
supply. Preserve existing databases, secrets, encryption identity and other
sessions' changes. Frontend/UX, container/image acceptance and Agent Observability
remain outside this machine's implementation scope.
