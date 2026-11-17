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
