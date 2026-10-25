# Production audit evidence — 2026-10-24

This dated record accompanies Beads `niu-4do`. Beads owns execution state;
this document records observations, not a second backlog. The review used the
actual hosted website and an authorized test account. No fixture-test outcome
was used as evidence. No product source, merchant configuration, financial
balance, password, or platform permission was changed.

The dashboard About screen displayed **0.2.24**, dated **2026-10-24**. This is
displayed metadata, not independent identification of the deployed immutable
source or of the separately composed website and documentation artifacts.

## Observed defects

| Observation | Public report | Evidence boundary |
| --- | --- | --- |
| Dashboard Help embeds documentation that responds with `X-Frame-Options: DENY`; the browser displays “refused to connect.” | [niu#113](https://github.com/niu-io/niu/issues/113) | Actual desktop/narrow rendering, reload and independent live header inspection. The CSP is report-only; the enforced framing header blocks the iframe. |
| Scoped Models loses mobile product/account recovery navigation when service readiness is false; the filter toggle opens no panel. | [niu#112](https://github.com/niu-io/niu/issues/112) | Actual 390px rendered state and toggle interaction. The workspace sidebar does open, so this is not a claim that every mobile sidebar fails. |
| Chinese quickstart introduction links to a missing `installation-setup-zh` anchor. | [niu#111](https://github.com/niu-io/niu/issues/111) | Clicking changes the fragment without scrolling; independent DOM inspection finds no target. |
| Homepage Extensibility FAQ links to a missing architecture guide. | [website#5](https://github.com/niu-io/website/issues/5) | Browser click reaches the documentation 404 page; independent GET returns 404. |
| Catalog Text output selects generic `text` and marks both input and output chips selected. | [niu#98 A07 revalidation](https://github.com/niu-io/niu/issues/98#issuecomment-6380039829) | Actual click, filter value and `aria-pressed` inspection. Current data does not establish every possible result-set mismatch. |
| Chinese SDK constructor headings display the native Object function string. | [niu#95](https://github.com/niu-io/niu/issues/95) | NiuClient and NiuAdminClient rendered headings are corrupted, while independent live HTML contains the correct `constructor` heading. |

Hosted readiness and account-isolation findings were reported through the
existing private operational channels. Their URLs, account records, identifiers
and financial details are intentionally excluded from this public document.
Related public-safe Beads records are `niu-idq` and `niu-4ir`.

## Actual journey coverage

| Journey | Observation and limits |
| --- | --- |
| Password sign-in and session restoration | Fresh sign-in succeeded. Account identity remained available after document reload. |
| Profile save and persistence | A uniquely named temporary display-name change returned save feedback, was independently read from the authenticated session API and appeared after re-entry. The original name was restored and verified from the server and a refreshed form. |
| Logout and protected deep link | Logout caused the session API to return 401. Opening a workspace key deep link redirected to login; signing in returned to that same key route. |
| Appearance and locale | English/Chinese selection updated the UI and another open public documentation tab. Dark mode and its narrow open choice menu were visually inspected. The original system theme and Chinese locale were restored. |
| Public catalog | Loaded 26 current entries. A nonmatching query produced an empty state; Clear restored results. A `google` query survived Refresh. Copying a model ID and pasting it into the filter reproduced the exact ID. This establishes no inference capability. |
| Standalone documentation | Search opened from the public header, returned results for `API key`, and dismissed with Escape. Chinese quickstart and the open narrow documentation navigation were inspected. The documentation-home links returned successful HTTP responses, which alone do not establish article correctness. |
| Marketing | Homepage, blog index and article rendered. Homepage-to-documentation link checks found the confirmed FAQ 404. Desktop and 390px homepage layouts were inspected. Marketing benchmark figures were not used as acceptance evidence. |
| Customer feature entry points | Overview, keys, Library, Guardrails, usage, billing, members, workspace settings, Generations, global Activity and scoped Models displayed the service-setup gate. Logs also entered the readiness gate. Recheck did not resolve the observed configuration block. |
| Dashboard Help | Failed independently of service readiness; see the framing defect above. |
| API and SDK reference follow-up | REST index, model-discovery reference, SDK index and client references rendered. The downloadable OpenAPI JSON returned 200 and parsed as OpenAPI 3.1.0 with 321 paths. These checks establish document delivery only, not endpoint conformance. Narrow NiuClient document width matched the 390px viewport; constructor localization failed as recorded above. |

## Review basis

Niu's explicit rules require missing-configuration recovery, usable navigation
at narrow widths, direct inspection of open menus, and actual browser checks.
The gated Models shell fails the navigation/recovery requirement. The
documented `/help/` ownership contract requires same-origin documentation
embedding, which the deployed response policy prevents.

The actual [OpenRouter Models page](https://openrouter.ai/models) was inspected
at 390px and exposes a separate top-level navigation trigger. Niu's working
workspace sidebar is the closer existing internal reference. These observations
support retaining a reachable navigation path; they do not prescribe unrelated
layout changes or establish formal accessibility conformance.

## Unverified behavior and next verification

The hosted configuration block prevents full current-input verification of
model selection, key creation/rotation/revocation, Chat and video execution,
attachments, cancellation, durable generated results, matching Logs/usage,
customer charges, payment settlement, exports and recovery. Provider setup,
commercial qualification and administrator mutations were not qualified.
No claim of complete functionality or release readiness is justified.

First restore an authorized, bounded and legitimate customer test path and
resolve account isolation. Then run each real model task through independently
inspected final output, persisted history and matching customer accounting.
Retest the published UI/documentation defects against the actual composed
deployment. Do not substitute fixture results or successful page loads for
these missing business artifacts.
