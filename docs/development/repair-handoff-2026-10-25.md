# Repair handoff — 2026-10-25

The user paused the GPT agent to continue this work with Gemini. The goal is
paused, not complete. This is a dated handoff, not a second execution backlog.
Beads remains the authoritative tracker.

## Scope and release gate

The user explicitly included **all GitHub Issues across all Niu repositories**,
including feature proposals such as #110, #97 and #95. Do not narrow the task to
bugs found in the original online test. The last reconciled inventory contained
26 open issues across seven inspected repositories; refresh the inventory before
final qualification. Restricted repository details belong outside this public tree.

Implementation, issue reporting/closure, release publication and online deployment
were authorized. Use the authorized test account and Mock Payment Gateway, keep
simulated funds distinct from verified cash, and prefer free OpenRouter models.
The user permits online testing; do not introduce a new approval gate for work
already authorized. Actual release eligibility still requires every permanent
acceptance case to be GREEN on the release candidate and deployed verification.

Start with `AGENTS.md`, `bd prime`, `bd ready`, the all-issues epic `niu-2xp`, the
release gate `niu-4do`, and the active Credits implementation `niu-2xp.3`.
Use a distinct `BEADS_ACTOR`. The implementation task is released for handoff;
claim it before further work. Do not treat fixture outcomes as evidence. Only
actual current-input end-to-end behavior and independently checked final records
support acceptance.

Durable requirements and evidence:

- [Release checklist](../release-checklist.md): 50 required cases; this repair
  candidate has not qualified. Older published-release evidence is not evidence
  for the new candidate.
- [Dated verification record](../ux/issue-repair-verification-2026-10-25.md): actual
  runs, results and explicit limitations. Read relevant sections rather than
  repeating the entire conversation or rerunning unchanged experiments.
- [Credits architecture](../architecture/branded-credits.md): unit, provenance,
  conversion, expiry, reservation, refund and mode-change contracts.
- [Repository ownership](../architecture/repository-ownership.md): keep marketing
  source separate and hosted route ownership intact.

## Latest completed slice

The current implementation includes exact versioned Credits definitions, purchase
rules and quotes; mock-payment unit issuance; noncash grants; lot-range balances;
explicit text tariffs; actual text admission/charging; original-range refunds;
and preview-confirmed installation mode changes. This is not complete #110
acceptance. Relevant recent commits:

- `107cea02`: actual text inference integration and dispatch guards.
- `db46a617`: original-range Credits refunds.
- `9aac9739`: actual monetary text regression after Credits integration.
- `9a6fef80`: read-only mode compatibility preview.
- `894916f4`: saved previews, guarded mode publication and issuance boundaries.

The tree also contains `1b88431e`, which squashes historical migrations into
`0001_initial_schema.sql` with legacy receipt folding. Preserve it. Migrations
0384–0385 are additive. Do not recreate or edit the removed historical files;
use the current compatibility mechanism and verify the full distribution matrix.

Actual free-model requests established text charges, zero tariffs, pinned price
revisions, promotional expiry during inference, insufficient-capacity denial,
refunds and monetary compatibility. Three upstream observations had inconsistent
reasoning/output token counts. Their 49728300-atom combined hold remains unresolved.
Do not invent usage, substitute a price or release those holds without evidence.

Actual mode API runs produced five changes at revisions 5–9. Duplicate/concurrent
publication, history replay, new-obligation blocking, grant/mode races, monetary
credit-facility blocking and authorization were exercised. Historical monetary
and unit records survived mode changes and restart. No new release or online
deployment was performed by this latest repair slice.

## Immediate continuation and evidence limits

A valid revision-9 mode preview was saved in the isolated mode-verification
installation with expiry **2026-10-25 13:25:51 UTC**. The user paused before its
natural-expiry submission check. Do not change that installation revision first.
After restoring its service, verify that the original expired preview returns
409 while current compatibility remains clear, then verify a fresh preview can
publish. Keep the original saved receipt and deadline unchanged. Local recovery
locations are documented in the private handoff supplied to the user.

The next planned implementation was separate Credits workspace/API-key limits.
No limit code was started. Current Credits admission deliberately rejects scopes
with existing monetary limits instead of reinterpreting them. Explicit unit limits
must account for unresolved holds, known liabilities, original refunds and key
rotation lineage; preserve old monetary limits for currency mode and require an
explicit unit configuration before replacing their effect in Credits admission.

Other remaining #110 scope includes over-bound funding/recovery, genuine purchased
backing and reversals, media, full customer prices/history/billing/export contracts
and UI, unit-limit migration, rendered mode controls and hosted acceptance. The
other issues remain tracked in Beads and GitHub; this feature work does not close
them. No full release acceptance case should become GREEN merely because these
backend slices passed their narrower actual checks.

## Cleanup and handoff state

Task-owned local services on ports 14323–14334 were stopped, including the isolated
PostgreSQL server; its data and verification artifacts were retained. Shared
services and unrelated changes were left untouched. The pre-existing untracked
`.beads.gate.lock` was not deleted. Sensitive runtime configuration and evidence
were moved to a private persistent location outside this repository, with the old
runtime path preserved for existing configuration references.

The handoff itself is committed and the portable Beads snapshot refreshed. Inspect
current Git state before publication; no new push is performed as part of cleanup.
Do not include private recovery paths, credentials or restricted issue links in
public commits or GitHub Issues. The goal remains paused until the successor or
user deliberately resumes execution.
