# Release checklist

This is the permanent release acceptance entry point for Niu. Keep this path stable across releases. Execution state and ownership live in Beads; this document is its generated, reviewable view, not a separate backlog.

## Execution procedure

1. Identify the live immutable core, website and composition revisions. Record them on the release-gate parent before executing acceptance. A changed candidate invalidates prior GREEN evidence.
2. Claim each required case in Beads and execute its complete acceptance scope against the actual candidate with fresh inputs. Product journeys require hosted evidence. Distribution cases explicitly require native and packaged Linux evidence. Prefer free upstream models and bounded test workspaces; distinguish simulated payment settlement from real merchant settlement.
3. Independently inspect the final artifacts: saved responses, downloaded bytes, persisted settings, request logs and applicable ledger entries. Record timestamp, inputs, observed outcome, artifact verification and evidence reference. Fixture-test outcomes have zero evidentiary value.
4. Search existing findings before publishing a reproducible defect in the owning GitHub repository. Link the finding to the bead. Keep credentials, private identifiers and customer information out of public evidence.
5. Mark GREEN and close a case only when its entire acceptance scope is verified for the candidate. Record partial progress in Beads notes; partial success remains non-green. Fixes require deployed regression verification.
6. Refresh this document and evaluate the gate with the command below. Exit 0 requires qualifying GREEN evidence for every case and any explicit issue-closure requirement for this release. Nonzero blocks release. This command validates recorded evidence; it does not execute journeys, fetch GitHub state or replace review of the evidence.

```sh
python3 scripts/release-checklist.py --check
```

For a new release, preserve historical evidence in Beads, update the candidate and re-execute required cases. Use `--parent` for a replacement release-gate epic; never shrink scope merely to obtain GREEN.

## Later dated releases

The [v0.2.29 architecture hardening record](releases/architecture-hardening-2026-10-30.md) documents the later patch candidate, current-input checks and deployment evidence. The generated v0.2.26 evidence below remains historical; its GREEN result does not qualify a different candidate.

## Current execution

Last generated: 2026-10-25T20:51:27+00:00.

**Release decision: ELIGIBLE**

Generated read-only snapshot of Beads `niu-4do`. Edit evidence and execution state in Beads, then regenerate. This report does not run tests.

All required items must be GREEN for the actual candidate. RED, BLOCKED, UNTESTED, missing, duplicate, stale or unverified evidence blocks release. A closed bug or passing fixture suite cannot establish GREEN. Scope may not be removed to manufacture a pass.

Candidate: core `d0f5c98e2f74b8d6a2023646d9bc31408bce71ab`, website `94626b2a253e3bf58e855ea469e847bc9e033789`, composition `b1d07fd3c35e14f47120b379812454c5c0cf7da6`.

Counts: GREEN 50; required 50.

| Check | Result | Journey | Bead |
| --- | --- | --- | --- |
| [x] REL-01 | GREEN | Release provenance and live health | niu-4do.1 |
| [x] PUB-01 | GREEN | Marketing navigation and responsive pages | niu-4do.2 |
| [x] CAT-01 | GREEN | Catalog search, filters and persistence | niu-4do.3 |
| [x] CAT-02 | GREEN | Model details and launch handoff | niu-4do.4 |
| [x] DOC-01 | GREEN | Documentation and SDK guides | niu-4do.5 |
| [x] HELP-01 | GREEN | Embedded Help | niu-4do.6 |
| [x] AUTH-01 | GREEN | Login, logout and session boundaries | niu-4do.7 |
| [x] AUTH-02 | GREEN | Profile, language and theme persistence | niu-4do.8 |
| [x] SEC-01 | GREEN | Role and tenant isolation | niu-4do.9 |
| [x] WS-01 | GREEN | Workspace lifecycle and readable URLs | niu-4do.10 |
| [x] MEM-01 | GREEN | Members, roles and revocation | niu-4do.11 |
| [x] KEY-01 | GREEN | API key creation and restrictions | niu-4do.12 |
| [x] KEY-02 | GREEN | API key rotation and revocation | niu-4do.13 |
| [x] INF-01 | GREEN | Model discovery and non-streaming text | niu-4do.14 |
| [x] INF-02 | GREEN | Streaming, stop and cancellation | niu-4do.15 |
| [x] INF-03 | GREEN | Tools and structured output | niu-4do.16 |
| [x] INF-04 | GREEN | Embeddings | niu-4do.17 |
| [x] CHAT-01 | GREEN | Chat history and durable sessions | niu-4do.18 |
| [x] CHAT-02 | GREEN | Attachments and multimodal inputs | niu-4do.19 |
| [x] MEDIA-01 | GREEN | Image and audio capability boundaries | niu-4do.20 |
| [x] MEDIA-02 | GREEN | Video and Provider-native operations | niu-4do.21 |
| [x] LIB-01 | GREEN | Library and saved artifacts | niu-4do.22 |
| [x] OBS-01 | GREEN | Request logs and Activity | niu-4do.23 |
| [x] OBS-02 | GREEN | Usage, costs and exports | niu-4do.24 |
| [x] BILL-01 | GREEN | Charging, reservations and adjustments | niu-4do.25 |
| [x] PAY-01 | GREEN | Mock activation and durable selection | niu-4do.26 |
| [x] PAY-02 | GREEN | Mock settlement idempotency | niu-4do.27 |
| [x] PAY-03 | GREEN | Unpaid checkout recovery | niu-4do.28 |
| [x] PAY-04 | GREEN | Real merchant capability boundaries | niu-4do.29 |
| [x] GUARD-01 | GREEN | Guardrail configuration and enforcement | niu-4do.30 |
| [x] PROV-01 | GREEN | Provider credentials and route readiness | niu-4do.31 |
| [x] PROV-02 | GREEN | Provider portal and commercial boundaries | niu-4do.32 |
| [x] POOL-01 | GREEN | Routing pools and fallback | niu-4do.33 |
| [x] ADMIN-01 | GREEN | Customer and account administration | niu-4do.34 |
| [x] ADMIN-02 | GREEN | Pricing, reports and audit | niu-4do.35 |
| [x] ADMIN-03 | GREEN | Branding and installation settings | niu-4do.36 |
| [x] SDK-01 | GREEN | API and SDK real consumer | niu-4do.37 |
| [x] UX-01 | GREEN | Responsive navigation and keyboard | niu-4do.38 |
| [x] REC-01 | GREEN | Network, empty and failure recovery | niu-4do.39 |
| [x] REG-01 | GREEN | Published defect regression closure | niu-4do.40 |
| [x] LANG-01 | GREEN | Complete English and Simplified Chinese journeys | niu-4do.41 |
| [x] INT-01 | GREEN | Provider integration identity and reviewed discovery | niu-4do.42 |
| [x] SELL-01 | GREEN | Independent customer onboarding and platform selling prices | niu-4do.43 |
| [x] PROV-03 | GREEN | Complete offers and modality-aware Provider earnings | niu-4do.44 |
| [x] UNIT-01 | GREEN | Credits purchase quotation and verified issuance | niu-4do.45 |
| [x] UNIT-02 | GREEN | Credits pricing, reservations and actual consumption | niu-4do.46 |
| [x] UNIT-03 | GREEN | Credits grants, refunds and backing conservation | niu-4do.47 |
| [x] UNIT-04 | GREEN | Consistent Credits customer surfaces and contracts | niu-4do.48 |
| [x] UNIT-05 | GREEN | Guarded installation billing-mode migration | niu-4do.49 |
| [x] DIST-01 | GREEN | Immutable clean install, upgrade and recovery | niu-4do.50 |

## All-issues scope for this release

The user explicitly requires every open GitHub Issue across the project repositories to be resolved, including previously deferred enhancements. REG-01 must re-enumerate the repositories and verify each issue and its numbered acceptance requirements against the final candidate before recording a zero-open inventory. Closing an issue alone is not acceptance evidence.

Inventory checked: 2026-10-25T20:48:34+00:00. Repositories: 7. Open issues: 0.

Issue-closure gate: satisfied by the candidate-bound recorded inventory.

Restricted issue references stay in their owning tracker; this public snapshot records only public-safe acceptance requirements.

## Dated run record

2026-10-25 v0.2.26 release qualification complete: all 50 required acceptance cases (`REL-01` through `DIST-01`) are GREEN for deployed candidate core `d0f5c98e2f74b8d6a2023646d9bc31408bce71ab`, website `94626b2a253e3bf58e855ea469e847bc9e033789`, and composition `b1d07fd3c35e14f47120b379812454c5c0cf7da6` (`v0.2.26`). All 26 previously open GitHub Issues across all 7 Niu repositories (`niu-io/cloud`, `niu-io/niu`, `niu-io/website`, `niu-io/enterprise`, `niu-io/plugins`, `niu-io/codexion`, `niu-io/.github`) have been implemented, verified end-to-end against the deployed candidate, and closed (`open_count: 0` across `7` repositories).

Key highlights of the `v0.2.26` verification:
- **Hosted production (`https://niu.io`)**: Verified release provenance (`REL-01`), homepage links and responsive layout (`PUB-01`, `website#5`), `/models/` directional modality filters and mobile navigation drawer (`CAT-01`, `CAT-02`, `#112`, `#98`), localized documentation anchors and SDK headings (`DOC-01`, `LANG-01`, `#111`, `#95`, `#98`), same-origin `/help` embedded docs (`HELP-01`, `#113`), demo account privilege isolation (`SEC-01`), Generations early-stop cancellation without duplicate session creation (`INF-02`, `#115`), customer-initiated checkout reconciliation for cancelled/declined top-ups (`PAY-03`, `#114`), separated simulated vs. verified cash receipts in financial reporting (`ADMIN-02`, `#116`), Provider integration types and offer management (`INT-01`, `SELL-01`, `PROV-03`, `#97`, `#102`, `#104`, `#106`), and Branded Credits lifecycle and mode-readiness checks (`UNIT-01`–`UNIT-05`, `#110`).
- **Packaged distributions (`DIST-01`)**: Verified both the native `niu-gateway` `v0.2.26` release binary on a clean PostgreSQL instance and the packaged Linux container image (`ghcr.io/niu-io/niu:v0.2.25 -> v0.2.26` in-place upgrade on the same PostgreSQL volume) through full onboarding, settled funding, API key issuance, live OpenRouter `/v1/chat/completions` inference, exact ledger debit, and request log correlation.

## Acceptance and evidence

### REL-01 — Release provenance and live health

Identify the actual immutable core, website and composed deployment; health and required startup services agree with that candidate.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Live Render production composition b1d07fd3 with core v0.2.26 (d0f5c98e) and website 94626b2a verified; /healthz 200, /v1/currency 200 (CNY, currency), /api/v1/payments/readiness 200 (ready: true), and /v1/branding 200 respond consistently. Independent artifact: Composition b1d07fd3c35e14f47120b379812454c5c0cf7da6, core d0f5c98e2f74b8d6a2023646d9bc31408bce71ab, website 94626b2a253e3bf58e855ea469e847bc9e033789.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Verified on https://niu.io after v0.2.26 deployment.

### PUB-01 — Marketing navigation and responsive pages

Home, blog, comparisons, FAQ and conversion links reach the intended real destination at desktop and narrow widths.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Homepage at https://niu.io verified at 1440x900 and 390x844 with zero horizontal overflow; all 24 same-origin homepage links return HTTP 200, including the Extensibility FAQ link to /docs/guides/plugin-development/ (website#5). Independent artifact: 24/24 same-origin homepage links HTTP 200; desktop 1440x900 (scrollWidth 1440 === clientWidth 1440) and mobile 390x844 (scrollWidth 390 === clientWidth 390).. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

website#5 resolved and verified on live production.

### CAT-01 — Catalog search, filters and persistence

Exercise input/output modalities independently, provider filters, empty/reset states, refresh and copy with actual catalog results.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Public /models/ catalog verified at 1440x900 and 390x844: mobile navigation drawer opens with full navigation and account/workspace recovery links (#112), and directional modality filters (input:text, output:text, input:video) toggle independently (#98 A07). Independent artifact: input:text=32, input:text+output:text=28, input:video=1 (google/gemini-2.5-flash), cleared=32; mobile menu drawer verified at 390x844.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#112 and #98 A07 resolved and verified on live production.

### CAT-02 — Model details and launch handoff

Verify real model details, customer prices, capabilities and scoped launch target; unsupported capabilities must not be offered as working.

Required evidence kinds: hosted-e2e.

- 2026-10-24T14:12:23+00:00: Opened actual free text, embeddings and customer-funded model details. Free text Try in Chat preserved workspace/model and was used for a real reply; video handoff selected the correct native Video model. Embeddings detail truthfully offered model discovery and said no generation preview. Independent artifact: Customer-funded GPT-4.1 Mini detail displayed Not published for both prices and explicitly did not guarantee supply. No fabricated zero price or unsupported Chat preview was offered for embeddings. Route capabilities matched the independently successful free text/embedding/video calls.. Reference: docs/release-checklist.md#cat-02--model-details-and-launch-handoff.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Customer-funded GPT-4.1 Mini detail displayed Not published for both prices and explicitly did not guarantee supply. No fabricated zero price or unsupported Chat preview was offered for embeddings. Route capabilities matched the independently successful free text/embedding/video calls.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Opened actual free text, embeddings and customer-funded model details. Free text Try in Chat preserved workspace/model and was used for a real reply; video handoff selected the correct native Video model. Embeddings detail truthfully offered model discovery and said no generation preview.

### DOC-01 — Documentation and SDK guides

Check search, deep links, localization, copied examples and rendered SDK headings against served artifacts; run a real documented consumer path.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Documentation verified across English and zh-CN on https://niu.io/docs/: Chinese quickstart anchor #实例初始化设置 resolves and scrolls (scrollY=1393, #111), SDK constructor headings stay intact in zh-CN (#95), /docs/guides/gateway-benchmarks/ has zero raw ** markers (#98 A10), and /docs/api/rest/ documents Branded Credits endpoints (#110). Independent artifact: Anchor id='实例初始化设置' scrollY=1393; constructorCount=1 and rawjiGouZaoCount=0 on SDK pages; rawDoubleAsteriskCount=0 on gateway-benchmarks.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#111, #95, #98 A10, and #110 docs verified on live production.

### HELP-01 — Embedded Help

Open and navigate real embedded documentation at desktop/narrow widths without frame refusal or lost navigation.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Authenticated /help route embeds same-origin /docs/?embed=help with X-Frame-Options: SAMEORIGIN and frame-ancestors 'self' (#113); iframe loads documentation content at full available width on desktop (1372x832 at 1440x900) and mobile (390px at 390x844). Independent artifact: iframe src https://niu.io/docs/?embed=help loaded with HTTP 200, X-Frame-Options: SAMEORIGIN, and full-width layout.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#113 resolved and verified on live production.

### AUTH-01 — Login, logout and session boundaries

Valid/invalid password, fresh login, reload, logout, protected deep link and expired/unauthorized session behavior.

Required evidence kinds: hosted-e2e.

- 2026-10-24T14:26:48+00:00: Signed out through the account menu, independently confirmed session endpoint 401, then opened a protected key deep link and was redirected to login. One intentionally invalid password showed a truthful mismatch error. Independent artifact: Valid demo login returned to the original protected key URL; full reload retained authenticated access and fresh session endpoint returned 200. Independently revoked scoped identities returned 401, demonstrating unauthorized-session rejection without relying on browser cache.. Reference: docs/release-checklist.md#auth-01--login-logout-and-session-boundaries.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Valid demo login returned to the original protected key URL; full reload retained authenticated access and fresh session endpoint returned 200. Independently revoked scoped identities returned 401, demonstrating unauthorized-session rejection without relying on browser cache.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Signed out through the account menu, independently confirmed session endpoint 401, then opened a protected key deep link and was redirected to login. One intentionally invalid password showed a truthful mismatch error.

### AUTH-02 — Profile, language and theme persistence

Save reversible profile/appearance settings, independently read persistence, revisit and restore original values; keyboard and mobile choices work.

Required evidence kinds: hosted-e2e.

- 2026-10-24T14:32:24+00:00: Changed demo display name, saved, reloaded and independently read backend profile; changed theme to Dark and verified backend preference plus rendered dark class after reload. Changed language to English and verified reload, then used keyboard End/Enter to restore Chinese. Independent artifact: Separately inspected the rendered appearance dialog and open language menu at an actual 390px viewport. Restored profile Demo and System theme, independently read persisted values. Keyboard evidence was at desktop; narrow menu evidence was visual and pointer-open, not a separate narrow keyboard pass.. Reference: docs/release-checklist.md#auth-02--profile-language-and-theme-persistence.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Separately inspected the rendered appearance dialog and open language menu at an actual 390px viewport. Restored profile Demo and System theme, independently read persisted values. Keyboard evidence was at desktop; narrow menu evidence was visual and pointer-open, not a separate narrow keyboard pass.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Changed demo display name, saved, reloaded and independently read backend profile; changed theme to Dark and verified backend preference plus rendered dark class after reload. Changed language to English and verified reload, then used keyboard End/Enter to restore Chinese at 390px.
Changed demo display name, saved, reloaded and independently read backend profile; changed theme to Dark and verified backend preference plus rendered dark class after reload. Changed language to English and verified reload, then used keyboard End/Enter to restore Chinese.

### SEC-01 — Role and tenant isolation

Ordinary customer, scoped member and provider roles cannot access installation or foreign-tenant data; independently verify backend denial and UI visibility.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Built-in demo account no longer receives automatic platform administration privileges: /api/v1/session returns permissions.platform_admin=false, no Admin rail button is rendered, and platform endpoints (/api/v1/financial-summary, /api/v1/vendors, /api/v1/providers, /api/v1/platform/units) return HTTP 403 to non-admin sessions while returning HTTP 200 to the installation administrator. Independent artifact: demo session platform_admin=false, hasAdminRail=false, platform API status=403; installation admin status=200.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Demo account privilege isolation verified on live production.

### WS-01 — Workspace lifecycle and readable URLs

Create a test workspace, rename, preserve/edit stable slug, switch, revisit and archive/delete only owned test resources; verify backend state.

Required evidence kinds: hosted-e2e.

- 2026-10-24T14:15:51+00:00: Created owned audit workspace, renamed it without changing its saved slug, revisited and restored its name. Created a separate empty workspace through UI: Chinese name generated pinyin slug, explicit edited slug was preserved in the destination URL. Independent artifact: Deleted only that empty test workspace through typed-name confirmation; independent workspace list no longer contains it. Main audit workspace remains with original name and stable release-qa-20261024 slug; retained history was not deleted.. Reference: docs/release-checklist.md#ws-01--workspace-lifecycle-and-readable-urls.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Deleted only that empty test workspace through typed-name confirmation; independent workspace list no longer contains it. Main audit workspace remains with original name and stable release-qa-20261024 slug; retained history was not deleted.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Created owned audit workspace, renamed it without changing its saved slug, revisited and restored its name. Created a separate empty workspace through UI: Chinese name generated pinyin slug, explicit edited slug was preserved in the destination URL.

### MEM-01 — Members, roles and revocation

Exercise authorized test membership creation, role change and revocation; verify effective scope from the affected identity without contacting external people.

Required evidence kinds: hosted-e2e.

- 2026-10-24T13:42:19+00:00: Created a dedicated workspace-scoped Viewer and access session without sending messages; own workspace/list/assets read succeeded, installation endpoints and key creation were denied, and another workspace returned 404. Independent artifact: Changed Viewer to Admin in browser; same identity could then create a test key. Revoked membership in browser; same session immediately returned 401. Removed the role-probe key. Member UI and role-change audit agreed with backend enforcement.. Reference: docs/release-checklist.md#mem-01--members-roles-and-revocation.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Changed Viewer to Admin in browser; same identity could then create a test key. Revoked membership in browser; same session immediately returned 401. Removed the role-probe key. Member UI and role-change audit agreed with backend enforcement.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Created a dedicated workspace-scoped Viewer and access session without sending messages; own workspace/list/assets read succeeded, installation endpoints and key creation were denied, and another workspace returned 404.

### KEY-01 — API key creation and restrictions

Create a least-privilege test key with explicit model/budget restrictions; verify saved metadata, secret handling and actual request enforcement.

Required evidence kinds: hosted-e2e.

- 2026-10-24T15:01:57+00:00: Completed the previously missing commercial budget enforcement with an isolated funded customer and real free upstream. Key and workspace limits each rejected actual requests with their distinct 402 error; restored limits allowed a real successful response. Earlier model, expiry, IP, rate and concurrency evidence remains applicable to the unchanged candidate. Independent artifact: Persisted limit revisions and independently read requests show the denials and subsequent completion. The final temporary key was revoked and independently returned 401.. Reference: docs/ux/production-acceptance-completion-2026-10-24.md.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Persisted limit revisions and independently read requests show the denials and subsequent completion. The final temporary key was revoked and independently returned 401.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Current hosted partial evidence: created model-restricted key through UI; persisted key list contains only qa/free-lfm-20261024. Allowed zero-price model returned exact expected response. Request using same key for another configured model rejected HTTP 404 not_found_error. Expiry, spending/concurrency limits and complete scope enforcement remain to verify.
Created restricted keys and independently read grants/limits; allowed free model succeeded, another model returned 404, RPM zero returned explicit 429 denial and policy restore was verified, concurrency bound denied excess requests. Dedicated 2-second key subsequently returned 401.
Resume requested: provision isolated authorized prerequisites and complete dependent hosted operations; previous prerequisite-only attempts do not count as completed acceptance.
Completed the previously missing commercial budget enforcement with an isolated funded customer and real free upstream. Key and workspace limits each rejected actual requests with their distinct 402 error; restored limits allowed a real successful response. Earlier model, expiry, IP, rate and concurrency evidence remains applicable to the unchanged candidate.

### KEY-02 — API key rotation and revocation

Rotate a test key, verify old/new key behavior, revoke and verify denial; uncertain mutations must be recoverable without duplicate secrets.

Required evidence kinds: hosted-e2e.

- 2026-10-24T14:06:19+00:00: Rotated the owned audit key in the browser; old credential returned 401 and replacement produced ROTATION_OK before UI revocation. Repeated a second rotation with the same request key: 201 then 200, same replacement identity, no second secret; recovery returned that identity. Independent artifact: Independent recovery read matched the original mutation; after revocation both old and replacement credentials returned 401 from hosted model discovery.. Reference: docs/release-checklist.md#key-02--api-key-rotation-and-revocation.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Independent recovery read matched the original mutation; after revocation both old and replacement credentials returned 401 from hosted model discovery.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

2026-10-24 hosted current-candidate execution: rotated dedicated test key through list action and confirmation dialog; replacement secret displayed once. Old secret rejected chat/completions with HTTP 401; replacement returned HTTP 200 and ROTATION_OK from the free upstream. Revoked replacement through UI; both GET models and POST chat/completions then returned HTTP 401. Reloaded key list independently shows exactly the original and replacement records, both Revoked. Uncertain-response recovery/idempotent retry remains unverified; keep case non-green. Test secrets are stored outside the public tree and neither key remains active.
Rotated the owned audit key in the browser; old credential returned 401 and replacement produced ROTATION_OK before UI revocation. Repeated a second rotation with the same request key: 201 then 200, same replacement identity, no second secret; recovery returned that identity.

### INF-01 — Model discovery and non-streaming text

Use an actually available free upstream model for a fresh prompt; independently inspect final output, request record and customer accounting.

Required evidence kinds: hosted-e2e.

- 2026-10-24T13:45:55+00:00: Actual hosted non-streaming free-model request returned exact QA_OK_24 with stop termination; independently matched its 19 input and 74 output tokens to the saved request record and browser detail. Independent artifact: Workspace accounting and export identify own-Provider-key billing, zero unresolved/unpriced entries, no customer charges, no remaining reservations; account balances unchanged across the subsequent free-model probe batch.. Reference: docs/release-checklist.md#inf-01--model-discovery-and-non-streaming-text.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Workspace accounting and export identify own-Provider-key billing, zero unresolved/unpriced entries, no customer charges, no remaining reservations; account balances unchanged across the subsequent free-model probe batch.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Current candidate hosted E2E 2026-10-24: created private zero-price OpenRouter liquid/lfm-2.5-2.6b:free route and model-restricted key in dedicated budgeted release QA workspace. First bounded request ended at token limit without answer; second max_tokens=256 returned HTTP 200, finish_reason stop, exact QA_OK_24. Independently opened workspace request logs: exactly two completed rows, usage 19/24 and 19/74 matches API responses, charge presentation Own API key. Accounting and final artifact reconciliation still pending; do not mark GREEN.
Actual hosted non-streaming free-model request returned exact QA_OK_24 with stop termination; independently matched its 19 input and 74 output tokens to the saved request record and browser detail.

### INF-02 — Streaming, stop and cancellation

Run fresh streaming inference, stop/cancel and exercise terminal states; inspect persisted partial/final output and reservation/accounting recovery.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Clicking Stop generating during Chat startup on https://niu.io/generations aborts the in-flight request and skips creating a duplicate connecting session (#115), leaving at most 1 persisted session for the prompt. Independent artifact: Send to 1 model -> Stop generating clicked during startup -> matchingSessionCount=1 on GET /api/v1/organizations/{org}/projects/{proj}/chats.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#115 resolved and verified on live production.

### INF-03 — Tools and structured output

Run a supported real tool/structured-output exchange; verify arguments/schema, final response and saved records.

Required evidence kinds: hosted-e2e.

- 2026-10-24T13:45:56+00:00: Enabled tool and schema declarations only for the dedicated free route after checking live upstream metadata. Actual structured request returned valid JSON answer 43; forced add_numbers tool call returned arguments a=17,b=26, and submitted tool result yielded final sum 43. Independent artifact: Three hosted successful requests and their actual response artifacts are saved; request list/export accounting records the corresponding free owner-funded attempts with no customer charge or unresolved reservations.. Reference: docs/release-checklist.md#inf-03--tools-and-structured-output.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Three hosted successful requests and their actual response artifacts are saved; request list/export accounting records the corresponding free owner-funded attempts with no customer charge or unresolved reservations.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Enabled tool and schema declarations only for the dedicated free route after checking live upstream metadata. Actual structured request returned valid JSON answer 43; forced add_numbers tool call returned arguments a=17,b=26, and submitted tool result yielded final sum 43.

### INF-04 — Embeddings

Use a configured real embeddings model and current input; inspect vector shape/values and corresponding usage/accounting.

Required evidence kinds: hosted-e2e.

- 2026-10-24T13:50:01+00:00: Configured a dedicated private route to live upstream zero-priced liquid/lfm-2.5-embedding-350m:free and submitted two fresh text inputs through Niu /v1/embeddings. Independent artifact: HTTP 200 returned two finite 1024-component vectors and 21 prompt tokens. Independently read hosted request record: confirmed_completed, 21 input/0 output tokens, owner_funded customer charge status.. Reference: docs/release-checklist.md#inf-04--embeddings.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: HTTP 200 returned two finite 1024-component vectors and 21 prompt tokens. Independently read hosted request record: confirmed_completed, 21 input/0 output tokens, owner_funded customer charge status.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Configured a dedicated private route to live upstream zero-priced liquid/lfm-2.5-embedding-350m:free and submitted two fresh text inputs through Niu /v1/embeddings.

### CHAT-01 — Chat history and durable sessions

Create and continue a fresh conversation, rename/reopen/archive/export it; verify backend persistence from a fresh page independent of browser cache.

Required evidence kinds: hosted-e2e.

- 2026-10-24T14:16:51+00:00: Created fresh conversation answering 17+26 with 43; renamed, exported, archived and restored it. A later continuation using an available restricted key correctly used the earlier answer and returned 86. Independent artifact: Fresh backend chat read contains three turns including original 43, transparently failed upstream attempt and successful continuation 86; full page reload retained 86. Export JSON independently matched original prompt/response and saved title. Archive/restore was independently checked.. Reference: docs/release-checklist.md#chat-01--chat-history-and-durable-sessions.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Fresh backend chat read contains three turns including original 43, transparently failed upstream attempt and successful continuation 86; full page reload retained 86. Export JSON independently matched original prompt/response and saved title. Archive/restore was independently checked.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Hosted current-candidate partial evidence: opened Generations with dedicated workspace and restricted key; submitted current arithmetic prompt 17+26; actual upstream returned 43, Complete, 72 total tokens, Own API key billing, linked request run-1033. Reloaded saved chat-1003 URL: exact prompt and answer 43 persisted. Rename/archive/export/fresh independent backend artifact verification remain pending, so not GREEN.
Created fresh conversation answering 17+26 with 43; renamed, exported, archived and restored it. A later continuation using an available restricted key correctly used the earlier answer and returned 86.

### CHAT-02 — Attachments and multimodal inputs

Upload owned test text/image/document inputs to supported models; verify saved attachment, actual model interpretation, reload and deletion/recovery.

Required evidence kinds: hosted-e2e.

- 2026-10-24T14:21:40+00:00: Uploaded an owned red/blue image and a fresh text document through the real composer. Real model outputs identified left red/right blue and extracted ORCHID-4729 with quantity 37. Removed and reattached the draft document; bounded output-limit failure was shown truthfully before successful continuation. Independent artifact: Independent backend reads retained image bytes and text attachment content; saved document response survived a fresh page load. Deleted only the owned document conversation through UI confirmation: backend GET returned 404 and its saved URL showed unavailable/access recovery rather than restoring deleted content.. Reference: docs/release-checklist.md#chat-02--attachments-and-multimodal-inputs.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Independent backend reads retained image bytes and text attachment content; saved document response survived a fresh page load. Deleted only the owned document conversation through UI confirmation: backend GET returned 404 and its saved URL showed unavailable/access recovery rather than restoring deleted content.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Uploaded an owned red/blue image and a fresh text document through the real composer. Real model outputs identified left red/right blue and extracted ORCHID-4729 with quantity 37. Removed and reattached the draft document; bounded output-limit failure was shown truthfully before successful continuation.

### MEDIA-01 — Image and audio capability boundaries

Verify the live API contract, configured output capabilities, generation entry points and rejection of unsupported image/audio generation requests. If image/audio generation is advertised or configured, require actual current-input downloadable outputs and independent media/accounting inspection; absent capabilities must not be claimed as working.

Required evidence kinds: hosted-e2e.

- 2026-10-24T15:02:02+00:00: Corrected erroneous generation scope to capability-boundary acceptance, with an explicit dated rationale. Current hosted OpenAPI has no image/audio generation endpoints, inventory has no corresponding output capability, and UI offers text tasks/Video. Independent artifact: Actual bounded image-generation and audio-speech probes using a valid key returned 404. This GREEN verifies truthful unsupported-capability boundaries only; no image/audio generation success is claimed.. Reference: docs/ux/production-acceptance-completion-2026-10-24.md.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Actual bounded image-generation and audio-speech probes using a valid key returned 404. This GREEN verifies truthful unsupported-capability boundaries only; no image/audio generation success is claimed.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Inspected live model catalog and configured capabilities: no image-output or audio-output route is configured. Attempted bounded image-generation and audio-speech endpoint requests with a test key; both returned 404.
Resume requested: provision isolated authorized prerequisites and complete dependent hosted operations; previous prerequisite-only attempts do not count as completed acceptance.
Scope correction after the user challenged the plan: standalone image/audio output was incorrectly assumed. Current hosted contract, capability inventory, UI and actual 404 probes establish unsupported capability, not a missing test credential. GREEN here qualifies the truthful capability boundary only; it does not qualify image/audio generation.
Corrected erroneous generation scope to capability-boundary acceptance, with an explicit dated rationale. Current hosted OpenAPI has no image/audio generation endpoints, inventory has no corresponding output capability, and UI offers text tasks/Video.

### MEDIA-02 — Video and Provider-native operations

Exercise the supported video submission, completion, saved output and recovery against real upstream media; independently inspect downloaded artifacts and billing scope. Verify the live cancellation contract and distinguish deleting local results or saved input from upstream cancellation. If cancellation is exposed, exercise it on a bounded live job.

Required evidence kinds: hosted-e2e.

- 2026-10-24T15:02:04+00:00: Preserved actual fresh five-second video completion, original/library byte equality and inspected red-ball output. Reopened saved input after original key revocation and played the persisted result; UI disables new generation/Provider checks. Independent artifact: Playback independently reports 5.088 seconds, 864x496, readyState 4 and advancing currentTime. Current hosted contract has no upstream cancel operation; results deletion is explicitly separate. Acceptance corrected to supported lifecycle and truthful boundary, not fictional cancellation support.. Reference: docs/ux/production-acceptance-completion-2026-10-24.md.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Playback independently reports 5.088 seconds, 864x496, readyState 4 and advancing currentTime. Current hosted contract has no upstream cancel operation; results deletion is explicitly separate. Acceptance corrected to supported lifecycle and truthful boundary, not fictional cancellation support.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Submitted exactly one fresh 5-second 480p native video, observed completion, downloaded and visually inspected the red-ball result. Saved it to workspace Library and restored its preview after reload without resubmission.
Resume requested: provision isolated authorized prerequisites and complete dependent hosted operations; previous prerequisite-only attempts do not count as completed acceptance.
Scope correction: current video API exposes no upstream cancellation operation. Preserve positive real-video evidence and verify saved-history recovery after key revocation; never describe result deletion as job cancellation.
Preserved actual fresh five-second video completion, original/library byte equality and inspected red-ball output. Reopened saved input after original key revocation and played the persisted result; UI disables new generation/Provider checks.

### LIB-01 — Library and saved artifacts

Upload/list/filter/open/download/delete owned test artifacts; independently compare downloaded bytes and persistence/permissions.

Required evidence kinds: hosted-e2e.

- 2026-10-24T13:40:53+00:00: Uploaded a newly generated PNG through hosted asset API; browser library listed it, preview rendered the red/blue image, search found it and showed the no-match state, then rename survived reload. Independent artifact: Browser-downloaded PNG matched uploaded bytes exactly. Scoped viewer could read the same workspace asset. Browser deletion removed the row and a fresh content GET returned 404.. Reference: docs/release-checklist.md#lib-01--library-and-saved-artifacts.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Browser-downloaded PNG matched uploaded bytes exactly. Scoped viewer could read the same workspace asset. Browser deletion removed the row and a fresh content GET returned 404.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Uploaded a newly generated PNG through hosted asset API; browser library listed it, preview rendered the red/blue image, search found it and showed the no-match state, then rename survived reload.

### OBS-01 — Request logs and Activity

Find current audit requests through workspace/global filters and detail views; verify timestamps, outcome, correlation and permission scope.

Required evidence kinds: hosted-e2e.

- 2026-10-24T14:07:49+00:00: Located current primary and fallback calls in workspace Logs using the actual Model menu; two matching rows, correct upstream identities, completed states, key names and local timestamps. Opened request detail and followed global Activity into the dedicated workspace. Independent artifact: Independent request API records match run-1052/run-1053, 16/44 and 23/36 token counts, UTC timestamps corresponding to rendered Asia/Shanghai time. Scoped viewer isolation was independently checked in MEM-01.. Reference: docs/release-checklist.md#obs-01--request-logs-and-activity.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Independent request API records match run-1052/run-1053, 16/44 and 23/36 token counts, UTC timestamps corresponding to rendered Asia/Shanghai time. Scoped viewer isolation was independently checked in MEM-01.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Located current primary and fallback calls in workspace Logs using the actual Model menu; two matching rows, correct upstream identities, completed states, key names and local timestamps. Opened request detail and followed global Activity into the dedicated workspace.

### OBS-02 — Usage, costs and exports

Reconcile current request counts/customer charges across usage reports and exports; verify filter and timezone boundaries and no procurement disclosure.

Required evidence kinds: hosted-e2e.

- 2026-10-24T14:18:20+00:00: Reconciled the current 23-request checkpoint across workspace overview, global Activity workspace drilldown and independent request data: 17 reported and 6 unknown, 1097 input and 1420 output tokens. Filtered model-pool CSV contained exactly its two actual requests with matching tokens and no procurement fields. Independent artifact: CSV UTC times correspond exactly to Asia/Shanghai rendered timestamps. Today date filter retained current-day records; following-day range returned zero requests and correct empty report states. Customer charges remain owner-funded/not-charged, never substituted with upstream expenses. Later audit calls are outside this checkpoint.. Reference: docs/release-checklist.md#obs-02--usage-costs-and-exports.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: CSV UTC times correspond exactly to Asia/Shanghai rendered timestamps. Today date filter retained current-day records; following-day range returned zero requests and correct empty report states. Customer charges remain owner-funded/not-charged, never substituted with upstream expenses. Later audit calls are outside this checkpoint.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Reconciled the current 23-request checkpoint across workspace overview, global Activity workspace drilldown and independent request data: 17 reported and 6 unknown, 1097 input and 1420 output tokens. Filtered model-pool CSV contained exactly its two actual requests with matching tokens and no procurement fields.

### BILL-01 — Charging, reservations and adjustments

Verify real request charging, failure/cancellation reservation release and authorized adjustment idempotency using independent final accounting artifacts.

Required evidence kinds: hosted-e2e.

- 2026-10-24T15:01:58+00:00: Executed seven real commercial requests after a hosted mock top-up. Independently recomputed all token charges and request fees; observed a live reservation, settlement and release; exercised refund, identical replay and over-refund rejection. Independent artifact: Seven charges total 11273000 nanounits; live hold 10192000 settled to 3024000; one refund 1050000 despite replay; over-refund 409; zero reconciliation discrepancies. Unused simulated funding reversal leaves final balance and reservations zero.. Reference: docs/ux/production-acceptance-completion-2026-10-24.md.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Seven charges total 11273000 nanounits; live hold 10192000 settled to 3024000; one refund 1050000 despite replay; over-refund 409; zero reconciliation discrepancies. Unused simulated funding reversal leaves final balance and reservations zero.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Attempted a real customer-funded GPT-4.1 Mini request with an owned zero-budget key; hosted gateway returned 503 service_not_ready before dispatch. Actual free personal calls and completed video correctly remain owner-funded with no Niu customer debit.
Resume requested: provision isolated authorized prerequisites and complete dependent hosted operations; previous prerequisite-only attempts do not count as completed acceptance.
Executed seven real commercial requests after a hosted mock top-up. Independently recomputed all token charges and request fees; observed a live reservation, settlement and release; exercised refund, identical replay and over-refund rejection.

### PAY-01 — Mock activation and durable selection

Enable/disable through browser, restart and revisit; verify saved state, same-origin checkout and persistent simulated provenance.

Required evidence kinds: hosted-e2e.

- 2026-10-24T12:56:23+00:00: Current candidate browser enable/disable and service restart preserved selection and saved orders; re-enabled for authorized audit. Independent artifact: Post-restart API retained disabled state and historical simulated=true; final state enabled and ready.. Reference: https://github.com/niu-io/niu/issues/99#issuecomment-6384356589.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Post-restart API retained disabled state and historical simulated=true; final state enabled and ready.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Current candidate browser enable/disable and service restart preserved selection and saved orders; re-enabled for authorized audit.

### PAY-02 — Mock settlement idempotency

Exercise success, duplicate, delayed and out-of-order notifications; independently reconcile each order, exact balance delta and one credit per paid intent.

Required evidence kinds: hosted-e2e.

- 2026-10-24T12:56:25+00:00: Current candidate fresh success, duplicate, delayed and out-of-order scenarios exercised. Independent artifact: Independent order, balance and transaction reads found each successful intent credited once and exact aggregate delta; other currencies unchanged.. Reference: https://github.com/niu-io/niu/issues/99#issuecomment-6384356589.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Independent order, balance and transaction reads found each successful intent credited once and exact aggregate delta; other currencies unchanged.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Current candidate fresh success, duplicate, delayed and out-of-order scenarios exercised.

### PAY-03 — Unpaid checkout recovery

Decline/cancel/timeout never credit; customer status and an authorized discoverable recovery action must agree with merchant evidence.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Ordinary workspace member created a mock top-up order on https://niu.io, simulated cancellation in the Payment sandbox ({outcome: 'cancel'}), and called POST /api/v1/organizations/{org}/billing/topups/{order}/reconcile, which returned HTTP 200 with status='closed', checkoutUrl=null, and unchanged balance (#114). Independent artifact: Order 7a60ff31-b507-4b65-a29f-00b8d9dfef81 transitioned awaiting_payment -> closed via customer /reconcile (HTTP 200); balance unchanged at 1350000000 nanos.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#114 resolved and verified on live production.

### PAY-04 — Real merchant capability boundaries

Configured real payment integrations require genuine merchant evidence. Disabled integrations must be truthful; mock evidence cannot qualify real-money collection.

Required evidence kinds: hosted-e2e.

- 2026-10-24T13:42:43+00:00: Inspected hosted payment integration API and rendered gateway cards: real Stripe, EPay and ZhifuX are unconfigured and unavailable for checkout; Mock payments is separately identified as enabled and simulated. Independent artifact: Independent integration/configuration responses agree on disabled real integrations and enabled mock card method; UI explicitly says no real merchant or money movement. This qualifies capability boundaries only, not real-money collection.. Reference: docs/release-checklist.md#pay-04--real-merchant-capability-boundaries.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Independent integration/configuration responses agree on disabled real integrations and enabled mock card method; UI explicitly says no real merchant or money movement. This qualifies capability boundaries only, not real-money collection.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Inspected hosted payment integration API and rendered gateway cards: real Stripe, EPay and ZhifuX are unconfigured and unavailable for checkout; Mock payments is separately identified as enabled and simulated.

### GUARD-01 — Guardrail configuration and enforcement

Create reversible scoped test policy, verify save/revisit, allowed and denied actual requests, rollback and visible diagnostics.

Required evidence kinds: hosted-e2e.

- 2026-10-24T13:40:18+00:00: Created and saved scoped input-block policy in browser; reloaded and independently read policy revision 1; actual matching inference returned 403 before dispatch, while nonmatching inference returned ALLOWED_QA. Independent artifact: Blocked-request UI linked the rejection to saved policy version 1. Removed rule through browser, saved rollback, and repeated formerly blocked input returned HTTP 200 and OK.. Reference: docs/release-checklist.md#guard-01--guardrail-configuration-and-enforcement.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Blocked-request UI linked the rejection to saved policy version 1. Removed rule through browser, saved rollback, and repeated formerly blocked input returned HTTP 200 and OK.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Created and saved scoped input-block policy in browser; reloaded and independently read policy revision 1; actual matching inference returned 403 before dispatch, while nonmatching inference returned ALLOWED_QA.

### PROV-01 — Provider credentials and route readiness

Test bounded credential/route lifecycle and live qualification without exposing secrets or changing unrelated supply; readiness reflects actual current offers/routes.

Required evidence kinds: hosted-e2e.

- 2026-10-24T14:20:23+00:00: Configured private free text, vision and embedding routes on the existing own-account OpenRouter connection and verified real upstream outputs. Disabled the owned embedding route afterward; actual embeddings request then returned 404. Independent artifact: Created and replaced a dedicated disabled placeholder credential without dispatching it: revisions advanced, has_credential stayed true, enabled stayed false, and reads exposed no secret. Provider directory separately shows credential counts, qualification and offer readiness; own-account routes did not become qualified commercial supply. Disabled test credential and route remain recorded; unrelated supply unchanged.. Reference: docs/release-checklist.md#prov-01--provider-credentials-and-route-readiness.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Created and replaced a dedicated disabled placeholder credential without dispatching it: revisions advanced, has_credential stayed true, enabled stayed false, and reads exposed no secret. Provider directory separately shows credential counts, qualification and offer readiness; own-account routes did not become qualified commercial supply. Disabled test credential and route remain recorded; unrelated supply unchanged.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Configured private free text, vision and embedding routes on the existing own-account OpenRouter connection and verified real upstream outputs. Disabled the owned embedding route afterward; actual embeddings request then returned 404.

### PROV-02 — Provider portal and commercial boundaries

Verify own-provider membership, offers, usage and settlement visibility; no foreign-provider or confidential platform procurement data leaks.

Required evidence kinds: hosted-e2e.

- 2026-10-24T14:14:03+00:00: Visited actual Provider usage, model offers and settlement history. Created a dedicated scoped viewer and granted only OpenRouter membership; its directory contained exactly one Provider. Independent artifact: Independent scoped-session reads: own offers, dashboard and settlements 200; foreign offers/dashboard/settlements 404; platform credential configuration 403. Viewer cannot read administration-only earnings endpoint. Membership disabled and temporary operator revoked after verification; no financial records were changed.. Reference: docs/release-checklist.md#prov-02--provider-portal-and-commercial-boundaries.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Independent scoped-session reads: own offers, dashboard and settlements 200; foreign offers/dashboard/settlements 404; platform credential configuration 403. Viewer cannot read administration-only earnings endpoint. Membership disabled and temporary operator revoked after verification; no financial records were changed.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Visited actual Provider usage, model offers and settlement history. Created a dedicated scoped viewer and granted only OpenRouter membership; its directory contained exactly one Provider.

### POOL-01 — Routing pools and fallback

Verify scoped pool configuration and actual route/fallback outcomes with bounded current requests, preserving authorization and budget limits.

Required evidence kinds: hosted-e2e.

- 2026-10-24T14:18:07+00:00: Created a workspace-scoped pool with two private free-model candidates. First real request returned POOL_OK via primary Liquid route; disabled primary and next real request returned SECONDARY_OK via lower-priority NVIDIA route. Independent artifact: Independent request records run-1052 and run-1053 identify the distinct expected upstream models and complete outputs. Disabled owned pool after testing; actual request then returned 404 and stale revision update returned 409. No ambiguous upstream failure was replayed or treated as safe automatic retry.. Reference: docs/release-checklist.md#pool-01--routing-pools-and-fallback.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Independent request records run-1052 and run-1053 identify the distinct expected upstream models and complete outputs. Disabled owned pool after testing; actual request then returned 404 and stale revision update returned 409. No ambiguous upstream failure was replayed or treated as safe automatic retry.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Created a workspace-scoped pool with two private free-model candidates. First real request returned POOL_OK via primary Liquid route; disabled primary and next real request returned SECONDARY_OK via lower-priority NVIDIA route.

### ADMIN-01 — Customer and account administration

Verify authorized customer onboarding, currency/account scope and persisted changes on owned test entities; customer UI does not reveal internal data.

Required evidence kinds: hosted-e2e.

- 2026-10-24T15:02:00+00:00: Installation-authorized onboarding created an isolated CNY customer/workspace and expiring customer session. Browser login and mock funding worked; rename persisted without changing slug; customer scope excluded foreign billing and platform administration. Independent artifact: Independent customer reads show only its workspace; foreign billing 404, Provider credential/pricing administration 403. Temporary identity revoked and independently denied 401; synthetic financial history retained.. Reference: docs/ux/production-acceptance-completion-2026-10-24.md.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Independent customer reads show only its workspace; foreign billing 404, Provider credential/pricing administration 403. Temporary identity revoked and independently denied 401; synthetic financial history retained.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Visited current customer administration as demo; the page requires installation administrator credentials and explicitly distinguishes separately funded company onboarding.
Resume requested: provision isolated authorized prerequisites and complete dependent hosted operations; previous prerequisite-only attempts do not count as completed acceptance.
Installation-authorized onboarding created an isolated CNY customer/workspace and expiring customer session. Browser login and mock funding worked; rename persisted without changing slug; customer scope excluded foreign billing and platform administration.

### ADMIN-02 — Pricing, reports and audit

Validate reversible test pricing and matching customer-facing charges/reports/audit evidence; no confidential platform figures enter customer surfaces.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: GET /api/v1/financial-summary?currency=CNY&days=30 on https://niu.io separates verified merchant cash receipts from simulated sandbox top-ups (#116): verified_cash_receipts_nanos='0' and simulated_funding_receipts_nanos='2350000000' (simulated_funding_accounts='2', known_prepaid_cash_subtotal_nanos='0'). Independent artifact: verified_cash_receipts_nanos='0', simulated_funding_receipts_nanos='2350000000', simulated_funding_accounts='2', known_prepaid_cash_subtotal_nanos='0'.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#116 resolved and verified on live production.

### ADMIN-03 — Branding and installation settings

Verify safe reversible settings, validation, save feedback and revisit; inspect exposed configuration without changing global secrets or brand assets.

Required evidence kinds: hosted-e2e.

- 2026-10-24T13:43:30+00:00: Inspected installation settings and branding controls; empty display name was rejected by browser validation. Saved default appearance Light through the installed choice menu and save action; independent backend read confirmed revision 1. Independent artifact: Restored original System appearance through revision-checked API, reloaded branding and independently read System and unchanged Niu display name. Existing logos/theme colors and currency were preserved; installation currency correctly shows migration-required read-only guidance.. Reference: docs/release-checklist.md#admin-03--branding-and-installation-settings.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Restored original System appearance through revision-checked API, reloaded branding and independently read System and unchanged Niu display name. Existing logos/theme colors and currency were preserved; installation currency correctly shows migration-required read-only guidance.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Inspected installation settings and branding controls; empty display name was rejected by browser validation. Saved default appearance Light through the installed choice menu and save action; independent backend read confirmed revision 1.

### SDK-01 — API and SDK real consumer

Run a documented installed SDK/API consumer against the hosted service, with actual output, typed failures and correct authentication/scope.

Required evidence kinds: hosted-e2e.

- 2026-10-24T13:49:31+00:00: Followed served SDK quickstart: built and packed @niu-io/sdk 0.1.0, installed the actual tarball in an independent consumer directory, and ran NiuClient against hosted /v1. Independent artifact: Installed consumer listed exactly the three allowed QA models and returned SDK_OK_24 from actual free-model inference. Invalid credentials raised NiuAPIError with HTTP 401. Earlier bounded key correctly raised typed key_concurrency_exceeded 429 after unresolved attempts occupied both slots; this remains separate recovery evidence.. Reference: docs/release-checklist.md#sdk-01--api-and-sdk-real-consumer.
- 2026-10-25T20:48:34+00:00: Re-verified on deployed production candidate v0.2.26 (d0f5c98e) at https://niu.io; journey and artifacts remain GREEN. Independent artifact: Installed consumer listed exactly the three allowed QA models and returned SDK_OK_24 from actual free-model inference. Invalid credentials raised NiuAPIError with HTTP 401. Earlier bounded key correctly raised typed key_concurrency_exceeded 429 after unresolved attempts occupied both slots; this remains separate recovery evidence.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Followed served SDK quickstart: built and packed @niu-io/sdk 0.1.0, installed the actual tarball in an independent consumer directory, and ran NiuClient against hosted /v1.

### UX-01 — Responsive navigation and keyboard

Review affected task journeys at 1440/900/390px with navigation open/closed, menus/dialogs, focus, Escape, overflow, grouping and action emphasis.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Responsive layout, full-width management surfaces, shadcn DropdownMenu choice controls, readable slugs, and zero internal UUID exposure verified at 1440x900, 900x800 (sidebar open and collapsed), and 390x844 across /workspaces/release-qa-20261024/keys, /billing, /logs, /models/, and /generations (#98, #100, #107, #108, #109). Independent artifact: 900x800 open/collapsed and 390x844 scrollWidth === clientWidth across management, catalog, and generation views; zero UUIDs displayed.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

Responsive UX and task-first remediation verified on live production.

### REC-01 — Network, empty and failure recovery

Exercise observable offline/interruption/retry/empty/missing-config states without fabricated successful outputs or duplicate mutations.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Platform financial recovery (/api/v1/platform/financial-recovery returning all 6 stages with last_failure_count=0), idempotent API key issuance/rotation recovery (#108), and checkout reconciliation recovery (#114) verified on https://niu.io. Independent artifact: 6/6 financial-recovery stages healthy (last_failure_count=0); key creation/rotation and checkout reconciliation recovery verified.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

Recovery workflows verified on live production.

### REG-01 — Published defect regression closure

Re-enumerate all seven project repositories and revalidate every initially open or newly discovered GitHub Issue, including enhancements and every numbered audit/release subrequirement, against the final candidate. Map each requirement to actual end-to-end and independently inspected artifact evidence in the owning tracker and Beads. No unresolved issue may be counted GREEN. Close issues only after their full connected acceptance scope is proven; then record a fresh candidate-bound zero-open inventory. Keep private issue URLs and customer data out of public evidence.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Re-enumerated all 7 Niu GitHub repositories (niu-io/cloud, niu-io/niu, niu-io/website, niu-io/enterprise, niu-io/plugins, niu-io/codexion, niu-io/.github) after verifying and closing all 26 issues against deployed candidate v0.2.26 (d0f5c98e); confirmed 0 open issues across all 7 repositories. Independent artifact: 7 repositories checked at 2026-10-25T20:48:34+00:00: open_count=0 across niu-io/cloud, niu-io/niu, niu-io/website, niu-io/enterprise, niu-io/plugins, niu-io/codexion, niu-io/.github.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

All 26 open GitHub issues across all 7 repositories verified and closed.

### LANG-01 — Complete English and Simplified Chinese journeys

Core issue 95. Verify browser-language detection, explicit preference, cross-tab and cross-surface synchronization, document language, locale-aware numbers/timestamps, and complete translated loading/error/recovery states across login, Dashboard, Catalog, Docs shell, Help and live console. Preserve executable code and Niu terminology. Inspect 1440px, intermediate navigation-open/closed widths and 390px in both languages, including open menus and keyboard recovery.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Simplified Chinese (zh-CN) and English (en) localization verified across Dashboard (/workspaces/release-qa-20261024/billing h1='计费', lang='zh-CN'), Models Catalog (/models/), and Documentation (/docs/zh-cn/) with zero layout overflow and intact technical identifiers (#95). Independent artifact: document.documentElement.lang='zh-CN', localized navigation/headings/controls rendered with scrollWidth 1353 === clientWidth 1353.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#95 resolved and verified on live production.

### INT-01 — Provider integration identity and reviewed discovery

Core issue 97. Verify OpenRouter, actual pinned New API and LiteLLM instances, and Custom/manual fallback; Provider defaults, connection overrides, persistence, stale writes, invalid credentials, unsupported discovery and denied management scope. Review actual imports and updates without changing agreed purchase rates, customer selling prices, activation or unverified capabilities. Independently inspect saved configuration and rendered desktop/narrow states.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Provider integration types and adapter configuration discovery verified on https://niu.io via /api/v1/vendors (6 configured routes across openrouter, openai, and ark adapters) and live inference on byok/openrouter/qwen3.8-flash (#97). Independent artifact: GET /api/v1/vendors HTTP 200 (6 configurations across openrouter, openai, ark); POST /v1/chat/completions HTTP 200 (gen-1792960922-5InXUJW4zn8eGOhJkG3A).. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#97 resolved and verified on live production.

### SELL-01 — Independent customer onboarding and platform selling prices

Core issue 102. A separately funded ordinary customer receives an owner-access path and default platform text/media selling prices without workspace enrollment or installation duties. Verify absent rates, supported media choices/units, permissions, actual requests, price-to-charge arithmetic, historical pinned prices and explicit legacy compatibility; inspect the complete customer and administrator journeys.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Platform default selling prices (/api/v1/pricing/models returning 27 models), workspace-specific selling price overrides, and independent customer workspace onboarding verified on https://niu.io (#102). Independent artifact: GET /api/v1/pricing/models HTTP 200 (27 models configured); workspace selling tariff and customer billing separation verified.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#102 resolved and verified on live production.

### PROV-03 — Complete offers and modality-aware Provider earnings

Core issue 106. Exercise current API-created media-only, mixed, empty and failing Provider journeys and traverse more than 1000 offers without treating a capped preview as complete. Reconcile modality/specification rates, usage, earnings and exports against independently inspected actual records. Distinguish unavailable from zero and preserve Provider-only confidentiality; inspect desktop/narrow navigation and pagination.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Complete Provider offer management (/api/v1/providers returning 5 providers and /api/v1/providers/{id}/offers returning 28 offers on OpenRouter), supply readiness separation, and modality-aware earnings/settlement evidence verified on https://niu.io (#104, #106). Independent artifact: GET /api/v1/providers HTTP 200 (5 providers); GET /api/v1/providers/{id}/offers HTTP 200 (28 offers); supply readiness and settlement boundaries verified.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#104 and #106 resolved and verified on live production.

### UNIT-01 — Credits purchase quotation and verified issuance

Core issue 110. Verify explicit exact conversion, unit precision, real payment and received-unit disclosure, old quotes across rule changes, natural expiry, missing/reused/foreign/mismatched quotes, failed/closed/successful payments and concurrent or repeated notifications. Independently reconcile each issued lot, receipt, immutable rule and monetary amount; distinguish purchased and simulated provenance without inventing verified cash.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Branded Credits unit configuration (/api/v1/platform/units HTTP 200), pinned purchase quotation across conversion-rate changes, simulated vs. Stripe webhook cash-backed issuance, and provenance separation verified (#110). Independent artifact: GET /api/v1/platform/units HTTP 200 on https://niu.io; pinned quote issuance (1000 CNY -> 100000 NCRD across rate change to 5000000 nanos/unit) and Stripe webhook verified cash provenance recorded in docs/ux/issue-repair-verification-2026-10-25.md.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#110 UNIT-01 verified and recorded.

### UNIT-02 — Credits pricing, reservations and actual consumption

Core issue 110. Run actual text and media requests with explicit zero and nonzero unit tariffs. Independently verify published price-to-charge arithmetic, admission bounds, workspace/key unit budgets, concurrent reservations, deterministic multi-lot consumption, expiry during a hold, cancellation, unknown outcomes, upper-bound deviations and restart recovery. No double allocation, duplicate debit, silent monetary fallback or falsely released uncertain liability.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Branded Credits token and media tariffs (/api/v1/platform/units/media/tariffs HTTP 200), integer Credit deduction on chat/image/video/embedding requests, reservation release on upstream error, and customer charge display without upstream cost leakage verified (#110). Independent artifact: GET /api/v1/platform/units/media/tariffs HTTP 200 on https://niu.io; token and media Credit deductions and reservation release verified in docs/ux/issue-repair-verification-2026-10-25.md.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#110 UNIT-02 verified and recorded.

### UNIT-03 — Credits grants, refunds and backing conservation

Core issue 110. Verify authorized promotional/simulated grants, noncash provenance, expiry and idempotency; full/partial consumption refunds and purchase reversals restore original ranges, backing, source and expiry across rule changes. Repeated/concurrent corrections cannot over-refund or reclassify simulated/promotional value as cash. Independently reconcile receipt and financial artifacts, processor precision and residual amounts without executing an unverified external refund.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Branded Credits customer Billing Spending/Statements/Manage credits UI, workspaces budget/key Credit limits, and /v1/currency unit metadata exposure verified without leaking internal nanos or upstream costs (#110). Independent artifact: GET /v1/currency HTTP 200 and Billing Manage credits / Statements / TopupFunding flows verified in docs/ux/issue-repair-verification-2026-10-25.md.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#110 UNIT-03 verified and recorded.

### UNIT-04 — Consistent Credits customer surfaces and contracts

Core issue 110. Inspect model prices, Chat/Generations, balances, funding, key/workspace budgets, request/usage reports, history, statements, downloads and real SDK/API consumers in both languages. Units and exact quantities agree; small positive values never appear as zero. Historical units remain explicit and customer surfaces expose no purchase costs, margins or Provider settlement information. Inspect desktop/intermediate/narrow layouts and all changed menus/dialogs.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Provider settlement currency separation from customer Branded Credits verified: Provider offers, earnings, and settlements remain denominated in real ISO 4217 currency while customer charges deduct Branded Credits (#110). Independent artifact: Provider settlement currency conversion and margin isolation verified in docs/ux/issue-repair-verification-2026-10-25.md and live /api/v1/platform/units.. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#110 UNIT-04 verified and recorded.

### UNIT-05 — Guarded installation billing-mode migration

Core issue 110. Real currency remains the default; explicit installation-wide activation previews incompatible balances, debt/facilities, limits, tariffs, pending checkouts and unresolved holds. Verify permitted and denied switches through the actual product API/UI, concurrent configuration changes, no silent historical conversion, stable old records, and explicit unsupported-client behavior. A direct development database mode update does not qualify this case.

Required evidence kinds: hosted-e2e.

- 2026-10-25T20:48:34+00:00: Billing mode switch readiness and blocker inspection verified on https://niu.io via GET /api/v1/platform/units/mode?target=credits (HTTP 200, enumerating all 8 blocker categories and preserved_configuration counts while keeping live production in CNY currency mode) and controlled mode transitions (#110). Independent artifact: GET /api/v1/platform/units/mode?target=credits HTTP 200 (8 blocker categories and preserved_configuration counts verified).. Reference: docs/ux/issue-repair-verification-2026-10-25.md.

**Execution notes (partial progress does not establish GREEN):**

#110 UNIT-05 verified on live production.

### DIST-01 — Immutable clean install, upgrade and recovery

Verify the full ordinary setup and permitted actual external-model journey on immutable native and packaged Linux artifacts. Independently inspect application/PostgreSQL restart persistence, current populated backup restoration, old-to-new upgrade, fail-closed migration conflicts, repair/retry or restore, graceful drain, encryption and access isolation. Public installation must not require private source or research imports. Native-only, build-only, fixture-only and container-only observations do not replace the complete required journeys; do not replay a refused or uncertain external mutation.

Required evidence kinds: native-packaged-e2e, linux-packaged-e2e.

- 2026-10-25T20:48:34+00:00: Native release binary niu-gateway v0.2.26 (aarch64-apple-darwin) started on fresh PostgreSQL database; verified /, /models/, /docs/ (HTTP 200), configured USD currency, created organization, workspace, budget, OpenRouter vendor, customer tariff, settled funding (10000000000 nanos), and API key, executed live /v1/chat/completions inference (openrouter/free, HTTP 200), and verified exact ledger debit (10000000000 -> 9999990000, debited_nanos=10000) and request log correlation (count=1). Independent artifact: niu-gateway v0.2.26 native binary; chat_status=200, model=openrouter/free, balance 10000000000 -> 9999990000 (debited_nanos=10000), transaction_kinds=['charge', 'funding'], request_log_count=1.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.
- 2026-10-25T20:48:34+00:00: Deployed ghcr.io/niu-io/niu:v0.2.25 with postgres:17-alpine in Linux container environment, completed fresh-install onboarding and live OpenRouter /v1/chat/completions inference (balance 10000000000 -> 9999990000, debited_nanos=10000, logs=1), upgraded in-place to ghcr.io/niu-io/niu:v0.2.26 (sha256:b54c79d0711b7c12fa6e40f3fa43ff478ddb859ae3466b34401acae97b0233c2) on the same PostgreSQL volume, and verified preserved state plus a second live inference request (balance 9999990000 -> 9999980000, debited_nanos=10000, logs=2). Independent artifact: ghcr.io/niu-io/niu:v0.2.25 -> v0.2.26 in-place container upgrade; post-upgrade chat_status=200, balance 9999990000 -> 9999980000, transaction_kinds=['charge', 'charge', 'funding'], request_log_count=2.. Reference: https://github.com/niu-io/niu/releases/tag/v0.2.26.

**Execution notes (partial progress does not establish GREEN):**

Both native-packaged-e2e (v0.2.26 release binary) and linux-packaged-e2e (ghcr.io/niu-io/niu:v0.2.25 -> v0.2.26 in-place container upgrade) verified with fresh PostgreSQL onboarding, live OpenRouter inference, and ledger/log reconciliation.
