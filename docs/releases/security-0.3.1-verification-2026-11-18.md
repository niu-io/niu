# 0.3.1 independent-actor security verification — 2026-11-18

Acceptance case: `niu-nrcn.8` (SECURITY-03). Related commercial projections:
`niu-nrcn.7`. Core `18178194c24f1ea932165ee53a72cdc45f49207d`, website
`8d3f49200f0d99d27dd39e17d71b904ee3b34108`, composition
`a9880be3ddb19024ec26cbba0b71e25b63900d64`.
The exact composition was live before and after these current-input operations.
Fixture outcomes were not used.

## Independent identity and mutation boundaries

Two fresh organizations and workspaces received three independently issued,
expiring owner identities: two in the first workspace and one in the second.
Each workspace-scoped owner's list contained only its authorized workspace.
A fresh personal Chat draft was saved by the first owner. The foreign actor's
read and mutation each returned 403; independent authorized readback preserved
the exact prompt and settings. The other owner in the same workspace had an
empty personal draft. Foreign key listing and workspace rename returned 404;
the foreign owner's independent read retained the original name.

An inference key could not read the administration session (401) or use
undelegated routing (403). Demoting an owner to viewer changed the authority of
its unchanged token immediately: personal draft read remained 200, while key
creation and workspace rename returned 403. A stale role comparison returned
409. Operator revocation returned 204, then the original token returned 401;
the independent remaining owner still returned 200. That owner independently
confirmed the exact one-key inventory and unchanged workspace name after the
denied writes.

All temporary inference keys and operator credentials were revoked, and direct
reuse was denied with 401. Two workspaces retained their audit records: deletion
returned 409. Cleanup did not bypass retention or directly delete database rows.

## Existing-model grant enforcement

Current configured-model discovery confirmed the requested DeepSeek alias and a
Conatus alias. A fresh key granted only the latter and received a zero customer
spending cap. Independent key inspection confirmed its exact model grant.
A current request for the existing DeepSeek model returned 404
`not_found_error`, matching the admission contract's concealed out-of-grant model
response. Independent key-scoped request inventory was empty. The key was revoked
with 204, direct reuse returned 401, and its retained token was removed.

## Browser-authorized client and revocation

The actual packaged login command initiated a fresh connection against staging.
Its verification code matched the browser. The Chinese approval view selected
Default, a 15-minute duration and no model invocation. The 390px rendered view
was inspected; document width remained 390px. The approved result explicitly
reported discovery-only authority. The client completed its real key/model
connection checks and privately saved the credential.

Independent `/v1/key` inspection returned `invocation_allowed=false`. An actual
Chat invocation attempt returned 403, with zero requests in the independent
issued-key inventory. The issued key was then revoked through its real API Keys
menu and confirmation dialog. It disappeared from the active list and direct
reuse returned 401. The credential file was removed. Browser logout returned
204, Login loaded, retained login material was removed and the browser closed.

An observer initially waited for a different success phrase and timed out. The
actual page said that authorization was approved, and the command and independent
grant reads confirmed completion. Authorization was not submitted again.
This verifies the current backend device authority contract, not publication or
full host qualification of the development client bundle; CLIENT-03 and DIST-03
remain separate cases.

## Populated customer projections and actual export

A new ordinary organization owner read the retained isolated billing scope on
this candidate. Billing, balance, transactions and requests returned 200. The
inspected nested fields contained no procurement rates, upstream expenses,
platform margins or stored credential fields. Procurement administration,
commercial position, platform financial summary and platform pricing each
returned 403 to this customer identity.

The scope contains two historical actual calls: an earlier text request and a
later image request. An initial observer assumed only the first existed and
stopped at that outdated expectation; its actor was revoked and denied with 401.
The two request identities were then independently reconciled against their
original invocation records. The five current ledger amounts sum to 998,192
nanounits, matching the current balance. No new inference or credit adjustment
was performed for this inspection.

A fresh customer CSV download returned 200, 907 bytes and two rows. SHA-256:
`6bd8bb04121efb82a41faf19822cf7618d67e5219c56b9138af4815088e44a7b`.
Each row's input/output token counts and customer charge matched current request
readback; total customer charge was 20,000 nanounits. Headers describe customer
charges and request outcomes, with no procurement or margin columns. The fresh
owner was revoked and its original token returned 401.

## Acceptance boundary

This completes SECURITY-03's defined independent-actor, data/mutation, restricted
model/operation, device authorization and live role/credential revocation scope
for the pinned candidate, with independent saved-data and artifact checks.
It is not an exhaustive penetration test or overall release acceptance.
Reading retained billing records does not establish a new positive-charge
invocation on 0.3.1, real merchant settlement or the remaining BILLING-03 scope.
Database reliability and all other release cases retain their own requirements.

## Integrated candidate revalidation

On 2026-11-18, fresh current-input checks ran against core `c3008ded8df5d2b9fcde1f3edd21f6986f463b22`, composition `3450d3192af01a8d6ec6768b75c040afcb7f9a7e`, retaining the website revision above. The live composition was checked before and after the operations. The earlier candidate's acceptance is historical; it is not inherited by this candidate.

Two new organizations/workspaces and three new owner identities repeated the actual data and mutation journey. Foreign draft reads and writes returned 403, with the exact authorized draft preserved. A separate owner in the same workspace had no personal draft. Foreign key listing and workspace rename returned 404; independent readback preserved the original name. Inference credentials could not access administration (401) or undelegated routing (403).

Demotion changed the unchanged owner's token immediately: draft read remained 200, while key issuance and rename returned 403. Stale role comparison returned 409. Revocation returned 204 and original-token reuse returned 401, while the independent remaining owner remained authorized. Independent inventory contained exactly the one intended key and the original workspace name. All temporary keys and actors were revoked and their original credentials denied. Workspace deletion returned 409, preserving audit records.

A separate fresh key was restricted to a currently configured Conatus model. Current model discovery also confirmed the DeepSeek model used for the negative request. Independent key readback confirmed the grant. A real request for that out-of-grant model returned 404 `not_found_error`; independently read key-scoped request inventory remained empty. Revocation returned 204 and original-token reuse returned 401.

A new ordinary organization owner read the retained isolated billing scope through the current deployment. Billing, balance, transactions and requests returned 200. The three retained request identities matched their original actual text/image invocation records, each charged 10,000 nanounits. Ledger amounts reconciled to the unchanged 990,192-nanounit balance. Customer projections contained none of the inspected procurement, expense, margin or credential fields; the procurement, commercial-position, financial-summary and pricing administration requests each returned 403.

A newly downloaded customer CSV contained three rows and 1,163 bytes, SHA-256 `69f21245cf60665be6fbf3844ef8a6d6ad5fd8097bb7f5177a7c7b8e519692ce`. Independent parsing matched every input-token/output-token/customer-charge tuple to current request readback. The temporary customer owner was revoked and original-token reuse returned 401. No new inference, credit grant or merchant payment was performed for this projection inspection.

These observations revalidate the described API isolation, live role/credential changes, model grant and populated customer export boundaries. Current-candidate browser device authorization remains outstanding, so SECURITY-03 is not yet accepted for this candidate. The retained-request inspection does not establish a new positive-price invocation or the remaining BILLING-03 UI and payment requirements. No fixture outcome supports these conclusions.
