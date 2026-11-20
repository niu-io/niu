# Branch model and production promotion

Niu keeps one integration branch per minor release line. `main` is production and
receives only code that passed staging acceptance on the release branch. This
replaces the earlier practice of tagging releases directly on `main`.

## Branch roles

| Branch | Role |
| --- | --- |
| `release/<minor>` (for example `release/0.3`) | Integration and staging branch for that minor line. Feature work starts here and merges back here. Release tags (`v0.3.0`, `v0.3.1`, ...) are created on its tip. |
| `feat/*`, `fix/*`, `codex/*`, `worktree/*` | Short-lived work branches cut from the current `release/<minor>`, merged back into it, then deleted. |
| `main` | Production. Updated only by merging `release/<minor>` after staging acceptance. It never receives feature branches directly. |

`release/<minor>` is a maintained line, not a one-off branch: patch releases for
that minor continue on it until the next minor branch replaces it.

## Flow

1. Branch from the current `release/<minor>` and keep the change scoped to its task.
2. Open a pull request into that branch. The public checks (`ci.yml`,
   `backend.yml`, `contracts.yml`, `docs.yml`, `sdk.yml`) must pass.
3. Merge into `release/<minor>` when reviewed, then delete the work branch.
4. Deploy the exact `release/<minor>` tip to staging and run the staging
   acceptance scope. Record commit-bound GREEN evidence; passing unit tests,
   fixture diagnostics or a local build does not qualify staging.
5. Tag the accepted commit on `release/<minor>` as `v<minor>.<patch>` and publish
   the release from that tag.
6. Merge `release/<minor>` into `main`. That merge is the production promotion.

## Rules

- Do not commit product changes directly to `main`. Do not force-push `main` or
  `release/<minor>`.
- Rebase only branches that nobody else has based work on. Shared branches take
  merge commits.
- A published release tag is immutable. Ship corrections as a new patch version;
  do not move or recreate the tag.
- Start the next minor line as `release/<next-minor>` rather than reusing an old
  branch name.
- Delete branches after merge. Keep deliberate archival snapshots under an
  explicit name with a README explaining why they are retained.

## When to verify published artifacts

Before tagging, run the hosted staging journeys and the installation, upgrade
and restore checks against artifacts built from the exact release tip. Keep
their evidence bound to that commit. Once staging accepts that commit, tag it
on the release branch. The tag triggers the release workflow.

Before merging into `main`, independently download the published assets and
verify their checksums, source commit, image digest and anonymous accessibility.
Keep the distribution case open until both its pre-tag installation checks and
its published-artifact checks have passed. If publication or retrieval fails,
keep production on its current revision and preserve the tag.

## Staging gate before production

Promotion of `release/<minor>` into `main` requires all of the following:

- Public checks green on the exact release tip.
- A staging deployment of that same commit.
- Recorded staging acceptance evidence bound to that commit, including hosted
  journeys where the release checklist requires them. Run
  `python3 scripts/release-checklist.py --parent <current-gate-id> --check`
  against the explicitly agreed current gate and require `ELIGIBLE` (exit 0).
  The script validates records, not the journeys themselves. `BLOCKED` (exit 1)
  reports recorded blockers; `ASSESSMENT_INCOMPLETE` (exit 2) means missing scope
  or evidence, not a confirmed product failure. Retired gates do not define the
  current release requirements; neither nonzero result authorizes promotion.
- Review of the resulting diff into `main` by the release owner.

If staging fails, fix on `release/<minor>` and retest. `main` stays on the last
accepted release until the gate passes.

## Current line (2026-11-08)

- `release/0.3` is the 0.3 integration line. Tag `v0.3.0` identifies the
  published 0.3 candidate at `2e8df756`; the branch later advanced with this
  policy commit.
- `main` has not been promoted to 0.3 and remains the previous production state
  until the staging gate passes.
