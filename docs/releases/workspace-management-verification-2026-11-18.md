# Workspace management verification — 2026-11-18

Tracking: `niu-nrcn.3` (SETTINGS-03).
Hosted core: `fd1ec05d5e095684b7c55d2ce25be6c1c95b40ba`.
This is current-input prequalification, not final 0.3.1 acceptance.
Fixture outcomes were not used.

## Actual creation, cancellation and persistence

An authenticated ordinary-user session opened Settings from the account menu,
then Organization and Create workspace. Creation stayed inside the existing
Settings dialog. A new Chinese name produced the lowercase pinyin suggestion
`fa-bu-yan-shou-20261118-1048`. An initial observation incorrectly waited for
unseparated `fabu`; the actual suggestion was inspected afterward. That observer
timeout is not a product defect.

After explicitly editing the slug to `release-settings-20261118-1048`, changing
the name preserved that slug. At 390px, the document remained 390px wide and
there was exactly one dialog. The form scrolled inside it. Escape returned to
Organization and restored focus to Create workspace.

A fresh creation used the Chinese name and explicit slug, with the optional
spending limit left empty. The browser reached the new readable workspace URL.
Independent workspace-list readback returned 200. Workspace Settings opened a
named rename dialog; saving an English display name returned to the read view
and restored focus to Rename workspace. A separate workspace-list response
confirmed the new name with the original slug. Reloading the original settings
URL retained both values.

## Deletion and cleanup

The empty workspace's Delete action opened a separate named confirmation dialog.
At 390px, the long name wrapped, the confirmation input and both actions remained
visible, and the background page stayed behind the modal. Entering a wrong name
kept deletion disabled. Escape dismissed the dialog and restored focus to Delete.
Reopening it and entering the exact current name deleted the workspace and
returned to the existing default workspace. Independent list readback returned
200 and contained no workspace with the test slug.

No spending limit, inference, API key or invitation was created in this workspace.
Browser logout returned 204, Login loaded, retained login material was removed,
and the verification browser closed.

## Bounded interaction and visual review

Criteria from the ux-review skill:
[WAI-ARIA modal dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
for naming, dismissal and focus;
[NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
for feedback, control and error prevention. Niu additionally requires in-dialog
secondary flows, readable stable URLs and preservation of edited slugs.

The actual desktop creation view separated identity fields, optional spending
limits and submit/cancel actions within Settings. The 390px view preserved that
order with a scrollable body. The 1024px settings view was inspected with expanded
navigation during loading and collapsed navigation after settling: identity,
limit state and destructive action remained distinct, and the content used the
available lane. The loading screenshot is not evidence of settled limit state.
The narrow delete dialog kept its input and consequences legible with an exact-name
guard. Screenshots were inspected independently of backend readback.

This is not comprehensive visual or accessibility acceptance. No new mature-product
reference was inspected and no layout change was made. Member invitations, role
changes, owner boundaries, an English-language UI run and final candidate-wide
acceptance remain outside this record. Current work state remains in Beads.
