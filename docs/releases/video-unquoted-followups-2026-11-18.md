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
