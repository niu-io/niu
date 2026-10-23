# Review-method refinement record

Date: 2026-10-20. Purpose: improve the locally installed experimental UX review method through observed misses. Product remains read-only. This record extends the initial audit; it does not turn the revised skill into a validated release standard.

## Why the initial review stopped too early

The first pass documented coverage gaps accurately but used that documentation as an ending despite several feasible read-only checks remaining. It inspected mostly page text, an empty responsive page, and one successful result. Existing instructions already required visual/role/state coverage; adding another general instruction to be thorough would not address the execution failure.

## Learning cycles

| Cycle | New evidence / finding | Why it was missed | General method change | Counterexample / limitation |
| --- | --- | --- | --- | --- |
| A: rendered and operational coverage | UX-09 dark Provider mark; UX-10 unresolved request summaries | DOM inspection substituted for visual inspection; key detail was left uncovered; generic recovery criterion was not applied to capacity summaries | Require distinct rendered-family samples and exact-record/owner handoff from actionable aggregates | Account balances horizontally scrolls at 900px, but has a visible scrollbar. Scroll alone is not a confirmed defect; keep it a task-testing candidate |
| B: evidence behind labels | UX-11 Popular fallback | First pass saw a familiar label without tracing its source, scope or fallback | Check ranking/recommendation/status provenance and zero/error-data fallback | Activity's model charts explicitly describe the range and excluded unknown usage; no invented ranking defect there |
| C: support surfaces | UX-12 customer-facing currency instructions are stale | Repository intent was read, but the served customer guide was not walked | Include task-critical help/examples and separately deployed artifacts in the actual handoff | Payments guide clearly distinguishes configuration from merchant activation; it does not promise unsupported dashboard editors |
| D: multiple entry points | UX-13 key creation omits consequences present in editing | A setting was implicitly treated as one surface; creation and edit were not compared | Compare consequential concepts across creation, edit, summary, use and help | Output-rules editor already explains blocked protocols before save and offers a clearly scoped local pattern test |

These additions are operational applications of existing task, consistency, status and recovery criteria. Product-specific findings remain here; the shared skill does not prescribe Niu's labels, prices, menu placement or exact dimensions.

## Rejected or narrowed suspicions

- **Account balances requires horizontal scrolling:** observed at 900 × 800, with the action column off the initial viewport. A visible scrollbar and legitimate comparison needs prevent classifying scrolling alone as a defect. Further task observation may establish a navigation/association problem.
- **Help loses the selected workspace:** the help shell's link temporarily uses a default route, but an actual round trip from a non-default workspace returned to that workspace. Do not infer a user-visible scope loss from an intermediate href.
- **Qualification fingerprints imply a bad upload workflow:** the dialog explicitly identifies confidential external evidence and explains that recording an administrator review does not independently establish rights. This is a legitimate boundary; do not force confidential document uploads into the public product.
- **A successful video with an expired preview is contradictory:** the existing view separates completed generation from unavailable preview, offers Restore video, and distinguishes observed lifecycle from transport timing. No automatic regeneration was observed or invoked. Restoration itself remains unverified.
- **A missing saved key secret is a UX failure:** the creation source explicitly provides one-time secret capture. Do not recommend revealing it again just to improve rediscovery.
- **Unknown request usage is a data-display defect:** uncertain details explicitly explain interruption and retain observed timing. Unknown is valid; the unresolved-summary handoff is the narrower issue in UX-10.

## Execution boundaries

Only existing records and unsaved UI forms were inspected. No new access, funds, configuration, policy, generation, upstream status refresh or document upload was performed. The administrator role still cannot establish ordinary-user onboarding, authorization or paid-request acceptance. Current data is predominantly personal test traffic; no commercial evidence was fabricated.

New visual checks include the populated Provider directory and key details at desktop, balances at intermediate width, saved Chat, model-picker dialog, saved Video and details, and expanded key-creation form at narrow width. Additional live reads cover Activity scope/drilldown, uncertain request details, policy/output-rules pages, Provider qualification/settlements/members and served pricing/payment help. These extend rather than erase earlier unverified branches.

## Validation status

The installed skill now routes comprehensive/refinement work to `references/review-convergence.md`. Its structure validator passes. Structural validation checks packaging only. The new probes have reproduced missed cases, found issues on previously uncovered surfaces and rejected plausible false positives; this is local behavioral evidence, not independent or cross-product validation.

No claim of whole-product diagnostic saturation is justified yet: cycles C and D continued to find genuine problems. The focused stabilization results below do not close the remaining branch coverage. No fixed number of documents or findings substitutes for that evidence.

## Earlier focused stabilization passes

After cycle D, two complementary checks produced no additional independent confirmed findings:

1. **Configuration semantics:** reopened the actual token-limit editor and compared its consequence disclosure with creation (UX-13 reproduced live); inspected lifetime key-budget editing and IP-access editing. Units, zero/unlimited meanings, budget scope and access consequences were explicit in these editors. The creation mismatch remains open; it was not counted twice.
2. **Outcome-to-scope check:** inspected workspace Billing at 390 × 844, expanded the unsaved workspace-limit editor, and checked Rates. Workspace budget meaning and no-periodic-reset behavior agreed with the key-budget scope distinction. The empty rates state does not resolve the earlier personal/commercial ambiguity (UX-05), but did not establish a separate new failure. Earlier non-default help round trip and Activity-to-Logs scope checks also supplied counterevidence to context-loss suspicions.

This is **local stabilization of the revised probes, not whole-product saturation**. The audit still has unexecuted customer-role, commercial and persistence branches, as well as incomplete cross-theme/accessibility coverage. They cannot be cleared by repeatedly reading the same administrator data. No claim that all genuine product issues have been found is made.

The earlier checkpoint source revision remains `241872d0` with concurrent working-tree changes. Installed skill frontmatter/scaffold validation passes and all local Markdown references resolve. Screenshot evidence is retained outside the public repository: `providers-dark-1280.png`, `key-create-390.png`, and `key-token-edit-1280.png`. No product implementation was changed, and the skill was not synchronized to the shared repository.

## Continued lifecycle pass

Cycle E found UX-14 by tracing the useful result beyond its producing screen. The existing method already said to revisit saved work, but the first review stopped at reading a saved conversation. The missed distinction is between a record remaining accessible in its original context and a user finding/managing its retained output later. The convergence probe is strengthened to test departure, rediscovery, ownership and lifecycle management where these are part of the intended outcome.

Counterevidence narrowed the finding: `SessionHistory` already consumes task inventory; `VideoResult` already captures and reads retained bytes. Neither missing task history nor absent persistence is supported. Only the image-reference picker lists workspace library assets, and native Provider Materials is a different object/scope. Actual retained-copy playback and deletion were not executed.

Additional holdouts found no new confirmed defect: workspace creation transliterates a mixed Chinese/English name with whitespace/punctuation correctly and preserves a manually edited slug after a name change; the unsaved draft was cancelled. The populated narrow Users table keeps role and action visible while moving status beneath identity. Access details explain single-workspace versus organization-wide revocation. Duplicate historical display names are a candidate for task research, not automatically a confirmed identity failure: detail activity includes timestamps and no consequential action was taken. Branding Theme and preview were opened without modifying or saving appearance.

Cycle F found UX-15 on saved long content: page-family and viewport sampling still missed semantic content varieties. The method's existing long-text instruction was insufficiently operational; a short successful response cannot stand in for a rich-content renderer. The visual guide now asks reviewers to preserve the meaning of supported content structures and compare rendered markers/hierarchy with semantic structure. Tailwind's documented list reset and W3C content-structure guidance support this check. A navigation list without decorative bullets is a legitimate counterexample.

The audit inventory supplies a lifecycle counterexample: its purpose is historical evidence, not editing or deleting records. It offers category filtering and pagination, and the narrow composition preserves actor/target context. No requirement for an audit asset library or user deletion follows from the output-lifecycle probe. The separate personal Appearance panel describes device-following behavior; no preference was changed.

A source-level candidate remains **unconfirmed in an executed outcome**: Chat parsing does not retain `finish_reason`, and terminal responses map to Complete. The inspected historical lists end before the requested counts, but that alone cannot prove output-limit truncation rather than model behavior. Verify an authorized actual length-limited response before attributing a historical cause or claiming a tested recovery failure. Do not inflate the confirmed issue count with this candidate.

## Sampling challenge and capability fallback

W3C WCAG-EM 2.0 (23 July 2026) was inspected for its structured/random samples and complete-process guidance. The skill now adopts the sampling challenge explicitly as a UX adaptation, without claiming WCAG-EM compliance. A compact sample tuple distinguishes view/transition, actor, state, content, viewport/input and evidence strength.

For a small supplementary UX check, a seeded selection (`20261020`) from eight feasible read-only candidate states chose Platform settings narrow layout and Model filter zero-results recovery. The candidate list was workspace overview chart keyboard interaction, Provider usage narrow, Provider settings form, workspace settings narrow, personal About, model zero-results, key filter recovery, and platform settings narrow. This is a limited challenge of the prior selection, not a formal WCAG random sample or full-inventory sampling claim. Both chosen states worked. Expanded catalog inspection then found UX-16: missing modality metadata was treated as Chat eligibility.

Cycle G exposes an unapplied existing capability/fallback criterion, not a need for a new product-specific rule. The decision probe is clarified to test unknown/stale capability data at the actual downstream action. Seedance's proper Video launch is the counterexample. Model names alone cannot establish modality; the observed wrong handoff is supported by current UI, fallback source and an existing saved video result. Actual request rejection remains untested.

Cycle H found UX-17 while following a supported business variant into its downstream financial view. The initial pass saw an empty usage page and stopped; it did not compare the producer's supported variants with the result/report consumers. The backend exposes separate text and media consumption, but the Provider Usage consumer only handles text. The method now traces materially different variants through their end-to-end consumers, instead of treating one successful modality or dataset as representative. Missing live commercial fixtures still limit execution claims.

This differs from merely asking for more columns: the failure is omission of an intended commercial outcome from its investigation surface. Genuine counterexamples include purpose-specific reports with explicit scope and a usable handoff, or intentionally unavailable capabilities outside the blueprint. No universal requirement for a combined report is introduced.

## Variant and visual counterchecks after cycle H

- Customer statement source explicitly reads and renders `media_lines`, including pagination, retry and an empty-state condition that considers both text and media. This is source counterevidence against a blanket claim that all finance UI omits media. Actual populated statements remain unverified; UX-17 stays limited to Provider Usage.
- The remaining supplementary candidates were inspected: workspace chart keyboard interaction exposes a date/count tooltip; workspace settings is readable at 390px and explains why the default workspace cannot be deleted; a dismissed key-search popover retains the no-match query and Clear search restores the five existing keys; Provider Settings shows business/API ownership and repeats UX-09's dark-logo issue; About fits at 390px and identifies a development build honestly.
- Documentation at 320 × 800 has matching root scroll/client widths of 305 CSS pixels inside its scrollbar-bearing iframe. The example code scrolls within its own block. This is a scoped reflow counterexample, not whole-site WCAG conformance. Temporary viewport overrides were reset.

The expanded review still finds new mechanisms (cycles F–H), so the old focused stabilization cannot support whole-product saturation. Remaining role, commercial, persistence and populated-media gates require evidence beyond these administrator/read-only samples. No new implementation or financial operation was authorized by the audit.

## Limited transfer check outside the product

A public-service front door was inspected at [GOV.UK passport application](https://www.gov.uk/apply-renew-passport), followed to the first eligibility question and its delegated-applicant disclosure. No applicant answer, personal information, application or payment was submitted. The starting page explicitly separates online, assisted and postal routes; the first service view clarifies whose circumstances to answer for. These are legitimate external/actor handoffs, not failures merely because the service spans channels. The typography, native radio choices and focused disclosure need not imitate an administration dashboard.

This narrow counterexample exercises task ownership, branch guidance and restraint about prescribed UI patterns in a different domain. It does not establish usability of the complete passport service or independent general validation of the skill. No new blanket feature rule was added. The transfer check was observational; it was not a user study.

Cycle I narrows and upgrades the earlier finish-reason candidate after additional evidence. Official protocol documentation establishes valid terminal alternatives; an isolated replay of the original extracted `runModel` with stop, length and content-filter inputs confirms all become complete and lose their reason. The empty-content renderer branch is source-inspected, not browser-executed with a fabricated response. UX-18 records that precise mechanism; the cause of the historical list lengths remains unconfirmed. This demonstrates why source evidence, synthetic replay, actual rendered observation and genuine upstream acceptance must remain separate rather than treating all as either worthless or fully verified.

The existing status criterion is made concrete: terminal transport success is not proof of a complete useful result. This generalizes to partial batches and asynchronously processed outcomes without prescribing provider-specific labels or automatic retries.

The terminal-state replay also checked a stream without its terminal marker and a stream carrying an explicit error payload. Both return failed, unlike valid terminal reasons that are dropped. This limits UX-18 to outcome classification rather than alleging that every transport failure is hidden. Six offline cases were executed; none contacted a gateway or upstream. The extracted helper and synthetic results remain outside the public tree.

Current checkpoint: 18 proposed findings; local skill packaging validation passes; local Markdown references resolve. Source revision is still `241872d0` with concurrent working-tree changes. No product fix was implemented and no shared skill repository synchronization was performed. Actual role transitions, configuration commits, customer charges, media capture/restore/deletion, cross-browser persistence and other unavailable states retain their explicit evidence gates. The iteration log documents continued discovery, not a claim that the whole product has reached saturation.

## Cycle J — Edit boundaries across screens

A further J7 pass found UX-19. Earlier policy review opened individual editors but never carried an unsaved change from one section to another. A generic dirty-state criterion existed, yet was not applied to the submission boundary. An access restriction draft survives navigation into External checks, whose Save commits the shared policy without displaying the hidden access change. The Policy intermediary does show an unsaved notice; the finding therefore concerns undisclosed commit scope, not universal absence of dirty feedback. No save was invoked, and reload visibly returned Save to disabled.

The skill now asks reviewers to follow consequential drafts across section navigation and compare pending, displayed and submitted scopes. This operationalizes existing status/error-prevention/recognition criteria. A legitimate atomic multi-section editor with a visible overall scope and reviewable pending changes is a counterexample; autosaved filters and explicitly disposable drafts do not require blanket confirmation dialogs. The screenshot remains outside the repository. Current count: 19 findings; no whole-product convergence claim.

Cycle J forward check: an unsaved request-rate limit in an existing key dialog was cancelled. The concurrency editor remained empty with Save disabled; reopening the request-rate editor also showed its original empty value and disabled Save. Source confirms each limit submits only its own field and revision. This is an executed cancellation counterexample, not evidence of saved enforcement. Key detail at 320px reflows without root overflow. The coverage register was reconciled with later evidence and its scattered evidence tables consolidated, so later passes do not mistake already-inspected editors for unvisited branches.

## Further bounded counterchecks

Following cycle J, the isolated key-limit cancellation flow and the historical failed-request investigation produced no further confirmed independent issue. The failure drawer distinguishes HTTP delivery failure from uncertain Provider execution and unavailable finish/body evidence; a cause-specific remedy cannot be evaluated from absent evidence. At 390px the failure drawer keeps timing/status readable and previous/next controls reachable; Escape returns focus to the request row. This is not an assertion that every error has adequate recovery. The log consumer also handles supplied finish reasons in source, narrowing UX-18 to Chat's own result pipeline rather than every presentation of a request.

These checks provide local negative evidence for the strengthened edit-scope and outcome-status probes. They do not supersede known findings or close whole-product gates. The current browser tooling exposes viewport simulation but no tab-level theme or zoom simulation; no personal appearance preference was changed to manufacture those states. Remaining material execution evidence includes independent customer/Provider roles, commercial media-only/mixed records, retained output fixtures, committed edits/conflicts and cross-browser revisit. Product changes and operations remain outside this audit's authorization.

## Cycle K — Revalidate blockers and collection completeness

The first goal continuation re-read the authoritative product direction, current routes and the historical 35-family workflow audit. That older audit is useful for locating omitted families, not current verification or permission to repeat its mutations. Login recovery remains a source-level question: absence of a self-service reset alone does not establish a defect without checking the intended external recovery contract. No session was signed out or credential changed.

The Provider portal was incorrectly treated as generally inaccessible because independent role execution was missing. A direct authorized read succeeded with the current account. Overview, 25 populated offers, empty Usage and Settlements were inspected; offers also render at 390px. Distinct Provider-only authorization remains unverified, but available rendered evidence must not be left undone. The strengthened method requires checking the specific alleged blocker and separately continuing available source/contract evidence.

The portal is a second consumer of the same ignored `media_consumption` collection, extending UX-17 rather than inflating the issue count. Its consumed text statement also omits supplied reasoning/cache-write quantities and context thresholds; that remains a follow-up manifestation to assess against a populated statement, not a claim of incorrect arithmetic. Current offers do display advanced text rates, a useful counterexample.

UX-20 is a separate collection completeness mechanism: the producer explicitly signals truncation beyond 1,000 offers, whereas both dashboard consumers omit the signal. The current live 25-offer sample cannot expose that boundary. SDK pagination is source counterevidence to any claim that no continuation API exists. Settlements explicitly says Latest 100, illustrating an honestly scoped preview; this does not prove older settlement investigation is sufficient. The general probe distinguishes visible-page counts, totals and completeness, supported by GOV.UK pagination guidance, without mandating one pagination widget.

Current findings: 20. Local skill refinement and documentation progressed; the goal remains active. Next feasible work: reconcile all surface families against current routes; inspect the remaining accessible Provider scope, saved generation history/lifecycle and not-found/return paths. Independent roles, paid operations and commits retain their separate gates. No product mutation or shared-repository synchronization occurred.

## Cycle L — Cross-scope fixture discovery and consequential previews

Workspace not-found recovery was executed: an invalid child path retained the workspace, and Return to overview rendered that workspace's Overview. No unrelated scope substitution occurred. This is a bounded positive case, not broad legacy-route qualification.

The existing workspace directory then exposed a populated governance scope. It contained an active policy, two historical block records and eight policy revisions. This corrects the earlier assumption that populated denial evidence was unavailable. Narrow rows preserve cause, key, time and policy versions. An input block could be traced via History to its named email-address rule without changing anything.

UX-21 emerged for the external-check branch: the corresponding saved version displays only a check count at the Restore decision. The assignment renderer has the same source omission. The missed mechanism is loss of object identity and consequences when a detailed configuration is compressed into a selection/restore preview, not absence of every possible historical field. Equal counts cannot distinguish different external services. Backend activation/consent enforcement was neither exercised nor alleged to fail.

The method is strengthened to inspect consequential previews, including restoration/assignment, and distinguish saved references from currently resolvable details. A named local input-rule preview is an observed counterexample. No separate confirmation requirement or raw-identifier display rule is introduced. Screenshot evidence is retained privately. Current findings: 21; no stable-scope saturation yet.

Cycle L continuation: a non-default workspace's legacy Activity link normalized to Usage while preserving the workspace, inert query marker and fragment; the breadcrumb confirmed the same scope. This supplies a current compatibility counterexample rather than relying on the older workflow audit. The key assignment preview does offer an Inspect saved rules link; source inspection confirms it leads to the same History presentation, so it does not resolve UX-21's missing external-check identity. This mitigating link is preserved in the finding.

Next feasible selection: inspect the second accessible Provider scope and existing saved generation history across workspaces before claiming missing populated fixtures. Remaining account/return paths and public-help entry points also stay open. This turn produced a real new finding and stronger positive evidence; it is progress, not a blocked or saturation turn.

## Cycle M — Existing scope and saved-state counterchecks

The second Provider listed by the current account was selected through the actual menu. Its Overview had no earnings and Models had no offers. The current two-scope commercial-data limitation is now based on inspection rather than a default-scope assumption; it is not proof that every possible backend record is empty.

Generations history was inspected from a non-default workspace, and its archived-session dialog contained no Chat or Video entries. A saved Chat showed an ordinary completed first response and a distinct cancelled-before-output second response; the latter preserves unknown tokens and charge. This contradicts a broad allegation that every terminal state is classified Complete. The list-marker defect repeats UX-15, not a new issue.

The visible saved Video remains Succeeded with an expired preview. Its available actions provide original-task restoration but no retained-copy status item; source confirms retained copies have distinct status/load paths. No restoration, capture, deletion or status refresh was invoked. Video details distinguish observed completion (including polling delay) from transport measurements and show own-account billing. These are positive outcome/measurement distinctions to preserve. No inference is made that saved generation metadata or all retained assets are absent.

This pass found no new independent confirmed problem and therefore adds no new skill rule. It completes additional scoped evidence, not whole-product saturation: account/return, unavailable-scope and help entry checks remain feasible; independent roles, genuine paid reconciliation and retained-output execution remain gated. Findings remain 21. The goal stays active.

Cycle M additional account check: opening Settings from the saved Video retained its underlying context. The expanded password form explains all-device sign-out and minimum length; no credential was entered. Cancel hides the form, and closing Settings returns to the same saved Video with its workspace/intent/key/task route context. This is a live return-path and consequence-disclosure check, not password-change or sign-out verification. No new independent finding arose.

## Cycle N — Explicit scope recovery and public access guidance

An explicitly unavailable workspace did not silently inherit the previous scope. It showed a scoped-unavailable message and offered an explicit available-workspace action, which was followed successfully. The signed-in Login route was actually visited and redirected to the default workspace, replacing the earlier source-only inference. Installation administration was rendered at 390px without entering a credential; its public Documentation link opened `/docs/`.

The served Access & roles guide distinguishes installation bootstrap, authorized platform members, scoped customer operators and Provider members, and explicitly describes unsupported self-registration/OIDC. This is support-surface evidence, not backend authorization proof. A complete forgotten-password recovery contract remains unresolved; absence of an automatic reset button alone is not promoted to a confirmed defect.

No new confirmed independent issue was found. Cycles M and N provide complementary scoped negative evidence, but outstanding feasible visual/source synthesis and final requirement audit still prevent marking this goal complete. Explicitly unavailable execution branches are review limitations, not product passes; an eventually completed read-only review will remain distinct from product readiness.

## Cycle O — Visual synthesis and public catalog handoff

Separated rendered visual evidence from structural and state-model findings in the visual assessment. Current narrow-layout counterexamples remain valid; they do not clear rich-content rendering or populated commercial reports. The accumulated convergence probes were reviewed for applicability: they already distinguish legitimate external operations, recent-item previews, atomic saves and missing evidence. No new rule was added merely to increase checklist size.

Followed the actual public Models link from served documentation. The settled public catalog has no published models and explicitly separates public discovery from workspace authorization and customer pricing. Its workspace action resolves the default alias to the current named workspace's keys. This is a valid public-to-authenticated handoff in the existing session, not anonymous access testing. A narrow screenshot was not sufficiently legible for detailed visual evaluation; it is excluded from visual clearance.

No new independent finding was confirmed. Final finding consistency, remaining feasible content samples and the completion audit remain open; no whole-product saturation claim is made.

## Cycle P — Finding calibration and partial-discovery counterexample

Read all 21 findings against the six goals and eight journeys. Each includes evidence strength, an impact distinct from observation, a proposed direction and an observable verification condition. Added the missing definition of P3. Retained UX-17 and UX-20 as distinct mechanisms: omitted billing variants versus truncated collections; neither claims a live populated boundary was executed. UX-06 and UX-14 likewise concern different objects: native tools navigation versus retained-result discovery. Source-only terminal cases in UX-18 remain explicitly synthetic; historical response length is not attributed to a finish reason.

Rechecked current Provider consumers and the Guardrails whole-draft payload. They still support the respective conditional findings. The review retains the six P1 task risks without converting them into demonstrated security or financial-integrity failures. Their verification requires the roles and fixtures stated in each finding, not only a screenshot or renamed control.

Returned to native Video instead of accepting the prior discovery error as a feature-wide blocker. Selecting an existing key and discovered model exposed an expired verification record. Materials had no groups or saved operations in that context; the screen explicitly distinguishes saved request status from material readiness. No verification, upstream status refresh or write was performed. This closes the feasible existing-history read and supplies a counterexample to overbroad blocker classification.

The method already requires verifying the specific blocker and continuing unaffected scopes. This was an application/coverage miss, not an absent principle: retain the existing rule rather than add a product-specific rule or a redundant checklist item. No new independent product finding was confirmed. Remaining rich-content sampling and final artifact/completion verification remain open.

Cycle P content follow-through: opened the remaining six visible short Chat histories instead of inferring their contents from titles. Five are simple completed acknowledgements; one is an explicit failure. None supplies further rich structures. All nine visible histories are now accounted for, including the two prior list conversations and Video. Additional renderer variants require an authorized fixture; no generation was submitted. The local skill structure validator passes. Final artifact links and full completion reconciliation remain to be checked.

## Post-review correction — Pricing authority and implementation bias

The user challenged UX-01's assumption that workspace-level pricing is needed. The original review inferred a required enrollment workflow from existing SDK methods and dashboard gaps. That inference violated the skill's vision-first rule: implementation presence is not product authority. The enrollment-UI recommendation is withdrawn, and UX-01 now addresses the unsupported pricing layer itself. Platform model prices are the default; workspace access and limits remain separate. Exceptional contract prices require a real business need.

Updated the blueprint, UX-02 dependency, repair order, summary and coverage gates so the correction does not remain isolated in one finding. Historical E02 observations remain intact. No runtime migration or product code change was made. This correction is contrary evidence to the earlier confidence in bounded review convergence: the prior no-new passes did not independently challenge this product-model assumption.

## Post-review correction — Global payment prerequisite

The user clarified that valid payment setup is a hard installation-wide prerequisite for any workspace feature. UX-04 previously addressed only a local recovery dead end. That recommendation is superseded by a global readiness gate with administrator setup/recovery access. The blueprint, acceptance sequence and coverage now reflect the required ordering. Individual balance shortages or failed transactions remain separate from installation readiness.

The review missed the level at which the prerequisite belongs: finding a downstream warning is not enough when the product should prevent entry into the dependent workflow. No global rule that every product needs payments is inferred. This is Niu-specific product authority, and no implementation or payment configuration was changed.
