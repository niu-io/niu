# Backend delivery plan and progress

Updated 2026-10-12. Public main baseline: `8910a516`; native implementation:
`3fdc669c`. This plan schedules the owner's backend priorities. It does not
replace the detailed first-release requirements or declare New API parity.

## Execution rules

- Work on main and push reviewable increments for frontend integration.
- Complete the current milestone before starting another investigation. Fix a
  newly found defect immediately only when it blocks that milestone or violates
  authorization, persistence, financial accuracy or confidentiality. Otherwise
  record it in the backlog with impact and evidence.
- Use committed routes, handler annotations, contracts and actual running
  behavior as the integration baseline. Uncommitted changes are not delivered.
  Preserve other sessions' work.
- Fixture outcomes have zero acceptance signal. Record actual current-input HTTP
  runs and independently inspect final native records/artifacts. Build, lint,
  contract and CI checks are separate static checks.
- External merchant activation and commercial Supplier agreements are not
  integration-capability gates. Never invent receipts, qualification or reported
  media quantities. Unsupported combinations remain explicit.
- Frontend/UX, container/image acceptance and Agent Observability remain assigned
  elsewhere. Private issue details and secrets stay outside public source.

## Current progress

These are scoped observations, not percentages or whole-workflow completion.

| Owner priority | Existing actual backend evidence | Still required for this plan |
| --- | --- | --- |
| Supplier configuration | Business identity, independent credentials/model mappings, rotation/disable isolation, rates, shared-database credential RPM contention | Consolidate current interface coverage and the complete management journey; distinguish integration capability from commercial activation |
| Workspace API keys | Real model calls, grants/isolation, spending/RPM/TPM/concurrency/IP controls, rotation/revocation, no-expiration keys | Freeze current frontend contract; consolidate per-control negative cases and remaining cross-protocol/permission races |
| Balance and charging | Internal approved credit, exact immutable-price debits, insufficient capacity, reservations, refunds, reconciliation and restart | Close supported top-up capability/error/idempotency inventory; separately label externally funded payment and paid-media verification gaps |
| Logs and usage | Populated request details, pagination, filters, full-range totals, CSV, safe customer charges and measured timing/errors | Consolidate one current request-to-report reconciliation journey and enumerate unsupported protocol fields |
| Video | Actual personal submission, idempotency, restart/poll recovery, decoded result, deletion and natural-expiry startup cleanup | Close supported lifecycle/control/usage matrix; paid-media quantity/settlement and some input/model combinations remain unverified |
| Performance | Actual two-Gateway text and mixed read/inference workloads with artifact/accounting checks | Agree workload/limits from the implemented scope; measure increasing load, overload and recovery; do not claim a measured New API comparison without one |

Detailed implementation pins and evidence boundaries are indexed in
[backend workflow status](backend-workflow-status.md).

## Milestones, in order

### M1 — Freeze interfaces for frontend integration

Next delivery. Inventory the interfaces required by the five business flows
above against committed handlers, generated OpenAPI, SDK and running HTTP.
Produce one table recording method/path, authorization, input/output, errors,
implementation status and actual-verification status. Resolve contract drift
before new feature exploration. Include required nullable fields, decimal
amount/revision strings, cursor behavior and supported capabilities. For genuinely
missing interfaces, implement the authorized scoped explicit 501 contract;
never replace working handlers with empty successes.

Exit: no silently missing interface in this inventory, documentation/SDK match
main, docs HTTP resources and API spec are available, changes are pushed. Browser
presentation is separately reported if not observed. Unsupported combinations
have precise errors and remain visible in the checklist.

### M2 — Close the supported core business journeys

Run the following on the pinned implementation, preserving original installation
state. Start from existing evidence and reproduce only missing evidence or paths
changed by fixes; do not repeatedly purchase upstream requests just to restate
an unchanged result.

1. Supplier creation and independent key/model/price management, including edit,
   rotation, disablement, stale revision and unauthorized access.
2. Workspace key creation and a real supported model call, followed by isolation,
   spending/rate/concurrency refusal, rotation and revocation.
3. Price-pinned request admission, reservation and exact debit, insufficient
   balance, duplicate handling, restart and reconciliation; payment integration
   inventory distinguishes supported capability from configured merchant access.
4. Match the same request to Logs, usage totals, errors/timing and exports, with
   ordinary customer authorization and no procurement information.
5. Video submission/idempotency, persisted recovery, terminal state and authorized
   result access/deletion; inspect native meter and settlement records. Keep
   missing reported quantity and unsupported paid settlement unverified.

Exit: a requirement-by-requirement ledger identifies verified supported behavior,
actual remaining defects and exact unsupported/unverified scope. Each claim has
its implementation pin and independently inspected final artifacts. Fix actual
blockers, not speculative polish. External commercial activation is not required.

### M3 — Close material reliability and capability gaps

Use M2 failures and the current product requirements to select work. Consolidate
New API capability comparison into a finite list of relevant backend behaviors;
mark implemented, missing, intentionally unsupported and unverified separately.
Do not treat every advisory issue as an equal-priority requirement. Include
cross-process admission, uncertainty/cancellation, bounded liability, durable
recovery and the applicable current-release Guardrails requirements. Architectural
changes need a concrete demonstrated problem and a cohesive module boundary.

Exit: no unexplained blocker in the agreed core inventory; remaining boundaries
are explicit. Public and enterprise issues are closed only when their complete
scope is proven. Broader frontend/release issues remain open where appropriate.

### M4 — Performance and backend handoff

After relevant M2/M3 business paths pass, run current-input increasing-load and
mixed-workload measurements on the pinned native deployment. Record latency,
TTFT where applicable, throughput, errors, resources, overload recovery and exact
post-run accounting. Distinguish upstream latency from local service behavior.
Report measured limits, not a guessed capacity or unsupported superiority claim.

Exit: pushed interfaces/docs, a scoped business acceptance ledger, performance
artifacts and operational limits. Full release acceptance still includes work
assigned to other machines; backend completion must not conceal missing backend
requirements or substitute static checks for actual behavior.

## Progress report format

Each work update states the current milestone, completed requirements since the
last report, actual evidence, remaining blockers, next deliverable and pushed
commit. CI is reported separately. A milestone advances only when its exit
criteria are satisfied. Report no percentage until there is a stable finite
inventory and justified completed-item count.

## Latest delivered increment

`3fdc669c` bounds public Guardrails snapshot storage waits. Actual locked video
and Chat requests returned safe 503; no blocked Chat dispatch/debit occurred.
After release, a real response charged 9,013 customer nanounits exactly. Independent
source/final verification retained original rows and checked the completed
response, tariff revision, debit, restart and revoked key. Docs `8910a516` were
pushed. These are scoped reliability improvements; M1 and M2 are not closed.
