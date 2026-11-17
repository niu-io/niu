# Video follow-up draft recovery — 2026-11-18

This dated verification covers `niu-s69p` and `niu-woo7`, using the changed
Dashboard descended from `23bcfe13` against the actual staging backend. It is
not final release or hosted-candidate acceptance. Fixture outcomes are not
acceptance evidence.

## Behavior and scope

Saved Video sessions and legacy run pages now retain their follow-up composition
through the existing actor-private workspace draft API. Opening a different
session does not consume or overwrite the retained draft. Explicit editing can
replace the workspace's one mutable draft; this is not a separate draft per
conversation. Revision checks protect concurrent edits, and navigation waits for
a confirmed save or offers the existing stay/leave recovery dialog.

The saved-session composer uses the existing full Video composer's key selection
and settings patterns. Initial draft loading disables editing until context is
restored; a failed read remains visible with explicit recovery. Typed retained
materials are preserved. The full composer reviews them before submission.
Images remain visible and removable even when the selected model no longer
supports their use. Removing a reference does not delete the library asset.

## Current-input persistence and recovery

- Entered a new follow-up prompt in an actual saved session, selected an active
  temporary key and two-second, portrait, 480p controls. Immediate navigation to
  Usage persisted revision 32. Independent backend reads matched all fields;
  returning restored the prompt and context.
- Opening an unrelated legacy run left that revision and payload unchanged.
  Explicitly editing the legacy run's follow-up then navigating persisted
  revision 33, with its own prompt and no inherited session binding.
- Revoked the task's actual browser session (HTTP 204). Estimate triggered the
  login recovery flow. Keyboard reauthentication returned to the legacy run and
  restored its confirmed draft. A mistaken development-helper DELETE returned
  405 and was not treated as session revocation evidence.
- Uploaded the real 22,353-byte PNG used in the attachment verification. Saved a
  typed workspace-image reference through the actual draft API. Reopening the
  saved session retained it; its review link opened the full composer. The
  currently configured model did not support images, so submission stayed
  disabled. The repaired view showed the decoded 512×512 preview and filename.
- Keyboard removal persisted an empty reference list while retaining the prompt;
  an independent asset read still returned HTTP 200. Reattaching through the API
  and reloading retained the same source image and unsupported-model boundary.
- A second actual API client advanced the draft revision while the first page
  remained open. The first page's edit could not overwrite it. Navigation opened
  “Draft not saved”; Stay preserved the local prompt and restored textarea focus.
  Load saved draft explicitly restored the second client's prompt and references.
- An installation-administrator principal read an empty independent draft,
  without the member's prompt. Another workspace also returned an independent
  draft. Attempts to save the original workspace's context there were denied
  HTTP 401 and left the target unchanged; the member session remained HTTP 200.
  The initial probe expected 400, so its local assertion failed; the actual 401
  denial and unchanged records are the evidence, not the assertion outcome.

The submission preflight also caught an initial-read race: entering text before
restoration completed retained the text but used a default key. No generation
was submitted in that failed preflight. The correction gates initial editing
until the saved context is available, rather than silently selecting a different
credential.

## Interaction and visual review

The reference is the actually inspected [OpenRouter Chat](https://openrouter.ai/chat)
attachment/composer flow, alongside Niu's existing Video settings and key picker.
The implementation reuses installed shadcn primitives and Niu tokens. Review
criteria distinguish Niu requirements from [NN/g consistency and recovery
heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) and the
[WAI dialog keyboard/focus pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
This bounded inspection is not a complete accessibility audit.

| Control | Actual action and observed result |
| --- | --- |
| API key menu | Selected the temporary active key; narrow menu fit the viewport, showed its selected check on the right, and Escape returned focus to the trigger. |
| Settings | Opened existing settings popover; edited duration and aspect ratio, preserved values through save and revisit. |
| Retained reference | Followed review link, inspected actual preview/name, removed with keyboard, independently verified draft and library ownership. |
| Conflict dialog | Stay retained local input and restored textarea focus; explicit Load saved draft adopted the other revision. |
| Generate | Unsupported saved images kept submission disabled. The one actual paid follow-up submission is recorded below. |

At 390×844, the retained-image composer occupied 390×317 CSS pixels with the
filename, removal action, prompt, capability error and generation controls in a
single readable hierarchy. Unavailable upload actions were omitted for a model
that cannot accept images. The document measured 390 pixels; the image and remove
action remained visible. The conflict dialog fit with 16-pixel side gutters and
separated the primary Stay action from leaving without saving.

At 1024×900 with history open, the saved-session composer occupied 640×202 pixels;
its action lane was approximately 551×38 pixels and the open settings panel was
360 pixels wide. The video result remained the primary reading surface, while
settings and the composer used the existing hierarchy. An observed header
regression placed actions as far as x=633 in a 390-pixel viewport. Applying the
shared responsive key-trigger treatment and an accessible refresh icon corrected
it: all visible header controls ended at or before x=374, without hiding access
to session history or the actions menu. Settled screenshots were inspected
separately from animation frames.

TypeScript, new-string localization, stylesheet and lint checks are bounded
source hygiene checks, not integrated-behavior evidence. Final hosted deployment
acceptance remains separate from these local-Dashboard/staging-backend results.

## Actual follow-up generation and final artifact

After the initial-read correction, a fresh page first exposed a disabled prompt
and “Loading saved draft…”, then restored the explicitly selected active key.
An immediate subsequent edit and navigation retained that key. An independent
backend preflight confirmed the prompt, key, two-second duration, 480p, 16:9 and
empty references before a single Generate click.

The existing session gained exactly one turn and `run-1112` (`input-1003`).
The actual observed states were `unknown`, `running`, then `succeeded`; no manual
Provider refresh or repeated submission was used. The backend draft became
empty at revision 43. The browser rendered the new purple-cube result and cleared
its input. Independent API and browser downloads were byte-identical:

- 733,480 bytes; SHA-256
  `8959badecb0becd83c658ab68162f0edc5bbfe8c97f6e9ce723263dc322d5cb7`.
- H.264 video, 854×480, 30 fps, AAC audio, 2.020000 seconds.
- Full-file FFmpeg decode completed without an error; a decoded frame was
  inspected and showed the requested purple cube. Browser playback metadata
  independently reported 854×480, 2.02 seconds, ready state 4 and no media error.
- Billing remained `owner_funded`; missing customer charge, price and usage were
  not interpreted as zero upstream cost.

The retained PNG download separately matched its original 22,353 bytes and
SHA-256 `4ff254f73bd098c41eccaa9f78440592749bf6a44196f86d85851e874dbc8491`.
The temporary key had exactly one persisted inference request. Revocation returned
204 and independent reuse returned 401. After the draft was confirmed empty, the
test library image was deleted (204), and the task browser session logged out
(204). The production Dashboard build also completed; that is packaging evidence,
not a substitute for the actual flow above.

## Header restoration and compatible key changes

A subsequent current-input check found the prompt disabled during initial draft
loading while its parent key picker remained enabled. A natural-network key
selection retained the prompt, so that attempt did not establish data loss.
A 1,500 ms network-latency observation timed out before the control appeared;
it made no selection, and normal network conditions were restored. No synthetic
response or fixture was used as acceptance evidence.

The header now shares the composer's readiness state: initial draft restoration,
model loading and active submission disable key changes. Actual fresh-page
observation showed both prompt and key picker disabled with “Loading saved
draft…”, followed by the original prompt and selected key before editing became
available. The radio callback also rejects changes while the header is not ready.

The same walkthrough exposed an actual compatible-key reset: switching between
keys that both offered the same Wan model changed two seconds/9:16 to the
three-second/16:9 defaults. Cached and refreshed model discovery now preserve the
current controls when the selected model remains available. Explicit model
changes still initialize that model's controls.

The repaired current-input switch, immediate navigation, independent backend
read and revisit retained the exact prompt, requested key, Wan model and
`duration=2`, `ratio=9:16`, `resolution=480p` at revision 50. The settings popover
was inspected at 390×844; document width remained 390 and the retained controls
were visible and usable. This check submitted no video. Its marker draft was
cleared with the matching revision, and the task browser session was revoked.
