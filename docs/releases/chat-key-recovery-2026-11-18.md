# Chat key recovery verification — 2026-11-18

Bead: `niu-jjvd`. Candidate base: release `373fbb41`. Hosted acceptance remains
pending; the following evidence is from the actual local candidate.

The hosted baseline saved a fresh Chat reply correctly but silently replaced the
explicitly selected key after reloading its canonical URL. The draft omitted the
key, and initial-send navigation dropped the query selection. This could change
permissions or spending controls on a later request.

The repair persists optional `keyId` in the owner-scoped backend draft, validates
workspace membership without requiring the key to remain active, restores that
selection, and preserves the query when opening the newly saved conversation.
A missing selected key requires explicit recovery instead of choosing another
available key. Legacy drafts remain readable; stored references grant no access.
SDK types, OpenAPI and generated reference documentation reflect the field.

## Actual checks

A freshly compiled native gateway with PostgreSQL accepted and independently
returned an exact current draft containing a selected workspace key. After key
revocation, saving the retained selection still succeeded. A different-workspace
key was rejected with HTTP 400, and an independent read confirmed the original
draft was unchanged. Both temporary credentials were revoked.

The actual dashboard connected to that gateway. Two additional temporary keys
were created. Through the installed key dialog/menu, the second key was selected.
Navigating to a URL without a key parameter restored that selection from the
backend. Revoking that key while leaving the first available, then reloading,
showed the invalid-key recovery notice and no replacement selection. Explicitly
choosing the first key removed the notice; another query-free navigation retained
it. Independent saved-draft reads matched both explicitly selected key identities.
The remaining temporary key and the task-created loopback session cookie were
removed afterward. No model generation was submitted in this verification.

The existing desktop dialog and menu were visually inspected. A capture measured
at 390 CSS pixels had a 390-pixel document width, a roughly 382-pixel dialog and a
menu contained within the viewport. The selected check remained on the right.
Escape dismissed the menu, and Done dismissed the dialog and restored focus to
the key trigger. This bounded Operate-surface review follows the ux-design and
ux-review requirements for preserved choice, explicit recovery and stable existing
controls. It does not establish complete responsive or accessibility coverage.

Rust compilation, dashboard SDK compilation, route type generation, TypeScript,
lint and contract generation completed. No fixture result is evidence.

## Scope still requiring verification

The local installation was configured for the isolated video-estimator review
and had no active text-model route. It proves draft/key recovery, not successful
text invocation with this candidate. The full send-to-saved-session transition,
independent fresh-browser recovery and exact merged hosted candidate must still
be exercised before the bead is closed. The prior hosted response-persistence
run is recorded separately and does not substitute for these checks.
