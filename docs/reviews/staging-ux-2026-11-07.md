# Staging whole-product UX review (2026-11-07)

Review-only record for the hosted staging candidate. No product changes are
claimed by this record.

## Candidate and roles

- Hosted staging: `https://staging.niu.io`
- Core: `79eb468e` (BabelArk video/embedding support)
- Cloud: `067a9a3`
- Roles inspected: demo customer and platform administrator in administrator
  mode.
- Viewports inspected: 1353 px desktop and a real 390×844 headless Chrome
  viewport (CDP emulation, not a cropped desktop screenshot).

## Journeys inspected

- Public landing, model catalog, documentation home, sign-in.
- Workspace overview, API keys, logs, assets, routing, evaluations, guardrails,
  workspace settings, Credits.
- Admin providers, routing, customers, financial reports, pricing, payment
  gateways, branding, audit logs, incidents, settings.
- Provider connection success, wrong-key failure, retry without re-entering the
  key, keyboard focus order, and the 390 px connect dialog.
- Real BabelArk video and embedding requests through the platform; Qiniu
  key-only model discovery and a text request.

## Direct observations

1. The platform-admin provider page distinguishes configured providers from the
   available directory. Qiniu shows `Ready to supply` and its offer count;
   BabelArk shows a disabled commercial connection even while a separate active
   personal BabelArk video/embedding connection exists. The duplicate display
   name makes “which connection is supplying this model?” ambiguous.
2. The 390 px Qiniu connect dialog fits without clipping. It shows only
   Provider API key, keeps the base URL under `Connection settings`, and exposes
   `Connect and import models`, `Cancel`, and `Close`. Keyboard focus reached
   Provider website, Connection settings, Cancel, Close, then the API-key field.
3. A wrong BabelArk key produces a specific credential message and
   `Retry model import`; the retry does not require re-entering the key. The
   test connection was retired after the check.
4. Workspace Overview displays its summary skeleton immediately but fills the
   request, token, latency and cost cards after the upstream requests complete.
   On a cold hosted request this took several seconds.
5. Credits initially rendered an empty content area in a cold demo session;
   the balance and activity appeared after several seconds. Workspace
   evaluations similarly showed “Checking model incidents…” and
   “Retrieving workspace evidence…” before the empty-state prompt.
6. Public landing, model catalog and docs home had no horizontal overflow at
   desktop width. The model catalog exposes filters and developer labels.
7. The payment-gateway banner correctly distinguishes simulated payments from
   real provider inference cost and warns against sharing credentials.
8. Admin financial reports, audit logs and incident pages expose loading and
   empty/error states; no fixture data was used to claim a populated report.

## Design judgments

- The provider connection dialog is appropriately scoped: identity, API key,
  advanced connection settings, and the import consequence are separated.
  The 390 px composition preserves that hierarchy.
- The disabled/active duplicate Provider names are a high-impact comprehension
  problem, not merely cosmetic: administrators can read the wrong connection as
  the current supply path.
- Cold-start blank content on Credits and evaluations weakens first-use
  confidence. A persistent skeleton or explicit “loading balance/evidence”
  label would make the state self-explanatory while preserving the eventual
  data.
- Repeated mock-payment warning banners are justified in staging, but their
  density competes with the primary page title on narrow screens; the 390 px
  dialog still remained usable.

## Unverified branches

- Real merchant checkout, refund and settlement journeys were not exercised;
  mock payments are enabled and real payment credentials were not configured.
- Workspace pages at 390 px were not exhaustively inspected; the provider
  dialog and public surfaces were the covered narrow surfaces.
- Multi-user membership, invitation acceptance and cross-workspace switching
  were not independently exercised in this pass.
- Admin report pages were inspected for loading and empty/error states, not for
  populated accounting reconciliation; no financial reconciliation is claimed.
- No external competitor benchmark is part of this review; that belongs to the
  separate product-direction audit.

## Coverage limits

This record distinguishes direct observations from design judgments and does
not claim fixture, unit or production evidence. The hosted daemon briefly
returned 502 from the mock-payment plugin during the pass; after the plugin
recovered, the observed pages loaded normally. No product data was fabricated.
