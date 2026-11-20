# Current-input Niu 0.3 verification — 2026-11-17

Later the same day, browser access was recovered and installation, upgrade, recovery, agent consent and additional live journeys were executed. See the [expanded readiness record](release-readiness-0.3-2026-11-17.md) for the current conclusion and reproduced blockers. The limits below describe this earlier run only.

**The tested core API journey works; formal release readiness is not established.** This run found a concrete release-artifact provenance mismatch, rather than inferring product failures from missing checklist entries. Tracking: `niu-nrcn`; artifact finding: `niu-16wj`. Machine-readable observations: [evidence](evidence/current-input-0.3-2026-11-17.json).

## Actual candidate and method

Staging initially served core `accb3b73`. The deployment platform then reported the replacement live at 12:20:41 UTC, pinning core `23cae63a8a5eb38a008ab5836ef2961c786e9cdf` and website `8d3f49200f0d99d27dd39e17d71b904ee3b34108`. The model invocations and persisted-result verification below ran after that transition. Later release-tip changes at `75a15fa2` affect only release-checker documentation, code and tracking; this run does not claim a deployment of that tip.

The initial public-document downloads and initial login sample preceded the deployment transition. They are discovery evidence for the earlier deployment, not acceptance of all new UI changes. The subsequent fresh login, request, persistence, conflict and cleanup observations apply to the new live candidate.

Used the configured staging test identity, fresh HTTP sessions, a temporary 15-minute key limited to one explicitly named free model, a USD zero spending limit and one concurrent request. Verified current workspace prices as zero before dispatch. No production configuration, account permissions, existing keys, prices or unrelated records were changed. No fixtures were executed or used. Browser clipboard permission required human handling; the operator could not operate this remote browser. Browser interactions were not bypassed or counted as verified.

## Observed outcomes

| Journey | Actual execution and independent result |
| --- | --- |
| Public agent discovery | Downloaded `/llms.txt`, install, capability, inference, routing, evaluation and event contracts plus OpenAPI; all returned 200 with the expected text/JSON content type. Downloaded bytes were inspected. Initial candidate only. |
| Login and logout | Configured test-account login returned 200. Logout returned 204; session read afterward returned 401. A new login returned 200 and recovered saved data. |
| Administration boundary | Ordinary test member session received 403 for Provider administration. The inference credential received 401 for workspace directory and administration reads. This does not constitute an exhaustive role/tenant audit. |
| Scoped key issuance | Created a temporary key with exactly `qiniu/conatus-free`, finite expiry and USD limit 0. Independent `/v1/key` read returned 200 and `/v1/models` returned only that model. A different free-model request returned 404 without a completion. |
| Non-streaming model call | Actual upstream call returned HTTP 200, exact output `NIU_RELEASE_20261117_OK`, `finish_reason=stop`, 20 prompt tokens and 10 completion tokens. |
| Streaming model call | Actual streamed response returned `READY`, `stop` and `[DONE]`. Independent request record showed 13 prompt and 26 completion tokens. |
| Length-boundary behavior | A separate 48-output-token stream exhausted the allowance on reasoning, returned no final answer and explicitly ended with `length`. Its request record retained 18/48 tokens and the length finish reason. This is not classified as a gateway failure or a successful answer. A new bounded request with 256 allowed output tokens produced the complete answer above. |
| Durable conversation | Saved the actual non-streaming response through the supported chat API. Logged out, started a fresh password session, then independently retrieved identical prompt and answer. Saved usage matched the corresponding request record after normalizing numeric transport types. This verifies persistence through the API, not the UI send/save wiring. |
| Save conflict and workspace scope | Revision-guarded rename returned 200. Reusing the old revision returned 409; an independent read preserved the accepted title. Reading that saved conversation under a different accessible workspace returned 404. No foreign-organization success/failure claim is made. |
| Accounting and inspection | Independently listed three completed upstream requests for the temporary key: 20/10, 18/48 and 13/26 tokens, with the correct stop/length reasons. Each recorded USD customer charge 0. Billing readback had zero due/paid/charged/unbilled amounts, zero unresolved and zero unpriced entries. This does not validate positive-price charging or real merchant settlement. |
| Device authorization rejection | Created a fresh device request (201), exchanged before approval (202), denied it through the authorized session (204), and confirmed exchange was then rejected (401). No grant was issued. Successful browser consent remains unverified. |
| Published MCP consumer | Downloaded the actual published MCP tarball, installed it in an isolated temporary consumer, started stdio JSON-RPC, initialized the server, and invoked `inspect_key` and `list_models` against staging. Both returned real data without MCP errors; model discovery returned the single allowed model with zero published rates. This does not establish host-plugin installation or every MCP tool. |
| Revocation and cleanup | Revoked the temporary key (204), independently read `revoked=true`, and confirmed the old credential returned 401 for model discovery. Deleted only the newly created test conversation (204) and read it back as 404. Final logout returned 204 and session read returned 401. Audit/request records remain. Local temporary passwords, issued token, device secret and cookies were removed. |

## Confirmed release-artifact problem

Downloaded `v0.3.0` MCP, marketplace and DeepSeek bundles plus `SOURCE_COMMIT` and `SHA256SUMS`. All downloaded artifacts matched the published checksums. However:

- Downloaded `SOURCE_COMMIT`: `d8f3cfa194ea79fd4f3a8b073bf935bcf6368e1a`.
- Current remote `refs/tags/v0.3.0`: `bf0fca4d58fce2b5fade5c297b61fcc4844c12ea`.
- Current tested staging core: `23cae63a8a5eb38a008ab5836ef2961c786e9cdf`.

The release workflow writes `SOURCE_COMMIT` from its checkout. Therefore the tag and published asset source marker cannot describe one consistent source revision. Checksums prove download integrity against that manifest, not correspondence with the tag or current staging source. The mismatch does not prove why it happened or that the package is malicious. The published MCP's successful narrow consumer check does not remove this provenance problem.

Before promoting the candidate, publish a new immutable patch release whose accepted source, tag, marker, checksums, bundles and installation links agree. Preserve existing published tags. This finding is recorded as `niu-16wj`; no release was republished during verification.

## Remaining coverage and conclusion

Authenticated desktop/narrow UI interaction, successful browser authorization, separate restricted-member and foreign-organization identities, positive-price billing, real payment settlement, fresh video/media results, cancellation under an uncertain upstream outcome, native/container install-upgrade-restore and sustained reliability remain unverified. The local Docker client could not connect to a running daemon. SSH authentication to the deployment was rejected; no remote shell changes occurred. These are explicit limits, not claims that those product features fail.

The real text-inference, saved-history, zero-charge accounting and key-revocation path has now been exercised successfully. A general claim that Niu is unusable would contradict this evidence. A claim that 0.3 is ready for formal release would exceed it: resolve the confirmed artifact mismatch and complete the retained release-critical branches on the accepted candidate. Current follow-up state belongs in Beads, not this dated report.
