# UX review coverage — 2026-10-20

Baseline: local running dashboard and gateway, working tree based on `241872d0` with concurrent uncommitted changes. This is not a reproducible release artifact. Existing data, installation-administrator access and the current dark appearance were used. Temporary unsaved form drafts were changed and discarded; no application form was submitted; no credentials, funds, qualification, configuration or generation were created. Read-only discovery cannot establish saved outcomes or ordinary-role authorization.

## Journey register

| Journey / goal | Initial condition and prerequisites | Expected useful outcome | Branches inspected / evidence | Status and remaining gate |
| --- | --- | --- | --- | --- |
| J1 / G1 Supply | Existing personal connections; commercial qualification absent | Know connected supply, intended purpose and next prerequisite | Directory, Provider overview, keys, route list and add-key form; E01, E09 | Partially inspected. Connection creation, live verification, qualification and failover unverified |
| J2 / G2 Sell a model | No standard/workspace price in sampled scope; existing private routes | Effective eligible customer offer | Standard/workspace pricing, text publish form, organization media editor; E02–03 | UX-01 corrected to an unsupported pricing-layer finding; UX-02 placement gap remains. Platform-price publication and charged request unverified |
| J3 / G3 Customer first use | Existing company and workspace, administrator session | Separate customer access, scoped key, known usable model | Organization, add-user form, balance directory, catalog/detail and client example; E03–04, E07, E11 | Partially inspected; company onboarding handoff gap. New customer sign-in and key creation not executed |
| J4 / G3 Fund and resume | Zero funds, online top-ups unavailable | Find valid funding or escalation and resume | Billing warning, Payments unavailable, gateway directory; E05, E10 | UX-04 corrected: workspace features are exposed without the user-required global payment setup gate. Payment activation, gate enforcement, settlement and resumed request unverified |
| J5 / G4 Generate and revisit | Existing saved personal Chat/video history | Useful saved output with recoverable context | Saved Chat/video read, task history, retained-output consumers, rich-content rendering and terminal-parser replay; E06, E08, E21, E24, E29 | Saved Chat read verified; UX-14/15/18 document lifecycle/rendering/outcome gaps with distinct evidence strengths. New generation, media capture/playback, cross-browser and uncertain-submit recovery unverified |
| J6 / G5 Investigate | Saved completed personal Chat request | Relevant timing, outcome and charge evidence | Inspect request opened corresponding log detail; existing list includes uncertain/failed records; E06 | Personal result-to-log and historical failed-detail read verified (E32); underlying cause unavailable in that record. Actual remediation, commercial charge reconciliation and refunds unverified |
| J7 / G6 Control usage | Workspace policy not configured | Scope-understandable policy and denial recovery | Guardrails overview, policy sections and unsaved cross-section navigation; key-limit cancellation; E12, E18, E30–31 | Hidden commit scope confirmed (UX-19). Historical denial-to-version inspection now observed (E35). Saved enforcement, conflict execution and actual recovery unverified |
| J8 / G6 Operate platform | Existing installation, mixed configured/unconfigured capabilities | Understand supported config and operational records | Settings, Branding, gateway directory, balances, financial reports, audit list; E10–13 | Read-only overview and selected form/preview coverage (E23, E25, E28). Installation/upgrade, commits, exports and Provider-role operations unverified |

The missing execution branches are not inferred defects. They are explicit limits on readiness. Existing historical verification in release documents is useful prior evidence, not a current-run pass.

## Evidence register

Evidence is summarized without private identifiers, account records or machine paths. UI observations were taken from rendered pages/DOM; source inspection is distinguished below. Browser images were inspected in the review session, not published into the public repository.

| ID | Surface and observed state | Evidence / result |
| --- | --- | --- |
| E01 | Admin Providers, selected Provider overview/API keys, route dialog, add-key form. Credentials/routes present; commercial qualification missing; private routes available | Live UI; mapping editor source explains personal scope |
| E02 | Admin Pricing standard empty state; workspace/company selector; text publication dialog with token-price fields | Live UI; retail/customer pricing source; SDK enrollment methods |
| E03 | Account → Organization settings; workspaces and administrator-only media selling rates; no-eligible-media-model publication dialog | Live UI; organization page ownership gate |
| E04 | Workspace Users and Add a user dialog: role, temporary-token expiry and explicit no-email-invitation explanation | Live UI, no submission |
| E05 | Settings Billing: insufficient funds without funding action. Payments: unavailable online top-ups with history/refresh | Live UI |
| E06 | Generations saved Chat response and history links; Inspect request opens populated request-detail dialog with timing, Own API key attribution and retention explanation | Live UI and URL inspection, no generation or upstream refresh |
| E07 | Workspace model catalog and one text model detail: descriptions/capabilities, Try in Chat, unpublished prices, key creation link, client example | Live UI; launch and actual key creation not executed |
| E08 | Workspace Video: Materials/Human verification, key/model context, partial discovery error identifying source-address restriction | Live UI and 1280 × 720 screenshot |
| E09 | Model pools empty state at 900 × 800 and 390 × 844; narrow create dialog; Escape dismissal restores Create model pool focus | Live screenshots, DOM and keyboard check |
| E10 | Payment gateways: server-managed supported/unconfigured rows without next action; EPay Configure available | Live UI; release workflow checklist documents server ownership |
| E11 | Account balances lists existing company funds/credit/actions without company creation entry | Live UI; company-creation contract; dashboard consumer search |
| E12 | Guardrails unconfigured overview with Configure, History and Blocked requests | Live UI; enforcement not exercised |
| E13 | Platform currency in Admin Settings; Branding fields/preview; financial empty commercial report excludes personal use; populated audit list explains coverage | Live UI overview only |
| E14 | OpenRouter public model directory includes search, modality filters and model price units alongside descriptions | Actual reference page inspected; no account changes |
| E15 | Populated Provider directory, dark, 1280 × 720 screenshot | UX-09 visual asset issue |
| E16 | Existing key details and limit-component source | UX-10 missing exact-record handoff; detail URL itself uses a slug |
| E17 | Chat picker at 390 × 844 plus ranking hook/caller source | UX-11 unsupported fallback meaning; overlay fits |
| E18 | Existing Video expired-preview state/details, Activity overview/scoped logs, uncertain request detail, policy/output rules, Provider review/members/settlements | Positive/negative counterevidence in iterations; no mutations or upstream refresh |
| E19 | Product Help pricing/payments guides, rendered iframe and source | UX-12 stale instructions; non-default workspace help round trip preserves scope |
| E20 | Key creation with advanced controls expanded, 390 × 844; creation/edit source comparison | UX-13 missing consequence disclosure; no key created |
| E21 | Saved Video actions; Generations history and Workspace Video Materials; current route registry and task/capture/library consumers | UX-14 narrows the missing handoff to retained output inventory, not absent task history or missing storage |
| E22 | Unsaved workspace creation with mixed Chinese/English, whitespace and punctuation; manual slug then renamed draft; draft cancelled | Pinyin suggestion and manual-edit preservation verified; no creation/collision persistence claim |
| E23 | Populated Users at 390 × 844; existing active/revoked access dialogs; Branding Theme and Preview opened without changing settings | Narrow list keeps identity/status/actions together; access dialog states organization/workspace scope. Theme distinguishes default appearance from personal preference; preview only inspected |
| E24 | Saved long multi-turn Chat at 900 × 800 and 390 × 844; DOM list semantics and computed marker style; screenshot retained outside repository | UX-15 confirmed. No generation or prompt edit performed |
| E25 | Audit category filter and populated narrow layout; personal Appearance panel; comparison implementation search | Audit actor/target remain visible in narrow rows; appearance ownership clear. Comparison capability exists, so its entry label is not an unsupported promise |
| E26 | Served Quickstart at desktop/narrow, ordered-list computed style; video output filter at 900/390, Seedance detail and Video launch, additional settings opened | Docs list markers are decimal. Video filter is visible/removable; Seedance/workspace handoff retained. Existing draft read, no prompt or controls edited and no estimate/generation invoked |
| E27 | Supplemental settings390 and model no-match/recovery checks; Grok video route catalog launch and selected Chat picker button; source fallback inspection | Settings fits and zero-results has Clear filters. UX-16 discovered while expanding catalog variation; no request sent |
| E28 | Workspace chart ArrowRight exposes tooltip date range/count; workspace settings390; key no-match search survives Escape and Clear search restores five keys; Provider Usage/Settings390; backend consumption collections versus UI | Keyboard data read and filter recovery work. UX-09 repeats in logo preview. UX-17 is a source-confirmed missing media-consumption consumer, with actual commercial data untested |
| E29 | Original Chat parser extracted without behavior changes and replayed offline with documented synthetic terminal cases; renderer inspected | UX-18 confirmed at parser/source level. No browser fixture injection, model request, key use, product-file edit or historical-cause claim |
| E30 | Guardrails Model access unsaved Block all → Policy → External checks; actual enabled Save, screenshot, shared draft/submit source | UX-19: hidden cross-section commit scope. Save not clicked; refresh discarded the draft and disabled Save. No server policy changed |
| E31 | Key request-rate draft changed then cancelled; concurrency dialog unchanged/disabled; original dialog reopened empty/disabled; detail at 320px | Legitimate section-local edit/cancel counterexample. Root scroll/client widths both 320; no whole-site accessibility claim |
| E32 | Existing failed HTTP 502 request detail at desktop and 390px; Escape closes detail and returns focus to the request row | Uncertain Provider status and missing evidence are explicit; no unsupported root cause or retry requirement inferred. Financial recovery and real resubmission untested |
| E33 | Current account opens Provider Overview/Models/Usage/Settlements; 25 populated offers at 390px, empty Usage, explicitly latest-100 settlements; summary/portal/admin/SDK contracts compared | UX-17 also affects portal media consumption; UX-20 ignores offer completeness metadata. Independent Provider-only authorization and large collections untested |
| E34 | Invalid child route within default workspace renders Page not found; Return to overview resolves the same workspace and renders Overview | Successful bounded recovery; other aliases/scopes remain separate |
| E35 | Non-default workspace has active policy, two historical pre-dispatch blocks and eight revisions. At 390px rows preserve reason/key/version. Version 6 names an input rule; version 4 displays count-only external check with Restore action | UX-21; actual historical investigation now observed, without restore/enforcement. Key assignment source shares the same summary omission |
| E36 | Legacy non-default workspace Activity path redirects to canonical Usage while retaining an inert query marker and fragment; breadcrumb names the same workspace | Successful scoped compatibility counterexample; no blanket redirect claim |
| E37 | Switched through the real Provider menu to the second available business; overview has no earnings and Models has no offers | Confirms another available scope was inspected; no populated commercial fixture found in these two scopes, not a claim about all stored data |
| E38 | Archived sessions dialog empty; saved two-turn Chat retains a completed response and a separately cancelled-before-output response with unknown tokens/charge | Positive saved-state distinction. Existing ordered-list marker issue repeats UX-15 and is not counted again |
| E39 | Existing Video shows Succeeded separately from expired preview; actions offer original-task restoration, no retained-copy item. Details distinguish observed elapsed time from transport time and own-account billing | Actual retained video still not available in the inspected history; no capture, restore, delete, Provider check or status reload invoked |
| E40 | Opened Account Settings from saved Video, expanded password form without entering credentials, cancelled and closed Settings | All-device sign-out and password-length consequences visible; original video context retained after close. No account or credential update |
| E41 | Explicit nonexistent workspace shows an unavailable-scope alert and recovery link; activating it opens an available workspace | No silent substitution before user action; missing and unauthorized cases deliberately share wording |
| E42 | Signed-in Login returns to default workspace; Installation entry renders credential form at 390px; Documentation opens the actual public `/docs/` site | No credentials entered or session replaced. Anonymous login and real sign-in/expiry remain unverified |
| E43 | Public Access & roles guide distinguishes installation, platform, workspace and Provider authority; documents supported member sign-in and unavailable self-registration/OIDC | Confirms documentation ownership boundary; does not prove runtime isolation or a complete lost-credential recovery workflow |
| E44 | Actual public Models link opens the public catalog; settled state says zero published models and distinguishes discovery from workspace authorization/customer prices. Open the workspace resolves the default alias to the named workspace's keys | Separate public deployment and live support handoff confirmed in the existing session. Not anonymous-session proof or populated catalog validation. A narrow screenshot was insufficient for detailed visual judgment and is not counted as a visual pass |
| E45 | Native Video: chose an existing permitted key and discovered Seedance context despite another key's source-address error. Human verification shows an expired historical record. Materials shows no groups and no saved operations for that exact context | Existing history is readable; discovery failure is partial, not a whole-feature blocker. No Check status, Start verification, group creation or remote write performed. Desktop composition inspected; populated material operations remain unavailable in this selected context |
| E46 | Opened the remaining six visible short Chat histories: five contain simple completed acknowledgements and one an explicit failed request with unknown tokens | No additional rich-content structures in these available records. Together with the two previously inspected list conversations and one Video, this accounts for all nine visible history entries. No new generation, archive or retained-copy mutation |

## Visual coverage and counterevidence

Default desktop inspection used 1280 × 720; selected screenshots and responsive checks used 900 × 800 and 390 × 844 CSS pixels. This is **not** multi-width coverage of every page. Temporary viewport overrides were reset.

- Navigation/list/detail/form/empty/error/saved-result families were inspected, with the deepest responsive sample on model pools. Intermediate navigation collapsed and narrow content used the available width. The old excessive-margin screenshot is not current proof of a defect.
- Admin Settings is last in the inspected sidebar. Platform currency is in Admin Settings, not Account balances. These earlier concerns must not be duplicated as present defects.
- Model-pool creation fits within a scrollable narrow dialog; Escape closes it and restores trigger focus. This single check does not establish keyboard accessibility of all overlays.
- Clear request timing, explicit personal-charge attribution and absent/expired body-retention explanation are positive evidence worth preserving.
- UX-07 is a content-hierarchy finding independent of whether controls fit. No measured contrast failure, universal spacing failure or WCAG conformance claim is made.

## Uncovered branches and next validation

1. **Commercial acceptance:** authorized, qualified non-personal supply; applicable platform model price without workspace enrollment; real charged request; customer ledger and operator statement reconciliation. Never fabricate qualification or substitute a personal call.
2. **Actor coverage:** independent new customer, workspace reader/writer, company owner and Provider-only representative; sign-in, access revocation and information isolation. The current account can access the Provider portal (E33); this is current rendered portal evidence, not independent Provider-only isolation. Administrator observation cannot stand in for these roles.
3. **Media lifecycle:** model choice → saved intent → task → output → retained asset; expiry, unavailable upstream, failed retrieval and revisit without duplicate generation. Existing backend handoff records do not prove the current browser flow.
4. **Remaining surface/state depth:** actual denied-request investigation; populated Provider offers/earnings/settlements; populated customer statements and exports; first installation and upgrade. API-key details, unsaved limit edits, policy sections, Activity drilldown, Provider empty-state tabs and served help have now been inspected (E16–31); their coverage must not be reset to unvisited. Routes or source documents alone are not visual review.
5. **Visual/accessibility depth:** wide/intermediate/narrow comparison of populated tables, pricing, organization settings and Generations; open menus; light appearance; long/mixed-script labels; 200% zoom, reflow, contrast measurement, complete keyboard and screen-reader checks.
6. **Usability evidence:** ask representative operators to make one model available to a separate customer, and customers to find a usable model and recover from insufficient funds, without revealing navigation steps. Observe completion and misunderstandings rather than treating expert inspection as measured success.

The review covers product structure and selected core paths, with explicit surface gaps. It must not be presented as exhaustive whole-product UI verification.

## Refinement limits and counterevidence

See [iterations](iterations.md) for pass order and additional exclusions.

Remaining execution gates in the original register still apply. Key detail, policy overview/output editor, Activity drilldown and served help are no longer wholly unvisited; their write/role/adverse-state branches remain unverified.

The output lifecycle branch has stronger source evidence but still lacks an authorized retained-video fixture in the inspected UI. No upstream recovery was invoked. Temporary viewport overrides were reset after these checks.

## Detailed continuation samples

| Journey | View / transition | Role / state | Content / input / viewport | Evidence and result | Remaining gate |
| --- | --- | --- | --- | --- | --- |
| J3 | Workspace creation draft | Installation operator; unsaved | Mixed-script name, manual slug | Live operation: suggestion and edit preservation work | Collision, save, independent revisit |
| J5 | Saved Chat reading | Existing member session | Long continued ordered lists; 900/390 | Rendered + DOM failure, UX-15 | Other rich structures, copy/export, assistive technology |
| J3/J5 | Catalog → generation | Existing key; incomplete vs complete metadata | Video filter, no-match search, 900/390 | Seedance retains Video scope; missing metadata launches Grok into Chat, UX-16 | Current protocol dispatch and denied-access variants |
| J6 | Provider Usage | Installation operator; no payable records | Narrow empty view; backend/consumer schemas | Text-only consumer omission, UX-17 | Actual media-only/mixed payable rendering |
| J6 | Customer statement consumer | Source inspection only | Text/media line types and pagination | Media handling exists in source | Actual statement reading and reconciliation |
| J6 | Workspace overview chart | Existing personal traffic | Keyboard ArrowRight; default desktop | Tooltip exposes date interval/count | Complete keyboard/screen-reader audit |
| J7 | Key list filter | Existing keys | No-match, Escape, Clear search | Query preserved; list recovered | Failed network and other-role branches |
| J8 | Workspace/platform settings, About | Existing configured installation | 390px; no edits | Scope, disabled deletion reason, currency and version readable | Initial installation and saved outcomes |
| J3 | Served documentation | Existing help deployment | Ordered steps; 320px document and code | Visible numbering; page reflows while code locally scrolls | Other guides, zoom, theme and assistive technology |

These rows supplement the original journey register; they do not promote source-only or empty-state checks to completed end-to-end journeys.

J7 now includes an operated unsaved multi-section editing branch, not only policy overview. Saved enforcement, conflict execution, other-role access and denial recovery remain unverified.
