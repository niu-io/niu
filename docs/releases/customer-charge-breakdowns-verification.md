# Customer charge breakdown contract

## Mobile model drilldown follow-up — 2026-10-03

At a 390-by-844 viewport, the real Usage model-charge link for Gemini was brought into view and clicked. The browser reached Logs with the model query filter retained, showing 27 matching requests and the three-column mobile request table. The rendered filter chip, customer charges and unknown/unresolved states were inspected. This qualifies this model-charge mobile drilldown; API-key mobile drilldown remains unqualified. Returning to Usage subsequently encountered a browser navigation timeout, so no additional interaction pass is inferred from that attempt.

## Mobile API-key drilldown follow-up — 2026-10-03

A fresh mobile Usage view restored `chargeBy=key`. Its leading named key showed four charged requests totaling USD 0.0000957. Clicking that actual charge-row link reached Logs with the correct key query and a readable key-name filter chip. The four displayed charges were USD 0.0000151, 0.0000215, 0.0000151 and 0.000044, exactly reconciling to the Usage total. The rendered three-column table fit at 390-by-844 without clipped amounts or identifiers in labels. This supersedes the missing API-key mobile drilldown evidence above; both tested model/key drilldowns now have desktop and mobile evidence.

Opening an individual request from that mobile result hit browser command-dispatch timeouts, including after refreshing the visible target state. Request-detail mobile diagnosis therefore remains unqualified; successful list navigation does not close the complete investigation workflow or F06. The temporary viewport override was reset.

Development checkpoint, 2026-10-03. Dashboard presentation is implemented; final live navigation qualification remains open. F05 and F06 remain incomplete.

The scoped request summary now includes `charges_by_model` and `charges_by_key`. Each groups the full matching range by model or API key and customer-charge currency within the existing consistent summary snapshot. Amounts use exact decimal strings in nanos. Currency groups remain separate; rows without a settled charge have null amount and currency. Charged, unresolved, unpriced and not-charged counts partition each row's requests.

The queries read customer tariffs and customer charges only. They do not read Supplier expenses or platform margins. API key identifiers remain scoped API references, with names available for eventual dashboard labels.

Verified:

- The scoped PostgreSQL export fixture reconciles an amount above JavaScript's safe integer range by model and key, checks full-range counts beyond pagination, preserves absent amounts and excludes another workspace's model.
- A separate PostgreSQL fixture passes with USD and EUR charges under the same model and key, a tariff-bound unresolved request and an unpriced dispatched request. It checks exact amounts and separate coverage counts without currency conversion.
- Read-only checks against the running service reconcile both breakdowns to all saved customer-charge totals and matching request counts with a one-row page. No inference or data mutation was performed for these checks.
- SDK typechecking, all 66 SDK tests, the documentation build, OpenAPI parsing, gateway Clippy, public-boundary scans and changed-file whitespace checks passed.

The SDK exports the new summary type and both arrays; public API documentation defines their amount, scope and coverage semantics.

## Usage dashboard checkpoint

OpenRouter's actual Activity Explore view and its Model/API Key grouping interaction were inspected before implementation. Niu presents one compact Customer charge breakdown table in Usage, with a direct shadcn DropdownMenu for Model or API key grouping. Each identity combines its coverage rows while preserving separate exact currency amounts. A single-currency range ranks settled amounts descending, with missing amounts last; multiple currencies use name order rather than inventing an exchange rate or comparing unlike amounts. Named links retain date, model, key, execution and HTTP filters as applicable. Missing key names never fall back to identifiers; unattributed keys have no misleading scoped-key link. Group choice is URL view state, not saved account settings.

All 28 Logs/content dashboard tests and the dashboard build passed. The new fixture covers full-range grouping, amounts above JavaScript's safe integer range, separate currencies, unresolved coverage, identifier-free labels, group choice and filtered drilldown URLs. Desktop and 390px Model/API key tables and the open grouping menu were inspected against the reference and existing Niu table shell; wrapping keeps names, charges and coverage visible.

The resumed desktop API-key drilldown opened the four matching charged requests. Their customer charges sum to the displayed key total; the named filter and request count match the Usage group. Reload restored API-key grouping from the URL. Mobile grouping and the model table rendered correctly, but further mobile link actions encountered browser-control timeouts before dispatch. Mobile navigation remains unqualified. Remaining work includes that navigation check, broader accounting/restart qualification and complete consumption investigation. No complete release gate is claimed.

## End-to-end retained request diagnosis — 2026-10-04

The running Usage → named API-key charge row → filtered Logs → Request details workflow was exercised at 390px. The four historical tool-roundtrip requests sum to the displayed USD 0.0000957. Next request changes its charge, token counts and timing; closing the sheet retains the named key filter. Their expired content is explicitly unavailable rather than fabricated. This supersedes the earlier unqualified mobile individual-request navigation checkpoint; it does not establish every diagnosis path.

A single new nonstreaming Chat request through the saved OpenRouter demo Supplier used a temporary model-scoped key, a 16-token output bound and explicit payload consent. Its six input tokens and one output token reconcile to 4,300 USD nanounits (USD 0.0000043) using the saved customer tariff. The request API, key charge summary and Logs show the same charge. Retained input and response match the actual upstream result; capture is complete and untruncated, with a 24-hour expiry. Durable finish metadata is stop; Logs labels it Stopped. Timing is complete with HTTP 200. No invoice or Supplier configuration was changed; the temporary key was revoked.

The new named Usage charge row was followed to its one matching Logs request. At 390px, the sheet's charge, token categories, measured waterfall, Overview, parsed messages and secondary raw-data tab were inspected. The same saved request was reviewed at confirmed 1280px desktop width. The prompt is a synthetic request for OK, with no customer content. OpenRouter's actual Logs and loaded Generation details were inspected as the reference.

Empty Guardrails sections are now omitted when no decision or no policy/inspection is recorded. Recorded policy and inspection results remain visible, with no empty Key policy or missing-inspection rows. A policy history link appears only when a saved revision exists; withheld-output charge explanations and read-error retry controls remain intact. This absence does not assert protection. All seven decision tests and 31 Logs interaction tests passed, together with dashboard typechecking and changed-file whitespace checks. UI review verified this absent-decision state; recorded-policy cases are covered by fixtures and the prior live review, not a new live policy acceptance pass.

Broader protocol/model coverage, ordinary-user roles, cross-restart diagnosis, full billing reconciliation and complete F05/F06 acceptance remain open.
