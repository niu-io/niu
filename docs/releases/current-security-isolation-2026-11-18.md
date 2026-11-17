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
