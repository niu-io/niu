# Video key recovery verification — 2026-11-18

Tracking: `niu-mm90.1`; final candidate acceptance: `niu-nrcn.5`.

## Trigger and correction

On live core `2ec290daa4525a3277c3e49dae46395674a9ac96`, opening a saved
video's **Edit request** and replacing its revoked key discarded the retained
prompt and changed the request into an empty new composer. Recovery now copies
retained input into the mutable composer, preserves user edits and the chosen
model, and does not modify or resubmit the historical intent.

Actual browser verification then exposed a second problem: the backend retained
720p, but reloading the composer displayed the 480p default. A late model-list
response used a stale model selection and reset restored controls. Restoration
now recognizes the explicit matching model and protects its restored parameters
from that late response. Changing credentials does not authorize a generation.

## Current-input evidence

The candidate was exercised through the real dashboard development server against
the actual staging API, from release core
`2a4dfb858fba5c94e8d3c466bf0e300ff5108313` with this correction. No fixture
outcome is used as evidence.

- Reopened the previously generated video, followed Edit request, and used the
  offered active key after the original key was revoked.
- The editable prompt retained its complete original text. Settings retained
  Wan, 3 seconds, 16:9 and 720p.
- Independently read the backend composer draft: retained content, revision 10,
  matching prompt/model and all three parameters. Reloaded the browser and
  reopened settings; all values still matched.
- Independently read the original saved intent: still dispatched, retained,
  associated with its original key, and carrying the original prompt and
  3-second/16:9/720p request. The recovered draft uses a different key.
- No generation was submitted during this verification. Existing video bytes
  downloaded through the live browser matched the independent original artifact:
  SHA-256 `c652ab8cc7e82e51705fac8376baa4d998229d460bbfb1905b2ef06698e67aba`.
- Dashboard type checking and lint ran on the final correction. These are source
  checks, not proof of runtime behavior.

## Interaction and visual review

Reviewed desktop 1440×900, intermediate 768×900 and narrow 390×844 layouts.
At desktop, the existing navigation/history occupy about 560 px; the composer
and work area use the remaining width. At 768 px, navigation is collapsed and
the composer spans the canvas with approximately 20 px side gutters. At 390 px,
the composer wraps its controls and the settings panel remains readable; document
width is 390 px with no horizontal overflow. The prompt and controls retain their
existing grouping and emphasis. No new layout or styling was introduced.

Escape dismisses settings and returns focus to **Additional settings**. Open
settings show the retained values, not merely a closed-state success indicator.
An intermediate animation screenshot was excluded; the settled state was
inspected separately.

The applicable criteria are input preservation and recovery from
[NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/),
and grouping and hierarchy from
[NN/g visual design principles](https://www.nngroup.com/articles/principles-visual-design/),
as used by the UX review skill. The actual anonymous
[OpenRouter editor](https://openrouter.ai/chat) retained an unsent prompt through
model selection; this supports the input-preservation pattern, not a claim that
its credential-recovery behavior was inspected. Its temporary draft was cleared
without sending a request.

## Evidence limits

This verifies the scoped correction against real backend data. It does not
establish hosted acceptance of this source revision, qualify missing video
estimates, or verify another Provider. Those remain in their existing tracked
acceptance scope. The temporary loopback session cookie was removed; the existing
staging browser session was preserved.
