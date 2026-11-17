# Browser session recovery verification — 2026-11-18

Related Beads: `niu-k9q7`; follow-up composition persistence: `niu-s69p`.

## Observed defect and correction

An active hosted Video page retained its authenticated shell after its browser
session became invalid. Requests returned HTTP 401 and the page reported an
unavailable API key. Independent authentication with the selected inference key
returned HTTP 200. A manual reload reached the existing sign-in page, but ordinary
request failures did not invoke that recovery. A 401 alone does not distinguish
expiration from revocation.

Dashboard requests now share an authentication-failure observer, including SDK
requests. A same-origin 401 using the active dashboard credential starts one
session confirmation request. Only a confirmed session 401 clears the current
identity and invokes existing sign-in navigation. Revision and cancellation guards
prevent an obsolete confirmation from clearing a replacement identity. Responses,
streaming bodies, and mutations are not retried or consumed by the observer.
Network failures and non-authentication responses preserve the last identity.
The expiration explanation survives the automatic session-restoration attempt.

## Current-input verification

The local dashboard based on release `acb5863e`, with this correction, used the
actual staging backend and a task-created browser login. No response mocks or
fixture outcomes are evidence here.

- The selected video key authenticated successfully. Actual browser logout
  returned 204. Clicking Estimate subsequently reached sign-in automatically,
  with the session-expiration explanation; no full-page manual reload was needed.
- Keyboard sign-in returned to the original saved-run route, retaining its
  workspace, key and generation-mode query parameters.
- A fresh video composition was independently read from the backend at revision
  13 before a second actual session revocation. Reauthentication restored its
  exact prompt and original route. No video generation was submitted.
- After revoking the inference key, its direct authentication returned 401 while
  browser-session authentication remained 200. The dashboard retained its
  authenticated identity. A real 404 and a rejected network request through the
  shared transport also preserved the valid browser session.
- At 390 CSS pixels, the sign-in page measured 390 pixels of document width.
  Email received focus, Tab reached password, and Enter completed login. The
  expiration explanation and submit control were visible without horizontal
  clipping. The existing sign-in layout and Niu tokens were retained.

Type checks, static checks, and the dashboard production build were executed as
bounded source/build checks, not integrated acceptance evidence. Hosted acceptance
of this correction remains pending.

## UX judgment and limits

The existing sign-in flow supplies a recognizable recovery action, consistent
with NN/g error-recognition and recovery guidance. Keyboard focus and narrow
reflow were checked against the applicable WCAG 2.2 keyboard/reflow criteria;
this is not a complete accessibility audit. The actual OpenRouter Chat sign-in
interaction was inspected as a reference. Niu keeps its existing full-page sign-in
and return-route contract instead of adding another modal pattern.

A separate defect was discovered: follow-up prompts on saved video run/session
pages were only component state. That persistence gap remains tracked in
`niu-s69p`; the successful backend-draft recovery above applies to the fresh
composer. It does not establish that unsaved input survives authentication loss.
