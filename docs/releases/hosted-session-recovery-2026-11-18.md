# Hosted session recovery — 2026-11-18

Tracking: `niu-k9q7`; durable draft work `niu-s69p`.
Hosted public core: `c2d3634e404504bd2d6bd453df177ee4370d888c`.

A real member browser opened its existing saved Video session. The backend draft
was initially empty at revision 67. A new harmless diagnostic prompt was entered
through the composer and independently read back at revision 68. No generation
was submitted. An actual browser-session logout returned HTTP 204 without clearing
the mounted page. Clicking Refresh session then automatically reached Login with
the localized expired/revoked-session message; no manual page reload was needed.

A separate restricted inference credential still returned HTTP 200 from models,
so the recovery was not caused by an invalid inference key. At 390×844, keyboard
Enter submitted the ordinary login form and returned to the same saved session.
The complete backend draft payload remained identical at revision 68. A settled
screenshot showed the restored prompt and model controls beside the existing
playable result, without horizontal overflow.

For the negative case, the temporary inference credential was revoked (HTTP 204).
A browser fetch using it returned HTTP 401 while the member-session endpoint
returned HTTP 200 and the page stayed on the saved session. This qualifies the
actual credential distinction, not every possible API failure. The separate
current preview verification also observed transient gateway failure followed by
automatic page recovery without an authentication reset.

Cleanup cleared only the diagnostic draft using its expected revision. Independent
readback found an empty payload at revision 69. Browser logout returned HTTP 204
and the next navigation reached Login. The temporary key plaintext and login
material were removed. No generation, payment or user data deletion occurred.

The existing login/result hierarchy was retained. Against the ux-review skill's
[NN/g feedback and recovery criteria](https://www.nngroup.com/articles/ten-usability-heuristics/),
the failure names the session, supplies the ordinary sign-in action and preserves
work. Both the 390px login and settled result screenshots were visually inspected;
the alert, inputs and submit action are readable and the restored composer remains
accessible. This record completes the scoped hosted session-recovery acceptance;
it does not certify all release workflows or resolve the separate database issue.
Fixture outcomes were disregarded.
