# Settings and navigation UX checkpoint

Updated on October 8, 2026. This checkpoint covers the current settings and navigation changes; it does not establish whole-product UX or release completion.

## Current review state

The current global Settings surface is a fixed-height dialog with Account,
Appearance, Billing, Payments and About, subject to account permissions. Its
200px desktop sidebar can collapse to icons; mobile section navigation remains
reachable. Workspace configuration stays in each workspace's own Settings page.
The workspace breadcrumb has an overview link and a separate workspace-switch
menu, alongside the current-page menu. Switching from an API-key detail opens
the destination key list rather than carrying a key from another workspace.

Later sections record subsequent verification and supersede earlier UI
descriptions. Entries below that describe General, combined Billing & payments,
installation-only login or Settings as a rail section are historical evidence,
not the current product structure. The remaining runtime coverage table records
journeys that still lack sufficient live qualification; passing tests do not
establish whole-product completion.

## Live qualification still required

The following states remain open. They need representative existing test data or an approved account; empty-state screenshots and component fixtures do not prove them.

| Area | Missing live evidence |
| --- | --- |
| Supplier portal | Supplier-only account navigation and populated members, offers, usage, and settlements |
| Video | Configured route, attachments, estimate, generation result playback, and saved history |
| Logs | Retained request/response payload rendering; recent sampled payloads were expired or unavailable |
| Benchmarks | Populated comparison report with representative acceptance evidence |
| Account | Successful avatar upload, password-change handoff, and profile conflict recovery |
| Payments | Populated transaction history and configured merchant checkout |

Historical verification entries follow. Their test counts and obsolete interface descriptions are not the current acceptance status.

## Verified behavior

- Global Settings combines personal profile, password and color mode in General, with a separate Billing & payments section when authorized. Administrator sessions enter billing directly rather than an otherwise empty preferences section.
- Administrator billing was inspected at desktop and 390px widths. Content scrolls inside the fixed-height dialog, Transactions remains reachable, and the Close control stays accessible.
- Docs use the installed shadcn DropdownMenu for System, Light and Dark choices. Selecting a mode updates the enclosing dashboard, and article navigation preserves the selected appearance.
- The mobile docs dropdown portal remains inside Starlight's native top-layer sidebar. Open menus were visually checked at desktop and 390px widths, including selection and icon spacing.
- Supplier switching does not reload its directory merely because selection changes. Retry and session-change coverage remain in place. Desktop and narrow menus were inspected using the configured Supplier; the two-Supplier switch is covered by an integration test.
- Supplier qualification has a shorter action summary. Evidence-format instructions remain in the review dialog. The heading and status badge wrap without compressing the heading at narrow widths.
- Profile conflicts prevent repeat writes using a stale revision until a successful reload. Failed saves retain edits. These states are covered by component tests.
- Personal General was inspected using a temporary scoped member session at desktop and 390px widths. Display-name saving and the open System/Light/Dark menu were verified against the running gateway. Password sign-in was disabled in this installation.
- Member color mode is stored in PostgreSQL. A saved mode remained selected after a fresh page load; changing mode in embedded Documentation was verified through a subsequent backend read. Cache hydration and removal do not create preference writes. Cross-document choice events are scoped to the current member.
- Failed appearance reads offer reload; failed saves restore the last confirmed mode. Rapid choices are serialized and late responses from previous accounts are ignored. These failure states are covered by component tests.
- Profile and password controls use distinct state keys and reset on account changes. Photo decoding that finishes after closing the form releases the image without updating the closed form. Photo selection clears the file picker before validation, allowing the same rejected file to be selected again; the six profile regression tests passed. This file-picker change still requires browser qualification.
- Settings billing uses the account generation to reset state when members share a browser session marker. Billing and checkout component keys no longer contain bearer credentials. Settings, balance and checkout regression coverage passed together (34 tests); this state-reset change does not establish new visual qualification.
- Password editing follows the inspected OpenRouter account-management row/action pattern: fields open on demand, focus starts at the current password, and Cancel clears sensitive fields and returns focus to the action. Password controls are absent when password sign-in is unavailable. Component coverage verifies these interactions; enabled browser qualification remains pending because the test origin's certificate was not trusted by the browser.

## Checks

- Latest full dashboard run: 67 files and 405 tests passed. Settings coverage includes unfinished profile edits across section changes, account changes with a shared browser session marker, organization-access loss, scoped billing permissions, durable appearance preferences and recoverable profile failures. An earlier run had four Chat/Supplier failures; this fresh full run passed without file-specific reruns.
- `pnpm --dir apps/dashboard build`: passed.
- `pnpm --dir apps/docs build`: passed, with existing MDX directive and missing custom 404 content warnings.
- `pnpm --dir apps/docs check`: zero errors, warnings or hints.
- Targeted diff whitespace checks passed.
- Rust gateway check and the PostgreSQL `appearance_is_member_owned_durable_and_validated` test passed. This covers member isolation, all three modes, invalid and targeted writes, revoked sessions, and independent profile revisions.

## Remaining verification

Personal photo upload, enabled password-change controls and profile-conflict states still require rendered browser qualification; passing component tests do not close that requirement. Populated billing history and configured merchant checkout are not established by this checkpoint. Member appearance preferences have verified backend persistence; installation-only credentials have no personal account, so their display choice remains local. This checkpoint does not establish complete account or whole-product UX.

## Additional live review — October 7

The current installation session was inspected in the running Settings dialog. Billing opens directly and its content scrolls inside the dialog. The second tab, Media selling rates, currently shows an empty publishing state within account Billing. This is a platform pricing workflow rather than an account preference or payment workflow. It needs relocation to an authorized platform pricing surface while preserving publication/history access; simply removing its only entry point would lose functionality. The review did not publish a price, change funds or modify user data. The controls have since moved into the existing Organization settings surface, gated to installation administrators and scoped to the selected organization. Global Settings billing no longer contains the pricing tab. Publication/history remain available through the unchanged MediaRateHistory workflow. Both updated desktop surfaces were inspected in the running dashboard; seven settings/organization tests and the production dashboard build passed. The actual organization page was also inspected in a 390×640 embedded viewport: pricing text and the publication action fit, the no-eligible-model dialog opened within the viewport, and Close returned to the same page. Two additional regression tests confirm organization owners do not see or request platform rates and installation sessions read rates for the selected organization. Dashboard type checking passed. Publishing populated eligible models remains unqualified in the browser. Backend role enforcement was separately verified by rerunning the PostgreSQL video_selling_configuration_requires_installation_write_access test: inference credentials are rejected and organization Owner/Admin/Viewer actors are forbidden from reading and publishing/transitioning rate configuration. Installation publication remains authorized in that isolated test. An additional AccountMenu regression confirms Settings Billing neither exposes publication nor requests media rates; nine settings/pricing tests passed together. These checks do not establish whole-product commercial-boundary completion. No price was published during verification.

## Current-state regression review — October 7, 2026

The full dashboard suite now passes 414 tests across 68 files. The running installation-administrator Settings entry was inspected again: it opens Billing & payments directly, without empty personal-account navigation. Account balance, low-balance configuration, unavailable top-ups and transaction state remain inside the fixed-height scrolling content, with the Close control accessible. This check does not qualify personal profile/photo/password interactions in an ordinary-user browser session; those remain separate acceptance work. No billing configuration, payment or profile data changed during this review.

The profile regression suite additionally verifies closing Settings during a pending save: the request is aborted, and even a deliberately delivered late successful response does not update account identity through the old form callback. All seven profile tests pass. This is integration-fixture evidence; it does not establish that aborting prevents a server write already in progress, and the next open still reloads the authoritative profile.

## Photo recovery and Settings regression review

The profile suite now additionally exercises a failed image decode, preserving an edited display name, restoring the photo and save controls, and allowing the identical file to be selected again. No failed image is installed as the avatar. The profile, password, global Settings and appearance suites passed together: 26 tests across four files. This adds recovery coverage without changing the dialog layout or introducing new controls. Personal photo upload and enabled password-change behavior still need live browser qualification; these component results do not establish that acceptance.

## Pending payment controls

Add funds and saved top-up row actions now remain disabled during payment operations, preventing another checkout selection from replacing the pending result. All 12 TopupFunding tests and dashboard type checking passed. OpenRouter Credits was inspected as the billing reference. The real Niu funding component was inspected with explicitly labeled synthetic data and a pending status response: Add funds, Refresh and View details remained disabled, and the existing dialog showed Checking. No payment service was called. This qualifies the desktop fixture state, not live checkout or narrow payment acceptance. The development launcher had stopped; its confirmed restart failed during gateway database initialization. Full-stack browser acceptance remains unavailable until runtime recovery. Temporary fixture files and tabs were removed.

## Current Settings checkpoint — October 7

The current implementation consolidates personal profile, password controls and color mode under General. Appearance is not a separate sparse section; theme presets remain excluded. Organization Billing & payments is shown only to authorized sessions, and installation sessions enter billing directly.

A fresh targeted run passed 20 Settings, profile and password tests, followed by all six appearance tests. These tests cover section access, draft preservation, account isolation and preference persistence behavior; they do not establish rendered acceptance.

Live review remains unavailable because the development gateway fails database initialization. The applied receipt for migration 0135 does not match its current source. Read-only checks of source newline variants and compiled storage artifacts did not recover checksum-matching source. No migration receipt, database data or migration source was altered during these diagnostics. Browser verification remains pending.

## User menu consistency — October 7

The account menu now follows the inspected OpenRouter account-menu grouping: identity and organization choices, account actions, a Theme submenu with the current mode, and Sign out at the bottom. Removed local item hover, organization row-height and checked-weight overrides; installed shadcn primitives provide shared spacing and highlight behavior. Theme has an explicit accessible name and selecting a mode dismisses the menu.

Fourteen Settings/appearance tests and TypeScript checking passed. The rebuilt local development stack reached readiness. Live desktop review verified the compact menu, the open Theme submenu and dismissal after selecting the already active Dark mode, with focus returning to the account trigger. Earlier narrow-width review verified the submenu gutter and fit; the latest dismissal change still needs a fresh mobile-width check. This checkpoint does not establish whole-product UX completion.

Mobile requalification at 390 × 844 found the default side submenu clipped past the left viewport edge. The installed submenu now uses compact-width placement offsets to open inside the account panel. Live inspection verified all three choices and the selected indicator are visible; selecting the current Dark mode closes both menus and returns focus to the account trigger while preserving the navigation drawer. The temporary viewport was reset after review.

The installation Settings dialog was inspected at 390 × 844. Billing content fits the viewport and scrolling reveals top-up availability and Transactions inside the fixed-height dialog while its close control stays fixed. This is installation Billing evidence only: personal General, photo upload and enabled password controls remain unqualified in a live member session. No funds, billing configuration or personal credentials were changed.

## Runtime recovery checkpoint

The earlier migration-startup blocker is resolved in the current worktree: migration 0135 once again matches its applied receipt, with subsequent retention changes in forward migration 0136. A read-only audit found no checksum mismatches across 136 applied migrations. The development stack subsequently rebuilt and reached readiness, allowing the desktop and mobile menu/Settings reviews recorded above. Earlier outage statements describe their historical checkpoints rather than the current runtime. Personal member workflow qualification remains separate and incomplete.

The first whole-dashboard run after menu consolidation completed with 443 passing tests and one obsolete AppLayout assertion expecting inline Light. That assertion was updated to verify the Theme submenu entry and continued Escape dismissal; the updated AppLayout file passed all 24 tests. A fresh whole-dashboard run was started against the final source; its result is not established by this checkpoint.

The fresh final-source whole-dashboard run passed all 444 tests across 72 files with two workers. This supersedes the earlier obsolete-navigation-assertion failure. Live desktop Logs review additionally verified opening request details by clicking a time cell and returning to the request list on dismissal; the sheet exposed request timing, token breakdown, customer-charge status and retained request/response messages. These checks do not close the remaining member-account or whole-product UX requirements.

## Chat navigation review — October 7

Live desktop and 390 × 844 checks confirmed that chat search distinguishes an empty history from no matching results, clearing search restores the existing conversation, and history action menus fit inside the mobile viewport. Opening Archived chats closes the mobile sidebar and displays a compact dialog; its empty state and close control remain visible. No conversation was modified or deleted.

Follow-up: closing Archived chats after opening it from the mobile sidebar leaves focus on the document rather than the history toggle. The sidebar trigger unmounts before the dialog closes, so focus restoration needs an explicit stable destination. This interaction is not yet qualified as complete.

Mobile focus follow-up: added a stable history-toggle ref and used the installed Dialog close-focus callback for Archived chats, Rename and Delete when the mobile drawer trigger has unmounted. Live Archived chats dismissal at 390 × 844 now leaves no dialog and focuses Toggle chat history. Desktop verification also found the default restoration landing on the document; the same stable toggle destination now applies at both widths. Desktop needs a repeat browser check after this final adjustment. Dashboard typechecking passed. No chat data was changed.

Final history-dialog focus verification: desktop Archived chats close and Rename cancellation both restore focus to Toggle chat history. Mobile Rename cancellation does the same at 390 × 844; its input and actions fit without clipping. Added a regression test for Archived chats focus restoration. Typechecking passed after the final adjustment. Rename was canceled without changing saved data.

## Model catalog interaction review — October 7

Live desktop and 390 × 844 review confirmed the sort menu and developer/provider filter drawer fit within the viewport. Selecting a developer reduced the 25-model catalog to its four matching models, with Clear filters available; the selection was cleared after verification. No backend configuration changed.

Outstanding: the mobile filter drawer Close action leaves keyboard focus on the document. The catalog uses the installed Sidebar with mobileContentProps, so focus restoration should be fixed through that existing Sheet callback and a stable navigation target rather than a replacement drawer.

Model filter focus follow-up: used the existing Sidebar mobileContentProps onCloseAutoFocus callback to focus the stable model-filters navigation button after Close or Escape. The callback preserves deliberate focus elsewhere outside the drawer. Both dismissal paths were verified live at 390 × 844: no dialog remained and Expand model filters owned focus. Dashboard typechecking passed. No primitive replacement, layout change, or backend mutation was introduced.

## Model details review — October 7

Desktop and 390 × 844 review confirmed that model facts, Chat/API-key actions, the horizontally scrollable request example, and the model request-log link remain readable and reachable. The mobile Navigation menu exposes all product areas and returns focus to its trigger on Escape. No request was sent or key created.

Content investigation: the current model description ends in a literal ellipsis on the detail page. The renderer displays catalog.description directly, and the import script copies description without truncating it. A live check of OpenRouter’s public models API confirmed that the source description for GPT-4.1 Mini itself is 193 characters and ends in an ellipsis. Niu preserves the source correctly; this is not a renderer/import truncation defect. Missing source content must not be fabricated. Supplier purchase prices remain excluded from customer model facts.

Supplier overview review follow-up: the live desktop header repeats Suppliers / Suppliers. AppLayout hardcodes the supplier-area breadcrumb parent to Suppliers while the overview title is also Suppliers. This is a concrete redundant-label issue to correct through the existing shared breadcrumb pattern. The page also includes private workspace subscription setup; its placement requires review against the product scope before any reorganization. No supplier configuration was changed.

Supplier breadcrumb follow-up: the supplier list now uses Niu / Suppliers, matching the existing top-level Models pattern. Management pages retain Suppliers / Overview. Verified the list at desktop and 390 × 844, with compact mobile actions and no clipping, and checked the management breadcrumb live. Typechecking passed. The development launcher rebuilt the gateway during verification; the page recovered automatically when it returned. No supplier configuration changed.

Supplier qualification dialog follow-up: desktop and 390 × 844 review found dismissal losing focus. Supplier management now remembers the connected opening control and restores focus through the installed Dialog close-focus callback. Live dismissal returned focus to Review Supplier at both widths. Qualification values were not entered or submitted. Typechecking and all seven qualification integration tests passed.

## Supplier pricing review — October 7

Live 390 × 844 checks confirmed text-offer search has a distinct No matching models state and Clear search restores results. The pricing table scrolls horizontally to its rate and qualification columns; row action controls remain available. No rate or qualification was changed.

Media-rate verification was interrupted by the confirmed live development launcher rebuilding the gateway. Before the global blocking recovery overlay appeared, MediaRateHistory exposed the browser message Failed to fetch. Its initial and pagination catches currently pass Error.message directly to product UI. Follow-up should translate network failures into a contextual media-rate loading message while retaining useful API validation messages. Retry recovery remains unverified.

Media-rate network-error follow-up: initial and pagination reads now translate native TypeError failures into contextual loading messages with retry guidance, while retaining Error messages supplied by the API. Added a rejected-fetch/retry regression case; all four MediaRateHistory tests and typechecking passed. Browser verification remains pending: the live development stack exited after database initialization failed. The existing launcher was confirmed terminal before restarting it; the restarted launcher has started PostgreSQL and is building the gateway. No database receipts or persisted supplier data were edited.

Runtime verification interruption — October 7: the restarted launcher completed builds but the gateway again exited during database initialization. Read-only comparison of persisted SQLx receipts with source found 137 applied migrations, no failed receipts, and a checksum mismatch for 0138_customer_workspace_spending_limits.sql. This prevents current live UI qualification. PostgreSQL was restarted with its existing data for the audit; migration receipts and SQL files were not modified. Media-rate Retry is also disabled while loading; its four component tests passed after that refinement.

Migration recovery follow-up: recovered the exact applied 0138 bytes by comparing the original STABLE function annotation against the persisted SHA-384 receipt. Restored those bytes and moved the intended VOLATILE annotation into new forward migration 0139_customer_workspace_commitment_visibility.sql. No receipt was rewritten or data removed. The development launcher is rebuilding with the repaired migration history; startup, forward-migration application, and live Media rates verification remain pending.

Runtime recovery verification: the gateway reached Ready and applied commitment visibility migration 0139; PostgreSQL confirms niu_customer_workspace_committed is VOLATILE. A concurrently added limit-history migration also used version 0139. The database receipt matches commitment_visibility exactly, so preserved that applied file and renumbered the unapplied limit-history file to 0140 without changing its contents. The launcher had exited after loading the conflicting migration set; confirmed terminal before restarting with unique versions. Application of 0140 and browser verification remain pending.

## Settings rail section — 2026-10-07

Global Settings now uses the shared product rail and sidebar, with Account, Appearance and Billing & payments routes. The account menu navigates to this section; the former fixed-height Settings dialog has been removed. Personal accounts retain profile and password controls. Installation administrator sessions open Appearance and omit the personal Account item. Billing navigation remains limited to installation administrators or organization-wide owners and administrators.

Desktop and 390-pixel browser checks verified Appearance, billing, active navigation, sidebar collapse/expand and the account-menu entry. Tests verify draft preservation between sections, draft isolation when members change, scoped billing restrictions and absence of procurement controls. Personal profile and password browser flows still require a signed-in member session; the current installation session does not qualify those flows. No account credentials or financial configuration were changed. Historical dialog evidence above describes the replaced UI.


## Account identity and avatar verification — October 7, 2026

The local demo now uses persisted member authentication and organization-owner
permissions. The former development administrator login, local-session bypass,
and Vite token-injection plugin were removed. Old development cookies and marker
tokens return 401; wrong passwords return 401. Production sign-in retains HTTPS
and Secure cookies. Development HTTP cookies are restricted to an explicit
loopback configuration and are isolated from production cookies.

The Account page displays the saved Demo profile and email, with profile and
password controls available. The account menu displays the member name and email
instead of a role as its identity. Its avatar uses the same uploaded photo or
initial fallback as the rail. The menu and profile were inspected at desktop and
390-pixel widths against OpenRouter's avatar-and-account menu pattern. No password
was changed during browser verification.

Authentication unit tests passed (114 passed, 104 PostgreSQL-dependent tests
ignored). A dedicated PostgreSQL test passed for seeded account identity, scope,
and preservation of saved profile and credentials on restart. The affected
dashboard login, navigation, account, and Chat tests passed when run in focused
suites; the first concurrent full-dashboard run had stale login fixtures and Chat
timeouts, followed by corrected fixture checks and a passing Chat rerun. Dashboard
type checking and the five launcher tests passed. Live requests verified demo
member login through both localhost and 127.0.0.1.

## Workspace lifecycle and settings width

- Workspace Settings is available in the workspace sidebar, using the established General and Delete workspace structure.
- Names are updated durably through the tenant-scoped PATCH endpoint. The dashboard reloads the authoritative list and updates the workspace route and selector.
- DELETE requires organization-wide operator-management permission. It removes empty workspaces only; foreign-key constraints protect saved records and the designated default workspace. This intentionally does not implement archival or cascading destruction of historical records.
- Deletion requires typing the workspace name. Cancellation was verified in the browser; the irreversible action was exercised against an isolated verification workspace through the API and a PostgreSQL test database.
- Global Settings no longer has a blanket content-width cap. Desktop profile rows align labels left and bounded inputs right; mobile rows stack without overflow. Appearance menus were inspected open at desktop and 320-pixel widths.
- At narrow widths, the account menu links directly to Appearance instead of displaying an off-screen theme submenu, and menu navigation closes the mobile drawer.
- Validation: dashboard TypeScript check; 41 focused tests covering layout, account, appearance and workspace settings; gateway cargo check; PostgreSQL workspace lifecycle test; live API checks for durable rename, invalid names, foreign scope, protected workspace rejection and empty-workspace deletion.

## Global workspace directory and confirmed actions

- Settings → Workspaces lists accessible workspaces and provides create and per-workspace action menus. The account workspace directory and its Edit workspace / View activity menu in OpenRouter were inspected as the reference. Only available identity and organization data is displayed; key counts, descriptions and spending figures are not fabricated.
- Workspace settings, logs, API keys and access management remain contextual destinations. Destructive deletion stays in the selected workspace’s Settings page with typed-name confirmation, not in the directory menu.
- Creating from global settings opens the new workspace overview, without appending a global settings path to the workspace URL.
- A confirmed rename updates the workspace list, picker and route from the backend response. Confirmed deletion removes the deleted workspace from current state and selects a remaining workspace without requiring a second network request. A regression test deliberately makes subsequent list reads fail to verify these outcomes are not misreported as failures.
- Missing-workspace recovery no longer displays the route identifier. Account access errors no longer suggest installation-wide credentials as a remedy.
- Validation: dashboard TypeScript check and 48 focused tests; actual desktop and 390-pixel directory, open action menus, create dialog cancellation and links to workspace settings; browser rename confirmed in the backend. Isolated verification data was removed.

## Workspace API keys interaction review

Reviewed the rendered key directory at desktop and 390-pixel widths. On mobile,
secondary table columns are omitted; opening a key still exposes its model access,
expiration and last-used information. Verified the new-key dialog without issuing
a credential: the expiration menu aligns with its trigger and reserves space for
the selected-item indicator. Cancelling returns to the directory. Searching for a
nonmatching name presents a clear-search action, which restores the key list.
These checks cover layout and navigation, not credential issuance or revocation.

The Logs request detail sheet now keeps its header and previous/next navigation
outside the scrollable body. Browser checks confirmed scroll reset when switching
requests and focus restoration to the opening table row after closing. Date
presets dismiss their popover after applying the range, including All time.
The targeted GatewayActivity integration suite passed all 45 tests, and the
dashboard TypeScript check passed after these changes.

## Mobile catalog navigation review

At 390 pixels, the settled Models filter drawer starts beside the 54-pixel
product rail and extends to the full viewport height. Verified that switching
from the open drawer to Workspace through the rail navigates to the workspace
overview and closes the drawer. Animation frames are not evidence of the final
layout: inspect the settled geometry before diagnosing rail overlap. No layout
change was needed for this interaction.

## Guardrails navigation and empty states

Compared the Guardrails directory with the rendered OpenRouter workspace
Guardrails page. Reviewed Niu's Policy history and Blocked requests at desktop
and 390-pixel widths. The empty history now links directly to the existing policy
editor for users with write permission; verified that the action opens the
current workspace's policy. No policy was changed.

Verified that the mobile Blocked requests header retains accessible Refresh and
Open Logs actions, and that Open Logs preserves the workspace. The coverage
notice distinguishes recorded pre-dispatch blocks from output blocks available
in request details. The demo workspace had no recorded blocks, so populated
table behavior was checked through the six Denials tests rather than claimed as
browser-verified. The eight History tests and dashboard type check also passed.

## Dashboard terminology and source rename

The management application is named Dashboard in product copy and internal
source. Its workspace package is `@niu-io/dashboard`, its source directory is
`apps/dashboard`, and root commands use `build:dashboard`, `check:dashboard`,
and `dev:dashboard`. Deployment configuration uses `NIU_DASHBOARD_DIR`.
Docker, CI, documentation aliases, tests, and local development tooling use
the renamed paths. JavaScript's native `console` API and external reference
URLs retain their original names.

The dashboard production build, documentation build, gateway compilation,
and all 449 dashboard tests passed. The renamed local stack was started and
Settings and documentation were inspected in the browser, including narrow
documentation layout. Existing server sessions and workspace records remained
available after the restart.

## Appearance and account-menu interaction review

Verified the running Dashboard Appearance route at desktop and 390-pixel widths:

- Selecting Dark updates both the Appearance control and the account-menu Theme label and radio selection.
- The desktop theme submenu opens beside its parent with the selected item visible and no overlap with the parent labels.
- On mobile, the account menu exposes an Appearance navigation item instead of a nested theme submenu.
- Opening that item closes the combined rail/sidebar drawer and returns to the Appearance page, including when already on that route.
- Choice menus retain their standard icon gutter and fit within the narrow viewport.
- The original System preference was restored after verification.

This pass found no additional defect in these interactions. It does not establish coverage of save failures, cross-browser preference restoration, or every other Dashboard workflow.

## Dashboard regression review after interaction refinements

The full Dashboard suite exercised 457 tests across 75 files. Three assertions still used the previous Supplier administration paths or access-denied heading. The current router places platform configuration under `/admin/suppliers`, guarded by the shared Administration permission boundary. Updated those assertions and the qualification test's local route fixture to match that boundary while retaining checks for scoped reads, customer navigation, and pricing navigation.

The subsequent targeted run passed all 49 tests in the three affected files; the remaining 408 tests had passed in the full run. No product permissions were relaxed to satisfy these tests. Direct browser inspection of the administration route was blocked by the browser client, so this run does not claim rendered coverage of platform administration.

## Video recovery navigation

Verified the Video empty state at desktop and 390-pixel widths. View models
retains the selected workspace and opens the Dashboard catalog; the narrow
recovery flow loads the workspace model list rather than the public catalog.
All six Video workflow tests passed. The demo key has no supported video
route, so populated generation inputs and results remain unverified in the
browser. No generation was submitted.

## Chat history review

Reviewed the current Chat history empty state and Archived chats at desktop
and 390-pixel widths. Opening archives from the mobile drawer closes the
drawer; the settled dialog stays within the viewport. Closing the dialog
returns focus to the history toggle. The signed-in account has no saved or
archived conversations, so reopening, rename, export, restore and deletion
of populated history are not claimed as browser-verified. Integration tests
cover backend archive/restore and rejection handling; populated browser
coverage remains an outstanding audit item. No conversation was generated,
archived or deleted during this review.

## Account and administrator wording

Removed the administrator-token instruction from the account sign-in recovery
prompt, which links to normal login. Model catalog and Supplier offer empty
states now name the platform administrator role. Bootstrap credential routes
and API contracts retain their technical names. The signed-in workspace and
catalog were checked in the running browser; their unauthenticated and empty
permission states remain unverified in-browser because the current demo
session is authenticated and its catalog is populated.

## Workspace rename cancellation

Added Cancel beside Save changes for unsaved workspace names, using the
existing Account settings edit pattern. Cancel restores the saved name,
clears edit feedback and focuses the name input without a backend mutation.
Verified desktop and 390-pixel layouts, name restoration and focus in the
running browser. Directory actions correctly navigate to workspace Settings.
No workspace was renamed or deleted during this check.

## Agent Observability section selection

Fixed Metrics navigation matching child routes, which made Metrics and
Connections appear selected together. The Metrics NavLink now matches only
the section root. Verified one selected section on desktop and the settled
390-pixel drawer; selecting Traces navigates and closes the mobile drawer.
Reviewed connection creation defaults and consent gating without creating
an ingestion key. Populated traces remain unverified for this empty account.
Dashboard typecheck passed.

## Sidebar route-selection regression

Reviewed the remaining sidebar NavLinks for root-route prefix matching.
Workspace Overview already uses exact matching; a live Logs-page check
confirmed Logs alone has aria-current and the selected surface. Added an
AppLayout integration regression that switches Connections, Traces and
Metrics and requires exactly one active section after each navigation.
All 28 AppLayout integration tests passed.

## Full Dashboard regression after UX refinements

The current Dashboard suite passed: 466 tests across 77 files, with two
workers and a 15-second per-test timeout. This verifies the implemented
regressions, not all rendered workflows. Outstanding browser coverage
includes populated Chat history, supported Video generation and populated
agent traces. Unrouted legacy CostsView still contains shortened internal
IDs and must not be reused as customer UI; its existing route redirects
to customer Billing instead.

## Documentation rail selection

Fixed the Workspace rail item appearing selected on Documentation because
unknown navigation entries defaulted to Workspace. Workspace selection now
requires a workspace route. Verified the documentation landing page at
desktop and 390-pixel widths; desktop highlights Documentation alone and
mobile retains its Navigation control. Added the rail regression test;
all 29 layout integration tests and Dashboard typecheck passed.

## Mobile documentation product navigation

At 390 pixels, opened Documentation’s Navigation menu and verified Workspace,
Chat, Agent Observability, Models, Documentation and account actions are
reachable. The menu fits within the viewport. Selecting Models closes it and
loads the 25-model workspace catalog; the destination has its navigation
toggle and no lingering overlay. No preference or account data was changed.
No defect was found in this transition.

## Logs filter-to-detail workflow

Reviewed desktop column settings, including built-in selection gutters and
protected Model column. At 390 pixels, the model filter menu remains inside
the viewport and scrolls its options. Selecting GPT-4.1 Mini reduces 61
requests to five and shows a removable filter chip. Opening the first result
shows the matching model in a settled full-width detail sheet with timing,
usage and customer charge semantics. Closing it and removing the chip
restores all 61 requests. No data or saved preferences were changed.

## Persisted Chat history browser workflow

Created a clearly labeled temporary backend conversation with no responses
and no inference, using a separate demo-account session. Verified reopening,
rename and reload persistence on desktop, then mobile action-menu alignment,
archive, archived-list rendering and restore back into history at 390 pixels.
Removed only this fixture through its exact backend endpoint and revoked
the separate verification session. No model request or charge was produced.
Response rendering/export and history failure states remain separately
covered by tests, not proven by this empty-response fixture. The populated
archive table showed a horizontal scrollbar at narrow width; inspect its
overflow before considering that presentation fully verified.

## Archive table overflow correction

The narrow archive action column was 96 pixels but its Restore button and
shared cell padding required more. Increased the column to 128 pixels.
With a long-title backend fixture at 390 pixels, table container scrollWidth
and clientWidth both measure 308 pixels, confirming no horizontal overflow.
Verified title wrapping and Restore alignment at narrow and desktop widths.
Removed the fixture and revoked the separate test session; no inference ran.

## Composer model-picker review

Verified desktop model selection and search across routes outside Popular.
Searching Claude returns its four available routes even from the Popular
tab. At 390 pixels, clicking the model stack opens the existing picker,
with wrapped model labels and no comparison hovercard behind it. Closing
returns to the composer. Restored the original single GPT-4.1 Mini selection
after empty-response history fixture verification; no inference submitted.
No further layout defect was found in this interaction.

## Shared primitive and icon consistency audit

Source audit found no native choice or form controls outside installed UI
primitives. Replaced remaining feature-level Lucide imports in Video, media
pricing and video schema forms with installed Tabler equivalents; shadcn
primitive imports remain unchanged. Video history now switches expand and
collapse glyphs with its actual state and exposes aria-expanded/controls.
Verified Video desktop/narrow toggle behavior and its open key menu.
Fifteen Video/media publisher tests and typecheck passed. Supplier admin
forms and populated Video billing are not claimed as browser-verified.

## Access directory search

Borrowed the search-above-directory pattern from Render's member management.
Access management now filters names, roles, scopes, and active/revoked status,
shows the matching count, and offers Clear search when there are no matches.
Scope summary totals remain unchanged by search. The no-results state does not
suggest creating another operator.

Verified matching and no-results recovery in the browser at desktop and 390px
width. The ten access-management tests and dashboard type check passed. No
credentials or permissions were changed during this review.

## Populated access details

Inspected the populated account detail view with active and revoked sessions
and recorded access activity. Verified desktop expiry-menu alignment and the
selected 30-day option without issuing a credential. At 390px, the page stayed
within the viewport while the session table scrolled independently; status and
Revoke actions remained reachable. No session was issued or revoked.

## Settings navigation icon consistency

Settings uses the existing sidebar navigation pattern with Tabler icons for
Account, Workspaces, Appearance, and Billing & payments. Icons appear at desktop
width and are omitted from the compact mobile navigation to preserve label
space. Verified desktop appearance, selected-section navigation, and 390px
layout with no page overflow. Dashboard type checking passed.

## Restore Settings as a product section

Supersedes the earlier dialog-navigation review: Settings uses the shared
product rail, shadcn Sidebar, page header, and content surface. Account,
Workspaces, Appearance, and Billing & payments are routed sidebar sections;
the settings forms and their permission boundaries remain intact. This restores
the requested navigation hierarchy and follows the full-page settings pattern
inspected in Render.

Verified desktop Account and Appearance navigation, selected sidebar states,
and mobile navigation at 390px. The rail and settings sidebar open together,
and choosing Account closes the compact navigation. The 43 targeted layout,
settings-navigation, account, and password tests passed, including unfinished
profile edits surviving section changes. Dashboard type checking passed.

## Settings shell regression coverage

The complete dashboard test suite passed: 465 tests across 78 files. Added an
explicit integration regression test for the Settings rail selection, shared
page heading, sidebar section navigation, and absence of a blocking dialog;
the updated 30-test layout file passed separately.

Verified the Settings workspace directory at desktop and 390px, including
open action-menu alignment and navigation into the selected workspace's
settings. Workspace mutation controls were not submitted.

## Low-balance warning edit state

The billing warning form now disables Save until its enabled state or threshold
has changed, including after reloading a conflicting policy. Reverting the edit
disables Save again. Submission also guards against unchanged settings.

Verified desktop and 390px dialog layout, toggling and reverting Enabled, and
Cancel without a policy write. All 17 billing tests and dashboard type checking
passed. Updated policy tests to reflect confirmed saved values and require a
new edit after a conflict reload before retrying.

## Request-detail terminology review

Inspected a populated request detail sheet: customer charge, token breakdown,
request timing, provider status, delivery status, and payload-retention notice
use readable labels. Imported Claude Code task labels now use “Claude Code
session” rather than an identifier fragment. Limited summary coverage states
the record limit without describing internal UUID ordering.

All 14 imported-execution integration tests and dashboard type checking passed.
The current workspace did not expose populated imported agent tasks or the
platform-only cohort summary in this browser review; those changed labels were
verified by source and tests, not claimed as visually verified populated states.

## Settings entry cleanup

Removed obsolete dialog-return routing state from the rail and account-menu
Settings links. Signed-out login return routing remains intact. Verified the
account-menu entry from Models opens the full Account page with its shared
navigation shell. All 39 targeted navigation/account/layout tests and dashboard
type checking passed.

## Preserve workspace context through Settings

Global Settings now participates in the existing selected-workspace resolution
used by Chat and Models. Entering Settings no longer clears the validated
workspace selection or replaces Workspace and Models rail links with default
routes.

Reproduced the context loss from a non-default workspace, then verified that
Settings retained its workspace destinations and returned to that workspace at
desktop and 390px. Restored the original workspace after review. The 31 layout
integration tests and dashboard type checking passed.

### Model pricing contract review — unresolved

Inspected OpenRouter's GPT-4.1 Mini detail page: input and output rates are
prominent model facts expressed per million tokens. Niu's equivalent detail
page currently shows `Not published` for both rates.

The source review identified a contract mismatch rather than missing Supplier
metadata. `catalog_metadata.rs::customer_metadata` deliberately excludes
provider-advertised purchase prices. `ModelTable.tsx` still reads those excluded
catalog fields. `/v1/models` already returns workspace-scoped `customer_pricing`
from `customer_model_prices`, with currency and exact nanounit rates per million
tokens. The dashboard instead loads `/admin/v1/models`, scoped only to an
organization, which does not return customer pricing. Rates can differ between
workspaces in the same organization, so adding organization-wide prices would
be incorrect. Personal credential routes also need the exclusion already used
by `/v1/models`.

Required follow-up: authorize an explicit workspace on the dashboard catalog
endpoint, expose only its customer tariff contract, reload on workspace changes,
and render exact customer rates in the existing catalog and detail facts.
Verify sibling-workspace isolation, missing and zero tariffs, personal routes,
and procurement exclusion before browser verification at desktop and narrow
widths. This entry records an unresolved gap, not completion of that fix.

### Workspace customer model pricing implemented

The dashboard model endpoint now accepts an explicit `project_id` alongside its
organization scope, checks workspace read authorization and existence, and
returns only that workspace's customer tariff as `customer_pricing`. Requests
without a workspace return no customer rates. Personal credential routes are
excluded from tariff display as they are in `/v1/models`.

The dashboard reloads its catalog when the workspace changes, including changes
inside one organization. Catalog cards and detail facts read the customer
contract and format nanounits exactly using the shared money formatter. Removed
purchase-price fields from the customer catalog type; legacy fields cannot serve
as a fallback. Missing customer tariffs remain `Not published`.

Validation: 43 model/layout tests, dashboard type checking, gateway compilation,
and the PostgreSQL customer pricing HTTP test passed. The HTTP test verifies
exact rates, zero rates, missing tariffs, unscoped catalog behavior, sibling
workspace isolation, missing workspace rejection, workspace-reader access, and
inference-key rejection for the dashboard endpoint. The layout regression
verifies different prices after switching workspaces in the same organization.

Inspected the actual OpenRouter model detail reference before editing. Verified
Niu's live model detail at desktop and 390px, with no horizontal overflow. The
demo model has no published customer tariff, so browser verification covers its
missing-rate state; populated rates and workspace transitions were verified in
tests rather than claimed as live-browser observations. No live tariff was
created or changed during this review.

### Model description refresh

Compared the actual OpenRouter model detail layout with Niu. Both use the
available desktop width; this review did not introduce an unsupported width
constraint. The demo description ends in a literal ellipsis, while the current
import script previously skipped all existing catalog metadata. Subsequent
direct API verification confirmed the upstream API itself supplies that
shortened text; this is not an active import or rendering defect.

The importer now repairs an existing description only when its ellipsis-stripped
prefix matches a longer, valid upstream description. Custom copy, complete
descriptions, other catalog fields, route capabilities, enablement, visibility,
and revision checks are preserved. Eleven importer tests passed, including
custom-description preservation and oversized upstream rejection. The live
description was unchanged in this step. A later metadata-only run confirmed
that the upstream API and stored description match exactly.

### Workspace deletion discoverability review

Verified global workspace row actions reach workspace Settings, where rename
and deletion are separated. The deletion dialog fits 390px, requires the typed
workspace name, and cancels without deletion.

Found an unresolved misleading state: the installation default workspace still
offers the deletion dialog, whose copy calls it an empty workspace, although
storage protects that workspace from deletion. The workspace list contract
currently returns names and ownership only, without a designated-default flag.
Expose the persisted default designation in the authorized workspace response
and use it to prevent this impossible action before confirmation. Do not infer
protection from the displayed name or slug. Dependent-record restrictions must
remain enforced transactionally even when the UI explains them in advance.

### Default workspace deletion protection

Workspace listings now expose the persisted `is_default` designation. Settings
uses it to disable deletion, explain the restriction, and guard the remove
handler. It does not infer protection from names or routes. Inspected the actual
OpenRouter workspace settings before retaining the established General/Delete
section pattern; Niu's deletion restriction differs because its backend protects
the designated default.

All four workspace settings tests, dashboard type checking, storage compilation,
and the PostgreSQL workspace lifecycle test passed. The latter verifies the
designation survives renaming. After the live gateway rebuilt, desktop and
390px browser checks confirmed the disabled action and accurate explanation;
page and scroll widths both measured 390px. No workspace was deleted.

### Appearance controls review

Verified desktop Color mode selection changes the rendered theme and updates
the account menu's current-mode label. The account submenu opens beside its
parent with a separate selected-state gutter. Restored the original System mode
through that submenu. At 390px the Appearance choice menu fits and retains its
selection indicator without icon/text overlap.

Source inspection confirms signed-in appearance is loaded and saved through
the account preferences API, with browser storage used as cache and failed saves
restoring the confirmed mode. No theme presets or filler controls were added.
Cross-browser persistence and initial-load theme flashing were not verified in
this pass and remain outside this evidence's scope.

### Account theme startup reset

Removed the unconditional System reset while loading a saved preference for
the same member. The existing member-owned cache now bridges that read; the
backend response remains authoritative and replaces stale cached values.
Switching members still clears the prior account's mode.

Ten appearance/theme tests and type checking passed, including a deferred
preference read that preserves cached Dark until the backend supplies Light.
The live browser remained Dark at the post-reload observation and rendered the
narrow Appearance page correctly. Restoring System initially failed and visibly
rolled back with the existing error/reload controls; reloading and retrying
succeeded. Original System mode was confirmed restored. This verifies removal
of the hook's forced reset, not every possible first-paint flash.

### Shared controls and account form review

Scanned dashboard TSX for native select/option controls, raw button/input/
textarea/table elements, shadcn Select imports, and feature-level Lucide imports.
No violations were found; remaining Lucide imports are in installed shadcn UI
primitives, which are excluded from the icon migration requirement.

Reviewed the populated Account page and expanded password form at desktop and
390px. Labels, profile fields, session-sign-out warning, password length guidance,
and Cancel remained readable; page and scroll width both measured 390px. No
password was entered or changed. The password submit button is enabled with
empty fields; inspect its validation and submission guards in the next pass
before deciding whether that state needs refinement. This review does not prove
password changes or photo uploads end to end.

### Password empty-submit validation

Reviewed the enabled submit state: all three password inputs are required,
confirmation and length are checked locally, rejected submissions preserve
entered values, and confirmed success alone triggers sign-out. Kept the enabled
button so validation feedback remains available rather than treating that state
as a defect by itself. Added a test proving empty submission makes no password
request and does not trigger sign-out. All six password settings tests passed.
No live authentication credentials were entered or changed.

### Model catalog search and mobile filters

Verified the populated catalog, no-match search guidance, and Clear filters
recovery. At 390px developer filters open through the navigation toggle;
selecting Anthropic and closing the panel yields four matching models. Clearing
filters restores the complete catalog. Page and scroll widths both measured
390px. Restored unfiltered state and the normal viewport after review.

The current workspace's cards did not display customer pricing, so this pass
does not verify rate presentation or substitute confidential procurement rates.
Try in Chat links retain the workspace and model in their destination; this
pass inspected those links without dispatching inference or claiming end-to-end
chat execution coverage.

## Existing API key detail review

Verified the populated key detail page, model permissions, expiration, last-use
information, policy-assignment dialog, and its open choice menu. An unchanged
assignment keeps Save disabled, and Cancel returns to the detail page. At 390px,
the key details and policy actions remain readable without page overflow. No key
was created, rotated, revoked, or given additional policy access.

Key identity/model-access editing remains a separate capability gap: this
review verified the existing actions and does not claim complete key CRUD.

### API key editing contract gap

The gateway key routes expose collection GET/POST, item DELETE, and rotation
POST. The storage layer has no key metadata update operation. The immutable
key audit table accepts only issuance, revocation, and rotation events.
Consequently, a dashboard-only editor cannot persist a name or model-access
change with the current contract.

Complete editing requires a workspace-authorized update endpoint, a scoped
storage transaction, and an audited update event. Validate model grants against
the same available-model catalog used at issuance; preserve the secret and
absolute expiration when changing a name or model access. Reject stale edits
and edits to revoked keys. Verify that changing grants affects subsequent
dispatch authorization and cannot change another workspace's key. The UI
should then offer an Edit action, populated current values, disabled unchanged
Save, cancellation, and recovery from conflicts. Rotation remains a separate
secret-replacement action, not a workaround for renaming.

This is a confirmed implementation requirement, not a completed feature.

### API key editing backend foundation

Added a workspace-write-authorized metadata PATCH route and a transactional
storage operation. Key listings now carry a revision for optimistic concurrency.
Edits preserve the secret and absolute expiration, reject stale revisions and
inactive keys, and record previous and updated metadata in immutable audit
events. The route validates grants against the available model catalog.

Gateway and storage compilation checks passed. A PostgreSQL integration test
passed for cross-workspace rejection, stale edits, preserved expiration and
secret, changed permissions, rejection of dispatch using a principal obtained
before access removal, unchanged edits, audit metadata, and revoked-key edits.
The migration was exercised in the isolated test database. Live deployment,
HTTP authorization tests, and the reference-led dashboard editor remain pending;
this does not yet close the end-to-end CRUD gap.

### API key update authorization and reference review

The PostgreSQL-backed gateway HTTP test passed for inference-key rejection,
viewer write denial, sibling-workspace rejection, unknown model rejection,
successful metadata persistence, stale revision rejection, and the authorized
operator recorded in the audit event. Sibling key metadata remains unchanged.

Inspected OpenRouter's actual API key list, row Edit action, and loaded key
detail editor. Its editor keeps metadata in the detail page, separates usage
and guardrails, and treats expiration as read-only. This is the reference for
the pending dashboard editor; no external key configuration was changed.

### API key detail metadata editor

Added inline editing for active key names and model grants using installed
Input, Button, Label, and DropdownMenu primitives. Desktop fields follow the
reference's label/control rows and stack on narrow screens. Saving sends the
current key revision; unchanged or invalid drafts cannot be saved. Cancellation
discards the draft, and stale edits require reloading the key. Revoke controls
are separated from the open editing state.

The three key-detail component tests and dashboard type checking passed.
Browser verification covered the populated editor, unchanged Save, the open
multi-choice model menu, draft selection, and Cancel/reopen restoring saved
values at desktop and 390px. The narrow page width and scroll width both measured
390px. No live model permissions were changed. Live successful-save and conflict
recovery verification remain pending; backend persistence and authorization
were verified separately by PostgreSQL and HTTP tests.

### Key editor conflict and expiration coverage

All four key-detail component tests passed, including a stale-save response
that disables further editing, reloads the latest persisted metadata, and opens
a fresh unchanged draft without issuing a second update. The PostgreSQL
metadata test also passed with explicit expired-key rejection and verification
that the rejected edit creates no update audit event. These are automated
checks; they do not replace the pending live save/conflict browser verification.

### Live key metadata persistence

Verified a name-only edit through the running dashboard: Save displayed success,
the updated name survived a full page reload, and a second successful save
restored the original name. Model grants and displayed expiration were unchanged.
The live stale-edit recovery interaction remains pending; its component and
gateway HTTP tests already pass.

### Live concurrent-edit recovery

Verified two dashboard editors holding the same key revision. A name-only save
in the second editor succeeded. Saving the first editor's stale draft produced
the explicit conflict notice and Reload key action. Reload fetched the newer
name, and a fresh save restored the original name. Model access was unchanged.
This closes the previously pending live conflict-recovery check for the metadata
editor; it does not imply completion of the overall product UX review.

### Key list editing entry

Added Edit before Rotate and Revoke in the active key's row menu, following the
inspected OpenRouter list action pattern. It opens the existing key detail page
where metadata can be edited. Verified menu alignment, icons, destructive-action
distinction, and the destination at desktop and 390px. All nine key-list
integration tests and dashboard type checking passed.


### Metadata-only refresh verification and corrected diagnosis

Added `--metadata-only` to the OpenRouter importer. It reads existing adapters
and model routes, updates only eligible descriptive metadata with revision
checks, and does not read or mutate Supplier associations, offers, or rates.
It does not create routes. The twelve importer tests passed; the new test
rejects unexpected Supplier endpoints and verifies preservation of capabilities,
visibility, enablement, and the expected revision.

Executed this mode against the local gateway: zero routes needed updating.
Authenticated route metadata and the public OpenRouter models API both supplied
the same shortened GPT-4.1 Mini description. The website's longer description
is not the description returned by that API. The earlier diagnosis that an
import refresh would fix this live text was incorrect. No live data changed,
and no longer description was invented. The browser still renders the supplied
source as expected. Future metadata maintenance can use the dedicated mode
without unrelated procurement operations.

### Chat mobile navigation transition review

Reviewed the actual Chat page at desktop and 390px, including the model picker,
settings panel above the composer, and history drawer. The picker and settings
controls fit the viewport. During the drawer's opening animation, its layer
briefly covered the product rail before settling at the correct 54px offset.

The shared phone navigation rule now keeps the rail above the contextual drawer
while the drawer is mounted, including its closing animation. This preserves
the requested combined rail-and-sidebar navigation and the installed Sidebar
transition. No new navigation primitive was introduced.

Browser verification confirmed the rail remains visible during entry, the
settled drawer sits beside it, Models can be opened from the rail, and Escape
dismisses model filters. After dismissal the rail is hidden again. The 390px
viewport has no horizontal overflow. No inference request, model-selection
change, or Chat settings mutation was performed during this review.

### Populated Logs interaction review

Reviewed the live workspace's 61 requests at desktop and 390px and inspected
OpenRouter's current Logs page directly. Verified that clicking a status cell
opens the request detail sheet, not just clicking the model button. The sheet
shows customer charge semantics, reported input/output and cached/reasoning
tokens, request timing stages, finish reason, HTTP delivery status, time, and
the API key's display name. Its mobile width is 390px without horizontal
overflow. Internal IDs remain DOM anchors, not displayed labels or tooltips.

Next request updates the selected model, timing, and usage within the same sheet.
The tested historical records have no available retained bodies; the explicit
not-retained-or-expired notice is shown rather than empty payload controls.
This does not verify a populated payload or expired-versus-opt-out distinction.

The mobile Status choice menu fits the viewport. Failed delivery returns the
empty-results state with Clear filters; clicking it restores all 61 requests.
No live request, payload-retention setting, or billing data was changed. This
review found no new defect in these inspected interactions and did not introduce
unnecessary page styling changes. Populated payload and failure-detail states
remain separate verification work.

### Retained Responses request tool history

The readable request parser omitted Responses `function_call` and
`function_call_output` input items. These items are part of request conversation
history, as documented in the official OpenAI function-calling guide:
https://developers.openai.com/api/docs/guides/function-calling

The existing message view now retains calls with their names and arguments and
shows tool results in input order. Malformed calls are not converted into
invented readable content. Call identifiers remain absent from the readable
view, and the existing raw-data redaction remains applied.

All 51 request-content and GatewayActivity integration tests plus dashboard type
checking passed. A temporary, explicitly labeled fixture mounted the actual
RequestContent component in the running development server. Verified desktop
and 390px rendering, expandable arguments, switching Messages/Raw data, retained
tool output, GUID redaction, and no horizontal overflow. Removed both temporary
fixture files after verification. This verifies the renderer, not live payload
capture, storage, or expiry; no live request records were fabricated or changed.

### Usage interaction review

Inspected the populated Usage page at desktop and 390px widths. Token metric
choices preserve reported versus unknown coverage: reasoning shows 60 reported
requests and one unknown, and identifies reasoning as included in output.
Customer charge totals and breakdowns identify own-key requests without
substituting procurement costs. Verified the open Model/API key grouping menu
at narrow width, grouping by key, and navigation to logs filtered to that key.
The mobile document width matches the viewport without horizontal overflow.
No product data or UI implementation changed during this review. Settled retail
charges and empty/partial reporting states still need live browser coverage.

### Workspace Settings cancellation review

Verified desktop and 390px workspace Settings. Entering an unsaved name enables
Save changes and exposes Cancel. Cancel restores the saved name, disables Save,
and returns keyboard focus to the name input. The default-workspace deletion
control remains disabled with its explanation visible. Mobile fields and actions
fit the viewport without horizontal overflow. No saved name or workspace data
was changed; this review does not verify deletion of a non-default workspace.

### Account menu navigation review

Verified the shared account menu on desktop and 390px widths. Desktop Theme
opens beside the parent menu with aligned System/Light/Dark choices. ArrowRight
focuses the selected theme item; Escape dismisses the menu and returns focus to
the account trigger. On mobile the account menu is reachable from the combined
rail/sidebar drawer; Appearance opens the dedicated page and closes both menu
and drawer. Current mode remains aligned at the trailing edge. No preference
was changed. Pointer traversal between desktop menus was not exercised in this
review; the supported browser controls do not expose hover simulation.

### Documentation transition ghosting

Reproduced overlapping old/new article text during mobile guide navigation and
browser Back. The iframe already persisted correctly; Astro's view-transition
crossfade caused the visible ghosting. Disabled old/new snapshot animations and
hid the old snapshot in shared docs CSS while retaining client-side navigation.
The documentation build passed. Repeated Model routes / Request logs navigation
and browser Back at 390px, then inspected desktop rendering. Article text no
longer overlapped. Feature sections remain separate from conceptual guides.

### Populated Access management review

Inspected the populated operator directory and account details at desktop and
390px widths. Search narrows by account name; selecting a result displays its
role and workspace scope separately. Verified the open expiry choice menu and
the revoked operator state, which has neither Issue new session nor Revoke
access actions. Session tables scroll inside their section without widening the
mobile document. No sessions or permissions were issued, revoked, or changed.
This verifies display and navigation, not mutation authorization.

### Chat model discovery review

Verified the populated model picker at desktop and 390px widths. Searching from
Popular finds models outside that subset; a nonmatching query exposes the empty
state. Provider logos and selection checks remain visible, and the picker fits
the narrow viewport without horizontal overflow. On mobile, the composer model
stack opens the same picker for editing. Closing it restores the composer.
No selected models, saved chat settings, or inference requests were changed.
Hover-card behavior and the four-model selection limit were not exercised here.

### Comparison model interaction regression coverage

All 35 Playground integration tests passed, including existing hover-card
coverage and a new regression for the four-model limit: a fifth choice remains
disabled, removing a selected model re-enables replacement, and adding that
replacement restores four selected models. In the live browser, Tab reaches
the composer stack and Enter opens the picker with search focused. Dismissed
the picker without modifying the live selection. Hover behavior has automated
coverage; live pointer traversal remains unverified.

### Scoped request total accessibility

Found that compact key-specific request metrics were announced as workspace
totals. Updated the shared activity summary to announce filtered request totals
when its request query includes filters; unfiltered compact summaries retain
the workspace label. Added assertions covering both scopes. All 45 activity
integration tests passed. Verified the corrected accessible region in live key
details, plus desktop and 390px rendering without horizontal overflow. No key
credentials, access policies, or revocation state were changed.

### Tablet contextual drawer stacking

Reproduced model-filter drawer exit animation covering the product rail at
820px. The existing rail stacking safeguard applied only to phone widths.
Extended its z-index to every contextual drawer viewport so the rail remains
visible throughout entry and exit. Verified 820px and 390px open/closed states,
developer filtering and clearing, and no document overflow. No model or saved
preference data changed. This is a shared CSS fix using the existing Sidebar.

### Public documentation terminology and link review

Replaced customer-scope project wording in the API, model routing, and legacy
quota guides with workspace terminology, including authentication placeholders
and quota example shell variables. Legacy API paths and schema fields remain
unchanged. Fixed the structured-output complexity link, which omitted the docs
prefix, and replaced an obsolete Playground instruction with Chat. Docs build
passed. Verified rendered authentication wording, followed the repaired link to
Model routes, and inspected the quota guide at 390px. Procurement documentation
continues to identify installation-only controls separately from customer APIs.

### Retired procurement UI cleanup

Removed the unreferenced CostsRoute/CostsView and its obsolete frontend tests.
The retired workspace costs route already redirects to customer Billing; the
removed source contained procurement controls and shortened internal IDs that
must not reappear in workspace UI. Backend procurement contracts and their
authorization remain intact. Dashboard type checking passed; verified the
legacy route redirects to Billing and inspected its narrow layout. No financial
data, budgets, or rates changed.

### Documentation search and retention guidance

Verified populated payload search results on desktop and mobile, including a
result navigating through the help shell to the retained-content section.
Updated Getting started to state the existing 24-hour payload retention default
and both API and Chat opt-outs explicitly. Expired content and retained metadata
remain distinguished. Docs build passed; inspected the revised section at both
widths. No retention configuration or stored payloads changed.

## Workspace breadcrumbs and page switching

The shared workspace header links the workspace display name to its overview.
The current page uses an installed shadcn DropdownMenu to switch workspace
sections, preserving workspace scope and showing the active section. Both
labels render at 14px; the current page is semibold. Guardrails detail pages
use the same breadcrumb instead of a second back link. At narrow widths,
intermediate ancestors are available through a parent-pages menu. History and
Blocked requests belong directly under Guardrails; Policy appears as a parent
only for its editors. Browser titles identify each Guardrails page.

Inspected Billing and Guardrails navigation at desktop and 390px widths,
including both open menus and navigation from Overview to Billing and History
to Guardrails. No saved policy or workspace data was changed. The synthetic
input preview redacted a sample email with an unsaved draft rule; reloading
discarded it. Empty rule sets now explain why testing is disabled.

## Long breadcrumb labels at narrow widths

Blocked requests exposed a collision between the current-page label and header
actions at 390px. Shared breadcrumb flex sizing now lets the label shorten with
an ellipsis while keeping the page-switch arrow and both actions visible.
Verified the open page menu selects Guardrails for this nested route, the page
width remains 390px, and the desktop header retains its complete labels.
The workspace has no recorded blocks; populated denial rows remain covered by
component tests rather than this browser check.

## API-key detail breadcrumb

Key detail and creation routes now expose API keys as a clickable breadcrumb
ancestor. The detail page no longer repeats this navigation in a separate
All API keys button. Verified the populated key detail at desktop and 390px,
and followed its ancestor link back to the same workspace key directory.
No key permissions, secret, expiry, or saved metadata changed. The 38 combined
key-detail and shared-layout tests passed.

## Key creation and compact directory action

Reviewed the creation dialog and open expiration menu at desktop and 390px.
The selected radio gutter stays clear of the label. Empty names disable
creation; an unsaved name and seven-day expiry enabled it, and Cancel discarded
the draft when reopened. No key was created. The directory's New API key
action now uses the shared icon-only treatment at narrow widths, leaving the
API keys breadcrumb readable; desktop keeps the full label. Verified that the
plus action opens the same dialog. Dashboard type checking passed.

## Shared-header regression audit

The current complete dashboard suite contains 477 tests in 77 files. Two full
runs each passed 475 tests but failed different cases under concurrent load.
A Chat settings case exposed test fixture leakage: cleanup was scoped to one
describe block, leaving later cases with stale draft state. Moving that hook
to file scope made all 36 Chat tests pass in isolation and in the next full
run. That next run instead failed two Supplier qualification cases; all seven
Supplier qualification tests passed in isolation. The full suite is not yet
verified green; a controlled-concurrency run is still required.

Also inspected Account and Appearance settings at desktop and 390px, including
the open theme menu. No profile, password, or preference changes were made.

## Controlled-concurrency regression result

`pnpm --filter @niu-io/dashboard test --maxWorkers=2` passed all 477 tests
in 77 files after the Chat fixture cleanup. The two earlier default-concurrency
runs failed different tests, while affected files passed in isolation. This
provides a complete passing regression run without extending timeouts or
removing assertions; default-concurrency stability remains unproven.

The populated global Workspaces list and default-workspace action menu were
inspected at desktop and 390px. Workspace settings navigation closed the
global dialog and opened the correct workspace; protected default-workspace
deletion remained disabled. No workspace data changed.

## Unmatched agent trace recovery

The filtered Traces empty state now offers Clear filters rather than sending
users to connection setup. It clears search and run state while retaining
source and period. Unfiltered empty results still link to Connection settings.
Verified the filtered state at desktop and 390px and followed Clear filters
back to the unfiltered state. No trace or connection records changed.

## Shared navigation regression check

The dashboard suite passed with two workers: 77 test files and 484 tests.
This checks the current test-covered behavior after the shared breadcrumb sizing
and agent-trace filter recovery changes. It does not establish complete visual
coverage across all routes or stability at unrestricted worker concurrency.
The agent setup guide now uses the same “Connect agents” title as its navigation
entry; its Connections link was verified against the running dashboard. The docs
build passed, and the guide was inspected at a narrow viewport.

## Model catalog interaction review

Reviewed the running catalog with populated model routes. An unmatched search
shows a clear empty state; Clear filters restores the catalog. The model-detail
page was inspected at a 390-pixel viewport: specification rows, model identity,
and Chat action remain readable. Try in Chat opens the same workspace with one
selected model; the comparison picker confirms that the chosen model is checked.
No inference request was submitted and no model configuration was changed.
This verifies navigation and recovery, not model inference or published pricing.

## Workspace settings narrow-screen review

Inspected the running default workspace Settings page at desktop and 390-pixel
width. Entering an unsaved name reveals Cancel and enables Save changes. Cancel
restores the saved display name, removes itself, disables Save changes, and returns
focus to the name field. The default workspace deletion control stays disabled
with its protection reason visible. No rename or deletion was submitted.

## Settings dialog initial focus

Opening Settings previously selected the read-only account email while profile
controls loaded. The dialog now places initial focus on its accessible heading.
Browser verification confirms no selected text and Tab moves to the Account
navigation link. Inspected desktop and 390-pixel layouts; credentials unchanged.
Dashboard type checking and the 34 shared-layout integration tests passed.

## Chat history search recovery

Unmatched history searches now offer Clear search, using the existing directory
recovery pattern. Clearing restores focus to the search input. Verified the
populated shell at desktop and the history drawer at 390-pixel width; no chat
message was sent and no session was deleted. Dashboard type checking passed.

## Mobile drawer-to-dialog layering

The shared rail elevation and sheet-overlay offsets now depend on the mobile
sidebar's open state rather than its presence during exit animation. Previously,
opening Archived chats while the history drawer closed briefly raised the rail
above the new dialog. Browser review confirms the archive dialog stays above the
closing drawer, and the open drawer still exposes product navigation. Reviewed
mobile transition and desktop archive; no archived session was modified.

## Workspace switching and account recovery review

Switching from Usage to another workspace and back preserves the Usage route
at desktop and 390-pixel widths. The selected workspace radio item follows the
current scope. Added a shared-layout integration test for the round trip; all
35 layout tests passed. The previously observed return to Overview did not
reproduce with sequential, settled interactions.

Reviewed Account and Appearance in the running Settings dialog at desktop and
390-pixel widths. All four settings sections remain accessible. An unsaved
display-name edit exposes Cancel and enables Save changes; Cancel restores the
saved name and input focus. Expanding password settings focuses Current password
and keeps the form within the scrolling content area. No profile, password, or
appearance preference was submitted.

Following this review, the dashboard regression suite passed all 488 tests in
77 files with two workers. This verifies covered behavior, not complete visual
coverage of every route or role.

## Key-management focus recovery

Cancelling inline key metadata editing now returns focus to Edit key. Assignment
history uses the installed DialogTrigger so closing it returns to Assignment
history. The key-policy dialog also restores focus to Change key policy on close.
Verified these controls in the running dashboard, including narrow history and
policy dialogs and the policy menu's alignment and checked state. No API key or
policy assignment was modified. The nine key detail/history tests and key-policy
tests passed.

Workspace deletion confirmation now describes deletion as conditional on having
no saved records, rather than incorrectly describing a populated workspace as
empty. Cancelling returns focus to its opening button. Desktop and narrow layouts
were inspected; all four workspace-settings tests passed, with no deletion.

The Add operator dialog now restores focus to its opening button when closed.
Reviewed the role menu at desktop and session-expiry menu at 390-pixel width;
their active options and built-in menu spacing remain intact. No operator or
credential was created.

## Composer settings panel review

Inspected Chat settings at desktop and 390-pixel widths. The installed popover
sits above the composer; narrow layout stacks the token and temperature fields
without horizontal clipping. Closing with the button or Escape returns focus
to Chat settings after the closing transition. Payload retention stays selected
and its current retention period is shown. No setting or message was submitted.

## Dialog and recovery follow-up

Reviewed key creation, rotation, and revocation confirmations at desktop and
390-pixel widths. Cancelling returns focus to the opening action; clearing an
unmatched key search returns focus to the search field. No key was created,
rotated, or revoked. All 28 key-management tests passed.

Reviewed Agent Observability's custom-period, period-fee, and agent-connection
dialogs at desktop and narrow widths. Cancelling restores focus to the opening
control. No fee, period, or connection was saved. All nine Agent Observability
tests passed.

The restricted supplier-administration screen now provides an Open workspace
action. Verified recovery to the workspace overview at both widths with an
ordinary member account; this does not grant administration access. All 35
shared-layout tests passed.

The payload-retention guide now documents default capture, the Chat opt-out,
the request-header opt-out, and the effect on already saved payloads. Verified
the guide through Help search at desktop and narrow widths; the 17-page docs
build passed.

After these follow-ups, TypeScript checking passed and the full dashboard
regression suite passed 489 tests in 77 files with two workers. Role-restricted
and populated agent-connection states still require separate runtime review;
this result does not establish complete visual coverage.

## Model catalog search recovery

Clearing model filters now returns focus to Search model routes instead of the
page body after the reset action disappears. Reviewed the catalog reference and
verified the reset in the running dashboard at desktop and 390-pixel widths;
the narrow catalog has no horizontal overflow. All 11 model-table tests passed,
including the search-reset focus assertion.

Reviewed model details at desktop and 390-pixel widths. Customer rates without
a published value show Not published; procurement prices are not substituted.
The narrow detail view has no horizontal overflow. Try in Chat retains the
workspace, loads the requested model as the only selected comparison route,
and resolves the existing workspace API key. The Models header link returns to
the catalog while preserving workspace scope. No model request was submitted.

## Guardrail draft review

Reviewed the workspace policy hierarchy and input-rule editor at desktop and
390-pixel widths. An empty custom pattern keeps Save disabled and explains
validation; a supported synthetic pattern enables testing. The preview reported
Allowed after redaction for matching synthetic text. Reviewed Block/Redact and
Chat/Responses/Embeddings choice menus, including narrow alignment and checked
states. Removed the temporary draft; Save returned to its disabled state. No
policy was saved or model request submitted.

Reviewed policy-history and blocked-request empty states at desktop and
390-pixel widths. Configure policy opens the workspace policy; the narrow
parent-page menu returns to Guardrails. Open Logs preserves workspace scope.
These empty states do not establish coverage of populated history or denial
details, which remain separate runtime-review requirements.

Adding a custom input or output pattern now focuses its new regex field, so
typing can begin immediately. Verified the input editor at desktop and narrow
widths; temporary empty drafts were removed without saving a policy. The shared
content-rule test now checks the new-field focus behavior.

Reviewed output inspection modes and the shared custom-field focus behavior.
Split pattern-source validation from action validation: an empty pattern now
asks for a supported preset or valid pattern, rather than incorrectly asking
for Block/Redact while Observe only disables that choice. Verified the corrected
message at desktop and narrow widths; discarded the draft without saving.

Added a dedicated Guardrails documentation section covering the verified policy
editor, pattern preview, output-mode limits, and unavailable external detectors.
Updated the model-route guide to distinguish Supplier businesses from Provider
adapters, preserving compatibility API and environment-variable names. Both
guides were inspected in Help at desktop and 390-pixel widths. The 18-page docs
build passed; TypeScript checking also passed after the shared form changes.

The model-access choice menu now restores focus to Search models after clearing
an unmatched search, after the menu's result update completes. Verified the
focus ring and menu alignment at desktop and 390-pixel widths. No access policy
was saved; the temporary restriction-mode draft was discarded.

Added an access-picker regression covering an unmatched search, clearing it,
focus restoration, visible model choices, and absence of policy writes. All
11 guardrail-page tests passed. A source audit found no native button, input,
textarea, select, or table usages outside the installed shared primitives;
this does not by itself establish visual or interaction completeness.

Cancelling a workspace spending-limit edit now returns focus to its Add/Edit
limit action for the same currency. Verified both desktop and 390-pixel widths;
the empty form keeps Save limit disabled. No spending limit or payment was
saved. Customer charges and spending limits remain distinct on the Spending tab.

Added multi-currency cancellation coverage: an unsaved USD edit restores its
Edit action and saved amount, while an empty CNY limit restores its Add action;
neither cancellation writes to the backend. All five spending-control tests
passed. Reviewed Statements and Rates tab empty states and confirmed the Rates
URL restores the selected tab after reload at narrow width. Populated statement
and tariff evidence remains a separate review requirement.

Verified a workspace switch while a spending-limit form was open: the new
workspace retained Billing navigation and loaded its own saved state without
the previous draft. Reviewed an existing nine-decimal USD limit at desktop and
narrow widths; editing preserved the exact amount, and cancellation returned
focus to Edit limit. No limit was changed.

## Remaining runtime coverage

Passing component tests and empty-state reviews do not qualify the complete
product. The following journeys still need rendered, populated-state evidence:

| Journey | Evidence still needed | Review priority |
| --- | --- | --- |
| Customer billing | Issued statement details, line-item loading/retry, published tariffs, and return focus after closing details | High |
| Supplier administration | Authorized multi-key Supplier editing, model mappings, agreed rates, and isolated settlements | High |
| Video | A supported route through estimate, submission, saved result, preview/download, and customer charge explanation | High |
| Guardrails | Live failure/recovery states and output-block request details; populated history, pre-admission denial and mobile table access are now inspected | High |
| Agent connections | Populated receiving/paused/expired states and resume/disconnect confirmations | Medium |
| Account | Actual avatar upload and password-change submission handoff, including failure recovery; enabled password disclosure/cancellation is now inspected | Medium |

Use existing authorized records where available. Empty screens and test fixtures
must not be reported as evidence that a live commercial or provider workflow
is complete. Keep procurement data out of customer evidence throughout review.

After the guardrail and spending-limit follow-ups, TypeScript checking and the
full dashboard suite passed: 491 tests in 77 files, using two workers. The
remaining runtime coverage above is still open.

### Usage to Chat workspace handoff

The empty Model usage action now starts a new Chat with the originating workspace in the route query. Verified the live empty Usage page, clicked Open Chat, and confirmed the workspace remained selected at desktop and 390px width. No request was submitted. The GatewayActivity integration suite passes all 46 cases, including a regression for a non-default workspace; dashboard TypeScript checks pass.

### Settings structure and Chat history refinement

Removed the duplicate Workspaces section from global Settings; each workspace retains its own Settings page. Account labels now sit above fields, avoiding compressed label columns inside the dialog. Global Settings uses a 200px shadcn Sidebar with desktop icon collapse and compact mobile section navigation. Billing contains balances and transactions; Payments contains the existing top-up workflow, which truthfully reports unavailable payment configuration on this installation. About includes release metadata, the public-project MIT license, documentation, release notes, source, issues and attribution links. Published artifacts can supply version and release date through the documented build variables. Local development does not claim a release date.

Chat history now has a labeled saved Chats zone, an outlined New chat control and Archived chats in the sidebar footer. Verified rendered Account, About, Billing, Payments, collapsed Settings, and Chat sidebar at desktop and narrow widths. No profile, password or payment data was submitted.

### Settings follow-up audit

Updated the product specification and delivery plan to describe separate global Billing and Payments sections, About, and workspace-owned Settings. Confirmed no active dashboard navigation or docsite link still targets global Workspaces or names the combined Billing & payments section. The route integration tests now verify the preserved underlying route/query/hash using About and cover workspace creation through the switcher. All 35 route tests and 18 billing tests pass, including explicit separation of balance/transactions from top-up controls. Live browser verification opened and canceled workspace creation and visited workspace Settings without modifying data. The restored shared styles were rechecked on Models at desktop and 390px; no horizontal overflow was observed. Production build passes.

### Payments account-read recovery

The separate Payments view previously hid the shared account-read failure inside Billing-only content. It now uses a payment-specific loading message and an explicit unavailable alert with retry. A controlled regression returns a failed account read, retries it once, and confirms the top-up region becomes available without exposing Billing-only balances or transactions. All 19 billing tests and TypeScript checks pass. The normal live Payments view was inspected at desktop and 390px; it still truthfully reports that this installation has no configured online top-ups. This does not qualify merchant checkout or a live outage. The original shared stylesheet was recovered from a local Git snapshot, preserving source comments and subsequent responsive fixes rather than retaining the temporary compiled-CSS recovery.

### Settings section scroll position

On a short phone viewport, scrolling About and switching to Account retained a nonzero content offset and hid the beginning of the profile form. Settings now resets only its content scroller when the selected section changes, before paint; navigation focus remains on the selected section. Verified About → Account at 390×500 and 1000×500, including a zero final scroll offset and retained Account-link focus. No profile data was changed. This retains the fixed-height dialog and independent content scrolling.

### History and workspace cancellation recovery

Archived chats now restores focus to its opening button on desktop and falls back to the Chat history toggle when the mobile drawer has closed. Verified both live; all 36 Chat integration tests pass. Workspace deletion cancellation now clears a failed deletion's error instead of leaving it on the general Settings page. A controlled failed-deletion regression verifies error clearing, trigger focus and an empty confirmation when reopened; all five workspace Settings tests and TypeScript checks pass. Live desktop and 390px review verified name-edit cancellation and delete-dialog cancellation with focus restored. No workspace was renamed or deleted. The failed deletion itself was exercised in the controlled test only.

### Video key-loading recovery

A failed Video API-key read previously displayed Reload, but the action refreshed only models and history, leaving the failed key request unretried. Key reads now have their own retry state; Reload repeats the failed key read and prevents concurrent retries while loading. The unavailable-model empty state is suppressed while key loading has failed. A controlled 503/recovery test confirms a second key read, subsequent model loading and no video submission. All seven VideoView tests and dashboard TypeScript checks pass. The live no-supported-route state and API-key menu were inspected at desktop and 390px; Escape restores focus to the menu trigger. No generation was submitted. A supported route and saved Video results still require live qualification; this key-recovery test does not establish that coverage.

### Populated Guardrail history review

Reviewed five persisted policy versions in an existing verification workspace, including restoration attribution, the active version and a historical version with a required external input check. Closing a version dialog previously left focus on the document. The installed Dialog now restores the connected policy-version opener. Verified live Escape dismissal at desktop and 390px; version details and restore/close actions fit at narrow width. No policy was restored or modified. All nine history tests and TypeScript checks pass, including a dismissal regression that confirms no rollback write. The same workspace contains a recorded pre-admission external-detector denial with API-key name, time and policy-version attribution; inspected that populated desktop table. Blocked-request failure/retry, narrow table navigation and output-block Log detail coverage remain open.

### Blocked-request mobile access and network recovery

Verified the persisted denial table at desktop and 390px, including horizontal scrolling to both policy-version columns and a live Refresh that reloads the recorded row. Browser-native network failures now receive a contextual blocked-request message with connection and Refresh guidance; API-supplied messages remain intact. A controlled rejected-fetch/recovery regression verifies both recorded stages are retried, avoids a false empty state and restores the table. All seven denial tests and TypeScript checks pass. The live installation did not experience an injected outage, so rendered error-state qualification remains separate. Refresh currently leaves focus on the document after its loading transition; this needs a shared page-action lifecycle review rather than an unverified focus claim.

### Header workspace switching and refresh focus

The workspace breadcrumb now has two separate controls: its name remains a link to the workspace overview, and a compact adjacent shadcn DropdownMenu trigger switches workspaces. Inspected the existing Render workspace menu as the reference; retained Niu's compact breadcrumb and current-page menu. Verified the open menu at desktop and 390px, switching from API keys keeps that section, name activation opens Overview, and Escape returns focus to the workspace-menu trigger. Restored the original workspace after review. The route regression suite passes 36 tests, including independent link/menu semantics and section preservation; TypeScript checks pass.

Guardrail Refresh controls now use an accessible unavailable state and guarded activation during loading instead of native disabling, which dropped focus in the browser. Verified blocked-request Refresh retains focus at desktop and narrow widths. A deferred-response keyboard test confirms repeated Enter does not issue additional reads while loading. All 17 history and denial tests pass. Policy-history Refresh uses the same direct Button pattern, but its live loading focus still needs a dedicated check. No policy, key or workspace record changed.

### Workspace-owned detail handoff

Switching workspaces from an API-key detail previously carried the old key path into the new workspace and showed an unavailable-key page. The shared workspace selection action now opens the destination API-key list, removes the old key filter and clears request-detail anchors, while retaining general query filters. Selecting the already-routed workspace does not navigate. Verified live switching from a real default-workspace key to another workspace's key list at desktop, and the reverse handoff from an existing revoked key at 390px. No key or workspace record changed; original workspace selection was restored. Added canonical-workspace-route regression coverage for detail, key-filter and request-anchor removal. The reserved default alias can normalize asynchronously, so this regression uses a canonical display-name route; alias navigation remains separate coverage.

### Consolidated dashboard regression checkpoint

After the header workspace dropdown, workspace-owned detail handoff, Video key retry, workspace cancellation, history focus and blocked-request recovery changes, the full dashboard suite passes 502 tests across 77 files with two workers. Policy-history Refresh was verified live at desktop and 390px: focus stays on Refresh policy history and the document has no horizontal overflow. These results cover the named regressions and their current rendered states; the remaining commercial, configured Video, account-credential and outage journeys are still not fully qualified.

### Enabled account password controls

Using the normal persisted demo member session, verified Change password opens the current-password field with focus at desktop and 390px. The fixed-height mobile dialog scrolls to expose confirmation, Update password and Cancel while section navigation and Close remain reachable. Cancel unmounts all password inputs and returns focus to Change password. No current or new credential was entered and no update was submitted. This closes the rendered enabled-control disclosure/cancellation gap, not actual password-change submission or its failure recovery, which requires the user's credential handoff.

### Settings close focus — 2026-10-07

Reproduced lost keyboard focus after opening global Settings from the account menu and closing with Escape. The installed Dialog now restores focus to a visible persistent account/navigation trigger, excluding dialog controls and hidden mobile rail controls. Verified the actual account-menu flow on desktop (Account menu receives focus) and at 390 × 844 (Expand workspace navigation receives focus). No profile or credential changes were submitted. Account Settings regression suite: 11 tests passed; dashboard TypeScript check passed. This does not qualify password submission or other remaining runtime states.

### Billing and Payments read separation — 2026-10-07

Payments previously requested balance transactions even though it does not display transaction history. AccountBilling now loads that history only for Billing (or its combined compatibility view), aborting pending reads when changing sections and loading history when entering Billing. The transition regression verifies Payments → Billing → Payments makes exactly one history read. Billing and Account Settings suites: 31 tests passed; TypeScript check passed.

Live desktop and 390 × 844 verification used the existing ordinary-member account. Payments accurately reported unavailable online top-ups; Billing displayed its current zero balance and empty transactions. Workspace Statements accurately displayed no issued records. No top-ups, transactions, statements, or payments were created for verification. Populated statement detail, payment execution, and commercial settlement qualification remain outstanding.

### Request row accessible names — 2026-10-07

Inspected the actual OpenRouter Logs table and its filter/empty-state structure; retained Niu's existing table and right-side request sheet. Clickable request rows now have explicit model, timestamp, and status names instead of leaving the accessible row unnamed (native browser inspection previously fell back to its internal DOM identifier). Internal identifiers remain in DOM anchors and routing, not accessible names. The integration regression verifies a UUID-backed row can open with Enter and regain focus after Escape. All 48 GatewayActivity integration tests and the dashboard TypeScript check passed.

Live populated Logs verified on desktop and 390 × 844: Enter opens the selected request, the sheet's metrics and overview fit the viewport, and Escape restores focus to its readable row. The ordinary-member payload was expired/unretained; retained-content and commercial-charge states are not qualified by this check.

### Request sheet initial focus — 2026-10-07

Live review showed that opening a request sheet focused Previous/Next request instead of announcing its context. The installed Sheet now focuses its existing Request details heading during open autofocus. Adjacent-request navigation retains the existing heading-focus and scroll-reset behavior. Verified keyboard opening and Next request on desktop, opening at 390 × 844, and Escape. All 48 request integration tests and the dashboard TypeScript check passed. The regression now asserts initial heading focus as well as restoration to the originating row; no request or account data was changed.

### Model description source completeness — 2026-10-07

Model details displayed a saved GPT-4.1 Mini description ending mid-sentence. The existing metadata-only refresh made zero updates: the live OpenRouter models API supplied the same 193-character truncated text. Inspected OpenRouter's actual model page and verified its 452-character summary was an exact continuation of the stored prefix. Updated only that existing route's descriptive catalog field using its current expected revision; other catalog fields, routing configuration, Supplier offers, and rates were preserved. Fresh-browser desktop and 390 × 844 verification displayed the complete description from backend data. The catalog card retained its compact 42px description treatment. Existing metadata-refresh tests: 12 passed.

This is one verified descriptive-data repair, not qualification of the remaining catalog descriptions. The upstream API's truncated summaries remain a catalog-import completeness gap; do not infer a complete description from the API alone or overwrite custom descriptions. No customer prices were filled from procurement data.

### Complete catalog summaries and disclosure — 2026-10-07

Inspected actual model-summary paragraphs on all 23 remaining truncated catalog entries' OpenRouter pages. Each longer summary matched its saved prefix. Updated descriptive metadata using each route's expected revision and read back every update, verifying other catalog fields and route settings were preserved. The complete 25-route catalog now has zero descriptions ending in truncation markers. Removed hidden external-link accessibility labels from three imported summaries after rendered review exposed them. Supplier offers, prices, and customer rates were not changed.

Borrowed OpenRouter's two-line summary with Show more/Show less, using the installed Collapsible and Button at the model-detail call site. The full text remains stored in the backend. Paragraph breaks and long-URL wrapping are preserved when expanded. Overflow measurement hides the disclosure when the description fits. Collapse keeps focus on its control and scrolls it below the sticky header when necessary. Regression covers expanding clipped content, retaining button focus, and opening another model collapsed; 13 model tests and TypeScript check passed.

Rendered Google Gemini 3.1 Pro Preview (the longest repaired summary) on desktop and 390 × 844. Verified expansion/collapse, complete paragraphs without page-only labels, no document-width overflow at mobile width (390px), and visible focused collapse/expand control below the header. Catalog cards retain their existing two-line previews. Current catalog-description repairs are complete; API-only seeding can still receive truncated upstream summaries for future entries and must not be treated as proof of complete source text. Other outstanding product review areas remain open.

### Model-description links — 2026-10-07

Compared the actual OpenRouter Gemini 3.1 Pro Preview summary with Niu's corresponding model detail. The installed react-markdown/remark-gfm renderer now makes description documentation URLs clickable, preserves paragraphs and supports Markdown without enabling raw HTML. External links use a separate tab with noopener/noreferrer. Clipped preview links are excluded from the keyboard tab order until expanded. Regression checks safe URL rendering, unsafe-scheme removal and collapsed/expanded tab order alongside disclosure focus and navigation. All 13 model tests and TypeScript check passed.

Live desktop and 390 × 844 review confirmed two paragraphs, wrapped documentation URL, 390px document width, a 48px collapsed preview and retained Show more focus. No procurement data changed. This is model-detail rendering coverage; the remaining commercial, Video and credential-submission journeys are still open.

### About settings hierarchy — 2026-10-07

Responded to the rendered About layout feedback. Inspected Mozilla's official published Firefox About-window screenshot (https://support.mozilla.org/en-US/kb/find-what-version-firefox-you-are-using): product identity/build information grouped together, help/release resources separate from legal links. Adapted that established hierarchy to the existing Niu fixed-height Settings shell, using the branded mark, aligned release/license rows, installed ghost Button links, and a quieter legal-link group. Preserved truthful Development build/Not released fallbacks and all existing resource destinations; no fabricated release metadata or update status.

Verified desktop and 390 × 844 mobile rendering, section switching Appearance → About, correct resource destinations and no document overflow (390px). Settings navigation and close controls remain visible. All 38 SettingsNavigation/AppLayout integration tests and the TypeScript check passed. The broader product review remains open; workspace lifecycle review was deferred to address this direct About feedback.

### English About branding and resource icons — 2026-10-07

Applied direct feedback: English About uses NIU.IO without the Chinese brand name; recorded the language boundary in AGENTS.md. Renamed Source code to GitHub and used installed Tabler book, versions, GitHub, bug, license and copyright icons for the resource links. Documentation has an internal-navigation chevron; external destinations retain the outward arrow. Links use the existing shadcn ghost Button styling and accessible text; icons are aria-hidden. Desktop and 390 × 844 review confirmed alignment and visible keyboard focus while tabbing GitHub → Report an issue. TypeScript check passed. No workspace lifecycle implementation was changed during these About corrections.

### Workspace lifecycle response isolation — 2026-10-07

Continued review against the previously inspected Render workspace Settings pattern and existing Niu workspace controls. Fixed a delayed rename/delete response's use of stale navigation and workspace-list snapshots. Backend results now update current list state, and rename navigation uses the currently routed workspace/page instead of pulling users back to the request's original page. Workspace Settings invalidates pending form status across workspace changes, resets saving/confirmation state, and ignores previous-workspace errors and success messages.

Regression verifies a deferred rename can finish after switching workspaces without changing the selected route, while the renamed workspace remains available in the switcher. Form tests verify stale failures are ignored and deletion confirmation is discarded across workspace changes. Layout/form suites passed 44 tests before the additional confirmation regression; the final form suite passed 7 tests. TypeScript check passed (also corrected a nullable-session access in the current rail render). Live desktop and 390 × 844 switching with unsaved name drafts reset the destination name, left Save disabled and restored switcher focus. The transient gateway outage recovered without restarting the runtime. Restored the original selected workspace; no rename or deletion was submitted in the browser. Actual delayed server mutations were exercised by deferred-response integration tests, not by altering live workspaces. Broader commercial and configured-feature journeys remain open.

### Consolidated regression and Account cancellation — 2026-10-07

The current full dashboard suite passes 509 tests across 77 files (`--maxWorkers=2`, 71.27 seconds). Production TypeScript/Vite build passes. The build retains its non-failing warning that Settings is both statically and dynamically imported; this checkpoint does not claim route-chunk isolation.

Live Account review at desktop and 390 × 844 verified draft display-name edits and Cancel: saved Demo name and D avatar fallback restore, Save changes becomes disabled, and focus returns to the name input. Mobile document width remains 390px and the fixed-height Settings shell retains its navigation and Close access. No profile, photo or password was submitted. Actual credential/photo submission, populated commercial statements/settlements, configured Video generation, and other previously recorded runtime gaps remain outstanding; green dashboard tests do not qualify those journeys.

### Chat sidebar empty-state qualification — 2026-10-07

Inspected the actual authenticated OpenRouter Chat sidebar and room-action menu (Pin/Rename/Duplicate/Delete) alongside Niu's existing sidebar. Niu's current runtime session has no saved or archived chats. Verified desktop unmatched-search → Clear search resets the query and returns search-input focus. Verified mobile history drawer → Archived chats closes the drawer, displays a compact archive dialog, and Escape returns focus to Toggle chat history. Inspected a second stable screenshot after the drawer animation; no persistent overlapping drawer was present. No chats or account settings were changed.

This closes current empty-state/access verification only. Populated session actions are covered by existing automated tests and earlier checkpoints, not newly proven by this empty runtime state. The runtime session exposed an Admin rail entry during this check, so this checkpoint does not claim ordinary-member authorization coverage. Do not equate empty history under another session with loss of saved member data. The next live review should use the appropriate authorized populated scope.

## Supplier administration review — October 7, 2026

Development administration deep links now remain with Vite; only `/admin/v1`
is proxied to the gateway. A direct Supplier page visit rendered correctly at
desktop and 390px widths, while an unauthenticated administration API read
returned 401.

Supplier pricing search restores focus to its input after clearing an unmatched
query, and all 25 configured text offers returned. Rate dialogs distinguish
editing from adding rates, explain future-request scope without storage jargon,
and restore focus to the persistent row action trigger after closing. No rates
were published during browser verification.

Settlements and Members now have matching navigation, page and browser titles.
The horizontally scrolling administration tabs reveal the selected tab on
direct visits, resize and Home/End keyboard navigation without scrolling the
page. Desktop and narrow rendering were inspected.

Membership editing chooses active accounts by name using the installed
DropdownMenu primitives. It excludes revoked accounts and disables Save until
an account is selected. The identifier remains only in the write contract.
Desktop and narrow open-menu alignment were inspected without changing access.
Eight Supplier workflow tests and four administration navigation tests passed.
TypeScript checking passed after the account-selection implementation.

### Membership review remains incomplete

The current Members page shows only the active-member count. The route registry
provides PUT `/admin/v1/providers/{provider}/members/{operator}`, but no member
list read; `Store::provider_dashboard` also omits membership records. A complete
review requires an authorized read returning account names, roles and active
status, followed by a named member table and per-member edit flow. The account
directory is not membership evidence and must not be used to infer access.
Populated membership, usage and settlement journeys remain unqualified; empty
states and fixture tests do not establish their completion.

## Supplier membership read implemented — October 7, 2026

The previously missing read is now implemented at GET
`/admin/v1/providers/{provider}/members`, restricted to platform administration.
It returns named membership records with role and effective access, including
revoked accounts for review. The Members page uses those records directly;
per-row editing prefills account, role and access. Revoked accounts cannot be
edited to grant access. Internal account identifiers remain in API contracts
and React keys, not displayed content.

Nine Supplier UI tests pass, including named rows, revoked-account handling and
edit preselection. Gateway and dashboard type checking pass. The isolated
PostgreSQL authorization test passes, proving a Supplier member is denied the
platform member-list read while administration receives the named membership.
The live Supplier currently has no members; its backend-backed empty state was
inspected at desktop and 390px widths without granting access. A populated live
member table and actual access changes remain unqualified. This supersedes the
earlier statement that the read API is absent, not the remaining live coverage
gap.

## Supplier draft response isolation — October 7, 2026

Switching an existing Supplier selection clears its dialog, draft-related
status and media editor. Pending writes retain their original request target,
but late success or failure callbacks cannot update the newly selected
Supplier's UI. Initial directory hydration is treated separately so Supplier
creation and discovery-failure recovery remain usable.

All eleven Supplier workflow tests pass, including discarding an open member
draft and ignoring a deferred previous-Supplier save failure. Dashboard type
checking passes. The live membership dialog and cancellation were inspected;
Escape restored the Manage membership trigger. The configured installation has
only one Supplier, so cross-Supplier browser switching remains fixture-qualified
rather than claimed as a populated live journey. No access or rate changed.

## Dashboard regression follow-up — October 7, 2026

The production build passes. The broad dashboard run completed with 510 of
515 tests passing across 77 files; five failures prevent claiming a green
regression gate. Focused reruns pass for Settings navigation, legacy workspace
names, trace detail and operator access. Organization switching also passes
when run alone with a 15-second diagnostic test budget (2.71 seconds total).
These reruns do not establish the cause of the broad-run failures. A full
single-worker diagnostic run is pending; no global timeout or assertions were
changed to accommodate the failures.

That diagnostic run completed: 76 files passed and five tests in AppLayout
failed because they still expected the former workspace Usage label. Current
navigation and the rendered page both use Activity, preserving the `/usage`
route. Updated the label expectations without removing route, scope or active
state assertions. All 39 AppLayout tests now pass with the default timeout.
The full suite has not yet been rerun after this test-only correction.

The live About panel uses GitHub as its repository-link label, with matching
Tabler icons on product and legal links and an external-link indicator where
appropriate. Its desktop rendering was inspected directly.

### Activity summary caption wrapping

The populated 390px Activity page clipped the latency coverage caption because
an implicit grid column inside the summary article exceeded its tile width.
Constrained the inner column with `minmax(0, 1fr)`, retaining the existing summary
layout. Browser measurement now shows each caption's scroll width equals its
available width; latency coverage wraps visibly. The 1280px layout was also
inspected and keeps its metric alignment. No request or billing data changed.

### Empty-state positioning audit

Overview now gives its empty Recent requests region the remaining content
height and centers the placeholder within it, beneath the summary and section
heading. API-key empty and no-match states likewise fill the remaining list
region beneath their toolbar. Their content keeps a compact grouped layout;
grid rows do not stretch apart. Both actual empty pages were inspected at
1280px and 390px using an existing workspace with no requests or keys.
Dashboard type checking passes. The source inventory includes additional
directory, detail, billing, Supplier and agent empty states; their rendered
positioning review remains pending, so this is not an all-pages completion claim.

Logs now gives its empty or no-match request region the remaining height below
the filters, centering the grouped placeholder. Inspected the existing empty
workspace at desktop and 390px. Its Open Chat action previously reached a
missing workspace playground page in the running product; it now uses the
direct new-Chat URL shared by Activity, preserving the workspace. The actual
mobile handoff rendered Chat successfully without sending a message. Regression
coverage checks both empty Activity and Logs handoff URLs.

Model catalog no-match state now fills the result region below search, sort and
count controls, with its icon and copy centered together. Inspected desktop
and 390px rendering with an unmatched query, then cleared filters and verified
25 catalog models returned with focus restored to search. The filter sidebar
and populated catalog layout remain separate from this empty-region sizing.

Users directory empty/no-match composition now fills the remaining directory
region beneath the description and search. The live no-match state was reviewed
at desktop and 390px; Clear search restores the two existing users and focuses
Search users. The current installation has organization-wide users in every
workspace, so a true zero-user state uses the same layout but is not claimed as
live-rendered evidence. No user access was changed.

Guardrails policy-history and blocked-request empty states now center within
the remaining page region. Their existing copy and policy setup link are
retained. Both true empty states were inspected at 1280px and 390px using the
existing verification workspace. Configure policy opens the correct workspace
policy page; no policy was saved. The earlier pending TypeScript check passed.

Agent trace empty/no-match states fill the remaining result region between
filters and pagination, centering their grouped content at desktop and 390px.
Clear filters and Reset now restore trace-search focus after the asynchronous
filtered read completes; immediate focus alone was lost when the search field
unmounted during loading. The live clear-filter journey restores the default
empty state and search focus. No trace or connection was created.

Supplier administration standalone Members, Usage and Settlements empty panels
now fill the available result area under their tabs, centering their messages
below the existing headings or member count. Actual empty records were inspected
in all three sections at desktop and 390px. Nested offer, chart and form empty
states are not stretched by this rule. No membership or payment changed.
All nine agent-observability tests pass after the focus follow-up.

Workspace Billing Statements and Rates standalone empty panels fill their tab
result area and center the message below the heading. Both true empty records
were inspected at desktop and 390px. Spending remains a composite section;
its no-charge text stays beside spending-limit context. No rate, statement or
payment was created. A concurrent route cleanup briefly left an undefined
redirect in the development bundle; current routes no longer contain that
reference and a browser reload renders Billing successfully.

### Empty-state chart follow-up

The current Overview and Activity chart composition was added during the positioning audit. Request, model activity, and token usage placeholders now center horizontally and vertically inside the same height as their corresponding populated charts, including loading and unavailable states. Overview was inspected at 1280 × 720 and 390 × 844. The production build passed before this final chart-only adjustment; TypeScript was checked again afterward. Inline sidebar, form, and transaction status messages retain their section context rather than filling the entire page. No data was created or deleted to manufacture empty states.

### Overview and issued-key Chat navigation

The running Overview Compare models action reproduced a Page not found result at the legacy workspace playground URL. Overview now links directly to a new Chat with the current workspace route segment. The issued-key Use in Chat action uses the same direct destination and retains its selected key parameter. Overview navigation was clicked successfully at desktop and 390 × 844. No key was issued for browser verification; the one-time-secret integration test covers the issued-key destination with a synthetic fixture. TypeScript and the focused Overview workflow tests passed.

### Canonical Supplier setup links

Setup actions in Overview, the issued-key prerequisite, Chat, Models, and the legacy agent connection component now target `/admin/suppliers` directly rather than its compatibility redirect. The existing Supplier administration destination was inspected at desktop and 390 × 844; its narrow tab row remains horizontally scrollable. These edits change link destinations only and preserve the current layout. Compatibility routes remain available. Focused customer-workflow and key-dialog tests cover the canonical destinations.

### Setup guidance follows platform permissions

Overview, Models, Chat, and the issued-key prerequisite now use the same platform administration eligibility as the Admin route: installation or platform-admin role plus manage-operators permission. Ordinary users receive guidance to ask an administrator instead of a setup action they cannot use. User accounts with platform permissions receive the action without requiring a legacy installation session. Removed unreachable two-model setup copy from Chat; current Chat supports one model. TypeScript and 51 focused Overview, Keys, and Chat tests passed. Normal Chat was inspected at desktop and 390 × 844. Live empty-catalog branches remain unverified because the running catalog is populated; integration fixtures verify their guidance and action visibility. No catalog entries or permissions were changed for verification.

### Guardrails heading hierarchy

Inspected OpenRouter Logs and Guardrails, then removed redundant content headings beneath the existing page header on Blocked requests, Policy history, and External input checks. Kept the workspace policy name because it identifies the edited object rather than repeating the route. All three affected routes were inspected at desktop and 390 × 844. Empty history and blocked-request placeholders remain centered; detector prerequisites remain inline with the configuration action. All 43 Guardrails tests passed. No policy or detector was saved.

### Settings selected-page semantics

The query-based Settings dialog visually selected one section but every NavLink reported aria-current=page because React Router matches paths independently of query parameters. Settings navigation now uses Link with explicit aria-current derived from the same selection as SidebarMenuButton. Browser inspection confirmed only Account was current initially and only Appearance after switching. Account and Appearance were inspected at 390 × 844; About navigation was checked at desktop. No appearance preference or profile data was changed. A regression test covers all five query-based menu entries.

### Shared session-check loading screen

AppLayout now renders the existing RouterPending screen while browser authentication is checked, replacing the plain Checking session status. Reuses the centered brand mark, viewport-height background, accessible status label, and reduced-motion CSS. Supplier-route reload captured the shared loader in-browser; the route also rendered successfully on initial navigation. A delayed-session regression test waits for the session request, checks this screen, completes authentication, and verifies the loader disappears. That test and TypeScript passed. The broader AppLayout run had three navigation failures after a concurrent Activity rail change; those are not claimed resolved by this loader change.

### Combined Activity log-row activation

Global Activity request rows now open their workspace request details when any non-link cell is clicked, matching the existing workspace Logs pattern. Rows support Enter and Space with a visible keyboard focus outline, and timestamp anchors retain native new-tab behavior. Real recorded request activation opened the correct Guardrail verification detail sheet at desktop and 390 × 844. All eight Global Activity tests passed, including pointer and keyboard activation fixtures. Current AppLayout navigation tests passed (43 tests), superseding the previous three failures after concurrent Activity navigation changes. No requests were sent or modified.

### Global Activity sidebar hierarchy

Global Activity now uses the shared Sidebar for Overview and Logs instead of local tabs, following the existing Niu navigation shell and the inspected OpenRouter Activity hierarchy. Workspace Activity retains its workspace navigation. The workspace scope filter and refresh action form a compact toolbar; switching sidebar sections preserves the scope query. Browser checks at 1280 × 720 and 390 × 844 covered Overview, Logs, the combined mobile rail/sidebar, drawer closing after navigation, and filter-menu alignment. Selecting Guardrail verification then switching to Overview retained that scope. All 52 focused AppLayout and GlobalActivity tests passed; TypeScript passed. No saved workspace data or settings were changed.

### Scoped Activity refresh ownership

A workspace-filtered global Activity view embeds the workspace Activity controls. Its additional global refresh button duplicated the existing request refresh action. The global toolbar now shows its refresh only when it owns the combined-workspace data; scoped views retain the existing request refresh. Compared with the actual OpenRouter Activity toolbar and inspected at desktop and 390 × 844. The remaining refresh was activated successfully, and the workspace filter menu alignment was verified on mobile. Nine GlobalActivity tests and TypeScript passed.

### Global Activity error recovery

Unavailable workspace scope previously produced an unstyled error sentence. Global Activity now uses the installed Alert and Button primitives with Try again and, for scoped errors, Show all workspaces. The latter clears the unavailable query scope and reloads authorized totals. Desktop and 390 × 844 browser verification used an unavailable workspace route, retried it, then recovered to the real all-workspace totals. No workspace or request data changed. Eleven GlobalActivity tests passed, including retry after a failed request and clearing an unauthorized scope; TypeScript passed.

### Payments history states

Inspected workspace Settings and global Account/Payments at desktop and 390 × 844, and compared Payments with the actual OpenRouter Credits transaction-history section. TopupFunding previously rendered only the unavailable funding sentence when saved history was empty. It now explicitly shows Top-up history and a centered No top-ups yet state after successful loading, exposes Refresh top-ups even with no saved records, and announces initial payment loading. Empty history is suppressed while loading or when history retrieval failed. Browser refresh completed successfully with the real unavailable integration and empty history; no payment intent was created or profile data changed. Seventeen TopupFunding tests passed, including unavailable funding with empty history and refresh; TypeScript passed after removing an unused Supplier navigation variable. Existing checkout and saved-payment behavior remains covered by the focused tests.

### Shared sidebar headers and standard empty states

Compared the actual OpenRouter Models navigation with Niu Workspace, Chat, Activity, Models, Admin, Video, and Settings navigation. Context sidebar headers now use one shared 72px header, 48px title row, 14px title typography, and consistent horizontal alignment. Chat search/actions and Video workspace/actions sit below the heading rather than changing its height. Desktop and 390 × 844 browser checks confirmed alignment and mobile open/close interactions. Video mobile history now starts beside the rail, matching Chat instead of opening beneath it. Help retains its own documentation navigation.

Installed the official shadcn Empty primitive using its CLI after inspecting the actual component documentation. Payments history now uses a receipt icon, title, and concise history context, centered in the remaining Settings content area. API key zero-result states use the same primitive with an appropriate icon and Clear search action. Payments was inspected at desktop and mobile; the no-matching-keys state was visually checked on mobile. The gateway became unavailable during the final search-recovery and zero-key checks, so those final browser interactions remain unverified. No payment, credential, or profile mutation was performed.

TypeScript passed. The initial five-file sidebar/navigation regression run passed 101 tests. A subsequent four-file run passed the Keys and Payments suites but had five failures in AppLayout session-loading and Video model-loading tests; a serial rerun was started to distinguish timing failures from reproducible failures. Do not treat this as an entirely green final regression run until that result is recorded.

The serial AppLayout and Video rerun passed all 50 tests with a 15-second test timeout. Combined with the successful Keys and Payments suites, all four focused suites passed; the earlier parallel run exposed timing failures.

### Empty-state browser verification after gateway recovery

The existing development launcher completed its rebuild and restored the gateway. Verified both the real zero-key workspace and the no-matching-keys state at desktop and 390 × 844. Clear search restores the key list, clears the query, and returns focus to Search API keys at both widths. Desktop Settings Payments retains the shared sidebar header and centered receipt/history placeholder; collapsing and expanding Settings navigation works without clipping the content. These checks resolve the previously recorded gateway interruption. No account, key, payment, or saved product data was changed. Temporary browser tabs were closed and the desktop viewport restored.

### Workspace management interaction audit

Inspected the current default workspace Settings at 1280 × 720 and 390 × 844. Name editing fits without horizontal overflow and an unchanged name keeps Save changes disabled. The default workspace shows its protection message and disabled deletion. At mobile width, opening Create workspace from the sidebar switcher closes the drawer before presenting a centered, readable form with initial name-field focus; cancelled without creating data. Opened the non-default workspace deletion confirmation: its workspace-name requirement and disabled destructive action are readable on mobile; cancelled without submitting. The current-page header menu exposes all workspace pages with Settings selected; selecting Overview navigates successfully. The separate header workspace menu shows meaningful workspace names and the correct selection. No create, rename, or delete mutation was performed. Temporary audit tab was closed and the desktop viewport restored.

### Activity chart caption cleanup

Inspected actual OpenRouter Activity overview and the current Niu empty workspace overview at desktop and 390 × 844. Removed the redundant request-volume caption that referred to a selected range on Overview, where no date-range control exists. The shared Requests over time heading now carries the chart meaning directly. Verified the rendered empty overview and populated workspace Activity chart on mobile; the real chart and its axes remain readable. TypeScript passed. No fabricated chart data or request traffic was introduced.

### Mobile breadcrumb title allocation

Inspected the actual OpenRouter mobile Logs header and reproduced short Overview/Activity title truncation in Niu at 390 × 844. Generic button padding overrode the current-page trigger's compact padding, and the workspace parent competed with the page title for width. The shared header rule now explicitly keeps 4px trigger padding and allocates mobile breadcrumb width so the current page can retain its intrinsic short title while the workspace name truncates. Verified Overview and Activity titles without ellipsis or horizontal page overflow, page-menu navigation, desktop layout, and nested Guardrails Policy parent-menu access. Brand, typography, separate workspace/page controls, and longer-title truncation remain intact. This is a CSS-only adjustment; no saved product data changed.

### Catalog empty-state consistency

Replaced the Models catalog's custom empty markup with the installed shadcn Empty, EmptyHeader, EmptyMedia, EmptyTitle, and EmptyDescription primitives directly, matching the verified API keys and Payments empty-state pattern. Preserved remaining-area centering through catalog layout selectors. Inspected desktop and 390 × 844 no-matching results, cleared filters to restore the real 25-model catalog, opened the Sort menu and verified its alignment, selected name ordering, and opened a filtered model detail at mobile width. The model description expansion remains available. All twelve ModelTable tests passed. No inference, credential, or saved configuration mutation was performed.

### Users empty-state and copy consistency

Reviewed the current workspace Users page, real filtered results, mobile user actions, and OpenRouter workspace Settings reference. Removed the redundant sentence that only repeated the Users page purpose. Replaced both directory empty branches with the installed shadcn Empty composition, matching API keys, Models, and Payments; retained the existing remaining-area placement and used an outline Clear search action. Browser verification confirmed centered no-matching results at desktop and 390 × 844 and search recovery with focus restored to Search users. Eleven OperatorDirectory and OperatorsView tests passed. No user addition, session revocation, or permission change was submitted; temporary audit tabs were closed and the desktop viewport restored.

### Billing statement empty-state consistency

Inspected actual OpenRouter Credits history and current workspace Billing Spending/Statements. Empty Statements previously advertised Latest 100 issued records despite having none. That caption is now restricted to nonempty history. Replaced its bare sentence with the installed shadcn Empty receipt/title/context composition, retaining the existing full-height section layout. Verified Statements at desktop and 390 × 844 and confirmed Refresh billing preserves the selected Statements section. All twenty Billing tests passed. No spending limit, payment, statement, or commercial configuration was changed; temporary audit tabs were closed and the desktop viewport restored.

### Billing Rates placeholder

Applied the same verified billing-history Empty composition to the Rates tab: currency icon, No rates published title, and concise published-customer-prices context. The per-million-token caption now appears only with actual rates. Inspected the real empty Rates state at desktop and 390 × 844 and switched between Rates, Statements, and Spending successfully. Twenty Billing tests passed. Procurement prices remain outside this customer page; no rate, limit, payment, or permission mutation was performed. Temporary audit tab closed and desktop viewport restored.

### Chat settings and archive interaction review

Inspected Chat desktop and 390 × 844 settings panels anchored above the composer. History search recovery clears the query and restores focus to Search chats. Replaced the archived-chat dialog's bare left-aligned empty sentence with the installed shadcn Empty archive-icon/title composition, consistent with the previously inspected shared Empty reference. Verified empty archive placement at desktop and mobile and dialog dismissal focus recovery to Toggle chat history. Thirty-seven PlaygroundView integration tests passed. No inference request, archive/restore mutation, attachment upload, or preference change was submitted. Temporary audit tab closed and desktop viewport restored.

### Logs empty-state and details review

Reviewed current Logs filters and real Not sent empty results, using the previously inspected OpenRouter mobile Logs pattern and shared Empty reference. Replaced the request placeholder with direct shadcn Empty composition while preserving level-three heading semantics, fixed-key scope behavior, Clear filters, and the noncompact Open Chat action via Button asChild. Removed the custom grid base styling; existing remaining-area centering remains. Verified desktop and 390 × 844 empty placement, Clear filters recovery to the real request list, whole-row request selection, and readable mobile details/timing sheet dismissal. Forty-nine GatewayActivity integration tests passed after preserving the heading role. No request, billing, credential, or saved data mutation was performed. Temporary audit tab closed and desktop viewport restored.

### About and documentation terminology review

Inspected global About at desktop and 390 × 844: release metadata, GitHub/resource icons, legal links, and navigation remain readable without clipping. Followed Documentation into the getting-started guide and opened its mobile section navigation; feature sections are separate from Concepts. Corrected the guide's outdated installation-credentials wording to account sign-in, matching the persisted-member authentication model. Rebuilt docs successfully and verified the corrected text in rendered desktop and mobile guide views. No account, preference, or credential mutation was performed. Temporary audit tab closed and desktop viewport restored.

### Account and Appearance interaction audit

Inspected current Account profile form and expanded password section at desktop and 390 × 844 without entering credentials. Profile labels align with inputs, unchanged profile keeps Save changes disabled, and the fixed-height Settings content scrolls to all password fields and actions. Cancel restores focus to Change password. Switching to Appearance resets the content to its visible color-mode controls; the mobile System/Light/Dark menu aligns below its trigger and retains the selected mode. Dismissed without changing any preference. No profile, photo, password, session, or theme mutation was performed. Temporary audit tab closed and desktop viewport restored.

### API-key detail interaction audit

Reviewed a persisted key at desktop (1280 × 720) and mobile (390 × 844) widths. The inline editor focuses Name on opening, keeps unchanged Save disabled, and returns focus to Edit key after Cancel. The mobile Model access menu stays inside the viewport with its own scrolling area. Assignment history opens a readable mobile dialog and restores focus to its trigger on close. No key, model permission, or policy assignment was changed during this audit.

### Supplier media-pricing interaction audit

Inspected Models & pricing at 1280 × 720 and 390 × 844 with the real Supplier's empty media configuration. Both pricing tabs remain accessible and the empty purchase-rate state fits the content area. Publish media rate explains the missing eligible models in a readable dialog. Set up media offer shows the missing configured-model prerequisite and disables Save offer; Cancel dismisses without saving. Populated media offers and rates remain unverified because this Supplier has none. No offer, purchase rate, qualification, or credential was changed.

### Workspace header navigation audit

Inspected workspace Settings at 1280 × 720 and 390 × 844. The workspace-name link and adjacent switcher remain separate controls. The workspace and current-page menus both fit the narrow viewport, preserve active selections, and dismiss with Escape. The unchanged name keeps Save changes disabled; the default workspace's deletion control is disabled with its reason visible. No workspace name, selection, or deletion was saved.

### Remaining review coverage

The overall UX review is not complete. Current live Supplier data cannot verify populated media-rate, consumption, settlement, or portal-member layouts. Those states need representative fixtures or an existing populated environment without inventing production data. The canonical Supplier-facing route parameter was checked and corrected to match the page contract. Its access guard was inspected at desktop and mobile widths with the current owner account; populated portal interactions still require an approved Supplier member account. Existing route redirects and protected/unavailable states also need coverage beyond the owner account. These gaps must remain explicit rather than treating the verified empty states as proof of the whole feature.

### Benchmarks route identity and documentation

The analysis form rendered under a Page not found header and document title because the shared route-title mapping omitted Benchmarks. Added its title mapping and routed its requirements link through the integrated Help view. Inspected desktop and mobile form layout and followed the link to the Offline evaluator guide. All four analysis integration tests passed; a separate route-level regression verifies the heading, document title, absence of the erroneous heading, and Help URL. A source scan found no other dashboard-owned direct documentation links outside the Help integration; third-party agent documentation links are intentionally external. Populated analysis results still require a separate browser review.

### Model-detail interaction audit

Inspected a persisted model with a long description at desktop and 390 × 844. Show more expands readable paragraphs and wraps an external documentation URL; Show less restores the compact description. Mobile metadata and the stacked Chat/API-key actions fit the content width. Try in Chat opens a new composer with the requested model selected and becomes editable after loading. No inference request, API-key creation, or attachment upload was submitted. The current layout required no change in these states.

### API-key creation draft audit

Opened the New API key route, which returns to the key directory with its creation dialog open. At desktop and 390 × 844 the Name field receives initial focus and the Expiration menu stays inside the viewport. Empty and whitespace-only names keep Create key disabled. Cancel closes without creating credentials. A dialog opened from New API key returns focus to that button; direct route entry returns focus to the directory search. No key or permission was created or changed. Model access is managed on the key-detail page rather than this initial name/expiration draft.


### User access and model-route interaction follow-up

Inspected User access at desktop and 390 × 844. Session expiry, status, and revocation actions now fit without horizontal clipping; inline confirmation and Cancel remain accessible. Activity actor names and timestamps use readable secondary text, with timestamps stacked below the event on mobile. Closing user details returns focus to the user-name button or action-menu trigger used to open it. Ten OperatorsView integration tests passed. No access token was issued or revoked.

Inspected populated Supplier model routes at desktop and 390 × 844. Mobile column allocation gives aliases more room while retaining status and actions. Unmatched searches use the established shared Empty composition; Clear search restores the real route list and focuses its search input at both widths. Closing the route editor returns focus to its opening Edit button. Two ModelMappings tests passed. No model configuration, provider check, or inference was submitted.

A subsequent dashboard-wide TypeScript check reported an image-input type mismatch in the video request builder. The focused interaction tests above passed, but this check does not establish a clean project-wide build. Populated video workflows remain outside the verified evidence from this follow-up.


### Mobile navigation dismissal consistency

Reviewed workspace navigation, Models filters, Chat history, and Video history at 390 × 844. Escape or the drawer close control previously dropped focus to the page body. Each now restores focus to its existing opening toggle; no new navigation abstraction was introduced. Workspace and Models share the shell correction, while Chat and Video use their established toggle references. Forty-six AppLayout, thirty-seven PlaygroundView, and eight VideoView tests passed.

Reviewed the integrated Help homepage, Getting started guide, and Model routes guide at desktop and mobile widths. Starlight's section menu closes on navigation, preserves active section highlighting, and synchronizes the outer Help route. Desktop sidebar and on-page navigation remain visible and readable. This documentation navigation review required no source layout change.

### Video unavailable-model state

Replaced the custom unavailable-model placeholder with the installed shared Empty composition. Verified the API-key selector and workspace menu alignment, desktop and mobile placement, and View models navigation into the current workspace catalog. No configured video route exists for the current key, so populated generation, attachment, estimate, result playback, and saved-history interactions remain unverified in the live browser. Eight VideoView tests passed; no generation or configuration mutation was submitted.

### Settled mobile navigation follow-up

At a 390 × 844 viewport, the Chat drawer settles beside the visible rail without overlapping its content. Switching to Workspace from the rail closes the drawer and opens the workspace overview. The workspace selector fits within the viewport; Escape dismisses its menu and returns focus to the selector while retaining the drawer. An earlier screenshot captured the opening transition rather than the settled layout. Sidebar header styling now has one shared spacing contract instead of overlapping declarations.

### Benchmark validation browser review

The workspace Benchmarks form rejects invalid JSON with an alert and lists the required evidence for an empty JSON object. Both checks occur before the analysis request. At 390 × 844 the evidence list wraps without horizontal overflow, but the Offline analysis badge compresses the workspace and page breadcrumbs; this header remains a refinement gap. Populated reports still require an authorized representative dataset. No model request or comparison was executed.

### Benchmark narrow header refinement

Hide the redundant Offline analysis header badge at narrow widths; the visible analysis-scope note retains the information. At 390 × 844, Benchmarks now fits in full and the workspace link retains more space. At 1280 × 720, the desktop badge and breadcrumb remain visible. The populated-report coverage gap is unchanged.

### Supplier directory and profile follow-up

The directory's add and action icons use Tabler. Creation focuses the name input and rejects whitespace-only names. Cancelling creation restores the add trigger; cancelling deletion restores the row action trigger at desktop and narrow widths. Suppliers with known API keys, models, or members have a disabled deletion action with an explanation before submission. Two directory regression tests passed. No supplier was created or deleted.

Profile settings now provide Cancel for a changed draft, restoring saved fields and focusing Name. Desktop and 390 × 844 draft checks passed; two existing profile integration tests passed. The missing-logo fallback uses the existing supplier connection icon instead of an organization building. No profile update was submitted.

### Benchmark field accessibility follow-up

Invalid JSON and missing evidence mark the dataset field invalid and connect it to the corresponding error text. Editing clears the validation state. Desktop and narrow browser checks passed, alongside all four benchmark integration tests. No live comparison was executed.

### Supplier navigation and regression verification

Supplier administration breadcrumbs now show the current section and link the supplier name to its overview. The outer Admin level is omitted on narrow screens to preserve room for the current section. Desktop and 390 × 844 Settings checks, including parent-link navigation, passed. All 46 layout integration tests passed.

A profile-cancellation regression verifies restoration of name, description, website, and logo; focus returns to Name, Save becomes disabled, and no update request is made. The supplier profile and directory suites now pass all five tests. A fresh dashboard TypeScript check also passed; the previously recorded video request type error did not reproduce in the current worktree. Populated Supplier portal and benchmark-report verification gaps remain open.

### Shared sidebar close control

- Mobile product sidebars now use the installed Sheet close control, replacing the separate Chat, Video, and model-filter buttons. Header spacing reserves the same area for it across sections.
- Workspace selection now composes the installed Button and DropdownMenuTrigger directly, matching supplier selection.
- Browser checks at desktop and narrow widths covered workspace selection, the open menu, Chat, Admin, and model filters; close controls and menu dismissal were exercised without changing saved data.
- Dashboard type checking passed. Navigation, model, video, and Chat suites passed: 104 tests in four files.

### Supplier portal form follow-up

Supplier role and Access use explicit installed Label associations with their menu triggers. The portal form no longer displays the generic Supplier management subtitle. Desktop and narrow viewport checks covered open role/access menus, wrapping, Escape dismissal and returning focus on Close; no permissions were submitted. All 11 supplier qualification integration tests passed. Mobile Chat drawer dismissal also returned focus to its opener after the closing animation.

### Supplier navigation icon consistency

Reused the installed Tabler plug-connected icon across Supplier directory navigation, Supplier rail access, and the account menu, matching the Supplier profile fallback. Replaced the shell's remaining back, key, and member icons with equivalent Tabler icons. Inspected the actual Tabler icon and rendered Admin navigation at desktop and narrow widths; Supplier section navigation retained readable key/member icons. Dashboard type checking passed. Supplier-role-only rail/menu rendering still requires an approved Supplier member account.

### Portal access content hierarchy

Compared the section hierarchy with actual OpenRouter workspace Settings. Kept the section heading, moved the detailed access explanation from the directory into contextual role help in the editor, and shortened the role choices to Viewer and Manager. The help is associated with the role control and updates for the draft choice. Populated member counts use the member icon rather than an organization building. Verified desktop/mobile empty placement and role editing without saving permissions; 11 integration tests passed.

### Request details keyboard scroll region

Reviewed populated request details at desktop and narrow widths, including Previous/Next request navigation, timing values, scrollable retained-content status, and Escape returning focus to the opening row. The sheet content now exposes a named, keyboard-focusable region with a visible focus indicator. PageDown scrolls this region without moving the fixed header/footer. The sampled request payloads were unavailable or expired, so this check does not qualify retained payload rendering. All 49 GatewayActivity integration tests passed.

### Full dashboard regression and Help search review

The current full dashboard suite passed: 523 tests across 74 files. This is regression evidence, not full live qualification. Mobile Help navigation and documentation search were inspected, including search results and navigation into the API reference. Corrected obsolete development-login wording and the old Access management label in the account-session guidance; the current Users label and account/role distinction now match the dashboard. The documentation build completed with 15 indexed pages, and the corrected content was inspected in the integrated Help view at narrow and desktop widths.

### Account profile input guidance

Profile photo guidance now states accepted formats and the 5 MB limit before file selection, associated with Change photo for assistive technology. Corrected validation copy to reflect that files up to the limit are accepted. Desktop/mobile review confirmed clean placement, whitespace-name Save prevention, and Cancel restoring the saved name with input focus. No profile or password was submitted. All nine AccountProfile tests passed.

## Mobile sidebar interaction follow-up

Verified the current Models and Chat drawers at 390 × 844. The rail opens with the drawer; switching from Models to Chat closes it. Both settled headers have readable titles and accessible close controls. Closing Models restores focus to its Expand model filters trigger. Resizing through 1024 × 720 and back to mobile keeps the closed drawer closed. The focused sidebar-responsive regression test passes. This verifies those navigation states only; it does not qualify the remaining populated Supplier, Video, benchmark, or retained-payload workflows.

## Workspace management action follow-up

Corrected Chat’s no-workspace Manage workspaces action to `/workspaces`; the old organization route did not match the action. Inspected the destination directory and its action menu at desktop and 390 × 844. Workspace settings opens the corresponding workspace Settings page. TypeScript and all 37 Chat integration tests pass. The demo account has existing workspaces, so the no-workspace Chat branch itself was not rendered live; this remains a verification limitation.

## Workspace creation form follow-up

Separated the workspace name Label and Input using the existing shared form layout, preventing label typography from leaking into entered text. Disabled the name input while creation is pending. Closing the dialog restores a visible opener, falling back to Create workspace before the navigation toggle. Verified desktop and 390 × 844 rendering, whitespace-only Create disabled, draft reset on reopen, and mobile Cancel focus returning to Create workspace. No workspace was created. TypeScript and all 46 AppLayout integration tests pass.

## Settings keyboard scrolling follow-up

The Settings content area is now a named, keyboard-focusable region with a visible focus indicator. At 390 × 600, Page Down scrolls the content to the lower resources while navigation and Close remain fixed; the focused region reported scrollTop 76. Switching to Appearance resets scrollTop to zero. Reviewed desktop rendering at 1280 × 720. TypeScript and 13 Account settings/navigation tests pass.

## Shared field typography follow-up

The API-key creation input inherited weight 600 from its enclosing Label. Shared input/textarea slot styles now explicitly use weight 400, preserving heavier field labels while keeping values and placeholders consistent. Verified the key dialog at desktop and 390 × 844 and the mobile Chat composer. Computed Input and Textarea weights are 400. TypeScript passes. No key was created.

## Model recovery-state follow-up

Reviewed the mobile GPT-4.1 Mini description expansion and the unavailable-model route. Replaced the old unavailable-model placeholder with installed Empty primitives and extended the catalog’s existing remaining-space centering rules. Verified at 390 × 844 and 1280 × 720. Browse models returns to the catalog preserving the workspace query. TypeScript and ModelTable tests pass.

## Current full dashboard regression — October 8

Updated SupplierNav’s stale assertion to verify the current scoped supplier-name switcher. Replaced unsupported jest-dom matcher calls in VideoResult tests with equivalent Vitest-supported assertions; retrieval-error text and retry availability remain checked. The unbounded-worker rerun hit a five-second Chat timeout; the complete suite with two workers passed all 525 tests across 74 files without changing test timeouts. This establishes current regression coverage, not the live qualification listed above.

## Populated Logs mobile interaction follow-up

Reviewed the 61-request list at 390 × 844. Filter menu, Status and HTTP status choices fit; Back returns to the filter list, and Escape restores focus to Filter requests. The settled request sheet fills the viewport without horizontal overflow. Next updates the model, timing, and tokens; Escape removes the request hash and restores the original opening row. Sampled payloads remain expired or unretained. No additional defect or saved-data mutation was found in these states.
