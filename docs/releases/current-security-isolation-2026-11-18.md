# Current hosted security isolation — 2026-11-18

Bead: `niu-nrcn.8`. Hosted core: `9fd281e523cdbd521585a0a8f98d605d5d5a1073`.
The live deployment was independently re-read during this run and its immutable
composition still pinned that core. This is scoped current-input API evidence,
not final-candidate release acceptance. No fixture result is evidence.

## Independent actors and authoritative saved data

Two fresh organizations and workspaces were created through the deployed API.
Separately issued, expiring owner credentials represented two actors in the first
workspace and one in the second. Each actor's workspace list contained only its
own workspace.

The first actor saved a uniquely marked personal Chat draft. A foreign-workspace
actor received HTTP 403 on both reading it and attempting to clear it. An
independent authorized read returned the exact original payload. A second actor
in the same workspace received its own empty draft, establishing personal draft
isolation independently of workspace isolation.

An owner could issue its own model-limited API key. The same owner received
HTTP 404 for a foreign workspace's key list and rename operation. The foreign
owner independently read the original workspace name afterward. An inference
key could not use the administration session endpoint (HTTP 401).

## Live revocation and operation limits

A separate continuation used fresh expiring actors in the same review scopes.
An inference key without delegation received HTTP 403 from the documented
`/v1/routing` operation. With a second owner retained, an owner was demoted to
viewer. Its original token could still read its personal draft, but creating a
key and renaming the workspace each immediately returned HTTP 403. A stale
role compare-and-set returned HTTP 409. Revoking that operator returned HTTP 204;
its original token then returned HTTP 401. The other actor remained authorized.

A temporary key restricted to the existing Conatus model was independently read
back, then used to request the existing DeepSeek model in the configured hosted
workspace. The request returned HTTP 404 with `not_found_error`. The deployed
Chat admission contract conceals models outside the key grant with that response;
it does not promise HTTP 403. An independent administrative inventory after
revocation contained zero attempts for this credential. A zero-USD spending cap
was also configured before the denied request. No inference was dispatched.

## Evidence exclusions and cleanup

An initial request named an unavailable model, so its HTTP 404 cannot establish
a restriction on an existing model. A first operation check used an unavailable
path, also returning HTTP 404; it is excluded. The corrected documented operation
and existing-model request above supply the relevant evidence. No product defect
is inferred from those verification setup errors.

Every temporary inference key and operator credential was revoked, and original
credentials were independently denied with HTTP 401. The empty-looking review
workspaces were not deleted: their saved audit records correctly caused HTTP 409.
Those review records are retained; no direct database deletion bypassed retention.

The final accepted deployment still requires the same actor-bound checks. Device
authorization and revocation, populated commercial-data projections, UI behavior,
and complete API coverage are outside this run. The release case stays open.

## Current candidate actor and device authorization follow-up

The complete independent-actor sequence was repeated against deployed core
`3f949559156ff2499a900e6890b3e29ed6ed4dde` with fresh organizations,
workspaces, expiring actors and restricted keys. Foreign draft read/write each
returned 403, and authorized readback preserved the exact original draft.
Same-workspace actors retained separate personal drafts. Foreign key listing
and workspace rename returned 404 without changing the foreign workspace.
The inference key returned 401 on the administrator session endpoint and 403
on undelegated routing access.

After owner-to-viewer demotion, the unchanged original token could read its own
draft but could neither create a key nor rename the workspace (403). A stale
role update returned 409; revocation returned 204 and the original token then
returned 401. The other owner remained authorized. All temporary actors and keys
were revoked and independently denied; audited scopes correctly retained their
records rather than allowing cleanup to erase history.

A separate fresh key limited to Conatus attempted the existing DeepSeek model.
The actual response was 404 `not_found_error`, and the independent key-scoped
request inventory remained empty. The key had a zero-USD cap, was revoked and
then returned 401. No invocation was dispatched in these authorization checks.

The current built plugin's real packaged login command also completed browser
approval for a 15-minute Default-workspace connection with model invocation
explicitly disabled. Both the Chinese approval summary and command-line result
reported discovery-only authority. Independent `/v1/key` inspection confirmed
`invocation_allowed=false`; an actual Chat request returned 403 and its scoped
request inventory contained zero attempts. The approval summary was visually
inspected at 390 pixels, with document width also 390 pixels.

The approval page linked to the workspace key list. Its issued connection was
revoked through the actual action menu and confirmation dialog. A separate HTTP
read immediately returned 401 for the original credential, and the private
credential file was removed. This verifies approval scope, denied invocation
and user-facing revocation on the current candidate; populated commercial-data
projections and complete security release coverage remain separate acceptance
work rather than inferred successes.
