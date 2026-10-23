# Niu UX review

**Task tracking:** Current follow-up ownership, dependencies and execution status live in [Beads](../development/beads.md); search by the stable finding ID. Statuses below are dated review evidence, not a second live backlog.

**Current review:** [Full review continuation and evidence ledger — 2026-10-21](continuation-2026-10-21.md). Read it together with the [task-first blueprint and boundary decisions](review-2026-10-21.md). The continuation reconciles all 27 tracked findings, records corrected observations, adds UX-26/27 and replaces the earlier premature completion claim. Product implementation remains unchanged. The material below is historical and must not be read as current verification of every finding.

Reviewed 2026-10-20 using the local experimental `ux-review` method. Scope: top-down, read-only product review with documented evidence. Product code and data were not changed. The initial review left the skill unchanged; the subsequent explicitly authorized refinement updates only its local installed version. Baseline: working tree based on `241872d0`, with concurrent uncommitted work; observations must be rechecked after changes.

The scoped review and local refinement are complete; see the [completion audit](completion.md). This is bounded discovery convergence, not whole-product saturation or release acceptance. Independent roles, consequential execution and unavailable content states remain explicitly unverified.

## Readiness conclusion

**The inspected dashboard does not yet provide a coherent self-guided commercial operating path.** Workspace pricing adds an unsupported configuration layer; pricing placement, separate-company provisioning and funding readiness have structural or ownership gaps; workspace access currently precedes the required global payment setup. This does not mean the underlying APIs cannot perform those operations, and missing merchant/supply activation is not itself an implementation bug.

Existing saved personal Chat results can be read and traced to request details with explicit owner-funded attribution. That is valuable working behavior, but it does not prove customer onboarding, paid delivery, financial reconciliation or media lifecycle readiness. Those outcomes remain unverified in this read-only run. No overall usability score or exhaustive-completeness claim is assigned.

## Review records

- [Product blueprint](blueprint.md): sourced intent, actors, ownership, value-delivery dependencies and eight journeys.
- [Findings](findings.md): twenty-one proposed findings, evidence, impact, repair direction and observable acceptance conditions.
- [Method iterations](iterations.md): new misses, their causes, rule changes and rejected suspicions.
- [Completion audit](completion.md): original goal requirements, current evidence and remaining work.
- [Surface reconciliation](surfaces.md): current route families, prior-audit leads and remaining checks.
- [Coverage](coverage.md): inspected branches, positive counterevidence, current limits and remaining acceptance work.
- [Visual assessment](visual-assessment.md): rendered findings, useful counterexamples and remaining visual evidence limits.

Canonical intent remains [product focus](../product/product-focus.md); release acceptance remains [the release matrix](../releases/first-release.md). These review documents do not replace either source.

## User-confirmed directions and remaining proposals

| Decision | Reason and consequence | Related findings |
| --- | --- | --- |
| Use platform-wide model pricing by default, without workspace tariffs or enrollment | User-clarified direction; keep supply qualification and access checks separate, and require explicit need for exceptional contract pricing | UX-01 |
| Unify text and media selling-price administration | Apply platform ownership consistently without preserving unnecessary workspace configuration | UX-02 |
| Explicitly support console-managed or documented API-managed customer-company provisioning | Prevent operators from treating another workspace as an independently funded customer | UX-03 |
| Require valid global payment setup before enabling any workspace feature | User-confirmed hard prerequisite; preserve administrator setup/recovery access and enforce the same readiness state across UI and APIs | UX-04 |
| Use purpose-aware supply/price status throughout decision points | Personal testing and resale are legitimate but different paths | UX-05 |
| Clarify native-media module ownership and saved-record references | Preserve supported capabilities and old authorized bookmarks; do not remove APIs on visual grounds | UX-06, UX-08 |

Resolve ownership and handoffs before polishing their component layouts. UX-07's pool-page hierarchy can be improved independently when implementation is authorized. No evidence here justifies deleting an entire product capability.

## Systemic causes and repair dependencies

These are evidence-supported clusters, not claims that every symptom shares one implementation bug.

| Outcome gap | Related evidence | Dependency for a useful repair |
| --- | --- | --- |
| The commercial path is implemented as separate mechanisms without a complete operator/customer handoff | UX-01–04, UX-12 | Apply the clarified platform pricing model and decide provisioning and funding ownership; then connect current UI and served instructions. A pricing-form redesign alone cannot establish first customer value |
| Decision surfaces turn incomplete or differently scoped facts into broader claims | UX-05, UX-10–11, UX-13, UX-16, UX-18, UX-20–21 | Establish capability, eligibility, billing purpose and limit semantics, then carry them through creation, selection, execution and recovery. Naming changes alone do not repair a wrong protocol launch |
| Supported outputs and commercial variants stop before later retrieval or investigation | UX-14, UX-17 | Map each output/billing variant to its storage, owner, discovery and reporting consumer. Preserve existing task history and backend contracts; prove the missing consumer with authorized retained/commercial records |
| Section-local controls conceal a larger transaction boundary | UX-19 | Align draft ownership, pending-change visibility and the commit scope before adjusting labels or adding confirmations |
| Visual sampling missed meaningful populated content | UX-07, UX-09, UX-15 | Inspect distinct assets, rich content and dense/long states as well as widths. Correct list markup or an unclipped empty page does not prove readable content |

Proposed acceptance order: verify the global payment setup gate and its operator remedy first; establish one separate customer's usable commercial offer and recovery path; verify text and media outcomes through their respective charge/report consumers; verify retained-output rediscovery; then repeat cross-surface and visual checks. Independent visual defects can be repaired earlier, but cannot stand in for these outcome gates. Current known failures and unexecuted commercial/role transitions still prevent a readiness conclusion.

## What this run establishes about the skill

The method produced a useful shift from a page defect list to dependencies that determine first commercial value. It also rejected stale complaints: the inspected sidebar places Settings last, currency has the proper platform entry, and current pool-page responsive spacing does not reproduce the old screenshot.

The method is **not yet validated as a complete review standard**. Coverage remains limited by one privileged actor and read-only execution; visual evidence is much shallower than the structural analysis. The next test is whether resolving the proposed structural gaps enables representative users to complete the defined journeys, while broader visual/role/lifecycle checks identify remaining failures. Do not synchronize this skill as a proven standard merely because these documents exist.

## Local refinement result

The follow-up found thirteen additional issues (UX-09–21) and changed the local skill's operational method: coverage debt drives the next pass; rendered samples must represent real composition risk; actionable aggregates need investigation handoffs; labels must match evidence and fallback; support artifacts and multiple setting entry points are part of the journey; retained outcomes need rediscovery; rich-content samples must preserve visual meaning. See [iterations](iterations.md) for rejected suspicions, earlier focused checks and final complementary passes O/P. General skill effectiveness and whole-product saturation remain unproven.
