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

## Corrected local end-to-end verification

The production dashboard build containing the scoped repairs was served by an actual native 0.3.1 gateway with an isolated PostgreSQL database. A real member password session owned a fresh workspace and a separately provisioned viewer. No mocked API or fixture result was used.

In English, the reviewer created a new invitation, hid its one-time link, and opened its actions. Cancel invitation remained available across an observed subsequent real `/healthz` resource completion, covering the refresh that previously unmounted the row. The reviewer opened cancellation and confirmed it at 390 CSS pixels. There was exactly one Settings dialog; independent API readback recorded the invitation as `canceled`. The cancellation screenshot was inspected and showed the recipient, consequence, cancel action and keep action without horizontal page overflow.

In Chinese, an actual viewer-to-admin change displayed “管理员” in the saved badge and selected control and “角色已保存。” in feedback. Independent member readback confirmed `admin`. The open role menu was inspected after its animation settled at 390 pixels: all role choices remained legible and the selected item had a right-hand check. A separate authorized API call then changed that same member back to viewer while the detail view retained its old state. Saving from the old state produced the localized conflict message, disabled further saving, and required reloading. Reload displayed the localized saved-role recovery feedback.

After switching to English, the reviewer changed the member to Admin again and observed “Role saved.” The session Revoke and Confirm revoke actions removed the active session; Show past sessions displayed its revoked state. A full document reload retained Admin and no active sessions. An independent request with the original credential returned 401. The initially expected literal Revoked row was absent because past sessions are collapsed by default; that observer mismatch was resolved by using the visible Show past sessions control, not treated as a defect.

Desktop English/Chinese role views, settled narrow Chinese menu and narrow English cancellation were visually inspected. Existing shared menu/dialog primitives and Niu layout were preserved. The scoped review checks meaningful role language and recoverable feedback (NN/g usability heuristics), and one-dialog naming/interaction (WAI-ARIA modal dialog guidance). These observations are not a full accessibility or all-width certification.

Dashboard type checking, lint and production build completed. Browser logout returned 204 and Login loaded. Temporary members were revoked, the original viewer token independently returned 401, and SQL recorded zero dispatched inference attempts. Gateway and database processes stopped. This establishes the local corrected workflows; hosted acceptance on the integrated release revision remains outstanding for both findings and SETTINGS-03.
