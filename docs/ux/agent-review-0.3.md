# Agent-managed model review surfaces

Design decision record, 2026-10-31. Governing intent: [agent-oriented principles](../product/agent-oriented-principles.md) and [experience blueprint](../product/agent-experience-blueprint.md). Execution state belongs to Beads `niu-y4q.7` and `niu-y4q.4`. This record does not establish implemented or verified dashboard behavior.

## Human task and resource boundary

A person reviews what their agent configured, why a model was selected and what the resulting calls cost or achieved. They can investigate directly, revise the goal or delegated authority, and return work to the agent. Reading this surface must not require obtaining an API key, copying JSON or understanding platform procurement.

Workspace model policies belong in workspace navigation. Platform supply pools remain privileged administration resources with distinct terminology and authorization. Preserve model trials, request diagnostics and credential controls as connected destinations; do not put procurement routes or prices into the workspace view. Do not combine two objects merely because both currently contain the word pool.

Use a scoped policy list and a readable slug-based detail route. The list supports choosing a policy to inspect: meaningful name, enabled state, candidate models and revision. The detail supports configuration, revision comparison and execution evidence through local tabs, preserving the workspace in navigation and links to existing model/request views. Keep saved configuration, metadata simulation, actual execution, terminal generation and task acceptance visibly distinct. Missing evidence remains unknown.

The initial human review path reads persisted state under the member's workspace authority. It must not borrow installation credentials or force a human to create an agent credential just to read their workspace. Agent write authority remains the separate delegated contract. If a direct human mutation is offered, its backend authorization, actor provenance, revision conflict and readback behavior require an explicit contract; a working agent PUT is insufficient evidence for that human workflow.

## Inspected product reference

Inspected OpenRouter's actual [workspace Presets list](https://openrouter.ai/settings/presets) and its linked new-preset page on 2026-10-31. The reference establishes a workspace sidebar destination, an explicit empty state, a breadcrumb/back path, resource title and primary save action, and section labels beside grouped fields. Its name/slug/description group makes the resource identifiable before model configuration. Do not copy unrelated system-prompt, tools, Provider-preference or billing capabilities into Niu's workspace policy.

The reference was read without saving or creating a preset. Private account details and screenshots were not copied into this repository. Model choice open-state, narrow layout and persisted-edit behavior have not been qualified by this inspection; inspect those states before implementing the corresponding Niu interaction. Use existing Niu Sidebar, Tabs, PageHeader and installed shadcn primitives, full available management width and Niu theme tokens. Any departure from the relevant reference structure needs a product or technical reason.

## Review standards

Apply [NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) to scope, recognition, feedback and recovery, and [visual hierarchy guidance](https://www.nngroup.com/articles/principles-visual-design/) to prioritizing the policy and its evidence. Use the installed design system for grouping and spacing; the reference's token values do not replace Niu tokens. Apply relevant [WCAG 2.2](https://www.w3.org/TR/WCAG22/) keyboard, focus, reflow, contrast and status requirements with measured evidence.

Functional readback, visual composition and interaction correctness require separate verification. Operate the actual authenticated route through loading, empty data, insufficient permission, unavailable evidence, revisit and recovery. Inspect desktop, intermediate split-pane widths with navigation open/closed, and narrow widths. Measure available content width and accumulated gutters. Open and dismiss changed menus/dialogs by keyboard and verify focus return. A source implementation or passing build cannot establish this review surface as complete.

## Dashboard implementation checkpoint — 2026-10-31

The workspace sidebar now exposes Model pools, Evaluations and Event subscriptions,
with readable resource/run paths and installed Tabs for detail sections. Their job
is to let a member inspect agent-managed state and evidence directly, retaining
workspace identity and links to request logs. They are read-only; direct human
mutation is intentionally absent because no member mutation/provenance contract
has been qualified. The agent remains the authorized operator.

Current coverage includes pool candidates/rules/history/selection evidence,
subscription configuration/current authority/delivery recovery, evaluation criteria,
immutable run judgments/input evidence/customer-charge coverage and matched-run
comparison. Source-backed NN/g recognition/status/recovery criteria are supported
by named resources, explicit unknown charges, separate configured/authorized/
acknowledged states and actionable missing-resource/empty states. No internal UUID
appeared in the inspected rendered content; identifiers remain API/routing evidence.

Browser verification used an authenticated local member and persisted synthetic
fixtures, explicitly named Fixture. These demonstrate UI behavior, not real model
quality, performance or pricing. No inference or external notifications were sent.
The actual OpenRouter Presets reference was inspected in the preceding checkpoint;
this implementation retains its scoped list/detail/back-path hierarchy, preserving
Niu's shell and solid theme rather than copying unrelated preset capabilities.

At 1280×720 the main content lane measured 956 CSS px from x=324; section bounds
were about x=353–1251 (899 px). About 29 px per-side canvas padding remains after
navigation, with no page max-width. Navigation and breadcrumb occupy stable scope
space; the sparse list reflects one fixture rather than a centered bounded canvas.
At 900×800, collapsed-navigation content measured about 790 px from x=85–875.
The expanded mobile sidebar was inspected after its slide transition settled;
labels were reachable and Escape dismissed it. At 390×844 the comparison section
measured 358 px from x=16–374, with no document overflow. Its controls occupy two
rows because the trigger and comparison action exceed the lane together. The
baseline menu stayed anchored/in bounds. The data tables scroll within their own
container; the page header, tabs and recovery guidance remain reachable.

Interaction evidence: pool list→detail→History; evaluation list→runs→candidate;
Results/Criteria/Comparison tabs; expanded baseline menu at desktop and narrow
widths; ArrowDown/Enter selection with focus returning to the trigger; matched
comparison; saved baseline query on revisit; subscription list→configuration→failed
Deliveries; empty-workspace switch clearing prior rows; missing-resource recovery.
The latest comparison page had no captured browser-console errors. The copy-prompt
button, 100+ history/run pagination and full denied-member browser journey have not
been operated; these remain unverified. HTTP member-boundary tests independently
cover Viewer reads and foreign-workspace rejection.

Visual composition is a bounded pass for list identity, grouped configuration and
readable unknown-charge evidence. Comparison scan efficiency on narrow screens
and detailed historical rule inspection still need refinement before the full
review journey can be accepted. The current history list alone does not establish
complete revision comparison. Apply the same source-backed review gate to those
changes and native-host review handoffs before closing Beads niu-y4q.4.

## Baseline navigation follow-up, 2026-10-31

Bead: niu-y4q.4. Local interaction correction under the existing comparison
journey. Re-inspected OpenRouter's model comparison entry and populated result:
selection identity is represented in its URL and aligned metric columns retain
the compared objects. Niu retains its established comparison table and direct
shadcn radio-menu primitives; this correction adds no visual pattern.

The prior baseline selector initialized local state from the URL only once.
Browser history could therefore restore a URL while leaving another selection
and prior comparison visible. Baseline now derives directly from query state;
changing it aborts pending comparison work and clears previous evidence. Aborted
responses cannot update the current view.

Review criteria apply the ux-review interface guidance on preserving user
context and predictable controls, and its NN/g-backed user-control, consistency
and system-status principles ([usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)).
Browser pass evidence: selecting Fixture run 1 updates the URL; Back restores
Fixture baseline; Forward restores Fixture run 1. At 390px, page scroll width is
390px; the baseline menu remains aligned and internally scrolls. Loading the
next page exposes Fixture run 102. Escape closes the menu and returns focus to
the Fixture run 1 trigger. Hierarchy, spacing, table and action emphasis remain
consistent with the previously inspected comparison surface.

Five review regression tests pass, including history restoration while a prior
comparison remains pending; its later response cannot repopulate the page.
This is fixture evidence, not real model quality or host authorization evidence.

## Authorization recovery follow-up, 2026-10-31

Bead: niu-y4q.9. Applied the existing ux-review criteria for visible system
status, recognition of authority and recovery, based on the NN/g usability
heuristics referenced above; the device-approval structure remains the previously
inspected GitHub activation pattern. All six requested permissions appear in
plain language. Decline without consent produces a clear refusal in browser and
CLI and no issued key. An expired request gives a restart instruction and reload
action. The rendered route title now identifies connection review rather than
misreporting a missing page. At390px, scroll width390px and the recovery message
and action fit without clipping. No approval was performed in this check.

## Captured policy provenance, 2026-10-31

Beads: niu-y4q.4/.10. Re-inspected OpenRouter's populated comparison table and
its model-detail links. Reused that pattern locally: a secondary readable policy
link sits with the evaluated model in the existing sample table. It uses only
the receipt's saved slug/revision, never a mutable current name or internal ID.
The linked history query loads that revision and earlier even when it is outside
the latest100 records; cache identity includes the selected revision. Missing
references explicitly report unavailability instead of substituting current data.

Applied ux-review context-preservation, recognition and system-status criteria
from the NN/g-backed standards cited above. Browser pass: actual evaluation
revision2 links to saved policy2 while current policy3 remains separately labeled;
opening revision2 shows its historical enabled state and changed fields. Enter
follows the link; Back returns to results; Escape closes the historical dialog.
At390px document scroll width390px; dialog bounds16..374(width358) keep content
inside the viewport and its data table scrolls internally. The existing desktop
table hierarchy is retained; the secondary link wraps instead of crowding the
reason column. Six review regressions pass, including current103/captured1
navigation and existing unknown-charge, scoped cache, denial and focus cases.
Typecheck and production build pass; the prior large-chunk advisory remains.
