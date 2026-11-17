# Organization settings verification — 2026-11-18

Bead: `niu-vn14`. This dated record covers the candidate organization Settings
presentation; it is not hosted deployment or release acceptance.

## Observed cause and correction

The actual hosted Organization Settings page opened a second dialog for both
Create workspace and Create organization. In a workspace-creation walkthrough,
Escape dismissed Settings as well. The candidate reuses the same Niu creation
forms inside the existing Settings pane, with a return action and explicit
name-field focus after mounting. Cancel and Escape return to the relevant
creation trigger. The main workspace switcher and workspace directory retain
standalone installed shadcn dialogs. The create API, slug generation, optional
customer spending limit and organization idempotency behavior are preserved.

The organization-loading branch now shows a skeleton instead of presenting
an empty-organization claim while workspace context is still loading. Existing
rename and token-join forms were inspected: they already remain inside Settings.
A real duplicate workspace slug response exposed an untranslated recovery
message; workspace and organization slug-conflict translations were added.

The design follows Niu's explicit prohibition on nested Settings dialogs, the
existing Settings pane and the previously inspected live
[shadcn Settings example](https://ui.shadcn.com/view/new-york-v4/sidebar-13).
The authenticated OpenRouter settings reference was unavailable, so no claim is
made about inspecting its private workflows. Review criteria are
[WAI-ARIA modal focus guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[WCAG keyboard/reflow](https://www.w3.org/TR/WCAG22/) and
[NN/g hierarchy/grouping](https://www.nngroup.com/articles/principles-visual-design/).

## Current-input evidence

The candidate dashboard was operated against the real staging API.

- Both Settings creation entries render one dialog. The name field receives
  focus on first entry and reopening. Cancel/Escape restore the original
  workspace/organization trigger; a subsequent Escape exits Settings.
- Chinese workspace naming generated the expected pinyin slug. Editing the
  suggested slug and changing the display name retained the edited slug.
- One temporary workspace was actually created from the narrow Settings form.
  The browser navigated to its canonical slug route. An independent workspace
  list read confirmed its saved name, slug and original organization. The empty
  workspace was then deleted through the authorized API with HTTP 204; a new
  list read confirmed its absence. No paid request or funding change occurred.
- The standalone workspace switcher still opens one creation dialog. An
  explicitly entered reserved slug disables submission and shows its recovery
  message. Escape closes that dialog and restores the workspace-switch trigger.
- An actual duplicate workspace slug request returned the server conflict.
  The name and edited slug remained intact, the Chinese recovery message was
  visible, and Cancel restored the Settings trigger. No duplicate workspace
  was created.
- Full frames were inspected at 1440, 1024, 768 and 390 CSS pixels, including
  open slug editing, Chinese conflict recovery and English organization creation.
  The 768-pixel organization view used a 528-pixel form lane; at 390 pixels its
  form lane was 358 pixels. Document widths matched viewports. Navigation stays
  outside the form lane at intermediate widths; narrow forms scroll within the
  existing modal. Labels, path hints and cancellation remain reachable.

The organization-creation form's entry, input, enabled submit state and return
paths were verified; this run did not create a new organization or claim new
organization provisioning acceptance. Hosted verification of this candidate
remains separate. Dashboard type checks, lint and production build completed as
code hygiene. No fixture outcome is used as evidence.

## Combined member and organization changes

After merging both Settings repairs at `60b634b8`, the actual local dashboard
connected to the staging API retained one Settings dialog for workspace creation,
organization creation and member invitation. Workspace creation focused its name
field. Escape from each secondary view returned focus to its corresponding
Create workspace, Create organization or Invite member trigger while retaining
Settings; a second Escape closed Settings. The member invitation was visually
inspected at 390px, with document width also 390px and no horizontal overflow.
No new business records were created in this merge verification. The temporary
loopback session cookie was removed afterward. Dashboard type/lint checks and
production build completed on the combined source. This supplements the separate
mutation/readback records above and in the member verification record; hosted
candidate deployment and acceptance remain outstanding.
