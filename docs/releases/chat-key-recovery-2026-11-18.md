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

## Current-input send and write-trace follow-up

A native gateway built from candidate `e97aea05`, backed by a fresh PostgreSQL
installation, forwarded actual browser requests to the hosted DeepSeek route
through a temporary model-limited credential. The upstream credential had a
zero-USD spending cap and independently inspected zero customer rates. The local
Provider route remained visibly unverified in the model picker; the operator
explicitly selected the known configured route. No capability claim was added.

An earlier one-key run returned its expected response but left a settled draft
without `keyId`. It is retained as adverse evidence; a later successful run does
not explain that observation. A separate fresh installation recorded each real
draft write with a read-only audit trigger. Actual sends with two available keys
and then one available key retained the chosen key and replies on query-free
revisits. The trace nevertheless exposed a narrower initialization failure:
opening a new generation wrote an empty selection before writing the saved key
back. The new-action flush could observe state before URL-key resolution.

The follow-up repair initializes the key independently of whether a conversation
or new-generation route is opening, and restores the authoritative saved key
while resolving an explicit URL selection. On the actual updated dashboard,
opening another new generation wrote the chosen key directly. All subsequent
observed writes retained it. A current prompt produced the exact response
`STABLE_CHAT_KEY_20261118_0352`; independent backend inspection found a complete
result with 46 input and 42 output tokens. A fresh tab opened the canonical URL
without a key parameter and restored both the response and the selected key.
This checks new page memory, not a separate browser profile.

Four local attempts were independently inspected: three completed and one was
cancelled before output during a concurrent development build. The latter is
not successful-invocation evidence and is retained as `may_have_executed` locally.
The upstream inventory contained exactly three completed requests. The final
successful send ran after the build finished. Local owner-funded results retained
null customer charges rather than substituting upstream expenses. The temporary
keys were revoked and the active credentials independently returned HTTP 401.

The updated page was inspected at desktop and measured 390-pixel width with a
390-pixel document. Revoking the chosen key and reloading displayed explicit
invalid-key recovery. The task-created local session cookie was removed.
Dashboard SDK compilation, route type generation, TypeScript and lint completed;
no fixture outcome contributes evidence.

## Scope still requiring verification

The earlier settled missing-key observation has no proven causal attribution.
The write-trace repair and later successful runs narrow the issue but do not erase
it. Exact merged hosted acceptance must cover initial send, reload, query-free
revisit, new generation and revoked-key recovery before this bead is closed.
A separate browser profile remains outside the local verification above.

## Exact merged hosted follow-up

Core `3f949559156ff2499a900e6890b3e29ed6ed4dde` was deployed to staging.
Two fresh one-hour keys were restricted to the configured DeepSeek route, each
with a zero-USD Niu spending limit. Independent model discovery showed zero
customer input/output rates. The browser explicitly selected the second key and
sent a fresh prompt. The saved result contains exactly
`HOSTED_CHAT_KEY_20261118_0430`, with 47 input and 31 output tokens, a completed
outcome and zero customer charge. Independent key-scoped inventory contains one
request for the selected key and none for the alternate.

An independent owner-scoped draft read after completion matched the selected
key at revision 174. Reload restored the same key and response. A fresh tab
opened the canonical URL without a key query and restored both. Starting a new
generation saved a null session and the same key at revision 175. These checks
use fresh page memory in the existing authenticated browser, not a separate
browser profile.

The selected key was revoked while the alternate and existing workspace keys
remained available. Reload displayed the localized invalid-key recovery notice
and no replacement selection. Explicitly selecting the alternate updated the
backend draft; another query-free revisit restored that choice and the saved
reply. Both temporary credentials were then revoked and independently denied
with HTTP 401. Their credentials were removed from the local evidence files.

The rendered desktop response and narrow key dialog/menu were inspected. At
390 CSS pixels the document was 390 pixels wide, and the dialog and menu stayed
inside the viewport. The settled menu retained normal text alignment; the
selected menu capture showed the check on the right. Escape dismissed the menu,
and completing an available-key selection restored focus to its trigger.
After final cleanup revoked the alternate too, the dialog correctly had no
valid selection and disabled completion; Escape still dismissed it and restored
focus. The source-backed Operate criteria in the UX review skill—explicit
recovery, stable choices and legible state—are met for this bounded journey.
Separate-browser-profile acceptance remains outside this run. The earlier
native settled omission remains preserved above without an invented cause.
