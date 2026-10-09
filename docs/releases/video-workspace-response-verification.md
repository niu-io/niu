# Video workspace response isolation — 2026-10-08

Video asynchronous submission, Supplier refresh and paginated history now check
an instance-local workspace/key generation before updating state. Cleanup
invalidates pending work when the component unmounts. This matters because the
routed Video page remounts on workspace changes: a late successful create could
otherwise still change the shared route's job/key query through its old handler.
Generation numbers also distinguish leaving and returning to the same scope.

This does not cancel or replay a potentially paid submission. Its saved job and
original-account recovery remain backend-owned. Returning to the original
workspace discovers accepted jobs through normal history. Stale callbacks cannot
navigate, append history, show old errors or clear another scope's busy state.
Aborted key-list reads also stop before applying their response.

The existing empty-state pattern now distinguishes no active key from no video
route, and platform administrators receive the same Supplier setup action as
installation administrators. Ordinary customers retain Models access. On phone
screens, selecting a workspace closes the history drawer.

## Verification

All 13 VideoView tests passed against current source, including deferred success,
deferred failure after leaving/returning, paginated history after a workspace
switch, and a keyed component unmount whose late create must not change the
current route. Existing estimate invalidation, single paid submission, no retry,
reader restrictions, saved-result URL and reference validation cases passed.
Dashboard type checking passed.

The existing service on port 2566 was reviewed at desktop and 390×844: the
workspace menu opened, selecting Guardrail verification removed the Demo API key,
the no-key state showed only its relevant recovery action, and the mobile history
drawer closed on selection. Default workspace retained the saved Demo API key and
showed no video route with administrator Supplier setup access. The viewport was
reset. No Supplier, key, rate or paid video request was created or changed.

The demo has no qualified video route. Browser checks therefore cover genuine
empty states and workspace controls; deferred-response tests use controlled local
responses. This does not qualify live generation, recovery, positive result
retrieval, prepaid accounting, or complete F02/F03/V16 acceptance. Agent
Observability was untouched.
