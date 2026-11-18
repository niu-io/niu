# Hosted saved Video recovery — 2026-11-18

Tracking: `niu-j993`; deployment reliability remains `niu-mvhk`.

Render deployment `dep-dbufkvsipgvc738plk7g` became live with distribution
`d77534e926738d39d778af93ad25fef094ffa19b`, pinning core
`6fb59ef204f5ac2b78c0c51af5af0acdbdadb046`. Deployment workflow `44213430206`
completed. This is staging integration, not production or release acceptance.
No database capacity change was applied.

Before cutover, 248 actual dashboard JavaScript/CSS resources from the live
`c2d3634e` deployment were downloaded and individually hashed. After cutover,
every URL returned HTTP 200 and identical bytes and SHA-256. Compatibility pins
retain `c2d3634e` and `acb5863e`. This verifies those old immutable resource URLs;
it does not establish the behavior of every already-open browser document.

The actual hosted browser signed in and revisited `video-1000` with the retained
`input-1007` as its pending request. At 390 × 844, the Chinese warning and both
recovery actions were readable; document width remained 390 pixels and Generate
was disabled. Keyboard Enter on Check status removed the pending query and
focused the original `run-1116`. Captured browser fetches for recovery were GET
requests. Independent administrative inventory still contained exactly one
original completed attempt.

An initial readiness predicate saw an earlier mounted video while the target
was still loading. That observation and screenshot were excluded from media
acceptance. A subsequent check selected `#run-1116 video` explicitly, observed
readyState 4 without an error, and inspected the settled narrow screenshot.
The recovered browser download matched the original independently verified
artifact: SHA-256
`677ec544d2c4e8cc615fb934786b583d0022565b02fc24113d5608e7e71771b0`.
The entire downloaded video decoded successfully. Logout returned HTTP 204,
reload reached Sign in, and the task browser closed.

This verifies current hosted recovery and artifact continuity for a retained
request. It does not reproduce a fresh interrupted paid submission on this
deployment, qualify unquoted Provider execution, or resolve intermittent database
failures. No new generation was submitted. Fixture results provide no evidence.
