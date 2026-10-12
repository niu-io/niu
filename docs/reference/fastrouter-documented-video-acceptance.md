# FastRouter documented video acceptance

This actual-input run verified one personal, self-funded upstream video submission and result. A subsequent zero-generation run verified Gateway query recovery, encrypted result persistence and Niu result retrieval for the same saved task. Completed customer billing remains unverified.

The retained Gateway was `9634c70e384ca8a36cef1c75ade75b49675d34a4`, binary SHA-256 `c9921c82dec88bc5795c15f8ac85e991ac18f5e82c58ac211bd37c77a0c8539d`. The executed SDK was compiled from `b428ab95a143f4ffcb748d0d9c208becbdbd219b`. A separate copy of a stopped, restored database migrated from schema 290 to 291. The original database, personal-owner configuration, saved credential and financial records were preserved.

## Documented request and actual result

The request used the Provider's documented create example parameters, with an abstract prompt without people or faces: model `doubao-seedance-2-5-260628`, duration 5 seconds, resolution `1080p`, ratio `16:9`, seed 42 and watermark false. It did not invent a frames-per-second control. The existing draft mapping was enabled only in the copy, with these finite schema settings and an existing legitimate organization as personal owner. No commercial offer, qualification or funding receipt was created. Output metering and prices remained unconfigured; this does not mean generation was free.

The actual SDK `video.generate` normalized the domain inputs into the native request. Exactly one independent upstream generation POST was made, using a new idempotency identity. The earlier [HTTP 400 unknown submission](fastrouter-personal-video-submission-acceptance.md) was not retried.

| Stage | Actual evidence |
| --- | --- |
| Gateway create | HTTP 202, initial `unknown`; genuine upstream task identifier saved |
| Submission timing | `received`, 925 ms; successful receipt had NULL error diagnostics |
| Persistence | `may_have_executed`, usage confidence `unknown`, no failure row |
| SDK wait | One saved-state GET returned `unknown`; it did not query upstream |
| Replay and restart | Same attempt and saved task identifier; no additional upstream submission |
| Official task query | One GET for the exact saved task identifier; HTTP 200, `succeeded` |
| Provider response | Reported model `doubao-seedance-2.5`, duration 5, `1080p`, ratio `16:9`, 24 fps |
| Explicit Provider usage | `completion_tokens` and `total_tokens`: 257277 each |
| Download | 5,935,149 bytes; independent hash, ffprobe and complete decode |

The decoded video was HEVC, 1920×1080, approximately 5.041667 seconds, with AAC audio approximately 5.056 seconds. These are observed artifact properties, not an inferred billable pixel quantity. The downloaded file SHA-256 was `1adf1824c9b44796537509018ac497c93aea27cbe57a4b5162d503b9a581dcb6`.

The official query and result download used the exact retained upstream reference and saved personal credential after the temporary Niu key had been revoked. They were separate read-only upstream operations, not Niu Gateway refresh or result endpoints. Raw Provider responses, credentials and private result URLs stayed outside the public repository.

## Persistence and remaining boundary

Independent final verification reopened both the stopped source and copied database. It confirmed one new attempt, one personal route, one saved task receipt and one submission transport observation. Original financial and media records were unchanged. Other Supplier and model records were unchanged; permitted owner and schema changes existed only in the copy. Saved credential ciphertext was unchanged and independently decrypted to the provided credential. No saved Provider credential appeared in customer artifacts. Default captured request and delivered response matched exactly. The temporary key was revoked and copied processes were stopped.

The copied Gateway's final state remained `unknown`; no customer charge, balance debit, hold, Supplier earning or funding receipt was created. The direct official response's token usage was not committed as Gateway usage or used to infer a charge. There was no output-metering or price configuration that would establish a billable tariff.

This run exposed the SDK's initial-unknown wait behavior. The subsequent SDK fix at `a1010ce893aa696d3f587dff0d2006b1c993e4f4` was compiled separately and was not executed with this revoked test key. At that historical snapshot, Gateway polling, terminal persistence, Gateway result retrieval and billing completion were not yet verified. The later Gateway verification below closes the query and result paths for this same personal task; it does not establish customer billing. The successful create also does not verify extraction of rejection diagnostics from an actual non-success response.

## Historical rejection migration

A separate zero-upstream-call run copied the earlier HTTP 400 unknown database and migrated it from schema 290 to 291 using the same retained Gateway. Independent reopened native fingerprints verified that attempts, failures, existing timing fields, financial records, Supplier configuration, models and media records were unchanged. New error-code and correlation-ID columns remained NULL; historical values were not guessed or backfilled. Request detail and payload reads succeeded, and restart preserved the unknown state. The executed SDK timing GET for the original revoked key returned 401, preserving active-key authorization; positive SDK timing retrieval was not claimed.

## Existing-task Gateway query verification

A further separate copy exercised SDK `a1010ce8` against the same saved task,
using a new legitimate key in its existing workspace with the required model
grant. The original key remained revoked. The saved-job GET returned HTTP 200;
`wait` performed exactly one refresh and propagated its HTTP 502. One unavailable
query timing was persisted, and restart retained the original unknown state.
Independent reopening confirmed unchanged original financial, Supplier, model
and media rows, with no new generation submission. Both test keys were revoked
and the copied processes were stopped.

This confirms that the initial-unknown SDK fix reaches the Gateway query path;
it does not establish a successful refresh. The actual official response reports
`doubao-seedance-2.5`, while the direct query decoder requires the requested
version `doubao-seedance-2-5-260628`. This identified a finite Provider identity compatibility gap, subsequently
addressed below. Arbitrary model or task mismatches must continue to be rejected.

## Gateway recovery after the finite adapter fix

A subsequent isolated copy used retained Gateway `a0d13b595ec593eb24a01913128dafcc811c918c`, binary SHA-256 `b8d2c6aa6fa3b499cc0819102418e80cf7a1442a873f14aa767b7562ea66f84f`, schema 291 and executed SDK `a1010ce893aa696d3f587dff0d2006b1c993e4f4`. The stopped original result proof was preserved. A new legitimate key in the same workspace, authorized for the saved model, read the existing task; the original key remained revoked. No original-key-only restriction was inferred from the earlier revoked-key refusal.

The SDK first retrieved saved state with GET 200, then made exactly one refresh POST for that existing task. Refresh returned 200 and `succeeded`; no generation POST was made. The adapter recognizes the observed `doubao-seedance-2.5` response name only for the exact requested `doubao-seedance-2-5-260628` version on the official FastRouter HTTPS task endpoint. It preserves the exact task identifier and configured version. Other endpoints and model mismatches retain strict identity validation.

Independent final native reads confirmed `confirmed_completed` execution and `unknown` usage confidence, one saved successful query observation with explicit `video_tokens` quantity 257277, and one encrypted video result reference. The reference was independently decrypted with its workspace/task/kind binding. These are separate facts: a saved Provider quantity does not establish a configured output tariff or customer billing confidence.

Niu's result endpoint reported video available and returned the same 5,935,149-byte file and SHA-256 recorded above. Independent ffprobe confirmed 1920×1080; complete decoding succeeded. After Gateway restart, saved terminal state, query quantity, result availability and billing response remained identical.

Billing remained `owner_funded`, with usage, price, charge, settled usage and effective output fields NULL. No output schema or price was invented and no customer charge, balance debit, hold, Supplier earning or funding receipt was added. Original financial records, Supplier configuration, models, other attempts and original captured payloads remained unchanged; the original submission count was unchanged. Both test keys were revoked after all reads, download and restart checks, and copied processes were stopped.

This closes the actual saved-task Gateway query and result retrieval path for the narrowly supported personal FastRouter version. Customer-priced video charging, other model versions, commercial eligibility and extraction of diagnostics from a new actual rejection remain outside this evidence.
