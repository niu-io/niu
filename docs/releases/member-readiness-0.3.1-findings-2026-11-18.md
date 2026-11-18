# Member management findings — 2026-11-18

Tracking: `niu-nrcn.3`, `niu-3ib8`, `niu-g003`.
Observed hosted core: `18178194c24f1ea932165ee53a72cdc45f49207d`.
Fixture outcomes are not evidence.

An isolated organization, workspace, organization owner and workspace viewer were created through actual management APIs. The owner signed into the hosted browser with the temporary scoped credential, opened Settings and Members, and exercised the current workflow.

The Chinese invitation form remained within one Settings dialog at 390 CSS pixels, with document scroll width 390. Escape returned to the member list and restored focus to Invite member. A subsequent actual invitation creation for a reserved example-domain address succeeded, scoped to the test workspace with Viewer role. The UI explicitly explained that no email is sent. The one-time link was hidden without copying or sharing it. Independent owner invitation readback returned 200; the viewer's invitation and member-list reads returned 403.

Changing the test viewer to Admin through member details persisted successfully. Independent owner member-list readback confirmed the saved `admin` role. The existing scoped credential still could not list members or invitations (403). However, the Chinese detail badge and selected role said “管理后台”, while the choice menu correctly said “管理员”; success feedback remained “Role saved.” This is a confirmed role-label/localization defect (`niu-3ib8`), not evidence of broader privileges.

Clicking the pending invitation's action trigger repeatedly caused its row to disappear into a loading placeholder with a temporary zero count. No usable cancellation menu remained. Three current trigger observations and a final bounded five-second wait failed to expose Cancel invitation. The independent backend still held the pending invitation. This confirms a UI action failure (`niu-g003`); the invitation was subsequently cancelled through the authorized owner API and reread with no pending invitation. API cleanup does not establish successful UI cancellation.

Source diagnosis found that `refreshWorkspace` depended on the newly allocated gateway connection result object. Connection state renders therefore changed the callback identity; dependent member effects cleared/reloaded invitation rows. The proposed correction depends on the already-stable `check` function instead. Authority and scope dependencies remain intact. Actual corrected-browser verification remains required before resolving the finding.

The viewer's access was revoked and its original credential returned 401. Browser logout returned 204 and Login loaded; the temporary owner was also revoked and independently rejected with 401. No model inference, positive spending authorization or email was sent. The browser space was closed.

Visual observations are bounded to the inspected Chinese invitation form and member detail. The review applies the UX review skill's NN/g meaningful-language/error-recovery guidance and WAI-ARIA dialog focus guidance. English flow, corrected menu persistence, UI cancellation/revocation and full final-candidate settings acceptance are not established by this record.
