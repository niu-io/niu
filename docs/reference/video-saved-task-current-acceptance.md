# Current saved-video task acceptance

The actual saved-task interfaces were exercised at digest-checked executable
`4a2f956cbad72eda0a240ef627b9d04f259036a9`, schema 287, through 25 retained HTTP
responses on two independent native PostgreSQL copies. The original installation,
database and encrypted identity were not modified. Fixture outcomes are not
acceptance evidence.

## Sources and current scope

The primary source was a genuine personal OpenRouter video from the previously
independently verified automatic-recovery run at
`e704955ed0441288bc30827a7434b73218b3a06d`; its original executable digest was
checked again. It retains the actual creation request and idempotency identity,
one submission, saved worker observations and a completed job.

The second source was the real naturally expired result retained by the worker
checkpoint at `d630475704bd0310d3d0cba176b103a46cf778fa`. Its earlier history
included a deliberately blocked completion persistence write, subsequently
recovered. That controlled database fault did not fabricate the Provider job or
result. This current run reads its existing expired-and-erased reference; it does
not reproduce the earlier fault or the moment of expiry.

Both copy sources were authoritatively confirmed stopped before copying. Current
HTTP execution used the current pinned binary, rather than the historical source
runtime. Video polling was disabled, and the requests issued neither refresh nor
upstream result retrieval.

## Actual HTTP matrix

| Current-input path | Observed result |
| --- | --- |
| Saved job status, history, observations, timings, billing and result metadata | HTTP 200 with saved customer-safe records. |
| Original creation request and idempotency identity | HTTP 202 returning the same completed job reference. |
| Changed request with that identity | HTTP 409; no successor submission. |
| Same request after Gateway restart | HTTP 202 with the original job reference; saved status and result metadata remain available. |
| Current model-denying or Provider-denying policy | Result metadata returns HTTP 403; restoring inherited policy permits HTTP 200. |
| Real job identifier read using a foreign workspace key | Job, observations and result metadata each return HTTP 404. |
| Naturally expired or revoked temporary key | HTTP 401. |
| Existing naturally expired result | Job status and result metadata return HTTP 200; binary result retrieval returns HTTP 404 before upstream download. |
| Expired result after restart | Result metadata remains HTTP 200 and binary retrieval remains HTTP 404. |

The primary matrix retains 19 responses; the naturally expired source retains
six. Response counts identify saved artifacts, not a substitute for inspecting
their contents and final native records. Neither expiry nor deletion implies a
failed job: the expired source still reports succeeded.

## Independent final-state checks

A separate verifier reopened each stopped source and final copy and checked the
raw response hashes, executable SHA-256, saved job identity and authorization
responses. Full native fingerprints for original attempts, media jobs, submission
identity where present, recovery routes, observations, query evidence, transport
spans, financial entries, Supplier credentials and model configuration matched.
Each copy retained exactly its original one attempt; no new generation, query or
result-download transport record was created. The expired result's original
expiry/deletion state and erased ciphertext were unchanged.

Original keys matched after excluding the explicitly created verification keys,
which were all revoked. The primary copy also retained three legitimate policy
revisions: model denial, Provider denial and restored inherited access. A foreign
verification workspace was created. These management records are intentional
changes; the entire copied database is not claimed unchanged. Both copies were
stopped after verification. Private requests, credentials, binary paths and raw
artifacts remain outside Git.

## Remaining acceptance

This verifies current saved-task reads, replay, current authorization, restart
and an already naturally expired result. It does not establish a new material
submission, fresh image inspection, an Ark-positive task, an atomic material
delete/dispatch race, video/audio reference inputs, additional upstream polling,
result download or paid-media settlement. S08-2 remains active.
