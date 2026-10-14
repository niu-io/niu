# Product page and workflow audit

Baseline: current `main` at `534c07ee`, 2026-10-13. This audit covers rendered product workflows and usability; it is not a claim of release readiness. Marketing belongs to the separate website repository. External Agent Observability, container acceptance and new paid video generation are outside this increment.

## Progress and verification rules

- Source/navigation inventory: complete for the 35 page families below. Dynamic sections, dialogs and interaction states are included within their family.
- Browser qualification: in progress. A loaded page or passing static build does not complete a workflow.
- Fixes: prioritize blocked business flows and persistence/authorization defects, then usability and visual consistency.
- A verified scope requires actual current-input browser/API behavior and independent saved artifacts where applicable. Fixture outcomes have zero acceptance signal.
- States: **Not checked**, **In review**, **Fix needed**, **Blocked**, **Verified scope**. Every verified row must state its actual scope and remaining limitations.

## Page checklist

| ID | Page family | Routes | Required workflow scope | State |
| --- | --- | --- | --- | --- |
| P01 | Login and member session | `/login` | Destination, restore, expiry, sign-out, errors | In review: actual password/token browser sign-in, reload, original-session expiry/revocation and Viewer sign-out; deployed HTTPS and remaining session races unverified |
| P02 | Installation administration | `/installation` | Platform sign-in and role boundaries | In review: actual installation sign-in and member/platform navigation observed; full boundaries pending |
| P03 | Workspace directory | `/workspaces` | Create, switch, rename, delete, empty/error states | In review: actual create/rename/reload/delete and independent database checks verified; narrow directory/menu/create plus network-failure retry qualified; broader scope boundaries pending |
| P04 | Workspace overview | `/workspaces/:workspace` | Real summary and action destinations | In review: actual new empty workspace and action destinations inspected; request details pending |
| P05 | API key list | `/workspaces/:workspace/keys` | Filter, grants, expiry, status, navigation | Verified scope: current unused-key search/retention/reset, recorded wildcard/exact grants, active/expired/revoked status and detail navigation at desktop/390px; runtime grant admission remains tracked in P06/P07 |
| P06 | API key creation | `/workspaces/:workspace/keys/new` | Validation, permissions, one-time secret, persistence | In review: actual finite/nonexpiring creation, exact model grants, native guidance and four saved limits qualified; zero-request-rate rejection qualified; other runtime admission pending |
| P07 | API key detail | `/workspaces/:workspace/keys/:key` | Limits, rotation, revocation, history, conflict recovery | In review: actual limits, metadata/rate conflicts, rotation inheritance, expiry and revocation/history qualified; zero-request-rate rejection qualified; remaining runtime limits pending |
| P08 | Workspace members | `/workspaces/:workspace/users` | Invite/manage roles and scope enforcement | Verified scope: genuine Owner GUI member creation, one-time credential, role changes/conflict recovery and revocation; same-token scope/expiry, current permissions and exact audit independently qualified |
| P09 | Organization management | `/workspaces/:workspace/organization` | Company/workspace ownership and supported actions | In review: actual workspace links and create dialog desktop/narrow; full ownership boundaries pending |
| P10 | Workspace settings | `/workspaces/:workspace/settings` | Saved scope settings and limits | In review: rename/reload and guarded empty-workspace deletion verified; actual Owner limit save, API/SDK/database readback, workspace switching and lost-response/read-failure recovery qualified; remaining conflict and role boundaries pending |
| P11 | Guardrails | `/workspaces/:workspace/guardrails/:section?` | Every supported section, preview, activation, conflicts, roles | In review: all sections/menu states checked; actual save/conflict/reload and independent versions verified; enforcement pending |
| P12 | Workspace Logs | `/workspaces/:workspace/executions` | Filters, details, exports, timing, unknown usage, customer charges | In review: actual Video log/export and recorded RPM-zero diagnostics, failure/key filters and aligned exports qualified at desktop/390px; remaining error/role branches pending |
| P13 | Global Gateway Activity | `/activity/:section?` and `/workspaces/:workspace/usage` | Global/workspace scope, coverage, drilldowns; excludes external Agent Observability | In review: current global/workspace coverage, pagination, drilldown and narrow workspace menu verified; remaining status/role branches pending |
| P14 | Model list | `/models` | Global catalog, selected workspace context, filters, prices, eligibility | In review: actual workspace list/filter/sort and Video destinations at desktop/narrow; full access/pricing boundaries pending |
| P15 | Model detail | `/models/*` | Capabilities, qualified access, setup and request examples | In review: actual Video guidance corrected; explicit different-model restoration checked; inference admission pending |
| P16 | Generations Chat | `/generations` | Model/key selection, messages, branches, cancellation, attachments, persistence | In review: actual personal free-router SDK/GUI streams, zero-cost receipts, reload/second-tab persistence and request inspection qualified at desktop/390px; rename/archive/restore, continuation and connected-stream cancellation qualified; PNG draft attachment persistence/removal and content-only export qualified; explicit branching, deletion and attachment submission pending |
| P17 | Generations Video | `/generations?new=video` | Drafts, references, async tasks, original recovery, preview/download | In review: native tools, saved-image consent/role/save/reload, draft conflicts, historical preview and diagnostics qualified; successful image submission/shared-output actions pending |
| P18 | Writing entry points | `/generations` | Existing writing templates and supported Chat flow; no new editor | In review: actual Writing template prefill/focus checked at desktop and narrow widths; text generation not exercised |
| P19 | Generation session history | `/generations` | Restoration, archived/deleted input, revoked keys, actor isolation | In review: revoked/expired-key reads, actor isolation, original binding restore, cached preview and persisted diagnostics verified; full timeline pending |
| P20 | Native video materials | `/workspaces/:workspace/video/volcengine/:section?` | Exact account context, groups/materials, validation, uncertainty, observations | In review: explicit context, revoked-key history and metadata-only preparation response-loss/reload/cancel qualified; broader Provider mutations pending |
| P21 | Native verification tools | `/workspaces/:workspace/video/volcengine/:section?` | Capability-gated explicit workflow; no fabricated H5 completion | In review: capability-gated entry and saved read observed; verification creation not exercised |
| P22 | Shared task/output integration | `/generations` | Existing task/artifact inventory and durable save; UI integration gap candidate | In review: historical task/artifact reads, retained preview and saved-copy UI qualified; first-save/recovery interactions unverified |
| P23 | Admin Supplier list | `/admin/suppliers` | Onboarding, multiple credentials, adapter choice, discoverability | In review: adapter controls and metadata-only creation qualified; actual disabled two-key/three-model API persistence and name-only GUI create/reload/delete qualified; rendered credential configuration/inference pending |
| P24 | Admin Supplier details | `/admin/suppliers/:supplier/:section` | Overview, API keys & routes, Models & pricing, Usage, Settlements, Portal access, Settings | In review: all seven sections, profile conflict/reload, exact advanced-rate preservation and disabled key/model API metadata checked; offer conflict/reload and new-offer read recovery qualified; two disabled-key GUI configuration isolation qualified; credential onboarding/settlements pending |
| P25 | Admin customer pricing | `/admin/pricing` | Published customer categories, history, edit/conflict validation | In review: reasoning publication/readback verified; remaining pricing workflows pending |
| P26 | Admin payments | `/admin/payments` | Complete supported inventory, configuration and unavailable states | Verified scope: complete supported inventory and existing configuration entry; merchant activation not exercised |
| P27 | Admin audit logs | `/admin/audit-logs` | Filters, pagination, readable actors/actions, platform authorization | In review: new installation Branding/Supplier actors, unchanged historical events, category/pagination and ordinary Owner denial qualified; platform-member actor branch pending |
| P28 | Admin branding | `/admin/branding` | Preview, validation, save, conflict recovery and shared shell consistency | In review: actual save, stale conflict freeze/reload, normalized logo pixels and original configuration restoration verified; remaining fields/roles pending |
| P29 | Supplier member portal | `/suppliers/:supplier/:section?` | Own offers/models/consumption/settlements and permissions | In review: genuine Supplier Viewer current offers, complete text categories/context tiers and own/foreign/platform boundaries qualified at desktop/390px; populated earnings/settlements, historical-rate rendering and manager actions pending |
| P30 | Global Settings | `/settings/:section?` | Account, Appearance, Billing, Payments, About; underlying-page return | In review: all five sections inspected; actual profile/avatar persistence, conflict and lost-response recovery, shared-menu synchronization, password eligibility/change/session revocation and durable appearance qualified; remaining settings/payment branches pending |
| P31 | Help and documentation | `/help/* and /docs/*` | Actual destinations, navigation, truthful API/SDK capabilities | In review: REST/SDK navigation, OpenAPI, 404 recovery and complete built internal-link inventory qualified; external links and full content/interaction review pending |
| P32 | Public model catalog | `Public catalog model routes` | Anonymous routes and dashboard handoff; separate marketing ownership | In review: anonymous empty catalog, current header/menu, same-origin workspace handoff and network failure/recovery verified; published rows/pricing/capabilities pending |
| P33 | Compatibility and not-found routes | `Legacy redirects and unknown URLs` | Destination/query preservation and useful recovery | In review: legacy billing/usage and five additional aliases preserve query/hash; canonical workspace resolution and unavailable explicit-scope recovery qualified; remaining aliases/loading transitions pending |
| P34 | Deferred legacy surfaces | `/benchmarks` and legacy redirects | Check product boundary and entry points; do not revive excluded orchestration | In review: actual offline-only analysis boundary and guide inspected; dataset analysis not exercised |
| P35 | Workspace Billing | `/workspaces/:workspace/billing` | Customer charges, rates, statement details/pagination, workspace spending limits and confidential-data boundaries | In review: actual empty Spending/Rates and populated customer category/context-tier rates qualified; existing nonempty statement/debt reads qualified under installation authority; ordinary positive billing, category receipts, repricing and spending enforcement pending |

## Prioritized source candidates

These are source findings awaiting current-input reproduction, not integrated acceptance conclusions.

| Candidate | Priority | Page families | Concrete suspected gap | State |
| --- | --- | --- | --- | --- |
| C01 | P1 | P17, P19 | Saved Video history requires active keys instead of historical workspace/session access | Historical input/status, cached preview and persisted billing/timing qualified after original-key expiry; complete shared-output workflow remains open |
| C02 | P1 | P17, P20, P21 | Unsupported models expose native materials and verification tools before failing | Video scope fixed; standalone explicit context selection qualified; broader account/error branches pending |
| C03 | P1 | P20 | Material validation errors remain behind dialogs; unknown operations lack explicit recovery | Inline failure, metadata-only preparation response-loss/reload and revoked-key cancellation qualified; requests that never persisted remain explicitly uncertain |
| C04 | P1 | P17, P22 | Existing task/artifact/durable capture SDK is not consumed by product pages | Cached save controls implemented; actual retained-state/preview qualified; first save and lost-response branches unverified |
| C05 | P1 | P17 | Image/reference submission bypasses retained intent association | Metadata save/reload, attachment consent/role/removal and negative submission guards qualified; durable-image idempotency implemented; successful dispatch remains open |
| C06 | P1 | P23, P24 | Supplier adapter controls omit backend-supported Anthropic/Gemini/Ark | Fixed; verified scope below |
| C07 | P2 | P26 | Supported unconfigured payment integrations are hidden | Fixed; inventory scope verified |
| C08 | P2 | P30 | Profile save does not update shared account-menu session state | Fixed; immediate saved-name synchronization and independent restoration qualified |
| C09 | P2 | P11 | A stale revision conflict does not lock repeated saves until reload | Fixed; actual conflict/reload/publication scope verified |
| C10 | P2 | P13 | Known token totals omit reported-usage coverage | Fixed; actual unknown/empty and mixed known-subtotal display qualified |
| C11 | P2 | P25 | Backend-supported reasoning customer prices lack an editor | Fixed; publication scope verified |
| C12 | P2 | P17 | Unsubmitted Video drafts exist only in component memory | Draft restore/conflict, scoped save-clear and saved-image picker qualified; concurrent newer-draft clear and submission recovery remain open |
| C13 | P1 | P23, P24 | Editing an existing ordinary text offer omits configured reasoning, cache-write and context-tier rates | Fixed; actual desktop/narrow ordinary-rate edits preserve populated and nullable advanced categories with independent readback |
| C14 | P1 | P08 | Existing member management has no role-change contract or control | Fixed; Owner-authorized API/SDK and desktop/390px GUI role changes, conflict/read recovery, same-token permissions and exact role-change audit qualified |
| C15 | P2 | P35 | Text statement details omit saved reasoning, cache-write and selected context-tier fields provided by the backend/SDK | Source candidate only; retained nonempty statement qualified with null category/tier fields, so positive category omission remains unverified |
| C16 | P2 | P30 | Appearance save response loss is reported as restored even after backend commit | Fixed; actual own-member HTTP 200 response loss freezes both appearance controls until GET-only authoritative reload, with original Owner inheritance preserved |
| C17 | P1 | P10, P35 | Workspace limit response loss allows another save after the original update committed | Fixed; actual HTTP 200 response loss freezes editing until a validated GET, including a failed recovery read and GET-only retry at desktop/390px; exact saved revision independently qualified |
| C18 | P2 | P30 | Token-only members see a password-change action despite having no current password credential | Fixed; actual credential eligibility at desktop/390px, normal configured-password sign-in, self-service change and old-session/password rejection independently qualified |
| C19 | P1 | P30 | Profile response loss allows another save and authoritative reload does not update the shared account menu | Fixed; actual successful-response loss, failed recovery read, GET-only retry and shared-menu synchronization qualified at desktop/390px; independent profile/avatar persistence and original-account preservation confirmed |
| C20 | P1 | P29 | Supplier portal current offers omit saved reasoning, cache-write and context-tier rates | Fixed; actual own Supplier Viewer rendered omission reproduced, then populated/null category and tier-local fallback displays independently qualified at desktop/390px; no pricing mutation |

## Reproduced follow-up defects

| Candidate | Priority | Page families | Actual gap | State |
| --- | --- | --- | --- | --- |
| C21 | P1 | P27 | Newly created/deleted Supplier audit events omit the authenticated actor, while key edits retain it | Installation attribution fixed and qualified by actual GUI/API/SQL; historical unknown actors preserved; platform-member runtime branch unverified |
| C22 | P1 | P07, P12 | A rejected zero-request-rate invocation retains a not-sent attempt but loses requested-key attribution and admission reason in Logs | Fixed for durable prepared RPM-zero rejection: actual SDK/API/SQL and desktop/390px diagnostics qualified; priced/batch and other rejection paths remain pending |

## Delivery order

1. Reproduce the candidates in the current product, using actual member and installation roles. Record screenshots privately and keep customer data/secrets out of this document.
2. Fix Generations/history/native-context and Supplier setup blockers by consuming the existing backend and SDK. Do not add another task or asset store.
3. Complete supported management actions and failure recovery, including payment discoverability, account synchronization and optimistic conflicts.
4. Use the existing NIU.IO Stitch project/design system and actual mature references for visual changes. Keep shared theme tokens, installed shadcn controls and full-width management pages.
5. Verify desktop/narrow interaction states, persistence/reload, role boundaries and navigation; push completed increments to main.
6. Audit every remaining checklist row and report supported versus unverified capabilities without broadening narrow evidence into release acceptance.

## Verified increments

### Supplier adapter controls

The actual administration page mislabeled an existing Ark credential as OpenAI-compatible and offered only OpenRouter/OpenAI for new credentials. The form now exposes all five backend-supported adapters and renders their actual API labels. Browser checks covered the open menu at desktop and 390px width, Anthropic/Gemini default endpoints, the explicit required endpoint for Ark, preservation of a custom endpoint when changing adapters, and immutable existing-adapter editing with the saved endpoint retained and the secret field empty. No new Supplier credential or upstream request was created for this control check. TypeScript and the production build completed as static checks; these do not establish provider integration success.

### Video native tools

In the actual Video composer, selecting a model without native asset management still exposed Supplier tools, Materials and Human verification. Opening them produced an unsupported-management error. The Video composer now queries capabilities for its selected key and model, cancels stale reads and passes that exact context to the existing SDK. Actual API reads reported no modules for Mini and the Volcengine module for the configured supported model. Desktop and 390px browser checks confirmed the unsupported explanation/disabled entry and supported materials/verification tabs, including scrolling narrow tables. No generation, material mutation or verification session was created. Standalone material-context selection remains open.

### Supported payment inventory

Actual administration previously showed only EPay. The current page now displays all three backend-supported integrations, including unconfigured PaymentFM and Stripe, and distinguishes missing configuration from a configured disabled gateway. Desktop and 390px checks verified the complete list and opened the existing EPay configuration form without saving merchant credentials. External merchant activation is outside this inventory check.

### Reasoning customer price editor

The existing customer-price form now exposes the backend reasoning-output rate and its ordinary-output fallback. An actual browser publication of a current decimal value was independently read back through the pricing API with all other rates unchanged. Separate browser publications verified explicit zero and blank fallback restoration. Desktop and 390px form checks found no page overflow. These checks used the isolated current Gateway/database copy and made no inference about accounting correctness from control rendering.

### Historical Video reads after key revocation and expiry

An actual newly saved, unsubmitted draft became unreadable after its key was revoked. The historical intent read now checks workspace permission and original actor ownership without requiring current inference authority. Current-input revocation and finite-expiry runs restored the identical saved requests; explicit submissions remained denied. A different authenticated member received 404 for the private draft. The existing paid video's intent returned the same original successful job after restart without a new generation. Desktop and 390px checks verified retained input/status and the correct API-key recovery link. Sidebar task history uses the existing workspace Tasks SDK rather than enumerating active keys. Historical cached preview is now qualified below; billing/timing panels and complete shared-output integration remain open.

### Native material form failures

The actual material form previously hid a server validation error behind the open dialog. Errors now appear inline, and malformed/non-HTTPS URLs are rejected locally with a clear message. Actual desktop/narrow checks verified retained fields and readable errors. A deliberate interruption of the isolated current Gateway produced a real 502 during the form request; the UI preserved the draft, blocked another submission and restored the same frozen form after close/reopen. The isolated Gateway was restored; the original service was untouched. This check created no accepted upstream operation. Saved-operation references enable explicit status reads when returned, but that recovery branch and durability after component unload remain unverified/open.

### Workspace lifecycle

An actual member created a new workspace, renamed it, reloaded the resulting settings route and deleted only that empty verification workspace through the confirmation dialog. Independent PostgreSQL reads proved the saved name and subsequent absence. The new workspace overview's empty state and action destinations were inspected. Other workspace role/error/narrow states are still pending.

### Current documentation rendering

The current docs artifact was built and served by the isolated Gateway at the real `/docs` path. Browser checks at `/help/reference/generations/` confirmed the embedded guide's heading, updated historical-read explanation and explicit remaining dashboard limitations at desktop and 390px width. The full documentation link/menu inventory remains pending.

### Historical cached Video preview

The original successful paid Mini task was opened with its expired original API key. An explicit cached preview loaded through the workspace Tasks/Artifacts SDK at desktop and 390px width. Browser-decoded duration was 5.088 seconds; the downloaded 792,757 bytes matched the independently retained original file by SHA-256. This produced no new generation. An explicit cached capture then saved this existing video in the encrypted workspace library. Returning to the historical task displayed Load saved copy; its desktop/narrow browser preview matched the same independently retained original hash and bytes. Fresh-result actions and key-independent billing/timing remain unverified.

### Mutable Video composition

The new backend-owned Video draft stores unfinished text, typed controls and Niu references with revision checks and a 30-day edit retention period. Actual API writes were independently read from PostgreSQL; stale writes were rejected, inline/base64 references were rejected, and retained drafts blocked workspace deletion. Clearing a confirmed revision retained a tombstone against stale recreation. A different signed-in actor read an independent empty draft.

Actual browser edits saved the prompt and watermark. Refresh and a second tab restored the same composition; independent PostgreSQL reads matched both fields. A two-tab conflict preserved the losing tab's input and required explicit loading of the saved draft. Desktop and 390px checks covered this state. Inline attachments are explicitly unsaved and must be reattached. No submission was made; post-submission clearing, typed reference selection and full expiry/restart UI qualification remain pending.

### Native operation inventory API

Bounded saved-operation listing and exact idempotency lookup now exist in both workspace-key and customer API paths. An actual configured model returned saved operations, nonoverlapping continuation pages and no-store responses. Independent SQL supplied the original idempotency reference; lookup returned the same safe operation representation. These reads made no upstream mutations. Dashboard recovery integration and remaining denied/invalid-query branches remain pending.

### Nonexpiring API keys

Actual existing keys returned null expiry through the API but displayed a 1970 date. The list/detail now show Never and the existing expiration menu offers Never. Desktop and 390px menu/detail checks were completed. An actual zero-use key created through the UI returned null expiry; independent PostgreSQL confirmed the existing infinite timestamp representation. Its own revocation and reload preserved Never and the revoked state. No inference was sent with this verification key. Creation/rotation response uncertainty, role-specific limits and full key workflows remain open.

### Video-key onboarding

A newly issued key's first-request example selected Mini but incorrectly sent it to Chat completions. The page now preserves catalog modality metadata, directs Video keys to the Video composer and requests the current model schema rather than inventing a runnable payload. Unqualified protocols show no example. An actual second zero-use key showed the correct explanation and Video destination. The destination initially restored the draft's old key; the composer now honors the explicitly selected URL key while retaining text and controls. Actual reload and the narrow key menu confirmed the new selection and retained prompt. Both new verification keys were revoked without sending inference.

### Key spending-role controls

A genuine workspace administrator signed in through the normal password form could open spending-limit editing; saving was refused by the backend role check. Key spending controls now follow Owner/installation authority while other key write controls retain their existing permissions. Actual administrator desktop/narrow reads retained limit history and throughput editing, with spending editing absent. Actual Owner sign-in retained the spending edit dialog. Independent PostgreSQL confirmed the rejected save created no limit. Full monetary enforcement and remaining key-role branches are not established by this UI check.

### Model setup and explicit Video selection

Actual Seedance model cards/details offered Chat and generated a Chat-completions payload. Video models now open the Video composer with the exact workspace/model, and offer a read-only Video schema-discovery command instead of guessed parameters. A text-model detail retained its existing Chat guidance. Actual workspace filtering and sorting, open sort menu, detail guidance and Video destination were checked at desktop and 390px.

A separate current-input run requested Seedance 2.5 while Mini was saved; the composer incorrectly restored Mini. It now honors explicit model selection while retaining the prompt and initializing the selected model's controls. Actual different-model reload and another menu selection/reload retained their exact models and prompt. No estimate or generation was submitted. Generic protocol qualification and shared reference selection remain open.

### Settings read scope

Actual Account, Appearance, Billing, Payments and About pages were inspected. Password expansion displayed current/new/confirmation fields and session-revocation guidance; no password change was submitted. The existing theme menu was checked open at 390px without changing preferences. Empty account balance/history, unavailable top-ups, build/license and documentation destinations were visible. These are read/interaction scopes, not payment activation or complete settings-write acceptance.

### Members, organization and Guardrails

Actual member search/create controls and role/lifetime menus were inspected at desktop and 390px. The current creation flow explains temporary token issuance rather than promising email invitations. Organization workspace links and the create dialog were inspected without modifying existing members. All seven Guardrails sections were navigable; unconfigured detectors and empty history/denials reported their actual limitations.

On a new zero-funded workspace, an actual policy save persisted. A concurrent authorized publication made the browser revision stale; the UI received 409 but left Save enabled. The fix holds Save disabled through further edits until an explicit successful reload. A new current-input conflict reproduced the hold; reload restored the exact published revision and another save succeeded. Independent PostgreSQL confirmed the immutable versions and final saved policy, with no model requests. Existing workspace policies were untouched. This qualifies policy persistence/conflict recovery, not detector or inference enforcement.

### Native request recovery without a receipt

Standalone material requests now use the same typed dashboard SDK as the Video dialog, preserving structured failures and saved operation references. Exact model capability discovery precedes native group reads. A transient real 503 during model discovery recovered with explicit Retry; this does not establish its underlying cause.

A deliberate interruption of only the isolated Gateway caused a real unconfirmed group-form request before any Supplier contact. The form kept its name and blocked resubmission. After service readiness returned, an explicit saved-status read used the original idempotency reference and received 404. The dialog accurately states that this does not prove the request was never sent, and remains frozen. Independent PostgreSQL confirmed no operation for this actual request reference. Desktop and 390px dialog checks covered this recovery branch. Existing saved-operation lookup was separately qualified at the API level; successful browser receipt recovery, verification without a receipt, component-unload recovery inventory and explicit standalone account selection remain open.

### Logs and Activity workflow scope

An existing genuinely completed Video request was inspected through workspace Logs, global Logs and Activity. Its details retained asynchronous timing, unknown token usage and the customer-facing Own API key charge explanation. A downloaded CSV independently preserved the same model and funding scope without invented token counts, monetary zeros or procurement columns. Global pagination and the request detail destination were exercised. The narrow workspace choice menu previously extended beyond the viewport; its bounded floating panel now keeps all current workspace labels readable at 390px, with desktop selection spacing preserved. Error-status mapping and remaining authorization branches are not qualified by this successful request.

### Branding conflict recovery and audit attribution

An actual concurrent branding publication produced a stale browser save. Save now remains disabled through further edits and Discard until an explicit successful reload; the recovery explanation remains visible. A valid repository logo was uploaded and saved through the normal UI. Independent decoded RGBA comparison verified the stored normalized image rather than requiring identical PNG encoding. The original logo and complete settings were restored and independently compared with the original database baseline.

New authenticated installation branding writes explicitly record the installation actor. An actual normal UI save rendered Installation administrator in Audit logs at desktop and 390px; independent database reads confirmed that actor and preserved every preexisting event projection. Historical events with no recorded actor remain Not recorded, without attribution backfills. Operator attribution is implemented but not live-qualified in this increment.

### Compatibility destinations and documentation recovery

Actual legacy billing and usage redirects now preserve query parameters and fragments. Browser checks confirmed the requested Rates tab and model filter at desktop and narrow widths, plus usable unknown-workspace and unknown-route recovery. Documentation retains HTTP 404 for missing pages while offering a documentation-home link; the embedded Help link returns to Help and the direct documentation link returns to the docs root. Current REST/SDK navigation and an independently inspected OpenAPI download were checked. These scopes do not establish that every documentation link or every legacy alias has been exercised.

### Explicit standalone native context

The standalone Video page previously selected the first compatible key/model and read its groups while showing only Seedance. It now discovers authorized contexts without reading material or verification inventories until the user explicitly chooses a named key and exact model. It displays the server context label and retains selection in the URL. Discovery failures remain explicit incomplete discovery; ambiguous contexts cannot be silently selected.

Current-input browser resource observations found no group, asset or verification inventory reads before selection. Actual selection loaded the existing original material; refresh retained the key/model. A forced unsupported Mini selection showed an error, no material rows and no enabled creation action. Desktop and 390px open menus were inspected against the actual OpenRouter model-selection reference, the existing Niu page and the existing Stitch project's scoped selector design. Dialog entry disabled context selection without submitting a mutation. Pending-operation freezing is implemented, but a fresh uncertain-operation context-switch run remains unverified. No native mutation or generation was sent for this qualification.

### Chat modality and Writing draft entry

An actual Writing template click exposed an automatic submission using saved Video model selections. Both requests were rejected by the dedicated-Video-API boundary; independent saved results had no attempt identity. That rejection does not establish complete billing acceptance.

Chat now excludes explicitly Video/non-text catalog models and checks current selected-model eligibility, catalog/key readiness and write authority again before submission. Existing failed history remains readable while incompatible selections cannot be sent. Missing legacy modality metadata remains a compatibility limitation, not proof of Chat protocol support. Manual-key protocol qualification remains open.

Writing templates now fill and focus the existing composer without sending. The actual Support reply template was checked at desktop and 390px, with no response panel created. Independent before/after database counts and content digests matched for submitted Chat sessions, requests, dispatch, usage and financial records. Composer draft autosave was permitted separately. No explicit Send action or additional generation was exercised. Supplier administration read checks also covered all seven sections; the narrow selected Settings tab can be offscreen, which remains a functional navigation defect to fix.

### Supplier section visibility

At 390px, the selected Supplier Settings tab was outside the visible horizontal strip. The existing shadcn tab strip now reveals its active tab on route changes and container resizing with nearest scrolling. Actual Settings and Portal access navigation, desktop-to-narrow resizing and narrow administration navigation were checked without changing Supplier data. All seven tabs remain visible at desktop width. Supplier configuration writes and revision conflicts remain separate acceptance scopes.

### Saved Video request and original session binding

Save request now uses the existing session/turn/intent SDK to retain input without estimating or generating. The helper prepares metadata only, retains client-allocated identities across failures and refuses a mismatched replay before writes. Actual genuine image-reference metadata qualification covered save, binding, repeated preparation, read-only recovery, session rename and archived read scope. Independent SQL confirmed one immutable turn/binding and no associated attempt; this is not image submission acceptance.

Actual ordinary-member browser saves retained the original text and displayed an unsubmitted request at desktop and 390px. A subsequent save refreshed history immediately and cleared only its matching composer revision. Independent database counts and content digests for request, dispatch, usage and financial records were unchanged. The new saved intent, session, turn and binding each appeared once. No concurrent newer draft was introduced in this clear check, so that race branch remains unverified.

Intent reads now project the original nullable session binding through the existing actor/workspace/intent index. Reopening a link with only the intent restored the exact original session/turn and retained prompt; no replacement history traversal or binding was created. The current HTTP response and independently downloaded full OpenAPI operation schema contained the binding. Generated SDK documentation rendered in Help at desktop and narrow widths. The former workspace-image idempotency blocker is addressed below; the attachment save/restore workflow is qualified below, while successful image generation remains unverified.

### Current public catalog and failure state

The current catalog was built and served through the existing same-origin composition. Anonymous current API data was genuinely empty; no personal test route was published to imitate commercial availability. Desktop and 390px checks covered the empty state, the hydrated public navigation menu, Escape dismissal and the workspace API-key destination. A real blocked browser network request displayed Unavailable; restoring the connection and reloading displayed the actual empty count. Failed loading no longer reports zero known routes. Development requests now honor the configured Gateway URL, retaining the existing default. Populated route pricing, capability labels and visibility remain unverified with the current empty public inventory.

### Historical Video diagnostics and workspace-image submission guard

The saved-task diagnostics API and SDK now read persisted customer billing and transport evidence under current workspace Read permission and actor privacy, independently of original inference-key expiry. A genuine previously generated Mini task returned diagnostics while both legacy key-scoped reads returned 401. Independent PostgreSQL comparison matched seven transport spans and the saved lifecycle observation; absent customer charge, pricing and usage evidence remained null. Execution and financial record digests were unchanged. This qualifies the historical API read, not a new generation or complete billing acceptance.

Workspace-image retained submission now preserves canonical idempotency and exact prepared request binding, including policies with no required detectors. Current discovery exposes the actual model capability rather than requiring a configured detector for all workspace images. Actual deleted-image, revoked-key and policy-denied submissions were rejected before attempt creation; independent database checks preserved request and financial records. Successful image dispatch, concurrency and the attachment UI remain unverified.

The actual Mini browser opened persisted lifecycle, all seven transport records and the owner-funded customer-charge explanation at desktop and 390px without restoring the expired key. The current ordinary workspace Owner received 404 for both this installation-owned private task and its diagnostics. Generated REST documentation rendered in embedded Help at 390px. These reads did not submit or refresh upstream work.

After the committed Gateway was rebuilt and restarted, the genuine Mini diagnostics returned 200 and exactly matched the independently retained pre-restart response. The served public OpenAPI document matched the checked-in generated artifact, exposed the diagnostic operation with billing/timing fields, and contained no unresolved local references. Compilation and contract checks are separate static checks; the actual reads and saved-record comparison define this qualification.

### Immediate saved account-profile synchronization

A genuine member saved a new display name and immediately reopened the account menu; the menu retained the previous name until session revalidation. Successful profile saves now publish the validated server profile to the current authenticated session as well as the form. The callback checks connection identity and preserves newer profile revisions. No navigation or visual layout changed.

Actual desktop and 390px saves immediately displayed the saved name in the existing account menu. Independent PostgreSQL confirmed the member name, preserved email/avatar and advanced immutable revision. The exact original name, email and avatar were restored through the normal UI and independently checked. This qualifies same-session display-name synchronization; avatar saves, concurrent sign-in changes and profile conflict handling remain separate scopes.

### Durable native-material operation history

The Materials page now reads saved operation history through the existing typed SDK under the explicitly selected workspace/key/model context. It restores authoritative prepared and unknown records after unloading the page, keeps new material/group mutations disabled while outcomes remain unconfirmed, and offers read-only saved-status checks. Acknowledged requests do not establish material readiness; absent records never establish that a request was not sent.

The existing Stitch project was used for this history section after inspecting the current page and the mature Stripe Workbench operation-history reference. The implementation retains the existing navigation, theme and shadcn Table. Actual API data and independent PostgreSQL matched all 24 scoped operations, including six unknown outcomes. Reload restored the same records and mutation freeze; a saved-status check preserved its unconfirmed outcome. A real network failure retained history with an explicit error, and recovery cleared only the read error. Desktop and 390px checks covered visible status/actions and horizontal table access. Independent before/after saved-operation content digests were unchanged. No Provider mutation or inference was sent. Transport uncertainty before any durable record exists still cannot be recovered after component unload and remains open.

### Saved workspace-image attachments in Video

The Video composer now uses the model-discovered workspace-image capability and existing encrypted workspace library, retaining typed references as the saved request source of truth. Uploading stores an image but does not grant model-processing consent. The user must explicitly allow processing and choose a required model role before the reference enters the request. Pending input blocks Save, Estimate and key/model switches. Existing models without this capability retain their direct-input contract.

The existing OpenRouter attachment reference and NIU.IO Stitch design were used within the established composer. Actual desktop and 390px checks covered upload, unchecked consent, both consent/role orders, preview, open role and saved-library menus, draft reload and session-backed Save request/reload. The authentic retained image download matched the original bytes independently. PostgreSQL confirmed the original workspace reference, explicit consent, role and immutable session binding with no associated submission. Removing a reference persisted across reload without deleting shared library bytes or changing the original retained intent. Request/execution/customer financial records were unchanged. No estimate or generation was submitted. Lost-upload response recovery and successful inspected upstream image dispatch remain unverified.

### Documentation internal-link inventory

Every internal documentation link extracted from the current 690 rendered HTML files was resolved against the running same-origin composition. All 692 distinct documentation targets returned HTTP 200, and each complete response matched its independently built file. Referenced fragment identifiers existed in the delivered HTML. The check used actual HTTP reads and retained response hashes; it did not interpret example payloads or fixture outcomes as acceptance evidence. This establishes internal destination and artifact delivery integrity, not correctness of every API description or visual/interaction review of every document. External links remain outside this qualification.

### Explicit cached-output workspace saving

The existing Video output action row now consumes the typed artifact capture API for explicit cached saves. Workspace Write permission governs saving independently of inference-key expiry. Saved and deleted copies remain explicit; uncertain outcomes permit read-only status recovery rather than another POST. An explicit retry retains its original known request identity and immutable name. Historical failed/preparing requests whose original input was not retained by the current component remain read-only; the UI does not invent a retry payload or recreate a deleted copy.

OpenRouter had no relevant Video output controls, so the actual Runway generated-output/Assets pattern was inspected and the existing Stitch project reviewed the scoped output-action extension. The implementation keeps the existing composer/result layout and direct shadcn controls. The genuine previously generated Mini retained copy showed Saved to workspace and played the saved 5.088-second video at desktop and 390px without overflow or inference-key restoration. Capture status preserved its original saved identity and asset; independent request and financial table digests remained unchanged. The complete scoped output inventory contained two artifacts, both already retained, and no eligible uncaptured source. No capture POST, fresh Supplier query or generation was performed. First GUI save, lost-response recovery and deleted-copy interaction remain unverified. The updated attachment/diagnostic and native-operation guidance rendered in Help at both widths.

### Supplier profile conflict recovery

An actual concurrent publication changed a newly created verification Supplier while its browser draft retained the previous revision. The backend rejected the stale save with 409, but Save remained enabled. Supplier Settings now preserves the draft and blocks stale saves through further edits, Cancel and failed reloads. Only a successful explicit reload adopts the current saved revision and clears the conflict. The submission handler also checks loading and the exact loaded authorization/Supplier context. No visual layout changed.

Desktop and 390px runs covered the actual conflict, edit/Cancel hold, a real blocked reload, successful explicit reload and subsequent save. The final saved revision matched the API and independent PostgreSQL. Metadata-only creation, profile updates and empty Supplier deletion were independently checked; the temporary Supplier was deleted and all preexisting Supplier profiles remained unchanged. No credentials, offers or memberships were created, and no Provider call was sent. Credential/model/multiple-key onboarding and Supplier financial workflows remain unverified.

### Scoped API-key management and rotation inheritance

A genuine workspace Owner created one unused verification key with a seven-day expiry and an exact Video model grant. The normal UI saved request-rate, concurrency, token-rate and customer USD spending limits at zero. Actual metadata and rate-limit revision conflicts returned 409 and recovered by explicitly reloading the independently published values. Rotation revoked the original key while preserving the replacement's absolute expiry, grants and shared spending lineage. API projections and independent PostgreSQL matched all four inherited zero limits, their histories and one rotation event.

The old key failed model-discovery authentication while its replacement was active; after explicit replacement revocation both failed authentication. Revoked detail and policy history remained readable without edit controls. Desktop and 390px interactions were inspected; neither key acquired a request attempt or native operation. Both issued credentials were revoked. No model or estimate call was sent, so actual runtime zero-limit admission and monetary enforcement are not established by these management checks.

### Existing user-token browser sign-in and catalog independence

Temporary user credentials previously worked through authenticated API reads but had no normal member browser sign-in transport. The login page now exchanges an existing durable user token for the established HttpOnly SameSite cookie. The original session, role, workspace scope, revocation and expiry remain authoritative; the exchange neither issues nor extends a session. The public capability response explicitly advertises support, and older Gateways without the flag do not expose this option. Installation credentials are refused. The existing alternate-sign-in pattern was reviewed with the current Stitch design; no new navigation shell was introduced.

Current-input Viewer and Admin exchanges returned empty 204 responses with protected, uncached cookies. Missing, foreign and cross-site origins were rejected; genuinely expired and revoked original sessions and an installation credential were rejected. Cookie-authenticated session reads preserved the original role and scope, and foreign workspace reads returned 404. Independent durable-session comparison confirmed that exchange did not modify or create sessions. Desktop and narrow normal sign-in/reload checks covered the role restrictions.

Authentication now publishes a verified session before the separate model-catalog read. A real blocked catalog request no longer prevents normal Admin sign-in or permitted workspace navigation. Models retains an explicit loading error, and restoring the connection followed by Retry recovers discovery. These checks establish browser transport and the exercised permission boundaries; they do not establish all user lifecycle, deployed HTTPS, model invocation or financial enforcement workflows.

The new browser-token operation reference and updated security overview were independently fetched from the running documentation mount. Both complete HTTP responses exactly matched their built HTML artifacts. This establishes delivery of these two documents. Their embedded Help pages were subsequently inspected at desktop and 390px: the operation retains readable required-Origin/body/cookie guidance, with bounded horizontal code scrolling and no page overflow. The curl example omitted the required Origin header despite the correct parameter table; the generator now includes required-header placeholders without embedding credentials or configured origins. Actual HTTP delivery of all four affected operation pages matched their independently built HTML and contained the declared required headers; representative Origin and Stripe curl examples were then inspected in embedded Help at desktop and 390px. Their required-header guidance and placeholders were visible without outer-page overflow; narrow code blocks retained bounded horizontal scrolling. No authentication or payment mutation was performed.

### Temporary workspace-user lifecycle

A genuine workspace Owner created one verification Viewer through the normal Users form, selected its seven-day lifetime, received the one-time credential and explicitly revoked the user through the UI. The revoked credential then failed authentication. Independent PostgreSQL matched the role, workspace scope, single original session, lifetime and Owner-attributed create/revoke audit records. The additional temporary Viewer/Admin credentials used for browser-transport checks were also revoked; all five original temporary sessions were inactive, and the GUI-created credential was separately revoked. Signing out one Viewer session had revoked that session while its second original session remained valid until the whole user was revoked. The original Owner identity and normal browser session were preserved.

Independent request and financial content digests across thirteen organization tables remained unchanged throughout these metadata workflows. Empty-workspace deletion returned 409 because durable audit/user history remained; the zero-funded verification workspace was retained rather than deleting history directly. This qualifies the exercised temporary-user creation, browser access, session sign-out and revocation paths. Role changes, production HTTPS transport and broader organization ownership workflows remain unverified.

### Supplier multi-key metadata and text-offer blocker

One isolated verification Supplier was configured with two independently named disabled credentials and three private, disabled model mappings. Actual API creation and independent persisted rows agreed. An inactive text offer with explicit reasoning-output, cache-write and long-context rates was published. Replaying the existing editor’s ordinary-rate payload against its exact current revision returned 409 because it omitted those configured categories. The rejected update did not advance the saved offer revision. The functional fix preserves the existing typed advanced categories while editing ordinary rates. Actual desktop and 390px saves succeeded for both a populated advanced schedule and an offer with nullable advanced rates and an empty tier array. API responses and independent PostgreSQL matched the new ordinary rates and revisions while reasoning, cache-write and tier values remained exactly unchanged. This preserves configured schedules; it does not add an editor for every advanced category or qualify their financial enforcement.

All preexisting Supplier, credential, mapping and offer records remained unchanged. These own configurations stay disabled and unqualified, with no Provider call or public catalog publication. The verification Supplier remains in the isolated database because its saved credential/history relationships prevent empty deletion; no direct database deletion was performed. This is metadata/configuration evidence, not model invocation or commercial supply acceptance.

### Supplier offer conflict recovery

After price preservation was qualified, a genuine concurrent offer publication advanced the saved revision. A stale browser save returned 409, kept its input and did not overwrite the independently confirmed concurrent rate or advanced schedule. The reproduced enabled-Save gap has now been fixed: offer editing pins an authoritative read separately from background refreshes, binds it to the current authentication/Supplier context, preserves a rejected draft and disables stale saves until an explicit successful reload. A failed reload keeps the lock and draft. Closing/reopening obtains a current saved revision.

Actual desktop and 390px checks covered concurrent 409 rejection, editing while locked, a blocked-network reload, successful reload followed by save, and close/reopen after a further concurrent publication. API and independent PostgreSQL confirmed that stale saves never overwrote the concurrent revision and preserved the exact advanced schedule. New-offer initial-read failure recovery retained typed values, then saved one own inactive offer after an explicit successful read. All own offers remained inactive and all preexisting Supplier/credential/mapping/offer rows were unchanged. These qualify offer-editor recovery, not commercial admission or Supplier settlement.

### Unknown token usage and known-subtotal coverage

Two genuine saved Video requests had unknown token usage. The scoped API and independent PostgreSQL agreed on two requests, zero reported-usage requests and no known token contribution; model/key group coverage also matched. The prior Activity total rendered zero without the unknown count. Total, input and output now display Unknown when requests exist but none report token usage. Every ordinary total includes reported/unknown coverage; genuinely empty scopes retain zero, and nullable cached/reasoning category semantics are unchanged.

Actual desktop and 390px checks covered the unknown workspace, metric-menu selections, an unused key scope, and the Owner’s global Activity with mixed reported/unknown usage. The unknown workspace row remains Unknown while the global number represents the known subtotal with explicit coverage. No request, estimate or upstream call was sent. This qualifies the exercised display and saved-summary agreement; it does not establish completeness of upstream usage reporting or financial accounting.

### Current customer Billing read boundary

Genuine ordinary-customer Billing, balance and workspace-spending responses returned 200 in the exercised workspace. The complete response field inventory contained customer accounting/policy fields and no Supplier purchase, expense or margin fields. Independent PostgreSQL confirmed that this owner-funded workspace had no customer text/media charge or customer tariff; no positive monetary charge was available for comparison. Explicit customer-only serialization and query boundaries were reviewed separately, without treating source inspection as proof of nonempty integrated billing.

This qualifies the exercised empty customer read boundary only. Nonempty statement reconciliation, monetary enforcement and financial lifecycle acceptance remain open; published-rate display qualification is recorded below. No balance, charge, payment or inference write was performed for this check.

A subsequent current-input qualification created a dedicated verification workspace and published one customer selling tariff for a registered private, disabled test model. The actual customer Billing response exactly matched the independently persisted current tariff revision and submitted ordinary/cache-read/cache-write/reasoning rates, request fee, minimum charge and inclusive 128,000-token context tier, including nullable category values. Full customer DTO field inspection contained selling/accounting fields only, with no Supplier rates, margins or credentials. The verification workspace had no keys, attempts or text/media charges. This establishes positive saved-price delivery and customer-field isolation, not pricing display completeness or actual deduction. The actual Rates page initially omitted configured cache-write, reasoning and context-tier values. It now consumes the existing customer SDK tariff type and displays all saved category rates and base/context rows, including the inclusive threshold. Explicit null category rates show Not configured, while omitted fields remain Unknown; no tier inheritance or zero price is fabricated. The actual OpenRouter pricing table and existing NIU.IO Stitch Billing design guided the scoped table extension. Desktop and 390px browser checks covered all values, nullable tier categories, fees/minimums and horizontal scrolling without page overflow. Independent API/persistence comparison remained exact and customer-only. No inference, estimate, payment or Provider call was made.

### Native operation preparation and explicit cancellation

New metadata-only preparation and prepared-only cancellation reuse the existing immutable operation/resource records and dispatch claim. The original canonical input and idempotency identity are required for explicit dispatch; shared OpenAPI input definitions describe the same six typed SDK actions. Canceling an unclaimed preparation records not_sent under the same group/operation locks. Workspace Write authorization can cancel an exact scoped preparation independently of original-key revocation, without restoring execution permission. Unknown/acknowledged operations cannot be canceled through this path.

Actual current-input API requests qualified group preparation, canonical replay, changed-content rejection, invalid identities, current-key cancellation and workspace cancellation after revocation. Independent PostgreSQL matched original scope/key/model/account identities, terminal not_sent records and failed local groups with no Provider reference. A separately built public SDK made real preparation/query/cancel requests and matched the same persisted records. Temporary keys, Viewer credentials and CLI sessions were revoked; audit-dependent workspaces were retained. Request/financial content across thirteen organization tables remained unchanged. No dispatch or Provider call was made in these API/SDK qualification runs. Seven operation documents were delivered byte-for-byte from their independently built HTML; the downloaded public specification matched the current artifact and resolved all references. Representative preparation documentation was inspected at desktop and 390px.

The separate frontend fault-injection attempt did not retain its browser interception across tool invocations and sent one real test group creation to the Provider. The acknowledged operation/group were retained, the own test key and CLI session were revoked, and the request/financial digests were unchanged. No generation or payment call was made. This attempt does not qualify response-loss or unload recovery. This earlier attempt remains unqualified. The subsequent metadata-only response-loss run below revoked execution authority before releasing the intercepted preparation response. Successful Provider dispatch remains unverified.

### Native operation history after key revocation

Workspace-authenticated history now reads saved operations under current Read permission and the original scoped key/model, without checking current inference grants or contacting the Provider. An optional saved group pins the immutable account binding; omitting it includes all recorded accounts for that exact key/model. History remains workspace-shared, consistent with existing native material ownership.

Actual Owner and Viewer requests with the original revoked key qualified list, operation and idempotency reads, two-page pagination and pinned context. Invalid input, foreign key/context/cursor, missing operations and a foreign workspace were independently rejected. A separately built SDK exercised the same real HTTP reads. PostgreSQL confirmed the original key remained revoked, both canceled operations and their groups were unchanged, no associated attempt existed, and thirteen request/financial table digests were unchanged. Temporary Reader credentials and fresh CLI sessions were revoked. Browser response-loss recovery and dispatch remain separate acceptance requirements.

### Native preparation recovery in the dashboard

The dashboard prepares typed immutable input before an explicit dispatch. An uncertain preparation response locks another submission and permits read-only recovery by the original idempotency identity. Recovered prepared records never dispatch automatically. Saved history stays visible for its exact original key/model after revocation; current actions remain unavailable. Workspace Write access permits only prepared-state cancellation.

An actual metadata-only preparation response was held at HTTP 200. The test key was revoked server-side before the response was failed or interception removed. The dialog recovered the saved Prepared record, and unloading/reloading retained it through backend history. An explicit narrow-screen cancellation displayed Not sent. Independent PostgreSQL confirmed the same immutable operation, failed local group, no Provider reference, no associated attempt and no active own test key. Thirteen request/financial table digests stayed unchanged. Revoked-key history and explicit status reads were inspected at desktop and 390px. No dispatch occurred in this guarded run; it does not qualify successful upstream material creation.

The new history REST documents, SDK reference and video guide were delivered byte-for-byte from the built documentation artifact. The actual downloaded public specification matched the source artifact with all local references resolved, and the representative history guide rendered at desktop and 390px.

A second guarded metadata-only run verified the final three-action recovery dialog at desktop and 390px after fixing footer overflow. Explicit dialog cancellation succeeded; the subsequent key-bound refresh returned 401 and was correctly reported as a refresh failure after confirmed cancellation. Reload showed the retained Not sent record with current actions disabled. Independent saved records again confirmed no Provider reference or associated attempt, and the own key and CLI session were revoked.

### Workspace member role changes: API and SDK

The missing role-change contract is implemented as an Owner-authorized scoped PATCH with the saved role as a compare-and-set precondition. Organization serialization and transactional actor/session validation guard writes. Self changes and protected/revoked accounts are rejected. Role-update demotion cannot remove the last applicable active Owner; this does not qualify the separate account-revocation path. Existing identities, scope, tokens, session expiry and Supplier membership remain intact. Future role-change events record exact before/after roles without inferring historical transitions.

An actual built SDK changed a newly created Viewer to Admin and back. The same original token changed current authenticated permissions, and workspace writes returned 403, then succeeded with the temporary name restored, then returned 403 again. Independent SQL matched the original scope/session identity/expiry and two exactly attributed role-change events with no target session. Stale-role input and same-role replay preserved the expected audit count. Admin/Viewer management and Owner self-change were denied.

A separate zero-funded organization qualified the sole-Owner demotion guard. Concurrent demotions of two own Owners produced one success and one conflict; SQL retained one Owner and one demotion event. A real blocked transaction waited on the organization lock while its actor session was revoked through the API. After release it returned 401 with the target and audit count unchanged. Platform audit reads returned exact role transitions and null role fields for other event streams. All verification actors/sessions were revoked; audit-dependent scope records were retained. There were no associated attempts, balance entries or customer charges, and thirteen original request/financial table digests were unchanged.

Four REST/SDK documents were served byte-for-byte from the independently built HTML. The actual public specification matched the generated artifact with all local references resolved. The representative role-change API reference rendered at desktop and 390px. Dashboard role editing and conflict recovery remain separate, ongoing browser acceptance.

### API key list search and recorded permissions

Three current-input unused keys were created through the actual API: an active key with two exact model grants selected from its scoped discovery response, a naturally expired key and a revoked wildcard key. The full list matched independently saved names, revisions, grants, expiry, last-use nulls and statuses. Desktop and 390px browser checks qualified trimmed case-insensitive name search, dismissal/reopen query retention, missing-result reset, inactive action visibility and navigation to the active key's exact recorded grants and expiry. These are saved permission displays, not proof that a model is executable or that runtime limits are enforced.

The narrow search Popover touched the viewport edge. A constrained review in the existing Stitch project and installed Popover's collision padding corrected the margin without adding filters or changing the layout. Actual geometry confirmed a 16px narrow inset, retained search input and no page overflow. All own keys and the CLI session were revoked. Independent saved records showed no active own key, request operation or attempt; the audit-dependent workspace was retained after supported deletion returned a conflict.

### Workspace member role changes: dashboard

The existing member-access dialog now uses the installed DropdownMenu directly for Viewer, Admin and Owner choices, with an explicit save. The role editor is mounted only after a fresh authorized member snapshot. Closing, changing member or changing caller invalidates the snapshot and in-flight request. A failed save or changed saved role freezes further edits until explicit successful reload; failed reload preserves both the chosen role and the lock. Confirmed saves remain confirmed when a subsequent activity read fails.

The constrained existing Stitch member-dialog design and inspected mature member-role reference guided the added row. OpenRouter's member page required sign-in, so it was not presented as inspected live member management. Actual desktop and 390px menus and saves changed a newly created member between Viewer and Admin. Concurrent publication caused a real 409; failed reload retained the choice/lock, and successful reload/resave restored the intended role. Failed initial reads, close/reopen and closing during a held read recovered from the backend snapshot. A real follow-up activity-read failure kept the saved role and displayed an explicit refresh warning.

Independent current-token requests and PostgreSQL verified six exact transitions, unchanged original scope/session identity/expiry and restored Viewer write denial. Platform Audit logs displayed the recorded role pairs and real actor/target names at desktop and 390px under legitimate installation sign-in. GUI revocation then made the original member token return 401, with all its sessions revoked. The zero-traffic workspace remained protected by retained audit records. Thirteen original request/financial table digests remained unchanged; no Provider, generation or payment call was made.

### Existing nonempty customer statement and credit-backed balance

The retained nonempty charge belongs to a different organization from the current ordinary Owner. That Owner received a privacy-preserving 404 for the foreign billing scope. Legitimate installation sign-in and normal workspace navigation read the existing customer-only Spending, Settled statement and text details at desktop and 390px. A real detail-read network failure recovered through Retry. Global Settings Billing showed the corresponding negative account balance, approved credit, remaining spending capacity and Request charge transaction. A settled statement does not imply zero account debt or an external payment.

Six actual customer API reads matched independent PostgreSQL integer charge arithmetic, the unique scoped negative debit, pinned customer price revision and recorded token quantities. Statement history and overview agreed on settlement, zero invoice due and exact reconciliation without open holds. Original provenance correlates the retained record to the archived native Messages pricing checkpoint; the upstream execution was not repeated or requalified. Both organizations' thirteen request/financial table digests remained unchanged. There were no new invoices, funding, debits, Provider calls or external receipts.

All saved advanced category and context-tier fields in this statement were null, and the current tariff equaled the bound revision. Their positive display and repricing behavior remain unverified; the source-only detail omission candidate stays open. The low-balance policy intentionally compares account balance without approved credit, as described in its existing configuration dialog.

### Appearance durability and uncertain-save recovery

Appearance already uses backend member preferences; browser storage is a disposable cache. The original Owner had no saved preference row and inherited System, so this run preserved that inheritance and created a temporary scoped member for actual writes. A normal color save survived reload and matched the API and independent PostgreSQL.

Failing a real PUT response after its HTTP 200 commit reproduced a mismatch: the backend retained the new mode while the UI claimed that its previous mode had been restored and allowed further writes. The hook now marks confirmation as uncertain, clears pending choices and freezes both Settings and account-menu choices. It displays truthful recovery guidance and reuses the existing Reload control. An actual guarded response-loss run followed by Reload issued one GET and no PUT, restored the saved server mode, cleared the error and re-enabled controls. Desktop and 390px states were inspected in the existing layout; the constrained Stitch review introduced no new controls or styles.

The temporary member and sessions were revoked. Normal password sign-in restored the original Owner profile exactly; API reads and independent SQL confirmed its preference row remained absent and inherited System. No branding, original password, encryption identity, Provider invocation or payment was changed.

### Workspace spending-limit persistence

A genuine Owner saved a decimal lifetime limit through the existing Billing → Spending editor on a newly created workspace. Current API reads and independent PostgreSQL matched the exact nanos and revision, with one immutable member-attributed history entry. The freshly built JavaScript SDK independently read the same current currency summary, exact limit and history through the running Gateway. The workspace had no API keys, inference attempts or customer charges; existing workspace configuration, limit history and member credential fingerprints were unchanged.

Normal switching between two new workspaces removed the previous workspace's editor. A real failed read in the second workspace displayed unavailable state; retry recovered its independent unsaved editor. The suspected cross-workspace draft leakage was not reproduced, and no scope-switch implementation change was made. Actual history reads returned an empty page before the first revision; invalid page size, cursor and lowercase currency returned 400.

A real successful PUT response was then lost after commit. Independent API and PostgreSQL reads confirmed the new limit and revision, while the old UI allowed another save. Recovery now uses the existing write-uncertainty classifier, freezes editing and requires validated current reads. An independent fresh response-loss run confirmed retained input, disabled editing/Cancel and an explicit Reload action at desktop and 390px. The first recovery GET failed and exposed no save action; Retry restored the committed amount and enabled editing. This recovery issued two GETs and no PUT. Reads begun before the uncertain outcome cannot clear the recovery lock. No layout or new control was introduced; TypeScript and the production build completed as static checks.

The constrained Stitch review supported the recovery wording and states in the existing Spending layout. The public OpenRouter keys page redirected to sign-in, so its authenticated limit editor was not inspected or claimed as a reproduced reference. This functional fix reuses Niu's established editor and Reload pattern without a visual redesign.

This qualifies the exercised save, persistence and recovery paths. It does not establish model-request enforcement, remaining conflict cases or all role boundaries. Workspace Settings retains its existing name/delete actions; monetary limits belong to Billing. Original records remained unchanged and no inference or financial transaction was created.

### Password sign-in eligibility

A newly issued token-only member could open Change password even though the current self-profile returned null email and independent PostgreSQL confirmed no password credential. The action requires proof of an existing current password, so it cannot initialize credentials. Password Settings now follows the authenticated profile's existing credential availability in addition to the deployment password-login capability. Desktop and 390px checks confirmed the truthful unavailable explanation and absence of the unsupported action in the established Settings layout. A constrained Stitch review introduced no new layout or setup flow.

Only this verification member subsequently received a credential through the existing authorized provisioning API. Independent reads confirmed its first credential revision, revocation of its token-only session and a new normal password-login session. An actual self-service password change redirected the browser to sign-in, invalidated the existing sessions, rejected the old password and allowed normal browser login with the new password. Final cleanup revoked the test member and all its sessions; normal password sign-in restored the original Owner. Original credentials, profile and inherited appearance were unchanged. These checks qualify the exercised eligibility and password-change paths; remaining settings branches remain open. TypeScript and the production build completed as static checks.

### Profile persistence and uncertain-save recovery

A real display-name and PNG upload saved through Account Settings. Independent decoding confirmed a 256×256 PNG within the backend size bound, identical submitted and persisted pixels, and matching API/database avatar bytes. A later name-only save retained the same avatar.

Losing a real successful PUT response reproduced an enabled Save action without Reload. The backend had committed the new name, while the shared account menu retained the previous name. The form now reuses the existing write-uncertainty classifier, freezes edits and offers authoritative reload. Validated reads also synchronize the confirmed profile with the shared account menu without another write.

Fresh response-loss runs verified the lock and shared-menu recovery. A subsequent failed GET retained the draft and disabled Save; successful GET restored the committed profile. The final recovery used one failed GET and one successful GET, with no repeated PUT. An actual concurrent profile publication caused 409; Cancel did not unlock Save, and Reload restored the exact published name. Desktop and 390px states were inspected. The constrained Stitch review retained the existing Settings layout and controls; generated route, icon and styling substitutions were discarded. TypeScript and the production build completed as static checks.

The temporary member and all its sessions were revoked, and normal password sign-in restored the original Owner. Independent final reads confirmed unchanged original identity, profile, password and inherited-preference records plus unchanged existing request/financial records. No Provider invocation or payment was created. This qualifies the exercised profile, avatar and recovery workflows, not every Settings or deployed-authentication branch.

### Supplier member current-offer rates

A new workspace Viewer received a separate Viewer membership for a retained verification Supplier. Its genuine issued-token sign-in accessed only that Supplier's portal. Actual session, membership, dashboard and quote-history reads succeeded; platform profile/member configuration returned 403 and another Supplier's dashboard returned 404. Independent PostgreSQL confirmed the exact scope and membership. Empty earnings and settlements remain empty-state observations, not positive financial acceptance.

The actual Models & pricing page omitted populated reasoning-output, cache-write and context-tier rates already present in the member DTO. It now renders those saved categories in the existing read-only offer presentation. Null base categories explicitly use their corresponding Input or Output rate. Tier thresholds are inclusive aggregate-input thresholds; null tier categories use that tier's Input or Output rate, never the base schedule. Desktop and 390px checks covered both populated and nullable offers, readable tiers and absence of mutation controls for the Viewer. Independent API/database comparison confirmed unchanged exact amounts and schedules.

The constrained Stitch review retained existing label/value presentation. OpenRouter's public Models page supplied current category labels and per-million units; no authenticated Supplier portal was claimed as an inspected reference. Generated styles, fees and incorrect generic tier inheritance were discarded. TypeScript and the production build completed as static checks.

The new membership was disabled and its member/sessions revoked, then normal password sign-in restored the original Owner. Independent final fingerprints confirmed unchanged original Supplier/configuration/model/offer, account and request/financial records. No Supplier credential, rate, offer state, qualification, Provider call or financial transaction changed. Historical-rate rendering, manager mutations and populated earnings/settlements remain unverified.

### Personal free-router SDK stream

A newly created verification workspace and short-lived key used one exact hidden model grant, bound to the existing personal OpenRouter credential and upstream `openrouter/free`. Independent reads confirmed no Supplier offer, routing pool or customer tariff. Original credentials, registered model records and identities were preserved. OpenRouter's [Free Models Router documentation](https://openrouter.ai/docs/guides/routing/routers/free-router) explicitly states that both the router and its routed free-model requests incur no charge.

One bounded request through the freshly built JavaScript SDK preserved explicit zero prompt/completion/request/image price caps and disabled fallbacks. The actual HTTP 200 stream delivered visible text, reported usage and a terminal stop without a generation retry. Independent PostgreSQL matched its bound completed attempt and stream-reported usage. A single read-only upstream generation-details request matched the persisted generation reference and confirmed total cost zero. Stream and generation-details prompt counters differed; their provenance remains distinct and no accounting adjustment was inferred from that difference.

No customer charge, reservation, debit, Supplier earning or procurement cost entry was created. The unpriced personal path's unresolved settlement metadata is not a settled customer invoice. Original durable request/financial rows remained exact; existing limiter housekeeping removed an expired admission-window row and inserted the new request's admission. This is personal integration evidence, not discounted commercial supply or qualification of a paid model.

The SDK run alone did not verify the Chat page. Initial browser inspection timed out before Send; another existing managed page in the same browser space remained healthy. Normal navigation there selected the exact verification workspace/key/model and submitted one guarded GUI request. Its pre-dispatch check confirmed the intended bridge, model and bounded request body without tools, plugins or fallback models. The current composer does not send the SDK's explicit price caps; the exact free-only route and single-model key grant provide this run's cost boundary.

The real stream completed with visible text and usage. Normal reload and a second existing tab restored the same saved conversation at desktop and 390px without another completion request. Independent API/database checks matched the owner, workspace, model/key, turns, settings, reply and bound attempt. Live customer-charge projections were compared separately from stored conversation data. The GUI request's own read-only upstream generation-details receipt also confirmed zero cost. Exactly two generations occurred across this scope: one SDK and one GUI, with no retry.

The actual history menu exposed its existing actions. Inspect request opened the matching saved Logs detail at desktop/390px, showing the named key, completed status, stream-reported usage, recorded timing and personal funding context. These read-only actions made no additional model call. The initial scope did not qualify lifecycle mutations, continuation, cancellation or attachments; the subsequent scope below qualifies specific additional actions. This is not full Chat workflow acceptance.

### Low-balance warning with approved credit

The existing account warning correctly compares raw account balance with its saved threshold and excludes approved credit. In the retained credit-backed account, spending capacity remained positive while this warning appeared. Its old copy referred to available spending capacity; the replacement explicitly explains the threshold and excluded credit. A constrained Stitch wording review and actual desktop/390px rendering verified the same account values, readable warning and transaction scroll access. Financial logic and stored records were unchanged.


### Saved Chat lifecycle, continuation and connected-stream cancellation

An actual newly saved Chat was renamed, archived and restored through the existing dashboard controls. Independent saved records confirmed the title and archive transitions, unchanged messages, settings and model bindings, and unchanged other sessions. Selecting the restored history entry recovered its saved response.

One subsequent free-router continuation appended a second completed turn to the same session. Its saved result bound to the new request, retained the first turn and custom title, and matched the persisted stream usage. Reload and an existing second browser tab restored both turns at desktop and 390px. The independently read upstream receipt for that exact generation reported zero cost.

One further request was stopped only after the real upstream stream connection had returned HTTP 200. No output had arrived. The saved third turn remained canceled after reload and in the second tab; the first two turns stayed unchanged. Backend diagnostics correctly retained `may_have_executed`, unknown usage and unresolved settlement. Cancellation does not prove upstream nonexecution or a refund. The exact upstream generation receipt separately reported zero cost.

These two additional requests bring this bounded personal free-router scope to four actual requests. Independent persistence checks found no customer charges, ledger debits or Supplier earnings associated with them and retained the original durable financial records. Explicit branching controls, deletion and attachment workflows remain unverified. No paid generation was performed.


### Canonical workspace routes and legacy redirects

A current authorized workspace returned HTTP 200 in both the workspace directory and the exact route lookup, yet its canonical Video route displayed Workspace unavailable. Generations with that same routing reference fell back to another selected workspace. The frontend had ignored the backend's immutable `route_slug` and independently derived a name-based slug.

Workspace links now use the backend routing reference. Existing name-based bookmarks and legacy ID routes remain compatible when they resolve uniquely. Actual canonical and old friendly Video links resolved the same workspace at desktop and 390px. Generations subsequently loaded that workspace's exact key and saved-draft endpoints and settled to its own new-generation state. The initial loading transition remains a separate review item; these checks do not qualify all transient rendering states.

The Chat redirect and four Supplier/native-video aliases now retain the original query and fragment. Actual browser checks verified the five destinations and markers at desktop and 390px. No model invocation was made in this routing scope. The dashboard production build completed; fixture outcomes were not used as evidence. Remaining administrative index aliases have not been qualified.


### Unavailable explicit workspace scope

An actual Generations URL with an unavailable explicit workspace parameter persistently restored a different workspace's saved Chat and exposed its attachment, settings and key controls. No request was submitted in this reproduction. An explicit scope now resolves synchronously for the page and model context; unavailable references do not enter the implicit selected-workspace fallback.

Actual desktop and 390px checks displayed the existing Workspace unavailable recovery with no Chat composer or saved response. Resource capture contained no workspace-key, Chat-draft or Chat-session reads for the unavailable scope. The existing recovery link opened an available workspace; valid saved-Chat and sibling-workspace URLs retained their respective saved and empty states. The production build completed. A previously observed transient old-response render was not reproduced by the refined timing check and remains unverified independently of this fixed persistent fallback.


### Chat draft attachment persistence and removal

A real local PNG was attached to the existing own Chat draft without submitting a model request. The genuine saved response and a subsequent authorized GET matched PostgreSQL. Independent verification decoded the saved image and matched both its original bytes and pixels. Reload and an existing second page restored the filename, thumbnail and unsent prompt at desktop and 390px.

The normal Remove action saved an empty attachment list. A subsequent explicit revision-checked restore returned the exact original draft payload at a newer revision, and normal reload recovered the original empty composer. All saved sessions and the four prior request records remained unchanged; independent durable request/financial fingerprints matched the pre-operation records. The original short-lived key expired naturally and its stored row was unchanged. Draft restoration did not require renewing that key.

This qualifies PNG draft persistence, removal and restoration under the existing workspace actor. It does not qualify attachment transmission to a model, other file formats, file limits, concurrent draft conflicts or all browser states. No model call was made in this scope.


### Saved Chat content export

The existing history menu downloaded a real `niu-chat` version-one JSON file at desktop and 390px. Its full contents matched the actual export API response and an independently derived allowlisted projection of the current PostgreSQL session: custom title, creation time, all three prompts, model/content/result phases and attachment content. The two completed turns and canceled turn remained distinct.

Export is intentionally conversation-content-only. Routing identifiers, usage, accounting, credentials and diagnostic errors are excluded; it is not a billing or Logs export. Strict field checks confirmed this boundary in the downloaded artifact. The saved session, four existing attempts and durable request/financial records remained unchanged. No model request was made. Export failure/retry and other actor/role branches remain unverified in this scope.


### Name-only Supplier lifecycle and configuration navigation

The actual administration directory created one name-only Supplier through its normal dialog. Authorized API and independent PostgreSQL reads confirmed the name and zero credentials, models, memberships, offers and financial dependencies. The resulting Overview, API keys & routes, Models & pricing, Usage, Settlements, Portal access and Settings sections were inspected at desktop and 390px. Configuration and pricing entries remained reachable; empty sections did not claim an active supply relationship or completed credential setup.

Reload required the existing installation sign-in again, after which the same saved Supplier remained available. The normal Delete action removed it from active inventory. Independent storage verification found its retained deletion tombstone and the exact creation/deletion audit records, with no business dependencies. Original Supplier/credential configuration, Owner records and durable request/financial records remained unchanged. Normal navigation out of installation administration restored the original already-valid Owner cookie session; this was not a new password sign-in.

This qualifies name-only creation, navigation, persistence and dependency-free soft deletion. It does not qualify credential onboarding, model discovery, live supply, Supplier earnings or settlements. No upstream call was made and no existing credential was changed.


### Independent Supplier API-key configuration

Two previously created, disabled audit credentials belonging to the same Supplier were selected and edited independently through the normal API-key dialog. Each name was saved, read back and restored before editing the other key. Desktop and 390px checks covered the open key-choice menu, selected key, saved name and model-route counts.

Independent PostgreSQL snapshots at all four saves confirmed each selected key alone advanced its revision twice. Both original names were restored; encrypted credential bytes, API base, adapter, disabled status, other protected fields, model bindings and offer bindings remained unchanged. The other key stayed unchanged during each individual save. Existing production credentials, other Supplier configuration, Owner records and durable financial/request records remained unchanged.

This qualifies independent name configuration for two existing disabled keys. It does not qualify credential replacement, enabled route discovery, live model calls, endpoint changes or all conflict/recovery branches. No upstream call was made.


### Zero request-rate admission

A new short-lived own key was restricted to one existing personal free-route alias, then given an explicit zero requests-per-minute policy. API and independent PostgreSQL reads confirmed the policy before one actual built-SDK invocation. The request returned HTTP 429 `key_request_rate_disabled`, with no retry or stream events.

Independent persistence verification found one new prepared `not_sent` attempt with null dispatch time and no bound dispatch key. There was no upstream generation reference, key or Supplier rate admission, customer reservation, debit or Supplier earning for that attempt. The prior four attempts, saved sessions/drafts and original durable financial records remained unchanged. The new key and its fresh CLI session were revoked afterward; the original expired key was not renewed.

The key detail displayed `0 · New requests blocked` at desktop and 390px. Logs honestly showed Not sent, unknown usage and Not charged, but its requested key and admission reason were absent; C22 tracks that diagnostic gap. This scope qualifies zero request-rate rejection, not positive-window exhaustion, concurrency/token limits, budget admission or complete Logs diagnostics. No Provider generation occurred.


### Supplier audit actor attribution

New Supplier creation and deletion now pass the authenticated platform actor into the same transaction that saves the immutable business audit event. The aggregate platform audit projection identifies explicit installation actions while retaining the existing operator-reference fallback. Legacy storage callers retain unknown provenance; the migration adds an explicit unknown default without guessing historical actors.

On the updated audit runtime, one actual GUI name-only Supplier create/delete cycle produced two installation-attributed events. Independent PostgreSQL and audit API reads matched both actions and the Installation administrator label. All 48 pre-migration events retained their original fields and unknown defaults. The own Supplier retained its deletion tombstone. Existing Supplier configuration, Owner accounts and durable financial/request records remained unchanged. Actual ordinary Owner requests to platform audit and Supplier deletion returned 403.

Browser checks compared the new attributed events with historical Not recorded entries at desktop and 390px. All-events and Configuration Load more preserved the first 50 rows while appending the next 50; actual API pages and rendered row identities matched without duplicates. The category menu and narrow readable labels were inspected. No Provider call was made.

The gateway build and formatting check completed. No fixture outcome was used. There was no active platform-administrator member available for a genuine operator-actor run, and no role grant was manufactured; that branch remains unverified. Remaining audit read-failure/retry branches are separate scope.


### Persisted request-rate rejection diagnostics

A small immutable admission-denial record now preserves the checked zero-request-rate reason and the authorized key's captured name and revision after the failed dispatch transaction rolls back. It is separate from upstream failures, dispatch-key binding and customer/Supplier accounting. Recording failure preserves the original rejection without retrying or authorizing dispatch. Existing prepared-attempt retry behavior is retained; customer diagnostics expose this observation only while the attempt remains unsent. Historical records are not backfilled.

One actual request through the separately built SDK, using a new short-lived key with independently confirmed RPM zero, returned `429 key_request_rate_disabled` without retries or stream events. PostgreSQL held one immutable denial and an unsent prepared attempt. Actual workspace request-list and detail responses matched the safe captured diagnostic fields, with no requested-key identifier or revision exposed. There was no upstream generation reference, rate admission, reservation, charge or earning. Original attempts, sessions, drafts, configuration and Owner records were retained; the other eleven financial fingerprints remained unchanged.

The existing Logs Overview now shows the recorded failure reason, Gateway HTTP 429 and Requested API key. Desktop and 390px browser checks qualified the new denial, the previous unrecorded denial's unchanged Unknown state, and an existing completed request's unchanged timing, usage and funding display. The new test key and CLI session were revoked; authorized API and browser reads still returned the original captured diagnosis afterward. No Provider generation occurred.

The existing Stitch project and design system reviewed the minimal detail-row addition. OpenRouter Activity redirected to sign-in, so an authenticated reference layout was not claimed. No new layout or controls were introduced. Gateway, SDK, dashboard and documentation builds/checks completed; generated OpenAPI and SDK declarations include the nullable field. The served SDK declaration page was inspected at desktop and 390px. Fixture outcomes were not used.

This qualifies the durable prepared-attempt RPM-zero path. Priced/batch admission, other rejection kinds, diagnostic-storage failure, later successful retry remain unverified. Failure/key filtering is qualified separately below. Null diagnostics remain unknown rather than inferred from current key configuration.


### Recorded-failure and requested-key filters

Actual reads reproduced two omissions: the recorded-failure filter returned a saved stream failure but omitted the new Gateway admission denial; selecting its revoked requested key returned an empty list. The existing Status menu also omitted the documented API filter and showed its raw enum in a URL-selected chip.

Shared list/summary/export filtering now includes saved Gateway denial evidence only while its attempt remains unsent. Key filtering matches either the real dispatch key or that saved requested-key identity; billing attribution and usage grouping remain unchanged. A missing observation does not classify an uncertain or merely unsent attempt as a failure. The existing Status menu and chip use the readable Recorded failure label.

On the updated runtime, independent SQL-derived identity sets matched actual list, summary and CSV-export responses for recorded failure, the requested key and their intersection. The new denial and prior stream failure appeared under recorded failures; the old unrecorded denial and completed requests stayed excluded. Actual foreign-workspace access returned 404 without data. All original saved/configuration rows and durable financial fingerprints remained unchanged; no new key or generation request was created.

Desktop and 390px browser checks exercised the open status/key menus, both filters, their combination and clearing. Results matched the actual API identities without duplicates; clearing restored all six original workspace records. The existing Stitch project reviewed the minimal menu addition. Gateway, dashboard and docs builds/checks completed; the served annotated specification matched the generated source bytes and current filter descriptions. Fixture outcomes were not used.
