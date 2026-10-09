# Admin and global Settings navigation checkpoint

Historical checkpoint recorded 2026-10-07. This is not complete F02/F03/F05 qualification.

**Current restoration:** the full-page regression found during the fresh review
has been replaced with the shared Settings dialog. Avatar-menu navigation adds a
Settings section to the current product URL, leaving the existing route mounted;
closing removes that section and preserves the original query and hash. Direct
`/settings/:section` links also open the dialog and use a validated local return
destination or workspace fallback. Settings no longer has its own rail entry.

Fresh desktop and 390px browser checks covered Account/Appearance section changes,
an unsaved profile draft surviving navigation (cancelled without saving), open
appearance menus, direct-link closing and the original Models query on close.
The surface follows the user-supplied Manus example and shared dialog radius.
Chat follow-up: an integration regression reproduced comparison-model reset when
adding the Settings query to a catalog-started new Chat. URL restoration now
responds only to changed model/key/new-chat parameters. All 36 Chat integration
tests passed after the fix. A fresh browser check selected two models, opened
Account Settings and closed it; both selections and the original Chat URL
remained intact. No inference request or profile save was performed.

The broader dashboard run passed 469 tests and failed six layout assertions.
Fresh investigation found ambiguous sidebar/breadcrumb link queries and a
breadcrumb captured before legacy redirects completed. Assertions now target
the relevant navigation region and await the redirect before inspecting its
header; all 32 layout tests passed on rerun. Dashboard type checking and the
changed-file public-boundary checks passed. A subsequent fresh
`pnpm --dir apps/dashboard test` run passed **484 tests across 77 files**,
including those corrected layout assertions, Settings and Chat regressions.
This is a dashboard automated regression result, not live-service or complete
responsive workflow qualification.

A fresh focused layout run passed **35 tests**. The Settings regression now
starts from a workspace URL with an existing query and anchor, changes dialog
sections, and closes it. It verifies that the original page remains mounted and
that both the query and anchor survive each transition. This automated check
does not add new browser or production-session evidence.

These checks do not requalify Admin permissions, company top-up workflows or every
Settings section. Historical broader checks below retain their original scope.

## Implemented

- Platform Supplier management uses `/admin/suppliers`. The Admin rail entry is restricted to installation sessions with management permission. Ordinary customers have no administration rail/menu link; Supplier members retain their own `/suppliers/:supplier` business entry.
- The Admin sidebar lists Suppliers; Supplier management sections use installed Tabs. The Supplier selector remains available in the sidebar, and tab navigation preserves its query context.
- Legacy management URLs redirect to their canonical Admin destinations. Provider-named backend API/storage contracts are unchanged.
- A shared Admin route boundary prevents unchecked or unauthorized sessions from mounting configuration pages. Existing backend authorization remains required; this UI boundary is not an API authorization substitute.
- Administrators retain customer Workspace, Chat, Agent Observability, Models and Settings navigation alongside Admin.
- Global Settings uses the Manus sidebar/content dialog pattern and the shared dialog radius. Account, Workspaces, Appearance and permitted company Billing & payments remain directly addressable. Closing returns to the originating product route, preserving its query; direct or invalid-return links fall back to the workspace.
- Profile drafts survive section changes, including Workspaces. Billing content continues to show company funds and customer charges, without procurement controls.

## Verification

`pnpm --filter @niu-io/dashboard test --maxWorkers=2` passed all 465 tests across 77 files. Dashboard type checking and the public-boundary check also passed. The worker limit avoids timeout failures under concurrent test load without changing assertions or test timeouts.

Focused dashboard tests cover denied configuration mounting, additive administrator navigation, Supplier-member destinations, tab context, Settings return destinations and profile-draft preservation. Browser checks covered administrator Supplier tabs and the selector, customer Account/Workspaces/Appearance, company Billing & payments, open choice/action menus and dialog closing at desktop and 390px widths. A temporary profile draft survived section changes and was restored without saving.

The administration reference was the official [New API system configuration guide](https://docs.newapi.ai/zh/docs/guide/feature-guide/admin/system-setting-advanced); the Settings surface follows the user-supplied Manus example. Niu retains its own shell, shared components and tokens.

## Still open

OAuth provider configuration, white-label assets and platform theme settings need durable backend lifecycles, validation, permissions and auditing. They are not exposed as placeholder pages. Stripe and native Zhifux configuration remain server-managed. Production administrator-account authentication and session restoration, complete Supplier-member workflows, actual payment qualification and full F01–F10 acceptance remain open.

## Global Settings dialog runtime recheck

The running development product was inspected at desktop and 390 × 844 widths.
A direct `/settings/appearance` link renders the shared Settings dialog; closing
returns to the selected workspace. The avatar Settings entry opens the same
dialog over the current workspace, and section changes preserve the existing
query and hash. Closing removes only the Settings query parameter. The mobile
navigation and open Color mode menu remain visible and aligned. No preferences,
profile fields or billing settings were changed during this review.

All 35 AppLayout integration tests pass in a fresh run. This evidence covers
Settings entry/close/navigation and the inspected Appearance layout; it does
not qualify Admin configuration, billing transactions, all Settings sections or
the full F02/F05 release gates.

## Supplier directory and EPay configuration recheck

Admin now opens a Supplier directory with real API-key and model counts, add/edit/delete actions, and named Supplier detail breadcrumbs. The Admin sidebar has no Supplier switcher. Desktop and 390px browser checks covered the list, action menu, Supplier detail tabs and EPay configuration dialog without clipping or horizontal page overflow.

EPay configuration is persisted encrypted, restricted to platform administrators and audited. Blank keys retain the saved secret; revision conflicts and pending payment orders prevent unsafe configuration replacement. Three PostgreSQL EPay tests passed, covering configuration, checkout creation and verified callback crediting. The Supplier CRUD PostgreSQL test, focused navigation test, dashboard type check and public-boundary check also passed. Live merchant transactions remain unqualified.

Navigation uses only Lucide and Tabler. Chat uses Tabler Message Chatbot; Phosphor and IconPark dependencies and imports have been removed.

The independent Supplier-key gateway PostgreSQL case also passed on the current
schema: one key serves two models and a second key serves a separate model;
rotation, stale-editor rejection and state reconstruction preserve the other
credential and all mappings. Workspace-key rotation preserves grants and
revokes the old token before inference. Controlled local upstreams verify
actual dispatch identity. This backend subset does not qualify rendered
multi-key onboarding or live Supplier protocol behavior.

## Admin detail selector regression — 2026-10-08

The Admin Supplier detail sidebar again exposed a Supplier switcher during the
current browser review. The switcher is now restricted to the Supplier-member
area. Admin retains its static label, scoped detail sections, named breadcrumb
and All suppliers directory link. No Supplier configuration or credentials
changed. The OpenRouter Provider directory/detail pattern was inspected; the
explicit Niu requirement against an Admin Supplier switcher governs this fix.

Fifty administration/layout tests and three Supplier navigation tests passed.
Dashboard type checking passed after concurrent unused-import edits settled;
the changed files passed the public-boundary and whitespace checks.
Navigation coverage now separately asserts no selector in Admin details and
section-preserving switching in the Supplier-member area. The running HMR product
was inspected at desktop and an actual 390-by-844 viewport: the closed mobile
drawer hides the rail, the open drawer has no Supplier switcher, and All suppliers
returns to the directory and closes the drawer. Temporary review tabs and
viewport overrides were removed. This does not qualify all Admin configuration
or the complete Supplier onboarding journey.

## Supplier detail hierarchy correction — 2026-10-08

The rendered Supplier detail still replaced the Admin sidebar with a Supplier
switcher. Corrected the shared shell: Admin now retains Suppliers and Payment
gateways throughout Supplier details; the existing detail sections use installed
shadcn Tabs in the content area. Supplier selection remains in the directory.
Supplier-member portal navigation is separate and unchanged.

Inspected OpenRouter's current GPT-4.1 Mini detail navigation as the reference
for horizontal named detail sections; retained Niu's established shell, theme,
routes and sidebar-first Admin hierarchy. OpenRouter has no equivalent public
Supplier administration page, so this is a detail-navigation reference only.

Verified the running HMR service on port 2566 at 1280×720 and 390×844: directory
entry, Overview → API keys & routes → Settings, active states, horizontal tab
scrolling to the final section, and mobile drawer access to both Admin sections.
No Supplier keys, rates or qualification records were changed. Dashboard type
checking passed. The targeted shell regression passed (1 test; 46 unselected),
including navigation from detail tabs to Payment gateways and absence of the
Admin Supplier switcher. An accidentally broad test invocation was stopped after
an unrelated organization-switching timeout; it is not passing suite evidence.
The full Supplier onboarding and release gates remain open.

## Running customer navigation recheck — 2026-10-09

The development browser on port 2566 restored its existing member session in a
new tab and again after a full page reload. An unavailable workspace link showed
scoped recovery; its action opened an available workspace with populated request
totals and recent requests. This does not prove that the unavailable workspace
was deleted or distinguish absent from unauthorized resources.

The account menu opened global Settings over the mounted workspace. Account,
Billing and Payments sections remained reachable, and closing Settings returned
to the original workspace. Desktop and 390×844 screenshots were visually
reviewed. At narrow width the desktop rail was hidden, the mobile sidebar's
navigation menu exposed Settings, and the dialog's section links wrapped without
horizontal clipping. The temporary viewport override was reset afterward.

The selected USD account's Payments section reported online top-ups unavailable;
no checkout was attempted. This is an open provider/currency configuration case,
not payment acceptance. A working available method, CNY-company onboarding,
checkout, authenticated callback/reconciliation and credited balance still need
end-to-end qualification. This recheck covers one existing member session and
navigation subset only; ordinary-role isolation, expiry/sign-out and production
HTTPS authentication remain open. No account settings, credentials, balance,
workspace records or Supplier configuration were changed.
