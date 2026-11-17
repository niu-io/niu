# Member settings verification — 2026-11-18

Bead: `niu-jj96`. This is dated verification evidence, not a release approval.

## Problem and change

Hosted core `2ec290da` opened a second dialog for member invitations inside the
Settings dialog. Member details, directory-level revocation and invitation
cancellation shared that presentation problem. The current production source has
one `OperatorsView` consumer: Settings. There is no standalone member route.
The unused standalone presentation was removed, preserving the reachable member
operations and their API and authorization contracts.

The candidate keeps these operations in the existing Settings content pane,
with a return action, cancellation and focus restoration. Escape dismisses a
choice menu first, then the member view, then Settings. Menu close autofocus
must not return focus to a hidden directory row. Workspace-scoped owners see
workspace membership wording and cannot choose organization-wide invitations.
An actual duplicate-member rejection also exposed untranslated error text below
the form; the candidate displays its Chinese translation before the form while
retaining the entered email.

## References and review criteria

The OpenRouter settings URL was inspected but required sign-in; no claim is made
about its authenticated interaction. The live [shadcn Settings sidebar example](https://ui.shadcn.com/view/new-york-v4/sidebar-13)
was inspected visually and opened/dismissed. Its single modal, persistent section
navigation and content pane informed the retained shell. Existing Niu account
settings supplied the adjacent in-dialog editing convention. Niu's explicit
no-nested-dialog rule determines the member workflow change.

The bounded UX review applies [WAI-ARIA dialog focus guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[WCAG keyboard and reflow criteria](https://www.w3.org/TR/WCAG22/), and
[NN/g hierarchy and grouping principles](https://www.nngroup.com/articles/principles-visual-design/).
These are criteria, not proof of whole-product accessibility or usability.

## Actual current-input verification

The candidate dashboard ran locally against the actual staging API and saved
records. No fixture outcome is used as evidence.

- Organization-owner invitation and fixed-workspace-owner invitation each
  rendered one dialog. The former offered organization/workspace choices; the
  latter named its workspace and exposed no scope selector.
- At 390 CSS pixels, the document was 390 pixels wide, Settings was 358 pixels
  wide and the form was 298 pixels wide. The Chinese role menu retained its
  right-hand selected check. Escape returned to its trigger, then to Invite
  member, then out of Settings. At 768 pixels, the form was 528 pixels wide and
  the document remained 768 pixels wide.
- Settled full frames were inspected at 1440, 1024, 768 and 390 pixels, including
  English and Chinese, a populated member detail, an open choice menu and a
  destructive confirmation. The content uses the available pane width; long
  names wrap in confirmations. Narrow forms scroll inside the existing modal.
  The retained Settings navigation and subdued supporting text keep the active
  form/confirmation distinguishable without a second overlay.
- A newly created temporary scoped owner changed a temporary viewer to admin
  through the UI. A separate API read confirmed the saved role. The member's
  session was revoked, then directory-level access revocation was exercised.
  A separate API read confirmed `revoked: true`; focus returned to that row's
  action. Both temporary credentials subsequently returned HTTP 401. The
  temporary owner was also revoked. No existing user's role was changed.
- One invitation was generated for a reserved invalid test address, scoped to a
  workspace. The result explicitly reported no email sent; no link was shared.
  The Keep invitation action restored focus to the original row. Cancellation
  returned focus to Invite member after the row disappeared. Independent list
  and token-preview reads both reported `canceled`, with revocation recorded.
  Invitation acceptance and delivery are not inferred from this cancellation.
- Inviting an existing organization member produced the real server rejection.
  The form retained the entered email, showed the Chinese recovery instruction,
  and canceled back to the list with focus restored.

Dashboard type checking, lint and production build are code-hygiene checks.
The browser and independent saved-state reads above establish the bounded
behavioral evidence. Hosted deployment of this candidate still needs verification;
this record does not claim that the hosted bundle already contains the change.

## Hosted integrated follow-up

Hosted core `2a4dfb858fba5c94e8d3c466bf0e300ff5108313` was inspected after
its actual deployment. Workspace-scoped invitation remained inside the existing
Settings dialog, showed Default as its scope, focused the email input, and
returned focus to the invitation trigger on Escape. A second Escape closed
Settings. At 390×844 the document remained 390 px wide, the form remained in the
scrollable Settings body, and no nested dialog was present. The rendered
screenshot was inspected. No invitation was created or sent during this follow-up;
the actual bounded role/revocation/cancellation evidence above covers those
operations against staging APIs. This is the hosted integration follow-up, not a
claim that the entire final release permissions gate is complete.
