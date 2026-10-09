# Dashboard automated qualification

Verified 2026-10-08: all **531 tests across 74 files** and TypeScript checking
passed from an isolated dashboard source snapshot. The runner captured 316
inputs, including the docs theme control, SDK source, brand assets and contract
fixtures. Their hashes stayed unchanged throughout execution; the restored
repository dependency lock and layout also stayed unchanged. The
[recorded result](evidence/dashboard-automated-2026-10-08-latest.json) identifies the
snapshot and dependency receipts. This qualifies automated checks for that
snapshot, not later edits, browser workflows, live Supplier capabilities or
complete F10 acceptance.

## Reproduce

Install the repository's locked dependencies first. Use an output directory
outside the public repository that does not already exist:

```sh
python3 scripts/qualify-dashboard.py --output /tmp/niu-dashboard-qualification
python3 -m unittest discover -s scripts/tests -p 'test_qualify_dashboard.py'
```

The runner copies explicit public source inputs to a disposable directory and
invokes the installed Vitest and TypeScript entry points directly. It never
invokes a package manager or loads development secrets/configuration. Dependencies
are reused from the repository and checked before/after; changes invalidate the
result. Source snapshots are removed after execution, while private output holds
the manifest, test/type logs and result. Seven runner regression tests passed.
The first exploratory snapshot attempt triggered pnpm workspace installation;
its result was discarded and full locked dependencies restored before the
qualified run. Source/script public-boundary and whitespace checks passed.

Earlier timed-out or incomplete full runs remain historical failed checks. They
do not establish a root cause. The qualified run does not waive timeout limits,
skip tests or replace full-suite acceptance with focused results.


The latest run used one worker and passed in 97.38 seconds. Earlier current-tree
snapshots failed with four Chat timeouts, then one Supplier directory timeout;
they remain historical failures. The Chat fixtures now paste five setup prompts
while preserving workflow assertions and original deadlines. All 37 focused Chat
and two Supplier directory tests passed before the complete current snapshot.
No test was skipped, assertion removed or timeout raised to obtain this pass.
The cause of the Supplier full-run timeout is not established by its isolated pass.

The 0174 refresh first failed one obsolete Admin navigation assertion (530 tests passed; TypeScript passed). The assertion expected a Supplier switcher and Supplier detail sections in the Admin sidebar. It now verifies persistent Admin sections, active Supplier ancestry and absence of the retired switcher; the separate Supplier-member switching test remains intact. All three focused navigation tests and then the complete 531-test snapshot passed without changing deadlines or product code. The [initial failed snapshot](evidence/dashboard-automated-2026-10-08-0174-first.json) and [earlier 525-test checkpoint](evidence/dashboard-automated-2026-10-08-525.json) are retained. An accidentally unfiltered package-manager run is not qualification evidence.


## Branding and navigation snapshot — 2026-10-09

The [current isolated receipt](evidence/dashboard-automated-2026-10-09-branding.json)
passed all 536 tests in 75 files and TypeScript checking. The captured inputs now
include shared theme tokens and rail CSS, in addition to dashboard/docs/SDK source
and branded assets. Captured bytes and dependency receipts stayed unchanged.
All seven runner regression tests passed, including tracked shared-CSS mutations.
This supersedes the automated count above for this snapshot; it does not qualify
later edits, rendered workflows, live Suppliers or packaging.

## Generations and filtering snapshot — 2026-10-09

The [Generations snapshot receipt](evidence/dashboard-automated-2026-10-09-generations.json)
passed all 544 tests across 77 files and TypeScript checking. Its 325 captured
inputs and dependency receipts remained unchanged. The initial snapshot failed
seven stale navigation assertions while 537 tests passed; those assertions were
updated for the canonical Generations route and label, retaining customer and
administrator access checks. All 107 affected navigation tests then passed,
followed by the complete snapshot without skipping tests or changing deadlines.

This supersedes earlier automated dashboard counts for the pinned snapshot. It
includes shared session history, Video task categories, partial-scope loading
and search/filter changes; complete rendered/live and packaging acceptance
remain separate.
