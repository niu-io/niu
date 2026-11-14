# Settings actions and invitation verification — 2026-11-14

Related Beads: `niu-mm90.54`, `niu-287.18`, `niu-mm90.23`,
`niu-mm90.55`, `niu-mm90.56`. Beads owns current execution state.

## Observed causes and bounded changes

On staging core `414055462eb280680032589489943c9474f1fff2`, Settings
Members rendered Invite and Refresh in the underlying shell header. The modal
overlay intercepted an actual Invite click. Organization creation used the same
header portal. The repair supplies a Settings-local action target through React
context while retaining the normal shell target for ordinary pages. It preserves
the existing Settings navigation and shared controls rather than introducing a
new layout.

The shared creation dialogs also rejected every opener inside a dialog when
restoring focus. This incorrectly discarded the live parent Settings opener.
The repair excludes only descendants of the closing dialog. The applicable
[WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
calls for focus to return to the invoking element when it still exists; visible
actions behind an inert overlay fail the same modal interaction boundary.

An accepted invitation is a historical receipt, not evidence of current
membership. An actual accepted invitation continued to promise that the saved
role applied after the member had been revoked. The receipt now describes the
past acceptance and explains that opening the workspace checks current access.
Authorization and invitation consumption contracts are unchanged.

Actual organization creation also disproved an API description: creating an
organization provisions its owner membership but keeps the session's previous
organization until an explicit `PUT /api/v1/session/organization`. The handler
annotation and derived references now describe that required switch. No runtime
authorization behavior changed.

## Actual current-input evidence

The local candidate ran against the actual staging backend. Members actions
were inside Settings and pointer/keyboard invitation opening worked. Switching
Members → Appearance → Organization → Members removed obsolete actions and
left the underlying shell action target empty. Refresh remained operable.
Organization creation was independently located inside the Settings action
target. At 320px, dismissing its settled nested dialog returned focus to Create
organization inside Settings; document width was 320px. Earlier settled checks
also returned nested workspace creation to its Settings opener and ordinary
workspace creation to the workspace switcher after canceling an unsaved name.

A controlled invitation used a reserved invalid-domain address, Viewer scope,
and a one-day expiry. The actual UI disclosed that email delivery was not
configured. The issued link showed an email mismatch for the signed-in account
and offered no Accept action. Canceling through Members changed the independent
invitation directory to canceled; revisiting showed the canceled recovery state.
The one-time secret was not captured in public artifacts.

A separate zero-funded, empty review organization exercised successful
acceptance by an existing account. An independently created temporary principal
created the organization, explicitly selected it, and created a workspace and a
workspace Viewer invitation. The recipient accepted through the actual staging
UI. Independent session reads confirmed Viewer, the intended organization and
workspace, and absence of write/member-management permissions. A forbidden
workspace creation returned 403 and produced no record. The recipient could
open scoped Logs, whose actual request list was empty.

The original account organization was restored through the account menu. The
recipient membership and both temporary grants were revoked. Independent reads
confirmed revocation, the temporary bearer session returned 401, and the review
organization was no longer available to the original account. Audit records
remain; no organization-delete bypass was used. No email, model request, payment,
funding, or API credential was created by this acceptance exercise.

After those revocations, the local candidate displayed the historical receipt
with the corrected wording at 390px without horizontal overflow. Its actual Open
workspace action reached the Workspace unavailable boundary, which explained
the missing access and offered an available workspace. The screenshot was
visually inspected separately from the authorization evidence.

The creation contract was checked with current requests: creation returned 201,
the unchanged session still had its previous Viewer scope, a scoped write
returned 403, explicit organization selection returned 200 with Owner scope,
and the subsequent intended workspace creation returned 201.

## Verification limits

Dashboard static checks and production build completed for the candidate.
Generated API references were regenerated from the handler annotation. Fixture
outcomes provide no evidence for this review. These local observations do not
establish deployment acceptance: fresh hosted verification of actions, nested
focus, responsive open states, and the historical receipt remains required.
The initial narrow menu screenshot was taken during its opening transition and
does not establish the settled menu's visual quality. No email transport is
configured, so email delivery remains unverified.

## Hosted follow-up and narrow form correction

Core `3ab183db92477fb161c895bd35cfb19de6bdc82c`, staging composition
`ccff2b91b541fc3c033f915969e79012472626f0`, became live through deployment
`dep-dbs1tu8n74is738kolhg` at 08:53:08 UTC. Fresh hosted verification found
Invite inside the Settings action target and an empty underlying shell target.
Pointer opening worked; Escape returned to Invite. Organization and workspace
creation each returned focus to their own parent Settings button. Ordinary
Logs retained Refresh requests in the normal shell header after leaving
Settings. Canceling an unsaved workspace name from the original workspace
switcher returned focus to that switcher.

The settled Settings section menu was inspected at 320px: ordinary icon/text
alignment and the selected check on the right were retained. The hosted
historical invitation receipt at 390px displayed the corrected wording without
overflow; Open workspace reached the actual unavailable-workspace recovery,
and its recovery link returned to the available Default workspace. The hosted
Create organization reference explicitly described the required session switch.

That hosted pass also found a distinct form defect, tracked as `niu-mm90.57`.
At 320px the invitation form's available width was 240px but its scroll width
was 273px. Its organization-wide scope trigger supplied an intrinsic minimum
to the `1fr` grid, clipping field edges, arrows and guidance. The earlier
document-width check alone did not detect this internal clipping.

The follow-up candidate uses `minmax(0, 1fr)` for the existing modal form and
allows selected scope/role/expiry text to wrap inside the installed Button.
It does not change shared menu item layout, permissions, values or issuance.
Actual staging-backed local measurements at 320px were 240px client and scroll
width, including selection of the longer Owner role. Closed-form, scope-menu,
role-menu and expiry-menu screenshots were independently inspected. Right-side
selection checks and text alignment remained intact. Escape returned to scope
and expiry; selecting Owner returned focus to Role. At 390px the complete
guidance and action fit; the wide form was also inspected. No new invitation
was created. Dashboard static checks and production build completed for this
follow-up; fresh hosted reflow acceptance remains pending.
