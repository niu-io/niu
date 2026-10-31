# Browser Admin mode verification

Dated evidence for `niu-3b1`, `niu-wnr.2` and the connected navigation finding
`niu-lxs.32`. Beads owns execution and release state; this record describes the
verified working-tree behavior based on `87d3cff23`.

## Task and component purpose

The account menu identifies the signed-in person and lists their assigned User
and Platform administrator roles with a selected-state radio item. Multi-role
accounts can switch identity without changing customer workspace membership.
Single-role accounts do not receive a role-switch control. The current mode must be recognizable before
the person acts. Organization selection, account settings, appearance and sign-out
remain available. Provider is not a supported login role. Provider financial and statistics tasks
are currently performed by administrators; future Provider self-service is only
a possible roadmap capability.

Eligibility comes from an explicit installation-authorized grant. Password-login
sessions start in User mode. Activation belongs to the durable session, lasts at
most six hours, and cannot broaden customer workspace scope. An email address,
browser storage entry or hidden navigation item is not an authorization boundary.
Explicitly issued automation sessions and installation credentials retain their
existing contracts. The activation action is not an MFA or password challenge.

## References and criteria

- [GitLab Admin Mode](https://docs.gitlab.com/administration/settings/sign_in_restrictions/#admin-mode)
  supplies the mature interaction reference: enter/leave through the account
  menu, default ordinary membership access, and session activation with a bounded
  lifetime. Its current documentation was inspected in the browser. The hosted
  authenticated administrator UI was unavailable, so this is not a claim of
  pixel-level reproduction. Niu retains its existing shadcn account menu and brand.
- [W3C APG menu button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/)
  provides the published keyboard and menu semantics criteria. Enter opens the
  menu and focuses the first action; Escape dismisses it.
- [W3C APG modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
  requires inactive background content and contained focus while a modal drawer
  is open. The installed Radix/shadcn Sheet supplies the backdrop, outside-pointer
  handling and focus containment. Niu's former `modal={false}` override was removed.
- Niu-specific requirements retain the installed DropdownMenu primitives and
  built-in item gutter, full-width management canvas, and Admin Settings as the
  final administration sidebar item. These are project constraints, not W3C rules.

## Rendered observations

An isolated native gateway, real PostgreSQL storage and Vite dashboard were used
with a synthetic eligible member. No fixture model request or payment was sent.

| Check | Observed evidence | Result |
| --- | --- | --- |
| Default identity | New password sign-in showed User mode and no Admin rail item; account menu offered Enter Admin mode. | Pass |
| Activation | The menu action reached Provider administration and exposed the Admin rail and sidebar without removing customer areas. | Pass |
| Revisit | Reload retained the server-saved active mode. | Pass |
| Exit | Phone menu action closed navigation, removed platform authority and returned to the current workspace. | Pass |
| Permission loss | Removing the synthetic eligibility caused activation refusal, refreshed session identity, removed the activation action and showed an administrator-contact remedy. Restoring eligibility and reloading restored User mode. | Pass |
| Keyboard | Enter on the account trigger opened the menu with the activation item focused; activating it by keyboard reached administration. Escape dismissed menus/drawers. | Pass |
| Intermediate navigation | At 860 × 900, the workspace drawer occupied x=60…316, width 256; its backdrop covered x=60…860. Background actions were excluded from the accessibility view, and outside click dismissed the drawer. Administration used the same modal treatment. | Pass |
| Intermediate canvas | At 860px the closed-navigation canvas occupied the remaining 800px after the 60px product rail; body scroll width remained 860px. | Pass |
| Phone menu | At 390 × 844, the open menu occupied x=12…292, width 280 and height 547; all actions and the mode label fit without internal vertical overflow. | Pass |

Visual inspection separately checked grouping, hierarchy, item spacing, action
emphasis and density at the normal 1600px desktop, 860px and 390px layouts. The role
section has an explicit label and built-in shadcn radio selection, rather than
appending identity state to an ellipsized email. Removing
the former 196px phone-only width prevents the identity and Appearance row from
being needlessly compressed. Elevation remains limited to the existing floating
menu and drawer; no new page-level card system or bounded canvas was introduced.

## Functional evidence and limits

`browser_admin_mode_defaults_to_user_and_rechecks_authority` passed against a
fresh PostgreSQL schema. It exercised installation-only grant/read/revoke,
expected-state conflict, rejected self-grant, default User authority, activation,
deactivation, identity readback, unchanged workspace scope, activation expiry,
grant revocation and immutable grant/mode event counts. A separate fresh native
startup provisioned the development demo member with `platform_admin=false`.

Dashboard type checking and all 62 tests across the account-menu permissions and
AppLayout integration files passed. Two existing layout assertions needed to
await asynchronous DOM navigation commits rather than treating a changed router
location as proof that rendering had already finished. Their complete state
assertions remain in place.

The broader operator suite retained three failures outside the new mode test:
directory and key-list HTTP 503 assertions, and a foreign-scope HTTP 404
expectation receiving HTTP 403. The new mode/grant test passed against a fresh
schema. These results do not establish a clean full backend-suite release, and
baseline attribution for those three broader failures remains unqualified.

The source includes migration `0401_browser_admin_mode.sql` and the explicit
installation grant API. Source verification does not establish production rollout
or authorize repository publication. Production grant and default-mode behavior
must be verified together after an authorized release; do not grant eligibility
ahead of that rollout and call the User-mode workflow complete.


## Multi-role follow-up — 2026-11-01

The subsequent user clarification authorizes committing the role switch and
restricts current product identities to User and Platform administrator.
`GET /api/v1/session` now returns `roles.available`, `roles.active` and
`roles.switchable`; `PUT /api/v1/session/role` selects an assigned identity.
The boolean Admin-mode operation remains compatible. No Provider, workspace
Owner/Admin/Viewer impersonation, external Provider login or new billing exporter
is introduced.

Historical Provider membership rows are retained without access authority.
The session compatibility directory is empty, ordinary members cannot call
Provider financial/statistics APIs, and old portal bookmarks redirect into
platform administration. This follows the user's current scope rather than
reopening a Provider-facing workflow. Account-owned upstream credentials and
customer model access remain separate from these historical memberships.


The final role menu was inspected at 1600px, 860px and 390px with its radio
selection visible. Keyboard Enter opened the menu; Escape dismissed it. The
860px menu measured 280 × 378px and the phone menu 280 × 579px without internal
overflow. Switching, reloading, exiting, grant revocation and single-role hiding
were verified against server-persisted identity. Unsupported Provider selection
returns HTTP 422; unassigned administrator activation returns HTTP 403.

The duplicate workspace-sidebar Docs footer was removed (niu-7ss). Desktop and
860px expanded navigation retain workspace settings as the final item and retain
the global Docs entry. The final desktop screenshot includes the assigned-role
menu and the workspace sidebar together.

Final validation passed all 64 tests in the two dashboard test files, dashboard
TypeScript checking and generated OpenAPI consistency checks. The targeted
browser-mode, explicit-session-roles and administrator-only Provider-business
backend tests passed. A broader consumer-privacy test still received HTTP 503
from the workspace costs endpoint before reaching its Provider assertions; this
is an unresolved broader-suite result, not evidence of a clean backend release.

This follow-up is source-only: production deployment and the live platform-admin
grant remain outstanding. No push or deployment is included in this commit.
