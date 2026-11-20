# Staging reliability access revalidation — 2026-11-14

Finding: `niu-9rqz`, related to the staging UX review `niu-mm90`.
The current hosted product is core `799bb7ce`, composition `b9544449`.
This record does not establish that the historical intermittent 503 is fixed.

## Current runtime observations

The initial unfiltered gateway log sample contained 100 records covering only
10:19:15–10:23:35 UTC. It was not used as evidence for the whole deployment
window. Subsequent filtered queries covered 09:19:01–10:32:35 UTC separately
for application errors, application warnings and request statuses matching
`5*`. Each returned no matching records with `hasMore=false`.
These are bounded observations from actual runtime logs, not fixture results.
They do not establish database query plans or sustained recovery.

At approximately 10:38 UTC, one current-input read run used a separate password
session for the existing review account and the actual Default workspace.
Two concurrent requests returned:

| Read | Result | Client elapsed time | Returned records |
| --- | --- | --- | --- |
| Workspace API keys, one page | 200 | 1.014 seconds | 100 |
| Workspace request list | 200 | 1.611 seconds | 68 |

The timing includes client/network overhead and is not a database execution
measurement. The key response contained no full-secret fields. A separate
gateway request-log read contained matching workspace-key and request-list
routes with status 200 at 10:38:28 and 10:38:29 UTC. This confirms a successful
bounded read path, not the cause of an earlier failure or behavior under every
concurrency level.

The temporary session was signed out with 204; an independent read using its
old credential returned 401. Its private credential file was removed. The run
did not change workspace settings or submit a model request.

## Diagnostic access boundary

A native SSH probe offered the available configured identity, but the server
did not accept it. No SSH agent identity was available, and the inspected SSH
configuration and service-named identity locations identified no alternative.
This was not an inventory of every credential on the machine. No remote
command was executed. A separate managed-database metadata read confirmed the
resource available; its existing external access policy did not permit direct
connections.
No access policy was changed.

The Render account metadata endpoint exposed account identity fields, not SSH
key information. The Dashboard was signed out, and its GitHub continuation
also required interactive sign-in. The browser was handed to the account owner
to complete that authentication before inspecting registered public keys.
[Render's SSH guide](https://render.com/docs/ssh) documents account public-key
registration and identity matching as the normal SSH setup and troubleshooting
path. This is a diagnostic access limit, not evidence that Niu is currently
unavailable.

The earlier real statement-timeout evidence still requires a current-data
query plan. No financial/admission calculation, caching policy or schema was
changed based on the successful reads, missing log matches or fixture outcomes.
Current blocker and ownership remain in Beads.
