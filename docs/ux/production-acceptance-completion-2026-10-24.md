# Hosted acceptance continuation — 2026-10-24

This dated evidence supplements the [permanent release checklist](../release-checklist.md). Beads remains the execution tracker. It corrects the previous six prerequisite-only results; it does not claim release readiness.

The live composition remained `9a4aaf8b3f62d952bd271b1792272dca78b89f0c`, with core `8d44fe86575c8ea5b6f2b4dd5312b281fefa245d` and website `369b3671a0592bd7dee1be35d188a08ce491d036`. The deployment record was independently reread after execution. All evidence below comes from actual hosted operations and independently inspected outputs, not fixture tests.

## Commercial setup and customer isolation

Installation-authorized APIs created an isolated synthetic CNY customer, workspace and expiring customer session. The browser exchanged the issued session, opened that customer's workspace and completed a CNY 1 mock checkout. Its final order retained `simulated=true`; a separate balance read confirmed one credit of 1,000,000,000 nanounits. No real payment was made.

The customer saw only its own workspace. A rename persisted while its slug stayed stable; the name was restored. A foreign workspace's billing endpoint returned 404. Provider credential administration and platform pricing returned 403. The customer browser had no platform-admin navigation. Installation-only onboarding being denied to the demo session was therefore an expected permission boundary, not a reason to leave onboarding untested.

An isolated nonpublic commercial alias used the real OpenRouter free text model, with matching CNY configuration and explicit customer selling terms. Existing model routes and customer prices were not changed.

## Actual charging, limits and adjustments

Before funding, a bounded request returned 402 `budget_exceeded`. After funding, seven actual requests completed. A successful response contained exactly the comma-separated integers 1 through 200; independent parsing compared every integer. Other successful replies included `QA_BILLING_OK`. Two deliberately small output budgets ended with the reported `length` finish reason; these were not claimed as complete answers.

Customer prices were CNY 1 per million input tokens and CNY 2 per million output tokens, initially with a CNY 0.001 request fee. A subsequent publication changed only this isolated alias's fee to CNY 0.002. Independent arithmetic from the seven saved request records matched the total customer charge of **11,273,000 nanounits** exactly.

Observed limit behavior:

- Setting the key limit to its existing commitment caused 402 `key_spending_limit_exceeded`.
- Restoring that limit and setting the workspace limit to its commitment caused 402 `workspace_spending_limit_exceeded`.
- Restoring both limits allowed a new real request to complete.
- An ordinary customer admin was correctly denied owner-only limit changes; authorized installation writes established the enforcement cases.

During a real in-flight request, an independent balance read observed a reservation of **10,192,000 nanounits**. After completion, the charge was **3,024,000 nanounits**, reserved funds returned to zero and the open-reservations endpoint was empty. This was an observed lifecycle, not an inference from an empty account.

Refunding the first charge restored **1,050,000 nanounits**. Replaying the same idempotency key returned success but left exactly one refund entry. A further full refund with a different key returned 409. Before cleanup, independent ledger summation gave **989,777,000 nanounits**, matching the balance API. Charge reconciliation reported seven charges totaling 11,273,000 nanounits, with zero missing, duplicate, mismatched or unexpected charge entries and no settled open reservations.

## Statements, pricing and a new defect

An installation-issued statement covered the first five requests: 90 input tokens, 312 output tokens and five original request fees, totaling **5,714,000 nanounits**. Exact invoice replay returned the same statement. Customer reads before and after the new price publication returned identical historical lines. The browser displayed the matching settled statement and line items; desktop and narrow rendering were inspected. The audit page recorded the isolated price publication and its revision.

The report's usage and refund arithmetic matched the synthetic ledger, but mock payment provenance did not survive cash reporting. A two-second summary interval covering only the fresh simulated CNY 1 settlement returned `verified_cash_receipts_nanos: "1000000000"` and `balance_funding_receipts_nanos: "1000000000"`, while the order independently retained `simulated=true`. The rendered financial report calls this **Verified cash receipts**. This is a failed acceptance case, tracked in [Niu issue 116](https://github.com/niu-io/niu/issues/116) and bead `niu-zr9`; successful charge arithmetic does not override it.

## Correction of media acceptance scope

The previous plan incorrectly assumed standalone image/audio generation and video-task cancellation were current product capabilities. They are not prerequisites waiting for credentials.

The freshly downloaded hosted OpenAPI document contained 321 paths, no `/v1/images` or `/v1/audio` operations, and only GET on `/v1/video/jobs/{id}`. DELETE on the separate results resource removes local result references; it does not cancel an upstream job. Actual bounded image-generation and audio-speech requests with a valid key returned 404. The current model capability inventory advertised no image or audio output, and the new-generation UI offered text tasks and Video rather than image/audio generation.

`MEDIA-01` is therefore corrected to **image/audio capability boundaries**: verify declared capability, available entry points and honest rejection; require actual output inspection if such generation is introduced. A boundary pass is explicitly **not** a claim that image/audio generation works. `MEDIA-02` covers the supported video lifecycle and the truthful cancellation boundary, rather than inventing a cancellation requirement. Neither correction removes an implemented failing journey from the gate.

The earlier fresh five-second video run remains the positive video evidence: its downloaded result and Library copy had identical SHA-256 `96e4d3156ce834d5de3d124225d42cd358b954b4791d76ca3bf3eea2ebcfe094`; independent media inspection found H.264, 864 × 496, 5.088 seconds and 975,488 bytes. Its inspected frame showed the requested red ball on a white table. This continuation reopened that saved input after the original key was revoked: the persisted video still played, its status remained Succeeded, and new generation/Provider checks were explicitly disabled. The details panel retained transport timing and the owner-funded billing classification. No additional paid video was submitted.

## Cleanup and limits

Unused simulated funds were reversed through the supported ledger API. The isolated customer's final balance, reserved amount, available amount and outstanding amount are all zero. The temporary key and both temporary operators were revoked; independent calls with the revoked key and customer token returned 401. The temporary Provider membership is inactive, the new offer is paused and the new route is disabled. The isolated price was restored to its initial terms through a new revision, preserving historical statements. The demo browser session was restored.

Synthetic customer, statement, request and payment history remain for reproduction. Prior unrelated test records were not deleted. No source deployment was performed in this continuation. Remaining product defects still block release; this evidence does not qualify real merchant collection or unimplemented media features.
