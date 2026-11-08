# Landing design calibration — 2026-10-30

Related work: `niu-bpu` (landing), `niu-0hf` (skill calibration). This is dated review evidence; Beads owns execution status.

## Scope and source limits

The user rejected website revision `35c03dd` and chose its immediate predecessor `6294384` as the visual baseline. Revert `4df43a8` restores that source without rewriting history. Production was restored through the existing deployment workflow with only the website pin changed. Core and plugin revisions were preserved.

The active design skill is `ux-review`. Its integration commit `0ba1905` was compared with Impeccable revision `3930843f0c21a418443bfe8a2736f166bfcddb69`, especially [polish](https://github.com/pbakaus/impeccable/blob/3930843f0c21a418443bfe8a2736f166bfcddb69/skill/reference/polish.md), [craft-floor](https://github.com/pbakaus/impeccable/blob/3930843f0c21a418443bfe8a2736f166bfcddb69/skill/reference/craft-floor.md), and [mode-persuade](https://github.com/pbakaus/impeccable/blob/3930843f0c21a418443bfe8a2736f166bfcddb69/skill/reference/mode-persuade.md). Current upstream is a comparison source, not proof of which revision the earlier author read. No agent reasoning trace was inspected, so the skill cannot be established as the sole cause of the rejected design.

## Observations and decisions

| Evidence | Interpretation | Decision |
| --- | --- | --- |
| Accepted predecessor uses a centered display headline, orange gradient emphasis, atmospheric grid and metric cards. Rejected revision replaces this with split explanatory content and a dense console stage. | User preference establishes a local visual constraint. Removing patterns flagged by an external style guide does not establish improvement. | Preserve the predecessor's visual identity. Style flags require contextual reasoning, not removal by default. |
| The deployment review established working tabs, languages, asset delivery and responsive layouts but did not demonstrate visual improvement over the predecessor. | Functional verification and mechanical integrity cannot establish aesthetic acceptance. | Require equivalent-state before/after comparison, explicit retained strengths, intended benefit and lost qualities. |
| Impeccable separates refinement from redesign, while also expressing strong stylistic bans and numeric prescriptions. The local adaptation includes useful exceptions, but its mandatory craft wording still conflates preference, heuristics and standards. | The adaptation is partially reasoned, not wholly blind copying, but conflicting instruction strength can induce mechanical compliance. | Retain useful mechanisms; make imported style prescriptions contextual and identify the adaptation as a synthesis. |
| At 390×844, the restored Chinese heading breaks the final word across lines; the initial hero animation temporarily blurs and hides content. | These are concrete local observations; they do not justify replacing the page composition. | A narrow prototype shortens copy and removes hero entrance hiding. It remains an unpublished hypothesis, not an accepted redesign. |
| The actual OpenRouter homepage has a centered heading, two prominent actions and a metrics row. | This is a real counterexample to treating those patterns as inherently invalid. Niu and OpenRouter have different offers, so copying its copy or complete composition is not warranted. | Borrow action hierarchy only where it serves Niu's visitors; keep the local visual baseline. |

## Local prototype evidence and limits

The prototype changes two source files. It retains the incumbent composition, reduces the first action group to dashboard and quickstart, keeps GitHub as a text link, shortens bilingual supporting copy, uses a two-line Chinese headline, and renders hero metrics without count-up transitions. No lower-page redesign or new product claims were introduced.

At 390×844, the Chinese headline occupies approximately x=14..376, y=166..252; the two actions occupy x=15..375, y=393..501. The header is about 64px high. All four metric cards appear within the first viewport; document width equals viewport width. At 1440×900, the content lane is x=128..1312, headline y=198..382 and actions y=507..555. A 960px snapshot also has no document overflow. These measurements establish composition and reflow only, not improved conversion or user preference. The prototype was withheld after the user redirected attention to the quality of the skill integration.

## Skill corrections and remaining uncertainty

Local skill edits now separate applicable WCAG requirements from aesthetic starting values, avoid treating Latin prose measures as universal CJK/display rules, allow justified border/shadow and neutral text treatments, and require a baseline comparison before choosing a steering move. Non-text contrast wording was checked against [WCAG 2.2 SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): decorative borders are not universally subject to a 3:1 requirement.

The skill's structural validator was executed. Its outcome is not evidence of behavioral effectiveness. This retrospective can expose contradictions and missed judgment; it does not demonstrate that a future agent will consistently apply the revised skill, nor substitute for an independent current-input design exercise. No fixture-test result supports any conclusion here. Broad product readiness, accessibility conformance, conversion impact and benchmark validity were not evaluated in this scoped review.

## Separate review and design skills — follow-up

At the user's explicit request, the installed skill was separated into independently usable `ux-review` and `ux-design` packages. Review owns observation, prioritization, acceptance criteria and verification; design owns authorized design decisions, implementation and delivery verification. Review findings are not implementation authorization. Combined requests may switch to design under existing authorization without another permission round. Neither package requires the other to be installed.

Implementation guidance moved to ux-design; ux-review now keeps critique questions and counterexamples rather than prescribing implementation moves. Both invocation metadata entries were updated, and ux-design was linked into the local skill discovery directory. Local reference checks and both structural validators were executed. This establishes packaging integrity only. No independent agent behavior evaluation was performed.

Additional corrections removed the inferred four-choice UI limit, novelty as a design-quality requirement, universal translation expansion percentages and inconsistent mandatory typography numbers. The design skill includes explicit criteria for retaining the baseline or discarding an optional experiment. Review reports scale to the requested scope rather than requiring a product-wide dossier for a local critique.

A fresh browser inspection of the live restored page and local candidate at 390×844 confirmed the live Chinese heading splits the final word and the candidate fits in two lines. Both document widths equal 390px. The captured themes differed, so those frames do not support a color/theme-quality comparison. The candidate also removes the headline's integrated-system claim and reduces visible discovery links. This is a content/navigation tradeoff, not an automatic win from fewer words or buttons. The implementation remains unpublished, and broad aesthetic or conversion improvement remains unverified. This same-context application is bounded retrospective evidence, not independent proof that future agents will make better decisions.

## Applied review and design preview

The user subsequently requested an actual review/design exercise and a preview. Review was completed before selecting a scoped refinement. The production baseline remained unchanged.

| Finding | Evidence and criterion | Decision |
| --- | --- | --- |
| Mobile headline breaks the word for completing the workflow | Live Chinese dark 390×844 screenshot; typography/reflow and local brand continuity | Preserve the exact headline meaning and use phrase-aware spans with a mobile type size that fits. |
| Product preview is difficult to encounter in the opening viewport | Live desktop 1440×900: metric cards occupy the lower opening area; the preview heading was below it | Reduce top padding, display scale and the metric gap modestly; retain the centered hierarchy and all discovery links. |
| Demonstration status and financial values lack prominent context at entry | Operated live logs, financial and generation tabs; visible sample amounts resemble product state | Add a visible interactive-demo/sample-data label above the existing preview. This does not verify represented backend functionality. |
| Headline benchmark values are separated from methodology | Live hero values lacked a nearby setup link; the original content declares 64 concurrent requests for throughput/latency | Add a scoped concurrency note and link to the existing benchmark guide. Correct Chinese RPS terminology from concurrency to requests per second. Benchmark results were not rerun or accepted as present-day performance evidence. |

The candidate retains the original Chinese headline including the integrated-system claim, original gradient/grid identity, GitHub action, comparison/model/blog links and existing preview behavior. Supporting copy retains routing, pricing, balance and Chat/Video capabilities rather than claiming a new capability. Metric count-up and hero hiding are removed so information is readable immediately. At 390px, primary actions share a row and the GitHub action remains subordinate; below 360px they stack after actual English text overflow was found and corrected.

Actual verification: desktop 1440×900, intermediate 960×820, mobile 390×844 and narrow English 320×740; Chinese dark and English light inspected. Document width matched viewport width in measured intermediate/mobile states. English primary control scroll width now equals available width at 390px and 320px. All four existing preview tabs were activated, and FAQ disclosure was operated. Language and theme menus were operated. Existing documentation, benchmark, catalog, comparison and blog destinations returned HTTP 200 on production. Local preview redirects dashboard/documentation/catalog routes to production because it contains only the marketing artifact. No customer write or model request was made.

Build, Astro diagnostics and diff checks were executed as code hygiene. The candidate is a reviewable local refinement, not a release-readiness or conversion claim. Lower-page copy and all demo subcontrols were not exhaustively audited; several sample status labels remain English in the Chinese demo. Existing product-readiness claims and historical benchmark methodology need their own substantive evidence review. Visual evidence supports the bounded line-break and hierarchy changes, not an assertion that every visitor prefers the candidate.
