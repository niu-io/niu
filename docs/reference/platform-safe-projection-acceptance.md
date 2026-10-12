# Platform configuration safe-projection acceptance

S10-3 verifies the fixed backend criterion: coordinate configuration changes, enforce current permissions, expose only supported public-safe projections, and reject arbitrary executable branding/configuration input. It does not qualify rendered settings screens, HTTPS browser transport, merchant activation or all encrypted-content domains.

## Runtime and evidence

The actual run uses Gateway `186662c5346ec911e2bc19e59bb6b8a51c32500c` and native PostgreSQL schema 283 in an isolated stopped-database copy. Two Gateway processes share that copied database for the concurrent-save cases. Original database, configuration and encryption identity remain unchanged; no upstream model or merchant request is made.

Branding, payment configuration, authorization, member persistence and their storage behavior match the integration source after excluding Rust handler documentation comments. Existing six-role platform-authority and member-persistence evidence from the associated configuration acceptance is reused; password login and expiry are not repeatedly exercised for this criterion.

The new run records 29 actual HTTP responses and four concurrent-save responses. Independent verification reopens both source and final native databases and checks saved raw-response digests, accepted snapshots, audit records, revocation and financial fingerprints.

## Finite input and authorization matrix

| Input or operation | Actual result | Preserved state / verified boundary |
| --- | --- | --- |
| Extra arbitrary CSS field in branding settings | 422 | Existing branding remains unchanged; this existing Axum body-shape rejection is a plaintext response, not a JSON application error |
| SVG logo, external logo URL or GIF favicon | 400 | Raster-only supported asset contract retained |
| Executable color expression, unknown palette token or unreadable foreground/background contrast | 400 | Existing palette remains unchanged |
| Blank/control-character display name | 400 | Existing name remains unchanged |
| Leading-zero, negative or overflowing branding revision | 400 | No accepted revision or audit added |
| Unsupported or duplicated EPay method | 400 | Existing saved configuration remains unchanged, including disabled drafts |
| Enabled EPay configuration with JavaScript endpoint or return URL | 400 | Refused before external execution; no merchant call |
| Ordinary member platform read, then member revocation and repeated read | 403, then 401 | Each request uses current durable authorization |

Enabled payment execution requires the supported URL contract. A disabled draft is not external execution. This matrix does not claim every string in an inactive administrative draft is an executable surface.

There is no new product defect indicated by the initial verification helper assuming every error response was JSON. The helper was corrected to preserve the existing plaintext 422 response; a fresh stopped copy then ran the matrix. The independent reader verifies the actual saved status and body rather than replacing it with a synthetic JSON error.

## Two-Gateway configuration coordination

Each Gateway simultaneously submits a distinct branding change against the same saved revision. Exactly one returns 200 and one returns 409. The accepted response's exact revision/settings snapshot matches the public branding read and the independently reopened native row.

The same two processes submit distinct supported disabled-payment method configurations against one payment revision. Exactly one returns 200 and one returns 409. The accepted snapshot retains the original `has_key` value when blank secret input is used, exposes no secret field and remains disabled. Restart reads match the accepted response.

Native audit counts advance by exactly one branding event and one payment event across the complete run. Thus refused invalid changes and the concurrent losers add no accepted revisions or audit events. Seven complete source/final financial/request table fingerprints are identical: attempts, customer charges, balance entries, funding receipts, balance reservations, cost reservations and Supplier earnings.

This qualifies two-process optimistic revision coordination for these configuration saves. It is not a whole-platform load or capacity measurement.

## Public-safe projections

`GET /v1/branding` exposes only `data.revision` and `data.settings`; settings contain display name, nullable PNG logo/favicon, default appearance and the two supported token maps. It contains no audit actor, credential or commercial configuration.

`GET /admin/v1/auth/config` exposes only `password_login`. It reports local runtime capability, not a successful sign-in or deployed HTTPS qualification.

The platform-only payment integration inventory exposes support/configuration capability fields and excludes merchant identities, endpoints, notification/return URLs and keys. EPay administrative configuration exposes `has_key` rather than a secret. The associated six-role current-input evidence verifies that company/workspace owners, administrators and viewers cannot read or change this platform configuration merely through their tenant role.

## Status

S10-3 is complete for this finite configuration-change, current-authority, public-projection and executable-input matrix. S10-2 encrypted-content domain coverage remains separately tracked and is not closed by this result. Frontend adoption and rendered settings/browser behavior remain delegated acceptance.
