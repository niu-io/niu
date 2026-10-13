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
| P01 | Login and member session | `/login` | Destination, restore, expiry, sign-out, errors | In review: actual member sign-in/session restoration observed; expiry/sign-out pending |
| P02 | Installation administration | `/installation` | Platform sign-in and role boundaries | In review: actual installation sign-in and member/platform navigation observed; full boundaries pending |
| P03 | Workspace directory | `/workspaces` | Create, switch, rename, delete, empty/error states | In review: actual create/rename/reload/delete and independent database checks verified; narrow/error states pending |
| P04 | Workspace overview | `/workspaces/:workspace` | Real summary and action destinations | In review: actual new empty workspace and action destinations inspected; request details pending |
| P05 | API key list | `/workspaces/:workspace/keys` | Filter, grants, expiry, status, navigation | In review: actual list/detail navigation and nullable expiry inspected; filters/full grants pending |
| P06 | API key creation | `/workspaces/:workspace/keys/new` | Validation, permissions, one-time secret, persistence | In review: actual nonexpiring creation/null API expiry and independent database persistence; protocol example fix pending |
| P07 | API key detail | `/workspaces/:workspace/keys/:key` | Limits, rotation, revocation, history, conflict recovery | In review: actual detail/expiry and own verification-key revocation/reload; limits/rotation/conflicts pending |
| P08 | Workspace members | `/workspaces/:workspace/users` | Invite/manage roles and scope enforcement | In review: actual member list/search/create form and role/TTL menus; writes/role changes pending |
| P09 | Organization management | `/workspaces/:workspace/organization` | Company/workspace ownership and supported actions | In review: actual workspace links and create dialog desktop/narrow; full ownership boundaries pending |
| P10 | Workspace settings | `/workspaces/:workspace/settings` | Saved scope settings and limits | In review: rename/reload and guarded empty-workspace deletion verified; limits/boundaries pending |
| P11 | Guardrails | `/workspaces/:workspace/guardrails/:section?` | Every supported section, preview, activation, conflicts, roles | In review: all sections/menu states checked; actual save/conflict/reload and independent versions verified; enforcement pending |
| P12 | Workspace Logs | `/workspaces/:workspace/executions` | Filters, details, exports, timing, unknown usage, customer charges | In review: actual existing Video log, detail, filter and independently parsed export verified; remaining error/role branches pending |
| P13 | Global Gateway Activity | `/activity/:section?` and `/workspaces/:workspace/usage` | Global/workspace scope, coverage, drilldowns; excludes external Agent Observability | In review: current global/workspace coverage, pagination, drilldown and narrow workspace menu verified; remaining status/role branches pending |
| P14 | Model list | `/models` | Global catalog, selected workspace context, filters, prices, eligibility | In review: actual workspace list/filter/sort and Video destinations at desktop/narrow; full access/pricing boundaries pending |
| P15 | Model detail | `/models/*` | Capabilities, qualified access, setup and request examples | In review: actual Video guidance corrected; explicit different-model restoration checked; inference admission pending |
| P16 | Generations Chat | `/generations` | Model/key selection, messages, branches, cancellation, attachments, persistence | In review: known Video models excluded from Chat, historical failure preserved and dispatch controls checked; actual text submission/branch workflows pending |
| P17 | Generations Video | `/generations?new=video` | Drafts, references, async tasks, original recovery, preview/download | In review: native tools, draft conflicts, metadata-only session save/reopen and historical preview verified; image submission/shared-output actions pending |
| P18 | Writing entry points | `/generations` | Existing writing templates and supported Chat flow; no new editor | In review: actual Writing template prefill/focus checked at desktop and narrow widths; text generation not exercised |
| P19 | Generation session history | `/generations` | Restoration, archived/deleted input, revoked keys, actor isolation | In review: revoked/expired-key reads, actor isolation, original session binding restore and cached preview verified; full timeline pending |
| P20 | Native video materials | `/workspaces/:workspace/video/volcengine/:section?` | Exact account context, groups/materials, validation, uncertainty, observations | In review: explicit named key/model selection, original context reads, unsupported selection and reload qualified; durable operation recovery pending |
| P21 | Native verification tools | `/workspaces/:workspace/video/volcengine/:section?` | Capability-gated explicit workflow; no fabricated H5 completion | In review: capability-gated entry and saved read observed; verification creation not exercised |
| P22 | Shared task/output integration | `/generations` | Existing task/artifact inventory and durable save; UI integration gap candidate | Not checked |
| P23 | Admin Supplier list | `/admin/suppliers` | Onboarding, multiple credentials, adapter choice, discoverability | In review: adapter controls verified; onboarding writes pending |
| P24 | Admin Supplier details | `/admin/suppliers/:supplier/:section` | Overview, API keys & routes, Models & pricing, Usage, Settlements, Portal access, Settings | In review: all seven sections and invalid RPM/cancel inspected; narrow active-tab visibility fixed; writes/conflicts pending |
| P25 | Admin customer pricing | `/admin/pricing` | Published customer categories, history, edit/conflict validation | In review: reasoning publication/readback verified; remaining pricing workflows pending |
| P26 | Admin payments | `/admin/payments` | Complete supported inventory, configuration and unavailable states | Verified scope: complete supported inventory and existing configuration entry; merchant activation not exercised |
| P27 | Admin audit logs | `/admin/audit-logs` | Filters, pagination, readable actors/actions, platform authorization | In review: new installation Branding actor and unchanged historical unknown actors independently verified; operator/pagination boundaries pending |
| P28 | Admin branding | `/admin/branding` | Preview, validation, save, conflict recovery and shared shell consistency | In review: actual save, stale conflict freeze/reload, normalized logo pixels and original configuration restoration verified; remaining fields/roles pending |
| P29 | Supplier member portal | `/suppliers/:supplier/:section?` | Own offers/models/consumption/settlements and permissions | In review: ordinary workspace Owner without Supplier membership denied; positive Supplier-member workflows unverified |
| P30 | Global Settings | `/settings/:section?` | Account, Appearance, Billing, Payments, About; underlying-page return | In review: profile save and all five sections inspected; password expansion, appearance menu and empty funding/payment states checked; writes/conflicts pending |
| P31 | Help and documentation | `/help/* and /docs/*` | Actual destinations, navigation, truthful API/SDK capabilities | In review: current guide, REST/SDK navigation, OpenAPI download and desktop/narrow 404 recovery verified; full link inventory pending |
| P32 | Public model catalog | `Public catalog model routes` | Anonymous routes and dashboard handoff; separate marketing ownership | In review: anonymous empty catalog, current header/menu, same-origin workspace handoff and network failure/recovery verified; published rows/pricing/capabilities pending |
| P33 | Compatibility and not-found routes | `Legacy redirects and unknown URLs` | Destination/query preservation and useful recovery | In review: legacy billing/usage query and hash preservation plus unknown-route recovery verified; remaining aliases pending |
| P34 | Deferred legacy surfaces | `/benchmarks` and legacy redirects | Check product boundary and entry points; do not revive excluded orchestration | In review: actual offline-only analysis boundary and guide inspected; dataset analysis not exercised |
| P35 | Workspace Billing | `/workspaces/:workspace/billing` | Customer charges, rates, statement details/pagination, workspace spending limits and confidential-data boundaries | In review: actual empty Spending/Rates tabs; category/context-tier and statement workflows pending |

## Prioritized source candidates

These are source findings awaiting current-input reproduction, not integrated acceptance conclusions.

| Candidate | Priority | Page families | Concrete suspected gap | State |
| --- | --- | --- | --- | --- |
| C01 | P1 | P17, P19 | Saved Video history requires active keys instead of historical workspace/session access | Historical input/status and cached preview qualified; billing/timing still require original active key |
| C02 | P1 | P17, P20, P21 | Unsupported models expose native materials and verification tools before failing | Video scope fixed; standalone explicit context selection qualified; broader account/error branches pending |
| C03 | P1 | P20 | Material validation errors remain behind dialogs; unknown operations lack explicit recovery | Inline/network-failure scope fixed; durable recovery remains open |
| C04 | P1 | P17, P22 | Existing task/artifact/durable capture SDK is not consumed by product pages | In review |
| C05 | P1 | P17 | Image/reference submission bypasses retained intent association | Metadata session preparation qualified; backend rejects local-reference idempotent submission; dashboard image attachment integration remains open |
| C06 | P1 | P23, P24 | Supplier adapter controls omit backend-supported Anthropic/Gemini/Ark | Fixed; verified scope below |
| C07 | P2 | P26 | Supported unconfigured payment integrations are hidden | Fixed; inventory scope verified |
| C08 | P2 | P30 | Profile save does not update shared account-menu session state | In review |
| C09 | P2 | P11 | A stale revision conflict does not lock repeated saves until reload | Fixed; actual conflict/reload/publication scope verified |
| C10 | P2 | P13 | Known token totals omit reported-usage coverage | In review |
| C11 | P2 | P25 | Backend-supported reasoning customer prices lack an editor | Fixed; publication scope verified |
| C12 | P2 | P17 | Unsubmitted Video drafts exist only in component memory | Draft restore/conflict scope verified; submission clear and reference picker pending |

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

Intent reads now project the original nullable session binding through the existing actor/workspace/intent index. Reopening a link with only the intent restored the exact original session/turn and retained prompt; no replacement history traversal or binding was created. The current HTTP response and independently downloaded full OpenAPI operation schema contained the binding. Generated SDK documentation rendered in Help at desktop and narrow widths. Local workspace-image submission remains blocked by the backend's current idempotency guard; the pending image attachment UI is not delivered or qualified as a working generation flow.

### Current public catalog and failure state

The current catalog was built and served through the existing same-origin composition. Anonymous current API data was genuinely empty; no personal test route was published to imitate commercial availability. Desktop and 390px checks covered the empty state, the hydrated public navigation menu, Escape dismissal and the workspace API-key destination. A real blocked browser network request displayed Unavailable; restoring the connection and reloading displayed the actual empty count. Failed loading no longer reports zero known routes. Development requests now honor the configured Gateway URL, retaining the existing default. Populated route pricing, capability labels and visibility remain unverified with the current empty public inventory.
