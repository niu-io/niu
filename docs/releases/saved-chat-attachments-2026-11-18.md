# Saved Chat attachment inspection — 2026-11-18

This dated record covers Bead `niu-xk3y`. It is a bounded UI verification, not
release acceptance. The starting release revision was
`3f949559156ff2499a900e6890b3e29ed6ed4dde`.

## Finding and correction

A current hosted image conversation retained its submitted PNG in backend
storage and JSON export, but reopening the conversation displayed only the user
prompt. The shared turn renderer also omitted text attachments. The correction
renders attachments with their owning user turn, including legacy single-turn
records, and opens a preview with a download action. It reads existing durable
records; it introduces no new storage or invocation behavior.

The inspected reference was [OpenRouter Chat](https://openrouter.ai/chat): an
attached image thumbnail opens an image preview, and a filename chip opens a
text preview. Both actual interactions were inspected with public, non-sensitive
files without sending a message. Niu uses its installed Button and Dialog
primitives, theme tokens, bounded dialog body, cancellation action and explicit
focus restoration. The reference's fullscreen presentation was adapted to Niu's
required dialog composition.

## Observed verification

The changed local dashboard used the actual hosted backend and saved sessions.
A newly completed hosted image request on core
`1a32fb9eef4828d8d81318b702dc0fef9cf9e7a7` was reopened through the changed view;
the original image and completed answer appeared together. Existing image and
text conversations were also reopened. Image and text previews opened through
the rendered controls, including keyboard Enter. Escape and the footer Close
action restored focus to the invoking attachment button.

Downloads were independently compared to their original files:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Public Niu mark PNG | 22,353 | `4ff254f73bd098c41eccaa9f78440592749bf6a44196f86d85851e874dbc8491` |
| Current-input text attachment | 113 | `6e053f438274b93d7d31846c7909490cd4a8bd372f36cc2197152b45d65fc8a3` |

Desktop screenshots were inspected for filename/thumbnail grouping and action
hierarchy. At a 1,024 px viewport, the chat surface measured 640 px with collapsed
workspace navigation and history open, 464 px with both expanded, and 784 px
with workspace navigation expanded and history closed. Document width stayed
1,024 px. The attachment remained readable and operable in each configuration.
At 390 px, the document width remained 390 px; the image preview was 390 × 520 px,
with the complete image and visible Download/Close actions. The text turn was
also inspected at this width. No attachment clipping or horizontal page overflow
was observed. Screenshots and raw artifacts remain outside the public tree.

These observations satisfy the applicable UX-review recognition/revisit criteria
([NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/))
and provide bounded keyboard, focus and reflow evidence for the changed controls
([WCAG 2.2](https://www.w3.org/TR/WCAG22/)). They are expert inspection, not a user
study or a full accessibility conformance claim. Niu's installed-component,
durable-data and focus-restoration requirements were reviewed separately.

Dashboard type generation, TypeScript checking, lint and production build
completed. No fixture-test result is evidence for this assessment. Hosted
acceptance of the UI's eventual merged revision remains required; the local
browser run does not establish deployment of this change. Task-created sessions
and the image invocation key were revoked after inspection.

## Integrated hosted acceptance

Release commit `acb5863ecc2e32daa1023d2c229bbe882389ed68` was deployed through
composition `ec6946eea91a006a5632d0bda77b38c26d549497`. The actual Chinese-language
saved image and text turns displayed their attachment controls. Image preview
was inspected at desktop and 390-pixel widths; the narrow page had no horizontal
overflow and both download and close actions remained reachable. The image
loaded at its original 512-pixel intrinsic width. The desktop text preview
showed the original verification content in a readable preformatted block.

Browser downloads independently matched the original PNG (22,353 bytes,
SHA-256 `4ff254f73bd098c41eccaa9f78440592749bf6a44196f86d85851e874dbc8491`)
and text (113 bytes, SHA-256
`6e053f438274b93d7d31846c7909490cd4a8bd372f36cc2197152b45d65fc8a3`).
Keyboard Enter opened the text preview. After Escape and completion of the
closing transition, focus returned to the owning attachment button for both
image and text. Immediate animation-frame focus samples were not used as a
settled-state result. Combined with the equivalent-source intermediate-width
inspection above, this completes the scoped attachment acceptance.
