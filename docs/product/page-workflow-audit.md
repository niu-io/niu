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
| P05 | API key list | `/workspaces/:workspace/keys` | Filter, grants, expiry, status, navigation | Not checked |
| P06 | API key creation | `/workspaces/:workspace/keys/new` | Validation, permissions, one-time secret, persistence | Not checked |
| P07 | API key detail | `/workspaces/:workspace/keys/:key` | Limits, rotation, revocation, history, conflict recovery | Not checked |
| P08 | Workspace members | `/workspaces/:workspace/users` | Invite/manage roles and scope enforcement | Not checked |
| P09 | Organization management | `/workspaces/:workspace/organization` | Company/workspace ownership and supported actions | Not checked |
| P10 | Workspace settings | `/workspaces/:workspace/settings` | Saved scope settings and limits | In review: rename/reload and guarded empty-workspace deletion verified; limits/boundaries pending |
| P11 | Guardrails | `/workspaces/:workspace/guardrails/:section?` | Every supported section, preview, activation, conflicts, roles | Not checked |
| P12 | Workspace Logs | `/workspaces/:workspace/executions` | Filters, details, exports, timing, unknown usage, customer charges | Not checked |
| P13 | Global Gateway Activity | `/activity/:section?` and `/workspaces/:workspace/usage` | Global/workspace scope, coverage, drilldowns; excludes external Agent Observability | Not checked |
| P14 | Model list | `/models` | Global catalog, selected workspace context, filters, prices, eligibility | Not checked |
| P15 | Model detail | `/models/*` | Capabilities, qualified access, setup and request examples | Not checked |
| P16 | Generations Chat | `/generations` | Model/key selection, messages, branches, cancellation, attachments, persistence | Not checked |
| P17 | Generations Video | `/generations?new=video` | Drafts, references, async tasks, original recovery, preview/download | In review: native tools, durable draft restore/conflicts and historical preview verified; references/submission/shared-output actions pending |
| P18 | Writing entry points | `/generations` | Existing writing templates and supported Chat flow; no new editor | Not checked |
| P19 | Generation session history | `/generations` | Restoration, archived/deleted input, revoked keys, actor isolation | In review: revoked/expired-key input restoration, actor isolation and cached preview verified; full timeline pending |
| P20 | Native video materials | `/workspaces/:workspace/video/volcengine/:section?` | Exact account context, groups/materials, validation, uncertainty, observations | Fix needed: Video exact context corrected; standalone selection/recovery pending |
| P21 | Native verification tools | `/workspaces/:workspace/video/volcengine/:section?` | Capability-gated explicit workflow; no fabricated H5 completion | In review: capability-gated entry and saved read observed; verification creation not exercised |
| P22 | Shared task/output integration | `/generations` | Existing task/artifact inventory and durable save; UI integration gap candidate | Not checked |
| P23 | Admin Supplier list | `/admin/suppliers` | Onboarding, multiple credentials, adapter choice, discoverability | In review: adapter controls verified; onboarding writes pending |
| P24 | Admin Supplier details | `/admin/suppliers/:supplier/:section` | Overview, API keys & routes, Models & pricing, Usage, Settlements, Portal access, Settings | In review: saved credential editing verified; remaining tabs pending |
| P25 | Admin customer pricing | `/admin/pricing` | Published customer categories, history, edit/conflict validation | In review: reasoning publication/readback verified; remaining pricing workflows pending |
| P26 | Admin payments | `/admin/payments` | Complete supported inventory, configuration and unavailable states | Verified scope: complete supported inventory and existing configuration entry; merchant activation not exercised |
| P27 | Admin audit logs | `/admin/audit-logs` | Filters, pagination, readable actors/actions, platform authorization | Not checked |
| P28 | Admin branding | `/admin/branding` | Preview, validation, save, conflict recovery and shared shell consistency | Not checked |
| P29 | Supplier member portal | `/suppliers/:supplier/:section?` | Own offers/models/consumption/settlements and permissions | Not checked |
| P30 | Global Settings | `/settings/:section?` | Account, Appearance, Billing, Payments, About; underlying-page return | In review: actual profile save observed; remaining settings/conflict states pending |
| P31 | Help and documentation | `/help/* and /docs/*` | Actual destinations, navigation, truthful API/SDK capabilities | In review: current Generations guide served in dashboard iframe at desktop/narrow; full navigation/link coverage pending |
| P32 | Public model catalog | `Public catalog model routes` | Anonymous routes and dashboard handoff; separate marketing ownership | Not checked |
| P33 | Compatibility and not-found routes | `Legacy redirects and unknown URLs` | Destination/query preservation and useful recovery | Not checked |
| P34 | Deferred legacy surfaces | `/benchmarks` and legacy redirects | Check product boundary and entry points; do not revive excluded orchestration | Not checked |
| P35 | Workspace Billing | `/workspaces/:workspace/billing` | Customer charges, rates, statement details/pagination, workspace spending limits and confidential-data boundaries | Not checked |

## Prioritized source candidates

These are source findings awaiting current-input reproduction, not integrated acceptance conclusions.

| Candidate | Priority | Page families | Concrete suspected gap | State |
| --- | --- | --- | --- | --- |
| C01 | P1 | P17, P19 | Saved Video history requires active keys instead of historical workspace/session access | Historical input/status and cached preview qualified; billing/timing still require original active key |
| C02 | P1 | P17, P20, P21 | Unsupported models expose native materials and verification tools before failing | Video scope fixed; standalone gap remains |
| C03 | P1 | P20 | Material validation errors remain behind dialogs; unknown operations lack explicit recovery | Inline/network-failure scope fixed; durable recovery remains open |
| C04 | P1 | P17, P22 | Existing task/artifact/durable capture SDK is not consumed by product pages | In review |
| C05 | P1 | P17 | Image/reference submission bypasses retained intent association | In review |
| C06 | P1 | P23, P24 | Supplier adapter controls omit backend-supported Anthropic/Gemini/Ark | Fixed; verified scope below |
| C07 | P2 | P26 | Supported unconfigured payment integrations are hidden | Fixed; inventory scope verified |
| C08 | P2 | P30 | Profile save does not update shared account-menu session state | In review |
| C09 | P2 | P11 | A stale revision conflict does not lock repeated saves until reload | In review |
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

The original successful paid Mini task was opened with its expired original API key. An explicit cached preview loaded through the workspace Tasks/Artifacts SDK at desktop and 390px width. Browser-decoded duration was 5.088 seconds; the downloaded 792,757 bytes matched the independently retained original file by SHA-256. This produced no new generation. Retained library-copy preview, fresh-result actions and key-independent billing/timing remain unverified.

### Mutable Video composition

The new backend-owned Video draft stores unfinished text, typed controls and Niu references with revision checks and a 30-day edit retention period. Actual API writes were independently read from PostgreSQL; stale writes were rejected, inline/base64 references were rejected, and retained drafts blocked workspace deletion. Clearing a confirmed revision retained a tombstone against stale recreation. A different signed-in actor read an independent empty draft.

Actual browser edits saved the prompt and watermark. Refresh and a second tab restored the same composition; independent PostgreSQL reads matched both fields. A two-tab conflict preserved the losing tab's input and required explicit loading of the saved draft. Desktop and 390px checks covered this state. Inline attachments are explicitly unsaved and must be reattached. No submission was made; post-submission clearing, typed reference selection and full expiry/restart UI qualification remain pending.

### Native operation inventory API

Bounded saved-operation listing and exact idempotency lookup now exist in both workspace-key and customer API paths. An actual configured model returned saved operations, nonoverlapping continuation pages and no-store responses. Independent SQL supplied the original idempotency reference; lookup returned the same safe operation representation. These reads made no upstream mutations. Dashboard recovery integration and remaining denied/invalid-query branches remain pending.
