# Catalog scope and retained loading shell — 2026-11-14

Findings: `niu-mm90.27` and `niu-mm90.36`. Current-input browser verification used hosted core `41074c0713290c25d1a43138026afd9917c454d5`. No product changes were needed for these observations.

## Model catalog scope

The old finding described an anonymous empty catalog contradicting a populated signed-in catalog. The published [route ownership contract](../architecture/repository-ownership.md) now explicitly retires separate public browsing: `/models/` redirects into the active workspace catalog and anonymous visitors must sign in. This is an existing product decision, not a new access restriction introduced by this review.

Used the actual UI to sign out, then entered `/models/`. The settled page explained that availability and pricing depend on the workspace and directed the visitor to sign in. It did not report zero published models or offer an inferred-developer filter. At 390 × 844 the notice, sign-in fields and next action fit the 390 px document width. After actual password sign-in the entry resolved to `/workspaces/default/models`, displaying current catalog results. Initial workspace bootstrapping briefly displayed a pending shell before canonical routing; that transitional frame is not a settled catalog acceptance screenshot. No anonymous catalog publication is claimed.

Disposition: the old public-empty-page requirement is superseded by the explicit workspace-scoped contract. The misleading zero-count state and clipped public filter are no longer present on this route.

## Actual delayed route loading

Added 4000 ms browser network latency, then navigated to Logs. The observed pending state retained the primary sidebar, Logs title and request controls while the content area said Loading requests and contained zero real request rows. The final actual request read completed HTTP 200 after 4015 ms with nonzero transferred bytes, then the real request rows appeared. An earlier request entry existed in this browser, so this is not a claim that every cache was empty: acceptance rests on the captured current query's genuine pending state and independently observed delayed network completion. It differs from the earlier inconclusive observation that already displayed cached rows.

With the same network delay, opening account Settings retained the Logs background and navigation while the dialog named Settings/Account and showed Opening settings. Three current API reads completed HTTP 200 at approximately 4007–4016 ms. The opening screenshot is explicitly a transition frame, not a settled visual-quality pass. Appearance then rendered within the same dialog over the retained task; its settled screenshot was separately inspected. Escape returned to Logs, preserving the same real row DOM node and returning focus to Account menu. Network latency was restored to zero in a finally block.

These observations satisfy the scoped retained-shell requirement for the reported Logs and Settings journeys. They do not establish every route, network-failure mode or first-install bootstrap behavior. The criteria come from the UX review skill's Operate spatial-stability and feedback guidance, NN/g consistency/system-status heuristics, and the WAI-ARIA modal focus pattern. No fixture outcome supplies acceptance evidence, and no profile, appearance, credential or generation setting was changed.
