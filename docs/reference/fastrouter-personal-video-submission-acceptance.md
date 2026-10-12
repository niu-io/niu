# FastRouter personal video submission acceptance

This bounded actual-input run diagnoses a failed personal, self-funded submission. It does not qualify successful video generation, commercial supply, upstream task recovery, results or completed billing.

The retained Gateway was `17b7370af24611bc49a89461c81e7f290860d5cd`, with binary SHA-256 `9f763b72d3d5c8c200fc9bbf6a26157a49ba392d2b02151a635b628bda9cc879` and database schema 290. The executed SDK was compiled from `203c4469c3a35c80747b02dab558937ba159829a`. Verification used a separate copy of a stopped, restored database containing the actual saved FastRouter credential and draft mappings. The original database, credential ciphertext and financial records were preserved.

## Actual request and outcome

The copy enabled the existing mini model mapping and assigned its personal owner to an existing organization. No commercial offer, qualification, funding receipt or invented price was created. The finite schema allowed only duration 3 seconds, resolution 480p, ratio 16:9 and 24 frames per second. Output metering and pricing remained unspecified; this is not proof of a billable video tariff.

The actual SDK `video.generate` normalized these settings into the native video request. The prompt described an abstract scene without people or faces. Exactly one upstream generation POST was made. The Provider returned HTTP 400 after approximately 813 ms. This was an HTTP rejection, not a connection timeout, DNS failure or malformed successful job response.

| Check | Actual result |
| --- | --- |
| Create response | HTTP 202, `submission_unknown` |
| Persistent execution | `may_have_executed`; usage confidence `unknown` |
| Failure diagnostic | `upstream_http_error`, upstream status 400; no transport phase |
| SDK `jobs.wait` | One retrieve GET; returned the same unknown state |
| Canonical idempotency replay | Same attempt; no additional upstream submission |
| Gateway restart | Unknown state preserved |
| Saved upstream job / results | No job identifier or result reference; results request returned 404 |
| New financial rows | No customer charge, balance debit, reservation, Supplier earning or funding receipt |

The upstream error body, error code and request correlation identifier were not retained by this runtime. The exact Provider rejection reason therefore remains unknown. No guessed task identifier was queried and no submission was retried. HTTP 400 alone was not treated as proof of nonexecution.

## Independent final verification

An independent verifier reopened both the stopped source and final copied database. It confirmed exactly one additional attempt, one personal route record and one submission transport observation. Original financial and media rows remained unchanged. Other Supplier and model records remained unchanged; the selected model schema and personal-owner changes existed only in the copy. The saved real credential ciphertext was unchanged and independently decrypted to the provided credential.

Default captured request bytes matched the submitted request, and captured response bytes matched the delivered 202 response; both were complete and untruncated. Safe customer artifacts contained no saved Provider credential. The temporary key was revoked and the copied Gateway and database were stopped.

No result download, media decode, positive upstream task query, measured output usage or completed video billing was verified. This evidence establishes safe persistence, idempotency and restart behavior for this actual failed submission, while identifying the missing bounded rejection diagnostics as an implementation gap.

## Subsequent diagnostic implementation

Revision `b428ab95` implements bounded rejection-body extraction and optional
persisted `upstream_error_code`/`upstream_request_id` fields in video transport
timings (migration 291). It retains a received HTTP status even when reading its
error body times out or exceeds the bound. Provider messages, raw bodies, URLs
and credentials are excluded. Historic missing details are not backfilled.

Gateway static checks cover the integrated implementation; this original run
does not exercise the new extraction or persistence branch. The actual cause of
its HTTP 400 therefore remains unknown. No additional generation was submitted
to make this record appear successful.
