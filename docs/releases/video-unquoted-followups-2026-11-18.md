# Unquoted owner-funded Video follow-ups — 2026-11-18

Tracking: `niu-qycy`, related qualification `niu-pfsr` and gate `niu-nrcn.5`.

## Actual failure and correction

On source `01376115`, the saved-session composer offered Seedance 2 Mini but
required a successful estimate before submitting. With current staging data, a
new prompt and a three-second duration, Generate displayed “No effective video
output estimator is configured” and offered no continuation. This differs from
the existing full composer, which supports explicitly confirmed owner-funded
requests without an output estimate.

The correction reuses that composer's installed Dialog, existing translated
warning and consequence text. Confirmation is bound to the actor, workspace,
session, key selection, model, prompt, controls and references. A synchronous lock
prevents concurrent clicks while submission is pending. Models with configured
estimates still require their existing preflight. This does not add an estimator,
claim zero upstream expense, or qualify the Provider.

## Current-input inspection

The local Dashboard used the actual staging backend. A fresh page restored the
saved prompt/model and showed the fee warning. Generate opened confirmation;
Cancel and Escape both retained the prompt and returned focus to Generate.
Backend draft readback returned HTTP 200. Two independent reads surrounding the
cancel/dismiss sequence returned the same three existing requests for the chosen
key. No confirmation submit was activated in this inspection. The test draft was
cleared with its current revision (HTTP 200), and the browser session was logged
out (HTTP 204).

The full composer was also opened with the retained draft. Its existing warning,
confirmation and cancellation were inspected directly as the sibling reference.
The prior mature-product reference remains the OpenRouter Chat inspection recorded
in the follow-up draft review; this correction adds no new layout pattern.

## Bounded UX review

Criteria: the ux-review skill's source-backed [WAI-ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
for naming, dismissal and focus return; [NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
for consistency, user control and recovery. Niu requires installed shadcn dialogs,
bounded scrollable content and existing theme tokens.

| State | Observation |
| --- | --- |
| Desktop, history open | Centered dialog separates the consequence, selected model and two actions; the brand-colored submit is distinct from Cancel. The saved result remains visible beneath the overlay. |
| 1024 × 900, history open | Approximately 512px-wide dialog remains within the viewport; heading, description, model and footer stay grouped without clipping. |
| 390 × 844 | Document width is 390px. The dialog is about 350px wide; title wraps, consequence text remains readable, and both stacked actions are visible. |
| Cancel and Escape | Dialog dismisses, prompt remains, focus returns to Generate. |
| Full composer reference | Same consequence text and action hierarchy; the saved-session correction uses the readable model title. |

These are bounded functional and visual observations, not a complete accessibility
or Provider qualification claim. Screenshots and backend receipts remain in the
private verification archive.

## Evidence limits

Actual confirmation dispatch, changed-authority rejection, independent final
media inspection and exact hosted-candidate acceptance remain unverified for this
correction. Existing Wan artifacts do not qualify Seedance. Fixture results are
not evidence. Current work status and next actions remain in Beads.

## Actual authority loss and recovery

A new 15-minute key restricted to Seedance 2 Mini was selected for a fresh
three-second, 480p, 16:9 draft. The key was revoked after opening confirmation
(HTTP 204). Confirming produced no generation: independent request inventory
returned HTTP 200 with zero rows. A transient dialog observation displayed the
changed-access warning, but the settled page showed the raw bearer-token error;
this is server rejection evidence, not proof of immediate client invalidation.

The settled recovery error exposed a sibling gap: the revoked key stayed in the
picker. The correction invalidates the workspace key-directory cache and reloads
it when the SDK operation returns HTTP 401. Repeating the actual revoked-key
attempt showed the active-key guidance and removed that key from the menu.
Choosing an existing active key retained the exact prompt and the three-second,
16:9, 480p controls. Backend draft readback returned HTTP 200, and request
inventory for the revoked key still had zero rows. The narrow settings panel was
visually inspected with the preserved values visible. No paid submission occurred.

The test key independently returned HTTP 401 after revocation, its locally retained
token was removed, the matching test draft was cleared with revision protection
(HTTP 200), and browser logout returned HTTP 204. Successful confirmed dispatch,
ambiguous-outcome recovery, final media and hosted-candidate acceptance remain
outside this evidence; the issue stays open.

## Hosted cancellation and authority loss

On hosted core `fd1ec05d5e095684b7c55d2ce25be6c1c95b40ba`, a fresh
credential restricted to Seedance 2 Mini opened the saved-session unquoted
confirmation with a current verification prompt. The fee warning and consequence
text were present. Desktop and 390px screenshots were inspected. Escape and
keyboard Cancel each preserved the prompt and returned focus to Generate.

Browser history navigation left the confirmation and then returned to the same
request; the browser restored that confirmation. The subsequent attempt to click
the underlying Generate action was correctly blocked by its modal overlay. This
is not evidence of changed-request invalidation: the restored request identity
was unchanged. An initial selector omitted the required dialog name and failed
before observation; a fresh snapshot supplied the actual dialog target.

While confirmation remained open, actual credential revocation returned 204 and
direct reuse returned 401. Confirming then created no inference request; an
independent scoped inventory remained empty. After asynchronous recovery settled,
the page asked for a valid API key and omitted the revoked key from the menu.
Explicitly selecting an active key restored the exact prompt, Seedance model,
five-second duration, 16:9 ratio and 480p; the backend draft matched at revision
97. Revision-checked cleanup and independent readback returned an empty draft at
revision 98; browser logout returned 204 and Login loaded. No Provider request
was submitted and this does not qualify Seedance execution.

This adds exact hosted cancellation, focus-return and changed-authority rejection
evidence to the successful hosted unquoted Wan dispatch/artifact record in
`hosted-video-recovery-2026-11-18.md`. Changed request-context invalidation remains
a distinct evidence limit, so `niu-qycy` stays open. Fixture outcomes were not used.

## Changed-session navigation and a new prompt

A further current-input check on hosted `fd1ec05d` used the actual generation
history link from a Chat session to the saved Video session. A fresh restricted
key and a teal-cube prompt opened the unquoted confirmation. Native browser
history back changed the active session to Chat and removed the dialog. Forward
returned to Video, restoring the exact prompt and selected key without restoring
the old confirmation. Changing the prompt to a violet pyramid and activating
Generate opened a new confirmation; Escape cancelled it. The Chinese dialog was
visually inspected with its consequence, model and distinct actions visible.

Independent backend draft readback at revision 100 matched the changed prompt
and selected key. The scoped request inventory contained no inference requests.
Revision-checked cleanup and readback returned an empty draft at revision 101;
credential revocation returned 204 and direct reuse returned 401. The retained
token and login material were removed, browser logout returned 204, and Login
loaded before the verification browser closed. No Provider inference occurred.

This establishes the actual cross-session navigation and changed-prompt path.
It does not establish every concurrent context mutation or final 0.3.1 candidate
acceptance. No component state or browser visibility property was fabricated.
The earlier full-document history observation remains valid for its different,
unchanged-request path. Current execution state remains in Beads.
