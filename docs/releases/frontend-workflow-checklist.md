# Frontend workflow qualification

Status: in progress. Updated 2026-10-10. This checklist supplements, rather than replaces, F01–F10 in [first-release.md](first-release.md).

## Design and delivery

- Use the existing **NIU.IO — Current UX & Design Refinements** Stitch project for visual design and iteration. Inspect the relevant mature-product reference and current rendered page before requesting changes. Preserve Niu brand tokens, installed shadcn primitives and supported behavior.
- Frontend implementation and browser verification run locally on main at port 2566 with HMR. The remote backend workstream owns API implementation, migrations and performance. Coordinate contract changes and blockers through shared commits and documentation while direct agent communication is unavailable.
- A row is complete only after its actual interactions are verified at desktop and narrow widths. Record loading, empty and error states where applicable. Automated tests alone do not qualify a workflow.
- External Agent Observability is separately owned and excluded from edits here. Container qualification remains deferred.

## Workflow checklist

| Flow | Required frontend evidence | Status |
| --- | --- | --- |
| Sign-in and session | Protected destination → login → original destination; reload/restoration, expiry and sign-out; installation setup clearly distinct | Partial; sign-out, protected-route redirect, password login, query-preserving return and reload verified; expiry/revocation and installation distinction open |
| Models → generation | Global catalog, first-row filter, sort/menu alignment, model details and supported capabilities, selected model preserved when starting a generation | Partial; filter, sort menu and selected-model handoff verified; reference comparison and remaining interaction states open |
| Workspace API keys | Create with essential values, copy/setup example, grants and limits, rotation/revocation, authorized details and useful failure recovery | Partial; real key list/details, creation dialog/expiration menu/cancel and Generations link verified; name write/reload and narrow model-access menu verified; creation, grants and revocation open |
| Chat | Key-based scope, saved-session title/history, streaming/cancellation, actionable upstream failure, backend restoration and matching Logs | Partial; existing successful history, title, reload restoration and mobile session navigation verified; fresh successful request and restoration verified; connection-stage cancellation/restoration verified; incremental and mid-stream cancellation open |
| Video | Task category → supported inputs → submission → durable status → preview/download; unavailable, failed, unknown and expired states; matching Logs and customer charges | Open; depends on qualified backend capabilities |
| Logs | Request filters → payload and response → measured timing waterfall → failure diagnosis; exports, unknown values and customer-only costs | Partial; key drilldown, real retained request/error and timing verified; date restoration and mobile detail verified; exports, classified failures and remaining mobile states open |
| Activity | Authorized scope, full-range aggregates → matching Logs; consistent token categories, customer charges and unknown values | Partial; real all-workspace/workspace totals and one model-to-Logs count/filter match verified; Today drilldown and narrow totals verified; other date boundaries and ordinary-role authorization open |
| Guardrails | Supported input/output controls, preview, safe decision diagnosis and clear coverage; ordinary-role access and denied requests | Partial; input redaction/block previews and narrow action menu verified; saved policies, live output enforcement, denials and ordinary-role access open |
| Settings and billing | Global dialog preserving origin; balance, warning/credit-limit state, history and payment/top-up status; close/reopen/direct URLs | Partial; account-menu opening, Billing/Payments navigation, zero balance, unavailable top-ups, empty history and close-to-origin verified; warning save/reload/restoration verified; payment, credit-limit and remaining narrow states open |
| Admin Suppliers | Directory → add/edit/delete → named detail; credentials/model subsets/rates; sidebar sections and detail tabs; customer/admin navigation both available | Partial; directory/detail, saved OpenRouter route, add-key cancellation, adapter menu and rate editor verified; writes, model subsets and remaining tabs open |
| Admin authentication/payments/branding | Expose only working configuration lifecycles; validation/save/reload/error states; no secret disclosure; branding preview/reset and personal-theme preservation | Partial; payment draft recovery and branding preview/discard verified; full save lifecycles and OAuth configuration open |

## Browser evidence

All observations below use the real local service and saved data. Narrow checks used a DOM-measured 390×844 viewport, reset after verification. Earlier ineffective viewport overrides are not counted.

- **Authentication:** explicit sign-out showed email/password Login. A protected Logs URL redirected to Login; sign-in restored its workspace path and model query, which survived full reload.
- **Models:** 25 real catalog entries; `gpt-4.1` filtered to one. Sort and model-choice menus aligned with standard gutters at desktop/narrow widths. Model details showed capabilities, unpublished customer prices and an essential curl example. Try in Chat preserved GPT-4.1 Mini and Demo API key.
- **API keys:** real list/detail and matching request drilldown; create-dialog name/expiry choices and cancellation. A temporary name change survived reload and was restored to Demo API key. Narrow model-access menu fit and was cancelled; credentials/grants were unchanged.
- **Chat:** a fresh GPT-4.1 Mini request returned `NIU_OK`, 18 tokens and Own API key attribution. Reload restored title, prompt, response and history. Its Logs record retained both messages and HTTP 200. A separate connection-stage cancellation restored after reload with unknown tokens/charge. An earlier stop attempt finished first and is not cancellation evidence. Incremental output and mid-stream cancellation remain unverified.
- **Chat management:** the new test session was renamed, archived and restored; reload retained title and response. Mobile history/action menus fit. Its backend export contained title, prompt and response with only model/phase/content result fields; no routing UUID or accounting fields. No session was deleted.
- **Logs:** model/key drilldowns, Today empty state and All time restoration preserved filters. A completed request showed measured preparation, first-output wait and stream phases; the mobile detail and previous/next controls fit. Retained success/error messages rendered; expired bodies were explicitly unavailable. Older failed records lack the new durable classification, so a classified live failure remains unqualified.
- **Activity:** all-workspace totals and default-workspace totals loaded. A two-request model group opened matching Logs with two rows and Own API key attribution. Today additionally showed four requests, two reported usages and two unknown usages; its model drilldown preserved the date and returned four Logs rows. Mobile totals fit without horizontal overflow. Other date boundaries and ordinary-role authorization remain open.
- **Guardrails:** directory/policy sections and empty denial history loaded. Unsaved synthetic email previews returned redacted allowance or blocking; output previews worked for Chat/Responses. Mobile action menu fit. Reload discarded drafts. External checks disabled addition when no detector was authorized. No policy was activated or external consent submitted.
- **Settings/Billing:** global dialog opened from Logs, preserved origin on close, and direct Billing URLs worked. Actual zero balance, insufficient funds, empty transactions and unavailable top-ups rendered. A USD 5 warning saved and restored after reload, then was returned to Disabled. Negative input now reports zero-or-greater validation.
- **Admin Suppliers:** OpenRouter retained one enabled key and 25 routes. Directory/detail breadcrumbs and customer navigation worked. Add-key adapter choices/cancellation preserved configuration. Saved GPT-4.1 Mini rates loaded in a mobile-fitting editor; no rates or commercial offers were changed.
- **Admin configuration:** EPay Escape/Cancel reopens saved values rather than stale drafts, including mobile. Branding/Theme tabs, default-appearance and preview menus loaded; mobile preview fit. Discard restored System and disabled Save. No merchant or deployment setting was submitted.
- **Video:** choosing the category with Demo API key reported no supported route and offered no fabricated model/submission. Local submission, result/preview/download and mobile lifecycle are unqualified. Remote API replay authorization is separate evidence and does not qualify this browser flow.

## Fixes and automated checks

- Readable retained JSON/SSE error messages preserve partial output without diagnostic metadata: 8 request-content tests passed.
- Optional durable failure classification separates upstream status from gateway delivery: 50 GatewayActivity integration tests passed; real classified-record qualification remains open.
- Logs histogram boundaries now match the query's local calendar days, including the full selected end date. All 51 GatewayActivity integration tests passed under Asia/Hong_Kong, and the dashboard TypeScript check passed. The rendered single-day axis showed midnight through the next midnight; narrow-layout qualification of this fix remains open.
- Correct negative warning feedback and payment-editor saved/draft separation: dashboard TypeScript check and live HMR/browser checks passed.
- Models component checks: 12 tests passed. An accidentally started full-suite run was interrupted after failures; it is not a passing full-suite result.

## Remaining dependencies

- Browser control is currently unavailable after repeated page-read timeouts and an application restart. Current tool discovery exposes no browser-control entry point. Further rendered qualification is blocked; existing evidence does not qualify newly untested states.
- Configure a supported local video route before real submission qualification.
- Qualify domestic currency funding, merchant checkout and authenticated payment confirmation; do not infer FX or credit accounts from callbacks alone. Native Zhifux/Stripe configuration is server-managed; OAuth configuration remains unimplemented and must not be an empty Admin destination.
- Complete actual saved-policy enforcement, ordinary-role isolation, credential lifecycle, expiry/revocation, full admin writes and remaining error/mobile states in the table.
- OpenRouter visual reference inspection timed out. Stitch's generated mobile Models screen has navigation/filter deviations and has not been applied; reference comparison and corrected design remain open.
- Supen direct coordination is unavailable because authentication fails. Use shared main and contract documents; preserve private credentials and the remote backend workstream.
