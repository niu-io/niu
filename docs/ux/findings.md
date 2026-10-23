# UX findings — 2026-10-20

Current follow-up: [2026-10-21 review](review-2026-10-21.md#new-findings) adds UX-22–25 and [reconciles these earlier findings](review-2026-10-21.md#reconciliation-of-earlier-findings). In particular, UX-02 now concerns competing media-price owners/editors; an Admin publisher exists. Do not treat historical evidence as a current reproduction.

Status: findings originated in a read-only expert review. Subsequent user decisions and authorized implementation are recorded below; unmarked findings remain open. See [coverage](coverage.md) for evidence limits and [blueprint](blueprint.md) for goals. Priority describes impact on the intended task, not a measured incidence rate: P1 interrupts a core operating path; P2 adds substantial ambiguity or effort; P3 is a localized visual-quality defect with a usable alternative cue. No P0 security or financial-integrity defect is established by this review.

## Structural and journey findings

### UX-01 — Workspace pricing and enrollment add an unsupported product layer

**P1 · product model/complexity · G2, J2 · confirmed direction from user clarification; migration impact not yet assessed.**

Correction: the original recommendation to add a workspace standard-price enrollment path is withdrawn. It treated existing APIs and missing dashboard consumers as evidence that enrollment was a required user task. They establish implementation behavior, not product necessity.

Observation: Admin Pricing separates Standard prices and Workspace prices; the SDK exposes workspace enrollment methods. These observations (E02) remain valid. The product direction requires operator-managed selling prices, while workspaces organize access, usage attribution and limits. It does not establish a need for workspace-specific selling prices. The user clarified that the default should be platform-wide model pricing without per-workspace pricing or enrollment.

Impact: retaining this extra configuration layer makes operators manage price applicability separately for each workspace without an established customer need. Adding the missing enrollment UI would make that complexity more complete rather than resolve the product-model mismatch. The exact runtime and migration consequences still require implementation analysis.

Proposed direction: use platform-managed model selling prices as the default. Keep workspace permissions, limits and usage attribution distinct from pricing. Do not require a workspace tariff or price enrollment for ordinary authorized use. Customer contract prices or discounts require an explicit business requirement before introducing another pricing scope. Supply qualification and access checks remain necessary; publishing a price must not bypass either.

Verification: with qualified supply, an authorized customer can inspect the applicable platform price and use a model without workspace-specific pricing setup or enrollment. Requests retain the admitted price revision; later price changes do not reprice history. Verify text and media units, unavailable prices, denied access and unqualified supply separately. Before implementation, inventory existing overrides/enrollments and design an explicit compatibility/migration policy; this review does not authorize deleting contracts or records.

### UX-02 — Customer media pricing is owned by an unrelated settings surface

**P1 · information architecture · G2, J2 · high confidence.**

Observation: customer text pricing is under Admin → Pricing, while Media selling rates is under Account → Organization settings, beside organization identity and workspace management. The media section is installation/platform-admin gated in `features/organization/page.tsx`. Its publication dialog reports no eligible models and instructs the operator to configure a schema and qualify an offer, with no link to either remedy. Evidence: E02–E03.

Impact: the same operator task requires knowing a different navigation owner for media. The missing-prerequisite message terminates the task. This is not a demonstrated procurement-data leak or an ordinary customer's permission defect.

Proposed direction: consolidate the commercial pricing entry and effective-offer explanation; apply the platform pricing ownership clarified in UX-01 and retain media dimensions. Relocate the operational editor rather than delete its capability or API. Connect missing eligibility to the exact supply prerequisite with preserved context.

Verification: an operator starting from Pricing can locate both text and media terms for the intended customer, understand applicability, follow a missing prerequisite and return to the same task. Verify ordinary customer roles cannot edit operator-owned tariffs.

### UX-03 — The operator cannot discover how to provision a separate customer company

**P1 · actor handoff · G3, J3 · high confidence in inspected entry points; end-to-end provisioning unverified.**

Observation: the account menu switches existing organizations; Organization settings creates workspaces; Users adds a person with a temporary access token; Account balances manages existing companies. None of these inspected entries exposes company creation or a provisioning guide. `docs/reference/company-creation.md` documents the administrator-only company-creation API. A dashboard source search found no `createCompany` consumer. Evidence: E03–E04 and E11.

Impact: an operator onboarding a new independently funded customer must leave the dashboard and already know the company API. Creating another workspace in the current company is materially different because funds are shared.

Proposed direction: explicitly choose and document console-managed or API-managed company provisioning. Either needs a discoverable operator path through company, owner access, workspace, funds and first usable model. Do not add public self-signup or email invitations merely to imitate another product; those are separate product decisions.

Verification: a new operator can provision an independently funded customer using the supported path, hand off access and verify scope without using a developer's private instructions. Access creation, sign-in and isolation require separately authorized tests.

### UX-04 — Workspace features are available before global payment setup is valid

**P1 · global prerequisite gate · G3/G6, J3/J4/J8 · user-confirmed requirement; current absence observed.**

Observation: the inspected installation exposes workspace features while Settings → Payments reports online top-ups unavailable and payment gateways remain unconfigured (E05, E10). The earlier finding treated this as a local insufficient-funds recovery problem. The user clarified that valid payment setup is a hard global prerequisite: no workspace feature should become available before it is satisfied.

Impact: the product admits users into workspace workflows before a mandatory installation dependency is ready. Adding a funding link or a local warning would leave the global ordering failure intact. An existing balance, credit allowance or personal upstream key is not an implicit exemption from this setup gate.

Required direction: establish one server-authoritative installation payment-readiness gate shared by all workspaces. Until at least one supported payment method has valid, operational configuration, present an installation setup blocker instead of workspace features. Keep administrator payment setup, authentication, sign-out and necessary recovery/help accessible so the installation can be completed. Ordinary users see the blocker and its responsible operator, not merchant credentials or administration controls. Server-managed gateways may retain their supported configuration procedure; an in-dashboard editor is not inherently required.

Readiness must reflect the gateway's required credentials, merchant activation and required integration checks, not merely a saved configuration record. Apply the gate consistently to direct URLs, existing sessions and workspace API operations, not only navigation visibility. Preserve existing data and allow already-started payment callbacks, reconciliation and request settlement to complete. This gate is distinct from each customer's balance and from a single failed or pending payment; those do not by themselves make the whole installation unconfigured.

Verification: with no configured method, invalid/incomplete setup or unknown readiness, workspace entry and operations remain blocked across roles and entry points while an authorized operator can reach the remedy. Completing validated setup unlocks workspace access consistently. Removing or invalidating the last ready method re-establishes the gate without deleting records or abandoning in-flight obligations; another ready method keeps it satisfied. Verify pending/failed individual payments do not incorrectly block all users. Define operational readiness signals and temporary-outage handling before implementation; do not equate one failed transaction with global failure. Actual payment execution and migration remain separately authorized work.

### UX-05 — Personal usability and commercial readiness are not consistently explained

**P2 · state model · G1–G3, J1–J3 · medium-high confidence.**

Observation: Providers emphasizes Not qualified and Review Provider for the current connections; their route dialog has Private and Available rows. Existing Chat results and logs explicitly identify Own API key. The workspace catalog offers Try in Chat, while the inspected model detail says both prices are Not published, without explaining whether this is personal use or missing commercial terms. Evidence: E01, E06–E07. The mapping editor does contain personal/owner-only information, so the distinction is not absent everywhere.

Impact: users must infer whether a qualification problem prevents testing, whether an available model can be sold, and who pays. These are separate truths and cannot be safely collapsed into a generic Ready badge.

Proposed direction: carry supply purpose and applicable billing context through the overview, model decision and launch handoff. Show commercial readiness only where relevant and keep access/price unknown when not established. Preserve the explicit Own API key attribution in result and log views.

Verification: compare a personal-only route, qualified commercial route, unpublished customer price, revoked qualification and inaccessible key. At each decision point, users can identify whether they can use the model, for which purpose and who pays; no test requires qualification merely for personal use.

### UX-06 — Video navigation names a tool module, not the task the label promises

**P2 · capability naming/ownership · G4, J5 · medium confidence; proposed structural clarification.**

Observation: Generations owns saved Chat/Video history. Workspace → Video opens Materials and Human verification with native-tool key/model context, rather than a video-generation workspace. Its discovery error correctly identifies a source-address restriction and does not fake empty success. Evidence: E06 and E08; supported media responsibilities are documented in the Generations handoff.

Impact: the broad label does not distinguish producing video from administering Provider-specific prerequisites. This is a navigation ambiguity, not evidence that native materials or verification should be removed.

Proposed direction: retain native capabilities, describe their purpose at entry and connect them contextually to supported generation. Evaluate whether a standalone administrative entry remains useful; do not delete backend stores, recovery APIs or saved results to simplify navigation.

Verification: a user can distinguish generate, find prior outputs and manage native materials without visiting each page to discover its purpose. Model-specific unavailable capabilities must remain explicit. Complete task/artifact retrieval still requires its own lifecycle verification.

## Visual and interaction findings

### UX-07 — The pools landing page prioritizes algorithm exposition over setup

**P2 · content hierarchy/visual composition · G1, J1 · high confidence in observation; usability effect is expert judgment.**

Observation: the initial page opens with a paragraph explaining priority selection, weight tiers, qualified authentication rejection and streamed/uncertain failover semantics. At 390 × 844 CSS px it occupies approximately nine lines before the toolbar; the empty state repeats the basic pool explanation. The create dialog again introduces priority/weight ranges. Evidence: E09.

Impact: first-time setup competes with implementation-level conditions before the user has selected a candidate. These details can matter, but not all at the landing page's first decision.

Proposed direction: lead with the operator outcome and prerequisites; place algorithm and recovery constraints beside the controls/decisions they govern or in accessible supporting help. Preserve important safety semantics rather than simply delete the explanation. No arbitrary universal padding value is proposed.

Verification: first-use and populated states at desktop, intermediate and narrow widths expose purpose, next action and meaningful readiness promptly. Advanced routing limits remain discoverable at configuration and investigation points.

### UX-08 — Saved-record links still expose internal UUID query references

**P2 · navigation/detail · G4–G5, J5–J6 · high confidence.**

Observation: saved Generations links contain UUID-valued `session`, `intent` and `key` query parameters. Inspect request links contain an internal attempt reference in the fragment. Workspace and Provider paths inspected in this review use meaningful slugs. Evidence: E06. This is partial migration, not an assertion that all URLs are opaque.

Impact: links remain difficult to recognize and communicate; key query references conflict with the product's readable-resource policy. Random record references need not become prompt-derived slugs.

Proposed direction: complete the named-key slug handoff and adopt an explicit safe public-reference policy for saved execution/session records, preserving authorization, durable old-link resolution and canonical redirects. Never derive links from private prompt content or expose raw identifiers as display labels.

Verification: open both old and new authorized bookmarks, share/revisit named-resource links and inspect canonical URLs. Verify unauthorized references do not reveal existence or metadata. Preserve stable references across renames.

## Criteria and repair dependencies

The findings apply the project's product promise and scope rules. For interaction interpretation, [NN/g's heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) support meaningful status, consistent concepts, recognition and constructive recovery. These are broad criteria, not proof of user failure or a substitute for research. The [OpenRouter model directory](https://openrouter.ai/models), inspected live during this review, puts price/unit information alongside model comparison; Niu must express its own applicable price or personal-use context, not copy upstream prices.

Repair order: remove unjustified workspace pricing from the target product model (UX-01), then clarify pricing placement and customer provisioning (UX-02–03), enforce the global payment setup prerequisite (UX-04), then clarify eligibility and recovery (UX-05), then clarify media destinations (UX-06), followed by local hierarchy and reference cleanup (UX-07–08). Independent fixes may proceed in parallel when authorized. A new wizard, new portal, API deletion or product rebranding is not required by these findings.

Closing this list alone does **not** establish usability: commercial charging, customer-role access, media output lifecycle, and adverse-state recovery remain acceptance gates in [coverage](coverage.md). No capability was established as outside the approved vision strongly enough to justify retirement in this run.

## Refinement follow-up — 2026-10-20

The following were discovered while testing the review method against previously shallow or uncovered surfaces. See [iteration record](iterations.md) for why the original pass missed them. They remain review findings, not implemented fixes.

### UX-09 — A Provider logo loses visual recognition in the active dark theme

**P3 · visual asset integration · G1, J1 · high confidence in the rendered observation.**

The OpenRouter mark is nearly black on a dark tile in the Provider directory at 1280 × 720, while the adjacent Provider mark remains recognizable. Its text name is readable, so identification is still possible. This is a visual-quality defect, not a claimed WCAG logo-contrast violation or a task blocker. Evidence: E15, `providers-dark-1280.png` in the private review evidence set.

Proposed direction: use the asset's appropriate theme variant or a suitable neutral treatment, preserving the supplied brand. Verify actual third-party marks alongside text and controls across supported appearances; do not recolor all logos indiscriminately.

Verification: normal-size inspection makes each mark recognizable in its rendered background while preserving the readable name and established brand treatment.

### UX-10 — Unresolved request capacity is reported without an investigation handoff

**P2 · operational recovery · G5–G6, J6–J7 · high confidence in missing handoff; no new enforcement defect claimed.**

An existing key's Limits section reports unresolved requests and unknown committed token usage with unbounded requests. It offers limit History/Edit but no link to the exact affected requests or explanation there of the resulting capacity implications. The separate recent-token panel explicitly covers only the last 60 seconds. A distant View all requests link gives all key requests, not the unresolved subset. Source: `apps/dashboard/src/features/keys/components/KeyLimits.tsx`; live key detail, E16.

Impact: the operator can see that capacity accounting is unresolved but cannot investigate those reservations from the status. Changing the numeric limit is not a resolution of uncertain execution. The edit dialog does explain some limit semantics, so this is not an assertion that no explanation exists anywhere.

Proposed direction: explain whether uncertainty affects admission and link the exact affected records to supported diagnosis/reconciliation. If no safe reconciliation exists, name the responsible operational procedure; do not offer unconditional release or automatic resubmission.

Verification: an operator can identify the affected requests from the summary and understand safe next steps without guessing which historical rows consume capacity. Verify resolved, genuinely in-flight and uncertain outcomes separately under authorized execution.

### UX-11 — Popular implies stronger recommendation evidence than its fallback supplies

**P2 · decision semantics · G3–G4, J3/J5 · high confidence in UI/source mismatch.**

The Chat model picker labels its first category Popular. Its caller ranks by at most 100 workspace request records and otherwise uses a fixed familiar-family ordering, including when history is absent or loading fails. The picker always labels its first eight usable models Popular; it receives no basis/availability indicator. Evidence: E17; `apps/dashboard/src/app/useModelPopularity.ts`, `features/playground/page.tsx`, and `features/playground/components/PlaygroundView.tsx`.

The finding is not that the ranking is completely fabricated or that defaults are undesirable. Recent workspace usage exists as one signal. The problem is undisclosed scope and fallback: an unmeasured default is presented with the same label as observed use.

Proposed direction: distinguish recent workspace usage from default suggestions and unavailable evidence. Do not invent global popularity or benchmark quality. Keep a useful picker when analytics is absent.

Verification: populated history, zero history and failed history retrieval produce honest category meaning. The scope/window are understandable where useful; a request failure must not make a default look like a measured recommendation.

### UX-12 — Product help instructs users to configure a setting the UI has centralized

**P2 · cross-surface task consistency · G2–G3, J2–J4 · high confidence.**

Product Documentation → Customer pricing still instructs an administrator to choose a three-letter currency when creating a customer account. The running installation now uses one configured platform currency. The same guide uses Admin → Customer accounts while navigation says Account balances. These are live served instructions, not merely an obsolete internal implementation note. Evidence: E19; `apps/docs/src/content/docs/admin/pricing.mdx` under Customer account administration. The Payments guide repeats the old account-menu name.

Impact: following the support path asks users to find an absent choice and mismatched destination, undermining the very task the documentation should clarify. This does not establish that the compatible API must remove all historical currency fields.

Proposed direction: reconcile task guidance and deployed documentation with current configuration ownership, while explicitly separating legacy/administrative API contracts. Check generated examples and linked guides when the source task changes.

Verification: following the published operator guide in the supported deployment uses real labels and available choices and preserves currency meaning. Validate the built/served documentation artifact, not only the Markdown source.

### UX-13 — Creating a key omits consequences explained when editing the same limits

**P2 · configuration decision · G3/G6, J3/J7 · high confidence in disclosure mismatch; enforcement not exercised.**

New API key → Limits & access policies shows Tokens/min as a numeric field without explaining its supported-request consequences. The existing-key edit definition explicitly says a finite token limit requires supported text requests with an output-token maximum and blocks video. Creation also labels Spending limit without the lifetime scope explained in the detail view. Evidence: E20, live narrow creation form; `features/keys/components/KeysView.tsx` and `KeyLimits.tsx`.

Impact: a user can reasonably expect a throughput cap but unknowingly choose a setting with protocol eligibility implications. Progressive disclosure is appropriate; the consequence needs to appear when that optional setting is used, not only on a later edit page.

Proposed direction: keep creation concise and disclose the selected policy's material scope/consequences in context. Reuse the same semantics across creation, editing, summaries and downstream errors. Do not remove useful limits or require every user to read all advanced documentation.

Verification: compare finite, unlimited and zero limits in creation/editing. Before committing a finite token limit the user can predict its supported requests; lifetime spending allowances cannot be mistaken for recurring budgets. Confirm actual dispatch behavior separately with authorized fixtures.

### UX-14 — Retained outputs lack a workspace-level discovery and management handoff

**P2 · outcome lifecycle · G4, J5 · medium confidence; saved-output execution remains unverified.**

The product implements explicit output capture into the workspace library, but the inspected dashboard offers no general retained-output inventory. Generations history does consume saved sessions and video tasks, so this is **not** a claim that task history is absent. Workspace Video → Materials instead requires a native Provider/key/model context and represents upstream materials. The only dashboard consumer of `listWorkspaceAssets` lists images inside the video reference picker; it does not expose saved videos. Evidence: E21, live navigation plus `SessionHistory.tsx`, `VideoResult.tsx`, `ImageReferences.tsx`, and the route registry. The shared Tasks/Assets integration is an intended capability in the generation handoff document.

Impact: “Save to workspace” has no matching workspace-library destination for browsing retained videos or managing retained copies independently of remembering the originating conversation. A source conversation can retrieve its retained video, which mitigates the problem; upstream Materials is not an equivalent destination. Current empty/expired data does not demonstrate that a particular user's saved bytes are lost.

Proposed direction: complete the retained-output discovery and management handoff with source-task context, ownership and availability. Decide its placement from the product blueprint; do not add a separate task system or merge upstream materials and retained outputs merely because both are files.

Verification: with authorized retained image and video records, leave the original conversation and locate the intended copy from the product's normal navigation, understand retention and access scope, return to the source, and find supported management actions. Verify expired upstream references separately from retained bytes and deletion. This audit did not create or delete captures.

### UX-15 — Generated ordered lists lose their visible numbering

**P2 · visual meaning and content fidelity · G4, J5 · high confidence.**

An existing saved multi-turn Chat contains actual ordered lists. At 900 × 800 and 390 × 844, their items render as unnumbered indented lines. Read-only DOM inspection confirms `ol` elements with 51, 194 and 138 items, including a continued list with `start="195"`; both the list and its items compute to `list-style-type: none`. Evidence: E24; `styles.css` gives response lists indentation but no marker style. This is independent of whether the model fulfilled the requested item count.

Impact: readers cannot see sequence numbers or continuation numbering, refer to an item by number, or distinguish an ordered procedure from an unordered collection. Correct semantic elements alone did not preserve visual meaning. No screen-reader conformance result is claimed.

Proposed direction: style supported rich content as content, preserving ordered/unordered/nested markers and continuation values within the existing design system. Do not apply list markers indiscriminately to navigation or menu compositions.

Verification: inspect actual rendered ordered, continued, unordered and nested lists, alongside headings, quotations, code, tables and formulas when supported. Confirm visible meaning, narrow-width wrapping, and copy/export fidelity separately. [Tailwind Preflight](https://tailwindcss.com/docs/preflight#lists-are-unstyled) explicitly documents the reset; [W3C content structure](https://www.w3.org/WAI/tutorials/page-structure/content/) supplies the semantic distinction, not evidence of this particular rendering failure.

### UX-16 — Missing modality metadata becomes an affirmative Chat launch

**P2 · capability handoff · G3–G4, J3/J5 · high confidence in launch behavior; request execution untested.**

The catalog lists `x-ai/grok-imagine-video-1.5-lite` with no displayed output modality and offers Try in Chat. Following that link opens the text comparison composer; searching the model picker confirms this route is selected (`aria-pressed=true`). The same route appears in an existing saved successful Video result. Source checks show `ModelTable` chooses Video only when catalog output modalities explicitly contain video; all other cases receive the Chat launch. `playground/page.tsx` likewise admits missing output metadata to Chat as a legacy compatibility path. Evidence: E27.

Impact: absent catalog evidence is converted into a positive protocol choice, and a known video-use route is handed to the text workflow. The audit did not submit a text request, and does not claim its exact rejection or that all metadata-free legacy routes are unusable.

Proposed direction: resolve launch eligibility from current authorized protocol capabilities; keep unresolved capability explicit and provide an appropriate discovery/recovery path. Do not infer modality from the model name or disable every legacy text route without a compatibility strategy. Preserve the correct Seedance catalog → Video handoff observed in E26.

Verification: test text, video, dual-capability and missing/stale-metadata cases. A catalog action and composer agree on supported protocol and selected scope. Failure to load metadata must not silently assert Chat support; authorized request testing is a separate acceptance step.

### UX-17 — Provider usage consumers omit supported media consumption

**P1 · commercial lifecycle completeness · G2/G5, J2/J6 · high confidence in implementation omission; populated commercial-media rendering untested.**

Provider administration supports media offers, but its Usage view renders only `data.consumption`, with input/output token columns. `crates/storage/src/provider_consumption.sql` restricts that collection to `billing_meter='text_tokens'`. The same backend summary separately returns `media_consumption` from non-text Provider earnings, with quantity, meter, dimensions, rates and unpaid amounts. `features/provider-business/admin.tsx` neither declares nor consumes that collection. Evidence: E28, live Usage surface and source contract/consumer comparison. Existing personal traffic is not evidence of missing payable charges.

Further consumer check (E33): the Provider member portal uses the same summary builder through `provider_member_dashboard`, which also returns `media_consumption`; `features/provider-business/page.tsx` declares and renders only text `consumption`. The current account can access the portal and its populated text offers, but current Usage is empty. This extends the omission to the Provider-facing investigation path without claiming an executed media-only dataset.

Impact: the operator's supported media business has no corresponding media-consumption detail in this Provider Usage page. A media-only earning history would still satisfy the UI's empty-text-collection condition for “No consumption in the last 90 days.” This conditional outcome is established by source, not an executed populated fixture. Other financial reports and API access may mitigate investigation; their presence does not make this page's broad claim accurate.

Proposed direction: carry supported billing variants through their investigation and reconciliation surfaces. Show media quantities and rate dimensions with their actual units, or explicitly narrow the text view and link to the relevant supported media evidence. Do not turn media quantities into tokens or expose procurement information in customer pages.

Verification: authorized media-only and mixed text/media commercial histories reconcile with Provider earnings and settlements; the detail explains quantity, agreed rate and unpaid amount. Empty-state wording describes the actual dataset. Confirm customer/Provider/operator visibility separately. No payable fixture or financial transaction was created in this audit.

### UX-18 — Chat discards terminal reasons and conflates finished transport with complete content

**P2 · outcome status and recovery · G4/G5, J5/J6 · high confidence in parser behavior; no new upstream request or live rendered fixture.**

The current `runModel` function reads content and usage but not `finish_reason`; receiving the terminal stream marker leads to `phase: complete`. An isolated offline replay of the unchanged extracted parser with documented `stop`, `length` and `content_filter` cases returned `complete` and discarded the reason in every case. The empty-content cases also returned complete. The render branch labels that phase Complete, yet selects “Waiting for a response…” when content is empty and phase is not streaming/cancelled/failed. Evidence: E29, original parser/render source plus explicitly synthetic protocol fixtures. [OpenRouter's official API overview](https://github.com/OpenRouterTeam/docs/blob/main/api_reference/overview.mdx) documents distinct terminal reasons.

Impact: an output limit or filtered/empty terminal result cannot be distinguished from ordinary completion, and a terminal empty result is represented as still waiting. Users lack the information needed to choose a relevant remedy. The observed historical short lists do **not** establish why those specific requests stopped.

Proposed direction: retain and interpret supported finish reasons through live and saved results, separating transport termination, content outcome and unknown evidence. Explain a relevant next step without automatic paid retries or promises that increasing a limit will resolve every case.

Verification: cover ordinary stop, output limit with partial/empty content, filtered result, malformed response, missing terminal marker, cancellation and absent reason. Reopen persisted results. Offline parser tests establish mechanism only; rendered and genuine authorized request acceptance remain separate.

### UX-19 — A section-local Save can commit hidden changes from another policy section

**P1 · consequential edit scope · G6, J7 · high confidence in draft behavior and save implementation; no policy submitted.**

In Model access, changing the unsaved model restriction to Block all enables Save. Navigating through Policy preserves the draft and shows a generic unsaved-changes notice, while the access card still says No restrictions from the saved policy. Opening External checks then shows an enabled Save despite no detector changes and no available detectors. That page provides no indication that a model restriction is pending. The shared `Guardrails` component submits the entire `draft` from every section's Save handler. Evidence: E30, actual unsaved navigation and screenshot, plus `features/guardrails/page.tsx` draft lifetime and PUT payload.

Impact: saving from an apparently unrelated section can also commit a hidden workspace-wide model block. The section title and local controls do not describe the effective submission scope. No actual block was enabled: Save was never clicked, and reloading cleared the test draft and disabled Save. The existence of one generic notice on the intermediate Policy page is mitigating evidence, but does not expose the pending changes at the commit point.

Proposed direction: make the commit boundary understandable. Either use explicitly section-scoped drafts and saves, or present a whole-policy editing model with a reviewable pending-change summary and discard path at its save point. Preserve atomic policy validation and revision conflict handling; do not assume separate API writes are required.

Verification: edit section A, visit B without editing it, and establish exactly which changes B's action would commit. Repeat with changes in both sections, invalid hidden input, cancellation, reload and conflict. Users can inspect and discard the affected changes before committing. Verify the saved outcome only with authorized isolated fixtures. [NN/g's usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) support visible state, error prevention and recognition at the point of action; they do not mandate a confirmation dialog for every save.

### UX-20 — Provider offer consumers silently treat a capped collection as complete

**P2 · collection completeness and management access · G1/G2/G6, J1/J2/J8 · source-confirmed conditional defect; large-collection execution untested.**

The dashboard summary reads one offer page with limit 1,000 and returns `offers_has_more`. Both administrator and member dashboard types omit that flag. The member portal renders `data.offers.length` as its offer count and provides no continuation; the administrator derives active offers and rate-editor lookup from the same capped array. `provider_offer_page.sql` orders by model alias and explicitly detects an additional record. Evidence: E33, producer/consumer source comparison; the live portal currently shows only 25 offers, so it does not execute the limit boundary.

Impact: beyond the cap, later offers are absent from the management list and its count without a partial-collection indication. The administrator's full-array lookup cannot locate a later offer through this summary. This is a conditional scale defect, not a claim that the current 25-offer installation has missing rows.

Proposed direction: honor completeness metadata and provide scoped search or continuation over the full authorized collection; compute whole-collection totals separately or label visible-page counts accurately. The existing `listProviderOffersPage` and traversing SDK helper demonstrate that a continuation contract already exists. Loading all records at once is not required.

Verification: exercise collections below, at and above the boundary; locate the last permitted offer and open its current terms; distinguish filtered/page counts from totals. Preserve cursor progress and handle changing data explicitly. [GOV.UK pagination guidance](https://design-system.service.gov.uk/components/pagination/) supports reachable continuation when splitting content improves usability/performance, and explicitly avoids pagination for a single-page collection.

### UX-21 — External-check policy previews expose a count instead of the checks being selected

**P2 · consequential selection and historical diagnosis · G6, J7 · live history evidence plus assignment-renderer source; no restore or assignment executed.**

An existing blocked-request record references a key policy version containing an external input check. Opening that saved version through Guardrails History shows only “1 required check · matches and unavailable services block requests”, alongside Restore this version. It does not identify the detector or recipient. `History.tsx` types these bindings as `unknown[]` and renders only their count. The key-policy assignment preview in `KeyGuardrails.tsx` uses the same count-only presentation. It includes an Inspect saved rules link to History, but that destination also omits the check identity. Evidence: E35, live version dialog and source.

Impact: the operator cannot distinguish which external check is implicated in the historical block or which check a restore/assignment would require. A count is insufficient identification at a consequential choice. This is not evidence that restoration bypasses backend validation or consent; no restoration or external processing occurred. The historical input-rule version, by contrast, explicitly names its email-address blocking rule.

Proposed direction: identify the saved check and expose the processing information relevant to the decision. Distinguish historical binding from current configuration/availability; when details are no longer resolvable, say so rather than substituting present-day terms as historical fact. Preserve backend validation and applicable consent. The UI need not display internal fingerprints or raw identifiers.

Verification: distinguish two saved policies with equal check counts but different recipients/configurations; inspect available, changed and unavailable bindings before restore or assignment. Confirm the selected policy scope and actual current eligibility in an authorized fixture separately. NN/g visibility, recognition and error-prevention criteria support reviewable consequences; they do not require a separate confirmation for every policy operation.


## Implementation verification — payment configuration and local guidance

The payment gateway inventory now uses responsive cards with gateway identity, configuration state and the available action. The visual reference is the inspected [Stripe App Marketplace payment gateway catalog](https://marketplace.stripe.com/?category=payment_gateways): identity mark, name, short purpose and secondary metadata, adapted to Niu's management actions and installed Card primitives. Stripe and Alipay/WeChat marks use installed Tabler brand icons; ZhifuX uses its official website's unmodified white wordmark on a purple background; the English gateway name follows the user's correction. Server-managed integrations distinguish configured credentials from verified checkout readiness.

Mock payments is a first-class development gateway with an explicit saved enable/disable action. The card, configuration dialog, checkout and active application warning explain that only payments are simulated: LLM calls still incur upstream charges and API keys must remain private. Verified in an isolated development installation: disabled → enabled → disabled, saved state after reload, immediate application warning, EPay and Mock dialogs, desktop cards and a 390px single-column layout. No live payment or Provider credentials were used. This does **not** close UX-04's installation-wide admission gate.

- **UX-07: local presentation repaired.** The pool introduction now explains the user goal; selection and failover details move to an optional help popover. Desktop and 390px inspection confirmed readable text, contained popover and keyboard dismissal. This does not add supply or claim a working pool in an empty fixture.
- **UX-13: creation disclosure repaired.** Creation now explains lifetime spending and finite token-limit protocol consequences beside the relevant fields, with accessible descriptions. Desktop and 390px inspection confirmed the expanded form remains readable and scrollable. Automated key creation tests pass. Actual dispatch enforcement remains a separate backend acceptance concern.

Validation: TypeScript check; 45 focused frontend tests covering payment configuration, top-ups, pools and key creation; five mock merchant tests; debug gateway build and the isolated native payment acceptance suite, including disabled checkout status, unauthorized activation rejection, signed callbacks and exactly-once credit. The frontend suite passed with a single worker and an increased per-test timeout after resource-contention timeouts during concurrent compilation. These checks do not establish whole-product readiness.
