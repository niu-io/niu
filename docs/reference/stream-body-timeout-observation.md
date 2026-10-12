# Bounded stream body-timeout observation

The response-body timeout handler now records transport phase `request`, but this bounded actual run **does not reproduce that handler path**. It supplements [request transport phase acceptance](request-transport-phase-acceptance.md); it does not close response-body timeout acceptance.

The actual clean Gateway binary is `3e9d00a9d9601a6c06d4b64cda25724d1e90b3d4`, with its retained SHA independently checked and final database migration 287. The executed compatible JavaScript SDK is compiled at `4c3def6381e839d1206d5dd13b3b42632b0ef036`; it is not claimed to share the runtime source pin.

An isolated stopped-database copy uses the saved personal self-funded OpenRouter configuration, existing approved internal credit and frozen customer tariff. Only the copy's request timeout changes. Original database, credentials, encryption identity, proxy and deployment timeout/budget remain unchanged. Two distinct Chat streaming requests each use a 64-token output limit. No unknown execution is retried, and no third request is sent.

| Copy request timeout | Actual result | Native usage and customer accounting |
| --- | --- | --- |
| 1 second | Gateway HTTP 502 before a successful upstream response is established; `upstream_timeout`, transport phase `request` | `may_have_executed`, unknown quantities, no charge; one unresolved hold of 316,050 nanounits remains |
| 2 seconds | HTTP 200, 50 read chunks, successful Chat `[DONE]` | `confirmed_completed`, `provider_reported` input/output 30/64; charge 66,914 nanounits, matching debit −66,914; no open hold |

The first result is a send-stage timeout. Gateway diagnostics identify the existing stream-send failure path, with timeout true and connect false. Transport phase `request` alone does not prove that upstream headers succeeded or that the response-body helper ran. The second request completes normally. Neither result establishes the newly changed body-timeout branch, and the run stops at its two-request limit.

An independent reader reopens source and final stopped databases. It directly compares final execution, confidence, quantities, saved failure, charge amount, charge/debit cardinality and reservation state against raw observations. The completed request has exactly one charge and one exact negative ledger entry, recomputed from its frozen tariff. The uncertain request has no charge/debit and retains its original hold after restart; no missing quantity is inferred as zero.

Actual SDK Logs and CSV equal direct HTTP results. The CSV's single timeout row reports `Failure kind = upstream_timeout` and `Transport phase = request`; detail and restart reads preserve the same diagnostic. Default request/response capture equals submitted JSON and delivered bytes, is complete and untruncated, and contains no Provider credentials or procurement data. Complete capture of the first error body is not model completion evidence.

All original financial rows and complete funding-receipt, Provider and model fingerprints remain unchanged. Existing credential ciphertexts decrypt under the preserved encryption identity. The temporary verification key is revoked and copied Gateway/PostgreSQL processes are stopped. There are no fabricated upstream responses, failures, funding receipts or approvals.

Actual Chat/Responses/Messages response-body timeout persistence remains unverified. This record establishes only the exercised pre-response timeout diagnostic, retained uncertainty, compatible reporting and successful bounded stream. No additional paid calls are justified by this record.
