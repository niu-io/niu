# Beads work coordination

Niu uses **Beads (`bd`) as the primary tracker** for implementation and review
follow-up. Task status, ownership, priority and dependencies belong in Beads.
Markdown preserves requirements, review evidence, decisions and dated validation.
GitHub Issues are optional external discussion records; do not mirror the backlog
or publish review findings automatically.

## Setup

The initial integration was verified with Beads **1.2.2** and Dolt. Install the
CLI using the [upstream installation guide](https://github.com/steveyegge/beads#installation)
(for example, `brew install beads`). Beads is development tooling, not a product
runtime dependency. Use a compatible CLI version across collaborators; coordinate
schema upgrades rather than opening a newer database with an older binary.

On a fresh clone after the task database has been published:

```sh
bd bootstrap --yes
bd prime
bd dolt remote list
```

The configured Dolt remote is `git+https://github.com/niu-io/niu.git`. Dolt data
uses `refs/dolt/data`; an ordinary source `git push` does not publish task state.
The initial integration initializes local storage and the remote configuration;
it does **not** publish the database. Before the first publication, or for an
offline issue-only reconstruction, initialize and import the checked-in snapshot:

```sh
bd init --prefix niu --skip-agents --skip-hooks --non-interactive
bd import .beads/issues.jsonl
bd prime
```

Use that initialization only when no database exists. On an existing database,
use `bd import` deliberately for issue-level recovery, or use Dolt pull for
normal collaboration. Never force-reinitialize to fix a sync failure.
`bd bootstrap --dry-run` previews the fresh-clone plan; if the configured remote
has no published data yet, use the explicit snapshot reconstruction above.

## Work and handoff

Choose a public-safe actor unique to the worker/session, using `BEADS_ACTOR` or
`bd --actor <actor>`. Search for the finding ID or source reference before creating
work. Select a task, read its acceptance conditions and claim it:

```sh
bd prime
bd ready --json
bd search UX-27 --json
bd show <id> --json
bd update <id> --claim
```

Claims are atomic within a shared database. Separate offline clones cannot
reserve work globally: synchronize before claiming, use distinct actors, and
resolve ownership conflicts before editing the same code. Embedded mode is
serialized; use a deliberately configured Beads server for concurrent writers
if needed. Do not start a shared server or delegate tasks without authorization.

Create one task per actionable cause, with a stable review reference, trigger,
impact, source/revision, evidence limits and observable acceptance conditions:

```sh
bd create "Fix the observed outcome" -t bug -p 1 \
  --description "Trigger, impact, evidence and source revision" \
  --acceptance "Observable result and required verification" \
  --labels review,ux --external-ref review:ux:UX-28
bd dep add <dependent> <prerequisite>
bd dep add <related> <other> --type related
```

Use epics to group reviews; a shared category does not imply a blocking edge.
Keep review-only tasks within review-only authority. Revalidate imported findings
against current behavior before implementation. Corrected observations must not
become new bug claims just because their original document still exists.

Keep implemented work open with `needs-verification` until its acceptance scope
is verified. Record command results, rendered evidence where applicable, remaining
limits and next action in notes or comments. Close with a scoped evidence reason;
use explicit duplicate/rejected/superseded reasons for non-fix dispositions.

```sh
bd update <id> --add-label needs-verification --append-notes "Change and remaining checks"
bd close <id> --reason "Acceptance evidence and its limits"
bd dolt commit -m "Record review follow-up and acceptance evidence"
python3 scripts/beads-snapshot.py
```

The snapshot script omits the automatically inferred owner email. All other
content, including comments and assignees, still requires public-boundary review.
Use public-safe task content and actors; never include credentials, customer
records, private URLs, machine paths or private research.

After publication is authorized, synchronize at session start and handoff:

```sh
bd dolt pull
# Resolve conflicts, inspect claims and complete authorized work.
bd dolt commit -m "Record task handoff"
bd dolt push
```

The first publisher commits the local Dolt working set and pushes it; other
clones then bootstrap from the published remote. A failed pull/push leaves local
work intact: report the error and unpushed state, and do not claim cross-machine
coordination succeeded. Publishing source commits and the Dolt ref are separate
actions, each subject to the active authorization.

## Storage and existing reviews

`.beads/embeddeddolt/` is local runtime storage and is ignored by source Git.
Dolt is the live source of truth. `.beads/issues.jsonl` is a portable issue export
for review and reconstruction; it is **not** a full database backup or a substitute
for Dolt synchronization. It excludes memories and infrastructure records. Use
Beads' `bd backup` workflow when a full history/non-issue backup is needed.
All `.beads` files are excluded from product container build contexts.

The initial import reconciles UX-01–UX-27 against
[`continuation-2026-10-21.md`](../ux/continuation-2026-10-21.md), and R01–R12 against
[the API review implementation status](../reference/api-design-review.md).
Search the original ID with `bd search`; imported records retain source and
acceptance references. Previously corrected or implemented scopes have explicit
historical closure reasons. Remaining work is marked `needs-revalidation`;
UX-12 is a historical lead with limited current evidence. This migration does
not constitute a new product review or authorize implementing the entire backlog.

Review documents retain their dated evidence. Their entry points now point here
for live task state. Add new findings and decisions to evidence records when
useful, but do not maintain a second Markdown checklist or live status table.
