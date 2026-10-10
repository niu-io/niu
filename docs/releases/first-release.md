# First feature-complete Niu release

**Status: incomplete. No F01–F10 gate is fully qualified.** Reviewed 2026-10-09.

## Release outcome

A developer can install Niu, configure a qualified Supplier, create a workspace API key, make supported text and video requests, retrieve authorized video results, and diagnose usage, latency, failures and customer charges. The hosted service additionally offers verified discounted supply.

## Product boundaries

- **Admin → Suppliers** (`/admin/suppliers`) for platform configuration, separate Supplier-member business access, and global **Models** (`/models`); workspace **API keys, Logs, Activity and Guardrails**; company **Billing & payments** in the global Settings dialog opened from the avatar menu. Settings must preserve the underlying product page and return to it on close; Admin remains a dedicated rail area. External agent observability belongs to Supen, outside Niu’s collection scope.
- OpenRouter is one demo Supplier for owner-funded personal testing, using its public rates without an assumed discount or resale claim. Keep personal-key use separate from commercial offers and customer prepaid charging. Suppliers can have one API key serving multiple models or multiple keys each serving one or several models; onboarding must not assume OpenRouter or one key per Supplier. Preserve its saved credential, demo login and active test key. Development runs on port **2566** with hot reload.
- Keep the agreed navigation/icons and hide the desktop rail on mobile. Use shared shadcn controls and mature product references; verify actual desktop and narrow workflows.
- Customer charges and Supplier procurement costs are separate. Unknown values remain unknown. Do not expose internal IDs or confidential commercial data.
- The public product must run without marketing/private source. Keep the niu.io brand and documented repository ownership.
- No task orchestration, task productivity/acceptance ownership, subscription rerouting/optimization, quota pooling or unsupported savings claims. Supen and other clients own agent behavior.

## Release checklist

Current-input backend checkpoints (none qualifies a complete release gate):

- [Bounded Chat failover](../reference/upstream-retry-policy.md): actual canonical OpenRouter authentication rejection followed by one distinct-credential successor, pinned price/funding, exact single charge, request-limit/deadline denials, partial-stream nonretry and restart preservation. This narrow policy does not qualify generic provider/status retries or circuit breaking.

- [Structured Chat streaming](../reference/structured-output-streaming.md): actual schema/object streams, explicit invalid-output errors with accurate charges, restart preservation, and eight longer outputs at four concurrent workers. Existing native runtime refreshed without replacing configuration or encrypted identity; sustained-load and broader provider qualification remain open.

- [Nonempty customer-charge restart recovery](../reference/financial-backlog-restart-live.md): one actual streamed completion retained its unpaid hold after accounting connection failures, then recovered exactly one debit after restart. Other ledgers, multi-instance nonempty backlogs and capacity remain unqualified.

- [Credit-backed billing workflow](../reference/internal-credit-workflow-live.md): real structured and streamed output, exact customer debits, released holds, invoice settlement, key spending denial, idempotent balance refund and restart preservation in an isolated native environment. No verified merchant funding, Supplier earnings or media charging claim.

- [Native backend bootstrap and restart](native-backend-bootstrap-live-2026-10-10.md):
  empty PostgreSQL schema through migration 0218, actual Supplier/workspace/key
  setup, owner-funded inference, retained content across restart and revocation.
  This does not qualify packaging, frontend or commercial billing.

- [Supplier/workspace calls](supplier-workspace-backend-verification-2026-10-09.md)
  and [strict key inputs](key-input-backend-verification-2026-10-09.md): independent
  configuration and actual personal-model access, with the documented limits.
- [Personal video lifecycle](openrouter-video-gateway-verification-2026-10-09.md)
  and [model-edit recovery](video-mapping-recovery-2026-10-09.md): actual generation,
  restart recovery, scoped results and independently decoded artifacts.
  [Text-video submission idempotency](video-submission-idempotency-live-2026-10-09.md)
  binds concurrent and restarted retries to the original attempt.
- [Live video result deletion](video-result-deletion-live-2026-10-09.md):
  cleared references stay unavailable after real upstream refresh and restart,
  without changing the saved job state or billing response.
- [Safe failure records](request-failure-backend-verification-2026-10-09.md)
  and [live Chat finish reasons](chat-finish-reasons-live-2026-10-09.md): durable
  payload-independent diagnostics, including completed but invalid delivery.
- [Live cancellation and structured output](chat-cancellation-structured-output-2026-10-09.md):
  disconnect uncertainty survives restart; strict nonstreaming JSON is verified,
  with unsupported streaming and invalid schemas rejected before dispatch.
- [Live request payload lifecycle](request-payload-lifecycle-live-2026-10-09.md):
  default capture matches delivered content, scoped permissions hold, and
  explicit deletion survives restart while diagnostics remain available.
- [Personal funding isolation](personal-funding-isolation-2026-10-09.md) is
  verified for the exercised requests. [Payment merchant access](payment-merchant-check-2026-10-09.md),
  real customer funding/charging and commercial supply qualification remain open.
- [Live financial authorization](financial-authorization-live-2026-10-09.md):
  company/workspace roles cannot self-fund, increase credit, reverse entries or
  invoke installation reconciliation; denied requests leave funds unchanged.

“Partial” means implementation or limited evidence exists; it does not mean the capability is release-ready. The linked workflow and detailed acceptance requirements are mandatory parts of F01–F10, not optional follow-up work.

| ID | Required result | Current status | Remaining acceptance |
| --- | --- | --- | --- |
| F01 | Independently installable public product | Partial | Run the single-image catalog/docs/dashboard/API journey with PostgreSQL: clean install, nested routes, restart, backup/restore and upgrade; prove no private/website dependency. |
| F02 | Authentication, workspace access and API keys | Partial; member sign-in and restoration implemented, HTTPS browser qualification open | Complete production account sign-in distinct from installation setup; qualify session restoration/expiry/sign-out and destination redirects; exercise ordinary workspace roles, key creation/rotation/revocation/model grants and negative cross-workspace access through API and dashboard. |
| F03 | Supplier configuration and client setup | Partial; 25 test offers inactive | Support one Supplier with one API key for multiple models, and multiple API keys with independent model subsets. Complete the rendered Supplier → model/rate → workspace key → client setup workflow; demonstrate a usable qualified route and actionable unsupported-capability errors. |
| F04 | Qualified inference and bounded routing | Partial | Qualify the actual protocol/model matrix, streaming, tools, structured output, cancellation, failures, retries and attempt attribution. Preserve explicit model/effort and prevent unauthorized paid fallback. |
| F05 | Durable customer-safe accounting | Partial | Demonstrate real immutable customer pricing and prepaid balance, top-up and request-charge reconciliation, low-balance warnings and credit-limit enforcement across restart, duplicates and uncertainty; prove customer/Supplier separation through UI, APIs and exports. |
| F06 | Useful consumption investigation | Partial; Logs sorting/export/content/column subsets verified | Finish Logs/Usage diagnosis, durable payload-independent finish/stop reasons, full-range aggregates and drilldowns, protocol coverage, token categories and consistent timing waterfalls; qualify the complete real investigation workflow at desktop/narrow widths. |
| F07 | Supplier integration and commercial configuration capability | Partial | Support independent credentials, model/protocol identity, agreed rates, customer pricing, settlement records and explicit qualification state. Verify the implemented supported workflows; activating every external Supplier or obtaining a discounted commercial agreement is not a backend-readiness gate. Actual resale and discount claims separately require current rights, terms and price evidence. |
| F08 | Gateway Activity and request observability | Partial; gateway diagnostics available | Qualify usage, customer charges, timing, errors and task correlation using only requests handled by Niu. Global and workspace scopes must enforce authorization. External agent logs and subscription usage imports are excluded. |
| F09 | Guardrails, limits and data controls | Partial; local controls, backend output observation and required input detector subset | Qualify live local input and buffered output rules; qualify ordinary-role observation management, detectors/streaming modes, safe denied-decision auditing, route/privacy requirements and supported budget guarantees. Qualify every supported path and retention/deletion. [Output observation evidence](output-observation-verification.md) covers backend/SDK checks, rendered mode controls and one owner-funded nonstreaming request; complete ordinary-role, protocol and recovery qualification remains open. |
| F10 | Docs, SDKs, packaging and release qualification | Partial | Finish packaged examples, formatting/migration/runtime gates, responsive UX and performance qualification; document supported/unsupported capabilities and Enterprise boundaries. Current Rust workspace tests, formatting, all-target Clippy, SDK and public-boundary checks have [scoped evidence](release-automated-verification.md). Local builds, dependency licenses and selective-import attribution passed ([evidence](regression-and-recovery-verification.md)); a stable dashboard snapshot passed [all 544 automated tests and type checking](dashboard-automated-verification.md). A current [Linux/arm64 package checkpoint](package-qualification-2026-10-09.md) covers source build, direct/Compose restart and restore, migration failure recovery and video/asset upgrade preservation. Complete live and rendered release acceptance remains open. |

## Remaining work in delivery order

Development comes first: complete the Supplier configuration and pricing flow,
then dependent workspace and inference workflows. Defer image rebuilds and
container qualification until the feature work is ready; use the existing
hot-reloading development service for implementation and browser review.
Packaging remains a release gate, not the current development priority.
Frontend design, development and browser verification now proceed locally through
Stitch, while the remote backend workstream owns business implementation and
performance testing. Both workstreams use main and coordinate API contracts and
blockers. Preserve the dependency order: Supplier credentials and model/rate
configuration → workspace API-key access → inference → durable usage, customer
charges and diagnostic records. Keep container qualification deferred.

Backend readiness is assessed separately from external account activation.
Payment acceptance requires a documented supported-integration list and verified
internal configuration, authorization, order, callback, accounting and recovery
capabilities; it does not require a real transaction through every listed gateway.
Merchant entitlements, enabled channels and live callback connectivity are
installation-specific checks. Likewise, commercial Supplier onboarding is distinct
from internal adapter readiness. Record unverified external behavior explicitly;
do not use missing external access to block independent backend performance work.
The [payment integration inventory](../reference/payment-aggregators.md#supported-integration-list-and-readiness-boundary)
defines the supported scope. Existing live-commercial checklist items below track
deployment qualification and do not override this internal-readiness boundary.

Video generation is required for the first release. Work follows the dependency sequence below; deliver the relevant customer controls and diagnostics with each backend increment, rather than postponing all UI work until phase 4.

| Priority | Work package | Required coverage | Ready to proceed when |
| --- | --- | --- | --- |
| 1 | Supplier capability and pricing administration | V01, V04; M01–M04 | Independent credentials, protocol-aware model capabilities, meters and separate purchase/selling rates can be configured, reviewed and qualified. |
| 2 | Text-input video admission and durable recovery | V02, V05, V06, V13, V14, V19, V20; M05–M08 | Authorized requests reserve bounded liability, retain their original route/prices, and reconcile without duplicate generation or charges. Query recovery works independently of callbacks. |
| 3 | Authorized results and complete text-to-video journey | V07, V14–V16 | Preview/download, expiry/deletion, saved history, measured timings and customer charge diagnosis work together at desktop and narrow widths. |
| 4 | Inspected reference inputs, assets and verification | V03, V08–V12, V15, V18, V21 | Media inspection precedes reference dispatch. Ordinary assets, reusable references, consented liveness and portrait approval pass their separate account/channel gates. |
| 5 | Live and packaged qualification | V17; all F01–F10 | Each advertised model/channel/input subset and packaged install/recovery passes acceptance. |

### Immediate implementation queue

**Settings restoration (2026-10-07):** the avatar menu now opens the global
Settings dialog over the current mounted product page. Direct Settings URLs
remain available. Desktop and 390px checks covered the shared rounded surface,
open appearance menu, draft-preserving section changes and closing back to the
original Models query. This is a navigation subset, not full billing or F02
qualification. See the [navigation checkpoint](admin-settings-navigation-verification.md).

Current backend assessment follows the [backend delivery audit](backend-delivery-audit-2026-10-09.md).
Historical checkpoint documents describe implementation work; fixture outcomes,
including their counts, are not evidence of correctness or readiness. Live
commercial onboarding and rendered workflows remain separate from internal
adapter capability. Payment support and limitations are listed in the
[payment reference](../reference/payment-aggregators.md).

1. **Finish the Supplier prerequisites.** Verify independent credentials and model subsets, exact channel capabilities, customer selling tariffs and bounded liability (V01, V04; M01–M05). Extend the existing configuration and pricing foundations. Keep an unqualified channel unavailable; a text-only OpenRouter demo does not qualify video.
2. **Complete one text-to-video lifecycle.** Verify authorized submission, original-account query/recovery, reported usage, one customer debit and separate Supplier settlement. Cover restart, uncertainty, credential/rate changes and contract-specific failure/refund behavior. Qualify callbacks separately; query recovery must work without them (V02, V05, V06, V13, V14, V19, V20; M05–M08).
3. **Finish results and the customer journey together.** Complete safe video/optional-frame preview and download, expiry/deletion and current authorization. Verify saved history and reload, scoped session access without pasting key secrets, measured queue/run/total intervals and matching customer Logs/Usage/Billing. Review loading, failure, missing and expired states at desktop and narrow widths (V07, V14–V16).
4. **Extend to reference media and assets.** Apply required inspection before image/reference dispatch; qualify types, roles, limits and account isolation. Implement ordinary asset groups/assets and readiness-aware reusable references. Deliver consented liveness and portrait approval as separate gates, including channel differences (V03, V08–V12, V15, V18, V21).
5. **Finish release qualification.** Ship matching API/SDK/docs with every increment, then qualify each advertised live combination and packaged install, restart, restore and upgrade. Complete remaining F01–F10 acceptance within the gateway-only collection boundary (V17).

A [live customer Chat → Logs checkpoint](customer-chat-logs-check-2026-10-08.md) verifies demo sign-in, saved key selection, one owner-funded OpenRouter text request, response restoration and payload/timing diagnosis at desktop and phone widths. It does not qualify prepaid billing, video or the complete customer workflow.

**Next work:** audit the existing Supplier → model capability/rate → workspace key → video estimate/submission → recovery → result → Logs/Usage/Billing path as one workflow. Fix the first unmet dependency in that order, using the existing implementation and its checkpoints. Verify original-account isolation, prepaid admission, historical charges and restart recovery before expanding generation inputs. A completed component or local fixture does not close the complete workflow.

The [Video workspace response checkpoint](video-workspace-response-verification.md) fixes late-response navigation/history after workspace changes, including component unmount, with deferred-response regressions and rendered empty-state checks. This does not qualify a live video route.

**Video qualification boundary:** actual owner-funded OpenRouter text-video generation, durable recovery and downloaded-result decoding now have scoped evidence. This does not qualify customer-funded settlement, every advertised input/model/channel or commercial supply. Continue from the remaining internal workflow gaps; catalog presence alone is not entitlement, and unverified external capabilities must remain explicit.

**Current administration checkpoint:** the Supplier directory, named detail routes and add/edit/delete controls have scoped PostgreSQL and desktop/narrow browser evidence. EPay configuration now has encrypted persistence, administrator authorization, revision checks, audit records and a pending-order guard; three EPay PostgreSQL tests passed. Stripe and native Zhifux configuration remain server-managed. This does not qualify live payments or the complete Supplier workflow. See the [Admin checkpoint](admin-settings-navigation-verification.md#supplier-directory-and-epay-configuration-recheck).

**After the text-input workflow:** complete bounded image decoding, inspection and safe remote input retrieval before enabling reference generation; then ordinary assets and reuse, followed by consented liveness and separate portrait approval. Callback support is qualified separately and must not delay query-based recovery. Keep unrelated visual polish behind this queue.

The [dashboard Video access checkpoint](dashboard-video-access-verification.md), [capability discovery checkpoint](video-capability-discovery-verification.md) and [customer Video dashboard checkpoint](customer-video-dashboard-verification.md) cover scoped local access, configured controls and submission/history foundations. The [result transport checkpoint](video-result-transport-verification.md) and [saved-result checkpoint](video-result-storage-verification.md) cover bounded transport and encrypted references. Result downloads now distinguish safe failure categories; the routed authorization and SDK error subset passed, while positive public HTTPS retrieval and the complete result journey remain open. The [saved-result dashboard checkpoint](video-result-dashboard-verification.md) adds scoped rendered preview/download, availability and writer deletion. Complete live media and lifecycle qualification remain open; V07/V15/V16 are not passed.

The [lifecycle observation checkpoint](video-lifecycle-observation-verification.md) adds durable submission/first-observed status times and explicit terminal conflicts to the timing API/SDK. The rendered observed waterfall now has desktop/narrow and regression evidence. Qualified Supplier queue/run timings and full lifecycle diagnosis remain open; polling observations do not establish exact generation boundaries.

The [customer activity checkpoint](video-customer-activity-verification.md) fixes omission of settled video charges from Logs, exports and charge summaries. Unposted liability remains pending. Durable video request classification now covers uncertain submissions; video-aware Logs details now link back to saved lifecycle/Billing without text-only diagnostics. Live rendered charge traversal remains open.

The [settlement quantity checkpoint](video-settlement-quantity-verification.md) preserves the measured/billable quantity behind posted video charges independently of later usage conflicts. The [Billing dashboard checkpoint](video-billing-dashboard-verification.md) adds the rendered historical customer rate/quantity explanation; live end-to-end diagnosis remains open.

**Reference-input status — local subsets only; V03/V15 remain open:**

| Area | Implemented and locally checked | Required next |
| --- | --- | --- |
| Decode and capacity | Bounded PNG/JPEG/WebP decoding, complete-request slot reservation and cancellation-safe retained capacity ([contract](../reference/image-processing.md), [schema evidence](video-request-schema-verification.md#implemented-boundaries)). | Safe remote retrieval and other required media types; live effectiveness and channel qualification. |
| Consent and dispatch | Current-key/policy checks before inspection, immutable scoped approvals, exact request binding and atomic dispatch rechecks; negative consent, content, verdict, replay, revocation and coverage fixtures ([evidence](image-approval-receipt-verification.md)). | Complete consent management, denial investigation, retention and live reference submission. In-flight detector disclosures are not retroactively cancelled. |
| Discovery and contracts | Schema/decoder input limits, roles and required references; SDK/OpenAPI contracts and read-only discovery checks ([evidence](video-capability-discovery-verification.md#inspected-inline-image-discovery-checkpoint)). | Qualify all advertised channel/input combinations; current discovery is not an entitlement or capacity guarantee. |
| Output snapshots | Validated image inputs retain immutable output estimates without storing source URLs; video references remain denied without duration metering ([evidence](video-output-snapshot-verification.md#image-reference-output-regression)). | Qualified reference-video metering and complete historical customer diagnosis. |
| Video composer | Pending inline attachments and schema roles, estimate invalidation, read-time submission blocking and stale-read cancellation; focused tests and desktop/narrow component checks ([evidence](video-capability-discovery-verification.md#reference-attachment-controls-checkpoint)). | Full rendered submission/reload, durable reference assets and live acceptance. Complete-suite qualification is tracked separately from focused checks. |

**Foundations to extend, not rebuild:** [output/meter configuration](video-output-dashboard-verification.md), [exact output estimators](video-effective-output-verification.md), [pre-dispatch estimates](video-preflight-estimate-verification.md), [immutable output/estimate snapshots](video-output-snapshot-verification.md), [saved job history](video-history-verification.md), [Supplier media offers](supplier-media-offer-verification.md) and [customer selling administration](customer-media-rate-dashboard-verification.md) have scoped local evidence. These checkpoints do not qualify a live video channel or close a release gate. An estimate remains separate from maximum reserved liability and reported usage.

Deliver API/storage, SDK/docs and relevant rendered desktop/narrow interactions with each increment. Preserve text inference, authentication and prepaid regression coverage throughout. OpenRouter's owner-funded text demo does not qualify video support. All V01–V21/M01–M08 requirements remain mandatory in the phases below. Do not edit the separately owned Agent Observability pages; external collection is outside Niu’s release scope.

### 1. Supplier and customer-price foundation

Existing foundations have local evidence; complete Supplier/channel and customer workflow qualification remains open. Extend these implementations:

- Output, snapshots and history: [local engine/API checkpoint](video-effective-output-verification.md), [local checkpoint](video-output-snapshot-verification.md), [scoped API/SDK checkpoint](video-history-verification.md), [scoped dashboard checkpoint](video-output-dashboard-verification.md).
- Customer selling rates: [local backend/API/SDK checkpoint](customer-media-rate-lifecycle-verification.md), [scoped dashboard checkpoint](customer-media-rate-dashboard-verification.md).
- Capabilities and offers: [scoped dashboard and storage evidence](video-capability-dashboard-verification.md), [local checkpoint](supplier-media-offer-verification.md).
- Supplier purchase/settlement and historical pricing: [scoped API/SDK evidence](video-job-storage-verification.md#supplier-media-purchase-history-and-retirement--2026-10-07), [scoped interaction evidence](supplier-media-rate-dashboard-verification.md), [backend/SDK and native recovery evidence](video-job-storage-verification.md#independent-supplier-media-earnings-and-settlement--2026-10-07), [video pricing checkpoint](video-job-storage-verification.md#immutable-customer-media-rate-retirement--2026-10-07).

- [ ] Complete the versioned video capability and tariff configuration alongside text models: exact model/channel, supported inputs and controls, metering unit, pricing dimensions and bounded customer liability (V01, V04; M01–M05). These are prerequisites for customer-funded video dispatch.
- [ ] Finish Supplier onboarding, configuration, mappings, rates, qualification and settlements as one coherent workflow.
- [ ] Verify a non-OpenRouter Supplier with one key for several models, then multiple keys serving one or several models each; rotate or disable one key without changing the others or duplicating the Supplier business.
- [ ] Qualify roughly 20–30 supported models against real upstream behavior; catalog presence or an Enabled flag is insufficient.
- [ ] Publish immutable customer tariffs and verify a real request through customer catalog prices, Logs, Usage, Billing and prepaid account reconciliation.
- [ ] Deliver prepaid top-ups through an EPay-compatible domestic gateway (preferred candidate: 支付FM, signed merchant channels) and Stripe, configurable low-balance warnings and concurrency-safe spending admission. Default credit limit is zero; approved credit permits negative balances only within the limit. Exhaustion suspends new paid inference while preserving billing/top-up access.
- [ ] Before advertising hosted discounted supply, obtain Supplier commercial/data-handling evidence and defensible price comparisons. This is a commercial-launch condition, not a backend implementation gate.

### 2. Video APIs, recovery and settlement

Video is required first-release work, not a later extension. Complete the foundations already implemented before adding dependent screens. V01–V21 and M01–M08 in the workflow plan remain mandatory; the phases below assign all of them without reducing scope.

- [ ] Integrate the Supplier capabilities and pinned tariffs from phase 1 into targeted Seedance video dispatch; qualify concrete channel availability separately (V01, V04; M01–M05).
- [ ] Complete authenticated durable text-input create/query APIs and bind each job to its original workspace, key and upstream account (V02, V14). Image/reference dispatch follows the media safety prerequisites in phase 3 (V03, V15).
- [ ] Enforce customer workspace spending limits using pinned selling rates, bounded reservations and exactly-once settlement/release across concurrent text and video requests. The [shared retail-limit foundation](customer-workspace-limit-verification.md) is implemented; scoped management APIs and the rendered lifetime-limit form have local evidence; complete workflow qualification remains open. Keep the existing procurement budget separate; it cannot serve as a customer limit. Video remains unavailable under that legacy budget until a qualified admission mechanism exists (V14; M05–M08).
- [ ] Connect bounded query recovery, durable status/usage observations and exactly-once settlement; exercise restart, uncertain submission, duplicate/conflicting events and safe credential changes. Never blindly retry a paid create operation (V05, V20; M06–M08).
- [ ] Qualify callback authenticity and delivery before enabling notifications; query recovery must work independently (V06).
- [ ] Verify historical charge explanations and customer-only billing/usage discovery without exposing procurement data or inventing unknown amounts (V13, V19; M03–M08).

### 3. Media safety, assets and real-person verification

- [ ] Enforce media size/type, URL egress/redirect/SSRF, inspection coverage, authorization and retention before enabling media ingestion or retrieval (V15). Then integrate and qualify image/reference generation inputs with their model-specific roles and limits (V03).
- [ ] Complete result/last-frame retrieval, expiry handling, ordinary asset-group/asset lifecycle, readiness and zero-cost audit categories (V07–V10). Internal foundations have scoped evidence for [group creation](asset-group-runtime-verification.md), [group reads](asset-group-read-verification.md), [listing](asset-list-transport-verification.md), [lookup](asset-lookup-transport-verification.md), [metadata updates](asset-group-update-verification.md), [cascading deletion](asset-group-delete-verification.md) and [image ingestion](asset-create-verification.md). Ingestion foundations are verified through 0201, including inspected source preparation/erasure, real encryption, one-shot upload dispatch, HTTP source access, bounded interrupted-claim recovery and accepted-image readiness storage/API; [packaged lifecycle acceptance](package-qualification-2026-10-09.md) is through 0201; complete packaged ingestion/readiness acceptance remains open. Finish public HTTPS source deployment and Provider fetch qualification, live ingestion dispatch/recovery qualification, outcome reconciliation, reusable references, full customer CRUD, responsive controls and live qualification. Keep uncertain writes fenced until qualified reconciliation.
- [ ] Implement explicit-consent liveness handoff/result resolution and separate portrait approval, with account binding and qualified channel differences (V11, V12, V18).
- [ ] Qualify reusable asset references and every advertised media-input shape; ingestion alone does not establish generation support (V21).

### 4. Complete the customer workflows

- [ ] Complete **Admin** sections: Suppliers, OAuth providers, payment gateways, and white-label branding/theme defaults. Admin navigation uses sidebar sections; Supplier details use subordinate tabs. `/admin/suppliers` is the business directory with add/edit/delete actions; detail breadcrumbs are **Admin / Suppliers / Supplier name**. Do not put a Supplier switcher in the Admin sidebar or auto-select a Supplier on the list route. Persist supported settings, validate and audit changes server-side. OAuth configuration remains unimplemented and must not appear as an empty navigation destination. Branding has a [revisioned editor, authorized settings API, validated raster assets and native rendered lifecycle acceptance](branding-theme-verification.md); packaged branding qualification remains open. EPay configuration is being qualified; Stripe and native Zhifux configuration remain server-managed.
- [ ] Keep company billing and personal appearance in a global Settings dialog with direct URLs and return-to-page behavior. Preserve separate Supplier-member access and additive administrator/customer workflows. Verify desktop and mobile navigation.
- [ ] In Branding & theme, provide Branding and Theme tabs for display name/logo/favicon and validated shared color tokens/default appearance. Verify preview, save, reload and reset to Niu defaults across login and dashboard at desktop/mobile widths; preserve personal appearance preferences and reject arbitrary CSS or executable assets.

- [ ] Walk through login → Models → workspace key → Chat/API → Logs/Usage/Billing, including reader/writer roles, reload, errors and empty states. A [bounded browser checkpoint](customer-workflow-browser-2026-10-09.md) verifies local sign-in/reload, global Models, key-dialog cancellation, saved Chat → matching Logs and responsive payload/timing diagnosis. New request, key lifecycle, other roles, Usage/Billing and error paths remain open. Verify global `/models` navigation and the separate anonymous public catalog.
- [ ] Deliver the durable Video selection → submission → status → preview/download → Logs/Usage/Billing journey, including measured queue/run/total timing and unknown/error/expired states (V16).
- [ ] Finish key access/rotation/revocation and usage context without installation-administration jargon in ordinary user flows.
- [ ] Qualify Logs payload diagnosis and persistent filters; finish full-range charts, model/key charge and failure breakdowns, export and timing semantics.
- [ ] Present Chat and Video as session types in one Generations area, with a sparkles rail icon, one shared saved-session sidebar, Video as a task category alongside Reasoning, Build and Writing in the new-generation content rather than separate Chat / Video tabs, key-based scope without a workspace-first step, and session titles.
  The [Generations checkpoint](generations-session-verification.md) covers shared navigation/history and explicit saved-session restoration. Complete live and responsive release qualification remains open.
- [ ] Qualify durable multi-turn Chat branches, attachment limits/capabilities, cancellation, history management/export and one-to-four-model layouts.
- [ ] Implement live Guardrail input controls, detectors and explicit output modes; add safe denied-decision investigation and dashboard policy preview/assignment/rollback.
- [ ] Verify policy-change races, no weakening/bypass, pre-egress denial, credential isolation, retention/deletion and concurrency-safe declared budgets.

External detectors have a [synthetic transport checkpoint](external-detector-transport-verification.md), a [required input backend checkpoint](required-input-detector-verification.md) and a [dashboard workflow checkpoint](required-detector-dashboard-verification.md). The input subset binds explicit processing consent to authorized workspaces and configuration fingerprints, fails closed before inference, and records safe immutable decisions. Paid/unknown-cost services, complete ordinary-user/audit workflows, full protocol/fault qualification and streaming/output detectors remain open.

### 5. API/SDK, packaged recovery and release qualification

- [ ] Qualify gateway Activity → Logs → request details, complete-period breakdowns, timing and customer charges; enforce scoped access, retention and restart durability. Follow the [F08 acceptance requirements](first-release-acceptance.md#gateway-activity-and-request-observability--f08).
- [ ] Ship matching video, asset and verification API/SDK/docs, with accurate unsupported-operation boundaries and bounded authorized live evidence (V17).
- [ ] Run clean packaged install, restart, backup/restore, upgrade/recovery and packaged SDK examples, including durable video recovery and historical charge reproduction. The refreshed immutable image passed the [direct container video recovery subset](packaged-video-recovery-verification.md#direct-container-checkpoint), including historical charges, uncertainty and credential rotation. Current direct/Compose lifecycles and one workspace/key image upgrade have [local evidence](regression-and-recovery-verification.md#current-package-qualification--2026-10-08). The [queued/unknown video image upgrade subset](packaged-video-recovery-verification.md#video-image-upgrade-checkpoint--2026-10-08) also passed. Complete remaining video upgrade cases, result transport and recovery acceptance (V17, V20; M06–M08).
- [ ] Close remaining CI/formatting issues, protocol conformance and all desktop/narrow interaction reviews.
- [ ] Measure performance at fixed payloads/concurrency, including Guardrails overhead and failure behavior; set rollout thresholds from results. The [development preview measurement](guardrail-preview-performance-verification.md) covers validated local preview latency only; the complete performance matrix remains open.

## Acceptance and dependencies

Close a checkbox or gate only with evidence covering its entire requirement. Builds, mock fixtures, HTTP 200s and populated demo pages do not replace a real user workflow. Record a short evidence reference beside a completed item; keep chronological work logs out of this checklist.

Migration files and checksums remain immutable. A native reconstruction of HEAD’s sparse history upgraded to the current schema and reached readiness; complete packaged upgrade and persisted-data acceptance remain required. See [migration evidence](regression-and-recovery-verification.md#native-head-history-upgrade).

The refreshed immutable image passed direct and Compose packaged install/restart/restore and migration checksums. The direct run also passed the saved-video recovery subset; Compose does not execute that branch. A distinct-image workspace/key upgrade and injected migration-failure recovery passed on 2026-10-08; a queued/unknown video upgrade subset also passed. Broader video upgrade cases and complete release acceptance remain open. See [current packaging evidence](regression-and-recovery-verification.md#current-package-qualification--2026-10-08). External Supplier rights, terms and pricing evidence remain required for actual hosted resale or discount claims, separately from F07 integration capability. They do not block backend readiness or the remaining implementation and UX work.

Optional previews must name their qualified subset. The complete release still requires F01–F10; preview sequencing does not shrink scope.

## Supporting specifications and evidence

- [Video workflow foundations](video-job-storage-verification.md): configured schemas, durable job/recovery identity and guarded completion/settlement; owner-funded text-input video create, saved-state API/SDK, measured transport timings and opt-in query polling verified with local fixtures. Native process replacement recovers personal and prepaid jobs without resubmitting generation; prepaid recovery posts one debit and revoked-key recovery retains unresolved liability. Prepaid text-input dispatch, automatic recovery and local settlement retry have local fixture evidence. Live channels, complete customer-funded recovery, packaged recovery, results and end-to-end qualification remain open.
- [Personal Supplier management checkpoint](personal-supplier-management-verification.md): corrected owner-funded availability and private catalog labels, storage checks and desktop/phone review; complete multi-key Supplier onboarding remains open.
- [Backup smoke comparison checkpoint](backup-smoke-verification.md): stronger table-record restoration checks, native PostgreSQL fixture and packaging-script tests; actual container and restored-application acceptance remain open.
- [Current storage and packaged SDK checkpoint](current-storage-sdk-verification.md): 98 fresh storage tests and 108 tests against extracted SDK distribution/examples; full packaged-server acceptance remains open.
- [Product focus](../product/product-focus.md): positioning, measurement semantics and exclusions.
- [Workflow delivery requirements](../product/workflow-delivery-plan.md): Supplier/customer journey, Logs, Chat, keys and responsive review details.
- [Detailed acceptance requirements](first-release-acceptance.md): gateway request observability, full Guardrail controls and acceptance/performance cases.
- [Inference qualification](../reference/inference-qualification.md): supported boundaries and actual upstream evidence.
- [Guardrails dashboard verification](guardrails-dashboard-verification.md): rule editors, preview, history/restore, key assignments, blocked-request diagnosis, output-status filters and responsive checks; full management remains open.
- [Local input inspection](../reference/local-input-inspection.md): local input-rule coverage, live integration evidence and remaining qualification.
- [Historical evidence](first-release-evidence-2026-10-02.md): previous implementation checkpoints; not a release pass.
- [Packaged JavaScript inference client](sdk-inference-client-verification.md): basic live Chat, streaming, scoped credentials and customer ledger checks.
- [Supplier availability verification](supplier-availability-verification.md): effective route status and remaining qualification.
- [Workspace key activity verification](workspace-key-activity-verification.md): durable last-dispatch metadata, scoped reader access, compact actions and desktop/phone review; complete key and access qualification remains open.
- [Prepaid balance verification](prepaid-balance-verification.md): durable accounts, funding, reservations, approved credit, global Settings and a packed SDK account example verified for documented subsets; payment integration and full prepaid acceptance remain open.
- [Customer billing verification](customer-billing-verification.md): one real request reconciled through invoice, SDK and contract checks.
- [Customer charge breakdown verification](customer-charge-breakdowns-verification.md): customer-only model/key amounts, coverage, responsive grouping and model/key Logs drilldowns; mobile individual request details and one live retained Chat payload verified; full investigation qualification remains open.
- [Request finish-reason storage](request-finish-reasons-verification.md): allowlisted scoped immutable storage and Chat collection verified; request API/export, packed SDK and responsive Logs detail verified for the documented subset; broader protocol qualification remains open.
- [Request token categories](request-token-categories-verification.md): durable cache/reasoning observations, scoped exact aggregates, CSV fields, responsive Usage metric selection and per-request Logs details; complete protocol and live upstream coverage remain open.
- [Request export verification](request-export-verification.md): scoped CSV API and dashboard export, exact customer amounts, unknown values and bounded full-range behavior.
- [Logs retained-content verification](logs-content-verification.md): readable messages, secondary raw data, copy actions and collapsible tools; broader protocol coverage remains open.
- [Logs column verification](logs-columns-verification.md): URL column visibility/reset and mobile status/charge defaults.
- [Logs sorting verification](logs-sorting-verification.md): full-range ordering, pagination, matching exports and dashboard/SDK checks; live traversal limitations remain explicit.
- [Delivery-status verification](logs-delivery-status-verification.md): recorded HTTP/Unknown filters, full-range counts and matching Logs/CSV drilldowns; Provider completion and customer charges remain separate.
- [Latency percentile verification](latency-percentiles-verification.md): measured gateway-body Average/P50/P95/P99, sample coverage and responsive metric selection; broader performance diagnosis remains open.
- [Guardrails preview measurements](guardrails-preview-performance.md): fixed synthetic payload/concurrency results, explicit overload failures; production performance remains open.
- [Regression and recovery verification](regression-and-recovery-verification.md): native database restore, direct/Compose packaged lifecycle and distinct-image workspace/key upgrade checks; one queued/unknown video upgrade subset also passed; broader upgrade and release qualification remain open.
- [Legacy plan](first-release-legacy.md): retired R01–R23 scope, including removed task/subscription-routing obligations.


- [Payment aggregator integration](../reference/payment-aggregators.md): initial scope: EPay-compatible domestic payments and Stripe; existing Zhifux implementation is a separate adapter, not proof of EPay compatibility. Both integrations require end-to-end qualification.
- [Video metering foundation](video-metering-foundation-verification.md): exact calculations, immutable pricing/usage, shared-balance reservations and internal atomic settlement tested; video-route integration and Provider qualification remain open.

## Video generation scope supplement — F03, F04, F05, F06, F09, F10

**Status: schema, metering, text-input gateway dispatch and durable job/recovery/settlement foundations partially verified with local fixtures; complete video/asset/verification workflows and live Provider qualification pending.** The [video generation parity requirements](../product/workflow-delivery-plan.md#video-generation-parity--f03-f04-f05-f06-f09-f10) are mandatory for the requested video coverage. They supplement the existing F01–F10 scope without changing any gate to passed. Video jobs are asynchronous model API operations; external clients still own agent planning, tools and task acceptance.

- **F03/F04:** qualify the versioned video catalog, text/image inputs, model-specific generation controls, dedicated asynchronous create/query contracts, callbacks where supported, terminal errors and result retrieval. A catalog listing or generic Chat API example does not establish video capability.
- **F05/F06:** implement bounded video liability, pinned customer tariffs, exactly-once settlement and durable job/asset audit evidence linked to Logs, Usage and Billing. Keep reported usage, customer charges, Supplier expenses and unknown outcomes distinct.
- **F09:** enforce workspace/key and upstream-account isolation, safe media handling, retention and credential boundaries; complete explicit-consent real-person liveness verification and separately approved portrait-asset binding.
- **F10:** qualify the Video and asset workflows at desktop/narrow widths and ship matching API/SDK/docs and packaged recovery evidence. Cancellation, deletion, media-input support, result URL lifetime and notification guarantees remain unavailable until their exact contracts are qualified.

FastRouter's documented instance behavior is the comparison baseline. It does not establish upstream New API coverage, official model entitlements, Niu implementation or a live Supplier qualification pass.

### Required Seedance model and billing support — F03, F04, F05, F06

Niu must support Seedance-class video models, including the targeted 2.5 and 2.0/Fast/Mini variants, and their video billing mechanisms. This is required product scope. Exact metering, customer tariff snapshots, reservations and settlement have implementation foundations; complete Supplier pricing, media coverage and qualification remain pending. Unknown current prices do not defer the mechanism. The [Seedance model and metering acceptance matrix](../product/workflow-delivery-plan.md#required-seedance-model-and-billing-mechanism--f03-f04-f05-f06) supplements V01/V04/V13.

- **F03/F04:** versioned multimodal capability schemas describe qualified reference inputs and output duration, dimensions, resolution and frame rate. Meter adapters preserve video-token or other Provider-defined units and actual reported usage rather than forcing media into text input/output-token categories.
- **F05:** implement dimension-selected, versioned Supplier cost and customer selling rate cards, effective periods, minimum billable quantities, exact currency/precision and rounding, plus configurable discounts with explicit eligibility, priority and stacking rules. Before submission, estimate charges, check budget and reserve bounded liability under the applicable policy; reconcile final usage, charges and any state-dependent refund exactly once.
- **F06:** retain the applicable meter, dimensions, rate/discount revisions and effective amounts with each historical charge, making it explainable through Logs, Usage and Billing while enforcing customer/Supplier confidentiality.

Qualify each Provider's units, rates, media-input support and failure/cancellation/refund rules separately. Official Seedance token metering does not establish FastRouter's forwarding or billing contract. Example rates and promotions belong in configuration/evidence, never fixed product constants; all implementation and release gates remain pending.

- [Admin and Settings navigation checkpoint](admin-settings-navigation-verification.md): canonical Supplier administration, additive admin/customer navigation, global Settings dialog and responsive menu/draft checks; platform configuration and production authentication remain open.

### Local personal video browser checkpoint (2026-10-10)

One explicitly authorized owner-funded Grok Imagine Video 1.5 Lite request
completed: one second, 480p, 16:9. Submission, queued reload, successful preview
and MP4 download, same-intent history recovery, and the Video → Logs → result
round trip have actual desktop evidence in the
[frontend workflow checklist](frontend-workflow-checklist.md). No commercial
customer debit or settled upstream price is qualified by this test. Logs still
lacks retained video payloads. Provider model remains Unknown when omitted by
the upstream, as the attribution contract requires; failure,
expired-result, ordinary-role and narrow-width acceptance remain open.

### Supplier credential request limits — frontend acceptance

F03 includes the credential-scoped management contract in
[Upstream credential request limits](../reference/upstream-credential-request-limits.md).
The Admin Supplier API-key detail must provide:

- Current policy read and actionable loading/error recovery, with explicit
  Unlimited, zero (new dispatch blocked), and positive requests-per-minute states.
- An edit dialog with integer validation from zero through 1,000,000, explicit
  null for Unlimited, cancellation restoring saved values, and save/reload proof.
- Exact revision-string writes including initial revision zero, with 409 recovery
  requiring a fresh policy read rather than silently overwriting another edit.
- Immutable history with meaningful actor names, time, limit and pagination;
  internal revisions and credential IDs remain out of product labels.
- Platform-administrator access only; customer and Supplier membership must not
  expose this procurement control. Credential metadata edits preserve the policy.

Use the existing dialog primitives and current NIU.IO design system after actual
reference inspection and Stitch iteration. The customer-key limit component
currently accepts null or positive revisions, whereas this credential contract
starts with string zero; copying its revision validator would reject the initial
policy. UI qualification remains open. Backend dispatch/refusal, rolling-window
recovery and performance evidence are separate from this interface acceptance.
