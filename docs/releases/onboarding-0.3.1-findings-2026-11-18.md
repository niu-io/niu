# Current onboarding findings — 2026-11-18

Tracking: `niu-nrcn.2`, `niu-y5ig`, `niu-lsh6`.
Observed hosted core: `18178194c24f1ea932165ee53a72cdc45f49207d`.
Composition: `a9880be3ddb19024ec26cbba0b71e25b63900d64`.

## Current-input journey

An unauthenticated browser followed the actual model catalog, DeepSeek detail,
documentation overview and manual quickstart, then the console login. This used
an existing ordinary test member; new-account registration is not established.
The documentation correctly labels manual keys as a fallback to agent connection.
The model page exposes both generation and key acquisition links.

The member created a new workspace through the switcher. Its generated readable
slug appeared in the current workspace URL. The empty overview offered Agent
connection and the key → quickstart → request sequence. From that page, the member
created a new key restricted to the existing DeepSeek alias, with seven-day expiry
and zero customer spending cap. Keyboard End, ArrowUp and Enter selected the
intended model in the long menu. The creation handoff opened Generations with
that exact workspace and key; after loading, no key reselection was necessary.
Independent `/v1/key` and `/v1/models` reads returned 200 and only the granted alias.

The member set a 96-token output bound and submitted one prompt requesting an
exact current marker. The saved chat instead displayed `service_not_ready` with
an English instruction to contact the platform administrator in a Chinese UI.
No response text was returned. Independent scoped request inventory returned 200
with an empty list. A separate authorized platform read returned 200 with a null
procurement budget for this new workspace. Missing procurement configuration is
a diagnosis hypothesis consistent with the admission implementation, not yet a
proved sole cause. No automatic retry or permissive budget change occurred.
This does not satisfy first-successful-invocation acceptance.

## Confirmed documentation contradiction

The current English/Chinese manual quickstart said the secret was shown once and
could never be retrieved again. Deployment guidance repeated that statement and
said losing a rotation response necessarily required revocation and replacement.
The actual creation handoff stated that a key could be shown again. After leaving
that handoff, the member opened the key list, selected Show, and independently
compared the revealed secret with the originally issued value: they were identical.
The secret was then hidden. No secret value enters this record.

The repair updates both languages in those two guides: store secrets securely;
workspace write access can reveal recoverable secrets in the list or details;
older keys may require rotation; rotation immediately invalidates the old key;
reconcile a lost mutation response before issuing another mutation. Ordinary list
reads and mutation replay are not described as secret recovery mechanisms.
Source authorization confirms reveal requires workspace write permission. This
run did not exercise rotation or legacy-key recovery; those statements follow
the current implementation contract, not an observed rotation in this journey.

## Review criteria and limits

The UX review skill's source-backed criteria apply here:
[NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
cover consistency, meaningful feedback and recovery. The guide's unrecoverable-key
claim contradicts the observed product, and the failed first invocation prevents
the intended outcome. The generic administrator instruction does not establish
an actionable remedy for this member. Procurement details must remain confined
to administration; improving recovery must not expose them to customers.

A full desktop screenshot of the empty workspace was inspected: approximately
1353×1142 CSS pixels, 240-pixel navigation, content beginning near x272, connection
prompt above the three manual steps, and no clipped desktop action. This is a
bounded composition observation, not whole-product visual acceptance. An expanded
key dialog was also captured at 390 pixels with one dialog and document width390,
but its screenshot lacks sufficient settled-state evidence for a narrow-layout
pass. No responsive completion claim is made from that capture.

The failed-result screenshot was inspected separately: the error is prominent and
states no output, while usage and charges remain unknown. Snapshot ellipses showed
replacement characters in long catalog descriptions; independent DOM text contained
no replacement characters, so that tool truncation is not a product defect.
A documentation wait expected different localized wording and timed out; actual
navigation subsequently confirmed the correct page. No product failure is inferred
from that observer mismatch.

The member revoked the key through the confirmation dialog. The active list became
empty and independent direct reuse returned 401. Logout returned204 and Login
loaded. Temporary login and primary key files were removed and the browser closed.
The failed saved chat and its isolated workspace remain as audit evidence. Current
execution and remaining acceptance stay in Beads; no fixture outcome is evidence.
