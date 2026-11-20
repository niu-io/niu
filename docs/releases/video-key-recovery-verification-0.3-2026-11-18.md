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

The initial local run verified the scoped correction against real backend data.
The temporary loopback session cookie was removed; the existing staging browser
session was preserved. The hosted follow-up below supplies deployment evidence.
Neither run qualifies missing video estimates or another Provider.

## Hosted follow-up

On 2026-11-18, the deployment platform confirmed the immutable candidate using
core `9fd281e523cdbd521585a0a8f98d605d5d5a1073` live. Both health and readiness
returned HTTP 200. All 27 asset URLs referenced by the previous live dashboard
HTML remained HTTP 200 with identical independently calculated SHA-256 values.

The actual hosted saved video offered its revoked-key remedy. Selecting the
available key retained the entire prompt and Wan's 3-second, 16:9, 720p controls.
Reloading the page and reopening settings retained those values. Independent
backend reads confirmed draft revision 10 and the recovered key; the historical
intent's request, original/current key, revision 1, retained content and dispatched
state matched the predeployment evidence. The original intent and recovered draft
use different keys. No video generation was submitted.

The settled settings panel was visually inspected at 1440×900 and 390×844.
Controls remained legible and grouped, with no narrow horizontal overflow.
Escape returned focus to the settings trigger after its exit transition. An
intermediate 768-pixel observation confirmed retained prompt and document width,
but transition/loading captures were excluded from final visual evidence.
Reopening the original saved video retained its full prompt and distinguishable
history entry; its player reported readyState 4, duration 3.018005 seconds and no
media error.

This satisfies the scoped recovery acceptance for `niu-mm90.1`. The missing
output-estimator condition still displays an untranslated English alert in the
Chinese interface alongside the localized Provider-charge warning; that observed
gap remains with `niu-pfsr`. Final `VIDEO-03` acceptance remains separate.

## Exact hosted credential recovery acceptance

On hosted core `fd1ec05d5e095684b7c55d2ce25be6c1c95b40ba`, a fresh
model-limited credential was selected with the keyboard and a current copper-cube
verification draft was entered. Navigation persisted revision 93; an independent
backend read matched the prompt, key, Wan model and controls. Fresh navigation
restored the same draft before the credential was revoked.

Actual revocation returned 204 and direct credential reuse returned 401. The
member browser session remained usable. After reload, the header identified the
selected key as revoked and the composer explicitly said the API key had been
revoked, with an available-key action and a create-key link. It did not show
missing-video-route guidance. Desktop and 390px screenshots were inspected;
recovery actions remained readable and inside the viewport.

A replacement credential was created after that page had loaded. Opening the
key menu asynchronously discovered it. Keyboard Enter selected the new key;
the exact prompt remained, the composer and generation action became usable,
and the URL used the new key's readable slug rather than a UUID. Navigation
persisted revision 94 with the replacement key; independent backend inspection
matched it. Query-free fresh navigation restored the replacement and prompt,
without reverting to the revoked key. At 390px, the open menu fit the viewport
and its selection check appeared on the right. No claim is made about the
immediate Escape focus probe, which returned no accessible label before the
closing transition settled.

Both scoped request inventories were empty. The task draft was cleared only
after matching its current prompt, key and revision; independent readback was
empty at revision 95. The replacement key was revoked (204) and direct reuse
was denied (401). Final browser logout returned 204 and Login loaded. No
Estimate or Generate action was invoked. This completes `niu-do9r` together
with the documented earlier correction; fixture outcomes were disregarded.
